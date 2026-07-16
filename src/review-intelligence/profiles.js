'use strict';

const PROFILE_REFERENCES = Object.freeze({
  framing: '.aioson/skills/process/review-intelligence/references/framing.md',
  specification: '.aioson/skills/process/review-intelligence/references/specification.md',
  architecture: '.aioson/skills/process/review-intelligence/references/architecture.md',
  'delivery-assurance': '.aioson/skills/process/review-intelligence/references/delivery-assurance.md'
});

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

const REVIEW_PROFILES = deepFreeze({
  briefing: {
    profile: 'framing',
    review_mode: 'self_review',
    default_artifacts: ['.aioson/briefings/{slug}/briefings.md'],
    authority_candidates: [
      { kind: 'project-context', path: '.aioson/context/project.context.md' },
      { kind: 'briefing', path: '.aioson/briefings/{slug}/briefings.md' },
      { kind: 'prd', path: '.aioson/context/prd-{slug}.md' },
      { kind: 'scope-expansion', path: '.aioson/context/features/{slug}/scope-expansion.md' },
      { kind: 'dossier', path: '.aioson/context/features/{slug}/dossier.md' }
    ],
    challenge_lenses: ['problem', 'user-value', 'scope', 'assumptions', 'future-state', 'ownership']
  },
  'briefing-refiner': {
    profile: 'framing',
    review_mode: 'independent_review',
    default_artifacts: ['.aioson/briefings/{slug}/briefings.md'],
    authority_candidates: [
      { kind: 'project-context', path: '.aioson/context/project.context.md' },
      { kind: 'briefing', path: '.aioson/briefings/{slug}/briefings.md' },
      { kind: 'prd', path: '.aioson/context/prd-{slug}.md' },
      { kind: 'scope-expansion', path: '.aioson/context/features/{slug}/scope-expansion.md' },
      { kind: 'dossier', path: '.aioson/context/features/{slug}/dossier.md' }
    ],
    challenge_lenses: ['problem', 'user-value', 'scope', 'assumptions', 'future-state', 'ownership']
  },
  product: {
    profile: 'framing',
    review_mode: 'self_review',
    default_artifacts: ['.aioson/context/prd-{slug}.md'],
    authority_candidates: [
      { kind: 'project-context', path: '.aioson/context/project.context.md' },
      { kind: 'briefing', path: '.aioson/briefings/{slug}/briefings.md' },
      { kind: 'prd', path: '.aioson/context/prd-{slug}.md' },
      { kind: 'scope-expansion', path: '.aioson/context/features/{slug}/scope-expansion.md' },
      { kind: 'dossier', path: '.aioson/context/features/{slug}/dossier.md' }
    ],
    challenge_lenses: ['problem', 'user-value', 'scope', 'assumptions', 'future-state', 'ownership']
  },
  sheldon: {
    profile: 'specification',
    review_mode: 'independent_review',
    default_artifacts: ['.aioson/context/prd-{slug}.md'],
    authority_candidates: [
      { kind: 'project-context', path: '.aioson/context/project.context.md' },
      { kind: 'prd', path: '.aioson/context/prd-{slug}.md' },
      { kind: 'requirements', path: '.aioson/context/requirements-{slug}.md' },
      { kind: 'spec', path: '.aioson/context/spec-{slug}.md' },
      { kind: 'scope-expansion', path: '.aioson/context/features/{slug}/scope-expansion.md' },
      { kind: 'dossier', path: '.aioson/context/features/{slug}/dossier.md' }
    ],
    challenge_lenses: ['coverage', 'ambiguity', 'edge-cases', 'failure-modes', 'ownership', 'verifiability']
  },
  analyst: {
    profile: 'specification',
    review_mode: 'self_review',
    default_artifacts: ['.aioson/context/requirements-{slug}.md'],
    authority_candidates: [
      { kind: 'project-context', path: '.aioson/context/project.context.md' },
      { kind: 'prd', path: '.aioson/context/prd-{slug}.md' },
      { kind: 'requirements', path: '.aioson/context/requirements-{slug}.md' },
      { kind: 'spec', path: '.aioson/context/spec-{slug}.md' },
      { kind: 'scope-expansion', path: '.aioson/context/features/{slug}/scope-expansion.md' },
      { kind: 'dossier', path: '.aioson/context/features/{slug}/dossier.md' }
    ],
    challenge_lenses: ['coverage', 'ambiguity', 'edge-cases', 'failure-modes', 'ownership', 'verifiability']
  },
  architect: {
    profile: 'architecture',
    review_mode: 'self_review',
    default_artifacts: ['.aioson/context/design-doc-{slug}.md'],
    authority_candidates: [
      { kind: 'project-context', path: '.aioson/context/project.context.md' },
      { kind: 'prd', path: '.aioson/context/prd-{slug}.md' },
      { kind: 'requirements', path: '.aioson/context/requirements-{slug}.md' },
      { kind: 'spec', path: '.aioson/context/spec-{slug}.md' },
      { kind: 'design-doc', path: '.aioson/context/design-doc-{slug}.md' },
      { kind: 'design-doc', path: '.aioson/context/design-doc.md' },
      { kind: 'structural-rule', path: '.aioson/rules/agent-structural-contract.md' },
      { kind: 'dossier', path: '.aioson/context/features/{slug}/dossier.md' }
    ],
    challenge_lenses: ['boundary', 'failure', 'security', 'evolution', 'implementability']
  },
  'scope-check': {
    profile: 'delivery-assurance',
    review_mode: 'independent_review',
    default_artifacts: [
      '.aioson/context/scope-check-{slug}.md',
      '.aioson/context/implementation-plan-{slug}.md'
    ],
    authority_candidates: [
      { kind: 'prd', path: '.aioson/context/prd-{slug}.md' },
      { kind: 'requirements', path: '.aioson/context/requirements-{slug}.md' },
      { kind: 'spec', path: '.aioson/context/spec-{slug}.md' },
      { kind: 'design-doc', path: '.aioson/context/design-doc-{slug}.md' },
      { kind: 'implementation-plan', path: '.aioson/context/implementation-plan-{slug}.md' },
      { kind: 'scope-check', path: '.aioson/context/scope-check-{slug}.md' },
      { kind: 'qa-report', path: '.aioson/context/qa-report-{slug}.md' },
      { kind: 'security-findings', path: '.aioson/context/security-findings-{slug}.json' },
      { kind: 'harness', path: '.aioson/plans/{slug}/harness-contract.json' },
      { kind: 'dossier', path: '.aioson/context/features/{slug}/dossier.md' }
    ],
    challenge_lenses: ['specification-fidelity', 'acceptance-coverage', 'code-health', 'runtime-truth', 'residual-risk']
  },
  qa: {
    profile: 'delivery-assurance',
    review_mode: 'independent_review',
    default_artifacts: ['.aioson/context/qa-report-{slug}.md'],
    authority_candidates: [
      { kind: 'prd', path: '.aioson/context/prd-{slug}.md' },
      { kind: 'requirements', path: '.aioson/context/requirements-{slug}.md' },
      { kind: 'spec', path: '.aioson/context/spec-{slug}.md' },
      { kind: 'design-doc', path: '.aioson/context/design-doc-{slug}.md' },
      { kind: 'implementation-plan', path: '.aioson/context/implementation-plan-{slug}.md' },
      { kind: 'scope-check', path: '.aioson/context/scope-check-{slug}.md' },
      { kind: 'qa-report', path: '.aioson/context/qa-report-{slug}.md' },
      { kind: 'security-findings', path: '.aioson/context/security-findings-{slug}.json' },
      { kind: 'harness', path: '.aioson/plans/{slug}/harness-contract.json' },
      { kind: 'dossier', path: '.aioson/context/features/{slug}/dossier.md' }
    ],
    challenge_lenses: ['specification-fidelity', 'acceptance-coverage', 'code-health', 'runtime-truth', 'residual-risk']
  }
});

function expandFeaturePath(template, featureSlug) {
  return String(template).replaceAll('{slug}', String(featureSlug));
}

function getReviewProfile(agent) {
  const key = String(agent || '').trim().toLowerCase();
  const profile = REVIEW_PROFILES[key];
  if (!profile) return null;
  return {
    agent: key,
    ...profile,
    reference_path: PROFILE_REFERENCES[profile.profile]
  };
}

function resolveProfilePaths(agent, featureSlug) {
  const profile = getReviewProfile(agent);
  if (!profile) return null;
  return {
    ...profile,
    default_artifacts: profile.default_artifacts.map((value) => expandFeaturePath(value, featureSlug)),
    authority_candidates: profile.authority_candidates.map((item) => ({
      ...item,
      path: expandFeaturePath(item.path, featureSlug)
    }))
  };
}

module.exports = {
  PROFILE_REFERENCES,
  REVIEW_PROFILES,
  REVIEW_AGENTS: Object.freeze(Object.keys(REVIEW_PROFILES)),
  getReviewProfile,
  resolveProfilePaths,
  expandFeaturePath
};
