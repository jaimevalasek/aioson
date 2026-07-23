'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const ignore = require('ignore');
const { exists, ensureDir } = require('../utils');
const { readConfig } = require('./config');
const { readWorkspace, findProjectRoot } = require('./workspace');

let _terser = null;
function getTerser() {
  if (!_terser) _terser = require('terser');
  return _terser;
}

let _obfuscator = null;
function getObfuscator() {
  if (!_obfuscator) _obfuscator = require('javascript-obfuscator');
  return _obfuscator;
}

// Ofusca JS compilado no publish --build (minify + string-array encoding +
// mangling). Funcionalidade do framework — o app não configura nada. Conservador
// (renameGlobals/controlFlowFlattening/selfDefending OFF) pra não quebrar runtime
// Node (require/exports, prisma) nem bundles de frontend. Falha num arquivo →
// devolve o compilado original (não derruba o publish).
// Detecta JS já minificado (bundle de frontend tipo vite/webpack): linhas muito
// longas e poucas quebras. Não vale re-ofuscar — incha o pacote, pode quebrar o
// React e o ganho é baixo (já está minificado). O alvo de valor é o backend (tsc,
// código legível), esse sim é ofuscado.
function looksMinified(code) {
  const newlines = (code.match(/\n/g) || []).length;
  const avgLineLen = code.length / (newlines + 1);
  return code.length > 30000 && avgLineLen > 200;
}

function obfuscateJs(code) {
  if (looksMinified(code)) return code; // já minificado → mantém como está
  try {
    return getObfuscator()
      .obfuscate(code, {
        compact: true,
        controlFlowFlattening: false,
        deadCodeInjection: false,
        stringArray: true,
        stringArrayEncoding: ['base64'],
        stringArrayThreshold: 0.75,
        identifierNamesGenerator: 'hexadecimal',
        renameGlobals: false,
        selfDefending: false,
        debugProtection: false,
        disableConsoleOutput: false,
        sourceMap: false,
      })
      .getObfuscatedCode();
  } catch {
    return code;
  }
}

async function createZipBuffer(files) {
  // archiver fica fixado em ^7 (CJS, API chamável `archiver('zip', opts)`). A v8
  // virou ESM e trocou a API por classes nomeadas (sem função default) — o que
  // quebrava com "archiver is not a function" no Node 23. Ver package.json.
  const archiver = require('archiver');
  const { PassThrough } = require('stream');
  return new Promise((resolve, reject) => {
    const chunks = [];
    const stream = new PassThrough();
    stream.on('data', (chunk) => chunks.push(chunk));
    stream.on('end', () => resolve(Buffer.concat(chunks)));
    stream.on('error', reject);

    const archive = archiver('zip', { zlib: { level: 9 } });
    archive.on('error', reject);
    archive.pipe(stream);

    for (const [relPath, content] of Object.entries(files)) {
      archive.append(content, { name: relPath });
    }
    archive.finalize();
  });
}

const DEFAULT_BASE_URL = 'https://aioson.com';
const SYSTEM_PACKAGES_DIR = '.aioson/system-packages';
const BACKUPS_DIR = '.aioson/.backups';

// Extensions allowed in a system package (Vite React source tree)
const SYSTEM_ALLOWED_EXTS = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs',
  '.json', '.jsonc',
  '.css', '.scss', '.sass', '.less',
  '.html',
  '.svg', '.ico',
  '.md', '.txt',
  '.sql',
  '.prisma',
  '.env', '.env.example', '.env.template',
  '.yaml', '.yml',
  '.toml',
  '.gitignore',
]);

const SYSTEM_BUILD_ALLOWED_EXTS = new Set([
  '.js', '.jsx', '.mjs', '.cjs',
  '.json', '.jsonc',
  '.css',
  '.html',
  '.svg', '.ico',
  '.sql',
  '.yaml', '.yml',
  '.prisma',
]);

const RUNTIME_SERVER_SOURCE_EXTS = new Set(['.ts', '.tsx']);

// Dirs/files to skip when collecting sources
const SKIP_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', '.turbo', '.next',
  '.cache', 'coverage', '.nyc_output', 'out',
  // AIOSON tooling — não faz parte do código-fonte do sistema
  '.aioson', '.claude', '.codex', 'researchs',
]);

const SKIP_DIRS_BUILD = new Set([
  'node_modules', '.git', '.turbo', '.next',
  '.cache', 'coverage', '.nyc_output',
  'src', 'dashboard/src',
  '.aioson', '.claude', '.codex', 'researchs',
]);

