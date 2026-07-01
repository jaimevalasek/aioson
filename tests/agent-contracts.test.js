'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { AGENT_DEFINITIONS, MANAGED_FILES } = require('../src/constants');

const ROOT = path.resolve(__dirname, '..');
const EXTRA_CANONICAL_AGENTS = ['copywriter', 'design-hybrid-forge', 'site-forge'];

async function read(filePath) {
  return fs.readFile(filePath, 'utf8');
}

async function collectFiles(dirPath, found = []) {
  let entries = [];
  try {
    entries = await fs.readdir(dirPath, { withFileTypes: true });
  } catch (error) {
    if (error && error.code === 'ENOENT') return found;
    throw error;
  }

  for (const entry of entries) {
    const nextPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      await collectFiles(nextPath, found);
      continue;
    }
    found.push(nextPath);
  }
  return found;
}

test('template ships canonical base agent files for all managed agents', async () => {
  const canonicalAgents = [
    ...new Set([
      ...AGENT_DEFINITIONS.map((agent) => agent.id),
      ...EXTRA_CANONICAL_AGENTS
    ])
  ];

  for (const agent of canonicalAgents) {
    await assert.doesNotReject(
      () => fs.access(path.join(ROOT, 'template/.aioson/agents', `${agent}.md`)),
      `missing canonical template agent: ${agent}`
    );
  }
});

test('locale agent packs are no longer shipped in template or workspace', async () => {
  const templateFiles = await collectFiles(path.join(ROOT, 'template/.aioson/locales'));
  const workspaceFiles = await collectFiles(path.join(ROOT, '.aioson/locales'));

  const templateAgentFiles = templateFiles.filter((file) => /[/\\]agents[/\\].+\.md$/.test(file));
  const workspaceAgentFiles = workspaceFiles.filter((file) => /[/\\]agents[/\\].+\.md$/.test(file));

  assert.equal(templateAgentFiles.length, 0);
  assert.equal(workspaceAgentFiles.length, 0);
});

test('managed file list excludes locale agent packs', () => {
  assert.equal(
    MANAGED_FILES.some((file) => file.startsWith('.aioson/locales/') && file.includes('/agents/')),
    false
  );
});

test('setup agent contract includes canonical language boundary and workflow gate', async () => {
  const setup = await read(path.join(ROOT, 'template/.aioson/agents/setup.md'));

  const requiredSnippets = [
    'LANGUAGE BOUNDARY',
    'interaction_language',
    'conversation_language',
    'Workflow gate after setup',
    'Repair `.aioson/context/project.context.md` before asking the user what to do next.',
    'Never silently bypass workflow after setup.',
    'restores the canonical prompts and synchronizes the selected `interaction_language`'
  ];

  for (const token of requiredSnippets) {
    assert.equal(setup.includes(token), true, `missing setup token: ${token}`);
  }
});

test('core workflow agents repair context inside the workflow', async () => {
  const product = await read(path.join(ROOT, 'template/.aioson/agents/product.md'));
  const analyst = await read(path.join(ROOT, 'template/.aioson/agents/analyst.md'));
  const dev = await read(path.join(ROOT, 'template/.aioson/agents/dev.md'));
  const ux = await read(path.join(ROOT, 'template/.aioson/agents/ux-ui.md'));

  const checks = [
    [product, 'Never use context repair as a reason to leave the workflow or suggest direct execution.'],
    [analyst, 'Never treat context repair as a reason to recommend execution outside the workflow.'],
    [dev, 'Never suggest direct execution outside the workflow as a workaround for stale context.'],
    [ux, 'never use context inconsistency as a reason to leave the workflow.']
  ];

  for (const [content, token] of checks) {
    assert.equal(content.includes(token), true, `missing context-integrity token: ${token}`);
  }
});

test('committer contract enforces guarded explicit staging', async () => {
  const committer = await read(path.join(ROOT, 'template/.aioson/agents/committer.md'));

  const requiredSnippets = [
    'Never** use `git add .`',
    'Only stage explicit file paths chosen by the user.',
    'aioson git:guard . --json',
    '.aioson/git-guard.json',
    'aioson git:guard . --install-hook',
    'Treat guard warnings as blocking.',
    'This agent is not only a message writer. It is a commit safety gate.'
  ];

  for (const token of requiredSnippets) {
    assert.equal(committer.includes(token), true, `missing committer safeguard token: ${token}`);
  }
});

test('core agent contracts keep actionable sections in canonical prompts', async () => {
  const checks = [
    {
      file: 'discovery-design-doc.md',
      tokens: ['## Mission', '## Responsibilities', '## Output contract', 'design-doc.md', 'readiness.md']
    },
    {
      file: 'analyst.md',
      tokens: ['## Mission', '## Classification scoring', '### Output contract — feature mode', '## Output contract']
    },
    {
      file: 'architect.md',
      tokens: ['## Mission', '## Responsibilities', '## Output contract', 'design-doc.md', 'readiness.md']
    },
    {
      file: 'dev.md',
      tokens: ['## Mission', '## Session start protocol', '## Context integrity', '## Implementation strategy']
    },
    {
      file: 'orchestrator.md',
      tokens: ['## Mission', '## Status file protocol', '## Session protocol', '### Session start', '### Session end']
    },
    {
      file: 'ux-ui.md',
      tokens: ['## Mission', '## Step 0 — Design skill gate', '## Output contract']
    },
    {
      file: 'qa.md',
      tokens: ['## Mission', '## Risk-first checklist', '#### Critical']
    }
  ];

  for (const item of checks) {
    const content = await read(path.join(ROOT, 'template/.aioson/agents', item.file));
    for (const token of item.tokens) {
      assert.equal(content.includes(token), true, `missing in ${item.file}: ${token}`);
    }
  }
});

test('living PRD flow preserves visual identity and design-skill gating', async () => {
  const product = await read(path.join(ROOT, 'template/.aioson/agents/product.md'));
  const productConversation = await read(path.join(ROOT, 'template/.aioson/docs/product/conversation-playbook.md'));
  const productPrdContract = await read(path.join(ROOT, 'template/.aioson/docs/product/prd-contract.md'));
  const pm = await read(path.join(ROOT, 'template/.aioson/agents/pm.md'));
  const ux = await read(path.join(ROOT, 'template/.aioson/agents/ux-ui.md'));

  const checks = [
    [product, 'PRD base'],
    [product, '.aioson/docs/product/conversation-playbook.md'],
    [product, '.aioson/docs/product/prd-contract.md'],
    [productConversation, 'ask whether to register one of the installed design skills'],
    [productPrdContract, '## Visual identity'],
    [productPrdContract, 'pending-selection'],
    [pm, 'Update the same PRD file you read'],
    [pm, '## Delivery plan'],
    [pm, '## Acceptance criteria'],
    [pm, 'Never remove or condense `Visual identity`.'],
    [ux, '## Step 0 — Design skill gate'],
    [ux, 'stop and ask the user which installed design skill to use.'],
    [ux, 'pending-selection'],
    [ux, 'If the PRD does not yet contain `## Visual identity`']
  ];

  for (const [content, token] of checks) {
    assert.equal(content.includes(token), true, `missing PRD token: ${token}`);
  }
});

