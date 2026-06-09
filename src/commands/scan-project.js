'use strict';

/**
 * scan:project — Brownfield project scanner
 *
 * Walks the project directory, reads key files, calls a cheap LLM to generate:
 *   - .aioson/context/discovery.md
 *   - .aioson/context/skeleton-system.md
 *
 * Config: aioson-models.json in the target project root.
 * Zero npm dependencies — uses node:fs, node:https, node:http only.
 */

const path = require('node:path');
const fs = require('node:fs/promises');
const https = require('node:https');
const http = require('node:http');
const { ensureDir, exists, copyFileWithDir, nowStamp, toRelativeSafe } = require('../utils');
const { ensureGitignoreEntry, ensureProjectGitignorePolicy } = require('../installer');
const {
  MEMORY_INDEX_FILE,
  SPEC_CURRENT_FILE,
  SPEC_HISTORY_FILE,
  writeDerivedContextMemory
} = require('../context-memory');

// ── Constants ────────────────────────────────────────────────────────────────

const CONFIG_FILE    = 'aioson-models.json';
const OUTPUT_FILE    = '.aioson/context/discovery.md';
const SKELETON_FILE  = '.aioson/context/skeleton-system.md';
const INDEX_FILE     = '.aioson/context/scan-index.md';
const FOLDERS_FILE   = '.aioson/context/scan-folders.md';
const FORGE_FILE     = '.aioson/context/scan-aioson.md';
const CONTEXT_FILE   = '.aioson/context/project.context.md';
const SPEC_FILE      = '.aioson/context/spec.md';
const DELIMITER      = '<<<SKELETON>>>';
const SUMMARY_MODES  = new Set(['titles', 'summaries', 'raw']);
const CONTEXT_MODES  = new Set(['merge', 'rewrite']);
const FORGE_SCAN_ROOTS = [
  '.aioson/context',
  '.aioson/squads',
  '.aioson/genomes',
  '.aioson/mcp'
];
const FORGE_SECTION_ROOTS = [
  {
    root: '.aioson/context',
    title: 'Context Pages',
    empty: '_No generated context pages detected yet_'
  },
  {
    root: '.aioson/squads',
    title: 'Squads',
    empty: '_No squads detected yet_'
  },
  {
    root: '.aioson/genomes',
    title: 'Genomes',
    empty: '_No genomes detected yet_'
  },
  {
    root: '.aioson/mcp',
    title: 'MCP',
    empty: '_No project-specific MCP artifacts detected yet_'
  }
];
const FORGE_SKIP_GENERATED_FILES = new Set([
  '.aioson/context/.gitkeep',
  '.aioson/context/spec.md.template',
  '.aioson/install.json'
]);
const BACKUPS_GITIGNORE_ENTRY = '.aioson/backups/';

const SKIP_DIRS = new Set([
  '.git', 'node_modules', 'vendor', '.next', 'dist', 'build',
  '__pycache__', '.cache', 'coverage', '.nyc_output', 'target',
  '.gradle', 'venv', '.venv', 'env', '.env', 'storage',
  'bootstrap/cache', '.idea', '.vscode', 'tmp', 'temp', 'logs',
  'public/build', 'public/hot', '.aioson/backups',
]);

const SKIP_EXTENSIONS = new Set([
  '.lock', '.log', '.map', '.min.js', '.min.css',
  '.jpg', '.jpeg', '.png', '.gif', '.svg', '.ico', '.webp',
  '.woff', '.woff2', '.ttf', '.eot', '.otf',
  '.mp4', '.mp3', '.wav', '.avi',
  '.zip', '.tar', '.gz', '.rar', '.7z',
  '.pdf', '.doc', '.docx', '.xls', '.xlsx',
  '.pyc', '.pyo', '.class', '.o', '.a', '.so',
  '.sqlite', '.db', '.sqlite3',
]);

const KEY_FILE_NAMES = new Set([
  'package.json', 'composer.json', 'requirements.txt', 'pyproject.toml',
  'Gemfile', 'go.mod', 'Cargo.toml', 'pom.xml', 'build.gradle',
  'docker-compose.yml', 'docker-compose.yaml', 'Dockerfile',
  '.env.example', '.env.sample', 'README.md',
  'schema.prisma', 'schema.rb', 'routes.rb',
  'tsconfig.json', 'next.config.js', 'next.config.ts',
  'vite.config.js', 'vite.config.ts',
  'tailwind.config.js', 'tailwind.config.ts',
  'webpack.config.js',
]);

const KEY_FILE_PATHS = new Set([
  'prisma/schema.prisma',
  'database/schema.rb',
  'config/routes.rb',
  'routes/web.php',
  'routes/api.php',
  'config/app.php',
  'app/Http/Kernel.php',
  'app/Providers/RouteServiceProvider.php',
]);

const MAX_KEY_FILE_CHARS = 3000;

const PROVIDER_BASE_URLS = {
  deepseek:  'https://api.deepseek.com/v1',
  openai:    'https://api.openai.com/v1',
  gemini:    'https://generativelanguage.googleapis.com/v1beta/openai',
  groq:      'https://api.groq.com/openai/v1',
  together:  'https://api.together.xyz/v1',
  mistral:   'https://api.mistral.ai/v1',
  anthropic: null, // uses its own format
};

let managedForgePathCache = null;

// ── File system helpers ──────────────────────────────────────────────────────

async function readFileSafe(filePath, maxChars) {
  try {
    const content = await fs.readFile(filePath, 'utf8');
    if (maxChars && content.length > maxChars) {
      return content.slice(0, maxChars) + `\n... [truncated at ${maxChars} chars]`;
    }
    return content;
  } catch {
    return null;
  }
}

async function backupProjectFiles(targetDir, relPaths) {
  const uniqueRelPaths = [...new Set(relPaths.filter(Boolean))];
  if (uniqueRelPaths.length === 0) {
    return { backupRoot: null, backedUp: [] };
  }

  const backupRoot = path.join(targetDir, '.aioson/backups', nowStamp());
  const backedUp = [];

  for (const relPath of uniqueRelPaths) {
    const source = path.join(targetDir, relPath);
    if (!(await exists(source))) continue;
    const dest = path.join(backupRoot, relPath);
    await copyFileWithDir(source, dest);
    backedUp.push(toRelativeSafe(targetDir, dest));
  }

  if (backedUp.length === 0) {
    return { backupRoot: null, backedUp: [] };
  }

  return { backupRoot, backedUp };
}

