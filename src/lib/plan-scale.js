'use strict';

/**
 * The measured scale of an implementation plan — the numbers that decide
 * whether one context should carry it alone, and how it should be cut.
 *
 * Every gate around the orchestrated path asked one question: "is the roles
 * file unlocked?" — and nothing ever asked "how big is this plan?". A plan
 * touching 79 files in four chained phases was written for a single DEV
 * context, with no question to the owner, because the only trigger for the
 * question was a file nobody had created. This module measures the plan
 * itself: distinct files across the Implementation Delta, the Capability
 * Delivery Plan and the Execution Sequence; phases; waves and how many phases
 * actually share one; and the write areas the files fall into — raw material
 * for lanes, never lanes.
 *
 * `split_candidate` is charged on ONE number — distinct files at or above the
 * floor (12 by default, `AIOSON_EXECUTION_SPLIT_MIN_FILES` moves it).
 *
 * The second incident measured the UNIT, not the feature: an orchestrated
 * plan whose only lane owned every write path ran one whole vertical phase
 * per process — 15 of 28 files in a single context, four waves in strict
 * series, one model for everything. So the plan is also measured per
 * Execution Sequence row (`units[]`: files, ACs, the files it shares with
 * other rows, whether it exceeds the unit ceiling), as a graph
 * (`parallelism`: how many units can actually run at once, the serial chain,
 * the critical path in processes), and by SURFACE (`surfaces`: backend /
 * frontend / shared per file — the axis models are assigned on, since each
 * lane's `{lane}_dev` role carries its own host and model). `proposeSplit`
 * turns those numbers into candidate lanes and rows: raw material the planner
 * turns into tables; `recommendExecution` turns them into the measured
 * recommendation the question cites — the roles file's lock state is never an
 * input. The measurement never decides: the answer is the owner's.
 */

const {
  cleanCell,
  extractSection,
  mapColumns,
  normalizeLabel,
  parseFirstMarkdownTable,
  extractIds,
  CAP_ID_RE,
  AC_ID_RE
} = require('./feature-completeness-format');
const { parseImplementationDelta } = require('./gate-checkpoint');
const { parseExecutionWaves, groupByWave, parseDevelopmentLanes, splitPathCell } = require('../harness/plan-waves');

const DEFAULT_SPLIT_MIN_FILES = 12;
const SPLIT_MIN_FILES_ENV = 'AIOSON_EXECUTION_SPLIT_MIN_FILES';
/** One unit = one ephemeral process = one context. Above this it is two. */
const DEFAULT_UNIT_MAX_FILES = 10;
const DEFAULT_UNIT_MAX_ACS = 6;
const UNIT_MAX_FILES_ENV = 'AIOSON_EXECUTION_UNIT_MAX_FILES';
const UNIT_MAX_ACS_ENV = 'AIOSON_EXECUTION_UNIT_MAX_ACS';
const MAX_AREAS = 8;
const EXECUTION_CHOICES = ['single', 'orchestrated'];
const DELIVERY_HEADINGS = ['Capability Delivery Plan', 'Plano de Entrega de Capacidades', 'Matriz de Entrega de Capacidades'];
const PHASE_HEADING = /^#{2,4}\s+(?:phase|fase|etapa)\s+(\d+)\b/i;

// ─── surfaces: the axis models are assigned on ───────────────────────────────
const SURFACES = ['backend', 'frontend', 'shared'];
const FRONTEND_EXTENSIONS = /\.(?:html?|css|scss|sass|less|styl|tsx|jsx|vue|svelte|astro)$/i;
const BACKEND_EXTENSIONS = /\.(?:go|rs|py|rb|php|java|kt|kts|cs|fs|scala|ex|exs|sql|prisma|proto)$/i;
const FRONTEND_DIRS = new Set(['public', 'client', 'ui', 'web', 'www', 'frontend', 'front', 'components', 'pages', 'views', 'styles', 'assets', 'static', 'layouts', 'screens', 'widgets', 'e2e', 'cypress', 'playwright']);
const BACKEND_DIRS = new Set(['server', 'api', 'backend', 'domain', 'storage', 'db', 'database', 'services', 'service', 'handlers', 'controllers', 'models', 'repositories', 'repository', 'migrations', 'cmd', 'internal', 'pkg', 'http', 'routes', 'router', 'routers', 'infra', 'infrastructure', 'workers', 'jobs', 'queue', 'queues', 'data', 'sql']);
const TEST_DIRS = new Set(['test', 'tests', '__tests__', 'spec', 'specs', 'e2e', 'cypress', 'playwright']);
const TEST_FILE = /(?:\.test\.|\.spec\.|_test\.|_spec\.|^test_)|Test\.(?:java|kt|cs)$/i;

