'use strict';

/**
 * Scenario steps: what a walkthrough needs to replay a production path that
 * starts outside the page.
 *
 *   - variables: `vars` in the script, values saved from a response, the
 *     current item of an `each` loop, and `run.*` (a per-run id, a fresh
 *     unique id per use, the clock) — written `{{name}}` in any step field;
 *   - `request`: the runner sends the call an external system would send (a
 *     provider's webhook, a payment callback) and checks the answer, so the
 *     path is driven from its real entry instead of seeded around;
 *   - `each`: the same steps over every case of a fixture (a test set with
 *     its expected outcomes), one record per case;
 *   - `judge`: a semantic question about what the page shows, answered by
 *     Jev — a critic, never the authority: a judgment never proves an id, and
 *     an unavailable Jev is a skipped judgment, never a pass.
 *
 * Secrets never live in a script: `{{env.NAME}}` resolves from the process
 * environment or the project's `.env` at run time, the step that used it is
 * masked, and every resolved value is scrubbed from what the run records,
 * writes, or sends to Jev.
 */

const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');

const { sanitizeUrl, clip, until } = require('./script');
const { stripHiddenChars } = require('../llm-content-sanitizer');
const { readProjectDotEnv } = require('../project-env');
const { redact } = require('../jev-privacy');

const NAME_RE = /^[A-Za-z_][\w-]*(?:\.[\w-]+)*$/;
const TEMPLATE_RE = /\{\{\s*([A-Za-z_][\w-]*(?:\.[\w-]+)*)\s*\}\}/g;
const WHOLE_TEMPLATE_RE = /^\{\{\s*([A-Za-z_][\w-]*(?:\.[\w-]+)*)\s*\}\}$/;
const ENV_NAME_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;
const RESERVED_VARS = new Set(['env', 'run', 'loop']);
const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);
const REQUEST_METHODS = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD']);
const JUDGE_TYPES = new Set(['noul', 'score', 'choice']);
// A value shorter than this would scrub ordinary words out of the report; the
// step that used it is still masked.
const MIN_SECRET_LENGTH = 4;
const MAX_JUDGE_PAGE_CHARS = 12000;
const DEFAULT_POLL_INTERVAL_MS = 500;
// Keys a step carries that are structure, not values to interpolate.
const STRUCTURAL_KEYS = new Set(['do', 'index', 'ids', 'own_ids', 'steps', 'label']);

// ---------------------------------------------------------------------------
// Run context
// ---------------------------------------------------------------------------

function createScenario({ targetDir, script, clock, env = process.env, fetchImpl = globalThis.fetch, jev = null }) {
  const stamp = new Date(clock.now()).toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
  return {
    targetDir,
    clock,
    env,
    fetchImpl,
    jev,
    vars: { ...(script.vars || {}) },
    secrets: new Map(),
    runId: `${stamp}-${crypto.randomBytes(3).toString('hex')}`,
    seq: 0,
    dotEnv: null,
    counts: { requests: 0, iterations: 0, judgments: { pass: 0, fail: 0, skipped: 0, concerns: 0 } }
  };
}

// ---------------------------------------------------------------------------
// Paths and variables
// ---------------------------------------------------------------------------

/** `data.items.0.id`, `$.items[0].id`, `items[0]` → the value, or undefined. */
function getPath(value, dotted) {
  const text = String(dotted || '').trim().replace(/^\$\.?/, '').replace(/\[(\d+)\]/g, '.$1').replace(/^\./, '');
  if (text === '') return value;
  let current = value;
  for (const part of text.split('.')) {
    if (current === null || current === undefined || typeof current !== 'object') return undefined;
    if (!Object.hasOwn(current, part)) return undefined;
    current = current[part];
  }
  return current;
}

/**
 * The forms a value takes on its way through a page: in a url, in a form body, in
 * a JSON string, in base64. A page that echoes `encodeURIComponent(value)` to its
 * console, or a route that holds it, reaches the report in that form, and the
 * literal alone would let it through.
 */
