'use strict';

/**
 * The design skill is never a question (2026-09-01).
 *
 * The framework ships exactly one design engine (`interface-design`) and every
 * visual producer resolves to it. The preset retirement (2026-08-28) removed
 * the catalog but left three agents — setup, product, ux-ui — still asking
 * the owner to pick, confirm or postpone a design skill: a menu with exactly
 * one sensible answer, asked on every new `site`/`web_app` project.
 *
 * What this pins:
 *   - `setup:context` writes `design_skill: "interface-design"` by default
 *     (`--design-skill` still names a project-forged skill; a blank value in
 *     an older context still resolves to the engine — nothing rewrites it);
 *   - no shipped kernel, routed doc, skill or task asks the owner to choose,
 *     confirm or postpone a design skill (the archived legacy contract is
 *     exempt: it is kept verbatim for regression comparison and banner-marked);
 *   - the engine's folded frontmatter description (`description: >-`) is
 *     readable by the shared frontmatter reader and by `skill:list` — it was
 *     the literal string `>-` before, in the selector and in the catalog.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const { createTranslator } = require('../src/i18n');
const { runSetupContext } = require('../src/commands/setup-context');
const { runSkillList } = require('../src/commands/skill');
const { installTemplate } = require('../src/installer');
const { DESIGN_ENGINE_ID, inspectRetiredDesignPresets } = require('../src/lib/design-presets');
const { parseFrontmatter } = require('../src/preflight-engine');

const ROOT = path.join(__dirname, '..');
const TEMPLATE = path.join(ROOT, 'template', '.aioson');
const ENGINE_SKILL = path.join(TEMPLATE, 'skills', 'design', DESIGN_ENGINE_ID, 'SKILL.md');

// Files kept verbatim on purpose: archived contracts a diagnosis compares the
// live kernel against. Their design-question prose is banner-marked superseded.
const ARCHIVED = new Set(['.aioson/docs/setup/legacy-agent-contract.md']);

// The shapes of the retired question — every phrase below shipped in a kernel
// or routed doc before this change. A new one is a regression, not taste.
const DESIGN_QUESTION_PATTERNS = [
  /(?<!never )ask (?:the user )?which (?:installed )?design skill/i,
  /ask whether to register one of the installed design skills/i,
  /ask for one choice/i,
  /still ask for confirmation instead of auto-selecting/i,
  /persist it only after confirmation/i,
  /Proceeding without a registered design skill/i,
  /pending-selection/,
  /leave the visual system pending/i,
  /visual system is still pending/i,
  /remains blank for a UI project/i,
  /must resolve it before UI design/i,
  /design-skill-selection/,
  /\bdesign-selection\b/,
  /choose design skill/i,
  /design_skill: ""\s*(?:with|and state|and tell)/i
];

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

function quietLogger() {
  const lines = [];
  return { lines, log(line) { lines.push(String(line)); }, error(line) { lines.push(String(line)); } };
}

async function makeTempDir(prefix) {
  return fsp.mkdtemp(path.join(os.tmpdir(), prefix));
}

test('setup:context writes design_skill: "interface-design" by default, and --design-skill still names a forged skill', async () => {
  const projectDir = await makeTempDir('aioson-design-default-');
  const { t } = createTranslator('en');
  try {
    const result = await runSetupContext({
      args: [projectDir],
      options: { defaults: true, 'project-type': 'web_app' },
      logger: quietLogger(),
      t
    });
    assert.equal(result.data.designSkill, DESIGN_ENGINE_ID);
    const content = await fsp.readFile(result.filePath, 'utf8');
    assert.ok(content.includes(`design_skill: "${DESIGN_ENGINE_ID}"`), 'the engine is written explicitly');

    // Every project type gets the same default — the engine only acts on visual work.
    const script = await runSetupContext({
      args: [projectDir],
      options: { defaults: true, 'project-type': 'script' },
      logger: quietLogger(),
      t
    });
    assert.equal(script.data.designSkill, DESIGN_ENGINE_ID);

    const forged = await runSetupContext({
      args: [projectDir],
      options: { defaults: true, 'project-type': 'web_app', 'design-skill': 'my-forged-ui' },
      logger: quietLogger(),
      t
    });
    assert.equal(forged.data.designSkill, 'my-forged-ui');
  } finally {
    await fsp.rm(projectDir, { recursive: true, force: true });
  }
});

test('no shipped kernel, routed doc, skill or task asks the owner to choose, confirm or postpone a design skill', () => {
  const offenders = [];
  for (const file of walk(TEMPLATE)) {
    if (path.extname(file) !== '.md') continue;
    const rel = path.relative(path.join(ROOT, 'template'), file).split(path.sep).join('/');
    if (ARCHIVED.has(rel)) continue;
    const content = fs.readFileSync(file, 'utf8');
    for (const pattern of DESIGN_QUESTION_PATTERNS) {
      const match = pattern.exec(content);
      if (match) offenders.push(`${rel} → ${match[0]}`);
    }
  }
  assert.deepEqual(offenders, []);

  // The archived contract is exempt only because it says so.
  const legacy = fs.readFileSync(path.join(TEMPLATE, 'docs', 'setup', 'legacy-agent-contract.md'), 'utf8');
  assert.match(legacy, /Superseded \(2026-09-01\)/);
});

test('the active setup, product, ux-ui and dev surfaces state the default instead of a question', () => {
  const read = (rel) => fs.readFileSync(path.join(TEMPLATE, rel), 'utf8');
  const setup = read('agents/setup.md');
  assert.match(setup, /visual system is never a setup question/i);
  assert.match(setup, /design_skill: "interface-design"/);

  const onboarding = read('docs/setup/onboarding-flow.md');
  assert.match(onboarding, /### 5\. Visual system: no question/);
  assert.doesNotMatch(onboarding, /inspect folder names in `\.aioson\/skills\/design\/`/);

  const reference = read('docs/setup/stack-and-design-reference.md');
  assert.match(reference, /There is no decision to make/);
  assert.doesNotMatch(reference, /task_types: \[[^\]]*design-selection/);
  assert.doesNotMatch(reference, /triggers: \[[^\]]*choose design skill/);

  const handoff = read('docs/setup/context-and-handoff.md');
  assert.match(handoff, /design_skill: "interface-design"/);

  const config = read('config.md');
  assert.match(config, /No agent asks which design skill to use/);

  const playbook = read('docs/product/conversation-playbook.md');
  assert.match(playbook, /never a product question/);

  const gate = read('docs/ux-ui/design-gate.md');
  assert.match(gate, /resolve the design skill without asking/);
  assert.match(gate, /there is no menu/);
  assert.doesNotMatch(gate, /task_types: \[[^\]]*design-skill-selection/);

  const dev = read('docs/dev/stack-conventions.md');
  assert.match(dev, /blank or `interface-design` → load `\.aioson\/skills\/design\/interface-design\/SKILL\.md`/);
  assert.match(dev, /never ask which design skill to use/);
});

test('the shared frontmatter reader parses YAML block scalars, so the engine description is a sentence and not ">-"', async () => {
  const folded = parseFrontmatter([
    '---',
    'name: demo',
    'description: >-',
    '  The engine: first line,',
    '  second line.',
    'task_types: [ui, design]',
    '---',
    '# Demo'
  ].join('\n'));
  assert.equal(folded.description, 'The engine: first line, second line.');
  assert.equal(folded.task_types, '[ui, design]');
  assert.equal('The engine' in folded, false, 'a continuation line with a colon is not a key');

  const literal = parseFrontmatter('---\nname: demo\nnotes: |\n  one: a\n  two\n\nagents: [dev]\n---\n');
  assert.equal(literal.notes, 'one: a\ntwo');
  assert.equal(literal.agents, '[dev]');

  const crlf = parseFrontmatter('---\r\ndescription: >\r\n  folded on\r\n  windows\r\nagents: [qa]\r\n---\r\n');
  assert.equal(crlf.description, 'folded on windows');
  assert.equal(crlf.agents, '[qa]');

  const engine = parseFrontmatter(await fsp.readFile(ENGINE_SKILL, 'utf8'));
  assert.equal(engine.name, DESIGN_ENGINE_ID);
  assert.match(engine.description, /single design engine/);
  assert.match(engine.description, /A blank `design_skill` resolves to it/);
  assert.notEqual(engine.description, '>-');
});

test('skill:list prints the engine description and marks the default engine active', async () => {
  const projectDir = await makeTempDir('aioson-skill-list-engine-');
  const { t } = createTranslator('en');
  try {
    await installTemplate(projectDir, { mode: 'install' });
    await runSetupContext({
      args: [projectDir],
      options: { defaults: true, 'project-type': 'web_app' },
      logger: quietLogger(),
      t
    });
    const logger = quietLogger();
    const result = await runSkillList({ args: [projectDir], options: {}, logger, t });
    const engine = result.source.design.find((skill) => skill.slug === DESIGN_ENGINE_ID);
    assert.ok(engine, 'the engine is listed');
    assert.match(engine.description, /single design engine/);
    const output = logger.lines.join('\n');
    assert.ok(output.includes(`${DESIGN_ENGINE_ID} [active]`), 'the CLI default is the active design skill');
    assert.equal(output.includes('\n    >-'), false, 'the folded indicator never prints as the description');
  } finally {
    await fsp.rm(projectDir, { recursive: true, force: true });
  }
});

// Measured: in `design_skill:\s*(.*)` the `\s*` crossed the newline, so a bare
// `design_skill:` (a blank field an older context carries) captured the next
// line — `test_runner: "jest"` — as the skill id, and the engine a blank field
// resolves to was never marked [active]. The retired-preset inspector read
// the field with the same pattern.
test('a bare design_skill: is blank, not the next line: skill:list marks the engine active', async () => {
  const projectDir = await makeTempDir('aioson-skill-list-bare-');
  try {
    const engineDir = path.join(projectDir, '.aioson', 'skills', 'design', DESIGN_ENGINE_ID);
    await fsp.mkdir(engineDir, { recursive: true });
    await fsp.copyFile(ENGINE_SKILL, path.join(engineDir, 'SKILL.md'));
    await fsp.mkdir(path.join(projectDir, '.aioson', 'context'), { recursive: true });
    await fsp.writeFile(path.join(projectDir, '.aioson', 'context', 'project.context.md'), '---\nproject_name: x\ndesign_skill:\ntest_runner: "jest"\n---\n', 'utf8');
    const logger = quietLogger();
    await runSkillList({ args: [projectDir], options: {}, logger, t: createTranslator('en').t });
    const output = logger.lines.join('\n');
    assert.ok(output.includes(`${DESIGN_ENGINE_ID} [active]`), output);
    assert.equal((await inspectRetiredDesignPresets(projectDir)).design_skill, '', 'the next line is not the design skill');
  } finally {
    await fsp.rm(projectDir, { recursive: true, force: true });
  }
});
