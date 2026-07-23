'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { createTranslator } = require('../src/i18n');
const {
  buildWorkflowPlan,
  normalizeClassification,
  runWorkflowPlan
} = require('../src/commands/workflow-plan');

async function makeTempDir() {
  return fs.mkdtemp(path.join(os.tmpdir(), 'aioson-workflow-plan-'));
}

function createQuietLogger() {
  return {
    log() {},
    error() {}
  };
}

function createCollectLogger() {
  const lines = [];
  return {
    lines,
    log(line) {
      lines.push(String(line));
    },
    error(line) {
      lines.push(String(line));
    }
  };
}

test('normalizeClassification supports known values and fallback', () => {
  assert.equal(normalizeClassification('micro'), 'MICRO');
  assert.equal(normalizeClassification('small'), 'SMALL');
  assert.equal(normalizeClassification('MEDIUM'), 'MEDIUM');
  assert.equal(normalizeClassification('unknown', 'SMALL'), 'SMALL');
});

test('buildWorkflowPlan maps classifications to agent sequence', () => {
  const micro = buildWorkflowPlan({ classification: 'MICRO' });
  assert.deepEqual(micro.commands, ['@setup', '@product', '@planner', '@dev', '@qa']);

  const small = buildWorkflowPlan({ classification: 'SMALL' });
  assert.deepEqual(small.commands, ['@setup', '@product', '@planner', '@dev', '@qa']);

  const medium = buildWorkflowPlan({ classification: 'MEDIUM' });
  assert.deepEqual(medium.commands, [
    '@setup',
    '@product',
    '@planner',
    '@dev',
    '@qa'
  ]);
});

test('runWorkflowPlan reads context and applies dapp note', async () => {
  const dir = await makeTempDir();
  const contextPath = path.join(dir, '.aioson/context/project.context.md');
  await fs.mkdir(path.dirname(contextPath), { recursive: true });
  await fs.writeFile(
    contextPath,
    `---\nproject_name: \"demo\"\nproject_type: \"dapp\"\nprofile: \"developer\"\nframework: \"Hardhat\"\nframework_installed: true\nclassification: \"SMALL\"\nconversation_language: \"en\"\nweb3_enabled: true\nweb3_networks: \"ethereum\"\naioson_version: \"0.1.8\"\n---\n\n# Project Context\n`,
    'utf8'
  );

  const { t } = createTranslator('en');
  const result = await runWorkflowPlan({
    args: [dir],
    options: {},
    logger: createQuietLogger(),
    t
  });

  assert.equal(result.ok, true);
  assert.equal(result.classification, 'SMALL');
  assert.equal(result.commands.includes('@qa'), true);
  assert.equal(result.notes.some((note) => note.includes('dApp context detected')), true);
});

test('runWorkflowPlan works without context using fallback classification', async () => {
  const dir = await makeTempDir();
  const { t } = createTranslator('en');
  const result = await runWorkflowPlan({
    args: [dir],
    options: { classification: 'MEDIUM' },
    logger: createQuietLogger(),
    t
  });

  assert.equal(result.ok, true);
  assert.equal(result.contextExists, false);
  assert.equal(result.classification, 'MEDIUM');
  assert.equal(result.commands[0], '@setup');
  assert.equal(result.commands[result.commands.length - 1], '@qa');
});

test('runWorkflowPlan localizes command and note line formatting in pt-BR', async () => {
  const dir = await makeTempDir();
  const { t } = createTranslator('pt-BR');
  const logger = createCollectLogger();

  const result = await runWorkflowPlan({
    args: [dir],
    options: { classification: 'MICRO', 'framework-installed': 'false' },
    logger,
    t
  });

  assert.equal(result.ok, true);
  assert.equal(logger.lines.some((line) => line.includes('Comando: @setup')), true);
  assert.equal(logger.lines.some((line) => line.includes('Nota: ')), true);
});
