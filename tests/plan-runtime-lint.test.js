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
  assert.equal(nested.line, 3, 'the continuation of a field belongs to the field');
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

test('runtime_without_walkthrough names the phases whose Runtime line points at no walkthrough', () => {
  const without = (plan) => lintPlanRuntime(plan).warnings.filter((warning) => warning.code === 'runtime_without_walkthrough');
  const plan = (...lines) => lines.join('\n');
  const phaseAt = (n, runtime) => `## Phase ${n} — Step\n- Verification: node --test\n- Runtime: ${runtime}\n- Done when: it shows on screen.\n`;

  const found = without(plan(phaseAt(1, '`npm run smoke -- --flow=orders`'), phaseAt(2, 'run the checkout flow by hand'), phaseAt(3, 'aioson browser:run . --script=.aioson/qa/walkthroughs/orders/list.json')));
  assert.equal(found.length, 1, 'one decision, one warning');
  assert.equal(found[0].count, 2);
  assert.deepEqual(found[0].phases, [1, 2]);
  assert.equal(found[0].line, 3);
  assert.match(found[0].message, /2 `Runtime` line\(s\) \(Phase 1, 2\) name no walkthrough/);
  assert.match(found[0].message, /no walkthrough: <reason>/);

  assert.deepEqual(without(phaseAt(1, 'aioson browser:run . --script=x.json')), []);
  assert.deepEqual(without(phaseAt(1, 'replay .aioson/qa/walkthroughs/orders/list.json on the served build')), []);
  assert.deepEqual(without(phaseAt(1, '`node scripts/measure-paint.js` (no walkthrough: it reads paint timing)')), [], 'a stated reason answers it');
  assert.deepEqual(without(phaseAt(1, 'no browser in this phase')), []);
  assert.deepEqual(without(phaseAt(1, 'sem navegador nesta fase')), []);
  assert.deepEqual(without('## Phase 1 — Step\n- Verification: node --test\n'), [], 'no Runtime line, nothing to name');
  assert.deepEqual(without(`## Rules\n\n- Every \`Runtime\` line is a walkthrough under \`.aioson/qa/walkthroughs/orders/\`.\n\n${phaseAt(1, 'the orders flow')}`), [], 'a plan-wide rule answers for its lines');

  const nested = without('## Phase 1 — Step\n- Runtime:\n  - aioson browser:run . --script=x.json\n');
  assert.deepEqual(nested, [], 'the continuation is part of the field');
});

test('Gate C carries runtime_without_walkthrough as an advisory too', async (t) => {
  const silent = { log() {}, error() {} };
  const root = await project(t, '\n## Phase 1 — Save\n- Verification: node --test\n- Runtime: `node scripts/flow.js`\n- Done when: the saved result shows on screen.\n');
  const result = await runGateCheck({ args: [root], options: { json: true, feature: 'demo', gate: 'C' }, logger: silent });
  assert.equal(result.result, 'PASS');
  const evidence = result.evidence.find((item) => item.type === 'plan_runtime');
  assert.equal(evidence.ok, true);
  assert.deepEqual(evidence.warnings.map((warning) => warning.code), ['runtime_without_walkthrough']);
});

test('a sentence that forbids the server does not charge it', () => {
  for (const line of [
    'do not use `next dev` here; browser:run against the built app',
    'never `next dev`; browser:run against the built app',
    'não usar `next dev`; browser:run contra o build servido',
    'nunca em `next dev`; browser:run contra o app compilado',
    'browser:run on the built app instead of `next dev`',
    'browser:run; `next dev` must not be running',
    'Stop `next dev` before the build, then browser:run on the build'
  ]) assert.deepEqual(onDev(phase(`- Runtime: ${line}`)), [], line);
  // Near the word is not enough: this one uses the server.
  assert.equal(onDev(phase('- Runtime: click stop on `next dev`')).length, 1);
  assert.equal(devServerCommand('click stop on `next dev`'), 'next dev');
});

