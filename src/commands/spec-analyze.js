'use strict';

/**
 * aioson spec:analyze — cross-artifact CONTENT consistency for a feature
 * (Fase 3 do plano de verificação executável; análogo determinístico do
 * /speckit.analyze).
 *
 * Escopo distinto de `artifact:validate` (presença/integridade da cadeia —
 * intocado): aqui valida-se o CONTEÚDO entre artefatos já existentes:
 *
 * - Rastreabilidade de IDs: REQ-x e AC-x declarados em requirements-{slug}.md
 *   que nenhum artefato downstream referencia (gap de cobertura) e IDs
 *   referenciados downstream que não existem em requirements (órfãos — sinal
 *   de drift/alucinação).
 * - Staleness: artefato upstream modificado DEPOIS de um downstream já gerado
 *   (ex.: PRD editado após o implementation-plan) — o downstream pode estar
 *   defasado.
 * - Estados bloqueantes: readiness `blocked` no design-doc/readiness.
 * - Sanidade do harness-contract: erros de schema (error) e avisos de
 *   cobertura executável (info), via validateContract.
 * - Vínculo AC→contrato: ACs declarados sem nenhuma menção no contrato (info).
 * - Drift código-vs-plano (`--stage=dev|qa`, pós-implementação): o change set
 *   entregue (base resolvida como em feature:diff) contra os caminhos que o
 *   plano declarou — caminho planejado que nunca mudou (`plan_path_untouched`)
 *   e arquivo entregue que nenhuma linha do plano declara
 *   (`delivery_outside_plan`). Testes, lockfiles e estado do framework são
 *   suporte, não drift. Warning: o plano pode ter declarado demais, e um
 *   arquivo fora do plano pode ser a correção certa — o que o gate exige é que
 *   a diferença seja VISTA e registrada (linha no plano ou desvio aprovado),
 *   não que ela não exista. Com `--stage` o fechamento de capacidades também
 *   checa a existência dos caminhos planejados (estágio execution).
 *
 * Determinístico, read-only sobre os artefatos; persiste o relatório em
 * `.aioson/context/spec-analyze-{slug}.json` (best-effort). Severidades:
 * error (bloqueia gate), warning (drift provável), info (dívida/aviso).
 */

const fs = require('node:fs');
const path = require('node:path');

const { scanArtifacts, detectClassification } = require('../preflight-engine');
const { validateContract } = require('../harness/contract-schema');
const { AC_ID_RE } = require('../lib/ac-test-audit');
const { extractSection, parseFirstMarkdownTable } = require('../lib/feature-completeness-format');
const { analyzeFeatureCompleteness } = require('../lib/feature-completeness');

const REQ_ID_RE = /\bREQ(?:-[A-Za-z0-9]+)+\b/g;

/** Edições upstream no mesmo fluxo de geração não são drift — tolerância. */
const STALENESS_TOLERANCE_MS = 60000;

/** Ordem upstream→downstream para staleness. `architecture.md` fica de fora:
 * é artefato global do projeto; seu mtime não pertence ao fluxo da feature. */
const STALENESS_CHAIN = [
  ['prd', 'prd'],
  ['sheldon_enrichment', 'sheldon-enrichment'],
  ['requirements', 'requirements'],
  ['spec', 'spec'],
  ['design_doc', 'design-doc'],
  ['implementation_plan', 'implementation-plan']
];

/** Superfícies downstream onde um REQ/AC declarado deveria reaparecer. */
const TRACE_TARGETS = ['spec', 'design_doc', 'implementation_plan', 'conformance'];

const { parseExecutionWaves } = require('../harness/plan-waves');
const { resolveTargetDir } = require('../lib/project-root');
const { deliveredChangeSet } = require('../harness/review-payload');
const { matchGlob } = require('../harness/glob-match');
const { extractPlannedPaths, plannedPathKey } = require('../lib/feature-completeness');

/** Stages whose completion happens AFTER the code exists. */
const POST_IMPLEMENTATION_STAGES = new Set(['dev', 'qa', 'tester', 'validator', 'shakedown', 'pentester']);

