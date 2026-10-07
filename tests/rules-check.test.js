'use strict';

// Guards the rule-compliance layer: `aioson rules:check` and the naming-language
// detector behind it.
//
// The failure that produced this file: a rule had said for months that source
// identifiers are English, an agent loaded it, an acceptance criterion
// contradicted it, and the agent resolved the conflict in favour of the feature
// artifact and recorded the deviation. Every gate stayed green because nothing
// measured naming. These tests hold the two properties that make that
// impossible to repeat — the violation is measurable, and the measurement is
// quiet enough on clean code that nobody switches it off.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const { runRulesCheck, discoverGovernance, ENFORCERS } = require('../src/commands/rules-check');
const { classifyIdentifier, splitWords } = require('../src/lib/naming-language');

const silent = { log() {}, error() {} };

async function scaffold(files) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'aioson-rules-check-'));
  for (const [rel, content] of Object.entries(files)) {
    const abs = path.join(dir, rel);
    await fs.mkdir(path.dirname(abs), { recursive: true });
    await fs.writeFile(abs, content, 'utf8');
  }
  return dir;
}

const LANGUAGE_RULE = `---
name: source-code-language-convention
description: identifiers in technical English
enforcement: source-code-language
---

# Source Code Language Convention
`;

// ─── the detector ─────────────────────────────────────────────────────────────

test('naming detector splits identifiers the way code actually writes them', () => {
  assert.deepEqual(splitWords('criarBloco'), ['criar', 'bloco']);
  assert.deepEqual(splitWords('EM_CAMPO_DE_TEXTO'), ['em', 'campo', 'de', 'texto']);
  assert.deepEqual(splitWords('servidor/rotas'), ['servidor', 'rotas']);
  assert.deepEqual(splitWords('HTTPServer'), ['http', 'server']);
});

test('naming detector flags translated technical scaffolding as HIGH-confidence', () => {
  for (const name of ['servidor', 'rotas', 'criarBloco', 'salvarPauta', 'ControleDeModo']) {
    const hit = classifyIdentifier(name);
    assert.ok(hit, `${name} should be classified`);
    assert.equal(hit.kind, 'role', `${name} should be a role hit`);
  }
});

test('naming detector flags native-language morphology as the softer signal', () => {
  for (const name of ['migracao', 'duracaoPrevista', 'identidade', 'ChecagemPreLive']) {
    const hit = classifyIdentifier(name);
    assert.ok(hit, `${name} should be classified`);
    assert.equal(hit.kind, 'morphology', `${name} should be a morphology hit`);
  }
});

test('naming detector leaves English and product vocabulary alone', () => {
  // English identifiers, including the ones whose spelling collides with a
  // Portuguese/Spanish word or ending — these are the false positives that
  // would get the whole check switched off.
  for (const name of [
    'createBlock', 'saveDraft', 'HttpServer', 'routeHandler', 'userTotal',
    'converter', 'dataSource', 'localMedia', 'travel', 'increment', 'memento',
    'finalValue', 'itemList'
  ]) {
    assert.equal(classifyIdentifier(name), null, `${name} must not be flagged`);
  }
  // A product's own canonical vocabulary is the project's call, not the rule's.
  for (const name of ['Pauta', 'Bloco', 'Trilho', 'Resgate', 'Deck']) {
    assert.equal(classifyIdentifier(name), null, `domain noun ${name} must not be flagged`);
  }
});

// ─── the command ──────────────────────────────────────────────────────────────

test('rules:check reports a translated tree as a blocking violation', async () => {
  const dir = await scaffold({
    '.aioson/rules/source-code-language-convention.md': LANGUAGE_RULE,
    'servidor/rotas/blocos.ts': 'export function criarBloco() { return 1; }\n'
  });

  const report = await runRulesCheck({ args: [dir], options: { json: true, suppressExitCode: true }, logger: silent });

  assert.equal(report.ok, false);
  assert.ok(report.by_severity.HIGH >= 1);
  const messages = report.findings.map((f) => f.message).join('\n');
  assert.match(messages, /servidor/);
  assert.match(messages, /criarBloco/);
  assert.equal(report.rules_enforced[0].name, 'source-code-language-convention');
});

test('rules:check stays silent on an English tree', async () => {
  const dir = await scaffold({
    '.aioson/rules/source-code-language-convention.md': LANGUAGE_RULE,
    'src/server/routes/blocks.ts': 'export function createBlock() { return 1; }\n'
  });

  const report = await runRulesCheck({ args: [dir], options: { json: true, suppressExitCode: true }, logger: silent });

  assert.equal(report.ok, true);
  assert.equal(report.total, 0);
});

