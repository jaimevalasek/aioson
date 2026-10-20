'use strict';

// Começo comum dos comandos store de skill/squad/genome: site, token, raiz do
// projeto e o que foi pedido. O config.json vem lido de quem chama.

const { requireSite, DEFAULT_SITE_URL } = require('../../commands/config');
const { findProjectRoot } = require('../../commands/workspace');
const { resolveTargetDir } = require('../project-root');

// Site padrão (o do último auth:login) e o token dele — o que install, list e
// grant usam; só os publish escolhem site com --base-url / AIOSON_BASE_URL.
function defaultStoreSite(config, t) {
  const token = config.aiosonToken;
  if (!token) throw new Error(t('store.error_not_authenticated'));
  return { token, baseUrl: String(config.aiosonBaseUrl || DEFAULT_SITE_URL).replace(/\/+$/, '') };
}

// publish: o mesmo site do system:publish (--base-url > AIOSON_BASE_URL > padrão,
// com o token daquele site — sem login nele, recusa) e o --slug obrigatório.
async function resolvePublishContext(config, { args, options, t }) {
  const { token, baseUrl } = requireSite(config, options, t);
  const projectDir = await findProjectRoot(resolveTargetDir(args));
  const slug = String(options.slug || '').trim();
  if (!slug) throw new Error(t('store.error_missing_slug'));
  return { token, baseUrl, projectDir, slug };
}

// install: site padrão e o código/slug pedido (--slug, --code ou posicional).
async function resolveInstallContext(config, { args, options, t }) {
  const { token, baseUrl } = defaultStoreSite(config, t);
  const projectDir = await findProjectRoot(resolveTargetDir(args));
  const ref = String(options.slug || options.code || args[1] || args[0] || '').trim();
  if (!ref) throw new Error(t('store.error_missing_code_or_slug'));
  return { token, baseUrl, projectDir, ref };
}

module.exports = { defaultStoreSite, resolvePublishContext, resolveInstallContext };
