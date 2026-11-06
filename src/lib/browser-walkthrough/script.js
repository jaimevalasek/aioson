'use strict';

/**
 * Walkthrough script contract: constants, validation/normalization, loading,
 * plus the small shared helpers (sanitization, clipping, polling) every other
 * part of the runner uses.
 */

const fs = require('node:fs/promises');
const crypto = require('node:crypto');

const SCHEMA = 1;
const DEFAULT_TIMEOUT_MS = 10000;
const DEFAULT_BOUNDARY_WAIT_MS = 3000;
const DEFAULT_SNAPSHOT_LINES = 80;
const MAX_SNAPSHOT_LINES = 400;
const MAX_CONSOLE_SAMPLES = 20;
const MAX_NETWORK_ROWS = 200;
const ID_RE = /\b(?:AC|PROM|CAP|REQ)-[A-Za-z0-9][\w.-]*/gi;
const SENSITIVE_TARGET_RE = /pass|senha|secret|token|pin\b|cvv|otp|mfa|credential|chave|api[-_ ]?key/i;
const LOGIN_WALL_RE = /(?:^|\/)(?:login|log-in|signin|sign-in|auth|sso|entrar)(?:\/|$|\?)/i;
const ACTIONS = new Set(['goto', 'reload', 'back', 'click', 'dblclick', 'hover', 'fill', 'type', 'press', 'select', 'check', 'uncheck', 'wait', 'expect', 'snapshot', 'screenshot', 'eval', 'request', 'judge', 'each', 'caption']);
const MAX_SLOW_MO_MS = 5000;
const MAX_HOLD_MS = 60000;

// ---------------------------------------------------------------------------
// Script
// ---------------------------------------------------------------------------

function idsOf(value) {
  const list = Array.isArray(value) ? value : [value];
  const out = [];
  for (const item of list) {
    for (const match of String(item || '').match(ID_RE) || []) {
      const id = match.toUpperCase().replace(/[.,;:]+$/, '');
      if (!out.includes(id)) out.push(id);
    }
  }
  return out;
}

/**
 * Validate a parsed script. Returns `{ ok, errors, script }` with defaults
 * applied; never throws.
 */
function normalizeSteps(steps, errors, nested, label) {
  // Lazy: the scenario module reads helpers from this one.
  const { validateRequest, validateJudge, validateEach } = require('./scenario');
  const normalized = [];
  (steps || []).forEach((step, index) => {
    const where = label(index);
    if (!step || typeof step !== 'object') {
      errors.push(`${where}: must be an object`);
      return;
    }
    const action = String(step.do || step.action || '').toLowerCase();
    if (!ACTIONS.has(action)) {
      errors.push(`${where}: unknown action "${action || '(missing)'}" (known: ${[...ACTIONS].join(', ')})`);
      return;
    }
    if (action === 'goto' && !step.url) errors.push(`${where}: goto needs \`url\``);
    if (['click', 'dblclick', 'hover', 'fill', 'type', 'select', 'check', 'uncheck'].includes(action) && !step.target) {
      errors.push(`${where}: ${action} needs \`target\``);
    }
    if (['fill', 'type', 'select'].includes(action) && step.value === undefined && step.value_env === undefined) errors.push(`${where}: ${action} needs \`value\``);
    if (step.value_env !== undefined) {
      if (!['fill', 'type'].includes(action)) errors.push(`${where}: \`value_env\` only works on fill and type`);
      if (step.value !== undefined) errors.push(`${where}: use \`value\` or \`value_env\`, never both`);
      if (typeof step.value_env !== 'string' || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(step.value_env)) errors.push(`${where}: \`value_env\` must name an environment variable`);
    }
    if (action === 'press' && !step.key) errors.push(`${where}: press needs \`key\``);
    if (action === 'eval' && !step.expression) errors.push(`${where}: eval needs \`expression\``);
    if (action === 'expect' && !expectKind(step)) errors.push(`${where}: expect needs one of visible|hidden|text|contains|value|url|title|count|min|enabled|disabled|checked`);
    if (action === 'wait' && !(step.ms || step.target || step.url || step.text || step.idle)) errors.push(`${where}: wait needs ms|target|url|text|idle`);
    if (step.optional !== undefined && typeof step.optional !== 'boolean') errors.push(`${where}: optional must be true or false`);
    if (step.optional === true && ['each', 'judge'].includes(action)) errors.push(`${where}: ${action} cannot be optional`);
    if (action === 'caption') {
      if (step.text !== undefined && typeof step.text !== 'string') errors.push(`${where}: caption \`text\` must be a string (empty clears the caption)`);
      if (step.ms !== undefined && !(Number(step.ms) >= 0 && Number(step.ms) <= MAX_HOLD_MS)) errors.push(`${where}: caption \`ms\` must be 0..${MAX_HOLD_MS}`);
      if (step.position !== undefined && !['top', 'bottom'].includes(step.position)) errors.push(`${where}: caption \`position\` must be top or bottom`);
    }
    if (action === 'request') errors.push(...validateRequest(step, where));
    if (action === 'judge') errors.push(...validateJudge(step, where));
    const ownIds = idsOf([step.ac, step.prom, step.ids, step.proves]);
    if (action === 'caption' && ownIds.length > 0) errors.push(`${where}: a caption is narration and proves nothing — move ${ownIds.join(', ')} to the step that checks it`);
    const entry = { ...step, do: action, ids: ownIds, index };
    if (action === 'each') {
      errors.push(...validateEach(step, where, nested));
      const children = Array.isArray(step.steps) && !nested
        ? normalizeSteps(step.steps, errors, true, (child) => `${where}.steps[${child}]`)
        : [];
      entry.steps = children;
      entry.own_ids = ownIds;
      // The loop's ids include its children's, so a loop the run never
      // reached marks every id it would have proved as not reached.
      entry.ids = [...new Set([...ownIds, ...children.flatMap((child) => child.ids)])];
    }
    normalized.push(entry);
  });
  return normalized;
}

