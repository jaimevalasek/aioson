'use strict';

/**
 * handoff-contract — machine-verified agent output contracts.
 *
 * Each agent role declares what it must produce before the workflow
 * allows handoff to the next stage. This catches incomplete agent
 * sessions early instead of discovering missing artifacts later.
 */

const path = require('node:path');
const { readFileSafe, fileExists } = require('./preflight-engine');
const { auditAcceptanceCriteriaTests } = require('./lib/ac-test-audit');
const {
  analyzeFeatureCompleteness,
  findingsThroughStage
} = require('./lib/feature-completeness');
const { evaluateContractIntegrityGate } = require('./harness/contract-integrity-gate');
const { readDecisionCheckpoint } = require('./lib/decision-checkpoint');

// Contract definitions per agent stage
const CONTRACTS = {
  setup: {
    artifacts: ['.aioson/context/project.context.md'],
    gates: [],
    contextUpdates: []
  },
  product: {
    artifacts: (targetDir, state) => {
      if (state.mode === 'feature' && state.featureSlug) {
        return [`.aioson/context/prd-${state.featureSlug}.md`];
      }
      return ['.aioson/context/prd.md'];
    },
    gates: [],
    contextUpdates: ['.aioson/context/project-pulse.md']
  },
  sheldon: {
    artifacts: (targetDir, state) => {
      if (state.mode !== 'feature' || !state.featureSlug) {
        return ['.aioson/context/sheldon-enrichment.md'];
      }
      const slug = state.featureSlug;
      const base = [`.aioson/context/sheldon-enrichment-${slug}.md`];
      if (!isLeanSheldonState(state)) return base;
      return [
        ...base,
        `.aioson/context/requirements-${slug}.md`,
        `.aioson/context/spec-${slug}.md`,
        `.aioson/context/design-doc-${slug}.md`,
        `.aioson/context/readiness-${slug}.md`,
        `.aioson/context/implementation-plan-${slug}.md`
      ];
    },
    gates: [],
    contextUpdates: []
  },
  analyst: {
    artifacts: (targetDir, state) => {
      if (state.mode === 'feature' && state.featureSlug) {
        return [
          `.aioson/context/requirements-${state.featureSlug}.md`,
          `.aioson/context/spec-${state.featureSlug}.md`
        ];
      }
      return ['.aioson/context/discovery.md'];
    },
    gates: ['A'], // Gate A must be approved
    contextUpdates: ['.aioson/context/project-pulse.md']
  },
  'scope-check': {
    artifacts: (targetDir, state) => {
      if (state.mode === 'feature' && state.featureSlug) {
        return [`.aioson/context/scope-check-${state.featureSlug}.md`];
      }
      return ['.aioson/context/scope-check.md'];
    },
    gates: [],
    contextUpdates: ['.aioson/context/project-pulse.md']
  },
  architect: {
    artifacts: ['.aioson/context/architecture.md'],
    gates: ['B'],
    contextUpdates: ['.aioson/context/project-pulse.md']
  },
  'discovery-design-doc': {
    artifacts: (targetDir, state) => {
      if (state.mode === 'feature' && state.featureSlug) {
        return [
          `.aioson/context/design-doc-${state.featureSlug}.md`,
          `.aioson/context/readiness-${state.featureSlug}.md`
        ];
      }
      return ['.aioson/context/design-doc.md', '.aioson/context/readiness.md'];
    },
    gates: [],
    contextUpdates: ['.aioson/context/project-pulse.md']
  },
  'ux-ui': {
    artifacts: ['.aioson/context/ui-spec.md'],
    gates: ['B'],
    contextUpdates: ['.aioson/context/project-pulse.md']
  },
  pm: {
    artifacts: (targetDir, state) => {
      // @pm owns implementation-plan only for MEDIUM features (AC-SDLC-16)
      if (state.mode === 'feature' && state.featureSlug && state.classification === 'MEDIUM') {
        return [`.aioson/context/implementation-plan-${state.featureSlug}.md`];
      }
      return [];
    },
    gates: [],
    contextUpdates: ['.aioson/context/project-pulse.md']
  },
  orchestrator: {
    artifacts: (targetDir, state) => {
      // Maestro lane (MEDIUM, orchestrator → dev): the orchestrator produces the
      // gated spec package via fan-out, so expect those artifacts. Otherwise it is
      // the parallel-implementation coordinator and owns the lane workspace.
      if (state && state.mode === 'feature' && state.featureSlug && isMaestroOrchestratorState(state)) {
        const slug = state.featureSlug;
        return [
          `.aioson/context/requirements-${slug}.md`,
          `.aioson/context/spec-${slug}.md`,
          `.aioson/context/design-doc-${slug}.md`,
          `.aioson/context/readiness-${slug}.md`,
          `.aioson/context/implementation-plan-${slug}.md`
        ];
      }
      return ['.aioson/context/parallel'];
    },
    gates: [],
    contextUpdates: ['.aioson/context/project-pulse.md']
  },
  dev: {
    artifacts: [],
    gates: ['C'],
    contextUpdates: ['.aioson/context/project-pulse.md', '.aioson/context/dev-state.md']
  },
  tester: {
    artifacts: [],
    gates: [],
    contextUpdates: ['.aioson/context/project-pulse.md']
  },
  pentester: {
    artifacts: (targetDir, state) => {
      if (state.mode === 'feature' && state.featureSlug) {
        return [`.aioson/context/security-findings-${state.featureSlug}.json`];
      }
      return [];
    },
    gates: [],
    contextUpdates: ['.aioson/context/project-pulse.md']
  },
  qa: {
    artifacts: [],
    gates: ['D'],
    contextUpdates: ['.aioson/context/project-pulse.md']
  },
  committer: {
    artifacts: [],
    gates: [],
    contextUpdates: []
  }
};

