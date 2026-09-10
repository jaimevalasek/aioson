'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');

const { queryBrains } = require('../src/brain-query');
const { readWorkspaceMirror } = require('./helpers/workspace-mirror');

const ROOT = path.resolve(__dirname, '..');
const TEMPLATE_ROOT = path.join(ROOT, 'template');
const WORKSPACE_ROOT = ROOT;
// benchmark left this set when it became the traversal orchestrator: the
// building (and the visual-quality lens with it) belongs to refiner/dev.
const AGENTS = ['dev', 'deyvin', 'refiner'];
// Product/Sheldon consume the same brain through the spec-quality lens only: the PRD
// authority must not inherit layout nodes it has no right to decide.
const SPEC_AGENTS = ['product', 'sheldon'];
// @ux-ui decides interaction on the prototype and @ui-specialist is the one
// squad-generated executor the framework itself names (squad-create Step 2.5):
// both BUILD what people see, so both carry the layout lens by name — a squad
// designer under any other name reaches the same nodes through the tag-only
// query its visual-quality block issues.
const VISUAL_AGENTS = ['ux-ui', 'ui-specialist'];
// Briefing originates through the spec-quality lens; QA verifies delivery through
// the interaction lens. Neither may inherit the layout nodes. Order mirrors the
// on-disk index array exactly.
const INDEXED_AGENTS = ['briefing', ...AGENTS, ...SPEC_AGENTS, 'qa', ...VISUAL_AGENTS];
// @ui-specialist is generated inside consumer projects (squad-create Step 2.5) and
// has no kernel file in the template; its visual-quality block is pinned by
// squad-agent-visual-block.test.js instead.
const KERNEL_AGENTS = INDEXED_AGENTS.filter((agent) => agent !== 'ui-specialist');
const BRAIN_RELATIVE_PATH = '.aioson/brains/design/visual-quality.brain.json';
const INDEX_RELATIVE_PATH = '.aioson/brains/_index.json';

async function read(root, relativePath) {
  return fs.readFile(path.join(root, relativePath), 'utf8');
}

test('the layout lens stays exactly with the implementation-oriented agents', async () => {
  for (const root of [TEMPLATE_ROOT, WORKSPACE_ROOT]) {
    const index = JSON.parse(await read(root, INDEX_RELATIVE_PATH));
    const entry = index.brains.find((brain) => brain.id === 'design/visual-quality');

    assert.ok(entry, `visual quality brain missing from ${root}`);
    assert.deepEqual(entry.agents, INDEXED_AGENTS);
    assert.equal(entry.nodes, 30);
    assert.equal(entry.path, BRAIN_RELATIVE_PATH);

    for (const agent of [...AGENTS, ...VISUAL_AGENTS]) {
      const result = await queryBrains({
        targetDir: root,
        agent,
        tags: ['visual-quality'],
        minQuality: 4
      });

      assert.equal(result.ok, true);
      assert.deepEqual(result.warnings, []);
      assert.equal(result.nodes.length, 27);
      const replaceability = result.nodes.find((node) => node.id === 'vq-002');
      assert.equal(replaceability.v, 'AVOID');
      assert.match(replaceability.s, /repeated em dashes/i);
      assert.match(replaceability.warn, /quotations, code, commands/i);
      // The corpus-budget companion: sentence-level review cannot see scattered
      // microcopy cadence, so the node anchors on the measured count.
      const cadence = result.nodes.find((node) => node.id === 'vq-019');
      assert.equal(cadence.v, 'AVOID');
      assert.match(cadence.s, /em_dash_prose/);
      // The three supervised-briefing feedback nodes: self-explaining prototype,
      // identity-tokens-are-not-composition, and the primary-feature fold check.
      const reskin = result.nodes.find((node) => node.id === 'vq-017');
      assert.equal(reskin.v, 'AVOID');
      assert.match(reskin.s, /re-skin/i);
      const fold = result.nodes.find((node) => node.id === 'vq-018');
      assert.match(fold.s, /data-aioson-primary/);
      const tour = result.nodes.find((node) => node.id === 'vq-016');
      assert.match(tour.s, /data-aioson-tour/);
      // The craft-floor pair: hygiene metrics cannot see ambition, so the lens
      // binds the measured levers — typeface delivery first, aggregate second.
      const delivery = result.nodes.find((node) => node.id === 'vq-020');
      assert.equal(delivery.v, 'AVOID');
      assert.match(delivery.s, /font_delivery/);
      const craft = result.nodes.find((node) => node.id === 'vq-021');
      assert.match(craft.s, /craft axis|active_levers/);
      assert.match(craft.p, /active_levers/);
      // Rejection re-route: new visual input (identity from the owner's
      // references), never a menu of installed presets.
      const reroute = result.nodes.find((node) => node.id === 'vq-022');
      assert.equal(reroute.v, 'AVOID');
      assert.match(reroute.s, /reference-identity-extract/);
      assert.match(reroute.not, /preset/i);
      // Cross-project sameness: cold-start hue families come from the seeded
      // draw, and the fingerprint registry makes repetition machine-visible.
      const sameness = result.nodes.find((node) => node.id === 'vq-023');
      assert.equal(sameness.v, 'AVOID');
      assert.match(sameness.s, /design:seed/);
      assert.match(sameness.s, /cross-project palette repetition/);
      assert.match(sameness.p, /--seed=N/);
      // The finish-system companion: a legitimate draw applied without the
      // tokened finish (shadows, washes, texture) still ships as flat output,
      // and the depth metric plus the dead-effect check make that measurable.
      const finish = result.nodes.find((node) => node.id === 'vq-024');
      assert.equal(finish.v, 'AVOID');
      assert.match(finish.s, /material_depth|materials N\/7/);
      assert.match(finish.s, /shallow material system/);
      assert.match(finish.s, /declared finish never applied/);
      // The tell catalog: category defaults measured as `tells N`, each with
      // its counter-move; only the kicker is a true ban.
      const tells = result.nodes.find((node) => node.id === 'vq-025');
      assert.equal(tells.v, 'AVOID');
      assert.match(tells.s, /tells N/);
      assert.match(tells.s, /kicker/i);
      assert.match(tells.s, /browser chrome/i);
      // The surface-mode counterweight: operate/read surfaces earn familiarity,
      // and the expressive premium bar stays with persuade/experience.
      const mode = result.nodes.find((node) => node.id === 'vq-026');
      assert.equal(mode.v, 'BEST_PRACTICE');
      assert.match(mode.s, /earned familiarity/i);
      assert.match(mode.s, /per surface, never per project/i);
      assert.match(mode.p, /operate\/read/);
    }
  }
});

