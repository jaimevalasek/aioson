'use strict';

// Instalar da loja grava o que o servidor manda — e `--base-url` aponta para
// qualquer site. Slug e caminhos são conferidos antes de qualquer remoção,
// cópia ou escrita: tudo cai dentro da pasta de instalação, no texto do caminho
// e no disco (um link ou junção que já existe lá dentro não leva para fora).

const fs = require('node:fs/promises');
const fsSync = require('node:fs');
const path = require('node:path');

// Começa por letra/número e não tem separador: `.`, `..` e `a/b` nunca viram pasta.
const SAFE_INSTALL_SLUG_RE = /^[a-z0-9][a-z0-9._-]*$/i;
// Nomes que o Windows reescreve ou reserva: ponto ou espaço no fim (`a.` vira
// `a` no Explorer), dispositivos (CON, PRN, AUX, NUL, COM1–9, LPT1–9, com ou sem
// extensão) e `:` (fluxo NTFS, letra de drive). Gravados como vieram, nenhuma
// ferramenta comum os apaga depois.
const WIN32_DEVICE_RE = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/i;

// Dentro de `root` e diferente dele. Fora é `..` ou `../…` (um arquivo chamado
// `..capa.png` está dentro); outro drive ou caminho absoluto também é fora.
function isInside(root, target) {
  const relative = path.relative(root, target);
  return relative !== '' && relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

function unsafeOnWindows(name) {
  if (process.platform !== 'win32') return false;
  return String(name).split(/[\\/]/).some((segment) => segment !== '.' && segment !== '..'
    && (/[. ]$/.test(segment) || segment.includes(':') || WIN32_DEVICE_RE.test(segment)));
}

function entryExists(entry) {
  try {
    fsSync.lstatSync(entry);
    return true;
  } catch {
    return false;
  }
}

// Onde o caminho cai no disco: o ancestral mais fundo que existe, com links e
// junções resolvidos, mais o resto. `null` quando esse ancestral é um link
// quebrado — não dá para saber onde a gravação cairia.
function realLocation(target) {
  const rest = [];
  let current = target;
  while (!entryExists(current)) {
    const parent = path.dirname(current);
    if (parent === current) return target;
    rest.unshift(path.basename(current));
    current = parent;
  }
  try {
    return path.join(fsSync.realpathSync.native(current), ...rest);
  } catch {
    return null;
  }
}

function staysInsideOnDisk(realRoot, target) {
  const realTarget = realLocation(target);
  return Boolean(realRoot && realTarget) && isInside(realRoot, realTarget);
}

function assertInstallSlug(slug, t) {
  if (typeof slug !== 'string' || !SAFE_INSTALL_SLUG_RE.test(slug) || unsafeOnWindows(slug)) {
    throw new Error(t('store.error_install_unsafe_slug', { slug: String(slug) }));
  }
  return slug;
}

// Caminho final de um arquivo do pacote: dentro de `root` (absoluto) no texto e
// no disco, com um nome que o Windows grava como veio — ou recusa. `realRoot`
// vem pronto de quem confere muitos arquivos sob a mesma pasta.
function installTarget(root, relPath, t, realRoot = realLocation(root)) {
  const target = path.resolve(root, String(relPath));
  if (!isInside(root, target) || unsafeOnWindows(relPath) || !staysInsideOnDisk(realRoot, target)) {
    throw new Error(t('store.error_install_unsafe_path', { path: String(relPath) }));
  }
  return target;
}

// Só os arquivos de texto do pacote — os que o scan vê são os que se gravam.
function textFiles(files) {
  return Object.fromEntries(Object.entries(files).filter(([, content]) => typeof content === 'string'));
}

// Pares [destino, conteúdo] de cada arquivo de texto, destino conferido dentro
// de `root` antes de qualquer remoção, cópia ou escrita.
function installTargets(root, files, t) {
  const realRoot = realLocation(root);
  return Object.entries(textFiles(files)).map(([relPath, content]) => [installTarget(root, relPath, t, realRoot), content]);
}

async function writeInstallTargets(targets) {
  for (const [target, content] of targets) {
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, content, 'utf8');
  }
}

module.exports = { isInside, assertInstallSlug, installTarget, textFiles, installTargets, writeInstallTargets };
