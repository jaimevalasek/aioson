'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { createTranslator } = require('../src/i18n');
const { runDoctorCommand } = require('../src/commands/doctor');
const { installTemplate } = require('../src/installer');

async function makeTempDir() {
  return fs.mkdtemp(path.join(os.tmpdir(), 'aioson-doctor-cmd-'));
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

test('doctor command localizes check and hint line wrappers in pt-BR', async () => {
  const dir = await makeTempDir();
  const { t } = createTranslator('pt-BR');
  const logger = createCollectLogger();

  const result = await runDoctorCommand({
    args: [dir],
    options: {},
    logger,
    t
  });

  assert.equal(result.ok, false);
  assert.equal(logger.lines.some((line) => line.startsWith('[FALHA] ')), true);
  assert.equal(logger.lines.some((line) => line.startsWith('  Dica: ')), true);
});

test('doctor --fix localizes action/detail line wrappers in pt-BR', async () => {
  const dir = await makeTempDir();
  await installTemplate(dir, { mode: 'install' });
  await fs.writeFile(
    path.join(dir, '.aioson/context/project.context.md'),
    `---\nproject_name: "demo"\nproject_type: "web_app"\nprofile: "developer"\nframework: "Node"\nframework_installed: true\nclassification: "MICRO"\nconversation_language: "pt-BR"\naioson_version: "0.1.9"\n---\n\n# Project Context\n`,
    'utf8'
  );
  await fs.unlink(path.join(dir, 'AGENTS.md'));

  const { t } = createTranslator('pt-BR');
  const logger = createCollectLogger();
  const result = await runDoctorCommand({
    args: [dir],
    options: { fix: true, 'dry-run': true },
    logger,
    t
  });

  assert.equal(result.ok, false);
  assert.equal(logger.lines.some((line) => line.startsWith('- Acao: ')), true);
  assert.equal(logger.lines.some((line) => line.startsWith('  Detalhe: ')), true);
});

test('doctor --fix localizes gateway contract fix action in pt-BR', async () => {
  const dir = await makeTempDir();
  await installTemplate(dir, { mode: 'install' });
  await fs.writeFile(
    path.join(dir, '.aioson/context/project.context.md'),
    `---\nproject_name: "demo"\nproject_type: "web_app"\nprofile: "developer"\nframework: "Node"\nframework_installed: true\nclassification: "MICRO"\nconversation_language: "pt-BR"\naioson_version: "0.1.9"\n---\n\n# Project Context\n`,
    'utf8'
  );
  await fs.writeFile(path.join(dir, 'AGENTS.md'), '# broken gateway\n', 'utf8');

  const { t } = createTranslator('pt-BR');
  const logger = createCollectLogger();
  const result = await runDoctorCommand({
    args: [dir],
    options: { fix: true, 'dry-run': true },
    logger,
    t
  });

  assert.equal(result.ok, false);
  assert.equal(
    logger.lines.some((line) =>
      line.includes('Restaurar arquivos de contrato de gateway quebrados')
    ),
    true
  );
});
