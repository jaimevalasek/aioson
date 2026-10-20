'use strict';

// store-showcase — capa e galeria do app declaradas como arquivos no
// system.json. A CLI valida tudo antes do publish (nada sai se um arquivo for
// recusado) e envia as imagens depois que a versão foi aceita: cada imagem vai
// crua para `[slug]/images` e o `commit` troca o conjunto inteiro no site.

const fs = require('node:fs/promises');
const path = require('node:path');
const { isInside } = require('../lib/store/install-containment');
const { storeRequest } = require('../lib/store/http');

const LISTING_IMAGE_MAX_BYTES = 2 * 1024 * 1024;
const LISTING_GALLERY_MAX = 10;
const COVER_MIN = { width: 1280, height: 720 };
const GALLERY_MAX_WIDTH = 1920;

const MIME_BY_EXT = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
};

function sniffMime(bytes) {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return 'image/png';
  }
  if (bytes.length >= 12 && bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP') {
    return 'image/webp';
  }
  return null;
}

// Largura/altura lidas do cabeçalho do arquivo — sem dependência de imagem.
// `null` quando o cabeçalho não diz (o aviso de dimensão então não é dado).
function readImageSize(bytes, mime) {
  try {
    if (mime === 'image/png') {
      return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
    }
    if (mime === 'image/jpeg') {
      let offset = 2;
      while (offset + 9 < bytes.length) {
        if (bytes[offset] !== 0xff) { offset += 1; continue; }
        const marker = bytes[offset + 1];
        if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
          return { width: bytes.readUInt16BE(offset + 7), height: bytes.readUInt16BE(offset + 5) };
        }
        if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0xff) {
          offset += marker === 0xff ? 1 : 2;
          continue;
        }
        offset += 2 + bytes.readUInt16BE(offset + 2);
      }
      return null;
    }
    if (mime === 'image/webp') {
      const chunk = bytes.toString('ascii', 12, 16);
      if (chunk === 'VP8 ') {
        return { width: bytes.readUInt16LE(26) & 0x3fff, height: bytes.readUInt16LE(28) & 0x3fff };
      }
      if (chunk === 'VP8L') {
        const [b0, b1, b2, b3] = bytes.subarray(21, 25);
        return {
          width: 1 + (((b1 & 0x3f) << 8) | b0),
          height: 1 + (((b3 & 0x0f) << 10) | (b2 << 2) | ((b1 & 0xc0) >> 6)),
        };
      }
      if (chunk === 'VP8X') {
        return { width: 1 + bytes.readUIntLE(24, 3), height: 1 + bytes.readUIntLE(27, 3) };
      }
    }
  } catch {
    /* cabeçalho curto demais */
  }
  return null;
}

function declaredListingImages(manifest) {
  const declared = [];
  if (typeof manifest.cover === 'string' && manifest.cover.trim()) {
    declared.push({ role: 'cover', file: manifest.cover.trim() });
  }
  if (Array.isArray(manifest.gallery)) {
    for (const file of manifest.gallery) declared.push({ role: 'gallery', file: String(file).trim() });
  }
  return declared;
}

// Caminho real de uma imagem declarada: dentro da pasta do app (atalho/link
// dentro da pasta apontando para fora conta como fora) e ainda não usado por
// outra entrada — o mesmo arquivo duas vezes (ou a capa repetida na galeria)
// apareceria repetido na Loja.
async function realListingPath(root, file, seen, t) {
  const resolved = path.resolve(root, file);
  if (!isInside(root, resolved)) throw new Error(t('system.error_listing_image_outside', { file }));
  let real;
  try {
    real = await fs.realpath(resolved);
  } catch {
    throw new Error(t('system.error_listing_image_missing', { file }));
  }
  if (!isInside(root, real)) throw new Error(t('system.error_listing_image_outside', { file }));
  const realKey = process.platform === 'win32' ? real.toLowerCase() : real;
  if (seen.has(realKey)) throw new Error(t('system.error_listing_image_duplicate', { file, first: seen.get(realKey) }));
  seen.set(realKey, file);
  return real;
}

// Bytes e tipo: arquivo comum, jpg/png/webp pela extensão e pelo conteúdo, até 2 MB.
async function readListingImageBytes(real, file, t) {
  const stat = await fs.stat(real);
  if (!stat.isFile()) throw new Error(t('system.error_listing_image_missing', { file }));
  const declaredMime = MIME_BY_EXT[path.extname(real).toLowerCase()];
  if (!declaredMime) throw new Error(t('system.error_listing_image_format', { file }));
  if (stat.size > LISTING_IMAGE_MAX_BYTES) {
    throw new Error(t('system.error_listing_image_too_large', {
      file, mb: (stat.size / 1024 / 1024).toFixed(2), max: LISTING_IMAGE_MAX_BYTES / 1024 / 1024,
    }));
  }
  const bytes = await fs.readFile(real);
  const mime = sniffMime(bytes);
  if (mime !== declaredMime) throw new Error(t('system.error_listing_image_format', { file }));
  return { bytes, mime };
}

