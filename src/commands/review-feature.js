'use strict';

/**
 * aioson review:feature [path] [--feature=<slug>] [--scope=<target>]
 *   [--skip-audit] [--out-dir=<dir>] [--tool=<tool>] [--json]
 *
 * One-shot "review an already-implemented feature" helper. It does NOT replace
 * the workflow gates — it is the post-close / standalone path for re-running the
 * adversarial + test passes against a feature:
 *
 *   1. runs the deterministic `security:audit` for the slug (writes/refreshes
 *      security-findings-{slug}.json),
 *   2. prepares the `@pentester` and `@tester` activation prompts (read-only,
 *      headless — no runtime session, no state mutation),
 *   3. prints a copy-pasteable plan (or saves the prompts to files / emits JSON).
 *
 * Slug resolution: explicit `--feature`/`--slug` wins; otherwise the active
 * feature (pulse / unique in_progress). After `feature:close` there is no active
 * feature, so the caller must pass `--feature` — the command says so explicitly.
 */

const path = require('node:path');
const fs = require('node:fs');

const { runSecurityAudit } = require('./security-audit');
const { runAgentPrompt } = require('./agents');
const { resolveActiveFeature } = require('./feature-current');

function silentLogger() {
  return { log() {}, error() {} };
}

// Build an agent activation prompt without side effects (headless skips workflow
// routing, runtime bootstrap and telemetry). Returns the prompt string, or an
// `{ error }` object when the prompt could not be built.
async function buildAgentPromptText(agentName, targetDir, agentOptions, t) {
  try {
    const res = await runAgentPrompt({
      args: [agentName, targetDir],
      options: { ...agentOptions, headless: true },
      logger: silentLogger(),
      t
    });
    return res && res.ok && typeof res.prompt === 'string' ? res.prompt : { error: 'prompt_unavailable' };
  } catch (err) {
    return { error: err.message };
  }
}

