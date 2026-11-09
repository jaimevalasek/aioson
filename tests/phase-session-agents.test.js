'use strict';

/**
 * The agent side of "one session per phase": the phase loop, the dev and qa
 * kernels, the autopilot doc and the autopilot text agent:prompt injects must
 * all send @dev through `phase:next` at the end of a phase and honor its
 * policy, and the text a new session receives (session:kickoff) must name the
 * entry each kernel really has. Template and tracked workspace copies alike.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { buildAgentPrompt, getAgentDefinition } = require('../src/agents');
const { buildKickoff } = require('../src/lib/session-kickoff');

const ROOT = path.join(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const bothCopies = (rel) => [`template/${rel}`, rel];

test('the phase loop ends every phase at phase:next and follows its directive per policy', () => {
  for (const file of bothCopies('.aioson/docs/dev/phase-loop.md')) {
    const doc = read(file);
    assert.match(doc, /aioson phase:next \. --feature=\{slug\} --finished=\{n\} --note="\{decisions not on disk\}" --json/, file);
    assert.match(doc, /`--note=none` when there are none/, file);
    assert.match(doc, /- `auto` — end the reply with one sentence: phase \{n\} is done and the Play opens the next one\. Then stop\./, file);
    assert.match(doc, /- `suggest` — continue in this conversation, and quote `kickoff` once/, file);
    assert.match(doc, /- `off` — continue in this conversation\./, file);
    assert.match(doc, /only then run step 5 for the last phase\. It returns `next_stage: qa`/, file);
    assert.doesNotMatch(doc, /Continue immediately/, `${file}: the old unconditional chaining is gone`);
    assert.match(doc, /aioson dev:resume-data \. --feature=\{slug\} --phase=\{n\} --capsule/, `${file}: the new-session entry stays the capsule`);
  }
});

test('the dev kernel routes phase ends to phase:next without growing', () => {
  for (const file of bothCopies('.aioson/agents/dev.md')) {
    const kernel = read(file);
    assert.match(kernel, /`\.aioson\/docs\/dev\/phase-loop\.md` — required for multi-phase plans; every phase ends at `phase:next`\./, file);
    assert.doesNotMatch(kernel, /continue clean checkpoints automatically/, file);
  }
});

test('the qa kernel has the entry its kickoff names, and the kickoff never hands QA the dev conversation', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aioson-qa-entry-'));
  try {
    const kickoff = buildKickoff({ targetDir: dir, agent: 'qa', feature: 'billing', tool: 'codex' });
    assert.match(kickoff, /start at your Deterministic preflight with --feature=billing; Dev's conversation does not carry over\./);
    for (const file of bothCopies('.aioson/agents/qa.md')) {
      const preflight = read(file).split(/^## /m).find((section) => section.startsWith('Deterministic preflight'));
      assert.ok(preflight, `${file}: the section the kickoff names exists`);
      assert.match(preflight, /New QA sessions start here \(`session:kickoff --agent=qa`\)\./, file);
      assert.match(preflight, /aioson preflight \. --agent=qa --feature=\{slug\}/, `${file}: the entry is bound to the kickoff's feature`);
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('the dev kickoff fills the capsule command the phase loop documents', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aioson-dev-entry-'));
  try {
    const kickoff = buildKickoff({ targetDir: dir, agent: 'dev', feature: 'billing', phase: '5', tool: 'claude' });
    const documented = 'aioson dev:resume-data . --feature={slug} --phase={n} --capsule'.replace('{slug}', 'billing').replace('{n}', '5');
    assert.ok(kickoff.includes(`\`${documented}\``), kickoff);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('autopilot stops at an auto phase:next instead of chaining every phase and QA in one conversation', () => {
  const dev = getAgentDefinition('dev');
  const prompt = buildAgentPrompt(dev, 'claude', { instructionPath: dev.path, interactionLanguage: 'en', autoHandoff: true });
  assert.match(prompt, /end every phase with `aioson phase:next`: its `directive` says whether the next phase, or QA after the last one, continues in this conversation or starts in a new one/);
  assert.match(prompt, /under `auto`, stop there and do not invoke the next agent yourself/);
  assert.doesNotMatch(prompt, /continue immediately through all remaining phases/);

  for (const file of bothCopies('.aioson/docs/autopilot-handoff.md')) {
    const doc = read(file);
    assert.match(doc, /every plan phase ends at `aioson phase:next`/, file);
    assert.match(doc, /Do not invoke the next agent yourself in that case/, file);
  }
});

test('phase_restart is documented next to auto_handoff with its three values and defaults', () => {
  const config = read('template/.aioson/config.md');
  const autoHandoff = config.indexOf('- `auto_handoff`');
  const phaseRestart = config.indexOf('- `phase_restart` (`auto` | `suggest` | `off`; absent means `auto` inside AIOSON Play, `suggest` elsewhere)');
  assert.ok(autoHandoff > 0 && phaseRestart > autoHandoff, 'phase_restart sits right after auto_handoff');
});