// Dimensão fora do recomendado só vira aviso; `size` null (cabeçalho mudo) não avisa.
function dimensionWarnings(role, file, size, t) {
  const warnings = [];
  if (size && role === 'cover') {
    if (Math.abs(size.width / size.height - 16 / 9) > 0.02) {
      warnings.push(t('system.warn_listing_cover_ratio', { file, width: size.width, height: size.height }));
    }
    if (size.width < COVER_MIN.width || size.height < COVER_MIN.height) {
      warnings.push(t('system.warn_listing_cover_small', { file, width: size.width, height: size.height }));
    }
  }
  if (size && role === 'gallery' && size.width > GALLERY_MAX_WIDTH) {
    warnings.push(t('system.warn_listing_gallery_wide', { file, width: size.width, max: GALLERY_MAX_WIDTH }));
  }
  return warnings;
}

/**
 * Lê e valida capa + galeria declaradas. Recusa (lança) nomeando o arquivo:
 * fora da pasta do app, inexistente, formato fora de jpg/png/webp, acima de
 * 2 MB, galeria com mais de 10, a mesma imagem duas vezes. Dimensão fora do
 * recomendado só vira aviso.
 */
async function readListingImages(dir, manifest, t) {
  const declared = declaredListingImages(manifest);
  const images = [];
  const warnings = [];
  if (declared.length === 0) return { images, warnings };

  const galleryCount = declared.filter((image) => image.role === 'gallery').length;
  if (galleryCount > LISTING_GALLERY_MAX) {
    throw new Error(t('system.error_listing_gallery_limit', { max: LISTING_GALLERY_MAX, count: galleryCount }));
  }

  const root = await fs.realpath(dir);
  const seen = new Map(); // caminho real → arquivo como declarado
  for (const { role, file } of declared) {
    const real = await realListingPath(root, file, seen, t);
    const { bytes, mime } = await readListingImageBytes(real, file, t);
    warnings.push(...dimensionWarnings(role, file, readImageSize(bytes, mime), t));
    images.push({ role, file, bytes, mime });
  }
  // O commit troca capa + galeria juntas: declarar só uma deixa a outra vazia na Loja.
  const hasCover = images.some((image) => image.role === 'cover');
  const hasGallery = images.some((image) => image.role === 'gallery');
  if (hasCover && !hasGallery) warnings.push(t('system.warn_listing_gallery_cleared'));
  if (hasGallery && !hasCover) warnings.push(t('system.warn_listing_cover_cleared'));
  return { images, warnings };
}

// Imagem crua ou o commit em JSON: 2 min por pedido.
function postStore(url, token, init) {
  return storeRequest(url, token, { method: 'POST', ...init }, 120000);
}

function imagesOnlyCommand(dir, site) {
  const quotedDir = /\s/.test(dir) ? `"${dir}"` : dir;
  const baseUrl = site && !site.isDefault ? ` --base-url=${site.baseUrl}` : '';
  return `aioson system:publish ${quotedDir} --images-only${baseUrl}`;
}

/**
 * Envia as imagens e confirma o conjunto. Nunca lança: falha vira aviso com a
 * imagem e o comando que reenvia só as imagens (a versão já está publicada e
 * o site mantém o conjunto anterior até o commit).
 */
async function sendListingImages({ dir, site, slug, images, logger, t }) {
  const base = `${site.baseUrl}/api/store/systems/${encodeURIComponent(slug)}/images`;
  const ids = { cover: null, gallery: [] };
  let current = null;
  try {
    for (const image of images) {
      current = image.file;
      const result = await postStore(base, site.token, {
        headers: { 'content-type': image.mime },
        body: image.bytes,
      });
      if (!result || typeof result.id !== 'string') throw new Error(t('system.images_no_id'));
      if (image.role === 'cover') ids.cover = result.id;
      else ids.gallery.push(result.id);
    }
    current = null;
    await postStore(`${base}/commit`, site.token, {
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(ids),
    });
  } catch (error) {
    const command = imagesOnlyCommand(dir, site);
    logger.log(`  [WARN] ${current
      ? t('system.images_failed', { file: current, error: error.message, command })
      : t('system.images_commit_failed', { error: error.message, command })}`);
    return { ok: false, failedFile: current, command };
  }
  logger.log(t('system.images_sent', { count: images.length }));
  for (const image of images) {
    logger.log(`  ${t(image.role === 'cover' ? 'system.images_sent_cover' : 'system.images_sent_gallery', { file: image.file })}`);
  }
  return { ok: true, sent: images.map((image) => image.file) };
}

module.exports = {
  LISTING_GALLERY_MAX,
  readImageSize,
  readListingImages,
  sendListingImages,
};
