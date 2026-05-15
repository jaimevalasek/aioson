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
  architect: {
    artifacts: ['.aioson/context/architecture.md'],
    gates: ['B'],
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
    artifacts: ['.aioson/context/parallel'],
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

  // Parse frontmatter
  const fmMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!fmMatch) return { ok: false, reason: 'no_frontmatter' };

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
  if (gateVal && gateVal.toLowerCase() === 'approved') {
    return { ok: true };
  }

  // Check phase_gates JSON
  if (fm.phase_gates) {
    try {
      const parsed = JSON.parse(fm.phase_gates.replace(/'/g, '"'));
      if (parsed[gateName] === 'approved') return { ok: true };
    } catch {
      // ignore
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

  return { ok: false, reason: `gate_${gateName}_not_approved` };
}

async function validateHandoffContract(targetDir, state, stageName) {
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

  // 1. Artifacts
  const artifactPaths = await resolveArtifacts(contract, targetDir, state);
  for (const p of artifactPaths) {
    if (!(await fileExists(p))) {
      missing.push(`missing artifact: ${path.relative(targetDir, p)}`);
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

module.exports = {
  parseFrontmatterValue,
  readProjectClassification,
  resolveClassification,
  checkGateApproval,
  validateHandoffContract,
  formatContractError,
  getBlockingRevisions,
  CONTRACTS
};
