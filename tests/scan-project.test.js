'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const fs = require('node:fs/promises');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { createTranslator } = require('../src/i18n');
const {
  runScanProject,
  resolveSummaryMode,
  resolveContextMode,
  resolveRequestedFolders,
  buildScanIndexMarkdown,
  buildPrompt
} = require('../src/commands/scan-project');

function createCollectLogger() {
  const lines = [];
  return {
    lines,
    log(line) {
      lines.push(String(line));
    },
    error(line) {
      lines.push(String(line));
    }
  };
}

test('scan:project requires --folder before scanning', async () => {
  const projectDir = await fs.mkdtemp(path.join(os.tmpdir(), 'aioson-scan-project-required-folder-'));
  const originalExitCode = process.exitCode;
  process.exitCode = undefined;

  try {
    await fs.writeFile(path.join(projectDir, 'package.json'), '{ "name": "demo" }\n', 'utf8');

    const { t } = createTranslator('pt-BR');
    const logger = createCollectLogger();
    const result = await runScanProject({
      args: [projectDir],
      options: {},
      logger,
      t
    });

    assert.equal(result.ok, false);
    assert.equal(result.error, 'folder_required');
    assert.equal(
      logger.lines.some((line) => line.includes('Informe --folder=<pasta[,pasta2]>')),
      true
    );
    assert.equal(
      logger.lines.some((line) => line.includes('aioson scan:project . --folder=src --with-llm --provider=openai')),
      true
    );
    assert.equal(
      logger.lines.some((line) => line.includes('aioson agent:prompt planner --tool=codex')),
      true
    );
  } finally {
    process.exitCode = originalExitCode;
    await fs.rm(projectDir, { recursive: true, force: true });
  }
});

test('scan:project explains missing provider API key with direct config guidance', async () => {
  const projectDir = await fs.mkdtemp(path.join(os.tmpdir(), 'aioson-scan-project-'));
  const originalExitCode = process.exitCode;
  process.exitCode = undefined;

  try {
    await fs.writeFile(
      path.join(projectDir, 'aioson-models.json'),
      `${JSON.stringify({
        preferred_scan_provider: 'deepseek',
        providers: {
          deepseek: {
            api_key: 'YOUR_DEEPSEEK_API_KEY',
            model: 'deepseek-chat',
            base_url: 'https://api.deepseek.com/v1'
          }
        }
      }, null, 2)}\n`,
      'utf8'
    );
    await fs.writeFile(path.join(projectDir, 'package.json'), '{ "name": "demo" }\n', 'utf8');
    await fs.mkdir(path.join(projectDir, 'src'));
    await fs.writeFile(path.join(projectDir, 'src', 'main.js'), 'console.log("demo");\n', 'utf8');

    const { t } = createTranslator('pt-BR');
    const logger = createCollectLogger();
    const result = await runScanProject({
      args: [projectDir],
      options: { 'with-llm': true, folder: 'src' },
      logger,
      t
    });

    assert.equal(result.ok, false);
    assert.equal(
      logger.lines.some((line) =>
        line.includes('A chave de API do provider "deepseek" ainda nao foi configurada em aioson-models.json')
      ),
      true
    );
    assert.equal(
      logger.lines.some((line) => line.includes('providers.deepseek.api_key')),
      true
    );
  } finally {
    process.exitCode = originalExitCode;
    await fs.rm(projectDir, { recursive: true, force: true });
  }
});

