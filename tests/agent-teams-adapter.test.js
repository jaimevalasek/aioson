'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const {
  translateToTeamConfig,
  writeTeamConfig,
  resolveEngine,
  executorToTeammate,
  planToTeamTasks,
  mapExecutorType
} = require('../src/squad/agent-teams-adapter');

async function makeTempDir() {
  return fs.mkdtemp(path.join(os.tmpdir(), 'aioson-agent-teams-'));
}

const SAMPLE_MANIFEST = {
  slug: 'content-team',
  name: 'Content Team',
  mission: 'Produce viral YouTube content',
  executors: [
    { slug: 'researcher', title: 'Researcher', role: 'Researches topics', type: 'agent', modelTier: 'balanced' },
    { slug: 'scriptwriter', title: 'Script Writer', role: 'Writes scripts', type: 'agent', modelTier: 'powerful' },
    { slug: 'editor', title: 'Editor', role: 'Reviews and edits', type: 'reviewer', modelTier: 'fast' }
  ],
  budget: {
    max_tokens_per_session: 200000,
    max_tokens_per_task: 20000
  },
  anti_loop: { threshold: 8, action: 'feedback' }
};

const SAMPLE_PLAN = {
  tasks: [
    {
      id: 'task-1',
      title: 'Research Topic',
      description: 'Research the YouTube trend',
      executor: 'researcher',
      wave: 1,
      dependencies: [],
      must_haves: {
        artifacts: ['output/research.md'],
        key_links: ['output/research.md']
      },
      read_first_hints: ['context/brief.md']
    },
    {
      id: 'task-2',
      title: 'Write Script',
      description: 'Write the episode script',
      executor: 'scriptwriter',
      wave: 2,
      dependencies: ['task-1'],
      acceptance_criteria: ['Script has hook in first 15s']
    }
  ]
};

// ─── mapExecutorType ─────────────────────────────────────────────────────────

test('mapExecutorType maps known types correctly', () => {
  assert.equal(mapExecutorType('agent'), 'subagent');
  assert.equal(mapExecutorType('worker'), 'worker');
  assert.equal(mapExecutorType('clone'), 'subagent');
  assert.equal(mapExecutorType('human-gate'), 'gate');
  assert.equal(mapExecutorType('research'), 'research');
  assert.equal(mapExecutorType('reviewer'), 'subagent');
  assert.equal(mapExecutorType('skill'), 'skill');
});

test('mapExecutorType defaults unknown types to subagent', () => {
  assert.equal(mapExecutorType('unknown'), 'subagent');
  assert.equal(mapExecutorType(undefined), 'subagent');
  assert.equal(mapExecutorType(''), 'subagent');
});

// ─── executorToTeammate ──────────────────────────────────────────────────────

test('executorToTeammate maps basic executor fields', () => {
  const executor = { slug: 'dev', title: 'Developer', role: 'Writes code', type: 'agent' };
  const teammate = executorToTeammate(executor, 'backend', '/project');

  assert.equal(teammate.name, 'dev');
  assert.equal(teammate.role, 'Writes code');
  assert.equal(teammate.type, 'subagent');
});

test('executorToTeammate maps modelTier to model name', () => {
  const powerful = executorToTeammate({ slug: 'a', type: 'agent', modelTier: 'powerful' }, 'sq', '/p');
  const balanced = executorToTeammate({ slug: 'b', type: 'agent', modelTier: 'balanced' }, 'sq', '/p');
  const fast = executorToTeammate({ slug: 'c', type: 'agent', modelTier: 'fast' }, 'sq', '/p');

  assert.equal(powerful.model, 'opus');
  assert.equal(balanced.model, 'sonnet');
  assert.equal(fast.model, 'haiku');
});

test('executorToTeammate uses title as role fallback', () => {
  const executor = { slug: 'writer', title: 'Script Writer', type: 'agent' };
  const teammate = executorToTeammate(executor, 'sq', '/p');
  assert.equal(teammate.role, 'Script Writer');
});

test('executorToTeammate uses slug as role fallback when no title or role', () => {
  const executor = { slug: 'dev', type: 'agent' };
  const teammate = executorToTeammate(executor, 'sq', '/p');
  assert.equal(teammate.role, 'dev');
});

