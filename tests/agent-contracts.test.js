'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { AGENT_DEFINITIONS, MANAGED_FILES, REQUIRED_FILES } = require('../src/constants');

const ROOT = path.resolve(__dirname, '..');
const TEMPLATE = path.join(ROOT, 'template');
const read = (rel) => fs.readFile(path.join(TEMPLATE, rel), 'utf8');

test('template ships every registered agent and the new Planner', async () => {
  for (const agent of AGENT_DEFINITIONS) {
    const content = await read(agent.path);
    assert.ok(content.length > 0, `${agent.id} prompt is missing`);
  }
  assert.ok(AGENT_DEFINITIONS.some((agent) => agent.id === 'planner'));
  assert.ok(MANAGED_FILES.includes('.aioson/agents/planner.md'));
  assert.ok(REQUIRED_FILES.includes('.aioson/agents/planner.md'));
});

test('canonical prompts expose compact decision contracts', async () => {
  for (const name of ['product', 'sheldon', 'planner', 'dev', 'qa']) {
    const content = await read(`.aioson/agents/${name}.md`);
    for (const heading of ['LANGUAGE BOUNDARY', '## Mission', '## Required input', '## Hard constraints']) {
      assert.match(content, new RegExp(heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), `${name} missing ${heading}`);
    }
    // 14000 -> 14336 (14 KiB) on 2026-08-07: dev.md gained one routed-module
    // pointer for visual-implementation.md. The budget did its job — it rejected
    // the 1.7KB inline anti-slop block and forced it into a routed doc, so a
    // non-visual feature no longer pays for it.
    // 14336 -> 14592 on 2026-08-13: 5badaeb6 (pente-fino P1) had already pushed
    // product.md and dev.md past 14336, hidden because this test reads the
    // workspace copy and the workspace was stale; the token-economy sync made
    // parity honest and the overrun surfaced. Rebased to current canonical size
    // with ~2% slack — further growth must go to routed docs, not here.
    assert.ok(content.length < 14592, `${name} prompt grew beyond the compact kernel budget (${content.length})`);
  }
});

test('the canonical chain has one PRD, one plan, and one QA report', async () => {
  const [product, sheldon, planner, dev, qa] = await Promise.all(
    ['product', 'sheldon', 'planner', 'dev', 'qa'].map((name) => read(`.aioson/agents/${name}.md`))
  );
  assert.match(product, /single product authority|only canonical product\/specification document/i);
  assert.match(sheldon, /same PRD|in place/i);
  assert.match(planner, /exactly one planning artifact/i);
  assert.match(dev, /do not require requirements, spec, architecture/i);
  assert.match(qa, /qa-report-\{slug\}\.md/);
});

test('AC-BRDR-07 AC-BRDR-08: approved briefing review authority is fail-closed across Product, Sheldon, Planner, Dev, and QA', async () => {
  const authority = await read('.aioson/docs/briefing/review-authority.md');
  assert.ok(MANAGED_FILES.includes('.aioson/docs/briefing/review-authority.md'));
  for (const token of [
    'Status: applied',
    'Approved review authority: binding',
    'refinement-feedback.applied-round*.json',
    'single',
    'multiple',
    'nonbinding'
  ]) {
    assert.ok(authority.includes(token), `review authority contract missing ${token}`);
  }

  for (const name of ['product', 'sheldon', 'planner', 'dev', 'qa']) {
    const templatePrompt = await read(`.aioson/agents/${name}.md`);
    const workspacePrompt = await fs.readFile(path.join(ROOT, '.aioson', 'agents', `${name}.md`), 'utf8');
    assert.match(templatePrompt, /\.aioson\/docs\/briefing\/review-authority\.md/);
    assert.match(templatePrompt, /exact applied feedback archive/i);
    assert.match(templatePrompt, /pending.*rejected.*deferred/is);
    assert.match(templatePrompt, /nonbinding|as authority|infer implementation work/i);
    assert.equal(workspacePrompt, templatePrompt, `${name} template/workspace review authority drift`);
  }
});

