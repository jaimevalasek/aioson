'use strict';

/**
 * Deterministic trigger evals for the retrieval engine.
 *
 * A routed artifact (rule, doc, design-doc, skill router) claims reachability
 * through its frontmatter; nothing proved the claim at corpus scale — two
 * incident tests pinned three docs and four rules, skills pinned nothing.
 * This engine runs declared scenarios through the REAL brief builder
 * (`buildContextBrief`, the same call every concrete agent makes) and grades:
 *
 *  - expect: the artifact surfaces in the named section for a realistic task
 *    (trigger recall);
 *  - absent: the artifact stays out of the named section on an unrelated task
 *    (trigger precision — the kanban-rule-on-every-CHANGELOG failure class);
 *  - coverage: every artifact that declares routing signals is named by at
 *    least one positive scenario, or it is listed as uncovered.
 *
 * A failed expect is re-run through the selector's explain channel and turned
 * into a concrete frontmatter suggestion (which filter dropped it, by how many
 * points the threshold was missed, which task terms nothing matched). No model
 * in the loop: same engine, same corpus, same verdict on every host.
 *
 * Scenarios live in `.aioson/evals/*.json`:
 *   { "version": 1, "scenarios": [ { "name", "agent", "mode", "task",
 *     "paths": [], "feature", "expect": [ { "path", "in" } | "path" ],
 *     "absent": [ { "path", "in" } | "path" ], "max_must_bytes" } ] }
 * `in` is one of must_load | should_load | skills | selected (default:
 * selected for expect, must_load for absent; `anywhere` aliases selected).
 */

const fs = require('node:fs/promises');
const path = require('node:path');
const { buildContextBrief } = require('../context-brief');
const { selectContext, collectCandidates } = require('../context-selector');

const EXPECT_SECTIONS = new Set(['must_load', 'should_load', 'skills', 'selected']);
const EVAL_MODES = new Set(['planning', 'executing']);
const COVERAGE_SURFACES = new Set(['rules', 'docs', 'design_governance', 'skills']);
const ROUTING_LIST_FIELDS = ['taskTypes', 'triggers', 'aliases', 'entities', 'retrievalIntents', 'pathPatterns'];

// A suggested trigger must be a domain word: function words, demonstratives
// and the verbs every task uses would recreate the false-positive class the
// corpus exists to catch (`esse`, `service`, `linhas` were proposed live).
const SUGGESTION_STOP_WORDS = new Set([
  'the', 'and', 'with', 'for', 'from', 'into', 'that', 'this', 'then', 'when',
  'there', 'their', 'these', 'those', 'about', 'other', 'some', 'over', 'only',
  'just', 'also', 'been', 'have', 'does', 'doing', 'done', 'than', 'them', 'they',
  'will', 'without', 'because', 'still', 'before', 'after', 'while', 'where',
  'which', 'should', 'would', 'could', 'need', 'needs', 'want', 'wants', 'here',
  'para', 'com', 'uma', 'nos', 'nas', 'dos', 'das', 'que', 'como', 'sobre',
  'esse', 'essa', 'este', 'esta', 'isso', 'isto', 'aqui', 'ainda', 'depois',
  'antes', 'entre', 'todo', 'toda', 'todos', 'todas', 'mesmo', 'mesma', 'cada',
  'muito', 'mais', 'menos', 'pode', 'deve', 'precisa', 'preciso', 'quando',
  'onde', 'entao', 'tambem', 'porque', 'atraves', 'passou', 'passar', 'linha',
  'linhas', 'dividir', 'parte', 'partes', 'coisa', 'coisas', 'thing', 'things',
  'implement', 'implementar', 'create', 'criar', 'add', 'adicionar', 'build',
  'fazer', 'make', 'update', 'atualizar', 'fix', 'corrigir', 'new', 'nova', 'novo',
  'feature', 'funcionalidade', 'project', 'projeto', 'file', 'arquivo', 'code', 'codigo',
  'service', 'services', 'servico', 'servicos', 'module', 'modules', 'modulo', 'modulos',
  'change', 'changes', 'mudanca', 'mudancas', 'work', 'working', 'trabalho'
]);
const SUGGESTION_MIN_LENGTH = 5;

