'use strict';

/**
 * Precision of the routing engine under the state every consumer is in
 * mid-feature (audit of 561d9c01 / b6bd7d59 / b2abfa14):
 *   - the active feature slug and the touched paths are context, not
 *     vocabulary: a pulse naming `customer-onboarding-board` or a path like
 *     `.github/workflows/pipeline.yml` must not pull binding rules into
 *     must_load through their words;
 *   - a hyphenated needle whose tokens collapse to one long word (`prd-edit`,
 *     `editing prd`) must appear whole — "edit" alone is not the phrase;
 *   - hyphenated task_types still match their spaced form in the task;
 *   - the guard's governance predicate covers every `.aioson/` knowledge tree;
 *   - the evals engine is honest about itself: an absent whose target is not
 *     installed is a skip, an invalid mode is an error, `--strict` with zero
 *     scenarios fails, and a frontmatter suggestion never proposes a stopword;
 *   - context:load refuses a slug that escapes the project.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const { selectContext } = require('../src/context-selector');
const { isGovernanceArtifact } = require('../src/context-guard');
const { runContextEvals } = require('../src/lib/context-evals');
const { runContextEvalsCommand } = require('../src/commands/context-evals');
const { runContextLoad } = require('../src/commands/context-load');

const ROOT = path.resolve(__dirname, '..');
const TEMPLATE = path.join(ROOT, 'template', '.aioson');
const quiet = { log() {}, error() {}, warn() {} };

async function writeFile(dir, relPath, content) {
  const absPath = path.join(dir, relPath);
  await fs.mkdir(path.dirname(absPath), { recursive: true });
  await fs.writeFile(absPath, content, 'utf8');
}

async function shippedRulesProject({ activeFeature = '(none)' } = {}) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'aioson-routing-precision-'));
  await writeFile(dir, '.aioson/context/project.context.md', [
    '---', 'framework: Node.js', 'project_type: web-app', 'load_tier: always', '---', '# Project'
  ].join('\n'));
  await writeFile(dir, '.aioson/context/project-pulse.md', `---\nactive_feature: ${activeFeature}\n---\n# Pulse`);
  await fs.cp(path.join(TEMPLATE, 'rules'), path.join(dir, '.aioson', 'rules'), { recursive: true });
  return dir;
}

function selectedPaths(result) {
  return new Set(result.selected.map((item) => item.path.replace(/\\/g, '/')));
}

test('the active feature slug is not vocabulary: a neutral task under an onboarding-board feature pulls no domain rule', async () => {
  const dir = await shippedRulesProject({ activeFeature: 'customer-onboarding-board' });
  try {
    const result = await selectContext(dir, {
      agent: 'dev',
      mode: 'executing',
      task: 'fix the typo in the README installation section',
      noSemantic: true
    });
    const selected = selectedPaths(result);
    for (const rule of ['status-flow-drag-and-drop', 'form-fields-masks-and-validation', 'status-change-confirmation']) {
      assert.equal(selected.has(`.aioson/rules/${rule}.md`), false, `${rule} fired on the feature slug`);
    }
    assert.equal(result.active_feature, 'customer-onboarding-board', 'the feature still binds feature-scoped artifacts');
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test('touched paths are not vocabulary: a workflow file does not summon the kanban rule', async () => {
  const dir = await shippedRulesProject();
  try {
    const result = await selectContext(dir, {
      agent: 'dev',
      mode: 'executing',
      task: 'fix the flaky job',
      paths: '.github/workflows/pipeline.yml',
      noSemantic: true
    });
    const selected = selectedPaths(result);
    assert.equal(selected.has('.aioson/rules/status-flow-drag-and-drop.md'), false, 'workflows/pipeline matched task_types:workflow / triggers:pipeline');
    assert.equal(selected.has('.aioson/rules/status-change-confirmation.md'), false);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test('a phrase that collapses to one long word must appear whole: prd-edit is not "edit"', async () => {
  const dir = await shippedRulesProject();
  try {
    const footer = await selectContext(dir, {
      agent: 'dev',
      mode: 'executing',
      task: 'edit the footer component copy',
      noSemantic: true
    });
    assert.equal(selectedPaths(footer).has('.aioson/rules/prd-section-ownership.md'), false, 'prd-section-ownership fired on a bare "edit"');

    const prd = await selectContext(dir, {
      agent: 'product',
      mode: 'planning',
      task: 'edit the PRD scope section for the checkout feature',
      noSemantic: true
    });
    assert.equal(selectedPaths(prd).has('.aioson/rules/prd-section-ownership.md'), true, 'editing the PRD still reaches the ownership rule');
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test('hyphenated task_types still match their spaced form in the task text', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'aioson-routing-hyphen-'));
  try {
    await writeFile(dir, '.aioson/context/project.context.md', '---\nframework: Node.js\n---\n# Project');
    await writeFile(dir, '.aioson/docs/ux-ui/direction.md', [
      '---',
      'description: visual direction module',
      'agents: [ux-ui]',
      'task_types: [visual-direction]',
      '---',
      '# Direction'
    ].join('\n'));
    const result = await selectContext(dir, {
      agent: 'ux-ui',
      mode: 'planning',
      task: 'decide the visual direction for the landing hero',
      noSemantic: true
    });
    assert.equal(selectedPaths(result).has('.aioson/docs/ux-ui/direction.md'), true);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test('every .aioson knowledge tree is governance for the guard; product surfaces are not', () => {
  for (const file of [
    '.aioson/my-agents/kanban-coach.md',
    '.aioson/squads/ops/agents/board-keeper.md',
    '.aioson/advisors/board-advisor.md',
    '.aioson/genomes/crm/genome.yaml',
    '.aioson/templates/squads/blueprint.md',
    '.aioson/tasks/squad-design.md',
    '.aioson/schemas/feature.json',
    '.aioson/config.md',
    '.aioson/constitution.md',
    '.aioson/git-guard.json',
    'C:\\repo\\.aioson\\skills\\process\\x\\SKILL.md'
  ]) {
    assert.equal(isGovernanceArtifact(file), true, `${file} is governance`);
  }
  for (const file of [
    '.aioson/briefings/checkout/prototype.html',
    '.aioson/explorations/board/identity.md',
    '.aioson/context/project.context.md',
    'src/board/Card.tsx',
    'config.md'
  ]) {
    assert.equal(isGovernanceArtifact(file), false, `${file} is a product surface`);
  }
});

async function evalsProject() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'aioson-evals-honesty-'));
  await writeFile(dir, '.aioson/context/project.context.md', '---\nframework: Node.js\nload_tier: always\n---\n# Project');
  await writeFile(dir, '.aioson/rules/board-rule.md', [
    '---', 'name: board-rule', 'description: kanban board interaction contract',
    'triggers: [kanban board]', '---', '## Required behavior', '- Confirm stage changes.'
  ].join('\n'));
  return dir;
}

test('an absent whose target is not installed is a visible skip, never a true negative', async () => {
  const dir = await evalsProject();
  try {
    await writeFile(dir, '.aioson/evals/honesty.evals.json', JSON.stringify({
      scenarios: [
        {
          name: 'renamed rule stays quiet',
          agent: 'dev',
          mode: 'executing',
          task: 'fix the typo in the README',
          absent: ['.aioson/rules/board-rule.md', '.aioson/rules/this-rule-was-renamed.md']
        }
      ]
    }));
    const report = await runContextEvals(dir, { coverage: false });
    const checks = report.results[0].checks;
    const missing = checks.find((check) => check.path === '.aioson/rules/this-rule-was-renamed.md');
    assert.equal(missing.skipped, true);
    assert.equal(missing.reason, 'target_not_installed');
    assert.equal(report.totals.negatives, 1, 'the vacuous absent is not counted as precision evidence');
    assert.equal(report.totals.skipped, 1);
    assert.equal(report.totals.failed, 0);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test('an invalid mode is a corpus error, not a silent planning run', async () => {
  const dir = await evalsProject();
  try {
    await writeFile(dir, '.aioson/evals/mode.evals.json', JSON.stringify({
      scenarios: [
        { name: 'review mode', agent: 'qa', mode: 'review', task: 'review the board', expect: ['.aioson/rules/board-rule.md'] }
      ]
    }));
    const report = await runContextEvals(dir, { coverage: false });
    assert.equal(report.totals.scenarios, 0);
    assert.ok(report.errors.some((line) => /invalid mode "review"/.test(line)), report.errors.join('\n'));
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test('--strict with a filter that matches nothing fails instead of passing vacuously', async () => {
  const dir = await evalsProject();
  try {
    await writeFile(dir, '.aioson/evals/board.evals.json', JSON.stringify({
      scenarios: [
        { name: 'board task reaches the board rule', agent: 'dev', mode: 'executing', task: 'add a kanban board column', expect: ['.aioson/rules/board-rule.md'] }
      ]
    }));
    const strict = await runContextEvalsCommand({ args: [dir], options: { strict: true, filter: 'nomatch', json: true, 'no-coverage': true }, logger: quiet });
    assert.equal(strict.ok, false);
    assert.equal(strict.exitCode, 1);
    assert.match(strict.reason, /no scenario matched --filter=nomatch/);

    const advisory = await runContextEvalsCommand({ args: [dir], options: { filter: 'nomatch', json: true, 'no-coverage': true }, logger: quiet });
    assert.equal(advisory.ok, true);
    assert.equal(advisory.exitCode, 0, 'advisory mode stays green');

    const matched = await runContextEvalsCommand({ args: [dir], options: { strict: true, filter: 'board', json: true, 'no-coverage': true }, logger: quiet });
    assert.equal(matched.ok, true);
    assert.equal(matched.totals.scenarios, 1);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test('a frontmatter suggestion never proposes a function word or a task verb', async () => {
  const dir = await evalsProject();
  try {
    await writeFile(dir, '.aioson/evals/suggest.evals.json', JSON.stringify({
      scenarios: [
        {
          name: 'missed positive',
          agent: 'dev',
          mode: 'executing',
          task: 'esse service passou de 400 linhas e preciso dividir em modulos menores para o faturamento recorrente',
          expect: ['.aioson/rules/board-rule.md']
        }
      ]
    }));
    const report = await runContextEvals(dir, { coverage: false });
    const check = report.results[0].checks[0];
    assert.equal(check.passed, false);
    const suggestion = String(check.diagnosis.suggestion);
    for (const word of ['esse', 'passou', 'linhas', 'dividir', 'service', 'modulos', 'preciso']) {
      assert.equal(new RegExp(`\\b${word}\\b`).test(suggestion), false, `${word} proposed: ${suggestion}`);
    }
    assert.match(suggestion, /faturamento|recorrente|menores/, 'the domain words survive');
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test('context:load refuses a slug that escapes the project tree', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'aioson-context-load-escape-'));
  try {
    await writeFile(dir, '.aioson/context/project.context.md', '---\nframework: Node.js\n---\n# Project');
    for (const target of ['doc:../../../etc/passwd', 'skill:../secrets', `doc:${path.join(os.tmpdir(), 'x')}`]) {
      const result = await runContextLoad({ args: [dir], options: { target, agent: 'dev', json: true }, logger: quiet });
      assert.equal(result.ok, false, target);
      assert.equal(result.reason, 'invalid_target', target);
    }
    const missing = await runContextLoad({ args: [dir], options: { target: 'doc:dev/phase-loop', agent: 'dev', json: true }, logger: quiet });
    assert.equal(missing.ok, true, 'an in-tree slug that is not on disk is still recorded (emitted anyway)');
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

// Semantic terms match at a word start, never inside one. Live: the effects
// doc surfaced on "Implementing a Stripe webhook handler … verifies
// signatures and writes to the ledger table" because `server` was found in
// `observers`, `table` in `stable`, `verifie` in `unverified` — and `that`
// counted as a term. The docs minimum (4 terms) was met by infixes alone.
test('semantic terms match word starts only: observers is not server, stable is not table, that is not vocabulary', async () => {
  const dir = await shippedRulesProject();
  const docFrontmatter = (name) => [
    '---', `name: ${name}`, `description: ${name} reference`, 'agents: [dev]',
    'modes: [executing]', 'load_tier: trigger', 'triggers: [zzz-never]', '---'
  ].join('\n');
  await writeFile(dir, '.aioson/docs/design/infix-only.md', `${docFrontmatter('infix-only')}\n# Infix\n` +
    'Release observers on teardown. Keep a stable wrapper that is implementable. Report unverified states. That is all.\n');
  await writeFile(dir, '.aioson/docs/backend/prefix-hits.md', `${docFrontmatter('prefix-hits')}\n# Prefix\n` +
    'The server verifies signatures before it writes a ledger table row.\n');
  try {
    const result = await selectContext(dir, {
      agent: 'dev',
      mode: 'executing',
      task: 'Implementing a Stripe webhook handler in the payments service that verifies signatures and writes to the ledger table.',
      paths: ['server/payments/webhook-handler.js']
    });
    const selected = selectedPaths(result);
    assert.equal(selected.has('.aioson/docs/design/infix-only.md'), false, 'infix substrings counted as semantic matches');
    assert.equal(selected.has('.aioson/docs/backend/prefix-hits.md'), true, 'word-start matches (incl. the verifie stem) still select');
    assert.equal(result.semantic.terms.includes('that'), false, '"that" entered the semantic terms');
    const hit = result.selected.find((item) => item.path.replace(/\\/g, '/') === '.aioson/docs/backend/prefix-hits.md');
    assert.match(hit.reason, /semantic:/);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

// A doc reachable only through semantic terms: a trigger no task says and a
// neutral name/description, so a selection proves the term check alone.
async function semanticOnlyProject(docs) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'aioson-semantic-terms-'));
  await writeFile(dir, '.aioson/context/project.context.md', '---\nframework: Node.js\nload_tier: always\n---\n# Project');
  for (const [relPath, body] of Object.entries(docs)) {
    await writeFile(dir, relPath, [
      '---', 'name: reference', 'description: reference notes', 'agents: [dev]',
      'modes: [executing]', 'load_tier: trigger', 'triggers: [zzz-never]', '---', body
    ].join('\n'));
  }
  return dir;
}

async function semanticSelection(dir, task) {
  const result = await selectContext(dir, { agent: 'dev', mode: 'executing', task });
  return { terms: result.semantic.terms, selected: selectedPaths(result) };
}

// Identifier parts are words, as the FTS5 prefilter reads them. unicode61
// splits `order_status` into order + status, but the term check deleted `_`
// and read `orderstatus`: since terms match at a word start, no term could
// reach the second part of an identifier — the prefilter returned the schema
// doc, the check scored it 5 and dropped it (55 before word-start matching).
test('snake_case parts are words for the term check, as for the FTS5 prefilter: order_status is order + status', async () => {
  const dir = await semanticOnlyProject({
    '.aioson/docs/backend/column-notes.md': '# Columns\nColumns: `order_id`, `order_status`, `payment_method`, `shipping_address`, `created_at`. The `order_status` enum drives the fulfillment queue.\n',
    '.aioson/docs/backend/handler-notes.md': '# Handler\nThe `stripeWebhook` handler calls `verifySignature` and `persistLedger` then `emitPaymentEvent`.\n'
  });
  try {
    const snake = await semanticSelection(dir, 'add a status filter and a method filter to the address search in the admin');
    assert.equal(snake.selected.has('.aioson/docs/backend/column-notes.md'), true, `snake_case parts unreachable; terms ${snake.terms.join(',')}`);
    // A task that names the identifiers reaches the same words.
    const named = await semanticSelection(dir, 'rename order_status and payment_method before the shipping_address migration');
    assert.ok(['order', 'status', 'payment', 'method', 'shipping', 'address'].every((term) => named.terms.includes(term)), named.terms.join(','));
    // camelCase stays one word on both sides, as unicode61 keeps it: the
    // identifier a task names still reaches the doc that names it.
    const camel = await semanticSelection(dir, 'the verifySignature and persistLedger calls in the stripeWebhook handler fire emitPaymentEvent twice');
    assert.ok(camel.terms.includes('verifysignature'), camel.terms.join(','));
    assert.equal(camel.selected.has('.aioson/docs/backend/handler-notes.md'), true, `terms ${camel.terms.join(',')}`);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

// The `-s` singular re-entered what the stop list keeps out: the check ran on
// the plural, then `estes` → `este`, `essas` → `essa`, `tests` → `test` were
// added unchecked, and an unrelated pt-BR animation doc was selected at 55 on
// "estes endpoints e essas validações" through four demonstratives.
test('a stop word never returns through its plural: estes/essas/aqueles are not vocabulary, tests→test is not re-added', async () => {
  const dir = await semanticOnlyProject({
    '.aioson/docs/design/animacoes.md': '# Animações\nEsta seção descreve efeitos visuais. Este guia cobre essa transição e esse brilho. Estes efeitos e essas curvas de easing valem para cards.\n'
  });
  try {
    const demonstratives = await semanticSelection(dir, 'Corrigir estes endpoints e essas validações do checkout de pagamento');
    assert.equal(demonstratives.selected.has('.aioson/docs/design/animacoes.md'), false, `selected through ${demonstratives.terms.join(',')}`);
    const plurals = await semanticSelection(dir, 'Ajustar esses campos, estas telas, aqueles botoes, aquelas listas, os mesmos modulos e muitos outros arquivos dos tests, features e tasks');
    for (const word of ['esses', 'esse', 'estas', 'esta', 'aqueles', 'aquele', 'aquelas', 'aquela', 'mesmos', 'mesmo', 'muitos', 'muito', 'outros', 'test', 'feature', 'task']) {
      assert.equal(plurals.terms.includes(word), false, `${word} entered the terms: ${plurals.terms.join(',')}`);
    }
    for (const word of ['campos', 'telas', 'botoes', 'listas', 'arquivos']) {
      assert.ok(plurals.terms.includes(word), `domain word ${word} lost: ${plurals.terms.join(',')}`);
    }
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

// Stop words that are domain nouns elsewhere: `todo`/`todos` (pt-BR "all")
// erased the English "todo" of a todo app, and `antes`/`depois` erased the
// before/after gallery a clinic or a renovation site is built around.
test('todo and antes/depois stay vocabulary: a todo-items doc and a before/after gallery doc are reachable', async () => {
  const dir = await semanticOnlyProject({
    '.aioson/docs/domain/items.md': '# Domain\nTodo items have a title, a due date, a priority and a done flag. Overdue todos are listed first.\n',
    '.aioson/docs/domain/galeria.md': '# Galeria\nA galeria de antes e depois mostra cada tratamento com a foto de antes e a foto de depois lado a lado.\n'
  });
  try {
    const todo = await semanticSelection(dir, 'add due date reminders to todo items');
    assert.ok(todo.terms.includes('todo'), todo.terms.join(','));
    assert.equal(todo.selected.has('.aioson/docs/domain/items.md'), true, `terms ${todo.terms.join(',')}`);
    const gallery = await semanticSelection(dir, 'montar a galeria de antes e depois dos tratamentos da clinica');
    assert.ok(gallery.terms.includes('antes') && gallery.terms.includes('depois'), gallery.terms.join(','));
    assert.equal(gallery.selected.has('.aioson/docs/domain/galeria.md'), true, `terms ${gallery.terms.join(',')}`);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});
