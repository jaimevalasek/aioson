'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { runSquadRoleScan } = require('../src/commands/squad-role-scan');

async function makeTempDir() {
  return fs.mkdtemp(path.join(os.tmpdir(), 'aioson-role-scan-'));
}

function collectLogger() {
  const lines = [];
  return { lines, log: (l) => lines.push(String(l)), error: (l) => lines.push(String(l)) };
}

const CORPUS = `
# Editorial Operations
The Content Strategy team defines voice. A researcher must research and gather
evidence; the writer will draft and create articles; an editor reviews and
validates quality before publish. Content Strategy and Editorial Calendar drive
the work. We research competitors, draft scripts, and review claims.
`;

test('role-scan with --docs extracts entities, work-modes and terms', async () => {
  const dir = await makeTempDir();
  await fs.writeFile(path.join(dir, 'brief.md'), CORPUS);
  const logger = collectLogger();

  const result = await runSquadRoleScan({ args: [dir], options: { docs: 'brief.md', json: true }, logger });

  assert.ok(result.ok);
  assert.equal(result.docCount, 1);
  // entities: "Content Strategy" is repeated -> should surface
  assert.ok(result.signals.entities.some((e) => e.entity === 'Content Strategy'));
  // work-modes: originate (research/draft/create), judge (review/validate)
  assert.ok(result.signals.actions.originate.includes('research'));
  assert.ok(result.signals.actions.judge.includes('review'));
  assert.ok(result.signals.actions.judge.includes('validate'));
  // terms ranked, stopwords excluded
  assert.ok(result.signals.terms.length > 0);
  assert.ok(!result.signals.terms.some((t) => t.term === 'the'));
  // json mode prints nothing
  assert.equal(logger.lines.length, 0);
});

test('role-scan reads sourceDocs from a squad manifest when --squad given', async () => {
  const dir = await makeTempDir();
  await fs.mkdir(path.join(dir, 'docs'), { recursive: true });
  await fs.writeFile(path.join(dir, 'docs', 'src.md'), CORPUS);
  const squadDir = path.join(dir, '.aioson', 'squads', 'editorial');
  await fs.mkdir(squadDir, { recursive: true });
  await fs.writeFile(
    path.join(squadDir, 'squad.manifest.json'),
    JSON.stringify({ schemaVersion: '1.0.0', slug: 'editorial', name: 'E', mode: 'content', mission: 'm', goal: 'g', sourceDocs: ['docs/src.md'] })
  );
  const logger = collectLogger();

  const result = await runSquadRoleScan({ args: [dir], options: { squad: 'editorial', json: true }, logger });

  assert.ok(result.ok);
  assert.equal(result.slug, 'editorial');
  assert.equal(result.docCount, 1);
});

test('role-scan errors when no --docs and no --squad', async () => {
  const dir = await makeTempDir();
  const logger = collectLogger();
  const result = await runSquadRoleScan({ args: [dir], options: {}, logger });
  assert.ok(!result.ok);
  assert.equal(result.error, 'missing_input');
});

test('role-scan errors when squad manifest is missing', async () => {
  const dir = await makeTempDir();
  const logger = collectLogger();
  const result = await runSquadRoleScan({ args: [dir], options: { squad: 'ghost', json: true }, logger });
  assert.ok(!result.ok);
  assert.equal(result.error, 'manifest_not_found');
});

test('role-scan entities exclude bare articles and never span newlines (regression)', async () => {
  const dir = await makeTempDir();
  // Heading on its own line, then a sentence starting with "The": the old regex glued
  // "Brief\nThe" into one entity and emitted a bare "The".
  await fs.writeFile(path.join(dir, 'h.md'), '# Editorial Brief\nThe Content Strategy guides everything.\n');
  const logger = collectLogger();
  const result = await runSquadRoleScan({ args: [dir], options: { docs: 'h.md', json: true }, logger });
  assert.ok(result.ok);
  const names = result.signals.entities.map((e) => e.entity);
  assert.ok(!names.includes('The'), 'a bare article must not be an entity');
  assert.ok(!names.some((n) => n.includes('\n')), 'entities must not span newlines');
  assert.ok(names.includes('Content Strategy'), 'real entity still extracted (leading "The" stripped)');
});

test('role-scan normalizes accented (non-ASCII) terms', async () => {
  const dir = await makeTempDir();
  await fs.writeFile(path.join(dir, 'pt.md'), 'Análise e revisão de conteúdo. Análise e revisão. Análise revisão.\n');
  const logger = collectLogger();
  const result = await runSquadRoleScan({ args: [dir], options: { docs: 'pt.md', json: true }, logger });
  assert.ok(result.ok);
  assert.ok(result.signals.terms.some((t) => t.term === 'analise'), 'accents normalized into ranked terms');
});

test('role-scan returns manifest_not_found on malformed manifest JSON', async () => {
  const dir = await makeTempDir();
  const squadDir = path.join(dir, '.aioson', 'squads', 'broken');
  await fs.mkdir(squadDir, { recursive: true });
  await fs.writeFile(path.join(squadDir, 'squad.manifest.json'), '{ not valid json');
  const logger = collectLogger();
  const result = await runSquadRoleScan({ args: [dir], options: { squad: 'broken', json: true }, logger });
  assert.ok(!result.ok);
  assert.equal(result.error, 'manifest_not_found');
});

test('role-scan reports missing docs but still scans the readable ones', async () => {
  const dir = await makeTempDir();
  await fs.writeFile(path.join(dir, 'present.md'), CORPUS);
  const logger = collectLogger();
  const result = await runSquadRoleScan({ args: [dir], options: { docs: 'present.md,gone.md', json: true }, logger });
  assert.ok(result.ok);
  assert.equal(result.docCount, 1);
  assert.deepEqual(result.missing, ['gone.md']);
});

test('role-scan rejects paths outside the project (no traversal / absolute escape) [SF-01]', async () => {
  const dir = await makeTempDir();
  const outside = await makeTempDir();
  await fs.writeFile(path.join(outside, 'secret.env'), 'TopSecret DatabasePassword DatabasePassword');
  await fs.writeFile(path.join(dir, 'ok.md'), 'Content Strategy research. Research review review.');
  const logger = collectLogger();
  const result = await runSquadRoleScan({
    args: [dir],
    // absolute path outside the project + a relative `..` escape + one in-scope doc
    options: { docs: `${path.join(outside, 'secret.env')},../escape.md,ok.md`, json: true },
    logger,
  });
  assert.ok(result.ok); // ok.md is in-scope and readable
  assert.equal(result.docCount, 1);
  assert.ok(result.rejected.length >= 2, 'out-of-project paths are rejected, not read');
  assert.ok(!result.signals.terms.some((t) => t.term === 'databasepassword'), 'secret file never read');
});