test('canonical prompts preserve recovered product and planning safeguards from legacy locale drift', async () => {
  const product = await read(path.join(ROOT, 'template/.aioson/agents/product.md'));
  const analyst = await read(path.join(ROOT, 'template/.aioson/agents/analyst.md'));
  const orchestrator = await read(path.join(ROOT, 'template/.aioson/agents/orchestrator.md'));
  const pm = await read(path.join(ROOT, 'template/.aioson/agents/pm.md'));

  const checks = [
    [product, '.aioson/rules/'],
    [product, '.aioson/docs/'],
    [product, '.aioson/context/design-doc*.md'],
    [analyst, '## Synchronization gate'],
    [analyst, 'requirements sync mode'],
    [analyst, '.aioson/installed-skills/'],
    [analyst, 'references/analyst.md'],
    [analyst, 'aioson-spec-driven'],
    [orchestrator, '## Skills and docs on demand'],
    [orchestrator, 'references/approval-gates.md'],
    [orchestrator, 'references/classification-map.md'],
    [orchestrator, '## Pre-gate verification before parallelization'],
    [orchestrator, 'Workers do not have access to the chat history.'],
    [orchestrator, 'DONE | DONE_WITH_CONCERNS | BLOCKED'],
    [orchestrator, '## Worker status protocol'],
    [pm, '.aioson/rules/'],
    [pm, '.aioson/docs/'],
    [pm, '.aioson/context/design-doc*.md'],
    [pm, '## Skills and docs on demand'],
    [pm, 'Article IV of `constitution.md`'],
    [pm, '## Acceptance criteria format'],
    [pm, 'AC-{slug}-{N}']
  ];

  for (const [content, token] of checks) {
    assert.equal(content.includes(token), true, `missing recovered safeguard token: ${token}`);
  }
});

test('product, sheldon, and dev kernels use deterministic on-demand docs and stay within size targets', async () => {
  const product = await read(path.join(ROOT, 'template/.aioson/agents/product.md'));
  const sheldon = await read(path.join(ROOT, 'template/.aioson/agents/sheldon.md'));
  const dev = await read(path.join(ROOT, 'template/.aioson/agents/dev.md'));

  const checks = [
    [product, '## Built-in product modules'],
    [product, '## Context loading modes'],
    [product, '## Evidence-backed structured intake'],
    [product, 'Ask only after local artifacts, code evidence, memory summaries, selected context, and fresh research/cache cannot answer safely.'],
    [product, '.aioson/docs/product/conversation-playbook.md'],
    [product, '.aioson/docs/product/research-loop.md'],
    [product, '.aioson/docs/product/quality-lens.md'],
    [product, '.aioson/docs/product/prd-contract.md'],
    [product, '## Deterministic preflight'],
    [product, '## Conversation kernel'],
    [product, '## Output kernel'],
    [sheldon, '## Built-in sheldon modules'],
    [sheldon, '.aioson/docs/sheldon/research-loop.md'],
    [sheldon, '.aioson/docs/sheldon/web-intelligence.md'],
    [sheldon, '.aioson/docs/sheldon/quality-lens.md'],
    [sheldon, '.aioson/docs/sheldon/enrichment-paths.md'],
    [sheldon, '## Deterministic preflight'],
    [sheldon, '## Gap analysis and sizing kernel'],
    [dev, '## Built-in dev modules'],
    [dev, '.aioson/docs/dev/stack-conventions.md'],
    [dev, '.aioson/docs/dev/execution-discipline.md'],
    [dev, '## Deterministic preflight'],
    [dev, '## Execution invariants']
  ];

  for (const [content, token] of checks) {
    assert.equal(content.includes(token), true, `missing kernel token: ${token}`);
  }

  // Rebudgeted from 20000 -> 25000 on 2026-06-04 (@dev, agent-output-routing-bugs):
  // product/dev kernels grew past 20KB through deliberate additions
  // (active-learning-loop wiring, sub-task scout block, dossier/Agent-Trail
  // protocol, brownfield + design-doc loading rules). The on-demand-doc
  // pattern is still intact (kernels reference external docs rather than
  // inlining them), so the cap protects against accidental bloat, not
  // documented scope growth.
  // Rebudgeted from 25000 -> 30000 on 2026-06-18 for context-search discovery
  // prompts: intelligence gates are part of the agent contract, not bloat.
  // Rebudgeted 30000 -> 31000 on 2026-07-01 for full-feature autopilot wiring:
  // @product/@sheldon seed the agentic scheme + auto-invoke the next stage, and
  // @dev's phase loop carries the "one continuous drive, never self-/compact"
  // imperative. Concise pointers (detail lives in autopilot-handoff.md /
  // dev/phase-loop.md); this is contract, not bloat.
  const KERNEL_BUDGET_BYTES = 31000;
  assert.ok(Buffer.byteLength(product, 'utf8') <= KERNEL_BUDGET_BYTES, 'product kernel should stay within the generalist target');
  assert.ok(Buffer.byteLength(sheldon, 'utf8') <= KERNEL_BUDGET_BYTES, 'sheldon kernel should stay within the generalist target');
  assert.ok(Buffer.byteLength(dev, 'utf8') <= KERNEL_BUDGET_BYTES, 'dev kernel should stay within the generalist target');
});

test('product.md offers the run-mode choice on screen at kickoff (no hidden-flag reliance)', async () => {
  const product = await read(path.join(ROOT, 'template/.aioson/agents/product.md'));
  // The run mode is chosen via an on-screen question at kickoff, not by a flag the user must remember.
  assert.match(product, /Run mode/i);
  assert.match(product, /AskUserQuestion/);
  // The three choices incl. the "remember" escape hatch.
  assert.match(product, /Always autopilot in this project/);
  // Autopilot seeds the agentic scheme.
  assert.match(product, /workflow:execute \. --feature=\{slug\} --seed/);
});

test('agents run context discovery before selective loading', async () => {
  const exempt = new Set(['committer', 'neo', 'pair', 'setup', 'validator']);
  const agentDir = path.join(ROOT, 'template/.aioson/agents');
  const agentFiles = (await fs.readdir(agentDir)).filter((file) => file.endsWith('.md'));

  for (const file of agentFiles) {
    const agent = file.replace(/\.md$/, '');
    if (exempt.has(agent)) continue;

    const content = await read(path.join(agentDir, file));
    assert.match(content, /aioson context:(search|brief) .*--agent=/, `missing context discovery command (search or brief): ${agent}`);
    assert.equal(content.includes(`--agent=${agent}`), true, `context discovery must identify agent: ${agent}`);
    assert.match(content, /aioson context:(search|brief) .*2>\/dev\/null \|\| true/, `context discovery must be best-effort: ${agent}`);
  }

  for (const gatewayFile of ['template/AGENTS.md', 'template/CLAUDE.md']) {
    const content = await read(path.join(ROOT, gatewayFile));
    assert.equal(content.includes('context:brief` for precision selection'), true, `gateway missing context:brief discovery rule: ${gatewayFile}`);
    assert.equal(content.includes('Load `must_load`, treat `related` as recall hints'), true, `gateway missing context:brief loading contract: ${gatewayFile}`);
    assert.equal(content.includes('context:select` as the underlying selector/fallback'), true, `gateway missing context:select fallback contract: ${gatewayFile}`);
  }
});

