'use strict';

/**
 * aioson feature:close — close a feature after QA sign-off.
 *
 * Updates spec-{slug}.md (adds QA sign-off block), features.md (sets status to done),
 * and project-pulse.md (removes from active work).
 *
 * Usage:
 *   aioson feature:close . --feature=checkout --verdict=PASS
 *   aioson feature:close . --feature=checkout --verdict=PASS --residual="Email delivery not tested E2E"
 *   aioson feature:close . --feature=checkout --verdict=FAIL --notes="Auth edge case missing"
 */

const fs = require('node:fs/promises');
const path = require('node:path');
const { contextDir, readFileSafe, readFeatureArtifactSafe, parseFrontmatter } = require('../preflight-engine');
const { runFeatureArchive } = require('./feature-archive');
const { evaluateFollowups, persistFollowupPlans } = require('../lib/delivery-followups');
const { runGateCheck } = require('./gate-check');
const isAcceptedVerdict = verdict => ['PASS', 'ACCEPTED_WITH_FOLLOWUPS'].includes(verdict);
const { runStateReset } = require('./state-save');
const dossierBootstrap = require('../dossier/dossier-bootstrap');
const dossierStore = require('../dossier/store');
const { emitDossierEvent } = require('../lib/dossier-telemetry');
const { appendScoutToFeatureDossier } = require('../dossier/scout-section');
const { emitSubTaskEvent } = require('../sub-task-telemetry');
const { loadConfig } = require('../sub-task-engine');
const { runDistillation, readFeatureClassification } = require('../learning-loop-engine');
const { openRuntimeDb } = require('../runtime-store');
const { runNotify } = require('./notify');
const { splitCurrentState, buildArchiveContent, parseActiveSlugs } = require('../current-state-trim');
const {
  evaluateContractIntegrityGate,
  formatContractIntegrityGateError
} = require('../harness/contract-integrity-gate');
const { analyzeFeatureCompleteness, findingsThroughStage } = require('../lib/feature-completeness');
const { auditAcceptanceCriteriaTests } = require('../lib/ac-test-audit');
const { resolveTargetDir } = require('../lib/project-root');
const { visualEvidenceBlock, formatVisualEvidence } = require('../lib/visual-evidence');

// P0 agent-loading-contract: a feature closing is the natural cadence to roll
// aged-out current-state.md entries into the cold archive. Conservative window
// (gentle, automatic) — manual `memory:trim --keep=<N>` can trim harder.
const AUTO_CLOSE_KEEP = 25;

function nowDate() {
  return new Date().toISOString().slice(0, 10);
}

function nowTimestamp() {
  return new Date().toISOString();
}

