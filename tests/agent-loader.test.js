'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');

const { AgentLoader, shardMarkdown } = require('../src/agent-loader');

async function makeTmpDir() {
  return fs.mkdtemp(path.join(os.tmpdir(), 'aioson-agent-loader-'));
}

function makeAgentContent(sections = []) {
  const lines = ['# Test Agent', '', '## Role', 'You are a test agent.', ''];
  for (const { heading, content } of sections) {
    lines.push(`## ${heading}`, content, '');
  }
  return lines.join('\n');
}

// ─── shardMarkdown ─────────────────────────────────────────────────────────────

test('shardMarkdown — splits by H2 headings', () => {
  const content = [
    '# My Agent',
    'Preamble content here.',
    '',
    '## Role',
    'You are a developer.',
    '',
    '## Guidelines',
    'Write tests first.',
    ''
  ].join('\n');

  const shards = shardMarkdown(content, 'dev');
  assert.ok(shards.length >= 2, 'should produce at least 2 shards');

  const headings = shards.map(s => s.heading);
  assert.ok(headings.includes('Role'), 'Role heading should be a shard');
  assert.ok(headings.includes('Guidelines'), 'Guidelines heading should be a shard');
});

test('shardMarkdown — splits by H3 headings as well', () => {
  const content = [
    '## Section One',
    'Content of section one.',
    '### Subsection A',
    'Subsection content.',
    '### Subsection B',
    'More content.',
  ].join('\n');

  const shards = shardMarkdown(content, 'test');
  const levels = shards.map(s => s.level);
  assert.ok(levels.includes(2), 'should have H2 shard');
  assert.ok(levels.includes(3), 'should have H3 shards');
});

test('shardMarkdown — preamble before first heading is captured', () => {
  const content = 'Intro line.\n\n## Section\nSection content.';
  const shards = shardMarkdown(content, 'test');
  const preamble = shards.find(s => s.heading === '(preamble)');
  assert.ok(preamble, 'preamble shard should exist');
  assert.ok(preamble.content.includes('Intro line'));
});

test('shardMarkdown — assigns unique ids per shard', () => {
  const content = '## A\nContent A.\n## B\nContent B.';
  const shards = shardMarkdown(content, 'my-agent');
  const ids = shards.map(s => s.id);
  const uniqueIds = new Set(ids);
  assert.equal(ids.length, uniqueIds.size, 'all shard ids should be unique');
});

test('shardMarkdown — estimates tokens per shard', () => {
  const content = '## Section\n' + 'word '.repeat(100);
  const shards = shardMarkdown(content, 'test');
  for (const s of shards) {
    assert.ok(typeof s.tokens === 'number', 'tokens should be a number');
    assert.ok(s.tokens > 0, 'tokens should be positive');
  }
});

// ─── AgentLoader ───────────────────────────────────────────────────────────────

