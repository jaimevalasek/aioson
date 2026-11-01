'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const {
  obfuscateJs,
  protectJs,
  resolveProtectionLevel,
  loadAppObfuscator,
  unprotectedJsError,
  MAX_OBFUSCATION_OPTIONS,
  protectRuntimeTypeScript,
  rawSourceError,
  readBuildOutputDirs,
  stripSourceMapComments,
  startEntryProblems,
  createZipBuffer,
  collectSystemFiles,
  prepareRuntimeFiles,
  createRuntimeArtifact,
  runtimePackageCapabilities,
  runtimeSourceFingerprint
} = require('../lib/system-runtime-package');
const { exists, ensureDir } = require('../utils');
const { readConfig, requireSite } = require('./config');
const { readWorkspace, findProjectRoot } = require('./workspace');
const { resolveTargetDir } = require('../lib/project-root');
const { readListingImages, sendListingImages, LISTING_GALLERY_MAX } = require('./store-listing-images');
const { assertInstallSlug, installTargets, writeInstallTargets } = require('../lib/store/install-containment');
const { storeGet, storePostJson, storeRequest } = require('../lib/store/http');

const SYSTEM_PACKAGES_DIR = '.aioson/system-packages';
const BACKUPS_DIR = '.aioson/.backups';

/**
 * Parseia lista de emails autorizados a partir de:
 *   1. Flag CLI --invite="email1,email2,email3" (string com separadores , ; espaço quebra)
 *   2. Fallback: campo `authorized_emails` no system.json (array ou string)
 * Devolve array dedup, lowercase, trimmed, validado (contém @).
 */
function parseInviteEmails(cliInvite, manifestEmails) {
  const raw = cliInvite ?? manifestEmails;
  if (!raw) return [];
  let parts;
  if (Array.isArray(raw)) {
    parts = raw.map(String);
  } else {
    parts = String(raw).split(/[,;\s\n]+/);
  }
  return Array.from(new Set(
    parts.map((s) => s.trim().toLowerCase()).filter((s) => s.length > 0 && s.includes('@'))
  ));
}

// O pacote (ZIP em base64) pode demorar: 2 min para o POST.
function storePost(url, payload, token) {
  return storePostJson(url, payload, token, 120000);
}

/**
 * Parse and validate system.json.
 * Returns the parsed manifest or throws.
 */
async function readSystemJson(dir, t) {
  const manifestPath = path.join(dir, 'system.json');
  if (!(await exists(manifestPath))) {
    throw new Error(t('system.error_no_manifest', { path: manifestPath }));
  }
  let manifest;
  try {
    manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
  } catch {
    throw new Error(t('system.error_invalid_manifest'));
  }
  if (!manifest.slug) throw new Error(t('system.error_manifest_missing_slug'));
  if (!manifest.version) throw new Error(t('system.error_manifest_missing_version'));
  if (!manifest.name) throw new Error(t('system.error_manifest_missing_name'));
  validateListingFields(manifest, t);
  return manifest;
}

/**
 * Valida os campos opcionais de listing da loja (modelo Chrome Web Store).
 * Todos são opcionais — apps antigos sem eles publicam normalmente. Falha cedo,
 * com mensagem clara, quando um campo presente está num formato inválido.
 * Imagens (icon/screenshots) são URLs http(s) externas (Opção A — sem hosting).
 */
function isHttpUrl(value) {
  return typeof value === 'string' && /^https?:\/\/.+/i.test(value.trim());
}

