'use strict';

/**
 * Size budgets for EVERY agent kernel and EVERY skill router — the same
 * discipline the essay calls "< 70 lines per skill", in the house unit (chars
 * at session start). Until now only the canonical chain carried pins
 * (product/sheldon/planner/dev/qa 14592, deyvin 16384, briefing 12000,
 * pentester 8000…); site-forge, squad, committer, validator and the rest grew
 * unwatched, and `skill:audit` defined ROUTER_HARD_CHARS = 8000 that nothing
 * ran. A budget that only exists as a constant is advice.
 *
 * Ceilings: the existing pins where they exist; `skill:audit`'s hard limits
 * for skills and their references; for kernels without a pin, the class
 * target from `agent:audit` (focused 8000, orchestrator 12000, generalist
 * 15000) — or, where a kernel already exceeds it, a RATCHET at its current
 * size rounded up to the next 256: it may not grow, and every cut lowers the
 * ceiling. `interface-design/SKILL.md` carries the one recorded skill debt
 * (9058 > 8000) the same way. Moving content to a routed doc or reference is
 * the way through a budget — never a bigger number.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { ROUTER_HARD_CHARS, REFERENCE_HARD_CHARS } = require('../src/commands/skill-audit');

const ROOT = path.resolve(__dirname, '..');
const AGENTS_DIR = path.join(ROOT, 'template', '.aioson', 'agents');
const SKILLS_DIR = path.join(ROOT, 'template', '.aioson', 'skills');

// Kernel ceilings in chars. Pinned elsewhere → the same number; unpinned and
// within the class target → the target; unpinned and over it → ratchet.
const KERNEL_CEILINGS = {
  // canonical chain (tests/agent-contracts.test.js)
  'product.md': 14592,
  'sheldon.md': 14592,
  'planner.md': 14592,
  'dev.md': 14592,
  'qa.md': 14592,
  // pinned in their own kernel tests
  'deyvin.md': 16384,
  'benchmark.md': 14000,
  'briefing.md': 12000,
  'refiner.md': 12000,
  'neo.md': 12000,
  'genome.md': 12000,
  'copywriter.md': 12000,
  'pentester.md': 8000,
  'profiler-enricher.md': 8000,
  'profiler-forge.md': 8000,
  // generalists (agent:audit target 15000) — site-forge ratcheted
  'site-forge.md': 15872,
  'setup.md': 15000,
  'ux-ui.md': 15000,
  'architect.md': 15000,
  // orchestrators (target 12000) — squad ratcheted
  'squad.md': 10752,
  'orchestrator.md': 12000,
  // focused (target 8000) — ratcheted where already over
  'committer.md': 12288,
  'validator.md': 11520,
  'design-hybrid-forge.md': 11520,
  'profiler-researcher.md': 9984,
  'discover.md': 9472,
  'tester.md': 9472
};
const DEFAULT_KERNEL_CEILING = 8000;

const SKILL_RATCHETS = {
  'design/interface-design/SKILL.md': 8960 // recorded debt: 8813 chars; may only shrink
};

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (entry.name.endsWith('.md')) out.push(full);
  }
  return out;
}

function size(file) {
  return fs.readFileSync(file, 'utf8').length;
}

test('every agent kernel stays under its ceiling — pinned, class target, or ratchet', () => {
  const kernels = fs.readdirSync(AGENTS_DIR).filter((name) => name.endsWith('.md'));
  assert.ok(kernels.length >= 30, `expected the kernel set, found ${kernels.length}`);
  const over = [];
  for (const name of kernels) {
    const ceiling = KERNEL_CEILINGS[name] || DEFAULT_KERNEL_CEILING;
    const chars = size(path.join(AGENTS_DIR, name));
    if (chars > ceiling) over.push(`${name}: ${chars} > ${ceiling}`);
  }
  assert.deepEqual(over, [], `kernels over budget — route content to a doc instead of raising the number:\n${over.join('\n')}`);
});

test('a ratcheted kernel ceiling is never looser than one rounding step above the current size', () => {
  // The ratchet exists to stop growth, so a ceiling that drifted far above
  // the file is a ceiling nobody is watching. 256 chars of slack, no more.
  for (const name of ['site-forge.md', 'squad.md', 'committer.md', 'validator.md', 'design-hybrid-forge.md', 'profiler-researcher.md', 'discover.md', 'tester.md']) {
    const chars = size(path.join(AGENTS_DIR, name));
    const ceiling = KERNEL_CEILINGS[name];
    assert.ok(ceiling - chars <= 256, `${name}: ceiling ${ceiling} sits ${ceiling - chars} chars above the file — lower it to ${Math.ceil(chars / 256) * 256}`);
  }
});

test('every skill router stays under skill:audit\'s hard limit, with the one recorded debt ratcheted', () => {
  const routers = walk(SKILLS_DIR).filter((file) => path.basename(file) === 'SKILL.md');
  // 16 routers since the fixed design presets and the second design engine
  // were retired (2026-08-28); the floor only proves the walk found the set.
  assert.ok(routers.length >= 15, `expected the skill set, found ${routers.length}`);
  const over = [];
  for (const file of routers) {
    const rel = path.relative(SKILLS_DIR, file).split(path.sep).join('/');
    const ceiling = SKILL_RATCHETS[rel] || ROUTER_HARD_CHARS;
    const chars = size(file);
    if (chars > ceiling) over.push(`${rel}: ${chars} > ${ceiling}`);
  }
  assert.deepEqual(over, [], `skill routers over budget — move craft into references/:\n${over.join('\n')}`);
  for (const [rel, ceiling] of Object.entries(SKILL_RATCHETS)) {
    const chars = size(path.join(SKILLS_DIR, rel));
    assert.ok(chars > ROUTER_HARD_CHARS, `${rel} is back under ${ROUTER_HARD_CHARS} — drop its ratchet entry`);
    assert.ok(ceiling - chars <= 256, `${rel}: ratchet ${ceiling} sits ${ceiling - chars} chars above the file — lower it`);
  }
});

test('every skill reference stays under skill:audit\'s hard reference limit', () => {
  const references = walk(SKILLS_DIR).filter((file) => path.basename(file) !== 'SKILL.md');
  const over = references
    .map((file) => ({ rel: path.relative(SKILLS_DIR, file).split(path.sep).join('/'), chars: size(file) }))
    .filter((entry) => entry.chars > REFERENCE_HARD_CHARS)
    .map((entry) => `${entry.rel}: ${entry.chars} > ${REFERENCE_HARD_CHARS}`);
  assert.deepEqual(over, [], `references over budget — split the document:\n${over.join('\n')}`);
});
