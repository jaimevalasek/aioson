'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { previewArtifact } = require('../src/harness/preview-artifact');
const { runHarnessPreview } = require('../src/commands/harness-preview');

function tmpFile(name) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aioson-preview-'));
  return path.join(dir, name);
}

function makeLogger() {
  const lines = [];
  const errors = [];
  return { log: (m = '') => lines.push(String(m)), error: (m = '') => errors.push(String(m)), lines, errors };
}

// --- AC-12: > maxBytes grava integral e retorna preview + ponteiro ----------

test('AC-12: content > maxBytes persiste integral e retorna preview de maxBytes + ponteiro', () => {
  const out = tmpFile('big.log');
  const content = 'x'.repeat(20000);
  const r = previewArtifact(content, { maxBytes: 8192, artifactPath: out });

  assert.equal(r.truncated, true);
  assert.equal(r.totalBytes, 20000);
  assert.equal(r.fullPath, out);
  // integral em disco (persist-first)
  assert.equal(fs.readFileSync(out, 'utf8').length, 20000);
  // ponteiro padrão presente
  assert.match(r.preview, /\[preview: primeiros 8192 de 20000 bytes — completo em /);
  // preview ~ maxBytes de conteúdo + linha-ponteiro
  assert.ok(r.preview.startsWith('x'.repeat(8192)));
});

test('AC-12: content <= maxBytes retorna integral com truncated:false', () => {
  const out = tmpFile('small.log');
  const content = 'hello world';
  const r = previewArtifact(content, { maxBytes: 8192, artifactPath: out });
  assert.equal(r.truncated, false);
  assert.equal(r.preview, content);
  assert.equal(fs.readFileSync(out, 'utf8'), content);
});

test('corte nunca quebra caractere multi-byte (UTF-8 safe)', () => {
  // 'é' = 2 bytes (0xC3 0xA9). maxBytes ímpar no meio de um 'é'.
  const content = 'é'.repeat(5000); // 10000 bytes
  const r = previewArtifact(content, { maxBytes: 8193 });
  // preview decodifica sem U+FFFD (replacement char)
  const previewBody = r.preview.split('\n')[0];
  assert.ok(!previewBody.includes('�'), 'sem caractere de substituição');
  assert.equal(r.truncated, true);
});

test('falha de escrita degrada (best-effort): fullPath null + sem throw', () => {
  // artifactPath dentro de um "diretório" que é na verdade um arquivo → mkdir falha
  const file = tmpFile('not-a-dir');
  fs.writeFileSync(file, 'x');
  const bad = path.join(file, 'child', 'out.log');
  const r = previewArtifact('y'.repeat(20000), { maxBytes: 100, artifactPath: bad });
  assert.equal(r.fullPath, null);
  assert.match(r.preview, /não persistido/);
  assert.ok(r.warning);
});

test('persist:false referencia arquivo existente sem reescrever (modo leitura)', () => {
  const out = tmpFile('existing.log');
  fs.writeFileSync(out, 'ORIGINAL');
  const r = previewArtifact('z'.repeat(20000), { maxBytes: 50, artifactPath: out, persist: false });
  assert.equal(fs.readFileSync(out, 'utf8'), 'ORIGINAL', 'arquivo não reescrito');
  assert.equal(r.fullPath, out);
  assert.match(r.preview, /completo em /);
});

test('edge 10: content não-string e maxBytes inválido degradam com segurança', () => {
  const r1 = previewArtifact(null);
  assert.equal(r1.preview, '');
  assert.equal(r1.truncated, false);

  const r2 = previewArtifact('a'.repeat(100), { maxBytes: -5 });
  assert.equal(r2.truncated, false, 'maxBytes inválido → default 8192 (100 < 8192)');
});

// --- AC-14: harness:preview sobre arquivo de log real -----------------------

test('AC-14: harness:preview lê arquivo persistido e devolve preview + ponteiro', async () => {
  const logFile = tmpFile('test-run.log');
  fs.writeFileSync(logFile, 'L'.repeat(20000), 'utf8');
  const logger = makeLogger();
  const result = await runHarnessPreview({ args: [logFile], options: { 'max-bytes': '4096' }, logger, t: null });

  assert.equal(result.exitCode, 0);
  assert.equal(result.truncated, true);
  assert.equal(result.totalBytes, 20000);
  assert.match(logger.lines.join('\n'), /\[preview: primeiros 4096 de 20000 bytes — completo em /);
  // read-only: arquivo intacto
  assert.equal(fs.readFileSync(logFile, 'utf8').length, 20000);
});

test('AC-14: harness:preview sem arquivo → exit 12', async () => {
  const logger = makeLogger();
  const result = await runHarnessPreview({ args: [], options: {}, logger, t: null });
  process.exitCode = 0;
  assert.equal(result.exitCode, 12);
  assert.equal(result.error, 'file_required');
});

test('AC-14: harness:preview arquivo inexistente → exit 12', async () => {
  const logger = makeLogger();
  const result = await runHarnessPreview({ args: [tmpFile('nope.log')], options: {}, logger, t: null });
  process.exitCode = 0;
  assert.equal(result.exitCode, 12);
  assert.equal(result.error, 'not_found');
});
