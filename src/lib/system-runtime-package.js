'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const ignore = require('ignore');
const { exists } = require('../utils');
const { collectStagedSecretFindings } = require('./security/staged-secret-detector');
const { isInside, assertInstallSlug } = require('./store/install-containment');
const { createHash } = require('node:crypto');

let _terser = null;
function getTerser() {
  if (!_terser) _terser = require('terser');
  return _terser;
}

// Top level só é renomeado em módulo: num script solto os nomes de topo são
// globais e outro arquivo pode depender deles. Em ESM os exports mantêm o nome
// público; em CommonJS `require`/`module.exports` são livres e não são tocados.
function detectModuleKind(code) {
  if (/(?:^|[;}\n])\s*(?:import\s*[\w{*'"]|export\s*[\w{*])/m.test(code)) return 'esm';
  if (/\brequire\s*\(|\bmodule\.exports\b|\bexports\.\w/.test(code)) return 'cjs';
  return 'script';
}

// Níveis de proteção do --build (system.json `build_protection` ou
// `--protection=`):
// - standard: terser com compressão e mangling inclusive de top level em módulos.
//   Nomes de classe ficam (erros e `instanceof` por nome dependem deles).
// - max: standard + javascript-obfuscator (strings cifradas em rc4, fluxo de
//   controle achatado). O ofuscador NÃO é dependência do CLI — cada release
//   trouxe risco de supply chain a todo usuário do aioson. Ele é carregado do
//   node_modules do app, com versão exata declarada no package.json do app.
const PROTECTION_LEVELS = ['standard', 'max'];
const OBFUSCATOR_PACKAGE = 'javascript-obfuscator';
const MAX_OBFUSCATION_OPTIONS = Object.freeze({
  compact: true,
  controlFlowFlattening: true,
  controlFlowFlatteningThreshold: 0.5,
  deadCodeInjection: false,
  debugProtection: false,
  disableConsoleOutput: false,
  identifierNamesGenerator: 'hexadecimal',
  numbersToExpressions: true,
  renameGlobals: false,
  selfDefending: false,
  simplify: true,
  sourceMap: false,
  splitStrings: true,
  splitStringsChunkLength: 8,
  stringArray: true,
  stringArrayCallsTransform: true,
  stringArrayEncoding: ['rc4'],
  stringArrayIndexShift: true,
  stringArrayRotate: true,
  stringArrayShuffle: true,
  stringArrayThreshold: 1,
  stringArrayWrappersCount: 2,
  stringArrayWrappersType: 'function',
  transformObjectKeys: false,
  unicodeEscapeSequence: false
});

async function minifyForRuntime(code) {
  const kind = detectModuleKind(code);
  const result = await getTerser().minify(code, {
    module: kind === 'esm',
    toplevel: kind !== 'script',
    compress: { passes: 2 },
    mangle: { keep_classnames: true },
    keep_classnames: true,
    format: { comments: false }
  });
  if (typeof result.code !== 'string') throw new Error('terser returned no code');
  return result.code;
}

// Toda entrada JS passa pela transformação, inclusive bundles com linhas longas:
// o formato do arquivo não prova que ele não contenha fonte legível. No nível
// max, o ofuscador também recebe bundles de frontend.
// Devolve `{ code, protected, failed }`. O publish bloqueia falhas por padrão.
async function protectJs(code, { level = 'standard', obfuscator = null } = {}) {
  try {
    let out = await minifyForRuntime(code);
    if (level === 'max' && out.trim()) {
      out = obfuscator.obfuscate(out, MAX_OBFUSCATION_OPTIONS).getObfuscatedCode();
    }
    return { code: out, protected: true, failed: false };
  } catch {
    return { code, protected: false, failed: true };
  }
}

async function obfuscateJs(code, protection) {
  return (await protectJs(code, protection)).code;
}

function resolveProtectionLevel(options, manifest, t) {
  const raw = options.protection !== undefined ? options.protection : manifest && manifest.build_protection;
  if (raw === undefined || raw === null) return 'standard';
  const level = String(raw).trim().toLowerCase();
  if (!PROTECTION_LEVELS.includes(level)) {
    throw new Error(t('system.error_protection_level', { value: String(raw), levels: PROTECTION_LEVELS.join(', ') }));
  }
  return level;
}

// Carrega o ofuscador do próprio app: versão exata no package.json e módulo
// resolvido dentro do node_modules do app (nunca de uma pasta-pai).
function loadAppObfuscator(dir, t) {
  const appDir = path.resolve(dir);
  const missing = () => new Error(t('system.error_obfuscator_missing', { pkg: OBFUSCATOR_PACKAGE }));
  let pkg;
  try {
    pkg = JSON.parse(require('node:fs').readFileSync(path.join(appDir, 'package.json'), 'utf8'));
  } catch {
    throw missing();
  }
  const declared = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) }[OBFUSCATOR_PACKAGE];
  if (!declared) throw missing();
  if (!/^\d+\.\d+\.\d+$/.test(String(declared).trim())) {
    throw new Error(t('system.error_obfuscator_unpinned', { pkg: OBFUSCATOR_PACKAGE, version: String(declared) }));
  }
  const appRequire = require('node:module').createRequire(path.join(appDir, 'package.json'));
  let resolved;
  try {
    resolved = appRequire.resolve(OBFUSCATOR_PACKAGE);
  } catch {
    throw missing();
  }
  const norm = (p) => (process.platform === 'win32' ? p.toLowerCase() : p);
  let appModules = path.join(appDir, 'node_modules') + path.sep;
  try {
    appModules = require('node:fs').realpathSync(path.join(appDir, 'node_modules')) + path.sep;
  } catch { /* sem node_modules → resolve acima já falhou ou veio de fora */ }
  if (!norm(path.resolve(resolved)).startsWith(norm(appModules))) throw missing();
  const mod = appRequire(OBFUSCATOR_PACKAGE);
  const api = mod && typeof mod.obfuscate === 'function' ? mod : mod && mod.default;
  if (!api || typeof api.obfuscate !== 'function') throw missing();
  return api;
}

// TypeScript de runtime e vite.config.* — arquivos que o app executa ou lê
// diretamente após o build. Node >= 22.13 traz `module.stripTypeScriptTypes`
// (amaro/swc):
// remove tipos e converte enums/parameter properties em JS puro; o resultado
// passa pelo mesmo terser do código compilado e volta SOB O MESMO caminho
// `.ts` — JS puro é TS válido, então `tsx server/server.ts` segue funcionando.
// Devolve null quando não dá pra proteger (Node antigo, sintaxe que o strip
// não aceita, JSX): o chamador decide o que fazer com o fonte cru.
function getTypeStripper() {
  try {
    const { stripTypeScriptTypes } = require('node:module');
    return typeof stripTypeScriptTypes === 'function' ? stripTypeScriptTypes : null;
  } catch {
    return null;
  }
}

async function protectRuntimeTypeScript(code, protection) {
  const strip = getTypeStripper();
  if (!strip) return null;
  // O strip emite um ExperimentalWarning na primeira chamada — ruído no log do
  // publish que não muda nada pro usuário. Silenciado só durante a chamada.
  const emitWarning = process.emitWarning;
  process.emitWarning = (warning, ...rest) => {
    const text = typeof warning === 'string' ? warning : String((warning && warning.message) || '');
    if (/stripTypeScriptTypes/.test(text)) return undefined;
    return emitWarning.call(process, warning, ...rest);
  };
  let stripped;
  try {
    stripped = strip(code, { mode: 'transform' });
  } catch {
    return null;
  } finally {
    process.emitWarning = emitWarning;
  }
  const result = await protectJs(stripped, protection);
  return result.failed ? null : result.code;
}

// Fonte de runtime que ficaria legível no pacote é um erro de publish, não um
// aviso: a promessa do --build é "fonte excluído". `--allow-raw-source` é a
// decisão explícita do dono de embarcar assim mesmo.
function rawSourceError(rawSource, options, t) {
  if (!rawSource.length || options['allow-raw-source']) return null;
  return new Error(t('system.error_raw_source', { count: rawSource.length, files: rawSource.join(', ') }));
}

function unprotectedJsError(unprotectedJs, options, t) {
  if (!unprotectedJs.length || options['allow-raw-source']) return null;
  return new Error(t('system.error_unprotected_js', { count: unprotectedJs.length, files: unprotectedJs.join(', ') }));
}

function startEntryError(files, t) {
  const { missingScript, missing } = startEntryProblems(files);
  if (missingScript) return new Error(t('system.error_start_script_missing'));
  if (missing.length) return new Error(t('system.error_start_entry_missing', { files: missing.join(', ') }));
  return null;
}

async function createZipBuffer(files) {
  const { ZipArchive } = await import('archiver');
  const { PassThrough } = require('stream');
  return new Promise((resolve, reject) => {
    const chunks = [];
    const stream = new PassThrough();
    stream.on('data', (chunk) => chunks.push(chunk));
    stream.on('end', () => resolve(Buffer.concat(chunks)));
    stream.on('error', reject);

    const archive = new ZipArchive({ zlib: { level: 9 } });
    archive.on('error', reject);
    archive.pipe(stream);

    for (const [relPath, content] of Object.entries(files)) {
      archive.append(content, { name: relPath });
    }
    archive.finalize();
  });
}

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
  '.png', '.jpg', '.jpeg', '.webp', '.gif', '.avif',
  '.woff', '.woff2', '.ttf', '.otf', '.wasm', '.bin',
]);

