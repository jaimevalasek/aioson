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
const { spawnSync } = require('node:child_process');

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
  }),

  // orache — the investigation report is date-stamped, so it's resolved via
  // --file. It must carry the 7-dimension skeleton, an impact analysis, and
  // source attribution, with no unfilled template token.
  'orache-report': (ctx) => ({
    label: 'orache investigation report',
    criteria: [{
      id: 'orache-report',
      files: [ctx.file || `squad-searches/${ctx.slug || 'MISSING'}/investigation.md`],
      must_match: ['## D1', '## D4', '## D7', '## Impact Analysis', '\\*\\*Source:\\*\\*'],
      must_not_match: [...PLACEHOLDER_PATTERNS, '\\{where discovered\\}']
    }]
  }),

  // design-hybrid-forge — the hybrid skill package: a parseable .skill-meta.json
  // recording its sources, a real SKILL.md, and both required previews.
  'hybrid-skill': (ctx) => ({
    label: 'hybrid design skill package',
    criteria: [
      { id: 'hybrid:meta', files: [`.aioson/installed-skills/${ctx.slug}/.skill-meta.json`], must_match: ['sources'], must_not_match: [] },
      { id: 'hybrid:skill', files: [`.aioson/installed-skills/${ctx.slug}/SKILL.md`], must_match: [], must_not_match: PLACEHOLDER_PATTERNS },
      {
        id: 'hybrid:previews',
        files: [
          `.aioson/installed-skills/${ctx.slug}/previews/${ctx.slug}.html`,
          `.aioson/installed-skills/${ctx.slug}/previews/${ctx.slug}-website.html`
        ],
        must_match: [],
        must_not_match: []
      }
    ]
  }),

  // copywriter — an advisory placeholder/template scan over the saved copy doc
  // (the rich resonance checks stay in the agent's Phase-5 checklist; this just
  // makes "no placeholder/Lorem/TODO/unfilled token" deterministic).
  copy: (ctx) => ({
    label: 'copywriter copy document',
    criteria: [{
      id: 'copy',
      files: [`.aioson/context/copy-${ctx.slug}.md`],
      must_match: [],
      must_not_match: [...PLACEHOLDER_PATTERNS, ...TEMPLATE_TOKENS]
    }]
  }),

  // reference-identity-extract — identity.md is the extracted token + per-component
  // structure system-of-record. Its path varies by scope (briefing vs brand) so it is
  // resolved via --file. It must carry the token skeleton plus the two anti-sameness
  // anchors (pillars + signature moves) and the component-structure section, with no
  // placeholder or unfilled hex/token left behind.
  identity: (ctx) => ({
    label: 'reference identity system',
    criteria: [{
      id: 'identity',
      files: [ctx.file || `.aioson/briefings/${ctx.slug || 'MISSING'}/identity.md`],
      must_match: [
        'generated_by',
        '## Design pillars', '## Palette', '## Typography', '## Spacing',
        '## Radius', '## Motion', '## Signature moves', '## Component structure notes'
      ],
      must_not_match: [...PLACEHOLDER_PATTERNS, '#RRGGBB', '#XXXXXX', '\\{hex\\}', '\\{token\\}']
    }]
  })
};

// Kinds whose target file path is keyed by --slug; without it we cannot resolve
// the artifact, so fail with a clear usage error instead of a `null/` path.
const REQUIRES_SLUG = new Set(['genome', 'research-report', 'enriched-profile', 'hybrid-skill', 'copy']);

// Kinds whose artifact has a date-stamped / caller-known path — resolved via
// --file=<path> rather than derived from a slug.
const REQUIRES_FILE = new Set(['orache-report', 'identity']);

// ─── adapters to existing validators ────────────────────────────────────────
//
// Each adapter is async (ctx, logger) => { ok, issues, warnings, checks }.

function quietLogger() {
  return { log() {}, error() {}, warn() {} };
}

// ─── kind=site (runtime build gate for a generated Next.js site) ──────────────