function secretForms(value) {
  const base64 = Buffer.from(value, 'utf8').toString('base64');
  return new Set([
    value,
    encodeURIComponent(value),
    encodeURIComponent(value).replace(/%[0-9A-F]{2}/g, (hex) => hex.toLowerCase()),
    encodeURIComponent(encodeURIComponent(value)),
    encodeURI(value),
    encodeURIComponent(value).replace(/%20/g, '+'),
    new URLSearchParams({ v: value }).toString().slice(2),
    JSON.stringify(value).slice(1, -1),
    base64,
    base64.replace(/=+$/, ''),
    base64.replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_'),
    Buffer.from(value, 'utf8').toString('hex')
  ]);
}

// A URL parser lowercases its host, so a value used as a host name comes back in a
// form nothing else in the run has.
function hostSecrets(secrets) {
  return new Map([...secrets].flatMap(([form, label]) => [[form, label], [form.toLowerCase(), label]]));
}

function rememberSecret(scenario, value, label) {
  if (value.length < MIN_SECRET_LENGTH) return;
  for (const form of secretForms(value)) scenario.secrets.set(form, label);
}

function envValue(name, scenario) {
  if (!ENV_NAME_RE.test(name)) throw new Error(`{{env.${name}}} is not a valid environment variable name`);
  let value = scenario.env && scenario.env[name];
  if (typeof value !== 'string' || value.trim() === '') {
    if (!scenario.dotEnv) {
      try { scenario.dotEnv = readProjectDotEnv(scenario.targetDir).values; } catch { scenario.dotEnv = {}; }
    }
    value = scenario.dotEnv[name];
  }
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`{{env.${name}}} is not set in the environment or the project .env`);
  }
  const resolved = value.trim();
  rememberSecret(scenario, resolved, `env.${name}`);
  return resolved;
}

function lookup(name, scenario, scope) {
  const [head, ...rest] = name.split('.');
  if (head === 'env') return { value: envValue(rest.join('.'), scenario), secret: true };
  if (head === 'run') {
    const field = rest.join('.');
    if (field === 'id') return { value: scenario.runId };
    if (field === 'uid') { scenario.seq += 1; return { value: `${scenario.runId}-${scenario.seq}` }; }
    if (field === 'now') return { value: new Date(scenario.clock.now()).toISOString() };
    if (field === 'epoch_ms') return { value: scenario.clock.now() };
    throw new Error(`unknown run variable {{${name}}} (run.id, run.uid, run.now, run.epoch_ms)`);
  }
  const bag = { ...scenario.vars, ...scope };
  const value = Object.hasOwn(bag, head) ? getPath(bag[head], rest.join('.')) : undefined;
  if (value === undefined) throw new Error(`unknown variable {{${name}}}`);
  return { value };
}

function interpolate(value, scenario, scope, used) {
  if (typeof value === 'string') {
    // A field that is exactly one reference keeps the value's type, so a
    // saved number or object lands in a request body as itself.
    const whole = value.match(WHOLE_TEMPLATE_RE);
    if (whole) {
      const hit = lookup(whole[1], scenario, scope);
      if (hit.secret) used.secret = true;
      return hit.value;
    }
    return value.replace(TEMPLATE_RE, (_, name) => {
      const hit = lookup(name, scenario, scope);
      if (hit.secret) used.secret = true;
      return typeof hit.value === 'string' ? hit.value : JSON.stringify(hit.value);
    });
  }
  if (Array.isArray(value)) return value.map((item) => interpolate(item, scenario, scope, used));
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, interpolate(item, scenario, scope, used)]));
  }
  return value;
}

/** A copy of the step with every value field resolved; a step that read a secret is masked. */
function resolveStep(step, scenario, scope = {}) {
  const used = { secret: false };
  const out = {};
  for (const [key, value] of Object.entries(step)) {
    out[key] = STRUCTURAL_KEYS.has(key) ? value : interpolate(value, scenario, scope, used);
  }
  if (used.secret) out.mask = true;
  return out;
}