async function runReviewFeature({ args, options = {}, logger, t }) {
  const targetDir = path.resolve(process.cwd(), args?.[0] || '.');
  const tool = options.tool || 'claude';

  // 1. Resolve the feature slug.
  let slug = String(options.feature || options.slug || '').trim();
  let slugSource = slug ? 'explicit' : null;
  if (!slug) {
    const active = await resolveActiveFeature(targetDir);
    if (active.ambiguous) {
      const msg = `review:feature: ${active.candidates.length} features are in_progress (${active.candidates.join(', ')}). Pass --feature=<slug>.`;
      if (options.json) return { ok: false, reason: 'ambiguous_feature', candidates: active.candidates };
      logger.error(msg);
      return { ok: false, reason: 'ambiguous_feature' };
    }
    if (!active.slug) {
      const msg = 'review:feature: no active feature found — pass --feature=<slug> (a closed feature is no longer the active one).';
      if (options.json) return { ok: false, reason: 'missing_feature' };
      logger.error(msg);
      return { ok: false, reason: 'missing_feature' };
    }
    slug = active.slug;
    slugSource = active.source;
  }

  // 2. Deterministic security audit (non-fatal — the review still produces the
  //    agent prompts even when the audit cannot run, e.g. archived artifacts).
  let audit = null;
  const skipAudit = Boolean(options['skip-audit'] || options.skipAudit);
  if (!skipAudit) {
    // security:audit sets process.exitCode by finding severity. review:feature
    // is a prep/report command — surfacing findings is its job, not a failure —
    // so capture the audit's verdict in the result but do not let it set this
    // command's exit code.
    const prevExitCode = process.exitCode;
    audit = await runSecurityAudit({
      args: [targetDir],
      options: { feature: slug, json: true, ...(options.now ? { now: options.now } : {}) },
      logger: silentLogger()
    });
    process.exitCode = prevExitCode;
  }

  // 3. Prepare the @pentester + @tester prompts.
  const scope = String(options.scope || '').trim();
  const pentesterPrompt = await buildAgentPromptText('pentester', targetDir, {
    tool,
    feature: slug,
    ...(scope ? { mode: 'app_target', scope } : {})
  }, t);
  const testerPrompt = await buildAgentPromptText('tester', targetDir, { tool, feature: slug }, t);

  // optional: persist the prompts to files
  const outDirOpt = options['out-dir'] || options.outDir;
  const saved = {};
  if (outDirOpt) {
    const dir = path.resolve(targetDir, String(outDirOpt));
    fs.mkdirSync(dir, { recursive: true });
    if (typeof pentesterPrompt === 'string') {
      const p = path.join(dir, `review-pentester-${slug}.prompt.md`);
      fs.writeFileSync(p, pentesterPrompt, 'utf8');
      saved.pentester = p;
    }
    if (typeof testerPrompt === 'string') {
      const p = path.join(dir, `review-tester-${slug}.prompt.md`);
      fs.writeFileSync(p, testerPrompt, 'utf8');
      saved.tester = p;
    }
  }

  const result = {
    ok: true,
    slug,
    slug_source: slugSource,
    audit: audit
      ? {
          ok: audit.ok,
          exitCode: audit.exitCode,
          classification: audit.classification || null,
          summary: audit.summary || null,
          findingsCount: audit.findingsCount ?? null,
          artifactPath: audit.artifactPath || null,
          reason: audit.reason || null
        }
      : null,
    prompts: {
      pentester: typeof pentesterPrompt === 'string' ? pentesterPrompt : null,
      tester: typeof testerPrompt === 'string' ? testerPrompt : null
    },
    prompt_errors: {
      pentester: pentesterPrompt && pentesterPrompt.error ? pentesterPrompt.error : null,
      tester: testerPrompt && testerPrompt.error ? testerPrompt.error : null
    },
    saved,
    commands: {
      pentester: `aioson agent:prompt pentester . --tool=${tool} --mode=app_target --feature=${slug} --scope=<target>`,
      tester: `aioson agent:prompt tester . --tool=${tool} --feature=${slug}`
    }
  };

  if (options.json) return result;

  // ── human output ──
  const resolvedNote = slugSource && slugSource !== 'explicit' ? ` (resolved from ${slugSource})` : '';
  logger.log(`Review plan — feature: ${slug}${resolvedNote}`);
  logger.log('');

  if (!skipAudit && audit) {
    const s = audit.summary;
    if (s) {
      logger.log(`1. security:audit (deterministic) — ${audit.classification || '?'}: ${s.critical || 0} critical, ${s.high || 0} high, ${s.medium || 0} medium, ${s.low || 0} low, ${s.inconclusive || 0} inconclusive`);
      if (audit.artifactPath) logger.log(`   findings → ${path.relative(targetDir, audit.artifactPath)}`);
    } else {
      logger.log(`1. security:audit — could not run (${audit.reason || 'unknown'}); proceeding with the agent prompts.`);
    }
  } else {
    logger.log('1. security:audit — skipped (--skip-audit)');
  }
  logger.log('');

  logger.log('2. @pentester — adversarial review (vulnerabilities, threat surface):');
  if (saved.pentester) logger.log(`   saved → ${path.relative(targetDir, saved.pentester)}`);
  if (!scope) logger.log('   tip: pass --scope=<target> for a precise app_target review contract');
  logger.log('');
  logger.log(typeof pentesterPrompt === 'string'
    ? pentesterPrompt
    : `   [could not build @pentester prompt: ${pentesterPrompt.error}]`);
  logger.log('');

  logger.log('3. @tester — engineering test pass (missing tests, regressions):');
  if (saved.tester) logger.log(`   saved → ${path.relative(targetDir, saved.tester)}`);
  logger.log('');
  logger.log(typeof testerPrompt === 'string'
    ? testerPrompt
    : `   [could not build @tester prompt: ${testerPrompt.error}]`);

  return result;
}

module.exports = { runReviewFeature };
