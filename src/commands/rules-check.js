'use strict';

/**
 * aioson rules:check [path] [--changed] [--paths=a,b] [--rule=name]
 *   [--json] [--strict] — deterministic COMPLIANCE check of the project's rules.
 *
 * `rules:lint` answers "are the rules well-formed and routable?".
 * `rules:check` answers the question nobody could answer before: "is the code
 * actually obeying them?".
 *
 * Why this exists. A rule used to be prose handed to a model, so it competed
 * with everything else in the prompt and lost silently: a feature-scoped
 * acceptance criterion could contradict a project rule, the agent would record
 * the deviation in a dossier line, and every gate stayed green because nothing
 * measured the outcome. A rule that no machine can verify is a suggestion.
 *
 * How it works. A rule opts into enforcement by declaring `enforcement: <id>`
 * in its frontmatter; the id resolves to a deterministic checker in the
 * registry below. Rules without a checker are reported under `unenforced` —
 * honest visibility beats a green summary that only covers the measurable half.
 *
 * Design constraints, all deliberate:
 *   - pure Node, no deps, no build, no network → identical under Claude Code,
 *     Codex, or any other harness, and under any model;
 *   - the rule FILE is the on/off switch. Delete or edit the rule and its check
 *     goes with it. Nothing else can silence it — that is what it means for
 *     rules to outrank feature artifacts;
 *   - cheap enough to run repeatedly inside a session, which is the point:
 *     agents re-run it as they work instead of hoping they remembered.
 */

const path = require('node:path');
const fs = require('node:fs');
const fsp = require('node:fs/promises');

const { parseFrontmatter } = require('../preflight-engine');
const { gitChangedFiles } = require('../harness/detect-runtime-feature');
const { listSourceFiles, readText, CODE_EXTS, IGNORE_DIRS } = require('./audit-code');
const { scanNamingLanguage } = require('../lib/naming-language');
const { measureFile } = require('../lib/code-size');
const { buildModuleGraph, cyclePath, MODULE_EXTS } = require('../lib/module-graph');
const { resolveTargetDir } = require('../lib/project-root');

const VERSION = '1.0.0';
const GENERATOR = `aioson rules:check@${VERSION}`;

const SEVERITY_RANK = Object.freeze({ HIGH: 3, MED: 2, LOW: 1 });

// Advisory surfaces never reach HIGH — HIGH is what blocks a stage.
function downgrade(severity) {
  return severity === 'HIGH' ? 'MED' : severity;
}

const BASELINE_RELATIVE_PATH = '.aioson/context/rules-baseline.json';

/**
 * Stable identity for a violation, independent of line numbers.
 *
 * A directory finding is keyed by the directory, not by each file inside it:
 * `servidor/` is one decision the project made once, and charging it again for
 * every file underneath is how a gate turns into noise people switch off.
 */
function findingKey(finding) {
  const scope = finding.scope && finding.scope.startsWith('dir:')
    ? finding.scope
    : `file:${finding.file}`;
  return [finding.rule, finding.category, scope, finding.token || finding.message].join('|');
}

async function readBaseline(targetDir) {
  try {
    const raw = await fsp.readFile(path.join(targetDir, BASELINE_RELATIVE_PATH), 'utf8');
    const parsed = JSON.parse(raw);
    return new Set(Array.isArray(parsed.accepted) ? parsed.accepted : []);
  } catch {
    return null;
  }
}

