'use strict';

// Sub-Task Scout — dossier auto-append helper
//
// On `feature:close`, every archived scout (matching feature_slug) appends a
// one-line bullet to `.aioson/context/features/{slug}/dossier.md` under
// `## Sub-task scouts`. Idempotent: if the line containing `{scout.id}` is
// already present, skip.
//
// Format: `- {id}: {question} → {recommendation_first_line} (confidence: {confidence}, {N} findings)`

const fs = require('node:fs');
const path = require('node:path');

const SECTION_HEADING = '## Sub-task scouts';
const MAX_RECOMMENDATION_PREVIEW = 200;

function dossierPath(rootPath, featureSlug) {
  return path.join(rootPath, '.aioson', 'context', 'features', featureSlug, 'dossier.md');
}

function firstSentence(text, maxLen) {
  const trimmed = String(text || '').trim();
  if (!trimmed) return '';
  // Sentence boundary = period followed by whitespace OR period at EOL/EOS.
  // Filenames like "workflow-next.js" contain a period without a following
  // space, so we must NOT split there.
  const m = trimmed.match(/^([\s\S]*?\.)(?:\s|$)/);
  let preview = (m ? m[1] : trimmed).trim();
  if (preview.length > maxLen) preview = `${preview.slice(0, maxLen - 1)}…`;
  return preview;
}

function buildBullet(scout) {
  const id = String(scout.id || '');
  const question = String(scout.question || '').trim();
  const recPreview = firstSentence(scout.recommendation, MAX_RECOMMENDATION_PREVIEW);
  const confidence = String(scout.confidence || '?');
  const findings = Array.isArray(scout.findings) ? scout.findings.length : 0;
  return `- ${id}: ${question} → ${recPreview} (confidence: ${confidence}, ${findings} findings)`;
}

// appendScoutToFeatureDossier({rootPath, feature_slug, scout})
//
// - Creates dossier.md if absent (with minimal frontmatter + heading).
// - Adds `## Sub-task scouts` section if missing.
// - Appends a bullet for the scout under that section.
// - Idempotent: if a line containing `<scout.id>` already exists in the section,
//   skip (return {appended: false, reason: 'already_present'}).
//
// Returns: {appended: bool, dossier_path: string, reason?: string}
function appendScoutToFeatureDossier({ rootPath, feature_slug, scout }) {
  if (typeof rootPath !== 'string' || typeof feature_slug !== 'string' || !scout || !scout.id) {
    throw new Error('appendScoutToFeatureDossier: rootPath, feature_slug, and scout.id are required');
  }
  const dPath = dossierPath(rootPath, feature_slug);
  fs.mkdirSync(path.dirname(dPath), { recursive: true });

  let content = '';
  try { content = fs.readFileSync(dPath, 'utf8'); } catch (err) {
    if (err.code !== 'ENOENT') throw err;
    // Create minimal dossier so the section append below works on a known shape.
    content = [
      '---',
      `slug: ${feature_slug}`,
      `created_at: ${new Date().toISOString().slice(0, 10)}`,
      'created_by: scout-archival',
      '---',
      '',
      `# Dossier — ${feature_slug}`,
      ''
    ].join('\n');
  }

  const idMarker = String(scout.id);
  // Look only inside the scouts section if it exists; otherwise check the
  // whole file (handles re-archival even when section was created in a
  // previous run).
  if (content.includes(idMarker)) {
    return { appended: false, dossier_path: dPath, reason: 'already_present' };
  }

  const bullet = buildBullet(scout);
  const updated = ensureSectionAndAppend(content, SECTION_HEADING, bullet);
  fs.writeFileSync(dPath, updated, 'utf8');
  return { appended: true, dossier_path: dPath };
}

// ensureSectionAndAppend — pure string transform.
// If `## Sub-task scouts` exists, append `bullet` at the end of that section
// (just before the next `##` or EOF). Otherwise, append the section + bullet
// to the end of the document.
function ensureSectionAndAppend(content, heading, bullet) {
  const lines = content.split(/\r?\n/);
  const headingIdx = lines.findIndex((line) => line.trim() === heading);

  if (headingIdx === -1) {
    const trailing = content.endsWith('\n') ? '' : '\n';
    return `${content}${trailing}\n${heading}\n\n${bullet}\n`;
  }

  // Find next top-level heading (## ...) after headingIdx, or EOF.
  let nextHeadingIdx = lines.length;
  for (let i = headingIdx + 1; i < lines.length; i++) {
    if (/^##\s/.test(lines[i])) { nextHeadingIdx = i; break; }
  }

  // Insert bullet at the last non-blank line position within the section.
  let insertAt = nextHeadingIdx;
  while (insertAt > headingIdx + 1 && lines[insertAt - 1].trim() === '') insertAt--;

  const before = lines.slice(0, insertAt);
  const after = lines.slice(insertAt);
  const result = [...before, bullet, ...after].join('\n');
  return result.endsWith('\n') ? result : `${result}\n`;
}

module.exports = {
  appendScoutToFeatureDossier,
  buildBullet,           // exported for tests
  ensureSectionAndAppend, // exported for tests
  SECTION_HEADING
};
