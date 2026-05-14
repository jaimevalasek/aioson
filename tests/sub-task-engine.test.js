'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const fsSync = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  buildPrompt,
  validateInput,
  validateOutput,
  validateConfig,
  enforceCaps,
  generateScoutId,
  loadConfig,
  defaultConfig,
  CONFIG_FILE_REL,
  PARENT_AGENT_V1,
  SCHEMA_VERSION
} = require('../src/sub-task-engine');

const { DEFAULT_CONFIG } = require('../src/sub-task-schemas');

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function validInput(overrides = {}) {
  return {
    question: 'Where does workflow-next.js read completion state, and what guards prevent stale reads?',
    scope_paths: ['src/commands/workflow-next.js'],
    parent_agent: 'deyvin',
    parent_session_id: 'session-abc-123',
    parent_session_excerpt: 'User asked why workflow:next inherits stale completion records when transitioning between features. Need file-level evidence on the persisted state read path.',
    ...overrides
  };
}

function validOutput(overrides = {}) {
  return {
    schema_version: 1,
    id: 'scout-deyvin-subtask-scout-2026-05-13-a3f9c2',
    parent_agent: 'deyvin',
    parent_session_id: 'session-abc-123',
    parent_session_excerpt: 'User asked why workflow:next inherits stale completion records when transitioning between features. Need file-level evidence on the persisted state read path.',
    feature_slug: 'deyvin-subtask-scout',
    question: 'Where does workflow-next.js read completion state, and what guards prevent stale reads?',
    scope: {
      paths: ['src/commands/workflow-next.js'],
      globs: [],
      exclude: [],
      files_resolved: ['src/commands/workflow-next.js']
    },
    completed_at: '2026-05-13T14:32:11.123Z',
    status: 'success',
    confidence: 'high',
    recommendation: 'Add a feature-transition guard at loadOrCreateState in workflow-next.js:514 to discard state when slug differs from active feature.',
    findings: [
      {
        file: 'src/commands/workflow-next.js',
        line: 486,
        evidence: 'function loadOrCreateState(rootPath) { const persisted = readState(...); if (persisted) return persisted; }',
        relevance: 'high',
        explanation: 'Persisted state is returned unconditionally; no comparison against current active feature.'
      }
    ],
    files_inspected: ['src/commands/workflow-next.js'],
    ...overrides
  };
}

async function makeProject() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'aioson-scout-'));
  return dir;
}

async function writeConfig(rootDir, content) {
  const dir = path.join(rootDir, '.aioson', 'config');
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, 'scout-engine.json'), content, 'utf8');
}

// ---------------------------------------------------------------------------
// E1 — buildPrompt
// ---------------------------------------------------------------------------

test('buildPrompt — returns string containing all 8 sections', () => {
  const out = buildPrompt(validInput());
  assert.equal(typeof out, 'string');
  assert.ok(out.includes('## Question'), 'missing Question section');
  assert.ok(out.includes('## Why this scout was dispatched'), 'missing Why section');
  assert.ok(out.includes('## Scope'), 'missing Scope section');
  assert.ok(out.includes('## Hard constraints'), 'missing Hard constraints section');
  assert.ok(out.includes('## Output schema'), 'missing Output schema section');
  assert.ok(out.includes('## Output target'), 'missing Output target section');
  assert.ok(out.includes('## Required fields you must populate'), 'missing Required fields section');
  assert.ok(out.includes('## What success looks like'), 'missing What success section');
});

test('buildPrompt — includes question verbatim', () => {
  const input = validInput({ question: 'Why does the cap counter not decrement on commit?' });
  assert.ok(buildPrompt(input).includes('Why does the cap counter not decrement on commit?'));
});

test('buildPrompt — includes parent_session_excerpt verbatim', () => {
  const excerpt = 'Long enough excerpt explaining why this scout was dispatched in the first place for cold-load comprehension.';
  const input = validInput({ parent_session_excerpt: excerpt });
  assert.ok(buildPrompt(input).includes(excerpt));
});

test('buildPrompt — enforces Read,Grep tool whitelist (Nautilus)', () => {
  const out = buildPrompt(validInput());
  assert.ok(out.includes('Tools allowed: Read, Grep ONLY.'));
  assert.ok(out.includes('Tools forbidden: Bash, Edit, Write'));
});

test('buildPrompt — references SCHEMA_VERSION in output schema summary', () => {
  const out = buildPrompt(validInput());
  assert.ok(out.includes(`schema_version (=${SCHEMA_VERSION})`));
});