const BINARY_RUNTIME_EXTS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.avif', '.ico', '.woff', '.woff2', '.ttf', '.otf', '.wasm', '.bin']);
const LOCAL_STATE_DIRS = new Set(['uploads', 'logs', '.logs', 'backups', '.backups', '.data', '.runtime']);

const RUNTIME_SERVER_SOURCE_EXTS = new Set(['.ts', '.tsx', '.mts', '.cts']);

// Pastas que existem só pra desenvolver/medir o app — nunca são runtime. Sem
// isto o pacote embarcava relatórios de QA (HTML com screenshots), config de
// assistentes de IA e pastas de teste. Valem nos dois modos.
const DEV_ONLY_DIRS = [
  'reports', 'test-results', 'playwright-report', 'aios-qa-screenshots',
  '.opencode', '.qwen', '.agents', '.gemini', '.cursor', '.windsurf',
];
// Só no --build: um pacote-fonte pode legitimamente carregar testes e config de
// editor/CI (boilerplate); um pacote de runtime nunca.
const BUILD_DEV_ONLY_DIRS = [
  'tests', 'test', 'e2e', 'cypress', '.storybook', 'storybook-static',
  '.github', '.vscode', '.idea', '.husky',
];
const DEV_ONLY_FILES = ['aios-qa-report.json', 'aios-qa-report.md', 'aios-qa.config.json'];

