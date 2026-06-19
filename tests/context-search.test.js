'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');

const { IndexManager, sanitizeFtsQuery } = require('../src/context-search');
const { runContextSearch, resolveSearchTarget } = require('../src/commands/context-search');
const { selectContext } = require('../src/context-selector');

async function makeTmpDir() {
  return fs.mkdtemp(path.join(os.tmpdir(), 'aioson-search-'));
}

async function removeTmp(dir) {
  // Windows can briefly hold the SQLite file handle after close(); retry the
  // rmdir so a transient ENOTEMPTY/EBUSY never fails an otherwise-green test.
  await fs.rm(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
}

async function writeFile(dir, relPath, content) {
  const full = path.join(dir, relPath);
  await fs.mkdir(path.dirname(full), { recursive: true });
  await fs.writeFile(full, content, 'utf8');
  return full;
}

function logger() {
  const lines = [];
  return {
    lines,
    log(value) { lines.push(String(value)); }
  };
}

test('IndexManager — opens and closes without error', async () => {
  const tmp = await makeTmpDir();
  try {
    const searchDir = path.join(tmp, 'search');
    const idx = new IndexManager(searchDir);
    await idx.open();
    idx.close();
  } finally {
    await removeTmp(tmp);
  }
});

test('IndexManager — indexDirectory indexes markdown files', async () => {
  const tmp = await makeTmpDir();
  try {
    const searchDir = path.join(tmp, 'search');
    const docsDir = path.join(tmp, 'docs');
    await fs.mkdir(docsDir);

    await fs.writeFile(path.join(docsDir, 'README.md'), '# Hello World\n\nThis is a test document about context.', 'utf8');
    await fs.writeFile(path.join(docsDir, 'design.md'), '# Design System\n\nColor tokens and spacing.', 'utf8');

    const idx = new IndexManager(searchDir);
    await idx.open();
    try {
      const result = await idx.indexDirectory(docsDir);
      assert.ok(result.indexed >= 2, `should index at least 2 files, got ${result.indexed}`);

      const stats = idx.stats();
      assert.ok(stats.totalDocs >= 2, 'stats should reflect indexed docs');
    } finally {
      idx.close();
    }
  } finally {
    await removeTmp(tmp);
  }
});

test('IndexManager — search returns relevant results', async () => {
  const tmp = await makeTmpDir();
  try {
    const searchDir = path.join(tmp, 'search');
    const docsDir = path.join(tmp, 'docs');
    await fs.mkdir(docsDir);

    await fs.writeFile(path.join(docsDir, 'fts5.md'), '# FTS5 Search\n\nFull text search with SQLite FTS5 module.', 'utf8');
    await fs.writeFile(path.join(docsDir, 'cache.md'), '# Cache RAM\n\nIn-memory cache for context documents.', 'utf8');

    const idx = new IndexManager(searchDir);
    await idx.open();
    try {
      await idx.indexDirectory(docsDir, { force: true });
      const results = idx.search('FTS5 search');
      assert.ok(results.length > 0, 'should return at least one result');
      assert.ok(
        results.some(r => r.relPath.includes('fts5')),
        'fts5.md should be in results'
      );
    } finally {
      idx.close();
    }
  } finally {
    await removeTmp(tmp);
  }
});

test('IndexManager — search returns empty array for no matches', async () => {
  const tmp = await makeTmpDir();
  try {
    const searchDir = path.join(tmp, 'search');
    const docsDir = path.join(tmp, 'docs');
    await fs.mkdir(docsDir);
    await fs.writeFile(path.join(docsDir, 'doc.md'), '# Hello\n\ncontent here', 'utf8');

    const idx = new IndexManager(searchDir);
    await idx.open();
    try {
      await idx.indexDirectory(docsDir, { force: true });
      const results = idx.search('xyzzy42nonexistent');
      assert.equal(results.length, 0, 'no results for gibberish query');
    } finally {
      idx.close();
    }
  } finally {
    await removeTmp(tmp);
  }
});

test('IndexManager — search empty query returns empty array', async () => {
  const tmp = await makeTmpDir();
  try {
    const searchDir = path.join(tmp, 'search');
    const idx = new IndexManager(searchDir);
    await idx.open();
    try {
      const results = idx.search('');
      assert.deepEqual(results, []);
    } finally {
      idx.close();
    }
  } finally {
    await removeTmp(tmp);
  }
});

test('IndexManager — searchPackage indexes .aioson rules with aliases and entities', async () => {
  const tmp = await makeTmpDir();
  try {
    const searchDir = path.join(tmp, 'search');
    await writeFile(tmp, '.aioson/rules/workspace-project-table.md', [
      '---',
      'name: workspace-project-table',
      'description: Workspace in user language maps to the Project table and model in code',
      'agents: [dev, deyvin, architect]',
      'modes: [planning, executing]',
      'task_types: [database, implementation]',
      'triggers: [workspace database, project table, migrations]',
      'aliases: [workspace, project]',
      'entities: [Project, projects, Workspace]',
      'retrieval_intents: [database, feature, memory]',
      'paths: [database/migrations/**, app/Models/**]',
      'priority: 20',
      '---',
      '# Workspace Project Table',
      '',
      'When the user says workspace, inspect the Project model and projects table first.'
    ].join('\n'));
    await writeFile(tmp, '.aioson/docs/dev/database.md', '# Database Docs\n\nUse framework ORM boundaries.');

    const idx = new IndexManager(searchDir);
    await idx.open();
    try {
      const indexed = await idx.indexDirectory(tmp, { force: true });
      assert.ok(indexed.indexed >= 2, 'should index project .aioson files');

      const result = idx.searchPackage('update workspace table in database', {
        projectDir: tmp,
        agent: 'dev',
        mode: 'executing',
        task: 'alter workspace database table',
        paths: 'database/migrations/2026_01_01_update_projects_table.php',
        intent: 'database,feature',
        limit: 5
      });

      const all = [
        ...result.package.must_read,
        ...result.package.should_read,
        ...result.package.maybe
      ];
      const rule = all.find((item) => item.relPath === '.aioson/rules/workspace-project-table.md');
      assert.ok(rule, 'rule from .aioson/rules should be discoverable');
      assert.equal(rule.source_type, 'rule');
      assert.ok(result.package.must_read.some((item) => item.relPath === rule.relPath));
      assert.match(rule.reason, /aliases:|entities:|triggers:/);
    } finally {
      idx.close();
    }
  } finally {
    await removeTmp(tmp);
  }
});

test('IndexManager — agent and mode are ranking boosts, not hard filters', async () => {
  const tmp = await makeTmpDir();
  try {
    const searchDir = path.join(tmp, 'search');
    await writeFile(tmp, '.aioson/rules/architect-kanban.md', [
      '---',
      'name: architect-kanban',
      'description: Kanban board planning decisions',
      'agents: [architect]',
      'modes: [planning]',
      'triggers: [kanban board]',
      '---',
      '# Architect Kanban',
      '',
      'Kanban board columns, cards, swimlanes, and workflow decisions.'
    ].join('\n'));
    await writeFile(tmp, '.aioson/rules/dev-kanban.md', [
      '---',
      'name: dev-kanban',
      'description: Kanban board implementation rules',
      'agents: [dev]',
      'modes: [executing]',
      'triggers: [kanban board]',
      '---',
      '# Dev Kanban',
      '',
      'Kanban board columns, cards, drag and drop implementation details.'
    ].join('\n'));

    const idx = new IndexManager(searchDir);
    await idx.open();
    try {
      await idx.indexDirectory(tmp, { force: true });
      const result = idx.searchPackage('kanban board implementation', {
        projectDir: tmp,
        agent: 'dev',
        mode: 'executing',
        limit: 10
      });

      const paths = result.results.map((item) => item.relPath);
      assert.ok(paths.includes('.aioson/rules/architect-kanban.md'), 'mismatched agent/mode result should remain discoverable');
      assert.ok(paths.includes('.aioson/rules/dev-kanban.md'), 'matching agent/mode result should remain discoverable');
      assert.equal(result.results[0].relPath, '.aioson/rules/dev-kanban.md');
    } finally {
      idx.close();
    }
  } finally {
    await removeTmp(tmp);
  }
});

test('IndexManager — searchPackage dedupes template mirrors and prefers project files', async () => {
  const tmp = await makeTmpDir();
  try {
    const searchDir = path.join(tmp, 'search');
    const rule = [
      '---',
      'name: laravel-data-access',
      'description: Laravel data access belongs in framework model/service boundaries',
      'agents: [dev]',
      'modes: [executing]',
      'triggers: [Laravel query builder, controller database access]',
      '---',
      '# Laravel Data Access',
      '',
      'Do not place raw query builders in views or controller-heavy flows.'
    ].join('\n');
    await writeFile(tmp, '.aioson/rules/laravel-data-access.md', rule);
    await writeFile(tmp, 'template/.aioson/rules/laravel-data-access.md', rule);

    const idx = new IndexManager(searchDir);
    await idx.open();
    try {
      await idx.indexDirectory(tmp, { force: true });
      const result = idx.searchPackage('Laravel query builder controller database access', {
        projectDir: tmp,
        agent: 'dev',
        mode: 'executing',
        limit: 10
      });

      const paths = result.results.map((item) => item.relPath);
      assert.ok(paths.includes('.aioson/rules/laravel-data-access.md'), 'project rule should remain');
      assert.equal(paths.includes('template/.aioson/rules/laravel-data-access.md'), false, 'template mirror should be removed from package');
    } finally {
      idx.close();
    }
  } finally {
    await removeTmp(tmp);
  }
});

test('IndexManager — isolates identical relative paths across projects', async () => {
  const tmp = await makeTmpDir();
  try {
    const searchDir = path.join(tmp, 'search');
    const projectA = path.join(tmp, 'project-a');
    const projectB = path.join(tmp, 'project-b');

    await writeFile(projectA, '.aioson/rules/shared.md', [
      '---',
      'name: shared-alpha',
      'description: Alpha-only context rule',
      'agents: [dev]',
      'modes: [executing]',
      'triggers: [alphaonly]',
      '---',
      '# Shared Alpha',
      '',
      'alphaonly unique project A rule'
    ].join('\n'));
    await writeFile(projectB, '.aioson/rules/shared.md', [
      '---',
      'name: shared-beta',
      'description: Beta-only context rule',
      'agents: [dev]',
      'modes: [executing]',
      'triggers: [betaonly]',
      '---',
      '# Shared Beta',
      '',
      'betaonly unique project B rule'
    ].join('\n'));

    const idx = new IndexManager(searchDir);
    await idx.open();
    try {
      await idx.indexDirectory(projectA, { force: true });
      assert.ok(
        idx.searchPackage('alphaonly', { projectDir: projectA, agent: 'dev', mode: 'executing' }).results
          .some((item) => item.title === 'shared-alpha'),
        'project A rule should be present after indexing project A'
      );

      await idx.indexDirectory(projectB, { force: true });

      const projectAResults = idx.searchPackage('alphaonly', {
        projectDir: projectA,
        agent: 'dev',
        mode: 'executing',
        limit: 10
      }).results;
      const projectBResults = idx.searchPackage('betaonly', {
        projectDir: projectB,
        agent: 'dev',
        mode: 'executing',
        limit: 10
      }).results;

      assert.ok(
        projectAResults.some((item) => item.title === 'shared-alpha'),
        'indexing project B must not overwrite project A rel_path metadata'
      );
      assert.equal(
        projectAResults.some((item) => item.title === 'shared-beta'),
        false,
        'project A search must not leak project B rel_path collision'
      );
      assert.ok(
        projectBResults.some((item) => item.title === 'shared-beta'),
        'project B search should still find project B rule'
      );
    } finally {
      idx.close();
    }
  } finally {
    await removeTmp(tmp);
  }
});

test('IndexManager — searchPackage path routing honors glob patterns', async () => {
  const tmp = await makeTmpDir();
  try {
    const searchDir = path.join(tmp, 'search');
    await writeFile(tmp, '.aioson/rules/src-js-glob.md', [
      '---',
      'name: src-js-glob',
      'description: Source JavaScript glob routing rule',
      'agents: [dev]',
      'modes: [executing]',
      'triggers: [selector glob]',
      'paths: ["src/**/*.js"]',
      '---',
      '# Source JS Glob',
      '',
      'Use this rule for nested source JavaScript files.'
    ].join('\n'));

    const idx = new IndexManager(searchDir);
    await idx.open();
    try {
      await idx.indexDirectory(tmp, { force: true });
      const result = idx.searchPackage('selector glob', {
        projectDir: tmp,
        agent: 'dev',
        mode: 'executing',
        paths: 'src/lib/context/search.js',
        limit: 10
      });
      const rule = result.results.find((item) => item.relPath === '.aioson/rules/src-js-glob.md');

      assert.ok(rule, 'glob-scoped rule should be returned');
      assert.match(rule.reason, /paths:src\/lib\/context\/search\.js~src\/\*\*\/\*\.js/);
    } finally {
      idx.close();
    }
  } finally {
    await removeTmp(tmp);
  }
});

test('IndexManager — indexDirectory skips and purges nested .aioson agent files', async () => {
  const tmp = await makeTmpDir();
  try {
    const searchDir = path.join(tmp, 'search');
    await writeFile(tmp, 'template/.aioson/agents/setup.md', '# Setup Agent\n\nLaravel setup activation should not be task context.');
    await writeFile(tmp, '.aioson/rules/laravel-language.md', [
      '---',
      'name: laravel-language',
      'agents: [dev]',
      'modes: [executing]',
      'triggers: [Laravel code English]',
      '---',
      '# Laravel Language',
      '',
      'Write Laravel code identifiers in English.'
    ].join('\n'));

    const idx = new IndexManager(searchDir);
    await idx.open();
    try {
      idx._db.prepare('INSERT INTO docs (project_dir, rel_path, title, content) VALUES (?, ?, ?, ?)').run(
        path.resolve(tmp),
        'template/.aioson/agents/setup.md',
        'Setup Agent',
        'Laravel setup activation stale index entry'
      );
      idx._db.prepare(`
        INSERT INTO docs_meta (
          project_dir, rel_path, indexed_at, file_mtime, size, source_type,
          description, agents, modes, task_types, triggers, aliases, entities,
          paths, retrieval_intents, load_tier, priority
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        path.resolve(tmp),
        'template/.aioson/agents/setup.md',
        new Date().toISOString(),
        '1',
        1,
        'file',
        '',
        '',
        '',
        '',
        'Laravel setup',
        '',
        '',
        '',
        '',
        'reference',
        0
      );

      await idx.indexDirectory(tmp, { force: true });
      const result = idx.searchPackage('Laravel setup code English', {
        projectDir: tmp,
        agent: 'dev',
        mode: 'executing',
        limit: 10
      });
      const paths = result.results.map((item) => item.relPath);
      assert.equal(paths.includes('template/.aioson/agents/setup.md'), false, 'agent files must not survive purge');
      assert.ok(paths.includes('.aioson/rules/laravel-language.md'), 'normal project rules should remain searchable');
    } finally {
      idx.close();
    }
  } finally {
    await removeTmp(tmp);
  }
});

test('context:select routes aliases, entities and retrieval_intents as final eligible signals', async () => {
  const tmp = await makeTmpDir();
  try {
    await writeFile(tmp, '.aioson/context/project.context.md', '---\nframework: Laravel\n---\n# Project');
    await writeFile(tmp, '.aioson/context/project-pulse.md', '---\nactive_feature: (none)\n---\n# Pulse');
    await writeFile(tmp, '.aioson/rules/workspace-project-table.md', [
      '---',
      'name: workspace-project-table',
      'description: Workspace maps to Project in code',
      'agents: [dev]',
      'modes: [executing]',
      'aliases: [workspace]',
      'entities: [Project, projects]',
      'retrieval_intents: [database]',
      'load_tier: trigger',
      '---',
      '# Workspace Project Table'
    ].join('\n'));

    const selected = await selectContext(tmp, {
      agent: 'dev',
      mode: 'executing',
      task: 'update workspace database behavior',
      paths: 'app/Models/Project.php'
    });

    assert.ok(
      selected.selected.some((item) => item.path === '.aioson/rules/workspace-project-table.md'),
      'context:select should select eligible rules through alias/entity/intent metadata'
    );
  } finally {
    await removeTmp(tmp);
  }
});

test('runContextSearch — auto-indexes path and returns load buckets in JSON mode', async () => {
  const tmp = await makeTmpDir();
  try {
    await writeFile(tmp, '.aioson/rules/source-code-language.md', [
      '---',
      'name: source-code-language',
      'description: Always write source code identifiers and comments in English',
      'agents: [dev, deyvin]',
      'modes: [executing]',
      'triggers: [source code, english, identifiers]',
      'retrieval_intents: [implementation]',
      '---',
      '# Source Code Language',
      '',
      'Create code in English unless the project already proves a different standard.'
    ].join('\n'));

    const log = logger();
    const result = await runContextSearch({
      args: [tmp],
      options: {
        query: 'write implementation source code in English',
        agent: 'dev',
        mode: 'executing',
        intent: 'implementation',
        json: true,
        force: true
      },
      logger: log
    });

    assert.equal(result.ok, true);
    assert.ok(result.index.indexed >= 1, 'search should auto-index by default');
    assert.ok(Array.isArray(result.package.must_read));
    assert.ok(
      result.results.some((item) => item.relPath === '.aioson/rules/source-code-language.md'),
      'JSON results should include discovered rule'
    );
  } finally {
    await removeTmp(tmp);
  }
});

test('resolveSearchTarget — supports path plus --query and positional query', () => {
  const tmp = path.resolve(os.tmpdir());
  assert.deepEqual(
    resolveSearchTarget([tmp], { query: 'database rule' }),
    { cwd: tmp, query: 'database rule' }
  );

  const positional = resolveSearchTarget(['database', 'rule'], {});
  assert.equal(positional.query, 'database rule');
});

test('CLI registers context:index as a JSON-capable index alias', async () => {
  const cli = await fs.readFile(path.join(__dirname, '..', 'src', 'cli.js'), 'utf8');
  assert.ok(cli.includes("'context:index'"), 'context:index must be registered');
  assert.ok(cli.includes("'context-index'"), 'context-index must be registered');
  assert.match(cli, /command === 'context:index'/);
});

test('IndexManager — invalidateStale removes old entries', async () => {
  const tmp = await makeTmpDir();
  try {
    const searchDir = path.join(tmp, 'search');
    const docsDir = path.join(tmp, 'docs');
    await fs.mkdir(docsDir);
    await fs.writeFile(path.join(docsDir, 'old.md'), '# Old doc', 'utf8');

    const idx = new IndexManager(searchDir);
    await idx.open();
    try {
      await idx.indexDirectory(docsDir, { force: true });
      const before = idx.stats();
      assert.ok(before.totalDocs >= 1);

      // Invalidate with maxAge=0 (everything is stale)
      const removed = idx.invalidateStale(0);
      assert.ok(removed.removed >= 1, 'should remove stale entries');

      const after = idx.stats();
      assert.equal(after.totalDocs, 0, 'index should be empty after full invalidation');
    } finally {
      idx.close();
    }
  } finally {
    await removeTmp(tmp);
  }
});

test('IndexManager — two concurrent instances (WAL mode)', async () => {
  const tmp = await makeTmpDir();
  try {
    const searchDir = path.join(tmp, 'search');
    const docsDir = path.join(tmp, 'docs');
    await fs.mkdir(docsDir);
    await fs.writeFile(path.join(docsDir, 'concurrent.md'), '# Concurrent Test\n\nconcurrency check', 'utf8');

    const idx1 = new IndexManager(searchDir);
    const idx2 = new IndexManager(searchDir);

    await idx1.open();
    await idx2.open();

    try {
      // Both index the same dir (second should skip due to already-indexed)
      const [r1, r2] = await Promise.all([
        idx1.indexDirectory(docsDir, { force: true }),
        idx2.indexDirectory(docsDir)
      ]);

      // At least one of them succeeded
      const totalIndexed = r1.indexed + r2.indexed;
      assert.ok(totalIndexed >= 1, 'at least one file should be indexed');
    } finally {
      idx1.close();
      idx2.close();
    }
  } finally {
    await removeTmp(tmp);
  }
});

test('sanitizeFtsQuery — removes FTS5 special chars', () => {
  const result = sanitizeFtsQuery('hello "world" (test)*');
  assert.ok(!result.includes('"'), 'should remove double quotes');
  assert.ok(!result.includes('('), 'should remove parens');
  assert.ok(!result.includes(')'), 'should remove parens');
  assert.ok(!result.includes('*'), 'should remove asterisk');
  assert.ok(result.includes('hello'), 'should preserve normal words');
});

test('IndexManager — skips already-indexed files (no force)', async () => {
  const tmp = await makeTmpDir();
  try {
    const searchDir = path.join(tmp, 'search');
    const docsDir = path.join(tmp, 'docs');
    await fs.mkdir(docsDir);
    await fs.writeFile(path.join(docsDir, 'test.md'), '# Test', 'utf8');

    const idx = new IndexManager(searchDir);
    await idx.open();
    try {
      const first = await idx.indexDirectory(docsDir, { force: true });
      assert.equal(first.indexed, 1, 'first pass indexes 1 file');

      const second = await idx.indexDirectory(docsDir);
      assert.equal(second.indexed, 0, 'second pass skips already-indexed file');
      assert.equal(second.skipped, 1, 'second pass reports 1 skipped');
    } finally {
      idx.close();
    }
  } finally {
    await removeTmp(tmp);
  }
});

test('IndexManager — indexDirectory purges deleted files from the index', async () => {
  const tmp = await makeTmpDir();
  try {
    const searchDir = path.join(tmp, 'search');
    const docsDir = path.join(tmp, 'docs');
    await fs.mkdir(docsDir);

    await fs.writeFile(path.join(docsDir, 'keep.md'), '# Keep Me\n\nPersistent document about caching.', 'utf8');
    await fs.writeFile(path.join(docsDir, 'delete.md'), '# Delete Me\n\nTemporary document about migrations.', 'utf8');

    const idx = new IndexManager(searchDir);
    await idx.open();
    try {
      await idx.indexDirectory(docsDir, { force: true });

      let pkg = idx.searchPackage('migrations', { projectDir: docsDir, limit: 10 });
      assert.ok(
        pkg.results.some((r) => r.relPath.includes('delete')),
        'delete.md should be searchable before deletion'
      );

      await fs.unlink(path.join(docsDir, 'delete.md'));

      await idx.indexDirectory(docsDir);

      pkg = idx.searchPackage('migrations', { projectDir: docsDir, limit: 10 });
      assert.equal(
        pkg.results.some((r) => r.relPath.includes('delete')),
        false,
        'deleted file must not survive in the index'
      );
      assert.ok(
        pkg.results.some((r) => r.relPath.includes('keep')) || pkg.results.length === 0,
        'remaining files should still be searchable or results empty'
      );

      const stats = idx.stats();
      assert.equal(stats.totalDocs, 1, 'only the surviving file should remain in the index');
    } finally {
      idx.close();
    }
  } finally {
    await removeTmp(tmp);
  }
});

test('recall index keys fold case on Windows so casing drift does not split partitions (P3)', async () => {
  const tmp = await makeTmpDir();
  const idx = new IndexManager(path.join(tmp, 'search'));
  await idx.open();
  try {
    const projectDir = path.join(tmp, 'proj');
    await writeFile(projectDir, 'doc.md', '# Telemetry\nThe telemetry gateway emits runtime events.');
    await idx.indexDirectory(projectDir, { extensions: ['.md'] });

    const sameCase = idx.searchPackage('telemetry gateway', { projectDir, limit: 5 });
    assert.ok(sameCase.results.length >= 1, 'same-case search finds the indexed doc');

    const altCase = idx.searchPackage('telemetry gateway', { projectDir: projectDir.toUpperCase(), limit: 5 });
    if (process.platform === 'win32') {
      assert.ok(altCase.results.length >= 1, 'win32: a differently-cased path resolves to the same partition');
    } else {
      assert.equal(altCase.results.length, 0, 'posix: paths are case-sensitive, so a different case misses');
    }
  } finally {
    idx.close();
    await removeTmp(tmp);
  }
});

test('openDb recreates the index when the sqlite file is corrupted (P4)', async () => {
  const tmp = await makeTmpDir();
  const searchDir = path.join(tmp, 'search');
  await fs.mkdir(searchDir, { recursive: true });
  // A truncated WAL / AV-quarantined / disk-full file is not a valid database.
  await fs.writeFile(path.join(searchDir, 'context-search.sqlite'), 'this is not a sqlite database', 'utf8');
  try {
    const idx = new IndexManager(searchDir);
    await idx.open(); // must recover, not throw
    const projectDir = path.join(tmp, 'proj');
    await writeFile(projectDir, 'a.md', '# Alpha\nalpha beta gamma recovery works.');
    const result = await idx.indexDirectory(projectDir, { extensions: ['.md'] });
    assert.ok(result.indexed >= 1, 'indexing works after corruption recovery');
    const pkg = idx.searchPackage('recovery', { projectDir, limit: 5 });
    assert.ok(pkg.results.length >= 1, 'the rebuilt index is queryable');
    idx.close();
  } finally {
    await removeTmp(tmp);
  }
});

test('indexDirectory default policy indexes markdown only — no .json/.txt thrash', async () => {
  const tmp = await makeTmpDir();
  const idx = new IndexManager(path.join(tmp, 'search'));
  await idx.open();
  try {
    const projectDir = path.join(tmp, 'proj');
    await writeFile(projectDir, 'doc.md', '# Doc\nthe telemetry gateway emits events');
    await writeFile(projectDir, 'package-lock.json', JSON.stringify({ telemetry: 'gateway noise' }));
    await writeFile(projectDir, 'notes.txt', 'telemetry gateway noise');

    const result = await idx.indexDirectory(projectDir); // default extensions
    assert.equal(result.indexed, 1, 'only the markdown file is indexed by default');

    const pkg = idx.searchPackage('telemetry gateway', { projectDir, limit: 10 });
    assert.ok(pkg.results.length >= 1, 'the markdown doc is recalled');
    assert.equal(
      pkg.results.every((r) => r.relPath.endsWith('.md')),
      true,
      'no .json/.txt leaks into the shared recall index'
    );
  } finally {
    idx.close();
    await removeTmp(tmp);
  }
});
