'use strict';

/**
 * `previewArtifact` — preview + ponteiro para outputs grandes (requirements §3.3,
 * REQ-10). Tema 2 (should-have) da Harness Retrospective Optimization.
 *
 *   previewArtifact(content, { maxBytes = 8192, artifactPath, label, persist })
 *     → { preview, truncated, fullPath, totalBytes }
 *
 * - Persist-first: quando `artifactPath` é dado e `persist !== false`, grava o
 *   conteúdo INTEGRAL em disco ANTES de gerar o preview.
 * - `content` ≤ maxBytes → preview = conteúdo integral, `truncated: false`.
 * - `content` > maxBytes → preview = primeiros maxBytes cortados em boundary
 *   UTF-8 seguro + linha-ponteiro padrão.
 * - Falha de escrita NÃO lança: retorna preview truncado + `fullPath: null` +
 *   aviso (best-effort, mesmo padrão de `attempt-artifacts.js`).
 * - `persist: false` referencia um arquivo já persistido sem reescrevê-lo
 *   (modo leitura de `harness:preview`).
 */

const fs = require('node:fs');
const path = require('node:path');

const DEFAULT_MAX_BYTES = 8192;

/** Corta um Buffer UTF-8 em `maxBytes` sem quebrar caractere multi-byte (edge 10). */
function safeUtf8Slice(buf, maxBytes) {
  if (buf.length <= maxBytes) return buf.toString('utf8');
  let end = maxBytes;
  // Recua enquanto estiver no meio de uma sequência (bytes de continuação 10xxxxxx).
  while (end > 0 && (buf[end] & 0xc0) === 0x80) end -= 1;
  return buf.slice(0, end).toString('utf8');
}

function previewArtifact(content, options = {}) {
  // Coerção segura: content não-string vira string ('' para null/undefined).
  let text;
  if (typeof content === 'string') {
    text = content;
  } else if (content === null || content === undefined) {
    text = '';
  } else {
    try {
      text = String(content);
    } catch {
      return { preview: '', truncated: false, fullPath: null, totalBytes: 0, warning: 'content não coercível' };
    }
  }

  let maxBytes = Number(options.maxBytes);
  if (!Number.isInteger(maxBytes) || maxBytes <= 0) maxBytes = DEFAULT_MAX_BYTES;

  const artifactPath = options.artifactPath || null;
  const persist = options.persist !== false;

  const buf = Buffer.from(text, 'utf8');
  const totalBytes = buf.length;

  // Persist-first: grava integral antes de qualquer preview.
  let fullPath = artifactPath;
  let warning = null;
  if (artifactPath && persist) {
    try {
      fs.mkdirSync(path.dirname(artifactPath), { recursive: true });
      fs.writeFileSync(artifactPath, text, 'utf8');
    } catch (err) {
      fullPath = null;
      warning = `falha ao persistir ${artifactPath}: ${err.message}`;
    }
  }

  if (totalBytes <= maxBytes) {
    return { preview: text, truncated: false, fullPath, totalBytes, ...(warning ? { warning } : {}) };
  }

  const cut = safeUtf8Slice(buf, maxBytes);
  const pointer = fullPath
    ? `[preview: primeiros ${maxBytes} de ${totalBytes} bytes — completo em ${fullPath}]`
    : `[preview: primeiros ${maxBytes} de ${totalBytes} bytes — conteúdo completo não persistido]`;
  const preview = `${cut}\n${pointer}`;

  return { preview, truncated: true, fullPath, totalBytes, ...(warning ? { warning } : {}) };
}

module.exports = { previewArtifact, DEFAULT_MAX_BYTES, _internal: { safeUtf8Slice } };
