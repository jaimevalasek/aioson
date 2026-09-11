'use strict';

/**
 * Canonical map: which agents produce a `verify:artifact`-checkable artifact at
 * session end, the kind, and how that artifact's path is resolved.
 *
 *   needs: 'none'  — self-resolving (fixed path); the engine can prove it at
 *                    `agent:done` with no extra input.
 *   needs: 'slug'  — path keyed by --slug; the agent threads it into agent:done.
 *   needs: 'file'  — date-stamped / caller-known path, threaded via --file.
 *   needs: 'dir'   — a generated-site root, via --dir (advisory static floor only
 *                    at agent:done; the full `npm run build` stays in the agent's
 *                    explicit Done gate).
 *   featureSlugged — the artifact slug IS the feature slug; when no explicit
 *                    --slug was threaded, fall back to --feature so the gate
 *                    still auto-fires from `agent:done`/`agent:epilogue` calls
 *                    that only carry the feature.
 *
 * This is the bridge that makes the periphery's done-gates AUTO-FIRE: instead of
 * relying on each agent to remember its `## Done gate` line, `agent:done` runs the
 * check itself (advisory, best-effort). Keep in sync with the RULESETS/ADAPTERS
 * registry in commands/verify-artifact.js and the per-agent Done gates — it is one
 * of the workflow agent-enumeration sites.
 */
const AGENT_ARTIFACT_KIND = {
  setup: { kind: 'project-context', needs: 'none' },
  discover: { kind: 'bootstrap', needs: 'none' },
  committer: { kind: 'commit-message', needs: 'none' },
  genome: { kind: 'genome', needs: 'slug' },
  'profiler-forge': { kind: 'genome', needs: 'slug' },
  'profiler-researcher': { kind: 'research-report', needs: 'slug' },
  'profiler-enricher': { kind: 'enriched-profile', needs: 'slug' },
  'design-hybrid-forge': { kind: 'hybrid-skill', needs: 'slug' },
  copywriter: { kind: 'copy', needs: 'slug' },
  orache: { kind: 'orache-report', needs: 'file' },
  // The planner's spec artifacts stay under the workflow gates (Gate C), not
  // here. Its one DERIVED artifact — the compiled orchestrated-execution plan —
  // is digest-bound to the plan it was compiled from, so a plan edited after
  // `execution:compile` is caught at the planner's session end instead of at
  // `execution:run`. Single-DEV features never compile one: `skipIfMissing`
  // keeps the gate silent for them.
  planner: {
    kind: 'execution-plan', needs: 'slug', featureSlugged: true,
    skipIfMissing: '.aioson/context/execution-plan-{slug}.json'
  },
  // A forged site is an interface: its build is proven by kind=site, its
  // craft, tells and materials by the same measured floor every other visual
  // producer passes — keyed on the deliverable directory it already receives.
  'site-forge': {
    kind: 'site', needs: 'dir', opts: { noBuild: true },
    also: [{ kind: 'visual', needs: 'dir' }]
  },
  // The implementers. Their artifact is code, and the one surface nothing
  // measured was the shipped front-end — the prototype auto-fired because it
  // had an owner and a path; the implementation had neither. `interfaceDir`
  // resolves the directory from the feature's delivered change set (common
  // ancestor of the changed html/css/tsx/vue… files; a backend-only change
  // resolves to nothing and skips — a state, not a finding), and `conformance`
  // compares the measurement with the prototype's recorded evidence, so a
  // regression below the approved floor is a number in the session end, not
  // a memory the agent had to keep.
  dev: { kind: 'visual', needs: 'dir', featureSlugged: true, interfaceDir: true, conformance: true },
  qa: { kind: 'visual', needs: 'dir', featureSlugged: true, interfaceDir: true, conformance: true },
  deyvin: { kind: 'visual', needs: 'dir', featureSlugged: true, interfaceDir: true, conformance: true },
  // The refiner's session end proves BOTH halves of its output: the review
  // surface AND the prototype's measured craft. `skipIfMissing` keeps the
  // visual gate quiet for genuinely non-visual features (no prototype.html).
  'refiner': {
    kind: 'review', needs: 'slug', featureSlugged: true,
    also: [{ kind: 'visual', needs: 'slug', featureSlugged: true, skipIfMissing: '.aioson/briefings/{slug}/prototype.html' }]
  },
  briefing: { kind: 'briefing', needs: 'slug', featureSlugged: true },
  tester: { kind: 'test-report', needs: 'slug', featureSlugged: true },
  // The pilot is the squad's one flagship deliverable. When it is a web
  // surface, the session end also proves its measured visual floor (craft,
  // generation tells, materials, cross-project fingerprint) — the same gate the
  // built-in visual agents pass, keyed on the DELIVERABLE, not on who built it,
  // so a squad-generated executor never ships unmeasured. Non-web pilots
  // (a report, a dataset) skip it: absence of HTML is a state, not a finding.
  // The package itself rides the same session end: strict validation plus the
  // executor lint. Before this rider the Done gate lived only in the kernel's
  // prose, and squads closed green with a dozen strict errors nobody ran.
  squad: {
    kind: 'squad-pilot', needs: 'slug',
    also: [
      { kind: 'squad-package', needs: 'slug' },
      { kind: 'visual', needs: 'dir', dir: 'output/{slug}/pilot', skipIfNoHtml: 'output/{slug}/pilot' }
    ]
  },
  shakedown: { kind: 'shakedown', needs: 'file' }
};

