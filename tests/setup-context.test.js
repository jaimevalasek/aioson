'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { createTranslator } = require('../src/i18n');
const { runSetupContext } = require('../src/commands/setup-context');

async function makeTempDir() {
  return fs.mkdtemp(path.join(os.tmpdir(), 'aioson-setup-context-'));
}

function createQuietLogger() {
  return {
    log() {},
    error() {}
  };
}

test('setup:context defaults supports developer onboarding options', async () => {
  const projectDir = await makeTempDir();
  const logger = createQuietLogger();
  const { t } = createTranslator('en');

  const result = await runSetupContext({
    args: [projectDir],
    options: {
      defaults: true,
      profile: 'developer',
      'backend-choice': '1',
      'laravel-version': '11',
      'frontend-choice': '1',
      'auth-choice': '2',
      'uiux-choice': '2',
      'database-choice': '1',
      services: 'queues,storage,websockets,email,payments,cache,search'
    },
    logger,
    t
  });

  assert.equal(result.data.profile, 'developer');
  assert.equal(result.data.framework, 'Laravel 11');
  assert.equal(result.data.backend, 'Laravel');
  assert.equal(result.data.queues, 'Redis/Horizon');
  assert.equal(result.data.storage, 'S3-compatible');
  assert.equal(result.data.websockets, 'Reverb/Pusher');
  assert.equal(result.data.email, 'Transactional provider');
  assert.equal(result.data.payments, 'Payments provider');
  assert.equal(result.data.cache, 'Redis');
  assert.equal(result.data.search, 'Meilisearch/Algolia');

  const content = await fs.readFile(result.filePath, 'utf8');
  assert.equal(content.includes('WebSockets: Reverb/Pusher'), true);
  assert.equal(content.includes('## Notes'), true);
});

test('setup:context creator recommendation can produce dapp defaults', async () => {
  const projectDir = await makeTempDir();
  const logger = createQuietLogger();
  const { t } = createTranslator('en');

  const result = await runSetupContext({
    args: [projectDir],
    options: {
      defaults: true,
      profile: 'creator',
      'project-summary': 'Web3 wallet and token dashboard',
      'expected-users': '3',
      'mobile-requirement': '2',
      'hosting-preference': '3'
    },
    logger,
    t
  });

  assert.equal(result.data.profile, 'creator');
  assert.equal(result.data.projectType, 'dapp');
  assert.equal(result.data.framework, 'Hardhat');
  assert.equal(result.data.web3Enabled, true);
  assert.equal(result.data.web3Networks, 'ethereum');
  assert.equal(result.data.contractFramework, 'Hardhat');
});

test('setup:context localizes onboarding notes with pt-BR locale', async () => {
  const projectDir = await makeTempDir();
  const logger = createQuietLogger();
  const { t } = createTranslator('pt-BR');

  const result = await runSetupContext({
    args: [projectDir],
    options: {
      defaults: true,
      profile: 'creator',
      'project-summary': 'Web3 wallet and token dashboard',
      'expected-users': '3',
      'mobile-requirement': '1',
      'hosting-preference': '3'
    },
    logger,
    t
  });

  const notes = Array.isArray(result.data.notes) ? result.data.notes.join('\n') : '';
  assert.equal(notes.includes('This recommendation is a starter profile'), false);
  assert.equal(notes.includes('recomendacao') || notes.includes('Recomendacao'), true);
});

test('setup:context team profile preserves explicit web3 values', async () => {
  const projectDir = await makeTempDir();
  const logger = createQuietLogger();
  const { t } = createTranslator('en');

  const result = await runSetupContext({
    args: [projectDir],
    options: {
      defaults: true,
      profile: 'team',
      'project-type': 'dapp',
      framework: 'Anchor',
      backend: 'Anchor',
      frontend: 'Next.js',
      database: 'PostgreSQL',
      auth: 'Custom',
      uiux: 'Tailwind',
      services: 'payments,cache',
      'web3-enabled': true,
      'web3-networks': 'solana',
      'contract-framework': 'Anchor'
    },
    logger,
    t
  });

  assert.equal(result.data.profile, 'team');
  assert.equal(result.data.projectType, 'dapp');
  assert.equal(result.data.framework, 'Anchor');
  assert.equal(result.data.web3Enabled, true);
  assert.equal(result.data.web3Networks, 'solana');
  assert.equal(result.data.contractFramework, 'Anchor');
  assert.equal(result.data.payments, 'Payments provider');
  assert.equal(result.data.cache, 'Redis');
});

test('setup:context defaults supports legacy custom stack values', async () => {
  const projectDir = await makeTempDir();
  const logger = createQuietLogger();
  const { t } = createTranslator('en');

  const result = await runSetupContext({
    args: [projectDir],
    options: {
      defaults: true,
      profile: 'developer',
      framework: 'CodeIgniter 3',
      'backend-choice': '13',
      backend: 'CodeIgniter 3',
      'frontend-choice': '8',
      frontend: 'Bootstrap + jQuery',
      'database-choice': '1',
      auth: 'Legacy session auth'
    },
    logger,
    t
  });

  assert.equal(result.data.framework, 'CodeIgniter 3');
  assert.equal(result.data.backend, 'CodeIgniter 3');
  assert.equal(result.data.frontend, 'Bootstrap + jQuery');
  assert.equal(result.data.database, 'MySQL');
});

test('setup:context preserves the Forge version contract in output data and frontmatter', async () => {
  const projectDir = await makeTempDir();
  const logger = createQuietLogger();
  const { t } = createTranslator('en');

  const result = await runSetupContext({
    args: [projectDir],
    options: {
      defaults: true,
      'aioson-version': '9.9.9'
    },
    logger,
    t
  });

  const content = await fs.readFile(result.filePath, 'utf8');

  assert.equal(result.data.aiosonVersion, '9.9.9');
  assert.equal(content.includes('aioson_version: "9.9.9"'), true);
});

test('setup:context supports explicit design_skill override', async () => {
  const projectDir = await makeTempDir();
  const logger = createQuietLogger();
  const { t } = createTranslator('en');

  const result = await runSetupContext({
    args: [projectDir],
    options: {
      defaults: true,
      'project-type': 'web_app',
      'design-skill': 'cognitive-ui'
    },
    logger,
    t
  });

  const content = await fs.readFile(result.filePath, 'utf8');

  assert.equal(result.data.designSkill, 'cognitive-ui');
  assert.equal(content.includes('design_skill: "cognitive-ui"'), true);
});
