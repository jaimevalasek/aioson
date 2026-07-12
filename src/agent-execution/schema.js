'use strict';

const HOSTS = ['claude', 'codex', 'opencode'];
const MODES = ['fresh-session', 'subagent', 'external', 'current-session'];
const AGENTS = ['dev', 'qa', 'tester', 'pentester', 'validator'];
const REASONING_EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max', 'ultra'];
const MAX_MODEL_NAME_LENGTH = 200;
const ROOT_KEYS = ['version','feature','host','generated_at','agents','capacity_policy','cycle_limits','reporting'];
const AGENT_KEYS = ['enabled','host','mode','model','reasoning_effort','writable_roots','fallbacks','report'];
const SECRET_KEY = /token|secret|password|authorization|api[_-]?key/i;

function validateManifest(value, expectedFeature) {
  const errors = [];
  const add = (path, message) => errors.push({ path, message });
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { ok: false, errors: [{ path: '$', message: 'must be an object' }] };
  const scanSecrets=(node,p='$')=>{if(!node||typeof node!=='object')return;for(const [key,child] of Object.entries(node)){if(SECRET_KEY.test(key))add(`${p}.${key}`,'secret fields are forbidden; use environment configuration');scanSecrets(child,`${p}.${key}`)}};scanSecrets(value);
  for (const key of Object.keys(value)) if (!ROOT_KEYS.includes(key)) add(`$.${key}`, SECRET_KEY.test(key) ? 'secret fields are forbidden; use environment configuration' : 'unknown field');
  if (value.version !== 1) add('$.version', 'must equal 1');
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value.feature || '')) add('$.feature', 'must be a kebab-case slug');
  if (expectedFeature && value.feature !== expectedFeature) add('$.feature', `must equal ${expectedFeature}`);
  if (!HOSTS.includes(value.host)) add('$.host', `must be one of ${HOSTS.join(', ')}`);
  if (!value.agents || typeof value.agents !== 'object') add('$.agents', 'must be an object');
  else for(const key of Object.keys(value.agents)) if(!AGENTS.includes(key)) add(`$.agents.${key}`,'unknown agent');
  for (const id of AGENTS) {
    const agent = value.agents && value.agents[id];
    if (!agent || typeof agent !== 'object') { add(`$.agents.${id}`, 'is required'); continue; }
    for (const key of Object.keys(agent)) if (!AGENT_KEYS.includes(key)) add(`$.agents.${id}.${key}`, SECRET_KEY.test(key) ? 'secret fields are forbidden; use environment configuration' : 'unknown field');
    if (typeof agent.enabled !== 'boolean') add(`$.agents.${id}.enabled`, 'must be boolean');
    if (!HOSTS.includes(agent.host)) add(`$.agents.${id}.host`, `must be one of ${HOSTS.join(', ')}`);
    if (!MODES.includes(agent.mode)) add(`$.agents.${id}.mode`, `must be one of ${MODES.join(', ')}`);
    if (typeof agent.model !== 'string' || !agent.model.trim()) add(`$.agents.${id}.model`, 'must be a non-empty model id');
    else if (agent.model.length > MAX_MODEL_NAME_LENGTH) add(`$.agents.${id}.model`, `must be at most ${MAX_MODEL_NAME_LENGTH} characters`);
    if (agent.reasoning_effort !== undefined && !REASONING_EFFORTS.includes(agent.reasoning_effort)) add(`$.agents.${id}.reasoning_effort`, `must be one of ${REASONING_EFFORTS.join(', ')}`);
    if(!Array.isArray(agent.writable_roots))add(`$.agents.${id}.writable_roots`,'must be an array');else agent.writable_roots.forEach((root,index)=>{if(typeof root!=='string'||!root.trim())add(`$.agents.${id}.writable_roots[${index}]`,'must be a non-empty path')});
    if (!Array.isArray(agent.fallbacks)) add(`$.agents.${id}.fallbacks`, 'must be an array');
    else agent.fallbacks.forEach((fallback,index)=>{const p=`$.agents.${id}.fallbacks[${index}]`;if(!fallback||typeof fallback!=='object'||Array.isArray(fallback)){add(p,'must be {host, model}');return}for(const key of Object.keys(fallback))if(!['host','model'].includes(key))add(`${p}.${key}`,'unknown field');if(!HOSTS.includes(fallback.host))add(`${p}.host`,`must be one of ${HOSTS.join(', ')}`);if(typeof fallback.model!=='string'||!fallback.model.trim())add(`${p}.model`,'must be a non-empty model id');else if(fallback.model.length>MAX_MODEL_NAME_LENGTH)add(`${p}.model`,`must be at most ${MAX_MODEL_NAME_LENGTH} characters`)});
    if (typeof agent.report !== 'string' || !agent.report.includes('{run_id}')) add(`$.agents.${id}.report`, 'must include {run_id}');
  }
  const limits = value.cycle_limits;
  if (!limits || typeof limits !== 'object') add('$.cycle_limits', 'is required');
  else for (const [key, number] of Object.entries(limits)) if (!Number.isInteger(number) || number < 0) add(`$.cycle_limits.${key}`, 'must be a non-negative integer');
  if (!value.capacity_policy || !['pause', 'retry', 'wait', 'fallback'].includes(value.capacity_policy.strategy)) add('$.capacity_policy.strategy', 'must be pause, retry, wait, or fallback');
  else { for(const key of Object.keys(value.capacity_policy)) if(!['strategy','max_attempts','backoff_ms','allow_cross_host'].includes(key)) add(`$.capacity_policy.${key}`,'unknown field'); if(!Number.isInteger(value.capacity_policy.max_attempts)||value.capacity_policy.max_attempts<1)add('$.capacity_policy.max_attempts','must be a positive integer'); if(!Number.isInteger(value.capacity_policy.backoff_ms)||value.capacity_policy.backoff_ms<0)add('$.capacity_policy.backoff_ms','must be a non-negative integer'); }
  if(!value.reporting||typeof value.reporting!=='object')add('$.reporting','is required');else for(const key of Object.keys(value.reporting))if(!['format','markdown'].includes(key))add(`$.reporting.${key}`,'unknown field');
  return { ok: errors.length === 0, errors };
}

module.exports = { AGENTS, HOSTS, MAX_MODEL_NAME_LENGTH, MODES, REASONING_EFFORTS, validateManifest };