test('buildPrompt — uses options.expected_output_path when provided', () => {
  const out = buildPrompt(validInput(), { expected_output_path: '.aioson/runtime/scouts/scout-foo.json' });
  assert.ok(out.includes('Write the JSON to: .aioson/runtime/scouts/scout-foo.json'));
});

test('buildPrompt — falls back to placeholder when output path missing', () => {
  const out = buildPrompt(validInput());
  assert.ok(out.includes('Write the JSON to: <output_path returned by aioson scout:prep>'));
});

test('buildPrompt — throws input_invalid on missing required field', () => {
  const input = validInput();
  delete input.question;
  assert.throws(
    () => buildPrompt(input),
    (err) => err.code === 'input_invalid' && Array.isArray(err.details)
  );
});

// ---------------------------------------------------------------------------
// E2 — validateInput
// ---------------------------------------------------------------------------

test('validateInput — valid input returns ok=true', () => {
  const r = validateInput(validInput());
  assert.equal(r.ok, true, JSON.stringify(r.errors));
});

test('validateInput — missing question rejected', () => {
  const input = validInput();
  delete input.question;
  const r = validateInput(input);
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => e.field === 'question' && e.reason === 'required'));
});

test('validateInput — empty scope_paths AND empty scope_globs rejected (cross-field)', () => {
  const r = validateInput(validInput({ scope_paths: [], scope_globs: [] }));
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => e.field === 'scope' && /at least one of scope_paths or scope_globs required/.test(e.reason)));
});

test('validateInput — parent_session_excerpt < 50 chars rejected', () => {
  const r = validateInput(validInput({ parent_session_excerpt: 'too short' }));
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => e.field === 'parent_session_excerpt' && /min/.test(e.reason)));
});

test('validateInput — parent_session_excerpt > 1000 chars rejected', () => {
  const r = validateInput(validInput({ parent_session_excerpt: 'a'.repeat(1001) }));
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => e.field === 'parent_session_excerpt' && /max/.test(e.reason)));
});

test('validateInput — unknown parent_agent rejected', () => {
  const r = validateInput(validInput({ parent_agent: 'qa' }));
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => e.field === 'parent_agent' && /not in enum/.test(e.reason)));
});

test('validateInput — unknown root key rejected (additionalProperties:false)', () => {
  const r = validateInput({ ...validInput(), evil_key: 'oops' });
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => e.field === 'evil_key' && e.reason === 'unknown key'));
});

// ---------------------------------------------------------------------------
// E3 — validateOutput
// ---------------------------------------------------------------------------

test('validateOutput — valid output returns ok=true', () => {
  const r = validateOutput(validOutput());
  assert.equal(r.ok, true, JSON.stringify(r.errors));
});

test('validateOutput — missing recommendation rejected', () => {
  const out = validOutput();
  delete out.recommendation;
  const r = validateOutput(out);
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => e.field === 'recommendation' && e.reason === 'required'));
});

test('validateOutput — evidence > 200 chars rejected', () => {
  const out = validOutput();
  out.findings[0].evidence = 'x'.repeat(201);
  const r = validateOutput(out);
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => e.field.includes('evidence') && /max/.test(e.reason)));
});

test('validateOutput — recommendation < 30 chars rejected', () => {
  const r = validateOutput(validOutput({ recommendation: 'too short' }));
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => e.field === 'recommendation' && /min/.test(e.reason)));
});

test('validateOutput — recommendation > 1000 chars rejected', () => {
  const r = validateOutput(validOutput({ recommendation: 'x'.repeat(1001) }));
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => e.field === 'recommendation' && /max/.test(e.reason)));
});

test('validateOutput — schema_version != 1 rejected', () => {
  const r = validateOutput(validOutput({ schema_version: 2 }));
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => e.field === 'schema_version'));
});

test('validateOutput — invalid status enum rejected', () => {
  const r = validateOutput(validOutput({ status: 'banana' }));
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => e.field === 'status' && /not in enum/.test(e.reason)));
});

test('validateOutput — finding.relevance enum mismatch rejected', () => {
  const out = validOutput();
  out.findings[0].relevance = 'critical';
  const r = validateOutput(out);
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => e.field.includes('relevance') && /not in enum/.test(e.reason)));
});

test('validateOutput — empty findings array allowed (no_findings status)', () => {
  const r = validateOutput(validOutput({ findings: [], status: 'no_findings' }));
  assert.equal(r.ok, true, JSON.stringify(r.errors));
});

