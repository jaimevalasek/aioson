'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const {
  CANONICAL_LENSES,
  OPERATIONAL_CONCERNS,
  analyzeFeatureCompleteness,
  detectRichSurfaces,
  findingsThroughStage,
  parseFirstMarkdownTable
} = require('../src/lib/feature-completeness');

async function makeTmpDir() {
  return fs.mkdtemp(path.join(os.tmpdir(), 'aioson-feature-completeness-'));
}

async function writeFile(dir, relPath, content) {
  const full = path.join(dir, relPath);
  await fs.mkdir(path.dirname(full), { recursive: true });
  await fs.writeFile(full, content, 'utf8');
}

function capabilityMatrix({ operational = false, omitLens = null } = {}) {
  return CANONICAL_LENSES
    .filter((lens) => lens !== omitLens)
    .map((lens, index) => {
      if (lens === 'primary-outcome') {
        return '| CAP-demo-run | primary-outcome | required | The requested outcome is observable | REQ-demo-01 | AC-demo-01 |';
      }
      if (operational && lens === 'operational-management') {
        return '| CAP-demo-run | operational-management | required | Operators manage the records through the declared surface | REQ-demo-02 | AC-demo-02 |';
      }
      return `| feature-wide | ${lens} | not_applicable | ${lens} does not apply because this bounded fixture has no such surface | — | — |`;
    })
    .join('\n');
}

function operationalRows({ onlyList = false } = {}) {
  const concerns = onlyList ? ['list'] : OPERATIONAL_CONCERNS;
  return concerns.map((concern) => {
    const required = ['create', 'list', 'detail', 'update', 'management-surface', 'input-validation', 'empty-state', 'loading-state', 'error-state', 'permissions'].includes(concern);
    if (required) {
      return `| Record | ${concern} | required | ${concern} behavior is observable on the management surface | CAP-demo-run | REQ-demo-02 | AC-demo-02 |`;
    }
    return `| Record | ${concern} | not_applicable | ${concern} is intentionally unnecessary for this bounded record set | — | — | — |`;
  }).join('\n');
}

async function writeCompleteFeature(dir, options = {}) {
  const operational = Boolean(options.operational);
  const surface = operational
    ? [
        '',
        '## Operational Surface Map',
        '',
        '| Object | Parent / owner | Required actions | Management surface | Empty / error states | Permissions / roles |',
        '|---|---|---|---|---|---|',
        '| Record | Workspace | create, list, detail, update | record page and editor | empty collection and validation error | workspace operator |'
      ].join('\n')
    : '';
  await writeFile(dir, '.aioson/context/project.context.md', '---\nclassification: SMALL\n---\n');
  await writeFile(dir, '.aioson/context/prd-demo.md', [
    '---',
    'classification: SMALL',
    'feature_completeness: required',
    ...(operational ? ['operational_surfaces: [records]'] : []),
    '---',
    '# Demo PRD',
    '',
    '## Feature Capability Map',
    '',
    '| CAP | Promised outcome | Actor / trigger | Scope decision | Rationale |',
    '|---|---|---|---|---|',
    '| CAP-demo-run | A user can complete the requested demo outcome | User starts the feature | required | This is the approved feature promise |',
    surface
  ].join('\n'));
  const operationalMatrix = operational
    ? [
        '',
        '## Operational Decision Matrix',
        '',
        '| Object | Concern | Decision | Rationale | CAP | REQ | AC |',
        '|---|---|---|---|---|---|---|',
        operationalRows({ onlyList: options.onlyList })
      ].join('\n')
    : '';
  await writeFile(dir, '.aioson/context/requirements-demo.md', [
    '# Requirements',
    '',
    'REQ-demo-01 and AC-demo-01 define the primary observable outcome.',
    ...(operational ? ['REQ-demo-02 and AC-demo-02 define operational behavior.'] : []),
    '',
    '## Feature Capability Matrix',
    '',
    '| CAP | Lens | Decision | Behavior / rationale | REQ | AC |',
    '|---|---|---|---|---|---|',
    capabilityMatrix({ operational, omitLens: options.omitLens }),
    operationalMatrix
  ].join('\n'));
  await writeFile(dir, '.aioson/context/design-doc-demo.md', [
    '# Design',
    '',
    '## Implementation Leverage Matrix',
    '',
    '| CAP | Concern | Decision | Evidence | Target |',
    '|---|---|---|---|---|',
    '| CAP-demo-run | implementation pattern | reuse | package.json and src/demo.js were inspected | src/demo.js |'
  ].join('\n'));
  await writeFile(dir, '.aioson/context/implementation-plan-demo.md', [
    '---',
    'status: approved',
    '---',
    '# Plan',
    '',
    '## Capability Delivery Plan',
    '',
    '| CAP | Phase | Files | Verification |',
    '|---|---|---|---|',
    '| CAP-demo-run | 1 | src/demo.js, tests/demo.test.js | npm test -- demo |'
  ].join('\n'));
}

