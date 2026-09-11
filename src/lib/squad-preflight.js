'use strict';

/**
 * Squad preflight — the deterministic loading map behind `aioson squad:preflight`.
 *
 * The @squad kernel used to carry a 17-row conditional table the model had to
 * evaluate by hand on every activation (and often misread: eval-gate skipped on
 * a standard-lane create, package-contract loaded for an export). The table now
 * lives here as data; the kernel runs one command and loads exactly what it
 * returns, with byte counts so the token cost of the activation is a number.
 *
 * Nothing here reads model output. Inputs are the operation the agent derived,
 * the delivery lane, the squad mode, and a handful of boolean signals from the
 * request. Output is the module list, the task file, the done-gate commands
 * for that lane, and a small digest of the package contract.
 */

const fs = require('node:fs');
const path = require('node:path');

const OPERATIONS = [
  'default-create', 'design', 'create', 'validate', 'eval', 'pilot', 'analyze',
  'extend', 'repair', 'refresh', 'export', 'investigate', 'plan',
  'configure-output', 'session-run'
];
const LANES = ['quick', 'standard', 'premium', 'regulated'];
const MODES = ['content', 'software', 'research', 'mixed'];
const SIGNALS = [
  'regulated', 'customer-facing', 'content', 'workflow', 'session', 'genomes',
  'sources', 'quality-gate', 'refusal', 'new-domain'
];

const DOCS = '.aioson/docs/squad';
const TASKS = '.aioson/tasks';
const SKILL_ROUTER = '.aioson/skills/squad/SKILL.md';

const TASK_BY_OPERATION = {
  'default-create': ['squad-design.md', 'squad-create.md', 'squad-validate.md'],
  design: ['squad-design.md'],
  create: ['squad-create.md'],
  validate: ['squad-validate.md'],
  eval: ['squad-eval.md'],
  pilot: ['squad-pilot.md'],
  analyze: ['squad-analyze.md'],
  extend: ['squad-extend.md'],
  repair: ['squad-repair.md'],
  refresh: ['squad-refresh.md'],
  export: ['squad-export.md'],
  investigate: ['squad-investigate.md'],
  plan: ['squad-execution-plan.md'],
  'configure-output': ['squad-output-config.md'],
  'session-run': []
};

// Package-contract digest: the numbers a create/validate run needs without
// re-reading the 14 KB contract. Pinned against the doc by tests.
const PACKAGE_DIGEST = {
  root: '.aioson/squads/{slug}/',
  requiredFiles: [
    'agents/agents.md', 'agents/orquestrador.md', 'squad.manifest.json', 'squad.md',
    'docs/design-doc.md', 'docs/readiness.md'
  ],
  requiredDirs: ['agents/', 'workers/', 'workflows/', 'checklists/', 'skills/', 'templates/', 'docs/'],
  externalRoots: ['output/{slug}/', 'aioson-logs/{slug}/', 'media/{slug}/'],
  executorSections: [
    'Mission', 'Quick context', 'Active genomes', 'Focus', 'Response pattern',
    'Hard constraints', 'Output contract'
  ],
  executorBytes: { floor: 600, ceiling: 16000 },
  manifestMinimum: [
    'schemaVersion', 'packageVersion', 'slug', 'name', 'mode', 'mission', 'goal',
    'visibility', 'locale_scope', 'storagePolicy', 'package', 'rules', 'skills', 'mcps',
    'subagents', 'contentBlueprints', 'executors', 'checklists', 'workflows', 'genomes'
  ],
  manifestPersistent: [
    'deliveryLane', 'analysis', 'composition', 'researchPolicy', 'evaluation',
    'genomeBindings', 'pilot', 'uiCapability', 'domainClassification', 'sourceDocs'
  ]
};

function normalizeSignals(input) {
  const out = {};
  for (const key of SIGNALS) out[key] = false;
  if (!input) return out;
  const list = Array.isArray(input) ? input : String(input).split(',');
  for (const raw of list) {
    const key = String(raw || '').trim().toLowerCase();
    if (key && Object.prototype.hasOwnProperty.call(out, key)) out[key] = true;
  }
  return out;
}

function isCreateLike(op) {
  return op === 'default-create' || op === 'create';
}

/**
 * Pure resolver: which modules an activation must load, and why.
 */
