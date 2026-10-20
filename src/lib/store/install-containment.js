'use strict';

// Instalar da loja grava o que o servidor manda — e `--base-url` aponta para
// qualquer site. Slug e caminhos são conferidos antes de qualquer remoção,
// cópia ou escrita: tudo cai dentro da pasta de instalação.

const fs = require('node:fs/promises');
const path = require('node:path');

// Começa por letra/número e não tem separador: `.`, `..` e `a/b` nunca viram pasta.
const SAFE_INSTALL_SLUG_RE = /^[a-z0-9][a-z0-9._-]*$/i;

// Dentro de `root` e diferente dele. Fora é `..` ou `../…` (um arquivo chamado
// `..capa.png` está dentro); outro drive ou caminho absoluto também é fora.
function isInside(root, target) {
  const relative = path.relative(root, target);
  return relative !== '' && relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

function assertInstallSlug(slug, t) {
  if (typeof slug !== 'string' || !SAFE_INSTALL_SLUG_RE.test(slug)) {
    throw new Error(t('store.error_install_unsafe_slug', { slug: String(slug) }));
  }
  return slug;
}

// Caminho final de um arquivo do pacote: dentro de `root` (absoluto) ou recusa.
function installTarget(root, relPath, t) {
  const target = path.resolve(root, String(relPath));
  if (!isInside(root, target)) throw new Error(t('store.error_install_unsafe_path', { path: String(relPath) }));
  return target;
}

// Só os arquivos de texto do pacote — os que o scan vê são os que se gravam.
function textFiles(files) {
  return Object.fromEntries(Object.entries(files).filter(([, content]) => typeof content === 'string'));
}

// Pares [destino, conteúdo] de cada arquivo de texto, destino conferido dentro
// de `root` antes de qualquer remoção, cópia ou escrita.
function installTargets(root, files, t) {
  return Object.entries(textFiles(files)).map(([relPath, content]) => [installTarget(root, relPath, t), content]);
}

async function writeInstallTargets(targets) {
  for (const [target, content] of targets) {
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, content, 'utf8');
  }
}

module.exports = { isInside, assertInstallSlug, installTarget, textFiles, installTargets, writeInstallTargets };