/** Replace every resolved secret in strings (deep) with its `[env.NAME]` label. */
function scrub(value, secrets) {
  if (!secrets || secrets.size === 0) return value;
  // Longest first: one form may hold another inside it.
  const ordered = [...secrets].sort((a, b) => b[0].length - a[0].length);
  const clean = (item) => {
    if (typeof item === 'string') {
      let out = item;
      for (const [secret, label] of ordered) {
        if (out.includes(secret)) out = out.split(secret).join(`[${label}]`);
      }
      return out;
    }
    if (Array.isArray(item)) return item.map(clean);
    if (item && typeof item === 'object') {
      return Object.fromEntries(Object.entries(item).map(([key, entry]) => [key, clean(entry)]));
    }
    return item;
  };
  return clean(value);
}

// A step's own identity is not page text: its index, its action, the ids it proves
// and the files it wrote keep their names, or the report would point at nothing.
function scrubRecord(record, secrets) {
  return { ...scrub(record, secrets), index: record.index, do: record.do, ids: record.ids, artifacts: record.artifacts };
}

// E-mail addresses and digit runs of 8+ (phones, CPF/CNPJ, cards, document
// numbers, whatever the separators) — what a page about people shows and an
// external judge does not need to read.
function maskPersonalData(value) {
  if (typeof value === 'string') {
    return value
      .replace(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g, '[email]')
      .replace(/\+?\d[\d\s().-]{6,}\d/g, (match) => (match.replace(/\D/g, '').length >= 8 ? '[number]' : match));
  }
  if (Array.isArray(value)) return value.map(maskPersonalData);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, maskPersonalData(item)]));
  }
  return value;
}

// ---------------------------------------------------------------------------
// Validation (called by normalizeScript)
// ---------------------------------------------------------------------------

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function validateVars(vars) {
  if (vars === undefined) return [];
  if (!isPlainObject(vars)) return ['`vars` must be an object of name → value'];
  return Object.keys(vars)
    .filter((name) => !/^[A-Za-z_]\w*$/.test(name) || RESERVED_VARS.has(name))
    .map((name) => `vars.${name}: names are letters, digits and _; env, run and loop are reserved`);
}

function validateRequest(step, where) {
  const errors = [];
  if (!step.url) errors.push(`${where}: request needs \`url\``);
  const method = String(step.method || 'GET').toUpperCase();
  if (!REQUEST_METHODS.has(method)) errors.push(`${where}: request method must be one of ${[...REQUEST_METHODS].join(', ')}`);
  if (step.status !== undefined) {
    const list = Array.isArray(step.status) ? step.status : [step.status];
    if (list.length === 0 || list.some((code) => !Number.isInteger(Number(code)) || Number(code) < 100 || Number(code) > 599)) {
      errors.push(`${where}: request status must be an HTTP status or a list of them`);
    }
  }
  if (step.headers !== undefined && !isPlainObject(step.headers)) errors.push(`${where}: request headers must be an object`);
  if (step.secret !== undefined && typeof step.secret !== 'boolean') errors.push(`${where}: request secret must be true or false (true: the saved values are secrets)`);
  if (step.json !== undefined && !isPlainObject(step.json)) errors.push(`${where}: request json must be an object of path → expected value`);
  if (step.save !== undefined) {
    if (!isPlainObject(step.save)) errors.push(`${where}: request save must be an object of variable → response path`);
    else {
      for (const [name, at] of Object.entries(step.save)) {
        if (!/^[A-Za-z_]\w*$/.test(name) || RESERVED_VARS.has(name)) errors.push(`${where}: save.${name} is not a variable name (env, run and loop are reserved)`);
        if (typeof at !== 'string') errors.push(`${where}: save.${name} must be a response path such as "id" or "data.items.0.id"`);
      }
    }
  }
  return errors;
}

