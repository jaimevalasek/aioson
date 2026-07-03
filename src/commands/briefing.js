'use strict';

/**
 * aioson briefing:approve  — Mark a draft briefing as approved
 * aioson briefing:unapprove — Return approved briefing(s) to draft
 *
 * Usage:
 *   aioson briefing:approve .
 *   aioson briefing:approve . --slug=briefing-agent
 *   aioson briefing:unapprove .
 *   aioson briefing:unapprove . --slug=briefing-agent
 *
 * Config file: .aioson/briefings/config.md
 * Format: YAML frontmatter (briefings: array) + Markdown table
 */

const fsp = require('node:fs/promises');
const path = require('node:path');
const readline = require('node:readline');
const {
  configPath: registryConfigPath,
  markRefinementState,
  readBriefingRegistry,
  writeBriefingRegistry
} = require('../lib/briefing-refiner/briefing-registry');
const { hashText, parseBriefingSections } = require('../lib/briefing-refiner/briefing-sections');
const { assertFeedbackPath, validateFeedback, validateFindingsInput } = require('../lib/briefing-refiner/feedback-schema');
const { resolveBriefingPath } = require('../lib/briefing-refiner/briefing-paths');
const { writeReviewArtifacts } = require('../lib/briefing-refiner/review-html');
const { applyConfirmedFeedback, applyDeclinedFeedback } = require('../lib/briefing-refiner/apply-feedback');

// ─── Interactive prompt helpers ───────────────────────────────────────────────

/**
 * Show a numbered list and ask user to pick one by number.
 * Returns the 0-based index of the selected item, or -1 on cancel.
 */
function promptSelect(items, promptText) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

    process.stdout.write('\n');
    items.forEach((item, i) => {
      process.stdout.write(`  ${i + 1}. ${item}\n`);
    });
    process.stdout.write('\n');

    rl.question(`${promptText} `, (answer) => {
      rl.close();
      const num = parseInt(answer.trim(), 10);
      if (!answer.trim() || isNaN(num) || num < 1 || num > items.length) {
        resolve(-1);
      } else {
        resolve(num - 1);
      }
    });
  });
}

/**
 * Show a numbered list (all selected by default) and ask user to type
 * comma-separated numbers to DESELECT. Returns indices to deselect.
 */
function promptCheckboxDeselect(items, promptText) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

    process.stdout.write('\n');
    items.forEach((item, i) => {
      process.stdout.write(`  [${i + 1}] ${item}\n`);
    });
    process.stdout.write('\n');

    rl.question(`${promptText} `, (answer) => {
      rl.close();
      if (!answer.trim()) {
        resolve([]);
        return;
      }
      const indices = answer
        .split(',')
        .map((s) => parseInt(s.trim(), 10) - 1)
        .filter((n) => !isNaN(n) && n >= 0 && n < items.length);
      resolve(indices);
    });
  });
}

// ─── briefing:approve ─────────────────────────────────────────────────────────