test('generic completeness activates for substantive SMALL features and rejects document-presence-only artifacts', async () => {
  const dir = await makeTmpDir();
  await writeFile(dir, '.aioson/context/project.context.md', '---\nclassification: SMALL\n---\n');
  await writeFile(dir, '.aioson/context/prd-demo.md', '# PRD\nUsers can submit a request, receive a durable result, retry failures, and inspect the final status.');
  await writeFile(dir, '.aioson/context/requirements-demo.md', '# Requirements\nREQ-demo-01: submit the request.\nAC-demo-01: a result is returned.');

  const analysis = await analyzeFeatureCompleteness(dir, 'demo');

  assert.equal(analysis.applicable, true);
  assert.equal(analysis.ok, false);
  assert.ok(analysis.findings.some((item) => item.check === 'feature_capability_map_missing'));
  assert.ok(analysis.findings.some((item) => item.check === 'feature_capability_matrix_missing'));
  assert.ok(analysis.findings.some((item) => item.check === 'implementation_leverage_matrix_missing'));
  assert.ok(analysis.findings.some((item) => item.check === 'capability_delivery_plan_missing'));
});

test('generic completeness passes a fully traced non-operational feature', async () => {
  const dir = await makeTmpDir();
  await writeCompleteFeature(dir);

  const analysis = await analyzeFeatureCompleteness(dir, 'demo');

  assert.equal(analysis.applicable, true);
  assert.equal(analysis.ok, true, analysis.findings.map((item) => item.message).join('\n'));
  assert.equal(analysis.summary.required_capabilities, 1);
  assert.equal(analysis.summary.lens_decisions, CANONICAL_LENSES.length);
});

test('SMALL feature may reuse the project design baseline and keep its leverage matrix in readiness', async () => {
  const dir = await makeTmpDir();
  await writeCompleteFeature(dir);
  await fs.rm(path.join(dir, '.aioson/context/design-doc-demo.md'));
  await writeFile(dir, '.aioson/context/design-doc.md', '# Stable project design baseline\n');
  await writeFile(dir, '.aioson/context/readiness-demo.md', [
    '---',
    'design_baseline: .aioson/context/design-doc.md',
    'design_delta: none',
    '---',
    '# Readiness',
    '',
    '## Implementation Leverage Matrix',
    '',
    '| CAP | Concern | Decision | Evidence | Target |',
    '|---|---|---|---|---|',
    '| CAP-demo-run | implementation pattern | reuse | package.json and src/demo.js were inspected | src/demo.js |'
  ].join('\n'));

  const analysis = await analyzeFeatureCompleteness(dir, 'demo');

  assert.equal(analysis.ok, true, analysis.findings.map((item) => item.message).join('\n'));
  assert.equal(analysis.leverage_matrix.rows.length, 1);
});

test('execution structure validates concrete planned paths without requiring expensive execution evidence', async () => {
  const dir = await makeTmpDir();
  await writeCompleteFeature(dir);
  await writeFile(dir, 'src/demo.js', 'module.exports = {}\n');

  const analysis = await analyzeFeatureCompleteness(dir, 'demo', {
    includeExecutionStructure: true
  });
  const executionFindings = findingsThroughStage(analysis, 'execution')
    .filter((item) => item.stage === 'execution');

  assert.ok(executionFindings.some((item) =>
    item.check === 'capability_delivery_files_missing' && item.message.includes('tests/demo.test.js')));
  assert.equal(
    executionFindings.some((item) => item.check === 'implementation_ledger_not_ready'),
    false,
    'structural precheck must not demand ledger/harness evidence before commands run'
  );
});

