'use strict';

/**
 * Practice detectors — which ways of working a delivery used, read from the
 * artifacts aioson already produced. No model, no guess: each detector reads
 * files and answers true, false, or null when the practice cannot be
 * measured for this delivery (a null never counts on either side of a
 * comparison).
 *
 * The catalog is versioned (CATALOG_VERSION). A new aioson version may add a
 * detector; old records simply lack its id. Every detector is best-effort:
 * an unreadable source is null, never an exception in the caller's close.
 *
 * Detectors run inside feature:close BEFORE anything is rewritten or
 * archived (the workflow state, the features.md row and the feature folder
 * all change after that point).
 */

const fs = require('node:fs');
const path = require('node:path');
const { readText } = require('./ledger');

const CATALOG_VERSION = 1;
const SKIP_RULE_FILES = new Set(['readme.md']);

const LABELS = {
  visual_inputs: { 'pt-BR': 'Telas ou referências em imagem na entrada', en: 'Screens or image references as input' },
  document_inputs: { 'pt-BR': 'Documentos (PDF, Word) na entrada', en: 'Documents (PDF, Word) as input' },
  data_inputs: { 'pt-BR': 'Dados reais (planilha, SQL, JSON) na entrada', en: 'Real data (spreadsheet, SQL, JSON) as input' },
  identity_from_references: { 'pt-BR': 'Identidade visual extraída de referências', en: 'Visual identity extracted from references' },
  prototype_approved: { 'pt-BR': 'Protótipo aprovado antes do código', en: 'Prototype approved before code' },
  visual_directions: { 'pt-BR': 'Mais de uma direção visual explorada', en: 'More than one visual direction explored' },
  prd_reviewed: { 'pt-BR': 'PRD revisado pelo @sheldon', en: 'PRD reviewed by @sheldon' },
  phased_plan: { 'pt-BR': 'Plano em fases (@planner)', en: 'Phased plan (@planner)' },
  runtime_proven: { 'pt-BR': 'Build, boot e smoke provados', en: 'Build, boot and smoke proven' },
  browser_walkthrough: { 'pt-BR': 'Uso real no navegador', en: 'Real use in the browser' },
  shakedown: { 'pt-BR': 'Caçada pós-entrega (@shakedown)', en: 'Post-delivery hunt (@shakedown)' },
  decisions_recorded: { 'pt-BR': 'Decisões registradas', en: 'Decisions recorded' },
  tests_reported: { 'pt-BR': 'Relatório de testes (@tester)', en: 'Test report (@tester)' },
  project_rules: { 'pt-BR': 'Regras do projeto ativas', en: 'Project rules active' }
};

const SHAPE_LABELS = {
  'simple-plan': { 'pt-BR': 'Forma: simple plan', en: 'Shape: simple plan' },
  'single-dev': { 'pt-BR': 'Forma: DEV único', en: 'Shape: single DEV' },
  orchestrated: { 'pt-BR': 'Forma: orquestrada', en: 'Shape: orchestrated' }
};

function pick(labels, locale, fallback) {
  if (!labels) return fallback;
  return String(locale || '').toLowerCase().startsWith('pt') ? labels['pt-BR'] : labels.en;
}

function practiceLabel(id, locale) {
  return pick(LABELS[id], locale, id);
}

function shapeLabel(shape, locale) {
  return pick(SHAPE_LABELS[shape], locale, shape);
}

function exists(file) {
  try { fs.accessSync(file); return true; } catch { return false; }
}

/**
 * A feature artifact where it lives now: the context root while the feature
 * is open, done/{slug}/ once archived (a re-close reads the same evidence the
 * first close did). The path, or null.
 */
function findArtifact(ctx, fileName) {
  for (const dir of [ctx.ctxDir, path.join(ctx.ctxDir, 'done', ctx.slug)]) {
    const file = path.join(dir, fileName);
    if (exists(file)) return file;
  }
  return null;
}