async function runBriefingApprove({ args, options = {}, logger }) {
  const projectDir = path.resolve(process.cwd(), args[0] || '.');
  const slugOpt = String(options.slug || '').trim() || null;
  const configFile = registryConfigPath(projectDir);

  // ── Read config ────────────────────────────────────────────────────────────
  let data;
  try {
    data = await readBriefingRegistry(projectDir);
  } catch (error) {
    if (error && error.code === 'invalid_frontmatter') {
      logger.error('config.md com frontmatter inválido. Verifique o arquivo manualmente.');
      return { ok: false, error: 'invalid_frontmatter' };
    }
    logger.error('Nenhum briefing encontrado. Ative @briefing para criar o primeiro briefing.');
    return { ok: false, error: 'no_config' };
  }

  const drafts = data.briefings.filter((b) => b.status === 'draft');

  if (drafts.length === 0) {
    logger.log('Nenhum briefing aguardando aprovação.');
    return { ok: true, approved: null };
  }

  // ── Select briefing ────────────────────────────────────────────────────────
  let target;

  if (slugOpt) {
    target = drafts.find((b) => b.slug === slugOpt);
    if (!target) {
      logger.error(`Briefing "${slugOpt}" não encontrado ou não está em status draft.`);
      logger.log(`Briefings draft disponíveis: ${drafts.map((b) => b.slug).join(', ')}`);
      return { ok: false, error: 'slug_not_found' };
    }
  } else {
    const labels = drafts.map((b) => `${b.slug} — criado em ${b.created_at || '?'}`);
    logger.log('Briefings aguardando aprovação:');
    const idx = await promptSelect(labels, 'Digite o número do briefing para aprovar (Enter = cancelar):');

    if (idx === -1) {
      logger.log('Operação cancelada.');
      return { ok: true, approved: null };
    }
    target = drafts[idx];
  }

  // ── Approve ────────────────────────────────────────────────────────────────
  const today = new Date().toISOString().slice(0, 10);

  const briefingEntry = data.briefings.find((b) => b.slug === target.slug);
  briefingEntry.status = 'approved';
  briefingEntry.approved_at = today;
  data.updated_at = today;

  await writeBriefingRegistry(projectDir, data);

  logger.log(`✓ Briefing "${target.slug}" aprovado.`);
  logger.log('  Ative @product para gerar o PRD — ele detectará o briefing aprovado automaticamente.');

  return { ok: true, approved: target.slug };
}

// ─── briefing:unapprove ───────────────────────────────────────────────────────

async function runBriefingUnapprove({ args, options = {}, logger }) {
  const projectDir = path.resolve(process.cwd(), args[0] || '.');
  const slugOpt = String(options.slug || '').trim() || null;
  const configFile = registryConfigPath(projectDir);

  // ── Read config ────────────────────────────────────────────────────────────
  let data;
  try {
    data = await readBriefingRegistry(projectDir);
  } catch (error) {
    if (error && error.code === 'invalid_frontmatter') {
      logger.error('config.md com frontmatter inválido. Verifique o arquivo manualmente.');
      return { ok: false, error: 'invalid_frontmatter' };
    }
    logger.error('Nenhum briefing encontrado. Ative @briefing para criar o primeiro briefing.');
    return { ok: false, error: 'no_config' };
  }

  // Only approved briefings that have NOT yet generated a PRD can be unapproved.
  // Reverting a prd_generated briefing would desync it from its downstream PRD,
  // so it is excluded here (mirrors the registry-level guard in
  // returnApprovedBriefingToDraft).
  const approveds = data.briefings.filter((b) => b.status === 'approved' && !b.prd_generated);

  if (approveds.length === 0) {
    logger.log('Nenhum briefing aprovado disponível para retornar a draft.');
    return { ok: true, unapproved: [] };
  }

  // ── Select briefings to unapprove ──────────────────────────────────────────
  let targets;

  if (slugOpt) {
    const found = approveds.find((b) => b.slug === slugOpt);
    if (!found) {
      logger.error(`Briefing "${slugOpt}" não encontrado ou não está em status approved.`);
      logger.log(`Briefings approved disponíveis: ${approveds.map((b) => b.slug).join(', ')}`);
      return { ok: false, error: 'slug_not_found' };
    }
    targets = [found];
  } else {
    const labels = approveds.map((b) => `${b.slug} — aprovado em ${b.approved_at || '?'}`);
    logger.log('Briefings aprovados (todos marcados). Digite os números para DESMARCAR:');
    const toDeselect = await promptCheckboxDeselect(
      labels,
      'Números para retornar a draft (vírgula-separados, Enter = sem mudanças):'
    );

    if (toDeselect.length === 0) {
      logger.log('Nenhuma mudança aplicada.');
      return { ok: true, unapproved: [] };
    }
    targets = toDeselect.map((i) => approveds[i]);
  }

  // ── Unapprove ──────────────────────────────────────────────────────────────
  const today = new Date().toISOString().slice(0, 10);

  for (const target of targets) {
    const entry = data.briefings.find((b) => b.slug === target.slug);
    entry.status = 'draft';
    entry.approved_at = null;
  }
  data.updated_at = today;

  await writeBriefingRegistry(projectDir, data);

  const names = targets.map((b) => b.slug);
  logger.log(`✓ ${names.length === 1 ? `Briefing "${names[0]}" retornado` : `Briefings retornados`} para draft: ${names.join(', ')}`);

  return { ok: true, unapproved: names };
}

