'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const { lintPlanRuntime, devServerCommand } = require('../src/lib/plan-runtime-lint');
const { runGateCheck } = require('../src/commands/gate-check');
const { approveAndSealSheldonReview } = require('./helpers/feature-evidence');

const onDev = (plan) => lintPlanRuntime(plan).warnings.filter((warning) => warning.code === 'runtime_on_dev_server');
const phase = (...lines) => ['## Phase 1 — Orders', '- CAP/AC: CAP-1, AC-1', ...lines, '- Done when: orders appear on screen.', ''].join('\n');

test('devServerCommand names the usual dev servers and leaves the build tools alone', () => {
  for (const [text, command] of [
    ['`npx next dev --port 4000`', 'next dev'],
    ['`npm run dev`', 'npm run dev'],
    ['pnpm dev', 'pnpm dev'],
    ['yarn dev:web', 'yarn dev:web'],
    ['`vite`', 'vite'],
    ['npx vite --host', 'vite'],
    ['php artisan serve', 'php artisan serve'],
    ['python manage.py runserver', 'manage.py runserver'],
    ['uvicorn app:main --reload', 'uvicorn app:main --reload'],
    ['ng serve', 'ng serve']
  ]) assert.equal(devServerCommand(text), command, text);

  for (const text of ['vite build', 'vite preview', 'vite.config.ts', 'vitest run', 'vite-plugin-pwa', 'Vite is the bundler', 'npm run build', 'next start', 'the devserver docs', 'uvicorn app:main']) {
    assert.equal(devServerCommand(text), null, text);
  }
  // Named to be stopped, not to be used.
  for (const text of ['`npm run build` exige `next dev` parado', 'Stop `next dev` before the build', 'with `next dev` stopped']) {
    assert.equal(devServerCommand(text), null, text);
  }
});

test('runtime_on_dev_server fires on the lines that set the proof, and only without a production run beside them', () => {
  assert.equal(onDev(phase('- Runtime: with `npx next dev` up, run the orders flow')).length, 1);
  assert.equal(onDev(phase('- Verification: npm test, then `npm run dev` and open /orders')).length, 1);
  assert.equal(onDev(phase('- **Runtime:** `vite` and the orders flow')).length, 1);
  assert.equal(onDev('## Repository evidence\n- Production entry point: `npm run dev`\n').length, 1);

  const warning = onDev(['intro', '## Execution rules', '- **App up (`Runtime` lines).** `npx next dev --port 4000` in the background. Stop it before `npm run build`.', ''].join('\n'))[0];
  assert.equal(warning.command, 'next dev', 'a plan-wide rule sets the proof for every phase, and a build alone proves no flow');
  assert.equal(warning.line, 3);
  assert.equal(warning.phase, null);

  const nested = onDev(phase('- Runtime:', '  - start `next dev`', '  - run the flow'))[0];
  assert.equal(nested.line, 4, 'the continuation of a field belongs to the field');
  assert.equal(nested.phase, 1);
  assert.equal(onDev('## Runtime proof\n\nUse `npm run dev` for every flow.\n\n## Other\n\nUse `npm run dev` to read the docs.\n').length, 1, 'a Runtime section ends at the next heading');

  assert.deepEqual(onDev(phase('- Runtime: `next build && next start`, then the orders flow')), []);
  assert.deepEqual(onDev(phase('- Runtime: iterate on `next dev`; the same flow runs on the production build in Phase 9')), []);
  assert.deepEqual(onDev(phase('- Runtime: `vite preview`, then the flow')), []);
  assert.deepEqual(onDev(phase('- Runtime: no browser in this phase. `npm run build` needs `next dev` stopped.')), []);
});

test('a line that does not set the proof is not charged', () => {
  assert.deepEqual(onDev('## Objective\nThe app runs on `next dev` today.\n'), [], 'prose elsewhere orders nothing');
  assert.deepEqual(onDev('| CAP-1 | modify | `npm run dev` starts it | src/a.js | Runtime change |\n'), [], 'a table cell describes, it does not order');
  assert.deepEqual(onDev('- Uses `RuntimePublicationRequest` under `next dev`\n'), [], 'an identifier is not the field');
  assert.deepEqual(onDev('```bash\n- Runtime: next dev\n```\n'), [], 'a fence is an example');
  assert.deepEqual(lintPlanRuntime(null).warnings, []);
  assert.deepEqual(lintPlanRuntime('').warnings, []);
});