const SKIP_FILES = new Set([
  'package-lock.json', 'yarn.lock', 'pnpm-lock.yaml',
  'bun.lockb',
  // Arquivo de credenciais LLM local (convenção AIOSON) — NUNCA publicar, mesmo
  // que tenha sido commitado por engano. Defense-in-depth: o filtro de
  // .gitignore abaixo também pega, mas isto cobre apps sem .gitignore.
  'aioson-models.json',
]);

// `.aioson` é tooling/dev e fica de fora do pacote (SKIP_DIRS), MAS algumas
// coisas dali os squads leem EM RUNTIME — sem elas o app quebra (ex.:
// SQUAD_MANIFEST_INVALID procurando `.aioson/squads/<slug>/squad.manifest.json`).
//
// Modelo: `.aioson/squads` é SEMPRE incluído (obrigatório). O resto é OPT-IN —
// o dev declara só o que o squad realmente precisa num `.aioson/build-options.json`
// (não viaja peso à toa). Cada entrada é um caminho relativo a `.aioson/` e pode
// ser pasta (`docs`), subpasta (`skills/skill-x`) ou arquivo (`docs/guia.md`).
//   { "include": ["docs", "skills/atendimento", "rules/foo.md"] }
const AIOSON_MANDATORY_INCLUDES = ['squads'];

/** Resolve o que incluir do `.aioson` de um app: `squads` (sempre) + o que o
 *  `build-options.json` declarar. Normaliza e descarta entradas inseguras. */
async function readAiosonIncludes(aiosonDir) {
  const includes = new Set(AIOSON_MANDATORY_INCLUDES);
  try {
    const optsPath = path.join(aiosonDir, 'build-options.json');
    if (await exists(optsPath)) {
      const opts = JSON.parse(await fs.readFile(optsPath, 'utf8'));
      const list = Array.isArray(opts.include) ? opts.include : [];
      for (let entry of list) {
        if (typeof entry !== 'string') continue;
        entry = entry.replace(/^\.aioson[\\/]/i, '').replace(/^[\\/]+/, '').replace(/[\\/]+$/, '').trim();
        if (!entry || entry.split(/[\\/]/).includes('..')) continue; // anti path-traversal
        includes.add(entry);
      }
    }
  } catch { /* build-options.json inválido → só os obrigatórios */ }
  return [...includes];
}

// No modo --build, estas pastas são a SAÍDA do build (compilado/minificado) e
// DEVEM viajar no pacote — mesmo estando no .gitignore (build output costuma ser
// gitignored). Sem isso, o filtro de .gitignore mataria o `dist/` e o app
// instalado não teria o que rodar.
const BUILD_OUTPUT_DIRS = new Set(['dist', 'build', 'out', '.next']);

// Testes / mocks NUNCA vão no pacote — são peso morto em runtime (e ainda
// inflavam o pacote ao serem ofuscados). O check é INCONDICIONAL: pega também os
// testes COMPILADOS dentro do `dist/` (que viajam mesmo com `src/` excluído).
const TEST_DIRS = new Set(['__tests__', '__mocks__', '__snapshots__']);
const TEST_FILE_RE = /\.(test|spec)\.[cm]?[jt]sx?$/i;

// Config de runtime que PRECISA viajar mesmo no --build (mesmo sendo .ts, que
// normalmente é excluído): o `vite preview` (frontend em produção) lê o
// `vite.config.*` pra porta + proxy do /api. Sem ele, instalação limpa quebra o
// frontend. NÃO é ofuscado (é config lida pelo vite, não lógica a proteger).
const RUNTIME_CONFIG_RE = /^vite\.config\.[cm]?[jt]s$/i;

// Dentro das pastas de runtime do `.aioson`, os arquivos são majoritariamente
// markdown (definições de agentes/skills, docs) além de json/yaml — então
// ampliamos as extensões permitidas pra esse subconjunto, senão os `.md` seriam
// filtrados e o squad subiria sem os agentes.
const AIOSON_RUNTIME_EXTS = new Set(['.md', '.mdx', '.txt']);

const MAX_FILE_BYTES = 512 * 1024;             // 512 KB per file (source)
const MAX_FILE_BYTES_BUILD = 2 * 1024 * 1024;  // 2 MB per file (compiled bundles)
const MAX_PACKAGE_BYTES = 20 * 1024 * 1024;    // 20 MB total

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

function resolveBaseUrl(config) {
  return String(config.aiosonBaseUrl || DEFAULT_BASE_URL).replace(/\/+$/, '');
}

function requireToken(config, t) {
  const token = config.aiosonToken;
  if (!token) throw new Error(t('store.error_not_authenticated'));
  return token;
}