test('the spec-quality lens reaches the PRD authority without leaking layout nodes', async () => {
  for (const root of [TEMPLATE_ROOT, WORKSPACE_ROOT]) {
    for (const agent of SPEC_AGENTS) {
      const result = await queryBrains({
        targetDir: root,
        agent,
        tags: ['spec-quality'],
        minQuality: 4
      });

      assert.equal(result.ok, true);
      assert.deepEqual(result.warnings, []);
      assert.deepEqual(
        result.nodes.map((node) => node.id),
        ['sq-001', 'sq-002', 'sq-003'],
        `${agent} must receive exactly the specification lens`
      );
      const replaceability = result.nodes.find((node) => node.id === 'sq-001');
      assert.match(replaceability.s, /repeated em-dash cadence/i);
      assert.match(replaceability.warn, /quotations, code, commands/i);
      // The whole point of the separate tag: Product/Sheldon never inherit the
      // implementation nodes, so the PRD cannot start prescribing composition.
      for (const node of result.nodes) {
        assert.ok(
          !node.tags.includes('visual-quality'),
          `${node.id} carries the visual-quality tag and would leak into the PRD lens`
        );
      }
    }
  }
});

test('the interaction lens reaches QA without granting layout authority', async () => {
  for (const root of [TEMPLATE_ROOT, WORKSPACE_ROOT]) {
    const result = await queryBrains({
      targetDir: root,
      agent: 'qa',
      tags: ['interaction', 'forms'],
      minQuality: 4
    });

    assert.equal(result.ok, true);
    assert.deepEqual(result.warnings, []);
    // Exactly the four interaction contracts plus the two verified
    // implementation gotchas — no layout/composition node may leak in.
    assert.deepEqual(
      result.nodes.map((node) => node.id),
      ['vq-009', 'vq-010', 'vq-011', 'vq-012', 'vq-014', 'vq-015']
    );
  }

  // The rules close the same chain on the verification end: every interaction
  // rule names what QA proves, so context:brief anchors the delivery review.
  const INTERACTION_RULES = [
    'form-fields-masks-and-validation.md',
    'status-change-confirmation.md',
    'status-flow-drag-and-drop.md',
    'management-home-widgets.md'
  ];
  for (const file of INTERACTION_RULES) {
    const relativePath = `.aioson/rules/${file}`;
    const [template, workspace] = await Promise.all([
      read(TEMPLATE_ROOT, relativePath),
      read(WORKSPACE_ROOT, relativePath)
    ]);
    assert.equal(workspace, template, `template/workspace drift: ${relativePath}`);
    assert.match(template, /^- @qa:/m, `${file} has no @qa line in ## Applies to`);
  }
});

