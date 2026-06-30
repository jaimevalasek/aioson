'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const {
  resolveRuntimePaths,
  openRuntimeDb,
  runtimeStoreExists,
  startTask,
  updateTask,
  startRun,
  updateRun,
  attachArtifact,
  upsertContentItem,
  getStatusSnapshot,
  logAgentEvent,
  appendRunEvent,
  readAgentSession,
  clearAgentSession
} = require('../runtime-store');
const { runAutoDelivery } = require('../delivery-runner');
const { writeHandoff, buildRuntimeLogHandoff } = require('../session-handoff');
const { backupAiosonDocs, isDocCreatingAgent } = require('../backup-local');
const { runMemoryReflectPrepare } = require('./memory-reflect-prepare');
const { runChainHookOnAgentDone } = require('../neural-chain-agent-ingest');

const ALLOWED_LAYOUTS = new Set(['document', 'tabs', 'accordion', 'stack', 'mixed']);
const DEFAULT_TEXT_FIELDS = ['content', 'text', 'body', 'lyrics', 'markdown'];

function resolveTargetDir(args) {
  return path.resolve(process.cwd(), args[0] || '.');
}

function requireOption(options, key, t) {
  const value = options[key];
  if (value === undefined || value === null || String(value).trim() === '') {
    throw new Error(t('runtime.option_required', { option: `--${key}` }));
  }
  return String(value).trim();
}

function normalizeAgentHandle(value) {
  const text = String(value || '').trim();
  if (!text) return '';
  return text.startsWith('@') ? text : `@${text}`;
}

function makeDirectSessionKey(agentName) {
  return `direct-session:${Date.now()}:${String(agentName || '').replace(/^@/, '')}`;
}