function validateListingFields(m, t) {
  const fail = (msg) => { throw new Error(`system.json: ${msg}`); };

  if (m.summary != null) {
    if (typeof m.summary !== 'string') fail('"summary" deve ser texto.');
    if (m.summary.length > 132) fail(`"summary" deve ter no máximo 132 caracteres (tem ${m.summary.length}).`);
  }
  if (m.purpose != null) {
    if (typeof m.purpose !== 'string') fail('"purpose" deve ser texto.');
    if (m.purpose.length > 280) fail(`"purpose" deve ter no máximo 280 caracteres (tem ${m.purpose.length}).`);
  }
  if (m.category != null && typeof m.category !== 'string') fail('"category" deve ser texto.');
  if (m.permissions_note != null && typeof m.permissions_note !== 'string') fail('"permissions_note" deve ser texto.');

  if (m.tags != null) {
    if (!Array.isArray(m.tags) || m.tags.some((x) => typeof x !== 'string')) fail('"tags" deve ser uma lista de textos.');
    if (m.tags.length > 10) fail('"tags" aceita no máximo 10 itens.');
  }

  if (m.icon != null && !isHttpUrl(m.icon)) fail('"icon" deve ser uma URL http(s) (Opção A — imagem hospedada externamente).');

  if (m.screenshots != null) {
    if (!Array.isArray(m.screenshots)) fail('"screenshots" deve ser uma lista de URLs.');
    if (m.screenshots.length > 5) fail('"screenshots" aceita no máximo 5 itens.');
    for (const s of m.screenshots) {
      if (!isHttpUrl(s)) fail('cada item de "screenshots" deve ser uma URL http(s).');
    }
  }

  // store-showcase: capa/galeria são arquivos dentro da pasta do app (o
  // conteúdo é conferido em readListingImages); novidades são texto simples.
  const isFilePath = (value) => typeof value === 'string' && value.trim() !== '' && !isHttpUrl(value);
  if (m.cover != null && !isFilePath(m.cover)) throw new Error(t('system.error_listing_cover_path'));
  if (m.gallery != null) {
    if (!Array.isArray(m.gallery) || !m.gallery.every(isFilePath)) {
      throw new Error(t('system.error_listing_gallery_paths'));
    }
    if (m.gallery.length > LISTING_GALLERY_MAX) {
      throw new Error(t('system.error_listing_gallery_limit', { max: LISTING_GALLERY_MAX, count: m.gallery.length }));
    }
  }
  if (m.release_notes != null) {
    if (typeof m.release_notes !== 'string') throw new Error(t('system.error_release_notes_type'));
    if (m.release_notes.length > 5000) {
      throw new Error(t('system.error_release_notes_too_long', { max: 5000, count: m.release_notes.length }));
    }
  }

  for (const key of ['homepage_url', 'support_url', 'privacy_url']) {
    if (m[key] != null && !isHttpUrl(m[key])) fail(`"${key}" deve ser uma URL http(s).`);
  }
  if (m.support_email != null) {
    if (typeof m.support_email !== 'string' || !m.support_email.includes('@')) fail('"support_email" deve ser um e-mail válido.');
  }
}

/**
 * Sincroniza a versão dos package.json do app com o system.json (fonte da
 * verdade do publish). Sem isso o package.json fica preso (ex.: 1.0.0) e os logs
 * mostram `app@1.0.0` enquanto a loja publica 1.2.13 — divergência que só
 * confunde. O Play usa a versão do system.json/manifest; aqui só alinhamos os
 * package.json (raiz + `dashboard/` em apps split-stack) pra não divergir. Roda
 * ANTES do build/coleta, então a versão sincronizada já entra no pacote.
 * Best-effort: package.json ausente/ilegível não bloqueia o publish.
 */
async function syncPackageVersions(dir, version, logger) {
  const candidates = [
    path.join(dir, 'package.json'),
    path.join(dir, 'dashboard', 'package.json'),
  ];
  for (const pkgPath of candidates) {
    if (!(await exists(pkgPath))) continue;
    let pkg;
    try {
      pkg = JSON.parse(await fs.readFile(pkgPath, 'utf8'));
    } catch {
      continue;
    }
    if (pkg.version === version) continue;
    const prev = pkg.version || '(ausente)';
    pkg.version = version;
    try {
      await fs.writeFile(pkgPath, JSON.stringify(pkg, null, 2) + '\n', 'utf8');
      logger.log(`package.json sincronizado: ${path.relative(dir, pkgPath) || 'package.json'} ${prev} → ${version}`);
    } catch {
      // best-effort — não bloqueia o publish
    }
  }
}

// ── system:package ──────────────────────────────────────────────────────────

