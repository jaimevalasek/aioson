'use strict';

/**
 * `aioson harness:preview <file> [--max-bytes=8192] [--json]` (requirements §5.2).
 *
 * Wrapper fino e read-only de `previewArtifact` sobre um arquivo já persistido
 * (ex.: `npm test > test.log`). Devolve preview + ponteiro para o agente de teste
 * consumir sem despejar o log integral no contexto. Tema 2 (should-have).
 *
 * Exit codes: 0 sucesso; 12 input inválido (arquivo ausente/ilegível).
 */

const fs = require('node:fs');
const path = require('node:path');

const { previewArtifact, DEFAULT_MAX_BYTES } = require('../harness/preview-artifact');

const EXIT_OK = 0;
const EXIT_INPUT = 12;

function tr(t, key, params, fallback) {
  if (typeof t !== 'function') return fallback;
  const msg = t(key, params);
  return msg && msg !== key ? msg : fallback;
}

async function runHarnessPreview({ args, options = {}, logger, t } = {}) {
  const log = logger || { log() {}, error() {} };
  const file = args && args[0];

  if (!file || typeof file !== 'string') {
    log.error(tr(t, 'cli.harnessPreview.file_required', null, 'harness:preview requires a <file> path argument.'));
    process.exitCode = EXIT_INPUT;
    return { ok: false, exitCode: EXIT_INPUT, error: 'file_required' };
  }

  // SF-02 (decisão de design, não bug): leitor read-only operador-local. Lê
  // qualquer path legível por design — o caso de uso é previewar logs de teste
  // (ex.: `npm test > test.log`) que podem viver fora do cwd. Sem cruzamento de
  // fronteira de confiança (o operador já tem acesso ao FS); por isso não há
  // contenção de workspace aqui. Mantém-se intencionalmente irrestrito.
  const abs = path.resolve(process.cwd(), file);
  let content;
  try {
    content = fs.readFileSync(abs, 'utf8');
  } catch (err) {
    if (err.code === 'ENOENT') {
      log.error(tr(t, 'cli.harnessPreview.not_found', { path: file }, `File not found: ${file}`));
      process.exitCode = EXIT_INPUT;
      return { ok: false, exitCode: EXIT_INPUT, error: 'not_found' };
    }
    log.error(tr(t, 'cli.harnessPreview.read_error', { path: file, error: err.message }, `Could not read file: ${file} (${err.message})`));
    process.exitCode = EXIT_INPUT;
    return { ok: false, exitCode: EXIT_INPUT, error: 'read_error' };
  }

  let maxBytes = Number(options['max-bytes'] ?? options.maxBytes ?? DEFAULT_MAX_BYTES);
  if (!Number.isInteger(maxBytes) || maxBytes <= 0) maxBytes = DEFAULT_MAX_BYTES;

  // Modo leitura: o arquivo já está persistido — não reescrever (persist:false).
  const result = previewArtifact(content, { maxBytes, artifactPath: abs, persist: false });
  log.log(result.preview);

  return {
    ok: true,
    exitCode: EXIT_OK,
    file: file.replaceAll('\\', '/'),
    totalBytes: result.totalBytes,
    truncated: result.truncated,
    preview: result.preview
  };
}

module.exports = { runHarnessPreview };