// Blank out strings and regex literals so a checker sees code, not content. A
// scanner that stores `/\balert\s*\(/` as its own pattern, or a test fixture
// holding UI source as a string, must never be reported as the violation it is
// looking for.
function stripInertText(line) {
  return String(line)
    .replace(/'(?:[^'\\]|\\.)*'/g, "''")
    .replace(/"(?:[^"\\]|\\.)*"/g, '""')
    .replace(/`(?:[^`\\]|\\.)*`/g, '``')
    .replace(/\/(?:[^/\\\n[]|\\.|\[(?:[^\]\\]|\\.)*\])+\/[gimsuy]*/g, '//');
}

// ─── checker registry ─────────────────────────────────────────────────────────
//
// Each entry is one deterministic verifier. `id` is what a rule declares in its
// `enforcement:` frontmatter field. Adding a rule-enforcer here is how a new
// convention becomes machine-checkable instead of merely written down.

// One finding per file, keyed by the checker id so `--baseline` identity
// survives the count changing as the file grows or shrinks.
const FILE_SIZE_ID = 'file-size';

const ENFORCERS = Object.freeze({
  'source-code-language': {
    id: 'source-code-language',
    surface: 'code',
    // `file`: verdicts come from one file's path and lines, so the checker can
    // judge a pending edit in memory (context:guard). `tree`: it needs the
    // whole repository and only runs here.
    reads: 'file',
    summary: 'source identifiers, filenames, and directories use technical English',
    /**
     * @param {{ files: Array<{ rel: string, lines: string[] }> }} ctx
     * @returns {Array<object>} findings
     */
    run({ files, uncapped }) {
      const findings = [];
      const push = (f) => findings.push(f);
      // Recording debt reads every violation; reporting to a human reads the
      // first few per file. See MAX_PER_FILE in the detector.
      const scanOptions = uncapped ? { maxPerFile: Infinity } : undefined;
      for (const file of files) scanNamingLanguage(file, push, scanOptions);
      return findings;
    }
  },

  'no-native-dialogs': {
    id: 'no-native-dialogs',
    surface: 'code',
    reads: 'file',
    summary: 'confirmation and input use design-system components, not native browser dialogs',
    run({ files }) {
      const findings = [];
      const DIALOGS = ['alert', 'confirm', 'prompt'];
      for (const { rel, lines } of files) {
        if (!/\.(jsx?|mjs|cjs|tsx?|vue|svelte|html)$/i.test(rel)) continue;
        // A file that declares its own `confirm` is not calling the browser's.
        // Terminal pickers do this constantly, and flagging them would be the
        // fastest way to teach everyone to ignore this check.
        const body = lines.join('\n');
        const shadowed = new Set(DIALOGS.filter((name) =>
          new RegExp(`(?:function|const|let|var|async function)\\s+${name}\\b`).test(body)
        ));
        lines.forEach((raw, i) => {
          const line = raw.trim();
          if (!line || line.startsWith('//') || line.startsWith('*') || line.startsWith('/*')) return;
          const code = stripInertText(line);
          const match = code.match(/(?:^|[^\w.$])(?:window\s*\.\s*)?(alert|confirm|prompt)\s*\(/);
          if (!match || shadowed.has(match[1])) return;
          findings.push({
            category: 'NATIVE_DIALOG',
            severity: 'HIGH',
            message: `native \`${match[1]}()\` dialog — build it from the project's design system instead`,
            file: rel,
            line: i + 1,
            snippet: line.slice(0, 120)
          });
        });
      }
      return findings;
    }
  },

  // Size limits — the modularization floor. Thresholds come from the binding
  // document's frontmatter (`max_file_lines`, `max_function_lines`), so the
  // routed doc ships the doctrine's numbers and a project rule overrides them;
  // when several documents bind, a binding rule's value wins, then the lowest.
  'file-size': {
    id: FILE_SIZE_ID,
    surface: 'code',
    reads: 'file',
    summary: 'a file stays under its logic-line limit — a God object is a measured finding, not a feeling',
    run({ files, documents }) {
      const limit = sizeThreshold(documents, 'max_file_lines', 500);
      const findings = [];
      for (const { rel, lines } of files) {
        const measured = measureFile(rel, lines);
        if (measured.exempt || measured.logic <= limit) continue;
        findings.push({
          category: 'FILE_SIZE',
          severity: 'HIGH',
          message: `${measured.logic} logic lines (limit ${limit}) — split by responsibility before writing more here; design-docs/file-size.md lists the split strategies`,
          file: rel,
          line: 1,
          token: FILE_SIZE_ID,
          snippet: `${measured.logic} logic lines`
        });
      }
      return findings;
    }
  },

  'function-size': {
    id: 'function-size',
    surface: 'code',
    reads: 'file',
    summary: 'a function stays under its logic-line limit — one responsibility per named body',
    run({ files, documents }) {
      const limit = sizeThreshold(documents, 'max_function_lines', 60);
      const findings = [];
      for (const { rel, lines } of files) {
        const measured = measureFile(rel, lines);
        if (measured.exempt) continue;
        for (const fn of measured.functions) {
          if (fn.logic <= limit) continue;
          findings.push({
            category: 'FUNCTION_SIZE',
            severity: 'HIGH',
            message: `\`${fn.name}\` has ${fn.logic} logic lines (limit ${limit}, lines ${fn.start}-${fn.end}) — extract the steps it narrates into named functions`,
            file: rel,
            line: fn.start,
            token: fn.name,
            snippet: String(lines[fn.start - 1] || '').trim().slice(0, 120)
          });
        }
      }
      return findings;
    }
  },

  // Coupling limits — the boundaries. The graph is the whole tree (fan-in and
  // cycles are properties of the tree, not of the changed files); findings are
  // reported for the files under check, so a legacy tangle is charged only
  // where a slice touches it, or counted once by `--baseline`.
  'module-fan-out': {
    id: 'module-fan-out',
    surface: 'code',
    reads: 'tree',
    summary: 'a module imports at most its limit of internal modules — coupling is counted, not felt',
    run({ targetDir, files, documents }) {
      const limit = sizeThreshold(documents, 'max_module_fan_out', 15);
      const graph = moduleGraphOf(targetDir);
      const findings = [];
      for (const { rel } of files) {
        const node = graph.nodes.get(rel);
        if (!node || node.exempt || node.composition_root || node.fan_out <= limit) continue;
        findings.push({
          category: 'MODULE_FAN_OUT',
          severity: 'HIGH',
          message: `imports ${node.fan_out} internal modules (limit ${limit}) — this file orchestrates too much of the tree; group what it pulls in behind one boundary it owns, or split it by responsibility`,
          file: rel,
          line: 1,
          token: 'module-fan-out',
          snippet: `fan-out ${node.fan_out}, fan-in ${node.fan_in}: ${node.imports.slice(0, 6).join(', ')}${node.imports.length > 6 ? ', …' : ''}`
        });
      }
      return findings;
    }
  },

  'import-cycle': {
    id: 'import-cycle',
    surface: 'code',
    reads: 'tree',
    summary: 'no import cycles — a module never depends on something that depends on it',
    run({ targetDir, files }) {
      const graph = moduleGraphOf(targetDir);
      const findings = [];
      for (const { rel } of files) {
        const node = graph.nodes.get(rel);
        if (!node || node.exempt) continue;
        const trail = cyclePath(graph, rel);
        if (!trail) continue;
        const members = graph.cycles.find((cycle) => cycle.includes(rel)) || [rel];
        findings.push({
          category: 'IMPORT_CYCLE',
          severity: 'HIGH',
          message: `part of an import cycle (${members.length} modules): ${trail.join(' → ')} — break it with an interface the lower module owns, or move the shared piece below both`,
          file: rel,
          line: 1,
          token: members.join('>'),
          snippet: trail.join(' → ').slice(0, 200)
        });
      }
      return findings;
    }
  }
});