/**
 * Delivered files that are support, not scope: tests and fixtures, lockfiles,
 * dependency manifests and generated/build output. A plan declares behavior
 * paths; it never enumerates every spec file the ACs grow.
 */
const SUPPORT_PATH = /(?:^|\/)(?:__tests__|__mocks__|tests?|spec|e2e|cypress|fixtures|snapshots|__snapshots__|coverage|dist|build|out|target|vendor|node_modules)\/|\.(?:test|spec|stories|snap|d)\.[cm]?[jt]sx?$|(?:^|\/)(?:package-lock\.json|yarn\.lock|pnpm-lock\.yaml|bun\.lockb?|Cargo\.lock|composer\.lock|Gemfile\.lock|poetry\.lock|Pipfile\.lock|go\.sum|packages\.lock\.json|\.gitignore|\.gitattributes|CHANGELOG\.md)$|_test\.go$|_spec\.rb$|_test\.py$|^tests?\/|Test\.(?:java|kt|cs|php)$/i;

function extractIds(content, regex) {
  return new Set(String(content || '').match(regex) || []);
}

/**
 * Code-vs-plan drift of one feature, post-implementation. Pure over its
 * inputs: planned paths (plan rows), the delivered change set (git), and the
 * contract's `allowed_files` globs when a harness contract sanctions a wider
 * surface. Returns the findings plus the measured sets for the report.
 */
/** A delivery-cell item the plan marks as reused — present by design, changed by nobody. */
const REUSE_MARK = /^\s*(?:reuse|reusar)\s*:|\s+\((?:reuse|existing|reusar|existente)\)\s*$/i;

function splitPlanCell(value) {
  return String(value || '').replace(/<br\s*\/?>/gi, ',').split(/[,;\n]/).map((item) => item.trim()).filter(Boolean);
}

/**
 * The plan's declared paths in two sets: the ones it promises to change
 * (create/modify/retire) and the ones it only reuses. Delivery rows carry the
 * marker per item (`reuse: src/x.js`, `src/x.js (existing)`); delta rows
 * carry it as the row action.
 */
function plannedPathSets(completeness) {
  const change = [];
  const reuse = [];
  for (const row of (completeness.delivery_plan && completeness.delivery_plan.rows) || []) {
    for (const item of splitPlanCell(row.files)) {
      (REUSE_MARK.test(item) ? reuse : change).push(...extractPlannedPaths(item));
    }
  }
  for (const row of (completeness.implementation_delta && completeness.implementation_delta.rows) || []) {
    (row.action === 'reuse' ? reuse : change).push(...(row.paths || []));
  }
  const changeKeys = new Set(change.map(plannedPathKey));
  return {
    change: [...new Set(change)],
    reuse: [...new Set(reuse)].filter((p) => !changeKeys.has(plannedPathKey(p)))
  };
}