function frontmatter(text) {
  const block = /^---\r?\n([\s\S]*?)\r?\n---/.exec(String(text || ''));
  const data = {};
  if (!block) return data;
  for (const line of block[1].split(/\r?\n/)) {
    const m = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(line);
    if (m) data[m[1]] = m[2].trim().replace(/^(["'])([\s\S]*)\1$/, '$2');
  }
  return data;
}

const MAX_SOURCE_FILES = 400;
// An image the briefing or a source plan points at: ![x](a.png), a bare path.
const IMAGE_REF_RE = /[\w./\\-]+\.(?:png|jpe?g|webp|gif|svg)\b/gi;

/** Files under `dir` (relative names), depth- and count-bounded; never follows links. */
function listFiles(dir, depth = 3, out = []) {
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const entry of entries) {
    if (out.length >= MAX_SOURCE_FILES || entry.name.startsWith('.') || entry.name === 'node_modules') continue;
    const full = path.join(dir, entry.name);
    if (entry.isFile()) out.push(full);
    else if (entry.isDirectory() && depth > 0) listFiles(full, depth - 1, out);
  }
  return out;
}

/** The briefing entry of this delivery: same slug, or the one that generated its PRD. */
async function briefingEntry(ctx) {
  try {
    const { readBriefingRegistry, findBriefing } = require('../refiner/briefing-registry');
    const data = await readBriefingRegistry(ctx.targetDir);
    return findBriefing(data, ctx.slug)
      || (data.briefings || []).find((b) => String(b.prd_generated || '').includes(`prd-${ctx.slug}.md`))
      || null;
  } catch {
    return null;
  }
}

/** Files the briefing's source_plans point at, kept inside the project. */
function sourcePlanFiles(targetDir, entry) {
  const root = path.resolve(targetDir);
  const files = [];
  for (const source of (entry && Array.isArray(entry.source_plans) ? entry.source_plans : [])) {
    if (!source || source === 'conversational') continue;
    const full = path.resolve(root, String(source));
    if (full !== root && !full.startsWith(root + path.sep)) continue;
    let stat;
    try { stat = fs.statSync(full); } catch { continue; }
    if (stat.isDirectory()) listFiles(full, 3, files);
    else if (stat.isFile()) files.push(full);
  }
  return files;
}

/** Images referenced inside markdown sources (the briefing itself, a source plan). */
function imageRefsIn(files) {
  let refs = 0;
  for (const file of files) {
    if (!/\.mdx?$/i.test(file)) continue;
    const text = readText(file);
    if (text) refs += (text.match(IMAGE_REF_RE) || []).length;
  }
  return refs;
}

/** Input files of the delivery's briefing, counted by family; null without any briefing input. */
async function inputFamilies(ctx) {
  try {
    const { collectBriefingSourceFiles, classifyPath } = require('../briefing-source-pack');
    const pack = await collectBriefingSourceFiles(ctx.targetDir, ctx.slug);
    const packFiles = pack && pack.ok ? (pack.files || []).map((f) => path.join(ctx.targetDir, f.path)) : [];
    const briefingDir = path.join(ctx.targetDir, '.aioson', 'briefings', ctx.slug);
    const entry = await briefingEntry(ctx);
    const files = [...packFiles, ...listFiles(path.join(briefingDir, 'references'), 1), ...sourcePlanFiles(ctx.targetDir, entry)];
    if (files.length === 0 && !entry && !exists(briefingDir)) return null;
    const counts = {};
    for (const file of files) {
      const { family } = classifyPath(path.relative(ctx.targetDir, file));
      counts[family] = (counts[family] || 0) + 1;
    }
    const embedded = imageRefsIn([...files, path.join(briefingDir, 'briefings.md')]);
    if (embedded > 0) counts.visual = (counts.visual || 0) + embedded;
    return counts;
  } catch {
    return null;
  }
}

function identityFromReferences(ctx) {
  const candidates = [
    path.join(ctx.targetDir, '.aioson', 'briefings', ctx.slug, 'identity.md'),
    path.join(ctx.ctxDir, 'done', ctx.slug, 'briefings', 'identity.md')
  ];
  const text = candidates.map(readText).find((t) => t !== null);
  if (text === undefined) return null;
  const fm = frontmatter(text);
  return fm.source === 'references' || fm.generated_by === 'reference-identity-extract';
}

async function prototypeApproved(ctx) {
  if (!ctx.prd) return null;
  try {
    const { validatePrototypeBinding } = require('../prototype-binding');
    const binding = await validatePrototypeBinding({ targetDir: ctx.targetDir, slug: ctx.slug, prd: ctx.prd });
    if (!binding || !binding.checks || binding.checks.prototype_exists !== true) return false;
    return binding.checks.manifest_status_approved === true;
  } catch {
    return null;
  }
}

function visualDirections(ctx) {
  const seed = readText(path.join(ctx.ctxDir, 'features', ctx.slug, 'design-seed.json'));
  if (seed === null) return null;
  try {
    const data = JSON.parse(seed);
    const seen = (Array.isArray(data.candidates) ? data.candidates.length : 0) + (Array.isArray(data.history) ? data.history.length : 0);
    return seen >= 2;
  } catch {
    return null;
  }
}

function prdReviewed(ctx) {
  if (!ctx.prd) return null;
  if (String(frontmatter(ctx.prd).sheldon_review || '').toLowerCase() === 'approved') return true;
  return findArtifact(ctx, `sheldon-enrichment-${ctx.slug}.md`) !== null;
}

function planText(ctx) {
  const file = findArtifact(ctx, `implementation-plan-${ctx.slug}.md`);
  return file ? readText(file) : null;
}

function phasedPlan(ctx) {
  const text = planText(ctx);
  if (text === null) return ctx.kind === 'simple-plan' ? null : false;
  try {
    const { parsePlanPhases } = require('../plan-document');
    return parsePlanPhases(text).length >= 2;
  } catch {
    return null;
  }
}

function runtimeProven(ctx) {
  const gate = ctx.integrity;
  if (!gate || gate.has_contract !== true || !gate.checkReport) return null;
  return gate.checkReport.ok === true;
}

function browserWalkthrough(ctx) {
  try {
    const { readBrowserEvidence } = require('../browser-evidence');
    const evidence = readBrowserEvidence(ctx.targetDir, ctx.slug);
    return evidence.reports.length > 0;
  } catch {
    return null;
  }
}

async function decisionsRecorded(ctx) {
  try {
    const { readDecisionCheckpoint } = require('../decision-checkpoint');
    const read = await readDecisionCheckpoint(ctx.targetDir, ctx.slug);
    if (!read.exists) return false;
    const items = read.checkpoint && Array.isArray(read.checkpoint.items) ? read.checkpoint.items : [];
    return items.length > 0;
  } catch {
    return null;
  }
}

function countRules(dir) {
  let total = 0;
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return 0; }
  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue;
    if (entry.isDirectory()) total += countRules(path.join(dir, entry.name));
    else if (entry.isFile() && entry.name.toLowerCase().endsWith('.md') && !SKIP_RULE_FILES.has(entry.name.toLowerCase())) total += 1;
  }
  return total;
}