async function runSystemPackage({ args, options, logger, t }) {
  if (options.capabilities) return runtimePackageCapabilities();
  const dir = resolveTargetDir(args);
  if (options.fingerprint) return { ok: true, protocolVersion: 1, sourceFingerprint: await runtimeSourceFingerprint(dir) };

  logger.log(t('system.package_reading_manifest'));
  const manifest = await readSystemJson(dir, t);
  logger.log(t('system.package_manifest_ok', { slug: manifest.slug, version: manifest.version, name: manifest.name }));

  // Alinha os package.json à versão do system.json antes de coletar.
  if (!options['dry-run'] && !options.build) {
    await syncPackageVersions(dir, manifest.version, logger);
  }

  if (options.build) return createRuntimeArtifact({ dir, manifest, options, logger, t });

  logger.log(t('system.package_collecting_files'));
  const { files, totalBytes, errors } = await collectSystemFiles(dir);

  if (errors.length > 0) {
    for (const e of errors) logger.log(`  [WARN] ${e}`);
  }

  const fileCount = Object.keys(files).length;
  logger.log(t('system.package_files_found', { count: fileCount, kb: (totalBytes / 1024).toFixed(1) }));

  if (!files['system.json']) {
    throw new Error(t('system.error_no_manifest', { path: path.join(dir, 'system.json') }));
  }

  if (options['dry-run']) {
    logger.log(t('system.package_dry_run', { slug: manifest.slug, version: manifest.version }));
    for (const f of Object.keys(files).sort()) logger.log(`  ${f}`);
    return { ok: true, dryRun: true, manifest, fileCount, totalBytes };
  }

  // Save package descriptor locally
  const projectDir = await findProjectRoot(dir);
  const pkgDir = path.join(projectDir, SYSTEM_PACKAGES_DIR, manifest.slug);
  await ensureDir(pkgDir);

  const pkgFile = path.join(pkgDir, `${manifest.slug}-${manifest.version}.json`);
  await fs.writeFile(pkgFile, JSON.stringify({ manifest, files }, null, 2), 'utf8');

  logger.log(t('system.package_saved', { path: pkgFile }));
  return { ok: true, manifest, fileCount, totalBytes, path: pkgFile };
}

// ── system:publish ──────────────────────────────────────────────────────────

// app-access-plans (CAP-aap-publish-only): o publish só publica. Privado,
// Grátis, Beta ou Pago é decidido no admin do aioson.com (Apps da loja).
// Texto fixo aqui de propósito: `src/i18n` tem trabalho em andamento.
const ACCESS_MANAGED_IN_ADMIN =
  'O acesso do app (Privado, Grátis, Beta ou Pago) é definido no admin do aioson.com (Apps da loja).';

function publishAccessFlagWarnings(options) {
  const warnings = [];
  if (options.paid) warnings.push(`--paid não tem efeito no publish. ${ACCESS_MANAGED_IN_ADMIN}`);
  if (options.private) warnings.push(`--private não tem efeito no publish. ${ACCESS_MANAGED_IN_ADMIN}`);
  return warnings;
}

// true = app novo, false = nova versão, null = o servidor não disse.
function publishedNewApp(response) {
  if (!response || typeof response !== 'object') return null;
  if (typeof response.created === 'boolean') return response.created;
  if (typeof response.isNew === 'boolean') return response.isNew;
  if (typeof response.isUpdate === 'boolean') return !response.isUpdate;
  return null;
}

// Aviso pós-publish. Servidor antigo (sem `accessManagedInAdmin` nem marcador
// de app novo) não recebe aviso; nova versão só confirma a versão.
function publishAccessNotice(response, version) {
  const managed = Boolean(response && response.accessManagedInAdmin === true);
  const newApp = publishedNewApp(response);
  if (newApp === false) return `Nova versão ${version} publicada.`;
  const privateVisibility = String((response && response.visibility) || '').toUpperCase() === 'PRIVATE';
  if (newApp === true && (managed || privateVisibility)) {
    return `App novo publicado como Privado. ${ACCESS_MANAGED_IN_ADMIN}`;
  }
  if (newApp === null && managed) {
    return `App novo entra como Privado; uma nova versão mantém o acesso atual. ${ACCESS_MANAGED_IN_ADMIN}`;
  }
  return null;
}