test('Planner creates vertical production-path stages from CAP and AC trace', async () => {
  const planner = await read('.aioson/agents/planner.md');
  for (const token of ['Capability Delivery Plan', 'Engineering Controls', 'CAP-*', 'AC-*', 'production entry point', 'real UI', 'exact repository-relative paths']) {
    assert.ok(planner.includes(token), `Planner missing ${token}`);
  }
  assert.match(planner, /Use model knowledge to generate engineering hypotheses, not to invent project facts/i);
  assert.match(planner, /verification.*recovery/is);
  assert.match(planner, /Next agent: @dev/);
  assert.doesNotMatch(planner, /Next agent: @(analyst|architect|pm|orchestrator)/);
});

test('Planner asks the orchestration question on the measured scale and records the answer; the lanes table no longer names host or model (AC-plan-table)', async () => {
  for (const file of ['.aioson/agents/planner.md', 'template/.aioson/agents/planner.md']) {
    const planner = await fs.readFile(path.join(ROOT, file), 'utf8');
    const modulePath = '.aioson/docs/planner/orchestrated-execution.md';
    assert.match(planner, /Before writing or compiling this table, load `\.aioson\/docs\/planner\/orchestrated-execution\.md`/);
    assert.ok(MANAGED_FILES.includes(modulePath), 'the required module ships to other projects');
    const orchestration = await fs.readFile(path.join(ROOT, file.startsWith('template/') ? 'template' : '', modulePath), 'utf8');
    assert.match(planner, /aioson execution:offer \. --feature=\{slug\} --json/, `${file}: the offer runs after the plan is written`);
    assert.match(planner, /plan\.scale\.split_candidate/, `${file}: the question is asked on the measured number`);
    assert.match(planner, /onboarding\.next/, `${file}: a locked path names its unlock step`);
    // The third incident: 52 files, two surfaces, roles file missing — and the model marked "single DEV (Recommended)" because the kernel pinned a fixed default and read the lock as advice.
    assert.match(planner, /recommending `plan\.recommendation`/, `${file}: the recommendation is the measured one, never a fixed default`);
    assert.match(planner, /a lock never flips it/, `${file}: availability names the unlock step, it never argues for single DEV`);
    assert.doesNotMatch(planner, /single DEV \(default\)/, `${file}: the fixed default that overrode the measurement is gone`);
    assert.match(planner, /`execution: single` in the frontmatter/, `${file}: the single-DEV answer is recorded`);
    assert.match(planner, /aioson execution:seed \. --feature=\{slug\}/, `${file}: lanes seed the roles file`);
    assert.match(planner, /\| Lane \| Exact write paths \| Integration owner \|/, `${file}: the lanes table is lane, paths, owner`);
    assert.doesNotMatch(planner, /\| Lane \| Host \| Model \|/, `${file}: host and model belong to the roles file, not the plan`);
    assert.match(planner, /the measured plan scale earns the question; the answer is the user's or the approved PRD's/, `${file}: classification never decides`);
    assert.doesNotMatch(planner, /answers `available: true`, ask once/, `${file}: the question no longer waits for the unlock file`);
    // The second incident: "one row per delivery phase" produced a single lane running one whole phase per process.
    assert.match(orchestration, /One row per UNIT \(one process, one context\), never per phase/, `${file}: the Execution Sequence row is the unit, not the phase`);
    assert.doesNotMatch(planner, /One row per delivery phase/, `${file}: the old prescription is gone`);
    assert.match(planner, /Lanes are the model axis \(each `\{lane\}_dev` role has its own host\/model\): one per surface when `plan\.scale\.surfaces` shows backend and frontend/, `${file}: lanes are declared by surface because the model is assigned per lane`);
    assert.match(orchestration, /plan\.scale\.units\[\]\.over_budget/, `${file}: the unit ceiling is the measured cut`);
    assert.match(orchestration, /a bare phase number = every row of that phase/, `${file}: Depends on semantics for a phase cut per lane`);
    assert.match(orchestration, /one lane with one row per wave is serial by construction \(`orchestration_serial`\)/, `${file}: the serial shape is named`);
    assert.doesNotMatch(planner, /Keep waves few; a solo wave is valid/, `${file}: the sentence that blessed the serial shape is gone`);
  }
});