/** True when `dir` holds at least one HTML file within three levels. */
function hasHtmlSurface(dir, depth = 0) {
  const fs = require('node:fs');
  const path = require('node:path');
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return false;
  }
  for (const entry of entries) {
    if (entry.isFile() && /\.html?$/i.test(entry.name)) return true;
    if (entry.isDirectory() && depth < 3 && entry.name !== 'node_modules' && hasHtmlSurface(path.join(dir, entry.name), depth + 1)) return true;
  }
  return false;
}

const NEEDS_FLAG = { slug: '--slug=<slug>', file: '--file=<path>', dir: '--dir=<dir>' };

/** The one-line verdict of a passing visual measurement — numbers, not "ok". */
function summarizeVisualRun(report, dir) {
  if (!report || report.kind !== 'visual' || !report.metrics) return null;
  const m = report.metrics;
  const parts = [];
  if (m.craft && m.craft.measured) parts.push(`craft ${m.craft.active_levers}/${m.craft.lever_count || 5}`, `materials ${m.craft.material_depth ?? 0}/7`);
  else if (typeof m.declarations === 'number') parts.push(`craft not measured (${m.declarations} declarations)`);
  parts.push(`tells ${m.tells ? m.tells.active : 0}`);
  if (m.conformance) {
    // `regressed: []` means "nothing regressed on the axes that were compared",
    // which is a pass only when something WAS compared. A comparison that never
    // ran used to reach this line as "holds the prototype floor" — a verdict on
    // a measurement that does not exist.
    const c = m.conformance;
    const compared = Array.isArray(c.compared) ? c.compared : null;
    const notCompared = Array.isArray(c.not_compared) ? c.not_compared : [];
    const nothingCompared = c.state === 'not-compared' || (compared && compared.length === 0);
    if (c.regressed.length > 0) parts.push(`REGRESSED vs prototype: ${c.regressed.join(', ')}`);
    else if (nothingCompared) parts.push('NOT compared to a prototype floor');
    else if (notCompared.length > 0) parts.push(`holds the prototype floor (${notCompared.join(', ')} not compared)`);
    else parts.push('holds the prototype floor');
  }
  parts.push(`${(report.warnings || []).length} warning(s)`);
  return `${dir ? `${dir}: ` : ''}${parts.join(' | ')} — see .aioson/context/verify-artifact-visual.json`;
}

/** Resolve an agent name (with or without a leading @) to its artifact mapping, or null. */
function resolveAgentArtifact(agent) {
  const { canonicalAgentId } = require('./agents');
  return AGENT_ARTIFACT_KIND[canonicalAgentId(agent)] || null;
}

/**
 * Best-effort advisory `verify:artifact` for the calling agent at `agent:done`.
 *
 * Returns `null` when the agent produces no checkable artifact (the common case —
 * product, dev, qa, …). Otherwise a uniform advisory descriptor:
 *   { kind, ok, skipped, issues?, reason }
 * - self-resolving kinds, or locator-keyed kinds whose locator was threaded into
 *   agent:done, run the real check (advisory — never blocks).
 * - a locator-keyed kind with no locator yields `skipped:true` plus a one-line
 *   hint naming the exact command, so it is surfaced instead of silently missing.
 *
 * Never throws — a failure here must never break the session-end registration.
 */
