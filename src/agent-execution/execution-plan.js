'use strict';

/**
 * execution:compile — the planner's two tables become a machine-checkable
 * execution plan for the orchestrated path.
 *
 *   `## Development execution lanes` (Lane | Host | Model | Exact write paths | Integration owner)
 *   `## Execution Sequence`          (Phase | Wave | Files | Scope | Done when)
 *
 * Every Execution Sequence row is one UNIT. A unit whose files all fall inside
 * one lane's write paths belongs to that lane (an ephemeral external process
 * of the lane's dev role runs it); a unit whose files fall in no lane is an
 * INTEGRATION unit (the parent session's @dev runs it after the lanes); a unit
 * mixing owners is refused — the planner splits it. Waves come from the plan;
 * inside a wave every lane unit runs concurrently, so same-wave files must be
 * disjoint. A unit is also MEASURED: one process is one context, so a unit
 * above the ceiling (files or ACs), a unit writing backend and frontend files
 * in one context, and a plan whose single lane runs one unit per wave are
 * named warnings — the planner cuts on the number; the compile never decides. Roles (host/model/effort per lane, the lane reviewer) come from
 * `.aioson/config/execution-roles.json`, validated by host signatures on this
 * machine; the plan's Host/Model columns are informational and a mismatch is a
 * warning. Prompts are compiled per unit from the dev-lane profile plus the
 * PRD/plan rows of that unit's capabilities — never the whole documents.
 *
 * Outputs: `.aioson/context/execution-plan-{slug}.json` (digest-bound to the
 * plan, the roles file, the dev kernel and the manifest lanes),
 * `.aioson/context/execution-prompts/{slug}/*.md`, and ONLY the
 * `development_lanes` + `orchestration.execution` fields of the manifest.
 */

const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { parseExecutionWaves, parseDevelopmentLanes, LANES_HEADINGS } = require('../harness/plan-waves');
const { matchGlob } = require('../harness/glob-match');
const {
  extractSection,
  parseFirstMarkdownTable,
  mapColumns,
  cleanCell,
  extractIds,
  normalizeLabel,
  CAP_ID_RE,
  AC_ID_RE
} = require('../lib/feature-completeness-format');
const { readExecutionRoles, resolveLaneRoles, resolveProfileFallbacks, checkRoleSignatures, laneRoleKey, EXECUTION_ROLES_RELATIVE_PATH } = require('../lib/execution-roles');
const { readSignatures, findSignature, signatureState } = require('../lib/host-signature');
const { buildDevLaneProfile, DEV_KERNEL_RELATIVE_PATH } = require('./dev-lane-profile');
const { MAX_DEVELOPMENT_LANES } = require('./schema');
const { readExecutionPolicy, contextWindow } = require('./execution-policy');
const { resolveExistingInsideRoot } = require('../verification/path-policy');
const { measureSurfaces, unitCeiling, UNIT_MAX_FILES_ENV, UNIT_MAX_ACS_ENV } = require('../lib/plan-scale');
const {
  assertFeatureSlug,
  defaults: manifestDefaults,
  initManifest,
  loadManifest,
  writeManifest,
  digest: manifestDigest
} = require('./manifest');

const EXECUTION_PLAN_VERSION = 2;
const GENERATOR = 'aioson execution:compile@2';
/** The client's binding rules — the same enumeration rules:check uses (no README, no `_archived`). */
const RULES_RELATIVE_PATH = '.aioson/rules';
/** Passage rules of an edge: the dependent starts after the implementer passed, or after the lane review finished. */
const DEPENDENCY_GATES = ['after_dev', 'after_qa'];
const DEFAULT_QA_MAX_FIX_FILES = 3;
const TERMINAL_RUN_STATES = ['approved', 'failed', 'cancelled'];
const SAFE_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function sha256(text) {
  return crypto.createHash('sha256').update(String(text)).digest('hex');
}

function executionPlanRelative(feature) {
  return `.aioson/context/execution-plan-${feature}.json`;
}

function executionPlanPath(projectDir, feature) {
  return path.join(projectDir, '.aioson', 'context', `execution-plan-${assertFeatureSlug(feature)}.json`);
}

function promptsRelative(feature) {
  return `.aioson/context/execution-prompts/${feature}`;
}

function implementationPlanRelative(feature) {
  return `.aioson/context/implementation-plan-${feature}.md`;
}

function prdRelative(feature) {
  return `.aioson/context/prd-${feature}.md`;
}

async function readFileSafe(file) {
  try {
    return await fs.readFile(file, 'utf8');
  } catch {
    return null;
  }
}

function normalizeRel(value) {
  let out = String(value || '').trim().replace(/\\/g, '/');
  while (out.startsWith('./')) out = out.slice(2);
  out = out.replace(/\/{2,}/g, '/');
  return out;
}

function isSafeRelative(value) {
  if (!value) return false;
  if (/^(?:[A-Za-z]:\/|\/)/.test(value)) return false;
  return !value.split('/').includes('..');
}

function hasGlob(value) {
  return /[*?{}[\]]/.test(value);
}

/** Does one declared write path own this file? exact | directory prefix | glob. */
function pathOwns(writePath, file) {
  const wp = normalizeRel(writePath).toLowerCase();
  const f = normalizeRel(file).toLowerCase();
  if (!wp || !f) return false;
  if (hasGlob(wp)) return matchGlob(wp, f);
  const dir = wp.replace(/\/+$/, '');
  return f === dir || f.startsWith(`${dir}/`);
}

