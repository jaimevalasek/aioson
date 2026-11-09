'use strict';

/**
 * Squad gateway entries — one line per persistent squad in CLAUDE.md and
 * AGENTS.md, between `<!-- AIOSON-SQUAD:<slug>:START -->` and `...:END -->`.
 *
 * Every session re-reads both gateway files, so an entry costs its bytes on
 * every session of every agent. Hand-written entries listed each role's path
 * and a usage paragraph (0.8–1.9 KB each) although the package already lists
 * its roles in agents/agents.md. The entry is now rendered from the manifest:
 * the squad's name, its purpose (the mission's first sentence) and where the
 * package lives. `aioson update` rewrites a legacy entry the same way; prose it
 * held beyond the role list moves to the package's docs/gateway-note.md and the
 * line points there, so nothing authored is lost.
 */

const fs = require('node:fs');
const path = require('node:path');

const GATEWAY_FILES = ['CLAUDE.md', 'AGENTS.md'];
const PURPOSE_MAX = 120;
const NOTE_REL = 'docs/gateway-note.md';
const SLUG_RE = /^[a-z0-9][a-z0-9-]*$/;

function blockPattern() {
  return /<!-- AIOSON-SQUAD:([a-z0-9][a-z0-9-]*):(?:START|BEGIN) -->(?:\r?\n)?([\s\S]*?)<!-- AIOSON-SQUAD:\1:END -->/g;
}

function packageRel(slug) {
  return `.aioson/squads/${slug}/`;
}

function readManifest(projectDir, slug) {
  if (!SLUG_RE.test(String(slug || ''))) return null;
  try {
    const manifest = JSON.parse(fs.readFileSync(path.join(projectDir, '.aioson', 'squads', slug, 'squad.manifest.json'), 'utf8'));
    return manifest && typeof manifest === 'object' ? manifest : null;
  } catch {
    return null;
  }
}

function capText(text, max) {
  if (text.length <= max) return text;
  const cut = text.slice(0, max - 1);
  const space = cut.lastIndexOf(' ');
  return `${(space > max / 2 ? cut.slice(0, space) : cut).replace(/[\s,;:—-]+$/, '')}…`;
}

function squadName(manifest, slug) {
  return String(manifest.name || slug).replace(/\s+/g, ' ').trim();
}

/**
 * The mission's (or goal's) first sentence, on one line, capped. A leading
 * label the name already says ("Explainer: for the video…") is left out.
 */
function squadPurpose(manifest, slug) {
  const source = [manifest.mission, manifest.goal, manifest.description].find((value) => typeof value === 'string' && value.trim());
  if (!source) return '';
  let flat = source.replace(/\s+/g, ' ').trim();
  const label = /^([^:.!?]{1,40}):\s+(.+)$/.exec(flat);
  if (label && squadName(manifest, slug).toLowerCase().includes(label[1].trim().toLowerCase())) flat = label[2];
  const sentence = /^(.+?[.!?])(?:\s|$)/.exec(flat);
  return capText(sentence ? sentence[1] : flat, PURPOSE_MAX);
}

function renderSquadLine(slug, manifest, { note = false } = {}) {
  const purpose = squadPurpose(manifest, slug);
  const read = note ? `, read \`${NOTE_REL}\` first` : '';
  return `- Squad ${squadName(manifest, slug)} — \`${packageRel(slug)}\` (roles in \`agents/\`${read})${purpose ? `: ${purpose}` : ''}`;
}

function renderSquadBlock(slug, manifest, { note = false, eol = '\n' } = {}) {
  return `<!-- AIOSON-SQUAD:${slug}:START -->${eol}${renderSquadLine(slug, manifest, { note })}${eol}<!-- AIOSON-SQUAD:${slug}:END -->`;
}