function validateJudge(step, where) {
  const errors = [];
  if (typeof step.question !== 'string' || step.question.trim() === '') errors.push(`${where}: judge needs \`question\``);
  const type = step.type === undefined ? 'noul' : step.type;
  if (!JUDGE_TYPES.has(type)) {
    errors.push(`${where}: judge type must be noul, score, or choice`);
    return errors;
  }
  const unit = (value) => typeof value === 'number' && value >= 0 && value <= 1;
  if (step.min !== undefined && !unit(step.min)) errors.push(`${where}: judge min must be a number from 0 to 1`);
  if (step.min_confidence !== undefined && !unit(step.min_confidence)) errors.push(`${where}: judge min_confidence must be a number from 0 to 1`);
  if (step.pii !== undefined && !['mask', 'keep'].includes(step.pii)) errors.push(`${where}: judge pii must be mask or keep`);
  if (type === 'noul' && step.criteria !== undefined
    && !(isPlainObject(step.criteria) && Object.hasOwn(step.criteria, 'true') && Object.hasOwn(step.criteria, 'false'))) {
    errors.push(`${where}: judge noul criteria must define true and false`);
  }
  if (type === 'score') {
    if (!Array.isArray(step.criteria) || step.criteria.length < 2 || step.criteria.length > 10) {
      errors.push(`${where}: judge score needs criteria: 2 to 10 ordered levels`);
    } else if (!(Number.isInteger(step.min_score) && step.min_score >= 0 && step.min_score < step.criteria.length)) {
      errors.push(`${where}: judge score needs min_score: the lowest passing level (0 to ${step.criteria.length - 1})`);
    }
  }
  if (type === 'choice') {
    const options = isPlainObject(step.criteria) ? Object.keys(step.criteria) : [];
    if (options.length < 2) errors.push(`${where}: judge choice needs criteria: a map of 2 or more options`);
    const expected = Array.isArray(step.equals) ? step.equals : [step.equals];
    if (step.equals === undefined || expected.length === 0) errors.push(`${where}: judge choice needs equals: the option (or options) that pass`);
    else if (options.length >= 2 && expected.some((option) => !options.includes(String(option)))) {
      errors.push(`${where}: judge choice equals names an option that is not in criteria`);
    }
  }
  return errors;
}

function validateEach(step, where, nested) {
  const errors = [];
  if (nested) errors.push(`${where}: each cannot be nested inside another each`);
  if (step.from === undefined && step.items === undefined) errors.push(`${where}: each needs \`from\` (a JSON file in the project) or \`items\` (an array)`);
  if (step.items !== undefined && !Array.isArray(step.items)) errors.push(`${where}: each items must be an array`);
  if (step.from !== undefined && typeof step.from !== 'string') errors.push(`${where}: each from must be a path`);
  const as = step.as === undefined ? 'item' : step.as;
  if (typeof as !== 'string' || !/^[A-Za-z_]\w*$/.test(as) || RESERVED_VARS.has(as)) errors.push(`${where}: each as must be a variable name (env, run and loop are reserved)`);
  if (step.limit !== undefined && !(Number(step.limit) > 0)) errors.push(`${where}: each limit must be a positive number`);
  if (step.where !== undefined && !isPlainObject(step.where)) errors.push(`${where}: each where must be an object of path → value`);
  if (!Array.isArray(step.steps) || step.steps.length === 0) errors.push(`${where}: each needs a non-empty \`steps\` array`);
  return errors;
}

// ---------------------------------------------------------------------------
// request
// ---------------------------------------------------------------------------

function resolveRequestUrl(value, base) {
  const text = String(value || '');
  if (/^[a-z][a-z0-9+.-]*:/i.test(text)) return text;
  try { return new URL(text, base).toString(); } catch { return text; }
}

/** `new URL` reads the real host, so `http://localhost@evil.test` is not local. */
function isLoopbackUrl(url) {
  try {
    const parsed = new URL(url);
    return /^https?:$/.test(parsed.protocol) && LOOPBACK_HOSTS.has(parsed.hostname.toLowerCase());
  } catch {
    return false;
  }
}

/**
 * The value of a `value_env` step. Too short to scrub means it could not be kept
 * out of the report, so it is refused instead of typed.
 */
function secretEnvValue(name, scenario) {
  let value;
  try {
    value = envValue(name, scenario);
  } catch {
    throw new Error(`value_env ${name} is not set in the environment or the project .env`);
  }
  if (value.length < MIN_SECRET_LENGTH) throw new Error(`value_env ${name} is shorter than ${MIN_SECRET_LENGTH} characters, too short to keep out of the report`);
  return value;
}