function normalizeScript(raw) {
  const errors = [];
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, errors: ['script must be a JSON object with a `steps` array'], script: null };
  }
  const steps = Array.isArray(raw.steps) ? raw.steps : null;
  if (!steps || steps.length === 0) errors.push('`steps` must be a non-empty array');
  errors.push(...require('./scenario').validateVars(raw.vars));
  const normalized = normalizeSteps(steps, errors, false, (index) => `step ${index}`);
  const script = {
    // Leading dots are stripped with the dashes: the name becomes the artifact
    // folder that the run clears, and `..` or `.` would name the report dir's
    // parent (`.aioson/context/` without a slug) or the report dir itself.
    name: String(raw.name || 'walkthrough').replace(/[^\w.-]+/g, '-').replace(/^[-.]+|[-.]+$/g, '') || 'walkthrough',
    feature: raw.feature ? String(raw.feature) : '',
    scope: raw.scope === 'prototype' ? 'prototype' : 'delivery',
    url: raw.url ? String(raw.url) : '',
    file: raw.file ? String(raw.file) : '',
    viewport: raw.viewport && Number(raw.viewport.width) > 0 && Number(raw.viewport.height) > 0
      ? { width: Number(raw.viewport.width), height: Number(raw.viewport.height) }
      : { width: 1280, height: 720 },
    timeout: Number(raw.timeout) > 0 ? Number(raw.timeout) : DEFAULT_TIMEOUT_MS,
    boundary_wait: Number(raw.boundary_wait) > 0 ? Number(raw.boundary_wait) : DEFAULT_BOUNDARY_WAIT_MS,
    continue: Boolean(raw.continue),
    snapshot_lines: clampLines(raw.snapshot_lines),
    // Pause between browser actions, for a person watching a headed run.
    slow_mo: clampSlowMo(raw.slow_mo),
    vars: raw.vars && typeof raw.vars === 'object' && !Array.isArray(raw.vars) ? { ...raw.vars } : {},
    steps: normalized
  };
  return { ok: errors.length === 0, errors, script };
}

function clampLines(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_SNAPSHOT_LINES;
  return Math.min(Math.floor(n), MAX_SNAPSHOT_LINES);
}

function clampSlowMo(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.min(Math.floor(n), MAX_SLOW_MO_MS);
}

function expectKind(step) {
  for (const key of ['visible', 'hidden', 'text', 'contains', 'value', 'url', 'title', 'count', 'min', 'enabled', 'disabled', 'checked']) {
    if (step[key] !== undefined) return key;
  }
  return '';
}

// Actions that change what the page shows, and the steps that replace the view.
const STATE_ACTIONS = new Set(['click', 'dblclick', 'fill', 'type', 'press', 'select', 'check', 'uncheck']);
const VIEW_REPLACING = new Set(['reload', 'goto']);