test('a phase answers for itself with a production run on any of its lines', () => {
  assert.deepEqual(onDev(phase('- Runtime: iterate on `next dev`', '  then `next start` + browser:run')), [], 'the continuation is the same proof');
  assert.deepEqual(onDev(phase('- Runtime: `next dev` for the fast loop', '- Runtime: `next start` + browser:run for the proof')), []);
  assert.deepEqual(onDev(phase('- Runtime: `next dev` + browser:run', '- Verification: `npm run build && next start` + browser:run')), []);
  // Another phase does not answer for this one.
  const two = [phase('- Runtime: `next dev` + browser:run'), '## Phase 2 — Later', '- Runtime: `next start` + browser:run', ''].join('\n');
  assert.deepEqual(onDev(two).map((warning) => warning.phase), [1]);
  // A plan-wide rule answers only for itself, whatever the phases or the evidence say.
  const rule = ['## Repository evidence', '- Production entry point: `npm run build && npm start`', '', '## Rules', '- **App up (`Runtime` lines).** `next dev` in the background.', '', '## Phase 21 — End', '- Runtime: `next start` and the smoke', ''].join('\n');
  assert.deepEqual(onDev(rule).map((warning) => warning.line), [5]);
});

test('prose about the runtime is not a rule about the Runtime lines', () => {
  assert.deepEqual(onDev('## Phase 1 — x\n\nRuntime errors in the `next dev` overlay are ignored in this doc.\n'), []);
  assert.deepEqual(onDev('## Notes\n\nRuntime is Node 20. Local work uses `npm run dev`.\n'), []);
  assert.deepEqual(onDev(phase('- Runtime: the `vite` bundle served by nginx + browser:run')), []);
  assert.deepEqual(onDev(phase('- Runtime: `vite build`, served by nginx + browser:run')), []);
  assert.equal(onDev('## Rules\n\nThe linhas `Runtime` usam `npm run dev`.\n').length, 1);
  assert.equal(onDev('## Rules\n\nAll Runtime lines start from `npm run dev`.\n').length, 1);
});

test('the shapes a dev server hides in still count', () => {
  assert.equal(devServerCommand('pnpm --filter web dev'), 'pnpm --filter web dev');
  assert.equal(devServerCommand('turbo run dev'), 'turbo run dev');
  assert.equal(devServerCommand('turbo dev'), 'turbo dev');
  assert.equal(onDev(phase('- Runtime: `docker compose up -d db && next dev` + browser:run')).length, 1, 'a database in docker is no production build');
  assert.equal(onDev(phase('- Runtime:', '', '```bash', 'next dev', '```')).length, 1, 'a fence right below the field is the field');
  assert.deepEqual(onDev('```bash\n- Runtime: next dev\n```\n'), [], 'a fence with the whole field in it is an example');
  assert.deepEqual(onDev(phase('- Runtime: `npm run build`')), []);
  assert.equal(devServerCommand('npm test -- dev'), null);
});

test('a walkthrough is asked only of a line that shows a browser', () => {
  const without = (plan) => lintPlanRuntime(plan).warnings.filter((warning) => warning.code === 'runtime_without_walkthrough');
  for (const line of ['`python -m tool --help` exits 0', '`go run ./cmd/api` and `curl -f localhost:8080/health`', '`cargo run --release -- --version`', '`node bin/tool.js --help`', '`pytest tests/e2e`', 'none', 'n/a']) {
    assert.deepEqual(without(phase(`- Runtime: ${line}`)), [], line);
  }
  for (const line of ['`next start` + `node scripts/smoke.mjs`', '`next start`, `node scripts/smoke.mjs` until none fail', '`node scripts/check.js` on the orders page', '`npm run smoke -- --flow=orders`', 'run the checkout flow by hand', 'a tela de pedidos mostra o total']) {
    assert.equal(without(phase(`- Runtime: ${line}`)).length, 1, line);
  }
  const smokeOnly = phase('- Runtime: `next start` + `node scripts/smoke.mjs`');
  assert.deepEqual(without(phase('- Runtime: `next dev` for the fast loop', '- Runtime: `next start` + browser:run for the proof')), [], 'a walkthrough on one line of the phase answers for the phase');
  assert.deepEqual(without(phase('- Runtime: `node dist/cli.js --help`')), [], 'a built CLI is no web server');
  const forbidding = ['## Rules', '', '- `Runtime` lines never use .aioson/qa/walkthroughs/ because it stops at login', '', smokeOnly].join('\n');
  assert.equal(without(forbidding).length, 1, 'a rule that forbids the instrument answers for nothing');
  const namingOnly = ['## Rules', '', '- `Runtime` lines never use browser:run because it stops at login', '', smokeOnly].join('\n');
  assert.equal(without(namingOnly).length, 1);
});