function refusedHost(url, baseUrl, external) {
  let parsed;
  try { parsed = new URL(url); } catch { return `request url is not absolute: ${sanitizeUrl(url)} (give an absolute url or a script \`url\`)`; }
  if (!/^https?:$/.test(parsed.protocol)) return `request url must be http or https: ${sanitizeUrl(url)}`;
  if (external) return '';
  if (LOOPBACK_HOSTS.has(parsed.hostname.toLowerCase())) return '';
  try { if (baseUrl && new URL(baseUrl).origin === parsed.origin) return ''; } catch { /* no base */ }
  return `request to ${parsed.origin} refused: only loopback hosts and the walkthrough's own origin are reachable — set "external": true on the step to reach another host on purpose`;
}

function valueMatches(actual, expected) {
  if (typeof expected === 'string') {
    const regex = expected.match(/^\/(.+)\/([a-z]*)$/);
    if (regex) {
      try { return new RegExp(regex[1], regex[2]).test(String(actual)); } catch { /* literal below */ }
    }
    return typeof actual === 'string' ? actual === expected : actual !== undefined && actual !== null && String(actual) === expected;
  }
  return JSON.stringify(actual) === JSON.stringify(expected);
}

function textContains(text, expected) {
  const regex = String(expected).match(/^\/(.+)\/([a-z]*)$/);
  if (regex) {
    try { return new RegExp(regex[1], regex[2]).test(text); } catch { /* literal below */ }
  }
  return String(text).includes(String(expected));
}

function checkResponse(step, response) {
  const problems = [];
  const expected = step.status === undefined ? null : (Array.isArray(step.status) ? step.status : [step.status]).map(Number);
  if (expected ? !expected.includes(response.status) : response.status >= 400) {
    problems.push(`status ${response.status}, expected ${expected ? expected.join(' or ') : 'below 400'}`);
  }
  if (step.contains !== undefined && !textContains(response.text, step.contains)) {
    problems.push(`body does not contain ${JSON.stringify(step.contains)}`);
  }
  for (const [at, want] of Object.entries(step.json || {})) {
    const actual = getPath(response.json, at);
    if (!valueMatches(actual, want)) {
      problems.push(`json ${at} = ${clip(actual === undefined ? '(missing)' : JSON.stringify(actual), 80)}, expected ${clip(JSON.stringify(want), 80)}`);
    }
  }
  return problems;
}

// A contained run keeps its values on this machine, and `request` is the one door the
// proxy does not hold.
function refusesValueOut({ step, scenario, url, headers, body }) {
  if (!scenario.contained || step.external !== true || LOOPBACK_HOSTS.has(new URL(url).hostname.toLowerCase())) return '';
  const outgoing = [url, JSON.stringify(headers), typeof body === 'string' ? body : ''];
  if (outgoing.every((text) => scrub(text, scenario.secrets) === text)) return '';
  return `request to ${new URL(url).origin} refused: it would carry a value_env, {{env.*}} or saved secret off this machine, and a run with value_env or --save-state keeps them here. Send it from a script without those`;
}

