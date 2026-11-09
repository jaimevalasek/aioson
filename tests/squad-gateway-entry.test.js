'use strict';

/**
 * Every session re-reads CLAUDE.md (Claude Code) and AGENTS.md (Codex,
 * OpenCode). A squad's entry there listed each role's prompt path plus a usage
 * paragraph — 0.8 to 1.9 KB a squad, 3.4 KB for four, paid on every session —
 * although the package lists its roles in agents/agents.md. The entry is one
 * line rendered from the manifest; `aioson update` rewrites legacy entries and
 * moves their prose to the package, so nothing authored is lost.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const {
  renderSquadBlock,
  compactSquadBlocks,
  writeSquadGatewayEntry,
  legacySquadEntries,
  squadPurpose,
  NOTE_REL
} = require('../src/squad/gateway-entry');
const { mergeGatewayPointer } = require('../src/gateway-pointer-merge');
const { runSquadAgentCreate } = require('../src/commands/squad-agent-create');

const CLI = path.join(__dirname, '..', 'bin', 'aioson.js');
const ROLES = ['orquestrador', 'scriptwriter', 'fact-checker', 'scene-director', 'critic', 'thumbnail-director'];
const LONG_MISSION = 'Explainer: for the video that teaches how something works or why it happens — a concept, a process, a technology, a rule. Rewrites for clarity, checks definitions and numbers, and cuts one idea per scene.';

function makeProject(squads) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aioson-squad-gateway-'));
  for (const [slug, manifest] of Object.entries(squads)) {
    fs.mkdirSync(path.join(dir, '.aioson', 'squads', slug, 'agents'), { recursive: true });
    fs.writeFileSync(path.join(dir, '.aioson', 'squads', slug, 'squad.manifest.json'), JSON.stringify({ slug, mode: 'content', ...manifest }));
  }
  return dir;
}

function legacyBlock(slug, title, usage, marker = 'START') {
  const roles = ROLES.map((role) => `- \`@${role}\` → \`.aioson/squads/${slug}/agents/${role}.md\``).join('\n');
  return `<!-- AIOSON-SQUAD:${slug}:${marker} -->\n## Squad ${title}\n\n${roles}\n${usage ? `\n${usage}\n` : ''}<!-- AIOSON-SQUAD:${slug}:END -->`;
}

const blocksOf = (content) => [...content.matchAll(/<!-- AIOSON-SQUAD:([a-z0-9-]+):START -->\r?\n([\s\S]*?)<!-- AIOSON-SQUAD:\1:END -->/g)];
const bytes = (text) => Buffer.byteLength(text);

test('a squad entry is one line under a byte budget, whatever the roster and the mission length', () => {
  const block = renderSquadBlock('pre-production-explainer', { name: 'Explainer (pre-production)', mission: LONG_MISSION }, { note: true });
  const inner = block.split('\n').slice(1, -1);
  assert.equal(inner.length, 1, 'one line between the markers');
  assert.match(inner[0], /^- Squad Explainer \(pre-production\) — `\.aioson\/squads\/pre-production-explainer\/` \(roles in `agents\/`, read `docs\/gateway-note\.md` first\): /);
  assert.doesNotMatch(inner[0], /^- Squad .*: Explainer:/, 'the label the name already says is left out');
  assert.ok(bytes(block) <= 360, `entry is ${bytes(block)} B (budget 360)`);
  assert.equal(squadPurpose({ mission: 'Writes copy. Then reviews it.' }), 'Writes copy.');
  assert.equal(squadPurpose({ goal: 'Ships a strict package' }), 'Ships a strict package');
});

test('aioson update rewrites legacy squad entries as one line each, moves their prose, keeps the rest byte for byte', async () => {
  const usage = 'Use this squad only to replay a proof case or debug a role; the app calls each role in isolation.';
  const squads = {
    'publication-editor': { name: 'Publication Editor', mission: 'Create reviewable publication copy grounded only in the current cut.' },
    'pre-production-standard': { name: 'Standard (pre-production)', mission: LONG_MISSION },
    'pre-production-reportage': { name: 'Reportage (pre-production)', mission: 'Reportage: for the video that reports a fact, each number and quote with its source.' },
    'content-team': { name: 'Content Team', mission: 'Turn one recording into posts.' }
  };
  const dir = makeProject(squads);
  const head = '# My project\n\nProject rule: keep tests green.\n\n<!-- AIOSON:BEGIN -->\nold managed body\n<!-- AIOSON:END -->\n\n## Owner notes\n\nKeep me exactly.\n\n';
  const legacy = [
    legacyBlock('publication-editor', 'Publication Editor', usage),
    legacyBlock('pre-production-standard', 'Standard', usage),
    legacyBlock('pre-production-reportage', 'Reportage', usage),
    legacyBlock('content-team', '`content-team`', '', 'BEGIN')
  ].join('\n\n');
  const orphan = legacyBlock('no-manifest-squad', 'Gone', 'stays as written');
  const tail = '\n\n## After the squads\n\nAlso kept.\n';
  const original = `${head}${legacy}\n\n${orphan}${tail}`;
  fs.writeFileSync(path.join(dir, 'CLAUDE.md'), original);
  const templatePath = path.join(dir, 'template-CLAUDE.md');
  fs.writeFileSync(templatePath, '# AIOSON\n\nnew managed body\n');

  const result = await mergeGatewayPointer({ templatePath, targetPath: path.join(dir, 'CLAUDE.md') });
  assert.equal(result.action, 'block_updated');
  const next = fs.readFileSync(path.join(dir, 'CLAUDE.md'), 'utf8');

  const entries = blocksOf(next).filter((match) => match[1] !== 'no-manifest-squad');
  assert.deepEqual(entries.map((match) => match[1]), Object.keys(squads));
  for (const match of entries) assert.equal(match[2].trim().split('\n').length, 1, `${match[1]} is one line`);
  const legacyBytes = Object.keys(squads).reduce((sum, slug) => sum + bytes(legacy.split(`<!-- AIOSON-SQUAD:${slug}:`)[1] || ''), 0);
  const compactBytes = entries.reduce((sum, match) => sum + bytes(match[0]), 0);
  assert.ok(compactBytes <= 0.5 * legacyBytes, `squad entries ${legacyBytes} B -> ${compactBytes} B`);
  assert.ok(compactBytes <= Object.keys(squads).length * 360, `squad entries ${compactBytes} B (budget 360 a squad)`);
  assert.equal(legacySquadEntries(next).map((entry) => entry.slug).join(), 'no-manifest-squad', 'only the entry with no manifest stays multi-line');

  assert.ok(next.startsWith('# My project\n\nProject rule: keep tests green.\n\n<!-- AIOSON:BEGIN -->'), 'content before the managed block is kept');
  assert.match(next, /new managed body/);
  assert.ok(next.includes('\n## Owner notes\n\nKeep me exactly.\n\n<!-- AIOSON-SQUAD:publication-editor:START -->'));
  assert.ok(next.includes(orphan), 'an entry whose package has no manifest is not touched');
  assert.ok(next.endsWith(tail), 'content after the squads is kept');

  const note = fs.readFileSync(path.join(dir, '.aioson', 'squads', 'publication-editor', ...NOTE_REL.split('/')), 'utf8');
  assert.ok(note.includes(usage), 'the usage prose moved to the package');
  assert.match(entries[0][2], /read `docs\/gateway-note\.md` first/);
  assert.doesNotMatch(entries[3][2], /gateway-note/, 'a role list alone leaves no note');
  assert.equal(fs.existsSync(path.join(dir, '.aioson', 'squads', 'content-team', ...NOTE_REL.split('/'))), false);

  const again = await mergeGatewayPointer({ templatePath, targetPath: path.join(dir, 'CLAUDE.md') });
  assert.equal(again.action, 'unchanged', 'a second update changes nothing');
  assert.equal(fs.readFileSync(path.join(dir, '.aioson', 'squads', 'publication-editor', ...NOTE_REL.split('/')), 'utf8'), note);
});

test('a sentence that ends at a role path, and a heading inside the entry, move to the note with the prose', () => {
  const dir = makeProject({ 'copy-forge': { name: 'Copy Forge', mission: 'One idea in, one auditable copy package out.' } });
  const rule = '- Never route review work to the critic outside a review cycle: `.aioson/squads/copy-forge/agents/critic.md`';
  const usage = '### When not to use it\n\nA one-line caption does not need the squad.';
  const content = legacyBlock('copy-forge', 'Copy Forge', `- **Fact Checker** — \`.aioson/squads/copy-forge/agents/fact-checker.md\`\n${rule}\n\n${usage}`);
  const [note] = compactSquadBlocks(content, dir, { dryRun: true }).notes;
  assert.equal(note.text, `${rule}\n\n${usage}`, 'the title and the role handles stay out; what someone wrote stays in');

  const headingsOnly = legacyBlock('copy-forge', 'Copy Forge', '### Roles');
  assert.deepEqual(compactSquadBlocks(headingsOnly, dir, { dryRun: true }).notes, [], 'headings alone are nothing to move');
});

test('a dry-run update reports the rewrite and writes no note', () => {
  const dir = makeProject({ 'copy-forge': { name: 'Copy Forge', mission: 'One idea in, one auditable copy package out.' } });
  const content = legacyBlock('copy-forge', 'Copy Forge', 'Route here for copy.');
  const result = compactSquadBlocks(content, dir, { dryRun: true });
  assert.deepEqual(result.compacted, ['copy-forge']);
  assert.equal(result.notes.length, 1);
  assert.equal(fs.existsSync(path.join(dir, '.aioson', 'squads', 'copy-forge', 'docs')), false);
});

test('squad:gateway appends a missing entry, keeps CRLF, refuses a bad slug and skips an ephemeral squad', () => {
  const dir = makeProject({
    'copy-forge': { name: 'Copy Forge', mission: 'One idea in, one auditable copy package out.' },
    'quick-team': { name: 'Quick', mission: 'Temporary.', ephemeral: true }
  });
  fs.writeFileSync(path.join(dir, 'CLAUDE.md'), '# Project\r\n\r\nRules.\r\n');
  fs.writeFileSync(path.join(dir, 'AGENTS.md'), '# Project\n');

  const res = spawnSync(process.execPath, [CLI, 'squad:gateway', dir, '--squad=copy-forge', '--json'], { encoding: 'utf8' });
  assert.equal(res.status, 0, res.stderr);
  const parsed = JSON.parse(res.stdout);
  assert.deepEqual(parsed.files, ['CLAUDE.md', 'AGENTS.md']);
  const claude = fs.readFileSync(path.join(dir, 'CLAUDE.md'), 'utf8');
  assert.ok(claude.startsWith('# Project\r\n\r\nRules.\r\n\r\n<!-- AIOSON-SQUAD:copy-forge:START -->\r\n- Squad Copy Forge — '));
  assert.ok(!claude.replace(/\r\n/g, '').includes('\n'), 'CRLF file stays CRLF');

  const rerun = writeSquadGatewayEntry(dir, 'copy-forge');
  assert.deepEqual(rerun.files, [], 'idempotent');
  assert.equal(writeSquadGatewayEntry(dir, '../escape').error, 'invalid_squad');
  assert.equal(writeSquadGatewayEntry(dir, 'missing').error, 'missing_manifest');
  assert.equal(writeSquadGatewayEntry(dir, 'quick-team').skipped, 'ephemeral');
  assert.doesNotMatch(fs.readFileSync(path.join(dir, 'AGENTS.md'), 'utf8'), /quick-team/);
});

test('squad:agent-create registers the squad by its one line, never one gateway line per role', async () => {
  const dir = makeProject({ 'content-team': { name: 'Content Team', mission: 'Turn one recording into posts.', executors: [] } });
  fs.writeFileSync(path.join(dir, 'CLAUDE.md'), '# Project\n');
  fs.writeFileSync(path.join(dir, 'AGENTS.md'), '# Project\n');
  const silent = { log() {}, error() {}, warn() {} };
  for (const name of ['writer', 'reviewer']) {
    const created = await runSquadAgentCreate({ args: [dir], options: { name, squad: 'content-team', mission: `The ${name}` }, logger: silent });
    assert.equal(created.ok, true, JSON.stringify(created));
  }
  for (const file of ['CLAUDE.md', 'AGENTS.md']) {
    const content = fs.readFileSync(path.join(dir, file), 'utf8');
    assert.equal(blocksOf(content).length, 1, `${file}: one squad entry`);
    assert.doesNotMatch(content, /agents\/(writer|reviewer)\.md/, `${file}: no per-role line`);
  }
});

test('squad:validate names a multi-line entry with its bytes and the command that rewrites it', async () => {
  const { runSquadValidate } = require('../src/commands/squad-validate');
  const dir = makeProject({ 'copy-forge': { schemaVersion: '1.0.0', name: 'Copy Forge', mission: 'One idea in.', goal: 'One package out.' } });
  fs.writeFileSync(path.join(dir, 'CLAUDE.md'), `# Project\n\n${legacyBlock('copy-forge', 'Copy Forge', 'Route here for copy.')}\n`);
  fs.writeFileSync(path.join(dir, 'AGENTS.md'), `# Project\n\n${renderSquadBlock('copy-forge', { name: 'Copy Forge', mission: 'One idea in.' })}\n`);
  const result = await runSquadValidate({ args: [dir], options: { squad: 'copy-forge' }, logger: { log() {}, error() {} } });
  const advisories = result.warnings.filter((line) => /re-read by every session/.test(line));
  assert.equal(advisories.length, 1, advisories.join('\n'));
  assert.match(advisories[0], /^CLAUDE\.md lists squad "copy-forge" in \d+ lines \(\d+ B\).*aioson squad:gateway \. --squad=copy-forge/);
});