test('rules:check never reads product copy — only declarations and paths', async () => {
  // The rule explicitly allows user-facing text in the project language, so a
  // checker that flagged strings or comments would contradict the rule it is
  // supposed to enforce.
  const dir = await scaffold({
    '.aioson/rules/source-code-language-convention.md': LANGUAGE_RULE,
    'src/ui/toast.ts': [
      '// Este comentario esta em portugues de proposito.',
      'export function showToast() {',
      '  return "Pauta salva com sucesso, usuario";',
      '}'
    ].join('\n')
  });

  const report = await runRulesCheck({ args: [dir], options: { json: true, suppressExitCode: true }, logger: silent });

  assert.equal(report.total, 0, 'copy and comments must never be reported');
});

test('the rule file is the on/off switch — no rule, no check', async () => {
  const dir = await scaffold({
    'servidor/rotas/blocos.ts': 'export function criarBloco() { return 1; }\n'
  });

  const report = await runRulesCheck({ args: [dir], options: { json: true, suppressExitCode: true }, logger: silent });

  assert.equal(report.ok, true);
  assert.equal(report.rules_enforced.length, 0);
});

test('rules:check enforces rules, docs, and process skills through one mechanism', async () => {
  const dir = await scaffold({
    '.aioson/rules/status-change-confirmation.md': `---
name: status-change-confirmation
description: confirmations use the design system
enforcement: no-native-dialogs
---
`,
    '.aioson/skills/process/prototype-forge/references/build-contract.md': `---
description: prototype build contract
enforcement: no-native-dialogs
---
`,
    '.aioson/docs/dev/phase-loop.md': `---
description: a doc with no checker
---
`,
    'src/ui/delete-button.tsx': 'export function remove() { if (!window.confirm("sure?")) return; }\n'
  });

  const report = await runRulesCheck({ args: [dir], options: { json: true, suppressExitCode: true }, logger: silent });

  assert.equal(report.ok, false);
  const surfaces = report.rules_enforced.map((rule) => rule.governance_surface).sort();
  assert.deepEqual(surfaces, ['rules', 'skills']);
  assert.equal(report.coverage.docs.total, 1);
  assert.equal(report.coverage.docs.enforced, 0);
  assert.ok(report.unenforced.includes('phase-loop'), 'a doc without a checker must be reported as prose-only');
  // Two documents declare the same checker; the violation is still counted once.
  assert.equal(report.by_severity.HIGH, 1);
  assert.deepEqual(report.findings[0].declared_by.sort(), ['build-contract', 'status-change-confirmation']);
  // A rule in the declaring set makes the whole check binding.
  assert.equal(report.findings[0].authority, 'binding');
});

test('a doc or process skill is craft, not law — it warns instead of blocking', async () => {
  // The same checker, the same violating code. The only difference is which
  // surface declared it: rules are hard constraints on how to implement, while
  // docs and process skills are ability. Only the rule refuses the stage.
  const violating = { 'src/ui/delete-button.tsx': 'export function remove() { window.confirm("sure?"); }\n' };
  const frontmatter = (name) => `---\nname: ${name}\ndescription: confirmations use the design system\nenforcement: no-native-dialogs\n---\n`;

  const skillOnly = await scaffold({
    '.aioson/skills/process/prototype-forge/references/build-contract.md': frontmatter('build-contract'),
    ...violating
  });
  const advisory = await runRulesCheck({ args: [skillOnly], options: { json: true, suppressExitCode: true }, logger: silent });

  assert.equal(advisory.total, 1, 'the violation is still found');
  assert.equal(advisory.by_severity.HIGH, 0, 'craft guidance never reaches blocking severity');
  assert.equal(advisory.by_severity.MED, 1);
  assert.equal(advisory.ok, true, 'an advisory finding must not refuse the stage');
  assert.equal(advisory.rules_enforced[0].authority, 'advisory');

  const ruleOwned = await scaffold({
    '.aioson/rules/status-change-confirmation.md': frontmatter('status-change-confirmation'),
    ...violating
  });
  const binding = await runRulesCheck({ args: [ruleOwned], options: { json: true, suppressExitCode: true }, logger: silent });

  assert.equal(binding.by_severity.HIGH, 1, 'the same violation blocks when a rule owns it');
  assert.equal(binding.ok, false);
  assert.equal(binding.rules_enforced[0].authority, 'binding');
});

