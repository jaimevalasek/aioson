'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const Database = require('better-sqlite3');
const { flattenGenomeBindings, mergeGenomeBindings } = require('../genomes/bindings');
const { resolveTargetDir } = require('../lib/project-root');

const TIER_COSTS = {
  powerful: { inputPer1k: 0.015, outputPer1k: 0.075 },
  balanced: { inputPer1k: 0.003, outputPer1k: 0.015 },
  fast:     { inputPer1k: 0.0008, outputPer1k: 0.004 },
  none:     { inputPer1k: 0, outputPer1k: 0 }
};

function estimateRunCost(executors) {
  if (!Array.isArray(executors) || executors.length === 0) return null;
  let total = 0;
  for (const ex of executors) {
    const tier = ex.modelTier || (ex.usesLLM === false ? 'none' : 'balanced');
    const cost = TIER_COSTS[tier] || TIER_COSTS.balanced;
    total += (cost.inputPer1k * 2) + (cost.outputPer1k * 1);
  }
  return Math.round(total * 1000) / 1000;
}

function buildTierSummary(executors) {
  if (!Array.isArray(executors) || executors.length === 0) return null;
  const counts = {};
  for (const ex of executors) {
    const tier = ex.modelTier || (ex.usesLLM === false ? 'none' : 'balanced');
    counts[tier] = (counts[tier] || 0) + 1;
  }
  return Object.entries(counts).map(([t, n]) => `${t}×${n}`).join(' / ');
}

const SQUADS_DIR = '.aioson/squads';
const AGENTS_ROOT = 'agents';
const OUTPUT_ROOT = 'output';
const LOGS_ROOT = 'aioson-logs';
const SKIP_FILES = new Set(['memory.md', '.gitkeep']);
const SESSION_HTML_RE = /\.html?$/i;

function extractField(content, ...labels) {
  for (const label of labels) {
    const regex = new RegExp(`^(?:${label}):\\s*(.+)$`, 'im');
    const match = String(content || '').match(regex);
    if (match) return String(match[1]).trim();
  }
  return null;
}

function parseListSection(content, heading) {
  const lines = String(content || '').split(/\r?\n/);
  const startIndex = lines.findIndex((line) => line.trim() === `${heading}:`);
  if (startIndex === -1) return [];

  const values = [];
  for (let i = startIndex + 1; i < lines.length; i++) {
    const line = lines[i];
    if (/^\S.+:$/.test(line.trim())) break;
    const match = line.match(/^\s*-\s+(.+?)\s*$/);
    if (match) values.push(match[1].trim());
  }
  return values;
}

