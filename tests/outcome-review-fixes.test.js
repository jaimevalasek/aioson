'use strict';

/**
 * Outcome records — the defects an independent review reproduced against the
 * first version, each replayed in the state that exposed it:
 *   - a FAIL close then a PASS close read as "passed QA the first time";
 *   - a re-close after the archive rewrote the record without the practices
 *     the delivery really used (detectors looked only at the context root);
 *   - comments leaked paths with spaces, bare domains, git remotes, IPv6,
 *     office files, names in other scripts, decomposed accents and plurals;
 *   - two chats closing at once opened two screens;
 *   - build agents without CI=true were not refused;
 *   - simple plans were judged recent by file time (a clone rewrites it);
 *   - the schema accepted any practice id, so a key could carry a word;
 *   - --on / --never failed outside a project or for an unknown feature.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const { recordOutcome, buildRecord } = require('../src/lib/outcomes/record');
const { readRecord, writeRecord, readRecords } = require('../src/lib/outcomes/ledger');
const { validateRecord, PRACTICE_IDS } = require('../src/lib/outcomes/schema');
const { LABELS, detectPractices } = require('../src/lib/outcomes/practices');
const { scrubComment } = require('../src/lib/outcomes/scrub');
const { environmentRefusal } = require('../src/lib/outcomes/feedback');
const { maybeInviteAfterClose } = require('../src/lib/outcomes/invite');
const { closeFinishedSimplePlans } = require('../src/lib/outcomes/simple-plan-hook');
const { analyze } = require('../src/lib/outcomes/report');

const CLI = path.join(__dirname, '..', 'bin', 'aioson.js');
const DESKTOP_ENV = { DISPLAY: ':0' };

function write(file, content) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
}

function project() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aioson-outcome-fix-'));
  write(path.join(dir, '.aioson', 'context', 'project.context.md'), '---\nproject_name: "Acme Portal"\nclassification: "SMALL"\ninteraction_language: "pt-BR"\n---\n');
  return dir;
}

function record(feature, extra = {}) {
  return {
    schema: 1, feature, kind: 'feature', classification: 'SMALL', verdict: 'PASS', closed_at: '2026-11-27T12:00:00.000Z',
    aioson_version: '1.84.2', catalog_version: 1, shape: 'single-dev', autopilot: false, practices: {}, outcome: { first_pass: true }, ...extra
  };
}

test('a FAIL close followed by a PASS close never reads as first-pass, and counts the round', async () => {
  const dir = project();
  write(path.join(dir, '.aioson', 'context', 'prd-checkout.md'), '---\nclassification: SMALL\n---\n# PRD\n');
  await recordOutcome(dir, 'checkout', { verdict: 'FAIL' });
  await recordOutcome(dir, 'checkout', { verdict: 'PASS' });
  const after = readRecord(dir, 'checkout');
  assert.equal(after.verdict, 'PASS');
  assert.equal(after.outcome.first_pass, false);
  assert.equal(after.outcome.fail_cycles, 1);
  await recordOutcome(dir, 'checkout', { verdict: 'PASS' });
  assert.equal(readRecord(dir, 'checkout').outcome.fail_cycles, 1, 'an idempotent re-close adds no round');
});

test('a re-close after the archive keeps the practices the delivery used', async () => {
  const dir = project();
  const ctx = path.join(dir, '.aioson', 'context');
  write(path.join(ctx, 'prd-checkout.md'), '---\nclassification: SMALL\nsheldon_review: approved\n---\n# PRD\n');
  write(path.join(ctx, 'implementation-plan-checkout.md'), '# Plan\n\n## Phase 1 — A\n\n## Phase 2 — B\n');
  write(path.join(ctx, 'shakedown-checkout.md'), '# Shakedown\n');
  await recordOutcome(dir, 'checkout', { verdict: 'PASS' });
  // The archive moves the artifacts under done/{slug}/.
  for (const name of ['prd-checkout.md', 'implementation-plan-checkout.md', 'shakedown-checkout.md']) {
    write(path.join(ctx, 'done', 'checkout', name), fs.readFileSync(path.join(ctx, name)));
    fs.unlinkSync(path.join(ctx, name));
  }
  const detected = await detectPractices({ targetDir: dir, ctxDir: ctx, slug: 'checkout', kind: 'feature', prd: null, integrity: null });
  assert.equal(detected.practices.phased_plan, true, 'the detector reads done/{slug}/');
  assert.equal(detected.practices.shakedown, true);
  const again = await buildRecord(dir, 'checkout', { verdict: 'PASS' });
  assert.equal(again.practices.prd_reviewed, true);
  assert.equal(again.practices.phased_plan, true);
  assert.equal(again.shape, 'single-dev');
});

test('no locating shape survives the comment scrub', () => {
  const cases = [
    ['o Acme Portal em C:\\Users\\Ana Lima\\acme e acme.com.br/x', ['Acme Portal'], ['Ana', 'Lima', 'acme', 'Acme']],
    ['veja /Users/maria souza/acme-portal agora', [], ['souza', 'acme']],
    ['portal.acmecorp.com.br, api.acmecorp.io/v2 e localhost:3000/admin', [], ['acmecorp', 'localhost']],
    ['git@github.com:acmecorp/portal-secreto.git', [], ['acmecorp', 'secreto']],
    ['ipv6 fe80::1ff:fe23:4567:890a e ::1', [], ['fe80', '890a', '::1']],
    ['contrato-acme.docx, planilha.xlsx e deck.pptx', [], ['contrato', 'planilha', 'deck']],
    ['Bjørn Bakery ficou ótima', ['Bjørn Bakery'], ['Bjørn', 'Bakery']],
    ['Магазин Мария работает', ['Магазин Мария'], ['Магазин', 'Мария']],
    ['O Cafe\u0301 N\u0303andu\u0301 abriu', ['Café Ñandú'], ['Caf', 'andu']],
    ['loja.da.maria, Lojas da Maria e LojasDaMaria', ['Loja da Maria'], ['maria', 'Maria']],
    ['Authorization: Bearer abcdef123456abcdef123456', [], ['abcdef', '123456']]
  ];
  for (const [input, names, leaks] of cases) {
    const out = scrubComment(input, { names });
    for (const leak of leaks) assert.ok(!out.includes(leak), `"${leak}" leaked from "${input}": ${out}`);
  }
  const prose = 'O protótipo e/ou o QA com Next.js ajudaram, sim/não. Deploy em 27/11/2026 às 12:30:45 no aioson.com.';
  assert.equal(scrubComment(prose, { names: ['app'] }), prose);
});

test('two closes at the same moment open one screen', async () => {
  const dir = project();
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'aioson-outcome-fix-home-'));
  writeRecord(dir, record('a'));
  writeRecord(dir, record('b'));
  let launches = 0;
  const launch = async () => { launches += 1; await new Promise((r) => setTimeout(r, 30)); };
  const [first, second] = await Promise.all([
    maybeInviteAfterClose({ targetDir: dir, slug: 'a', env: DESKTOP_ENV, home, launch }),
    maybeInviteAfterClose({ targetDir: dir, slug: 'b', env: DESKTOP_ENV, home, launch })
  ]);
  assert.equal(launches, 1);
  assert.deepEqual([first.invited, second.invited].sort(), [false, true]);
  assert.ok(!fs.existsSync(path.join(home, '.aioson', 'outcomes.invite.lock')), 'the slot is released');
});

test('build agents are refused even without CI=true', () => {
  for (const name of ['TF_BUILD', 'JENKINS_URL', 'TEAMCITY_VERSION', 'CODEBUILD_BUILD_ID', 'BUILDKITE', 'GITHUB_ACTIONS', 'GITLAB_CI']) {
    assert.equal(environmentRefusal({ env: { DISPLAY: ':0', [name]: 'True' } }), 'ci', name);
  }
  assert.equal(environmentRefusal({ env: { DISPLAY: ':0', CI: 'false' } }), null);
});

test('a simple plan is recent by its own dates, not by a rewritten file time; odd names are skipped', async () => {
  const dir = project();
  const plans = path.join(dir, '.aioson', 'context', 'simple-plans');
  const today = new Date().toISOString().slice(0, 10);
  write(path.join(plans, 'old-plan.md'), '---\nstatus: done\nupdated_at: 2026-01-10\n---\n# Old, file just rewritten by a checkout\n');
  write(path.join(plans, 'Fix_Login.md'), `---\nstatus: done\nupdated_at: ${today}\n---\n# Odd name\n`);
  write(path.join(plans, 'fix-header.md'), `---\nstatus: done\nupdated_at: ${today}\n---\n# Fresh\n`);
  const result = await closeFinishedSimplePlans(dir);
  assert.deepEqual(result.recorded, ['fix-header']);
  assert.ok(!result.lines.some((line) => /schema/.test(line)), result.lines.join('\n'));
});

test('the schema holds only catalog practice ids and plain versions; unknown ids are dropped on read', () => {
  assert.equal(validateRecord(record('x', { practices: { cliente_joao_silva_cpf_12345678909: true } })).ok, false);
  assert.equal(validateRecord(record('x', { aioson_version: '1.84.2-acmecorp.internal.build' })).ok, false);
  assert.equal(validateRecord(record('x', { aioson_version: '1.85.0-beta.2' })).ok, true);
  const dir = project();
  const raw = record('newer', { practices: { visual_inputs: true, future_practice: true } });
  write(path.join(dir, '.aioson', 'outcomes', 'newer.json'), JSON.stringify(raw));
  assert.deepEqual(readRecords(dir).map((r) => r.practices), [{ visual_inputs: true }]);
});

test('the practice catalog, its labels and the detectors are the same list', async () => {
  assert.deepEqual(Object.keys(LABELS).sort(), [...PRACTICE_IDS].sort());
  const dir = project();
  const detected = await detectPractices({ targetDir: dir, ctxDir: path.join(dir, '.aioson', 'context'), slug: 'none', kind: 'feature', prd: null, integrity: null });
  assert.deepEqual(Object.keys(detected.practices).sort(), [...PRACTICE_IDS].sort());
});

test('unclassified features are counted but never compared', () => {
  const unk = (f, v, pass) => record(f, { classification: null, practices: { shakedown: v }, outcome: { first_pass: pass } });
  const analysis = analyze([unk('a', true, true), unk('b', true, true), unk('c', true, true), unk('d', false, false), unk('e', false, false), unk('f', false, false)]);
  assert.equal(analysis.total, 6);
  assert.deepEqual(analysis.best, []);
});

test('--on works outside a project and --never works for an unknown feature', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'aioson-outcome-fix-home-'));
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'aioson-outcome-fix-outside-'));
  const env = { ...process.env, HOME: home, USERPROFILE: home, AIOSON_PROJECT_REGISTRY: 'false' };
  const never = spawnSync(process.execPath, [CLI, 'outcome:feedback', project(), '--feature=does-not-exist', '--never', '--json'], { encoding: 'utf8', env });
  assert.equal(never.status, 0, never.stdout + never.stderr);
  const prefs = path.join(home, '.aioson', 'outcomes.json');
  assert.equal(JSON.parse(fs.readFileSync(prefs, 'utf8')).feedback.state, 'off');
  const on = spawnSync(process.execPath, [CLI, 'outcome:feedback', outside, '--on', '--json'], { encoding: 'utf8', env });
  assert.equal(on.status, 0, on.stdout + on.stderr);
  assert.equal(JSON.parse(fs.readFileSync(prefs, 'utf8')).feedback.state, 'on');
});