test('AgentLoader — opens and closes without error', async () => {
  const tmp = await makeTmpDir();
  try {
    const searchDir = path.join(tmp, 'search');
    const loader = new AgentLoader({ searchDir });
    await loader.open();
    loader.close();
  } finally {
    await fs.rm(tmp, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
  }
});

test('AgentLoader — indexAgentFile indexes shards', async () => {
  const tmp = await makeTmpDir();
  try {
    const searchDir = path.join(tmp, 'search');
    const agentFile = path.join(tmp, 'dev.md');
    await fs.writeFile(agentFile, makeAgentContent([
      { heading: 'Implementation', content: 'Write code following TDD.' },
      { heading: 'Error Handling', content: 'Log all errors with context.' }
    ]), 'utf8');

    const loader = new AgentLoader({ searchDir });
    await loader.open();
    try {
      const result = await loader.indexAgentFile(agentFile, 'dev');
      assert.ok(result.shards >= 2, `should index at least 2 shards, got ${result.shards}`);
    } finally {
      loader.close();
    }
  } finally {
    await fs.rm(tmp, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
  }
});

test('AgentLoader — loadRelevantShards returns shards within token budget', async () => {
  const tmp = await makeTmpDir();
  try {
    const searchDir = path.join(tmp, 'search');
    const agentFile = path.join(tmp, 'dev.md');
    await fs.writeFile(agentFile, makeAgentContent([
      { heading: 'Implementation', content: 'Write code following TDD best practices.' },
      { heading: 'Testing', content: 'All code must have unit tests.' },
      { heading: 'Documentation', content: 'Document all public APIs.' }
    ]), 'utf8');

    const loader = new AgentLoader({ searchDir });
    await loader.open();
    try {
      await loader.indexAgentFile(agentFile, 'dev');
      const result = await loader.loadRelevantShards('dev', 'write tests with TDD', {
        maxShards: 3,
        maxTokens: 2000
      });

      assert.ok(result.shards.length > 0, 'should return at least one shard');
      assert.ok(result.tokens <= 2000, `tokens ${result.tokens} should be within budget`);
      assert.equal(result.agentId, 'dev');
      assert.ok(typeof result.totalShards === 'number');
    } finally {
      loader.close();
    }
  } finally {
    await fs.rm(tmp, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
  }
});

test('AgentLoader — loadRelevantShards returns empty for unknown agent', async () => {
  const tmp = await makeTmpDir();
  try {
    const searchDir = path.join(tmp, 'search');
    const loader = new AgentLoader({ searchDir });
    await loader.open();
    try {
      const result = await loader.loadRelevantShards('nonexistent-agent', 'some goal');
      assert.equal(result.shards.length, 0, 'no shards for unknown agent');
      assert.equal(result.tokens, 0);
    } finally {
      loader.close();
    }
  } finally {
    await fs.rm(tmp, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
  }
});

test('AgentLoader — indexAgentsDir indexes multiple agent files', async () => {
  const tmp = await makeTmpDir();
  try {
    const searchDir = path.join(tmp, 'search');
    const agentsDir = path.join(tmp, 'agents');
    await fs.mkdir(agentsDir);

    await fs.writeFile(
      path.join(agentsDir, 'dev.md'),
      makeAgentContent([{ heading: 'Implementation', content: 'Write code.' }]),
      'utf8'
    );
    await fs.writeFile(
      path.join(agentsDir, 'qa.md'),
      makeAgentContent([{ heading: 'Testing', content: 'Write tests.' }]),
      'utf8'
    );

    const loader = new AgentLoader({ searchDir });
    await loader.open();
    try {
      const result = await loader.indexAgentsDir(agentsDir);
      assert.ok(result.agents >= 2, 'should index at least 2 agents');
      assert.ok(result.totalShards >= 2, 'should index at least 2 shards total');
    } finally {
      loader.close();
    }
  } finally {
    await fs.rm(tmp, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
  }
});

test('AgentLoader.buildContext — merges shard content with separators', () => {
  const shards = [
    { id: 'a:shard:0', heading: 'Role', content: 'You are a developer.', level: 2, tokens: 10 },
    { id: 'a:shard:1', heading: 'Guidelines', content: 'Write clean code.', level: 2, tokens: 10 }
  ];
  const context = AgentLoader.buildContext(shards);
  assert.ok(context.includes('You are a developer.'), 'first shard content present');
  assert.ok(context.includes('Write clean code.'), 'second shard content present');
  assert.ok(context.includes('---'), 'separator present between shards');
});

test('AgentLoader — stats returns index information', async () => {
  const tmp = await makeTmpDir();
  try {
    const searchDir = path.join(tmp, 'search');
    const agentFile = path.join(tmp, 'qa.md');
    await fs.writeFile(agentFile, makeAgentContent([
      { heading: 'Testing', content: 'Write comprehensive tests.' }
    ]), 'utf8');

    const loader = new AgentLoader({ searchDir });
    await loader.open();
    try {
      await loader.indexAgentFile(agentFile, 'qa');
      const stats = loader.stats();
      assert.ok(typeof stats.totalDocs === 'number', 'stats should have totalDocs');
      assert.ok(stats.totalDocs >= 1, 'should have at least one indexed shard');
    } finally {
      loader.close();
    }
  } finally {
    await fs.rm(tmp, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
  }
});