function normalizeAgentName(input) {
  return String(input || '')
    .trim()
    .toLowerCase()
    .replace(/^@/, '');
}

function isLeanSheldonState(state) {
  const sequence = Array.isArray(state?.sequence) ? state.sequence.map(normalizeAgentName) : [];
  const sheldonIndex = sequence.indexOf('sheldon');
  return sheldonIndex !== -1 && sequence[sheldonIndex + 1] === 'dev';
}

// MEDIUM maestro lane: @orchestrator routes straight to @dev (it is the single
// spec authority that fans out to analyst/architect/pm sub-agents and consolidates).
function isMaestroOrchestratorState(state) {
  const sequence = Array.isArray(state?.sequence) ? state.sequence.map(normalizeAgentName) : [];
  const idx = sequence.indexOf('orchestrator');
  return idx !== -1 && sequence[idx + 1] === 'dev';
}

async function readSecurityFindings(findingsPath) {
  try {
    const content = await readFileSafe(findingsPath);
    if (!content) return { ok: false, reason: 'empty_file' };
    const data = JSON.parse(content);
    return {
      ok: true,
      reviewContract: data.review_contract && typeof data.review_contract === 'object'
        ? data.review_contract
        : null,
      findings: Array.isArray(data.findings) ? data.findings : []
    };
  } catch {
    return { ok: false, reason: 'invalid_json' };
  }
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function validateReviewContract(reviewContract) {
  const missing = [];

  if (!reviewContract || typeof reviewContract !== 'object') {
    return ['review_contract'];
  }

  for (const field of ['scope_mode', 'evidence_policy', 'findings_artifact_path']) {
    if (!isNonEmptyString(reviewContract[field])) {
      missing.push(field);
    }
  }

  if (
    reviewContract.target_mode === 'app_target' &&
    !isNonEmptyString(reviewContract.target_scope)
  ) {
    missing.push('target_scope');
  }

  return missing;
}

function getFindingIdentifier(finding) {
  if (isNonEmptyString(finding?.id)) return finding.id.trim();
  if (isNonEmptyString(finding?.finding_id)) return finding.finding_id.trim();
  return 'unknown-finding';
}

async function resolveArtifacts(contract, targetDir, state) {
  const raw = typeof contract.artifacts === 'function'
    ? contract.artifacts(targetDir, state)
    : contract.artifacts;
  return raw.map((p) => path.join(targetDir, p));
}

async function validateDiscoveryDesignDocArtifacts(targetDir, state) {
  const slug = state?.mode === 'feature' && state?.featureSlug ? state.featureSlug : null;
  const pairs = slug
    ? [
        [
          `.aioson/context/design-doc-${slug}.md`,
          `.aioson/context/readiness-${slug}.md`
        ],
        [
          '.aioson/context/design-doc.md',
          '.aioson/context/readiness.md'
        ]
      ]
    : [
        [
          '.aioson/context/design-doc.md',
          '.aioson/context/readiness.md'
        ]
      ];

  for (const pair of pairs) {
    const [designDoc, readiness] = pair;
    if (
      await fileExists(path.join(targetDir, designDoc)) &&
      await fileExists(path.join(targetDir, readiness))
    ) {
      return [];
    }
  }

  const expected = slug
    ? `.aioson/context/design-doc-${slug}.md + .aioson/context/readiness-${slug}.md`
    : '.aioson/context/design-doc.md + .aioson/context/readiness.md';
  return [`missing artifact: ${expected}`];
}

function parseFrontmatterValue(markdown, key) {
  const fmMatch = String(markdown || '').match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!fmMatch) return null;
  for (const line of fmMatch[1].split(/\r?\n/)) {
    const idx = line.indexOf(':');
    if (idx === -1) continue;
    const currentKey = line.slice(0, idx).trim();
    if (currentKey !== key) continue;
    return line.slice(idx + 1).trim().replace(/^["']|["']$/g, '');
  }
  return null;
}

async function readProjectClassification(targetDir) {
  // SF-project-26: project-level classification, independent of any feature's
  // PRD frontmatter. Used as the security baseline that an LLM-authored
  // prd-{slug}.md cannot override downwards.
  const contextPath = path.join(targetDir, '.aioson', 'context', 'project.context.md');
  const content = await readFileSafe(contextPath);
  const inferred = parseFrontmatterValue(content, 'classification');
  return isNonEmptyString(inferred) ? inferred.trim().toUpperCase() : null;
}

async function resolveClassification(targetDir, state) {
  const explicit = isNonEmptyString(state?.classification) ? state.classification.trim().toUpperCase() : null;
  if (explicit) return explicit;

  // When in feature mode, the feature's own classification (in prd-{slug}.md)
  // takes precedence over the project-level classification. A MICRO feature
  // inside a MEDIUM project should be treated as MICRO for gate enforcement —
  // except for Gate D security review, which falls back to the project
  // baseline (handled in checkGateApproval via SF-project-26).
  const slug = state?.featureSlug;
  if (slug) {
    const prdPath = path.join(targetDir, '.aioson', 'context', `prd-${slug}.md`);
    const prdContent = await readFileSafe(prdPath);
    if (prdContent) {
      const featureClass = parseFrontmatterValue(prdContent, 'classification');
      if (isNonEmptyString(featureClass)) return featureClass.trim().toUpperCase();
    }
  }

  return await readProjectClassification(targetDir);
}

async function checkGateApproval(targetDir, gateLetter, slug, classification, projectClassification) {
  // MICRO features are documented as @product → @dev only — they don't pass
  // through @analyst/@architect and therefore don't produce spec-{slug}.md.
  // Skip the process gates (A=requirements, B=design, C=plan) for MICRO; the
  // lightweight workflow is the gate.
  //
  // SF-project-26: Gate D (security review) is the project's security
  // baseline, not a per-feature concern. Skip Gate D only when the PROJECT
  // itself is MICRO — a MICRO feature inside a MEDIUM project must still pass
  // Gate D because the security baseline applies project-wide. The LLM-
  // authored prd-{slug}.md cannot lower the project's security floor.
  if (classification === 'MICRO' && slug && gateLetter !== 'D') {
    return { ok: true, reason: 'micro_skips_gate' };
  }
  if (classification === 'MICRO' && slug && gateLetter === 'D' && projectClassification === 'MICRO') {
    return { ok: true, reason: 'micro_skips_gate' };
  }

  const specPath = slug
    ? path.join(targetDir, '.aioson', 'context', `spec-${slug}.md`)
    : path.join(targetDir, '.aioson', 'context', 'spec.md');
  const content = await readFileSafe(specPath);
  if (!content) {
    if (!slug) return { ok: true, reason: 'project_mode_without_spec' };
    return { ok: false, reason: 'spec_missing' };
  }

  const gateNames = { A: 'requirements', B: 'design', C: 'plan', D: 'execution' };
  const gateName = gateNames[gateLetter];

  // Parse frontmatter when present. Explicit gate fields take precedence over
  // free-text gate lines so `gate_requirements: pending` cannot be overridden
  // accidentally by stale prose elsewhere in the spec.
  const fmMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (fmMatch) {
    const fm = {};
    for (const line of fmMatch[1].split(/\r?\n/)) {
      const idx = line.indexOf(':');
      if (idx === -1) continue;
      const key = line.slice(0, idx).trim();
      const val = line.slice(idx + 1).trim().replace(/^["']|["']$/g, '');
      if (key) fm[key] = val;
    }

    // Check explicit gate field
    const gateVal = fm[`gate_${gateName}`] || fm[`gate${gateLetter}`] || fm[`gate_${gateLetter}`];
    if (gateVal) {
      return gateVal.toLowerCase() === 'approved'
        ? { ok: true }
        : { ok: false, reason: `gate_${gateName}_not_approved` };
    }

    // Check phase_gates JSON
    if (fm.phase_gates) {
      try {
        const parsed = JSON.parse(fm.phase_gates.replace(/'/g, '"'));
        if (parsed[gateName]) {
          return parsed[gateName] === 'approved'
            ? { ok: true }
            : { ok: false, reason: `gate_${gateName}_not_approved` };
        }
      } catch {
        // ignore
      }
    }
  }

  // Check content for gate approval lines
  const gateLineRe = new RegExp(`gate\\s+${gateLetter}[^:]*:\\s*approved`, 'i');
  if (gateLineRe.test(content)) {
    return { ok: true };
  }

  // Gate D: also accept QA sign-off section with PASS verdict
  if (gateLetter === 'D') {
    if (content.includes('## QA Sign-off')) {
      const passMatch = content.match(/\*\*Verdict:\*\*\s*(PASS)/i);
      if (passMatch) {
        return { ok: true };
      }
    }
  }

  return { ok: false, reason: fmMatch ? `gate_${gateName}_not_approved` : 'no_frontmatter' };
}

async function validateHandoffContract(targetDir, state, stageName, options = {}) {
  const contract = CONTRACTS[stageName];
  if (!contract) {
    // Unknown stage — allow pass-through
    return { ok: true, stage: stageName, missing: [] };
  }

  const missing = [];
  const classification = await resolveClassification(targetDir, state);
  // SF-project-26: project-level classification is the security baseline.
  // Independent of the feature's PRD frontmatter so it cannot be lowered by
  // an LLM-authored PRD.
  const projectClassification = await readProjectClassification(targetDir);

  let completeness = null;
  if (state.featureSlug) {
    completeness = await analyzeFeatureCompleteness(targetDir, state.featureSlug, {
      classification,
      includeExecution: (stageName === 'dev' || stageName === 'qa') && !options.structuralOnly,
      includeExecutionStructure: (stageName === 'dev' || stageName === 'qa') && options.structuralOnly
    });
    if (completeness.applicable) {
      let completenessStage = {
        product: 'product',
        analyst: 'requirements',
        architect: 'design',
        pm: 'plan',
        dev: 'execution',
        tester: 'plan',
        pentester: 'plan',
        qa: 'execution'
      }[stageName] || null;
      if (stageName === 'sheldon') completenessStage = isLeanSheldonState(state) ? 'plan' : 'product';
      if (stageName === 'orchestrator' && isMaestroOrchestratorState(state)) completenessStage = 'plan';
      if (completenessStage) {
        const completenessFindings = findingsThroughStage(completeness, completenessStage);
        missing.push(...completenessFindings.map((item) =>
          `feature completeness [${item.stage}/${item.check}]: ${item.message}`
        ));
      }
    }
  }

  // 1. Artifacts
  if (stageName === 'discovery-design-doc') {
    missing.push(...await validateDiscoveryDesignDocArtifacts(targetDir, state));
  } else {
    const artifactPaths = await resolveArtifacts(contract, targetDir, state);
    for (const p of artifactPaths) {
      if (!(await fileExists(p))) {
        missing.push(`missing artifact: ${path.relative(targetDir, p)}`);
      }
    }
  }

  // 2. Gates
  for (const gateLetter of contract.gates) {
    const gateCheck = await checkGateApproval(
      targetDir,
      gateLetter,
      state.featureSlug,
      classification,
      projectClassification
    );
    if (!gateCheck.ok) {
      missing.push(`gate ${gateLetter} not approved (${gateCheck.reason})`);
    }
  }

  // Single-spec-authority lanes that route straight to @dev — lean @sheldon (SMALL)
  // and maestro @orchestrator (MEDIUM) — collapse Gates A/B/C + the plan into one
  // hop, so re-check them here instead of at the (absent) per-hop stages.
  const isSingleSpecAuthorityToDev = Boolean(state.featureSlug) && (
    (stageName === 'sheldon' && isLeanSheldonState(state)) ||
    (stageName === 'orchestrator' && isMaestroOrchestratorState(state))
  );
  if (isSingleSpecAuthorityToDev) {
    const decisionCheckpoint = await readDecisionCheckpoint(targetDir, state.featureSlug);
    if (!decisionCheckpoint.exists) {
      missing.push(`missing decision checkpoint: .aioson/context/features/${state.featureSlug}/decision-checkpoint.json`);
    } else if (!decisionCheckpoint.ok) {
      missing.push(`invalid decision checkpoint: ${decisionCheckpoint.errors.join('; ')}`);
    } else if (decisionCheckpoint.pending.length > 0) {
      missing.push(`pending product decisions: ${decisionCheckpoint.pending.map((item) => item.id).join(', ')}`);
    }

    for (const gateLetter of ['A', 'B', 'C']) {
      const gateCheck = await checkGateApproval(
        targetDir,
        gateLetter,
        state.featureSlug,
        classification,
        projectClassification
      );
      if (!gateCheck.ok) {
        missing.push(`gate ${gateLetter} not approved (${gateCheck.reason})`);
      }
    }

    const planPath = path.join(targetDir, '.aioson', 'context', `implementation-plan-${state.featureSlug}.md`);
    const planContent = await readFileSafe(planPath);
    const planStatus = planContent ? parseFrontmatterValue(planContent, 'status') : null;
    if (String(planStatus || '').toLowerCase() !== 'approved') {
      missing.push(`implementation-plan-${state.featureSlug}.md status is ${planStatus || 'missing'} — @${stageName} must approve the collapsed Gate C plan`);
    }

    const integrityGate = await evaluateContractIntegrityGate(targetDir, state.featureSlug, {
      runChecks: false
    });
    if (!integrityGate.ok) {
      missing.push(...integrityGate.errors.map((err) =>
        `harness contract integrity failed (${err.code}): ${err.message}`
      ));
    }
  }

  if ((stageName === 'tester' || stageName === 'qa') && state.featureSlug) {
    const acAudit = await auditAcceptanceCriteriaTests(targetDir, state.featureSlug, {
      requireCriteria: Boolean(completeness && completeness.applicable),
      requireAssertions: Boolean(completeness && completeness.applicable)
    });
    if (!acAudit.ok) {
      missing.push(`AC test audit failed: missing tests for ${acAudit.missing.join(', ')}`);
    }
  }

  // 3. Context updates (soft check — just warn if completely missing)
  for (const p of contract.contextUpdates) {
    const abs = path.join(targetDir, p);
    if (!(await fileExists(abs))) {
      missing.push(`missing context file: ${p} (recommended)`);
    }
  }

  // 4. Security findings check — qa stage only
  // Blocks on open high/critical findings with recommended_gate_status=block.
  if (stageName === 'qa' && state.featureSlug) {
    const findingsPath = path.join(
      targetDir,
      `.aioson/context/security-findings-${state.featureSlug}.json`
    );
    const requiresFindingsArtifact = state.mode === 'feature' && classification === 'MEDIUM';
    if (!(await fileExists(findingsPath))) {
      if (requiresFindingsArtifact) {
        missing.push(`missing artifact: ${path.relative(targetDir, findingsPath)} (required for MEDIUM Gate D security audit)`);
      }
    } else {
      const envelope = await readSecurityFindings(findingsPath);
      if (!envelope || envelope.ok === false) {
        missing.push(
          `security: invalid findings artifact in ${path.relative(targetDir, findingsPath)} (${envelope?.reason || 'invalid_json'})`
        );
      } else {
        const reviewContractMissing = validateReviewContract(envelope.reviewContract);
        if (reviewContractMissing.length > 0) {
          missing.push(
            `security: invalid review_contract in ${path.relative(targetDir, findingsPath)} (missing: ${reviewContractMissing.join(', ')})`
          );
        } else {
          const blockers = envelope.findings.filter(
            (f) =>
              (f.status === 'open' || f.status === 'needs_validation') &&
              f.recommended_gate_status === 'block' &&
              (f.severity === 'high' || f.severity === 'critical')
          );
          if (blockers.length > 0) {
            missing.push(
              `security: ${blockers.length} unresolved high/critical finding(s) blocking gate: ${blockers.map((f) => getFindingIdentifier(f)).join(', ')}`
            );
          }
        }
      }
    }
  }

  // Only hard-block on artifacts and gates; context updates are warnings unless
  // we are in strict mode. For now, treat everything as blocking to harden handoffs.
  const hardBlockers = missing.filter((m) => !m.includes('(recommended)'));

  return {
    ok: hardBlockers.length === 0,
    stage: stageName,
    missing: hardBlockers,
    warnings: missing.filter((m) => m.includes('(recommended)'))
  };
}

function formatContractError(result) {
  const lines = [
    `[Handoff Contract BLOCKED]`,
    `Stage: @${result.stage}`,
    '',
    'Missing deliverables:',
    ...result.missing.map((m) => `  - ${m}`)
  ];
  if (result.warnings.length > 0) {
    lines.push('', 'Warnings:');
    lines.push(...result.warnings.map((w) => `  - ${w}`));
  }
  lines.push('', 'Complete these items before finishing the stage.');
  return lines.join('\n');
}

// Returns pending blocking revisions for the active feature (or [] for legacy features).
// Safe to call when dossier feature dir does not exist — returns [] silently.
async function getBlockingRevisions(targetDir, featureSlug) {
  if (!featureSlug) return [];
  try {
    const { getBlockingRevisions: getBlockers } = require('./dossier/revision-store');
    const ctxDir = path.join(targetDir, '.aioson', 'context');
    return await getBlockers({ slug: featureSlug, contextDir: ctxDir });
  } catch {
    return [];
  }
}

/**
 * getCanonicalArtifactsForAgent
 *
 * Public lookup helper used by `runAgentDone` (F2 — workflow-handoff-integrity v1.9.5)
 * to determine which artifact paths an agent is expected to produce. Returns the
 * paths declared by the agent's contract in CONTRACTS, plus accepted fallback
 * candidates for contracts that support legacy artifact names, fully resolved
 * against the workflow state.
 *
 * @param {string} agent       Agent name (with or without leading `@`).
 * @param {string} targetDir   Project root path (absolute).
 * @param {object} state       Workflow state: { mode, featureSlug, classification }.
 * @returns {string[]|null}    Array of absolute artifact paths, or `null` when the
 *                             agent is not registered in CONTRACTS. An empty array
 *                             means the agent produces no canonical artifact (e.g.
 *                             `@committer`, `@dev`) — auto-emit should be skipped.
 */
async function getCanonicalArtifactsForAgent(agent, targetDir, state) {
  const normalizedAgent = String(agent || '').replace(/^@/, '').toLowerCase();
  if (!normalizedAgent) return null;
  const contract = CONTRACTS[normalizedAgent];
  if (!contract) return null;
  if (normalizedAgent === 'discovery-design-doc' && state?.mode === 'feature' && state?.featureSlug) {
    return [
      `.aioson/context/design-doc-${state.featureSlug}.md`,
      `.aioson/context/readiness-${state.featureSlug}.md`,
      '.aioson/context/design-doc.md',
      '.aioson/context/readiness.md'
    ].map((p) => path.join(targetDir, p));
  }
  return await resolveArtifacts(contract, targetDir, state || {});
}

module.exports = {
  parseFrontmatterValue,
  readProjectClassification,
  resolveClassification,
  checkGateApproval,
  validateHandoffContract,
  formatContractError,
  getBlockingRevisions,
  getCanonicalArtifactsForAgent,
  CONTRACTS
};