test('every generic completeness lens requires an explicit decision', async () => {
  const dir = await makeTmpDir();
  await writeCompleteFeature(dir, { omitLens: 'failure-recovery' });

  const analysis = await analyzeFeatureCompleteness(dir, 'demo');
  const finding = analysis.findings.find((item) => item.check === 'feature_completeness_lenses_missing');

  assert.ok(finding);
  assert.match(finding.message, /failure-recovery/);
});

test('a CAP-scoped lens decision does not silently cover another required capability', async () => {
  const dir = await makeTmpDir();
  await writeCompleteFeature(dir);
  const prdPath = path.join(dir, '.aioson/context/prd-demo.md');
  const requirementsPath = path.join(dir, '.aioson/context/requirements-demo.md');
  const designPath = path.join(dir, '.aioson/context/design-doc-demo.md');
  const planPath = path.join(dir, '.aioson/context/implementation-plan-demo.md');
  await fs.writeFile(prdPath, (await fs.readFile(prdPath, 'utf8')).replace(
    '| CAP-demo-run | A user can complete the requested demo outcome | User starts the feature | required | This is the approved feature promise |',
    '| CAP-demo-run | A user can complete the requested demo outcome | User starts the feature | required | This is the approved feature promise |\n| CAP-demo-export | A user can export the result | User requests an export | required | Second approved promise |'
  ));
  await fs.writeFile(requirementsPath, (await fs.readFile(requirementsPath, 'utf8'))
    .replace(
      '| CAP-demo-run | primary-outcome | required | The requested outcome is observable | REQ-demo-01 | AC-demo-01 |',
      '| CAP-demo-run | primary-outcome | required | The requested outcome is observable | REQ-demo-01 | AC-demo-01 |\n| CAP-demo-export | primary-outcome | required | The export is observable | REQ-demo-03 | AC-demo-03 |'
    )
    .replace(
      '| feature-wide | failure-recovery | not_applicable',
      '| CAP-demo-run | failure-recovery | not_applicable'
    ));
  await fs.writeFile(designPath, (await fs.readFile(designPath, 'utf8')).replace(
    '| CAP-demo-run | implementation pattern | reuse | package.json and src/demo.js were inspected | src/demo.js |',
    '| CAP-demo-run | implementation pattern | reuse | package.json and src/demo.js were inspected | src/demo.js |\n| CAP-demo-export | export pattern | reuse | src/export.js was inspected | src/export.js |'
  ));
  await fs.writeFile(planPath, (await fs.readFile(planPath, 'utf8')).replace(
    '| CAP-demo-run | 1 | src/demo.js, tests/demo.test.js | npm test -- demo |',
    '| CAP-demo-run | 1 | src/demo.js, tests/demo.test.js | npm test -- demo |\n| CAP-demo-export | 2 | src/export.js, tests/export.test.js | npm test -- export |'
  ));

  const analysis = await analyzeFeatureCompleteness(dir, 'demo');
  const finding = analysis.findings.find((item) => item.check === 'feature_capability_lenses_missing');

  assert.ok(finding);
  assert.match(finding.message, /CAP-demo-export/);
  assert.match(finding.message, /failure-recovery/);
});

test('operational management is conditional and rejects the list-only symptom without defining product management as the base contract', async () => {
  const dir = await makeTmpDir();
  await writeCompleteFeature(dir, { operational: true, onlyList: true });

  const analysis = await analyzeFeatureCompleteness(dir, 'demo');
  const finding = analysis.findings.find((item) => item.check === 'operational_decisions_missing');

  assert.ok(finding);
  assert.match(finding.message, /create/);
  assert.match(finding.message, /input-validation/);
  assert.match(finding.message, /pagination/);
});

test('a complete operational extension passes and does not change the generic capability trace', async () => {
  const dir = await makeTmpDir();
  await writeCompleteFeature(dir, { operational: true });

  const analysis = await analyzeFeatureCompleteness(dir, 'demo');

  assert.equal(analysis.ok, true, analysis.findings.map((item) => item.message).join('\n'));
  assert.equal(analysis.operational_matrix.rows.length, OPERATIONAL_CONCERNS.length);
  assert.equal(analysis.product_map.requiredCaps[0], 'CAP-demo-run');
});