function normalizeRel(relPath) {
  return String(relPath || '')
    .replace(/\\/g, '/')
    .replace(/^\.\//, '')
    .replace(/\/+$/, '');
}

async function pathExists(targetPath) {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function readDirNames(targetPath) {
  try {
    return await fs.readdir(targetPath);
  } catch {
    return [];
  }
}

async function getLatestHtml(outputDirAbs) {
  const latestAlias = path.join(outputDirAbs, 'latest.html');
  if (await pathExists(latestAlias)) {
    const stat = await fs.stat(latestAlias).catch(() => null);
    return { absPath: latestAlias, mtime: stat?.mtime || null };
  }

  const sessionEntries = await readDirNames(outputDirAbs);
  const candidates = [];

  for (const file of sessionEntries) {
    if (file === 'latest.html') continue;
    if (!SESSION_HTML_RE.test(file)) continue;
    const absPath = path.join(outputDirAbs, file);
    const stat = await fs.stat(absPath).catch(() => null);
    if (!stat?.isFile()) continue;
    candidates.push({ absPath, mtime: stat.mtime });
  }

  const legacySession = path.join(outputDirAbs, 'session.html');
  if (await pathExists(legacySession)) {
    const stat = await fs.stat(legacySession).catch(() => null);
    candidates.push({ absPath: legacySession, mtime: stat?.mtime || null });
  }

  candidates.sort((a, b) => {
    if (!a.mtime) return 1;
    if (!b.mtime) return -1;
    return b.mtime - a.mtime;
  });

  return candidates[0] || null;
}

async function collectDirStats(targetDir, relDir, options = {}) {
  const normalized = normalizeRel(relDir);
  if (!normalized) {
    return { relDir: normalized, absDir: null, exists: false, entries: [] };
  }

  const absDir = path.join(targetDir, normalized);
  const entries = await readDirNames(absDir);
  const files = [];

  for (const entry of entries) {
    if (SKIP_FILES.has(entry)) continue;
    const absPath = path.join(absDir, entry);
    const stat = await fs.stat(absPath).catch(() => null);
    if (!stat) continue;
    const match = typeof options.filter === 'function' ? options.filter(entry, stat) : true;
    if (!match) continue;
    files.push({ name: entry, absPath, stat });
  }

  return {
    relDir: normalized,
    absDir,
    exists: files.length > 0 || (await pathExists(absDir)),
    entries: files
  };
}

async function buildSquadRecordFromMetadata(targetDir, file) {
  const squadsDir = path.join(targetDir, SQUADS_DIR);
  const filePath = path.join(squadsDir, file);
  const content = await fs.readFile(filePath, 'utf8').catch(() => null);
  if (!content) return null;

  const trimmed = content.trim();
  if (!trimmed || trimmed.startsWith('<!--')) return null;

  const slug = file.replace(/\.md$/, '');
  const squadName =
    extractField(content, 'Squad', 'Squad Ativo', 'Squad Activo', 'Squad Actif') || slug;
  const mode = extractField(content, 'Mode', 'Modo') || '—';
  const goal = extractField(content, 'Goal', 'Objetivo', 'Objectif') || '—';
  const agentsDir = normalizeRel(extractField(content, 'Agents', 'AgentsDir') || `${AGENTS_ROOT}/${slug}`);
  const outputDir = normalizeRel(extractField(content, 'Output', 'OutputDir') || `${OUTPUT_ROOT}/${slug}`);
  const logsDir = normalizeRel(
    extractField(content, 'Logs', 'LogsDir') || `${normalizeRel(LOGS_ROOT)}/${slug}`
  );
  const genomes = parseListSection(content, 'Genomes');
  const agentGenomes = parseListSection(content, 'AgentGenomes');
  const latestSession = normalizeRel(
    extractField(content, 'LatestSession', 'Latest Session', 'UltimaSessao', 'DerniereSession')
  );

  const agents = await collectDirStats(targetDir, agentsDir, {
    filter: (entry, stat) => stat.isFile() && entry.endsWith('.md')
  });
  const specialists = agents.entries.filter((entry) => entry.name !== 'orquestrador.md');

  const sessions = await collectDirStats(targetDir, outputDir, {
    filter: (entry, stat) => stat.isFile() && SESSION_HTML_RE.test(entry) && entry !== 'latest.html'
  });
  const logs = await collectDirStats(targetDir, logsDir, {
    filter: (entry, stat) => stat.isFile()
  });
  const outputExists = await pathExists(path.join(targetDir, outputDir));
  const latestHtml = latestSession
    ? {
        absPath: path.join(targetDir, latestSession),
        mtime: (await fs.stat(path.join(targetDir, latestSession)).catch(() => null))?.mtime || null
      }
    : await getLatestHtml(path.join(targetDir, outputDir));

  const metaStat = await fs.stat(filePath).catch(() => null);

  return {
    slug,
    file,
    metadataPath: filePath,
    squadName,
    mode,
    goal,
    agentsDir,
    outputDir,
    logsDir,
    genomes,
    agentGenomes,
    latestSession,
    agentCount: agents.entries.length,
    specialistCount: specialists.length,
    sessionCount: sessions.entries.length,
    logCount: logs.entries.length,
    latestHtml: latestHtml
      ? normalizeRel(path.relative(targetDir, latestHtml.absPath))
      : outputExists && (await pathExists(path.join(targetDir, outputDir, 'session.html')))
        ? normalizeRel(path.join(outputDir, 'session.html'))
        : '—',
    mtime: latestHtml?.mtime || metaStat?.mtime || null
  };
}

async function buildSquadRecordFromPackageDir(targetDir, slug) {
  const packageDir = path.join(targetDir, SQUADS_DIR, slug);
  const manifestPath = path.join(packageDir, 'squad.manifest.json');
  const summaryPath = path.join(packageDir, 'squad.md');
  const manifestRaw = await fs.readFile(manifestPath, 'utf8').catch(() => null);
  if (!manifestRaw) return null;

  let manifest = null;
  try {
    manifest = JSON.parse(manifestRaw);
  } catch {
    manifest = null;
  }
  if (!manifest || typeof manifest !== 'object') return null;

  const summaryContent = await fs.readFile(summaryPath, 'utf8').catch(() => null);
  const rules = manifest.rules && typeof manifest.rules === 'object' ? manifest.rules : {};
  const packageInfo = manifest.package && typeof manifest.package === 'object' ? manifest.package : {};
  const investigation = manifest.investigation && typeof manifest.investigation === 'object'
    ? manifest.investigation
    : null;
  const agentsDir = normalizeRel(packageInfo.agentsDir || path.join(SQUADS_DIR, slug, 'agents'));
  const outputDir = normalizeRel(rules.outputsDir || `${OUTPUT_ROOT}/${slug}`);
  const logsDir = normalizeRel(rules.logsDir || `${normalizeRel(LOGS_ROOT)}/${slug}`);
  const latestSession = normalizeRel(
    extractField(summaryContent || '', 'LatestSession', 'Latest Session', 'UltimaSessao', 'DerniereSession') ||
      `${OUTPUT_ROOT}/${slug}/latest.html`
  );
  const genomeBindings = mergeGenomeBindings({
    blueprintBindings: manifest.genomeBindings,
    manifestBindings: manifest.genomeBindings || manifest.genomes,
    legacyExecutors: manifest.executors
  });
  const flattenedBindings = flattenGenomeBindings(genomeBindings);
  const genomes = flattenedBindings
    .filter((item) => item.scope === 'squad')
    .map((item) => item.slug);
  const agentGenomes = flattenedBindings
    .filter((item) => item.scope !== 'squad' && item.agentSlug)
    .map((item) => `${item.agentSlug}: ${item.slug}`);
  const fallbackGenomes = genomes.length > 0 ? genomes : parseListSection(summaryContent || '', 'Genomes');
  const fallbackAgentGenomes =
    agentGenomes.length > 0 ? agentGenomes : parseListSection(summaryContent || '', 'AgentGenomes');

  const agents = await collectDirStats(targetDir, agentsDir, {
    filter: (entry, stat) => stat.isFile() && entry.endsWith('.md')
  });
  const specialists = agents.entries.filter(
    (entry) => entry.name !== 'orquestrador.md' && entry.name !== 'agents.md'
  );

  const sessions = await collectDirStats(targetDir, outputDir, {
    filter: (entry, stat) => stat.isFile() && SESSION_HTML_RE.test(entry) && entry !== 'latest.html'
  });
  const logs = await collectDirStats(targetDir, logsDir, {
    filter: (entry, stat) => stat.isFile()
  });
  const outputExists = await pathExists(path.join(targetDir, outputDir));
  const latestHtml = latestSession
    ? {
        absPath: path.join(targetDir, latestSession),
        mtime: (await fs.stat(path.join(targetDir, latestSession)).catch(() => null))?.mtime || null
      }
    : await getLatestHtml(path.join(targetDir, outputDir));
  const manifestStat = await fs.stat(manifestPath).catch(() => null);

  return {
    slug,
    file: `${slug}/squad.manifest.json`,
    metadataPath: manifestPath,
    squadName: String(manifest.name || slug),
    mode: String(manifest.mode || 'content'),
    goal: String(manifest.goal || '—'),
    agentsDir,
    outputDir,
    logsDir,
    genomes: fallbackGenomes,
    agentGenomes: fallbackAgentGenomes,
    latestSession,
    agentCount: agents.entries.length,
    specialistCount: specialists.length,
    sessionCount: sessions.entries.length,
    logCount: logs.entries.length,
    latestHtml: latestHtml
      ? normalizeRel(path.relative(targetDir, latestHtml.absPath))
      : outputExists && (await pathExists(path.join(targetDir, outputDir, 'session.html')))
        ? normalizeRel(path.join(outputDir, 'session.html'))
        : '—',
    mtime: latestHtml?.mtime || manifestStat?.mtime || null,
    tierSummary: buildTierSummary(manifest.executors),
    estimatedCost: estimateRunCost(manifest.executors),
    localeScope: String(manifest.locale_scope || 'universal'),
    localeRationale: manifest.locale_rationale || null,
    domainTier: manifest.domainClassification?.tier || null,
    investigationSlug: investigation?.slug || null,
    investigationPath: investigation?.path ? normalizeRel(investigation.path) : null,
    sourceDocsCount: Array.isArray(manifest.sourceDocs) ? manifest.sourceDocs.length : 0
  };
}

async function buildFallbackSquadRecords(targetDir, metadataSlugs) {
  const agentsRootAbs = path.join(targetDir, AGENTS_ROOT);
  const entries = await readDirNames(agentsRootAbs);
  const squads = [];

  for (const entry of entries) {
    if (metadataSlugs.has(entry)) continue;
    const absDir = path.join(agentsRootAbs, entry);
    const stat = await fs.stat(absDir).catch(() => null);
    if (!stat?.isDirectory()) continue;

    const agents = await collectDirStats(targetDir, path.join(AGENTS_ROOT, entry), {
      filter: (name, itemStat) => itemStat.isFile() && name.endsWith('.md')
    });
    if (agents.entries.length === 0) continue;

    const sessions = await collectDirStats(targetDir, path.join(OUTPUT_ROOT, entry), {
      filter: (name, itemStat) => itemStat.isFile() && SESSION_HTML_RE.test(name) && name !== 'latest.html'
    });
    const logs = await collectDirStats(targetDir, path.join(LOGS_ROOT, entry), {
      filter: (name, itemStat) => itemStat.isFile()
    });
    const latestHtml = await getLatestHtml(path.join(targetDir, OUTPUT_ROOT, entry));

    squads.push({
      slug: entry,
      file: `${entry}.md`,
      metadataPath: path.join(targetDir, SQUADS_DIR, `${entry}.md`),
      squadName: entry,
      mode: '—',
      goal: '—',
      agentsDir: `${AGENTS_ROOT}/${entry}`,
      outputDir: `${OUTPUT_ROOT}/${entry}`,
      logsDir: `${normalizeRel(LOGS_ROOT)}/${entry}`,
      genomes: [],
      agentGenomes: [],
      latestSession: latestHtml ? normalizeRel(path.relative(targetDir, latestHtml.absPath)) : '—',
      agentCount: agents.entries.length,
      specialistCount: agents.entries.filter((item) => item.name !== 'orquestrador.md').length,
      sessionCount: sessions.entries.length,
      logCount: logs.entries.length,
      latestHtml: latestHtml ? normalizeRel(path.relative(targetDir, latestHtml.absPath)) : '—',
      mtime: latestHtml?.mtime || stat.mtime
    });
  }

  return squads;
}

function validSessionIdentity(value) {
  return typeof value === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/.test(value);
}

async function readSessionStatus(targetDir, squad, session) {
  if (!validSessionIdentity(squad) || !validSessionIdentity(session)) return { ok: false, error: 'invalid_identity' };
  const planPath = path.join(targetDir, SQUADS_DIR, squad, 'sessions', session, 'plan.json');
  let plan;
  try { plan = JSON.parse(await fs.readFile(planPath, 'utf8')); }
  catch (error) { return { ok: false, error: error.code === 'ENOENT' ? 'plan_not_found' : 'plan_unreadable', session_id: session, squad }; }
  if (!Array.isArray(plan.tasks) || (plan.session_id && plan.session_id !== session) || (plan.squad_slug && plan.squad_slug !== squad)) {
    return { ok: false, error: 'invalid_plan', session_id: session, squad };
  }
  const completed = plan.tasks.filter(task => ['completed', 'done'].includes(task.status));
  const unfinished = plan.tasks.filter(task => !completed.includes(task));
  let status = plan.execution_status === 'completed' && unfinished.length ? 'incomplete' : plan.execution_status || 'prepared';
  let ownerState = 'none';
  if (status === 'running') {
    let db;
    try {
      db = new Database(path.join(path.dirname(planPath), 'coordination.sqlite'), { readonly: true, fileMustExist: true });
      const owner = db.prepare('SELECT pid, host FROM execution_owner WHERE id = 1').get();
      if (owner?.host === os.hostname()) {
        try { process.kill(owner.pid, 0); ownerState = 'alive'; }
        catch (error) { ownerState = error.code === 'ESRCH' ? 'missing' : 'unknown'; }
      } else ownerState = owner ? 'remote' : 'missing';
    } catch { ownerState = 'unknown'; }
    finally { db?.close(); }
    if (ownerState === 'missing' || ownerState === 'unknown') status = 'reconciliation_required';
  }
  return {
    ok: true, squad, session_id: session, goal: plan.goal || null, status,
    plan_path: path.relative(targetDir, planPath).replace(/\\/g, '/'),
    revision: plan.revision || 0,
    tasks: { total: plan.tasks.length, completed: completed.length, pending: unfinished.length },
    active_tasks: plan.tasks.filter(task => ['running', 'in_progress'].includes(task.status)).map(task => task.id),
    blockers: unfinished.map(task => ({ id: task.id, status: task.status, reason: task.result?.error || task.result?.reflection?.summary || null,
      waiting_for: (task.dependencies || []).filter(id => !completed.some(done => done.id === id)) })),
    evidence: completed.map(task => ({ task_id: task.id, execution: task.result?.execution_evidence || null,
      delivery: task.result?.delivery_evidence || null, completed_at: task.result?.completed_at || null })),
    budget_usage: plan.budget_state || null,
    heartbeat: null,
    execution_owner: ownerState,
    next_action: status === 'completed' ? null : status === 'reconciliation_required'
      ? 'Reconcile interrupted task effects before resuming this session.'
      : status === 'running' ? 'Wait for the active executor; query this session again.'
        : `aioson squad resume . --squad=${squad} --session=${session}`
  };
}

async function runSquadStatus({ args, options = {}, logger, t }) {
  const targetDir = resolveTargetDir(args);
  if (options.session || options.plan) {
    const result = await readSessionStatus(targetDir, options.squad || options.s, options.session || options.plan);
    if (result.ok) {
      logger.log(`Session ${result.session_id}: ${result.status}; ${result.tasks.completed}/${result.tasks.total} completed`);
      logger.log(`Goal: ${result.goal || '(unspecified)'}`);
      for (const blocker of result.blockers) logger.log(`  ${blocker.id}: ${blocker.status}; ${blocker.reason || blocker.waiting_for.join(', ')}`);
      if (result.next_action) logger.log(`Next: ${result.next_action}`);
    } else logger.error(result.error);
    return result;
  }
  const squadsDir = path.join(targetDir, SQUADS_DIR);
  const metadataEntries = await fs.readdir(squadsDir, { withFileTypes: true }).catch(() => []);
  const packageDirs = metadataEntries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter(Boolean);
  const mdFiles = metadataEntries
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .filter((file) => file.endsWith('.md') && !SKIP_FILES.has(file));

  const squads = [];
  for (const slug of packageDirs) {
    const squad = await buildSquadRecordFromPackageDir(targetDir, slug);
    if (squad) squads.push(squad);
  }

  for (const file of mdFiles) {
    if (packageDirs.includes(file.replace(/\.md$/, ''))) continue;
    const squad = await buildSquadRecordFromMetadata(targetDir, file);
    if (squad) squads.push(squad);
  }

  const fallbackSquads = await buildFallbackSquadRecords(
    targetDir,
    new Set(squads.map((item) => item.slug))
  );
  squads.push(...fallbackSquads);

  // Autorun state comes from its portable plan, independently of rendered HTML.
  for (const squad of squads) {
    const sessionsDir = path.join(targetDir, SQUADS_DIR, squad.slug, 'sessions');
    const entries = await fs.readdir(sessionsDir, { withFileTypes: true }).catch(() => []);
    squad.autorun_sessions = [];
    for (const entry of entries.filter((item) => item.isDirectory())) {
      try {
        const session = await readSessionStatus(targetDir, squad.slug, entry.name);
        if (!session.ok) {
          if (session.error !== 'plan_not_found') squad.autorun_sessions.push({ session_id: entry.name, status: 'unreadable', error: session.error });
          continue;
        }
        squad.autorun_sessions.push({
          ...session,
          session_id: entry.name,
          completed: session.tasks.completed,
          total: session.tasks.total
        });
      } catch (error) {
        if (error.code !== 'ENOENT') squad.autorun_sessions.push({ session_id: entry.name, status: 'unreadable', error: error.message });
      }
    }
  }

  if (squads.length === 0) {
    logger.log(t('squad_status.no_squad'));
    logger.log(t('squad_status.hint'));
    return { ok: true, active: false, squads: [] };
  }

  squads.sort((a, b) => {
    if (!a.mtime) return 1;
    if (!b.mtime) return -1;
    return b.mtime - a.mtime;
  });

  logger.log(t('squad_status.squads_found', { count: squads.length }));
  logger.log('');

  for (let i = 0; i < squads.length; i++) {
    const squad = squads[i];
    const marker = i === 0 ? ` ${t('squad_status.most_recent')}` : '';
    logger.log(t('squad_status.squad_item', { file: squad.file, marker }));
    logger.log(t('squad_status.name', { value: squad.squadName }));
    logger.log(t('squad_status.mode', { value: squad.mode }));
    logger.log(t('squad_status.goal', { value: squad.goal }));
    for (const session of squad.autorun_sessions) {
      logger.log(`  Autorun ${session.session_id}: ${session.status}; ${session.completed ?? '?'}/${session.total ?? '?'} completed`);
      if (session.budget_usage) {
        logger.log(`    Estimated token reservations: ${session.budget_usage.estimated_tokens}; provider measurement unavailable`);
        const pause = session.budget_usage.pause;
        if (pause) logger.log(`    Budget pause: ${pause.scope}, task ${pause.task_id}, limit ${pause.limit}; resume with --plan=${session.session_id} after adjusting the limit`);
      }
    }
    logger.log(
      t('squad_status.agents', {
        specialists: squad.specialistCount,
        total: squad.agentCount,
        path: squad.agentsDir
      })
    );
    logger.log(
      t('squad_status.sessions', {
        count: squad.sessionCount,
        path: squad.outputDir
      })
    );
    logger.log(t('squad_status.latest_html', { value: squad.latestHtml }));
    logger.log(
      t('squad_status.logs', {
        count: squad.logCount,
        path: squad.logsDir
      })
    );
    logger.log(
      t('squad_status.genomes', {
        count: squad.genomes.length,
        agent_count: squad.agentGenomes.length
      })
    );
    if (squad.tierSummary) {
      logger.log(t('squad_status.model_tiers', { value: squad.tierSummary }));
    }
    if (squad.estimatedCost != null) {
      logger.log(t('squad_status.estimated_cost', { value: squad.estimatedCost.toFixed(3) }));
    }
    if (squad.localeScope) {
      logger.log(`  Locale scope: ${squad.localeScope}${squad.localeRationale ? ` — ${squad.localeRationale}` : ''}`);
    }
    if (squad.domainTier) {
      logger.log(`  Domain tier: ${squad.domainTier}`);
    }
    if (squad.investigationSlug) {
      logger.log(`  Investigation: ${squad.investigationSlug}${squad.investigationPath ? ` → ${squad.investigationPath}` : ''}`);
    }
    if (squad.sourceDocsCount > 0) {
      logger.log(`  Source docs: ${squad.sourceDocsCount}`);
    }
    if (i < squads.length - 1) logger.log('');
  }

  return {
    ok: true,
    active: true,
    squads,
    count: squads.length
  };
}

module.exports = { runSquadStatus, readSessionStatus, validSessionIdentity };