// The module graph of the whole tree, built once per check even when two
// checkers and the divergence pass ask for it.
const moduleGraphCache = new Map();
function moduleGraphOf(targetDir) {
  const key = path.resolve(targetDir);
  if (moduleGraphCache.has(key)) return moduleGraphCache.get(key);
  const files = [];
  for (const abs of listSourceFiles(targetDir, MODULE_EXTS, SOURCE_IGNORE_DIRS)) {
    const rel = path.relative(targetDir, abs).split(path.sep).join('/');
    if (GENERATED_FILE.test(path.basename(rel)) || GENERATED_PATH.test(rel)) continue;
    const content = readText(abs);
    if (content === null) continue;
    files.push({ rel, lines: content.split('\n') });
  }
  const graph = buildModuleGraph(files);
  moduleGraphCache.set(key, graph);
  return graph;
}

/**
 * A numeric threshold declared by the documents binding a checker. A binding
 * rule's value outranks a doc's; among equals the strictest (lowest) wins;
 * absent or non-numeric values fall back to the doctrine's default.
 */
function sizeThreshold(documents, field, fallback) {
  const declared = (documents || [])
    .map((doc) => ({ authority: doc.authority, value: Number(doc.frontmatter && doc.frontmatter[field]) }))
    .filter((entry) => Number.isFinite(entry.value) && entry.value > 0);
  if (declared.length === 0) return fallback;
  const binding = declared.filter((entry) => entry.authority === 'binding');
  const pool = binding.length > 0 ? binding : declared;
  return Math.min(...pool.map((entry) => entry.value));
}

function listEnforcerIds() {
  return Object.keys(ENFORCERS);
}

// ─── rule discovery ───────────────────────────────────────────────────────────