const SITE_IGNORE = new Set(['node_modules', '.next', '.git', 'dist', 'build', 'out', 'coverage', '.turbo', '.vercel', '.aioson']);
const SITE_SCAN_EXTS = new Set(['.tsx', '.jsx', '.ts', '.js', '.mjs', '.html', '.vue', '.svelte']);
const SITE_ENTRY_CANDIDATES = ['app/page.tsx', 'app/page.jsx', 'src/app/page.tsx', 'src/app/page.jsx', 'pages/index.tsx', 'pages/index.jsx', 'pages/index.js'];
const SITE_LEAKS = [
  { re: /\balert\s*\(/, msg: 'native alert() dialog — use in-app UI chrome' },
  { re: /\bconfirm\s*\(/, msg: 'native confirm() dialog — use in-app UI chrome' },
  { re: /\bwindow\.prompt\s*\(/, msg: 'native window.prompt() dialog — use in-app UI chrome' },
  { re: /Lorem ipsum/i, msg: 'Lorem ipsum placeholder copy' },
  { re: /\bTODO\b|\bFIXME\b/, msg: 'TODO/FIXME left in shipped code' }
];

function walkSiteFiles(root, max = 800) {
  const out = [];
  const stack = [root];
  while (stack.length && out.length < max) {
    const dir = stack.pop();
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { continue; }
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (!SITE_IGNORE.has(e.name)) stack.push(full);
      } else if (e.isFile() && SITE_SCAN_EXTS.has(path.extname(e.name).toLowerCase())) {
        out.push(full);
      }
    }
  }
  return out;
}

/** Scan a generated site for native-dialog and placeholder leaks (build-free). */
function scanSiteForLeaks(siteDir, maxHits = 20) {
  const hits = [];
  for (const abs of walkSiteFiles(siteDir)) {
    let content;
    try { content = fs.readFileSync(abs, 'utf8'); } catch { continue; }
    const rel = path.relative(siteDir, abs).split(path.sep).join('/');
    const lines = content.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const stripped = lines[i].trim();
      if (stripped.startsWith('//') || stripped.startsWith('*') || stripped.startsWith('/*')) continue;
      for (const leak of SITE_LEAKS) {
        if (leak.re.test(lines[i])) { hits.push(`${rel}:${i + 1} — ${leak.msg}`); break; }
      }
      if (hits.length >= maxHits) return hits;
    }
  }
  return hits;
}

/** Build-free static floor for a site: build script, entry route, no leaks. */
function staticSiteChecks(siteDir) {
  const issues = [];
  const warnings = [];

  let pkg = null;
  try {
    pkg = JSON.parse(fs.readFileSync(path.join(siteDir, 'package.json'), 'utf8'));
  } catch {
    issues.push('no readable package.json at the site root');
  }
  if (pkg && !(pkg.scripts && pkg.scripts.build)) issues.push('package.json has no "build" script');

  if (!SITE_ENTRY_CANDIDATES.some((rel) => fs.existsSync(path.join(siteDir, rel)))) {
    issues.push('no entry route found (app/page.* or pages/index.*)');
  }

  for (const leak of scanSiteForLeaks(siteDir)) issues.push(leak);
  return { issues, warnings };
}

/**
 * The RG-* runtime floor: the site must actually build on the real toolchain.
 * `command` defaults to `npm run build`; it is overridable so a caller (or a
 * test) can drive the same spawn/exit logic without the npm layer.
 */
function runSiteBuild(siteDir, timeout = 600000, command = ['npm', 'run', 'build']) {
  const [cmd, ...rest] = command;
  const res = spawnSync(cmd, rest, { cwd: siteDir, encoding: 'utf8', shell: true, timeout });
  if (res.error) return { ok: false, detail: `build could not start: ${res.error.message}` };
  if (res.status === 0) return { ok: true, detail: null };
  const tail = String(res.stderr || res.stdout || '')
    .split('\n').map((l) => l.trim()).filter(Boolean).slice(-4).join(' | ');
  return { ok: false, detail: `build failed (exit ${res.status}): ${tail || 'see build output'}` };
}

// ─── kind=commit-message (advisory subject-quality heuristics) ────────────────

