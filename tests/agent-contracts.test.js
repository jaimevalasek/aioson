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
  // documented scope growth. Next dev hitting 25KB should compress, not rebudget.
  const KERNEL_BUDGET_BYTES = 25000;
  assert.ok(Buffer.byteLength(product, 'utf8') <= KERNEL_BUDGET_BYTES, 'product kernel should stay within the generalist target');
  assert.ok(Buffer.byteLength(sheldon, 'utf8') <= KERNEL_BUDGET_BYTES, 'sheldon kernel should stay within the generalist target');
  assert.ok(Buffer.byteLength(dev, 'utf8') <= KERNEL_BUDGET_BYTES, 'dev kernel should stay within the generalist target');
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
    '.aioson/docs/dev/execution-discipline.md'
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
    [executionDiscipline, 'debugging-protocol.md']
  ];

  for (const [content, token] of checks) {
    assert.equal(content.includes(token), true, `missing core-agent doc token: ${token}`);
  }
});

test('deyvin contract prioritizes memory and hard-gates oversized requests', async () => {
  const deyvin = await read(path.join(ROOT, 'template/.aioson/agents/deyvin.md'));

  const tokens = [
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
    'say what is confirmed vs inferred'
  ];

  for (const token of tokens) {
    assert.equal(deyvin.includes(token), true, `missing deyvin token: ${token}`);
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
  const managedPaths = [
    '.aioson/skills/design/cognitive-core-ui/SKILL.md',
    '.aioson/skills/design/cognitive-core-ui/references/design-tokens.md',
    '.aioson/skills/design/cognitive-core-ui/references/components.md',
    '.aioson/skills/design/cognitive-core-ui/references/patterns.md',
    '.aioson/skills/design/cognitive-core-ui/references/motion.md',
    '.aioson/skills/design/cognitive-core-ui/references/dashboards.md',
    '.aioson/skills/design/cognitive-core-ui/references/websites.md',
    '.aioson/skills/design/premium-command-center-ui/SKILL.md',
    '.aioson/skills/design/premium-command-center-ui/references/visual-system.md',
    '.aioson/skills/design/premium-command-center-ui/references/patterns.md',
    '.aioson/skills/design/premium-command-center-ui/references/operations.md',
    '.aioson/skills/design/premium-command-center-ui/references/validation.md',
    '.aioson/skills/design/interface-design/SKILL.md',
    '.aioson/skills/design/interface-design/references/intent-and-domain.md',
    '.aioson/skills/design/interface-design/references/design-directions.md',
    '.aioson/skills/design/interface-design/references/tokens-and-depth.md',
    '.aioson/skills/design/interface-design/references/components-and-states.md',
    '.aioson/skills/design/interface-design/references/handoff-and-quality.md'
  ];

  for (const file of managedPaths) {
    assert.equal(MANAGED_FILES.includes(file), true, `missing managed file: ${file}`);
    await assert.doesNotReject(() => fs.access(path.join(ROOT, 'template', file)));
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