async function verifyAgentArtifact({ targetDir, agent, options = {} }) {
  const mapping = resolveAgentArtifact(agent);
  if (!mapping) return null;

  // The active feature, when the caller threaded none. Resolved once per
  // done-gate and only for mappings that need a slug — `agent:done` lines in
  // the kernels rarely carry --feature, and the prototype evidence, the
  // conformance comparison and the interface root all hang off the slug.
  let activeFeature;
  const resolveFeature = async () => {
    if (activeFeature !== undefined) return activeFeature;
    activeFeature = null;
    try {
      const { resolveActiveFeature } = require('./commands/feature-current');
      const active = await resolveActiveFeature(targetDir);
      if (active && active.slug && !active.ambiguous) activeFeature = active.slug;
    } catch {
      activeFeature = null;
    }
    return activeFeature;
  };

  const runOne = async (m) => {
    const { kind, needs } = m;
    const explicitFeature = options.feature ? String(options.feature).trim() : null;
    const feature = explicitFeature || (m.featureSlugged ? await resolveFeature() : null);
    const slug = options.slug
      ? String(options.slug).trim()
      : (m.featureSlugged && feature ? feature : null);
    const file = options.file ? String(options.file).trim() : null;
    // A secondary kind may derive its directory from the slug (`dir` template)
    // when the caller threaded none — the pilot lives at a contract path.
    let dir = options.dir
      ? String(options.dir).trim()
      : (m.dir && slug ? m.dir.replace('{slug}', slug) : null);

    // The implementers' interface root comes from the delivered change set.
    let interfaceFiles = null;
    if (!dir && m.interfaceDir) {
      const { resolveInterfaceDir } = require('./lib/interface-root');
      const resolved = resolveInterfaceDir(targetDir, { slug });
      if (!resolved.dir) return { kind, ok: true, skipped: true, reason: resolved.reason };
      dir = resolved.dir;
      interfaceFiles = resolved.files;
    }

    if (m.skipIfNoHtml) {
      const rel = m.skipIfNoHtml.replace('{slug}', slug || '');
      const path = require('node:path');
      if (!slug || !hasHtmlSurface(path.resolve(targetDir, rel))) {
        return { kind, ok: true, skipped: true, reason: `${rel} holds no HTML surface — nothing to measure` };
      }
    }

    const missingLocator =
      (needs === 'slug' && !slug) || (needs === 'file' && !file) || (needs === 'dir' && !dir);
    if (missingLocator) {
      const flag = NEEDS_FLAG[needs];
      return {
        kind,
        ok: true,
        skipped: true,
        reason: `needs ${flag} — run: aioson verify:artifact . --kind=${kind} ${flag} --advisory`
      };
    }

    // A secondary kind may only apply when its artifact exists at all (e.g. the
    // visual gate for a non-visual feature with no prototype) — absence is a
    // legitimate state there, not a failure to nag about.
    if (m.skipIfMissing) {
      const rel = m.skipIfMissing.replace('{slug}', slug || '');
      const fs = require('node:fs');
      const path = require('node:path');
      if (!fs.existsSync(path.resolve(targetDir, rel))) {
        return { kind, ok: true, skipped: true, reason: `${rel} not present — nothing to measure` };
      }
    }

    try {
      const { runVerifyArtifact } = require('./commands/verify-artifact');
      const report = await runVerifyArtifact({
        args: [targetDir],
        options: {
          kind,
          slug,
          file,
          dir,
          advisory: true,
          suppressExitCode: true,
          json: true,
          ...(m.conformance && slug ? { conformance: slug } : {}),
          ...(m.opts && m.opts.noBuild ? { 'no-build': true } : {})
        },
        logger: { log() {}, error() {}, warn() {} }
      });
      if (!report) return null;
      const issues = report.issues || [];
      const head = issues.slice(0, 3).join('; ');
      const more = issues.length > 3 ? ` (+${issues.length - 3} more)` : '';
      // A measurement that passed its blocking tier still carries the numbers
      // the session end exists to surface — craft, tells, materials, and the
      // conformance delta against the prototype — so the reason line names
      // them instead of reading as a bare "ok".
      const conformance = report.metrics && report.metrics.conformance;
      const regressed = conformance && Array.isArray(conformance.regressed) ? conformance.regressed : [];
      const measuredLine = summarizeVisualRun(report, dir);
      return {
        kind,
        ok: Boolean(report.ok),
        skipped: false,
        issues,
        ...(interfaceFiles ? { interface_files: interfaceFiles.length, dir } : {}),
        ...(regressed.length > 0 ? { regressed } : {}),
        reason: report.ok
          ? measuredLine
          : `${head}${more} — advisory; see .aioson/context/verify-artifact-${kind}.json`
      };
    } catch {
      return null;
    }
  };

  const primary = await runOne(mapping);
  if (!primary) return null;
  if (Array.isArray(mapping.also) && mapping.also.length > 0) {
    const secondary = [];
    for (const m of mapping.also) {
      const res = await runOne(m);
      if (res) secondary.push(res);
    }
    if (secondary.length > 0) primary.also = secondary;
  }
  return primary;
}

module.exports = { AGENT_ARTIFACT_KIND, resolveAgentArtifact, verifyAgentArtifact };
