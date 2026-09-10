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
const { parseYamlFrontmatter, getInteractionLanguage } = require('../context');
const { createTranslator } = require('../i18n');
const {
  configPath: registryConfigPath,
  markRefinementState,
  readBriefingRegistry,
  writeBriefingRegistry
} = require('../lib/refiner/briefing-registry');
const { hashText, parseBriefingSections } = require('../lib/refiner/briefing-sections');
const {
  assertFeedbackPath,
  collectApprovedReviewDecisions,
  validateFeedback,
  validateFindingsInput
} = require('../lib/refiner/feedback-schema');
const { resolveBriefingPath } = require('../lib/refiner/briefing-paths');
const { resolvePrototypeState } = require('../lib/refiner/prototype-resolution');
const { validatePrototypeManifestQuality } = require('../lib/prototype-manifest-quality');
const { readVisualEvidence, visualEvidenceBlock } = require('../lib/visual-evidence');
const { writeReviewArtifacts } = require('../lib/refiner/review-html');
const {
  applyConfirmedFeedback,
  applyDeclinedFeedback,
  writeRefinementReport
} = require('../lib/refiner/apply-feedback');
const { resolveTargetDir } = require('../lib/project-root');

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

function updateFlatFrontmatterField(content, field, value) {
  const match = String(content || '').match(/^(---\r?\n)([\s\S]*?)(\r?\n---)/);
  if (!match) return `---\n${field}: ${value}\n---\n\n${content}`;
  const lines = match[2].split(/\r?\n/);
  let found = false;
  const updated = lines.map((line) => {
    const index = line.indexOf(':');
    if (index === -1 || line.slice(0, index).trim() !== field) return line;
    found = true;
    return `${field}: ${value}`;
  });
  if (!found) updated.push(`${field}: ${value}`);
  return `${match[1]}${updated.join('\n')}${match[3]}${content.slice(match[0].length)}`;
}