function parseWatchSeconds(value) {
  if (value === undefined || value === null || value === false) return null;
  if (value === true || value === '') return 2;

  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return 2;
  return parsed;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function collectRuntimeSessionSnapshot(db, runtimeDir, agentName, options = {}) {
  const normalizedAgent = normalizeAgentHandle(agentName);
  const eventLimit = Math.max(1, Math.min(Number(options.limit) || 8, 20));
  const session = await readAgentSession(runtimeDir, normalizedAgent);
  const activeSession = session && !session.finished ? session : null;

  let run = null;
  if (activeSession && activeSession.runKey) {
    run = db.prepare(`
      SELECT
        run_key, task_key, agent_name, agent_kind, squad_slug, session_key, source,
        title, status, summary, output_path, started_at, updated_at, finished_at
      FROM agent_runs
      WHERE run_key = ?
      LIMIT 1
    `).get(activeSession.runKey);
  }

  if (!run) {
    run = db.prepare(`
      SELECT
        run_key, task_key, agent_name, agent_kind, squad_slug, session_key, source,
        title, status, summary, output_path, started_at, updated_at, finished_at
      FROM agent_runs
      WHERE agent_name = ?
      ORDER BY updated_at DESC, started_at DESC
      LIMIT 1
    `).get(normalizedAgent);
  }

  const task = run && run.task_key
    ? db.prepare(`
        SELECT
          task_key, squad_slug, session_key, title, goal, status, created_by, created_at, updated_at, finished_at
        FROM tasks
        WHERE task_key = ?
        LIMIT 1
      `).get(run.task_key)
    : null;

  const recentEvents = run
    ? db.prepare(`
        SELECT event_type, phase, status, message, created_at
        FROM execution_events
        WHERE run_key = ?
        ORDER BY created_at DESC, id DESC
        LIMIT ?
      `).all(run.run_key, eventLimit).reverse()
    : [];

  const open = Boolean(activeSession && run && (run.status === 'running' || run.status === 'queued'));
  const state = open ? 'open' : (run ? 'closed' : 'idle');

  return {
    agent: normalizedAgent,
    state,
    open,
    sessionKey: activeSession?.sessionKey || run?.session_key || task?.session_key || null,
    startedAt: activeSession?.startedAt || run?.started_at || task?.created_at || null,
    updatedAt: run?.updated_at || task?.updated_at || null,
    session: activeSession,
    run,
    task,
    recentEvents
  };
}

async function getRuntimeSessionSnapshot(targetDir, agentName, t, options = {}) {
  const { dbPath, runtimeDir } = resolveRuntimePaths(targetDir);

  if (!(await runtimeStoreExists(targetDir))) {
    throw new Error(t('runtime.store_missing', { path: dbPath }));
  }

  const { db } = await openRuntimeDb(targetDir, { mustExist: true });
  try {
    const snapshot = await collectRuntimeSessionSnapshot(db, runtimeDir, agentName, options);
    return {
      ok: true,
      targetDir,
      dbPath,
      ...snapshot
    };
  } finally {
    db.close();
  }
}

function printRuntimeSessionSnapshot(snapshot, logger) {
  logger.log(`Direct session: ${snapshot.agent}`);
  logger.log(`State: ${snapshot.state}`);

  if (snapshot.sessionKey) {
    logger.log(`Session: ${snapshot.sessionKey}`);
  }

  if (snapshot.task) {
    logger.log(`Task: ${snapshot.task.task_key} | status: ${snapshot.task.status} | work: ${snapshot.task.title || '—'}`);
  }

  if (snapshot.run) {
    logger.log(`Run: ${snapshot.run.run_key} | status: ${snapshot.run.status} | work: ${snapshot.run.title || snapshot.run.summary || '—'}`);
  }

  if (snapshot.startedAt) {
    logger.log(`Started: ${snapshot.startedAt}`);
  }

  if (snapshot.updatedAt) {
    logger.log(`Updated: ${snapshot.updatedAt}`);
  }

  if (snapshot.recentEvents.length === 0) {
    logger.log('Recent events: none');
    return;
  }

  logger.log('Recent events:');
  for (const event of snapshot.recentEvents) {
    logger.log(`- ${event.created_at} | ${event.event_type} | ${event.message || '—'}`);
  }
}

async function readJsonIfExists(filePath) {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function maybeResolveContentPaths(targetDir, outputPath) {
  if (!outputPath) return null;

  const relative = String(outputPath).replace(/\\/g, '/').trim();
  if (!/\/index\.html?$/i.test(relative)) return null;

  const absoluteHtmlPath = path.isAbsolute(relative) ? relative : path.join(targetDir, relative);
  const absoluteJsonPath = path.join(path.dirname(absoluteHtmlPath), 'content.json');

  return {
    relativeHtmlPath: path.isAbsolute(relative) ? path.relative(targetDir, absoluteHtmlPath).replace(/\\/g, '/') : relative,
    relativeJsonPath: path.relative(targetDir, absoluteJsonPath).replace(/\\/g, '/'),
    absoluteJsonPath
  };
}

function asObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
}

function asString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeStringArray(value) {
  const values = Array.isArray(value)
    ? value
    : typeof value === 'string'
      ? value.split(',')
      : [];

  return Array.from(
    new Set(
      values
        .map((entry) => String(entry || '').trim())
        .filter(Boolean)
    )
  );
}

function parseJsonArray(value) {
  if (!value) return [];
  try {
    return normalizeStringArray(JSON.parse(value));
  } catch {
    return [];
  }
}

function titleize(value) {
  return String(value || '')
    .replace(/\.[^.]+$/, '')
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function makeContentKey(value) {
  return String(value || 'content')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || `content-${Date.now()}`;
}

function truncateText(value, max = 12000) {
  const text = String(value || '').trim();
  if (text.length <= max) return text;
  return `${text.slice(0, max).trim()}\n\n[...]`;
}

function stripHtml(html) {
  return String(html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function firstNonEmptyText(record, keys) {
  for (const key of keys) {
    const value = asString(record[key]);
    if (value) return value;
  }
  return '';
}

function normalizeSimpleContentBlocks(content) {
  const text = firstNonEmptyText(content, DEFAULT_TEXT_FIELDS);
  if (text) {
    return [
      {
        type: 'rich-text',
        content: truncateText(text)
      }
    ];
  }

  const html = asString(content.html);
  if (html) {
    const preview = stripHtml(html);
    return [
      {
        type: 'callout',
        title: 'Conteudo HTML indexado automaticamente',
        content:
          'Este item foi convertido para o indice de conteudos a partir de um arquivo HTML gerado pelo squad.'
      },
      {
        type: 'rich-text',
        content: truncateText(preview || 'Nao foi possivel extrair preview textual do HTML.')
      }
    ];
  }

  return [];
}

function isValidBlock(value) {
  const block = asObject(value);
  if (!block) return false;

  const type = asString(block.type);
  if (!type) return false;

  if (type === 'tabs') {
    const items = asArray(block.items);
    return items.every((item) => {
      const tab = asObject(item);
      if (!tab || !asString(tab.label)) return false;
      return asArray(tab.blocks).every(isValidBlock);
    });
  }

  if (type === 'accordion') {
    const items = asArray(block.items);
    return items.every((item) => {
      const entry = asObject(item);
      if (!entry || !asString(entry.title)) return false;
      const content = asString(entry.content);
      const nestedBlocks = asArray(entry.blocks);
      if (!content && nestedBlocks.length === 0) return false;
      return nestedBlocks.every(isValidBlock);
    });
  }

  if (type === 'section') {
    return asArray(block.blocks).every(isValidBlock);
  }

  return true;
}

function validateContentPayload(payload) {
  const content = asObject(payload);
  if (!content) {
    return { ok: false, reason: 'content.json must be an object' };
  }

  const contentKey = asString(content.contentKey || content.content_key);
  if (!contentKey) {
    return { ok: false, reason: 'content.json is missing contentKey' };
  }

  const title = asString(content.title);
  if (!title) {
    return { ok: false, reason: 'content.json is missing title' };
  }

  const contentType = asString(content.contentType || content.content_type);
  if (!contentType) {
    return { ok: false, reason: 'content.json is missing contentType' };
  }

  const layoutType = asString(content.layoutType || content.layout_type || 'document');
  if (!ALLOWED_LAYOUTS.has(layoutType)) {
    return { ok: false, reason: `content.json has unsupported layoutType: ${layoutType}` };
  }

  const blocks = asArray(content.blocks);
  const normalizedBlocks = blocks.length > 0 ? blocks : normalizeSimpleContentBlocks(content);

  if (normalizedBlocks.length === 0) {
    return { ok: false, reason: 'content.json must include blocks or a simple text field' };
  }

  if (!normalizedBlocks.every(isValidBlock)) {
    return { ok: false, reason: 'content.json contains invalid blocks' };
  }

  return {
    ok: true,
    normalized: {
      ...content,
      contentKey,
      title,
      contentType,
      layoutType,
      blocks: normalizedBlocks,
      blueprint: asString(content.blueprint || content.blueprintSlug || content.blueprint_slug),
      usedSkills: normalizeStringArray(
        content.usedSkills ||
          content.used_skills ||
          content.meta?.usedSkills ||
          content.meta?.used_skills ||
          []
      )
    }
  };
}

async function listFilesRecursive(rootDir) {
  const result = [];
  const queue = [rootDir];

  while (queue.length > 0) {
    const currentDir = queue.shift();
    const entries = await fs.readdir(currentDir, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        queue.push(fullPath);
        continue;
      }
      if (entry.isFile()) {
        result.push(fullPath);
      }
    }
  }

  return result;
}

function inferSquadSlugFromOutputPath(targetDir, absolutePath) {
  const outputRoot = path.join(targetDir, 'output');
  const relativePath = path.relative(outputRoot, absolutePath).replace(/\\/g, '/');
  const [slug] = relativePath.split('/');
  return slug || '';
}

function relativeContentKeyFromOutput(targetDir, absolutePath, squadSlug) {
  const squadRoot = path.join(targetDir, 'output', squadSlug);
  const relativeToSquad = path.relative(squadRoot, absolutePath).replace(/\\/g, '/');
  return makeContentKey(relativeToSquad.replace(/\.[^.]+$/, ''));
}

function synthesizeContentPayload({ targetDir, absolutePath, squadSlug, rawContent }) {
  const ext = path.extname(absolutePath).toLowerCase();
  const relativePath = path.relative(targetDir, absolutePath).replace(/\\/g, '/');
  const title = titleize(path.basename(absolutePath));
  const contentKey = relativeContentKeyFromOutput(targetDir, absolutePath, squadSlug);

  if (ext === '.md') {
    return {
      contentKey,
      title,
      contentType: 'text-content',
      layoutType: 'document',
      summary: `Conteudo indexado automaticamente de ${relativePath}.`,
      blocks: [
        {
          type: 'rich-text',
          content: truncateText(rawContent)
        }
      ],
      meta: {
        autoIndexed: true,
        sourceFormat: 'markdown',
        sourcePath: relativePath
      }
    };
  }

  if (ext === '.html' || ext === '.htm') {
    const preview = stripHtml(rawContent);
    return {
      contentKey,
      title,
      contentType: 'html-content',
      layoutType: 'document',
      summary: `Conteudo HTML indexado automaticamente de ${relativePath}.`,
      blocks: [
        {
          type: 'callout',
          title: 'Preview indexado automaticamente',
          content: 'O arquivo HTML original continua no output do squad. Este viewer mostra uma versao textual para indexacao e sync.'
        },
        {
          type: 'rich-text',
          content: truncateText(preview || 'Nao foi possivel gerar preview textual deste HTML.')
        }
      ],
      meta: {
        autoIndexed: true,
        sourceFormat: 'html',
        sourcePath: relativePath
      }
    };
  }

  return null;
}

async function resolveIngestCandidates(targetDir, options = {}) {
  const outputRoot = path.join(targetDir, 'output');
  const scopedRoot = options.squad ? path.join(outputRoot, String(options.squad).trim()) : outputRoot;
  const rootExists = await fs.stat(scopedRoot).then((stat) => stat.isDirectory()).catch(() => false);

  if (!rootExists) {
    return [];
  }

  const allFiles = await listFilesRecursive(scopedRoot);
  const contentJsonDirs = new Set(
    allFiles
      .filter((filePath) => path.basename(filePath).toLowerCase() === 'content.json')
      .map((filePath) => path.dirname(filePath))
  );

  return allFiles.filter((filePath) => {
    const ext = path.extname(filePath).toLowerCase();
    const base = path.basename(filePath).toLowerCase();

    if (base === 'content.json') return true;
    if (ext !== '.md' && ext !== '.html' && ext !== '.htm') return false;
    if (contentJsonDirs.has(path.dirname(filePath))) return false;

    return true;
  });
}

async function ingestContentCandidate(db, targetDir, absolutePath, options = {}) {
  const baseName = path.basename(absolutePath).toLowerCase();
  const relativePath = path.relative(targetDir, absolutePath).replace(/\\/g, '/');
  const squadSlug = options.squad ? String(options.squad).trim() : inferSquadSlugFromOutputPath(targetDir, absolutePath);

  if (!squadSlug) {
    return { indexed: false, reason: 'missing_squad' };
  }

  if (baseName === 'content.json') {
    const payload = await readJsonIfExists(absolutePath);
    const validation = validateContentPayload(payload);
    if (!validation.ok) {
      return { indexed: false, reason: validation.reason };
    }

    const content = validation.normalized;
    const siblingIndex = path.join(path.dirname(absolutePath), 'index.html');
    const siblingHtmlExists = await fs.stat(siblingIndex).then((stat) => stat.isFile()).catch(() => false);

    upsertContentItem(db, {
      contentKey: content.contentKey,
      taskKey: options.task || content.taskKey || content.task_key || null,
      runKey: options.run || content.runKey || content.run_key || null,
      squadSlug,
      sessionKey: options.session || content.sessionKey || content.session_key || null,
      title: content.title,
      contentType: content.contentType,
      layoutType: content.layoutType,
      status: content.status || 'completed',
      summary: content.summary || `Conteudo indexado automaticamente de ${relativePath}.`,
      blueprintSlug: content.blueprint || null,
      usedSkills: normalizeStringArray(options.usedSkills || content.usedSkills),
      payload: content,
      jsonPath: relativePath,
      htmlPath: siblingHtmlExists
        ? path.relative(targetDir, siblingIndex).replace(/\\/g, '/')
        : null,
      createdByAgent: options.agent || content.createdByAgent || content.created_by_agent || null
    });

    // Fire auto-delivery if configured (non-blocking)
    runAutoDelivery(db, {
      projectDir: targetDir,
      squadSlug,
      contentKey: content.contentKey,
      contentPayload: content
    }).catch(() => {}); // Swallow errors — delivery failure should not break ingestion

    return { indexed: true, kind: 'content-json', contentKey: content.contentKey };
  }

  const rawContent = await fs.readFile(absolutePath, 'utf8').catch(() => '');
  if (!rawContent.trim()) {
    return { indexed: false, reason: 'empty_file' };
  }

  const payload = synthesizeContentPayload({
    targetDir,
    absolutePath,
    squadSlug,
    rawContent
  });

  if (!payload) {
    return { indexed: false, reason: 'unsupported_file' };
  }

  upsertContentItem(db, {
    contentKey: payload.contentKey,
    taskKey: options.task || null,
    runKey: options.run || null,
    squadSlug,
    sessionKey: options.session || null,
    title: payload.title,
    contentType: payload.contentType,
    layoutType: payload.layoutType,
    status: 'completed',
    summary: payload.summary,
    blueprintSlug: payload.blueprint || null,
    usedSkills: normalizeStringArray(options.usedSkills),
    payload,
    jsonPath: null,
    htmlPath: path.extname(absolutePath).toLowerCase().startsWith('.ht')
      ? relativePath
      : null,
    createdByAgent: options.agent || null
  });

  // Fire auto-delivery if configured (non-blocking)
  runAutoDelivery(db, {
    projectDir: targetDir,
    squadSlug,
    contentKey: payload.contentKey,
    contentPayload: payload
  }).catch(() => {}); // Swallow errors — delivery failure should not break ingestion

  return { indexed: true, kind: path.extname(absolutePath).toLowerCase(), contentKey: payload.contentKey };
}

async function withRuntimeDb(targetDir, t) {
  const handle = await openRuntimeDb(targetDir, { mustExist: true });
  if (!handle) {
    throw new Error(t('runtime.store_missing', { path: resolveRuntimePaths(targetDir).dbPath }));
  }
  return handle;
}

async function runRuntimeInit({ args, options = {}, logger, t }) {
  const targetDir = resolveTargetDir(args);
  const { db, dbPath, runtimeDir } = await openRuntimeDb(targetDir);
  db.close();

  if (!options.json) {
    logger.log(t('runtime.init_ok', { path: dbPath }));
  }

  return { ok: true, targetDir, runtimeDir, dbPath };
}

async function runRuntimeIngest({ args, options = {}, logger, t }) {
  const targetDir = resolveTargetDir(args);
  const { db, dbPath } = await withRuntimeDb(targetDir, t);
  const ingestOptions = {
    ...options,
    usedSkills: normalizeStringArray(options['used-skills'] || options.usedSkills)
  };

  try {
    const candidates = await resolveIngestCandidates(targetDir, ingestOptions);
    let indexed = 0;
    let skipped = 0;
    const reasons = [];

    for (const candidate of candidates) {
      const result = await ingestContentCandidate(db, targetDir, candidate, ingestOptions);
      if (result.indexed) {
        indexed += 1;
        continue;
      }
      skipped += 1;
      if (result.reason) {
        reasons.push(`${path.relative(targetDir, candidate).replace(/\\/g, '/')}: ${result.reason}`);
      }
    }

    if (!options.json) {
      logger.log(
        t('runtime.ingest_ok', {
          indexed,
          skipped,
          path: dbPath
        })
      );
      if (reasons.length > 0) {
        for (const reason of reasons.slice(0, 10)) {
          logger.log(`- ${reason}`);
        }
      }
    }

    return {
      ok: true,
      targetDir,
      dbPath,
      indexed,
      skipped,
      reasons
    };
  } finally {
    db.close();
  }
}

async function runRuntimeTaskStart({ args, options = {}, logger, t }) {
  const targetDir = resolveTargetDir(args);
  const { db, dbPath } = await withRuntimeDb(targetDir, t);

  try {
    const taskKey = startTask(db, {
      taskKey: options.task,
      squadSlug: options.squad,
      sessionKey: options.session,
      title: requireOption(options, 'title', t),
      goal: options.goal,
      createdBy: options.by
    });

    if (!options.json) {
      logger.log(t('runtime.task_start_ok', { task: taskKey, path: dbPath }));
    }

    return {
      ok: true,
      targetDir,
      dbPath,
      taskKey,
      status: 'running'
    };
  } finally {
    db.close();
  }
}

async function runRuntimeStart({ args, options = {}, logger, t }) {
  const targetDir = resolveTargetDir(args);
  const { db, dbPath } = await withRuntimeDb(targetDir, t);

  try {
    const runKey = startRun(db, {
      runKey: options.run,
      taskKey: options.task,
      agentName: requireOption(options, 'agent', t),
      agentKind: options.kind,
      squadSlug: options.squad,
      sessionKey: options.session,
      title: options.title,
      message: options.message,
      summary: options.summary,
      usedSkills: normalizeStringArray(options['used-skills'] || options.usedSkills),
      outputPath: options.output
    });

    const snapshot = getStatusSnapshot(db);
    if (!options.json) {
      logger.log(t('runtime.start_ok', { run: runKey, path: dbPath }));
    }

    return {
      ok: true,
      targetDir,
      dbPath,
      runKey,
      status: 'running',
      activeCount: snapshot.activeRuns.length
    };
  } finally {
    db.close();
  }
}

async function runRuntimeUpdate({ args, options = {}, logger, t }) {
  const targetDir = resolveTargetDir(args);
  const { db, dbPath } = await withRuntimeDb(targetDir, t);

  try {
    const runKey = requireOption(options, 'run', t);
    const status = updateRun(db, {
      runKey,
      status: 'running',
      taskKey: options.task,
      eventType: 'progress',
      message: options.message,
      summary: options.summary,
      usedSkills: normalizeStringArray(options['used-skills'] || options.usedSkills),
      outputPath: options.output
    });

    if (!options.json) {
      logger.log(t('runtime.update_ok', { run: runKey, path: dbPath }));
    }

    return {
      ok: true,
      targetDir,
      dbPath,
      runKey,
      status
    };
  } finally {
    db.close();
  }
}

async function runRuntimeFinish({ args, options = {}, logger, t }) {
  const targetDir = resolveTargetDir(args);
  const { db, dbPath } = await withRuntimeDb(targetDir, t);

  try {
    const runKey = requireOption(options, 'run', t);
    const status = updateRun(db, {
      runKey,
      status: 'completed',
      taskKey: options.task,
      eventType: 'finish',
      message: options.message || options.summary || 'Run completed',
      summary: options.summary,
      usedSkills: normalizeStringArray(options['used-skills'] || options.usedSkills),
      outputPath: options.output
    });

    const finishedRun = db
      .prepare('SELECT run_key, task_key, squad_slug, session_key, agent_name, output_path, used_skills_json FROM agent_runs WHERE run_key = ?')
      .get(runKey);
    if (finishedRun && finishedRun.output_path) {
      attachArtifact(db, {
        taskKey: finishedRun.task_key,
        runKey: finishedRun.run_key,
        squadSlug: finishedRun.squad_slug,
        agentName: finishedRun.agent_name,
        filePath: finishedRun.output_path,
        title: options.title || options.summary || 'Artifact generated'
      });

      const absoluteOutputPath = path.isAbsolute(finishedRun.output_path)
        ? finishedRun.output_path
        : path.join(targetDir, finishedRun.output_path);
      const contentPaths = maybeResolveContentPaths(targetDir, finishedRun.output_path);
      const preferredCandidate = contentPaths
        ? (await fs
            .stat(contentPaths.absoluteJsonPath)
            .then((stat) => (stat.isFile() ? contentPaths.absoluteJsonPath : null))
            .catch(() => null))
        : absoluteOutputPath;

      if (preferredCandidate) {
        const ingestion = await ingestContentCandidate(db, targetDir, preferredCandidate, {
          task: finishedRun.task_key,
          run: finishedRun.run_key,
          squad: finishedRun.squad_slug,
          session: options.session || finishedRun.session_key,
          agent: finishedRun.agent_name,
          usedSkills: parseJsonArray(finishedRun.used_skills_json)
        });
        if (!ingestion.indexed && !options.json && logger?.log) {
          logger.log(`[runtime] skipped content indexing for ${finishedRun.run_key}: ${ingestion.reason}`);
        }
      }
    }

    if (!options.json) {
      logger.log(t('runtime.finish_ok', { run: runKey, path: dbPath }));
    }

    return {
      ok: true,
      targetDir,
      dbPath,
      runKey,
      status
    };
  } finally {
    db.close();
  }
}

async function runRuntimeTaskFinish({ args, options = {}, logger, t }) {
  const targetDir = resolveTargetDir(args);
  const { db, dbPath } = await withRuntimeDb(targetDir, t);

  try {
    const taskKey = requireOption(options, 'task', t);
    const taskStatus = updateTask(db, {
      taskKey,
      status: 'completed',
      goal: options.goal
    });

    if (!options.json) {
      logger.log(t('runtime.task_finish_ok', { task: taskKey, path: dbPath }));
    }

    return {
      ok: true,
      targetDir,
      dbPath,
      taskKey,
      status: taskStatus
    };
  } finally {
    db.close();
  }
}

async function runRuntimeFail({ args, options = {}, logger, t }) {
  const targetDir = resolveTargetDir(args);
  const { db, dbPath } = await withRuntimeDb(targetDir, t);

  try {
    const runKey = requireOption(options, 'run', t);
    const status = updateRun(db, {
      runKey,
      taskKey: options.task,
      status: 'failed',
      eventType: 'fail',
      message: options.message || options.summary || 'Run failed',
      summary: options.summary,
      outputPath: options.output
    });

    if (!options.json) {
      logger.log(t('runtime.fail_ok', { run: runKey, path: dbPath }));
    }

    return {
      ok: true,
      targetDir,
      dbPath,
      runKey,
      status
    };
  } finally {
    db.close();
  }
}

async function runRuntimeTaskFail({ args, options = {}, logger, t }) {
  const targetDir = resolveTargetDir(args);
  const { db, dbPath } = await withRuntimeDb(targetDir, t);

  try {
    const taskKey = requireOption(options, 'task', t);
    const status = updateTask(db, {
      taskKey,
      status: 'failed',
      goal: options.goal
    });

    if (!options.json) {
      logger.log(t('runtime.task_fail_ok', { task: taskKey, path: dbPath }));
    }

    return {
      ok: true,
      targetDir,
      dbPath,
      taskKey,
      status
    };
  } finally {
    db.close();
  }
}

async function runRuntimeStatus({ args, options = {}, logger, t }) {
  const targetDir = resolveTargetDir(args);
  const { dbPath } = resolveRuntimePaths(targetDir);

  if (!(await runtimeStoreExists(targetDir))) {
    if (options.json) {
      return { ok: false, error: 'store_missing', dbPath };
    }
    throw new Error(t('runtime.store_missing', { path: dbPath }));
  }

  const { db } = await openRuntimeDb(targetDir, { mustExist: true });

  try {
    const snapshot = getStatusSnapshot(db);
    const payload = {
      ok: true,
      targetDir,
      dbPath,
      taskCounts: snapshot.taskCounts,
      counts: snapshot.counts,
      activeTasks: snapshot.activeTasks,
      recentTasks: snapshot.recentTasks,
      activeRuns: snapshot.activeRuns,
      recentRuns: snapshot.recentRuns,
      activeLiveSessions: snapshot.activeLiveSessions,
      activeMicroTasks: snapshot.activeMicroTasks,
      recentLiveSessions: snapshot.recentLiveSessions,
      recentMicroTasks: snapshot.recentMicroTasks,
      recentHandoffs: snapshot.recentHandoffs,
      recentArtifacts: snapshot.recentArtifacts,
      recentContentItems: snapshot.recentContentItems,
      recentExecutionEvents: snapshot.recentExecutionEvents
    };

    if (!options.json) {
      logger.log(t('runtime.status_title', { path: targetDir }));
      logger.log(t('runtime.status_db', { path: dbPath }));
      logger.log(
        t('runtime.status_task_counts', {
          queued: payload.taskCounts.queued,
          running: payload.taskCounts.running,
          completed: payload.taskCounts.completed,
          failed: payload.taskCounts.failed
        })
      );
      logger.log(
        t('runtime.status_counts', {
          queued: payload.counts.queued,
          running: payload.counts.running,
          completed: payload.counts.completed,
          failed: payload.counts.failed
        })
      );
      if (snapshot.activeTasks.length === 0) {
        logger.log(t('runtime.status_no_active_tasks'));
      } else {
        logger.log(t('runtime.status_active_tasks_title'));
        for (const task of snapshot.activeTasks) {
          logger.log(
            t('runtime.status_active_task_line', {
              task: task.task_key,
              squad: task.squad_slug || '—',
              status: task.status,
              title: task.title
            })
          );
        }
      }
      if (snapshot.activeRuns.length === 0) {
        logger.log(t('runtime.status_no_active'));
      } else {
        logger.log(t('runtime.status_active_title'));
        for (const run of snapshot.activeRuns) {
          logger.log(
            t('runtime.status_active_line', {
              agent: run.agent_name,
              squad: run.squad_slug || '—',
              status: run.status,
              title: run.title || run.summary || '—'
            })
          );
        }
      }
      if (snapshot.activeLiveSessions.length > 0) {
        logger.log(t('runtime.status_live_sessions_title'));
        for (const task of snapshot.activeLiveSessions) {
          logger.log(
            t('runtime.status_live_session_line', {
              task: task.task_key,
              agent: task.latest_agent_name || task.created_by || '—',
              status: task.status,
              plan: task.plan_steps_total > 0 ? `${task.plan_steps_done}/${task.plan_steps_total}` : '—',
              micro: `${task.completed_child_task_count || 0}/${task.child_task_count || 0}`,
              handoffs: task.handoff_count || 0,
              title: task.title || '—'
            })
          );
        }
      }
      if (snapshot.activeMicroTasks.length > 0) {
        logger.log(t('runtime.status_micro_tasks_title'));
        for (const task of snapshot.activeMicroTasks) {
          logger.log(
            t('runtime.status_micro_task_line', {
              task: task.task_key,
              parent: task.parent_task_key || '—',
              status: task.status,
              title: task.title || task.goal || '—'
            })
          );
        }
      }
      if (snapshot.recentHandoffs.length > 0) {
        logger.log(t('runtime.status_handoffs_title'));
        for (const event of snapshot.recentHandoffs.slice(0, 5)) {
          logger.log(
            t('runtime.status_handoff_line', {
              created: event.created_at,
              from: event.handoff_from || event.agent_name || '—',
              to: event.handoff_to || '—',
              session: event.session_key || '—',
              message: event.message || '—'
            })
          );
        }
      }
    }

    return payload;
  } finally {
    db.close();
  }
}

/**
 * aioson runtime-log --agent=<name> --message=<text> [--type=<event>] [--finish] [--status=completed|failed] [--summary=<text>] [--title=<task-title>]
 *
 * Stateful single-command logger for official AIOSON agents.
 * First call creates task + run in SQLite; subsequent calls add events.
 * --finish closes the run and clears the session.
 */
async function runRuntimeLog({ args, options = {}, logger, t }) {
  const targetDir = resolveTargetDir(args);
  const { db, dbPath, runtimeDir } = await openRuntimeDb(targetDir);

  try {
    const agentName = options.agent;
    if (!agentName) {
      throw new Error(t('runtime.log_agent_required'));
    }

    const { runKey, taskKey } = await logAgentEvent(db, runtimeDir, {
      agentName,
      squadSlug: options.squad || null,
      message: options.message || '',
      type: options.type || 'status',
      taskTitle: options.title,
      finish: Boolean(options.finish),
      status: options.status,
      summary: options.summary,
      meta: options.meta ? (() => { try { return JSON.parse(options.meta); } catch { return { raw: options.meta }; } })() : undefined
    });

    // Generate session handoff on --finish
    if (options.finish) {
      const handoffData = buildRuntimeLogHandoff(
        agentName,
        options.message || '',
        options.summary || ''
      );
      await writeHandoff(targetDir, handoffData);
    }

    if (!options.json) {
      const isFinish = Boolean(options.finish);
      logger.log(isFinish
        ? t('runtime.log_finish_ok', { agent: agentName, run: runKey, path: dbPath })
        : t('runtime.log_ok', { agent: agentName, run: runKey, path: dbPath })
      );
    }

    return {
      ok: true,
      targetDir,
      dbPath,
      runKey,
      taskKey,
      agent: agentName,
      finished: Boolean(options.finish)
    };
  } finally {
    db.close();
  }
}


/**
 * aioson agent:done . --agent=<name> --summary="..." [--title="..."] [--status=completed|failed]
 *
 * Safe self-registration for official agents invoked directly (not via workflow:next or live:start).
 * - If an active live session exists for the agent: appends a completion event without closing the session.
 * - If no session exists: creates a standalone task+run and immediately marks it completed.
 *
 * Intended to be called ONCE at the very end of an agent session, after delivering the main artifact.
 */
function logVerifyArtifactLine(logger, va) {
  if (!va) return;
  const marker = va.skipped ? 'hint' : va.ok ? 'ok' : 'advisory';
  logger.log(`agent:done — verify:artifact (${va.kind}): ${marker}${va.reason ? ` — ${va.reason}` : ''}`);
}

async function runAgentDone({ args, options = {}, logger, t }) {
  const targetDir = resolveTargetDir(args);
  const agentName = String(options.agent || '').trim();
  if (!agentName) {
    throw new Error('--agent is required');
  }
  const normalizedAgent = agentName.startsWith('@') ? agentName : `@${agentName}`;
  const summary = String(options.summary || options.message || `${normalizedAgent} session completed`).trim();
  const title = options.title ? String(options.title).trim() : null;
  const status = options.status || 'completed';
  const verdict = options.verdict ? String(options.verdict).trim().toUpperCase() : null;
  const planStepId = options['plan-step'] ? String(options['plan-step']).trim() : null;
  const artifactPaths = options.artifacts
    ? String(options.artifacts).split(',').map((p) => p.trim()).filter(Boolean)
    : [];

  // Build-free artifact done-gate (advisory): for the peripheral agents that
  // produce a non-code artifact, prove it is complete/well-formed at the same
  // session-end call they always make, instead of relying on each agent to run
  // its `## Done gate` line. Resolved once here; surfaced on every return path.
  const { verifyAgentArtifact } = require('../artifact-kinds');
  const verifyArtifact = await verifyAgentArtifact({ targetDir, agent: normalizedAgent, options });

  const { db, dbPath, runtimeDir } = await openRuntimeDb(targetDir);

  try {
    const session = await readAgentSession(runtimeDir, normalizedAgent);
    const hasActiveSession = session && !session.finished && session.runKey;

    if (hasActiveSession) {
      // Live or tracked session is already open — only append a completion note.
      // Do NOT close the session: live:handoff or live:close owns the lifecycle.
      appendRunEvent(db, {
        runKey: session.runKey,
        eventType: 'agent_done',
        phase: 'live',
        status: 'running',
        message: summary,
        verdict,
        planStepId
      });

      if (artifactPaths.length > 0) {
        for (const filePath of artifactPaths) {
          try {
            attachArtifact(db, {
              runKey: session.runKey,
              agentName: normalizedAgent,
              kind: 'output',
              filePath
            });
          } catch { /* non-fatal */ }
        }
      }

      if (!options.json) {
        logger.log(`agent:done — ${normalizedAgent} | live session active, event logged | run: ${session.runKey} (${dbPath})`);
      }

      // F2 (workflow-handoff-integrity v1.9.5) — best-effort auto-advance workflow pointer
      const autoAdvance = await maybeAutoAdvanceWorkflow({ targetDir, normalizedAgent, options, logger, t });

      if (isDocCreatingAgent(normalizedAgent)) {
        backupAiosonDocs(targetDir).catch(() => {});
      }

      // Living Memory: best-effort reflection (never blocks the close)
      try {
        await runMemoryReflectPrepare({
          args: [targetDir],
          options: { agent: normalizedAgent.replace(/^@/, ''), json: true },
          logger: { log: () => {}, error: () => {} }
        });
      } catch { /* ignore */ }

      // Neural Chain: best-effort agent_event ingest + per-file audit telemetry.
      // BR-NC-05 (per-session hook), BR-NC-10 (telemetry obligation), BR-NC-11
      // (failure non-blocking), EC-NC-05 (no-edits skip path still emits event).
      try {
        runChainHookOnAgentDone({
          db,
          targetDir,
          artifacts: artifactPaths,
          agentName: normalizedAgent,
          featureSlug: options.feature ? String(options.feature).trim() : null
        });
      } catch { /* ignore — never blocks agent_done */ }

      if (!options.json) logVerifyArtifactLine(logger, verifyArtifact);
      return { ok: true, targetDir, dbPath, agent: normalizedAgent, mode: 'live_event', runKey: session.runKey, auto_advance: autoAdvance, verify_artifact: verifyArtifact };
    }

    // No active session — create a standalone task+run and immediately complete it.
    const { runKey, taskKey } = await logAgentEvent(db, runtimeDir, {
      agentName: normalizedAgent,
      message: summary,
      type: 'completed',
      taskTitle: title || normalizedAgent,
      finish: true,
      status,
      summary
    });

    if (verdict || planStepId) {
      appendRunEvent(db, {
        runKey,
        eventType: 'agent_done',
        phase: 'direct',
        status: 'completed',
        message: summary,
        verdict,
        planStepId
      });
    }

    if (artifactPaths.length > 0) {
      for (const filePath of artifactPaths) {
        try {
          attachArtifact(db, {
            runKey,
            taskKey,
            agentName: normalizedAgent,
            kind: 'output',
            filePath
          });
        } catch { /* non-fatal */ }
      }
    }

    if (!options.json) {
      logger.log(`agent:done — ${normalizedAgent} | task: ${taskKey} | run: ${runKey} (${dbPath})`);
    }

    // F2 (workflow-handoff-integrity v1.9.5) — best-effort auto-advance workflow pointer
    const autoAdvance = await maybeAutoAdvanceWorkflow({ targetDir, normalizedAgent, options, logger, t });

    if (isDocCreatingAgent(normalizedAgent)) {
      backupAiosonDocs(targetDir).catch(() => {});
    }

    // Living Memory: best-effort reflection (never blocks the close)
    try {
      await runMemoryReflectPrepare({
        args: [targetDir],
        options: { agent: normalizedAgent.replace(/^@/, ''), json: true },
        logger: { log: () => {}, error: () => {} }
      });
    } catch { /* ignore */ }

    // Neural Chain: best-effort agent_event ingest + per-file audit telemetry.
    // BR-NC-05 (per-session hook), BR-NC-10 (telemetry obligation), BR-NC-11
    // (failure non-blocking), EC-NC-05 (no-edits skip path still emits event).
    try {
      runChainHookOnAgentDone({
        db,
        targetDir,
        artifacts: artifactPaths,
        agentName: normalizedAgent,
        featureSlug: options.feature ? String(options.feature).trim() : null
      });
    } catch { /* ignore — never blocks agent_done */ }

    if (!options.json) logVerifyArtifactLine(logger, verifyArtifact);
    return { ok: true, targetDir, dbPath, agent: normalizedAgent, mode: 'standalone', runKey, taskKey, auto_advance: autoAdvance, verify_artifact: verifyArtifact };
  } finally {
    db.close();
  }
}


/**
 * maybeAutoAdvanceWorkflow — F2 (workflow-handoff-integrity v1.9.5)
 *
 * Best-effort: when a workflow is active for the project AND the calling
 * agent has produced its canonical artifact on disk, internally invokes
 * `runWorkflowNext({ complete: <agent> })` so the pointer advances without
 * requiring every agent prompt to literal-call `aioson workflow:next`.
 *
 * Gating (DD-01 — workflow.state.json presence-detection):
 *   - workflow.state.json absent OR `--no-auto-advance` flag → skip (backward-compat)
 *   - workflow.state.json corrupt → log warning, skip (AC-F2-09 graceful degradation)
 *   - agent unknown in handoff-contract CONTRACTS → log warning, skip (AC-F2-10)
 *
 * Idempotency (BR-01): `last_workflow_event_at` in workflow.state.json blocks
 * re-emission within a 1s window.
 *
 * Side effects (best-effort, every failure is non-fatal):
 *   - reads `.aioson/context/workflow.state.json`
 *   - writes `last_workflow_event_at` back to that file on success
 *   - calls `runWorkflowNext` with quiet logger + `--json` to suppress prose
 *   - emits ONE concise stdout line on success when not in --json mode
 *
 * @param {object} ctx
 * @param {string} ctx.targetDir       Project root.
 * @param {string} ctx.normalizedAgent Agent name with leading `@`.
 * @param {object} ctx.options         agent:done CLI options.
 * @param {object} ctx.logger          Logger (logger.log + logger.error).
 * @param {Function} [ctx.t]           Translation fn (passed through).
 * @returns {Promise<{advanced: boolean, skipped?: string, error?: string}>}
 */
async function maybeAutoAdvanceWorkflow({ targetDir, normalizedAgent, options = {}, logger, t }) {
  // DD-01 opt-out — explicit --no-auto-advance disables, regardless of state.
  if (options['no-auto-advance'] || options.noAutoAdvance) {
    return { advanced: false, skipped: 'opt-out' };
  }

  const statePath = path.join(targetDir, '.aioson', 'context', 'workflow.state.json');

  // 1. Read workflow.state.json (graceful absent OR corrupt — AC-F2-02 / AC-F2-09).
  let state;
  try {
    const raw = await fs.readFile(statePath, 'utf8');
    state = JSON.parse(raw);
  } catch (err) {
    if (err.code === 'ENOENT') {
      return { advanced: false, skipped: 'no_active_workflow' };
    }
    if (!options.json && logger?.error) {
      logger.error(`[agent:done] workflow.state.json unreadable (${err.code || err.message}); fallback to backward-compat (no auto-advance)`);
    }
    return { advanced: false, skipped: 'state_corrupt', error: err.message };
  }

  // 2. Inactive workflow → skip.
  if (!state || (!state.featureSlug && state.mode !== 'project') || state.current === null) {
    return { advanced: false, skipped: 'inactive_workflow' };
  }

  // 3. Idempotency guard (BR-01 — 1s window).
  const now = Date.now();
  const lastEventAt = Number(state.last_workflow_event_at) || 0;
  if (now - lastEventAt < 1000) {
    return { advanced: false, skipped: 'idempotency_window' };
  }

  // 4. Lookup canonical artifact via handoff-contract (DPC-03 — reuse CONTRACTS map).
  let artifacts;
  try {
    const { getCanonicalArtifactsForAgent } = require('../handoff-contract');
    artifacts = await getCanonicalArtifactsForAgent(normalizedAgent, targetDir, {
      mode: state.mode || 'feature',
      featureSlug: state.featureSlug,
      classification: state.classification
    });
  } catch (err) {
    if (!options.json && logger?.error) {
      logger.error(`[agent:done] handoff-contract lookup failed (${err.message}); skip auto-advance`);
    }
    return { advanced: false, skipped: 'contract_error', error: err.message };
  }

  // AC-F2-10 — agent not registered in CONTRACTS.
  if (artifacts === null) {
    if (!options.json && logger?.error) {
      logger.error(`[agent:done] agent '${normalizedAgent}' not in handoff-contract CONTRACTS map; skip auto-advance`);
    }
    return { advanced: false, skipped: 'unknown_agent' };
  }

  // Empty array — agent legitimately produces no canonical artifact (e.g. @committer, @dev).
  // Don't auto-advance; the workflow advances on explicit user action when needed.
  if (artifacts.length === 0) {
    return { advanced: false, skipped: 'no_canonical_artifact' };
  }

  // 5. At least one declared artifact must exist on disk before we trust auto-advance.
  let anyExists = false;
  for (const artifactPath of artifacts) {
    try {
      await fs.access(artifactPath);
      anyExists = true;
      break;
    } catch { /* not found — try next */ }
  }
  if (!anyExists) {
    return { advanced: false, skipped: 'artifact_missing' };
  }

  // 6. Internal invocation of runWorkflowNext (lazy require — circular safety).
  let result;
  try {
    const { runWorkflowNext } = require('./workflow-next');
    result = await runWorkflowNext({
      args: [targetDir],
      options: { complete: normalizedAgent.replace(/^@/, ''), json: true },
      logger: { log: () => {}, error: () => {}, warn: () => {} },
      t
    });
  } catch (err) {
    if (!options.json && logger?.error) {
      logger.error(`[agent:done] workflow:next failed (${err.message}); pointer unchanged`);
    }
    return { advanced: false, skipped: 'workflow_next_failed', error: err.message };
  }

  // 7. Persist last_workflow_event_at for idempotency (best-effort).
  try {
    const refreshedRaw = await fs.readFile(statePath, 'utf8').catch(() => null);
    const refreshed = refreshedRaw ? JSON.parse(refreshedRaw) : state;
    refreshed.last_workflow_event_at = now;
    await fs.writeFile(statePath, `${JSON.stringify(refreshed, null, 2)}\n`);
  } catch { /* non-fatal */ }

  // 8. Surface concise outcome — single line, AFTER existing standard log (AC-F2-02 preserved).
  if (!options.json && logger?.log && result?.ok) {
    const nextStage = result.next || result.nextStage || null;
    const tag = nextStage ? `→ ${nextStage}` : '(workflow complete)';
    logger.log(`[agent:done] auto-advanced ${tag}`);
  }

  return { advanced: true, result };
}


async function runRuntimeSessionStart({ args, options = {}, logger, t }) {
  const targetDir = resolveTargetDir(args);
  const { db, dbPath, runtimeDir } = await openRuntimeDb(targetDir);

  try {
    const agentName = normalizeAgentHandle(requireOption(options, 'agent', t));
    const existingSnapshot = await collectRuntimeSessionSnapshot(db, runtimeDir, agentName, { limit: options.limit });

    if (existingSnapshot.session && !existingSnapshot.open) {
      await clearAgentSession(runtimeDir, agentName);
    }

    if (existingSnapshot.open) {
      if (!options.json) {
        logger.log(`Direct session already active: ${agentName} | task: ${existingSnapshot.task?.task_key || '—'} | run: ${existingSnapshot.run?.run_key || '—'} (${dbPath})`);
      }
      return {
        ok: true,
        targetDir,
        dbPath,
        agent: agentName,
        taskKey: existingSnapshot.task?.task_key || existingSnapshot.session?.taskKey || null,
        runKey: existingSnapshot.run?.run_key || existingSnapshot.session?.runKey || null,
        sessionKey: existingSnapshot.sessionKey,
        status: existingSnapshot.run?.status || 'running',
        reused: true,
        open: true
      };
    }

    const sessionKey = options.session ? String(options.session).trim() : makeDirectSessionKey(agentName);
    const title = options.title ? String(options.title).trim() : `Direct session ${agentName}`;
    const message = options.message ? String(options.message).trim() : `Session started for ${agentName}`;
    const { runKey, taskKey } = await logAgentEvent(db, runtimeDir, {
      agentName,
      message,
      type: options.type || 'session.start',
      taskTitle: title,
      sessionKey,
      meta: options.meta ? (() => { try { return JSON.parse(options.meta); } catch { return { raw: options.meta }; } })() : undefined
    });

    if (!options.json) {
      logger.log(`Direct session started: ${agentName} | task: ${taskKey} | run: ${runKey} (${dbPath})`);
    }

    return {
      ok: true,
      targetDir,
      dbPath,
      agent: agentName,
      taskKey,
      runKey,
      sessionKey,
      status: 'running',
      reused: false,
      open: true
    };
  } finally {
    db.close();
  }
}

async function runRuntimeSessionLog({ args, options = {}, logger, t }) {
  const targetDir = resolveTargetDir(args);
  const { db, dbPath, runtimeDir } = await openRuntimeDb(targetDir);

  try {
    const agentName = normalizeAgentHandle(requireOption(options, 'agent', t));
    const message = requireOption(options, 'message', t);
    const existingSnapshot = await collectRuntimeSessionSnapshot(db, runtimeDir, agentName, { limit: options.limit });

    if (existingSnapshot.session && !existingSnapshot.open) {
      await clearAgentSession(runtimeDir, agentName);
    }

    const autoStarted = !existingSnapshot.open;
    const sessionKey = existingSnapshot.sessionKey || (options.session ? String(options.session).trim() : makeDirectSessionKey(agentName));
    const title = options.title ? String(options.title).trim() : `Direct session ${agentName}`;
    const { runKey, taskKey } = await logAgentEvent(db, runtimeDir, {
      agentName,
      message,
      type: options.type || 'session.log',
      taskTitle: title,
      sessionKey,
      meta: options.meta ? (() => { try { return JSON.parse(options.meta); } catch { return { raw: options.meta }; } })() : undefined
    });

    if (!options.json) {
      logger.log(`Direct session log recorded: ${agentName} | run: ${runKey} (${dbPath})`);
    }

    return {
      ok: true,
      targetDir,
      dbPath,
      agent: agentName,
      taskKey,
      runKey,
      sessionKey,
      status: 'running',
      autoStarted,
      open: true
    };
  } finally {
    db.close();
  }
}

async function runRuntimeSessionFinish({ args, options = {}, logger, t }) {
  const targetDir = resolveTargetDir(args);
  const { db, dbPath, runtimeDir } = await openRuntimeDb(targetDir);

  try {
    const agentName = normalizeAgentHandle(requireOption(options, 'agent', t));
    const existingSnapshot = await collectRuntimeSessionSnapshot(db, runtimeDir, agentName, { limit: options.limit });

    if (!existingSnapshot.open) {
      throw new Error(`No active direct session for ${agentName}.`);
    }

    const summary = options.summary ? String(options.summary).trim() : '';
    const message = options.message ? String(options.message).trim() : (summary || `Session finished for ${agentName}`);
    const { runKey, taskKey } = await logAgentEvent(db, runtimeDir, {
      agentName,
      message,
      type: options.type || 'session.finish',
      finish: true,
      status: options.status || 'completed',
      summary,
      meta: options.meta ? (() => { try { return JSON.parse(options.meta); } catch { return { raw: options.meta }; } })() : undefined
    });

    if (!options.json) {
      logger.log(`Direct session finished: ${agentName} | run: ${runKey} (${dbPath})`);
    }

    return {
      ok: true,
      targetDir,
      dbPath,
      agent: agentName,
      taskKey,
      runKey,
      sessionKey: existingSnapshot.sessionKey,
      status: options.status || 'completed',
      finished: true,
      open: false
    };
  } finally {
    db.close();
  }
}

async function runRuntimeSessionStatus({ args, options = {}, logger, t }) {
  const targetDir = resolveTargetDir(args);
  const agentName = normalizeAgentHandle(requireOption(options, 'agent', t));
  const watchSeconds = parseWatchSeconds(options.watch);

  if (watchSeconds && options.json) {
    throw new Error('--watch cannot be combined with --json.');
  }

  if (!watchSeconds) {
    const snapshot = await getRuntimeSessionSnapshot(targetDir, agentName, t, { limit: options.limit });
    if (!options.json) {
      printRuntimeSessionSnapshot(snapshot, logger);
    }
    return snapshot;
  }

  while (true) {
    const snapshot = await getRuntimeSessionSnapshot(targetDir, agentName, t, { limit: options.limit });
    if (process.stdout && process.stdout.isTTY) {
      process.stdout.write('\x1Bc');
    }
    printRuntimeSessionSnapshot(snapshot, logger);
    await sleep(Math.round(watchSeconds * 1000));
  }
}

async function runDeliver({ args, options = {}, logger, t }) {
  const targetDir = resolveTargetDir(args);
  const squadSlug = requireOption(options, 'squad', t);
  const contentKey = options['content-key'] || options.contentKey || null;
  const triggerType = options.trigger || 'manual';

  const { db, dbPath } = await withRuntimeDb(targetDir, t);

  try {
    const { runManualDelivery } = require('../delivery-runner');

    // Optionally load content payload from DB
    let contentPayload = null;
    if (contentKey) {
      const row = db.prepare('SELECT payload_json FROM content_items WHERE content_key = ? AND squad_slug = ?').get(contentKey, squadSlug);
      if (row && row.payload_json) {
        try { contentPayload = JSON.parse(row.payload_json); } catch { /* ignore */ }
      }
    }

    const result = await runManualDelivery(db, {
      projectDir: targetDir,
      squadSlug,
      contentKey,
      triggerType,
      contentPayload
    });

    if (!result.delivered) {
      logger.log(`Delivery skipped: ${result.reason}`);
      return { ok: false, ...result };
    }

    for (const r of result.results || []) {
      const status = r.ok ? 'OK' : 'FAIL';
      logger.log(`  ${status} ${r.webhookSlug} — ${r.statusCode || 'no response'} (${r.attempts} attempt${r.attempts > 1 ? 's' : ''})`);
      if (r.error) logger.log(`    Error: ${r.error}`);
    }

    logger.log(`\nDelivery ${result.allOk ? 'completed' : 'completed with errors'}.`);
    return { ok: result.allOk, ...result };
  } finally {
    db.close();
  }
}

async function findManifestPath(projectDir, slug) {
  const candidates = [
    path.join(projectDir, '.aioson', 'squads', slug, 'squad.manifest.json'),
    path.join(projectDir, 'agents', slug, 'squad.manifest.json')
  ];
  for (const p of candidates) {
    try { await fs.stat(p); return p; } catch { continue; }
  }
  return null;
}

async function runOutputStrategyExport({ args, options = {}, logger, t }) {
  const projectDir = resolveTargetDir(args);
  const slug = requireOption(options, 'squad', t);
  const manifestPath = await findManifestPath(projectDir, slug);

  if (!manifestPath) {
    logger.error(`Manifest not found for squad "${slug}"`);
    return { ok: false, error: 'Manifest not found' };
  }

  const raw = await fs.readFile(manifestPath, 'utf8');
  const manifest = JSON.parse(raw);
  const strategy = manifest.outputStrategy || null;

  if (!strategy) {
    logger.log(`Squad "${slug}" has no outputStrategy configured.`);
    return { ok: false, error: 'No outputStrategy found' };
  }

  const exportsDir = path.join(projectDir, '.aioson', 'squads', 'exports');
  await fs.mkdir(exportsDir, { recursive: true });
  const outFile = path.join(exportsDir, `${slug}.output-strategy.json`);
  await fs.writeFile(outFile, JSON.stringify(strategy, null, 2) + '\n', 'utf8');

  const relOut = path.relative(projectDir, outFile).replace(/\\/g, '/');
  logger.log(`Exported outputStrategy from "${slug}" → ${relOut}`);
  return { ok: true, file: relOut, strategy };
}

async function runOutputStrategyImport({ args, options = {}, logger, t }) {
  const projectDir = resolveTargetDir(args);
  const slug = requireOption(options, 'squad', t);
  const fromSlug = options.from || null;
  const fromFile = options.file || null;

  if (!fromSlug && !fromFile) {
    logger.error('Usage: aioson output-strategy:import --squad=<target> --from=<source-slug> | --file=<path>');
    return { ok: false, error: 'Provide --from or --file' };
  }

  // Load source strategy
  let strategy;
  if (fromFile) {
    const absFile = path.resolve(projectDir, fromFile);
    const raw = await fs.readFile(absFile, 'utf8');
    strategy = JSON.parse(raw);
  } else {
    const srcPath = await findManifestPath(projectDir, fromSlug);
    if (!srcPath) {
      logger.error(`Source squad "${fromSlug}" manifest not found`);
      return { ok: false, error: 'Source manifest not found' };
    }
    const srcManifest = JSON.parse(await fs.readFile(srcPath, 'utf8'));
    strategy = srcManifest.outputStrategy || null;
    if (!strategy) {
      logger.error(`Source squad "${fromSlug}" has no outputStrategy`);
      return { ok: false, error: 'Source has no outputStrategy' };
    }
  }

  // Write to target
  const targetPath = await findManifestPath(projectDir, slug);
  if (!targetPath) {
    logger.error(`Target squad "${slug}" manifest not found`);
    return { ok: false, error: 'Target manifest not found' };
  }

  const targetManifest = JSON.parse(await fs.readFile(targetPath, 'utf8'));
  targetManifest.outputStrategy = strategy;
  await fs.writeFile(targetPath, JSON.stringify(targetManifest, null, 2) + '\n', 'utf8');

  logger.log(`Imported outputStrategy into "${slug}" from ${fromSlug || fromFile}`);
  return { ok: true, squad: slug, source: fromSlug || fromFile };
}

/**
 * aioson devlog:sync [targetDir]
 *
 * Parses aioson-logs/devlog-*.md files, imports them into SQLite as
 * task + run + events, then renames each file to .synced so it is not
 * re-imported on subsequent runs.
 */
async function runDevlogSync({ args, options = {}, logger, t }) {
  const targetDir = resolveTargetDir(args);
  const logsDir = path.join(targetDir, 'aioson-logs');

  let entries;
  try {
    entries = await fs.readdir(logsDir);
  } catch {
    logger.log('No aioson-logs/ directory found — nothing to sync.');
    return { ok: true, synced: 0 };
  }

  const devlogFiles = entries
    .filter(f => f.startsWith('devlog-') && f.endsWith('.md'))
    .sort();

  if (devlogFiles.length === 0) {
    logger.log('No devlog files to sync.');
    return { ok: true, synced: 0 };
  }

  const { db, dbPath } = await openRuntimeDb(targetDir);
  let synced = 0;
  const parsedDevlogs = [];

  try {
    for (const file of devlogFiles) {
      const filePath = path.join(logsDir, file);
      const raw = await fs.readFile(filePath, 'utf8');

      // Parse YAML frontmatter
      const fm = parseFrontmatter(raw);
      const agent = fm.agent || 'unknown';
      const summary = fm.summary || file;
      const sessionStart = fm.session_start || null;
      const sessionEnd = fm.session_end || null;
      const status = fm.status || 'completed';
      const body = raw.replace(/^---[\s\S]*?---\s*/, '');

      parsedDevlogs.push({ filename: file, agent, summary, sessionStart, sessionEnd, status, body });

      // Create task + run
      const taskKey = startTask(db, {
        title: `devlog: ${summary}`,
        squadSlug: null,
        status: status === 'partial' ? 'running' : 'completed',
        createdBy: agent
      });

      const runKey = startRun(db, {
        taskKey,
        agentName: agent,
        agentKind: 'devlog',
        squadSlug: null,
        title: `@${agent} devlog`,
        message: summary
      });

      // Extract body sections as events
      const sections = body.split(/^## /m).filter(Boolean);
      for (const section of sections) {
        const firstLine = section.split('\n')[0].trim();
        const content = section.slice(firstLine.length).trim();
        if (content) {
          appendRunEvent(db, {
            runKey,
            eventType: 'devlog',
            phase: firstLine.toLowerCase().replace(/\s+/g, '_'),
            status: 'completed',
            message: `## ${firstLine}\n${content}`,
            createdAt: sessionEnd || new Date().toISOString()
          });
        }
      }

      // Close the run
      updateRun(db, runKey, {
        status: status === 'partial' ? 'running' : 'completed',
        summary,
        finishedAt: sessionEnd || new Date().toISOString()
      });

      if (status !== 'partial') {
        updateTask(db, taskKey, {
          status: 'completed',
          finishedAt: sessionEnd || new Date().toISOString()
        });
      }

      // Rename to .synced
      await fs.rename(filePath, filePath.replace(/\.md$/, '.synced.md'));
      synced++;
      logger.log(`  Synced: ${file} → task=${taskKey} run=${runKey}`);
    }

    logger.log(`Synced ${synced} devlog(s) into ${dbPath}`);

    // Cloud sync
    if (options.cloud) {
      const cloudResult = await syncDevlogsToCloud(targetDir, parsedDevlogs, options, logger);
      return { ok: true, synced, dbPath, cloud: cloudResult };
    }

    return { ok: true, synced, dbPath };
  } finally {
    db.close();
  }
}

/**
 * Sends parsed devlogs to the cloud endpoint.
 * Reads cloud config from .aioson/install.json or --url / --token options.
 */
async function syncDevlogsToCloud(targetDir, devlogs, options, logger) {
  const cloudUrl = options.url || options['cloud-url'] || await resolveCloudUrl(targetDir);
  const cloudToken = options.token || options['cloud-token'] || await resolveCloudToken(targetDir);

  if (!cloudUrl) {
    logger.error('Cloud URL not configured. Use --url or set cloudBaseUrl in dashboard project settings.');
    return { ok: false, error: 'missing_cloud_url' };
  }
  if (!cloudToken) {
    logger.error('Cloud token not configured. Use --token or set cloudApiToken in dashboard project settings.');
    return { ok: false, error: 'missing_cloud_token' };
  }

  const endpoint = `${cloudUrl.replace(/\/+$/, '')}/api/publish/runtime`;
  const payload = {
    tasks: [],
    devlogs: devlogs.map(d => ({
      filename: d.filename,
      agent: d.agent,
      sessionStart: d.sessionStart,
      sessionEnd: d.sessionEnd,
      status: d.status,
      summary: d.summary,
      body: d.body
    }))
  };

  logger.log(`  Pushing ${devlogs.length} devlog(s) to ${endpoint}...`);

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'accept': 'application/json',
      'content-type': 'application/json',
      'authorization': `Bearer ${cloudToken}`
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(15000)
  });

  const text = await response.text();
  let result;
  try { result = JSON.parse(text); } catch { result = { ok: false, error: text }; }

  if (result.ok) {
    logger.log(`  Cloud sync OK: ${result.devlogsStored || 0} devlog(s) stored.`);
  } else {
    logger.error(`  Cloud sync failed: ${result.error || response.status}`);
  }

  return result;
}

async function resolveCloudUrl(targetDir) {
  try {
    const raw = await fs.readFile(path.join(targetDir, '.aioson/install.json'), 'utf8');
    const meta = JSON.parse(raw);
    return meta.cloudBaseUrl || null;
  } catch { return null; }
}

async function resolveCloudToken(targetDir) {
  try {
    const raw = await fs.readFile(path.join(targetDir, '.aioson/install.json'), 'utf8');
    const meta = JSON.parse(raw);
    return meta.cloudApiToken || null;
  } catch { return null; }
}

/**
 * Minimal YAML frontmatter parser (no external deps).
 * Returns an object with frontmatter keys, or {} if none.
 */
function parseFrontmatter(content) {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return {};
  const result = {};
  for (const line of match[1].split('\n')) {
    const idx = line.indexOf(':');
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    let val = line.slice(idx + 1).trim();
    // Strip surrounding quotes
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    result[key] = val;
  }
  return result;
}

/**
 * Parses a duration string like "24h", "30m", "7d" into milliseconds.
 * Falls back to treating the raw value as hours.
 */
function parseDurationMs(value, defaultHours = 24) {
  const text = String(value || '').trim().toLowerCase();
  if (!text) return defaultHours * 60 * 60 * 1000;

  const match = text.match(/^(\d+(?:\.\d+)?)\s*([hmd]?)$/);
  if (!match) return defaultHours * 60 * 60 * 1000;

  const n = parseFloat(match[1]);
  const unit = match[2] || 'h';
  if (unit === 'd') return n * 24 * 60 * 60 * 1000;
  if (unit === 'm') return n * 60 * 1000;
  return n * 60 * 60 * 1000; // hours (default)
}

/**
 * aioson agent:recover [targetDir] [--older-than=<duration>] [--dry-run]
 *
 * Detects and closes agent sessions that were abandoned (Claude Code closed before
 * agent:done was called, or live:start session was never closed).
 *
 * Sources checked:
 *   1. Session files in .aioson/.sessions/ with finished=false older than threshold.
 *   2. agent_runs rows with status='running'/'queued' older than threshold
 *      that have no corresponding live session file (orphaned DB records).
 *   3. workflow tasks/runs left running after a workflow finished or was abandoned.
 *
 * --older-than  Duration threshold. Accepts: 24h (default), 8h, 30m, 7d.
 * --dry-run     Report what would be recovered without making any changes.
 * --json        Output JSON result.
 */
async function runAgentRecover({ args, options = {}, logger }) {
  const targetDir = resolveTargetDir(args);
  const dryRun = Boolean(options['dry-run'] || options.dryRun);
  const olderThanMs = parseDurationMs(options['older-than'] || options.olderThan, 24);
  const cutoffMs = Date.now() - olderThanMs;
  const cutoffIso = new Date(cutoffMs).toISOString();
  const now = new Date().toISOString();

  const { db, dbPath, runtimeDir } = await openRuntimeDb(targetDir);

  const recovered = [];
  const skipped = [];

  try {
    // ── 1. Scan session files ─────────────────────────────────────────────────
    const sessionsDir = path.join(runtimeDir, '.sessions');
    let sessionFiles = [];
    try {
      const entries = await fs.readdir(sessionsDir);
      sessionFiles = entries.filter((f) => f.endsWith('.json'));
    } catch {
      // .sessions dir may not exist — that's fine
    }

    for (const file of sessionFiles) {
      const filePath = path.join(sessionsDir, file);
      let session;
      try {
        session = JSON.parse(await fs.readFile(filePath, 'utf8'));
      } catch {
        continue;
      }

      if (session.finished) continue;

      const startedAt = session.startedAt ? new Date(session.startedAt).getTime() : 0;
      if (startedAt > cutoffMs) {
        skipped.push({ source: 'session_file', file, reason: 'within_threshold', startedAt: session.startedAt });
        continue;
      }

      const agentName = file.replace(/\.json$/, '');
      const runKey = session.runKey || null;
      const taskKey = session.taskKey || null;

      if (!dryRun) {
        // Mark run as abandoned
        if (runKey) {
          const runRow = db.prepare('SELECT run_key, status FROM agent_runs WHERE run_key = ?').get(runKey);
          if (runRow && (runRow.status === 'running' || runRow.status === 'queued')) {
            db.prepare(`
              UPDATE agent_runs
              SET status = 'abandoned', summary = 'Recovered: session abandoned without close', updated_at = ?, finished_at = ?
              WHERE run_key = ?
            `).run(now, now, runKey);
          }
        }
        // Mark task as abandoned
        if (taskKey) {
          const taskRow = db.prepare('SELECT task_key, status FROM tasks WHERE task_key = ?').get(taskKey);
          if (taskRow && (taskRow.status === 'running' || taskRow.status === 'queued')) {
            db.prepare(`
              UPDATE tasks
              SET status = 'abandoned', updated_at = ?, finished_at = ?
              WHERE task_key = ?
            `).run(now, now, taskKey);
          }
        }
        // Remove session file
        try { await fs.unlink(filePath); } catch { /* noop */ }
      }

      recovered.push({ source: 'session_file', agent: agentName, runKey, taskKey, startedAt: session.startedAt });
    }

    // ── 2. Scan DB for orphaned running runs (no session file) ────────────────
    const orphanedRuns = db.prepare(`
      SELECT run_key, task_key, agent_name, source, started_at
      FROM agent_runs
      WHERE status IN ('running', 'queued')
        AND COALESCE(started_at, updated_at, '') < ?
    `).all(cutoffIso);

    for (const run of orphanedRuns) {
      // Skip if already recovered via session file
      if (recovered.some((r) => r.runKey === run.run_key)) continue;
      const source = run.source === 'workflow' ? 'workflow_run' : 'orphaned_run';
      const summary = source === 'workflow_run'
        ? 'Recovered: stale workflow run left running'
        : 'Recovered: orphaned run with no session file';

      if (!dryRun) {
        db.prepare(`
          UPDATE agent_runs
          SET status = 'abandoned', summary = ?, updated_at = ?, finished_at = ?
          WHERE run_key = ?
        `).run(summary, now, now, run.run_key);

        if (run.task_key) {
          const taskRow = db.prepare('SELECT task_key, status FROM tasks WHERE task_key = ?').get(run.task_key);
          if (taskRow && (taskRow.status === 'running' || taskRow.status === 'queued')) {
            db.prepare(`
              UPDATE tasks
              SET status = 'abandoned', updated_at = ?, finished_at = ?
              WHERE task_key = ?
            `).run(now, now, run.task_key);
          }
        }
      }

      recovered.push({ source, agent: run.agent_name, runKey: run.run_key, taskKey: run.task_key, startedAt: run.started_at });
    }

    // ── 3. Scan DB for stale workflow tasks without a recovered run ───────────
    const staleWorkflowTasks = db.prepare(`
      SELECT task_key, title, created_by, session_key, created_at, updated_at
      FROM tasks
      WHERE status IN ('running', 'queued')
        AND (created_by = '@workflow' OR session_key LIKE 'workflow:%')
        AND COALESCE(updated_at, created_at, '') < ?
    `).all(cutoffIso);

    for (const task of staleWorkflowTasks) {
      if (recovered.some((r) => r.taskKey === task.task_key)) continue;

      if (!dryRun) {
        db.prepare(`
          UPDATE tasks
          SET status = 'abandoned', updated_at = ?, finished_at = ?
          WHERE task_key = ?
        `).run(now, now, task.task_key);
      }

      recovered.push({
        source: 'workflow_task',
        agent: task.created_by || '@workflow',
        runKey: null,
        taskKey: task.task_key,
        startedAt: task.updated_at || task.created_at
      });
    }

    // ── Output ────────────────────────────────────────────────────────────────
    const olderThanLabel = options['older-than'] || options.olderThan || '24h';
    if (recovered.length === 0) {
      logger.log(`agent:recover — no abandoned sessions found older than ${olderThanLabel} (${dbPath})`);
    } else {
      const verb = dryRun ? '[dry-run] would recover' : 'recovered';
      logger.log(`agent:recover — ${verb} ${recovered.length} abandoned session(s) older than ${olderThanLabel} (${dbPath})`);
      for (const r of recovered) {
        logger.log(`  ${r.agent}  started: ${r.startedAt || '?'}  run: ${r.runKey || '—'}  [${r.source}]`);
      }
    }
    if (skipped.length > 0) {
      logger.log(`  skipped ${skipped.length} session(s) within threshold.`);
    }

    return { ok: true, targetDir, dbPath, dryRun, cutoff: cutoffIso, recovered, skipped };
  } finally {
    db.close();
  }
}


/**
 * aioson runtime:prune [targetDir] --older-than=<days>
 *
 * Removes execution_events, agent_events, and completed agent_runs
 * older than the specified number of days. Tasks are kept but their
 * events are cleaned up.
 */
async function runRuntimePrune({ args, options = {}, logger, t }) {
  const targetDir = resolveTargetDir(args);
  const days = parseInt(options['older-than'] || options.olderThan || '30', 10);

  if (isNaN(days) || days < 1) {
    logger.error('Usage: aioson runtime:prune --older-than=<days> (minimum 1)');
    return { ok: false, error: 'Invalid --older-than value' };
  }

  const { db, dbPath } = await withRuntimeDb(targetDir, t);

  try {
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

    const execEvents = db.prepare(
      `DELETE FROM execution_events WHERE created_at < ?`
    ).run(cutoff);

    const agentEvents = db.prepare(
      `DELETE FROM agent_events WHERE created_at < ?`
    ).run(cutoff);

    const runs = db.prepare(
      `DELETE FROM agent_runs WHERE status IN ('completed', 'failed') AND finished_at < ?`
    ).run(cutoff);

    const tasks = db.prepare(
      `DELETE FROM tasks WHERE status IN ('completed', 'failed') AND finished_at < ?`
    ).run(cutoff);

    const deliveryLogs = db.prepare(
      `DELETE FROM delivery_log WHERE created_at < ?`
    ).run(cutoff);

    // Reclaim disk space
    db.pragma('wal_checkpoint(TRUNCATE)');

    const total = execEvents.changes + agentEvents.changes + runs.changes + tasks.changes + deliveryLogs.changes;

    logger.log(`Pruned ${total} records older than ${days} days from ${dbPath}:`);
    logger.log(`  execution_events: ${execEvents.changes}`);
    logger.log(`  agent_events: ${agentEvents.changes}`);
    logger.log(`  agent_runs: ${runs.changes}`);
    logger.log(`  tasks: ${tasks.changes}`);
    logger.log(`  delivery_log: ${deliveryLogs.changes}`);

    return {
      ok: true,
      dbPath,
      days,
      cutoff,
      deleted: {
        execution_events: execEvents.changes,
        agent_events: agentEvents.changes,
        agent_runs: runs.changes,
        tasks: tasks.changes,
        delivery_log: deliveryLogs.changes,
        total
      }
    };
  } finally {
    db.close();
  }
}

module.exports = {
  runRuntimeInit,
  runRuntimeIngest,
  runRuntimeTaskStart,
  runRuntimeStart,
  runRuntimeUpdate,
  runRuntimeTaskFinish,
  runRuntimeFinish,
  runRuntimeTaskFail,
  runRuntimeFail,
  runRuntimeStatus,
  runRuntimeLog,
  runAgentDone,
  runAgentRecover,
  maybeAutoAdvanceWorkflow,
  runRuntimeSessionStart,
  runRuntimeSessionLog,
  runRuntimeSessionFinish,
  runRuntimeSessionStatus,
  runDeliver,
  runOutputStrategyExport,
  runOutputStrategyImport,
  runDevlogSync,
  runRuntimePrune
};
