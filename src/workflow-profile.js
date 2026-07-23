'use strict';

/**
 * Canonical AIOSON delivery route.
 *
 * A substantive feature has one product authority (the PRD), one executable
 * plan and one delivery verdict. Extra specialists are detours, not mandatory
 * document-producing hops.
 */

const PROJECT_WORKFLOW_BY_CLASSIFICATION = Object.freeze({
  MICRO: Object.freeze(['setup', 'product', 'planner', 'dev', 'qa']),
  SMALL: Object.freeze(['setup', 'product', 'planner', 'dev', 'qa']),
  MEDIUM: Object.freeze(['setup', 'product', 'planner', 'dev', 'qa'])
});

const FEATURE_WORKFLOW_BY_CLASSIFICATION = Object.freeze({
  MICRO: Object.freeze(['product', 'planner', 'dev', 'qa']),
  SMALL: Object.freeze(['product', 'planner', 'dev', 'qa']),
  MEDIUM: Object.freeze(['product', 'planner', 'dev', 'qa'])
});

function copyWorkflowMap(map) {
  return Object.fromEntries(
    Object.entries(map).map(([classification, sequence]) => [classification, [...sequence]])
  );
}

function normalizeStageName(value) {
  return String(value || '').trim().toLowerCase().replace(/^@/, '');
}

function hasAdjacentStages(state, from, to) {
  const sequence = Array.isArray(state?.sequence)
    ? state.sequence.map(normalizeStageName)
    : [];
  const index = sequence.indexOf(from);
  return index !== -1 && sequence[index + 1] === to;
}

function isCanonicalPlannerState(state) {
  const sequence = Array.isArray(state?.sequence) ? state.sequence.map(normalizeStageName) : [];
  const product = sequence.indexOf('product');
  const planner = sequence.indexOf('planner');
  return product !== -1 && planner > product && hasAdjacentStages(state, 'planner', 'dev');
}

module.exports = {
  PROJECT_WORKFLOW_BY_CLASSIFICATION,
  FEATURE_WORKFLOW_BY_CLASSIFICATION,
  copyWorkflowMap,
  normalizeStageName,
  hasAdjacentStages,
  isCanonicalPlannerState
};