test('the native-dialog checker ignores locally declared confirm and inert text', async () => {
  const dir = await scaffold({
    '.aioson/rules/status-change-confirmation.md': `---
name: status-change-confirmation
description: confirmations use the design system
enforcement: no-native-dialogs
---
`,
    // A terminal picker that declares its own confirm() is not calling the browser's.
    'src/lib/picker.js': 'function confirm() { return true; }\nfunction onKey() { confirm(); }\n',
    // A scanner storing the pattern, and a test holding UI source as a string.
    'src/lib/scanner.js': 'const LEAKS = [/\\balert\\s*\\(/, /\\bconfirm\\s*\\(/];\nmodule.exports = { LEAKS };\n',
    'src/lib/fixture.js': 'const sample = "if (confirm(1)) alert(2)";\nmodule.exports = { sample };\n'
  });

  const report = await runRulesCheck({ args: [dir], options: { json: true, suppressExitCode: true }, logger: silent });

  assert.equal(report.total, 0, `expected no findings, got: ${JSON.stringify(report.findings)}`);
});

test('--rule scopes the run to a single governance document', async () => {
  const dir = await scaffold({
    '.aioson/rules/source-code-language-convention.md': LANGUAGE_RULE,
    '.aioson/rules/status-change-confirmation.md': `---
name: status-change-confirmation
description: confirmations use the design system
enforcement: no-native-dialogs
---
`,
    'servidor/api.ts': 'export function criarBloco() { return 1; }\n'
  });

  const report = await runRulesCheck({
    args: [dir],
    options: { json: true, suppressExitCode: true, rule: 'status-change-confirmation' },
    logger: silent
  });

  assert.equal(report.rules_enforced.length, 1);
  assert.equal(report.rules_enforced[0].name, 'status-change-confirmation');
  assert.equal(report.total, 0);
});

test('the naming rule reaches compiled languages, not just the web half of a project', async () => {
  // A Tauri, mobile, or backend-heavy project keeps most of its source in a
  // language audit:code has no scanners for. Exempting it would leave half the
  // codebase outside a rule that is explicitly about every identifier.
  const dir = await scaffold({
    '.aioson/rules/source-code-language-convention.md': LANGUAGE_RULE,
    'src-tauri/src/servidor.rs': [
      'pub fn criar_bloco() -> i32 { 1 }',
      'pub struct EstadoPalco { pub id: i32 }',
      'pub fn create_block() -> i32 { 2 }'
    ].join('\n'),
    'android/app/Draft.kt': 'class GerenciadorDeRascunho { }\n',
    'db/schema.sql': 'CREATE TABLE blocks (id INT);\n'
  });

  const report = await runRulesCheck({ args: [dir], options: { json: true, suppressExitCode: true }, logger: silent });

  const flagged = report.findings.map((f) => f.message).join('\n');
  assert.match(flagged, /criar_bloco/, 'Rust snake_case must be read');
  assert.match(flagged, /EstadoPalco/, 'a Rust struct must be read');
  assert.match(flagged, /Gerenciador/, 'Kotlin must be read');
  assert.doesNotMatch(flagged, /create_block/, 'the English neighbour stays clean');
});

// ─── legacy projects ──────────────────────────────────────────────────────────

const LEGACY_TREE = {
  '.aioson/rules/source-code-language-convention.md': LANGUAGE_RULE,
  'servidor/rotas/blocos.ts': 'export function criarBloco() { return 1; }\n',
  'servidor/rotas/pautas.ts': 'export function salvarPauta() { return 2; }\n',
  'servidor/rotas/acervo.ts': 'export function carregarAcervo() { return 3; }\n',
  'servidor/rotas/trajeto.ts': 'export function gravarPasso() { return 4; }\n'
};

test('a tree built against another convention is diagnosed, not blamed on the slice', async () => {
  const dir = await scaffold(LEGACY_TREE);

  const report = await runRulesCheck({ args: [dir], options: { json: true, suppressExitCode: true }, logger: silent });

  assert.equal(report.ok, false, 'it is still a violation');
  assert.ok(report.divergence, 'a pervasive violation must be reported as an established convention');
  assert.equal(report.divergence.established, true);
  assert.equal(report.divergence.offending_files, 4);
});