function analyzePlanDeliveryDrift({ plannedPaths, reusePaths = [], changeSet, allowedGlobs = [] }) {
  const findings = [];
  const planned = new Map(plannedPaths.map((p) => [plannedPathKey(p), p]));
  const declared = new Map([...planned, ...reusePaths.map((p) => [plannedPathKey(p), p])]);
  const delivered = [
    ...changeSet.changedFiles.map((f) => ({ path: f.path, status: f.status })),
    ...changeSet.untracked.map((p) => ({ path: p, status: 'A' }))
  ];
  const deliveredKeys = new Set(delivered.map((f) => plannedPathKey(f.path)));

  // A planned path that exists (the completeness engine blocks when a planned
  // file is missing) but carries no change since the base: the plan promised
  // work the diff does not show. When the base fell back to HEAD (no feature
  // start commit, no main/master, no baseline) the diff holds only uncommitted
  // work, so "untouched" would accuse every committed file — not measured.
  const baseIsFallback = /^fallback/i.test(String(changeSet.baseSource || ''));
  const untouched = baseIsFallback ? [] : [...planned.entries()]
    .filter(([key]) => !deliveredKeys.has(key))
    .map(([, original]) => original);
  if (baseIsFallback) {
    findings.push({
      severity: 'info',
      check: 'delivery_drift_base_fallback',
      message: 'no feature start commit, main/master merge-base or baseline.json resolved — the diff covers uncommitted work only, so planned-path coverage is not measured (commit the feature artifacts under .aioson/ or pass --base)',
      artifacts: ['git']
    });
  }

  // A delivered file no plan row declares — behavior paths only, support
  // excluded, and anything a harness contract explicitly allows is in scope.
  const outside = delivered
    .filter((f) => !declared.has(plannedPathKey(f.path)))
    .filter((f) => !SUPPORT_PATH.test(f.path))
    .filter((f) => !(allowedGlobs.length > 0 && allowedGlobs.some((g) => matchGlob(g, f.path))))
    .map((f) => `${f.status} ${f.path}`);

  if (untouched.length > 0) {
    findings.push({
      severity: 'warning',
      check: 'plan_path_untouched',
      message: `${untouched.length} planned path(s) carry no change since ${changeSet.baseSource}: ${untouched.slice(0, 8).join(', ')}${untouched.length > 8 ? ` (+${untouched.length - 8})` : ''} — either the work is undone or the plan over-declared; deliver it or record the deviation in the plan`,
      artifacts: ['implementation_plan', 'git']
    });
  }
  if (outside.length > 0) {
    findings.push({
      severity: 'warning',
      check: 'delivery_outside_plan',
      message: `${outside.length} delivered file(s) no plan row declares: ${outside.slice(0, 8).join(', ')}${outside.length > 8 ? ` (+${outside.length - 8})` : ''} — architectural drift starts here; add each to the plan's delivery rows (or an approved deviation) or revert it. Tests, lockfiles and build output are already excluded`,
      artifacts: ['implementation_plan', 'git']
    });
  }
  return {
    findings,
    planned: [...planned.values()],
    reused: [...reusePaths],
    delivered: delivered.map((f) => `${f.status} ${f.path}`),
    untouched,
    outside
  };
}

function mtimeMs(targetDir, artifact) {
  if (!artifact || !artifact.exists || !artifact.path) return null;
  try {
    return fs.statSync(path.join(targetDir, artifact.path)).mtimeMs;
  } catch {
    return null;
  }
}

function readContract(targetDir, slug) {
  const contractPath = path.join(targetDir, '.aioson', 'plans', slug, 'harness-contract.json');
  if (!fs.existsSync(contractPath)) return { exists: false };
  try {
    const raw = fs.readFileSync(contractPath, 'utf8');
    return { exists: true, path: path.relative(targetDir, contractPath), raw, contract: JSON.parse(raw) };
  } catch (err) {
    return { exists: true, path: path.relative(targetDir, contractPath), parseError: err.message };
  }
}