const PRD = `---\nclassification: SMALL\nfeature_completeness: required\nproduct_scope: approved\nprd_ready: approved\nsheldon_review: pending\nprototype: null\nprototype_status: none\nprototype_feature: null\n---\n# Demo\n\n## Feature Capability Map\n\n| CAP | Promised outcome | Actor / trigger | Scope decision | Rationale |\n|---|---|---|---|---|\n| CAP-demo-01 | User sees saved result | User submits | required | Core promise |\n\n## Current System Fit\n\n| CAP | Existing behavior / evidence | Fit decision | Required product delta |\n|---|---|---|---|\n| CAP-demo-01 | No existing behavior after inspecting package.json | new | Add the saved result through the real app |\n\n## Acceptance Criteria\n\n| AC | CAP | Observable behavior | Evidence |\n|---|---|---|---|\n| AC-demo-01 | CAP-demo-01 | Saved result appears | automated integration test |\n`;
const PLAN = (extra) => `---\nstatus: pending\n---\n# Plan\n\n## Engineering Controls\n\n| Concern | Evidence / trigger | Planned control | Verification | Recovery |\n|---|---|---|---|---|\n| compatibility | package.json establishes the current Node runtime | Preserve the existing module contract | node --test | Revert the additive change; no persistent data |\n\n## Implementation Delta\n\n| CAP | Action | Existing evidence | Exact paths | Required change |\n|---|---|---|---|---|\n| CAP-demo-01 | create | Inspected the nearest boundary from package.json | src/demo.js, tests/demo.test.js | Add implementation and AC-linked coverage |\n\n## Capability Delivery Plan\n\n| CAP | Phase | Files | Verification |\n|---|---|---|---|\n| CAP-demo-01 | 1 | src/demo.js, tests/demo.test.js | node --test |\n${extra}`;

async function project(t, extra) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'aioson-plan-runtime-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const write = async (rel, body) => {
    await fs.mkdir(path.dirname(path.join(root, rel)), { recursive: true });
    await fs.writeFile(path.join(root, rel), body, 'utf8');
  };
  await write('.aioson/context/project.context.md', '---\nclassification: SMALL\n---\n');
  await write('.aioson/context/prd-demo.md', PRD);
  await approveAndSealSheldonReview(root);
  await write('.aioson/context/implementation-plan-demo.md', PLAN(extra));
  return root;
}

test('Gate C carries the warning as advisory evidence and the result does not move', async (t) => {
  const silent = { log() {}, error() {} };
  const clean = await runGateCheck({ args: [await project(t, '')], options: { json: true, feature: 'demo', gate: 'C' }, logger: silent });
  assert.equal(clean.result, 'PASS');
  assert.equal(clean.evidence.some((item) => item.type === 'plan_runtime'), false);

  const root = await project(t, '\n- **App up (`Runtime` lines).** `npm run dev` on port 4000.\n');
  const warned = await runGateCheck({ args: [root], options: { json: true, feature: 'demo', gate: 'C' }, logger: silent });
  assert.equal(warned.result, 'PASS', 'an advisory never blocks');
  assert.deepEqual(warned.missing, clean.missing);
  const evidence = warned.evidence.find((item) => item.type === 'plan_runtime');
  assert.equal(evidence.ok, true);
  assert.equal(evidence.advisory, true);
  assert.equal(evidence.warnings[0].code, 'runtime_on_dev_server');

  const lines = [];
  const human = await runGateCheck({ args: [root], options: { feature: 'demo', gate: 'C' }, logger: { log: (line) => lines.push(String(line)), error() {} } });
  assert.equal(human.result, 'PASS');
  assert.ok(lines.some((line) => /\[runtime_on_dev_server\] line \d+: `npm run dev` is the runtime proof/.test(line)), lines.join('\n'));
});

test('the planner reference and the phase loop say a dev server is not the production path', async () => {
  const root = path.resolve(__dirname, '..');
  const reference = await fs.readFile(path.join(root, 'template/.aioson/skills/process/aioson-spec-driven/references/planner.md'), 'utf8');
  assert.match(reference, /A dev server \(`next dev`, `vite`, `npm run dev`\) is not the production path/);
  assert.match(reference, /runtime_on_dev_server/);
  for (const rel of ['template/.aioson/docs/dev/phase-loop.md', '.aioson/docs/dev/phase-loop.md']) {
    assert.match(await fs.readFile(path.join(root, rel), 'utf8'), /A dev server is not the production path/);
  }
});
