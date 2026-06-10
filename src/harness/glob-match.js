'use strict';

/**
 * Glob matcher mínimo e determinístico para o scope guard (loop-guardrails D1).
 *
 * Subset estrito suportado: `**`, `*`, `?` (incluindo `**` + `/` nas bordas).
 * Qualquer sintaxe fora do subset (extglob `{}[]!()`, classes, negação) é
 * REJEITADA pelo validador — nunca mismatch silencioso em fronteira de
 * segurança. `picomatch` é o upgrade path documentado se o subset apertar.
 *
 * Semântica de caminho (decisão registrada em spec-loop-guardrails.md):
 * - paths e patterns são normalizados para `/` antes do match (EC-6);
 * - pattern SEM `/` casa contra o basename de qualquer profundidade
 *   (estilo gitignore: `*.pem` casa `certs/server.pem`);
 * - pattern COM `/` casa contra o caminho relativo completo.
 */

const INVALID_GLOB_CHARS = /[{}[\]()!]/;

/** Normaliza separadores para `/` e remove `./` inicial. */
function normalizePath(p) {
  let out = String(p == null ? '' : p).replace(/\\/g, '/');
  while (out.startsWith('./')) out = out.slice(2);
  return out;
}

/**
 * Valida um pattern contra o subset estrito.
 * Retorna { ok: true } ou { ok: false, reason }.
 */
function validateGlobPattern(pattern) {
  if (typeof pattern !== 'string' || pattern.trim() === '') {
    return { ok: false, reason: 'pattern must be a non-empty string' };
  }
  const normalized = normalizePath(pattern);
  const invalid = normalized.match(INVALID_GLOB_CHARS);
  if (invalid) {
    return {
      ok: false,
      reason: `unsupported glob syntax "${invalid[0]}" — only **, * and ? are allowed (strict subset)`
    };
  }
  return { ok: true };
}

const REGEX_SPECIALS = /[.+^$|]/g;

/** Compila um pattern (já validado) para RegExp anchored. */
function globToRegExp(pattern) {
  const normalized = normalizePath(pattern);
  let regex = '';
  let i = 0;
  while (i < normalized.length) {
    const ch = normalized[i];
    if (ch === '*') {
      if (normalized[i + 1] === '*') {
        // `**` — atravessa separadores
        const prev = normalized[i - 1];
        const next = normalized[i + 2];
        if ((prev === undefined || prev === '/') && next === '/') {
          // `**/` no início ou após `/` — zero ou mais segmentos completos
          regex += '(?:[^/]+/)*';
          i += 3;
          continue;
        }
        if (next === undefined && (prev === undefined || prev === '/')) {
          // `/**` no fim ou pattern `**` puro — qualquer resto (inclusive vazio? não:
          // `secrets/**` exige algo dentro de secrets/; `**` puro casa tudo)
          regex += prev === '/' ? '.+' : '.*';
          i += 2;
          continue;
        }
        // `**` colado em texto (ex.: `a**b`) — trata como `.*`
        regex += '.*';
        i += 2;
        continue;
      }
      regex += '[^/]*';
      i += 1;
      continue;
    }
    if (ch === '?') {
      regex += '[^/]';
      i += 1;
      continue;
    }
    regex += ch.replace(REGEX_SPECIALS, '\\$&');
    i += 1;
  }
  return new RegExp(`^${regex}$`);
}

/**
 * Casa um path contra um pattern do subset.
 * Pattern sem `/` casa contra o basename (estilo gitignore).
 */
function matchGlob(pattern, filePath) {
  const normalizedPattern = normalizePath(pattern);
  const normalizedPath = normalizePath(filePath);
  if (!normalizedPattern || !normalizedPath) return false;

  if (!normalizedPattern.includes('/')) {
    const basename = normalizedPath.split('/').pop();
    return globToRegExp(normalizedPattern).test(basename);
  }
  return globToRegExp(normalizedPattern).test(normalizedPath);
}

/**
 * Retorna o primeiro pattern da lista que casa o path, ou null.
 */
function matchAny(patterns, filePath) {
  if (!Array.isArray(patterns)) return null;
  for (const pattern of patterns) {
    if (matchGlob(pattern, filePath)) return pattern;
  }
  return null;
}

module.exports = {
  normalizePath,
  validateGlobPattern,
  globToRegExp,
  matchGlob,
  matchAny
};
