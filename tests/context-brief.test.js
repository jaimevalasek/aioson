'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { buildContextBrief } = require('../src/context-brief');
const { runContextBrief } = require('../src/commands/context-brief');

async function makeTmpDir() {
  return fs.mkdtemp(path.join(os.tmpdir(), 'aioson-context-brief-'));
}

async function writeFile(dir, relPath, content) {
  const full = path.join(dir, relPath);
  await fs.mkdir(path.dirname(full), { recursive: true });
  await fs.writeFile(full, content, 'utf8');
  return full;
}

async function templateRule(name) {
  return fs.readFile(path.join(__dirname, '..', 'template/.aioson/rules', name), 'utf8');
}

function logger() {
  const lines = [];
  return {
    lines,
    log(value) { lines.push(String(value)); }
  };
}

async function writeLaravelProject(dir, activeFeature = '(none)') {
  await writeFile(dir, '.aioson/context/project.context.md', [
    '---',
    'framework: Laravel',
    'project_type: web-app',
    'conversation_language: pt-BR',
    'interaction_language: pt-BR',
    '---',
    '# Project'
  ].join('\n'));
  await writeFile(dir, '.aioson/context/project-pulse.md', [
    '---',
    `active_feature: ${activeFeature}`,
    '---',
    '# Pulse'
  ].join('\n'));
}

test('context:brief builds a Laravel implementation package with rules and verification hints', async () => {
  const dir = await makeTmpDir();
  try {
    await writeLaravelProject(dir, 'checkout');
    await writeFile(dir, '.aioson/rules/source-code-language-convention.md', await templateRule('source-code-language-convention.md'));
    await writeFile(dir, '.aioson/rules/implementation-structure-and-data-access.md', await templateRule('implementation-structure-and-data-access.md'));

    const result = await buildContextBrief(dir, {
      agent: 'dev',
      mode: 'executing',
      task: 'componentizar feature Laravel e evitar query builder exposto no controller com código em inglês',
      paths: 'app/Http/Controllers/CheckoutController.php,app/Services/CheckoutService.php'
    });
    const mustLoad = result.must_load.map((item) => item.path);

    assert.equal(result.ok, true);
    assert.equal(result.intent.role, 'implementation');
    assert.equal(result.intent.stack, 'Laravel');
    assert.equal(result.confidence, 'high');
    assert.ok(result.intent.concerns.includes('english-code'));
    assert.ok(result.intent.concerns.includes('componentization'));
    assert.ok(result.intent.concerns.includes('data-access'));
    assert.ok(result.intent.concerns.includes('framework-conventions'));
    assert.equal(result.intent.concerns.includes('ui'), false);
    assert.ok(mustLoad.includes('.aioson/rules/source-code-language-convention.md'));
    assert.ok(mustLoad.includes('.aioson/rules/implementation-structure-and-data-access.md'));
    assert.ok(result.constraints.some((item) => /source code identifiers/i.test(item)));
    assert.ok(result.constraints.some((item) => /controllers.*thin/i.test(item)));
    assert.ok(result.forbidden_patterns.some((item) => /raw SQL|query builders/i.test(item)));
    assert.ok(result.suggested_structure.some((item) => /FormRequest/i.test(item)));
    assert.ok(result.verification_hints.some((item) => /DB::|raw SQL|query-builder/i.test(item)));
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test('context:brief builds a pentester package from security and data-access signals', async () => {
  const dir = await makeTmpDir();
  try {
    await writeLaravelProject(dir, 'uploads');
    await writeFile(dir, '.aioson/rules/security-baseline.md', await templateRule('security-baseline.md'));
    await writeFile(dir, '.aioson/rules/implementation-structure-and-data-access.md', await templateRule('implementation-structure-and-data-access.md'));

    const result = await buildContextBrief(dir, {
      agent: 'pentester',
      mode: 'executing',
      task: 'security review upload auth endpoint for SQL injection and ownership bypass',
      paths: 'app/Http/Controllers/UploadController.php'
    });
    const mustLoad = result.must_load.map((item) => item.path);

    assert.equal(result.intent.role, 'security-review');
    assert.equal(result.intent.operation, 'security-review');
    assert.ok(result.intent.concerns.includes('security'));
    assert.ok(result.intent.concerns.includes('data-access'));
    assert.ok(mustLoad.includes('.aioson/rules/security-baseline.md'));
    assert.ok(result.review_criteria.some((item) => /threat model|attack surfaces|probes/i.test(item)));
    assert.ok(result.verification_hints.some((item) => /Probe|threat model|attack surfaces/i.test(item)));
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test('context:brief gives sheldon PRD enrichment criteria without implementation scope', async () => {
  const dir = await makeTmpDir();
  try {
    await writeLaravelProject(dir, 'checkout');
    await writeFile(dir, '.aioson/rules/security-baseline.md', await templateRule('security-baseline.md'));
    await writeFile(dir, '.aioson/context/prd-checkout.md', [
      '---',
      'feature: checkout',
      '---',
      '# PRD Checkout',
      '',
      'Payment flow with auth and tenant boundaries.'
    ].join('\n'));

    const result = await buildContextBrief(dir, {
      agent: 'sheldon',
      mode: 'planning',
      feature: 'checkout',
      task: 'enriquecer PRD checkout com critérios de aceitação para auth, payment e tenant boundaries'
    });
    const mustLoad = result.must_load.map((item) => item.path);

    assert.equal(result.intent.role, 'prd-enrichment');
    assert.equal(result.intent.operation, 'prd-enrichment');
    assert.ok(result.intent.concerns.includes('security'));
    assert.ok(result.intent.concerns.includes('prd-enrichment'));
    assert.ok(mustLoad.includes('.aioson/rules/security-baseline.md'));
    assert.ok(result.should_load.some((item) => item.path === '.aioson/context/prd-checkout.md'));
    assert.ok(result.verification_hints.some((item) => /acceptance criteria|open questions/i.test(item)));
    assert.equal(result.gaps.some((gap) => gap.code === 'missing_paths'), false);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test('context:brief command returns JSON-compatible package', async () => {
  const dir = await makeTmpDir();
  try {
    await writeLaravelProject(dir, 'checkout');
    await writeFile(dir, '.aioson/rules/source-code-language-convention.md', await templateRule('source-code-language-convention.md'));

    const out = logger();
    const result = await runContextBrief({
      args: [dir],
      options: {
        json: true,
        agent: 'dev',
        mode: 'executing',
        task: 'implementar controller Laravel com código em inglês',
        paths: 'app/Http/Controllers/OrderController.php'
      },
      logger: out
    });

    assert.equal(result.ok, true);
    assert.equal(result.agent, 'dev');
    assert.ok(result.must_load.some((item) => item.path === '.aioson/rules/source-code-language-convention.md'));
    assert.deepEqual(out.lines, []);
    JSON.stringify(result);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});