function normalizeSlashes(value) {
  return String(value || '').replace(/\\/g, '/').replace(/^\.\//, '');
}

function normalizeTerm(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9/-]+/g, ' ')
    .trim();
}

function normalizeCheckEntry(raw, fallbackSection) {
  if (typeof raw === 'string') {
    return { path: normalizeSlashes(raw), in: fallbackSection };
  }
  if (!raw || typeof raw !== 'object' || !raw.path) return null;
  let section = String(raw.in || fallbackSection).trim();
  if (section === 'anywhere') section = 'selected';
  if (!EXPECT_SECTIONS.has(section)) return null;
  return { path: normalizeSlashes(raw.path), in: section };
}

function normalizeScenario(raw, sourceFile, index) {
  const errors = [];
  const name = String(raw && raw.name || '').trim() || `${path.basename(sourceFile)}#${index}`;
  if (!raw || typeof raw !== 'object') {
    return { errors: [`${name}: scenario is not an object`] };
  }
  const task = String(raw.task || '').trim();
  if (!task) errors.push(`${name}: missing task`);

  const expect = [];
  for (const entry of Array.isArray(raw.expect) ? raw.expect : []) {
    const normalized = normalizeCheckEntry(entry, 'selected');
    if (normalized) expect.push(normalized);
    else errors.push(`${name}: invalid expect entry ${JSON.stringify(entry)}`);
  }
  const absent = [];
  for (const entry of Array.isArray(raw.absent) ? raw.absent : []) {
    const normalized = normalizeCheckEntry(entry, 'must_load');
    if (normalized) absent.push(normalized);
    else errors.push(`${name}: invalid absent entry ${JSON.stringify(entry)}`);
  }
  if (expect.length === 0 && absent.length === 0) {
    errors.push(`${name}: scenario asserts nothing (no expect, no absent)`);
  }
  // The engine folds any unknown mode into planning; a scenario that says
  // `review` would print one mode and prove another.
  const mode = String(raw.mode || 'planning').trim();
  if (!EVAL_MODES.has(mode)) {
    errors.push(`${name}: invalid mode "${mode}" (planning | executing)`);
  }
  if (errors.length > 0) return { errors };

  return {
    scenario: {
      name,
      source: sourceFile,
      agent: String(raw.agent || 'dev').trim(),
      mode,
      task,
      paths: Array.isArray(raw.paths) ? raw.paths.map(String) : (raw.paths ? [String(raw.paths)] : []),
      feature: String(raw.feature || '').trim(),
      expect,
      absent,
      maxMustBytes: Number.isFinite(Number(raw.max_must_bytes)) && Number(raw.max_must_bytes) > 0
        ? Math.trunc(Number(raw.max_must_bytes))
        : 0
    },
    errors: []
  };
}

async function walkJson(absDir, relDir) {
  let entries;
  try {
    entries = await fs.readdir(absDir, { withFileTypes: true });
  } catch {
    return [];
  }
  const out = [];
  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue;
    const absChild = path.join(absDir, entry.name);
    const relChild = `${relDir}/${entry.name}`;
    if (entry.isDirectory()) {
      out.push(...await walkJson(absChild, relChild));
      continue;
    }
    if (entry.isFile() && entry.name.endsWith('.json')) out.push({ abs: absChild, rel: relChild });
  }
  return out.sort((a, b) => a.rel.localeCompare(b.rel));
}

async function loadEvalCorpus(targetDir) {
  const files = await walkJson(path.join(targetDir, '.aioson', 'evals'), '.aioson/evals');
  const scenarios = [];
  const errors = [];
  const loaded = [];
  for (const file of files) {
    let parsed;
    try {
      parsed = JSON.parse(await fs.readFile(file.abs, 'utf8'));
    } catch (error) {
      errors.push(`${file.rel}: invalid JSON (${error.message})`);
      continue;
    }
    const rawScenarios = Array.isArray(parsed) ? parsed : (parsed && Array.isArray(parsed.scenarios) ? parsed.scenarios : null);
    if (!rawScenarios) {
      errors.push(`${file.rel}: expected { "scenarios": [...] }`);
      continue;
    }
    let count = 0;
    rawScenarios.forEach((raw, index) => {
      const { scenario, errors: scenarioErrors } = normalizeScenario(raw, file.rel, index);
      if (scenario) {
        scenarios.push(scenario);
        count += 1;
      }
      for (const message of scenarioErrors || []) errors.push(`${file.rel}: ${message}`);
    });
    loaded.push({ path: file.rel, scenarios: count });
  }
  return { files: loaded, scenarios, errors };
}