function positiveInt(raw, fallback) {
  const value = parseInt(String(raw || ''), 10);
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

function splitMinFiles(env = process.env) {
  return positiveInt(env[SPLIT_MIN_FILES_ENV], DEFAULT_SPLIT_MIN_FILES);
}

/** `{ max_files, max_acs }` — the unit ceiling, moved by the environment. */
function unitCeiling(env = process.env) {
  return {
    max_files: positiveInt(env[UNIT_MAX_FILES_ENV], DEFAULT_UNIT_MAX_FILES),
    max_acs: positiveInt(env[UNIT_MAX_ACS_ENV], DEFAULT_UNIT_MAX_ACS)
  };
}

/**
 * A cell entry that names a file: has a separator or an extension, no glob,
 * no placeholder, no directory. (`cleanCell` strips `**` as bold markup, so
 * a glob write path such as `src/ui/**` arrives here as `src/ui/` — a
 * directory, never a file.)
 */
function asFilePath(value) {
  const item = cleanCell(value).replace(/\\/g, '/').replace(/^\.\//, '').trim();
  if (!item || /^(\.{3}|-+|—|n\/a|none)$/i.test(item)) return null;
  if (/[*?{}[\]<>]/.test(item) || /\s/.test(item) || item.endsWith('/')) return null;
  if (!(/\//.test(item) || /\.[a-z0-9]{1,10}$/i.test(item))) return null;
  return item;
}

function phaseNumber(value) {
  const match = String(value || '').match(/(\d+)/);
  return match ? parseInt(match[1], 10) : null;
}

/** `src/server/routes/x.ts` → `src/server`; `tests/x.test.ts` → `tests`; `README.md` → `.` */
function areaOf(file) {
  const parts = file.split('/').filter(Boolean);
  if (parts.length >= 3) return `${parts[0]}/${parts[1]}`;
  if (parts.length === 2) return parts[0];
  return '.';
}

/**
 * Which surface a file belongs to — by extension when it is unambiguous
 * (`.html`, `.tsx`, `.go`, `.sql`…), else by the first directory or file stem
 * that names one (`public/`, `client/`, `server/`, `domain/`, `server.js`…),
 * else `shared`. A heuristic: reported per file so a wrong guess is visible,
 * consumed by proposals and advisories, never by a refusal.
 */
function classifySurface(file) {
  const parts = String(file || '').replace(/\\/g, '/').split('/').filter(Boolean);
  const name = parts[parts.length - 1] || '';
  const dirs = parts.slice(0, -1).map((dir) => dir.toLowerCase());
  const stem = name.replace(/\.[^.]+$/, '').toLowerCase();
  const test = dirs.some((dir) => TEST_DIRS.has(dir)) || TEST_FILE.test(name);
  if (FRONTEND_EXTENSIONS.test(name)) return { surface: 'frontend', test, by: 'extension' };
  if (BACKEND_EXTENSIONS.test(name)) return { surface: 'backend', test, by: 'extension' };
  const hit = dirs.find((dir) => FRONTEND_DIRS.has(dir) || BACKEND_DIRS.has(dir));
  if (hit) return { surface: FRONTEND_DIRS.has(hit) ? 'frontend' : 'backend', test, by: 'directory' };
  if (FRONTEND_DIRS.has(stem) || BACKEND_DIRS.has(stem)) return { surface: FRONTEND_DIRS.has(stem) ? 'frontend' : 'backend', test, by: 'stem' };
  return { surface: 'shared', test, by: 'default' };
}

/**
 * `{ backend, frontend, shared, tests: {backend, frontend, shared}, files[],
 *    two_sided, shared_test_root }` — source files counted per surface, test
 * files apart. `shared_test_root`: the plan has both surfaces and tests
 * nobody can tell apart by path — a root one lane cannot own alone.
 */
function measureSurfaces(files) {
  const counts = { backend: 0, frontend: 0, shared: 0 };
  const tests = { backend: 0, frontend: 0, shared: 0 };
  const list = [];
  for (const file of files) {
    const item = classifySurface(file);
    (item.test ? tests : counts)[item.surface] += 1;
    list.push({ path: file, surface: item.surface, test: item.test });
  }
  const twoSided = counts.backend > 0 && counts.frontend > 0;
  return { ...counts, tests, files: list, two_sided: twoSided, shared_test_root: twoSided && tests.shared > 0 };
}

function deliveryRows(content) {
  const section = extractSection(content, DELIVERY_HEADINGS);
  const table = section ? parseFirstMarkdownTable(section) : null;
  if (!table) return [];
  const columns = mapColumns(table, {
    phase: ['Phase', 'Fase'],
    files: ['Files', 'Paths', 'Arquivos', 'Caminhos']
  });
  if (columns.missing.length > 0) return [];
  return table.rows.map((row) => ({
    phase: phaseNumber(row[columns.indexes.phase]),
    files: splitPathCell(row[columns.indexes.files]).map(asFilePath).filter(Boolean)
  }));
}

function rowFiles(row) {
  return [...new Set((row.files_raw || []).map(asFilePath).filter(Boolean))];
}

/**
 * The dependency depth of every Execution Sequence row: a row with a
 * `Depends on` cell waits for those rows (a bare phase number = every row of
 * that phase); a row without one keeps the wave barrier and waits for the
 * whole previous wave. The longest chain is the serial critical path.
 */
function rowDepths(rows) {
  const depth = new Map();
  const label = (row) => String(row.phase).trim().toLowerCase();
  let previousWave = [];
  for (const { phases } of groupByWave(rows)) {
    for (const row of phases) {
      let deps = [];
      if (Array.isArray(row.depends) && row.depends.length > 0) {
        for (const dep of row.depends) {
          const key = String(dep.phase).trim().toLowerCase();
          const exact = rows.filter((candidate) => label(candidate) === key);
          // Same rule as execution:compile: only a bare number (`2`, `Phase 2`) means the whole phase.
          const bare = key.match(/^(?:phase|fase|etapa)?\s*[-#]?\s*(\d+)$/i);
          const number = bare ? parseInt(bare[1], 10) : null;
          const targets = exact.length > 0 ? exact : rows.filter((candidate) => number !== null && phaseNumber(candidate.phase) === number);
          deps.push(...targets.filter((candidate) => depth.has(candidate)));
        }
      } else {
        deps = previousWave;
      }
      depth.set(row, 1 + Math.max(0, ...deps.map((candidate) => depth.get(candidate))));
    }
    previousWave = phases;
  }
  return depth;
}

/**
 * Per Execution Sequence row — the unit an ephemeral process would carry:
 * files, cited ACs/CAPs, the files it shares with other rows, its surfaces,
 * and whether it exceeds the unit ceiling. Plus the plan as a graph
 * (`parallelism`) and the files several rows write (`seams`).
 */
function measureUnits(rows, ceiling) {
  const fanIn = new Map();
  for (const row of rows) for (const file of rowFiles(row)) fanIn.set(file.toLowerCase(), (fanIn.get(file.toLowerCase()) || 0) + 1);
  const depths = rowDepths(rows);
  const units = rows.map((row) => {
    const files = rowFiles(row);
    const acs = [...new Set([...extractIds(row.scope, AC_ID_RE), ...extractIds(row.done, AC_ID_RE)])];
    const caps = extractIds(row.scope, CAP_ID_RE);
    const surfaces = measureSurfaces(files);
    const reasons = [];
    if (files.length > ceiling.max_files) reasons.push('files');
    if (acs.length > ceiling.max_acs) reasons.push('acs');
    return {
      phase: String(row.phase),
      wave: row.wave,
      files: files.length,
      acs: acs.length,
      caps: caps.length,
      shared_files: files.filter((file) => fanIn.get(file.toLowerCase()) > 1),
      surfaces: { backend: surfaces.backend, frontend: surfaces.frontend, shared: surfaces.shared, tests: surfaces.tests.backend + surfaces.tests.frontend + surfaces.tests.shared },
      two_sided: surfaces.two_sided,
      depth: depths.get(row) || 1,
      over_budget: reasons.length > 0,
      reasons
    };
  });
  const byWave = groupByWave(rows);
  const maxConcurrent = Math.max(0, ...byWave.map((wave) => wave.phases.length));
  const chain = Math.max(0, ...units.map((unit) => unit.depth));
  const seams = [...fanIn.entries()]
    .filter(([, count]) => count > 1)
    .map(([file, count]) => ({ file, units: count }))
    .sort((a, b) => b.units - a.units || a.file.localeCompare(b.file));
  return {
    units,
    parallelism: {
      waves: byWave.length,
      max_concurrent_units: maxConcurrent,
      serial_chain: chain,
      critical_path_processes: chain * 2,
      serial: units.length > 1 && maxConcurrent === 1
    },
    seams
  };
}

/**
 * `{ files, create, modify, phases, waves, parallel_phases, bytes, areas,
 *    split_candidate, threshold: { min_files }, sources, surfaces, units,
 *    parallelism, seams, ceiling }`.
 * Never throws; an empty or table-less plan measures zero everywhere.
 */
function measurePlanScale(content, { minFiles = DEFAULT_SPLIT_MIN_FILES, ceiling = { max_files: DEFAULT_UNIT_MAX_FILES, max_acs: DEFAULT_UNIT_MAX_ACS } } = {}) {
  const text = String(content || '');
  const files = new Map(); // lowercase → first spelling seen
  const actions = new Map(); // lowercase → Set(action)
  const phases = new Set();
  const add = (file, action = null) => {
    const key = file.toLowerCase();
    if (!files.has(key)) files.set(key, file);
    if (action) {
      if (!actions.has(key)) actions.set(key, new Set());
      actions.get(key).add(action);
    }
  };

  const delta = parseImplementationDelta(text) || [];
  for (const item of delta) {
    const file = asFilePath(item.path);
    if (file) add(file, normalizeLabel(item.action));
  }
  const delivery = deliveryRows(text);
  for (const row of delivery) {
    if (Number.isInteger(row.phase)) phases.add(row.phase);
    for (const file of row.files) add(file);
  }
  const sequence = parseExecutionWaves(text) || [];
  for (const row of sequence) {
    const phase = phaseNumber(row.phase);
    if (Number.isInteger(phase)) phases.add(phase);
    for (const raw of row.files_raw || []) {
      const file = asFilePath(raw);
      if (file) add(file);
    }
  }
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(PHASE_HEADING);
    if (match) phases.add(parseInt(match[1], 10));
  }

  const waves = groupByWave(sequence);
  const parallelPhases = waves.reduce((sum, wave) => sum + (wave.phases.length > 1 ? wave.phases.length : 0), 0);
  const counts = new Map();
  for (const file of files.values()) {
    const area = areaOf(file);
    counts.set(area, (counts.get(area) || 0) + 1);
  }
  const areas = [...counts.entries()]
    .map(([prefix, count]) => ({ prefix, files: count }))
    .sort((a, b) => b.files - a.files || a.prefix.localeCompare(b.prefix))
    .slice(0, MAX_AREAS);
  const countAction = (name) => [...actions.values()].filter((set) => set.has(name)).length;
  const measured = measureUnits(sequence, ceiling);

  return {
    files: files.size,
    create: countAction('create'),
    modify: countAction('modify'),
    phases: phases.size,
    waves: waves.length,
    parallel_phases: parallelPhases,
    bytes: Buffer.byteLength(text, 'utf8'),
    areas,
    split_candidate: files.size >= minFiles,
    threshold: { min_files: minFiles },
    sources: { delta: delta.length, delivery: delivery.length, sequence: sequence.length },
    surfaces: measureSurfaces([...files.values()]),
    units: measured.units,
    parallelism: measured.parallelism,
    seams: measured.seams,
    ceiling: { max_files: ceiling.max_files, max_acs: ceiling.max_acs }
  };
}

/**
 * The measured recommendation for the one execution question — advice, never
 * the answer. `single` below the split floor, or when nothing measurable can
 * run in parallel; `orchestrated` when the plan is a split candidate AND a
 * real cut exists (two surfaces, or rows already sharing a wave). The roles
 * file's lock state is deliberately NOT an input: an incident showed the
 * asking model reading "locked" as "not advisable" and recommending a single
 * context for a 52-file two-surface plan. Availability names the unlock step;
 * it never flips what the numbers say. The owner still decides.
 */
function recommendExecution(scale, { proposal = null } = {}) {
  if (!scale || !scale.files) return { choice: 'single', reasons: ['no plan measured'] };
  const floor = scale.threshold?.min_files ?? DEFAULT_SPLIT_MIN_FILES;
  if (!scale.split_candidate) {
    return { choice: 'single', reasons: [`${scale.files} file(s) below the ${floor}-file split floor for one context`] };
  }
  const surfaces = scale.surfaces || {};
  const concurrent = scale.parallelism?.max_concurrent_units || 0;
  if (surfaces.two_sided !== true && concurrent < 2) {
    return { choice: 'single', reasons: [`split candidate (${scale.files} files ≥ ${floor}) with one measured surface and no rows sharing a wave — nothing to cut on yet`] };
  }
  const reasons = [`${scale.files} files ≥ the ${floor}-file floor for one context`];
  if (surfaces.two_sided === true) reasons.push(`two surfaces (backend ${surfaces.backend} · frontend ${surfaces.frontend})`);
  if (concurrent >= 2) reasons.push(`${concurrent} units already share a wave`);
  if (proposal && Array.isArray(proposal.rows) && proposal.rows.length > 0) reasons.push(`the split proposal cuts ${proposal.rows.length} row(s) into surface lanes`);
  return { choice: 'orchestrated', reasons };
}

/** `orchestrated — 52 files ≥ the 12-file floor for one context; two surfaces (backend 14 · frontend 38)` */
function formatRecommendation(recommendation) {
  if (!recommendation) return 'none';
  return `${recommendation.choice} — ${recommendation.reasons.join('; ')}`;
}

/**
 * The execution choice the plan records: the `## Development execution lanes`
 * table means orchestrated; `execution: single | orchestrated` in the
 * frontmatter records the owner's answer without a table. `null` = never
 * recorded — the state the scale advisory fires on.
 */
function resolveExecutionChoice(content) {
  const text = String(content || '');
  if (parseDevelopmentLanes(text) !== null) return { choice: 'orchestrated', source: 'lanes_table' };
  const frontmatter = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (frontmatter) {
    const line = frontmatter[1].match(/^execution:\s*(.+)$/m);
    const value = line ? cleanCell(line[1]).toLowerCase() : '';
    if (EXECUTION_CHOICES.includes(value)) return { choice: value, source: 'frontmatter' };
  }
  return { choice: null, source: null };
}

/** `79 files (53 new) in 4 phases, 4 waves, 0 in parallel` */
function formatPlanScale(scale) {
  if (!scale) return 'no plan';
  return `${scale.files} file(s)${scale.create ? ` (${scale.create} new)` : ''} in ${scale.phases} phase(s), ${scale.waves} wave(s), ${scale.parallel_phases} in parallel`;
}

/** `phase 1 (15 files, 3 ACs)` */
function formatUnit(unit) {
  return `phase ${unit.phase} (${unit.files} file${unit.files === 1 ? '' : 's'}, ${unit.acs} AC${unit.acs === 1 ? '' : 's'})`;
}

function groupBy(items, keyOf) {
  const groups = new Map();
  for (const item of items) {
    const key = keyOf(item);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item);
  }
  return groups;
}

/**
 * Write paths per surface lane, as few as the files allow: a top-level
 * directory whose files all sit on one surface is `dir/**`; a mixed one is
 * split by its second level, and what still mixes is named file by file.
 * Root files are exact paths.
 */
function proposeWritePaths(files) {
  const lanes = { backend: new Set(), frontend: new Set() };
  for (const [top, group] of groupBy(files, (file) => (file.path.includes('/') ? file.path.split('/')[0] : null))) {
    if (top === null) {
      for (const file of group) lanes[file.surface].add(file.path);
      continue;
    }
    if (new Set(group.map((file) => file.surface)).size === 1) {
      lanes[group[0].surface].add(`${top}/**`);
      continue;
    }
    for (const [area, sub] of groupBy(group, (file) => (file.path.split('/').length >= 3 ? file.path.split('/').slice(0, 2).join('/') : null))) {
      if (area !== null && new Set(sub.map((file) => file.surface)).size === 1) lanes[sub[0].surface].add(`${area}/**`);
      else for (const file of sub) lanes[file.surface].add(file.path);
    }
  }
  return { backend: [...lanes.backend].sort(), frontend: [...lanes.frontend].sort() };
}

/**
 * Candidate lanes and rows for a two-surface plan: one lane per surface with
 * derived write paths, every Execution Sequence row (or, without one, every
 * delivery phase) cut into a `{phase}-backend` / `{phase}-frontend` pair in
 * the same wave, and the files nobody can place (`unassigned`) named with the
 * reason. `null` when the plan has one surface — nothing to cut on — or
 * already declares two lanes — the cut was made. Raw material for the
 * planner's tables, never a table.
 */
function proposeSplit(content, options = {}) {
  const text = String(content || '');
  const lanesTable = parseDevelopmentLanes(text);
  if (lanesTable && lanesTable.rows.length >= 2) return null;
  // Same thresholds as the caller's own measurement: today no field the
  // proposal reads depends on them, but a future one must not silently
  // ignore the environment on this one path.
  const scale = measurePlanScale(text, options);
  if (!scale.surfaces.two_sided) return null;
  const placeable = scale.surfaces.files.filter((file) => file.surface !== 'shared');
  const unassigned = scale.surfaces.files
    .filter((file) => file.surface === 'shared')
    .map((file) => ({ path: file.path, reason: file.test ? 'shared_test_root' : 'shared' }));
  const writePaths = proposeWritePaths(placeable);
  const sequence = parseExecutionWaves(text) || [];
  const sourceRows = sequence.length > 0
    ? sequence.map((row) => ({ phase: String(row.phase), wave: row.wave, files: rowFiles(row) }))
    : [...groupBy(deliveryRows(text).filter((row) => Number.isInteger(row.phase)), (row) => row.phase).entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([phase, rows], index) => ({ phase: String(phase), wave: index + 1, files: [...new Set(rows.flatMap((row) => row.files))] }));
  const rows = sourceRows.map((row) => {
    const classified = row.files.map((file) => ({ path: file, ...classifySurface(file) }));
    const units = ['backend', 'frontend']
      .map((lane) => ({ unit: `${row.phase}-${lane}`, lane, files: classified.filter((file) => file.surface === lane).map((file) => file.path) }))
      .filter((unit) => unit.files.length > 0);
    return { phase: row.phase, wave: row.wave, units, unassigned: classified.filter((file) => file.surface === 'shared').map((file) => file.path) };
  });
  return {
    source: sequence.length > 0 ? 'execution_sequence' : 'delivery_plan',
    lanes: [
      { lane: 'backend', write_paths: writePaths.backend },
      { lane: 'frontend', write_paths: writePaths.frontend }
    ],
    rows,
    unassigned,
    shared_test_root: scale.surfaces.shared_test_root,
    seams: scale.seams
  };
}

/** One line per proposed lane, one per row — the human rendering of `proposeSplit`. */
function formatSplitProposal(proposal) {
  if (!proposal) return [];
  const lines = [`split proposal (${proposal.source === 'execution_sequence' ? 'from the Execution Sequence' : 'from the delivery phases'}): ${proposal.lanes.map((lane) => `${lane.lane} → ${lane.write_paths.join(', ') || '(no files)'}`).join(' | ')}`];
  for (const row of proposal.rows) {
    lines.push(`  wave ${row.wave}: ${row.units.map((unit) => `${unit.unit} (${unit.files.length})`).join(' ‖ ') || '(nothing placeable)'}${row.unassigned.length ? ` — unassigned: ${row.unassigned.join(', ')}` : ''}`);
  }
  if (proposal.unassigned.length) {
    const tests = proposal.unassigned.filter((item) => item.reason === 'shared_test_root').length;
    lines.push(`  unassigned ${proposal.unassigned.length} file(s): ${proposal.unassigned.map((item) => item.path).join(', ')}${tests ? ` — ${tests} test file(s) sit at a root no lane can own alone: give each lane its own test path (tests/api/**, tests/ui/**) or assign the root to one lane` : ''}`);
  }
  if (proposal.seams.length) lines.push(`  seams (files several rows write): ${proposal.seams.map((seam) => `${seam.file} ×${seam.units}`).join(', ')} — an Interface Contract row (IF-*) per boundary lets the halves run apart`);
  return lines;
}

module.exports = {
  DEFAULT_SPLIT_MIN_FILES,
  DEFAULT_UNIT_MAX_ACS,
  DEFAULT_UNIT_MAX_FILES,
  EXECUTION_CHOICES,
  SPLIT_MIN_FILES_ENV,
  SURFACES,
  UNIT_MAX_ACS_ENV,
  UNIT_MAX_FILES_ENV,
  classifySurface,
  formatPlanScale,
  formatRecommendation,
  formatSplitProposal,
  formatUnit,
  measurePlanScale,
  measureSurfaces,
  measureUnits,
  proposeSplit,
  recommendExecution,
  resolveExecutionChoice,
  splitMinFiles,
  unitCeiling
};
