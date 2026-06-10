'use strict';

/**
 * `aioson harness:retro [path] --feature=<slug> | --last=<N> [--json] [--locale=<l>]`
 *
 * Minera deterministicamente a trilha de falhas já coletada e materializa um
 * dossiê retrospectivo em `.aioson/context/retro/{slug}.md` (ou
 * `window-last-{N}.md`). Leitura-apenas sobre as fontes; única escrita: o dossiê.
 * Sem LLM, sem rede (requirements §5.1, RHO-lite).
 *
 * Exit codes (D4 — devolvidos em `result.exitCode`, propagados por cli.js:1649
 * em --json e por process.exitCode no modo texto; mesmo caminho de código para
 * fechar a classe recorrente exit-code-collapsed-in-json-mode):
 *   0  sucesso (inclusive dossiê vazio)
 *   1  erro de I/O inesperado
 *   12 erro de input (slug inválido, flags conflitantes, feature inexistente)
 */

const fs = require('node:fs');
const path = require('node:path');

const {
  collectSources, resolvePassDate, resolveFeatureExists, enumerateClosedFeatures, relPath
} = require('../lib/retro/retro-sources');
const { aggregate } = require('../lib/retro/retro-aggregate');
const { renderDossier } = require('../lib/retro/retro-render');

const SLUG_RE = /^[a-z0-9][a-z0-9-]*$/;
const EXIT_OK = 0;
const EXIT_IO = 1;
const EXIT_INPUT = 12;

function tr(t, key, params, fallback) {
  if (typeof t !== 'function') return fallback;
  const msg = t(key, params);
  return msg && msg !== key ? msg : fallback;
}

/** Encerra em erro de input: registra mensagem + devolve resultado com exitCode. */
function inputError(logger, message, error) {
  if (logger && typeof logger.error === 'function') logger.error(message);
  process.exitCode = EXIT_INPUT;
  return { ok: false, exitCode: EXIT_INPUT, error, message };
}

/** Datas `completed` do MANIFEST de arquivadas (fallback de ordenação). */
function readManifestDates(targetDir) {
  const map = {};
  try {
    const text = fs.readFileSync(path.join(targetDir, '.aioson', 'context', 'done', 'MANIFEST.md'), 'utf8');
    for (const line of text.split(/\r?\n/)) {
      const m = line.match(/^\|\s*([a-z0-9][a-z0-9-]*)\s*\|\s*([0-9-]{8,10})\s*\|/i);
      if (m) map[m[1]] = m[2].trim();
    }
  } catch { /* best-effort */ }
  return map;
}

/**
 * Ordena uma lista de slugs por data de PASS desc (trail vence → QA → MANIFEST).
 * Undatáveis são excluídos com aviso, salvo se marcados como âncora obrigatória.
 */
function rankByPassDate(targetDir, slugs, { anchor = null } = {}) {
  const manifest = readManifestDates(targetDir);
  const dated = [];
  const undated = [];
  for (const slug of slugs) {
    const d = resolvePassDate(targetDir, slug) || manifest[slug] || null;
    if (d) dated.push({ slug, date: d });
    else if (slug === anchor) dated.push({ slug, date: '' }); // âncora entra mesmo sem data
    else undated.push(slug);
  }
  dated.sort((a, b) => {
    if (a.slug === anchor) return -1;
    if (b.slug === anchor) return 1;
    if (a.date !== b.date) return a.date < b.date ? 1 : -1; // desc
    return a.slug < b.slug ? -1 : 1;
  });
  return { ordered: dated.map((x) => x.slug), undated };
}