// The three surfaces that carry instruction — and they do not carry the same
// weight, so the check must not pretend they do.
//
//   rules   hard law on how to implement and act. The client's override channel,
//           and the top of the authority chain. A violation BLOCKS.
//   docs    procedure. How the work is normally carried out.
//   skills  craft. Ability, technique, and quality guidance.
//
// Docs and process skills are competence, not law: breaking one is worth
// surfacing, not worth refusing the handoff over. So the same checker reports a
// blocking violation when a rule declares it and an advisory warning when only a
// doc or skill does — and when both declare it, the rule's authority wins.
const GOVERNANCE_SURFACES = [
  { surface: 'rules', authority: 'binding', dir: ['.aioson', 'rules'], rel: '.aioson/rules' },
  { surface: 'docs', authority: 'advisory', dir: ['.aioson', 'docs'], rel: '.aioson/docs' },
  { surface: 'skills', authority: 'advisory', dir: ['.aioson', 'skills', 'process'], rel: '.aioson/skills/process' }
];

async function collectGovernanceFiles(absDir, relDir) {
  let entries = [];
  try {
    entries = await fsp.readdir(absDir, { withFileTypes: true });
  } catch {
    return [];
  }
  const files = [];
  for (const entry of entries) {
    if (entry.name.toLowerCase() === 'readme.md') continue;
    if (entry.name.startsWith('_')) continue; // _archived and friends
    const abs = path.join(absDir, entry.name);
    const rel = `${relDir}/${entry.name}`;
    if (entry.isDirectory()) {
      files.push(...await collectGovernanceFiles(abs, rel));
      continue;
    }
    if (entry.isFile() && entry.name.endsWith('.md')) files.push({ abs, rel });
  }
  return files;
}

/** `enforcement:` accepts one id, a comma list, or a bracketed YAML list. */
function parseEnforcementIds(value) {
  const raw = Array.isArray(value) ? value.join(',') : String(value || '');
  return [...new Set(raw.replace(/[[\]]/g, ' ').split(/[\s,]+/).map((id) => id.trim()).filter(Boolean))];
}

async function discoverGovernance(targetDir) {
  const documents = [];
  for (const source of GOVERNANCE_SURFACES) {
    const files = await collectGovernanceFiles(path.join(targetDir, ...source.dir), source.rel);
    for (const file of files) {
      let content;
      try {
        content = await fsp.readFile(file.abs, 'utf8');
      } catch {
        continue;
      }
      const frontmatter = parseFrontmatter(content);
      const name = String(frontmatter.name || path.basename(file.rel, '.md')).trim();
      // One document may bind several checkers — `enforcement: [file-size,
      // function-size]` or a comma list — the size doctrine needs both.
      const declaredIds = parseEnforcementIds(frontmatter.enforcement);
      const enforcements = declaredIds.filter((id) => ENFORCERS[id]);
      documents.push({
        name,
        surface: source.surface,
        authority: source.authority,
        path: file.rel,
        enforcement: enforcements[0] || null,
        enforcements,
        declared_enforcement: declaredIds.length > 0 ? declaredIds.join(', ') : null,
        frontmatter
      });
    }
  }
  return documents.sort((a, b) => a.surface.localeCompare(b.surface) || a.name.localeCompare(b.name));
}

// ─── file scoping ─────────────────────────────────────────────────────────────

// audit:code's extension set plus the compiled/native languages it has no
// scanners for. A rule about naming applies to every language a project writes
// in, and a Tauri or mobile project would otherwise have half its source
// silently exempt. Kept local so widening it here never widens audit:code.
const SOURCE_EXTS = new Set([
  ...CODE_EXTS,
  '.rs', '.kt', '.kts', '.swift', '.cs', '.dart', '.scala', '.ex', '.exs',
  '.c', '.h', '.cc', '.cpp', '.hpp', '.m', '.mm', '.sql', '.astro'
]);

// Reading a compiled language means meeting its build directory, and none of
// audit:code's ignores knew about them. The cost was not noise: `divergence`
// weighs offending files against all scanned files to decide whether a project
// was BUILT against another convention, so a few thousand generated crates
// under `target/` would have told a human their own code was the problem.
//
// `bin` stays absent on purpose — Node projects keep real source there.
const SOURCE_IGNORE_DIRS = new Set([
  ...IGNORE_DIRS,
  'target', 'obj', 'Pods', 'Carthage', 'DerivedData', '.dart_tool', '.pub-cache',
  '_build', 'deps', '.gradle', '.terraform', '.cargo', '.turbo', '.output',
  '.parcel-cache', 'bower_components', 'jspm_packages'
]);