async function storePost(url, payload, token) {
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
      accept: 'application/json',
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(120000),
  });

  const text = await response.text();
  let parsed = null;
  try { parsed = JSON.parse(text); } catch { /* */ }

  if (!response.ok) {
    const detail = (parsed && parsed.error) ? String(parsed.error) : `${response.status} ${response.statusText}`;
    throw new Error(`HTTP ${response.status}: ${detail}`);
  }

  return parsed;
}

async function storeGet(url, token) {
  const response = await fetch(url, {
    headers: { authorization: `Bearer ${token}`, accept: 'application/json' },
    signal: AbortSignal.timeout(15000),
  });
  const text = await response.text();
  let parsed = null;
  try { parsed = JSON.parse(text); } catch { /* */ }
  if (!response.ok) {
    const detail = (parsed && parsed.error) ? String(parsed.error) : `${response.status} ${response.statusText}`;
    throw new Error(`HTTP ${response.status}: ${detail}`);
  }
  return parsed;
}

/**
 * Collect all eligible source files under `dir`.
 * Returns { relativePath: content } — only text files with allowed extensions.
 */
async function collectSystemFiles(dir, { buildMode = false } = {}) {
  const files = {};
  let totalBytes = 0;
  const errors = [];
  const skipDirs = buildMode ? SKIP_DIRS_BUILD : SKIP_DIRS;
  const allowedExts = buildMode ? SYSTEM_BUILD_ALLOWED_EXTS : SYSTEM_ALLOWED_EXTS;

  // Respeita o .gitignore do app: arquivos/pastas locais ou gerados em runtime
  // NÃO devem viajar no pacote. Sem isso vazavam coisas como `aioson-models.json`
  // (chave LLM do dev!), `.env` e `atendimento-config.json` (config por-instalação
  // que gateia o onboarding). NÃO se aplica às pastas de runtime do `.aioson`
  // (forceInclude) — essas viajam por design, mesmo que gitignored.
  const ig = ignore();
  try {
    const gitignorePath = path.join(dir, '.gitignore');
    if (await exists(gitignorePath)) {
      ig.add(await fs.readFile(gitignorePath, 'utf8'));
    }
  } catch { /* sem .gitignore → não filtra por ignore */ }

  let limitHit = false;

  // Processa UM arquivo (checa skip/ignore/extensão/tamanho, lê, ofusca se build,
  // grava). Usado pelo walk e pelos includes pontuais do `.aioson` (que podem ser
  // arquivo único). `forceInclude` = bypassa skip/ignore/extensão (pastas runtime).
  async function addFile(fullPath, relPath, forceInclude, entryName) {
    if (limitHit) return;
    if (!forceInclude && SKIP_FILES.has(entryName)) return;
    if (!forceInclude && ig.ignores(relPath)) return;

    const ext = entryName.includes('.')
      ? `.${entryName.split('.').pop().toLowerCase()}`
      : '';
    const isRuntimeServerSource =
      buildMode &&
      relPath.startsWith('server/') &&
      RUNTIME_SERVER_SOURCE_EXTS.has(ext);
    const extAllowed =
      allowedExts.has(ext) ||
      isRuntimeServerSource ||
      (forceInclude && AIOSON_RUNTIME_EXTS.has(ext)) ||
      RUNTIME_CONFIG_RE.test(entryName); // vite.config.* viaja mesmo no --build
    if (!extAllowed && ext !== '') return;

    try {
      const stat = await fs.stat(fullPath);
      const maxBytes = buildMode ? MAX_FILE_BYTES_BUILD : MAX_FILE_BYTES;
      if (stat.size > maxBytes) {
        errors.push(`File too large (skipped): "${relPath}" (${(stat.size / 1024).toFixed(0)} KB)`);
        return;
      }
      totalBytes += stat.size;
      if (totalBytes > MAX_PACKAGE_BYTES) {
        errors.push(`Package exceeds ${MAX_PACKAGE_BYTES / 1024 / 1024} MB limit — stop collecting.`);
        limitHit = true;
        return;
      }
      let content = await fs.readFile(fullPath, 'utf8');
      if (
        buildMode &&
        (ext === '.js' || ext === '.mjs' || ext === '.cjs') &&
        !RUNTIME_CONFIG_RE.test(entryName) // não ofuscar config lida pelo vite
      ) {
        content = obfuscateJs(content);
      }
      files[relPath] = content;
    } catch {
      // binary or unreadable — skip silently
    }
  }

  async function walk(current, rel, forceInclude = false) {
    if (limitHit) return;
    const entries = await fs.readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);
      const relPath = rel ? `${rel}/${entry.name}` : entry.name;

      // Testes/mocks fora do pacote — incondicional (pega até dentro do dist).
      if (entry.isDirectory() && TEST_DIRS.has(entry.name)) continue;
      if (!entry.isDirectory() && TEST_FILE_RE.test(entry.name)) continue;

      if (entry.isDirectory()) {
        // `.aioson`: normalmente fica fora, mas descemos só nas subpastas de
        // runtime (squads/docs/skills/rules/genomes/agents) pra o app não
        // quebrar. As subpastas entram em modo forceInclude (mantém estrutura
        // e arquivos originais). Vale pra qualquer nível onde apareça `.aioson`.
        if (entry.name === '.aioson' && !forceInclude) {
          // `squads` (sempre) + o que o build-options.json declarar. Cada include
          // pode ser pasta/subpasta (→ walk) ou arquivo único (→ addFile).
          const includes = await readAiosonIncludes(fullPath);
          for (const inc of includes) {
            const incPath = path.join(fullPath, inc);
            if (!(await exists(incPath))) continue;
            const st = await fs.stat(incPath);
            if (st.isDirectory()) {
              await walk(incPath, `${relPath}/${inc}`, true);
            } else {
              await addFile(incPath, `${relPath}/${inc}`, true, path.basename(inc));
            }
          }
          continue;
        }
        // Saída do build (--build): viaja mesmo gitignored. forceInclude bypassa
        // o filtro de .gitignore; o filtro de extensão + minify continuam (sourcemaps
        // `.map` ficam de fora por não estarem nas extensões permitidas → não vaza fonte).
        if (buildMode && !forceInclude && BUILD_OUTPUT_DIRS.has(entry.name)) {
          await walk(fullPath, relPath, true);
          continue;
        }
        if (!forceInclude) {
          if (skipDirs.has(entry.name)) continue;
          if (rel && skipDirs.has(`${rel}/${entry.name}`)) continue;
          if (ig.ignores(relPath)) continue; // gitignored → não viaja
        }
        await walk(fullPath, relPath, forceInclude);
        continue;
      }

      // Arquivo — processado pelo addFile (skip/ignore/ext/tamanho/ofuscação).
      await addFile(fullPath, relPath, forceInclude, entry.name);
    }
  }

  await walk(dir, '');
  return { files, totalBytes, errors };
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
  validateListingFields(manifest);
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