// ─── briefing:review / briefing:apply-feedback ────────────────────────────────
//
// The deterministic half of @briefing-refiner: the agent does the intelligent
// audit (findings), the CLI owns the surface — parse briefings.md, render
// review.html + refinement-feedback.json + refinement-report.md, and later
// validate + apply the exported feedback. This kills the per-run hand-written
// HTML (token cost + schema drift) that used to stand in for these commands.

const USER_EXPORT_METHODS = new Set(['download', 'copy-paste', 'file-system-access']);

/**
 * Resolve which briefing a refinement command targets. Refinable = `draft`, or
 * `approved` with no PRD yet (same rule as the @briefing-refiner contract).
 * Unambiguous cases resolve without --slug; ambiguity is an error (these
 * commands are agent-driven, so no interactive prompt).
 */
async function resolveRefinableSlug(projectDir, slugOpt) {
  let data;
  try {
    data = await readBriefingRegistry(projectDir);
  } catch (error) {
    return { ok: false, error: error && error.code === 'invalid_frontmatter' ? 'invalid_frontmatter' : 'no_config' };
  }

  const refinable = data.briefings.filter(
    (b) => b.status === 'draft' || (b.status === 'approved' && !b.prd_generated)
  );
  const slug = String(slugOpt || '').trim() || null;

  if (slug) {
    if (!refinable.some((b) => b.slug === slug)) {
      return { ok: false, error: 'slug_not_refinable', slug, candidates: refinable.map((b) => b.slug) };
    }
    return { ok: true, slug };
  }
  if (refinable.length === 1) return { ok: true, slug: refinable[0].slug };
  if (refinable.length === 0) return { ok: false, error: 'no_refinable' };
  return { ok: false, error: 'ambiguous_slug', candidates: refinable.map((b) => b.slug) };
}

function logSlugResolutionError(resolved, logger) {
  if (resolved.error === 'no_config') {
    logger.error('No briefing registry found. Activate @briefing to create the first briefing.');
  } else if (resolved.error === 'invalid_frontmatter') {
    logger.error('briefings/config.md has invalid frontmatter. Fix it manually.');
  } else if (resolved.error === 'no_refinable') {
    logger.error('No refinable briefing (draft, or approved without a PRD).');
  } else if (resolved.error === 'ambiguous_slug') {
    logger.error(`Multiple refinable briefings — pass --slug=<slug>. Candidates: ${resolved.candidates.join(', ')}`);
  } else if (resolved.error === 'slug_not_refinable') {
    logger.error(`Briefing "${resolved.slug}" is not refinable. Candidates: ${(resolved.candidates || []).join(', ') || 'none'}`);
  }
}

async function readOptionalJson(filePath) {
  let raw;
  try {
    raw = await fsp.readFile(filePath, 'utf8');
  } catch (error) {
    if (error && error.code === 'ENOENT') return { exists: false, value: null };
    return { exists: true, error: error.message, value: null };
  }
  try {
    return { exists: true, value: JSON.parse(raw) };
  } catch (error) {
    return { exists: true, error: `invalid JSON: ${error.message}`, value: null };
  }
}