async function loadGitignorePatterns(root) {
  const patterns = new Set();
  try {
    const gi = await fs.readFile(path.join(root, '.gitignore'), 'utf8');
    for (const line of gi.split('\n')) {
      const clean = line.trim().replace(/^\//, '').replace(/\/$/, '');
      if (clean && !clean.startsWith('#')) patterns.add(clean);
    }
  } catch { /* no .gitignore */ }
  return patterns;
}

function shouldSkip(relPath, ext, gitignorePatterns) {
  const parts = relPath.split('/');
  for (const part of parts) {
    if (SKIP_DIRS.has(part)) return true;
    if (gitignorePatterns.has(part)) return true;
  }
  if (SKIP_EXTENSIONS.has(ext)) return true;
  return false;
}

async function walkRelativeFiles(rootDir, prefix = '') {
  const out = [];
  let entries;
  try {
    entries = await fs.readdir(rootDir, { withFileTypes: true });
  } catch {
    return out;
  }

  for (const entry of entries) {
    const fullPath = path.join(rootDir, entry.name);
    const relPath = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      out.push(...await walkRelativeFiles(fullPath, relPath));
    } else {
      out.push(relPath.replace(/\\/g, '/'));
    }
  }
  return out;
}

async function loadManagedForgePaths() {
  if (managedForgePathCache) return managedForgePathCache;

  const templateForgeDir = path.join(__dirname, '..', '..', 'template', '.aioson');
  const relPaths = await walkRelativeFiles(templateForgeDir);
  managedForgePathCache = new Set(relPaths.map((relPath) => `.aioson/${relPath}`));
  return managedForgePathCache;
}

async function walkProject(root) {
  const gitignore = await loadGitignorePatterns(root);
  const keyContents = {};
  const keyFiles = [];
  const topLevelStats = new Map();
  const mappedEntries = [];

  async function walk(dir, depth) {
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch { return; }

    // dirs first (alphabetical), then files (alphabetical)
    entries.sort((a, b) => {
      if (a.isDirectory() !== b.isDirectory()) return a.isDirectory() ? -1 : 1;
      return a.name.localeCompare(b.name);
    });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      const relPath  = path.relative(root, fullPath).replace(/\\/g, '/');
      const ext      = path.extname(entry.name).toLowerCase();
      const indent   = '  '.repeat(depth);

      if (shouldSkip(relPath, ext, gitignore)) continue;

      if (entry.isDirectory()) {
        mappedEntries.push({ type: 'dir', relPath, depth, sizeBytes: 0 });
        await walk(fullPath, depth + 1);
      } else {
        let sizeBytes = 0;
        try {
          const stat = await fs.stat(fullPath);
          sizeBytes = Number(stat.size || 0);
        } catch {}

        mappedEntries.push({ type: 'file', relPath, depth, sizeBytes });

        const parts = relPath.split('/');
        const topLevel = parts.length > 1 ? parts[0] : '[root files]';
        const currentStat = topLevelStats.get(topLevel) || { files: 0, sizeBytes: 0 };
        currentStat.files += 1;
        currentStat.sizeBytes += sizeBytes;
        topLevelStats.set(topLevel, currentStat);

        const isKeyName = KEY_FILE_NAMES.has(entry.name);
        const isKeyPath = KEY_FILE_PATHS.has(relPath) || [...KEY_FILE_PATHS].some((p) => relPath.endsWith(p));
        if ((isKeyName || isKeyPath) && !(relPath in keyContents)) {
          const content = await readFileSafe(fullPath, MAX_KEY_FILE_CHARS);
          if (content) {
            keyContents[relPath] = content;
            keyFiles.push({
              path: relPath,
              sizeBytes,
              title: inferKeyFileTitle(relPath, content),
              summary: inferKeyFileSummary(relPath, content)
            });
          }
        }
      }
    }
  }

  await walk(root, 0);
  return { keyContents, keyFiles, topLevelStats, entries: mappedEntries };
}

// ── HTTP helper (zero external deps) ────────────────────────────────────────

function httpPost(url, headers, body) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const lib = parsed.protocol === 'https:' ? https : http;
    const data = Buffer.from(JSON.stringify(body), 'utf8');

    const req = lib.request({
      hostname: parsed.hostname,
      port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
      path: parsed.pathname + parsed.search,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': data.length, ...headers },
    }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        if (res.statusCode >= 400) {
          reject(new Error(`HTTP ${res.statusCode}: ${text.slice(0, 400)}`));
        } else {
          resolve(text);
        }
      });
    });

    req.setTimeout(180000, () => { req.destroy(new Error('Request timed out (180s)')); });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

// ── LLM providers ───────────────────────────────────────────────────────────

async function callOpenAICompatible(baseUrl, apiKey, model, prompt) {
  const url = `${baseUrl.replace(/\/$/, '')}/chat/completions`;
  const baseBody = {
    model,
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.2
  };

  let text;
  try {
    text = await httpPost(
      url,
      { Authorization: `Bearer ${apiKey}` },
      { ...baseBody, max_tokens: 4096 }
    );
  } catch (error) {
    const message = String(error && error.message || '');
    const requiresMaxCompletionTokens =
      message.includes("Unsupported parameter: 'max_tokens'") &&
      message.includes('max_completion_tokens');

    if (!requiresMaxCompletionTokens) {
      throw error;
    }

    text = await httpPost(
      url,
      { Authorization: `Bearer ${apiKey}` },
      { ...baseBody, max_completion_tokens: 4096 }
    );
  }

  const data = JSON.parse(text);
  const content = data && data.choices && data.choices[0] && data.choices[0].message
    ? data.choices[0].message.content
    : undefined;
  if (typeof content !== 'string') {
    throw new Error(`Unexpected LLM response shape: ${String(text).slice(0, 300)}`);
  }
  return content;
}