async function runSpecAnalyze({ args, options = {}, logger }) {
  const targetDir = resolveTargetDir(args);
  const slug = String(options.feature || options.slug || '').trim();

  if (!slug) {
    logger.error('--feature=<slug> is required.');
    return { ok: false, error: 'missing_feature' };
  }

  const artifacts = await scanArtifacts(targetDir, slug);
  const classification = await detectClassification(targetDir, slug);
  const strict = Boolean(options.strict);
  // `--stage=dev|qa`: the code exists now, so the delivered change set is a
  // measurable artifact too — planned paths must exist (execution-stage
  // completeness) and the diff is compared with the plan (drift). Without it
  // the analysis is pre-implementation: a planned `create` path that does not
  // exist yet is not a finding.
  const stage = String(options.stage || '').trim().toLowerCase();
  const postImplementation = POST_IMPLEMENTATION_STAGES.has(stage);
  const contractInfo = readContract(targetDir, slug);
  const findings = [];

  const present = Object.entries(artifacts)
    .filter(([, a]) => a && a.exists)
    .map(([name]) => name);

  // ── Rastreabilidade REQ/AC ────────────────────────────────────────────────
  const declaredReqs = artifacts.requirements.exists
    ? extractIds(artifacts.requirements.content, REQ_ID_RE)
    : new Set();
  const acceptanceTable = artifacts.prd.exists ? parseFirstMarkdownTable(extractSection(artifacts.prd.content, ['Acceptance Criteria']) || '') : null;
  const canonicalAcs = acceptanceTable ? extractIds(acceptanceTable.rows.map(row => row[0]).join(' '), AC_ID_RE)
    : artifacts.prd.exists ? extractIds(artifacts.prd.content, AC_ID_RE) : new Set();
  const declaredAcs = canonicalAcs.size > 0 ? canonicalAcs : artifacts.requirements.exists
    ? extractIds(artifacts.requirements.content, AC_ID_RE)
    : new Set();

  const downstream = TRACE_TARGETS
    .filter((name) => artifacts[name] && artifacts[name].exists)
    .map((name) => ({ name, content: artifacts[name].content || '' }));
  if (contractInfo.exists && contractInfo.raw) {
    downstream.push({ name: 'harness-contract', content: contractInfo.raw });
  }

  if ((artifacts.requirements.exists || declaredAcs.size > 0) && downstream.length > 0) {
    const downstreamText = downstream.map((d) => d.content).join('\n');
    const downstreamReqs = extractIds(downstreamText, REQ_ID_RE);
    const downstreamAcs = extractIds(downstreamText, AC_ID_RE);

    const untracedReqs = [...declaredReqs].filter((id) => !downstreamReqs.has(id));
    if (untracedReqs.length > 0 && declaredReqs.size > untracedReqs.length) {
      // Só acusa gap quando ALGUM REQ é rastreado — artefatos que não citam
      // IDs por estilo (plano em prosa) não devem virar ruído.
      findings.push({
        severity: 'warning',
        check: 'untraced_requirement',
        message: `${untracedReqs.length} REQ id(s) declared in requirements but never referenced downstream: ${untracedReqs.slice(0, 10).join(', ')}${untracedReqs.length > 10 ? '…' : ''}`,
        artifacts: ['requirements', ...downstream.map((d) => d.name)]
      });
    }

    const orphanIds = [
      ...[...downstreamReqs].filter((id) => !declaredReqs.has(id)),
      ...[...downstreamAcs].filter((id) => !declaredAcs.has(id))
    ];
    if (orphanIds.length > 0) {
      const offenders = downstream
        .filter((d) => orphanIds.some((id) => d.content.includes(id)))
        .map((d) => d.name);
      findings.push({
        severity: 'warning',
        check: 'orphan_reference',
        message: `${orphanIds.length} REQ/AC id(s) referenced downstream but not declared in the canonical PRD/legacy requirements for ${slug}: ${orphanIds.slice(0, 10).join(', ')}${orphanIds.length > 10 ? '…' : ''} (drift or cross-feature reference)`,
        artifacts: offenders
      });
    }
  }

  if (artifacts.implementation_plan.exists && canonicalAcs.size > 0) {
    const { validatePlanContract } = require('../lib/plan-contract');
    const diagnostic = await validatePlanContract({ targetDir, slug,
      content: artifacts.implementation_plan.content,
      acceptance: { rows: [...declaredAcs].map(ac => ({ ac })) }, delivery: { rows: [] } });
    for (const issue of diagnostic.warnings) findings.push({ ...issue, severity: 'info', artifacts: ['implementation_plan'] });
  }

  // ── Staleness upstream → downstream ──────────────────────────────────────
  const chainWithTimes = STALENESS_CHAIN
    .map(([key, label]) => ({ key, label, mtime: mtimeMs(targetDir, artifacts[key]) }))
    .filter((entry) => entry.mtime !== null);

  for (let i = 0; i < chainWithTimes.length; i += 1) {
    for (let j = i + 1; j < chainWithTimes.length; j += 1) {
      const upstream = chainWithTimes[i];
      const downstreamArtifact = chainWithTimes[j];
      if (upstream.mtime > downstreamArtifact.mtime + STALENESS_TOLERANCE_MS) {
        findings.push({
          severity: 'warning',
          check: 'stale_downstream',
          message: `${upstream.label} was modified after ${downstreamArtifact.label} was produced — ${downstreamArtifact.label} may be stale (re-run its owner agent or confirm the change is editorial)`,
          artifacts: [upstream.key, downstreamArtifact.key]
        });
      }
    }
  }

  // ── Waves de paralelismo do implementation-plan ──────────────────────────
  if (artifacts.implementation_plan.exists) {
    const waves = parseExecutionWaves(artifacts.implementation_plan.content);
    if (waves && waves.length > 0) {
      const byWave = new Map();
      for (const row of waves) {
        if (!byWave.has(row.wave)) byWave.set(row.wave, []);
        byWave.get(row.wave).push(row);
      }
      for (const [wave, phases] of byWave) {
        if (phases.length < 2) continue;
        for (let i = 0; i < phases.length; i += 1) {
          for (let j = i + 1; j < phases.length; j += 1) {
            const shared = phases[i].files.filter((f) => phases[j].files.includes(f));
            if (shared.length > 0) {
              findings.push({
                severity: 'warning',
                check: 'wave_file_overlap',
                message: `wave ${wave}: phases ${phases[i].phase} and ${phases[j].phase} are marked parallel but share Primary files: ${shared.join(', ')} — same-wave phases must be file-disjoint (split the files or separate the waves)`,
                artifacts: ['implementation_plan']
              });
            }
          }
        }
      }
    }
  }

  // ── Estados bloqueantes ───────────────────────────────────────────────────
  for (const key of ['design_doc', 'readiness']) {
    const artifact = artifacts[key];
    if (artifact && artifact.exists && artifact.frontmatter) {
      const readiness = String(artifact.frontmatter.readiness || '').toLowerCase();
      if (readiness === 'blocked') {
        findings.push({
          severity: 'error',
          check: 'readiness_blocked',
          message: `${path.basename(artifact.path)} declares readiness: blocked — resolve with @discovery-design-doc before the execution gate`,
          artifacts: [key]
        });
      } else if (readiness === 'ready_with_warnings') {
        findings.push({
          severity: 'info',
          check: 'readiness_warnings',
          message: `${path.basename(artifact.path)} declares readiness: ready_with_warnings — review its warnings before @dev`,
          artifacts: [key]
        });
      }
    }
  }

  // ── Sanidade do harness-contract ─────────────────────────────────────────
  if (contractInfo.exists) {
    if (contractInfo.parseError) {
      findings.push({
        severity: 'error',
        check: 'contract_invalid',
        message: `harness-contract.json is not valid JSON: ${contractInfo.parseError}`,
        artifacts: ['harness-contract']
      });
    } else {
      const schema = validateContract(contractInfo.contract);
      for (const err of schema.errors) {
        findings.push({
          severity: 'error',
          check: 'contract_schema',
          message: `contract schema invalid: ${err.field} — ${err.reason}`,
          artifacts: ['harness-contract']
        });
      }
      for (const warn of schema.warnings) {
        findings.push({
          severity: strict ? 'error' : 'info',
          check: 'contract_coverage',
          message: `${warn.field}: ${warn.reason}`,
          artifacts: ['harness-contract']
        });
      }

      // Vínculo AC→contrato: criteria derivam dos ACs; nenhum AC mencionado é
      // sinal fraco (descrições podem parafrasear) — info, não warning.
      if (declaredAcs.size > 0 && contractInfo.raw) {
        const mentioned = [...declaredAcs].filter((id) => contractInfo.raw.includes(id));
        if (mentioned.length === 0) {
          findings.push({
            severity: strict ? 'error' : 'info',
            check: 'contract_ac_unlinked',
            message: `none of the ${declaredAcs.size} AC id(s) from requirements appear in harness-contract.json — confirm criteria[] actually derive from the enriched ACs`,
            artifacts: ['requirements', 'harness-contract']
          });
        }
      }
    }
  }

  // ── Fechamento genérico de capacidades ──────────────────────────────────
  // Presence-only artifacts are not a valid feature contract. This audit
  // follows each approved CAP through requirements, design, and delivery.
  const completeness = await analyzeFeatureCompleteness(targetDir, slug, {
    artifacts,
    classification,
    includeExecutionStructure: postImplementation
  });
  if (completeness.applicable) {
    findings.push(...completeness.findings.map((item) => ({
      severity: 'error',
      check: item.check,
      stage: item.stage,
      message: item.message,
      artifacts: item.artifacts
    })));
  }

  // ── Drift código-vs-plano (pós-implementação) ───────────────────────────
  let drift = null;
  if (postImplementation && completeness.applicable) {
    const sets = plannedPathSets(completeness);
    const plannedPaths = sets.change;
    if (plannedPaths.length === 0 && sets.reuse.length === 0) {
      findings.push({
        severity: 'info',
        check: 'delivery_drift_unmeasured',
        message: 'the plan declares no concrete file paths, so code-vs-plan drift cannot be measured — delivery rows need repo-relative paths',
        artifacts: ['implementation_plan']
      });
    } else {
      const changeSet = deliveredChangeSet(targetDir, path.join(targetDir, '.aioson', 'plans', slug), { slug });
      if (!changeSet.ok) {
        findings.push({
          severity: 'info',
          check: 'delivery_drift_unmeasured',
          message: 'git is unavailable here, so the delivered change set could not be compared with the plan',
          artifacts: ['git']
        });
      } else {
        const allowedGlobs = contractInfo.exists && contractInfo.contract && Array.isArray(contractInfo.contract.allowed_files)
          ? contractInfo.contract.allowed_files
          : [];
        drift = analyzePlanDeliveryDrift({ plannedPaths, reusePaths: sets.reuse, changeSet, allowedGlobs });
        drift.base = changeSet.base;
        drift.base_source = changeSet.baseSource;
        findings.push(...drift.findings);
      }
    }
  }

  const summary = {
    errors: findings.filter((f) => f.severity === 'error').length,
    warnings: findings.filter((f) => f.severity === 'warning').length,
    info: findings.filter((f) => f.severity === 'info').length
  };

  const report = {
    ok: summary.errors === 0,
    feature: slug,
    classification: classification || 'unknown',
    strict,
    analyzed_at: new Date().toISOString(),
    artifacts_present: present,
    contract_present: Boolean(contractInfo.exists && !contractInfo.parseError),
    feature_completeness: {
      applicable: completeness.applicable,
      ok: completeness.ok,
      summary: completeness.summary
    },
    stage: stage || null,
    ...(drift ? { delivery_drift: { base: drift.base, base_source: drift.base_source, planned: drift.planned, reused: drift.reused, delivered: drift.delivered, untouched: drift.untouched, outside: drift.outside } } : {}),
    findings,
    summary
  };

  // Persistência best-effort — segue a convenção *-{slug}.json de
  // .aioson/context/ (coletada por feature:export/archive).
  try {
    const contextPath = path.join(targetDir, '.aioson', 'context');
    if (fs.existsSync(contextPath)) {
      fs.writeFileSync(
        path.join(contextPath, `spec-analyze-${slug}.json`),
        JSON.stringify(report, null, 2),
        'utf8'
      );
    }
  } catch { /* relatório em stdout permanece o canônico */ }

  if (options.json) {
    logger.log(JSON.stringify(report, null, 2));
    return report;
  }

  logger.log('');
  logger.log(`Spec analyze — ${slug} (${report.classification})`);
  logger.log('━'.repeat(45));
  logger.log(`Artifacts present: ${present.length ? present.join(', ') : '(none)'}${report.contract_present ? ' + harness-contract' : ''}`);

  if (findings.length === 0) {
    logger.log('');
    logger.log('✓ No cross-artifact inconsistencies detected.');
  } else {
    for (const severity of ['error', 'warning', 'info']) {
      const group = findings.filter((f) => f.severity === severity);
      if (!group.length) continue;
      logger.log('');
      logger.log(`${severity.toUpperCase()} (${group.length}):`);
      for (const finding of group) {
        logger.log(`  - [${finding.check}] ${finding.message}`);
      }
    }
  }

  logger.log('');
  logger.log(`Summary: ${summary.errors} error(s), ${summary.warnings} warning(s), ${summary.info} info — ${report.ok ? 'OK for the execution gate' : 'BLOCKED (resolve errors first)'}`);
  logger.log('Chain presence: aioson artifact:validate . --feature=' + slug);

  return report;
}

module.exports = { runSpecAnalyze, analyzePlanDeliveryDrift, plannedPathSets, SUPPORT_PATH };