function readFlatFrontmatterField(content, field) {
  const match = String(content || '').match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return null;
  for (const line of match[1].split(/\r?\n/)) {
    const index = line.indexOf(':');
    if (index === -1 || line.slice(0, index).trim() !== field) continue;
    return line.slice(index + 1).trim().replace(/^["']|["']$/g, '');
  }
  return null;
}

async function prepareApprovedPrototypeManifest(projectDir, slug, briefingContent = '', { acceptCraft = false } = {}) {
  const root = resolveBriefingPath(projectDir, slug);
  const manifestPath = path.join(root, 'prototype-manifest.md');
  const resolution = resolvePrototypeState(projectDir, slug, briefingContent);
  if (resolution.state === 'non_visual') return { ok: true, applicable: false, nonVisual: true };
  if (resolution.state === 'missing') {
    return { ok: false, error: 'prototype_resolution_missing', prototypePath: resolution.prototypePath };
  }
  // A measured benchmark traversal dispenses briefing approval entirely —
  // nothing in the round root ever becomes product authority. Refusing here
  // keeps that dispensation honest: the measured state can never be promoted
  // into an approved briefing by calling the human gate inside the round.
  if (resolution.state === 'skipped_measured_run') {
    return { ok: false, error: 'prototype_skipped_measured_run', prototypePath: resolution.prototypePath };
  }

  let manifest;
  try {
    manifest = await fsp.readFile(manifestPath, 'utf8');
  } catch {
    return { ok: false, error: 'prototype_manifest_missing', manifestPath };
  }
  const owner = readFlatFrontmatterField(manifest, 'feature');
  if (String(owner || '').toLowerCase() !== String(slug).toLowerCase()) {
    return { ok: false, error: 'prototype_manifest_owner_mismatch', owner, manifestPath };
  }
  const status = String(readFlatFrontmatterField(manifest, 'status') || '').toLowerCase();
  if (!['draft', 'approved'].includes(status)) {
    return { ok: false, error: 'prototype_manifest_status_invalid', status, manifestPath };
  }

  const report = readVisualEvidence(projectDir, slug);
  if (!report) {
    return {
      ok: false,
      error: 'prototype_visual_evidence_missing',
      manifestPath,
      details: [`run aioson verify:artifact . --kind=visual --slug=${slug} --advisory --runtime and bind its report in ## Quality evidence`]
    };
  }
  const evidence = visualEvidenceBlock(projectDir, slug);
  if (evidence && evidence.stale) {
    return { ok: false, error: 'prototype_visual_evidence_stale', manifestPath, details: evidence.stale_files || [] };
  }
  if (report.verdict === 'unverified') {
    return { ok: false, error: 'prototype_visual_evidence_unverified', manifestPath, details: report.unverified_reasons || [] };
  }
  if (!report.ok || (report.issues || []).length > 0) {
    return { ok: false, error: 'prototype_visual_evidence_failed', manifestPath, details: report.issues || [] };
  }
  const quality = validatePrototypeManifestQuality(manifest, { report, slug, requireEvidence: true });
  if (!quality.ok) {
    return { ok: false, error: 'prototype_manifest_quality_invalid', manifestPath, details: quality.issues };
  }
  const staticCraft = Boolean(report.metrics && report.metrics.craft && report.metrics.craft.measured);
  const runtimeCraft = Boolean(report.metrics && report.metrics.runtime && report.metrics.runtime.assurance && report.metrics.runtime.assurance.craft_verified);
  if (!staticCraft && !runtimeCraft) {
    return {
      ok: false,
      error: 'prototype_visual_craft_unassured',
      manifestPath,
      details: ['neither a full authored surface nor a complete rendered craft probe was measured']
    };
  }
  if (quality.runtime_matrix.length === 0) {
    return {
      ok: false,
      error: 'prototype_runtime_matrix_missing',
      manifestPath,
      details: ['add ## Runtime matrix with the entry/primary route and each reachable loading, empty, error, or success state']
    };
  }
  const runtime = report.metrics && report.metrics.runtime;
  const declaredMatrixStates = new Set(quality.runtime_matrix.map((row) => row.state).filter(Boolean));
  const owedMatrixStates = new Set(
    ((report.metrics && report.metrics.states_owed) || [])
      .filter((state) => ['loading', 'empty', 'error'].includes(state))
  );
  // Success is not universally owed, but once the browser actually observes it
  // the state is demonstrable and therefore belongs in the reproducible matrix.
  for (const state of (runtime && runtime.assurance && runtime.assurance.states_verified) || []) {
    if (state === 'success') owedMatrixStates.add(state);
  }
  const missingMatrixStates = [...owedMatrixStates].filter((state) => !declaredMatrixStates.has(state));
  const hasEntryRoute = quality.runtime_matrix.some((row) => !row.state);
  if (!hasEntryRoute || missingMatrixStates.length > 0) {
    const details = [];
    if (!hasEntryRoute) details.push('add one normal entry/primary route without a state annotation');
    if (missingMatrixStates.length > 0) details.push(`add runtime rows for reachable states: ${missingMatrixStates.join(', ')}`);
    return { ok: false, error: 'prototype_runtime_matrix_missing', manifestPath, details };
  }
  if (runtime && runtime.available) {
    const verifiedRoutes = (runtime.assurance && runtime.assurance.routes_verified) || [];
    const missingRoutes = quality.runtime_matrix.map((row) => row.name).filter((name) => !verifiedRoutes.includes(name));
    if (missingRoutes.length > 0) {
      return { ok: false, error: 'prototype_runtime_matrix_unverified', manifestPath, details: missingRoutes };
    }
  }
  // The premium bar, read at the one human gate: a brand surface whose
  // measured craft weight sits under the bar, or whose first fold is mostly
  // bare ground, is refused with the numbers — never silently approved
  // because every hygiene gate stayed green. `--accept-craft` records the
  // owner's decision in the manifest instead of hiding it.
  const craftMetrics = report.metrics && report.metrics.craft;
  const surfaceMode = String(report.metrics && report.metrics.surface_mode && report.metrics.surface_mode.mode || '').toLowerCase();
  // Only a surface that argues by aesthetics is held to the bar; an operate
  // surface earns familiarity, and an undetected one is not charged on a guess.
  const brandSurface = ['brand', 'mixed'].includes(surfaceMode);
  const weight = craftMetrics && craftMetrics.weight && craftMetrics.weight.scored ? craftMetrics.weight : null;
  const density = runtime && runtime.available && runtime.assurance && runtime.assurance.density ? runtime.assurance.density : null;
  const belowBar = [];
  if (brandSurface && weight && Number.isFinite(weight.score) && weight.score < weight.bar) {
    const thin = Object.entries(weight.grades || {}).filter(([, g]) => g < 2).map(([lever, g]) => `${lever} ${g}/2`).join(', ');
    belowBar.push(`craft weight ${weight.score}/100 below the brand bar (${weight.bar}) — thin: ${thin}`);
  }
  // The familiarity bar: an operate or read surface is not charged for
  // atmosphere, but "precision, not weight" was a sentence until it had a
  // number — a prototype with seventeen advisory warnings approved as
  // restrained. Precision is graded from the hygiene the surface already
  // reports and held to the same bar.
  const familiaritySurface = ['operate', 'read'].includes(surfaceMode);
  const precision = craftMetrics && craftMetrics.precision && craftMetrics.precision.scored ? craftMetrics.precision : null;
  // A measured craft always scores the axis of its mode, so a missing one is
  // evidence recorded before that bar existed. Freshness is content-addressed:
  // a v1.64.0 report over an unchanged operate prototype stayed "fresh", this
  // check had no number to read, and a 7/100 prototype was approved. The same
  // hole held a brand report from before the weight (v1.62.0 and earlier).
  // Stale, never a pass — and --accept-craft records a decision about a
  // measured number, never about its absence.
  const unscoredAxis = !staticCraft ? null
    : (familiaritySurface && !precision ? 'precision' : (brandSurface && !weight ? 'weight' : null));
  if (unscoredAxis) {
    return {
      ok: false,
      error: 'prototype_visual_evidence_stale',
      manifestPath,
      details: [`the evidence predates the ${surfaceMode} ${unscoredAxis} bar: craft was measured but metrics.craft.${unscoredAxis} was never scored — re-measure with aioson verify:artifact . --kind=visual --slug=${slug} --advisory --runtime, then approve again`]
    };
  }
  if (familiaritySurface && precision && Number.isFinite(precision.score) && precision.score < precision.bar) {
    const thin = Object.entries(precision.grades || {}).filter(([, g]) => g < 2).map(([axis, g]) => `${axis} ${g}/2`).join(', ');
    belowBar.push(`${surfaceMode} precision ${precision.score}/100 below the bar (${precision.bar}) — thin: ${thin}`);
  }
  // The floor travels with the measurement; 35 only covers evidence recorded
  // by a probe that predates the embedded floor.
  const densityFloor = density && Number.isFinite(density.floor) ? density.floor : 35;
  if (brandSurface && density && Number.isFinite(density.first_fold_occupancy_pct) && density.first_fold_occupancy_pct < densityFloor) {
    belowBar.push(`first fold ${100 - density.first_fold_occupancy_pct}% empty at ${density.scope || 'desktop'} (a visual subject covers ${density.first_fold_occupancy_pct}%)`);
  }
  if (belowBar.length > 0 && !acceptCraft) {
    return { ok: false, error: 'prototype_visual_craft_below_bar', manifestPath, details: belowBar };
  }
  let updated = updateFlatFrontmatterField(manifest, 'status', 'approved');
  updated = updateFlatFrontmatterField(updated, 'approved_at', new Date().toISOString());
  if (belowBar.length > 0) updated = updateFlatFrontmatterField(updated, 'craft_accepted', belowBar.join('; ').replace(/\r?\n/g, ' '));
  return { ok: true, applicable: true, manifestPath, updated, craft_accepted: belowBar.length > 0 ? belowBar : null };
}

// Every refusal of the prototype gate names what is missing, where it lives,
// and the legitimate exits — a bare error code sent users into a wall. Messages
// follow the project's interaction_language (LANGUAGE BOUNDARY): keys live in
// src/i18n/messages/* under `briefing_gate`, and the error codes stay stable
// English identifiers in every locale (tests and tooling match them).
async function resolveProjectGateTranslator(projectDir) {
  try {
    const raw = await fsp.readFile(
      path.join(projectDir, '.aioson', 'context', 'project.context.md'),
      'utf8'
    );
    const parsed = parseYamlFrontmatter(raw);
    return createTranslator(getInteractionLanguage(parsed.data, 'en')).t;
  } catch {
    return createTranslator('en').t;
  }
}

function logPrototypeGateError(logger, slug, failure, t) {
  const base = `.aioson/briefings/${slug}`;
  if (failure.error === 'prototype_resolution_missing') {
    logger.error(t('briefing_gate.resolution_missing', { slug }));
    logger.error(t('briefing_gate.resolution_missing_expected', { path: `${base}/prototype.html` }));
    logger.error(t('briefing_gate.resolution_missing_visual'));
    logger.error(t('briefing_gate.resolution_missing_non_visual'));
  } else if (failure.error === 'prototype_manifest_missing') {
    logger.error(t('briefing_gate.manifest_missing', { slug }));
    logger.error(t('briefing_gate.manifest_missing_expected', { path: `${base}/prototype-manifest.md`, slug }));
  } else if (failure.error === 'prototype_manifest_owner_mismatch') {
    logger.error(t('briefing_gate.owner_mismatch', { owner: failure.owner || '?', slug }));
    logger.error(t('briefing_gate.owner_mismatch_fix', { path: `${base}/prototype-manifest.md` }));
  } else if (failure.error === 'prototype_manifest_status_invalid') {
    logger.error(t('briefing_gate.status_invalid', { status: failure.status || '?' }));
    logger.error(t('briefing_gate.status_invalid_fix', { path: `${base}/prototype-manifest.md` }));
  } else if (failure.error === 'prototype_skipped_measured_run') {
    logger.error(t('briefing_gate.skipped_measured_run', { slug }));
    logger.error(t('briefing_gate.skipped_measured_run_fix'));
  } else if (failure.error === 'prototype_visual_craft_below_bar') {
    logger.error(t('briefing_gate.craft_below_bar', { slug }));
    for (const detail of failure.details || []) logger.error(t('briefing_gate.craft_below_bar_detail', { detail }));
    logger.error(t('briefing_gate.craft_below_bar_fix'));
  } else {
    logger.error(t('briefing_gate.generic', { slug, error: failure.error }));
    for (const detail of failure.details || []) logger.error(`  - ${detail}`);
  }
}

// ─── briefing:approve ─────────────────────────────────────────────────────────

async function runBriefingApprove({ args, options = {}, logger }) {
  const projectDir = resolveTargetDir(args);
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
  const briefingContent = await fsp.readFile(
    resolveBriefingPath(projectDir, target.slug, 'briefings.md'),
    'utf8'
  ).catch(() => '');
  const prototypeApproval = await prepareApprovedPrototypeManifest(
    projectDir,
    target.slug,
    briefingContent,
    { acceptCraft: Boolean(options['accept-craft'] || options.acceptCraft) }
  );
  if (!prototypeApproval.ok) {
    logPrototypeGateError(logger, target.slug, prototypeApproval, await resolveProjectGateTranslator(projectDir));
    return { ok: false, error: prototypeApproval.error, slug: target.slug };
  }

  const briefingEntry = data.briefings.find((b) => b.slug === target.slug);
  briefingEntry.status = 'approved';
  briefingEntry.approved_at = today;
  data.updated_at = today;

  await writeBriefingRegistry(projectDir, data);
  if (prototypeApproval.applicable) {
    await fsp.writeFile(prototypeApproval.manifestPath, prototypeApproval.updated, 'utf8');
  }

  logger.log(`✓ Briefing "${target.slug}" aprovado.`);
  if (prototypeApproval.applicable) {
    logger.log('  prototype.html congelado como contrato visual/interacional aprovado.');
  }
  logger.log('  Ative @product para gerar o PRD — ele detectará o briefing aprovado automaticamente.');

  return { ok: true, approved: target.slug };
}

// ─── briefing:unapprove ───────────────────────────────────────────────────────

async function runBriefingUnapprove({ args, options = {}, logger }) {
  const projectDir = resolveTargetDir(args);
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
    const manifestPath = resolveBriefingPath(projectDir, target.slug, 'prototype-manifest.md');
    try {
      const manifest = await fsp.readFile(manifestPath, 'utf8');
      let updated = updateFlatFrontmatterField(manifest, 'status', 'draft');
      updated = updateFlatFrontmatterField(updated, 'approved_at', 'null');
      await fsp.writeFile(manifestPath, updated, 'utf8');
    } catch {
      // A briefing without a prototype has no manifest to return to draft.
    }
  }
  data.updated_at = today;

  await writeBriefingRegistry(projectDir, data);

  const names = targets.map((b) => b.slug);
  logger.log(`✓ ${names.length === 1 ? `Briefing "${names[0]}" retornado` : `Briefings retornados`} para draft: ${names.join(', ')}`);

  return { ok: true, unapproved: names };
}

// ─── briefing:review / briefing:apply-feedback ────────────────────────────────
//
// The deterministic half of @refiner: the agent does the intelligent
// audit (findings), the CLI owns the surface — parse briefings.md, render
// review.html + refinement-feedback.json + refinement-report.md, and later
// validate + apply the exported feedback. This kills the per-run hand-written
// HTML (token cost + schema drift) that used to stand in for these commands.

const USER_EXPORT_METHODS = new Set(['download', 'copy-paste', 'file-system-access']);

/**
 * Resolve which briefing a refinement command targets. Refinable = `draft`, or
 * `approved` with no PRD yet (same rule as the @refiner contract).
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
  const projectDir = resolveTargetDir(args);
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
    approved_review_decisions: collectApprovedReviewDecisions(findings).map((decision) => ({
      id: decision.id,
      selected_option_ids: decision.selected_options.map((option) => option.id)
    })),
    pending_blocking_findings: findings.filter((f) => f.blocking && f.status === 'pending').map((f) => f.id),
    blocking_items: (feedback.blocking_items || []).length
  };
}

async function runBriefingApplyFeedback({ args, options = {}, logger }) {
  const projectDir = resolveTargetDir(args);
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
    if (result.reportData && result.archived) {
      result.reportData.feedback_path = result.archived;
      await writeRefinementReport(projectDir, slug, result.reportData);
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
    logger.log(`  approved review decisions: ${summary.approved_review_decisions.map((decision) => `${decision.id}=${decision.selected_option_ids.join('+')}`).join(', ') || 'none'}`);
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
  // An unresolved prototype makes `briefing:approve` refuse — never point the
  // user there while it is missing. Blockers keep priority over this check.
  let prototypePending = false;
  if (result.nextAction === 'approve_briefing') {
    try {
      const updatedBriefing = await fsp.readFile(resolveBriefingPath(projectDir, slug, 'briefings.md'), 'utf8');
      prototypePending = resolvePrototypeState(projectDir, slug, updatedBriefing).state === 'missing';
    } catch { /* unreadable briefing — approve will surface it */ }
  }
  if (prototypePending) {
    result.nextAction = 'build_prototype';
    if (result.reportData) result.reportData.next_action = 'build_prototype';
  }
  if (result.reportData && (result.archived || prototypePending)) {
    if (result.archived) result.reportData.feedback_path = result.archived;
    await writeRefinementReport(projectDir, slug, result.reportData);
  }

  logger.log(`✓ Applied ${result.appliedChanges.length} change(s) to "${slug}".`);
  if (result.returnedToDraft) logger.log('  Briefing returned from approved to draft.');
  if (result.nextAction === 'resolve_blockers') {
    logger.log('  Blockers remain — resolve them and regenerate the review (aioson briefing:review).');
  } else if (result.nextAction === 'build_prototype') {
    logger.log('  No blockers, but the prototype is unresolved — `aioson briefing:approve` will refuse until it exists.');
    logger.log(`  Visual scope → activate @refiner to build .aioson/briefings/${slug}/prototype.html (+ manifest).`);
    logger.log('  Non-visual feature → record `prototype: not_applicable` in briefings.md, then approve.');
  } else {
    logger.log('  No blockers — approve with `aioson briefing:approve` and hand off to @product, or regenerate the review for another round.');
  }
  return { ...result, slug, mode: 'apply' };
}