async function runRequest({ step, scenario, baseUrl, timeout, record }) {
  const method = String(step.method || 'GET').toUpperCase();
  const url = resolveRequestUrl(step.url, baseUrl);
  const refused = refusedHost(url, baseUrl, step.external === true);
  if (refused) throw new Error(refused);
  if (typeof scenario.fetchImpl !== 'function') throw new Error('request needs fetch (Node 18 or later)');
  const headers = Object.fromEntries(Object.entries(step.headers || {}).map(([name, value]) => [name, String(value)]));
  let body;
  if (step.body !== undefined && method !== 'GET' && method !== 'HEAD') {
    if (typeof step.body === 'string') body = step.body;
    else {
      body = JSON.stringify(step.body);
      if (!Object.keys(headers).some((name) => name.toLowerCase() === 'content-type')) headers['content-type'] = 'application/json';
    }
  }
  const carriesValue = refusesValueOut({ step, scenario, url, headers, body });
  if (carriesValue) throw new Error(carriesValue);
  scenario.counts.requests += 1;
  let attempts = 0;
  let last = null;
  const attempt = async () => {
    attempts += 1;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    let response;
    try {
      response = await scenario.fetchImpl(url, { method, headers, body, signal: controller.signal, redirect: 'manual' });
    } finally {
      clearTimeout(timer);
    }
    const text = method === 'HEAD' ? '' : String(await response.text());
    let json;
    try { json = text ? JSON.parse(text) : undefined; } catch { json = undefined; }
    last = { status: response.status, text, json };
    const problems = checkResponse(step, last);
    return { ok: problems.length === 0, detail: problems.join('; ') };
  };
  let result;
  if (step.poll) {
    const interval = Number(step.interval) > 0 ? Number(step.interval) : DEFAULT_POLL_INTERVAL_MS;
    result = await until(attempt, timeout, { interval, now: scenario.clock.now, wait: scenario.clock.wait });
  } else {
    result = await attempt();
  }
  const where = `${method} ${sanitizeUrl(url)}`;
  record.request = { method, url: sanitizeUrl(url), status: last ? last.status : null, attempts, headers: Object.keys(headers) };
  // The answer is what the app said: hidden carriers dropped, secret-shaped
  // values redacted, kept short — the report is read by agents.
  if (last && last.text) record.value = clip(redact(stripHiddenChars(last.text)), 300);
  if (!result.ok) throw new Error(`${where}: ${result.detail || 'no answer'}${attempts > 1 ? ` (after ${attempts} attempts)` : ''}`);
  const saved = [];
  for (const [name, at] of Object.entries(step.save || {})) {
    const value = getPath(last.json, at);
    if (value === undefined) throw new Error(`${where}: save ${name} — "${at}" is not in the response`);
    scenario.vars[name] = value;
    // A saved session token is a secret like an env value: scrubbed from
    // everything the run records from here on.
    if (step.secret === true && typeof value === 'string') rememberSecret(scenario, value, `saved.${name}`);
    saved.push(name);
  }
  if (saved.length > 0) record.request.saved = saved;
  record.detail = `${where} → ${last.status}${attempts > 1 ? ` after ${attempts} attempts` : ''}${saved.length ? `; saved ${saved.join(', ')}` : ''}`;
}

// ---------------------------------------------------------------------------
// each
// ---------------------------------------------------------------------------

async function loadItems(step, scenario) {
  let data;
  if (step.items !== undefined) {
    data = step.items;
  } else {
    const file = path.resolve(scenario.targetDir, String(step.from));
    const rel = path.relative(scenario.targetDir, file);
    if (rel === '' || rel.startsWith('..') || path.isAbsolute(rel)) throw new Error(`each from must be a file inside the project: ${step.from}`);
    data = JSON.parse(await fs.readFile(file, 'utf8'));
  }
  if (step.select) data = getPath(data, step.select);
  if (!Array.isArray(data)) throw new Error(`each needs an array${step.select ? ` at "${step.select}"` : ''}`);
  if (step.where) data = data.filter((item) => Object.entries(step.where).every(([at, want]) => valueMatches(getPath(item, at), want)));
  const limit = Number(step.limit) > 0 ? Math.floor(Number(step.limit)) : data.length;
  return data.slice(0, limit);
}

// ---------------------------------------------------------------------------
// judge
// ---------------------------------------------------------------------------

function judgeDecision(step, type, config) {
  const rules = [];
  if (type === 'noul') {
    const min = step.min !== undefined ? step.min : Number(config && config.minNoul) || 0.6;
    rules.push({ question: 'verdict', metric: 'noul', op: 'gte', value: min });
  } else if (type === 'score') {
    rules.push({ question: 'verdict', metric: 'score', op: 'gte', value: step.min_score });
  } else {
    const expected = Array.isArray(step.equals) ? step.equals.map(String) : String(step.equals);
    rules.push({ question: 'verdict', metric: 'choice', op: Array.isArray(expected) ? 'in' : 'eq', value: expected });
  }
  if (type !== 'noul' && step.min_confidence !== undefined) {
    rules.push({ question: 'verdict', metric: 'confidence', op: 'gte', value: step.min_confidence });
  }
  return { type: 'gate', mode: 'all', rules };
}

function usageOf(usage) {
  if (!usage || typeof usage !== 'object') return null;
  const out = {};
  for (const [key, value] of Object.entries(usage)) if (typeof value === 'number' && Number.isFinite(value)) out[key] = value;
  return Object.keys(out).length ? out : null;
}

