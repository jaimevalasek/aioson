'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const { openRuntimeDb, startTask, startRun, updateRun, updateTask, appendRunEvent, attachArtifact } = require('../runtime-store');

function nowIso() {
  return new Date().toISOString();
}

function createLearningId() {
  return `learning-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function parseFrontmatter(content) {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return null;
  const result = {};
  for (const line of match[1].split(/\r?\n/)) {
    const colonIdx = line.indexOf(':');
    if (colonIdx === -1) continue;
    const key = line.slice(0, colonIdx).trim();
    const value = line.slice(colonIdx + 1).trim().replace(/^["']|["']$/g, '');
    if (key) result[key] = value === 'null' ? null : value;
  }
  return result;
}

function extractSection(content, sectionName) {
  const escapedSection = String(sectionName).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`(?:^|\\r?\\n)#{1,4}\\s+${escapedSection}[^\\n]*\\r?\\n([\\s\\S]*?)(?=\\r?\\n#{1,4}\\s+|$)`, 'i');
  const match = content.match(re);
  if (!match) return '';
  return match[1].trim();
}

function extractListItems(content, sectionName) {
  const section = extractSection(content, sectionName);
  const items = [];
  for (const line of section.split(/\r?\n/)) {
    const trimmed = line.replace(/^[-*]\s*/, '').trim();
    if (trimmed && trimmed.length > 2) items.push(trimmed);
  }
  return items;
}

function extractTaggedLearnings(content) {
  const section = extractSection(content, 'Learnings');
  const learnings = [];
  for (const line of section.split(/\r?\n/)) {
    const trimmed = line.replace(/^[-*]\s*/, '').trim();
    if (!trimmed) continue;
    const typeMatch = trimmed.match(/^\[(process|domain|quality|preference|gotcha|resolution)\]\s+(.+)/i);
    if (typeMatch) {
      const tag = typeMatch[1].toLowerCase();
      const title = typeMatch[2].trim();
      // cross-tool-project-knowledge: gotcha/resolution are project-knowledge
      // signals — persisted under type='quality' with the real signal in `kind`
      // (project_learnings.type CHECK only allows the 4 base types).
      if (tag === 'gotcha' || tag === 'resolution') {
        learnings.push({ type: 'quality', kind: tag, title });
      } else {
        learnings.push({ type: tag, kind: null, title });
      }
    } else if (trimmed.length > 5) {
      learnings.push({ type: 'process', kind: null, title: trimmed });
    }
  }
  return learnings;
}