/**
 * detectPractices(ctx) → { practices: { id: boolean|null }, shape, autopilot }
 * ctx: { targetDir, ctxDir, slug, kind, prd, integrity, plan }
 */
async function detectPractices(ctx) {
  const families = await inputFamilies(ctx);
  const has = (family) => (families === null ? null : (families[family] || 0) > 0);
  const practices = {
    visual_inputs: has('visual'),
    document_inputs: has('document'),
    data_inputs: families === null ? null : ((families.data || 0) + (families.database || 0) + (families.structured || 0)) > 0,
    identity_from_references: identityFromReferences(ctx),
    prototype_approved: await prototypeApproved(ctx),
    visual_directions: visualDirections(ctx),
    prd_reviewed: prdReviewed(ctx),
    phased_plan: phasedPlan(ctx),
    runtime_proven: runtimeProven(ctx),
    browser_walkthrough: browserWalkthrough(ctx),
    shakedown: findArtifact(ctx, `shakedown-${ctx.slug}.md`) !== null,
    decisions_recorded: await decisionsRecorded(ctx),
    tests_reported: findArtifact(ctx, `test-report-${ctx.slug}.md`) !== null,
    project_rules: countRules(path.join(ctx.targetDir, '.aioson', 'rules')) > 0
  };
  return { practices, shape: await executionShape(ctx), autopilot: await autopilotOn(ctx) };
}

async function executionShape(ctx) {
  if (ctx.kind === 'simple-plan') return 'simple-plan';
  try {
    const { resolveExecutionChoice } = require('../plan-scale');
    const plan = planText(ctx);
    const choice = resolveExecutionChoice(plan).choice;
    if (choice === 'orchestrated' || findArtifact(ctx, `execution-plan-${ctx.slug}.json`) !== null) return 'orchestrated';
    return plan === null && choice === null ? null : 'single-dev';
  } catch {
    return null;
  }
}

async function autopilotOn(ctx) {
  try {
    const { resolveAutopilotSignal } = require('../../autopilot-signal');
    const signal = await resolveAutopilotSignal(ctx.targetDir, { slug: ctx.slug });
    return signal && typeof signal.enabled === 'boolean' ? signal.enabled : null;
  } catch {
    return null;
  }
}

module.exports = { CATALOG_VERSION, LABELS, detectPractices, practiceLabel, shapeLabel, countRules };