// ─── briefing:feedback — the lean read of a pending round ────────────────────
// The refiner read the whole exported JSON to fold notes into `current_text`:
// 100–148 KB per round on a mid-sized briefing, 85% of it the briefing text
// copied twice (original_text + current_text for every section, commented or
// not). This view prints what the fold needs — the round, every finding,
// comment, decision and blocking item, and the text of only the sections a
// note or a status change touches — and names the raw file for the edit.
function feedbackTouchesSection(section, { findings, comments, decisions, blocking }) {
  const id = String(section.id || '');
  if (!id) return false;
  const targets = (list, keep = () => true) => list.some((item) => item && String(item.section_id || '') === id && keep(item));
  return targets(comments)
    || targets(decisions)
    || targets(blocking)
    || targets(findings, (f) => f.status === 'accepted' || (Array.isArray(f.selected_option_ids) && f.selected_option_ids.length > 0) || Boolean(f.note));
}

// One view line per note. A silent cut read as the whole note — the refiner
// folds what it sees — so a cut says so and names where the full text lives.
function viewLine(value, max) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  return text.length > max ? `${text.slice(0, max).trimEnd()}… (cut — see --json)` : text;
}

async function runBriefingFeedback({ args, options = {}, logger }) {
  const projectDir = resolveTargetDir(args);
  const resolved = await resolveRefinableSlug(projectDir, options.slug);
  if (!resolved.ok) {
    logSlugResolutionError(resolved, logger);
    return resolved;
  }
  const slug = resolved.slug;
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
  const feedback = feedbackRead.value || {};
  const sections = Array.isArray(feedback.sections) ? feedback.sections : [];
  const findings = Array.isArray(feedback.findings) ? feedback.findings : [];
  const comments = Array.isArray(feedback.comments) ? feedback.comments : [];
  const decisions = Array.isArray(feedback.decisions) ? feedback.decisions : [];
  const blocking = Array.isArray(feedback.blocking_items) ? feedback.blocking_items : [];

  const view = sections.map((section) => {
    const status = section.status || 'unchanged';
    const textChanged = typeof section.original_text === 'string' && typeof section.current_text === 'string'
      && section.original_text !== section.current_text;
    const include = status !== 'unchanged' || textChanged || feedbackTouchesSection(section, { findings, comments, decisions, blocking });
    return {
      id: section.id,
      title: section.title,
      status,
      comments_count: Number.isInteger(section.comments_count) ? section.comments_count : 0,
      text_changed: textChanged,
      ...(include ? { current_text: section.current_text } : {})
    };
  });
  const payload = {
    ok: true,
    slug,
    feedback: feedbackRel,
    schema_version: feedback.schema_version || null,
    round: feedback.round || 1,
    source_hash: feedback.source_hash || null,
    review_generated_at: feedback.review_generated_at || null,
    findings: findings.map((f) => ({
      id: f.id,
      section_id: f.section_id,
      category: f.category,
      severity: f.severity,
      blocking: Boolean(f.blocking),
      status: f.status || 'pending',
      text: f.text,
      recommendation: f.recommendation || '',
      note: f.note || '',
      question: f.question || '',
      options: Array.isArray(f.options) ? f.options.map((o) => ({ id: o.id, label: o.label, recommended: Boolean(o.recommended) })) : [],
      selected_option_ids: Array.isArray(f.selected_option_ids) ? f.selected_option_ids : [],
      rationale: f.rationale || ''
    })),
    comments,
    decisions,
    blocking_items: blocking,
    sections: view,
    bytes: { file: Buffer.byteLength(JSON.stringify(feedback)), view: 0 }
  };
  payload.bytes.view = Buffer.byteLength(JSON.stringify(payload));

  if (options.json) return payload;

  const included = view.filter((s) => typeof s.current_text === 'string');
  logger.log(`briefing:feedback — "${slug}" round ${payload.round} (${feedbackRel}, ${Math.round(payload.bytes.file / 1024)} KB; this view ${Math.round(payload.bytes.view / 1024)} KB)`);
  logger.log(`  sections: ${sections.length} · with text here: ${included.length} (${included.map((s) => s.id).join(', ') || 'none'}) · findings: ${findings.length} · comments: ${comments.length} · decisions: ${decisions.length} · blocking items: ${blocking.length}`);
  for (const f of payload.findings) {
    logger.log(`  [${f.id}] ${f.section_id || '-'} · ${f.category}/${f.severity}${f.blocking ? ' · BLOCKING' : ''} · ${f.status}${f.selected_option_ids.length ? ` · chose ${f.selected_option_ids.join('+')}` : ''}`);
    logger.log(`      ${viewLine(f.text, 400)}`);
    if (f.note) logger.log(`      note: ${viewLine(f.note, 400)}`);
    if (f.rationale) logger.log(`      rationale: ${viewLine(f.rationale, 400)}`);
  }
  // The review page's collect() — the only producer — writes the owner's words
  // to `note` on comments and blocking items. Reading `text`/`body` first
  // printed every comment blank (`comment on temas: `) in the view the refiner
  // folds from; `text`/`body`/`reason` stay as fallbacks for hand-written rounds.
  for (const c of comments) {
    logger.log(`  comment on ${c && c.section_id ? c.section_id : '-'}: ${viewLine(c && (c.note || c.text || c.body), 400)}`);
  }
  for (const d of decisions) {
    logger.log(`  decision on ${d && d.section_id ? d.section_id : '-'}: ${viewLine(d && (d.text || d.decision || d.status), 300)}`);
  }
  for (const b of blocking) {
    logger.log(`  blocking on ${b && b.section_id ? b.section_id : '-'}: ${viewLine((b && (b.note || b.text || b.reason)) || JSON.stringify(b), 300)}`);
  }
  for (const s of view) {
    logger.log('');
    logger.log(`## ${s.id} — ${s.title} [${s.status}${s.text_changed ? ', text changed' : ''}${s.comments_count ? `, ${s.comments_count} comment(s)` : ''}]`);
    if (typeof s.current_text === 'string') logger.log(s.current_text);
    else logger.log('  (untouched — text omitted; open the raw file only if this section must change)');
  }
  logger.log('');
  logger.log(`Fold notes into \`current_text\` with a surgical edit of ${feedbackRel}, then dry-run: aioson briefing:apply-feedback . --slug=${slug} --json`);
  return payload;
}

module.exports = { runBriefingApprove, runBriefingUnapprove, runBriefingReview, runBriefingApplyFeedback, runBriefingFeedback };