async function runHarnessRetro({ args, options = {}, logger, t } = {}) {
  const log = logger || { log() {}, error() {} };
  const targetDir = path.resolve(process.cwd(), (args && args[0]) || '.');

  const hasFeature = options.feature !== undefined && options.feature !== null
    && options.feature !== true && String(options.feature).length > 0;
  const hasLast = options.last !== undefined && options.last !== null && options.last !== true;

  // --- Validação de input (antes de qualquer toque no filesystem — REQ-8) ---
  if (!hasFeature && !hasLast) {
    return inputError(log,
      tr(t, 'cli.harnessRetro.need_target', null, 'harness:retro requer --feature=<slug> ou --last=<N>'),
      'missing_target');
  }

  let slug = null;
  if (hasFeature) {
    slug = String(options.feature).trim();
    if (!SLUG_RE.test(slug)) {
      return inputError(log,
        tr(t, 'cli.harnessRetro.invalid_slug', { slug }, `Slug inválido: ${slug} (deve casar ^[a-z0-9][a-z0-9-]*$)`),
        'invalid_slug');
    }
  }

  let lastN = null;
  if (hasLast) {
    lastN = Number(options.last);
    if (!Number.isInteger(lastN) || lastN < 1) {
      return inputError(log,
        tr(t, 'cli.harnessRetro.invalid_last', { value: String(options.last) }, `Valor inválido para --last: ${options.last} (use inteiro ≥ 1)`),
        'invalid_last');
    }
  }

  // --- Resolve modo, janela e arquivo de saída -----------------------------
  let mode;
  let slugs;
  let outRel;
  const warnings = [];

  if (hasFeature && !hasLast) {
    if (!resolveFeatureExists(targetDir, slug)) {
      return inputError(log,
        tr(t, 'cli.harnessRetro.feature_not_found', { slug },
          `Feature não encontrada: ${slug} (procurado em .aioson/context/, .aioson/plans/${slug}/, .aioson/context/features/${slug}/, .aioson/context/done/${slug}/)`),
        'feature_not_found');
    }
    mode = 'feature';
    slugs = [slug];
    outRel = path.join('.aioson', 'context', 'retro', `${slug}.md`);
  } else {
    // Qualquer uso de --last produz window-last-{N}.md (D6, modo combinado incluído).
    mode = 'window';
    if (hasFeature && !resolveFeatureExists(targetDir, slug)) {
      return inputError(log,
        tr(t, 'cli.harnessRetro.feature_not_found', { slug },
          `Feature não encontrada: ${slug}`),
        'feature_not_found');
    }
    const closed = enumerateClosedFeatures(targetDir);
    const pool = hasFeature ? [slug, ...closed.filter((s) => s !== slug)] : closed;
    if (pool.length === 0) {
      return inputError(log,
        tr(t, 'cli.harnessRetro.no_closed_features', null, 'Nenhuma feature fechada em .aioson/context/done/ para minerar'),
        'no_closed_features');
    }
    const { ordered, undated } = rankByPassDate(targetDir, pool, { anchor: hasFeature ? slug : null });
    if (undated.length > 0) {
      warnings.push(tr(t, 'cli.harnessRetro.undatable_excluded', { count: undated.length, slugs: undated.join(', ') },
        `${undated.length} feature(s) sem data de PASS determinável excluída(s) da janela: ${undated.join(', ')}`));
    }
    if (lastN > ordered.length) {
      warnings.push(tr(t, 'cli.harnessRetro.window_truncated', { n: lastN, available: ordered.length },
        `--last=${lastN} excede features disponíveis (${ordered.length}); minerando todas`));
    }
    slugs = ordered.slice(0, lastN);
    outRel = path.join('.aioson', 'context', 'retro', `window-last-${lastN}.md`);
  }

  // --- Mineração + agregação + render --------------------------------------
  const sources = collectSources(targetDir, slugs);
  const allWarnings = warnings.concat(sources.warnings);
  const { candidates, observations } = aggregate(sources);

  const outRelPosix = outRel.replaceAll('\\', '/');
  const generatedAt = new Date().toISOString();
  const markdown = renderDossier({
    mode,
    slug: mode === 'feature' ? slug : undefined,
    windowN: mode === 'window' ? lastN : undefined,
    featuresMined: sources.features_mined,
    counts: sources.counts,
    candidates,
    observations,
    minedPaths: sources.minedPaths,
    warnings: allWarnings,
    dossierRelPath: outRelPosix,
    generatedAt
  });

  // --- Escrita (única do comando) ------------------------------------------
  const outAbs = path.join(targetDir, outRel);
  try {
    fs.mkdirSync(path.dirname(outAbs), { recursive: true }); // edge 7
    fs.writeFileSync(outAbs, markdown, 'utf8'); // edge 8 (idempotente, sobrescreve)
  } catch (err) {
    log.error(tr(t, 'cli.harnessRetro.io_error', { error: err.message }, `Erro de I/O ao escrever o dossiê: ${err.message}`));
    process.exitCode = EXIT_IO;
    return { ok: false, exitCode: EXIT_IO, error: 'io_error', message: err.message };
  }

  const report = {
    ok: true,
    exitCode: EXIT_OK,
    mode,
    feature: mode === 'feature' ? slug : null,
    window: mode === 'window' ? `last-${lastN}` : null,
    features_mined: sources.features_mined,
    output: outRelPosix,
    candidates: candidates.length,
    observations: observations.length,
    sources: sources.counts,
    warnings: allWarnings
  };

  if (candidates.length === 0 && observations.length === 0) {
    log.log(tr(t, 'cli.harnessRetro.empty', { path: outRelPosix },
      `Dossiê gerado sem propostas: ${outRelPosix} (fontes sem trilha minerável)`));
  } else {
    log.log(tr(t, 'cli.harnessRetro.written',
      { path: outRelPosix, candidates: candidates.length, observations: observations.length },
      `Dossiê retrospectivo gerado: ${outRelPosix} (${candidates.length} candidatos, ${observations.length} observações)`));
  }
  for (const w of allWarnings) log.log(`  ⚠ ${w}`);

  return report;
}

module.exports = { runHarnessRetro };