async function runSystemPublish({ args, options, logger, t }) {
  const config = options['dry-run'] ? {} : await readConfig();
  const site = options['dry-run'] ? null : requireSite(config, options, t);
  const token = site ? site.token : null;
  const dir = resolveTargetDir(args);
  if (site && !site.isDefault) logger.log(t('system.publish_target', { url: site.baseUrl }));
  const buildMode = Boolean(options.build);

  if (options['workspace-id'] || options.runtime) {
    const manifest = await readSystemJson(dir, t);
    return publishProtectedRuntime({ dir, site, manifest, options, logger: options.json ? { log() {} } : logger, t });
  }

  logger.log(t('system.publish_reading_manifest'));
  const manifest = await readSystemJson(dir, t);
  logger.log(t('system.package_manifest_ok', { slug: manifest.slug, version: manifest.version, name: manifest.name }));

  // Capa/galeria são conferidas antes de tudo: arquivo recusado não cria versão.
  const listingImages = await readListingImages(dir, manifest, t);
  for (const warning of listingImages.warnings) logger.log(`  [WARN] ${warning}`);

  if (options['images-only']) {
    return runImagesOnly({ dir, site, manifest, images: listingImages.images, options, logger, t });
  }

  // Alinha os package.json à versão do system.json antes de buildar/coletar.
  if (!options['dry-run']) {
    await syncPackageVersions(dir, manifest.version, logger);
  }

  const { files, totalBytes, errors, rawSource, protectedTs, protectedJs, unprotectedJs, protection, fileCount, rawError, startError, unprotectedError, collectionError } =
    await prepareRuntimeFiles({ dir, manifest, options, logger, t, buildMode });

  // Os campos continuam no corpo para servidores antigos; o servidor atual os
  // ignora e decide o acesso no admin (app-access-plans, AC-aap-03).
  const visibility = options.private ? 'private' : 'public';
  const paid = Boolean(options.paid);
  for (const warning of publishAccessFlagWarnings(options)) {
    logger.log(`  [WARN] ${warning}`);
  }

  const ws = await readWorkspace(dir);

  // Lista de emails autorizados a instalar quando visibility=private.
  // Aceita via --invite="email1,email2" OU campo `authorized_emails` no
  // manifest (system.json). Sem efeito quando visibility !== private.
  const authorizedEmails = parseInviteEmails(options.invite, manifest.authorized_emails);

  if (options['dry-run']) {
    logger.log(t('system.publish_dry_run', { slug: manifest.slug, version: manifest.version, visibility }));
    for (const image of listingImages.images) logger.log(`  ${t('system.publish_dry_run_image', { file: image.file })}`);
    // O dry-run é a única forma de auditar o pacote antes do upload — lista tudo.
    logger.log(t('system.publish_dry_run_files', { count: fileCount }));
    for (const f of Object.keys(files).sort()) logger.log(`  ${f}`);
    if (rawError) logger.log(`  [WARN] ${rawError.message}`);
    if (startError) logger.log(`  [WARN] ${startError.message}`);
    if (unprotectedError) logger.log(`  [WARN] ${unprotectedError.message}`);
    if (collectionError) logger.log(`  [WARN] ${collectionError.message}`);
    return {
      ok: !rawError && !startError && !unprotectedError && !collectionError,
      dryRun: true, manifest, fileCount, totalBytes, visibility, authorizedEmails,
      rawSource, protectedTs, protectionLevel: protection.level, protectedJs, unprotectedJs, errors
    };
  }
  if (rawError) throw rawError;
  if (unprotectedError) throw unprotectedError;
  if (collectionError) throw collectionError;
  if (startError) throw startError;
  // `--allow-raw-source` é uma decisão, não um silêncio: os arquivos que
  // viajam legíveis são nomeados no log e registrados no resultado do publish
  // real — antes só o dry-run/abort registrava.
  if (buildMode && rawSource.length > 0) {
    logger.log(`  [WARN] ${t('system.warn_raw_source_published', { count: rawSource.length, files: rawSource.join(', ') })}`);
  }

  logger.log('Creating ZIP package...');
  const zipBuffer = await createZipBuffer(files);
  // 10 MB: a ofuscação (string-array/base64 + alta entropia) incha e comprime
  // pior que a fonte, então 2 MB era apertado demais pra `--build`. O servidor
  // (aioson-com) não impõe limite na rota (só `request.json()`).
  const MAX_ZIP_BYTES = 10 * 1024 * 1024;
  if (zipBuffer.length > MAX_ZIP_BYTES) {
    const mb = (MAX_ZIP_BYTES / 1024 / 1024).toFixed(0);
    throw new Error(`ZIP exceeds ${mb} MB limit (${(zipBuffer.length / 1024 / 1024).toFixed(2)} MB). Reduce the number of files or bundle size.`);
  }
  const zipBase64 = zipBuffer.toString('base64');
  const zipKb = (zipBuffer.length / 1024).toFixed(1);
  logger.log(`ZIP: ${zipKb} KB (${fileCount} files)`);

  const baseUrl = site.baseUrl;
  logger.log(t('system.publish_sending', { url: baseUrl }));
  const response = await storePost(`${baseUrl}/api/store/systems/publish`, {
    kind: 'aioson.store.system',
    slug: manifest.slug,
    version: manifest.version,
    zipBase64,
    files: buildMode ? undefined : files,
    manifest,
    visibility,
    paid,
    authorizedEmails,
    workspaceSlug: ws?.slug || null,
  }, token);

  logger.log(t('system.publish_done', { slug: manifest.slug, url: `${baseUrl}/store/systems/${manifest.slug}` }));
  logger.log(t('system.publish_summary', { files: fileCount, kb: zipKb }));
  // Primeiro app público de uma conta nova nasce DRAFT (quarentena do servidor):
  // sem este aviso o dev lia "Publicado" e o app não aparecia pra ninguém.
  if (response && response.quarantined) {
    logger.log(t('system.publish_quarantined'));
  }
  const accessNotice = publishAccessNotice(response, manifest.version);
  if (accessNotice) logger.log(accessNotice);
  // Sem capa/galeria declaradas nada é enviado e o site mantém as imagens atuais.
  const images = listingImages.images.length
    ? await sendListingImages({ dir, site, slug: manifest.slug, images: listingImages.images, logger, t })
    : null;
  const imagesFailed = Boolean(images && !images.ok);
  return {
    ok: true, manifest, fileCount, totalBytes, visibility, paid, response, protectedTs, rawSource,
    protectionLevel: protection.level, protectedJs, unprotectedJs,
    images, imagesFailed,
    // Versão publicada e imagens não: saída 3, para CI/scripts notarem a Loja
    // com as imagens antigas (o `--images-only` do aviso resolve).
    ...(imagesFailed ? { exitCode: 3 } : {})
  };
}