test('executorToTeammate includes skills when specified', () => {
  const executor = { slug: 'dev', type: 'agent', skills: ['aioson:dev', 'aioson:qa'] };
  const teammate = executorToTeammate(executor, 'sq', '/p');
  assert.deepEqual(teammate.skills, ['aioson:dev', 'aioson:qa']);
});

test('executorToTeammate uses custom file path when provided', () => {
  const executor = { slug: 'dev', type: 'agent', file: 'custom/agents/dev.md' };
  const teammate = executorToTeammate(executor, 'sq', '/project');
  assert.ok(teammate.agentFile.includes('custom/agents/dev.md'));
});

// ─── planToTeamTasks ─────────────────────────────────────────────────────────

test('planToTeamTasks converts tasks to team task format', () => {
  const tasks = planToTeamTasks(SAMPLE_PLAN, SAMPLE_MANIFEST.executors);

  assert.equal(tasks.length, 2);
  assert.equal(tasks[0].id, 'task-1');
  assert.equal(tasks[0].title, 'Research Topic');
  assert.equal(tasks[0].assignTo, 'researcher');
});

test('planToTeamTasks preserves dependencies', () => {
  const tasks = planToTeamTasks(SAMPLE_PLAN, SAMPLE_MANIFEST.executors);
  assert.deepEqual(tasks[1].dependencies, ['task-1']);
});

test('planToTeamTasks maps must_haves artifacts to acceptance criteria', () => {
  const tasks = planToTeamTasks(SAMPLE_PLAN, SAMPLE_MANIFEST.executors);
  const task1 = tasks[0];

  assert.ok(task1.acceptance_criteria.some((c) => c.includes('output/research.md')));
});

test('planToTeamTasks maps must_haves key_links to acceptance criteria', () => {
  const tasks = planToTeamTasks(SAMPLE_PLAN, SAMPLE_MANIFEST.executors);
  const task1 = tasks[0];

  assert.ok(task1.acceptance_criteria.some((c) => c.startsWith('Wired:')));
});

test('planToTeamTasks preserves existing acceptance_criteria', () => {
  const tasks = planToTeamTasks(SAMPLE_PLAN, SAMPLE_MANIFEST.executors);
  const task2 = tasks[1];
  assert.ok(task2.acceptance_criteria.includes('Script has hook in first 15s'));
});

test('planToTeamTasks maps read_first_hints to metadata', () => {
  const tasks = planToTeamTasks(SAMPLE_PLAN, SAMPLE_MANIFEST.executors);
  assert.deepEqual(tasks[0].metadata.read_first, ['context/brief.md']);
});

// ─── translateToTeamConfig ───────────────────────────────────────────────────

test('translateToTeamConfig builds valid team configuration', () => {
  const config = translateToTeamConfig('/project', SAMPLE_MANIFEST, SAMPLE_PLAN);

  assert.equal(config.name, 'squad-content-team');
  assert.ok(config.description.length > 0);
  assert.equal(config.teammates.length, 3);
  assert.equal(config.tasks.length, 2);
  assert.ok(config.settings.parallel);
});

test('translateToTeamConfig applies budget constraints', () => {
  const config = translateToTeamConfig('/project', SAMPLE_MANIFEST, SAMPLE_PLAN, {
    budget: { max_tokens_per_session: 100000, max_tokens_per_task: 10000 }
  });

  assert.equal(config.settings.tokenBudget, 100000);
  assert.equal(config.settings.perTaskTokenLimit, 10000);
});

test('translateToTeamConfig applies anti_loop settings', () => {
  const config = translateToTeamConfig('/project', SAMPLE_MANIFEST, SAMPLE_PLAN);
  assert.equal(config.settings.antiLoop.threshold, 8);
  assert.equal(config.settings.antiLoop.action, 'feedback');
});

test('translateToTeamConfig maxConcurrent matches executor count', () => {
  const config = translateToTeamConfig('/project', SAMPLE_MANIFEST, SAMPLE_PLAN);
  assert.equal(config.settings.maxConcurrent, 3);
});

test('translateToTeamConfig handles manifest without anti_loop', () => {
  const manifest = { ...SAMPLE_MANIFEST, anti_loop: undefined };
  const config = translateToTeamConfig('/project', manifest, SAMPLE_PLAN);
  assert.ok(!config.settings.antiLoop);
});