async function callAnthropic(apiKey, model, prompt) {
  const text = await httpPost(
    'https://api.anthropic.com/v1/messages',
    { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
    { model, max_tokens: 4096, messages: [{ role: 'user', content: prompt }] }
  );
  const data = JSON.parse(text);
  const content = data && data.content && data.content[0] ? data.content[0].text : undefined;
  if (typeof content !== 'string') {
    throw new Error(`Unexpected Anthropic response shape: ${String(text).slice(0, 300)}`);
  }
  return content;
}

async function callLLM(providerName, providerCfg, prompt) {
  const apiKey  = providerCfg.api_key  || '';
  const model   = providerCfg.model    || '';
  const baseUrl = providerCfg.base_url || PROVIDER_BASE_URLS[providerName] || '';

  if (!apiKey || apiKey.startsWith('YOUR_')) {
    const error = new Error(`API key not configured for provider '${providerName}'`);
    error.code = 'MISSING_API_KEY';
    throw error;
  }
  if (!model) {
    throw new Error(`Model not configured for provider '${providerName}'`);
  }

  if (providerName === 'anthropic') return callAnthropic(apiKey, model, prompt);
  if (!baseUrl) throw new Error(`No base_url for provider '${providerName}'`);
  return callOpenAICompatible(baseUrl, apiKey, model, prompt);
}

// ── Prompt builder ───────────────────────────────────────────────────────────

function resolveSummaryMode(value) {
  const normalized = String(value || '').trim().toLowerCase();
  return SUMMARY_MODES.has(normalized) ? normalized : 'summaries';
}

function resolveContextMode(value) {
  const normalized = String(value || '').trim().toLowerCase();
  return CONTEXT_MODES.has(normalized) ? normalized : 'merge';
}

function formatBytesCompact(sizeBytes) {
  const bytes = Number(sizeBytes || 0);
  const kb = bytes / 1024;
  const mb = kb / 1024;
  if (mb >= 1) return `${mb.toFixed(mb >= 10 ? 1 : 2)} MB`;
  return `${kb.toFixed(kb >= 10 ? 1 : 2)} KB`;
}

function humanizeName(value) {
  return String(value || '')
    .replace(/\.[^.]+$/, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function firstMeaningfulLine(content) {
  const lines = String(content || '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  for (const line of lines) {
    if (line.startsWith('#')) return line.replace(/^#+\s*/, '').slice(0, 120);
    if (line.startsWith('{') || line.startsWith('[') || line.startsWith('<') || line.startsWith('---')) continue;
    if (line.length < 4) continue;
    return line.slice(0, 120);
  }
  return '';
}

function inferFrameworkClues(pkg) {
  const deps = {
    ...(pkg.dependencies || {}),
    ...(pkg.devDependencies || {})
  };
  const clues = [];
  if (deps.next) clues.push('Next.js');
  if (deps.react) clues.push('React');
  if (deps.vue) clues.push('Vue');
  if (deps.nuxt) clues.push('Nuxt');
  if (deps.express) clues.push('Express');
  if (deps.nestjs || deps['@nestjs/core']) clues.push('NestJS');
  return clues;
}

function inferKeyFileTitle(relPath, content) {
  const base = path.basename(relPath).toLowerCase();

  if (base === 'package.json') {
    try {
      const pkg = JSON.parse(content);
      if (pkg && pkg.name) return `${pkg.name} package manifest`;
    } catch {}
    return 'NPM package manifest';
  }
  if (base === 'composer.json') return 'Composer package manifest';
  if (base === 'readme.md') {
    const headline = firstMeaningfulLine(content);
    return headline || 'Project overview';
  }
  if (base === 'dockerfile') return 'Container build recipe';
  if (base.startsWith('next.config')) return 'Next.js runtime configuration';
  if (base.startsWith('vite.config')) return 'Vite build configuration';
  if (base.startsWith('tailwind.config')) return 'Tailwind theme configuration';
  if (base === 'tsconfig.json') return 'TypeScript compiler configuration';
  if (relPath.includes('routes/')) return `${humanizeName(base)} route map`;
  if (relPath.includes('schema.prisma') || base === 'schema.rb') return 'Database schema definition';
  return humanizeName(base || relPath);
}

function inferKeyFileSummary(relPath, content) {
  const base = path.basename(relPath).toLowerCase();

  if (base === 'package.json') {
    try {
      const pkg = JSON.parse(content);
      const scripts = Object.keys(pkg.scripts || {}).length;
      const depsCount = Object.keys(pkg.dependencies || {}).length + Object.keys(pkg.devDependencies || {}).length;
      const clues = inferFrameworkClues(pkg);
      const pieces = [`Scripts: ${scripts}`, `Dependencies: ${depsCount}`];
      if (clues.length > 0) pieces.push(`Framework clues: ${clues.join(', ')}`);
      return pieces.join(' | ');
    } catch {
      return 'Package metadata, scripts and dependency graph.';
    }
  }

  if (base === 'composer.json') return 'PHP dependencies, autoload rules and package metadata.';
  if (base === 'requirements.txt' || base === 'pyproject.toml') return 'Python dependencies and project metadata.';
  if (base === 'readme.md') return firstMeaningfulLine(content) || 'Project overview, setup notes and developer guidance.';
  if (base === 'dockerfile' || base.startsWith('docker-compose')) return 'Container runtime and service topology.';
  if (base.startsWith('next.config')) return 'Next.js configuration for routing, build and runtime behavior.';
  if (base.startsWith('vite.config')) return 'Bundler and development server configuration.';
  if (base.startsWith('tailwind.config')) return 'Design tokens, theme extensions and content scan paths.';
  if (base === 'tsconfig.json') return 'TypeScript path aliases, compiler options and module targets.';
  if (relPath.includes('routes/')) return 'Entry points and HTTP route declarations.';
  if (relPath.includes('schema.prisma') || base === 'schema.rb') return 'Entities, fields and relationship structure for the data model.';
  if (base === '.env.example' || base === '.env.sample') return 'Environment variable template and required secrets.';

  return firstMeaningfulLine(content) || `Key implementation or configuration file detected at ${relPath}.`;
}

function renderEntryTreeLines(entries, predicate) {
  const lines = [];
  for (const entry of entries) {
    if (!predicate(entry)) continue;
    const label = `${path.basename(entry.relPath)}${entry.type === 'dir' ? '/' : ''}`;
    lines.push(renderTreeLine(label, entry.depth));
  }
  return lines;
}

function renderTreeLine(label, depth) {
  return `${'|  '.repeat(Math.max(0, depth))}|-- ${label}`;
}

function normalizeFolderPath(value) {
  const normalized = String(value || '')
    .trim()
    .replace(/\\/g, '/')
    .replace(/^\.\/+/, '')
    .replace(/\/+/g, '/')
    .replace(/\/$/, '');

  if (!normalized || normalized === '.') return '.';
  return normalized;
}

function resolveRequestedFolders(value) {
  const rawValues = Array.isArray(value) ? value : [value];
  const folders = [];
  const seen = new Set();

  for (const rawValue of rawValues) {
    const parts = String(rawValue || '')
      .split(',')
      .map((part) => normalizeFolderPath(part))
      .filter((part) => part && part !== '.');

    for (const folder of parts) {
      if (seen.has(folder)) continue;
      seen.add(folder);
      folders.push(folder);
    }
  }

  return folders;
}

function isWithinPrefix(relPath, prefix) {
  return relPath === prefix || relPath.startsWith(`${prefix}/`);
}

function isWithinAnyPrefix(relPath, prefixes) {
  return prefixes.some((prefix) => isWithinPrefix(relPath, prefix));
}

function collectForgeArtifactPaths(entries, managedForgePaths) {
  const included = new Set();

  for (const entry of entries) {
    if (!isWithinAnyPrefix(entry.relPath, FORGE_SCAN_ROOTS)) continue;

    if (entry.type === 'file') {
      if (managedForgePaths.has(entry.relPath)) continue;
      if (FORGE_SKIP_GENERATED_FILES.has(entry.relPath)) continue;
      included.add(entry.relPath);
      continue;
    }

    if (entry.type === 'dir' && !FORGE_SCAN_ROOTS.includes(entry.relPath)) {
      included.add(entry.relPath);
    }
  }

  if (included.size === 0) return included;

  const withAncestors = new Set(included);
  for (const relPath of included) {
    let current = relPath;
    while (current && current.includes('/')) {
      current = current.slice(0, current.lastIndexOf('/'));
      if (!current) break;
      withAncestors.add(current);
      if (current === '.aioson') break;
    }
  }
  return withAncestors;
}

function buildFolderMapMarkdown({ entries, generatedAt }) {
  const lines = [
    '# Folder Map',
    `_Generated by aioson scan:project — ${generatedAt}_`,
    '',
    '## Scope',
    '- Project directories only.',
    '- `.aioson/` internals are intentionally omitted here and tracked in `scan-aioson.md`.',
    '',
    '## Tree'
  ];

  const treeLines = renderEntryTreeLines(entries, (entry) => {
    if (entry.type !== 'dir') return false;
    if (entry.relPath === '.aioson') return true;
    return !entry.relPath.startsWith('.aioson/');
  });

  if (treeLines.length === 0) {
    lines.push('_No directories mapped_');
    return lines.join('\n');
  }

  lines.push('```text', ...treeLines, '```');
  return lines.join('\n');
}

function sanitizeScanFileSegment(folder) {
  const normalized = normalizeFolderPath(folder);
  if (normalized === '.') return 'root';
  return normalized
    .replace(/[/.]+/g, '-')
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '') || 'folder';
}

function buildFolderScanRelativePath(folder) {
  return `.aioson/context/scan-${sanitizeScanFileSegment(folder)}.md`;
}

function renderRequestedFolderTree(entries, folder) {
  const normalized = normalizeFolderPath(folder);
  const lines = [];

  if (normalized === '.') {
    return renderEntryTreeLines(entries, () => true);
  }

  lines.push(renderTreeLine(`${normalized}/`, 0));
  for (const entry of entries) {
    if (!isWithinPrefix(entry.relPath, normalized) || entry.relPath === normalized) continue;
    const relativePath = entry.relPath.slice(normalized.length + 1);
    const depth = relativePath.split('/').length;
    const label = `${path.basename(entry.relPath)}${entry.type === 'dir' ? '/' : ''}`;
    lines.push(renderTreeLine(label, depth));
  }
  return lines;
}

function buildRequestedFolderMarkdown({ entries, generatedAt, folder }) {
  const normalized = normalizeFolderPath(folder);
  const lines = [
    `# Folder Scan: ${normalized}`,
    `_Generated by aioson scan:project — ${generatedAt}_`,
    '',
    '## Scope',
    `- Requested folder: \`${normalized}/\``,
    '- Includes all mapped directories and files under this folder.',
    '',
    '## Tree'
  ];

  const treeLines = renderRequestedFolderTree(entries, normalized);
  if (treeLines.length === 0) {
    lines.push('_No mapped entries for this folder_');
    return lines.join('\n');
  }

  lines.push('```text', ...treeLines, '```');
  return lines.join('\n');
}

function renderForgeSectionTree(entries, root, artifactPaths) {
  const sectionEntries = entries.filter((entry) => artifactPaths.has(entry.relPath) && isWithinPrefix(entry.relPath, root));
  if (sectionEntries.length === 0) return [];

  const lines = [renderTreeLine(`${root}/`, 0)];
  for (const entry of sectionEntries) {
    if (entry.relPath === root) continue;
    const relativePath = entry.relPath.slice(root.length + 1);
    const depth = relativePath.split('/').length;
    const label = `${path.basename(entry.relPath)}${entry.type === 'dir' ? '/' : ''}`;
    lines.push(renderTreeLine(label, depth));
  }
  return lines;
}

function buildForgeArtifactsMarkdown({ entries, generatedAt, managedForgePaths }) {
  const lines = [
    '# AIOSON Generated Map',
    `_Generated by aioson scan:project — ${generatedAt}_`,
    '',
    '## Scope',
    '- Shows generated or project-specific artifacts inside `.aioson/`.',
    '- Groups what matters for client analysis, especially context pages, squads, genomes and local MCP artifacts.',
    '- Hides framework-managed defaults such as agents, locales, schemas, static skills and task docs.'
  ];

  const artifactPaths = collectForgeArtifactPaths(entries, managedForgePaths);
  if (artifactPaths.size === 0) {
    lines.push('', '_No generated AIOSON artifacts detected yet_');
    return { markdown: lines.join('\n'), artifactCount: 0 };
  }

  let artifactCount = 0;
  for (const section of FORGE_SECTION_ROOTS) {
    lines.push('', `## ${section.title}`);
    const treeLines = renderForgeSectionTree(entries, section.root, artifactPaths);
    if (treeLines.length === 0) {
      lines.push(section.empty);
      continue;
    }
    artifactCount += treeLines.length;
    lines.push('```text', ...treeLines, '```');
  }

  return { markdown: lines.join('\n'), artifactCount };
}

function buildScanIndexMarkdown({
  keyFiles,
  topLevelStats,
  generatedAt,
  includeSummaries = true,
  foldersPath,
  folderScans = [],
  forgePath,
  forgeArtifactCount = 0,
  memoryIndexPath = null,
  specCurrentPath = null,
  specHistoryPath = null,
  moduleDocs = []
}) {
  const lines = [
    '# Scan Index',
    `_Generated by aioson scan:project — ${generatedAt}_`,
    '',
    '## Scan outputs',
    '| File | Purpose |',
    '|------|---------|',
    `| ${INDEX_FILE} | Summary index with footprint, key files and links to specialized scan maps |`,
    `| ${FOLDERS_FILE} | Directory-only map of the project |`,
    ...folderScans.map((scan) =>
      `| ${scan.relativePath} | Full folder and file map for requested folder \`${scan.folder}/\` |`
    ),
    `| ${FORGE_FILE} | Generated or project-specific artifacts inside .aioson/ |`,
    ...(memoryIndexPath
      ? [`| ${MEMORY_INDEX_FILE} | Read-this-first index of context docs and when to load them |`]
      : []),
    ...(specCurrentPath
      ? [`| ${SPEC_CURRENT_FILE} | Current development snapshot derived from spec.md |`]
      : []),
    ...(specHistoryPath
      ? [`| ${SPEC_HISTORY_FILE} | Historical implementation and decision view derived from spec.md |`]
      : []),
    ...moduleDocs.map((doc) =>
      `| ${doc.relativePath} | Focused module memory for requested folder \`${doc.folder}/\` |`
    ),
    '',
    `- Folder map: \`${foldersPath}\``,
    ...(
      folderScans.length === 0
        ? ['- Requested folder scans: none']
        : folderScans.map((scan) => `- Folder \`${scan.folder}/\`: \`${scan.absolutePath}\``)
    ),
    `- AIOSON generated map: \`${forgePath}\``,
    `- AIOSON generated entries: ${forgeArtifactCount}`,
    ...(memoryIndexPath ? [`- Memory index: \`${memoryIndexPath}\``] : []),
    ...(specCurrentPath ? [`- Spec current view: \`${specCurrentPath}\``] : []),
    ...(specHistoryPath ? [`- Spec history view: \`${specHistoryPath}\``] : []),
    ...moduleDocs.map((doc) => `- Module memory \`${doc.folder}/\`: \`${doc.absolutePath}\``),
    '',
    '## Top-level footprint',
    '| Path | Files | Approx size |',
    '|------|-------|-------------|'
  ];

  const topLevelRows = [...topLevelStats.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  if (topLevelRows.length === 0) {
    lines.push('| [root files] | 0 | 0 KB |');
  } else {
    for (const [name, stat] of topLevelRows) {
      lines.push(`| ${name} | ${stat.files} | ${formatBytesCompact(stat.sizeBytes)} |`);
    }
  }

  lines.push('', '## Key files');
  if (!keyFiles || keyFiles.length === 0) {
    lines.push('- No key files detected.');
  } else {
    for (const file of keyFiles.slice(0, 20)) {
      lines.push(`### ${file.path}`);
      lines.push(`- Title: ${file.title}`);
      if (includeSummaries) lines.push(`- Summary: ${file.summary}`);
      lines.push(`- Approx size: ${formatBytesCompact(file.sizeBytes)}`);
      lines.push('');
    }
  }
  return lines.join('\n');
}

function buildPrompt({
  scanIndexMarkdown,
  folderMapMarkdown,
  folderScans = [],
  forgeMapMarkdown,
  keyContents,
  projectContext,
  specContent,
  existingDiscoveryContent,
  existingSkeletonContent,
  summaryMode
}) {
  const now = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
  const parts = ['You are analyzing a software project to generate a structured discovery document.\n'];

  if (projectContext) {
    parts.push(`## Project Context (aioson)\n\`\`\`\n${projectContext}\n\`\`\`\n`);
  }
  parts.push(`## Scan Index\n\`\`\`md\n${scanIndexMarkdown}\n\`\`\`\n`);
  parts.push(`## Folder Map\n\`\`\`md\n${folderMapMarkdown}\n\`\`\`\n`);
  for (const scan of folderScans) {
    parts.push(`## Folder Scan: ${scan.folder}\n\`\`\`md\n${scan.markdown}\n\`\`\`\n`);
  }
  parts.push(`## AIOSON Generated Map\n\`\`\`md\n${forgeMapMarkdown}\n\`\`\`\n`);

  if (summaryMode === 'raw' && Object.keys(keyContents).length > 0) {
    parts.push('## Key Files\n');
    for (const [filePath, content] of Object.entries(keyContents).slice(0, 12)) {
      parts.push(`### ${filePath}\n\`\`\`\n${content}\n\`\`\`\n`);
    }
  }

  if (specContent) {
    parts.push(`## Development Memory (spec.md)\n\`\`\`\n${specContent}\n\`\`\`\n`);
  }

  if (existingDiscoveryContent) {
    parts.push(`## Existing Discovery Memory (update in place)\n\`\`\`md\n${existingDiscoveryContent}\n\`\`\`\n`);
  }

  if (existingSkeletonContent) {
    parts.push(`## Existing Skeleton Memory (update in place)\n\`\`\`md\n${existingSkeletonContent}\n\`\`\`\n`);
  }

  parts.push(`
## Task
Generate TWO documents. Separate them with exactly this delimiter on its own line:
<<<SKELETON>>>

If existing discovery or skeleton documents were provided above, treat them as the current memory baseline and UPDATE them in place.
- Preserve stable system knowledge, conventions, and still-valid human notes.
- Remove or correct only what is clearly contradicted by the current scan, project.context.md, or spec.md.
- Do not throw away useful prior context just because the current scan sample is smaller.
- Keep the required output sections exactly as specified below.

### Document 1: \`.aioson/context/discovery.md\`
Generate with exactly these sections:

# Discovery

## 1. What this project builds
2-3 objective lines describing what the system does.

## 2. Project structure overview
Key directories and their responsibilities. Identify the architectural pattern (MVC, layered, feature-based, etc.).

## 3. Key entities and relationships
Entities inferred from models, migrations, or schema files. Include relationships if detectable.

## 4. Entry points and routes
Main route files, controllers, or API handlers identified.

## 5. Dependencies and services
Key packages from package.json / composer.json / requirements.txt. External services detected.

## 6. Existing patterns and conventions
Coding patterns already in use (naming, folder organization, auth approach, etc.). These must be preserved.

## 7. Development state
What appears to be done, in-progress, or missing. Use spec.md if available.

## 8. Risks and technical debt
Issues, inconsistencies, or missing pieces that could become problems.

## 9. What to preserve
Explicit list of conventions and structures the AI must NOT change or override.

---
_Generated by aioson scan:project — ${now}_

<<<SKELETON>>>

### Document 2: \`.aioson/context/skeleton-system.md\`
A lightweight living index of the system. Keep it concise — AI agents read this frequently as a quick-reference index. Do NOT repeat the full analysis from Document 1 here.

Generate with exactly this format:

# System Skeleton
_Generated by aioson scan:project — ${now}_

## File map
Indented tree of key files and directories grouped by domain/module.
Skip: detailed migration lists, test fixtures, config boilerplate, lock files.
Mark each module or file with inferred status:
  ✓  complete — code present and appears fully implemented
  ◑  partial  — scaffolded or incomplete implementation
  ○  missing  — referenced but not found or empty

## Key routes
Main routes mapped to their handlers. One per line.
Format: \`METHOD /path → Handler@method\`
Skip standard auth boilerplate (login/logout/password-reset) unless customized.
If no route files found: _No route files detected_

## Module status
| Module | Status | Key files |
|--------|--------|-----------|
One row per logical module or feature area.
Status: ✓ done | ◑ in-progress | ○ pending

## Key relationships
Entity relationships in plain English, one per line.
Example: \`User hasMany Orders → OrderItem → Product\`
If no models/schema found: _No entities detected_
`);

  return parts.join('\n');
}

function listTopLevelDirectories(entries) {
  const names = new Set();
  for (const entry of entries) {
    if (entry.type !== 'dir') continue;
    const topLevel = entry.relPath.split('/')[0];
    if (topLevel) names.add(topLevel);
  }
  return [...names].sort((a, b) => a.localeCompare(b));
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function runScanProject({ args, options = {}, logger, t }) {
  const targetArg = args[0] || '.';
  const targetDir = path.resolve(process.cwd(), targetArg);
  const summaryMode = resolveSummaryMode(options['summary-mode']);
  const contextMode = resolveContextMode(options['context-mode']);
  const requestedFolders = resolveRequestedFolders(options.folder);
  const llmRequested = Boolean(options['with-llm']);
  const llmModelOverride = String(options['llm-model'] || options.model || '').trim();

  logger.log(t('scan_project.scanning', { dir: targetDir }));

  if (requestedFolders.length === 0) {
    logger.error(t('scan_project.folder_required'));
    logger.error(t('scan_project.folder_required_examples_title'));
    logger.error(t('scan_project.folder_required_example_local'));
    logger.error(t('scan_project.folder_required_example_multi'));
    logger.error(t('scan_project.folder_required_example_llm'));
    logger.error(t('scan_project.folder_required_example_cli'));
    logger.error(t('scan_project.folder_required_example_prompt'));
    logger.error(t('scan_project.folder_required_example_next'));
    process.exitCode = 1;
    return { ok: false, error: 'folder_required' };
  }

  let providerName = null;
  let providerCfg = null;
  let model = null;

  if (!options['dry-run']) {
    const gitignoreRulesAdded = await ensureProjectGitignorePolicy(targetDir);
    if (gitignoreRulesAdded > 0) {
      logger.log(t('scan_project.gitignore_policy_written', { path: path.join(targetDir, '.gitignore') }));
      logger.log(t('scan_project.gitignore_tracked_note'));
    }
  }

  if (!llmRequested) {
    logger.log(t('scan_project.local_only'));
  } else if (!options['dry-run']) {
    const configPath = path.join(targetDir, CONFIG_FILE);
    if (!(await exists(configPath))) {
      logger.error(t('scan_project.config_missing', { file: CONFIG_FILE }));
      process.exitCode = 1;
      return { ok: false, error: 'config_not_found' };
    }

    let config;
    try {
      config = JSON.parse(await fs.readFile(configPath, 'utf8'));
    } catch (err) {
      logger.error(t('scan_project.config_invalid', { error: err.message }));
      process.exitCode = 1;
      return { ok: false, error: 'config_invalid' };
    }

    providerName = String(options.provider || config.preferred_scan_provider || '');
    const providers = config.providers || {};

    if (!providerName || !providers[providerName]) {
      const available = Object.keys(providers).join(', ') || '(none)';
      logger.error(t('scan_project.provider_missing', { provider: providerName, available }));
      process.exitCode = 1;
      return { ok: false, error: 'provider_not_found' };
    }

    providerCfg = { ...providers[providerName] };
    if (llmModelOverride) providerCfg.model = llmModelOverride;
    model = providerCfg.model || '?';
    logger.log(t('scan_project.provider_info', { provider: providerName, model }));
  }

  // Read context files
  const projectContext = await readFileSafe(path.join(targetDir, CONTEXT_FILE));
  const specContent    = await readFileSafe(path.join(targetDir, SPEC_FILE));
  const existingDiscoveryPath = path.join(targetDir, OUTPUT_FILE);
  const existingSkeletonPath = path.join(targetDir, SKELETON_FILE);
  const existingDiscoveryContent = contextMode === 'merge' ? await readFileSafe(existingDiscoveryPath) : null;
  const existingSkeletonContent = contextMode === 'merge' ? await readFileSafe(existingSkeletonPath) : null;

  if (projectContext) logger.log(t('scan_project.context_found'));
  else logger.log(t('scan_project.context_missing'));
  if (specContent) logger.log(t('scan_project.spec_found'));
  if (llmRequested && existingDiscoveryContent) logger.log(t('scan_project.existing_discovery_found', { path: existingDiscoveryPath }));
  if (llmRequested && existingSkeletonContent) logger.log(t('scan_project.existing_skeleton_found', { path: existingSkeletonPath }));
  if (llmRequested && (existingDiscoveryContent || existingSkeletonContent)) logger.log(t('scan_project.context_update_mode'));
  if (llmRequested) logger.log(t('scan_project.context_mode', { mode: contextMode }));

  // Walk project
  logger.log(t('scan_project.walking'));
  const { keyContents, keyFiles, topLevelStats, entries } = await walkProject(targetDir);
  logger.log(t('scan_project.walk_done', {
    files: entries.filter((entry) => entry.type === 'file').length,
    keys: Object.keys(keyContents).length
  }));

  const generatedAt = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
  const managedForgePaths = await loadManagedForgePaths();
  const folderMapMarkdown = buildFolderMapMarkdown({
    entries,
    generatedAt
  });
  const forgeArtifacts = buildForgeArtifactsMarkdown({
    entries,
    generatedAt,
    managedForgePaths
  });

  const availableTopLevelDirs = listTopLevelDirectories(entries);
  for (const folder of requestedFolders) {
    if (folder === '.') continue;
    const existsAsDirectory = entries.some((entry) => entry.type === 'dir' && entry.relPath === folder);
    if (!existsAsDirectory) {
      logger.error(t('scan_project.folder_not_found', {
        folder,
        available: availableTopLevelDirs.join(', ') || '(none)'
      }));
      process.exitCode = 1;
      return { ok: false, error: 'folder_not_found' };
    }
  }

  const folderScans = requestedFolders.map((folder) => {
    const relativePath = buildFolderScanRelativePath(folder);
    return {
      folder,
      relativePath,
      absolutePath: path.join(targetDir, relativePath),
      markdown: buildRequestedFolderMarkdown({
        entries,
        generatedAt,
        folder
      })
    };
  });

  const scanIndexPath = path.join(targetDir, INDEX_FILE);
  const scanFoldersPath = path.join(targetDir, FOLDERS_FILE);
  const scanForgePath = path.join(targetDir, FORGE_FILE);
  const scanIndexMarkdown = buildScanIndexMarkdown({
    keyFiles,
    topLevelStats,
    generatedAt,
    includeSummaries: summaryMode !== 'titles',
    foldersPath: scanFoldersPath,
    folderScans,
    forgePath: scanForgePath,
    forgeArtifactCount: forgeArtifacts.artifactCount
  });
  let derivedArtifacts = {
    memoryIndexPath: null,
    specCurrentPath: null,
    specHistoryPath: null,
    moduleDocs: []
  };
  if (!options['dry-run']) {
    await ensureDir(path.dirname(scanIndexPath));
    await fs.writeFile(scanFoldersPath, folderMapMarkdown, 'utf8');
    for (const scan of folderScans) {
      await fs.writeFile(scan.absolutePath, scan.markdown, 'utf8');
    }
    await fs.writeFile(scanIndexPath, scanIndexMarkdown, 'utf8');
    await fs.writeFile(scanForgePath, forgeArtifacts.markdown, 'utf8');
    logger.log(t('scan_project.folders_written', { path: scanFoldersPath }));
    for (const scan of folderScans) {
      logger.log(t('scan_project.folder_written', { folder: `${scan.folder}/`, path: scan.absolutePath }));
    }
  }

  if (options['dry-run']) {
    const output = {
      ok: true,
      dryRun: true,
      treeLines: entries.length,
      keyFiles: Object.keys(keyContents).length,
      provider: providerName,
      model,
      llmRequested,
      summaryMode,
      contextMode,
      requestedFolders,
      scanIndexPath,
      scanFoldersPath,
      scanFolderPaths: folderScans.map((scan) => scan.absolutePath),
      scanForgePath
    };
    if (options.json) return output;
    logger.log(t('scan_project.dry_run_done', { treeCount: entries.length, keyCount: Object.keys(keyContents).length }));
    return output;
  }

  if (!llmRequested) {
    derivedArtifacts = await writeDerivedContextMemory({
      targetDir,
      generatedAt,
      folderScans
    });

    const refreshedWalk = await walkProject(targetDir);
    const refreshedForgeArtifacts = buildForgeArtifactsMarkdown({
      entries: refreshedWalk.entries,
      generatedAt,
      managedForgePaths
    });
    const refreshedScanIndexMarkdown = buildScanIndexMarkdown({
      keyFiles: refreshedWalk.keyFiles,
      topLevelStats: refreshedWalk.topLevelStats,
      generatedAt,
      includeSummaries: summaryMode !== 'titles',
      foldersPath: path.join(targetDir, FOLDERS_FILE),
      folderScans,
      forgePath: path.join(targetDir, FORGE_FILE),
      forgeArtifactCount: refreshedForgeArtifacts.artifactCount,
      memoryIndexPath: derivedArtifacts.memoryIndexPath,
      specCurrentPath: derivedArtifacts.specCurrentPath,
      specHistoryPath: derivedArtifacts.specHistoryPath,
      moduleDocs: derivedArtifacts.moduleDocs
    });

    await fs.writeFile(scanIndexPath, refreshedScanIndexMarkdown, 'utf8');
    await fs.writeFile(scanForgePath, refreshedForgeArtifacts.markdown, 'utf8');
    logger.log(t('scan_project.index_written', { path: scanIndexPath, mode: summaryMode }));
    logger.log(t('scan_project.forge_written', { path: scanForgePath }));
    if (derivedArtifacts.memoryIndexPath) logger.log(t('scan_project.memory_index_written', { path: derivedArtifacts.memoryIndexPath }));
    if (derivedArtifacts.specCurrentPath) logger.log(t('scan_project.spec_current_written', { path: derivedArtifacts.specCurrentPath }));
    if (derivedArtifacts.specHistoryPath) logger.log(t('scan_project.spec_history_written', { path: derivedArtifacts.specHistoryPath }));
    for (const doc of derivedArtifacts.moduleDocs) {
      logger.log(t('scan_project.module_memory_written', { folder: `${doc.folder}/`, path: doc.absolutePath }));
    }

    logger.log(t('scan_project.local_done', { path: scanIndexPath }));
    logger.log(t('scan_project.local_missing'));
    logger.log(t('scan_project.architecture_note'));
    logger.log(t('scan_project.local_paths_title'));
    logger.log(t('scan_project.local_path_api'));
    logger.log(t('scan_project.local_next_steps', {
      target: targetArg,
      folders: requestedFolders.join(',')
    }));
    logger.log(t('scan_project.local_path_cli'));
    logger.log(t('scan_project.local_cli_step_analyst'));
    logger.log(t('scan_project.local_cli_step_prompt_codex'));
    logger.log(t('scan_project.local_cli_step_prompt_claude'));
    logger.log(t('scan_project.local_cli_step_model_hint'));
    logger.log(t('scan_project.local_workflow_title'));
    logger.log(t('scan_project.local_step_architect'));
    logger.log(t('scan_project.local_step_dev'));
    return {
      ok: true,
      targetDir,
      provider: null,
      model: null,
      llmRequested: false,
      summaryMode,
      contextMode,
      requestedFolders,
      scanIndexPath,
      scanFoldersPath,
      scanFolderPaths: folderScans.map((scan) => scan.absolutePath),
      scanForgePath,
      memoryIndexPath: derivedArtifacts.memoryIndexPath,
      specCurrentPath: derivedArtifacts.specCurrentPath,
      specHistoryPath: derivedArtifacts.specHistoryPath,
      moduleDocPaths: derivedArtifacts.moduleDocs.map((doc) => doc.absolutePath),
      discoveryPath: null,
      skeletonPath: null
    };
  }

  // Build prompt and call LLM
  const prompt = buildPrompt({
    scanIndexMarkdown,
    folderMapMarkdown,
    folderScans,
    forgeMapMarkdown: forgeArtifacts.markdown,
    keyContents,
    projectContext,
    specContent,
    existingDiscoveryContent,
    existingSkeletonContent,
    summaryMode
  });
  logger.log(t('scan_project.calling_llm', { provider: providerName, model }));

  let result;
  try {
    result = await callLLM(providerName, providerCfg, prompt);
  } catch (err) {
    if (err && err.code === 'MISSING_API_KEY') {
      logger.error(t('scan_project.llm_missing_api_key', { provider: providerName, file: CONFIG_FILE }));
    } else {
      logger.error(t('scan_project.llm_error', { error: err.message }));
    }
    process.exitCode = 1;
    return { ok: false, error: err.message };
  }

  // Parse and write both documents
  const outputPath = existingDiscoveryPath;
  const skeletonPath = existingSkeletonPath;

  await ensureDir(path.dirname(outputPath));

  let discoveryContent, skeletonContent;
  if (result.includes(DELIMITER)) {
    const parts = result.split(DELIMITER);
    discoveryContent = parts[0].trim();
    skeletonContent  = parts[1].trim();
  } else {
    discoveryContent = result.trim();
    skeletonContent  = null;
  }

  if (!discoveryContent) {
    logger.error(t('scan_project.invalid_llm_output_discovery_empty'));
    process.exitCode = 1;
    return { ok: false, error: 'empty_discovery' };
  }

  if (result.includes(DELIMITER) && !skeletonContent) {
    logger.error(t('scan_project.invalid_llm_output_skeleton_empty'));
    process.exitCode = 1;
    return { ok: false, error: 'empty_skeleton' };
  }

  const contextFilesToBackup = [];
  if (await exists(existingDiscoveryPath)) contextFilesToBackup.push(OUTPUT_FILE);
  if (skeletonContent && await exists(existingSkeletonPath)) contextFilesToBackup.push(SKELETON_FILE);

  if (contextFilesToBackup.length > 0) {
    const gitignoreChanged = await ensureGitignoreEntry(targetDir, BACKUPS_GITIGNORE_ENTRY);
    if (gitignoreChanged) {
      logger.log(t('scan_project.gitignore_backups_written', { path: path.join(targetDir, '.gitignore') }));
    }

    const backupResult = await backupProjectFiles(targetDir, contextFilesToBackup);
    if (backupResult.backedUp.length > 0) {
      logger.log(t('scan_project.backups_written', {
        count: backupResult.backedUp.length,
        path: backupResult.backupRoot
      }));
    }
  }

  await fs.writeFile(outputPath, discoveryContent, 'utf8');
  logger.log(t('scan_project.discovery_written', { path: outputPath, chars: discoveryContent.length }));

  if (skeletonContent) {
    await fs.writeFile(skeletonPath, skeletonContent, 'utf8');
    logger.log(t('scan_project.skeleton_written', { path: skeletonPath, chars: skeletonContent.length }));
  } else {
    logger.log(t('scan_project.skeleton_missing'));
  }

  derivedArtifacts = await writeDerivedContextMemory({
    targetDir,
    generatedAt,
    folderScans
  });
  const refreshedWalk = await walkProject(targetDir);
  const refreshedForgeArtifacts = buildForgeArtifactsMarkdown({
    entries: refreshedWalk.entries,
    generatedAt,
    managedForgePaths
  });
  const refreshedScanIndexMarkdown = buildScanIndexMarkdown({
    keyFiles: refreshedWalk.keyFiles,
    topLevelStats: refreshedWalk.topLevelStats,
    generatedAt,
    includeSummaries: summaryMode !== 'titles',
    foldersPath: path.join(targetDir, FOLDERS_FILE),
    folderScans,
    forgePath: path.join(targetDir, FORGE_FILE),
    forgeArtifactCount: refreshedForgeArtifacts.artifactCount,
    memoryIndexPath: derivedArtifacts.memoryIndexPath,
    specCurrentPath: derivedArtifacts.specCurrentPath,
    specHistoryPath: derivedArtifacts.specHistoryPath,
    moduleDocs: derivedArtifacts.moduleDocs
  });
  await fs.writeFile(scanIndexPath, refreshedScanIndexMarkdown, 'utf8');
  await fs.writeFile(scanForgePath, refreshedForgeArtifacts.markdown, 'utf8');
  logger.log(t('scan_project.index_written', { path: scanIndexPath, mode: summaryMode }));
  logger.log(t('scan_project.forge_written', { path: scanForgePath }));
  if (derivedArtifacts.memoryIndexPath) logger.log(t('scan_project.memory_index_written', { path: derivedArtifacts.memoryIndexPath }));
  if (derivedArtifacts.specCurrentPath) logger.log(t('scan_project.spec_current_written', { path: derivedArtifacts.specCurrentPath }));
  if (derivedArtifacts.specHistoryPath) logger.log(t('scan_project.spec_history_written', { path: derivedArtifacts.specHistoryPath }));
  for (const doc of derivedArtifacts.moduleDocs) {
    logger.log(t('scan_project.module_memory_written', { folder: `${doc.folder}/`, path: doc.absolutePath }));
  }

  logger.log(t('scan_project.architecture_note'));
  logger.log(t('scan_project.next_steps'));
  logger.log(t('scan_project.step_analyst'));
  logger.log(t('scan_project.step_architect'));
  logger.log(t('scan_project.step_dev'));

  const output = {
    ok: true,
    targetDir,
    provider: providerName,
    model,
    llmRequested: true,
    summaryMode,
    contextMode,
    requestedFolders,
    scanIndexPath,
    scanFoldersPath,
    scanFolderPaths: folderScans.map((scan) => scan.absolutePath),
    scanForgePath,
    memoryIndexPath: derivedArtifacts.memoryIndexPath,
    specCurrentPath: derivedArtifacts.specCurrentPath,
    specHistoryPath: derivedArtifacts.specHistoryPath,
    moduleDocPaths: derivedArtifacts.moduleDocs.map((doc) => doc.absolutePath),
    discoveryPath: outputPath,
    skeletonPath: skeletonContent ? skeletonPath : null
  };
  if (options.json) return output;
  return output;
}

module.exports = {
  runScanProject,
  resolveSummaryMode,
  resolveContextMode,
  resolveRequestedFolders,
  buildScanIndexMarkdown,
  buildPrompt
};
