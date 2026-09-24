'use strict';

// Roster-wide enforcement of the agent structural contract
// (template/.aioson/rules/agent-structural-contract.md). These checks are
// intentionally narrow — they lock in the parts the contract states
// unambiguously and that every agent currently satisfies, so a future edit that
// drops a `|| true` suffix or a required dossier flag fails CI instead of
// silently shipping.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const AGENTS_DIR = path.resolve(__dirname, '..', 'template', '.aioson', 'agents');

function agentFiles() {
  return fs.readdirSync(AGENTS_DIR).filter((name) => name.endsWith('.md'));
}

// Join backslash-continued shell lines into a single logical command line so a
// multi-line `aioson ... \` invocation is evaluated as one command.
function logicalLines(content) {
  const out = [];
  let buffer = null;
  for (const raw of content.split(/\r?\n/)) {
    const line = buffer === null ? raw : `${buffer} ${raw.trim()}`;
    if (/\\\s*$/.test(line)) {
      buffer = line.replace(/\\\s*$/, '').trimEnd();
    } else {
      out.push(line);
      buffer = null;
    }
  }
  if (buffer !== null) out.push(buffer);
  return out;
}

// Only standalone command lines (the trimmed line begins with `aioson <cmd>`).
// Inline references inside prose (e.g. "record `dossier:add-finding ...`") are
// illustrative, not runnable invocations, and are deliberately not matched.
function commandLines(content, command) {
  return logicalLines(content)
    .map((line) => line.trim())
    .filter((line) => line.startsWith(`aioson ${command}`));
}

// §5 — best-effort telemetry/discovery/dossier commands must end with
// `|| true` so a missing or failing CLI never breaks the session. `dossier:`
// matches every dossier subcommand (add-finding, add-codemap, link-rule,
// add-research, ...).
test('structural contract §5: best-effort agent:done/pulse:update/runtime:emit/context:search/context:brief/dossier commands end with `|| true`', () => {
  const BEST_EFFORT = ['agent:done', 'pulse:update', 'runtime:emit', 'context:search', 'context:brief', 'dossier:'];
  const violations = [];

  for (const file of agentFiles()) {
    const content = fs.readFileSync(path.join(AGENTS_DIR, file), 'utf8');
    for (const command of BEST_EFFORT) {
      for (const line of commandLines(content, command)) {
        if (!/\|\|\s*true\b/.test(line)) {
          violations.push(`${file}: ${line.slice(0, 90)}`);
        }
      }
    }
  }

  assert.deepEqual(violations, [], `best-effort commands missing \`|| true\`:\n${violations.join('\n')}`);
});

// §6 — dossier:add-finding requires --slug and --agent (the registry rejects the
// call without them, so an agent omitting them would no-op at runtime).
test('structural contract §6: dossier:add-finding commands carry --slug and --agent', () => {
  const violations = [];

  for (const file of agentFiles()) {
    const content = fs.readFileSync(path.join(AGENTS_DIR, file), 'utf8');
    for (const line of commandLines(content, 'dossier:add-finding')) {
      if (!line.includes('--slug') || !line.includes('--agent')) {
        violations.push(`${file}: ${line.slice(0, 110)}`);
      }
    }
  }

  assert.deepEqual(violations, [], `dossier:add-finding missing --slug/--agent:\n${violations.join('\n')}`);
});

// §2 — every agent registers session completion via `agent:done`. neo is a pure
// router that produces no artifacts — the documented exception (the pair alias
// was retired with deyvin into dev).
test('structural contract §2: every agent emits agent:done (except router)', () => {
  const EXEMPT = new Set(['neo.md']);
  const missing = [];

  for (const file of agentFiles()) {
    if (EXEMPT.has(file)) continue;
    const content = fs.readFileSync(path.join(AGENTS_DIR, file), 'utf8');
    if (!/aioson agent:done/.test(content)) {
      missing.push(file);
    }
  }

  assert.deepEqual(missing, [], `agents missing agent:done observability:\n${missing.join('\n')}`);
});