function extractSummary(content) {
  const section = extractSection(content, 'Summary');
  if (section) return section.split(/\r?\n/)[0].trim();
  // Fallback: first non-empty line of body after frontmatter
  const body = content.replace(/^---[\s\S]*?---\r?\n/, '');
  const firstHeading = body.match(/^#\s+(.+)/m);
  return firstHeading ? firstHeading[1].trim() : null;
}

// cross-tool-project-knowledge: app-level allow-list for project_learnings.kind.
// The column carries no schema CHECK by repo convention (see
// learning-loop-migration.js Phase 4). NULL = not a project-knowledge learning.
const ALLOWED_LEARNING_KINDS = new Set(['gotcha', 'resolution']);

function normalizeKind(kind) {
  return ALLOWED_LEARNING_KINDS.has(kind) ? kind : null;
}

function upsertProjectLearning(db, { title, type, kind, featureSlug, evidence, sourceSession }) {
  const safeKind = normalizeKind(kind);
  const existing = db.prepare(
    'SELECT learning_id, frequency, kind FROM project_learnings WHERE title = ? AND (feature_slug = ? OR (feature_slug IS NULL AND ? IS NULL))'
  ).get(title, featureSlug || null, featureSlug || null);

  if (existing) {
    // Enrich kind only when previously unset — a plain re-tag must not clobber
    // an existing classification.
    const nextKind = existing.kind || safeKind || null;
    db.prepare(
      'UPDATE project_learnings SET frequency = ?, last_reinforced = ?, updated_at = ?, kind = ? WHERE learning_id = ?'
    ).run(existing.frequency + 1, nowIso(), nowIso(), nextKind, existing.learning_id);
    return { action: 'updated', learningId: existing.learning_id };
  }

  const learningId = createLearningId();
  db.prepare(`
    INSERT INTO project_learnings
      (learning_id, feature_slug, type, kind, title, confidence, frequency, last_reinforced,
       applies_to, source_session, evidence, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, 'medium', 1, ?, 'project', ?, ?, 'active', ?, ?)
  `).run(learningId, featureSlug || null, type, safeKind, title, nowIso(), sourceSession || null, evidence || null, nowIso(), nowIso());
  return { action: 'inserted', learningId };
}

async function markAsProcessed(filePath, processedAt) {
  const content = await fs.readFile(filePath, 'utf8');
  const ts = processedAt || nowIso();

  // If file already has processed_at, skip
  if (/^processed_at:/m.test(content)) return;

  // Inject processed_at into frontmatter
  const updated = content.replace(/^(---\r?\n[\s\S]*?)(---)/m, `$1processed_at: ${ts}\n$2`);
  await fs.writeFile(filePath, updated, 'utf8');
}

async function processDevlogFile(db, filePath) {
  const content = await fs.readFile(filePath, 'utf8');
  const fm = parseFrontmatter(content);

  if (!fm || !fm.agent) {
    return { status: 'malformed', file: path.basename(filePath), reason: 'missing frontmatter or agent field' };
  }

  // Skip already-processed devlogs
  if (fm.processed_at) {
    return { status: 'skipped', file: path.basename(filePath), reason: 'already processed' };
  }

  const body = content.replace(/^---[\s\S]*?---\r?\n?/, '');
  const summary = extractSummary(body) || `@${fm.agent} devlog`;
  const featureSlug = fm.feature && fm.feature !== 'project' ? fm.feature : null;
  const sessionKey = fm.session_key || null;
  const startedAt = fm.started_at || fm.session_start || nowIso();
  const finishedAt = fm.finished_at || fm.session_end || nowIso();
  const status = fm.status === 'partial' ? 'running' : 'completed';
  const verdict = fm.verdict ? String(fm.verdict).trim().toUpperCase() : null;
  const planStepId = fm.plan_step || null;

  // Create task + run
  const taskKey = startTask(db, {
    title: `devlog: ${summary}`,
    squadSlug: null,
    sessionKey: sessionKey || undefined,
    status,
    createdBy: fm.agent
  });

  const runKey = startRun(db, {
    taskKey,
    agentName: fm.agent,
    agentKind: 'devlog',
    squadSlug: null,
    title: `@${fm.agent} devlog`,
    message: summary
  });

  // Register artifacts
  const artifactPaths = extractListItems(body, 'Artifacts');
  for (const filePath_ of artifactPaths) {
    // Only register file-like entries (containing a slash or dot)
    if (/[/.]/.test(filePath_)) {
      attachArtifact(db, { runKey, agentName: fm.agent, kind: 'output', filePath: filePath_ });
    }
  }

  // Register decisions as execution events
  const decisions = extractListItems(body, 'Decisions');
  for (const decision of decisions) {
    appendRunEvent(db, {
      runKey,
      eventType: 'decision',
      phase: 'devlog',
      status: 'completed',
      message: decision,
      createdAt: finishedAt
    });
  }

  // Upsert learnings
  const learnings = extractTaggedLearnings(body);
  for (const { type, title, kind } of learnings) {
    upsertProjectLearning(db, { title, type, kind, featureSlug, sourceSession: sessionKey || path.basename(filePath) });
  }

  // Log verdict if present
  if (verdict && verdict !== 'NULL') {
    appendRunEvent(db, {
      runKey,
      eventType: 'qa_verdict',
      phase: 'devlog',
      status: 'completed',
      message: `QA VERDICT: ${verdict}`,
      verdict,
      planStepId,
      createdAt: finishedAt
    });
  }

  // Close run
  updateRun(db, {
    runKey,
    status,
    summary,
    finishedAt
  });

  if (status === 'completed') {
    updateTask(db, { taskKey, status: 'completed', finishedAt });
  }

  // Mark devlog as processed
  await markAsProcessed(filePath, nowIso());

  return {
    status: 'ok',
    file: path.basename(filePath),
    runKey,
    taskKey,
    featureSlug,
    artifactsCount: artifactPaths.filter((p) => /[/.]/.test(p)).length,
    decisionsCount: decisions.length,
    learningsCount: learnings.length,
    verdict: verdict && verdict !== 'NULL' ? verdict : null
  };
}

async function runDevlogProcess({ args, options = {}, logger }) {
  const targetDir = path.resolve(process.cwd(), args[0] || '.');
  const logsDir = path.join(targetDir, 'aioson-logs');

  let entries;
  try {
    entries = await fs.readdir(logsDir);
  } catch {
    if (!options.json) logger.log('No aioson-logs/ directory found — nothing to process.');
    return { ok: true, processed: 0, skipped: 0, malformed: 0 };
  }

  const devlogFiles = entries
    .filter((f) => f.startsWith('devlog-') && f.endsWith('.md'))
    .sort();

  if (devlogFiles.length === 0) {
    if (!options.json) logger.log('No devlog files found.');
    return { ok: true, processed: 0, skipped: 0, malformed: 0 };
  }

  const { db, dbPath } = await openRuntimeDb(targetDir);
  const results = [];

  try {
    for (const file of devlogFiles) {
      const result = await processDevlogFile(db, path.join(logsDir, file));
      results.push(result);
    }
  } finally {
    db.close();
  }

  const processed = results.filter((r) => r.status === 'ok');
  const skipped = results.filter((r) => r.status === 'skipped');
  const malformed = results.filter((r) => r.status === 'malformed');

  const totalArtifacts = processed.reduce((s, r) => s + (r.artifactsCount || 0), 0);
  const totalLearnings = processed.reduce((s, r) => s + (r.learningsCount || 0), 0);

  if (options.json) {
    return { ok: true, results, processed: processed.length, skipped: skipped.length, malformed: malformed.length, totalArtifacts, totalLearnings, dbPath };
  }

  logger.log(`Devlog Processing — ${path.basename(targetDir)}`);
  logger.log('─'.repeat(50));

  if (results.length === 0) {
    logger.log('No devlogs to process.');
  } else {
    logger.log(`Found ${devlogFiles.length} devlog(s):`);
    logger.log('');
    for (const r of results) {
      if (r.status === 'ok') {
        logger.log(`${r.file}`);
        logger.log(`  Agent: @${r.featureSlug ? `${r.featureSlug}` : 'project'} | run: ${r.runKey}`);
        if (r.artifactsCount > 0) logger.log(`  Artifacts: ${r.artifactsCount} registered ✓`);
        if (r.decisionsCount > 0) logger.log(`  Decisions: ${r.decisionsCount} logged ✓`);
        if (r.learningsCount > 0) logger.log(`  Learnings: ${r.learningsCount} upserted ✓`);
        if (r.verdict) logger.log(`  Verdict: ${r.verdict} ✓`);
      } else if (r.status === 'skipped') {
        logger.log(`${r.file} — skipped (${r.reason})`);
      } else {
        logger.log(`${r.file} — ⚠ ${r.reason}. Fix frontmatter and re-run.`);
      }
    }
  }

  logger.log('─'.repeat(50));
  logger.log(`Processed: ${processed.length}/${devlogFiles.length} devlogs`);
  if (totalLearnings > 0) logger.log(`New learnings: ${totalLearnings} (queued for brains export)`);
  if (totalArtifacts > 0) logger.log(`Artifacts registered: ${totalArtifacts}`);
  if (malformed.length > 0) logger.log(`Malformed (skipped): ${malformed.length}`);

  return { ok: true, results, processed: processed.length, skipped: skipped.length, malformed: malformed.length, totalArtifacts, totalLearnings, dbPath };
}

module.exports = { runDevlogProcess, processDevlogFile, extractTaggedLearnings, upsertProjectLearning };