function sectionSets(brief) {
  const must = new Set((brief.must_load || []).map((item) => item.path));
  const should = new Set((brief.should_load || []).map((item) => item.path));
  const skills = new Set((brief.skills || []).map((item) => item.path));
  const selected = new Set([...must, ...should, ...skills]);
  return { must_load: must, should_load: should, skills, selected };
}

function briefItemFor(brief, targetPath) {
  for (const list of [brief.must_load, brief.should_load, brief.skills]) {
    const hit = (list || []).find((item) => item.path === targetPath);
    if (hit) return hit;
  }
  return null;
}

function suggestionTerms(scenario) {
  const haystack = normalizeTerm(`${scenario.task} ${scenario.paths.join(' ')}`);
  const terms = [];
  const seen = new Set();
  for (const word of haystack.split(/\s+/)) {
    if (word.length < SUGGESTION_MIN_LENGTH || SUGGESTION_STOP_WORDS.has(word) || seen.has(word)) continue;
    seen.add(word);
    terms.push(word);
  }
  return terms.slice(0, 6);
}

function diagnoseExpectFailure({ scenario, check, sections, brief, explainEntry }) {
  // Reached the package but in a weaker section than the scenario demands.
  if (sections.selected.has(check.path)) {
    const item = briefItemFor(brief, check.path);
    return {
      cause: 'reached_but_wrong_section',
      detail: `surfaced with reason "${item ? item.reason : ''}" but not in ${check.in}`,
      suggestion: check.in === 'must_load'
        ? 'must_load needs a hard signal for this agent: declare task_types/triggers/paths the scenario matches, or review the agent profile surface for this artifact kind.'
        : 'the artifact surfaced in another section; assert that section or adjust its frontmatter tier.'
    };
  }
  if (!explainEntry || explainEntry.status === 'selected') {
    return {
      cause: 'not_in_brief',
      detail: 'selected by the engine but dropped by the brief caps',
      suggestion: 'the selection crossed the threshold but fell out of the capped package; raise priority: or sharpen the scenario signals.'
    };
  }
  const cause = explainEntry.cause;
  if (cause === 'not_a_candidate') {
    return {
      cause,
      detail: 'no routed surface produced this file',
      suggestion: 'check the path: rules/docs/design-docs walk *.md (README excluded), skills walk SKILL.md routers only.'
    };
  }
  if (cause === 'agent_filter') {
    return {
      cause,
      detail: `agents: [${(explainEntry.agents || []).join(', ')}] does not include "${scenario.agent}"`,
      suggestion: `add "${scenario.agent}" to the artifact's agents: list, or drop the field to reach every agent.`
    };
  }
  if (cause === 'mode_filter') {
    return {
      cause,
      detail: `modes: [${(explainEntry.modes || []).join(', ')}] excludes mode "${scenario.mode}"`,
      suggestion: `widen modes: to include ${scenario.mode} (or drop the field) if the artifact should reach this phase.`
    };
  }
  if (cause === 'feature_filter') {
    return {
      cause,
      detail: `feature-scoped to "${explainEntry.feature_slug}" and the scenario runs outside it`,
      suggestion: 'pass feature: in the scenario or remove the artifact\'s feature binding.'
    };
  }
  if (cause === 'below_threshold') {
    const matched = (explainEntry.reasons || []).join('; ') || 'nothing matched';
    const terms = suggestionTerms(scenario);
    return {
      cause,
      detail: `scored ${explainEntry.score}/${explainEntry.threshold} (${matched})`,
      suggestion: terms.length > 0
        ? `no hard signal matched the task; consider triggers or task_types drawn from it, e.g. [${terms.join(', ')}].`
        : 'no hard signal matched the task; declare triggers/task_types/paths this kind of task would hit.'
    };
  }
  return {
    cause: cause || 'unknown',
    detail: '',
    suggestion: 'run `aioson context:select . --explain=<path>` with the scenario inputs to inspect the exclusion.'
  };
}