test('briefing and product prompts prefer evidence-backed intake over shallow questions', async () => {
  const briefing = await read(path.join(ROOT, 'template/.aioson/agents/briefing.md'));
  const product = await read(path.join(ROOT, 'template/.aioson/agents/product.md'));
  const webResearch = await read(path.join(ROOT, 'template/.aioson/skills/static/web-research-cache.md'));

  const checks = [
    [briefing, '## Context loading modes'],
    [briefing, '### Evidence-backed structured intake'],
    [briefing, 'same terminal picker style as `commit:prepare`'],
    [briefing, 'Do not treat search snippets as evidence.'],
    [product, '## Evidence-first product discovery'],
    [product, 'same picker style as `commit:prepare`'],
    [product, 'Do not treat search snippets as evidence.'],
    [webResearch, '## Search quality model'],
    [webResearch, 'Search result snippets are routing signals, not evidence.'],
    [webResearch, 'Use adapters behind the same cache contract']
  ];

  for (const [content, token] of checks) {
    assert.equal(content.includes(token), true, `missing evidence-backed token: ${token}`);
  }
});

test('briefing contract enforces activation-only fast path before context loading', async () => {
  const briefing = await read(path.join(ROOT, 'template/.aioson/agents/briefing.md'));

  const tokens = [
    '## Activation-only fast path',
    'Evaluate this immediately after reading this file and before loading any other context, doc, or skill.',
    'names only — do not read file contents',
    'Do NOT load on activation:',
    'Load each item at the step that needs it — never all upfront',
    'On bare activation, follow the **Activation-only fast path**'
  ];

  for (const token of tokens) {
    assert.equal(briefing.includes(token), true, `missing briefing token: ${token}`);
  }

  assert.ok(
    briefing.indexOf('## Activation-only fast path') < briefing.indexOf('## Context loading modes'),
    'activation-only fast path must appear before context loading modes'
  );
  assert.ok(
    briefing.indexOf('## Activation-only fast path') < briefing.indexOf('## Activation protocol'),
    'activation-only fast path must appear before the activation protocol menu'
  );
});

test('product, sheldon, and dev on-demand docs are managed and preserve critical guidance', async () => {
  const managedDocs = [
    '.aioson/docs/product/conversation-playbook.md',
    '.aioson/docs/product/research-loop.md',
    '.aioson/docs/product/quality-lens.md',
    '.aioson/docs/product/prd-contract.md',
    '.aioson/docs/sheldon/research-loop.md',
    '.aioson/docs/sheldon/web-intelligence.md',
    '.aioson/docs/sheldon/quality-lens.md',
    '.aioson/docs/sheldon/enrichment-paths.md',
    '.aioson/docs/dev/stack-conventions.md',
    '.aioson/docs/dev/execution-discipline.md',
    '.aioson/docs/dev/simple-plan-lane.md'
  ];

  for (const file of managedDocs) {
    assert.equal(MANAGED_FILES.includes(file), true, `missing managed core-agent doc: ${file}`);
    await assert.doesNotReject(() => fs.access(path.join(ROOT, 'template', file)));
  }

  const conversationPlaybook = await read(path.join(ROOT, 'template/.aioson/docs/product/conversation-playbook.md'));
  const productResearchLoop = await read(path.join(ROOT, 'template/.aioson/docs/product/research-loop.md'));
  const productQualityLens = await read(path.join(ROOT, 'template/.aioson/docs/product/quality-lens.md'));
  const prdContract = await read(path.join(ROOT, 'template/.aioson/docs/product/prd-contract.md'));
  const sheldonResearchLoop = await read(path.join(ROOT, 'template/.aioson/docs/sheldon/research-loop.md'));
  const webIntel = await read(path.join(ROOT, 'template/.aioson/docs/sheldon/web-intelligence.md'));
  const sheldonQualityLens = await read(path.join(ROOT, 'template/.aioson/docs/sheldon/quality-lens.md'));
  const enrichmentPaths = await read(path.join(ROOT, 'template/.aioson/docs/sheldon/enrichment-paths.md'));
  const stackConventions = await read(path.join(ROOT, 'template/.aioson/docs/dev/stack-conventions.md'));
  const executionDiscipline = await read(path.join(ROOT, 'template/.aioson/docs/dev/execution-discipline.md'));
  const simplePlanLane = await read(path.join(ROOT, 'template/.aioson/docs/dev/simple-plan-lane.md'));

  const checks = [
    [conversationPlaybook, '6 - Finalize'],
    [conversationPlaybook, '### Surprise mode'],
    [conversationPlaybook, 'design_skill'],
    [productResearchLoop, '.aioson/skills/static/web-research-cache.md'],
    [productResearchLoop, '3-7'],
    [productResearchLoop, 'researchs/'],
    [productQualityLens, '## Positive patterns'],
    [productQualityLens, '## Anti-patterns and replacements'],
    [productQualityLens, '## Review scorecard'],
    [prdContract, '## Visual identity'],
    [prdContract, 'pending-selection'],
    [prdContract, 'classification'],
    [sheldonResearchLoop, '.aioson/skills/static/web-research-cache.md'],
    [sheldonResearchLoop, 'reprioritize improvements'],
    [webIntel, 'researchs/{decision-slug}/summary.md'],
    [webIntel, 'confirmed'],
    [webIntel, 'deprecated'],
    [sheldonQualityLens, '## Positive patterns'],
    [sheldonQualityLens, '## Anti-patterns and replacements'],
    [sheldonQualityLens, '## Review scorecard'],
    [enrichmentPaths, '.aioson/plans/{slug}/manifest.md'],
    [enrichmentPaths, '## Delivery plan'],
    [enrichmentPaths, 'sheldon-enrichment.md'],
    [stackConventions, 'Form Requests'],
    [stackConventions, 'design_skill'],
    [stackConventions, 'react-motion-patterns.md'],
    [executionDiscipline, 'feat(module):'],
    [executionDiscipline, 'TaskCreate'],
    [executionDiscipline, '`*update-skeleton`'],
    [executionDiscipline, 'debugging-protocol.md'],
    [simplePlanLane, '## Implementation Intelligence Checkpoint'],
    [simplePlanLane, '## Context selected'],
    [simplePlanLane, '## Implementation intelligence'],
    [simplePlanLane, '## Useful options considered'],
    [simplePlanLane, '`include now`'],
    [simplePlanLane, '`defer`'],
    [simplePlanLane, '`escalate`'],
    [simplePlanLane, 'framework leverage']
  ];

  for (const [content, token] of checks) {
    assert.equal(content.includes(token), true, `missing core-agent doc token: ${token}`);
  }
});