async function runBriefingReview({ args, options = {}, logger }) {
  const projectDir = path.resolve(process.cwd(), args[0] || '.');
  const resolved = await resolveRefinableSlug(projectDir, options.slug);
  if (!resolved.ok) {
    logSlugResolutionError(resolved, logger);
    return resolved;
  }
  const slug = resolved.slug;

  let markdown;
  try {
    markdown = await fsp.readFile(resolveBriefingPath(projectDir, slug, 'briefings.md'), 'utf8');
  } catch {
    logger.error(`briefings.md not found for "${slug}".`);
    return { ok: false, error: 'briefing_not_found', slug };
  }

  const parsed = parseBriefingSections(markdown, `.aioson/briefings/${slug}/briefings.md`);
  if (parsed.missing.length > 0) {
    logger.error(`briefings.md is missing mandatory sections: ${parsed.missing.join(', ')}`);
    return { ok: false, error: 'missing_sections', slug, missing: parsed.missing };
  }

  // Findings: --findings=<path>, else the canonical drop path the agent writes.
  const findingsExplicit = Boolean(options.findings);
  const findingsPath = findingsExplicit
    ? path.resolve(projectDir, String(options.findings))
    : resolveBriefingPath(projectDir, slug, 'refinement-findings.json');
  const findingsRead = await readOptionalJson(findingsPath);
  if (findingsRead.error) {
    logger.error(`cannot read findings file (${findingsPath}): ${findingsRead.error}`);
    return { ok: false, error: 'invalid_findings', slug };
  }
  if (findingsExplicit && !findingsRead.exists) {
    logger.error(`findings file not found: ${findingsPath}`);
    return { ok: false, error: 'invalid_findings', slug };
  }
  let findings = [];
  if (findingsRead.exists) {
    const value = findingsRead.value;
    findings = Array.isArray(value) ? value : (value && Array.isArray(value.findings) ? value.findings : null);
    if (!findings) {
      logger.error('findings file must be a JSON array or { "findings": [...] }');
      return { ok: false, error: 'invalid_findings', slug };
    }
    const check = validateFindingsInput(findings, { sectionIds: parsed.sections.map((s) => s.id) });
    if (!check.ok) {
      for (const err of check.errors) logger.error(`findings: ${err}`);
      return { ok: false, error: 'invalid_findings', slug, errors: check.errors };
    }
  }

  // Round counter + pending-feedback protection: never silently clobber
  // feedback the user already exported for the CURRENT briefing text. The
  // round survives apply (which archives the canonical feedback) by also
  // counting the applied-round archives.
  const feedbackPath = resolveBriefingPath(projectDir, slug, 'refinement-feedback.json');
  let lastRound = 0;
  const prior = await readOptionalJson(feedbackPath);
  if (prior.exists && prior.value && typeof prior.value === 'object') {
    lastRound = Number.isInteger(prior.value.round) ? prior.value.round : 0;
    const userExported = USER_EXPORT_METHODS.has(prior.value.export_method);
    const fresh = prior.value.source_hash === parsed.source_hash;
    if (userExported && fresh && !options.force) {
      logger.error('refinement-feedback.json holds user-exported feedback for the current briefing text.');
      logger.error('Apply it first (aioson briefing:apply-feedback) or pass --force to overwrite it.');
      return { ok: false, error: 'pending_feedback', slug };
    }
  }
  try {
    const entries = await fsp.readdir(resolveBriefingPath(projectDir, slug));
    for (const entry of entries) {
      const match = entry.match(/^refinement-feedback\.(?:applied|declined)-round(\d+)/);
      if (match) lastRound = Math.max(lastRound, Number(match[1]));
    }
  } catch { /* directory listing is best-effort */ }
  const round = lastRound + 1;

  const locale = String(options.locale || process.env.AIOS_LITE_LOCALE || 'en');
  await writeReviewArtifacts(projectDir, {
    slug,
    sourceMarkdown: markdown,
    sections: parsed.sections,
    sourceHash: parsed.source_hash,
    findings,
    round,
    locale
  });

  // Best-effort registry pointer so the dashboard/agents see the active review.
  try {
    const registry = await readBriefingRegistry(projectDir);
    markRefinementState(registry, slug, {
      refinement_status: 'review_generated',
      review_html: `.aioson/briefings/${slug}/review.html`,
      refinement_report: `.aioson/briefings/${slug}/refinement-report.md`
    });
    await writeBriefingRegistry(projectDir, registry);
  } catch { /* registry pointer is advisory */ }

  const reviewRel = `.aioson/briefings/${slug}/review.html`;
  logger.log(`✓ Review generated for "${slug}" (round ${round}): ${parsed.sections.length} sections, ${findings.length} findings.`);
  logger.log(`  Open ${reviewRel} in a real browser (not an editor preview), review, then export the JSON.`);
  if (!findingsRead.exists) {
    logger.log('  No findings file was provided — the review carries sections only.');
  }
  return {
    ok: true,
    slug,
    round,
    sections: parsed.sections.length,
    findings: findings.length,
    source_hash: parsed.source_hash,
    review: reviewRel,
    feedback: `.aioson/briefings/${slug}/refinement-feedback.json`,
    report: `.aioson/briefings/${slug}/refinement-report.md`
  };
}

