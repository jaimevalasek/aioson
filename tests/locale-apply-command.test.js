'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { createTranslator } = require('../src/i18n');
const { installTemplate } = require('../src/installer');
const { runLocaleApply } = require('../src/commands/locale-apply');

async function makeTempDir() {
  return fs.mkdtemp(path.join(os.tmpdir(), 'aioson-locale-apply-cmd-'));
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

test('locale:apply localizes copied file line formatting in pt-BR', async () => {
  const dir = await makeTempDir();
  await installTemplate(dir, { mode: 'install' });
  const { t } = createTranslator('pt-BR');
  const logger = createCollectLogger();

  const result = await runLocaleApply({
    args: [dir],
    options: { lang: 'pt-BR' },
    logger,
    t
  });

  assert.equal(result.locale, 'pt-BR');
  assert.equal(result.copied.length > 0, true);
  assert.equal(logger.lines.some((line) => line.includes('Arquivo: ')), true);
});

test('locale:apply synchronizes primary and legacy language fields in project context', async () => {
  const dir = await makeTempDir();
  await installTemplate(dir, { mode: 'install' });
  const contextPath = path.join(dir, '.aioson/context/project.context.md');
  await fs.writeFile(
    contextPath,
    [
      '---',
      'project_name: "demo"',
      'conversation_language: "pt-BR"',
      '---',
      '',
      '# Project Context',
      ''
    ].join('\n'),
    'utf8'
  );

  const { t } = createTranslator('en');
  const result = await runLocaleApply({
    args: [dir],
    options: { lang: 'es-MX' },
    logger: createCollectLogger(),
    t
  });
  const context = await fs.readFile(contextPath, 'utf8');

  assert.equal(result.contextSync.status, 'updated');
  assert.match(context, /^interaction_language: "es-MX"$/m);
  assert.match(context, /^conversation_language: "es-MX"$/m);
});

test('locale:apply dry-run reports context drift without changing the file', async () => {
  const dir = await makeTempDir();
  await installTemplate(dir, { mode: 'install' });
  const contextPath = path.join(dir, '.aioson/context/project.context.md');
  const original = '---\nconversation_language: "en"\n---\n\n# Project Context\n';
  await fs.writeFile(contextPath, original, 'utf8');

  const { t } = createTranslator('en');
  const result = await runLocaleApply({
    args: [dir],
    options: { lang: 'fr-CA', 'dry-run': true },
    logger: createCollectLogger(),
    t
  });

  assert.equal(result.contextSync.status, 'would_update');
  assert.equal(await fs.readFile(contextPath, 'utf8'), original);
});
