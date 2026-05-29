'use strict';

/**
 * aioson feature:close — close a feature after QA sign-off.
 *
 * Updates spec-{slug}.md (adds QA sign-off block), features.md (sets status to done),
 * and project-pulse.md (removes from active work).
 *
 * Usage:
 *   aioson feature:close . --feature=checkout --verdict=PASS
 *   aioson feature:close . --feature=checkout --verdict=PASS --residual="Email delivery not tested E2E"
 *   aioson feature:close . --feature=checkout --verdict=FAIL --notes="Auth edge case missing"
 */

const fs = require('node:fs/promises');
const path = require('node:path');
const { contextDir, readFileSafe, parseFrontmatter } = require('../preflight-engine');
const { runFeatureArchive } = require('./feature-archive');
const dossierBootstrap = require('../dossier/dossier-bootstrap');
const dossierStore = require('../dossier/store');
const { emitDossierEvent } = require('../lib/dossier-telemetry');
const { appendScoutToFeatureDossier } = require('../dossier/scout-section');
const { emitSubTaskEvent } = require('../sub-task-telemetry');
const { loadConfig } = require('../sub-task-engine');
const { runDistillation, readFeatureClassification } = require('../learning-loop-engine');
const { openRuntimeDb } = require('../runtime-store');
const { runNotify } = require('./notify');
const { splitCurrentState, buildArchiveContent, parseActiveSlugs } = require('../current-state-trim');

// P0 agent-loading-contract: a feature closing is the natural cadence to roll
// aged-out current-state.md entries into the cold archive. Conservative window
// (gentle, automatic) — manual `memory:trim --keep=<N>` can trim harder.
const AUTO_CLOSE_KEEP = 25;

function nowDate() {
  return new Date().toISOString().slice(0, 10);
}

function nowTimestamp() {
  return new Date().toISOString();
}