/** Conservative, low-false-positive commit-subject checks. Returns issue list. */
function evaluateCommitMessage(message) {
  const issues = [];
  const subject = (String(message || '').replace(/^\s+/, '').split('\n')[0] || '').trim();
  if (!subject) {
    issues.push('empty commit subject');
    return issues;
  }
  if (subject.length > 72) issues.push(`subject is ${subject.length} chars — keep it <= 72 (ideally <= 50)`);
  if (/[.]$/.test(subject)) issues.push('subject ends with a period — drop it');
  if (/^(wip|stuff|misc|various|things|update|updates|changes|tweaks?|minor)$/i.test(subject)) {
    issues.push(`subject is a single vague word: "${subject}"`);
  }
  if (/^(fix|update|change|tweak|adjust)\s+(it|this|that|stuff|things?|bugs?|code|tests?)$/i.test(subject)) {
    issues.push(`subject is vague: "${subject}" — say what changed and why`);
  }
  return issues;
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
  },

  // site-forge — a generated Next.js site is not done until it BUILDS on the
  // real toolchain (the RG-* runtime floor), on top of a static floor: a build
  // script, an entry route, and no native-dialog / placeholder leak. --no-build
  // runs the static floor only; --dir points at the site root (default: cwd).
  site: async (ctx) => {
    const siteDir = ctx.dir ? path.resolve(ctx.targetDir, ctx.dir) : ctx.targetDir;
    const { issues, warnings } = staticSiteChecks(siteDir);
    if (ctx.noBuild) {
      warnings.push('npm run build skipped (--no-build): static checks only — not a full runtime gate');
    } else if (issues.length === 0) {
      const b = runSiteBuild(siteDir, ctx.buildTimeout, ctx.buildCommand);
      if (!b.ok) issues.push(b.detail);
    } else {
      warnings.push('npm run build skipped: static checks already failed');
    }
    return { ok: issues.length === 0, issues, warnings, checks: [{ id: 'site', ok: issues.length === 0, detail: issues.join('; ') || null }] };
  },

  // committer — advisory subject-quality audit. Reads --file if given, else the
  // HEAD commit message (post-commit, so the agent can amend before push).
  'commit-message': async (ctx) => {
    let message = null;
    if (ctx.file) {
      try {
        message = fs.readFileSync(path.resolve(ctx.targetDir, ctx.file), 'utf8');
      } catch {
        return { ok: false, issues: [`cannot read commit message file: ${ctx.file}`], warnings: [], checks: [] };
      }
    } else {
      const res = spawnSync('git', ['log', '-1', '--pretty=%B'], { cwd: ctx.targetDir, encoding: 'utf8' });
      if (res.status !== 0) {
        return { ok: false, issues: ['could not read HEAD commit message (no git repo or no commits)'], warnings: [], checks: [] };
      }
      message = res.stdout;
    }
    const found = evaluateCommitMessage(message);
    return { ok: found.length === 0, issues: found, warnings: [], checks: [{ id: 'commit-message', ok: found.length === 0, detail: found.join('; ') || null }] };
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
  const file = options.file ? String(options.file).trim() : null;
  const dir = options.dir ? String(options.dir).trim() : null;
  const noBuild = Boolean(options['no-build'] || options.noBuild);
  const buildTimeout = options['build-timeout'] ? Number(options['build-timeout']) : undefined;
  const buildCommand = Array.isArray(options.buildCommand) ? options.buildCommand : undefined;
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

  if (REQUIRES_FILE.has(kind) && !file) {
    const msg = `verify:artifact kind=${kind} requires --file=<path>`;
    const blocking = !advisory;
    if (options.json) {
      setExitCode(blocking ? 1 : 0);
      return { generator: GENERATOR, kind, slug, root: targetDir, mode: advisory ? 'advisory' : 'blocking', ok: false, blocking, issues: [msg], warnings: [], checks: [], error: 'missing_file' };
    }
    logger.error(msg);
    setExitCode(blocking ? 1 : 0);
    return { ok: false, kind };
  }

  const result = await evaluateKind(kind, { slug, targetDir, file, dir, noBuild, buildTimeout, buildCommand }, logger);

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
  PLACEHOLDER_PATTERNS,
  staticSiteChecks,
  scanSiteForLeaks,
  runSiteBuild,
  evaluateCommitMessage
};