test('the specification lens keeps composition out of the PRD authority', async () => {
  for (const root of [TEMPLATE_ROOT, WORKSPACE_ROOT]) {
    const brain = JSON.parse(await read(root, BRAIN_RELATIVE_PATH));
    const specNodes = brain.nodes.filter((node) => node.tags.includes('spec-quality'));

    assert.equal(specNodes.length, 3);

    const replaceability = specNodes.find((node) => node.id === 'sq-001');
    assert.equal(replaceability.v, 'AVOID');

    // sq-002 is the node that turns a silent `identity_status: none` into a named
    // gap; without the boundary warning it would authorize Product to design.
    const authority = specNodes.find((node) => node.id === 'sq-002');
    assert.match(authority.warn, /never the composition/i);
  }
});

test('visual quality brain and agent kernels remain template/workspace synchronized', async () => {
  for (const relativePath of [INDEX_RELATIVE_PATH, BRAIN_RELATIVE_PATH]) {
    assert.equal(
      await read(WORKSPACE_ROOT, relativePath),
      await read(TEMPLATE_ROOT, relativePath),
      `template/workspace drift: ${relativePath}`
    );
  }

  for (const agent of KERNEL_AGENTS) {
    const relativePath = `.aioson/agents/${agent}.md`;
    const [template, workspace] = await Promise.all([
      read(TEMPLATE_ROOT, relativePath),
      read(WORKSPACE_ROOT, relativePath)
    ]);

    assert.equal(workspace, template, `template/workspace drift: ${relativePath}`);

    if (agent === 'briefing') {
      // Origination binds the spec lens inline (kernel budget: no dedicated
      // section heading), pinned in detail by briefing-agent-kernels.test.js.
      assert.match(template, /aioson brain:query \. --agent=briefing --tags=spec-quality/);
      assert.match(template, /replaceability test/i);
      assert.doesNotMatch(
        template,
        /--tags=visual-quality/,
        'briefing.md queries the layout lens it has no authority to decide'
      );
      continue;
    }

    if (agent === 'qa') {
      // Verification consumes the interaction contracts as delivery criteria for
      // promised surfaces — never the layout lens, never as a new scope source.
      assert.match(template, /aioson brain:query \. --agent=qa --tags=interaction,forms/);
      assert.match(template, /never adds scope/i);
      assert.doesNotMatch(
        template,
        /--tags=visual-quality/,
        'qa.md queries the layout lens it has no authority to decide'
      );
      continue;
    }

    if (SPEC_AGENTS.includes(agent)) {
      assert.match(template, /Specification quality intelligence \(anti-slop\)/i);
      assert.match(template, new RegExp(`aioson brain:query \\. --agent=${agent} --tags=spec-quality`));
      assert.match(template, /replaceability test/i);
      // The kernel must not send the PRD authority into the layout lens.
      assert.doesNotMatch(
        template,
        /--tags=visual-quality/,
        `${agent}.md queries the layout lens it has no authority to decide`
      );
      continue;
    }

    if (agent === 'dev') {
      // dev.md routes instead of inlining: the kernel is at its density budget and a
      // non-visual feature must not pay for visual criteria it will never apply.
      assert.match(template, /docs\/dev\/visual-implementation\.md/);
      continue;
    }

    assert.match(template, /Visual quality intelligence \(anti-slop\)/i);
    assert.match(template, /aioson brain:query \. --agent=/i);
    assert.match(template, /replaceability test/i);
  }
});

test('the routed visual-implementation doc carries the criteria dev no longer inlines', async () => {
  const relativePath = '.aioson/docs/dev/visual-implementation.md';
  const [template, workspace] = await Promise.all([
    read(TEMPLATE_ROOT, relativePath),
    read(WORKSPACE_ROOT, relativePath)
  ]);

  assert.equal(workspace, template, `template/workspace drift: ${relativePath}`);
  assert.match(template, /aioson brain:query \. --agent=dev/);
  assert.match(template, /replaceability test/i);
  assert.match(template, /identity/i);
  // The routing frontmatter is what makes the doc reachable at all.
  assert.match(template, /^agents: \[dev, deyvin, qa, ux-ui, site-forge\]$/m);
  assert.match(template, /^load_tier: trigger$/m);
  // A project rule must outrank the brain, or a client design system cannot win.
  // The statement itself lives in one place — brain node vq-000 — so it cannot drift.
  assert.match(template, /vq-000/);
  assert.match(template, /outranks every node here/i);
});