// A step that fails when the screen does not show the result. A `boundary`
// proves the request, never the screen, and a `judge` proves nothing.
function checksTheView(step) {
  if (step.do === 'expect') return true;
  if (step.do === 'eval') return step.equals !== undefined || step.contains !== undefined;
  if (step.do === 'wait') return Boolean(step.target || step.text);
  return false;
}

/**
 * `reload_masks_stale_view`: an action reaching a `reload` or `goto` with no
 * check between them. Rebuilding the page from the server hides a view that
 * stayed stale after the action, so such a walkthrough passes over the defect
 * it was written to catch. Advisory: the script may mean it (a login prelude),
 * and only a reader can tell. `optional` steps may never run, so they neither
 * arm nor clear it.
 */
function lintScript(script) {
  const warnings = [];
  let pending = null;
  const walk = (steps, label) => {
    for (const step of steps || []) {
      const where = label(step.index);
      if (step.do === 'each') {
        walk(step.steps, (child) => `${where}.${child}`);
        continue;
      }
      if (step.optional === true) continue;
      if (checksTheView(step)) pending = null;
      else if (VIEW_REPLACING.has(step.do)) {
        if (pending) warnings.push(`step ${where}: reload_masks_stale_view — \`${pending.action}\` at step ${pending.where} reaches this \`${step.do}\` with no \`expect\` between them, and rebuilding the page hides a view that stayed stale; \`expect\` the result on screen first, then ${step.do} and \`expect\` that it persisted`);
        pending = null;
      } else if (STATE_ACTIONS.has(step.do)) pending = { action: step.do, where };
    }
  };
  walk(script && script.steps, (index) => String(index));
  return warnings;
}

async function loadScript(scriptPath) {
  let raw;
  try {
    raw = await fs.readFile(scriptPath, 'utf8');
  } catch (error) {
    return { ok: false, errors: [`cannot read script: ${error.message}`], script: null, raw: '' };
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    return { ok: false, errors: [`script is not valid JSON: ${error.message}`], script: null, raw };
  }
  return { ...normalizeScript(parsed), raw };
}

// ---------------------------------------------------------------------------
// Sanitization — what the report may carry
// ---------------------------------------------------------------------------

function sanitizeUrl(value) {
  const text = String(value || '');
  try {
    const u = new URL(text);
    u.username = '';
    u.password = '';
    u.search = '';
    u.hash = '';
    return u.toString();
  } catch {
    return text.replace(/[?#].*$/, '');
  }
}

function maskedValue(step) {
  if (step.mask === true || step.value_env !== undefined) return true;
  return SENSITIVE_TARGET_RE.test(String(step.target || '')) || SENSITIVE_TARGET_RE.test(String(step.note || ''));
}

function clip(text, max = 400) {
  const s = String(text === undefined ? '' : text);
  return s.length > max ? `${s.slice(0, max)}…` : s;
}

function sha256(text) {
  return crypto.createHash('sha256').update(String(text)).digest('hex');
}

// ---------------------------------------------------------------------------
// Polling assertions (no @playwright/test dependency)
// ---------------------------------------------------------------------------

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function until(check, timeoutMs, { interval = 100, now = Date.now, wait = sleep } = {}) {
  const started = now();
  let last = { ok: false, detail: '' };
  for (;;) {
    try {
      last = await check();
      if (last && last.ok) return last;
    } catch (error) {
      last = { ok: false, detail: String(error && error.message || error) };
    }
    if (now() - started >= timeoutMs) return last || { ok: false, detail: 'timeout' };
    await wait(interval);
  }
}

module.exports = {
  SCHEMA,
  ACTIONS,
  DEFAULT_TIMEOUT_MS,
  DEFAULT_BOUNDARY_WAIT_MS,
  DEFAULT_SNAPSHOT_LINES,
  MAX_SNAPSHOT_LINES,
  MAX_CONSOLE_SAMPLES,
  MAX_NETWORK_ROWS,
  MAX_HOLD_MS,
  LOGIN_WALL_RE,
  idsOf,
  normalizeScript,
  clampLines,
  clampSlowMo,
  expectKind,
  lintScript,
  loadScript,
  sanitizeUrl,
  maskedValue,
  clip,
  sha256,
  sleep,
  until
};