function summarizeFeedback(feedback) {
  const sections = feedback.sections || [];
  const findings = feedback.findings || [];
  const changed = sections.filter((s) => s.status !== 'unchanged' || s.current_text !== s.original_text);
  const findingsByStatus = {};
  for (const finding of findings) {
    findingsByStatus[finding.status] = (findingsByStatus[finding.status] || 0) + 1;
  }
  return {
    changed_sections: changed.map((s) => ({ id: s.id, status: s.status, text_changed: s.current_text !== s.original_text })),
    blocked_sections: sections.filter((s) => s.status === 'blocked').map((s) => s.id),
    comments: (feedback.comments || []).length,
    findings_total: findings.length,
    findings_by_status: findingsByStatus,
    pending_blocking_findings: findings.filter((f) => f.blocking && f.status === 'pending').map((f) => f.id),
    blocking_items: (feedback.blocking_items || []).length
  };
}

async function runBriefingApplyFeedback({ args, options = {}, logger }) {
  const projectDir = path.resolve(process.cwd(), args[0] || '.');
  const resolved = await resolveRefinableSlug(projectDir, options.slug);
  if (!resolved.ok) {
    logSlugResolutionError(resolved, logger);
    return resolved;
  }
  const slug = resolved.slug;
  const allowStale = Boolean(options['allow-stale'] || options.allowStale);

  const feedbackRel = options.feedback
    ? String(options.feedback)
    : `.aioson/briefings/${slug}/refinement-feedback.json`;
  try {
    assertFeedbackPath(projectDir, slug, feedbackRel);
  } catch (error) {
    logger.error(error.message);
    return { ok: false, error: 'invalid_feedback_path', slug };
  }
  const feedbackPath = path.resolve(projectDir, feedbackRel);
  const feedbackRead = await readOptionalJson(feedbackPath);
  if (!feedbackRead.exists || feedbackRead.error) {
    logger.error(`cannot read feedback (${feedbackRel}): ${feedbackRead.error || 'file not found'}`);
    return { ok: false, error: 'feedback_not_found', slug };
  }
  const feedback = feedbackRead.value;

  if (options.declined) {
    const result = await applyDeclinedFeedback(projectDir, slug, feedback, { allowStale: true });
    if (!result.ok) {
      for (const err of (result.validation && result.validation.errors) || []) logger.error(`feedback: ${err}`);
      return { ...result, slug, mode: 'declined' };
    }
    // Archive the declined feedback so "file present = pending" stays true and
    // the next briefing:review does not dead-end on pending_feedback. Findings
    // are NOT archived: the briefing text is unchanged, so they stay valid.
    const canonicalPath = resolveBriefingPath(projectDir, slug, 'refinement-feedback.json');
    if (feedbackPath === canonicalPath) {
      const round = feedback.round || 1;
      let archiveName = `refinement-feedback.declined-round${round}.json`;
      try {
        await fsp.access(resolveBriefingPath(projectDir, slug, archiveName));
        archiveName = `refinement-feedback.declined-round${round}-${Date.now()}.json`;
      } catch { /* target free */ }
      try {
        await fsp.rename(canonicalPath, resolveBriefingPath(projectDir, slug, archiveName));
        result.archived = `.aioson/briefings/${slug}/${archiveName}`;
      } catch { /* archive is best-effort */ }
    }
    logger.log(`✓ Feedback declined for "${slug}" — briefings.md unchanged, ${result.skippedChanges.length} change(s) recorded as skipped.`);
    return { ...result, slug, mode: 'declined' };
  }

  if (!options.confirm) {
    // Dry-run: validate + summarize so the agent can present the plan and ask
    // for the human go-ahead. Never touches briefings.md.
    let current;
    try {
      current = await fsp.readFile(resolveBriefingPath(projectDir, slug, 'briefings.md'), 'utf8');
    } catch {
      logger.error(`briefings.md not found for "${slug}".`);
      return { ok: false, error: 'briefing_not_found', slug };
    }
    const validation = validateFeedback(feedback, { slug, currentSourceHash: hashText(current), allowStale });
    const summary = summarizeFeedback(feedback);
    if (!validation.ok) {
      for (const err of validation.errors) logger.error(`feedback: ${err}`);
      return { ok: false, error: 'invalid_feedback', slug, mode: 'dry-run', validation, summary };
    }
    logger.log(`Dry-run for "${slug}" (feedback round ${feedback.round || 1}):`);
    logger.log(`  changed sections: ${summary.changed_sections.map((c) => c.id).join(', ') || 'none'}`);
    logger.log(`  blocked sections: ${summary.blocked_sections.join(', ') || 'none'}`);
    logger.log(`  findings: ${summary.findings_total} (${Object.entries(summary.findings_by_status).map(([k, v]) => `${k}: ${v}`).join(', ') || '-'})`);
    logger.log(`  pending blocking findings: ${summary.pending_blocking_findings.join(', ') || 'none'}`);
    for (const warning of validation.warnings) logger.log(`  warning: ${warning}`);
    logger.log('Re-run with --confirm to apply.');
    return { ok: true, slug, mode: 'dry-run', pending_confirmation: true, validation, summary };
  }

  const result = await applyConfirmedFeedback(projectDir, slug, feedback, { confirmed: true, allowStale });
  if (!result.ok) {
    for (const err of (result.validation && result.validation.errors) || []) logger.error(`feedback: ${err}`);
    if (result.error === 'invalid_feedback' && result.validation && result.validation.stale && !allowStale) {
      logger.error('Feedback is stale (briefings.md changed since the review). Regenerate the review or pass --allow-stale.');
    }
    return { ...result, slug, mode: 'apply' };
  }

  // Archive the consumed canonical feedback so "pending feedback" stays a
  // deterministic signal (file present = not yet applied).
  const canonicalPath = resolveBriefingPath(projectDir, slug, 'refinement-feedback.json');
  if (feedbackPath === canonicalPath) {
    const round = feedback.round || 1;
    let archiveName = `refinement-feedback.applied-round${round}.json`;
    try {
      await fsp.access(resolveBriefingPath(projectDir, slug, archiveName));
      archiveName = `refinement-feedback.applied-round${round}-${Date.now()}.json`;
    } catch { /* target free */ }
    try {
      await fsp.rename(canonicalPath, resolveBriefingPath(projectDir, slug, archiveName));
      result.archived = `.aioson/briefings/${slug}/${archiveName}`;
    } catch { /* archive is best-effort */ }
    // Retire the consumed findings too — the next round must audit the UPDATED
    // briefing, not silently reuse last round's findings.
    try {
      await fsp.rename(
        resolveBriefingPath(projectDir, slug, 'refinement-findings.json'),
        resolveBriefingPath(projectDir, slug, `refinement-findings.applied-round${round}.json`)
      );
    } catch { /* no findings file, or archive failed — best-effort */ }
  }

  logger.log(`✓ Applied ${result.appliedChanges.length} change(s) to "${slug}".`);
  if (result.returnedToDraft) logger.log('  Briefing returned from approved to draft.');
  if (result.nextAction === 'resolve_blockers') {
    logger.log('  Blockers remain — resolve them and regenerate the review (aioson briefing:review).');
  } else {
    logger.log('  No blockers — approve with `aioson briefing:approve` and hand off to @product, or regenerate the review for another round.');
  }
  return { ...result, slug, mode: 'apply' };
}

module.exports = { runBriefingApprove, runBriefingUnapprove, runBriefingReview, runBriefingApplyFeedback };
