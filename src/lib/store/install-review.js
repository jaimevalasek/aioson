'use strict';

// Prévia, scan e hash do pacote que o servidor mandou — iguais nos installs de
// skill, squad e genome. Nada aqui grava: com `--inspect` a lista sai e o
// install para ali.

const { scanPackage, formatScanReport } = require('./security-scan');

function logInstallPreview(response, slug, version, logger, t) {
  logger.log(t('store.install_preview_header', { slug, publisher: response.publisher || 'unknown', version }));
  logger.log(t(response.trusted ? 'store.install_preview_trusted' : 'store.install_preview_unverified'));
  if (response.downloads != null) logger.log(t('store.install_preview_downloads', { count: response.downloads }));
  if (response.rating != null) logger.log(t('store.install_preview_rating', { rating: `${Number(response.rating).toFixed(1)}/5` }));
  if (response.hash) logger.log(t('store.install_preview_hash', { hash: response.hash.slice(0, 12) }));
}

// `true` quando é `--inspect` (arquivos listados, nada a gravar). Scan reprovado
// ou hash diferente do que o servidor anunciou recusa o install.
function reviewInstallPackage({ response, slug, version, files, type, options, logger, t, announceScan = false }) {
  logInstallPreview(response, slug, version, logger, t);
  if (announceScan) logger.log(t('store.install_scanning'));
  const scan = scanPackage(files, type);
  formatScanReport(scan, logger);
  if (!scan.ok) throw new Error(t('store.error_install_scan_failed', { slug }));
  if (response.hash && scan.hash !== response.hash) throw new Error(t('store.error_hash_mismatch', { slug }));
  if (options.inspect) {
    logger.log(t('store.install_inspect_files', { count: Object.keys(files).length }));
    for (const file of Object.keys(files).sort()) logger.log(`  ${file}`);
    logger.log(t('store.install_inspect_hint'));
    return true;
  }
  if (!response.trusted && !options.force) logger.log(t('store.install_unverified_hint', { slug }));
  return false;
}

module.exports = { reviewInstallPackage };
