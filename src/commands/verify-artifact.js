'use strict';

/**
 * aioson verify:artifact --kind=<kind> [--slug=<slug>] [path] [--advisory]
 *   [--strict] [--json] — the build-free "done = proven, not asserted" gate for
 *   the NON-code artifacts the peripheral agents produce.
 *
 * Where an SG-* criterion gates a code feature's harness contract, this gates a
 * produced artifact (project context, a genome, a research report, the bootstrap
 * cache, a hybrid skill, ...) the same cheap way: read the declared files and
 * prove a required structure is present and no placeholder / truncation slipped
 * in before the agent self-declares done. Pure fs + RegExp + JSON.parse — no
 * shell, no build — so it costs ~milliseconds and runs at every agent's done
 * gate, cross-platform by construction.
 *
 * Each `kind` resolves to EITHER an existing validator (project context →
 * validateProjectContextFile; genome → genome:doctor) OR a declarative ruleset
 * evaluated by the shared static-criteria engine. No new analysis logic per
 * artifact — just data. Adding a kind is a registry entry, not a code path.
 *
 * Exit code: a hard failure sets exit 1 (blocking) unless --advisory (warn-only,
 * always exit 0). Pass suppressExitCode for programmatic callers (an agent
 * done-gate that wants to interpret the verdict itself). --strict promotes
 * warnings to blocking issues.
 */

const path = require('node:path');
const fs = require('node:fs');

const { evaluateStaticCriterion } = require('../harness/static-criteria');

const VERSION = '1.0.0';
const GENERATOR = `aioson verify:artifact@${VERSION}`;

// ─── ruleset engine ─────────────────────────────────────────────────────────

/**
 * Run a list of static criteria (the same {id, files, must_match, must_not_match}
 * shape the harness SG-* gate uses) against the working tree. Returns a uniform
 * { ok, issues, warnings, checks }.
 *
 * @param {Array} criteria
 * @param {string} targetDir
 */
function evaluateRuleset(criteria, targetDir) {
  const checks = [];
  const issues = [];
  for (const criterion of Array.isArray(criteria) ? criteria : []) {
    const res = evaluateStaticCriterion(criterion, targetDir);
    checks.push(res);
    if (!res.ok) {
      issues.push(`[${res.id}] ${res.detail || 'failed'}`);
    }
  }
  return { ok: issues.length === 0, issues, warnings: [], checks };
}

// ─── ruleset registry (declarative, data-only) ──────────────────────────────
//
// Each entry is (ctx) => { label, criteria[] }. ctx = { slug, targetDir }.
// Frontmatter/placeholder checks reuse the OR-across-files / absent-in-all
// semantics of the static engine; per-file structure is expressed as one
// criterion per file.

const PLACEHOLDER_PATTERNS = ['\\bTODO\\b', '\\bFIXME\\b', '\\bTBD\\b', 'Lorem ipsum', '\\[\\.\\.\\.\\]', 'XXXX'];

const BOOTSTRAP_DIR = '.aioson/context/bootstrap';
const BOOTSTRAP_FILES = ['what-is.md', 'what-it-does.md', 'how-it-works.md', 'current-state.md'];
const PROFILER_DIR = '.aioson/profiler-reports';

// Unfilled template tokens left in a produced artifact (a tell that the agent
// emitted the skeleton without filling it). Targeted, not a blanket `[...]`
// match, to avoid flagging legitimate `[1]`-style citations.
const TEMPLATE_TOKENS = ['\\[Full Name\\]', '\\[count\\]', '\\[low/medium/high'];

