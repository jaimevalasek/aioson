'use strict';

/**
 * The measured scale of a plan — the number the single-DEV/orchestrated
 * question is asked on. Before it existed, the only trigger for that question
 * was the roles file being unlocked, which nothing created: a 77-file plan in
 * four chained phases went to one context with nobody asked.
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  DEFAULT_SPLIT_MIN_FILES,
  DEFAULT_UNIT_MAX_ACS,
  DEFAULT_UNIT_MAX_FILES,
  classifySurface,
  formatPlanScale,
  formatRecommendation,
  formatSplitProposal,
  formatUnit,
  measurePlanScale,
  proposeSplit,
  recommendExecution,
  resolveExecutionChoice,
  splitMinFiles,
  unitCeiling
} = require('../src/lib/plan-scale');

function plan({ frontmatter = ['feature: big', 'status: approved'], lanes = false, delta, delivery, sequence, phases = [] } = {}) {
  return [
    '---', ...frontmatter, '---',
    '# Implementation Plan — big',
    '',
    '## Implementation Delta',
    '| CAP | Action | Existing evidence | Exact paths | Required change |',
    '|---|---|---|---|---|',
    ...delta,
    '',
    '## Capability Delivery Plan',
    '| CAP | Phase | Files | Verification |',
    '|---|---|---|---|',
    ...delivery,
    '',
    ...(lanes ? [
      '## Development execution lanes',
      '| Lane | Exact write paths | Integration owner |',
      '|---|---|---|',
      '| server | src/server/** | dev |',
      '| client | src/client/** | dev |',
      ''
    ] : []),
    ...(sequence ? [
      '## Execution Sequence',
      '| Phase | Wave | Files | Scope | Depends on | Done when |',
      '|---|---|---|---|---|---|',
      ...sequence,
      ''
    ] : []),
    ...phases.flatMap((title) => [`## ${title}`, '- User-visible outcome: something', ''])
  ].join('\n');
}

// The incident's shape: many files, chained phases, nothing in parallel.
const BIG = plan({
  delta: [
    '| CAP-big-a | create | none | src/server/routes/a.ts, src/server/services/a.ts, src/server/repositories/a.ts, tests/integration/a.test.ts | endpoints |',
    '| CAP-big-a | modify | src/server/routes/loadRoutes.ts | src/server/routes/loadRoutes.ts | register |',
    '| CAP-big-b | create | none | src/client/components/B.tsx, src/client/components/BEditor.tsx, src/client/workspace/useB.ts, tests/unit/b.test.ts | screen |',
    '| CAP-big-b | modify | src/client/pages/Home.tsx | src/client/pages/Home.tsx, src/client/styles/shell.css | wire |',
    '| CAP-big-c | create | none | src/domain/c.ts, src/domain/cLayout.ts, tests/unit/c.test.ts | domain |',
    '| CAP-big-c | modify | src/domain/c.ts | src/domain/c.ts, src/server/services/a.ts | projection |',
    '| CAP-big-d | reuse | src/server/routes/play.route.ts | src/server/routes/play.route.ts | contract |'
  ],
  delivery: [
    '| CAP-big-a | 1 | src/server/routes/a.ts, src/server/services/a.ts, src/server/repositories/a.ts, src/server/routes/loadRoutes.ts, tests/integration/a.test.ts | npm test -- a |',
    '| CAP-big-b | 2 | src/client/components/B.tsx, src/client/components/BEditor.tsx, src/client/workspace/useB.ts, src/client/pages/Home.tsx, src/client/styles/shell.css, tests/unit/b.test.ts | npm test -- b |',
    '| CAP-big-c | 3 | src/domain/c.ts, src/domain/cLayout.ts, tests/unit/c.test.ts | npm test -- c |',
    '| CAP-big-d | 4 | src/server/routes/play.route.ts | npm test -- play |'
  ],
  sequence: [
    '| 1 | 1 | src/server/routes/a.ts, src/server/services/a.ts, src/server/repositories/a.ts, src/server/routes/loadRoutes.ts, tests/integration/a.test.ts | CAP-big-a | — | tests pass |',
    '| 2 | 2 | src/client/components/B.tsx, src/client/components/BEditor.tsx, src/client/workspace/useB.ts, src/client/pages/Home.tsx, src/client/styles/shell.css, tests/unit/b.test.ts | CAP-big-b | 1 | tests pass |',
    '| 3 | 3 | src/domain/c.ts, src/domain/cLayout.ts, tests/unit/c.test.ts | CAP-big-c | 2 | tests pass |',
    '| 4 | 4 | src/server/routes/play.route.ts | CAP-big-d | 3 | tests pass |'
  ],
  phases: ['Phase 1 — Endpoints', 'Phase 2 — Screen', 'Phase 3 — Domain', 'Phase 4 — Contract']
});

test('plan-scale: the incident shape measures as a split candidate — many files, chained phases, nothing in parallel, areas as raw material', () => {
  const scale = measurePlanScale(BIG);
  assert.equal(scale.files, 15, 'distinct files across delta, delivery and sequence — a path repeated in three tables counts once');
  assert.equal(scale.create, 11);
  assert.equal(scale.modify, 5, 'a file that is created in one row and modified in another counts under both actions');
  assert.equal(scale.phases, 4);
  assert.equal(scale.waves, 4);
  assert.equal(scale.parallel_phases, 0, 'every wave is a solo wave: the plan was written for one context');
  assert.equal(scale.split_candidate, true);
  assert.deepEqual(scale.threshold, { min_files: DEFAULT_SPLIT_MIN_FILES });
  assert.deepEqual(scale.areas.slice(0, 3), [
    { prefix: 'src/client', files: 5 },
    { prefix: 'src/server', files: 5 },
    { prefix: 'src/domain', files: 2 }
  ], 'areas sort by size, then by name — ties are stable');
  assert.deepEqual(scale.sources, { delta: 17, delivery: 4, sequence: 4 }, 'delta counts path entries (row × path), the other two count rows');
  assert.ok(scale.bytes > 1000);
  assert.equal(formatPlanScale(scale), '15 file(s) (11 new) in 4 phase(s), 4 wave(s), 0 in parallel');
});

test('plan-scale: a small plan is below the floor; the floor moves with the environment; parallel phases are counted per shared wave', () => {
  const small = plan({
    delta: ['| CAP-s-a | create | none | src/api/orders.ts, tests/api/orders.test.ts | endpoints |', '| CAP-s-b | modify | src/app.ts | src/app.ts | wire |'],
    delivery: ['| CAP-s-a | 1 | src/api/orders.ts, tests/api/orders.test.ts | npm test |', '| CAP-s-b | 2 | src/app.ts | npm test |'],
    sequence: ['| 1 | 1 | src/api/orders.ts, tests/api/orders.test.ts | CAP-s-a | — | ok |', '| 2 | 1 | src/ui/Orders.tsx | CAP-s-b | — | ok |', '| 3 | 2 | src/app.ts | CAP-s-b | 1, 2 | ok |']
  });
  const scale = measurePlanScale(small);
  assert.equal(scale.files, 4);
  assert.equal(scale.split_candidate, false);
  assert.equal(scale.waves, 2);
  assert.equal(scale.parallel_phases, 2, 'phases 1 and 2 share wave 1');
  assert.equal(scale.phases, 3, 'phases come from the delivery plan AND the execution sequence');
  assert.equal(measurePlanScale(small, { minFiles: 4 }).split_candidate, true);
  assert.equal(splitMinFiles({ AIOSON_EXECUTION_SPLIT_MIN_FILES: '4' }), 4);
  assert.equal(splitMinFiles({ AIOSON_EXECUTION_SPLIT_MIN_FILES: '0' }), DEFAULT_SPLIT_MIN_FILES);
  assert.equal(splitMinFiles({ AIOSON_EXECUTION_SPLIT_MIN_FILES: 'many' }), DEFAULT_SPLIT_MIN_FILES);
  assert.equal(splitMinFiles({}), DEFAULT_SPLIT_MIN_FILES);
  assert.equal(formatPlanScale(null), 'no plan');
});

test('plan-scale: Portuguese headings, Fase columns and phase headings measure the same; placeholders and globs never count as files', () => {
  const pt = [
    '---', 'feature: grande', 'status: approved', '---',
    '# Plano de Implementação — grande',
    '',
    '## Delta de Implementação',
    '| CAP | Ação | Evidência existente | Caminhos exatos | Mudança requerida |',
    '|---|---|---|---|---|',
    '| CAP-g-a | criar | nenhuma | src/servidor/rota.ts, src/servidor/servico.ts, ... | rota |',
    '| CAP-g-b | modificar | src/app.ts | src/app.ts, src/ui/**, - | fiação |',
    '',
    '## Plano de Entrega de Capacidades',
    '| CAP | Fase | Arquivos | Verificação |',
    '|---|---|---|---|',
    '| CAP-g-a | 1 | src/servidor/rota.ts, src/servidor/servico.ts | npm test |',
    '| CAP-g-b | 2 | src/app.ts | npm test |',
    '',
    '## Fase 1 — A rota responde',
    '- Resultado: algo',
    '',
    '## Fase 2 — A tela liga',
    '- Resultado: algo',
    '',
    '### Fase 3 — Regressão',
    ''
  ].join('\n');
  const scale = measurePlanScale(pt);
  assert.equal(scale.files, 3, '`...`, `-` and `src/ui/**` are not files');
  assert.equal(scale.phases, 3, 'phase headings count even without a delivery row');
  assert.equal(scale.waves, 0, 'no Execution Sequence: no waves');
  assert.deepEqual(scale.areas, [{ prefix: 'src/servidor', files: 2 }, { prefix: 'src', files: 1 }]);
  assert.deepEqual(measurePlanScale(''), {
    files: 0, create: 0, modify: 0, phases: 0, waves: 0, parallel_phases: 0, bytes: 0, areas: [],
    split_candidate: false, threshold: { min_files: DEFAULT_SPLIT_MIN_FILES }, sources: { delta: 0, delivery: 0, sequence: 0 },
    surfaces: { backend: 0, frontend: 0, shared: 0, tests: { backend: 0, frontend: 0, shared: 0 }, files: [], two_sided: false, shared_test_root: false },
    units: [], parallelism: { waves: 0, max_concurrent_units: 0, serial_chain: 0, critical_path_processes: 0, serial: false }, seams: [],
    ceiling: { max_files: DEFAULT_UNIT_MAX_FILES, max_acs: DEFAULT_UNIT_MAX_ACS }
  });
  assert.equal(measurePlanScale(null).files, 0);
});

test('plan-scale: a client.* file names no surface by itself, a client/ directory still does', () => {
  assert.equal(classifySurface('apps/core/src/pm2-wrapper/client.ts').surface, 'shared');
  assert.equal(classifySurface('apps/core/src/api/client.ts').surface, 'backend', 'a backend directory still decides');
  assert.equal(classifySurface('src/client/client.ts').surface, 'frontend', 'a client/ directory still decides');
  assert.equal(classifySurface('src/server.js').surface, 'backend', 'unambiguous stems keep deciding');
});

test('plan-scale: the recorded execution choice — the lanes table means orchestrated, the frontmatter records single, anything else is unrecorded', () => {
  assert.deepEqual(resolveExecutionChoice(BIG), { choice: null, source: null });
  assert.deepEqual(resolveExecutionChoice(plan({ lanes: true, delta: [], delivery: [] })), { choice: 'orchestrated', source: 'lanes_table' });
  assert.deepEqual(resolveExecutionChoice(plan({ frontmatter: ['feature: big', 'status: approved', 'execution: single'], delta: [], delivery: [] })), { choice: 'single', source: 'frontmatter' });
  assert.deepEqual(resolveExecutionChoice(plan({ frontmatter: ['feature: big', 'execution: `orchestrated`'], delta: [], delivery: [] })), { choice: 'orchestrated', source: 'frontmatter' });
  assert.deepEqual(resolveExecutionChoice(plan({ frontmatter: ['feature: big', 'execution: parallel'], delta: [], delivery: [] })), { choice: null, source: null }, 'an unknown value records nothing');
  assert.deepEqual(resolveExecutionChoice('# no frontmatter\nexecution: single\n'), { choice: null, source: null }, 'the key only counts inside the frontmatter');
  // The table wins over a contradicting frontmatter line: the lanes are the executable declaration.
  assert.deepEqual(resolveExecutionChoice(plan({ frontmatter: ['feature: big', 'execution: single'], lanes: true, delta: [], delivery: [] })), { choice: 'orchestrated', source: 'lanes_table' });
});

// A one-surface plan in strictly serial waves, above the floor: nothing measurable to cut on.
const SERIAL_ONE_SURFACE = plan({
  delta: [
    `| CAP-flat-a | create | none | ${Array.from({ length: 13 }, (_, i) => `src/server/mod${i}.ts`).join(', ')} | modules |`
  ],
  delivery: [
    `| CAP-flat-a | 1 | ${Array.from({ length: 7 }, (_, i) => `src/server/mod${i}.ts`).join(', ')} | npm test |`,
    `| CAP-flat-a | 2 | ${Array.from({ length: 6 }, (_, i) => `src/server/mod${i + 7}.ts`).join(', ')} | npm test |`
  ],
  sequence: [
    `| 1 | 1 | ${Array.from({ length: 7 }, (_, i) => `src/server/mod${i}.ts`).join(', ')} | CAP-flat-a | — | ok |`,
    `| 2 | 2 | ${Array.from({ length: 6 }, (_, i) => `src/server/mod${i + 7}.ts`).join(', ')} | CAP-flat-a | — | ok |`
  ]
});

test('plan-scale: the recommendation is measured — the incident was the asking model reading "locked" as "not advisable" and recommending one context for a two-surface split candidate', () => {
  // Below the floor: single, on the number.
  const small = recommendExecution(measurePlanScale(plan({
    delta: ['| CAP-s-a | create | none | src/api/orders.ts, tests/api/orders.test.ts | endpoints |'],
    delivery: ['| CAP-s-a | 1 | src/api/orders.ts, tests/api/orders.test.ts | npm test |']
  })));
  assert.equal(small.choice, 'single');
  assert.match(small.reasons[0], /below the 12-file split floor/);

  // The incident shape: split candidate, two surfaces — orchestrated, and every reason is a number.
  const big = recommendExecution(measurePlanScale(BIG), { proposal: proposeSplit(BIG) });
  assert.equal(big.choice, 'orchestrated');
  assert.match(big.reasons[0], /15 files ≥ the 12-file floor for one context/);
  assert.ok(big.reasons.some((reason) => /two surfaces \(backend \d+ · frontend \d+\)/.test(reason)), 'the surface cut is a named reason');
  assert.ok(big.reasons.some((reason) => /split proposal cuts \d+ row\(s\) into surface lanes/.test(reason)), 'the proposal is a named reason when given');
  assert.equal(formatRecommendation(big), `orchestrated — ${big.reasons.join('; ')}`);

  // Split candidate with one surface and strictly serial waves: single — nothing to cut on yet.
  const flat = recommendExecution(measurePlanScale(SERIAL_ONE_SURFACE), { proposal: proposeSplit(SERIAL_ONE_SURFACE) });
  assert.equal(flat.choice, 'single');
  assert.match(flat.reasons[0], /13 files ≥ 12/);
  assert.match(flat.reasons[0], /nothing to cut on yet/);

  // One surface, but two rows already share a wave: a real cut exists — orchestrated.
  const parallelPlan = plan({
    delta: [
      `| CAP-flat-a | create | none | ${Array.from({ length: 13 }, (_, i) => `src/server/mod${i}.ts`).join(', ')} | modules |`
    ],
    delivery: [
      `| CAP-flat-a | 1 | ${Array.from({ length: 13 }, (_, i) => `src/server/mod${i}.ts`).join(', ')} | npm test |`
    ],
    sequence: [
      `| 1a | 1 | ${Array.from({ length: 7 }, (_, i) => `src/server/mod${i}.ts`).join(', ')} | CAP-flat-a | — | ok |`,
      `| 1b | 1 | ${Array.from({ length: 6 }, (_, i) => `src/server/mod${i + 7}.ts`).join(', ')} | CAP-flat-a | — | ok |`
    ]
  });
  const parallel = recommendExecution(measurePlanScale(parallelPlan));
  assert.equal(parallel.choice, 'orchestrated');
  assert.ok(parallel.reasons.some((reason) => /2 units already share a wave/.test(reason)));

  // No plan measured: single, and the formatter never throws on nothing.
  assert.deepEqual(recommendExecution(measurePlanScale('')), { choice: 'single', reasons: ['no plan measured'] });
  assert.deepEqual(recommendExecution(null), { choice: 'single', reasons: ['no plan measured'] });
  assert.equal(formatRecommendation(null), 'none');
});