test('Product, Sheldon, and Planner preserve repository fit without adding a confirmation gate', async () => {
  const [product, sheldon, planner, contract, autopilot] = await Promise.all([
    read('.aioson/agents/product.md'),
    read('.aioson/agents/sheldon.md'),
    read('.aioson/agents/planner.md'),
    read('.aioson/docs/feature-completeness-contract.md'),
    read('.aioson/docs/autopilot-handoff.md')
  ]);

  assert.match(product, /## Current System Fit/);
  assert.match(product, /without pausing for routine confirmation/i);
  assert.match(sheldon, /references\/sheldon\.md/);
  assert.match(sheldon, /do not pause Autopilot/i);
  assert.match(planner, /## Implementation Delta/);
  assert.match(planner, /reuse.*modify.*create.*retire/is);
  assert.match(contract, /current-system fit.*implementation delta/is);
  assert.match(autopilot, /not new human gates/i);
  assert.match(autopilot, /Pause only when the alternatives materially change product behavior/i);
});

test('prototype intent is preserved through Product, Sheldon, Planner, Dev, and QA', async () => {
  for (const name of ['product', 'sheldon', 'planner', 'dev', 'qa']) {
    const content = await read(`.aioson/agents/${name}.md`);
    assert.match(content, /prototype/i, `${name} lost the prototype contract`);
  }
});

test('prototype authority is feature-owned, explicit, and visible across the delivery chain', async () => {
  const [product, sheldon, planner, dev, qa, deyvin, contract, forge] = await Promise.all([
    read('.aioson/agents/product.md'),
    read('.aioson/agents/sheldon.md'),
    read('.aioson/agents/planner.md'),
    read('.aioson/agents/dev.md'),
    read('.aioson/agents/qa.md'),
    read('.aioson/agents/deyvin.md'),
    read('.aioson/docs/prototype-contract.md'),
    read('.aioson/skills/process/prototype-forge/SKILL.md')
  ]);

  assert.match(product, /prototype_status: current/);
  assert.match(product, /prototype_status: none/);
  assert.match(product, /Prototype binding: current/);
  assert.match(product, /never select a prototype by globbing other feature folders/i);
  for (const content of [sheldon, planner, dev, qa, deyvin]) {
    assert.match(content, /prototype:check \. --feature=\{slug\} --strict/);
    assert.match(content, /closed feature|feature closes|historical/i);
  }
  assert.match(dev, /inspect the current production entry point, implementation, and tests/i);
  assert.match(deyvin, /inspect code\/tests|production code\/tests/i);
  assert.match(contract, /Prototype authority is feature-owned, never global/i);
  assert.match(contract, /excluded historical references/i);
  assert.match(forge, /feature: \{slug\}/);
});

test('Dev and QA reject detached mock proof and require the normal app path', async () => {
  const [dev, qa] = await Promise.all([read('.aioson/agents/dev.md'), read('.aioson/agents/qa.md')]);
  assert.match(dev, /detached fixtures|alternate binaries|test-only flags|mocked transports/i);
  assert.match(dev, /default entry point|production entry point/i);
  assert.match(qa, /detached fixture|mock data/i);
  assert.match(qa, /normal production path|normal application entry point/i);
});

test('Planner controls flow through Dev and independent QA without generic best-practice inflation', async () => {
  const [planner, dev, qa, contract] = await Promise.all([
    read('.aioson/agents/planner.md'),
    read('.aioson/agents/dev.md'),
    read('.aioson/agents/qa.md'),
    read('.aioson/docs/feature-completeness-contract.md')
  ]);

  assert.match(planner, /## Engineering Controls/);
  assert.match(planner, /Do not turn untriggered concerns into work/i);
  assert.match(dev, /engineering controls|engineering-control/i);
  assert.match(qa, /applicable engineering control/i);
  assert.match(qa, /independently review that diff/i);
  assert.match(contract, /records only those triggered by the PRD, inspected repository/i);
});

test('Tester and Pentester implement only bounded corrections and return acceptance to QA', async () => {
  const [tester, pentester, autopilot, help, testerManifestRaw, pentesterManifestRaw, coverageGuide] = await Promise.all([
    read('.aioson/agents/tester.md'),
    read('.aioson/agents/pentester.md'),
    read('.aioson/docs/autopilot-handoff.md'),
    read('.aioson/docs/agent-help.md'),
    read('.aioson/agents/manifests/tester.manifest.json'),
    read('.aioson/agents/manifests/pentester.manifest.json'),
    read('.aioson/docs/tester/coverage-quality.md')
  ]);

  for (const content of [tester, pentester, autopilot]) {
    assert.match(content, /bounded|limit/i);
    assert.match(content, /QA.*independent|independent.*QA/is);
  }
  assert.match(tester, /review-cycle:advance .*--source=tester --to=tester/);
  assert.match(tester, /allowed_fix_paths/);
  assert.match(tester, /--manual/);
  assert.match(tester, /stop_scope_violation/);
  // Coverage evolution: class-tagged hypothesis matrix, adversarial default on
  // critical paths, visible residual risk, and the deterministic report gate.
  assert.match(tester, /## Hypothesis matrix/);
  assert.match(tester, /adversarial depth is the default/i);
  assert.match(tester, /## Residual risk/);
  assert.match(tester, /docs\/tester\/coverage-quality\.md/);
  assert.match(tester, /--kind=test-report --slug=\{slug\} --advisory/);
  assert.match(pentester, /review-cycle:advance .*--source=pentester --to=pentester/);
  assert.match(pentester, /--manual/);
  assert.match(pentester, /stop_scope_violation/);
  assert.match(pentester, /status: needs_validation/);
  assert.match(coverageGuide, /3 behavior \/ 5 total path budget/);
  assert.match(coverageGuide, /Git worktree baseline/);
  assert.match(autopilot, /specialists never grant Gate D/i);
  assert.match(autopilot, /not routine confirmation prompts/i);
  assert.match(help, /may correct one unequivocal bounded defect/i);
  assert.doesNotMatch(coverageGuide, /test-plan-\{slug\}\.md/);
  assert.match(coverageGuide, /test-report-\{slug\}\.md/);

  const testerManifest = JSON.parse(testerManifestRaw);
  const pentesterManifest = JSON.parse(pentesterManifestRaw);
  assert.equal(testerManifest.agent_id, 'tester');
  assert.ok(testerManifest.capabilities.some((capability) => capability.id === 'apply_bounded_test_correction'));
  assert.equal(pentesterManifest.agent_id, 'pentester');
  assert.ok(pentesterManifest.capabilities.some((capability) => capability.id === 'apply_bounded_security_hardening'));
  assert.equal(Object.hasOwn(pentesterManifest, 'workflow_insertion'), false);
});

test('MICRO, SMALL, and MEDIUM share the same streamlined route with mandatory Sheldon', async () => {
  const [agents, config, skill] = await Promise.all([
    read('AGENTS.md'),
    read('.aioson/config.md'),
    read('.aioson/skills/process/aioson-spec-driven/SKILL.md')
  ]);
  for (const content of [agents, config, skill]) {
    assert.match(content, /product.*sheldon.*planner.*dev.*qa/is);
  }
  assert.match(config, /classification controls budgets and depth/i);
  assert.match(config, /opt-in|optional/i);
  assert.match(config, /Sheldon.*mandatory/i);
});

test('feature agents preserve compaction continuity without promoting mappings to authority', async () => {
  const agents = ['briefing', 'refiner', 'product', 'sheldon', 'planner', 'dev', 'qa'];
  for (const agent of agents) {
    const content = await read(`.aioson/agents/${agent}.md`);
    assert.match(content, /mappings\/\{slug\}\/continuity\.md/, `${agent} lacks the continuity mapping rule`);
    assert.match(content, /temporary|non-canonical|noncanonical/i, `${agent} does not mark the mapping temporary`);
    assert.match(content, /never (?:a gate|proof|replaces)|never.*gate|cannot change/i, `${agent} may promote the mapping to authority`);
  }
  const mapping = await read('.aioson/docs/feature-continuity-mapping.md');
  assert.match(mapping, /never replaces or overrides/i);
  assert.match(mapping, /never creates scope, grants approval, satisfies a workflow gate, or proves implementation/i);
});

test('QA is a bounded reviewer and never deepens work merely by classification', async () => {
  const [qa, reference] = await Promise.all([
    read('.aioson/agents/qa.md'),
    read('.aioson/skills/process/aioson-spec-driven/references/qa.md')
  ]);
  for (const content of [qa, reference]) {
    assert.match(content, /more than twice|repeat the same failing command or diagnostic more than twice/i);
    assert.match(content, /minimal reproduction.*Dev|return.*reproduction to Dev/i);
    assert.match(content, /not.*classification|never classification-triggered|not a classification/i);
  }
  assert.match(qa, /Small work should normally receive a small verification pass/i);
});

test('canonical prompts never make legacy abstraction artifacts prerequisites', async () => {
  for (const name of ['product', 'sheldon', 'planner', 'dev', 'qa']) {
    const content = await read(`.aioson/agents/${name}.md`);
    assert.match(content, /Never create|Do not require|does not require|never require/i, `${name} must state its legacy-artifact boundary`);
  }
});

test('observability is best-effort and agent:done stays last', async () => {
  for (const name of ['product', 'sheldon', 'planner', 'dev', 'qa']) {
    const content = await read(`.aioson/agents/${name}.md`);
    const done = content.lastIndexOf(`aioson agent:done . --agent=${name}`);
    assert.ok(done > 0, `${name} missing agent:done`);
    assert.equal(content.slice(done).includes('aioson runtime:emit'), false, `${name} emits milestones after done`);
    for (const line of content.split(/\r?\n/).filter((line) => /aioson (runtime:emit|pulse:update|dossier:add-finding)/.test(line))) {
      assert.match(line, /\|\| true$/, `${name} best-effort observability command can block`);
    }
  }
});

test('help and manifests expose Planner and the physical Sheldon review contract', async () => {
  const [help, manifest, sheldonManifest, devManifest, qaManifest] = await Promise.all([
    read('.aioson/docs/agent-help.md'),
    read('.aioson/agents/manifests/planner.manifest.json'),
    read('.aioson/agents/manifests/sheldon.manifest.json'),
    read('.aioson/agents/manifests/dev.manifest.json'),
    read('.aioson/agents/manifests/qa.manifest.json')
  ]);
  assert.match(help, /## @planner/);
  assert.equal(JSON.parse(manifest).agent_id, 'planner');
  assert.ok(JSON.parse(devManifest).capabilities.some((capability) => JSON.stringify(capability).includes('implementation-plan-{slug}.md')));
  for (const raw of [manifest, sheldonManifest, devManifest, qaManifest]) {
    assert.match(raw, /\.aioson\/context\/reviews\/\{slug\}\/reports\/sheldon-\*\.json/);
    assert.doesNotMatch(raw, /reviews\/\{slug\}\/sheldon\/\*\.md/);
  }
});