test('feature expansion prompts preserve operational surface completeness gates', async () => {
  const managedFiles = [
    '.aioson/docs/feature-expansion-taxonomy.md',
    '.aioson/skills/process/briefing-expansion-scout/SKILL.md',
    '.aioson/skills/process/product-scope-expansion/SKILL.md',
    '.aioson/skills/process/sheldon-expansion-audit/SKILL.md'
  ];

  for (const file of managedFiles) {
    assert.equal(MANAGED_FILES.includes(file), true, `missing managed expansion file: ${file}`);
    await assert.doesNotReject(() => fs.access(path.join(ROOT, 'template', file)));
  }

  const taxonomy = await read(path.join(ROOT, 'template/.aioson/docs/feature-expansion-taxonomy.md'));
  const briefingSkill = await read(path.join(ROOT, 'template/.aioson/skills/process/briefing-expansion-scout/SKILL.md'));
  const productSkill = await read(path.join(ROOT, 'template/.aioson/skills/process/product-scope-expansion/SKILL.md'));
  const sheldonSkill = await read(path.join(ROOT, 'template/.aioson/skills/process/sheldon-expansion-audit/SKILL.md'));
  const briefingAgent = await read(path.join(ROOT, 'template/.aioson/agents/briefing.md'));
  const productAgent = await read(path.join(ROOT, 'template/.aioson/agents/product.md'));
  const sheldonAgent = await read(path.join(ROOT, 'template/.aioson/agents/sheldon.md'));

  const checks = [
    [taxonomy, '## Operational Surface Map'],
    [taxonomy, 'A named Core object is not real scope'],
    [taxonomy, 'Workspace or account home'],
    [briefingSkill, '## Operational Surface Scout'],
    [briefingSkill, 'workspace/board/card systems'],
    [briefingSkill, 'A Core object without add/edit/list/archive behavior is a blocking gap'],
    [productSkill, '## Operational Completeness Gate'],
    [productSkill, 'Do not route to implementation while a Core object'],
    [productSkill, 'Core operational surfaces must appear in `## MVP scope`'],
    [sheldonSkill, '## Operational Surface Audit'],
    [sheldonSkill, 'missing workspace management, board/pipeline CRUD, primary item creation/editing'],
    [briefingAgent, 'rich operational surface: workspaces, boards, cards'],
    [productAgent, 'force an operational surface check'],
    [productAgent, 'Do not route to implementation while a Core action'],
    [sheldonAgent, 'audit operational surface completeness for every Core object']
  ];

  for (const [content, token] of checks) {
    assert.equal(content.includes(token), true, `missing operational surface token: ${token}`);
  }
});

test('briefing prompt drives horizontal solution exploration into a solution-options artifact', async () => {
  const briefingAgent = await read(path.join(ROOT, 'template/.aioson/agents/briefing.md'));

  const checks = [
    [briefingAgent, '### Horizontal solution exploration'],
    [briefingAgent, 'Generate 3-5 candidate solution shapes'],
    [briefingAgent, 'attach its **Operational Surface**'],
    [briefingAgent, '.aioson/briefings/{slug}/solution-options.md'],
    [briefingAgent, 'A shape is not described until its Core objects can be *managed*, not just named.'],
    [briefingAgent, 'Exception — single fixed solution']
  ];

  for (const [content, token] of checks) {
    assert.equal(content.includes(token), true, `missing horizontal exploration token: ${token}`);
  }
});

test('prototype-forge skill and briefing-refiner prototype mode are shipped and managed', async () => {
  const skillFile = '.aioson/skills/process/prototype-forge/SKILL.md';
  assert.equal(MANAGED_FILES.includes(skillFile), true, 'prototype-forge must be a managed file');
  await assert.doesNotReject(() => fs.access(path.join(ROOT, 'template', skillFile)));

  const skill = await read(path.join(ROOT, 'template', skillFile));
  const refiner = await read(path.join(ROOT, 'template/.aioson/agents/briefing-refiner.md'));

  const checks = [
    [skill, 'name: prototype-forge'],
    [skill, '## Division of labor (do not blur)'],
    [skill, '**Navigational completeness**'],
    [skill, '**Real client-side CRUD**'],
    [skill, 'Never use native `alert()`'],
    [skill, 'account/user menu'],
    [skill, 'prototype-manifest.md'],
    [skill, '## Core interactions'],
    [skill, 'aioson prototype:check'],
    [refiner, '### Generate prototype (optional visual refinement)'],
    [refiner, '.aioson/skills/process/prototype-forge/SKILL.md'],
    [refiner, '.aioson/briefings/{slug}/prototype.html'],
    [refiner, 'Rich-surface recommendation'],
    [refiner, 'recommend_prototype: true']
  ];

  for (const [content, token] of checks) {
    assert.equal(content.includes(token), true, `missing prototype token: ${token}`);
  }
});

test('prototype contract propagates the prototype across the agent chain', async () => {
  const doc = '.aioson/docs/prototype-contract.md';
  assert.equal(MANAGED_FILES.includes(doc), true, 'prototype-contract must be a managed file');
  await assert.doesNotReject(() => fs.access(path.join(ROOT, 'template', doc)));

  const contract = await read(path.join(ROOT, 'template', doc));
  const product = await read(path.join(ROOT, 'template/.aioson/agents/product.md'));
  const dev = await read(path.join(ROOT, 'template/.aioson/agents/dev.md'));
  const ux = await read(path.join(ROOT, 'template/.aioson/agents/ux-ui.md'));
  const analyst = await read(path.join(ROOT, 'template/.aioson/agents/analyst.md'));

  const checks = [
    [contract, 'name: prototype-contract'],
    [contract, '## Prototype reference'],
    [contract, 'behavior to judge the product'],
    [contract, 'Runtime smoke gate'],
    [contract, 'locked-at'],
    [contract, 'aioson prototype:check'],
    [analyst, 'aioson prototype:check'],
    [product, '## Prototype reference'],
    [product, '.aioson/docs/prototype-contract.md'],
    [product, 'recommend_prototype: true'],
    [dev, '.aioson/briefings/{slug}/prototype.html'],
    [dev, '.aioson/docs/prototype-contract.md'],
    [ux, '.aioson/docs/prototype-contract.md'],
    [analyst, '.aioson/docs/prototype-contract.md']
  ];

  for (const [content, token] of checks) {
    assert.equal(content.includes(token), true, `missing prototype-contract token: ${token}`);
  }
});

test('design-hybrid-forge ingests external DESIGN.md sources with provenance and anti-clone', async () => {
  const ref = 'template/.aioson/skills/process/design-hybrid-forge/references/external-source-ingestion.md';
  await assert.doesNotReject(() => fs.access(path.join(ROOT, ref)));

  const ingestion = await read(path.join(ROOT, ref));
  const skill = await read(path.join(ROOT, 'template/.aioson/skills/process/design-hybrid-forge/SKILL.md'));
  const agent = await read(path.join(ROOT, 'template/.aioson/agents/design-hybrid-forge.md'));

  const checks = [
    [ingestion, 'refero.design'],
    [ingestion, 'DESIGN.md'],
    [ingestion, '## Provenance (mandatory)'],
    [ingestion, '## Anti-clone (hard)'],
    [skill, 'external-source-ingestion.md'],
    [agent, 'external-source-ingestion.md'],
    [agent, 'Anti-clone:']
  ];

  for (const [content, token] of checks) {
    assert.equal(content.includes(token), true, `missing external-source token: ${token}`);
  }
});

