'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { spawn } = require('node:child_process');

function runCli(args, options = {}) {
  const cwd = options.cwd || process.cwd();
  const env = { ...process.env, ...(options.env || {}) };
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [path.join(process.cwd(), 'bin/aioson.js'), ...args], {
      cwd,
      env
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on('data', (chunk) => {
      stderr += String(chunk);
    });
    child.on('close', (code) => {
      resolve({ code, stdout, stderr });
    });
  });
}

test('help output is localized with --locale=pt-BR', async () => {
  const cli = await runCli(['help', '--locale=pt-BR']);
  assert.equal(cli.code, 0);
  assert.equal(cli.stdout.includes('CLI do AIOSON'), true);
  assert.equal(cli.stdout.includes('Uso:'), true);
});

test('localized help never emits copyable commands that switch back to English', async () => {
  for (const locale of ['pt-BR', 'es', 'fr']) {
    const cli = await runCli(['help', `--locale=${locale}`]);
    assert.equal(cli.code, 0, cli.stderr);
    assert.equal(
      cli.stdout.includes('--locale=en'),
      false,
      `${locale} help contains a command that changes the selected locale`
    );
  }
});

test('help exposes briefing lifecycle commands in every supported locale', async () => {
  const commands = [
    'briefing:sources',
    'briefing:approve',
    'briefing:unapprove',
    'briefing:review',
    'briefing:apply-feedback',
    'briefing:migrate-lineage'
  ];

  for (const locale of ['en', 'pt-BR', 'es', 'fr']) {
    const cli = await runCli(['help', `--locale=${locale}`]);
    assert.equal(cli.code, 0, `help failed for ${locale}`);
    for (const command of commands) {
      assert.equal(cli.stdout.includes(`aioson ${command}`), true, `${command} missing from ${locale} help`);
    }
  }
});

test('help exposes review intelligence commands in every supported locale', async () => {
  const commands = ['review:prepare', 'review:check', 'review:status'];

  for (const locale of ['en', 'pt-BR', 'es', 'fr']) {
    const cli = await runCli(['help', `--locale=${locale}`]);
    assert.equal(cli.code, 0, `help failed for ${locale}`);
    for (const command of commands) {
      assert.equal(cli.stdout.includes(`aioson ${command}`), true, `${command} missing from ${locale} help`);
    }
  }
});

test('help expõe os comandos essenciais do ciclo de fechamento (A8)', async () => {
  // A ausência destes no help levou à conclusão errada de que feature:close
  // não existia (relatório A8) — cada um deve aparecer no help de en e pt-BR.
  const commands = [
    'feature:close',
    'feature:archive',
    'harness:init',
    'harness:validate',
    'harness:apply-validation',
    'harness:approve',
    'harness:reject',
    'harness:status',
    'gate:check',
    'gate:approve',
    'prototype:check',
    'ac:test-audit',
    'preflight',
    'pulse:update',
    'agent:done',
    'dossier:add-finding',
    'detect:test-runner',
    'dev:resume-data'
  ];

  for (const locale of ['en', 'pt-BR']) {
    const cli = await runCli(['help', `--locale=${locale}`]);
    assert.equal(cli.code, 0, `help failed for ${locale}`);
    for (const command of commands) {
      assert.equal(cli.stdout.includes(`aioson ${command}`), true, `${command} missing from ${locale} help`);
    }
  }
});

test('help exposes the pentester scope pickers in every supported locale', async () => {
  for (const locale of ['en', 'pt-BR', 'es', 'fr']) {
    const cli = await runCli(['help', `--locale=${locale}`]);
    assert.equal(cli.code, 0, `help failed for ${locale}`);
    assert.equal(cli.stdout.includes('aioson feature:list'), true, `feature:list missing from ${locale} help`);
    assert.equal(
      cli.stdout.includes('aioson pentester:report'),
      true,
      `pentester:report missing from ${locale} help`
    );
    assert.equal(
      /aioson pentester:report[^\n]*\[--feature=<slug>\]/.test(cli.stdout),
      true,
      `${locale} help still presents --feature as mandatory for pentester:report`
    );
  }
});

test('AC-premium-20 help exposes squad:eval in every supported locale', async () => {
  for (const locale of ['en', 'pt-BR', 'es', 'fr']) {
    const cli = await runCli(['help', `--locale=${locale}`]);
    assert.equal(cli.code, 0, `help failed for ${locale}`);
    assert.equal(cli.stdout.includes('aioson squad:eval'), true, `squad:eval missing from ${locale} help`);
  }
});

test('unknown command error is localized in pt-BR', async () => {
  const cli = await runCli(['comando-inexistente', '--locale=pt-BR']);
  assert.equal(cli.code, 1);
  assert.equal(cli.stderr.includes('Comando desconhecido'), true);
});

test('legacy dashboard command error is localized in pt-BR', async () => {
  const cli = await runCli(['dashboard:init', '--locale=pt-BR']);
  assert.equal(cli.code, 1);
  assert.equal(cli.stderr.includes('foi removido do CLI'), true);
  assert.equal(cli.stderr.includes('.aioson/'), true);
});

test('env locale pt resolves to pt-BR dictionary', async () => {
  const cli = await runCli(['help'], { env: { AIOS_LITE_LOCALE: 'pt' } });
  assert.equal(cli.code, 0);
  assert.equal(cli.stdout.includes('Uso:'), true);
  assert.equal(cli.stdout.includes('CLI do AIOSON'), true);
});

test('regional locale es-MX resolves to es dictionary', async () => {
  const cli = await runCli(['help', '--locale=es-MX']);
  assert.equal(cli.code, 0);
  assert.equal(cli.stdout.includes('Uso:'), true);
  assert.equal(cli.stdout.includes('AIOSON CLI'), true);
});

test('regional locale fr_CA resolves to fr dictionary', async () => {
  const cli = await runCli(['help'], { env: { AIOS_LITE_LOCALE: 'fr_CA' } });
  assert.equal(cli.code, 0);
  assert.equal(cli.stdout.includes('Utilisation :'), true);
  assert.equal(cli.stdout.includes('AIOSON CLI'), true);
});

test('dev:progress has its help line in every locale', () => {
  for (const locale of ['en', 'pt-BR', 'es', 'fr']) {
    const { messages } = require(`../src/i18n/messages/${locale}`);
    const cli = (messages || require(`../src/i18n/messages/${locale}`)).cli;
    assert.match(cli.help_dev_progress, new RegExp(`^aioson dev:progress \\[path\\] --feature=<slug> \\[--json\\] \\[--locale=${locale}\\]$`), locale);
  }
});
