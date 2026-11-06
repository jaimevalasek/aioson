'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');

const { MANAGED_FILES } = require('../src/constants');

const ROOT = path.resolve(__dirname, '..');
const TEMPLATE = path.join(ROOT, 'template', '.aioson');
const WORKSPACE = path.join(ROOT, '.aioson');

const DOCS = [
  'docs/briefing/activation-and-intake.md',
  'docs/briefing/source-pack-intake.md',
  'docs/briefing/sql-as-documentation.md',
  'docs/briefing/exploration-and-artifacts.md',
  'docs/briefing/refinement-loop.md',
  'docs/briefing/logged-in-screens.md',
  'docs/briefing/prototype-and-delegation.md',
  'docs/briefing/visual-exploration.md',
  'docs/briefing/review-surface-fallback.md',
  'docs/briefing/legacy-agent-contract.md',
  'docs/briefing/legacy-refiner-agent-contract.md'
];

async function read(root, relativePath) {
  return fs.readFile(path.join(root, relativePath), 'utf8');
}

test('Briefing kernels stay compact and preserve full historical contracts off the hot path', async () => {
  const [briefing, refiner, briefingLegacy, refinerLegacy] = await Promise.all([
    read(TEMPLATE, 'agents/briefing.md'),
    read(TEMPLATE, 'agents/refiner.md'),
    read(TEMPLATE, 'docs/briefing/legacy-agent-contract.md'),
    read(TEMPLATE, 'docs/briefing/legacy-refiner-agent-contract.md')
  ]);

  assert.ok(briefing.length < 12000, `Briefing kernel is ${briefing.length} chars`);
  assert.ok(refiner.length < 12000, `Refiner kernel is ${refiner.length} chars`);
  assert.ok(briefingLegacy.length > 25000, 'legacy Briefing intelligence was not preserved');
  assert.ok(refinerLegacy.length > 18000, 'legacy Refiner intelligence was not preserved');

  assert.match(briefing, /Never load every module/i);
  assert.match(refiner, /Never load every module/i);
  assert.match(briefing, /legacy-agent-contract\.md.*non-executable history/is);
  assert.match(refiner, /legacy-refiner-agent-contract\.md.*non-executable history/is);
});

test('Briefing routes activation, exploration, deep craft, expansion, and exact artifacts progressively', async () => {
  const kernel = await read(TEMPLATE, 'agents/briefing.md');

  for (const token of [
    'activation-and-intake.md',
    'source-pack-intake.md',
    'sql-as-documentation.md',
    'briefing:sources',
    'exploration-and-artifacts.md',
    'briefing-craft.md',
    'briefing-expansion-scout/SKILL.md',
    'visual-exploration.md',
    'plans/{slug}/visual-exploration.md',
    '.aioson/briefings/{slug}/expansion-scout.md',
    '## Context',
    '## Problem',
    '## Proposed solution',
    '## Themes',
    '## Risks',
    '## Identified gaps',
    '## Sources',
    '## Open questions',
    // Origination bindings: the spec-quality brain query, the interaction
    // contracts recorded as promises, and the deterministic artifact gate.
    '--agent=briefing --tags=spec-quality',
    'replaceability test',
    'interaction contracts',
    '--kind=briefing --slug={slug} --advisory'
  ]) {
    assert.ok(kernel.includes(token), `Briefing kernel missing ${token}`);
  }

  assert.match(kernel, /one specified observable outcome/i);
  assert.match(kernel, /write without asking/i);
  assert.match(kernel, /Never overwrite an existing briefing without confirmation/i);
  assert.doesNotMatch(kernel, /before the first write|slug confirmation/i);
  assert.match(kernel, /One activation should advance one coherent decision branch/i);
});