// §2 — every agent declares what it reads before acting via a `## Required input`
// heading (no alias exemption: pair was retired with deyvin into dev).
test('structural contract §2: every agent declares ## Required input', () => {
  const EXEMPT = new Set();
  const missing = [];

  for (const file of agentFiles()) {
    if (EXEMPT.has(file)) continue;
    const content = fs.readFileSync(path.join(AGENTS_DIR, file), 'utf8');
    if (!/^## Required input\s*$/m.test(content)) {
      missing.push(file);
    }
  }

  assert.deepEqual(missing, [], `agents missing ## Required input:\n${missing.join('\n')}`);
});

test('structural contract §2: every agent declares ## Hard constraints', () => {
  const EXEMPT = new Set();
  const missing = [];

  for (const file of agentFiles()) {
    if (EXEMPT.has(file)) continue;
    const content = fs.readFileSync(path.join(AGENTS_DIR, file), 'utf8');
    if (!/^## Hard constraints\s*$/m.test(content)) {
      missing.push(file);
    }
  }

  assert.deepEqual(missing, [], `agents missing ## Hard constraints:\n${missing.join('\n')}`);
});

// §1 — every agent declares the language boundary in its activation header,
// before substantive mission instructions begin.
test('structural contract §1: every agent declares the language boundary before Mission', () => {
  const violations = [];

  for (const file of agentFiles()) {
    const content = fs.readFileSync(path.join(AGENTS_DIR, file), 'utf8');
    const boundary = content.search(/language boundary/i);
    const mission = content.search(/^## Mission\s*$/mi);
    if (boundary === -1 || (mission !== -1 && boundary > mission)) {
      violations.push(file);
    }
  }

  assert.deepEqual(violations, [], `agents with a late/missing language boundary:\n${violations.join('\n')}`);
});

test('structural contract §3: canonical core agents emit pulse and at least two milestones', () => {
  const CORE = ['product.md', 'sheldon.md', 'planner.md', 'dev.md', 'qa.md'];
  const violations = [];

  for (const file of CORE) {
    const content = fs.readFileSync(path.join(AGENTS_DIR, file), 'utf8');
    const milestones = (content.match(/aioson runtime:emit/g) || []).length;
    if (!/aioson pulse:update/.test(content) || milestones < 2) {
      violations.push(`${file}: pulse=${/aioson pulse:update/.test(content)}, milestones=${milestones}`);
    }
  }

  assert.deepEqual(violations, [], `core observability violations:\n${violations.join('\n')}`);
});

// §3 — at session end, agent:done is ALWAYS last. gate:approve / op:capture /
// pulse:update must never appear after the final agent:done call.
test('structural contract §3: agent:done is the last observability command', () => {
  const EARLIER = ['gate:approve', 'op:capture', 'pulse:update'];
  const violations = [];

  for (const file of agentFiles()) {
    const lines = fs.readFileSync(path.join(AGENTS_DIR, file), 'utf8').split(/\r?\n/);
    const lastLineOf = (cmd) => {
      let n = -1;
      lines.forEach((line, i) => { if (line.includes(`aioson ${cmd}`)) n = i; });
      return n;
    };
    const done = lastLineOf('agent:done');
    if (done === -1) continue; // agents without agent:done are covered by §2
    for (const cmd of EARLIER) {
      const idx = lastLineOf(cmd);
      if (idx > done) {
        violations.push(`${file}: ${cmd} (line ${idx + 1}) appears after agent:done (line ${done + 1})`);
      }
    }
  }

  assert.deepEqual(violations, [], `observability order violations:\n${violations.join('\n')}`);
});

// §4 — workflow agents that own a handoff (contract §2 handoff list) must
// recommend `/compact` before the next same-feature agent activation.
test('structural contract §4: handoff agents recommend /compact', () => {
  // analyst was retired into product, architect/pm into planner.
  const HANDOFF = ['briefing.md', 'product.md', 'sheldon.md', 'planner.md', 'orchestrator.md'];
  const missing = [];

  for (const file of HANDOFF) {
    const content = fs.readFileSync(path.join(AGENTS_DIR, file), 'utf8');
    if (!content.includes('/compact')) {
      missing.push(file);
    }
  }

  assert.deepEqual(missing, [], `handoff agents missing /compact recommendation:\n${missing.join('\n')}`);
});