function quoteYaml(value) {
  return `"${String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

function extractRecentActivities(content) {
  if (!content) return [];
  const activityMatch = content.match(/## Recent Activity\n([\s\S]*?)(?=\n##|\s*$)/);
  if (!activityMatch) return [];
  return activityMatch[1]
    .split('\n')
    .filter((line) => line.trim().startsWith('-'))
    .slice(-2);
}

async function updateProjectPulseFile(pulsePath, slug, verdict, summary, date) {
  const existing = await readFileSafe(pulsePath);
  if (!existing) return false;

  const fm = parseFrontmatter(existing);
  const gate = `Gate D: ${verdict === 'ACCEPTED_WITH_FOLLOWUPS' ? 'accepted_with_followups' : isAcceptedVerdict(verdict) ? 'approved' : 'rejected'}`;
  const recentActivities = extractRecentActivities(existing);
  let activityLine = `- ${date} @qa → ${slug} (${gate}) VERDICT: ${verdict}`;
  if (summary) activityLine += `: ${summary}`;
  const stripDate = (line) => line.replace(/^-\s+\d{4}-\d{2}-\d{2}\s+/, '');
  const activitySignature = stripDate(activityLine);
  const dedupedActivities = recentActivities.filter((line) => stripDate(line) !== activitySignature);

  const activeFeature = isAcceptedVerdict(verdict) ? '(none)' : slug;
  const activeWork = isAcceptedVerdict(verdict) ? '' : `${slug} → @qa → qa_failed`;
  const blockers = isAcceptedVerdict(verdict)
    ? 'none'
    : (summary || fm.blockers || 'QA blockers pending');
  const nextRecommendation = isAcceptedVerdict(verdict)
    ? '@product start the next feature'
    : '@dev fix QA blockers and return to @qa';

  const lines = [
    '---',
    `last_updated: ${nowTimestamp()}`,
    'last_agent: qa',
    `last_gate: ${gate}`,
    `active_feature: ${activeFeature}`,
    `active_work: ${quoteYaml(activeWork)}`,
    `blockers: ${quoteYaml(blockers)}`,
    `next_recommendation: ${quoteYaml(nextRecommendation)}`,
    '---',
    '',
    '# Project Pulse',
    '',
    '## Status',
    '',
    '- **Last agent:** @qa',
    `- **Last gate:** ${gate}`,
    `- **Active feature:** ${activeFeature}`,
    `- **Active work:** ${activeWork || 'none'}`,
    `- **Blockers:** ${blockers}`,
    `- **Next:** ${nextRecommendation}`,
    '',
    '## Recent Activity',
    '',
    ...dedupedActivities,
    activityLine,
    ''
  ];

  await fs.writeFile(pulsePath, lines.join('\n'), 'utf8');
  return true;
}

async function updateSpecFile(specPath, verdict, residual, date) {
  const content = await readFileSafe(specPath);
  if (!content) return false;

  const signOff = [
    '',
    '## QA Sign-off',
    '',
    `- **Date:** ${date}`,
    `- **Verdict:** ${verdict}`,
    residual ? `- **Residual:** ${residual}` : null,
    `- **Gate D (execution):** ${verdict === 'ACCEPTED_WITH_FOLLOWUPS' ? 'accepted_with_followups' : isAcceptedVerdict(verdict) ? 'approved' : 'rejected'}`,
    ''
  ].filter((l) => l !== null).join('\n');

  // Update gate_execution in frontmatter first (on original content)
  const newStatus = isAcceptedVerdict(verdict) ? 'approved' : 'rejected';
  const fm = parseFrontmatter(content);
  let baseContent = content;
  if (Object.keys(fm).length > 0) {
    baseContent = content.replace(
      /^---\r?\n[\s\S]*?\r?\n---/,
      (block) => {
        if (block.includes('gate_execution')) {
          return block.replace(/gate_execution:\s*.+/, `gate_execution: ${newStatus}`);
        }
        return block.replace(/^---\r?\n/, `---\ngate_execution: ${newStatus}\n`);
      }
    );
  }

  // Now apply QA sign-off on top of the frontmatter-updated content
  if (baseContent.includes('## QA Sign-off')) {
    const updated = baseContent.replace(
      /## QA Sign-off[\s\S]*?(?=\n##|\s*$)/,
      signOff.trimStart()
    );
    await fs.writeFile(specPath, updated, 'utf8');
  } else {
    await fs.writeFile(specPath, baseContent + signOff, 'utf8');
  }

  return true;
}

function escapeSlugForRegex(slug) {
  return slug.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function updateFeaturesFile(featuresPath, slug, verdict, date) {
  const content = await readFileSafe(featuresPath);
  if (!content) return false;

  const status = isAcceptedVerdict(verdict) ? 'done' : 'qa_failed';
  const rowRe = new RegExp(
    `^(\\|\\s*${escapeSlugForRegex(slug)}\\s*\\|)\\s*[^|]*\\s*\\|\\s*([^|]*)\\s*\\|\\s*([^|]*)\\s*\\|(.*)$`,
    'm'
  );

  const updated = content.replace(rowRe, (match, slugCol, startedCol, _completedCol, rest) => {
    const started = startedCol.trim() || date;
    return `${slugCol} ${status} | ${started} | ${date} |${rest}`;
  });

  if (updated !== content) {
    await fs.writeFile(featuresPath, updated, 'utf8');
    return true;
  }

  // Append if not found
  const line = `| ${slug} | ${status} | ${date} | ${date} |`;
  const needsNewline = !content.endsWith('\n');
  await fs.appendFile(featuresPath, `${needsNewline ? '\n' : ''}${line}\n`, 'utf8');
  return true;
}

async function ensureDossier({ targetDir, ctxDir, slug }) {
  const dossierPath = path.join(ctxDir, 'features', slug, 'dossier.md');
  try {
    await fs.access(dossierPath);
    return { mode: 'present' };
  } catch {
    // proceed to create
  }

  // Re-close of an archived feature: the dossier guarantee is already met by
  // done/{slug}/dossier/ — synthesizing a fresh live one would strand a
  // duplicate the archive step then skips forever.
  try {
    await fs.access(path.join(ctxDir, 'done', slug, 'dossier', 'dossier.md'));
    return { mode: 'present-archived' };
  } catch {
    // proceed to create
  }

  try {
    await dossierBootstrap.initFromExisting({
      slug,
      contextDir: ctxDir,
      targetDir
    });
    return { mode: 'from-existing' };
  } catch (err) {
    if (err && err.code === 'EBOOTSTRAPEMPTY') {
      await dossierStore.init({
        slug,
        contextDir: ctxDir,
        whyText: '(no source artifacts found at close time)',
        whatText: '(no source artifacts found at close time)'
      });
      return { mode: 'minimal-fallback' };
    }
    if (err && err.code === 'EDOSSIEREXISTS') {
      return { mode: 'present' };
    }
    return { mode: 'failed', error: err && err.message ? err.message : String(err) };
  }
}

// archiveScoutsForFeature — copy `.aioson/runtime/scouts/{id}.json` files
// whose `feature_slug` matches `slug` into `.aioson/context/features/{slug}/scouts/`,
// auto-append a bullet to the feature dossier per archived scout, and emit
// telemetry. Idempotent: re-archival overwrites file, dossier append is no-op.
// Returns { archived: [{id, archive_rel}], skipped: [{id, reason}] }.
async function archiveScoutsForFeature(targetDir, slug) {
  const result = { archived: [], skipped: [] };
  let config;
  try { config = loadConfig(targetDir); }
  catch { config = { scout_dir: '.aioson/runtime/scouts', archive_root: '.aioson/context/features' }; }

  const sourceDir = path.join(targetDir, config.scout_dir);
  let entries;
  try { entries = await fs.readdir(sourceDir, { withFileTypes: true }); }
  catch (err) {
    if (err.code === 'ENOENT') return result;
    throw err;
  }

  const archiveDir = path.join(targetDir, config.archive_root, slug, 'scouts');
  let archiveDirEnsured = false;

  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.json') || entry.name.startsWith('.')) continue;
    const sourcePath = path.join(sourceDir, entry.name);
    let scout;
    try {
      scout = JSON.parse(await fs.readFile(sourcePath, 'utf8'));
    } catch {
      result.skipped.push({ id: entry.name, reason: 'parse_error' });
      continue;
    }
    if (!scout || scout.feature_slug !== slug) continue;
    if (!scout.id) {
      result.skipped.push({ id: entry.name, reason: 'missing_id' });
      continue;
    }

    if (!archiveDirEnsured) {
      await fs.mkdir(archiveDir, { recursive: true });
      archiveDirEnsured = true;
    }
    const targetPath = path.join(archiveDir, `${scout.id}.json`);
    await fs.copyFile(sourcePath, targetPath);

    // Dossier auto-append (idempotent).
    try {
      appendScoutToFeatureDossier({ rootPath: targetDir, feature_slug: slug, scout });
    } catch {
      // dossier write failed; archival itself succeeded — non-fatal
    }

    result.archived.push({
      id: scout.id,
      archive_rel: path.relative(targetDir, targetPath).replace(/\\/g, '/')
    });
  }

  if (result.archived.length > 0) {
    // M-01 fix: feature-close fires exactly one sub_task event per invocation,
    // so logAgentEvent would land it as event_type='start' (lifecycle artifact
    // for the agent's first event in a new session) with payload_json=null,
    // making it invisible to collectScoutSummary's WHERE event_type='sub_task'
    // query. emitSubTaskEvent writes directly to agent_events with the correct
    // event_type and structured payload.
    await emitSubTaskEvent(targetDir, {
      message: 'scouts archived on feature:close',
      parent_session_id: `feature-close-${slug}`,
      payload: {
        action: 'archived_on_close',
        slug,
        count: result.archived.length,
        ids: result.archived.map((a) => a.id)
      }
    });
  }

  return result;
}

// retireDevStateForClosedFeature — clear the @dev cold-start pointer when it
// still points at the feature being closed. @dev reads dev-state.md DIRECTLY on
// cold start (its session-start protocol "starts on next_step immediately"),
// bypassing the dev:resume-data guard that already checks features.md status —
// so a stale pointer to a done feature would make a future @dev session try to
// "resume" work that is already closed (e.g. next_step: aioson feature:close).
// Only retires when active_feature matches this slug; a pointer to a DIFFERENT
// active feature is left untouched. Archived (not blind-deleted) for audit via
// the existing state:reset --archive path. Idempotent and best-effort.
async function retireDevStateForClosedFeature(targetDir, ctxDir, slug) {
  const statePath = path.join(ctxDir, 'dev-state.md');
  const content = await readFileSafe(statePath);
  if (!content) return { retired: false, reason: 'no_dev_state' };
  const fm = parseFrontmatter(content);
  const active = String(fm.active_feature || '').trim();
  if (active !== slug) {
    return { retired: false, reason: 'points_to_other', active_feature: active || null };
  }
  const reset = await runStateReset({
    args: [targetDir],
    options: { archive: true, json: true },
    logger: { log() {} }
  });
  return {
    retired: Boolean(reset && reset.removed),
    archived: reset && reset.archived ? reset.archived : null
  };
}

// retireWorkflowStateForClosedFeature — clear the per-feature workflow runtime
// state when it still references the feature being closed. Both files live in
// .aioson/context/, are not slug-named, and are excluded from feature:archive —
// so without this they linger and break the NEXT feature:
//   - workflow.state.json: seedFeatureWorkflowState refuses to seed a new slug
//     while a stale feature state is present ("different_active_feature").
//   - workflow-execute.json: its enabled agentic_policy is the autopilot signal
//     downstream agents read — a stale one would auto-run the next feature.
// Only clears when the file references THIS slug (feature mode); a project-mode
// state or a pointer to another feature is left untouched. Best-effort.
async function retireWorkflowStateForClosedFeature(ctxDir, slug) {
  const retired = [];
  const statePath = path.join(ctxDir, 'workflow.state.json');
  const stateRaw = await readFileSafe(statePath);
  if (stateRaw) {
    try {
      const st = JSON.parse(stateRaw);
      if (st && st.mode === 'feature' && st.featureSlug === slug) {
        await fs.unlink(statePath);
        retired.push('workflow.state.json');
      }
    } catch { /* malformed — leave it for manual inspection */ }
  }
  const execPath = path.join(ctxDir, 'workflow-execute.json');
  const execRaw = await readFileSafe(execPath);
  if (execRaw) {
    try {
      const ex = JSON.parse(execRaw);
      if (ex && ex.feature === slug) {
        await fs.unlink(execPath);
        retired.push('workflow-execute.json');
      }
    } catch { /* malformed — leave it */ }
  }
  return retired;
}

// Confirmação de fechamento bloqueado — só chega aqui em TTY interativo (nunca
// em --json, hooks ou CI). Aceita s/sim (pt) e y/yes (en); default é NÃO.
async function promptCloseAnyway(blockerCount) {
  const readline = require('node:readline/promises');
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = await rl.question(
      `\n${blockerCount} gate(s) are blocking this close. Close anyway and record a force-bypass? [y/N] `
    );
    const normalized = String(answer || '').trim().toLowerCase();
    return ['y', 'yes', 's', 'sim'].includes(normalized);
  } finally {
    rl.close();
  }
}

async function runFeatureClose({ args, options = {}, logger }) {
  const targetDir = resolveTargetDir(args);
  // A10: --slug e --feature são aliases em todo o CLI — metade dos comandos
  // usava um, metade o outro, e o erro "missing_feature" sugeria que a feature
  // não existia quando só a flag estava trocada.
  const slug = options.feature ? String(options.feature) : (options.slug ? String(options.slug) : null);
  const verdict = options.verdict ? String(options.verdict).toUpperCase() : null;
  const residual = options.residual ? String(options.residual) : null;
  const notes = options.notes ? String(options.notes) : null;

  if (!slug) {
    if (options.json) return { ok: false, reason: 'missing_feature' };
    logger.log('--feature=<slug> is required (--slug is accepted as an alias).');
    return { ok: false };
  }

  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) return { ok: false, reason: 'invalid_feature' };

  if (!verdict || !['PASS', 'FAIL', 'ACCEPTED_WITH_FOLLOWUPS'].includes(verdict)) {
    if (options.json) return { ok: false, reason: 'invalid_verdict' };
    logger.log('--verdict=PASS, FAIL or ACCEPTED_WITH_FOLLOWUPS is required.');
    return { ok: false };
  }

  const today = nowDate();
  const dir = contextDir(targetDir);
  const updates = [];
  // Falhas reais do fechamento (ex.: arquivamento incompleto). Diferente de
  // updates[]: uma entrada aqui zera `ok` e o exit code — o registro do
  // projeto nunca diverge do disco em silêncio (A2).
  const closeErrors = [];

  // 0a. Close gates (AC-HD-11 refined + A9/A11)
  // Only enforced on PASS — FAIL means QA already rejected and we want the
  // closure to record that. Runtime features the CLI can detect (prototype or
  // migration/Prisma evidence) must have a valid contract even on MICRO/SMALL;
  // non-runtime features without a contract keep the historical lightweight path.
  //
  // Todos os gates são avaliados numa passada e reportados JUNTOS (A9) — um
  // bloqueio por rodada era o maior atrito do fechamento. Quando algo bloqueia:
  //   - `--preflight`/`--explain` lista tudo sem executar nem mutar nada;
  //   - em TTY o próprio comando pergunta "fechar mesmo assim?" (s/N);
  //   - `--force` (ou a confirmação) enumera cada bloqueio pulado e persiste
  //     done/{slug}/force-bypass-findings.json para auditoria (A11).
  // Exceção deliberada: o publish human gate (REQ-13) nunca é bypassável —
  // a aprovação humana registrada É o propósito do gate.
  const preflight = options.preflight === true || options.explain === true;
  if (preflight && verdict === 'FAIL') {
    const report = { ok: true, preflight: true, feature: slug, verdict, blockers: [], notes: ['FAIL closes record the QA rejection — close gates only apply to PASS'] };
    if (!options.json) logger.log(`feature:close --preflight — ${slug}: no gates on FAIL verdict.`);
    return report;
  }
  const qaVerdict = String(parseFrontmatter(await readFeatureArtifactSafe(targetDir, slug, `qa-report-${slug}.md`) || '').verdict || '').toLowerCase();
  if (verdict === 'PASS' && qaVerdict === 'accepted_with_followups') return { ok: false, reason: 'closure_verdict_mismatch', error: 'Preserve the QA verdict with --verdict=ACCEPTED_WITH_FOLLOWUPS' };
  const conditional = verdict === 'ACCEPTED_WITH_FOLLOWUPS';
  let followups = conditional ? await evaluateFollowups(targetDir, slug) : null;
  let followupPlans = [];
  if (conditional && (!followups.eligible || options.force === true)) {
    return { ok: false, reason: 'closure_followups_ineligible', error: followups.error || followups.reason || 'Conditional acceptance never uses --force' };
  }
  let forceBypass = null;
  if (isAcceptedVerdict(verdict)) {
    const planDir = path.join(targetDir, '.aioson', 'plans', slug);
    const contractPath = path.join(planDir, 'harness-contract.json');
    const progressPath = path.join(planDir, 'progress.json');
    const contractContent = await readFileSafe(contractPath);
    const progressContent = await readFileSafe(progressPath);
    const force = options.force === true;
    const blockers = [];

    // Gate 1 — harness contract integrity (§2c). No preflight os RG-* não
    // executam (runChecks=false): avaliação estática apenas, zero side effects.
    const integrityGate = await evaluateContractIntegrityGate(targetDir, slug, {
      runChecks: Boolean(contractContent) && !preflight
    });
    if (!integrityGate.ok) {
      blockers.push({
        gate: 'harness_contract',
        code: 'harness_contract_gate_blocked',
        forceable: true,
        message: formatContractIntegrityGateError(integrityGate),
        bypassLabel: (via) => 'harness contract gate: BYPASSED via ' + via,
        findings: (integrityGate.errors || []).map((e) => `${e.code}: ${e.message}`),
        legacy: { errors: integrityGate.errors }
      });
    }

    // Gate 2 — REQ-13 (loop-guardrails): tema `publish` é gate de COMANDO —
    // intercepta o feature:close quando o contrato ativo o exige e não há gate
    // publish aprovado. Nunca detectado por diff. `--force` NÃO bypassa.
    if (contractContent) {
      try {
        const contract = JSON.parse(contractContent);
        const requiredFor = contract && contract.human_gate && Array.isArray(contract.human_gate.required_for)
          ? contract.human_gate.required_for
          : [];
        if (requiredFor.includes('publish')) {
          const { hasApprovedPublishGate, pendingGates, createGate } = require('../harness/human-gate');
          const { emitGuardEvent } = require('../harness/guard-events');
          if (!hasApprovedPublishGate(planDir)) {
            let gate = pendingGates(planDir).find((g) => g.theme === 'publish');
            if (!gate && !preflight) {
              gate = createGate(planDir, {
                theme: 'publish',
                attempt: 0,
                triggeredBy: [],
                diffSummary: `feature:close ${slug}`,
                runId: null
              });
              await emitGuardEvent(targetDir, {
                eventType: 'human_gate_requested',
                message: `publish gate ${gate.id} requested by feature:close`,
                payload: { slug, gate_id: gate.id, theme: 'publish' }
              });
            }
            const gateRef = gate ? gate.id : '<created on real close>';
            blockers.push({
              gate: 'publish',
              code: 'publish_gate_pending',
              forceable: false,
              message: `[Publish Gate BLOCKED] Feature "${slug}" requires human approval before closing (human_gate.required_for includes "publish"). Approve with: aioson harness:approve . --slug=${slug} --gate=${gateRef}`,
              legacy: { gate: gate ? gate.id : null }
            });
          }
        }
      } catch { /* contrato ilegível — o integrity gate acima reporta o estado */ }
    }

    // Gate 3 — Harness Done Gate (veredito binário do @validator)
    if (contractContent && progressContent) {
      let progress = null;
      try {
        progress = JSON.parse(progressContent);
      } catch (err) {
        // Corrupted progress.json: fail-safe — record warning, do NOT block.
        // A broken progress file should not lock the feature forever; the user
        // can re-run harness:validate to regenerate it. This mirrors the
        // behaviour in workflow-next.js's existing harness-block path.
        updates.push(`harness done gate: progress.json parse error (${err.message}) — proceeding without check`);
      }

      if (progress && progress.ready_for_done_gate !== true) {
        const pendingHint = progress.last_error
          ? ` Pending: ${progress.last_error}.`
          : '';
        const lastError = progress.last_error || null;
        blockers.push({
          gate: 'harness_done',
          code: 'harness_done_gate_blocked',
          forceable: true,
          message: `[Harness Done Gate BLOCKED] Feature "${slug}" did not pass the binary contract (ready_for_done_gate=false).${pendingHint} Run 'aioson harness:validate' and 'aioson harness:apply-validation' until overall_score=1, or pass --force for an emergency override.`,
          bypassLabel: (via) => `harness done gate: BYPASSED via ${via} (ready_for_done_gate=false at close time; last_error=${lastError || 'none'})`,
          legacy: { last_error: lastError, ready_for_done_gate: false }
        });
      } else if (progress && progress.ready_for_done_gate === true) {
        updates.push('harness done gate: PASSED (ready_for_done_gate=true)');
      }
    }

    // Gate 4 — Feature completeness closes on fresh executable proof, not on
    // ledger status strings. The harness gate above deliberately runs first so
    // its persisted report is the evidence consumed here.
    const completeness = await analyzeFeatureCompleteness(targetDir, slug, {
      includeExecution: true
    });
    if (completeness.applicable) {
      const completenessFindings = findingsThroughStage(completeness, 'execution');
      const acAudit = await auditAcceptanceCriteriaTests(targetDir, slug, {
        requireCriteria: true,
        requireAssertions: true,
        // Close runs after QA: a concrete QA PASS row is the same executed
        // proof the completeness gate above accepts for the capability.
        acceptQaEvidence: true
      });
      if (completenessFindings.length > 0 || !acAudit.ok) {
        const errors = [
          ...completenessFindings.map((item) => `${item.stage}/${item.check}: ${item.message}`),
          ...(!acAudit.ok ? [`AC test audit failed: ${acAudit.missing.join(', ')}`] : [])
        ];
        blockers.push({
          gate: 'feature_completeness',
          code: 'feature_completeness_gate_blocked',
          forceable: true,
          message: `[Feature Completeness BLOCKED] Feature "${slug}" lacks fresh executable closure:\n- ${errors.join('\n- ')}`,
          bypassLabel: (via) => `feature completeness gate: BYPASSED via ${via} (${errors.length} finding(s))`,
          findings: errors,
          legacy: { errors }
        });
      } else {
        updates.push('feature completeness gate: PASSED (fresh CAP/AC executable evidence)');
      }
    }

    // Visual evidence — advisory, never a blocker. The prototype's measured
    // numbers (craft floor, generation tells, materials, palette) are recorded
    // at closure, or the closure says in writing that a visible surface was
    // never measured or was edited after its measurement. A feature with no
    // prototype produces no line.
    const visualEvidence = visualEvidenceBlock(targetDir, slug);
    const visualLine = formatVisualEvidence(visualEvidence);
    if (visualLine) updates.push(visualLine);

    // Owner comprehension — advisory, never a blocker. The executive summary
    // is the one artifact written for the human who asked for the feature;
    // closure records whether it exists, whether it still describes the
    // artifacts (hash), and whether that human acknowledged it.
    let ownerLine = null;
    try {
      const { summaryState } = require('./feature-summary');
      const owner = await summaryState(targetDir, slug);
      ownerLine = owner.state === 'missing'
        ? `owner summary: not generated — aioson feature:summary . --feature=${slug} --write, then the owner acknowledges it`
        : owner.state === 'stale'
          ? `owner summary: STALE (artifacts changed after it was written) — regenerate with aioson feature:summary . --feature=${slug} --write and ask the owner to acknowledge again`
          : owner.acknowledged
            ? `owner summary: acknowledged by ${owner.acknowledged_by} at ${owner.acknowledged_at}`
            : `owner summary: written, not yet acknowledged — aioson feature:acknowledge . --feature=${slug} --by="<owner>"`;
    } catch {
      ownerLine = null;
    }
    if (ownerLine) updates.push(ownerLine);

    const publicBlockers = blockers.map(({ legacy, bypassLabel, ...pub }) => pub);
    const unforceable = blockers.filter((b) => !b.forceable);

    // ── --preflight / --explain: o mapa completo, sem executar nem mutar ──
    if (preflight) {
      const report = {
        ok: blockers.length === 0,
        preflight: true,
        feature: slug,
        verdict,
        blockers: publicBlockers,
        forceable: blockers.length > 0 ? unforceable.length === 0 : undefined,
        notes: [
          'nothing was executed or mutated (RG-* runtime checks were NOT run in preflight)',
          ...(visualLine ? [visualLine] : []),
          ...(ownerLine ? [ownerLine] : []),
          ...(blockers.length === 0 ? [] : [unforceable.length === 0
            ? 'all blockers are forceable: re-run with --force (the bypass is recorded in done/{slug}/force-bypass-findings.json)'
            : 'the publish gate requires human approval (aioson harness:approve) and is never bypassed by --force'])
        ]
      };
      if (options.json) return report;
      logger.log(`feature:close --preflight — ${slug}:`);
      if (blockers.length === 0) {
        logger.log('  ✓ no blockers — close would proceed');
      } else {
        for (const b of blockers) {
          logger.log('');
          logger.log(`  ✗ [${b.gate}]${b.forceable ? '' : ' (not forceable)'}`);
          for (const line of b.message.split('\n')) logger.log(`    ${line}`);
        }
      }
      for (const note of report.notes) logger.log(`  note: ${note}`);
      return report;
    }

    if (blockers.length > 0) {
      let proceed = force && unforceable.length === 0;
      let bypassSource = force ? '--force' : null;

      // Confirmação interativa: só em TTY, fora do modo json, e apenas quando
      // todos os bloqueios são bypassáveis (publish gate nunca é).
      const interactive = !conditional && !options.json && !force
        && unforceable.length === 0
        && process.stdin.isTTY === true
        && process.stdout.isTTY === true;

      if (interactive) {
        logger.log(`Feature "${slug}" is blocked by ${blockers.length} gate(s):`);
        for (const b of blockers) {
          logger.log('');
          logger.log(b.message);
        }
        const confirmed = await promptCloseAnyway(blockers.length);
        if (confirmed) {
          proceed = true;
          bypassSource = 'interactive_confirmation';
        }
      }

      if (!proceed) {
        const first = force && unforceable.length > 0 ? unforceable[0] : blockers[0];
        const combined = blockers.map((b) => b.message).join('\n\n');
        const hint = !conditional && unforceable.length === 0
          ? 'Re-run with --force to close anyway (the bypass is recorded), or use --preflight to list all blockers without executing anything.'
          : null;
        if (options.json) {
          return {
            ok: false,
            reason: first.code,
            feature: slug,
            error: combined,
            blockers: publicBlockers,
            forceable: unforceable.length === 0,
            ...(hint ? { hint } : {}),
            ...(first.legacy || {})
          };
        }
        if (!interactive) {
          for (const b of blockers) {
            logger.log(b.message);
            logger.log('');
          }
        }
        if (hint) logger.log(hint);
        return { ok: false, reason: first.code };
      }

      // Bypass autorizado: enumera cada bloqueio pulado (A11) e persiste o
      // registro auditável ANTES de qualquer mutação — mesmo que o archive
      // falhe depois, a decisão fica gravada.
      const via = bypassSource === '--force' ? '--force' : 'interactive confirmation';
      forceBypass = { source: bypassSource, blockers: publicBlockers };
      for (const b of blockers) {
        updates.push(b.bypassLabel ? b.bypassLabel(via) : `${b.gate} gate: BYPASSED via ${via}`);
        for (const f of b.findings || []) updates.push(`  bypassed: ${f}`);
      }
      try {
        const recordDir = path.join(dir, 'done', slug);
        await fs.mkdir(recordDir, { recursive: true });
        const recordPath = path.join(recordDir, 'force-bypass-findings.json');
        await fs.writeFile(recordPath, JSON.stringify({
          feature: slug,
          bypassed_at: nowTimestamp(),
          source: bypassSource,
          blockers: publicBlockers
        }, null, 2) + '\n', 'utf8');
        updates.push(`force bypass recorded: .aioson/context/done/${slug}/force-bypass-findings.json`);
      } catch (err) {
        updates.push(`force bypass record failed (${(err && err.message) || err}) — findings listed above`);
      }
    }
  }

  if (conditional) {
    const check = await runGateCheck({ args: [targetDir], options: { feature: slug, gate: 'D', json: true }, logger });
    if (!check.ok) return { ok: false, reason: 'gate_d_blocked', missing: check.missing };
    // Recheck after commands: a verifier can change files. Never record debt
    // against evidence that no longer describes the delivered implementation.
    followups = await evaluateFollowups(targetDir, slug);
    if (!followups.eligible) return { ok: false, reason: 'closure_followups_stale', error: followups.error };
    try { followupPlans = await persistFollowupPlans(targetDir, slug, followups); }
    catch (error) { return { ok: false, reason: 'followup_persistence_failed', error: error.message }; }
    updates.push(`accepted with followups: ${followupPlans.join(', ')}`);
  }

  // 0. Dossier guarantee — verdict-agnostic; ensures every closed feature has a dossier
  // for archive + audit trail. Telemetry is silent on failure.
  const dossierResult = await ensureDossier({ targetDir, ctxDir: dir, slug });
  if (dossierResult.mode === 'present-archived') {
    updates.push(`dossier: already archived at .aioson/context/done/${slug}/dossier/`);
  } else if (dossierResult.mode === 'from-existing' || dossierResult.mode === 'minimal-fallback') {
    updates.push(`dossier: ${dossierResult.mode === 'from-existing' ? 'synthesized from existing artifacts' : 'minimal fallback (no artifacts found)'}`);
    await emitDossierEvent(targetDir, {
      agent: 'feature-close',
      type: 'feature_close_dossier_synthesized',
      summary: `${slug} ${dossierResult.mode}`,
      meta: { feature_slug: slug, mode: dossierResult.mode }
    });
  } else if (dossierResult.mode === 'failed') {
    updates.push(`dossier: guarantee failed (${dossierResult.error})`);
  }

  // 1. Update spec file
  const specPath = path.join(dir, `spec-${slug}.md`);
  const specUpdated = await updateSpecFile(specPath, verdict, residual || notes, today);
  if (specUpdated) {
    updates.push(`spec-${slug}.md: added QA sign-off (${today}, ${verdict})`);
  } else {
    updates.push(`spec-${slug}.md: not found (skipped)`);
  }

  // 2. Update features.md
  const featuresPath = path.join(dir, 'features.md');
  const featuresContent = await readFileSafe(featuresPath);
  if (featuresContent) {
    await updateFeaturesFile(featuresPath, slug, verdict, today);
    updates.push(`features.md: ${slug} → ${isAcceptedVerdict(verdict) ? 'done' : 'qa_failed'} (${today})`);
  } else {
    updates.push('features.md: not found (skipped)');
  }

  // 2.5. Retire the @dev cold-start pointer if it still points at this feature.
  // On PASS the feature is done; a lingering dev-state.md would make a future
  // @dev cold-start try to resume it (it reads the file directly). FAIL leaves
  // it — @dev keeps working the qa_failed feature. Never touches a pointer to a
  // different active feature. Best-effort; never blocks the close.
  if (isAcceptedVerdict(verdict)) {
    try {
      const ds = await retireDevStateForClosedFeature(targetDir, dir, slug);
      if (ds.retired) {
        updates.push(`dev-state.md: retired closed-feature pointer${ds.archived ? ` (archived to ${ds.archived})` : ''}`);
      } else if (ds.reason === 'points_to_other') {
        updates.push(`dev-state.md: left intact (points at ${ds.active_feature}, not ${slug})`);
      }
    } catch (err) {
      updates.push(`dev-state.md: retire hook error (${(err && err.message) || err})`);
    }
    try {
      const wf = await retireWorkflowStateForClosedFeature(dir, slug);
      if (wf.length > 0) {
        updates.push(`workflow state: retired ${wf.join(', ')} (closed-feature runtime state)`);
      }
    } catch (err) {
      updates.push(`workflow state: retire hook error (${(err && err.message) || err})`);
    }
  }

  // 3. Update project-pulse.md
  const pulsePath = path.join(dir, 'project-pulse.md');
  const pulseUpdated = await updateProjectPulseFile(
    pulsePath,
    slug,
    verdict,
    residual || notes || null,
    today
  );
  if (pulseUpdated) {
    updates.push('project-pulse.md: updated active work');
  } else {
    updates.push('project-pulse.md: not found (skipped)');
  }

  // Capture feature classification BEFORE archive moves prd-{slug}.md to
  // .aioson/context/done/{slug}/. The Phase 5 distillation hook below needs
  // this value to enforce the MICRO opt-out (BR-ALL-11).
  const preArchiveClassification = isAcceptedVerdict(verdict)
    ? await readFeatureClassification(targetDir, slug)
    : null;

  // 3.5. Archive scouts attached to this feature (deyvin-subtask-scout).
  // Copies `.aioson/runtime/scouts/{id}.json` matching feature_slug to
  // `.aioson/context/features/{slug}/scouts/{id}.json`, auto-appends to
  // dossier, emits telemetry. Idempotent on re-close.
  let scoutArchive = null;
  try {
    scoutArchive = await archiveScoutsForFeature(targetDir, slug);
    if (scoutArchive.archived.length > 0) {
      updates.push(`scouts: archived ${scoutArchive.archived.length} to .aioson/context/features/${slug}/scouts/`);
    }
  } catch (err) {
    updates.push(`scouts: archival failed (${err.message || err})`);
  }

  // 4. Auto-archive on PASS (default-on — user never has to remember).
  // Disable explicitly with --no-archive when needed (e.g. re-running feature:close idempotently).
  let archive = null;
  const skipArchive = options['no-archive'] === true || options.archive === false;
  if (isAcceptedVerdict(verdict) && !skipArchive) {
    try {
      archive = await runFeatureArchive({
        args: [targetDir],
        options: { feature: slug, json: true },
        logger: null
      });
      if (archive && archive.moved && archive.moved.length > 0) {
        updates.push(`archive: moved ${archive.moved.length} file(s) to ${archive.archiveDir}/`);
        updates.push(`archive: manifest updated at .aioson/context/done/MANIFEST.md`);
      }
      for (const d of (archive && archive.dirs) || []) {
        if (d.action === 'merged') {
          updates.push(`archive: ${d.label} dir merged into ${d.target}/ (${d.merged} file(s)${d.source_removed ? ', empty source removed' : ''})`);
        } else if (d.action === 'cleaned') {
          updates.push(`archive: ${d.label} dir — empty leftover removed (already archived)`);
        }
      }
      if (archive && archive.ok && archive.noop) {
        updates.push('archive: nothing to move (already clean)');
      } else if (archive && archive.ok && (!archive.moved || archive.moved.length === 0)) {
        // Re-close idempotente: tudo já mora em done/{slug}. Silêncio aqui
        // lia-se como "não arquivou" — o estado precisa ser dito.
        updates.push(`archive: nothing to move — feature already archived at ${archive.archiveDir}/ (${archive.totalArchived} file(s))`);
      } else if (archive && !archive.ok && archive.reason === 'archive_incomplete') {
        for (const e of archive.errors || []) {
          closeErrors.push(`archive: ${e.item}${e.code ? ` [${e.code}]` : ''}: ${e.message}`);
        }
        closeErrors.push(`archive incomplete — feature registrada como done, mas artefatos ficaram para trás. Re-rode: aioson feature:archive . --feature=${slug}`);
      } else if (archive && !archive.ok) {
        // Recusa de guarda (ex.: features.md ausente) — não é meio-movido; registra sem falhar o close.
        updates.push(`archive: skipped (${archive.reason || 'unknown'})`);
      }
    } catch (err) {
      closeErrors.push(`archive: failed (${(err && err.message) || err}) — re-rode: aioson feature:archive . --feature=${slug}`);
    }
  }

  // ── Active Learning Loop distillation hook (Phase 5) ──────────────────────
  // Best-effort (BR-ALL-05): runs after archive, never blocks feature:close,
  // single tier-2 notify with summary. Disabled when:
  //   - verdict !== 'PASS' (FAIL means QA rejected; no learning to consolidate)
  //   - feature classification is MICRO (PMD-5 / BR-ALL-11)
  //   - `--no-distill` flag explicitly set
  //   - `learning-loop.json#enabled=false` (per-project opt-out, optional)
  // The hook never throws — every failure mode is captured in evolution_log
  // and surfaced through the `distill` line of the closure summary.
  //
  // NOTE: classification was captured BEFORE the archive step above, because
  // `runFeatureArchive` moves prd-{slug}.md into .aioson/context/done/{slug}/.
  // Reading after archive would return null and bypass MICRO opt-out.
  let distillation = null;
  const skipDistill = options['no-distill'] === true || options.distill === false;
  if (verdict === 'PASS' && !skipDistill) {
    const featureClassification = preArchiveClassification;
    if (featureClassification === 'MICRO') {
      updates.push('distill: skipped (feature classification MICRO)');
    } else {
      let dbHandle = null;
      try {
        dbHandle = await openRuntimeDb(targetDir);
        distillation = await runDistillation({
          targetDir,
          slug,
          classification: featureClassification,
          db: dbHandle.db
        });
        if (distillation && distillation.ok) {
          updates.push(
            `distill: ${distillation.promoted_count} promoted, ${distillation.review_count} for review, ${distillation.merge_candidate_count} merge candidates (${distillation.duration_ms}ms)`
          );
          // AC-ALL-502: exactly 1 tier-2 notify per closure on success.
          try {
            await runNotify({
              args: [targetDir],
              options: {
                level: 'info',
                topic: 'learning-loop',
                message: `distillation: ${distillation.promoted_count} promoted, ${distillation.review_count} for review, ${distillation.merge_candidate_count} merge candidates`,
                agent: 'feature-close',
                json: options.json ? true : undefined
              },
              logger: logger || { log: () => {} }
            });
          } catch (notifyErr) {
            updates.push(`distill: notify failed (${notifyErr && notifyErr.message || notifyErr})`);
          }
        } else if (distillation && distillation.reason === 'lock_held') {
          updates.push(`distill: skipped (already in progress for "${slug}")`);
        } else if (distillation && distillation.reason === 'skipped_micro') {
          // Defensive: feature classification flipped between read and run.
          updates.push('distill: skipped (feature classification MICRO)');
        } else if (distillation && !distillation.ok) {
          updates.push(`distill: failed silently (${distillation.reason}${distillation.error_phase ? `:${distillation.error_phase}` : ''})`);
        }
      } catch (err) {
        // Defensive — engine is best-effort but any unexpected throw still
        // must not break feature:close.
        updates.push(`distill: hook error (${err && err.message || err})`);
      } finally {
        if (dbHandle && dbHandle.db) {
          try { dbHandle.db.close(); } catch { /* swallow */ }
        }
      }
    }
  } else if (isAcceptedVerdict(verdict) && skipDistill) {
    updates.push('distill: skipped (--no-distill flag)');
  }

  // Auto-rollup bootstrap/current-state.md (P0 agent-loading-contract). The
  // just-closed slug is already `done` in features.md, so it no longer counts as
  // an active-slug exemption — its aged entries become eligible. Best-effort and
  // non-blocking: a failure here must never break the closure. Opt out: --no-trim.
  // SECURITY (TS-LC-02): the trim hook calls the engine directly, bypassing the
  // AIOSON_RUNTIME_HOOK guard that memory:trim enforces. Honor that guard here
  // too, so a tier-2 memory mutation never fires inside a hook/automation context.
  const skipTrim = options['no-trim'] === true || options.trim === false
    || process.env.AIOSON_RUNTIME_HOOK === '1';
  if (isAcceptedVerdict(verdict) && !skipTrim) {
    try {
      const csPath = path.join(targetDir, '.aioson/context/bootstrap/current-state.md');
      const csContent = await readFileSafe(csPath);
      if (csContent) {
        const activeSlugs = parseActiveSlugs((await readFileSafe(path.join(targetDir, '.aioson/context/features.md'))) || '');
        const split = splitCurrentState(csContent, { keep: AUTO_CLOSE_KEEP, activeSlugs });
        if (split.ok && split.archivedEntries.length > 0) {
          const archPath = path.join(targetDir, '.aioson/context/bootstrap/current-state-archive.md');
          const eol = /\r\n/.test(csContent) ? '\r\n' : '\n';
          const existingArchive = (await readFileSafe(archPath)) || '';
          await fs.writeFile(archPath, buildArchiveContent(existingArchive, split.archivedEntries, nowDate(), eol), 'utf8');
          await fs.writeFile(csPath, split.hotContent, 'utf8');
          updates.push(`trim: archived ${split.archivedEntries.length} aged current-state entries (kept ${split.stats.kept})`);
        }
      }
    } catch (err) {
      updates.push(`trim: hook error (${(err && err.message) || err})`);
    }
  }

  const result = {
    ok: closeErrors.length === 0,
    ...(closeErrors.length > 0 ? { reason: 'completed_with_errors' } : {}),
    closed: true,
    feature: slug,
    verdict,
    date: today,
    residual: residual || notes || null,
    updates,
    errors: closeErrors.length > 0 ? closeErrors : undefined,
    forceBypass: forceBypass || undefined,
    disposition: conditional ? 'accepted_with_followups' : null,
    followup_plans: followupPlans,
    archive,
    scoutArchive,
    distillation
  };

  if (options.json) return result;

  logger.log(`Feature closure — ${slug}:`);
  for (const u of updates) logger.log(`  ${u}`);
  for (const e of closeErrors) logger.log(`  ✗ ${e}`);

  return result;
}

module.exports = { runFeatureClose };