test('stage slicing prevents a later missing plan from contaminating the product gate', async () => {
  const dir = await makeTmpDir();
  await writeCompleteFeature(dir);
  await fs.rm(path.join(dir, '.aioson/context/implementation-plan-demo.md'));

  const analysis = await analyzeFeatureCompleteness(dir, 'demo');

  assert.equal(findingsThroughStage(analysis, 'product').length, 0);
  assert.ok(findingsThroughStage(analysis, 'plan').some((item) => item.check === 'capability_delivery_plan_missing'));
});

test('execution closure is opt-in so planning and lightweight work do not pay the ledger cost', async () => {
  const dir = await makeTmpDir();
  await writeCompleteFeature(dir);

  const planning = await analyzeFeatureCompleteness(dir, 'demo');
  const execution = await analyzeFeatureCompleteness(dir, 'demo', { includeExecution: true });

  assert.equal(planning.ok, true);
  assert.equal(planning.stage_findings.execution.length, 0);
  assert.ok(execution.stage_findings.execution.some((item) => item.check === 'capability_delivery_files_missing'));
  assert.ok(execution.stage_findings.execution.some((item) => item.check === 'implementation_ledger_not_ready'));
});

test('MICRO work without a formal capability contract stays lightweight even at execution', async () => {
  const dir = await makeTmpDir();
  await writeFile(dir, '.aioson/context/project.context.md', '---\nclassification: MICRO\n---\n');
  await writeFile(dir, '.aioson/context/prd-demo.md', '# PRD\nRename one bounded CLI label.');

  const analysis = await analyzeFeatureCompleteness(dir, 'demo', { includeExecution: true });

  assert.equal(analysis.applicable, false);
  assert.equal(analysis.ok, true);
  assert.equal(analysis.stage_findings.execution.length, 0);
});

test('markdown table parser keeps escaped pipes inside cells', () => {
  const table = parseFirstMarkdownTable([
    '| CAP | Outcome |',
    '|---|---|',
    '| CAP-1 | allow a \\| b switch |',
    '| CAP-2 | plain |'
  ].join('\n'));

  assert.deepEqual(table.rows, [['CAP-1', 'allow a | b switch'], ['CAP-2', 'plain']]);
  assert.deepEqual(table.malformed, []);
});

test('markdown table parser reports rows whose cell count diverges instead of dropping them silently', () => {
  const table = parseFirstMarkdownTable([
    '| CAP | Outcome |',
    '|---|---|',
    '| CAP-1 | ok |',
    '| CAP-2 | too | many | cells |',
    '',
    '| CAP-3 | prose after blank line ends the table |'
  ].join('\n'));

  assert.deepEqual(table.rows, [['CAP-1', 'ok']]);
  assert.deepEqual(table.malformed, [{ row: 2, cells: 4 }]);
});

test('a malformed capability map row fails closed instead of vanishing from the gate', async () => {
  const dir = await makeTmpDir();
  await writeCompleteFeature(dir);
  const prdPath = path.join(dir, '.aioson/context/prd-demo.md');
  const prd = await fs.readFile(prdPath, 'utf8');
  await fs.writeFile(prdPath, prd.replace(
    '| CAP-demo-run |',
    '| CAP-demo-broken | too | many | cells | here | now |\n| CAP-demo-run |'
  ), 'utf8');

  const analysis = await analyzeFeatureCompleteness(dir, 'demo');
  const finding = analysis.findings.find((item) => item.check === 'feature_capability_map_row_malformed');

  assert.equal(analysis.ok, false);
  assert.ok(finding);
  assert.match(finding.message, /row 1 has 6 cell\(s\), expected 5/);
  assert.ok(analysis.product_map.requiredCaps.includes('CAP-demo-run'));
});

test('workspace collaboration surfaces activate the contract while technical workspace prose does not', () => {
  assert.deepEqual(
    detectRichSurfaces('The product has workspaces with members, an invite flow and a workspace switcher.'),
    ['workspace']
  );
  assert.deepEqual(
    detectRichSurfaces('O produto tem workspaces com membros e convites para a equipe.'),
    ['workspace']
  );
  assert.deepEqual(
    detectRichSurfaces('The prompt path must stay inside the project workspace root directory.'),
    []
  );
});