// Dirs/files to skip when collecting sources
const SKIP_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', '.turbo', '.next',
  '.cache', 'coverage', '.nyc_output', 'out',
  // AIOSON tooling — não faz parte do código-fonte do sistema
  '.aioson', '.claude', '.codex', 'researchs',
  ...DEV_ONLY_DIRS,
]);

const SKIP_DIRS_BUILD = new Set([
  'node_modules', '.git', '.turbo', '.next',
  '.cache', 'coverage', '.nyc_output',
  'src', 'dashboard/src',
  '.aioson', '.claude', '.codex', 'researchs',
  ...DEV_ONLY_DIRS, ...BUILD_DEV_ONLY_DIRS,
]);

const SKIP_FILES = new Set([
  'package-lock.json', 'yarn.lock', 'pnpm-lock.yaml',
  'bun.lockb',
  // Arquivo de credenciais LLM local (convenção AIOSON) — NUNCA publicar, mesmo
  // que tenha sido commitado por engano. Defense-in-depth: o filtro de
  // .gitignore abaixo também pega, mas isto cobre apps sem .gitignore.
  'aioson-models.json',
  ...DEV_ONLY_FILES,
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

// Saída de build fora dos nomes padrão (ex.: `vite build --ssr --outDir
// dist-server`) é declarada no system.json: `"build_output_dirs": ["dist-server"]`.
// Sem a declaração, a pasta gitignored era descartada e o app instalado subia
// sem backend. Caminhos relativos à raiz do app; entradas inseguras são ignoradas.
function readBuildOutputDirs(manifest) {
  const list = Array.isArray(manifest && manifest.build_output_dirs) ? manifest.build_output_dirs : [];
  const dirs = new Set();
  for (let entry of list) {
    if (typeof entry !== 'string') continue;
    entry = entry.replace(/\\/g, '/').replace(/^\.\//, '').replace(/\/+$/, '').trim();
    if (!entry || entry.startsWith('/') || /^[a-z]:/i.test(entry) || entry.split('/').includes('..')) continue;
    dirs.add(entry);
  }
  return dirs;
}

// `//# sourceMappingURL=` aponta pro `.map` (que não viaja) e denuncia o nome do
// fonte original. Sai de todo JS/CSS do --build, inclusive bundles já minificados.
function stripSourceMapComments(code) {
  return code
    .replace(/^[ \t]*\/\/[#@][ \t]*sourceMappingURL=.*$/gm, '')
    .replace(/\/\*[#@][ \t]*sourceMappingURL=[^*]*\*\//g, '');
}

// O Play roda `npm start` quando o pacote não tem `src/` (app buildado). Um
// pacote --build sem `start`, ou com `start` apontando pra arquivo que não
// viajou, instala e não sobe. Só confere arquivos citados diretamente depois de
// `node`/`tsx`; scripts que resolvem o entry por conta própria não são seguidos.
function startEntryProblems(files) {
  let pkg;
  try {
    pkg = JSON.parse(files['package.json'] || '{}');
  } catch {
    return { missingScript: false, missing: [] };
  }
  const start = pkg && pkg.scripts && pkg.scripts.start;
  if (typeof start !== 'string' || !start.trim()) return { missingScript: true, missing: [] };
  const missing = [];
  const entryRe = /(?:^|[\s;&|])(?:node|tsx)(?:\s+-{1,2}[^\s]+)*\s+([^\s;&|'"]+\.[cm]?[jt]s)\b/g;
  for (const match of start.matchAll(entryRe)) {
    const entry = match[1].replace(/\\/g, '/').replace(/^\.\//, '');
    if (!files[entry]) missing.push(entry);
  }
  return { missingScript: false, missing };
}

// Testes / mocks NUNCA vão no pacote — são peso morto em runtime (e ainda
// inflavam o pacote ao serem ofuscados). O check é INCONDICIONAL: pega também os
// testes COMPILADOS dentro do `dist/` (que viajam mesmo com `src/` excluído).
const TEST_DIRS = new Set(['__tests__', '__mocks__', '__snapshots__']);
const TEST_FILE_RE = /\.(test|spec)\.[cm]?[jt]sx?$/i;

// Config de runtime que PRECISA viajar mesmo no --build (mesmo sendo .ts, que
// normalmente é excluído): o `vite preview` lê o `vite.config.*` para porta e
// proxy do /api. A config também passa pela proteção antes de viajar.
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
 * Collect all eligible source files under `dir`.
 * Returns { relativePath: content } — only text files with allowed extensions.
 */
async function collectSystemFiles(dir, { buildMode = false, outputDirs = new Set(), protection = { level: 'standard', obfuscator: null } } = {}) {
  const files = {};
  const excluded = [];
  let runtimeBytes = 0;
  const exclude = (file, reason) => excluded.push({ path: file, reason });
  const realRoot = await fs.realpath(dir);
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
  const rawSource = [];  // TS de runtime que NÃO deu pra proteger (viajaria legível)
  let protectedTs = 0;   // TS de runtime protegido (tipos removidos + mangling)
  let protectedJs = 0;   // JS minificado/ofuscado pelo nível de proteção
  const unprotectedJs = []; // JS que a proteção não conseguiu processar (viaja como veio do build)

  // Processa UM arquivo (checa skip/ignore/extensão/tamanho, lê, ofusca se build,
  // grava). Usado pelo walk e pelos includes pontuais do `.aioson` (que podem ser
  // arquivo único). `forceInclude` bypassa ignore/extensão (pastas runtime),
  // mas nunca a lista de arquivos sensíveis excluídos por nome.
  async function addFile(fullPath, relPath, forceInclude, entryName) {
    if (limitHit) return;
    if (SKIP_FILES.has(entryName.toLowerCase())) { exclude(relPath, 'development or credential file'); return; }
    if (!forceInclude && ig.ignores(relPath)) { exclude(relPath, 'gitignore'); return; }
    // Declarações de tipo não rodam — e descrevem a API do backend. Fora no --build.
    if (buildMode && /\.d\.[cm]?ts$/i.test(entryName)) { exclude(relPath, 'type declaration'); return; }

    const ext = entryName.includes('.')
      ? `.${entryName.split('.').pop().toLowerCase()}`
      : '';
    const isRuntimeServerSource =
      buildMode &&
      relPath.startsWith('server/') &&
      RUNTIME_SERVER_SOURCE_EXTS.has(ext);
    const isRuntimeConfig = buildMode && RUNTIME_CONFIG_RE.test(entryName);
    const isRuntimeTypeScript = isRuntimeServerSource ||
      (isRuntimeConfig && RUNTIME_SERVER_SOURCE_EXTS.has(ext));
    const extAllowed =
      allowedExts.has(ext) ||
      isRuntimeServerSource ||
      (forceInclude && AIOSON_RUNTIME_EXTS.has(ext)) ||
      isRuntimeConfig; // vite.config.* viaja mesmo no --build
    if (!extAllowed && ext !== '') { exclude(relPath, 'not a supported runtime file'); return; }

    try {
      if (!isInside(realRoot, await fs.realpath(fullPath))) {
        errors.push(`File is outside the app through a link: "${relPath}"`);
        exclude(relPath, 'outside app');
        return;
      }
      const stat = await fs.stat(fullPath);
      const maxBytes = buildMode ? MAX_FILE_BYTES_BUILD : MAX_FILE_BYTES;
      if (stat.size > maxBytes) {
        errors.push(`File too large (skipped): "${relPath}" (${(stat.size / 1024).toFixed(0)} KB)`);
        exclude(relPath, 'file size limit');
        return;
      }
      totalBytes += stat.size;
      if (totalBytes > MAX_PACKAGE_BYTES) {
        errors.push(`Package exceeds ${MAX_PACKAGE_BYTES / 1024 / 1024} MB limit — stop collecting.`);
        limitHit = true;
        return;
      }
      const binary = buildMode && BINARY_RUNTIME_EXTS.has(ext);
      let content = await fs.readFile(fullPath, binary ? undefined : 'utf8');
      if (binary) {
        if (runtimeBytes + content.length > MAX_PACKAGE_BYTES) {
          errors.push(`Protected output exceeds the runtime size limit: "${relPath}"`);
          exclude(relPath, 'protected output size limit');
          return;
        }
        runtimeBytes += content.length;
        files[relPath] = content;
        return;
      }
      if (buildMode) {
        const detected = collectStagedSecretFindings(relPath, content).findings
          .filter((finding) => finding.severity === 'error');
        if (detected.length) {
          const ids = [...new Set(detected.map((finding) => finding.id))].join(', ');
          errors.push(`Recognized secret in "${relPath}" (${ids}); file excluded.`);
          exclude(relPath, 'recognized secret');
          return;
        }
      }
      if (isRuntimeTypeScript) {
        // Mesmo caminho `.ts`, sem tipos/comentários e com locais renomeados.
        const protectedCode = await protectRuntimeTypeScript(content, protection);
        if (protectedCode == null) {
          rawSource.push(relPath);
        } else {
          content = protectedCode;
          protectedTs += 1;
        }
      } else if (
        buildMode &&
        (ext === '.js' || ext === '.jsx' || ext === '.mjs' || ext === '.cjs')
      ) {
        const result = await protectJs(content, protection);
        content = result.code;
        if (result.protected) protectedJs += 1;
        if (result.failed) unprotectedJs.push(relPath);
      }
      if (buildMode && (ext === '.js' || ext === '.jsx' || ext === '.mjs' || ext === '.cjs' || ext === '.css')) {
        content = stripSourceMapComments(content);
      }
      if (buildMode) {
        const runtimeSize = Buffer.byteLength(content);
        if (runtimeSize > MAX_FILE_BYTES_BUILD || runtimeBytes + runtimeSize > MAX_PACKAGE_BYTES) {
          errors.push(`Protected output exceeds the runtime size limit: "${relPath}"`);
          exclude(relPath, 'protected output size limit');
          return;
        }
        runtimeBytes += runtimeSize;
      }
      files[relPath] = content;
    } catch (error) {
      if (buildMode) errors.push(`Unable to package "${relPath}": ${error.message}`);
    }
  }

  async function walk(current, rel, forceInclude = false) {
    if (limitHit) return;
    if (rel && !isInside(realRoot, await fs.realpath(current))) {
      errors.push(`Directory is outside the app through a link: "${rel}"`);
      exclude(rel, 'outside app');
      return;
    }
    const entries = await fs.readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);
      const relPath = rel ? `${rel}/${entry.name}` : entry.name;

      // The input snapshot links this cache for build tools, never for delivery.
      if (buildMode && !rel && entry.name === 'node_modules') {
        exclude(relPath, 'build dependency cache');
        continue;
      }
      if (buildMode && entry.isSymbolicLink()) {
        errors.push(`Symbolic link or junction cannot be packaged: "${relPath}"`);
        exclude(relPath, 'symbolic link or junction');
        continue;
      }
      if (buildMode && entry.isDirectory() && LOCAL_STATE_DIRS.has(entry.name)) {
        exclude(relPath, 'local installation state');
        continue;
      }

      // Testes/mocks fora do pacote — incondicional (pega até dentro do dist).
      if (entry.isDirectory() && TEST_DIRS.has(entry.name)) { exclude(relPath, 'tests'); continue; }
      if (!entry.isDirectory() && TEST_FILE_RE.test(entry.name)) { exclude(relPath, 'tests'); continue; }

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
        if (buildMode && !forceInclude && (BUILD_OUTPUT_DIRS.has(entry.name) || outputDirs.has(relPath))) {
          await walk(fullPath, relPath, true);
          continue;
        }
        if (!forceInclude) {
          if (skipDirs.has(entry.name)) { exclude(relPath, 'development directory'); continue; }
          if (rel && skipDirs.has(`${rel}/${entry.name}`)) { exclude(relPath, 'development directory'); continue; }
          if (ig.ignores(relPath)) { exclude(relPath, 'gitignore'); continue; }
        }
        await walk(fullPath, relPath, forceInclude);
        continue;
      }

      // Arquivo — processado pelo addFile (skip/ignore/ext/tamanho/ofuscação).
      await addFile(fullPath, relPath, forceInclude, entry.name);
    }
  }

  await walk(dir, '');
  return { files, totalBytes, errors, rawSource, protectedTs, protectedJs, unprotectedJs, excluded };
}


async function prepareRuntimeFiles({ dir, manifest, options, logger, t, buildMode = true }) {
  // Nível e ofuscador resolvidos antes do build: `max` sem ofuscador falha cedo.
  const protection = { level: 'standard', obfuscator: null };
  if (buildMode) {
    protection.level = resolveProtectionLevel(options, manifest, t);
    if (protection.level === 'max') protection.obfuscator = loadAppObfuscator(dir, t);
  }

  if (buildMode) {
    const buildCmd = manifest.build_command || 'npm run build';
    logger.log(`Building: ${buildCmd}`);
    const { execSync } = require('child_process');
    try {
      const allowed = new Set(['PATH', 'SYSTEMROOT', 'WINDIR', 'COMSPEC', 'PATHEXT', 'TEMP', 'TMP', 'HOME', 'USERPROFILE', 'APPDATA', 'LOCALAPPDATA', 'PROGRAMFILES', 'PROGRAMFILES(X86)', 'LANG', 'LC_ALL', 'PROCESSOR_ARCHITECTURE', 'NUMBER_OF_PROCESSORS']);
      const env = options['isolated-build'] ? Object.fromEntries(Object.entries(process.env).filter(([key]) => allowed.has(key.toUpperCase()))) : process.env;
      const buildOutput = execSync(buildCmd, { cwd: dir, env, stdio: options.json ? ['ignore', 'pipe', 'pipe'] : 'inherit', timeout: 300_000 });
      if (buildOutput) logger.log(buildOutput.toString());
    } catch (e) {
      throw new Error(`Build failed: ${e.message}`, { cause: e });
    }
    logger.log('Build complete. Collecting compiled output (source excluded)...');
  } else {
    logger.log(t('system.package_collecting_files'));
  }

  const outputDirs = readBuildOutputDirs(manifest);
  const { files, totalBytes, errors, rawSource, protectedTs, protectedJs, unprotectedJs, excluded } =
    await collectSystemFiles(dir, { buildMode, outputDirs, protection });

  if (errors.length > 0) {
    for (const e of errors) logger.log(`  [WARN] ${e}`);
  }

  const fileCount = Object.keys(files).length;
  logger.log(t('system.package_files_found', { count: fileCount, kb: (totalBytes / 1024).toFixed(1) }));
  if (buildMode && protectedTs > 0) {
    logger.log(t('system.publish_protected_ts', { count: protectedTs }));
  }
  if (buildMode) {
    logger.log(t('system.publish_protection', { level: protection.level, count: protectedJs }));
  }
  // Fonte de runtime legível no pacote derruba o publish.
  const rawError = buildMode ? rawSourceError(rawSource, options, t) : null;
  // Qualquer código JS que não passou pela proteção derruba o publish.
  const unprotectedError = buildMode ? unprotectedJsError(unprotectedJs, options, t) : null;
  const collectionError = buildMode && errors.length ? new Error(errors.join('; ')) : null;
  if (buildMode && unprotectedJs.length > 0 && !unprotectedError) {
    logger.log(`  [WARN] ${t('system.warn_unprotected_js', { count: unprotectedJs.length, files: unprotectedJs.join(', ') })}`);
  }

  // Basic integrity checks
  if (!files['system.json']) {
    throw new Error(t('system.error_no_manifest', { path: path.join(dir, 'system.json') }));
  }
  if (!files['package.json']) {
    throw new Error(t('system.error_missing_package_json'));
  }
  // Pacote --build sem entrada básica de start também derruba o publish.
  const startError = buildMode ? startEntryError(files, t) : null;


  return { files, totalBytes, errors, rawSource, protectedTs, protectedJs, unprotectedJs, protection, fileCount, rawError, startError, unprotectedError, collectionError, excluded };
}

/** The same protected pipeline as publish, without any login or network. */
function runtimePackageCapabilities() {
  return {
    ok: true, protocolVersion: 1,
    capabilities: { protectedRuntime: true, binaryAssets: true, sha256: true, inventory: true, runtimeVersion: true, manifestCompatibility: true, sourceSnapshot: true, fingerprint: true, typeScript: Boolean(getTypeStripper()) },
    limits: { fileBytes: MAX_FILE_BYTES_BUILD, totalBytes: MAX_PACKAGE_BYTES, zipBytes: 10 * 1024 * 1024 },
    node: process.versions.node
  };
}

async function createRuntimeArtifact({ dir, manifest, options, logger, t }) {
  const inputs = require('./system-runtime-inputs');
  const settings = { outputDirs: readBuildOutputDirs(manifest), aiosonIncludes: await readAiosonIncludes(dir) };
  const snapshot = await inputs.captureInputs(dir, settings);
  try {
    return await createSnapshotArtifact({ dir: snapshot.directory, sourceDir: dir, sourceFingerprint: snapshot.sourceFingerprint, inputExclusions: snapshot.excluded, manifest, options, logger, t });
  } finally { await snapshot.dispose(); }
}

async function createSnapshotArtifact({ dir, sourceDir, sourceFingerprint, inputExclusions, manifest, options, logger, t }) {
  assertInstallSlug(manifest.slug, t);
  const prepared = await prepareRuntimeFiles({ dir, manifest, options: { ...options, 'allow-raw-source': false, 'isolated-build': true }, logger, t });
  for (const [issue, code, files] of [
    [prepared.rawError, 'runtime_protection_failed', prepared.rawSource],
    [prepared.unprotectedError, 'runtime_protection_failed', prepared.unprotectedJs],
    [prepared.collectionError, 'runtime_collection_failed', prepared.excluded.filter((item) => /limit|secret/.test(item.reason)).map((item) => item.path)],
    [prepared.startError, 'runtime_entry_missing', startEntryProblems(prepared.files).missing],
  ]) {
    if (issue) {
      issue.runtimeDiagnostic = { code, files: files.slice(0, 8).filter((file) => typeof file === 'string' && file.length <= 240 && !/[\r\n\0:]/.test(file) && !path.isAbsolute(file) && !file.split(/[\\/]/).includes('..')) };
      throw issue;
    }
  }
  let appManifest;
  try { appManifest = JSON.parse(prepared.files['manifest.json']); } catch {
    throw new Error('A publishable runtime needs manifest.json with its identity and compatibility contract.');
  }
  const compatibility = appManifest.compatibility;
  const semver = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;
  if (appManifest.slug !== manifest.slug || appManifest.version !== manifest.version || !appManifest.name
    || !compatibility || !semver.test(compatibility.min_play_version) || !semver.test(compatibility.min_runtime_version)
    || typeof compatibility.max_runtime_version !== 'string' || !compatibility.max_runtime_version.trim()
    || compatibility.sidecar_contract !== 'ndjson-v1' || !Number.isInteger(compatibility.schema_version)
    || compatibility.schema_version < 1 || typeof compatibility.requires_migration !== 'boolean') {
    throw new Error('manifest.json must match system.json identity/version and declare the supported Play/runtime compatibility contract.');
  }
  {
    const selectedVersion = String(options['runtime-version'] ?? manifest.version);
    if (!semver.test(selectedVersion)) throw new Error('The runtime version must use SemVer.');
    appManifest.version = selectedVersion;
    for (const file of ['manifest.json', 'system.json', 'package.json']) {
      const value = JSON.parse(prepared.files[file]);
      value.version = selectedVersion;
      prepared.files[file] = JSON.stringify(value, null, 2);
    }
  }
  const inventory = Object.entries(prepared.files).map(([file, content]) => ({
    path: file, bytes: Buffer.byteLength(content),
    sha256: createHash('sha256').update(content).digest('hex')
  })).sort((a, b) => a.path.localeCompare(b.path));
  if (inventory.some((file) => file.bytes > MAX_FILE_BYTES_BUILD) || inventory.reduce((total, file) => total + file.bytes, 0) > MAX_PACKAGE_BYTES) throw new Error('The reviewed runtime exceeds the expanded package limits.');
  const summary = {
    ok: true, protocolVersion: 1, manifest: appManifest, inventory, excluded: [...prepared.excluded, ...inputExclusions],
    fileCount: inventory.length, totalBytes: inventory.reduce((total, item) => total + item.bytes, 0),
    protectedJs: prepared.protectedJs, protectedTs: prepared.protectedTs,
    runtime: { entrypoint: JSON.parse(prepared.files['package.json']).scripts.start, node: process.versions.node, protection: prepared.protection.level },
    sourceFingerprint
  };
  if (await runtimeSourceFingerprint(sourceDir) !== sourceFingerprint) throw require('./system-runtime-inputs').inputsChanged();
  if (options['dry-run']) return { ...summary, dryRun: true };
  const zip = await createZipBuffer(prepared.files);
  if (zip.length > 10 * 1024 * 1024) throw new Error('Runtime ZIP exceeds the 10 MiB package limit.');
  const sha256 = createHash('sha256').update(zip).digest('hex');
  const destination = options.output
    ? path.resolve(sourceDir, String(options.output))
    : path.join(sourceDir, '.aioson', 'system-packages', manifest.slug, `${sha256}.zip`);
  await fs.mkdir(path.dirname(destination), { recursive: true });
  try {
    await fs.writeFile(destination, zip, { flag: 'wx' });
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
    const previous = await fs.readFile(destination);
    if (createHash('sha256').update(previous).digest('hex') !== sha256) throw new Error('Output already contains a different artifact; choose an unused staging path.', { cause: error });
  }
  return { ...summary, path: destination, sha256, zipBytes: zip.length };
}

async function runtimeSourceFingerprint(dir) {
  const manifest = JSON.parse(await fs.readFile(path.join(dir, 'system.json'), 'utf8'));
  return require('./system-runtime-inputs').sourceFingerprint(dir, { outputDirs: readBuildOutputDirs(manifest), aiosonIncludes: await readAiosonIncludes(dir) });
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
  prepareRuntimeFiles,
  createRuntimeArtifact,
  runtimePackageCapabilities,
  runtimeSourceFingerprint
};