test('AIOSON Play compatibility docs are shipped and managed', async () => {
  const managedDocs = [
    '.aioson/docs/play/README.md',
    '.aioson/docs/play/agent-usage-guide.md',
    '.aioson/docs/play/app-compatibility-guide.md',
    '.aioson/docs/play/auth-services-and-testing.md',
    '.aioson/docs/play/llm-data-and-bindings.md',
    '.aioson/docs/play/manifest-and-runtime.md',
    '.aioson/docs/play/source-map.md'
  ];

  for (const file of managedDocs) {
    assert.equal(MANAGED_FILES.includes(file), true, `missing managed Play doc: ${file}`);
    await assert.doesNotReject(() => fs.access(path.join(ROOT, 'template', file)));
  }

  const readme = await read(path.join(ROOT, 'template/.aioson/docs/play/README.md'));
  const bindings = await read(path.join(ROOT, 'template/.aioson/docs/play/llm-data-and-bindings.md'));
  const runtime = await read(path.join(ROOT, 'template/.aioson/docs/play/manifest-and-runtime.md'));

  assert.equal(readme.includes('ProductBridge'), true);
  assert.equal(bindings.includes('data_bindings'), true);
  assert.equal(bindings.includes('DATABASE_URL'), true);
  assert.equal(runtime.includes('/api/aioson-play'), true);
});

test('product contract enforces activation-only fast path before source and context loading', async () => {
  const product = await read(path.join(ROOT, 'template/.aioson/agents/product.md'));

  const tokens = [
    '## Activation-only fast path',
    'Evaluate this immediately after reading this file and before loading any other context, doc, or skill.',
    'names only — no file contents',
    'Do NOT load on activation:',
    'On bare activation, follow the **Activation-only fast path**.'
  ];

  for (const token of tokens) {
    assert.equal(product.includes(token), true, `missing product token: ${token}`);
  }

  assert.ok(
    product.indexOf('## Activation-only fast path') < product.indexOf('## Context loading modes'),
    'activation-only fast path must appear before context loading modes'
  );
  assert.ok(
    product.indexOf('## Activation-only fast path') < product.indexOf('## Source document detection'),
    'activation-only fast path must appear before source document detection'
  );
});

test('sheldon and analyst contracts enforce activation-only fast path before heavy loading', async () => {
  const sheldon = await read(path.join(ROOT, 'template/.aioson/agents/sheldon.md'));
  const analyst = await read(path.join(ROOT, 'template/.aioson/agents/analyst.md'));

  const sheldonTokens = [
    '## Activation-only fast path',
    '## Context loading modes',
    'names only — no contents',
    'Do NOT load on activation:',
    'after the target PRD is selected (RF-01) — never on bare activation',
    'On bare activation, follow the **Activation-only fast path**.'
  ];
  const analystTokens = [
    '## Activation-only fast path',
    'names only — no contents',
    'Do NOT load on activation:',
    'Run the full tool-first preflight only after a concrete task or feature is named.',
    'On bare activation, follow the **Activation-only fast path**.'
  ];

  for (const token of sheldonTokens) {
    assert.equal(sheldon.includes(token), true, `missing sheldon token: ${token}`);
  }
  for (const token of analystTokens) {
    assert.equal(analyst.includes(token), true, `missing analyst token: ${token}`);
  }

  assert.ok(
    sheldon.indexOf('## Activation-only fast path') < sheldon.indexOf('## Context loading modes'),
    'sheldon fast path must appear before context loading modes'
  );
  assert.ok(
    sheldon.indexOf('## Activation-only fast path') < sheldon.indexOf('## PRD target detection'),
    'sheldon fast path must appear before PRD target detection'
  );
  assert.equal(
    sheldon.includes('## Project rules, docs & design docs'),
    false,
    'sheldon must not keep the eager rules/docs loading section'
  );
  assert.ok(
    analyst.indexOf('## Activation-only fast path') < analyst.indexOf('## Context loading modes'),
    'analyst fast path must appear before context loading modes'
  );
  assert.ok(
    analyst.indexOf('## Activation-only fast path') < analyst.indexOf('## Tool-first session preflight'),
    'analyst fast path must appear before the tool-first preflight'
  );
});

test('no template agent keeps the eager rules/docs loading section', async () => {
  const agentsDir = path.join(ROOT, 'template/.aioson/agents');
  const entries = await fs.readdir(agentsDir);
  const agentFiles = entries.filter((name) => name.endsWith('.md'));

  assert.ok(agentFiles.length > 0, 'template should ship agents');

  for (const name of agentFiles) {
    const content = await read(path.join(agentsDir, name));
    assert.equal(
      content.includes('## Project rules,'),
      false,
      `agent must use on-demand context loading instead of the eager section (any variant): ${name}`
    );
  }
});

test('mid-flow workflow agents carry an activation guard', async () => {
  const agents = ['architect', 'ux-ui', 'pm', 'qa', 'orchestrator', 'scope-check', 'discovery-design-doc'];

  for (const agent of agents) {
    const content = await read(path.join(ROOT, 'template/.aioson/agents', `${agent}.md`));
    assert.equal(content.includes('## Activation guard'), true, `missing activation guard: ${agent}`);
    assert.equal(
      content.includes('agent activation without concrete task'),
      true,
      `activation guard must use the activation-only selector task: ${agent}`
    );
  }

  const qa = await read(path.join(ROOT, 'template/.aioson/agents/qa.md'));
  assert.equal(qa.includes('## Context loading modes'), true, 'qa must use context loading modes');
  assert.ok(
    qa.indexOf('## Activation guard') < qa.indexOf('## Context loading modes'),
    'qa activation guard must come before context loading modes'
  );
});

test('template rules carry routing frontmatter so context:select can load them on demand', async () => {
  const rulesDir = path.join(ROOT, 'template/.aioson/rules');
  const entries = await fs.readdir(rulesDir);
  const ruleFiles = entries.filter(
    (name) => name.endsWith('.md') && name.toLowerCase() !== 'readme.md'
  );

  assert.ok(ruleFiles.length > 0, 'template should ship rules');

  for (const name of ruleFiles) {
    const content = await read(path.join(rulesDir, name));
    const frontmatter = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
    assert.ok(frontmatter, `rule must have frontmatter: ${name}`);
    const alwaysLoaded = /^load_tier:\s*always\s*$/m.test(frontmatter[1]);
    const hasRouting = /^(task_types|triggers|paths):\s*\[.+\]\s*$/m.test(frontmatter[1]);
    assert.ok(
      alwaysLoaded || hasRouting,
      `rule must declare task_types/triggers/paths or load_tier: always: ${name}`
    );
  }
});