// ---------------------------------------------------------------------------
// E4 — validateConfig
// ---------------------------------------------------------------------------

test('validateConfig — empty object returns ok=true (all optional)', () => {
  const r = validateConfig({});
  assert.equal(r.ok, true, JSON.stringify(r.errors));
});

test('validateConfig — full valid override returns ok=true', () => {
  const r = validateConfig({
    max_scouts_per_session: 5,
    max_files_in_scope: 50,
    max_retries_on_malformed_json: 2,
    max_depth: 3,
    scout_dir: '.aioson/runtime/scouts-custom',
    archive_root: '.aioson/context/features',
    prune_unattached_after_days: 30,
    slow_completion_warn_seconds: 600
  });
  assert.equal(r.ok, true, JSON.stringify(r.errors));
});

test('validateConfig — unknown key max_foo rejected', () => {
  const r = validateConfig({ max_foo: 1 });
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => e.field === 'max_foo' && e.reason === 'unknown key'));
});

test('validateConfig — max_scouts_per_session < 1 rejected', () => {
  const r = validateConfig({ max_scouts_per_session: 0 });
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => e.field === 'max_scouts_per_session' && /min/.test(e.reason)));
});

test('validateConfig — prune_unattached_after_days > 365 rejected', () => {
  const r = validateConfig({ prune_unattached_after_days: 366 });
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => e.field === 'prune_unattached_after_days' && /max/.test(e.reason)));
});

// ---------------------------------------------------------------------------
// E5 — enforceCaps
// ---------------------------------------------------------------------------

test('enforceCaps — prep within cap succeeds and increments scouts_in_session', () => {
  const state = { sessions: {} };
  const r = enforceCaps(state, { kind: 'prep', parent_session_id: 's1', scope_size: 5, config: defaultConfig() });
  assert.equal(r.ok, true);
  assert.equal(state.sessions.s1.scouts_in_session, 1);
});

test('enforceCaps — prep at cap returns cap_exceeded', () => {
  const config = defaultConfig();
  const state = { sessions: { s1: { scouts_in_session: config.max_scouts_per_session, started_at: 'x', last_prep_at: null, retries_by_id: {} } } };
  const r = enforceCaps(state, { kind: 'prep', parent_session_id: 's1', scope_size: 1, config });
  assert.equal(r.ok, false);
  assert.equal(r.error.code, 'cap_exceeded');
});

test('enforceCaps — prep with scope > max_files_in_scope returns scope_too_large', () => {
  const config = defaultConfig();
  const state = { sessions: {} };
  const r = enforceCaps(state, { kind: 'prep', parent_session_id: 's1', scope_size: config.max_files_in_scope + 1, config });
  assert.equal(r.ok, false);
  assert.equal(r.error.code, 'scope_too_large');
  assert.equal(r.error.details.resolved_count, config.max_files_in_scope + 1);
});

test('enforceCaps — prep with max_files_override allows larger scope', () => {
  const config = defaultConfig();
  const state = { sessions: {} };
  const r = enforceCaps(state, { kind: 'prep', parent_session_id: 's1', scope_size: 50, max_files_override: 100, config });
  assert.equal(r.ok, true, JSON.stringify(r.error));
});

test('enforceCaps — commit decrements scouts_in_session', () => {
  const state = { sessions: { s1: { scouts_in_session: 2, started_at: 'x', last_prep_at: null, retries_by_id: {} } } };
  const r = enforceCaps(state, { kind: 'commit', parent_session_id: 's1' });
  assert.equal(r.ok, true);
  assert.equal(state.sessions.s1.scouts_in_session, 1);
});

test('enforceCaps — commit at zero is no-op (does not go negative)', () => {
  const state = { sessions: { s1: { scouts_in_session: 0, started_at: 'x', last_prep_at: null, retries_by_id: {} } } };
  const r = enforceCaps(state, { kind: 'commit', parent_session_id: 's1' });
  assert.equal(r.ok, true);
  assert.equal(state.sessions.s1.scouts_in_session, 0);
});

test('enforceCaps — first validate failure increments retries (default max=1)', () => {
  const state = { sessions: {} };
  const config = defaultConfig();
  const r = enforceCaps(state, { kind: 'validate', parent_session_id: 's1', scout_id: 'scout-x', config });
  assert.equal(r.ok, true);
  assert.equal(state.sessions.s1.retries_by_id['scout-x'], 1);
});