/** Do two declared write paths overlap (either owns a file the other could own)? */
function writePathsOverlap(a, b) {
  const x = normalizeRel(a).toLowerCase();
  const y = normalizeRel(b).toLowerCase();
  if (!x || !y) return false;
  if (x === y) return true;
  if (!hasGlob(x) && !hasGlob(y)) return pathOwns(x, y) || pathOwns(y, x);
  if (hasGlob(x) && !hasGlob(y)) return matchGlob(x, y) || matchGlob(x, `${y.replace(/\/+$/, '')}/probe.file`);
  if (!hasGlob(x) && hasGlob(y)) return matchGlob(y, x) || matchGlob(y, `${x.replace(/\/+$/, '')}/probe.file`);
  // glob vs glob: the literal prefixes decide (src/api/** vs src/api/v2/**).
  const px = x.split(/[*?{[]/)[0];
  const py = y.split(/[*?{[]/)[0];
  return px.startsWith(py) || py.startsWith(px);
}

function slugifyId(value) {
  const slug = String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/g, '');
  return slug.replace(/^phase-?/, '');
}

function phaseNumberString(value) {
  const match = String(value || '').match(/\d+/);
  return match ? match[0] : null;
}

/** Rows of a named markdown table as objects, [] when absent. */
function tableRowsFor(content, headings, definitions) {
  const section = extractSection(content, headings);
  if (section === null) return { present: false, rows: [] };
  const table = parseFirstMarkdownTable(section);
  if (!table) return { present: true, rows: [] };
  const columns = mapColumns(table, definitions);
  const rows = table.rows.map((row) => {
    const out = {};
    for (const name of Object.keys(definitions)) {
      out[name] = columns.indexes[name] >= 0 ? cleanCell(row[columns.indexes[name]]) : '';
    }
    return out;
  });
  return { present: true, rows, missing: columns.missing };
}

/**
 * `## Phase N — …` sections of the plan by phase number (any heading level
 * 2–4; `Fase`/`Etapa` too), each ending at the next heading of the same or
 * a higher level. The unit prompt embeds its own phase so the worker does
 * not read the whole plan for the two paragraphs that concern it.
 */
// The headings the compiler reads by "first occurrence wins" — the catalog
// the duplicate check holds the plan (errors) and the PRD (warnings) to.
const PLAN_CANONICAL_SECTIONS = [
  { id: 'execution-sequence', aliases: ['Execution Sequence', 'Sequência de Execução', 'Sequencia de Execucao'] },
  { id: 'development-execution-lanes', aliases: LANES_HEADINGS },
  { id: 'interface-contract', aliases: ['Interface Contract', 'Contrato de Interface'] },
  { id: 'capability-delivery-plan', aliases: ['Capability Delivery Plan', 'Plano de Entrega de Capacidades', 'Matriz de Entrega de Capacidades'] },
  { id: 'implementation-delta', aliases: ['Implementation Delta', 'Delta de Implementacao', 'Delta de Implementação'] }
];
const PRD_CANONICAL_SECTIONS = [
  { id: 'acceptance-criteria', aliases: ['Acceptance Criteria', 'Criterios de Aceite', 'Critérios de Aceite'] }
];

/** Every heading (any level) that extractSection would accept for these aliases, with its line. */
function sectionHeadingLines(content, aliases) {
  const normalized = aliases.map(normalizeLabel);
  const found = [];
  String(content || '').split(/\r?\n/).forEach((line, index) => {
    const match = line.match(/^(#{1,6})\s+(.+?)\s*$/);
    if (!match) return;
    const heading = normalizeLabel(match[2]);
    if (normalized.some((alias) => heading === alias || heading.startsWith(`${alias}-`))) found.push({ line: index + 1, level: match[1].length, text: match[2] });
  });
  return found;
}

/** Canonical headings that appear more than once: `{id, heading, lines[]}` per duplicate. */
function duplicateSections(content, catalog) {
  const duplicates = [];
  for (const section of catalog) {
    const found = sectionHeadingLines(content, section.aliases);
    if (found.length > 1) duplicates.push({ id: section.id, heading: found[0].text, lines: found.map((item) => item.line) });
  }
  return duplicates;
}

/**
 * Phase headings that open the same phase number twice — mirrors the opening
 * rule of readPhaseSections (a phase heading opens a section only when none
 * is open), so a nested "### Phase 1 notes" is never counted.
 */
function duplicatePhaseSections(planContent) {
  const openings = new Map();
  let current = null;
  let level = 0;
  String(planContent || '').split(/\r?\n/).forEach((line, index) => {
    const heading = line.match(/^(#{2,4})\s+(.*)$/);
    if (!heading) return;
    const depth = heading[1].length;
    if (current !== null && depth <= level) current = null;
    const phase = heading[2].match(/^(?:phase|fase|etapa)\s+(\d+)\b/i);
    if (phase && current === null) {
      current = parseInt(phase[1], 10);
      level = depth;
      const lines = openings.get(current) || [];
      lines.push(index + 1);
      openings.set(current, lines);
    }
  });
  return [...openings.entries()].filter(([, lines]) => lines.length > 1).map(([phase, lines]) => ({ id: `phase-${phase}`, heading: `Phase ${phase}`, lines }));
}

function readPhaseSections(planContent) {
  const sections = new Map();
  let current = null;
  let level = 0;
  let buffer = [];
  const flush = () => {
    if (current !== null && !sections.has(current)) sections.set(current, buffer.join('\n').trim());
    current = null;
    buffer = [];
  };
  for (const line of String(planContent || '').split(/\r?\n/)) {
    const heading = line.match(/^(#{2,4})\s+(.*)$/);
    if (heading) {
      const depth = heading[1].length;
      if (current !== null && depth <= level) flush();
      const phase = heading[2].match(/^(?:phase|fase|etapa)\s+(\d+)\b/i);
      // A phase heading opens a section only when none is open: a deeper
      // "### Phase 1 notes" inside "## Phase 1" is part of that section.
      if (phase && current === null) {
        current = parseInt(phase[1], 10);
        level = depth;
        buffer = [line];
        continue;
      }
    }
    if (current !== null) buffer.push(line);
  }
  flush();
  return sections;
}

function readPlanExcerpts(planContent, prdContent) {
  const acceptance = tableRowsFor(prdContent || '', ['Acceptance Criteria', 'Criterios de Aceite', 'Critérios de Aceite'], {
    ac: ['AC', 'Acceptance criterion', 'Criterio de aceite', 'Critério de aceite'],
    cap: ['CAP', 'Capability', 'Capacidade'],
    behavior: ['Observable behavior', 'Behavior', 'Comportamento observavel', 'Comportamento observável', 'Comportamento'],
    evidence: ['Evidence', 'Verification', 'Evidencia', 'Evidência', 'Verificacao', 'Verificação']
  });
  const delivery = tableRowsFor(planContent, ['Capability Delivery Plan', 'Plano de Entrega de Capacidades', 'Matriz de Entrega de Capacidades'], {
    cap: ['CAP', 'Capability ID', 'ID'],
    phase: ['Phase', 'Fase'],
    files: ['Files', 'Paths', 'Arquivos', 'Caminhos'],
    verification: ['Verification', 'Check', 'Verificacao', 'Verificação']
  });
  const delta = tableRowsFor(planContent, ['Implementation Delta', 'Delta de Implementacao', 'Delta de Implementação'], {
    cap: ['CAP', 'Capability', 'Capacidade'],
    action: ['Action', 'Path action', 'Acao', 'Ação'],
    paths: ['Exact paths', 'Paths', 'Caminhos exatos', 'Caminhos'],
    change: ['Required change', 'Change', 'Mudanca requerida', 'Mudança requerida', 'Alteracao requerida', 'Alteração requerida']
  });
  return {
    acceptance: acceptance.rows.map((row) => ({ ...row, caps: extractIds(row.cap, CAP_ID_RE) })),
    delivery: delivery.rows.map((row) => ({ ...row, caps: extractIds(row.cap, CAP_ID_RE), phase_number: phaseNumberString(row.phase) })),
    delta: delta.rows.map((row) => ({
      ...row,
      caps: extractIds(row.cap, CAP_ID_RE),
      paths: String(row.paths || '').replace(/<br\s*\/?>/gi, ',').split(/[,;\n]/).map((item) => normalizeRel(item.replace(/^\s*(?:create|modify|reuse|retire|criar|modificar|reusar|remover)\s*:\s*/i, ''))).filter(Boolean)
    })),
    prd_present: Boolean(prdContent),
    phases: readPhaseSections(planContent)
  };
}

function markdownTable(headers, rows) {
  const escape = (cell) => String(cell || '').replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
  return [
    `| ${headers.join(' | ')} |`,
    `|${headers.map(() => '---').join('|')}|`,
    ...rows.map((row) => `| ${row.map(escape).join(' | ')} |`)
  ].join('\n');
}

function describeGate(gate) {
  return gate === 'after_dev' ? 'after its implementation' : 'after its review';
}

function unitContractLines(feature, unit, lane, maxWave) {
  const lines = [
    `# Unit contract — ${feature} / ${unit.id}`,
    '',
    `- Feature: ${feature}`,
    `- Lane: ${unit.lane} (write paths: ${lane.write_paths.join(', ')})`,
    `- Phase: ${unit.phase} — wave ${unit.wave} of ${maxWave}`,
    ...(Array.isArray(unit.depends_on) && unit.depends_on.length > 0
      ? [`- Depends on: ${unit.depends_on.map((dep) => `${dep.unit} (${describeGate(dep.gate)})`).join(', ')} — their files are done work you build on, never files you edit`]
      : []),
    `- Scope: ${unit.scope || '(see plan)'}`,
    `- Capabilities: ${unit.caps.length ? unit.caps.join(', ') : '(none cited — see scope)'}`,
    `- Acceptance criteria: ${unit.acs.length ? unit.acs.join(', ') : '(none cited)'}`,
    '- Allowed files (create/modify ONLY these):',
    ...unit.files.map((file) => `  - ${file}`),
    `- Done when: ${unit.done || '(see plan)'}`
  ];
  if (unit.verification.length > 0) {
    lines.push('- Verification:');
    for (const item of unit.verification) lines.push(`  - ${item.command}${item.cap ? ` (${item.cap})` : ''}`);
  }
  if (unit.integration_verification) lines.push('- Verification ownership: ONLY the local Done when / Verification above decides this unit. Capability/phase checks quoted below are deferred integration evidence, not a prerequisite for this unit. Never fail a local unit because a sibling has not yet produced its test or UI. Report the remaining integration checks as messages to integration; do not claim the whole capability passed.');
  return lines;
}

/**
 * The unit's context contract: what it reads beyond the prompt, and what it
 * must not. The prototype is named only for a unit that writes frontend
 * files; the rules come through `context:brief --paths=<unit files>`, never
 * the whole `.aioson/rules/` tree. Returns the lines and the reads they name.
 */
function contextContract({ feature, unit, excerpts, prototype }) {
  const reads = [];
  const lines = [
    '## Context contract',
    '',
    `- Plan: ${implementationPlanRelative(feature)} — your phase section and table rows are embedded above; open the whole plan only for a cross-reference.`
  ];
  if (excerpts.prd_present) lines.push(`- PRD: ${prdRelative(feature)} — the acceptance criteria of your capabilities are embedded above; open it only for a business rule they cite.`);
  if (unit.read_ranges?.length) {
    lines.push('- Initial source reads are bounded below (inclusive lines at compile time). Locate the corresponding symbols with focused searches if earlier work moved them. Do not load these files wholesale. Expand to the related functions and callers needed to finish and verify the unit. These are reading instructions, not narrower write permissions.');
    for (const range of unit.read_ranges) lines.push(`  - ${range.path}:${range.start}-${range.end}`);
  }
  const surfaces = measureSurfaces(unit.files);
  if (prototype && prototype.path && (surfaces.frontend > 0 || surfaces.tests.frontend > 0)) {
    reads.push({ path: prototype.path, bytes: prototype.bytes ?? null, why: 'frontend files in this unit' });
    lines.push(`- Prototype: ${prototype.path}${Number.isInteger(prototype.bytes) ? ` (${Math.round(prototype.bytes / 1024)} KB)` : ''} — the visual contract for the UI files of this unit; a unit without UI files never opens it.`);
  }
  lines.push(`- Rules: run \`aioson context:brief . --agent=dev --mode=executing --paths=${unit.files.join(',')} --task="unit ${unit.id} of ${feature}"\` and load only what it selects (\`must_load\` is binding); never read \`.aioson/rules/\` wholesale.`);
  lines.push('- Everything else (other phases, other lanes, the briefing) is out of your context on purpose: what you need from another unit arrives as messages appended below, and what another unit needs from you goes into `messages[]` of your report.');
  return { lines, reads };
}

function renderUnitPrompt({ feature, unit, lane, maxWave, profileText, excerpts, prototype = null }) {
  const parts = [profileText.trimEnd(), '', ...unitContractLines(feature, unit, lane, maxWave), ''];
  const capSet = new Set(unit.caps.map((cap) => cap.toLowerCase()));
  const forUnit = (rows) => rows.filter((row) => row.caps.some((cap) => capSet.has(cap.toLowerCase())));
  const acRows = forUnit(excerpts.acceptance);
  if (acRows.length > 0) {
    parts.push('## Acceptance criteria (from the PRD)', '', markdownTable(['AC', 'CAP', 'Observable behavior', 'Evidence'], acRows.map((row) => [row.ac, row.cap, row.behavior, row.evidence])), '');
  }
  const deliveryRows = forUnit(excerpts.delivery);
  if (deliveryRows.length > 0) {
    parts.push('## Capability delivery (from the plan)', '', markdownTable(['CAP', 'Phase', 'Files', 'Verification'], deliveryRows.map((row) => [row.cap, row.phase, row.files, row.verification])), '');
  }
  const deltaRows = forUnit(excerpts.delta);
  if (deltaRows.length > 0) {
    parts.push('## Implementation delta (from the plan)', '', markdownTable(['CAP', 'Action', 'Exact paths', 'Required change'], deltaRows.map((row) => [row.cap, row.action, row.paths.join(', '), row.change])), '');
  }
  const phaseKey = Number.parseInt(String(unit.phase_number ?? ''), 10);
  const section = excerpts.phases instanceof Map && Number.isInteger(phaseKey) ? excerpts.phases.get(phaseKey) : null;
  if (section) parts.push('## Plan section for this phase (from the plan)', '', section, '');
  const contract = contextContract({ feature, unit, excerpts, prototype });
  parts.push(...contract.lines, '');
  const text = `${parts.join('\n').trimEnd()}\n`;
  return { text, context: { prompt_bytes: Buffer.byteLength(text, 'utf8'), reads: contract.reads } };
}

function renderLanePrompt({ feature, lane, laneId, units, maxWave, profileText }) {
  const parts = [
    profileText.trimEnd(),
    '',
    `# Lane contract — ${feature} / ${laneId}`,
    '',
    `- Write paths: ${lane.write_paths.join(', ')}`,
    `- Units in wave order (${units.length}); units of other lanes run concurrently on disjoint files:`,
    ...units.map((unit) => `  - ${unit.id}: phase ${unit.phase}, wave ${unit.wave} — ${unit.files.join(', ')}${Array.isArray(unit.depends_on) && unit.depends_on.length > 0 ? ` (depends on ${unit.depends_on.map((dep) => `${dep.unit} ${describeGate(dep.gate)}`).join(', ')})` : ''}`),
    ''
  ];
  for (const unit of units) parts.push(...unitContractLines(feature, unit, lane, maxWave), '');
  return `${parts.join('\n').trimEnd()}\n`;
}

/**
 * Pure compilation over already-read inputs. Returns `{ errors, warnings, plan }`;
 * `plan` is complete only when `errors` is empty.
 */
/**
 * One digest over every binding rule file, in path order: the contract the
 * units were compiled under. `{ present: false, digest: null, files: 0 }`
 * when the project has no rules directory.
 */
async function rulesDigest(projectDir) {
  const root = path.join(projectDir, ...RULES_RELATIVE_PATH.split('/'));
  const files = [];
  const walk = async (absDir, relDir) => {
    let entries;
    try {
      entries = await fs.readdir(absDir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.name.toLowerCase() === 'readme.md' || entry.name.startsWith('_')) continue;
      const abs = path.join(absDir, entry.name);
      const rel = `${relDir}/${entry.name}`;
      if (entry.isDirectory()) await walk(abs, rel);
      else if (entry.isFile() && entry.name.endsWith('.md')) files.push({ abs, rel });
    }
  };
  await walk(root, RULES_RELATIVE_PATH);
  let present = false;
  try {
    present = (await fs.stat(root)).isDirectory();
  } catch {
    present = false;
  }
  if (!present) return { present: false, digest: null, files: 0 };
  files.sort((a, b) => (a.rel < b.rel ? -1 : a.rel > b.rel ? 1 : 0));
  const hash = crypto.createHash('sha256');
  for (const file of files) {
    hash.update(`${file.rel}\n`);
    hash.update(await fs.readFile(file.abs));
    hash.update('\n');
  }
  return { present: true, digest: hash.digest('hex'), files: files.length };
}

function compileExecutionPlan({ feature, planContent, prdContent, roles, rules = null, signatures, profile, manifest, runState = null, ceiling = unitCeiling({}), prototype = null, policy = null }) {
  const errors = [];
  const warnings = [];
  const error = (check, message, extra = {}) => errors.push({ check, message, ...extra });
  const warn = (check, message, extra = {}) => warnings.push({ check, message, ...extra });

  // ── one truth per canonical heading ───────────────────────────────────────
  // Every section below is read "first occurrence wins" (extractSection,
  // parseExecutionWaves, readPhaseSections). A plan that carries one twice
  // compiles from whichever copy came first and verifies OK; the incident
  // plan carried its whole phase block twice and the copies disagreed on the
  // wave of a file. Two truths for one question is a defect — refused here.
  for (const dup of [...duplicateSections(planContent, PLAN_CANONICAL_SECTIONS), ...duplicatePhaseSections(planContent)]) {
    error('duplicate_plan_section', `the plan carries "${dup.heading}" ${dup.lines.length} times (lines ${dup.lines.join(', ')}) — the compiler reads the first copy and ignores the rest; keep one section per canonical heading (merge the copies or delete the stale one)`, { section: dup.id, lines: dup.lines });
  }
  for (const dup of (prdContent ? duplicateSections(prdContent, PRD_CANONICAL_SECTIONS) : [])) {
    warn('duplicate_prd_section', `the PRD carries "${dup.heading}" ${dup.lines.length} times (lines ${dup.lines.join(', ')}) — unit prompts embed the rows of the first copy only`, { section: dup.id, lines: dup.lines });
  }

  // ── lanes table ──────────────────────────────────────────────────────────
  const lanesTable = parseDevelopmentLanes(planContent);
  if (lanesTable === null) {
    error('lanes_table_missing', 'the plan has no `## Development execution lanes` table — the planner declares one lane per row (Lane | Exact write paths | Integration owner; host and model come from the roles file)');
  } else {
    if (lanesTable.missing_columns.length > 0) error('lanes_table_invalid', `lanes table lacks column(s): ${lanesTable.missing_columns.join(', ')}`);
    for (const bad of lanesTable.malformed) error('lanes_table_invalid', `lanes table row ${bad.row} has ${bad.cells} cell(s); escape literal pipes as \\|`);
  }
  const lanes = {};
  const laneOrder = [];
  for (const row of lanesTable?.rows || []) {
    if (!SAFE_ID.test(row.lane)) {
      error('lane_id_invalid', `lane "${row.lane}" must be kebab-case`, { lane: row.lane });
      continue;
    }
    if (lanes[row.lane]) {
      error('lane_duplicate', `lane "${row.lane}" is declared twice`, { lane: row.lane });
      continue;
    }
    const writePaths = [...new Set(row.write_paths.map(normalizeRel).filter(Boolean))];
    if (writePaths.length === 0) error('lane_write_paths_missing', `lane "${row.lane}" declares no write paths`, { lane: row.lane });
    for (const wp of writePaths) {
      if (!isSafeRelative(wp)) error('unsafe_path', `lane "${row.lane}" write path "${wp}" must be project-relative without traversal`, { lane: row.lane, path: wp });
    }
    if (row.integration_owner && row.integration_owner !== 'dev') {
      warn('integration_owner_not_dev', `lane "${row.lane}" names "${row.integration_owner}" as integration owner; the manifest requires dev — compiled as dev`, { lane: row.lane });
    }
    lanes[row.lane] = { write_paths: writePaths, plan_host: row.host || null, plan_model: row.model || null };
    laneOrder.push(row.lane);
  }
  if (laneOrder.length > MAX_DEVELOPMENT_LANES) error('too_many_lanes', `${laneOrder.length} lanes declared; the manifest allows at most ${MAX_DEVELOPMENT_LANES}`);
  for (let i = 0; i < laneOrder.length; i += 1) {
    for (let j = i + 1; j < laneOrder.length; j += 1) {
      const a = lanes[laneOrder[i]];
      const b = lanes[laneOrder[j]];
      for (const pa of a.write_paths) {
        for (const pb of b.write_paths) {
          if (writePathsOverlap(pa, pb)) {
            error('lane_write_paths_overlap', `lanes "${laneOrder[i]}" and "${laneOrder[j]}" both own "${pa}" / "${pb}" — write paths must be disjoint`, { lanes: [laneOrder[i], laneOrder[j]] });
          }
        }
      }
    }
  }

  // ── roles per lane (the roles file is the authority; the table columns are informational) ──
  const store = signatures?.store || null;
  const now = signatures?.now || Date.now();
  const signatureFor = (role) => {
    if (!store) return { state: 'missing', entry: null };
    const entry = findSignature(store, { host: role.host, model: role.model, reasoning_effort: role.reasoning_effort });
    return { state: signatureState(entry, now), entry };
  };
  const roleHint = (role) => `aioson host:signature . --host=${role.host} --model=${role.model}${role.reasoning_effort ? ` --effort=${role.reasoning_effort}` : ''}`;
  for (const laneId of laneOrder) {
    const lane = lanes[laneId];
    const resolved = roles ? resolveLaneRoles(roles, laneId) : { dev: null, qa: null };
    if (!resolved.dev) {
      error('lane_without_role', `lane "${laneId}" has no "${laneRoleKey(laneId, 'dev')}" role in ${EXECUTION_ROLES_RELATIVE_PATH}`, { lane: laneId, role: laneRoleKey(laneId, 'dev') });
    }
    if (!resolved.qa) {
      error('qa_role_missing', `lane "${laneId}" has no reviewer: declare a "qa" role (or "${laneRoleKey(laneId, 'qa')}") in ${EXECUTION_ROLES_RELATIVE_PATH}`, { lane: laneId });
    }
    for (const [kind, role] of [['dev', resolved.dev], ['qa', resolved.qa]]) {
      if (!role) continue;
      let effectiveRole = role;
      let sig = signatureFor(role);
      if (sig.state !== 'valid') {
        const fallback = resolveProfileFallbacks(roles, laneId, kind).find(candidate => signatureFor(candidate).state === 'valid');
        if (fallback) {
          warn('role_signature_fallback', `role "${role.role}" (${role.host}/${role.model}) has an ${sig.state} signature; compilation uses signed profile ${fallback.profile} (${fallback.host}/${fallback.model})`, { lane: laneId, role: role.role, profile: fallback.profile, signature_reason: sig.entry?.reason || null });
          effectiveRole = fallback;
          sig = signatureFor(fallback);
        } else {
          const why = sig.state === 'invalid' && sig.entry?.reason ? ` (${sig.entry.reason})` : '';
          error(`role_signature_${sig.state}`, `role "${role.role}" (${role.host}/${role.model}${role.reasoning_effort ? `/${role.reasoning_effort}` : ''}) has ${sig.state === 'missing' ? 'no' : `an ${sig.state}`} host signature on this machine${why}`, { lane: laneId, role: role.role, host: role.host, model: role.model, reasoning_effort: role.reasoning_effort, signature_reason: sig.entry?.reason || null, hint: roleHint(role) });
        }
      }
      lane[kind] = {
        role: effectiveRole.role,
        host: effectiveRole.host,
        model: effectiveRole.model,
        reasoning_effort: effectiveRole.reasoning_effort || null,
        ...(effectiveRole.profile ? { routing_profile: effectiveRole.profile } : {}),
        ...(kind === 'qa' ? { inherited: effectiveRole.inherited === true } : {}),
        signature: sig.entry ? { state: sig.state, checked_at: sig.entry.checked_at || null, expires_at: sig.entry.expires_at || null } : { state: sig.state }
      };
    }
    if (lane.dev && lane.qa && lane.dev.host === lane.qa.host && lane.dev.model === lane.qa.model) {
      // The judge and the producer are the same model: a warning by default,
      // a refusal when the roles file says the review must be independent.
      const detail = `lane "${laneId}": dev and qa run the same host/model (${lane.dev.host}/${lane.dev.model}) — the lane review is not independent`;
      if (roles?.execution?.require_independent_qa === true) {
        error('self_review_same_model', `${detail}; execution.require_independent_qa is on — declare "${laneRoleKey(laneId, 'qa')}" (or "qa") on a different host or model in ${EXECUTION_ROLES_RELATIVE_PATH}`, { lane: laneId, host: lane.dev.host, model: lane.dev.model, role: lane.qa.role, hint: `aioson host:signature . --host=<other host> --model=<other model>` });
      } else {
        // The warning names the knob: written as a bare warning it read like a
        // block, and the key that makes it one appeared in no example file.
        warn('self_review_same_model', `${detail} (a warning by default: the run proceeds and the implementer reviews itself; "execution": {"require_independent_qa": true} in ${EXECUTION_ROLES_RELATIVE_PATH} turns this into a refusal)`, { lane: laneId });
      }
    }
    if (resolved.dev && ((lane.plan_host && lane.plan_host !== resolved.dev.host) || (lane.plan_model && lane.plan_model !== resolved.dev.model && lane.plan_model.toLowerCase() !== 'configured-default'))) {
      warn('lane_role_mismatch', `lane "${laneId}": the plan table says ${lane.plan_host || '?'}/${lane.plan_model || '?'} but the role "${resolved.dev.role}" is ${resolved.dev.host}/${resolved.dev.model} — the roles file wins; update the table when the plan is next edited`, { lane: laneId });
    }
  }

  // ── execution sequence → units ───────────────────────────────────────────
  const rows = parseExecutionWaves(planContent);
  if (!rows || rows.length === 0) {
    error('no_wave_column', 'the `## Execution Sequence` table has no Wave column (or no parseable rows) — the planner annotates waves (positive integers; same-wave phases run in parallel on disjoint files)');
  }
  const units = [];
  const usedIds = new Set();
  const dependencyRows = new Map();
  for (const row of rows || []) {
    let base = slugifyId(row.phase) || String(units.length + 1);
    let id = `phase-${base}`;
    let n = 2;
    while (usedIds.has(id)) id = `phase-${base}-${n++}`;
    usedIds.add(id);
    const files = [...new Set(row.files_raw.map(normalizeRel).filter(Boolean))];
    const readRanges = [];
    for (const token of String(row.read_ranges_raw || '').split(/;|<br\s*\/?\s*>/i).map(s => s.trim()).filter(s => s && s !== '-')) {
      const match = token.replace(/`/g, '').match(/^(.+):(\d+)-(\d+)$/);
      const relative = match && normalizeRel(match[1]);
      const start = match && Number(match[2]);
      const end = match && Number(match[3]);
      if (!match || !files.includes(relative) || !Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 1 || end < start) {
        error('invalid_read_range', `phase "${row.phase}": Read ranges must name an owned file with positive inclusive lines (path:1-80)`, { phase: row.phase, range: token });
      } else readRanges.push({ path: relative, start, end });
    }
    if (files.length === 0) {
      error('phase_without_files', `phase "${row.phase}" lists no files — a unit needs its exact paths`, { phase: row.phase });
    }
    for (const file of files) {
      if (!isSafeRelative(file)) error('unsafe_path', `phase "${row.phase}" file "${file}" must be project-relative without traversal`, { phase: row.phase, path: file });
    }
    const ownership = files.map((file) => ({ file, lanes: laneOrder.filter((laneId) => lanes[laneId].write_paths.some((wp) => pathOwns(wp, file))) }));
    const owningLanes = [...new Set(ownership.flatMap((item) => item.lanes))];
    const unowned = ownership.filter((item) => item.lanes.length === 0).map((item) => item.file);
    let owner = 'integration';
    let lane = null;
    if (owningLanes.length === 1 && unowned.length === 0) {
      owner = 'lane';
      lane = owningLanes[0];
    } else if (owningLanes.length > 0) {
      error('phase_mixed_ownership', `phase "${row.phase}" mixes owners — ${ownership.map((item) => `${item.file}: ${item.lanes.join('+') || 'integration'}`).join('; ')}. Split the phase per lane or move shared files to a later solo wave owned by dev`, { phase: row.phase });
    }
    const caps = extractIds(row.scope, CAP_ID_RE);
    const acs = [...new Set([...extractIds(row.scope, AC_ID_RE), ...extractIds(row.done, AC_ID_RE)])];
    units.push({
      id,
      phase: row.phase,
      phase_number: phaseNumberString(row.phase),
      wave: row.wave,
      owner,
      lane,
      files,
      ...(readRanges.length ? { read_ranges: readRanges } : {}),
      scope: row.scope,
      done: row.done,
      caps,
      acs,
      verification: [],
      depends_on: []
    });
    dependencyRows.set(id, Array.isArray(row.depends) ? row.depends : []);
  }
  if (laneOrder.some((laneId) => lanes[laneId])) {
    for (const laneId of laneOrder) {
      if (!units.some((unit) => unit.lane === laneId)) warn('lane_without_units', `lane "${laneId}" has no phase assigned to it`, { lane: laneId });
    }
  }
  const laneUnits = units.filter((unit) => unit.owner === 'lane');
  const integrationUnits = units.filter((unit) => unit.owner === 'integration');
  if (rows && rows.length > 0 && laneUnits.length === 0 && laneOrder.length > 0) {
    error('no_lane_units', 'no phase falls inside a lane — nothing to orchestrate; assign phase files to lane write paths');
  }
  const maxLaneWave = laneUnits.reduce((max, unit) => Math.max(max, unit.wave), 0);
  for (const unit of integrationUnits) {
    if (laneUnits.length > 0 && unit.wave <= maxLaneWave) {
      error('integration_before_lanes', `phase "${unit.phase}" (wave ${unit.wave}) is integration work (files outside every lane) but lane units run up to wave ${maxLaneWave} — move it to a later solo wave or assign its files to a lane`, { phase: unit.phase, wave: unit.wave });
    }
  }
  const byWave = new Map();
  for (const unit of units) {
    if (!byWave.has(unit.wave)) byWave.set(unit.wave, []);
    byWave.get(unit.wave).push(unit);
  }
  for (const [wave, members] of byWave) {
    for (let i = 0; i < members.length; i += 1) {
      for (let j = i + 1; j < members.length; j += 1) {
        const left = new Set(members[i].files.map((f) => f.toLowerCase()));
        const shared = members[j].files.filter((f) => left.has(f.toLowerCase()));
        if (shared.length > 0) error('wave_file_overlap', `wave ${wave}: phases "${members[i].phase}" and "${members[j].phase}" run in parallel but share ${shared.join(', ')}`, { wave, phases: [members[i].phase, members[j].phase] });
      }
    }
  }
  for (const unit of units) {
    if (laneOrder.includes(unit.id)) error('unit_lane_id_collision', `unit id "${unit.id}" collides with a lane id`, { unit: unit.id });
  }

  // ── dependencies → edges (explicit passage rules; no column = the wave barrier) ──
  const unitByPhase = new Map();
  for (const unit of units) {
    const label = String(unit.phase).trim().toLowerCase();
    if (!unitByPhase.has(label)) unitByPhase.set(label, unit);
    if (unit.phase_number !== null && !unitByPhase.has(`#${unit.phase_number}`)) unitByPhase.set(`#${unit.phase_number}`, unit);
  }
  // A label names one row (`1-backend`); a bare phase number names every row
  // of that phase — a phase cut per lane is still one phase to depend on.
  const resolvePhaseRefs = (ref) => {
    const key = String(ref).trim().toLowerCase();
    if (unitByPhase.has(key)) return [unitByPhase.get(key)];
    const byId = units.find((unit) => unit.id === key);
    if (byId) return [byId];
    const number = phaseNumberString(ref);
    if (number !== null) return units.filter((unit) => unit.phase_number === number);
    return [];
  };
  const edges = [];
  const interfaceContract = [prdContent, planContent].some((document) => document && extractSection(document, ['Interface Contract', 'Contrato de Interface']) !== null);
  const crossLaneWarned = new Set();
  for (const unit of units) {
    const seen = new Set();
    for (const dep of dependencyRows.get(unit.id) || []) {
      const targets = resolvePhaseRefs(dep.phase);
      if (targets.length === 0) {
        error('dependency_unknown', `phase "${unit.phase}" depends on "${dep.phase}", which is not a phase of the Execution Sequence`, { phase: unit.phase, dependency: dep.phase });
        continue;
      }
      for (const target of targets) {
      if (target.id === unit.id) {
        error('dependency_self', `phase "${unit.phase}" depends on itself`, { phase: unit.phase });
        continue;
      }
      if (seen.has(target.id)) continue;
      seen.add(target.id);
      if (!DEPENDENCY_GATES.includes(dep.gate)) {
        error('dependency_gate_invalid', `phase "${unit.phase}" depends on "${target.phase}" with gate "${dep.gate}" — use (dev) or (qa)`, { phase: unit.phase, dependency: target.phase });
        continue;
      }
      if (target.wave >= unit.wave) {
        error('dependency_wave_violation', `phase "${unit.phase}" (wave ${unit.wave}) depends on "${target.phase}" (wave ${target.wave}) — a dependency must sit in an earlier wave`, { phase: unit.phase, dependency: target.phase, wave: unit.wave, dependency_wave: target.wave });
      }
      if (unit.owner === 'lane' && target.owner === 'integration') {
        error('dependency_on_integration', `phase "${unit.phase}" depends on "${target.phase}", integration work the session DEV runs after the lanes — assign "${target.phase}" to a lane or schedule "${unit.phase}" as integration too`, { phase: unit.phase, dependency: target.phase });
      }
      if (unit.owner === 'lane' && target.owner === 'lane' && unit.lane !== target.lane && !interfaceContract) {
        const key = `${target.lane}>${unit.lane}`;
        if (!crossLaneWarned.has(key)) {
          crossLaneWarned.add(key);
          warn('dependency_cross_lane_without_contract', `"${unit.phase}" (${unit.lane}) depends on "${target.phase}" (${target.lane}) but the PRD has no \`## Interface Contract\` section — the shared boundary lives only in prose`, { from: target.id, to: unit.id, lanes: [target.lane, unit.lane] });
        }
      }
      unit.depends_on.push({ unit: target.id, gate: dep.gate });
      edges.push({ from: target.id, to: unit.id, gate: dep.gate });
      }
    }
  }
  const cyclic = topologicalRemainder(units.map((unit) => unit.id), edges);
  if (cyclic.length > 0) error('cycle_detected', `the dependencies form a cycle through ${cyclic.join(', ')} — passage rules must form an acyclic graph`, { units: cyclic });

  // ── excerpts: CAPs → ACs, verification commands ──────────────────────────
  const excerpts = readPlanExcerpts(planContent, prdContent);
  if (!excerpts.prd_present) warn('prd_missing', `${prdRelative(feature)} not found — unit prompts carry no acceptance-criteria excerpts`);
  for (const unit of units) {
    if (unit.caps.length === 0) {
      const byPhase = excerpts.delivery.filter((row) => row.phase_number && row.phase_number === unit.phase_number).flatMap((row) => row.caps);
      const fileSet = new Set(unit.files.map((f) => f.toLowerCase()));
      const byPaths = excerpts.delta.filter((row) => row.paths.some((p) => fileSet.has(p.toLowerCase()))).flatMap((row) => row.caps);
      unit.caps = [...new Set([...byPhase, ...byPaths])];
    }
    const capSet = new Set(unit.caps.map((cap) => cap.toLowerCase()));
    unit.acs = [...new Set([...unit.acs, ...excerpts.acceptance.filter((row) => row.caps.some((cap) => capSet.has(cap.toLowerCase()))).map((row) => row.ac).filter(Boolean)])];
    unit.verification = excerpts.delivery
      .filter((row) => row.verification && row.caps.some((cap) => capSet.has(cap.toLowerCase())))
      .map((row) => ({ cap: row.caps[0] || null, command: row.verification }));
    if (policy && unit.owner === 'lane') {
      unit.integration_verification = unit.verification;
      unit.verification = unit.done ? [{ cap: null, command: unit.done }] : [];
      if (!unit.done) error('unit_verification_missing', `${unit.id}: declare the local verification in Done when; shared capability checks belong to integration`);
    }
    if (unit.owner === 'lane' && unit.caps.length === 0) warn('unit_without_cap', `unit ${unit.id} (phase "${unit.phase}") cites no CAP-* in its scope and none could be inferred from the delivery plan or the implementation delta`, { unit: unit.id });
  }
  // ── unit load (advisory): one process is one context ─────────────────────
  for (const unit of laneUnits) {
    const reasons = [];
    if (unit.files.length > ceiling.max_files) reasons.push(`${unit.files.length} files (ceiling ${ceiling.max_files})`);
    if (unit.acs.length > ceiling.max_acs) reasons.push(`${unit.acs.length} acceptance criteria (ceiling ${ceiling.max_acs})`);
    if (reasons.length > 0) {
      if (policy) error('unit_budget_exceeded', `${unit.id}: split this unit before execution (${reasons.join('; ')})`, { unit: unit.id, ceiling });
      warn('unit_over_budget', `unit ${unit.id} (phase "${unit.phase}") carries ${reasons.join(' and ')} for one context — cut it on disjoint files inside wave ${unit.wave} (a row per lane or surface, an Interface Contract row per boundary), or move ${UNIT_MAX_FILES_ENV}/${UNIT_MAX_ACS_ENV} deliberately`, { unit: unit.id, files: unit.files.length, acs: unit.acs.length, ceiling });
    }
    const surfaces = measureSurfaces(unit.files);
    if (surfaces.two_sided) {
      const named = (surface) => surfaces.files.filter((item) => item.surface === surface && !item.test).map((item) => item.path);
      warn('unit_spans_surfaces', `unit ${unit.id} (phase "${unit.phase}") writes backend (${named('backend').join(', ')}) and frontend (${named('frontend').join(', ')}) files in one context — one row per lane/surface in the same wave, joined by Interface Contract rows (IF-*), lets each side run on its own model`, { unit: unit.id, backend: named('backend'), frontend: named('frontend') });
    }
  }
  if (laneOrder.length === 1 && laneUnits.length > 1 && [...byWave.values()].every((members) => members.filter((unit) => unit.owner === 'lane').length <= 1)) {
    warn('orchestration_serial', `one lane ("${laneOrder[0]}") owning every write path and one unit per wave: this run buys a fresh context and a lane review per unit, never parallelism — lanes are the model axis (one {lane}_dev role each); cut the rows per surface inside a wave, or record execution: single in the plan`, { lane: laneOrder[0], units: laneUnits.length, waves: byWave.size });
  }
  const coveredCaps = new Set(units.flatMap((unit) => unit.caps.map((cap) => cap.toLowerCase())));
  const plannedCaps = [...new Set([...excerpts.delivery, ...excerpts.delta].flatMap((row) => row.caps))];
  for (const cap of plannedCaps) {
    if (!coveredCaps.has(cap.toLowerCase())) warn('cap_without_unit', `${cap} appears in the delivery plan or implementation delta but no execution unit cites it`, { cap });
  }

  // ── profile / run state ──────────────────────────────────────────────────
  if (!profile || !profile.ok) {
    error(profile?.reason || 'dev_profile_unavailable', profile?.reason === 'dev_kernel_missing'
      ? `${DEV_KERNEL_RELATIVE_PATH} not found — the dev-lane profile derives from the installed DEV kernel (run aioson update)`
      : `${DEV_KERNEL_RELATIVE_PATH} lost the section(s) ${(profile?.missing || []).join(', ')} the dev-lane profile derives from`);
  }
  if (runState && !TERMINAL_RUN_STATES.includes(runState.status)) {
    warn('active_run_state', `agent-execution-state-${feature}.json is ${runState.status}; recompiling changes the manifest digest, so that run can no longer be resumed — start a new run`);
  }

  if (errors.length > 0) return { errors, warnings, plan: null };

  // ── plan document ────────────────────────────────────────────────────────
  const maxWave = units.reduce((max, unit) => Math.max(max, unit.wave), 0);
  const promptsDir = promptsRelative(feature);
  const prompts = [];
  for (const unit of laneUnits) {
    const { text, context } = renderUnitPrompt({ feature, unit, lane: lanes[unit.lane], maxWave, profileText: profile.text, excerpts, prototype });
    unit.context = context;
    if (policy) {
      const dev = lanes[unit.lane].dev;
      unit.context.window = contextWindow(policy, dev.host, dev.model);
    }
    unit.prompt = `${promptsDir}/${unit.id}.md`;
    unit.prompt_digest = sha256(text);
    unit.report = `.aioson/context/reports/${feature}/{run_id}/${unit.id}.json`;
    unit.qa_report = `.aioson/context/reports/${feature}/{run_id}/${unit.id}-qa.json`;
    prompts.push({ path: unit.prompt, text, digest: unit.prompt_digest, unit: unit.id, lane: unit.lane });
  }
  const lanePrompts = {};
  for (const laneId of laneOrder) {
    const laneUnitList = laneUnits.filter((unit) => unit.lane === laneId).sort((a, b) => a.wave - b.wave);
    const text = renderLanePrompt({ feature, lane: lanes[laneId], laneId, units: laneUnitList, maxWave, profileText: profile.text });
    const relative = `${promptsDir}/${laneId}.md`;
    lanePrompts[laneId] = { path: relative, digest: sha256(text) };
    prompts.push({ path: relative, text, digest: sha256(text), lane: laneId, unit: null });
  }
  const waves = [...byWave.entries()].sort((a, b) => a[0] - b[0]).map(([wave, members]) => ({
    wave,
    units: members.map((unit) => unit.id),
    lane_units: members.filter((unit) => unit.owner === 'lane').length,
    integration_units: members.filter((unit) => unit.owner === 'integration').length
  }));
  const plan = {
    version: EXECUTION_PLAN_VERSION,
    ...(policy ? { policy } : {}),
    generator: GENERATOR,
    feature,
    generated_at: new Date().toISOString(),
    source: {
      plan: implementationPlanRelative(feature),
      plan_digest: sha256(planContent),
      prd: excerpts.prd_present ? prdRelative(feature) : null,
      prd_digest: excerpts.prd_present ? sha256(prdContent) : null,
      roles: EXECUTION_ROLES_RELATIVE_PATH,
      roles_digest: roles?.digest || null,
      roles_runtime: true,
      // The client's binding rules are part of what the units were compiled
      // under: a rule edited mid-run is measurable, not invisible.
      rules: RULES_RELATIVE_PATH,
      rules_digest: rules?.digest || null,
      rules_files: rules?.files || 0,
      dev_profile: { source: profile.source, sections: profile.sections, digest: profile.digest },
      manifest_digest: null
    },
    lanes: Object.fromEntries(laneOrder.map((laneId) => {
      const lane = lanes[laneId];
      return [laneId, {
        write_paths: lane.write_paths,
        integration_owner: 'dev',
        dev: lane.dev,
        qa: { ...lane.qa, max_fix_files: manifest?.development_lanes?.lanes?.[laneId]?.qa?.max_fix_files ?? DEFAULT_QA_MAX_FIX_FILES, max_rework_rounds: manifest?.development_lanes?.lanes?.[laneId]?.qa?.max_rework_rounds ?? policy?.qa.max_rework_rounds ?? 0 },
        prompt: lanePrompts[laneId].path,
        prompt_digest: lanePrompts[laneId].digest,
        plan_host: lane.plan_host,
        plan_model: lane.plan_model,
        units: laneUnits.filter((unit) => unit.lane === laneId).map((unit) => unit.id)
      }];
    })),
    parallel: { max_concurrent_lanes: roles?.parallel?.max_concurrent_lanes || 1 },
    on_unavailable: roles?.on_unavailable || 'ask',
    scheduling: edges.length > 0 ? 'dependencies' : 'waves',
    waves,
    edges,
    units,
    integration: {
      owner: 'dev',
      units: integrationUnits.map((unit) => unit.id),
      role: roles?.roles?.integration_dev ? { role: 'integration_dev', ...roles.roles.integration_dev } : null,
      ...(policy ? { verification: [...new Map(units.flatMap(unit => unit.integration_verification || unit.verification || []).map(item => [`${item.cap}:${item.command}`, item])).values()] } : {})
    },
    warnings,
    summary: {
      lanes: laneOrder.length,
      units: units.length,
      lane_units: laneUnits.length,
      integration_units: integrationUnits.length,
      waves: waves.length,
      edges: edges.length,
      processes: laneUnits.length * 2,
      parallelism: measureParallelism(laneUnits),
      ceiling: { max_files: ceiling.max_files, max_acs: ceiling.max_acs },
      context_bytes_max: laneUnits.reduce((max, unit) => Math.max(max, (unit.context?.prompt_bytes || 0) + (unit.context?.reads || []).reduce((sum, read) => sum + (read.bytes || 0), 0)), 0)
    }
  };
  return { errors, warnings, plan, prompts };
}

/**
 * The compiled graph as numbers: how many lane units one wave can run at
 * once, the longest dependency chain (a unit with edges waits for them; one
 * without keeps the wave barrier), and that chain in processes (dev + qa).
 */
function measureParallelism(laneUnits) {
  const byWave = new Map();
  for (const unit of laneUnits) {
    if (!byWave.has(unit.wave)) byWave.set(unit.wave, []);
    byWave.get(unit.wave).push(unit);
  }
  const waves = [...byWave.entries()].sort((a, b) => a[0] - b[0]).map(([, members]) => members);
  const depth = new Map();
  let previous = [];
  for (const members of waves) {
    for (const unit of members) {
      const deps = unit.depends_on.length > 0
        ? unit.depends_on.map((dep) => laneUnits.find((candidate) => candidate.id === dep.unit)).filter((candidate) => candidate && depth.has(candidate))
        : previous;
      depth.set(unit, 1 + Math.max(0, ...deps.map((candidate) => depth.get(candidate))));
    }
    previous = members;
  }
  const chain = Math.max(0, ...depth.values());
  const maxConcurrent = Math.max(0, ...waves.map((members) => members.length));
  return { max_concurrent_units: maxConcurrent, serial_chain: chain, critical_path_processes: chain * 2, serial: laneUnits.length > 1 && maxConcurrent === 1 };
}

/**
 * Kahn's algorithm over explicit edges: the ids that never reach indegree 0
 * are on (or behind) a cycle. Empty result = acyclic.
 */
function topologicalRemainder(ids, edges) {
  const indegree = new Map(ids.map((id) => [id, 0]));
  const out = new Map(ids.map((id) => [id, []]));
  for (const edge of edges || []) {
    if (!indegree.has(edge.from) || !indegree.has(edge.to)) continue;
    indegree.set(edge.to, indegree.get(edge.to) + 1);
    out.get(edge.from).push(edge.to);
  }
  const queue = ids.filter((id) => indegree.get(id) === 0);
  const visited = new Set();
  while (queue.length > 0) {
    const id = queue.shift();
    visited.add(id);
    for (const next of out.get(id)) {
      indegree.set(next, indegree.get(next) - 1);
      if (indegree.get(next) === 0) queue.push(next);
    }
  }
  return ids.filter((id) => !visited.has(id));
}

/** Apply the compiled lanes to the manifest — ONLY development_lanes + orchestration.execution. */
function applyPlanToManifest(manifest, plan) {
  const next = JSON.parse(JSON.stringify(manifest));
  const feature = plan.feature;
  next.development_lanes = next.development_lanes || { strategy: 'single', integration_owner: 'dev', lanes: {} };
  next.development_lanes.strategy = 'split';
  next.development_lanes.integration_owner = 'dev';
  next.development_lanes.lanes = next.development_lanes.lanes || {};
  for (const [laneId, lane] of Object.entries(plan.lanes)) {
    const existing = next.development_lanes.lanes[laneId] || {};
    const entry = {
      ...existing,
      enabled: true,
      host: lane.dev.host,
      mode: 'external',
      model: lane.dev.model,
      writable_roots: Array.isArray(existing.writable_roots) ? existing.writable_roots : [],
      prompt: lane.prompt,
      write_paths: lane.write_paths,
      fallbacks: Array.isArray(existing.fallbacks) ? existing.fallbacks : [],
      report: typeof existing.report === 'string' && existing.report.includes('{run_id}')
        ? existing.report
        : `.aioson/context/reports/${feature}/{run_id}/dev-${laneId}.json`,
      qa: {
        ...(existing.qa && typeof existing.qa === 'object' ? existing.qa : {}),
        host: lane.qa.host,
        model: lane.qa.model,
        report: existing.qa && typeof existing.qa.report === 'string' && existing.qa.report.includes('{run_id}')
          ? existing.qa.report
          : `.aioson/context/reports/${feature}/{run_id}/qa-${laneId}.json`,
        max_fix_files: lane.qa.max_fix_files,
        max_rework_rounds: lane.qa.max_rework_rounds
      }
    };
    if (lane.dev.reasoning_effort) entry.reasoning_effort = lane.dev.reasoning_effort;
    else delete entry.reasoning_effort;
    if (lane.qa.reasoning_effort) entry.qa.reasoning_effort = lane.qa.reasoning_effort;
    else delete entry.qa.reasoning_effort;
    next.development_lanes.lanes[laneId] = entry;
  }
  for (const [laneId, entry] of Object.entries(next.development_lanes.lanes)) {
    if (!plan.lanes[laneId]) entry.enabled = false;
  }
  if (!next.orchestration || typeof next.orchestration !== 'object') {
    const base = manifestDefaults(feature, next.host || 'codex').orchestration;
    next.orchestration = { ...base, mode: 'inherit' };
  }
  next.orchestration.execution = 'orchestrated';
  return next;
}

function manifestLaneView(entry) {
  if (!entry) return null;
  return {
    enabled: entry.enabled === true,
    host: entry.host,
    model: entry.model,
    reasoning_effort: entry.reasoning_effort || null,
    write_paths: [...(entry.write_paths || [])].map(normalizeRel),
    prompt: entry.prompt,
    qa: entry.qa ? { host: entry.qa.host, model: entry.qa.model, reasoning_effort: entry.qa.reasoning_effort || null } : null
  };
}

function planLaneView(lane) {
  return {
    enabled: true,
    host: lane.dev.host,
    model: lane.dev.model,
    reasoning_effort: lane.dev.reasoning_effort || null,
    write_paths: lane.write_paths.map(normalizeRel),
    prompt: lane.prompt,
    qa: { host: lane.qa.host, model: lane.qa.model, reasoning_effort: lane.qa.reasoning_effort || null }
  };
}

/**
 * The prototype the plan frontmatter binds (`prototype: <path>`), with its
 * size on disk — the one read a frontend unit is told to make, measured.
 */
async function readPrototypeRead(projectDir, planContent) {
  const frontmatter = String(planContent || '').match(/^---\r?\n([\s\S]*?)\r?\n---/);
  const line = frontmatter ? frontmatter[1].match(/^prototype:\s*(.+)$/m) : null;
  const value = line ? cleanCell(line[1]).trim() : '';
  if (!value || /^(?:null|none|~)$/i.test(value) || !isSafeRelative(normalizeRel(value))) return null;
  const relative = normalizeRel(value);
  try {
    const stat = await fs.stat(path.join(projectDir, ...relative.split('/')));
    return { path: relative, bytes: stat.isFile() ? stat.size : null };
  } catch {
    return { path: relative, bytes: null };
  }
}

async function readRunState(projectDir, feature, prefix = 'agent-execution-state') {
  const content = await readFileSafe(path.join(projectDir, '.aioson', 'context', `${prefix}-${feature}.json`));
  if (!content) return null;
  try {
    return JSON.parse(content);
  } catch {
    return null;
  }
}

/**
 * Full compile against the project tree. `dryRun` computes without writing.
 */
async function compileFeatureExecution(projectDir, featureInput, { env = process.env, now = Date.now(), dryRun = false, kernelPath } = {}) {
  const feature = assertFeatureSlug(featureInput);
  const planFile = path.join(projectDir, ...implementationPlanRelative(feature).split('/'));
  const planContent = await readFileSafe(planFile);
  if (planContent === null) {
    return { ok: false, reason: 'plan_not_found', feature, errors: [{ check: 'plan_not_found', message: `${implementationPlanRelative(feature)} not found — @planner produces it (Gate C)` }], warnings: [] };
  }
  const rolesRead = await readExecutionRoles(projectDir);
  if (!rolesRead.ok || !rolesRead.enabled) {
    return {
      ok: false,
      reason: 'roles_unavailable',
      feature,
      roles_reason: rolesRead.reason,
      errors: [{ check: rolesRead.reason, message: rolesRead.reason === 'roles_file_missing'
        ? `${EXECUTION_ROLES_RELATIVE_PATH} not found — the orchestrated path is unlocked by the supervising client that validated the host signatures`
        : rolesRead.reason === 'roles_disabled'
          ? `${EXECUTION_ROLES_RELATIVE_PATH} is disabled (enabled: false)`
          : `${EXECUTION_ROLES_RELATIVE_PATH} is invalid`, errors: rolesRead.errors }],
      warnings: []
    };
  }
  const roles = { ...rolesRead.roles, digest: rolesRead.digest };
  const rules = await rulesDigest(projectDir);
  const store = await readSignatures({ env });
  const profile = await buildDevLaneProfile(projectDir, { kernelPath });
  const prdContent = await readFileSafe(path.join(projectDir, ...prdRelative(feature).split('/')));
  const loaded = await loadManifest(projectDir, feature);
  if (loaded.exists && !loaded.ok) {
    return { ok: false, reason: 'manifest_invalid', feature, errors: [{ check: 'manifest_invalid', message: `${path.relative(projectDir, loaded.path)} is invalid`, errors: loaded.errors }], warnings: [] };
  }
  const runState = await readRunState(projectDir, feature);
  const policyRead = await readExecutionPolicy(projectDir);
  if (!policyRead.ok) return { ok: false, reason: 'execution_policy_invalid', feature, errors: policyRead.errors.map(message => ({ check: 'execution_policy_invalid', message })), warnings: [] };
  const compiled = compileExecutionPlan({
    feature,
    planContent,
    prdContent,
    roles,
    rules,
    signatures: { store, now },
    profile,
    manifest: loaded.exists ? loaded.manifest : null,
    runState,
    policy: policyRead.policy,
    ceiling: unitCeiling(env),
    prototype: await readPrototypeRead(projectDir, planContent)
  });
  if (compiled.errors.length > 0) {
    return { ok: false, reason: 'compile_refused', feature, errors: compiled.errors, warnings: compiled.warnings };
  }
  // Reserve half the operational budget for subsequent reads, tools and output.
  // This byte estimate is a preflight heuristic, never measured model usage.
  for (const unit of compiled.plan.units.filter(item => item.owner === 'lane')) {
    const files = [];
    for (const relative of unit.files) {
      try {
        const stat = await fs.stat(path.join(projectDir, relative));
        if (!stat.isFile() || !(await resolveExistingInsideRoot(projectDir, relative)).ok) throw new Error('not an in-project file');
        const ranges = (unit.read_ranges || []).filter(item => item.path === relative);
        if (ranges.length) {
          const lines = (await fs.readFile(path.join(projectDir, relative), 'utf8')).split(/(?<=\n)/);
          if (ranges.some(range => range.end > lines.length)) {
            compiled.errors.push({ check: 'read_range_out_of_bounds', unit: unit.id, path: relative, lines: lines.length });
          }
          const selected = new Set();
          for (const range of ranges) for (let i = range.start - 1; i < Math.min(range.end, lines.length); i += 1) selected.add(i);
          files.push({ path: relative, bytes: [...selected].reduce((sum, i) => sum + Buffer.byteLength(lines[i], 'utf8'), 0), total_bytes: stat.size, ranges });
        } else files.push({ path: relative, bytes: stat.size });
      } catch (error) {
        if (error.code === 'ENOENT') {
          files.push({ path: relative, bytes: 0, new_file: true });
          if (unit.read_ranges?.some(range => range.path === relative)) compiled.errors.push({ check: 'read_range_missing_file', unit: unit.id, path: relative });
        }
        else compiled.errors.push({ check: 'unit_source_unreadable', unit: unit.id, path: relative });
      }
    }
    unit.context.source_files = files;
    const bytes = unit.context.prompt_bytes + files.reduce((sum, item) => sum + item.bytes, 0) + unit.context.reads.reduce((sum, item) => sum + (item.bytes || 0), 0);
    unit.context.estimated_initial_tokens = Math.ceil(bytes / 2);
    unit.context.estimate_basis = 'utf8_bytes_divided_by_2';
    compiled.plan.summary.context_bytes_max = Math.max(compiled.plan.summary.context_bytes_max, bytes);
  }
  if (compiled.errors.length) return { ok: false, reason: 'compile_refused', feature, errors: compiled.errors, warnings: compiled.warnings };
  const baseManifest = loaded.exists ? loaded.manifest : manifestDefaults(feature, roles.roles.integration_dev?.host || roles.roles.qa?.host || 'codex');
  const nextManifest = applyPlanToManifest(baseManifest, compiled.plan);
  compiled.plan.source.manifest_digest = manifestDigest(nextManifest);
  const planRelative = executionPlanRelative(feature);
  if (dryRun) {
    return { ok: true, dry_run: true, feature, path: planRelative, plan: compiled.plan, manifest: { path: path.relative(projectDir, loaded.path), would_create: !loaded.exists }, prompts: compiled.prompts.map((p) => p.path), warnings: compiled.warnings, summary: compiled.plan.summary };
  }

  let manifestCreated = false;
  if (!loaded.exists) {
    const created = await initManifest(projectDir, feature, baseManifest.host);
    manifestCreated = created.created;
  }
  const written = await writeManifest(projectDir, feature, nextManifest);

  const promptsDirAbs = path.join(projectDir, ...promptsRelative(feature).split('/'));
  await fs.mkdir(promptsDirAbs, { recursive: true });
  const keep = new Set(compiled.prompts.map((p) => path.basename(p.path)));
  for (const entry of await fs.readdir(promptsDirAbs)) {
    if (entry.endsWith('.md') && !keep.has(entry)) await fs.rm(path.join(promptsDirAbs, entry), { force: true });
  }
  for (const prompt of compiled.prompts) {
    await fs.writeFile(path.join(projectDir, ...prompt.path.split('/')), prompt.text, 'utf8');
  }
  const planFileAbs = executionPlanPath(projectDir, feature);
  const tmp = `${planFileAbs}.${process.pid}.${crypto.randomUUID()}.tmp`;
  await fs.writeFile(tmp, `${JSON.stringify(compiled.plan, null, 2)}\n`, 'utf8');
  await fs.rename(tmp, planFileAbs);

  return {
    ok: true,
    feature,
    path: planRelative,
    plan: compiled.plan,
    manifest: { path: path.relative(projectDir, written.path), digest: written.digest, created: manifestCreated, updated: true },
    prompts: compiled.prompts.map((p) => p.path),
    warnings: compiled.warnings,
    summary: compiled.plan.summary,
    availability: 'compiled'
  };
}

async function readExecutionPlan(projectDir, featureInput) {
  const feature = assertFeatureSlug(featureInput);
  const file = executionPlanPath(projectDir, feature);
  const content = await readFileSafe(file);
  if (content === null) return { exists: false, path: file, plan: null };
  try {
    return { exists: true, path: file, plan: JSON.parse(content) };
  } catch (error) {
    return { exists: true, path: file, plan: null, error: error.message };
  }
}

/**
 * verify:artifact kind=execution-plan — is the compiled plan still true?
 * Digest-bound to the plan, the roles file, the manifest lanes, the prompts
 * and the host signatures on this machine.
 */
async function verifyExecutionPlan(projectDir, featureInput, { env = process.env, now = Date.now() } = {}) {
  const feature = assertFeatureSlug(featureInput);
  const issues = [];
  const warnings = [];
  const checks = [];
  const check = (id, ok, detail) => checks.push({ id, ok, detail: detail || null });
  const read = await readExecutionPlan(projectDir, feature);
  const recompile = `aioson execution:compile . --feature=${feature}`;
  if (!read.exists) {
    issues.push(`${executionPlanRelative(feature)} not found — run: ${recompile}`);
    return { ok: false, issues, warnings, checks: [{ id: 'execution-plan:present', ok: false, detail: 'missing' }], metrics: null };
  }
  if (!read.plan) {
    issues.push(`${executionPlanRelative(feature)} is not valid JSON (${read.error}) — run: ${recompile}`);
    return { ok: false, issues, warnings, checks: [{ id: 'execution-plan:present', ok: false, detail: 'invalid json' }], metrics: null };
  }
  const plan = read.plan;
  check('execution-plan:present', true);
  if (plan.version !== EXECUTION_PLAN_VERSION) issues.push(`execution plan version ${plan.version} is not ${EXECUTION_PLAN_VERSION} — run: ${recompile}`);
  if (plan.feature !== feature) issues.push(`execution plan belongs to feature "${plan.feature}", not "${feature}"`);

  // plan / prd / roles digests
  const planContent = await readFileSafe(path.join(projectDir, ...implementationPlanRelative(feature).split('/')));
  const planFresh = planContent !== null && sha256(planContent) === plan.source?.plan_digest;
  check('execution-plan:plan-digest', planFresh, planFresh ? null : 'plan_digest_stale');
  if (planContent === null) issues.push(`${implementationPlanRelative(feature)} not found — the compiled plan has no source`);
  else if (!planFresh) issues.push(`plan_digest_stale: ${implementationPlanRelative(feature)} changed after compilation — run: ${recompile}`);
  if (plan.source?.prd) {
    const prdContent = await readFileSafe(path.join(projectDir, ...String(plan.source.prd).split('/')));
    if (prdContent === null || sha256(prdContent) !== plan.source.prd_digest) warnings.push(`prd_digest_stale: ${plan.source.prd} changed after compilation — unit prompts carry its previous acceptance criteria; recompile to refresh`);
  }
  // Plans compiled before the rules digest existed carry no key: nothing to compare.
  if (plan.source && Object.prototype.hasOwnProperty.call(plan.source, 'rules_digest')) {
    const rules = await rulesDigest(projectDir);
    if (rules.digest !== plan.source.rules_digest) {
      warnings.push(`rules_changed: ${RULES_RELATIVE_PATH} changed after compilation (${plan.source.rules_files || 0} → ${rules.files} binding rule file(s)) — units that already passed were reviewed under the previous rules; run rules:check at integration and recompile to refresh`);
    }
  }
  const rolesRead = await readExecutionRoles(projectDir);
  // Bound to the binding digest (what shapes the units); a plan compiled
  // before the split carries the raw file digest and stays fresh until the
  // file changes — nobody is sent to recompile by an upgrade alone.
  const legacyRuntimeCompatible = plan.source?.roles_runtime !== true && rolesRead.ok && rolesRead.enabled
    && rolesRead.roles.parallel?.max_concurrent_lanes === plan.parallel?.max_concurrent_lanes
    && rolesRead.roles.on_unavailable === plan.on_unavailable
    && rolesRead.roles.execution?.require_independent_qa !== true;
  const runtimeRolesFresh = plan.source?.roles_runtime === true && rolesRead.ok && rolesRead.enabled;
  const rolesFresh = rolesRead.present && (runtimeRolesFresh || rolesRead.digest === plan.source?.roles_digest
    || (rolesRead.file_digest !== undefined && rolesRead.file_digest === plan.source?.roles_digest)
    || legacyRuntimeCompatible);
  check('execution-plan:roles', rolesFresh, rolesFresh ? null : (rolesRead.present ? 'roles_changed' : rolesRead.reason));
  if (!rolesRead.present) issues.push(`${EXECUTION_ROLES_RELATIVE_PATH} not found — the orchestrated path is not unlocked on this project`);
  else if (!rolesRead.ok) issues.push(`${EXECUTION_ROLES_RELATIVE_PATH} is invalid — ${rolesRead.errors.map((e) => `${e.path}: ${e.message}`).join('; ')}`);
  else if (!rolesRead.enabled) issues.push(`${EXECUTION_ROLES_RELATIVE_PATH} is disabled (enabled: false)`);
  else if (!rolesFresh) issues.push(`roles_changed: ${EXECUTION_ROLES_RELATIVE_PATH} changed after compilation — run: ${recompile}`);

  // dev-lane profile
  const profile = await buildDevLaneProfile(projectDir);
  const profileFresh = profile.ok && profile.digest === plan.source?.dev_profile?.digest;
  check('execution-plan:dev-profile', profileFresh, profileFresh ? null : (profile.ok ? 'dev_profile_stale' : profile.reason));
  if (!profile.ok) issues.push(`${DEV_KERNEL_RELATIVE_PATH}: ${profile.reason} — the dev-lane profile cannot be derived`);
  else if (!profileFresh) warnings.push(`dev_profile_stale: ${DEV_KERNEL_RELATIVE_PATH} changed after compilation — lane prompts carry the previous discipline; recompile to refresh`);

  // manifest lanes
  const loaded = await loadManifest(projectDir, feature);
  let manifestOk = loaded.exists && loaded.ok;
  if (!loaded.exists) issues.push(`agent-execution-${feature}.json not found — run: ${recompile}`);
  else if (!loaded.ok) issues.push(`agent-execution-${feature}.json is invalid — ${loaded.errors.map((e) => `${e.path}: ${e.message}`).join('; ')}`);
  else {
    const manifest = loaded.manifest;
    const diverged = [];
    if (manifest.development_lanes?.strategy !== 'split') diverged.push('development_lanes.strategy is not split');
    if (manifest.orchestration?.execution !== 'orchestrated') diverged.push('orchestration.execution is not orchestrated');
    for (const [laneId, lane] of Object.entries(plan.lanes || {})) {
      const view = manifestLaneView(manifest.development_lanes?.lanes?.[laneId]);
      if (!view) {
        diverged.push(`lane ${laneId} missing from the manifest`);
        continue;
      }
      const expected = planLaneView(lane);
      const differing = Object.keys(expected).filter((key) => JSON.stringify(expected[key]) !== JSON.stringify(view[key]));
      if (differing.length > 0) diverged.push(`lane ${laneId}: ${differing.join(', ')} differ`);
    }
    for (const [laneId, entry] of Object.entries(manifest.development_lanes?.lanes || {})) {
      if (!plan.lanes?.[laneId] && entry.enabled === true) diverged.push(`lane ${laneId} is enabled in the manifest but not compiled`);
    }
    if (diverged.length > 0) {
      manifestOk = false;
      issues.push(`manifest_lanes_diverged: ${diverged.join('; ')} — run: ${recompile}`);
    }
  }
  check('execution-plan:manifest', manifestOk, manifestOk ? null : 'manifest_lanes_diverged');

  // signatures on this machine — primaries are binding; declared fallbacks
  // are named: an automatic capacity fallback dispatches without a human in
  // the loop, so an unproven (host, model) hiding in fallbacks[] is worth a
  // warning every verify — but a backup that may never fire cannot block the
  // planner the way an unproven primary does.
  const store = await readSignatures({ env });
  const signatureFor = (role) => signatureState(findSignature(store, { host: role.host, model: role.model, reasoning_effort: role.reasoning_effort || null }), now);
  const roleLabel = (label, role) => `${label} ${role.host}/${role.model}${role.reasoning_effort ? `/${role.reasoning_effort}` : ''}`;
  const unsigned = [];
  const signatureFallbacks = [];
  for (const [laneId, lane] of Object.entries(plan.lanes || {})) {
    const selected = rolesRead.ok && rolesRead.enabled ? resolveLaneRoles(rolesRead.roles, laneId) : null;
    for (const kind of ['dev', 'qa']) {
      if (runtimeRolesFresh && !selected?.[kind]) {
        unsigned.push(`${laneId}.${kind} (role missing from the active runtime profile)`);
        continue;
      }
      const role = selected?.[kind] || lane[kind];
      if (!role) continue;
      const state = signatureFor(role);
      if (state !== 'valid') {
        const fallback = rolesRead.ok && rolesRead.enabled
          ? resolveProfileFallbacks(rolesRead.roles, laneId, kind).find(candidate => signatureFor(candidate) === 'valid')
          : null;
        if (fallback) signatureFallbacks.push(`${roleLabel(`${laneId}.${kind}`, role)} (${state}) → profile:${fallback.profile} ${fallback.host}/${fallback.model}`);
        else unsigned.push(`${roleLabel(`${laneId}.${kind}`, role)} (${state})`);
      }
    }
  }
  // The runtime reads fallbacks from the manifest lane entries, so that is
  // where they are proven.
  const fallbackUnsigned = [];
  if (rolesRead.ok && rolesRead.enabled) {
    for (const laneId of Object.keys(plan.lanes || {})) for (const kind of ['dev', 'qa']) {
      for (const fallback of resolveProfileFallbacks(rolesRead.roles, laneId, kind)) {
        const state = signatureFor(fallback);
        if (state !== 'valid') fallbackUnsigned.push(`${roleLabel(`${laneId}.${kind}.profile:${fallback.profile}`, fallback)} (${state})`);
      }
    }
  }
  if (loaded.exists && loaded.ok) {
    for (const [laneId, entry] of Object.entries(loaded.manifest.development_lanes?.lanes || {})) {
      if (entry.enabled !== true) continue;
      const fallbackCheck = (label) => (fallback, index) => {
        if (!fallback || !fallback.host || !fallback.model) return;
        const state = signatureFor(fallback);
        if (state !== 'valid') fallbackUnsigned.push(`${roleLabel(`${laneId}.${label}.fallbacks[${index}]`, fallback)} (${state})`);
      };
      (entry.fallbacks || []).forEach(fallbackCheck('dev'));
      (entry.qa?.fallbacks || []).forEach(fallbackCheck('qa'));
    }
  }
  check('execution-plan:signatures', unsigned.length === 0, unsigned.join('; ') || null);
  if (unsigned.length > 0) issues.push(`signature_missing: ${unsigned.join('; ')} — sign with aioson host:signature or reconfigure the roles`);
  if (signatureFallbacks.length > 0) warnings.push(`primary_signature_fallback: ${signatureFallbacks.join('; ')} — the signed fallback will be selected before dispatch`);
  check('execution-plan:fallback-signatures', fallbackUnsigned.length === 0, fallbackUnsigned.join('; ') || null);
  if (fallbackUnsigned.length > 0) warnings.push(`fallback_signature_missing: ${fallbackUnsigned.join('; ')} — an automatic capacity fallback would dispatch an unproven pair; sign it with aioson host:signature or drop it from the manifest`);

  // prompts
  const stalePrompts = [];
  const promptTargets = [
    ...(plan.units || []).filter((unit) => unit.owner === 'lane').map((unit) => ({ path: unit.prompt, digest: unit.prompt_digest, id: unit.id })),
    ...Object.entries(plan.lanes || {}).map(([laneId, lane]) => ({ path: lane.prompt, digest: lane.prompt_digest, id: laneId }))
  ];
  for (const target of promptTargets) {
    const content = target.path ? await readFileSafe(path.join(projectDir, ...String(target.path).split('/'))) : null;
    if (content === null) stalePrompts.push(`${target.id}: missing`);
    else if (sha256(content) !== target.digest) stalePrompts.push(`${target.id}: edited`);
  }
  check('execution-plan:prompts', stalePrompts.length === 0, stalePrompts.join('; ') || null);
  if (stalePrompts.length > 0) issues.push(`prompt_stale: ${stalePrompts.join('; ')} — compiled prompts are generated, never hand-edited; run: ${recompile}`);

  // wave consistency
  const waveIssues = [];
  const ids = new Set();
  for (const unit of plan.units || []) {
    if (ids.has(unit.id)) waveIssues.push(`duplicate unit id ${unit.id}`);
    ids.add(unit.id);
  }
  for (const wave of plan.waves || []) {
    if (!Array.isArray(wave.units) || wave.units.length === 0) waveIssues.push(`wave ${wave.wave} is empty`);
    const members = (plan.units || []).filter((unit) => (wave.units || []).includes(unit.id));
    for (let i = 0; i < members.length; i += 1) {
      for (let j = i + 1; j < members.length; j += 1) {
        const left = new Set((members[i].files || []).map((f) => f.toLowerCase()));
        if ((members[j].files || []).some((f) => left.has(f.toLowerCase()))) waveIssues.push(`wave ${wave.wave}: ${members[i].id} and ${members[j].id} share files`);
      }
    }
  }
  check('execution-plan:waves', waveIssues.length === 0, waveIssues.join('; ') || null);
  if (waveIssues.length > 0) issues.push(`waves_inconsistent: ${waveIssues.join('; ')} — run: ${recompile}`);

  // edges: every endpoint exists, gates are known, an edge moves to a later wave, no cycle, depends_on mirrors edges
  const edgeIssues = [];
  const unitIndex = new Map((plan.units || []).map((unit) => [unit.id, unit]));
  for (const edge of plan.edges || []) {
    const from = unitIndex.get(edge.from);
    const to = unitIndex.get(edge.to);
    if (!from || !to) {
      edgeIssues.push(`edge ${edge.from} → ${edge.to} names an unknown unit`);
      continue;
    }
    if (!DEPENDENCY_GATES.includes(edge.gate)) edgeIssues.push(`edge ${edge.from} → ${edge.to} has gate ${edge.gate}`);
    if (!(from.wave < to.wave)) edgeIssues.push(`edge ${edge.from} (wave ${from.wave}) → ${edge.to} (wave ${to.wave}) does not move to a later wave`);
  }
  for (const unit of plan.units || []) {
    for (const dep of unit.depends_on || []) {
      if (!(plan.edges || []).some((edge) => edge.from === dep.unit && edge.to === unit.id && edge.gate === dep.gate)) edgeIssues.push(`${unit.id} depends on ${dep.unit} (${dep.gate}) but no such edge is compiled`);
    }
  }
  const cyclic = topologicalRemainder([...unitIndex.keys()], plan.edges || []);
  if (cyclic.length > 0) edgeIssues.push(`cycle through ${cyclic.join(', ')}`);
  check('execution-plan:edges', edgeIssues.length === 0, edgeIssues.join('; ') || null);
  if (edgeIssues.length > 0) issues.push(`edges_inconsistent: ${edgeIssues.join('; ')} — run: ${recompile}`);

  const metrics = plan.summary ? { ...plan.summary } : null;
  return { ok: issues.length === 0, issues, warnings, checks, metrics };
}

module.exports = {
  DEFAULT_QA_MAX_FIX_FILES,
  DEPENDENCY_GATES,
  EXECUTION_PLAN_VERSION,
  PLAN_CANONICAL_SECTIONS,
  PRD_CANONICAL_SECTIONS,
  applyPlanToManifest,
  compileExecutionPlan,
  duplicatePhaseSections,
  duplicateSections,
  rulesDigest,
  RULES_RELATIVE_PATH,
  compileFeatureExecution,
  executionPlanPath,
  executionPlanRelative,
  pathOwns,
  promptsRelative,
  readExecutionPlan,
  renderLanePrompt,
  renderUnitPrompt,
  topologicalRemainder,
  verifyExecutionPlan,
  writePathsOverlap
};