test('deyvin contract prioritizes memory and hard-gates oversized requests', async () => {
  const deyvin = await read(path.join(ROOT, 'template/.aioson/agents/deyvin.md'));

  const tokens = [
    '## Activation-only fast path',
    'Evaluate this immediately after the bootstrap gate and before loading any process skill',
    '## Immediate scope gate',
    'do not start implementation',
    '## Built-in deyvin modules',
    '.aioson/docs/deyvin/continuity-recovery.md',
    '.aioson/docs/deyvin/pair-execution.md',
    '.aioson/docs/deyvin/runtime-handoffs.md',
    '.aioson/docs/deyvin/debugging-escalation.md',
    '## Deterministic preflight',
    '.aioson/skills/process/aioson-spec-driven/SKILL.md',
    'references/deyvin.md',
    'Implementation Intelligence Checkpoint',
    'A simple plan without `Context selected`, `Implementation intelligence`, and `Useful options considered` is weak',
    'say what is confirmed vs inferred'
  ];

  for (const token of tokens) {
    assert.equal(deyvin.includes(token), true, `missing deyvin token: ${token}`);
  }

  assert.ok(
    deyvin.indexOf('## Activation-only fast path') < deyvin.indexOf('## Memory awareness preflight'),
    'activation-only fast path must run before broader memory preflight'
  );
  assert.ok(
    deyvin.indexOf('## Activation-only fast path') < deyvin.indexOf('.aioson/skills/process/aioson-spec-driven/SKILL.md'),
    'activation-only fast path must appear before SDD loading guidance'
  );
});

test('simple plan lane requires implementation intelligence before coding', async () => {
  const simplePlanDoc = await read(path.join(ROOT, 'template/.aioson/docs/dev/simple-plan-lane.md'));
  const simplePlanRule = await read(path.join(ROOT, 'template/.aioson/rules/simple-plan-lane.md'));
  const dev = await read(path.join(ROOT, 'template/.aioson/agents/dev.md'));
  const deyvin = await read(path.join(ROOT, 'template/.aioson/agents/deyvin.md'));

  const checks = [
    [simplePlanDoc, '## Implementation Intelligence Checkpoint'],
    [simplePlanDoc, '## Context selected'],
    [simplePlanDoc, '## Implementation intelligence'],
    [simplePlanDoc, '## Useful options considered'],
    [simplePlanDoc, 'A valid simple plan is not just a TODO list.'],
    [simplePlanRule, 'A simple plan is not valid as a bare TODO list.'],
    [simplePlanRule, 'useful options considered as `include now`, `defer`, or `escalate`'],
    [dev, 'If missing `Context selected`, `Implementation intelligence`, or `Useful options considered`, enrich first'],
    [dev, 'selected context, existing pattern, framework leverage, structure/data boundary'],
    [deyvin, 'complete its Implementation Intelligence Checkpoint'],
    [deyvin, 'enrich it before coding']
  ];

  for (const [content, token] of checks) {
    assert.equal(content.includes(token), true, `missing simple-plan intelligence token: ${token}`);
  }
});

test('implementation verification loop is wired into dev, deyvin, scope-check, and qa prompts', async () => {
  const dev = await read(path.join(ROOT, 'template/.aioson/agents/dev.md'));
  const deyvin = await read(path.join(ROOT, 'template/.aioson/agents/deyvin.md'));
  const scopeCheck = await read(path.join(ROOT, 'template/.aioson/agents/scope-check.md'));
  const qa = await read(path.join(ROOT, 'template/.aioson/agents/qa.md'));

  const checks = [
    [dev, '## Implementation verification ledger'],
    [dev, 'aioson verify:implementation . --feature={slug} --prepare-ledger --json'],
    [dev, 'ready_for_prompt:false'],
    [dev, 'NEEDS_DEV_FIX` blocks dev handoff'],
    [dev, 'External auditors are opt-in only'],
    [deyvin, '.aioson/context/features/{slug}/implementation-ledger.md'],
    [deyvin, 'aioson verify:implementation --prepare-ledger/--check-ledger'],
    [scopeCheck, '## Implementation verification reports'],
    [scopeCheck, 'Implementation verification briefing'],
    [scopeCheck, 'Do not run `--tool` from `@scope-check`'],
    [scopeCheck, 'verification-runs/*-report.md'],
    [scopeCheck, 'NEEDS_SCOPE_DECISION`: route to `@product` or `@sheldon`'],
    [qa, '## Implementation verification evidence'],
    [qa, 'aioson verify:implementation . --feature={slug} --check-report=<path> --policy=strict --json'],
    [qa, 'Absence of a report is not itself a failure']
  ];

  for (const [content, token] of checks) {
    assert.equal(content.includes(token), true, `missing implementation verification token: ${token}`);
  }
});

test('gateway SDD guidance is on-demand and excludes deyvin activation-only recovery', async () => {
  const agentsGateway = await read(path.join(ROOT, 'template/AGENTS.md'));
  const claudeGateway = await read(path.join(ROOT, 'template/CLAUDE.md'));
  const specSkill = await read(path.join(ROOT, 'template/.aioson/skills/process/aioson-spec-driven/SKILL.md'));

  assert.equal(claudeGateway.includes('agents load this automatically'), false);

  const checks = [
    [agentsGateway, 'For concrete spec/workflow work'],
    [agentsGateway, 'A bare `@deyvin` activation is not spec work'],
    [agentsGateway, 'not during `@deyvin` activation-only recovery'],
    [claudeGateway, 'agents load this on demand for concrete spec/workflow work'],
    [claudeGateway, '/deyvin` activation-only recovery must not load it'],
    [specSkill, 'Do not load this skill for `@deyvin` activation-only recovery']
  ];

  for (const [content, token] of checks) {
    assert.equal(content.includes(token), true, `missing on-demand SDD token: ${token}`);
  }
});

test('gateway memory + workflow-enforcement contracts stay in sync across harnesses', async () => {
  const claudeGateway = await read(path.join(ROOT, 'template/CLAUDE.md'));
  const agentsGateway = await read(path.join(ROOT, 'template/AGENTS.md'));

  // Cross-harness continuity contract: a task paused in one harness (e.g. Claude
  // Code) and resumed in another (e.g. Codex) must load the SAME operator memory
  // and obey the SAME workflow-enforcement boundary. These invariants must appear
  // in BOTH gateways verbatim, or the two onboarding files silently drift and a
  // handoff stops feeling routine. Harness-specific wording (slash vs @,
  // --tool=claude vs --tool=<tool>) is intentionally NOT asserted.
  const sharedInvariants = [
    'AIOSON_OPERATOR_MEMORY=false',
    '~/.aioson/operators/{sha256(git-email)[0..16]}/MEMORY.md',
    'conflicts with a loaded decision, the project rule wins',
    'set: skip silently',
    'aioson op:capture --signal=',
    'the CLI controls all routing, state, and event emission',
    'for tracked workflow sessions'
  ];

  for (const token of sharedInvariants) {
    assert.equal(claudeGateway.includes(token), true, `CLAUDE.md missing shared cross-harness invariant: ${token}`);
    assert.equal(agentsGateway.includes(token), true, `AGENTS.md missing shared cross-harness invariant: ${token}`);
  }
});

