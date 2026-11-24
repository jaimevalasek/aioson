'use strict';

// The workflow binding's archive. While the binding is on another feature, a
// feature's progress waits beside it — .aioson/context/features/<slug>/
// workflow.state.json — and comes back when the binding returns. Two paths
// move the binding: workflow:next when the feature registry moves
// (loadOrCreateState) and workflow:execute when --feature names another
// feature (the seed). Both archive and restore through here: the seed once
// overwrote the live state without either, and the previous feature's
// product..dev was gone the first time the registry returned to it.

const fs = require('node:fs/promises');
const path = require('node:path');
const { validateFeatureSlug, isInsideRoot, toPosixPath } = require('../verification/path-policy');

const ARCHIVE_FILE_NAME = 'workflow.state.json';

// The slug comes from features.md and the persisted state — files people and
// models edit. Joined raw, `../../../../escaped` made `workflow:status
// --repair` write the archive outside the project, and `feat:x` made every
// `workflow:next` die on mkdir (ENOENT on Windows). An archive exists only
// for a slug the canonical feature-slug rule accepts (the rule
// --expect-feature and workflow:execute --feature already enforce) at a path
// inside the project's features directory; any other slug has no archive,
// and the caller warns instead of throwing.
function resolveFeatureStateArchive(targetDir, featureSlug) {
  const slug = String(featureSlug == null ? '' : featureSlug);
  const validation = validateFeatureSlug(slug);
  if (!validation.ok || validation.feature_slug !== slug) {
    return { ok: false, reason: 'invalid_feature_slug', feature_slug: slug };
  }
  const featuresDir = path.join(targetDir, '.aioson', 'context', 'features');
  const archivePath = path.join(featuresDir, slug, ARCHIVE_FILE_NAME);
  if (!isInsideRoot(featuresDir, archivePath)) {
    return { ok: false, reason: 'archive_outside_project', feature_slug: slug };
  }
  return { ok: true, path: archivePath, relative: toPosixPath(path.relative(targetDir, archivePath)) };
}

/** Absolute archive path for a feature, or null when the slug cannot name one. */
function featureStateArchivePath(targetDir, featureSlug) {
  const archive = resolveFeatureStateArchive(targetDir, featureSlug);
  return archive.ok ? archive.path : null;
}

function hasWorkflowProgress(state) {
  if (!state || typeof state !== 'object') return false;
  return Boolean(
    (Array.isArray(state.completed) && state.completed.length > 0)
    || (Array.isArray(state.skipped) && state.skipped.length > 0)
    || state.current
    || (state.detour && state.detour.active)
  );
}

async function readArchivedFeatureState(targetDir, featureSlug) {
  if (!featureSlug) return null;
  const archivePath = featureStateArchivePath(targetDir, featureSlug);
  if (!archivePath) return null;
  let archived;
  try {
    archived = JSON.parse(await fs.readFile(archivePath, 'utf8'));
  } catch {
    return null;
  }
  if (!archived || archived.mode !== 'feature' || archived.featureSlug !== featureSlug || !Array.isArray(archived.sequence)) return null;
  const { archived_at: _archivedAt, ...state } = archived;
  return state;
}

/**
 * Archives the progress of a feature state the binding is leaving. Returns
 * what the binding records: `archived` (project-relative path) when there was
 * progress to keep, `persisted` once it is on disk, and `archive_skipped`
 * when the slug cannot name an archive — that progress is NOT kept, and the
 * caller has to say so.
 */
async function archiveFeatureState(targetDir, state, { persist = true } = {}) {
  if (!state || state.mode !== 'feature' || !state.featureSlug || !hasWorkflowProgress(state)) {
    return { archived: null, persisted: false };
  }
  const archive = resolveFeatureStateArchive(targetDir, state.featureSlug);
  if (!archive.ok) return { archived: null, persisted: false, archive_skipped: archive.reason };
  if (persist) {
    await fs.mkdir(path.dirname(archive.path), { recursive: true });
    await fs.writeFile(archive.path, `${JSON.stringify({ ...state, archived_at: new Date().toISOString() }, null, 2)}\n`, 'utf8');
  }
  return { archived: archive.relative, persisted: Boolean(persist) };
}