function describeRules(evaluations) {
  return (evaluations || []).map((item) => {
    const actual = typeof item.actual === 'number' ? Number(item.actual.toFixed(3)) : item.actual;
    return `${item.metric} ${JSON.stringify(actual)} ${item.op} ${JSON.stringify(item.expected)}${item.passed ? '' : ' ✗'}`;
  }).join('; ');
}

async function runJudge({ step, scenario, page, script, record, readPage }) {
  const counts = scenario.counts.judgments;
  const skip = (reason) => {
    counts.skipped += 1;
    record.skipped = true;
    record.judge = { verdict: 'skipped', reason };
    if (step.required) throw new Error(`Jev is not available (${reason}) and this judgment is required`);
    record.detail = `Jev not available (${reason}) — judgment skipped; it proves nothing`;
  };
  const jev = scenario.jev;
  const config = jev && typeof jev.loadConfig === 'function' ? jev.loadConfig(scenario.targetDir) : null;
  if (!config || config.status !== 'ready') return skip(config ? (config.reason || config.status) : 'unconfigured');

  const type = step.type === undefined ? 'noul' : step.type;
  const keep = step.pii === 'keep';
  let aria = scrub(stripHiddenChars(String(await readPage(step.target || null) || '')), scenario.secrets);
  if (!keep) aria = maskPersonalData(aria);
  const truncated = aria.length > MAX_JUDGE_PAGE_CHARS;
  aria = aria.slice(0, MAX_JUDGE_PAGE_CHARS);
  let context = step.context === undefined ? undefined : scrub(step.context, scenario.secrets);
  if (context !== undefined && !keep) context = maskPersonalData(context);
  const title = scrub(stripHiddenChars(String(await page.title().catch(() => ''))), scenario.secrets);
  const state = {
    page: { url: sanitizeUrl(page.url()), title: clip(keep ? title : maskPersonalData(title), 200), aria, truncated },
    ...(context === undefined ? {} : { context })
  };
  const question = { type, instructions: scrub(String(step.question), scenario.secrets) };
  if (step.criteria !== undefined) question.criteria = scrub(step.criteria, scenario.secrets);
  const spec = {
    version: 1,
    id: `walkthrough-${script.name}-${record.index}`,
    state,
    questions: { verdict: question },
    decision: judgeDecision(step, type, config)
  };
  const result = await jev.judge({ spec, config, projectDir: scenario.targetDir });
  if (result && result.status === 'invalid_spec') {
    throw new Error(`judge spec rejected: ${(result.errors || []).join('; ')}`);
  }
  if (!result || !result.ok) return skip((result && (result.reason || result.status)) || 'jev_failed');

  const passed = Boolean(result.decision && result.decision.passed);
  const rules = describeRules(result.decision && result.decision.evaluations);
  record.judge = {
    verdict: passed ? 'pass' : 'fail',
    type,
    question: clip(question.instructions, 300),
    model: result.model || config.model || null,
    rules,
    answer: result.answers && result.answers.verdict ? result.answers.verdict : null,
    cache: result.cache ? result.cache.status : null,
    usage: usageOf(result.usage),
    sent: { aria_chars: aria.length, truncated, personal_data: keep ? 'kept' : 'masked' }
  };
  record.detail = `Jev ${passed ? 'pass' : 'fail'}: ${rules}`;
  if (passed) {
    counts.pass += 1;
    return;
  }
  if (step.soft) {
    counts.concerns += 1;
    record.warning = 'judge_concern';
    record.detail = `Jev concern (soft): ${rules}`;
    return;
  }
  counts.fail += 1;
  throw new Error(`Jev judged against "${clip(question.instructions, 160)}": ${rules}`);
}

module.exports = {
  NAME_RE,
  RESERVED_VARS,
  MAX_JUDGE_PAGE_CHARS,
  createScenario,
  getPath,
  interpolate,
  isLoopbackUrl,
  secretEnvValue,
  resolveStep,
  hostSecrets,
  scrub,
  scrubRecord,
  maskPersonalData,
  validateVars,
  validateRequest,
  validateJudge,
  validateEach,
  refusedHost,
  runRequest,
  loadItems,
  runJudge
};