function diagnoseAbsentFailure({ check, brief }) {
  const item = briefItemFor(brief, check.path);
  return {
    cause: 'unwanted_fire',
    detail: `surfaced in ${check.in} with reason "${item ? item.reason : ''}"`,
    suggestion: 'the matched trigger fires on an unrelated task — narrow the frontmatter term it names (whole-word phrases beat generic words).'
  };
}

async function runScenario(targetDir, scenario) {
  const brief = await buildContextBrief(targetDir, {
    agent: scenario.agent,
    mode: scenario.mode,
    task: scenario.task,
    paths: scenario.paths.join(','),
    feature: scenario.feature
  });
  const sections = sectionSets(brief);
  const checks = [];

  const failedExpectPaths = scenario.expect
    .filter((check) => !sections[check.in].has(check.path))
    .map((check) => check.path);
  let explainByPath = new Map();
  if (failedExpectPaths.length > 0) {
    const selection = await selectContext(targetDir, {
      agent: scenario.agent,
      mode: scenario.mode,
      task: scenario.task,
      paths: scenario.paths.join(','),
      feature: scenario.feature,
      explain: failedExpectPaths.join(',')
    });
    explainByPath = new Map((selection.explain || []).map((entry) => [entry.path, entry]));
  }

  for (const check of scenario.expect) {
    const passed = sections[check.in].has(check.path);
    const entry = { type: 'expect', path: check.path, in: check.in, passed };
    if (!passed) {
      // A profile-filtered install legitimately lacks part of the shipped
      // corpus (e.g. squad docs without the squads use). A target that is not
      // on disk is a visible SKIP, never a failure — the framework's own
      // suite runs the full template and pins skipped === 0, so a typo'd
      // path still cannot hide there.
      const onDisk = await fs.stat(path.join(targetDir, check.path)).then(() => true).catch(() => false);
      if (!onDisk) {
        entry.passed = true;
        entry.skipped = true;
        entry.reason = 'target_not_installed';
        checks.push(entry);
        continue;
      }
      entry.diagnosis = diagnoseExpectFailure({
        scenario,
        check,
        sections,
        brief,
        explainEntry: explainByPath.get(check.path)
      });
    }
    checks.push(entry);
  }
  for (const check of scenario.absent) {
    const passed = !sections[check.in].has(check.path);
    const entry = { type: 'absent', path: check.path, in: check.in, passed };
    if (!passed) {
      entry.diagnosis = diagnoseAbsentFailure({ check, brief });
    } else {
      // A target that is not on disk cannot fire: that is a vacuous negative,
      // not a true one. Visible SKIP, excluded from precision — a renamed or
      // retired rule would otherwise keep "passing" its absent checks forever.
      const onDisk = await fs.stat(path.join(targetDir, check.path)).then(() => true).catch(() => false);
      if (!onDisk) {
        entry.skipped = true;
        entry.reason = 'target_not_installed';
      }
    }
    checks.push(entry);
  }

  // Brief items are compacted without sizes — weigh the actual files.
  let mustBytes = 0;
  for (const item of brief.must_load || []) {
    const stat = await fs.stat(path.join(targetDir, item.path)).catch(() => null);
    if (stat) mustBytes += stat.size;
  }
  if (scenario.maxMustBytes > 0) {
    checks.push({
      type: 'budget',
      path: '(must_load bytes)',
      in: 'must_load',
      passed: mustBytes <= scenario.maxMustBytes,
      ...(mustBytes > scenario.maxMustBytes
        ? { diagnosis: { cause: 'over_budget', detail: `must_load pulls ${mustBytes} bytes > ${scenario.maxMustBytes}`, suggestion: 'the scenario pulls more law than its budget — narrow triggers or split the fattest artifact.' } }
        : {})
    });
  }

  return {
    name: scenario.name,
    source: scenario.source,
    agent: scenario.agent,
    mode: scenario.mode,
    task: scenario.task,
    passed: checks.every((check) => check.passed),
    checks,
    must_load_bytes: mustBytes
  };
}

