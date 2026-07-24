'use strict';

const POLICY_TYPES = Object.freeze([
  'live-required',
  'live-check',
  'cache-eligible',
  'closed-world'
]);

const CURRENT_SIGNALS = /\b(latest|current|today|now|recent|breaking|price|pricing|law|regulation|release|version|status|availability|202[4-9]|hoje|atual|agora|recente|pre[cç]o|lei|regula[cç][aã]o|vers[aã]o|disponibilidade)\b/i;
const CLOSED_WORLD_SIGNALS = /\b(private|internal|provided by (?:the )?user|user-provided|closed[- ]world|offline|privad[oa]|intern[oa]|fornecid[oa] pelo usu[aá]rio|sem rede)\b/i;

function normalizePolicy(value) {
  const policy = String(value || '').trim().toLowerCase();
  return POLICY_TYPES.includes(policy) ? policy : null;
}

function classifyResearchPolicy(input = {}) {
  const explicit = normalizePolicy(
    input.policy
    || input.researchPolicy
    || input.research_policy
  );
  if (explicit) {
    return buildPolicy(explicit, 'explicit-policy', input);
  }

  const query = [
    input.query,
    input.topic,
    input.goal,
    input.description
  ].filter(Boolean).join(' ');
  const risk = String(input.risk || input.riskLevel || '').toLowerCase();
  const volatility = String(input.volatility || '').toLowerCase();
  const tier = String(input.domainTier || input.domain_tier || '').toLowerCase();
  const networkAllowed = input.network !== false && input.networkAllowed !== false;

  if (
    !networkAllowed
    || input.closedWorld === true
    || input.closed_world === true
    || CLOSED_WORLD_SIGNALS.test(query)
  ) {
    return buildPolicy('closed-world', 'private-or-network-inappropriate', input);
  }

  if (
    risk === 'high'
    || volatility === 'high'
    || tier.includes('regulated')
    || input.regulated === true
    || CURRENT_SIGNALS.test(query)
  ) {
    return buildPolicy('live-required', 'high-risk-or-volatile', input);
  }

  if (
    risk === 'medium'
    || volatility === 'medium'
    || input.external === true
    || input.specialized === true
    || input.recurring === true
  ) {
    return buildPolicy('live-check', 'external-or-specialized', input);
  }

  return buildPolicy('cache-eligible', 'stable-or-low-risk', input);
}

function buildPolicy(type, reason, input = {}) {
  const maxAgeByType = {
    'live-required': 6,
    'live-check': 24,
    'cache-eligible': Number(input.cacheHours || input.cache_hours || 168),
    'closed-world': null
  };
  return {
    type,
    reason,
    requiresLive: type === 'live-required' || type === 'live-check',
    networkAllowed: type !== 'closed-world',
    cacheMayConfirm: type === 'cache-eligible',
    maxAgeHours: maxAgeByType[type]
  };
}

module.exports = {
  POLICY_TYPES,
  normalizePolicy,
  classifyResearchPolicy,
  buildPolicy
};