async function publishProtectedRuntime({ dir, site, manifest, options, logger, t }) {
  const projectId = String(options['workspace-id'] || '');
  if (!projectId) throw new Error('Use --workspace-id=<remote workspace ID> for protected runtime publication.');
  if (!site && !options['dry-run']) throw new Error('A connected site session is required.');
  const preflight = options['dry-run'] ? null : await storeGet(`${site.baseUrl}/api/store/runtime/publish`, site.token);
  if (preflight && (!preflight.eligible || !preflight.workspaces?.some((workspace) => workspace.id === projectId))) throw new Error('Active Play Business and workspace management permission are required.');
  const attemptPath = path.join(dir, '.aioson', 'system-packages', manifest.slug, 'publish-attempt.json');
  if (options.retry) {
    const saved = JSON.parse(await fs.readFile(attemptPath, 'utf8'));
    if (saved.publisherUserId !== preflight?.publisherUserId || saved.meta.projectId !== projectId) throw new Error('This attempt belongs to another publisher or workspace.');
    try {
      const receipt = await storeGet(`${site.baseUrl}/api/store/runtime/publish?attemptId=${encodeURIComponent(saved.meta.attemptId)}`, site.token);
      return { ok: true, response: receipt, reconciled: true };
    } catch (error) { if (!/^HTTP 404:/.test(error.message)) throw error; }
    if (await runtimeSourceFingerprint(dir) !== saved.sourceFingerprint) throw new Error('The project changed after review. Build and review a new runtime.');
    const root = await fs.realpath(path.dirname(attemptPath));
    const file = await fs.realpath(saved.artifactPath);
    const relative = path.relative(root, file);
    if (relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('The retry artifact is outside staging.');
    return upload(saved.meta, await fs.readFile(file));
  }
  const artifact = await createRuntimeArtifact({ dir, manifest, options, logger, t });
  if (options['dry-run']) return artifact;
  const app = artifact.manifest;
  const listing = { name: app.name, slug: app.slug, summary: manifest.summary ?? app.summary ?? '', description: app.description ?? manifest.description ?? '', category: manifest.category ?? app.category ?? '',
    supportEmail: manifest.support_email ?? app.support_email, supportUrl: manifest.support_url ?? app.support_url,
    minPlayVersion: app.compatibility.min_play_version, releaseNotes: options['release-notes'] ?? manifest.release_notes ?? app.release_notes ?? '',
    commercial: options.paid ? 'PAID' : (manifest.commercial ?? app.commercial ?? 'FREE'), licenseMode: app.license_mode ?? 'app-managed' };
  if (!listing.summary || !listing.description || !listing.category || !listing.releaseNotes) throw new Error('Complete summary, description, category and release_notes before uploading.');
  const meta = { protocolVersion: 1, attemptId: require('node:crypto').randomUUID(), projectId,
    ...(options['system-id'] ? { systemId: String(options['system-id']) } : {}), version: app.version, listing, packageSha256: artifact.sha256 };
  await fs.writeFile(attemptPath, JSON.stringify({ publisherUserId: preflight.publisherUserId, meta, artifactPath: artifact.path, sourceFingerprint: artifact.sourceFingerprint }, null, 2));
  return upload(meta, await fs.readFile(artifact.path));

  async function upload(meta, bytes) {
    if (bytes.length > 10 * 1024 * 1024 || require('node:crypto').createHash('sha256').update(bytes).digest('hex') !== meta.packageSha256) throw new Error('The staged runtime integrity changed.');
    const form = new FormData(); form.set('meta', JSON.stringify(meta)); form.set('artifact', new Blob([bytes], { type: 'application/zip' }), 'runtime.zip');
    const response = await storeRequest(`${site.baseUrl}/api/store/runtime/publish`, site.token, { method: 'POST', body: form, redirect: 'error' }, 120000);
    logger.log(`Runtime received in workspace. Installation reference: ${response.systemId}`);
    return { ok: true, response, visibility: 'PRIVATE' };
  }
}

// `--images-only`: reenvia capa + galeria do system.json sem pacote e sem
// versão nova (versões são imutáveis — é o caminho depois de um envio que falhou).
async function runImagesOnly({ dir, site, manifest, images, options, logger, t }) {
  if (images.length === 0) throw new Error(t('system.error_images_only_nothing'));
  if (options['dry-run']) {
    logger.log(t('system.images_only_dry_run', { count: images.length }));
    for (const image of images) logger.log(`  ${image.file}`);
    return { ok: true, dryRun: true, imagesOnly: true, manifest };
  }
  logger.log(t('system.images_only_sending', { count: images.length, slug: manifest.slug }));
  const result = await sendListingImages({ dir, site, slug: manifest.slug, images, logger, t });
  return { ok: result.ok, imagesOnly: true, manifest, images: result, imagesFailed: !result.ok };
}

// ── system:list ─────────────────────────────────────────────────────────────

async function runSystemList({ args, options, logger, t }) {
  if (options.remote) {
    const config = await readConfig();
    const { token, baseUrl } = requireSite(config, options, t);
    logger.log(t('list_remote_fetching', { type: 'systems' }));
    const response = await storeGet(`${baseUrl}/api/store/systems`, token);
    const systems = response.systems || [];
    if (systems.length === 0) {
      logger.log(t('system.list_remote_empty'));
    } else {
      logger.log(t('system.list_remote_header', { count: systems.length }));
      for (const s of systems) {
        logger.log(t('system.list_remote_item', { slug: s.slug, name: s.name || s.slug, version: s.version || '?', visibility: s.visibility || '?' }));
      }
    }
    return { ok: true, systems, remote: true };
  }

  // Local: list cached system packages
  const projectDir = await findProjectRoot(resolveTargetDir(args));
  const pkgsDir = path.join(projectDir, SYSTEM_PACKAGES_DIR);

  if (!(await exists(pkgsDir))) {
    logger.log(t('system.list_local_empty'));
    return { ok: true, systems: [] };
  }

  const entries = await fs.readdir(pkgsDir, { withFileTypes: true });
  const systems = entries
    .filter(e => e.isDirectory())
    .map(e => ({ slug: e.name }));

  if (systems.length === 0) {
    logger.log(t('system.list_local_empty'));
  } else {
    logger.log(t('system.list_local_header', { count: systems.length }));
    for (const s of systems) {
      logger.log(t('system.list_local_item', { slug: s.slug }));
    }
  }

  return { ok: true, systems };
}

// ── system:install (developer use — downloads source from store) ─────────────

async function runSystemInstall({ args, options, logger, t }) {
  const config = await readConfig();
  const { token, baseUrl } = requireSite(config, options, t);
  const projectDir = await findProjectRoot(resolveTargetDir(args));

  const ref = String(options.slug || options.code || args[1] || '').trim();
  if (!ref) throw new Error(t('store.error_missing_code_or_slug'));

  logger.log(t('system.install_fetching', { ref }));

  const response = await storePost(`${baseUrl}/api/store/systems/install`, {
    ref,
    workspaceSlug: (await readWorkspace(projectDir))?.slug || null,
  }, token);

  const slug = response.manifest?.slug || response.slug;
  if (!slug || !response.files) throw new Error(t('store.error_invalid_response'));
  // Slug e caminhos vêm do servidor (e `--base-url` aponta para qualquer site):
  // nada é apagado, copiado ou gravado antes de tudo cair dentro da pasta do pacote.
  const pkgDir = path.join(projectDir, SYSTEM_PACKAGES_DIR, assertInstallSlug(slug, t));
  const writes = installTargets(pkgDir, response.files, t);

  const version = response.manifest?.version || '?';
  const publisher = response.publisher || 'unknown';
  logger.log(t('store.install_preview_header', { slug, version, publisher }));

  if (options.inspect) {
    logger.log(t('store.install_inspect_files', { count: Object.keys(response.files).length }));
    for (const f of Object.keys(response.files).sort()) logger.log(`  ${f}`);
    logger.log(t('store.install_inspect_hint'));
    return { ok: true, slug, inspect: true, files: Object.keys(response.files) };
  }

  if ((await exists(pkgDir)) && !options.force) {
    const backupDir = path.join(projectDir, BACKUPS_DIR, `system-packages/${slug}`);
    logger.log(t('store.install_backing_up', { path: backupDir }));
    await fs.rm(backupDir, { recursive: true, force: true });
    await fs.cp(pkgDir, backupDir, { recursive: true });
    await fs.rm(pkgDir, { recursive: true, force: true });
  }

  // Write files
  logger.log(t('system.install_writing'));
  await writeInstallTargets(writes);

  logger.log(t('system.install_done', { slug, path: pkgDir }));
  return { ok: true, slug, path: pkgDir, manifest: response.manifest };
}

module.exports = {
  obfuscateJs,
  protectJs,
  resolveProtectionLevel,
  loadAppObfuscator,
  unprotectedJsError,
  MAX_OBFUSCATION_OPTIONS,
  protectRuntimeTypeScript,
  rawSourceError,
  readBuildOutputDirs,
  stripSourceMapComments,
  startEntryProblems,
  createZipBuffer,
  collectSystemFiles,
  runSystemPackage,
  runSystemPublish,
  publishAccessNotice,
  runSystemList,
  runSystemInstall
};
