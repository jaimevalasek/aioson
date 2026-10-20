'use strict';

// Começo comum dos comandos store de skill/squad/genome: site, token, raiz do
// projeto e o que foi pedido. O config.json vem lido de quem chama. Todo comando
// que manda o token (publish, install, list, grant) escolhe o site do mesmo jeito
// — `requireSite`: --base-url (presente e vazio é erro de uso) > AIOSON_BASE_URL >
// o padrão do último auth:login, com o token daquele site, e http:// só na própria
// máquina ou na rede local, antes de qualquer pedido.

const { requireSite } = require('../../commands/config');
const { findProjectRoot } = require('../../commands/workspace');
const { resolveTargetDir } = require('../project-root');

// publish: o site acima e o --slug obrigatório.
async function resolvePublishContext(config, { args, options, t }) {
  const { token, baseUrl } = requireSite(config, options, t);
  const projectDir = await findProjectRoot(resolveTargetDir(args));
  const slug = String(options.slug || '').trim();
  if (!slug) throw new Error(t('store.error_missing_slug'));
  return { token, baseUrl, projectDir, slug };
}

// install: o site acima e o código/slug pedido (--slug, --code ou posicional).
async function resolveInstallContext(config, { args, options, t }) {
  const { token, baseUrl } = requireSite(config, options, t);
  const projectDir = await findProjectRoot(resolveTargetDir(args));
  const ref = String(options.slug || options.code || args[1] || args[0] || '').trim();
  if (!ref) throw new Error(t('store.error_missing_code_or_slug'));
  return { token, baseUrl, projectDir, ref };
}

module.exports = { resolvePublishContext, resolveInstallContext };