test('deyvin on-demand docs are managed and preserve continuity, runtime, and debugging safeguards', async () => {
  const managedDocs = [
    '.aioson/docs/deyvin/continuity-recovery.md',
    '.aioson/docs/deyvin/pair-execution.md',
    '.aioson/docs/deyvin/runtime-handoffs.md',
    '.aioson/docs/deyvin/debugging-escalation.md'
  ];

  for (const file of managedDocs) {
    assert.equal(MANAGED_FILES.includes(file), true, `missing managed deyvin doc: ${file}`);
    await assert.doesNotReject(() => fs.access(path.join(ROOT, 'template', file)));
  }

  const continuity = await read(path.join(ROOT, 'template/.aioson/docs/deyvin/continuity-recovery.md'));
  const pairExecution = await read(path.join(ROOT, 'template/.aioson/docs/deyvin/pair-execution.md'));
  const runtimeHandoffs = await read(path.join(ROOT, 'template/.aioson/docs/deyvin/runtime-handoffs.md'));
  const debuggingEscalation = await read(path.join(ROOT, 'template/.aioson/docs/deyvin/debugging-escalation.md'));

  const checks = [
    [continuity, 'memory-index.md'],
    [continuity, 'spec-current.md'],
    [continuity, 'spec-history.md'],
    [continuity, 'Git is a fallback'],
    [continuity, '.aioson/skills/process/aioson-spec-driven/SKILL.md'],
    [continuity, 'references/deyvin.md'],
    [pairExecution, 'update `spec.md`'],
    [pairExecution, 'update `skeleton-system.md`'],
    [pairExecution, 'context:pack'],
    [runtimeHandoffs, 'aioson live:handoff . --agent=deyvin --to=<next-agent>'],
    [runtimeHandoffs, 'aioson runtime:session:start . --agent=deyvin'],
    [debuggingEscalation, '.aioson/skills/static/debugging-protocol.md'],
    [debuggingEscalation, 'After 3 failed fix attempts']
  ];

  for (const [content, token] of checks) {
    assert.equal(content.includes(token), true, `missing deyvin doc token: ${token}`);
  }
});

test('squad and genome contracts stay canonical and preserve squad package and genome binding rules', async () => {
  const squad = await read(path.join(ROOT, 'template/.aioson/agents/squad.md'));
  const genome = await read(path.join(ROOT, 'template/.aioson/agents/genome.md'));

  const squadTokens = [
    'LANGUAGE BOUNDARY',
    '## Built-in squad modules',
    '## Deterministic preflight',
    '.aioson/docs/squad/package-contract.md',
    '.aioson/docs/squad/creation-flow.md',
    '.aioson/docs/squad/research-loop.md',
    '.aioson/docs/squad/quality-lens.md',
    '.aioson/docs/squad/workflow-quality.md',
    '.aioson/docs/squad/content-output.md',
    '.aioson/docs/squad/session-operations.md',
    '.aioson/docs/squad/genome-bindings.md',
    '.aioson/tasks/squad-design.md',
    '.aioson/tasks/squad-create.md',
    '.aioson/tasks/squad-validate.md',
    '.aioson/squads/{squad-slug}/agents/',
    '.aioson/squads/{squad-slug}/squad.manifest.json',
    'AGENTS.md',
    'output/{squad-slug}/{session-id}.html',
    'aioson-logs/{squad-slug}/'
  ];
  const genomeTokens = [
    'interaction_language',
    '## Persona Pipeline Integration',
    'version: 3',
    'format: genome-v3',
    'genomeBindings',
    '.aioson/squads/{slug}/squad.md',
    '.aioson/squads/{squad-slug}/agents/',
    'Do not modify official `.aioson/agents/` files with user custom genomes',
    'The Genome 2.0 should not become verbose by default'
  ];

  for (const token of squadTokens) {
    assert.equal(squad.includes(token), true, `missing squad token: ${token}`);
  }
  for (const token of genomeTokens) {
    assert.equal(genome.includes(token), true, `missing genome token: ${token}`);
  }
  assert.ok(Buffer.byteLength(squad, 'utf8') <= 12000, 'squad kernel should stay within the orchestrator prompt target');
});

test('squad creation defaults to investigation and runs the genome pass', async () => {
  const creationFlow = await read(path.join(ROOT, 'template/.aioson/docs/squad/creation-flow.md'));
  const packageContract = await read(path.join(ROOT, 'template/.aioson/docs/squad/package-contract.md'));
  const squadDesign = await read(path.join(ROOT, 'template/.aioson/tasks/squad-design.md'));
  const squadCreate = await read(path.join(ROOT, 'template/.aioson/tasks/squad-create.md'));
  const orache = await read(path.join(ROOT, 'template/.aioson/agents/orache.md'));
  const squad = await read(path.join(ROOT, 'template/.aioson/agents/squad.md'));

  const checks = [
    [creationFlow, '## Investigation default (opt-out)'],
    [creationFlow, '## Genome pass (deepen executors at creation)'],
    [creationFlow, 'Never ask "want me to investigate?" as an open question'],
    [squadDesign, 'run investigation by default (opt-out)'],
    [squadDesign, 'default to an `@orache` Quick Scan'],
    [squadDesign, 'the create phase generates and binds them (`squad-create` Step 5.5)'],
    [squadCreate, '### Step 5.5 - Genome Pass (bind or queue genomes)'],
    [squadCreate, 'reuse before generating'],
    [squadCreate, '`genomeBindings` entry with `status: pending`'],
    [packageContract, '`## Active genomes` lists the genomes bound to this executor'],
    [orache, '@squad investigates by default (opt-out'],
    [squad, 'or the create-phase genome pass (`squad-create` Step 5.5)']
  ];

  for (const [content, token] of checks) {
    assert.equal(content.includes(token), true, `missing squad-quality token: ${token}`);
  }
});

