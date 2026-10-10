'use strict';

// O `live:start` abria a ferramenta com `shell: true` no Windows: o Node juntava
// os argumentos sem proteger nenhum e o Node 24 imprimia o aviso DEP0190 no
// terminal de quem abriu a sessão. Agora o comando é resolvido antes e aberto
// sem shell.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { resolveToolSpawn } = require('../src/commands/live');

async function makeTempDir(prefix) {
  return fs.mkdtemp(path.join(os.tmpdir(), prefix));
}

function run(target, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(target.command, target.args, {
      cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
      ...target.options
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', (code) => resolve({ code, stdout, stderr }));
  });
}

// Argumentos que o `cmd.exe` leria como comando se fossem só colados.
const TRICKY_ARGS = ['--permission-mode=default', 'com espaço', 'a&b', '100%', 'fim\\', 'aspas "dentro"'];

test('fora do Windows o binário abre como veio, sem shell', async () => {
  const target = await resolveToolSpawn('/usr/local/bin/claude', ['--continue'], 'linux');
  assert.deepEqual(target, { command: '/usr/local/bin/claude', args: ['--continue'], options: {} });
});

test('.exe no Windows abre direto, sem cmd.exe', async () => {
  const target = await resolveToolSpawn('C:\\Users\\cli\\.local\\bin\\claude.exe', ['--continue'], 'win32');
  assert.equal(target.command, 'C:\\Users\\cli\\.local\\bin\\claude.exe');
  assert.deepEqual(target.args, ['--continue']);
  assert.deepEqual(target.options, {});
});

test('atalho .cmd do npm vira node + script, com os argumentos intactos', async () => {
  const dir = await makeTempDir('aioson live spawn npm ');
  const script = path.join(dir, 'node_modules', 'fake-tool', 'cli.js');
  await fs.mkdir(path.dirname(script), { recursive: true });
  await fs.writeFile(script, 'console.log(JSON.stringify(process.argv.slice(2)));\n');
  // Mesmo formato do atalho que o npm grava na pasta global.
  const shim = path.join(dir, 'fake-tool.cmd');
  await fs.writeFile(
    shim,
    '@ECHO off\r\nSETLOCAL\r\nIF EXIST "%dp0%\\node.exe" (\r\n  SET "_prog=%dp0%\\node.exe"\r\n) ELSE (\r\n  SET "_prog=node"\r\n)\r\n"%_prog%"  "%dp0%\\node_modules\\fake-tool\\cli.js" %*\r\n'
  );

  const target = await resolveToolSpawn(shim, TRICKY_ARGS, 'win32');
  assert.equal(target.command, process.execPath);
  assert.equal(target.args[0], await fs.realpath(script));
  assert.deepEqual(target.args.slice(1), TRICKY_ARGS);
  assert.deepEqual(target.options, {});

  const result = await run(target, dir);
  assert.equal(result.code, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), TRICKY_ARGS);
});

test('.cmd escrito à mão vai pelo cmd.exe com cada argumento protegido', { skip: process.platform !== 'win32' }, async () => {
  const dir = await makeTempDir('aioson live spawn cmd ');
  const printer = path.join(dir, 'print-args.js');
  await fs.writeFile(printer, 'console.log(JSON.stringify(process.argv.slice(2)));\n');
  // Sem `%dp0%`: o resolvedor do npm não reconhece e cai no cmd.exe.
  const tool = path.join(dir, 'hand tool.cmd');
  await fs.writeFile(tool, `@echo off\r\n"${process.execPath}" "${printer}" %*\r\n`);

  const target = await resolveToolSpawn(tool, TRICKY_ARGS, 'win32');
  assert.match(target.command, /cmd\.exe$/i);
  assert.equal(target.options.windowsVerbatimArguments, true);

  const result = await run(target, dir);
  assert.equal(result.code, 0, result.stderr);
  // O `%` passa por dentro do .cmd, que expande variáveis: o que importa é o
  // resto chegar inteiro e o `&` não virar um segundo comando.
  const received = JSON.parse(result.stdout);
  assert.deepEqual(received.filter((arg) => arg !== '100%'), TRICKY_ARGS.filter((arg) => arg !== '100%'));
  assert.equal(received.length, TRICKY_ARGS.length);
});