test('a new violation in an otherwise clean tree is drift, not an established convention', async () => {
  const dir = await scaffold({
    '.aioson/rules/source-code-language-convention.md': LANGUAGE_RULE,
    'src/server/routes/blocks.ts': 'export function createBlock() { return 1; }\n',
    'src/server/routes/agendas.ts': 'export function saveAgenda() { return 2; }\n',
    'src/server/routes/archive.ts': 'export function loadArchive() { return 3; }\n',
    'src/server/routes/drafts.ts': 'export function criarRascunho() { return 4; }\n'
  });

  const report = await runRulesCheck({ args: [dir], options: { json: true, suppressExitCode: true }, logger: silent });

  assert.equal(report.ok, false);
  assert.equal(report.divergence, null, 'one bad file out of four is drift, not a project convention');
});

test('--baseline accepts existing debt while every new violation still blocks', async () => {
  const dir = await scaffold(LEGACY_TREE);

  const written = await runRulesCheck({ args: [dir], options: { json: true, suppressExitCode: true, baseline: true }, logger: silent });
  assert.equal(written.ok, true);
  assert.ok(written.baseline.written);
  assert.ok(written.baseline.accepted > 0);

  // The same legacy tree is now quiet — the debt is counted, not forgiven.
  const quiet = await runRulesCheck({ args: [dir], options: { json: true, suppressExitCode: true }, logger: silent });
  assert.equal(quiet.ok, true);
  assert.equal(quiet.total, 0);
  assert.ok(quiet.accepted_debt > 0, 'accepted debt stays visible in every report');
  assert.equal(quiet.rules_enforced[0].ok, true);

  // A new Portuguese identifier in the very same legacy file still blocks.
  await fs.writeFile(
    path.join(dir, 'servidor/rotas/blocos.ts'),
    'export function criarBloco() { return 1; }\nexport function salvarRascunho() { return 5; }\n',
    'utf8'
  );
  const regressed = await runRulesCheck({ args: [dir], options: { json: true, suppressExitCode: true }, logger: silent });
  assert.equal(regressed.ok, false);
  assert.equal(regressed.total, 1);
  assert.match(regressed.findings[0].message, /salvarRascunho/);
});

test('baseline identity survives edits that move a line', async () => {
  const dir = await scaffold({
    '.aioson/rules/source-code-language-convention.md': LANGUAGE_RULE,
    'servidor/api.ts': 'export function criarBloco() { return 1; }\n'
  });
  await runRulesCheck({ args: [dir], options: { json: true, suppressExitCode: true, baseline: true }, logger: silent });

  // Same violation, three lines lower: a line-keyed baseline would call it new.
  await fs.writeFile(
    path.join(dir, 'servidor/api.ts'),
    '// header\n// header\n// header\nexport function criarBloco() { return 1; }\n',
    'utf8'
  );
  const report = await runRulesCheck({ args: [dir], options: { json: true, suppressExitCode: true }, logger: silent });

  assert.equal(report.total, 0, 'moving a line must not resurrect accepted debt');
});

test('discovery reads every governance surface and every checker is well formed', async () => {
  const dir = await scaffold({
    '.aioson/rules/a.md': '---\nname: rule-a\nenforcement: source-code-language\n---\n',
    '.aioson/rules/_archived/old.md': '---\nname: archived\nenforcement: source-code-language\n---\n',
    '.aioson/docs/b.md': '---\nname: doc-b\n---\n',
    '.aioson/skills/process/c/SKILL.md': '---\nname: skill-c\n---\n'
  });

  const documents = await discoverGovernance(dir);
  const names = documents.map((doc) => doc.name);
  assert.deepEqual(names.sort(), ['doc-b', 'rule-a', 'skill-c']);
  assert.equal(documents.find((doc) => doc.name === 'rule-a').enforcement, 'source-code-language');
  assert.equal(documents.find((doc) => doc.name === 'doc-b').enforcement, null);

  for (const [id, enforcer] of Object.entries(ENFORCERS)) {
    assert.equal(enforcer.id, id, `${id} must carry its own id`);
    assert.equal(typeof enforcer.run, 'function');
    assert.ok(enforcer.summary && enforcer.summary.length > 10, `${id} needs a human-readable summary`);
    // `file` checkers also judge a pending edit in memory (context:guard);
    // a new checker must decide which one it is.
    assert.ok(['file', 'tree'].includes(enforcer.reads), `${id} must declare reads: 'file' | 'tree'`);
  }
});