test('the effect and asset vocabulary is framework-level, routed, and honest about its limits', async () => {
  const relativePath = '.aioson/docs/design/visual-effects.md';
  const [template, workspace] = await Promise.all([
    read(TEMPLATE_ROOT, relativePath),
    read(WORKSPACE_ROOT, relativePath)
  ]);

  assert.equal(workspace, template, `template/workspace drift: ${relativePath}`);
  // Routing frontmatter is what makes it reachable at all; without load_tier it
  // would either never load or load for every non-visual feature.
  assert.match(template, /^load_tier: trigger$/m);
  assert.match(template, /^agents: \[dev, deyvin, refiner, ux-ui, site-forge\]$/m);

  // The two contracts that make an effect shippable rather than merely pretty.
  assert.match(template, /prefers-reduced-motion/);
  assert.match(template, /## 3\. Cost contract/);
  assert.match(template, /## 4\. Asset contract/);
  // Image generation is host-dependent. When the host offers it, generated
  // imagery is the sanctioned plan B — but only with provenance labeled, and
  // never presented as the client's real work. The honesty clause is the pin:
  // a prototype must not describe assets as something they are not.
  assert.match(template, /provenance labeled `generated`/);
  assert.match(template, /never presented as the client's real product or work/);
  assert.match(template, /never described as if they existed/);
});

test('both the implementation and the prototype polish pass can reach the effects vocabulary', async () => {
  const surfaces = [
    '.aioson/docs/dev/visual-implementation.md',
    '.aioson/skills/process/prototype-forge/references/quality-and-manifest.md'
  ];

  for (const relativePath of surfaces) {
    const [template, workspace] = await Promise.all([
      read(TEMPLATE_ROOT, relativePath),
      readWorkspaceMirror(relativePath)
    ]);
    // A skill mirror is local-only: a fresh checkout has none to drift.
    if (workspace !== null) assert.equal(workspace, template, `template/workspace drift: ${relativePath}`);
    assert.match(
      template,
      /docs\/design\/visual-effects\.md/,
      `${relativePath} cannot reach the effects vocabulary`
    );
  }
});

test('the cold start has a register vocabulary and a funnel that uses it', async () => {
  const registers = '.aioson/skills/design/interface-design/references/aesthetic-registers.md';
  const skill = '.aioson/skills/design/interface-design/SKILL.md';
  const exploration = '.aioson/docs/briefing/visual-exploration.md';

  for (const relativePath of [registers, skill, exploration]) {
    const [template, workspace] = await Promise.all([
      read(TEMPLATE_ROOT, relativePath),
      readWorkspaceMirror(relativePath)
    ]);
    if (workspace !== null) assert.equal(workspace, template, `template/workspace drift: ${relativePath}`);
  }

  const vocabulary = await read(TEMPLATE_ROOT, registers);
  // Origination mode only: a register must never be able to override an approved
  // prototype or an extracted identity record.
  assert.match(vocabulary, /\*\*origination mode only\*\*/i);
  assert.match(vocabulary, /never overrides accessibility/i);
  for (const register of ['## Technical', '## Quiet', '## Editorial', '## Material', '## Constructed']) {
    assert.match(vocabulary, new RegExp(register.replace(/[#]/g, '\\#')));
  }

  // The engine has to actually reach it at the moment it would otherwise default.
  assert.match(await read(TEMPLATE_ROOT, skill), /aesthetic-registers\.md/);
  // And the arena has to be able to compare registers, not only models.
  assert.match(await read(TEMPLATE_ROOT, exploration), /Arena over registers/);

  // Directions must carry a site-class option and must not let app-scale type
  // ranges cap a brand surface — the gap that shipped 24px "heroes".
  const directions = '.aioson/skills/design/interface-design/references/design-directions.md';
  const [dirTemplate, dirWorkspace] = await Promise.all([
    read(TEMPLATE_ROOT, directions),
    readWorkspaceMirror(directions)
  ]);
  if (dirWorkspace !== null) assert.equal(dirWorkspace, dirTemplate, `template/workspace drift: ${directions}`);
  assert.match(dirTemplate, /## Brand & Presence/);
  assert.match(dirTemplate, /App ranges never cap a site/);
  assert.match(dirTemplate, /never build from one line/i);
});

test('rule precedence over the brain is stated once, in the brain itself', async () => {
  for (const root of [TEMPLATE_ROOT, WORKSPACE_ROOT]) {
    const brain = JSON.parse(await read(root, BRAIN_RELATIVE_PATH));
    const node = brain.nodes.find((n) => n.id === 'vq-000');

    assert.ok(node, 'vq-000 (rule precedence) missing from the visual-quality brain');
    assert.match(node.s, /\.aioson\/rules\//);
    assert.match(node.p, /project rule > brain node/);
  }

  // No agent kernel may restate it — that duplication is what drifts.
  for (const agent of KERNEL_AGENTS) {
    const kernel = await read(TEMPLATE_ROOT, `.aioson/agents/${agent}.md`);
    assert.doesNotMatch(
      kernel,
      /outranks these nodes/i,
      `${agent}.md restates rule precedence; it belongs to brain node vq-000 only`
    );
  }
});