test('scan:project runs in local-only mode by default and writes folder-specific scan files', async () => {
  const projectDir = await fs.mkdtemp(path.join(os.tmpdir(), 'aioson-scan-project-local-'));
  const originalExitCode = process.exitCode;
  process.exitCode = undefined;

  try {
    await fs.writeFile(
      path.join(projectDir, 'package.json'),
      `${JSON.stringify({
        name: 'demo-app',
        scripts: { dev: 'next dev' },
        dependencies: { next: '15.0.0', react: '19.0.0' }
      }, null, 2)}\n`,
      'utf8'
    );
    await fs.mkdir(path.join(projectDir, 'src', 'components'), { recursive: true });
    await fs.writeFile(path.join(projectDir, 'src', 'app.js'), 'console.log("hi");\n', 'utf8');
    await fs.writeFile(path.join(projectDir, 'src', 'components', 'button.js'), 'export const button = true;\n', 'utf8');
    await fs.mkdir(path.join(projectDir, '.aioson', 'agents'), { recursive: true });
    await fs.mkdir(path.join(projectDir, '.aioson', 'context'), { recursive: true });
    await fs.mkdir(path.join(projectDir, '.aioson', 'squads', 'custom-squad'), { recursive: true });
    await fs.mkdir(path.join(projectDir, '.aioson', 'genomes'), { recursive: true });
    await fs.writeFile(path.join(projectDir, '.aioson', 'agents', 'setup.md'), '# managed\n', 'utf8');
    await fs.writeFile(path.join(projectDir, '.aioson', 'squads', 'memory.md'), '# managed memory\n', 'utf8');
    await fs.writeFile(
      path.join(projectDir, '.aioson', 'context', 'spec.md'),
      [
        '# Spec',
        '',
        '## Stack',
        '- Next.js',
        '',
        '## Estado atual',
        '- Fluxo base pronto',
        '',
        '### Em andamento',
        '- Ajuste do editor de captions',
        '',
        '### Planejado',
        '- Melhorar atalhos',
        '',
        '## Decisoes em aberto',
        '- Definir provider de captions',
        '',
        '## Decisoes tomadas',
        '- Manter estrutura em src/',
        '',
        '## Notas',
        '- Ler skeleton antes do discovery'
      ].join('\n'),
      'utf8'
    );
    await fs.writeFile(path.join(projectDir, '.aioson', 'context', 'discovery.md'), '# discovery\n', 'utf8');
    await fs.writeFile(
      path.join(projectDir, '.aioson', 'squads', 'custom-squad', 'squad.manifest.json'),
      '{ "slug": "custom-squad" }\n',
      'utf8'
    );
    await fs.writeFile(path.join(projectDir, '.aioson', 'genomes', 'demo.md'), '# demo genome\n', 'utf8');

    const { t } = createTranslator('pt-BR');
    const logger = createCollectLogger();
    const result = await runScanProject({
      args: [projectDir],
      options: { 'summary-mode': 'titles', folder: 'src' },
      logger,
      t
    });

    assert.equal(result.ok, true);
    assert.equal(result.llmRequested, false);
    assert.equal(result.summaryMode, 'titles');
    assert.deepEqual(result.requestedFolders, ['src']);
    assert.equal(result.discoveryPath, null);
    assert.equal(result.skeletonPath, null);
    assert.equal(result.memoryIndexPath, path.join(projectDir, '.aioson/context/memory-index.md'));
    assert.equal(result.specCurrentPath, path.join(projectDir, '.aioson/context/spec-current.md'));
    assert.equal(result.specHistoryPath, path.join(projectDir, '.aioson/context/spec-history.md'));
    assert.deepEqual(result.moduleDocPaths, [
      path.join(projectDir, '.aioson/context/module-src.md')
    ]);
    assert.equal(logger.lines.some((line) => line.includes('scan local apenas')), true);
    assert.equal(logger.lines.some((line) => line.includes('nao criam etapa ou documento obrigatorio')), true);
    assert.equal(logger.lines.some((line) => line.includes('memory-index.md')), true);
    assert.equal(logger.lines.some((line) => line.includes('spec-current.md')), true);
    assert.equal(logger.lines.some((line) => line.includes('spec-history.md')), true);
    assert.equal(
      logger.lines.some((line) =>
        line.includes('aioson scan:project') &&
        line.includes('--folder=src') &&
        line.includes('--with-llm')
      ),
      true
    );
    assert.equal(logger.lines.some((line) => line.includes('Com PRD ativo')), true);
    assert.equal(logger.lines.some((line) => line.includes('agent:prompt planner --tool=codex')), true);
    assert.equal(logger.lines.some((line) => line.includes('execute @planner com o PRD ativo')), true);

    const indexPath = path.join(projectDir, '.aioson/context/scan-index.md');
    const foldersPath = path.join(projectDir, '.aioson/context/scan-folders.md');
    const srcPath = path.join(projectDir, '.aioson/context/scan-src.md');
    const forgePath = path.join(projectDir, '.aioson/context/scan-aioson.md');
    const gitignorePath = path.join(projectDir, '.gitignore');
    const memoryIndexPath = path.join(projectDir, '.aioson/context/memory-index.md');
    const specCurrentPath = path.join(projectDir, '.aioson/context/spec-current.md');
    const specHistoryPath = path.join(projectDir, '.aioson/context/spec-history.md');
    const modulePath = path.join(projectDir, '.aioson/context/module-src.md');
    const gitignoreContent = await fs.readFile(gitignorePath, 'utf8');
    const indexContent = await fs.readFile(indexPath, 'utf8');
    const foldersContent = await fs.readFile(foldersPath, 'utf8');
    const sourceContent = await fs.readFile(srcPath, 'utf8');
    const forgeContent = await fs.readFile(forgePath, 'utf8');
    const memoryIndexContent = await fs.readFile(memoryIndexPath, 'utf8');
    const specCurrentContent = await fs.readFile(specCurrentPath, 'utf8');
    const specHistoryContent = await fs.readFile(specHistoryPath, 'utf8');
    const moduleContent = await fs.readFile(modulePath, 'utf8');

    assert.match(indexContent, /# Scan Index/);
    assert.match(indexContent, /scan-src\.md/);
    assert.match(indexContent, /memory-index\.md/);
    assert.match(indexContent, /spec-current\.md/);
    assert.match(indexContent, /spec-history\.md/);
    assert.match(indexContent, /module-src\.md/);
    assert.doesNotMatch(gitignoreContent, /\.aioson\/agents\//, 'agents/ must NOT be gitignored (Codex @ resolution)');
    assert.match(gitignoreContent, /\.aioson\/locales\//);
    assert.match(gitignoreContent, /\.aioson\/skills\//);
    assert.match(gitignoreContent, /\.aioson\/config\.md/);
    assert.match(indexContent, /### package\.json/);
    assert.doesNotMatch(indexContent, /- Summary:/);
    assert.match(foldersContent, /# Folder Map/);
    assert.match(foldersContent, /\|-- src\//);
    assert.match(foldersContent, /\.aioson\//);
    assert.doesNotMatch(foldersContent, /agents\//);
    assert.match(sourceContent, /# Folder Scan: src/);
    assert.match(sourceContent, /\|-- src\//);
    assert.match(sourceContent, /\|  \|-- components\//);
    assert.match(sourceContent, /button\.js/);
    assert.match(forgeContent, /# AIOSON Generated Map/);
    assert.match(forgeContent, /## Context Pages/);
    assert.match(forgeContent, /## Squads/);
    assert.match(forgeContent, /## Genomes/);
    assert.match(forgeContent, /\|-- \.aioson\/context\//);
    assert.match(forgeContent, /custom-squad\//);
    assert.match(forgeContent, /demo\.md/);
    assert.match(forgeContent, /discovery\.md/);
    assert.doesNotMatch(forgeContent, /agents\//);
    assert.doesNotMatch(forgeContent, /memory\.md/);
    assert.match(memoryIndexContent, /# Memory Index/);
    assert.match(memoryIndexContent, /spec-current\.md/);
    assert.match(specCurrentContent, /# Spec Current/);
    assert.match(specCurrentContent, /Ajuste do editor de captions/);
    assert.match(specHistoryContent, /# Spec History/);
    assert.match(specHistoryContent, /Manter estrutura em src\//);
    assert.match(moduleContent, /# Module Memory: src/);
    assert.match(moduleContent, /scan-src\.md/);
  } finally {
    process.exitCode = originalExitCode;
    await fs.rm(projectDir, { recursive: true, force: true });
  }
});

test('scan:project refreshes gitignore policy for existing projects installed before the new ignore rules', async () => {
  const projectDir = await fs.mkdtemp(path.join(os.tmpdir(), 'aioson-scan-project-gitignore-refresh-'));
  const originalExitCode = process.exitCode;
  process.exitCode = undefined;

  try {
    await fs.writeFile(path.join(projectDir, '.gitignore'), '.aioson/\n!.aioson/**\n', 'utf8');
    await fs.writeFile(path.join(projectDir, 'package.json'), '{ "name": "demo" }\n', 'utf8');
    await fs.mkdir(path.join(projectDir, 'app'), { recursive: true });
    await fs.writeFile(path.join(projectDir, 'app', 'page.js'), 'export default function Page() {}\n', 'utf8');

    const { t } = createTranslator('en');
    const logger = createCollectLogger();
    const result = await runScanProject({
      args: [projectDir],
      options: { folder: 'app' },
      logger,
      t
    });

    const gitignore = await fs.readFile(path.join(projectDir, '.gitignore'), 'utf8');

    assert.equal(result.ok, true);
    assert.doesNotMatch(gitignore, /\.aioson\/agents\//, 'agents/ must NOT be gitignored (Codex @ resolution)');
    assert.match(gitignore, /\.aioson\/locales\//);
    assert.match(gitignore, /\.aioson\/skills\//);
    assert.equal(
      logger.lines.some((line) => line.includes('policy updated') || line.includes('framework-managed files')),
      true
    );
    assert.equal(
      logger.lines.some((line) => line.includes('git rm --cached')),
      true
    );
  } finally {
    process.exitCode = originalExitCode;
    await fs.rm(projectDir, { recursive: true, force: true });
  }
});

test('scan:project resolves summary mode, context mode and requested folders safely', () => {
  assert.equal(resolveSummaryMode(), 'summaries');
  assert.equal(resolveSummaryMode('titles'), 'titles');
  assert.equal(resolveSummaryMode('raw'), 'raw');
  assert.equal(resolveSummaryMode('SUMMARIES'), 'summaries');
  assert.equal(resolveSummaryMode('unknown'), 'summaries');

  assert.equal(resolveContextMode(), 'merge');
  assert.equal(resolveContextMode('merge'), 'merge');
  assert.equal(resolveContextMode('rewrite'), 'rewrite');
  assert.equal(resolveContextMode('unknown'), 'merge');

  assert.deepEqual(resolveRequestedFolders('src, app ,src'), ['src', 'app']);
  assert.deepEqual(resolveRequestedFolders(['src', 'app/components']), ['src', 'app/components']);
  assert.deepEqual(resolveRequestedFolders(), []);
});

test('scan:project builds a compact scan index with folder scans, optional summaries and sizes', () => {
  const markdownWithSummaries = buildScanIndexMarkdown({
    keyFiles: [{
      path: 'package.json',
      sizeBytes: 4096,
      title: 'demo package manifest',
      summary: 'Scripts: 3 | Dependencies: 7 | Framework clues: Next.js'
    }],
    topLevelStats: new Map([
      ['[root files]', { files: 1, sizeBytes: 4096 }],
      ['src', { files: 1, sizeBytes: 2048 }]
    ]),
    generatedAt: '2026-03-13T12:00:00Z',
    includeSummaries: true,
    foldersPath: '/tmp/project/.aioson/context/scan-folders.md',
    folderScans: [{
      folder: 'src',
      relativePath: '.aioson/context/scan-src.md',
      absolutePath: '/tmp/project/.aioson/context/scan-src.md'
    }],
    forgePath: '/tmp/project/.aioson/context/scan-aioson.md',
    forgeArtifactCount: 2
  });

  assert.match(markdownWithSummaries, /# Scan Index/);
  assert.match(markdownWithSummaries, /scan-folders\.md/);
  assert.match(markdownWithSummaries, /scan-src\.md/);
  assert.match(markdownWithSummaries, /Folder `src\/`: `\/tmp\/project\/\.aioson\/context\/scan-src\.md`/);
  assert.match(markdownWithSummaries, /AIOSON generated entries: 2/);
  assert.match(markdownWithSummaries, /\| src \| 1 \| 2\.00 KB \|/);
  assert.match(markdownWithSummaries, /### package\.json/);
  assert.match(markdownWithSummaries, /- Title: demo package manifest/);
  assert.match(markdownWithSummaries, /- Summary: Scripts: 3 \| Dependencies: 7 \| Framework clues: Next\.js/);
  assert.match(markdownWithSummaries, /- Approx size: 4\.00 KB/);

  const markdownTitlesOnly = buildScanIndexMarkdown({
    keyFiles: [{
      path: 'package.json',
      sizeBytes: 512,
      title: 'demo package manifest',
      summary: 'Should not appear'
    }],
    topLevelStats: new Map([['[root files]', { files: 1, sizeBytes: 512 }]]),
    generatedAt: '2026-03-13T12:00:00Z',
    includeSummaries: false,
    foldersPath: '/tmp/project/.aioson/context/scan-folders.md',
    folderScans: [{
      folder: 'app',
      relativePath: '.aioson/context/scan-app.md',
      absolutePath: '/tmp/project/.aioson/context/scan-app.md'
    }],
    forgePath: '/tmp/project/.aioson/context/scan-aioson.md',
    forgeArtifactCount: 0
  });

  assert.doesNotMatch(markdownTitlesOnly, /Should not appear/);
  assert.match(markdownTitlesOnly, /scan-app\.md/);
  assert.match(markdownTitlesOnly, /- Title: demo package manifest/);
});

test('scan:project prompt keeps raw file contents optional and includes requested folder scans', () => {
  const promptWithSummaries = buildPrompt({
    scanIndexMarkdown: '# Scan Index\n\n## Key files\n### package.json',
    folderMapMarkdown: '# Folder Map\n\n```text\nsrc/\n```',
    folderScans: [
      {
        folder: 'src',
        markdown: '# Folder Scan: src\n\n```text\nsrc/\n  app.js\n```'
      },
      {
        folder: 'app',
        markdown: '# Folder Scan: app\n\n```text\napp/\n  page.tsx\n```'
      }
    ],
    forgeMapMarkdown: '# AIOSON Generated Map\n\n## Squads\n```text\n.aioson/squads/\n```',
    keyContents: { 'package.json': '{ "name": "demo" }' },
    projectContext: 'framework: next',
    specContent: 'ship the MVP',
    existingDiscoveryContent: '# Discovery\n\n## 1. What this project builds\nOld summary',
    existingSkeletonContent: '# System Skeleton\n\n## File map\nOld tree',
    summaryMode: 'summaries'
  });

  assert.match(promptWithSummaries, /## Scan Index/);
  assert.match(promptWithSummaries, /## Folder Map/);
  assert.match(promptWithSummaries, /## Folder Scan: src/);
  assert.match(promptWithSummaries, /## Folder Scan: app/);
  assert.match(promptWithSummaries, /## AIOSON Generated Map/);
  assert.doesNotMatch(promptWithSummaries, /## Key Files/);
  assert.match(promptWithSummaries, /## Project Context \(aioson\)/);
  assert.match(promptWithSummaries, /## Development Memory \(spec\.md\)/);
  assert.match(promptWithSummaries, /## Existing Discovery Memory \(update in place\)/);
  assert.match(promptWithSummaries, /## Existing Skeleton Memory \(update in place\)/);
  assert.match(promptWithSummaries, /UPDATE them in place/);

  const promptWithRaw = buildPrompt({
    scanIndexMarkdown: '# Scan Index\n\n## Key files\n### package.json',
    folderMapMarkdown: '# Folder Map\n\n```text\nsrc/\n```',
    folderScans: [{
      folder: 'src',
      markdown: '# Folder Scan: src\n\n```text\nsrc/\n  app.js\n```'
    }],
    forgeMapMarkdown: '# AIOSON Generated Map\n\n_No generated AIOSON artifacts detected yet_',
    keyContents: { 'package.json': '{ "name": "demo" }' },
    projectContext: '',
    specContent: '',
    existingDiscoveryContent: '',
    existingSkeletonContent: '',
    summaryMode: 'raw'
  });

  assert.match(promptWithRaw, /## Key Files/);
  assert.match(promptWithRaw, /### package\.json/);
  assert.match(promptWithRaw, /\{ "name": "demo" \}/);
});

test('scan:project with LLM updates existing discovery context with backups and gitignore protection', async () => {
  const projectDir = await fs.mkdtemp(path.join(os.tmpdir(), 'aioson-scan-project-merge-'));
  const originalExitCode = process.exitCode;
  const originalHttpRequest = http.request;
  process.exitCode = undefined;

  let capturedPrompt = '';
  http.request = (options, callback) => {
    const req = new EventEmitter();
    const chunks = [];

    req.setTimeout = () => {};
    req.write = (chunk) => {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    };
    req.end = () => {
      const payload = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      capturedPrompt = payload.messages[0].content;

      const res = new EventEmitter();
      res.statusCode = 200;
      callback(res);
      process.nextTick(() => {
        res.emit('data', Buffer.from(JSON.stringify({
          choices: [{
            message: {
              content: '# Discovery\n\n## 1. What this project builds\nNew merged summary\n\n## 2. Project structure overview\nUpdated structure\n\n## 3. Key entities and relationships\nUpdated entities\n\n## 4. Entry points and routes\nUpdated routes\n\n## 5. Dependencies and services\nUpdated deps\n\n## 6. Existing patterns and conventions\nUpdated patterns\n\n## 7. Development state\nUpdated state\n\n## 8. Risks and technical debt\nUpdated risks\n\n## 9. What to preserve\nUpdated preserve\n\n---\n_Generated by aioson scan:project — 2026-03-19T12:00:00Z_\n<<<SKELETON>>>\n# System Skeleton\n_Generated by aioson scan:project — 2026-03-19T12:00:00Z_\n\n## File map\nUpdated tree\n\n## Key routes\nGET /health -> HealthController@index\n\n## Module status\n| Module | Status | Key files |\n|--------|--------|-----------|\n| core | ✓ done | src/index.js |\n\n## Key relationships\nUser hasMany Sessions'
            }
          }]
        })));
        res.emit('end');
      });
    };
    req.destroy = (err) => {
      if (err) req.emit('error', err);
    };
    return req;
  };

  try {
    await fs.writeFile(
      path.join(projectDir, 'aioson-models.json'),
      `${JSON.stringify({
        preferred_scan_provider: 'openai',
        providers: {
          openai: {
            api_key: 'sk-test',
            model: 'gpt-test-mini',
            base_url: 'http://mocked.local/v1'
          }
        }
      }, null, 2)}\n`,
      'utf8'
    );
    await fs.writeFile(path.join(projectDir, '.gitignore'), 'node_modules/\n', 'utf8');
    await fs.writeFile(path.join(projectDir, 'package.json'), '{ "name": "demo" }\n', 'utf8');
    await fs.mkdir(path.join(projectDir, 'src'), { recursive: true });
    await fs.writeFile(path.join(projectDir, 'src', 'index.js'), 'console.log("ok");\n', 'utf8');
    await fs.mkdir(path.join(projectDir, '.aioson', 'context'), { recursive: true });
    await fs.writeFile(path.join(projectDir, '.aioson', 'context', 'project.context.md'), 'framework_installed: true\n', 'utf8');
    await fs.writeFile(path.join(projectDir, '.aioson', 'context', 'spec.md'), '# Spec\n\nKeep rollout notes.\n', 'utf8');
    await fs.writeFile(path.join(projectDir, '.aioson', 'context', 'discovery.md'), '# Discovery\n\nOld discovery body.\n', 'utf8');
    await fs.writeFile(path.join(projectDir, '.aioson', 'context', 'skeleton-system.md'), '# System Skeleton\n\nOld skeleton body.\n', 'utf8');

    const { t } = createTranslator('pt-BR');
    const logger = createCollectLogger();
    const result = await runScanProject({
      args: [projectDir],
      options: { 'with-llm': true, folder: 'src', provider: 'openai' },
      logger,
      t
    });

    assert.equal(result.ok, true);
    assert.equal(result.llmRequested, true);
    assert.match(capturedPrompt, /## Existing Discovery Memory \(update in place\)/);
    assert.match(capturedPrompt, /Old discovery body\./);
    assert.match(capturedPrompt, /## Existing Skeleton Memory \(update in place\)/);
    assert.match(capturedPrompt, /Old skeleton body\./);
    assert.match(capturedPrompt, /## Development Memory \(spec\.md\)/);
    assert.match(capturedPrompt, /UPDATE them in place/);

    const discoveryContent = await fs.readFile(path.join(projectDir, '.aioson', 'context', 'discovery.md'), 'utf8');
    const skeletonContent = await fs.readFile(path.join(projectDir, '.aioson', 'context', 'skeleton-system.md'), 'utf8');
    const gitignore = await fs.readFile(path.join(projectDir, '.gitignore'), 'utf8');
    const backupsRoot = path.join(projectDir, '.aioson', 'backups');
    const backupRuns = await fs.readdir(backupsRoot);

    assert.match(discoveryContent, /New merged summary/);
    assert.match(skeletonContent, /Updated tree/);
    assert.equal(gitignore.includes('.aioson/backups/'), true);
    assert.equal(backupRuns.length > 0, true);

    const backupRunPath = path.join(backupsRoot, backupRuns[0]);
    const backedUpDiscovery = await fs.readFile(
      path.join(backupRunPath, '.aioson', 'context', 'discovery.md'),
      'utf8'
    );
    const backedUpSkeleton = await fs.readFile(
      path.join(backupRunPath, '.aioson', 'context', 'skeleton-system.md'),
      'utf8'
    );

    assert.match(backedUpDiscovery, /Old discovery body/);
    assert.match(backedUpSkeleton, /Old skeleton body/);
    assert.equal(logger.lines.some((line) => line.includes('update/merge do contexto existente')), true);
    assert.equal(logger.lines.some((line) => line.includes('Backup')), true);
  } finally {
    http.request = originalHttpRequest;
    process.exitCode = originalExitCode;
    await fs.rm(projectDir, { recursive: true, force: true });
  }
});

test('scan:project retries OpenAI-compatible call with max_completion_tokens when model rejects max_tokens', async () => {
  const projectDir = await fs.mkdtemp(path.join(os.tmpdir(), 'aioson-scan-project-openai-fallback-'));
  const originalExitCode = process.exitCode;
  const originalHttpRequest = http.request;
  process.exitCode = undefined;

  const capturedPayloads = [];
  let requestCount = 0;

  http.request = (options, callback) => {
    const req = new EventEmitter();
    const chunks = [];

    req.setTimeout = () => {};
    req.write = (chunk) => {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    };
    req.end = () => {
      requestCount += 1;
      const payload = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      capturedPayloads.push(payload);

      const res = new EventEmitter();
      res.statusCode = requestCount === 1 ? 400 : 200;
      callback(res);
      process.nextTick(() => {
        if (requestCount === 1) {
          res.emit('data', Buffer.from(JSON.stringify({
            error: {
              message: "Unsupported parameter: 'max_tokens' is not supported with this model. Use 'max_completion_tokens' instead.",
              type: 'invalid_request_error',
              param: 'max_tokens',
              code: 'unsupported_parameter'
            }
          })));
          res.emit('end');
          return;
        }

        res.emit('data', Buffer.from(JSON.stringify({
          choices: [{
            message: {
              content: '# Discovery\n\nRetry worked\n<<<SKELETON>>>\n# System Skeleton\n\nRetry worked too'
            }
          }]
        })));
        res.emit('end');
      });
    };
    req.destroy = (err) => {
      if (err) req.emit('error', err);
    };
    return req;
  };

  try {
    await fs.writeFile(
      path.join(projectDir, 'aioson-models.json'),
      `${JSON.stringify({
        preferred_scan_provider: 'openai',
        providers: {
          openai: {
            api_key: 'sk-test',
            model: 'gpt-5.4-nano',
            base_url: 'http://mocked.local/v1'
          }
        }
      }, null, 2)}\n`,
      'utf8'
    );
    await fs.writeFile(path.join(projectDir, 'package.json'), '{ "name": "demo" }\n', 'utf8');
    await fs.mkdir(path.join(projectDir, 'app'), { recursive: true });
    await fs.writeFile(path.join(projectDir, 'app', 'page.js'), 'export default function Page() {}\n', 'utf8');
    await fs.mkdir(path.join(projectDir, '.aioson', 'context'), { recursive: true });

    const { t } = createTranslator('en');
    const logger = createCollectLogger();
    const result = await runScanProject({
      args: [projectDir],
      options: { 'with-llm': true, folder: 'app', provider: 'openai' },
      logger,
      t
    });

    assert.equal(result.ok, true);
    assert.equal(requestCount, 2);
    assert.equal(capturedPayloads[0].max_tokens, 4096);
    assert.equal('max_completion_tokens' in capturedPayloads[0], false);
    assert.equal(capturedPayloads[1].max_completion_tokens, 4096);
    assert.equal('max_tokens' in capturedPayloads[1], false);
    assert.equal(logger.lines.some((line) => line.includes('LLM call failed')), false);
  } finally {
    http.request = originalHttpRequest;
    process.exitCode = originalExitCode;
    await fs.rm(projectDir, { recursive: true, force: true });
  }
});

test('scan:project does not overwrite existing discovery when LLM returns empty discovery content', async () => {
  const projectDir = await fs.mkdtemp(path.join(os.tmpdir(), 'aioson-scan-project-empty-discovery-'));
  const originalExitCode = process.exitCode;
  const originalHttpRequest = http.request;
  process.exitCode = undefined;

  http.request = (options, callback) => {
    const req = new EventEmitter();
    const chunks = [];

    req.setTimeout = () => {};
    req.write = (chunk) => {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    };
    req.end = () => {
      const res = new EventEmitter();
      res.statusCode = 200;
      callback(res);
      process.nextTick(() => {
        res.emit('data', Buffer.from(JSON.stringify({
          choices: [{
            message: {
              content: '<<<SKELETON>>>\n# System Skeleton\n\n## File map\nOnly skeleton came back'
            }
          }]
        })));
        res.emit('end');
      });
    };
    req.destroy = (err) => {
      if (err) req.emit('error', err);
    };
    return req;
  };

  try {
    await fs.writeFile(
      path.join(projectDir, 'aioson-models.json'),
      `${JSON.stringify({
        preferred_scan_provider: 'openai',
        providers: {
          openai: {
            api_key: 'sk-test',
            model: 'gpt-5.4-nano',
            base_url: 'http://mocked.local/v1'
          }
        }
      }, null, 2)}\n`,
      'utf8'
    );
    await fs.writeFile(path.join(projectDir, 'package.json'), '{ "name": "demo" }\n', 'utf8');
    await fs.mkdir(path.join(projectDir, 'app'), { recursive: true });
    await fs.writeFile(path.join(projectDir, 'app', 'page.js'), 'export default function Page() {}\n', 'utf8');
    await fs.mkdir(path.join(projectDir, '.aioson', 'context'), { recursive: true });
    await fs.writeFile(
      path.join(projectDir, '.aioson', 'context', 'discovery.md'),
      '# Discovery\n\nPreserve this content.\n',
      'utf8'
    );
    await fs.writeFile(
      path.join(projectDir, '.aioson', 'context', 'skeleton-system.md'),
      '# System Skeleton\n\nPreserve this skeleton.\n',
      'utf8'
    );

    const { t } = createTranslator('en');
    const logger = createCollectLogger();
    const result = await runScanProject({
      args: [projectDir],
      options: { 'with-llm': true, folder: 'app', provider: 'openai' },
      logger,
      t
    });

    const discoveryContent = await fs.readFile(path.join(projectDir, '.aioson', 'context', 'discovery.md'), 'utf8');
    const skeletonContent = await fs.readFile(path.join(projectDir, '.aioson', 'context', 'skeleton-system.md'), 'utf8');
    const backupsRoot = path.join(projectDir, '.aioson', 'backups');

    assert.equal(result.ok, false);
    assert.equal(result.error, 'empty_discovery');
    assert.match(discoveryContent, /Preserve this content\./);
    assert.match(skeletonContent, /Preserve this skeleton\./);
    await assert.rejects(fs.access(backupsRoot));
    assert.equal(
      logger.lines.some((line) => line.includes('empty discovery.md')),
      true
    );
  } finally {
    http.request = originalHttpRequest;
    process.exitCode = originalExitCode;
    await fs.rm(projectDir, { recursive: true, force: true });
  }
});

test('scan:project with context-mode=rewrite ignores previous discovery memory in the prompt', async () => {
  const projectDir = await fs.mkdtemp(path.join(os.tmpdir(), 'aioson-scan-project-rewrite-'));
  const originalExitCode = process.exitCode;
  const originalHttpRequest = http.request;
  process.exitCode = undefined;

  let capturedPrompt = '';
  http.request = (options, callback) => {
    const req = new EventEmitter();
    const chunks = [];

    req.setTimeout = () => {};
    req.write = (chunk) => {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    };
    req.end = () => {
      const payload = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      capturedPrompt = payload.messages[0].content;

      const res = new EventEmitter();
      res.statusCode = 200;
      callback(res);
      process.nextTick(() => {
        res.emit('data', Buffer.from(JSON.stringify({
          choices: [{
            message: {
              content: '# Discovery\n\nRewrite summary\n<<<SKELETON>>>\n# System Skeleton\n\nRewrite tree'
            }
          }]
        })));
        res.emit('end');
      });
    };
    req.destroy = (err) => {
      if (err) req.emit('error', err);
    };
    return req;
  };

  try {
    await fs.writeFile(
      path.join(projectDir, 'aioson-models.json'),
      `${JSON.stringify({
        preferred_scan_provider: 'openai',
        providers: {
          openai: {
            api_key: 'sk-test',
            model: 'gpt-test-mini',
            base_url: 'http://mocked.local/v1'
          }
        }
      }, null, 2)}\n`,
      'utf8'
    );
    await fs.writeFile(path.join(projectDir, 'package.json'), '{ "name": "demo" }\n', 'utf8');
    await fs.mkdir(path.join(projectDir, 'src'), { recursive: true });
    await fs.writeFile(path.join(projectDir, 'src', 'index.js'), 'console.log("ok");\n', 'utf8');
    await fs.mkdir(path.join(projectDir, '.aioson', 'context'), { recursive: true });
    await fs.writeFile(path.join(projectDir, '.aioson', 'context', 'discovery.md'), '# Discovery\n\nOld discovery body.\n', 'utf8');
    await fs.writeFile(path.join(projectDir, '.aioson', 'context', 'skeleton-system.md'), '# System Skeleton\n\nOld skeleton body.\n', 'utf8');

    const { t } = createTranslator('pt-BR');
    const logger = createCollectLogger();
    const result = await runScanProject({
      args: [projectDir],
      options: { 'with-llm': true, folder: 'src', provider: 'openai', 'context-mode': 'rewrite' },
      logger,
      t
    });

    assert.equal(result.ok, true);
    assert.equal(result.contextMode, 'rewrite');
    assert.doesNotMatch(capturedPrompt, /Existing Discovery Memory/);
    assert.doesNotMatch(capturedPrompt, /Old discovery body\./);
    assert.doesNotMatch(capturedPrompt, /Existing Skeleton Memory/);
    assert.doesNotMatch(capturedPrompt, /Old skeleton body\./);
    assert.equal(logger.lines.some((line) => line.includes('context-mode=rewrite')), true);
  } finally {
    http.request = originalHttpRequest;
    process.exitCode = originalExitCode;
    await fs.rm(projectDir, { recursive: true, force: true });
  }
});

test('scan:project dry-run returns requested folder paths without writing files', async () => {
  const projectDir = await fs.mkdtemp(path.join(os.tmpdir(), 'aioson-scan-project-dry-run-'));
  const originalExitCode = process.exitCode;
  process.exitCode = undefined;

  try {
    await fs.writeFile(
      path.join(projectDir, 'package.json'),
      `${JSON.stringify({
        name: 'demo-app',
        scripts: { dev: 'next dev' },
        dependencies: { next: '15.0.0', react: '19.0.0' }
      }, null, 2)}\n`,
      'utf8'
    );
    await fs.mkdir(path.join(projectDir, 'src'), { recursive: true });
    await fs.mkdir(path.join(projectDir, 'app'), { recursive: true });
    await fs.writeFile(path.join(projectDir, 'src', 'app.js'), 'console.log("hi");\n', 'utf8');
    await fs.writeFile(path.join(projectDir, 'app', 'page.tsx'), 'export default function Page() {}\n', 'utf8');

    const { t } = createTranslator('pt-BR');
    const logger = createCollectLogger();
    const result = await runScanProject({
      args: [projectDir],
      options: { 'dry-run': true, 'summary-mode': 'titles', folder: 'src,app' },
      logger,
      t
    });

    assert.equal(result.ok, true);
    assert.equal(result.dryRun, true);
    assert.equal(result.summaryMode, 'titles');
    assert.equal(result.provider, null);
    assert.equal(result.model, null);
    assert.equal(result.llmRequested, false);
    assert.deepEqual(result.requestedFolders, ['src', 'app']);
    assert.equal(
      result.scanIndexPath,
      path.join(projectDir, '.aioson/context/scan-index.md')
    );
    assert.equal(
      result.scanFoldersPath,
      path.join(projectDir, '.aioson/context/scan-folders.md')
    );
    assert.deepEqual(result.scanFolderPaths, [
      path.join(projectDir, '.aioson/context/scan-src.md'),
      path.join(projectDir, '.aioson/context/scan-app.md')
    ]);
    assert.equal(
      result.scanForgePath,
      path.join(projectDir, '.aioson/context/scan-aioson.md')
    );
    assert.equal(
      logger.lines.some((line) => line.includes('nenhuma chamada LLM feita')),
      true
    );
    await assert.rejects(fs.access(result.scanIndexPath));
    await assert.rejects(fs.access(result.scanFoldersPath));
    await assert.rejects(fs.access(result.scanFolderPaths[0]));
    await assert.rejects(fs.access(result.scanFolderPaths[1]));
    await assert.rejects(fs.access(result.scanForgePath));
  } finally {
    process.exitCode = originalExitCode;
    await fs.rm(projectDir, { recursive: true, force: true });
  }
});