const RULESETS = {
  // discover — the 4-file cold-start cache must all exist with real frontmatter.
  bootstrap: () => ({
    label: 'discovery bootstrap cache',
    criteria: BOOTSTRAP_FILES.map((f) => ({
      id: `bootstrap:${f}`,
      files: [`${BOOTSTRAP_DIR}/${f}`],
      must_match: ['generated_by', 'confidence'],
      must_not_match: PLACEHOLDER_PATTERNS
    }))
  }),

  // profiler-researcher — the research report must carry its frontmatter and the
  // load-bearing skeleton (inventory + extracted material + gaps), with no
  // unfilled template token.
  'research-report': (ctx) => ({
    label: 'profiler research report',
    criteria: [{
      id: 'research-report',
      files: [`${PROFILER_DIR}/${ctx.slug}/research-report.md`],
      must_match: ['sources_found', '## Source Inventory', '## Extracted Material by Category', '## Gaps and Next Research Moves'],
      must_not_match: [...PLACEHOLDER_PATTERNS, ...TEMPLATE_TOKENS]
    }]
  }),

  // profiler-enricher — the enriched profile must carry the executive summary,
  // psychometric profile, the operational method (the part that makes a genome
  // *work* rather than simulate opinions), and the trait-interaction analysis.
  'enriched-profile': (ctx) => ({
    label: 'profiler enriched profile',
    criteria: [{
      id: 'enriched-profile',
      files: [`${PROFILER_DIR}/${ctx.slug}/enriched-profile.md`],
      must_match: ['## Executive Summary', '## Psychometric Profile', '## Operational Method', '## Trait Interactions'],
      must_not_match: [...PLACEHOLDER_PATTERNS, ...TEMPLATE_TOKENS]
    }]
  })
};

// Kinds whose target file path is keyed by --slug; without it we cannot resolve
// the artifact, so fail with a clear usage error instead of a `null/` path.
const REQUIRES_SLUG = new Set(['genome', 'research-report', 'enriched-profile']);

// ─── adapters to existing validators ────────────────────────────────────────
//
// Each adapter is async (ctx, logger) => { ok, issues, warnings, checks }.

function quietLogger() {
  return { log() {}, error() {}, warn() {} };
}

const ADAPTERS = {
  // setup — project.context.md is the root artifact every session reads first.
  'project-context': async (ctx) => {
    const { validateProjectContextFile } = require('../context');
    let res;
    try {
      res = await validateProjectContextFile(ctx.targetDir);
    } catch (err) {
      return { ok: false, issues: [`project.context.md could not be validated: ${err.message}`], warnings: [], checks: [] };
    }
    const issues = [];
    if (!res.exists) {
      issues.push(`project.context.md not found (${res.filePath || '.aioson/context/project.context.md'}) — run /setup`);
    } else if (!res.parsed) {
      issues.push(`project.context.md frontmatter does not parse (${res.parseError || 'invalid YAML'})`);
    } else if (!res.valid) {
      for (const issue of res.issues || []) {
        issues.push(typeof issue === 'string' ? issue : (issue.key || JSON.stringify(issue)));
      }
      if (issues.length === 0) issues.push('project.context.md has invalid or missing required fields');
    }
    return { ok: issues.length === 0, issues, warnings: [], checks: [{ id: 'project-context', ok: issues.length === 0, detail: issues[0] || null }] };
  },

  // profiler-forge / genome — reuse the comprehensive genome doctor.
  genome: async (ctx, logger) => {
    const { runGenomeDoctor, isGenomeAvailable } = require('./genome-doctor');
    if (!ctx.slug) {
      return { ok: false, issues: ['kind=genome requires --slug=<genome-slug>'], warnings: [], checks: [] };
    }
    const avail = await isGenomeAvailable(ctx.targetDir, ctx.slug);
    if (!avail.found) {
      return {
        ok: false,
        issues: [`genome "${ctx.slug}" not found under .aioson/genomes/ (neither <slug>.md nor <slug>/SKILL.md)`],
        warnings: [],
        checks: []
      };
    }
    const target = path.resolve(ctx.targetDir, avail.path);
    let res;
    try {
      res = await runGenomeDoctor({ args: [target], options: { json: true }, logger: logger || quietLogger() });
    } catch (err) {
      return { ok: false, issues: [`genome:doctor failed: ${err.message}`], warnings: [], checks: [] };
    }
    return {
      ok: Boolean(res.ok),
      issues: res.ok ? [] : (res.issues || []).slice(),
      warnings: (res.warnings || []).slice(),
      checks: [{ id: `genome:${ctx.slug}`, ok: Boolean(res.ok), detail: res.ok ? null : (res.issues || []).join('; ') }]
    };
  }
};

// ─── kind resolution ────────────────────────────────────────────────────────