// A legacy entry's lines that only point at a role's prompt, or its heading:
// the package already lists them. Everything else is authored prose.
function isPointerOrHeading(line, slug) {
  const text = line.trim();
  if (/^#{1,6}\s/.test(text)) return true;
  if (text.startsWith('- Squad ') && text.includes(packageRel(slug))) return true;
  return /^[-*]\s/.test(text) && /\.aioson\/squads\/[^`\s]+\/agents\/[^`\s]+\.md`?\s*$/.test(text);
}

function legacyNotes(inner, slug) {
  const kept = String(inner || '').split(/\r?\n/).filter((line) => !isPointerOrHeading(line, slug));
  return kept.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

function normalized(text) {
  return String(text || '').replace(/\s+/g, ' ').trim();
}

function notePath(projectDir, slug) {
  return path.join(projectDir, '.aioson', 'squads', slug, ...NOTE_REL.split('/'));
}

/** Appends a moved note to the package once; the same text twice is one note. */
function saveNote(projectDir, slug, text) {
  const file = notePath(projectDir, slug);
  let existing;
  try { existing = fs.readFileSync(file, 'utf8'); } catch { existing = ''; }
  if (existing && normalized(existing).includes(normalized(text))) return false;
  const header = existing ? '' : `# Gateway note — ${slug}\n\nMoved here from this squad's CLAUDE.md/AGENTS.md entry, which is now one line. Read it before using the squad.\n`;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${existing}${existing.endsWith('\n') || !existing ? '' : '\n'}${header}\n${text}\n`, 'utf8');
  return true;
}

/**
 * Rewrites every squad entry whose package has a manifest as its one line; an
 * entry without a readable manifest stays as it is. Returns the new content,
 * the slugs rewritten and the notes to move (saved unless `dryRun`).
 */
function compactSquadBlocks(content, projectDir, { dryRun = false } = {}) {
  const text = String(content || '');
  const eol = text.includes('\r\n') ? '\r\n' : '\n';
  const compacted = [];
  const notes = [];
  const next = text.replace(blockPattern(), (whole, slug, inner) => {
    const manifest = readManifest(projectDir, slug);
    if (!manifest) return whole;
    const note = legacyNotes(inner, slug);
    if (note) notes.push({ slug, text: note });
    const hasNote = Boolean(note) || fs.existsSync(notePath(projectDir, slug));
    const block = renderSquadBlock(slug, manifest, { note: hasNote, eol });
    if (block !== whole) compacted.push(slug);
    return block;
  });
  if (!dryRun) for (const note of notes) saveNote(projectDir, note.slug, note.text);
  return { content: next, compacted, notes };
}

/** Writes or refreshes one squad's entry in each gateway file present. */
function writeSquadGatewayEntry(projectDir, slug, { dryRun = false } = {}) {
  if (!SLUG_RE.test(String(slug || ''))) return { ok: false, error: 'invalid_squad', message: `Invalid squad slug: "${slug}"` };
  const manifest = readManifest(projectDir, slug);
  if (!manifest) return { ok: false, error: 'missing_manifest', message: `No readable .aioson/squads/${slug}/squad.manifest.json` };
  if (manifest.ephemeral === true) return { ok: true, slug, files: [], skipped: 'ephemeral' };
  const files = [];
  let line = null;
  for (const name of GATEWAY_FILES) {
    const file = path.join(projectDir, name);
    let existing;
    try { existing = fs.readFileSync(file, 'utf8'); } catch { continue; }
    const eol = existing.includes('\r\n') ? '\r\n' : '\n';
    const hasBlock = [...existing.matchAll(blockPattern())].some((match) => match[1] === slug);
    let next;
    if (hasBlock) {
      next = compactSquadBlocks(existing, projectDir, { dryRun }).content;
    } else {
      const block = renderSquadBlock(slug, manifest, { note: fs.existsSync(notePath(projectDir, slug)), eol });
      const separator = existing.length === 0 ? '' : existing.endsWith(`${eol}${eol}`) ? '' : existing.endsWith(eol) ? eol : `${eol}${eol}`;
      next = `${existing}${separator}${block}${eol}`;
    }
    const match = [...next.matchAll(blockPattern())].find((entry) => entry[1] === slug);
    if (match) line = match[2].trim();
    if (next === existing) continue;
    if (!dryRun) fs.writeFileSync(file, next, 'utf8');
    files.push(name);
  }
  return { ok: true, slug, files, line };
}

/** Squad entries in a gateway text that are not one line, with their bytes. */
function legacySquadEntries(content) {
  const found = [];
  for (const match of String(content || '').matchAll(blockPattern())) {
    const lines = match[2].split(/\r?\n/).filter((line) => line.trim());
    if (lines.length > 1) found.push({ slug: match[1], bytes: Buffer.byteLength(match[0]), lines: lines.length });
  }
  return found;
}

module.exports = {
  GATEWAY_FILES,
  PURPOSE_MAX,
  NOTE_REL,
  squadPurpose,
  renderSquadLine,
  renderSquadBlock,
  compactSquadBlocks,
  writeSquadGatewayEntry,
  legacySquadEntries
};