test('Refiner is a bounded filesystem state machine with on-demand rare routes', async () => {
  const kernel = await read(TEMPLATE, 'agents/refiner.md');

  for (const token of [
    'refinement-loop.md',
    'prototype-and-delegation.md',
    'review-surface-fallback.md',
    'briefing-expansion-scout/SKILL.md',
    'visual-exploration.md',
    '.aioson/explorations/{exploration-slug}/',
    'plans/{briefing-slug}/visual-exploration.md',
    '.aioson/briefings/{slug}/expansion-scout.md',
    'references/identity',
    'reference-identity-extract',
    '--kind=identity',
    'identity.md',
    'bounded premium quality pass'
  ]) {
    assert.ok(kernel.includes(token), `Refiner kernel missing ${token}`);
  }

  assert.match(kernel, /Each generated review is a terminal point for that activation/i);
  assert.match(kernel, /at most one fresh review/i);
  assert.match(kernel, /Never poll, re-audit unchanged text/i);
  assert.match(kernel, /explicit confirmation before `--confirm`/i);
});

test('Refiner delivers its initial draft before optional visual work and preserves approval gates', async () => {
  const kernel = await read(TEMPLATE, 'agents/refiner.md');
  const prototype = await read(TEMPLATE, 'docs/briefing/prototype-and-delegation.md');
  const initial = prototype.indexOf('## Build initial prototype');
  const choice = prototype.indexOf('## Prototype refinement cycle');
  const validation = prototype.indexOf('## Authorized refinement and approval validation');
  assert.ok(initial >= 0 && initial < choice && choice < validation, 'initial creation must precede the cycle, and the cycle its validation');
  const draft = prototype.slice(initial, choice);
  const checkpoint = prototype.slice(choice, validation);
  const fullValidation = prototype.slice(validation);

  assert.match(kernel, /Build an initial draft, deliver its path, then run one bounded premium quality pass by default/i);
  assert.match(kernel, /Draft delivery never grants approval/i);
  assert.match(draft, /pause before Prototype Forge's `After the functional build`/);
  assert.doesNotMatch(draft, /aioson (?:verify:artifact|browser:run)|--screenshots/);
  assert.match(checkpoint, /one bounded refinement cycle runs by default, with no question first/);
  assert.doesNotMatch(checkpoint, /Would you like to finish/);
  assert.match(checkpoint, /when the user told you not to refine this prototype/);
  assert.match(checkpoint, /status: draft/);
  assert.match(checkpoint, /Do not propose `briefing:approve` or Product as ready/);
  assert.match(checkpoint, /`agent:done` static check.*does not restart work/);
  assert.match(checkpoint, /one bounded cycle: inspect → repair → final verification/);
  assert.match(checkpoint, /do not reset that budget/);
  assert.match(checkpoint, /Autopilot.*never adds a second cycle/);
  assert.match(checkpoint, /On resume, read it before work: a recorded stop is a stop/);
  assert.match(checkpoint, /Update the record before final measurement/);
  assert.match(checkpoint, /Stopping never waives an approval gate/);

  // Approval still requires the same evidence and owns no implicit waiver.
  assert.match(fullValidation, /--kind=visual --slug=\{slug\} --advisory --runtime --screenshots/);
  assert.match(fullValidation, /aioson browser:run/);
  assert.match(fullValidation, /refuses missing, stale, failed, or unverified evidence/);
  assert.match(fullValidation, /do not restart it to make a gate green/);
});

test('a logged-in screen has a route both agents load, beside the rule against the other way', async () => {
  // The route sat in briefing-craft.md, which a concrete problem never loads, and the
  // refiner had none: an agent that needed a screen read .env and minted a session.
  const [briefing, refiner, route, craft] = await Promise.all([
    read(TEMPLATE, 'agents/briefing.md'),
    read(TEMPLATE, 'agents/refiner.md'),
    read(TEMPLATE, 'docs/briefing/logged-in-screens.md'),
    read(TEMPLATE, 'docs/briefing/briefing-craft.md')
  ]);
  for (const [name, kernel] of [['briefing', briefing], ['refiner', refiner]]) {
    assert.match(kernel, /^\| A logged-in screen of the current product matters \| `\.aioson\/docs\/briefing\/logged-in-screens\.md` \|$/m, name);
    assert.match(kernel, /open credential sources.*mint a session|open credential sources or mint a session/i, name);
  }
  for (const route_ of ['value_env', '--save-state', '--cdp', 'browser-walkthrough.md']) assert.ok(route.includes(route_), route_);
  assert.match(route, /Who saw it/);
  assert.match(route, /What nobody saw/);
  assert.match(craft, /follow `\.aioson\/docs\/briefing\/logged-in-screens\.md`/);
});

test('the review tells the owner what saving does, and the kernel never asks twice', async () => {
  const [refiner, loop] = await Promise.all([read(TEMPLATE, 'agents/refiner.md'), read(TEMPLATE, 'docs/briefing/refinement-loop.md')]);
  assert.match(refiner, /run apply with `--confirm-if-clean`/);
  assert.match(refiner, /the user's own words to apply are that confirmation, so never ask twice/);
  assert.match(loop, /--confirm-if-clean --json/);
  assert.match(loop, /applied_without_confirmation: true/);
  assert.match(loop, /pending_confirmation: true/);
  assert.match(loop, /never ask twice/);
  assert.match(loop, /marked `"defers": true`/);
});

test('Briefing modules are managed and template/workspace copies remain byte-identical', async () => {
  for (const relativePath of DOCS) {
    const managedPath = `.aioson/${relativePath}`;
    assert.equal(MANAGED_FILES.includes(managedPath), true, `missing managed file: ${managedPath}`);

    const [template, workspace] = await Promise.all([
      read(TEMPLATE, relativePath),
      read(WORKSPACE, relativePath)
    ]);
    assert.equal(workspace, template, `template/workspace drift: ${relativePath}`);
  }

  for (const relativePath of ['agents/briefing.md', 'agents/refiner.md']) {
    const [template, workspace] = await Promise.all([
      read(TEMPLATE, relativePath),
      read(WORKSPACE, relativePath)
    ]);
    assert.equal(workspace, template, `template/workspace drift: ${relativePath}`);
  }
});

test('active Briefing modules retain the high-value contracts removed from kernels', async () => {
  const [activation, sourcePack, sqlSources, exploration, refinement, prototype, visualExploration, fallback] = await Promise.all([
    read(TEMPLATE, 'docs/briefing/activation-and-intake.md'),
    read(TEMPLATE, 'docs/briefing/source-pack-intake.md'),
    read(TEMPLATE, 'docs/briefing/sql-as-documentation.md'),
    read(TEMPLATE, 'docs/briefing/exploration-and-artifacts.md'),
    read(TEMPLATE, 'docs/briefing/refinement-loop.md'),
    read(TEMPLATE, 'docs/briefing/prototype-and-delegation.md'),
    read(TEMPLATE, 'docs/briefing/visual-exploration.md'),
    read(TEMPLATE, 'docs/briefing/review-surface-fallback.md')
  ]);

  assert.match(activation, /JTBD/);
  assert.match(activation, /aioson intake:ask/);
  assert.match(activation, /SQL, only Markdown, or heterogeneous auxiliary sources/i);
  assert.match(sourcePack, /never.*moving, renaming, rewriting/is);
  assert.match(sourcePack, /Observed.*Strong inference.*Hypothesis.*Unknown/is);
  assert.match(sourcePack, /consulted.*metadata_only.*blocked/is);
  assert.match(sqlSources, /Never execute SQL/i);
  assert.match(sqlSources, /current system, a desired blueprint, or history/i);
  assert.match(sqlSources, /schema dump rewritten as prose/i);
  assert.match(exploration, /3–5 materially different shapes/);
  assert.match(exploration, /Operational surface/i);
  assert.match(refinement, /notes alone never reach `briefings\.md`/i);
  assert.match(refinement, /blocking.*Product cannot responsibly write the PRD/is);
  assert.match(prototype, /native_dispatch\.model/);
  assert.match(prototype, /mock-only/i);
  // Runtime telemetry off is a user decision, never a default discovered later;
  // a gate-passing rejection feeds the learnings loop instead of only a rebuild.
  assert.match(prototype, /surface the enable decision to the user once per feature/i);
  assert.match(prototype, /--route=<hash>/);
  assert.match(prototype, /## Rejection closes the loop/);
  assert.match(prototype, /\.aioson\/learnings\//);
  assert.match(visualExploration, /single.*sequential.*arena/is);
  assert.match(visualExploration, /targeted repository scan/i);
  assert.match(visualExploration, /reusable prompts are always retained/i);
  assert.match(visualExploration, /Selection means.*not Briefing approval/i);
  assert.match(fallback, /canonical feedback v1\.1 JSON/);
});