function availableKinds() {
  return [...Object.keys(ADAPTERS), ...Object.keys(RULESETS)].sort();
}

async function evaluateKind(kind, ctx, logger) {
  if (ADAPTERS[kind]) {
    return ADAPTERS[kind](ctx, logger);
  }
  if (RULESETS[kind]) {
    const { criteria } = RULESETS[kind](ctx);
    return evaluateRuleset(criteria, ctx.targetDir);
  }
  return null; // unknown
}

// ─── main command ─────────────────────────────────────────────────────────────

async function runVerifyArtifact({ args, options = {}, logger }) {
  const targetDir = path.resolve(process.cwd(), args?.[0] || '.');
  const kind = options.kind ? String(options.kind).trim() : '';
  const slug = options.slug ? String(options.slug).trim() : null;
  const advisory = Boolean(options.advisory);
  const strict = Boolean(options.strict);
  const suppressExitCode = Boolean(options.suppressExitCode);
  const setExitCode = (code) => { if (!suppressExitCode) process.exitCode = code; };

  if (!kind) {
    const msg = `verify:artifact requires --kind=<kind>. Available: ${availableKinds().join(', ')}`;
    if (options.json) { setExitCode(1); return { ok: false, kind: null, error: 'missing_kind', available: availableKinds() }; }
    logger.error(msg);
    setExitCode(1);
    return { ok: false, kind: null };
  }

  if (REQUIRES_SLUG.has(kind) && !slug) {
    const msg = `verify:artifact kind=${kind} requires --slug=<slug>`;
    const blocking = !advisory;
    if (options.json) {
      setExitCode(blocking ? 1 : 0);
      return { generator: GENERATOR, kind, slug: null, root: targetDir, mode: advisory ? 'advisory' : 'blocking', ok: false, blocking, issues: [msg], warnings: [], checks: [], error: 'missing_slug' };
    }
    logger.error(msg);
    setExitCode(blocking ? 1 : 0);
    return { ok: false, kind };
  }

  const result = await evaluateKind(kind, { slug, targetDir }, logger);

  if (result === null) {
    const msg = `verify:artifact: unknown kind "${kind}". Available: ${availableKinds().join(', ')}`;
    if (options.json) { setExitCode(1); return { ok: false, kind, error: 'unknown_kind', available: availableKinds() }; }
    logger.error(msg);
    setExitCode(1);
    return { ok: false, kind };
  }

  // strict promotes warnings to blocking issues.
  const issues = strict ? [...result.issues, ...result.warnings] : [...result.issues];
  const warnings = strict ? [] : [...result.warnings];
  const ok = issues.length === 0;
  const blocking = !ok && !advisory;

  const report = {
    generator: GENERATOR,
    kind,
    slug,
    root: targetDir,
    mode: advisory ? 'advisory' : 'blocking',
    ok,
    blocking,
    issues,
    warnings,
    checks: result.checks || []
  };

  // Persist for downstream consumption (mirrors audit:code).
  try {
    const ctxDir = path.join(targetDir, '.aioson', 'context');
    fs.mkdirSync(ctxDir, { recursive: true });
    fs.writeFileSync(path.join(ctxDir, `verify-artifact-${kind}.json`), JSON.stringify(report, null, 2), 'utf8');
  } catch {
    // best-effort persistence — never fail the gate on a write error
  }

  if (options.json) {
    logger.log(JSON.stringify(report, null, 2));
    setExitCode(blocking ? 1 : 0);
    return report;
  }

  const verdict = ok ? 'OK' : (advisory ? 'ADVISORY' : 'FAIL');
  logger.log(`verify:artifact — kind=${kind}${slug ? ` slug=${slug}` : ''} — ${verdict}`);
  for (const issue of issues) logger.log(`  ✗ ${issue}`);
  for (const w of warnings) logger.log(`  ⚠ ${w}`);
  if (ok && warnings.length === 0) logger.log('  (no issues)');

  setExitCode(blocking ? 1 : 0);
  return report;
}

module.exports = {
  runVerifyArtifact,
  // exported for reuse / tests
  evaluateRuleset,
  availableKinds,
  RULESETS,
  ADAPTERS,
  PLACEHOLDER_PATTERNS
};