// Machine-written files that live INSIDE the source tree, where a directory
// ignore cannot reach them. Their names are the project's convention only in
// the sense that a generator chose them.
const GENERATED_FILE = /\.(min|bundle|generated|freezed|g|designer|pb)\.[^.]+$|_pb2\.py$|\.pb\.go$/i;

// `bin` is not in the ignore list above because Node projects keep real source
// there — this CLI's own entry point lives in `bin/`. Only the .NET build
// convention underneath it is machine-written.
const GENERATED_PATH = /(^|\/)bin\/(Debug|Release)\//i;

function expandPath(targetDir, abs) {
  try {
    if (fs.statSync(abs).isDirectory()) return listSourceFiles(abs, SOURCE_EXTS, SOURCE_IGNORE_DIRS);
  } catch {
    return [abs];
  }
  return [abs];
}

function resolveFileList(targetDir, options) {
  if (options.paths) {
    // A directory is the natural thing to pass, and expanding it here is the
    // difference between checking it and reporting an all-clear over nothing.
    return String(options.paths)
      .split(',')
      .map((p) => p.trim())
      .filter(Boolean)
      .flatMap((p) => expandPath(targetDir, path.resolve(targetDir, p)));
  }
  if (options.changed) {
    return gitChangedFiles(targetDir).map((rel) => path.resolve(targetDir, rel));
  }
  return listSourceFiles(targetDir, SOURCE_EXTS, SOURCE_IGNORE_DIRS);
}

function loadFiles(targetDir, absPaths) {
  const loaded = [];
  for (const abs of absPaths) {
    if (!SOURCE_EXTS.has(path.extname(abs).toLowerCase())) continue;
    const rel = path.relative(targetDir, abs).split(path.sep).join('/');
    if (rel.startsWith('..')) continue;
    if (rel.split('/').some((segment) => SOURCE_IGNORE_DIRS.has(segment))) continue;
    if (GENERATED_FILE.test(path.basename(rel)) || GENERATED_PATH.test(rel)) continue;
    const content = readText(abs);
    if (content === null) continue;
    loaded.push({ rel, lines: content.split('\n') });
  }
  return loaded;
}

// ─── run ──────────────────────────────────────────────────────────────────────