function resolveSquadPreflight({ operation, lane = 'standard', mode = 'mixed', signals = {} } = {}) {
  const op = String(operation || '').trim();
  if (!OPERATIONS.includes(op)) {
    return { ok: false, error: 'invalid_operation', operation: op, operations: OPERATIONS };
  }
  const laneKey = LANES.includes(lane) ? lane : 'standard';
  const modeKey = MODES.includes(mode) ? mode : 'mixed';
  const sig = normalizeSignals(signals);
  const deliverable = modeKey === 'software' || modeKey === 'mixed';
  const modules = [];
  const add = (file, reason) => {
    if (!modules.some((m) => m.file === file)) modules.push({ file: `${DOCS}/${file}`, reason });
  };

  if (['default-create', 'create', 'extend', 'repair', 'refresh', 'validate'].includes(op)) {
    add('package-contract.md', `operation ${op} touches the package`);
  }
  if (['default-create', 'design', 'create', 'extend', 'refresh'].includes(op)) {
    add('creation-flow.md', `operation ${op} shapes executors`);
  }
  if (op === 'default-create' || op === 'design' || sig.regulated || sig['new-domain'] || laneKey === 'regulated') {
    add('domain-classification.md', sig.regulated || laneKey === 'regulated' ? 'regulated domain' : 'new squad needs the tier gate');
  }
  if (['default-create', 'design', 'create', 'extend', 'refresh'].includes(op) || sig['customer-facing'] || sig.refusal) {
    add('domain-breadth.md', sig.refusal ? 'squad refusing adjacent requests' : 'executor breadth');
  }
  const researchOps = ['default-create', 'design', 'create', 'extend', 'analyze', 'plan', 'repair'];
  if (researchOps.includes(op) && laneKey !== 'quick') {
    add('research-loop.md', `lane ${laneKey} grounds executors in evidence`);
  }
  if (researchOps.includes(op)) {
    add('quality-lens.md', 'review scorecard');
  }
  if (op === 'eval' || sig['quality-gate'] || (laneKey !== 'quick' && (isCreateLike(op) || op === 'validate'))) {
    add('eval-gate.md', op === 'eval' ? 'operation eval' : `validate on lane ${laneKey} runs the source-grounded eval`);
  }
  if (op === 'pilot' || (isCreateLike(op) && deliverable) || (op === 'session-run' && deliverable)) {
    add('pilot-gate.md', op === 'pilot' ? 'operation pilot' : `mode ${modeKey} is deliverable-class`);
  }
  if ((['default-create', 'create', 'extend', 'refresh'].includes(op) || sig.sources) && laneKey !== 'quick') {
    add('persona-grounding.md', 'executor expertise mined from sources');
  }
  if (sig.content || (op === 'session-run' && sig.content) || op === 'configure-output') {
    add('content-output.md', 'content deliverables');
  }
  if (sig.workflow || isCreateLike(op)) {
    add('workflow-quality.md', sig.workflow ? 'workflows, gates or review loops requested' : 'create registers the default workflow');
  }
  if (sig.session || op === 'session-run' || op === 'investigate') {
    add('session-operations.md', op === 'session-run' ? 'session run' : 'session, investigation or routing');
  }
  if (sig.genomes || isCreateLike(op)) {
    add('genome-bindings.md', sig.genomes ? 'genomes in play' : 'create-phase genome pass (Step 5.5)');
  }
  const skillRouter = researchOps.includes(op) || sig.content || sig.workflow;

  const tasks = (TASK_BY_OPERATION[op] || []).map((name) => `${TASKS}/${name}`);

  const doneGate = [];
  if (op !== 'export' && op !== 'investigate' && op !== 'session-run') {
    doneGate.push('aioson squad:validate . --squad=<slug> --strict --json');
    if (laneKey === 'quick') {
      doneGate.push('# quick lane: record evaluation.deferReason instead of running squad:eval');
    } else {
      doneGate.push('aioson squad:eval . --squad=<slug> --json');
    }
    if (deliverable) {
      doneGate.push('aioson verify:artifact . --kind=squad-pilot --slug=<slug> --advisory');
    }
    doneGate.push('aioson verify:artifact . --kind=squad-package --slug=<slug> --advisory');
  }
  doneGate.push('aioson agent:done . --agent=squad --slug=<slug> --summary="Squad <slug>: <N> agents assembled"');

  return {
    ok: true,
    operation: op,
    lane: laneKey,
    mode: modeKey,
    signals: Object.keys(sig).filter((k) => sig[k]),
    tasks,
    modules,
    skillRouter: skillRouter ? SKILL_ROUTER : null,
    doneGate,
    digest: PACKAGE_DIGEST
  };
}

/**
 * Attach byte sizes from the workspace so the load is a number. Files that
 * do not exist (a project that trimmed its docs) are reported, not hidden.
 */
function measurePreflight(targetDir, resolved) {
  if (!resolved || !resolved.ok) return resolved;
  const root = path.resolve(targetDir || '.');
  const size = (rel) => {
    try { return fs.statSync(path.join(root, rel)).size; } catch { return null; }
  };
  const files = [
    { file: '.aioson/agents/squad.md', reason: 'kernel (always loaded)' },
    ...resolved.tasks.map((file) => ({ file, reason: 'task file' })),
    ...resolved.modules,
    ...(resolved.skillRouter ? [{ file: resolved.skillRouter, reason: 'skill router (then only the files it points to)' }] : [])
  ].map((entry) => ({ ...entry, bytes: size(entry.file) }));
  const totalBytes = files.reduce((sum, f) => sum + (f.bytes || 0), 0);
  return {
    ...resolved,
    load: files,
    missing: files.filter((f) => f.bytes === null).map((f) => f.file),
    totalBytes,
    estimatedTokens: Math.round(totalBytes / 4)
  };
}

module.exports = {
  OPERATIONS,
  LANES,
  MODES,
  SIGNALS,
  PACKAGE_DIGEST,
  resolveSquadPreflight,
  measurePreflight
};
