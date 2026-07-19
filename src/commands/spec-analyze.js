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

function extractIds(content, regex) {
  return new Set(String(content || '').match(regex) || []);
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
  const targetDir = path.resolve(process.cwd(), args?.[0] || '.');
  const slug = String(options.feature || options.slug || '').trim();

  if (!slug) {
    logger.error('--feature=<slug> is required.');
    return { ok: false, error: 'missing_feature' };
  }

  const artifacts = await scanArtifacts(targetDir, slug);
  const classification = await detectClassification(targetDir, slug);
  const strict = Boolean(options.strict);
  const contractInfo = readContract(targetDir, slug);
  const findings = [];

  const present = Object.entries(artifacts)
    .filter(([, a]) => a && a.exists)
    .map(([name]) => name);

  // ── Rastreabilidade REQ/AC ────────────────────────────────────────────────
  const declaredReqs = artifacts.requirements.exists
    ? extractIds(artifacts.requirements.content, REQ_ID_RE)
    : new Set();
  const declaredAcs = artifacts.requirements.exists
    ? extractIds(artifacts.requirements.content, AC_ID_RE)
    : new Set();

  const downstream = TRACE_TARGETS
    .filter((name) => artifacts[name] && artifacts[name].exists)
    .map((name) => ({ name, content: artifacts[name].content || '' }));
  if (contractInfo.exists && contractInfo.raw) {
    downstream.push({ name: 'harness-contract', content: contractInfo.raw });
  }

  if (artifacts.requirements.exists && downstream.length > 0) {
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
        message: `${orphanIds.length} REQ/AC id(s) referenced downstream but not declared in requirements-${slug}.md: ${orphanIds.slice(0, 10).join(', ')}${orphanIds.length > 10 ? '…' : ''} (drift or cross-feature reference)`,
        artifacts: offenders
      });
    }
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
    classification
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

module.exports = { runSpecAnalyze };