function quoteYaml(value) {
  return `"${String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

function extractRecentActivities(content) {
  if (!content) return [];
  const activityMatch = content.match(/## Recent Activity\n([\s\S]*?)(?=\n##|\s*$)/);
  if (!activityMatch) return [];
  return activityMatch[1]
    .split('\n')
    .filter((line) => line.trim().startsWith('-'))
    .slice(-2);
}

async function updateProjectPulseFile(pulsePath, slug, verdict, summary, date) {
  const existing = await readFileSafe(pulsePath);
  if (!existing) return false;

  const fm = parseFrontmatter(existing);
  const gate = `Gate D: ${verdict === 'PASS' ? 'approved' : 'rejected'}`;
  const recentActivities = extractRecentActivities(existing);
  let activityLine = `- ${date} @qa → ${slug} (${gate}) VERDICT: ${verdict}`;
  if (summary) activityLine += `: ${summary}`;
  const stripDate = (line) => line.replace(/^-\s+\d{4}-\d{2}-\d{2}\s+/, '');
  const activitySignature = stripDate(activityLine);
  const dedupedActivities = recentActivities.filter((line) => stripDate(line) !== activitySignature);

  const activeFeature = verdict === 'PASS' ? '(none)' : slug;
  const activeWork = verdict === 'PASS' ? '' : `${slug} → @qa → qa_failed`;
  const blockers = verdict === 'PASS'
    ? 'none'
    : (summary || fm.blockers || 'QA blockers pending');
  const nextRecommendation = verdict === 'PASS'
    ? '@product start the next feature'
    : '@dev fix QA blockers and return to @qa';

  const lines = [
    '---',
    `last_updated: ${nowTimestamp()}`,
    'last_agent: qa',
    `last_gate: ${gate}`,
    `active_feature: ${activeFeature}`,
    `active_work: ${quoteYaml(activeWork)}`,
    `blockers: ${quoteYaml(blockers)}`,
    `next_recommendation: ${quoteYaml(nextRecommendation)}`,
    '---',
    '',
    '# Project Pulse',
    '',
    '## Status',
    '',
    '- **Last agent:** @qa',
    `- **Last gate:** ${gate}`,
    `- **Active feature:** ${activeFeature}`,
    `- **Active work:** ${activeWork || 'none'}`,
    `- **Blockers:** ${blockers}`,
    `- **Next:** ${nextRecommendation}`,
    '',
    '## Recent Activity',
    '',
    ...dedupedActivities,
    activityLine,
    ''
  ];

  await fs.writeFile(pulsePath, lines.join('\n'), 'utf8');
  return true;
}

async function updateSpecFile(specPath, verdict, residual, date) {
  const content = await readFileSafe(specPath);
  if (!content) return false;

  const signOff = [
    '',
    '## QA Sign-off',
    '',
    `- **Date:** ${date}`,
    `- **Verdict:** ${verdict}`,
    residual ? `- **Residual:** ${residual}` : null,
    `- **Gate D (execution):** ${verdict === 'PASS' ? 'approved' : 'rejected'}`,
    ''
  ].filter((l) => l !== null).join('\n');

  // Update gate_execution in frontmatter first (on original content)
  const newStatus = verdict === 'PASS' ? 'approved' : 'rejected';
  const fm = parseFrontmatter(content);
  let baseContent = content;
  if (Object.keys(fm).length > 0) {
    baseContent = content.replace(
      /^---\r?\n[\s\S]*?\r?\n---/,
      (block) => {
        if (block.includes('gate_execution')) {
          return block.replace(/gate_execution:\s*.+/, `gate_execution: ${newStatus}`);
        }
        return block.replace(/^---\r?\n/, `---\ngate_execution: ${newStatus}\n`);
      }
    );
  }

  // Now apply QA sign-off on top of the frontmatter-updated content
  if (baseContent.includes('## QA Sign-off')) {
    const updated = baseContent.replace(
      /## QA Sign-off[\s\S]*?(?=\n##|\s*$)/,
      signOff.trimStart()
    );
    await fs.writeFile(specPath, updated, 'utf8');
  } else {
    await fs.writeFile(specPath, baseContent + signOff, 'utf8');
  }

  return true;
}

function escapeSlugForRegex(slug) {
  return slug.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function updateFeaturesFile(featuresPath, slug, verdict, date) {
  const content = await readFileSafe(featuresPath);
  if (!content) return false;

  const status = verdict === 'PASS' ? 'done' : 'qa_failed';
  const rowRe = new RegExp(
    `^(\\|\\s*${escapeSlugForRegex(slug)}\\s*\\|)\\s*[^|]*\\s*\\|\\s*([^|]*)\\s*\\|\\s*([^|]*)\\s*\\|(.*)$`,
    'm'
  );

  const updated = content.replace(rowRe, (match, slugCol, startedCol, _completedCol, rest) => {
    const started = startedCol.trim() || date;
    return `${slugCol} ${status} | ${started} | ${date} |${rest}`;
  });

  if (updated !== content) {
    await fs.writeFile(featuresPath, updated, 'utf8');
    return true;
  }

  // Append if not found
  const line = `| ${slug} | ${status} | ${date} | ${date} |`;
  const needsNewline = !content.endsWith('\n');
  await fs.appendFile(featuresPath, `${needsNewline ? '\n' : ''}${line}\n`, 'utf8');
  return true;
}

async function ensureDossier({ targetDir, ctxDir, slug }) {
  const dossierPath = path.join(ctxDir, 'features', slug, 'dossier.md');
  try {
    await fs.access(dossierPath);
    return { mode: 'present' };
  } catch {
    // proceed to create
  }

  try {
    await dossierBootstrap.initFromExisting({
      slug,
      contextDir: ctxDir,
      targetDir
    });
    return { mode: 'from-existing' };
  } catch (err) {
    if (err && err.code === 'EBOOTSTRAPEMPTY') {
      await dossierStore.init({
        slug,
        contextDir: ctxDir,
        whyText: '(no source artifacts found at close time)',
        whatText: '(no source artifacts found at close time)'
      });
      return { mode: 'minimal-fallback' };
    }
    if (err && err.code === 'EDOSSIEREXISTS') {
      return { mode: 'present' };
    }
    return { mode: 'failed', error: err && err.message ? err.message : String(err) };
  }
}

// archiveScoutsForFeature — copy `.aioson/runtime/scouts/{id}.json` files
// whose `feature_slug` matches `slug` into `.aioson/context/features/{slug}/scouts/`,
// auto-append a bullet to the feature dossier per archived scout, and emit
// telemetry. Idempotent: re-archival overwrites file, dossier append is no-op.
// Returns { archived: [{id, archive_rel}], skipped: [{id, reason}] }.
async function archiveScoutsForFeature(targetDir, slug) {
  const result = { archived: [], skipped: [] };
  let config;
  try { config = loadConfig(targetDir); }
  catch { config = { scout_dir: '.aioson/runtime/scouts', archive_root: '.aioson/context/features' }; }

  const sourceDir = path.join(targetDir, config.scout_dir);
  let entries;
  try { entries = await fs.readdir(sourceDir, { withFileTypes: true }); }
  catch (err) {
    if (err.code === 'ENOENT') return result;
    throw err;
  }

  const archiveDir = path.join(targetDir, config.archive_root, slug, 'scouts');
  let archiveDirEnsured = false;

  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.json') || entry.name.startsWith('.')) continue;
    const sourcePath = path.join(sourceDir, entry.name);
    let scout;
    try {
      scout = JSON.parse(await fs.readFile(sourcePath, 'utf8'));
    } catch {
      result.skipped.push({ id: entry.name, reason: 'parse_error' });
      continue;
    }
    if (!scout || scout.feature_slug !== slug) continue;
    if (!scout.id) {
      result.skipped.push({ id: entry.name, reason: 'missing_id' });
      continue;
    }

    if (!archiveDirEnsured) {
      await fs.mkdir(archiveDir, { recursive: true });
      archiveDirEnsured = true;
    }
    const targetPath = path.join(archiveDir, `${scout.id}.json`);
    await fs.copyFile(sourcePath, targetPath);

    // Dossier auto-append (idempotent).
    try {
      appendScoutToFeatureDossier({ rootPath: targetDir, feature_slug: slug, scout });
    } catch {
      // dossier write failed; archival itself succeeded — non-fatal
    }

    result.archived.push({
      id: scout.id,
      archive_rel: path.relative(targetDir, targetPath).replace(/\\/g, '/')
    });
  }

  if (result.archived.length > 0) {
    // M-01 fix: feature-close fires exactly one sub_task event per invocation,
    // so logAgentEvent would land it as event_type='start' (lifecycle artifact
    // for the agent's first event in a new session) with payload_json=null,
    // making it invisible to collectScoutSummary's WHERE event_type='sub_task'
    // query. emitSubTaskEvent writes directly to agent_events with the correct
    // event_type and structured payload.
    await emitSubTaskEvent(targetDir, {
      message: 'scouts archived on feature:close',
      parent_session_id: `feature-close-${slug}`,
      payload: {
        action: 'archived_on_close',
        slug,
        count: result.archived.length,
        ids: result.archived.map((a) => a.id)
      }
    });
  }

  return result;
}

async function runFeatureClose({ args, options = {}, logger }) {
  const targetDir = path.resolve(process.cwd(), args[0] || '.');
  const slug = options.feature ? String(options.feature) : null;
  const verdict = options.verdict ? String(options.verdict).toUpperCase() : null;
  const residual = options.residual ? String(options.residual) : null;
  const notes = options.notes ? String(options.notes) : null;

  if (!slug) {
    if (options.json) return { ok: false, reason: 'missing_feature' };
    logger.log('--feature=<slug> is required.');
    return { ok: false };
  }

  if (!verdict || !['PASS', 'FAIL'].includes(verdict)) {
    if (options.json) return { ok: false, reason: 'invalid_verdict' };
    logger.log('--verdict=PASS or --verdict=FAIL is required.');
    return { ok: false };
  }

  const today = nowDate();
  const dir = contextDir(targetDir);
  const updates = [];

  // 0a. Harness Done Gate (AC-HD-11 refined)
  // Only enforced on PASS — FAIL means QA already rejected and we want the
  // closure to record that. Without `harness-contract.json` for the feature,
  // behavior is unchanged (zero impact on MICRO/SMALL or any feature that
  // never opted into the harness).
  if (verdict === 'PASS') {
    const planDir = path.join(targetDir, '.aioson', 'plans', slug);
    const contractPath = path.join(planDir, 'harness-contract.json');
    const progressPath = path.join(planDir, 'progress.json');
    const contractContent = await readFileSafe(contractPath);
    const progressContent = await readFileSafe(progressPath);

    if (contractContent && progressContent) {
      const force = options.force === true;
      let progress = null;
      try {
        progress = JSON.parse(progressContent);
      } catch (err) {
        // Corrupted progress.json: fail-safe — record warning, do NOT block.
        // A broken progress file should not lock the feature forever; the user
        // can re-run harness:validate to regenerate it. This mirrors the
        // behaviour in workflow-next.js's existing harness-block path.
        updates.push(`harness done gate: progress.json parse error (${err.message}) — proceeding without check`);
      }

      if (progress && progress.ready_for_done_gate !== true) {
        if (!force) {
          const pendingHint = progress.last_error
            ? ` Pending: ${progress.last_error}.`
            : '';
          const errMsg = `[Harness Done Gate BLOCKED] Feature "${slug}" did not pass the binary contract (ready_for_done_gate=false).${pendingHint} Run 'aioson harness:validate' and 'aioson harness:apply-validation' until overall_score=1, or pass --force for an emergency override.`;
          if (options.json) {
            return {
              ok: false,
              reason: 'harness_done_gate_blocked',
              feature: slug,
              error: errMsg,
              last_error: progress.last_error || null,
              ready_for_done_gate: false
            };
          }
          logger.log(errMsg);
          return { ok: false, reason: 'harness_done_gate_blocked' };
        }
        updates.push(`harness done gate: BYPASSED via --force (ready_for_done_gate=false at close time; last_error=${progress.last_error || 'none'})`);
      } else if (progress && progress.ready_for_done_gate === true) {
        updates.push('harness done gate: PASSED (ready_for_done_gate=true)');
      }
    }
  }

  // 0. Dossier guarantee — verdict-agnostic; ensures every closed feature has a dossier
  // for archive + audit trail. Telemetry is silent on failure.
  const dossierResult = await ensureDossier({ targetDir, ctxDir: dir, slug });
  if (dossierResult.mode === 'from-existing' || dossierResult.mode === 'minimal-fallback') {
    updates.push(`dossier: ${dossierResult.mode === 'from-existing' ? 'synthesized from existing artifacts' : 'minimal fallback (no artifacts found)'}`);
    await emitDossierEvent(targetDir, {
      agent: 'feature-close',
      type: 'feature_close_dossier_synthesized',
      summary: `${slug} ${dossierResult.mode}`,
      meta: { feature_slug: slug, mode: dossierResult.mode }
    });
  } else if (dossierResult.mode === 'failed') {
    updates.push(`dossier: guarantee failed (${dossierResult.error})`);
  }

  // 1. Update spec file
  const specPath = path.join(dir, `spec-${slug}.md`);
  const specUpdated = await updateSpecFile(specPath, verdict, residual || notes, today);
  if (specUpdated) {
    updates.push(`spec-${slug}.md: added QA sign-off (${today}, ${verdict})`);
  } else {
    updates.push(`spec-${slug}.md: not found (skipped)`);
  }

  // 2. Update features.md
  const featuresPath = path.join(dir, 'features.md');
  const featuresContent = await readFileSafe(featuresPath);
  if (featuresContent) {
    await updateFeaturesFile(featuresPath, slug, verdict, today);
    updates.push(`features.md: ${slug} → ${verdict === 'PASS' ? 'done' : 'qa_failed'} (${today})`);
  } else {
    updates.push('features.md: not found (skipped)');
  }

  // 3. Update project-pulse.md
  const pulsePath = path.join(dir, 'project-pulse.md');
  const pulseUpdated = await updateProjectPulseFile(
    pulsePath,
    slug,
    verdict,
    residual || notes || null,
    today
  );
  if (pulseUpdated) {
    updates.push('project-pulse.md: updated active work');
  } else {
    updates.push('project-pulse.md: not found (skipped)');
  }

  // Capture feature classification BEFORE archive moves prd-{slug}.md to
  // .aioson/context/done/{slug}/. The Phase 5 distillation hook below needs
  // this value to enforce the MICRO opt-out (BR-ALL-11).
  const preArchiveClassification = verdict === 'PASS'
    ? await readFeatureClassification(targetDir, slug)
    : null;

  // 3.5. Archive scouts attached to this feature (deyvin-subtask-scout).
  // Copies `.aioson/runtime/scouts/{id}.json` matching feature_slug to
  // `.aioson/context/features/{slug}/scouts/{id}.json`, auto-appends to
  // dossier, emits telemetry. Idempotent on re-close.
  let scoutArchive = null;
  try {
    scoutArchive = await archiveScoutsForFeature(targetDir, slug);
    if (scoutArchive.archived.length > 0) {
      updates.push(`scouts: archived ${scoutArchive.archived.length} to .aioson/context/features/${slug}/scouts/`);
    }
  } catch (err) {
    updates.push(`scouts: archival failed (${err.message || err})`);
  }

  // 4. Auto-archive on PASS (default-on — user never has to remember).
  // Disable explicitly with --no-archive when needed (e.g. re-running feature:close idempotently).
  let archive = null;
  const skipArchive = options['no-archive'] === true || options.archive === false;
  if (verdict === 'PASS' && !skipArchive) {
    try {
      archive = await runFeatureArchive({
        args: [targetDir],
        options: { feature: slug, json: true },
        logger: null
      });
      if (archive && archive.ok && archive.moved && archive.moved.length > 0) {
        updates.push(`archive: moved ${archive.moved.length} file(s) to ${archive.archiveDir}/`);
        updates.push(`archive: manifest updated at .aioson/context/done/MANIFEST.md`);
      } else if (archive && archive.ok && archive.noop) {
        updates.push('archive: nothing to move (already clean)');
      } else if (archive && !archive.ok) {
        updates.push(`archive: skipped (${archive.reason || 'unknown'})`);
      }
    } catch (err) {
      updates.push(`archive: failed (${err.message || err})`);
    }
  }

  // ── Active Learning Loop distillation hook (Phase 5) ──────────────────────
  // Best-effort (BR-ALL-05): runs after archive, never blocks feature:close,
  // single tier-2 notify with summary. Disabled when:
  //   - verdict !== 'PASS' (FAIL means QA rejected; no learning to consolidate)
  //   - feature classification is MICRO (PMD-5 / BR-ALL-11)
  //   - `--no-distill` flag explicitly set
  //   - `learning-loop.json#enabled=false` (per-project opt-out, optional)
  // The hook never throws — every failure mode is captured in evolution_log
  // and surfaced through the `distill` line of the closure summary.
  //
  // NOTE: classification was captured BEFORE the archive step above, because
  // `runFeatureArchive` moves prd-{slug}.md into .aioson/context/done/{slug}/.
  // Reading after archive would return null and bypass MICRO opt-out.
  let distillation = null;
  const skipDistill = options['no-distill'] === true || options.distill === false;
  if (verdict === 'PASS' && !skipDistill) {
    const featureClassification = preArchiveClassification;
    if (featureClassification === 'MICRO') {
      updates.push('distill: skipped (feature classification MICRO)');
    } else {
      let dbHandle = null;
      try {
        dbHandle = await openRuntimeDb(targetDir);
        distillation = await runDistillation({
          targetDir,
          slug,
          classification: featureClassification,
          db: dbHandle.db
        });
        if (distillation && distillation.ok) {
          updates.push(
            `distill: ${distillation.promoted_count} promoted, ${distillation.review_count} for review, ${distillation.merge_candidate_count} merge candidates (${distillation.duration_ms}ms)`
          );
          // AC-ALL-502: exactly 1 tier-2 notify per closure on success.
          try {
            await runNotify({
              args: [targetDir],
              options: {
                level: 'info',
                topic: 'learning-loop',
                message: `distillation: ${distillation.promoted_count} promoted, ${distillation.review_count} for review, ${distillation.merge_candidate_count} merge candidates`,
                agent: 'feature-close',
                json: options.json ? true : undefined
              },
              logger: logger || { log: () => {} }
            });
          } catch (notifyErr) {
            updates.push(`distill: notify failed (${notifyErr && notifyErr.message || notifyErr})`);
          }
        } else if (distillation && distillation.reason === 'lock_held') {
          updates.push(`distill: skipped (already in progress for "${slug}")`);
        } else if (distillation && distillation.reason === 'skipped_micro') {
          // Defensive: feature classification flipped between read and run.
          updates.push('distill: skipped (feature classification MICRO)');
        } else if (distillation && !distillation.ok) {
          updates.push(`distill: failed silently (${distillation.reason}${distillation.error_phase ? `:${distillation.error_phase}` : ''})`);
        }
      } catch (err) {
        // Defensive — engine is best-effort but any unexpected throw still
        // must not break feature:close.
        updates.push(`distill: hook error (${err && err.message || err})`);
      } finally {
        if (dbHandle && dbHandle.db) {
          try { dbHandle.db.close(); } catch { /* swallow */ }
        }
      }
    }
  } else if (verdict === 'PASS' && skipDistill) {
    updates.push('distill: skipped (--no-distill flag)');
  }

  // Auto-rollup bootstrap/current-state.md (P0 agent-loading-contract). The
  // just-closed slug is already `done` in features.md, so it no longer counts as
  // an active-slug exemption — its aged entries become eligible. Best-effort and
  // non-blocking: a failure here must never break the closure. Opt out: --no-trim.
  const skipTrim = options['no-trim'] === true || options.trim === false;
  if (verdict === 'PASS' && !skipTrim) {
    try {
      const csPath = path.join(targetDir, '.aioson/context/bootstrap/current-state.md');
      const csContent = await readFileSafe(csPath);
      if (csContent) {
        const activeSlugs = parseActiveSlugs((await readFileSafe(path.join(targetDir, '.aioson/context/features.md'))) || '');
        const split = splitCurrentState(csContent, { keep: AUTO_CLOSE_KEEP, activeSlugs });
        if (split.ok && split.archivedEntries.length > 0) {
          const archPath = path.join(targetDir, '.aioson/context/bootstrap/current-state-archive.md');
          const eol = /\r\n/.test(csContent) ? '\r\n' : '\n';
          const existingArchive = (await readFileSafe(archPath)) || '';
          await fs.writeFile(archPath, buildArchiveContent(existingArchive, split.archivedEntries, nowDate(), eol), 'utf8');
          await fs.writeFile(csPath, split.hotContent, 'utf8');
          updates.push(`trim: archived ${split.archivedEntries.length} aged current-state entries (kept ${split.stats.kept})`);
        }
      }
    } catch (err) {
      updates.push(`trim: hook error (${(err && err.message) || err})`);
    }
  }

  const result = {
    ok: true,
    feature: slug,
    verdict,
    date: today,
    residual: residual || notes || null,
    updates,
    archive,
    scoutArchive,
    distillation
  };

  if (options.json) return result;

  logger.log(`Feature closure — ${slug}:`);
  for (const u of updates) logger.log(`  ${u}`);

  return result;
}

module.exports = { runFeatureClose };