function hasRoutingSignals(candidate) {
  return ROUTING_LIST_FIELDS.some((field) => Array.isArray(candidate[field]) && candidate[field].length > 0);
}

async function computeCoverage(targetDir, scenarios) {
  const candidates = await collectCandidates(targetDir);
  const universe = candidates.filter((candidate) => (
    COVERAGE_SURFACES.has(candidate.surface)
    && candidate.loadTier !== 'always'
    && hasRoutingSignals(candidate)
  ));
  const expected = new Set();
  for (const scenario of scenarios) {
    for (const check of scenario.expect) expected.add(check.path);
  }
  const uncovered = universe
    .filter((candidate) => !expected.has(candidate.path))
    .map((candidate) => ({ path: candidate.path, surface: candidate.surface }));
  const covered = universe.length - uncovered.length;
  return {
    universe: universe.length,
    covered,
    rate: universe.length === 0 ? 1 : Number((covered / universe.length).toFixed(4)),
    uncovered
  };
}

async function runContextEvals(targetDir, options = {}) {
  const corpus = await loadEvalCorpus(targetDir);
  const filter = normalizeTerm(options.filter || '');
  const scenarios = filter
    ? corpus.scenarios.filter((scenario) => (
      normalizeTerm(scenario.name).includes(filter) || normalizeTerm(scenario.source).includes(filter)
    ))
    : corpus.scenarios;

  const results = [];
  for (const scenario of scenarios) {
    results.push(await runScenario(targetDir, scenario));
  }

  const allChecks = results.flatMap((result) => result.checks);
  // Skipped checks (target not installed) are visible but never counted as
  // evidence on either side of the matrix.
  const positives = allChecks.filter((check) => check.type === 'expect' && !check.skipped);
  const negatives = allChecks.filter((check) => check.type === 'absent' && !check.skipped);
  const rate = (checks) => (checks.length === 0 ? 1 : Number((checks.filter((c) => c.passed).length / checks.length).toFixed(4)));
  // Confusion matrix over the corpus: an expect that surfaced is a true
  // positive, one that stayed hidden a false negative; an absent that stayed
  // quiet is a true negative, one that fired a false positive (the
  // kanban-rule-on-every-CHANGELOG class). Precision and F1 only mean
  // something when the corpus carries hard negatives — the shipped corpus
  // pins a floor on them for that reason.
  const truePositives = positives.filter((c) => c.passed).length;
  const falsePositives = negatives.filter((c) => !c.passed).length;
  const round4 = (value) => Number(value.toFixed(4));
  const recall = rate(positives);
  const precision = truePositives + falsePositives === 0 ? 1 : round4(truePositives / (truePositives + falsePositives));
  const f1 = precision + recall === 0 ? 0 : round4((2 * precision * recall) / (precision + recall));

  const coverage = options.coverage === false
    ? null
    : await computeCoverage(targetDir, corpus.scenarios);

  return {
    ok: true,
    dir: '.aioson/evals',
    files: corpus.files,
    errors: corpus.errors,
    totals: {
      scenarios: results.length,
      failed_scenarios: results.filter((result) => !result.passed).length,
      checks: allChecks.length,
      passed: allChecks.filter((check) => check.passed).length,
      failed: allChecks.filter((check) => !check.passed).length,
      pass_rate: rate(allChecks),
      // trigger recall: positives that surfaced where declared
      positive_pass_rate: rate(positives),
      // specificity: negatives that stayed quiet where declared
      negative_pass_rate: rate(negatives),
      positives: positives.length,
      negatives: negatives.length,
      skipped: allChecks.filter((check) => check.skipped).length,
      recall,
      precision,
      f1
    },
    results,
    coverage
  };
}

module.exports = { runContextEvals, loadEvalCorpus, computeCoverage, normalizeScenario, runScenario };