test('squad on-demand docs are shipped, managed, and preserve critical guidance', async () => {
  const managedDocs = [
    '.aioson/docs/squad/package-contract.md',
    '.aioson/docs/squad/creation-flow.md',
    '.aioson/docs/squad/research-loop.md',
    '.aioson/docs/squad/quality-lens.md',
    '.aioson/docs/squad/workflow-quality.md',
    '.aioson/docs/squad/content-output.md',
    '.aioson/docs/squad/session-operations.md',
    '.aioson/docs/squad/genome-bindings.md'
  ];

  for (const file of managedDocs) {
    assert.equal(MANAGED_FILES.includes(file), true, `missing managed squad doc: ${file}`);
    await assert.doesNotReject(() => fs.access(path.join(ROOT, 'template', file)));
  }

  const packageContract = await read(path.join(ROOT, 'template/.aioson/docs/squad/package-contract.md'));
  const creationFlow = await read(path.join(ROOT, 'template/.aioson/docs/squad/creation-flow.md'));
  const squadResearchLoop = await read(path.join(ROOT, 'template/.aioson/docs/squad/research-loop.md'));
  const squadQualityLens = await read(path.join(ROOT, 'template/.aioson/docs/squad/quality-lens.md'));
  const workflowQuality = await read(path.join(ROOT, 'template/.aioson/docs/squad/workflow-quality.md'));
  const contentOutput = await read(path.join(ROOT, 'template/.aioson/docs/squad/content-output.md'));
  const sessionOps = await read(path.join(ROOT, 'template/.aioson/docs/squad/session-operations.md'));
  const genomeBindings = await read(path.join(ROOT, 'template/.aioson/docs/squad/genome-bindings.md'));

  const checks = [
    [packageContract, '.aioson/squads/{squad-slug}/agents/agents.md'],
    [packageContract, '.aioson/squads/{squad-slug}/squad.manifest.json'],
    [packageContract, '.aioson/squads/{squad-slug}/squad.md'],
    [packageContract, 'CLAUDE.md'],
    [packageContract, 'AGENTS.md'],
    [creationFlow, 'single block'],
    [creationFlow, 'high autonomy'],
    [creationFlow, 'dominant-driver'],
    [squadResearchLoop, '.aioson/skills/static/web-research-cache.md'],
    [squadResearchLoop, 'executor vocabulary'],
    [squadResearchLoop, '@orache'],
    [squadQualityLens, '## Positive patterns'],
    [squadQualityLens, '## Anti-patterns and replacements'],
    [squadQualityLens, '## Review scorecard'],
    [workflowQuality, 'modelTier'],
    [workflowQuality, 'review'],
    [workflowQuality, 'warm-up'],
    [contentOutput, 'contentBlueprints'],
    [contentOutput, 'content.json'],
    [contentOutput, 'output/{squad-slug}/{session-id}.html'],
    [sessionOps, 'ephemeral'],
    [sessionOps, '@orache'],
    [sessionOps, 'learnings/index.md'],
    [sessionOps, 'CronCreate'],
    [genomeBindings, 'genomeBindings'],
    [genomeBindings, '## Active genomes'],
    [genomeBindings, '.aioson/squads/{slug}/squad.md']
  ];

  for (const [content, token] of checks) {
    assert.equal(content.includes(token), true, `missing squad doc token: ${token}`);
  }
});

test('copywriter discovers genomes via INDEX and honors operational sections', async () => {
  const copywriter = await read(path.join(ROOT, 'template/.aioson/agents/copywriter.md'));

  const tokens = [
    '## Activation-only fast path',
    '.aioson/genomes/INDEX.md',
    '### Step G2.4 — Installed genome menu (INDEX-driven discovery)',
    'marketing pages, content pieces, site copy, and system/UI microcopy alike',
    '**Operational sections are binding.**',
    '`## Operating Procedure` — work the method\'s numbered steps',
    'run it in Phase 5 in addition to the anti-pattern checklist',
    'A selected genome\'s `## Prohibitions` are hard constraints'
  ];

  for (const token of tokens) {
    assert.equal(copywriter.includes(token), true, `missing copywriter token: ${token}`);
  }

  assert.ok(
    copywriter.indexOf('## Activation-only fast path') < copywriter.indexOf('## Phase 1'),
    'copywriter fast path must appear before Phase 1 context gathering'
  );
  assert.ok(
    copywriter.indexOf('### Step G2.4') < copywriter.indexOf('### Step G2.5'),
    'INDEX-driven menu must come before the hardcoded master fallback'
  );
});

test('persona pipeline encodes the operational method, not just identity', async () => {
  const enricher = await read(path.join(ROOT, 'template/.aioson/agents/profiler-enricher.md'));
  const forge = await read(path.join(ROOT, 'template/.aioson/agents/profiler-forge.md'));
  const genome = await read(path.join(ROOT, 'template/.aioson/agents/genome.md'));
  const bindings = await read(path.join(ROOT, 'template/.aioson/docs/squad/genome-bindings.md'));

  const checks = [
    [enricher, '### Module 9 - Operational method (what they DO, not just who they ARE)'],
    [enricher, '## Operational Method'],
    [enricher, '### Delivery Checklist'],
    [enricher, 'do not invent one'],
    [forge, '- `## Operating Procedure`'],
    [forge, '- `## Prohibitions`'],
    [forge, '- `## Delivery Checklist`'],
    [forge, 'simulates opinions, not work'],
    [genome, 'recognize the operational sections `## Operating Procedure`'],
    [genome, 'treat a missing `## Operating Procedure` as a generation defect'],
    [bindings, '## Operational propagation'],
    [bindings, '`## Prohibitions` → each becomes a line in the executor\'s `## Hard constraints`'],
    [bindings, 'binding a genome that changes nothing in the executor prompt is a defect']
  ];

  for (const [content, token] of checks) {
    assert.equal(content.includes(token), true, `missing operational-method token: ${token}`);
  }
});

test('profiler agents ship canonical prompts with interaction-language guidance', async () => {
  const researcher = await read(path.join(ROOT, 'template/.aioson/agents/profiler-researcher.md'));
  const enricher = await read(path.join(ROOT, 'template/.aioson/agents/profiler-enricher.md'));
  const forge = await read(path.join(ROOT, 'template/.aioson/agents/profiler-forge.md'));

  const checks = [
    [researcher, ['interaction_language', '## Mission', '## Step 2 - Research protocol', 'research-report.md']],
    [enricher, ['interaction_language', '## Mission', '## Step 3 - Extract the cognitive profile', 'enriched-profile.md']],
    [forge, ['interaction_language', '## Mission', 'Genome 3.0', 'Advisor Agent', 'format: genome-v3', '.aioson/advisors/']]
  ];

  for (const [content, tokens] of checks) {
    for (const token of tokens) {
      assert.equal(content.includes(token), true, `missing profiler token: ${token}`);
    }
    assert.equal(content.includes('INSTRUÇÃO ABSOLUTA'), false);
    assert.equal(content.includes('INSTRUCAO ABSOLUTA'), false);
  }
});

test('packaged design skills are shipped and managed', async () => {
  const templateRoot = path.join(ROOT, 'template');
  const designSkillFiles = await collectFiles(path.join(templateRoot, '.aioson/skills/design'));
  const managedPaths = designSkillFiles
    .map((file) => path.relative(templateRoot, file).split(path.sep).join('/'))
    .sort();

  assert.equal(managedPaths.length > 0, true);

  for (const file of managedPaths) {
    assert.equal(MANAGED_FILES.includes(file), true, `missing managed file: ${file}`);
    await assert.doesNotReject(() => fs.access(path.join(templateRoot, file)));
  }
});

test('agent definitions expose PRD dependencies for the living PRD flow', () => {
  const product = AGENT_DEFINITIONS.find((agent) => agent.id === 'product');
  const ux = AGENT_DEFINITIONS.find((agent) => agent.id === 'ux-ui');
  const pm = AGENT_DEFINITIONS.find((agent) => agent.id === 'pm');
  const deyvin = AGENT_DEFINITIONS.find((agent) => agent.id === 'deyvin');

  assert.equal(product.dependsOn.includes('.aioson/context/project.context.md'), true);
  assert.equal(deyvin.dependsOn.includes('.aioson/context/project.context.md'), true);
  assert.deepEqual(deyvin.aliases, ['pair']);
  assert.equal(ux.dependsOn.some((dep) => dep.includes('prd')), true);
  assert.equal(pm.dependsOn.some((dep) => dep.includes('prd')), true);
  assert.equal(String(ux.output).includes('Visual identity enrichment'), true);
  assert.equal(String(pm.output).includes('acceptance criteria'), true);
});