function validateListingFields(m) {
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
  const dir = path.resolve(process.cwd(), args[0] || '.');

  logger.log(t('system.package_reading_manifest'));
  const manifest = await readSystemJson(dir, t);
  logger.log(t('system.package_manifest_ok', { slug: manifest.slug, version: manifest.version, name: manifest.name }));

  // Alinha os package.json à versão do system.json antes de coletar.
  if (!options['dry-run']) {
    await syncPackageVersions(dir, manifest.version, logger);
  }

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

async function runSystemPublish({ args, options, logger, t }) {
  const config = await readConfig();
  const token = requireToken(config, t);
  const dir = path.resolve(process.cwd(), args[0] || '.');
  const buildMode = Boolean(options.build);

  logger.log(t('system.publish_reading_manifest'));
  const manifest = await readSystemJson(dir, t);
  logger.log(t('system.package_manifest_ok', { slug: manifest.slug, version: manifest.version, name: manifest.name }));

  // Alinha os package.json à versão do system.json antes de buildar/coletar.
  if (!options['dry-run']) {
    await syncPackageVersions(dir, manifest.version, logger);
  }

  if (buildMode) {
    const buildCmd = manifest.build_command || 'npm run build';
    logger.log(`Building: ${buildCmd}`);
    const { execSync } = require('child_process');
    try {
      execSync(buildCmd, { cwd: dir, stdio: 'inherit', timeout: 300_000 });
    } catch (e) {
      throw new Error(`Build failed: ${e.message}`);
    }
    logger.log('Build complete. Collecting compiled output (source excluded)...');
  } else {
    logger.log(t('system.package_collecting_files'));
  }

  const { files, totalBytes, errors } = await collectSystemFiles(dir, { buildMode });

  if (errors.length > 0) {
    for (const e of errors) logger.log(`  [WARN] ${e}`);
  }

  const fileCount = Object.keys(files).length;
  logger.log(t('system.package_files_found', { count: fileCount, kb: (totalBytes / 1024).toFixed(1) }));

  // Basic integrity checks
  if (!files['system.json']) {
    throw new Error(t('system.error_no_manifest', { path: path.join(dir, 'system.json') }));
  }
  if (!files['package.json']) {
    throw new Error(t('system.error_missing_package_json'));
  }

  const visibility = options.private ? 'private' : 'public';
  const paid = Boolean(options.paid);

  // app-licensing-revenue-share (Fase 5 / BR-01): app PAID exige preço na fonte
  // única (system.json). Falha cedo aqui, antes do upload — o servidor também
  // recusa na criação. Aceita priceInCents | price_in_cents | price (em unidades).
  if (paid) {
    const priceCents =
      Number(manifest.priceInCents) ||
      Number(manifest.price_in_cents) ||
      (Number(manifest.price) > 0 ? Math.round(Number(manifest.price) * 100) : 0);
    if (!priceCents || priceCents <= 0) {
      throw new Error(
        'App PAID exige preço: defina "priceInCents" (centavos) ou "price" no system.json antes de publicar com --paid.'
      );
    }
    // SF-alrs-03: visibility=PAID e preço são geridos no banco do aioson.com (dashboard
    // da loja) — NÃO via este flag. O --paid só valida o preço localmente; não publica
    // o app como pago por si só.
    logger.log(
      'Nota: visibility=PAID e preço são definidos no aioson.com (dashboard da loja). O flag --paid valida o preço localmente, mas não publica o app como pago sozinho.'
    );
  }

  const ws = await readWorkspace(dir);

  // Lista de emails autorizados a instalar quando visibility=private.
  // Aceita via --invite="email1,email2" OU campo `authorized_emails` no
  // manifest (system.json). Sem efeito quando visibility !== private.
  const authorizedEmails = parseInviteEmails(options.invite, manifest.authorized_emails);

  if (options['dry-run']) {
    logger.log(t('system.publish_dry_run', { slug: manifest.slug, version: manifest.version, visibility }));
    return { ok: true, dryRun: true, manifest, fileCount, totalBytes, visibility, authorizedEmails };
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

  logger.log(t('system.publish_sending'));
  const baseUrl = resolveBaseUrl(config);
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
  return { ok: true, manifest, fileCount, totalBytes, visibility, paid, response };
}

// ── system:list ─────────────────────────────────────────────────────────────

async function runSystemList({ args, options, logger, t }) {
  if (options.remote) {
    const config = await readConfig();
    const token = requireToken(config, t);
    const baseUrl = resolveBaseUrl(config);
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
  const projectDir = await findProjectRoot(path.resolve(process.cwd(), args[0] || '.'));
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
  const token = requireToken(config, t);
  const projectDir = await findProjectRoot(path.resolve(process.cwd(), args[0] || '.'));
  const baseUrl = resolveBaseUrl(config);

  const ref = String(options.slug || options.code || args[1] || '').trim();
  if (!ref) throw new Error(t('store.error_missing_code_or_slug'));

  logger.log(t('system.install_fetching', { ref }));

  const response = await storePost(`${baseUrl}/api/store/systems/install`, {
    ref,
    workspaceSlug: (await readWorkspace(projectDir))?.slug || null,
  }, token);

  const slug = response.manifest?.slug || response.slug;
  if (!slug || !response.files) throw new Error(t('store.error_invalid_response'));

  const version = response.manifest?.version || '?';
  const publisher = response.publisher || 'unknown';
  logger.log(t('store.install_preview_header', { slug, version, publisher }));

  if (options.inspect) {
    logger.log(t('store.install_inspect_files', { count: Object.keys(response.files).length }));
    for (const f of Object.keys(response.files).sort()) logger.log(`  ${f}`);
    logger.log(t('store.install_inspect_hint'));
    return { ok: true, slug, inspect: true, files: Object.keys(response.files) };
  }

  const pkgDir = path.join(projectDir, SYSTEM_PACKAGES_DIR, slug);

  if ((await exists(pkgDir)) && !options.force) {
    const backupDir = path.join(projectDir, BACKUPS_DIR, `system-packages/${slug}`);
    logger.log(t('store.install_backing_up', { path: backupDir }));
    await fs.rm(backupDir, { recursive: true, force: true });
    await fs.cp(pkgDir, backupDir, { recursive: true });
    await fs.rm(pkgDir, { recursive: true, force: true });
  }

  // Write files
  logger.log(t('system.install_writing'));
  for (const [relPath, content] of Object.entries(response.files)) {
    if (typeof content !== 'string') continue;
    const destPath = path.join(pkgDir, relPath);
    await ensureDir(path.dirname(destPath));
    await fs.writeFile(destPath, content, 'utf8');
  }

  logger.log(t('system.install_done', { slug, path: pkgDir }));
  return { ok: true, slug, path: pkgDir, manifest: response.manifest };
}

module.exports = { collectSystemFiles, runSystemPackage, runSystemPublish, runSystemList, runSystemInstall };