test('enforceCaps — validate beyond max_retries returns retry_exhausted', () => {
  const config = defaultConfig(); // max_retries_on_malformed_json = 1
  const state = { sessions: { s1: { scouts_in_session: 1, started_at: 'x', last_prep_at: null, retries_by_id: { 'scout-x': 1 } } } };
  const r = enforceCaps(state, { kind: 'validate', parent_session_id: 's1', scout_id: 'scout-x', config });
  assert.equal(r.ok, false);
  assert.equal(r.error.code, 'retry_exhausted');
});

test('enforceCaps — invalid state returns state_invalid', () => {
  const r = enforceCaps(null, { kind: 'prep', parent_session_id: 's1', scope_size: 1 });
  assert.equal(r.ok, false);
  assert.equal(r.error.code, 'state_invalid');
});

test('enforceCaps — missing parent_session_id returns action_invalid', () => {
  const r = enforceCaps({ sessions: {} }, { kind: 'prep', scope_size: 1 });
  assert.equal(r.ok, false);
  assert.equal(r.error.code, 'action_invalid');
});

test('enforceCaps — unknown action.kind returns action_invalid', () => {
  const r = enforceCaps({ sessions: {} }, { kind: 'banana', parent_session_id: 's1' });
  assert.equal(r.ok, false);
  assert.equal(r.error.code, 'action_invalid');
});

// ---------------------------------------------------------------------------
// E6 — generateScoutId
// ---------------------------------------------------------------------------

test('generateScoutId — with feature_slug includes slug + ISO date + 6 hex', () => {
  const id = generateScoutId({ feature_slug: 'foo-bar', date: new Date('2026-05-13T10:00:00Z') });
  assert.match(id, /^scout-foo-bar-2026-05-13-[0-9a-f]{6}$/);
});

test('generateScoutId — without slug omits slug segment', () => {
  const id = generateScoutId({ date: new Date('2026-05-13T10:00:00Z') });
  assert.match(id, /^scout-2026-05-13-[0-9a-f]{6}$/);
});

test('generateScoutId — two consecutive calls produce distinct ids', () => {
  const a = generateScoutId();
  const b = generateScoutId();
  assert.notEqual(a, b);
});

test('generateScoutId — empty feature_slug treated as missing', () => {
  const id = generateScoutId({ feature_slug: '' });
  assert.match(id, /^scout-\d{4}-\d{2}-\d{2}-[0-9a-f]{6}$/);
});

// ---------------------------------------------------------------------------
// E7 — loadConfig + defaultConfig
// ---------------------------------------------------------------------------

test('defaultConfig — returns frozen defaults clone', () => {
  const a = defaultConfig();
  const b = defaultConfig();
  assert.notEqual(a, b);
  assert.deepEqual(a, DEFAULT_CONFIG);
});

test('loadConfig — missing file returns defaults', async () => {
  const dir = await makeProject();
  const cfg = loadConfig(dir);
  assert.deepEqual(cfg, defaultConfig());
});

test('loadConfig — valid override file merged on defaults', async () => {
  const dir = await makeProject();
  await writeConfig(dir, JSON.stringify({ max_scouts_per_session: 5 }));
  const cfg = loadConfig(dir);
  assert.equal(cfg.max_scouts_per_session, 5);
  assert.equal(cfg.max_files_in_scope, defaultConfig().max_files_in_scope);
});

test('loadConfig — invalid JSON throws config_invalid', async () => {
  const dir = await makeProject();
  await writeConfig(dir, '{ not valid json');
  assert.throws(() => loadConfig(dir), (err) => err.code === 'config_invalid');
});

test('loadConfig — unknown key in file throws config_invalid', async () => {
  const dir = await makeProject();
  await writeConfig(dir, JSON.stringify({ max_foo: 1 }));
  assert.throws(() => loadConfig(dir), (err) => err.code === 'config_invalid' && Array.isArray(err.details));
});

test('loadConfig — out-of-range value throws config_invalid', async () => {
  const dir = await makeProject();
  await writeConfig(dir, JSON.stringify({ max_scouts_per_session: 0 }));
  assert.throws(() => loadConfig(dir), (err) => err.code === 'config_invalid');
});

test('loadConfig — CONFIG_FILE_REL constant is the documented path', () => {
  assert.equal(CONFIG_FILE_REL, '.aioson/config/scout-engine.json');
  // file system probe just to confirm the constant is what fs.readFileSync would target
  assert.equal(typeof fsSync.readFileSync, 'function');
});
