'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', 'template', '.aioson');

test('Neo uses a compact read-only router with lazy operational modules', async () => {
  const [kernel, legacy, diagnostics, maintenance, workspaceMaintenance] = await Promise.all([
    fs.readFile(path.join(ROOT, 'agents', 'neo.md'), 'utf8'),
    fs.readFile(path.join(ROOT, 'docs', 'neo', 'legacy-routing-reference.md'), 'utf8'),
    fs.readFile(path.join(ROOT, 'docs', 'neo', 'state-diagnostics.md'), 'utf8'),
    fs.readFile(path.join(ROOT, 'docs', 'neo', 'runtime-storage.md'), 'utf8'),
    fs.readFile(path.resolve(__dirname, '..', '.aioson', 'docs', 'neo', 'runtime-storage.md'), 'utf8')
  ]);

  // Neo is activated on every work item by hosts; the kernel stays under
  // 9,000 chars and its activation reads are bounded (see the next test).
  assert.equal(kernel.length < 9000, true, `Neo kernel is ${kernel.length} chars`);
  assert.equal(legacy.length > 20000, true, 'legacy routing intelligence was not preserved');

  for (const module of ['state-diagnostics.md', 'runtime-storage.md', 'feature-lifecycle.md', 'routing-matrix.md', 'agent-catalog.md']) {
    assert.match(kernel, new RegExp(module.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }

  assert.match(kernel, /Never load every module/i);
  assert.match(kernel, /legacy-routing-reference\.md.*non-executable history/is);
  assert.match(kernel, /5 behavior files[\s\S]*8 total paths[\s\S]*2 existing modules[\s\S]*Simple Plan/i);
  assert.match(kernel, /actionable Neural Chain items[\s\S]*recommend `@dev`[\s\S]*not a global pause/i);
  assert.match(diagnostics, /authoritative state is `chain_work_items`/i);
  assert.match(diagnostics, /claim items atomically/i);
  assert.match(kernel, /Current QA PASS is terminal/i);
  assert.match(kernel, /Do not write files|Never write files/i);
  assert.match(kernel, /does not persist a handoff/i);
  assert.equal(workspaceMaintenance, maintenance);
  assert.match(maintenance, /runtime:prune .*--dry-run/i);
  assert.match(maintenance, /Never run direct SQL/i);
  assert.match(maintenance, /--force.*forbidden/i);
  assert.match(kernel, /---routing---[\s\S]*agent:[\s\S]*confidence:[\s\S]*reason:[\s\S]*clarification:/i);
});

test('Neo answers from three bounded reads and never contradicts the engine on a bound feature', async () => {
  // Measured on a real MEDIUM desktop project: the former activation (pulse,
  // four diagnostics, context:brief with recall, preflight, harness:status,
  // routing module) cost ~27,000 input tokens and ten tool calls before the
  // first answer, and the pulse said "@dev" while workflow:status said
  // "@sheldon" (review stale after project.context.md changed). The host
  // refused the divergent dispatch; small models ended without the block.
  const [kernel, diagnostics, matrix, workspaceKernel, workspaceDiagnostics, workspaceMatrix] = await Promise.all([
    fs.readFile(path.join(ROOT, 'agents', 'neo.md'), 'utf8'),
    fs.readFile(path.join(ROOT, 'docs', 'neo', 'state-diagnostics.md'), 'utf8'),
    fs.readFile(path.join(ROOT, 'docs', 'neo', 'routing-matrix.md'), 'utf8'),
    fs.readFile(path.resolve(__dirname, '..', '.aioson', 'agents', 'neo.md'), 'utf8'),
    fs.readFile(path.resolve(__dirname, '..', '.aioson', 'docs', 'neo', 'state-diagnostics.md'), 'utf8'),
    fs.readFile(path.resolve(__dirname, '..', '.aioson', 'docs', 'neo', 'routing-matrix.md'), 'utf8')
  ]);
  assert.equal(workspaceKernel, kernel);
  assert.equal(workspaceDiagnostics, diagnostics);
  assert.equal(workspaceMatrix, matrix);

  // The three reads, in the kernel itself — no module needed to answer.
  assert.match(kernel, /`\.aioson\/context\/project-pulse\.md` \(file\)/);
  assert.match(kernel, /`aioson workflow:status \. --json`[^\n]*owns the route/);
  assert.match(kernel, /`aioson hygiene:scan \.` \(text/);
  // The planning gate runs only for a concrete request, rules only.
  assert.match(kernel, /context:brief \. --agent=neo --mode=planning[^\n]*--no-semantic --no-recall --json/);
  assert.match(kernel, /`should_load` and `related` are not Neo's to read/);
  // Heavy reads are demand-driven, never part of activation.
  assert.match(kernel, /Only when asked about them: `aioson harness:status[^\n]*`aioson preflight[^\n]*`aioson memory:summary/);
  assert.doesNotMatch(kernel, /feature:trace/);
  // The engine owns a bound route; disagreement is confidence, not a new agent.
  assert.match(kernel, /`agent:` is `state\.next`, without exception/);
  assert.match(kernel, /never changes the agent: it sets `confidence: medium`/);
  assert.match(kernel, /--feature=<slug>/);
  assert.match(kernel, /`@briefing` for raw thinking, external sources or a visual surface without an approved prototype/);
  assert.match(kernel, /a project rule in `must_load` wins over this default/);
  // The block is the host's contract: present on every answer, once.
  assert.match(kernel, /End every answer — also when a diagnostic failed or the request is unclear — with exactly one block/);
  assert.match(kernel, /`high` = `workflow:status` and the pulse agree/);

  // The modules say the same thing.
  assert.doesNotMatch(diagnostics, /run these in parallel/i);
  assert.match(diagnostics, /`aioson workflow:status \. --json`/);
  assert.match(diagnostics, /Only for history questions[^\n]*memory:summary/);
  assert.match(diagnostics, /1\. The engine: `workflow:status`/);
  assert.match(diagnostics, /never override the engine/);
  assert.match(matrix, /never to override the engine/);
  assert.match(matrix, /New feature request: raw thinking, external sources, or a visual surface without an approved prototype \| `@briefing`/);
});

test('Neo cleans the feature lifecycle only through feature:triage, never by hand or by force', async () => {
  const [kernel, lifecycle, workspaceLifecycle] = await Promise.all([
    fs.readFile(path.join(ROOT, 'agents', 'neo.md'), 'utf8'),
    fs.readFile(path.join(ROOT, 'docs', 'neo', 'feature-lifecycle.md'), 'utf8'),
    fs.readFile(path.resolve(__dirname, '..', '.aioson', 'docs', 'neo', 'feature-lifecycle.md'), 'utf8')
  ]);
  assert.equal(workspaceLifecycle, lifecycle);
  assert.match(kernel, /feature-lifecycle\.md/);
  assert.match(kernel, /never `--force`/);
  assert.match(lifecycle, /aioson feature:triage \. --json/);
  assert.match(lifecycle, /--dry-run/);
  assert.match(lifecycle, /Never pass `--force`/);
  assert.match(lifecycle, /Never edit `features\.md`/);
  assert.match(lifecycle, /--include-active/);
});

test('Neo frees the disk aioson takes only through storage:triage, owner paths only by name', async () => {
  const [kernel, storage, diagnostics] = await Promise.all([
    fs.readFile(path.join(ROOT, 'agents', 'neo.md'), 'utf8'),
    fs.readFile(path.join(ROOT, 'docs', 'neo', 'runtime-storage.md'), 'utf8'),
    fs.readFile(path.join(ROOT, 'docs', 'neo', 'state-diagnostics.md'), 'utf8')
  ]);
  assert.match(kernel, /disk only through `aioson storage:triage`/);
  assert.match(kernel, /`disk_footprint` findings get one line offering the guarded cleanup in `runtime-storage\.md`/);
  assert.match(diagnostics, /disk footprint/i);
  assert.match(storage, /aioson storage:triage \. --json/);
  assert.match(storage, /--apply --dry-run/);
  assert.match(storage, /--remove=<path>/);
  assert.match(storage, /Never delete these files by hand/);
  assert.match(storage, /hygiene-retention\.md/);
});