test('translateToTeamConfig handles empty executors list', () => {
  const manifest = { ...SAMPLE_MANIFEST, executors: [] };
  const config = translateToTeamConfig('/project', manifest, SAMPLE_PLAN);
  assert.equal(config.teammates.length, 0);
  assert.equal(config.settings.maxConcurrent, 0);
});

// ─── writeTeamConfig ─────────────────────────────────────────────────────────

test('writeTeamConfig writes team.json to squad directory', async () => {
  const tmpDir = await makeTempDir();
  try {
    const config = translateToTeamConfig(tmpDir, SAMPLE_MANIFEST, SAMPLE_PLAN);
    const configPath = await writeTeamConfig(tmpDir, 'content-team', config);

    assert.ok(configPath.endsWith('team.json'));
    const written = JSON.parse(await fs.readFile(configPath, 'utf8'));
    assert.equal(written.name, 'squad-content-team');
  } finally {
    await fs.rm(tmpDir, { recursive: true });
  }
});

test('writeTeamConfig creates team-config directory', async () => {
  const tmpDir = await makeTempDir();
  try {
    const config = translateToTeamConfig(tmpDir, SAMPLE_MANIFEST, SAMPLE_PLAN);
    const configPath = await writeTeamConfig(tmpDir, 'my-squad', config);

    assert.ok(configPath.includes('team-config'));
  } finally {
    await fs.rm(tmpDir, { recursive: true });
  }
});

// ─── resolveEngine ───────────────────────────────────────────────────────────

test('resolveEngine returns legacy when explicitly requested', () => {
  const result = resolveEngine('legacy');
  assert.equal(result.engine, 'legacy');
  assert.equal(result.reason, 'explicit');
});

test('resolveEngine falls back to legacy when agent-teams not available', () => {
  // In test environment, claude binary may not be available or be wrong version
  const result = resolveEngine('agent-teams');
  // Should either succeed with agent-teams or fall back gracefully
  assert.ok(['agent-teams', 'legacy'].includes(result.engine));
  if (result.engine === 'legacy') {
    assert.ok(result.reason); // should have reason for fallback
  }
});

test('resolveEngine defaults to legacy with no argument', () => {
  const result = resolveEngine();
  assert.equal(result.engine, 'legacy');
});

test('resolveEngine auto-detect returns a valid engine', () => {
  const result = resolveEngine('auto');
  assert.ok(['agent-teams', 'legacy'].includes(result.engine));
  assert.ok(result.reason);
});

test('AC-premium-07 agent team uses task-bound specialist while preserving integration ownership', () => {
  const manifest = {
    slug: 'premium-team',
    name: 'Premium team',
    mission: 'Use expertise without roster inflation',
    executors: [{
      slug: 'integration-owner',
      role: 'Integration owner',
      type: 'agent'
    }]
  };
  const plan = {
    tasks: [{
      id: 'task-01',
      title: 'Specialized analysis',
      description: 'Analyze a narrow technical domain',
      executor: 'integration-owner',
      owner: 'integration-owner',
      reviewer: null,
      review_exception: 'no-independent-reviewer-available',
      decision_right: { owner: 'final', reviewer: 'exception-recorded' },
      contribution: 'Integrate the recommendation',
      specialist: {
        slug: 'specialist-quantum',
        role: 'Quantum specialist',
        contribution: 'Analyze quantum evidence',
        instructions: 'Return source-grounded quantum analysis',
        persistent: false,
        integration_owner: 'integration-owner'
      },
      dependencies: [],
      acceptance_criteria: []
    }]
  };

  const config = translateToTeamConfig('C:\\project', manifest, plan);
  assert.equal(config.teammates.length, 2);
  const specialist = config.teammates.find((item) => item.name === 'specialist-quantum');
  assert.equal(specialist.ephemeral, true);
  assert.equal(specialist.integrationOwner, 'integration-owner');
  assert.equal(config.tasks[0].assignTo, 'specialist-quantum');
  assert.equal(config.tasks[0].metadata.owner, 'integration-owner');
  assert.equal(config.tasks[0].metadata.integration_owner, 'integration-owner');
});