async function runRulesCheck({ args, options = {}, logger }) {
  // The module graph memo spans one check: a tree changes between checks.
  moduleGraphCache.clear();
  const targetDir = resolveTargetDir(args);
  const suppressExitCode = Boolean(options.suppressExitCode);
  const strict = Boolean(options.strict);

  const allRules = await discoverGovernance(targetDir);
  const onlyRule = options.rule ? String(options.rule).trim() : null;
  const enforceable = allRules
    .filter((rule) => rule.enforcement && (!onlyRule || rule.name === onlyRule))
    .flatMap((rule) => (rule.enforcements || [rule.enforcement]).map((id) => ({ ...rule, enforcement: id })));

  // Recording debt is a statement about the whole project, so it is never made
  // from a partial view: a baseline written under `--changed` in a repository
  // with a clean diff would accept nothing and report that it had accepted the
  // project — right at the moment a human is following this tool's own advice.
  const wantsBaseline = Boolean(options.baseline);
  const scopeRequest = wantsBaseline
    ? 'full'
    : (options.paths ? 'paths' : (options.changed ? 'changed' : 'full'));

  let files = [];
  let scope = scopeRequest;
  let scopeFallback = null;
  if (enforceable.length) {
    files = loadFiles(targetDir, resolveFileList(targetDir, wantsBaseline ? {} : options));
    // An empty scope is not a clean project — it is an unexamined one, and the
    // two are indistinguishable in every report that only prints a verdict.
    // A diff is empty in two entirely ordinary situations: the project has no
    // git yet, and the work was committed before the handoff. Both auto-fire
    // seams run with `--changed`, so treating "nothing scanned" as "nothing
    // wrong" switched the whole layer off exactly when it was being relied on.
    // Widening to the full tree is the honest answer: it is what the caller
    // meant, an accepted baseline keeps a legacy project quiet anyway, and the
    // fallback is named in the report so nobody mistakes it for a scoped pass.
    if (files.length === 0 && scopeRequest !== 'full') {
      files = loadFiles(targetDir, listSourceFiles(targetDir, SOURCE_EXTS, SOURCE_IGNORE_DIRS));
      if (files.length > 0) {
        scope = 'full';
        scopeFallback = `${scopeRequest}->full`;
      }
    }
  }

  // Several documents may bind the same checker — a rule and the process skill
  // that restates it, for instance. Run each checker once and attribute its
  // result to every document that declared it, so the same violation is not
  // reported twice for saying the same thing in two places.
  const byChecker = new Map();
  for (const rule of enforceable) {
    if (!byChecker.has(rule.enforcement)) byChecker.set(rule.enforcement, []);
    byChecker.get(rule.enforcement).push(rule);
  }

  const findings = [];
  const enforced = [];
  for (const [checkerId, documents] of byChecker) {
    const enforcer = ENFORCERS[checkerId];
    let checkerFindings = [];
    try {
      checkerFindings = enforcer.run({ targetDir, files, documents, uncapped: wantsBaseline }) || [];
    } catch {
      checkerFindings = []; // a broken checker must never block the session
    }
    const declaredBy = documents.map((doc) => doc.name);
    // A rule anywhere in the declaring set makes the whole check binding; docs
    // and skills alone keep it advisory, so a HIGH from a craft document is
    // reported as a warning rather than refusing the stage.
    const authority = documents.some((doc) => doc.authority === 'binding') ? 'binding' : 'advisory';
    for (const finding of checkerFindings) {
      findings.push({
        ...finding,
        severity: authority === 'binding' ? finding.severity : downgrade(finding.severity),
        authority,
        rule: declaredBy[0],
        // One document may declare several checkers (`enforcement: [file-size,
        // function-size]`), and each gets its own row: the row's count has to
        // be the checker's findings, not the document's.
        checker: checkerId,
        declared_by: declaredBy
      });
    }
    for (const doc of documents) {
      enforced.push({
        name: doc.name,
        path: doc.path,
        governance_surface: doc.surface,
        authority,
        enforcement: checkerId,
        surface: enforcer.surface,
        summary: enforcer.summary,
        violations: checkerFindings.length,
        ok: checkerFindings.length === 0
      });
    }
  }

  findings.sort((a, b) =>
    (SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity]) ||
    a.rule.localeCompare(b.rule) ||
    a.file.localeCompare(b.file) ||
    (a.line - b.line)
  );
  for (const finding of findings) finding.key = findingKey(finding);

  // An accepted baseline is debt, not forgiveness. A project that was already
  // built against a convention — a tree written in another language, a legacy
  // pattern predating the rule — cannot be charged retroactively for it on
  // every unrelated edit; that is how a gate stops being read. So the rule is
  // enforced in full on NEW violations, the pre-existing ones stay counted and
  // visible in every report, and only a human clearing them (or editing the
  // rule) makes them go away.
  const baseline = await readBaseline(targetDir);
  let debt = 0;
  for (const finding of findings) {
    finding.baselined = Boolean(baseline && baseline.has(finding.key));
    if (finding.baselined) debt += 1;
  }
  const live = findings.filter((finding) => !finding.baselined);
  // A rule's verdict is about what is still outstanding, so accepted debt does
  // not keep it red forever. A row is one (document × checker) pair, so it is
  // counted on both — keyed only on the document, a doc declaring two checkers
  // reported each row with the sum of both.
  const ownedBy = (rule) => (finding) => finding.declared_by.includes(rule.name) && finding.checker === rule.enforcement;
  for (const rule of enforced) {
    rule.violations = live.filter(ownedBy(rule)).length;
    rule.accepted_debt = findings.filter((finding) => finding.baselined && ownedBy(rule)(finding)).length;
    rule.ok = rule.violations === 0;
  }

  const bySeverity = { HIGH: 0, MED: 0, LOW: 0 };
  for (const finding of live) bySeverity[finding.severity] = (bySeverity[finding.severity] || 0) + 1;

  const blocking = bySeverity.HIGH > 0 || (strict && bySeverity.MED > 0);

  // Is this drift, or is it how the project has always been?
  //
  // The two look identical in a diff and could not be more different in
  // meaning. New violations in an otherwise compliant tree are drift and should
  // be fixed on the spot. A tree that was written this way from the first commit
  // is an established convention that contradicts the rule — and resolving THAT
  // is a decision about the whole project (migrate it, or accept it and scope
  // the rule), which belongs to a human, once, not to an agent mid-slice.
  //
  // Measured only when we are about to block and no baseline exists, so the
  // extra full-tree pass costs nothing on the happy path.
  let divergence = null;
  if (blocking && !baseline && !options.baseline) {
    try {
      const wholeTree = loadFiles(targetDir, listSourceFiles(targetDir, SOURCE_EXTS, SOURCE_IGNORE_DIRS));
      const offenders = new Set();
      // Count offenders at whatever severity is actually refusing the stage.
      // Under --strict a MED blocks, and measuring only HIGH meant a legacy
      // tree was blocked without being offered the three ways out — which is
      // how a human ends up deleting the rule instead of deciding about it.
      const blocks = (finding) => finding.severity === 'HIGH' || (strict && finding.severity === 'MED');
      for (const [checkerId, documents] of byChecker) {
        if (!documents.some((doc) => doc.authority === 'binding')) continue;
        const all = ENFORCERS[checkerId].run({ targetDir, files: wholeTree, documents }) || [];
        for (const finding of all) if (blocks(finding)) offenders.add(finding.file);
      }
      const ratio = wholeTree.length ? offenders.size / wholeTree.length : 0;
      if (ratio >= 0.4 && offenders.size >= 3) {
        divergence = {
          established: true,
          offending_files: offenders.size,
          scanned_files: wholeTree.length,
          ratio: Number(ratio.toFixed(2))
        };
      }
    } catch {
      divergence = null; // never let the diagnosis break the check
    }
  }

  const unenforcedDocs = allRules.filter((rule) => !rule.enforcement);
  const unenforced = unenforcedDocs.map((rule) => rule.name);
  // A document that names a checker nobody implements is the worst of both
  // worlds: its author believes it is enforced, and it sits silently among the
  // prose-only documents where nothing distinguishes a typo from a deliberate
  // choice. One misspelled id disarms a rule in every project that inherits it.
  const misdeclared = allRules
    .filter((rule) => rule.declared_enforcement && !rule.enforcement)
    .map((rule) => ({ name: rule.name, path: rule.path, declared: rule.declared_enforcement }));
  // Coverage is reported per surface on purpose. A green summary that silently
  // covers only the measurable governance would read as "all rules obeyed" when
  // most of them were never checked at all.
  const coverage = {};
  for (const source of GOVERNANCE_SURFACES) {
    const total = allRules.filter((rule) => rule.surface === source.surface).length;
    // A document binding two checkers is one enforced document, not two.
    const checked = new Set(enforced.filter((rule) => rule.governance_surface === source.surface).map((rule) => rule.path)).size;
    coverage[source.surface] = { total, enforced: checked };
  }

  const report = {
    generator: GENERATOR,
    root: targetDir,
    scope,
    scope_fallback: scopeFallback,
    scanned_files: files.length,
    rules_total: allRules.length,
    coverage,
    rules_enforced: enforced,
    unenforced,
    misdeclared,
    total: live.length,
    accepted_debt: debt,
    baseline: baseline ? { path: BASELINE_RELATIVE_PATH, accepted: baseline.size } : null,
    divergence,
    by_severity: bySeverity,
    ok: !blocking,
    findings: live.slice(0, 200)
  };
  if (blocking && !suppressExitCode) report.exitCode = 1;

  // Writing the baseline is an explicit human act (`--baseline`), never a side
  // effect of a failing run: a gate that silently accepts what it just found
  // would forgive the very drift it exists to catch.
  if (options.baseline) {
    const accepted = findings.map((finding) => finding.key);
    report.baseline = { path: BASELINE_RELATIVE_PATH, accepted: accepted.length, written: true };
    report.ok = true;
    delete report.exitCode;
    try {
      const ctxDir = path.join(targetDir, '.aioson', 'context');
      fs.mkdirSync(ctxDir, { recursive: true });
      fs.writeFileSync(path.join(targetDir, BASELINE_RELATIVE_PATH), JSON.stringify({
        generator: GENERATOR,
        note: 'Pre-existing rule violations accepted as debt. New violations still block. Clear an entry by fixing the code, or drop this file to enforce everywhere.',
        scope,
        accepted
      }, null, 2), 'utf8');
    } catch {
      // best-effort — a baseline that cannot be written is not a failure
    }
  }

  try {
    const ctxDir = path.join(targetDir, '.aioson', 'context');
    fs.mkdirSync(ctxDir, { recursive: true });
    fs.writeFileSync(path.join(ctxDir, 'rules-check.json'), JSON.stringify(report, null, 2), 'utf8');
  } catch {
    // best-effort persistence — never fail the check
  }

  if (options.json) return report;

  if (options.baseline) {
    logger.log(`Rules baseline written — ${report.baseline.accepted} pre-existing violation(s) accepted as debt in ${BASELINE_RELATIVE_PATH}.`);
    logger.log('  New violations still block. Fix code to clear an entry; delete the file to enforce everywhere again.');
    return report;
  }

  const coverageLine = GOVERNANCE_SURFACES
    .map((source) => `${source.surface} ${coverage[source.surface].enforced}/${coverage[source.surface].total}`)
    .join(', ');

  if (allRules.length === 0) {
    logger.log('No rules, docs, or process skills found under .aioson — nothing to check.');
    return report;
  }
  if (enforced.length === 0) {
    logger.log(`Rules check — 0 of ${allRules.length} governance document(s) declare a deterministic checker (${coverageLine}).`);
    logger.log(`  Available checkers: ${listEnforcerIds().join(', ')}`);
    logger.log('  Add `enforcement: <checker>` to the frontmatter of a rule, doc, or process skill to make it machine-verified.');
    return report;
  }

  const scopeLabel = scopeFallback ? `${scope}; ${scopeRequest} scope was empty` : scope;
  logger.log(`Rules check — ${enforced.length}/${allRules.length} enforced (${coverageLine}) over ${files.length} file(s) (${scopeLabel}) — ${live.length} violation(s)`);
  for (const rule of enforced) {
    const verdict = rule.ok ? 'OK  ' : (rule.authority === 'binding' ? 'FAIL' : 'WARN');
    logger.log(`  ${verdict} [${rule.governance_surface}] ${rule.name} — ${rule.summary}${rule.violations ? ` (${rule.violations})` : ''}`);
  }
  for (const finding of live.slice(0, 40)) {
    logger.log(`  [${finding.severity}] ${finding.file}:${finding.line} — ${finding.message}`);
  }
  if (live.length > 40) {
    logger.log(`  … and ${live.length - 40} more (see .aioson/context/rules-check.json)`);
  }
  if (unenforced.length) {
    logger.log(`  Prose only, not machine-checked (${unenforced.length}): ${unenforced.slice(0, 8).join(', ')}${unenforced.length > 8 ? ', …' : ''}`);
  }
  for (const doc of misdeclared) {
    logger.log(`  ! ${doc.path} declares enforcement "${doc.declared}", which no checker implements — the rule is NOT being verified.`);
    logger.log(`    Available checkers: ${listEnforcerIds().join(', ')}`);
  }
  if (debt > 0) {
    logger.log(`  Accepted debt: ${debt} pre-existing violation(s) held in ${BASELINE_RELATIVE_PATH} — still owed, not forgiven.`);
  }

  if (divergence) {
    logger.log('');
    logger.log(`  This is not drift: ${divergence.offending_files} of ${divergence.scanned_files} source files already break this rule.`);
    logger.log('  The project was built against a different convention, and choosing between them is a decision');
    logger.log('  about the whole codebase — it belongs to you, once, not to an agent in the middle of a slice:');
    logger.log('');
    logger.log('    1. Keep the rule and migrate   — rename the code, then this passes on its own.');
    logger.log('    2. Keep the rule for new code  — `aioson rules:check . --baseline` accepts what exists as');
    logger.log('                                     counted debt; every NEW violation still blocks.');
    logger.log('    3. The project owns it         — edit or delete the rule file. It is the only switch,');
    logger.log('                                     and editing it is a visible decision, not a silent bypass.');
    logger.log('');
    logger.log('  Nothing here is done for you: an agent must never pick one of these on your behalf.');
  }

  if (blocking) {
    logger.log('  RULES=FAIL (a project rule is being violated)');
  } else if (bySeverity.MED > 0) {
    logger.log('  RULES=OK (no rule broken; advisory findings from docs/skills are worth a look)');
  } else {
    logger.log('  RULES=OK');
  }

  return report;
}

module.exports = {
  runRulesCheck,
  discoverGovernance,
  readBaseline,
  findingKey,
  GOVERNANCE_SURFACES,
  ENFORCERS,
  SOURCE_EXTS,
  listEnforcerIds
};