/** The workflow.events.jsonl record of a binding move — one shape for every path that moves it. */
function bindingMovedEvent({ from = null, to = null, mode = null, source = null, archived = null, restored = null } = {}) {
  return { at: new Date().toISOString(), event: 'binding_moved', from, to, mode, source, archived, restored };
}

// The binding is ONE per project. With two chats on one folder, a mismatch
// against the pulse is the other chat having moved it — and the error said only
// "run pulse:update to move it back", which sends the next chat's work to the
// same wall. Who last wrote the pulse, and the way out for both, belong in it.
function describePulseWriter(pulseBy) {
  if (!pulseBy) return '';
  const who = [pulseBy.last_agent ? `@${pulseBy.last_agent}` : null, pulseBy.last_updated ? `on ${pulseBy.last_updated}` : null].filter(Boolean).join(' ');
  const work = pulseBy.active_work ? ` ("${pulseBy.active_work}")` : '';
  return ` project-pulse.md was last written${who ? ` by ${who}` : ''}${work}. If another chat on this folder moved it, two features cannot both advance through workflow:next here: finish one first, or give each chat its own session (\`aioson live:start . --tool=<tool> --agent=<agent> --session=<name> --own-session --feature=<slug>\`) or its own worktree (.aioson/docs/dev/parallel-sessions.md).`;
}

// The --expect-feature mismatch named its fallback as if it were the
// registry: "Feature registry: alpha (features.md) — the workflow binding
// follows it", for a binding the pulse never named, and "Feature registry:
// beta (features.md)" for a pulse naming a paused beta the binding ignores.
// The line now says where the binding really comes from, and that the
// command moving it only binds a feature in_progress in features.md.
function describeBindingRegistry(binding, boundFeature) {
  if (!binding || (!binding.source && !binding.registry)) return null;
  const move = '`aioson pulse:update . --feature=<slug>` moves it (the feature must be in_progress in features.md), and the previous feature\'s progress is archived under .aioson/context/features/<slug>/workflow.state.json and restored on return.';
  if (binding.source === 'pulse') {
    return `Feature registry: ${binding.registry || boundFeature || '(none)'} (project-pulse.md active_feature) — the workflow binding follows it; ${move}${describePulseWriter(binding.pulse_by)}`;
  }
  // Inside a live session the registry is the session's own feature: a
  // command naming another one (`--feature=<slug>`) moves this session only.
  const sessionRegistry = binding.registry_source === 'session';
  if (binding.source === 'session') {
    return `Feature registry: ${binding.registry || boundFeature || '(none)'} (the feature of this live session) — the workflow binding follows it; a command that names another feature (\`aioson pulse:update . --feature=<slug>\`) moves this session to it (the feature must be in_progress in features.md), and the previous feature's progress is archived under .aioson/context/features/<slug>/workflow.state.json and restored on return.`;
  }
  const pulse = binding.registry
    ? `${sessionRegistry ? 'this live session is on' : 'project-pulse.md active_feature names'} ${binding.registry}, which is not in_progress in features.md, so the binding ignores it`
    : 'project-pulse.md names no active_feature';
  const fallback = binding.source === 'last-handoff'
    ? 'last-handoff.json'
    : binding.source === 'features.md' ? 'the last in_progress row of features.md' : null;
  const bound = fallback
    ? `the workflow is bound to ${boundFeature || '(project mode)'} by fallback (${fallback})`
    : 'the workflow is in project mode';
  return `Feature registry: none in effect — ${pulse}; ${bound}. ${move}`;
}

module.exports = {
  resolveFeatureStateArchive,
  featureStateArchivePath,
  hasWorkflowProgress,
  readArchivedFeatureState,
  archiveFeatureState,
  bindingMovedEvent,
  describeBindingRegistry
};
