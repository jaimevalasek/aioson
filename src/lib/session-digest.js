'use strict';

/**
 * The session-start digest (`aioson context:digest`). The gateway block made
 * every session, before its first answer, read project.context.md in full, run
 * context:validate --json, read the learnings index and run the operator-memory
 * recall: 10-12 KB on a real project, most of it re-read by the activated
 * agent's own kernel. The digest is one compact read carrying what the session
 * acts on — the same validator's verdict, the project's frontmatter essentials
 * and the names of its sections, the memory titles and learnings that match
 * the request plus the top-ranked ones — and the commands that open each full
 * version. Nothing binding is dropped: validation still decides setup, and
 * every cut list says how many it left out and how to read them.
 */

const fs = require('node:fs');
const path = require('node:path');
const { validateProjectContextFile } = require('../context');
const { foldText } = require('../operator-memory/project-scope');
const { STOPWORDS } = require('../operator-memory/loader');

// The frontmatter fields kernels and routing read; the rest stays in the file.
const ESSENTIAL_FIELDS = [
  'project_name', 'project_type', 'profile', 'framework', 'classification',
  'interaction_language', 'conversation_language', 'design_skill', 'test_runner'
];
const MEMORY_MATCHED = 8;
const MEMORY_TOP = 8;
const LEARNINGS_MAX = 6;
const ISSUES_MAX = 6;

function taskWords(text) {
  return [...new Set(foldText(String(text || '')).split(/[^a-z0-9]+/).filter((word) => word.length >= 3 && !STOPWORDS.has(word)))];
}

function readText(file) {
  try { return fs.readFileSync(file, 'utf8'); } catch { return null; }
}

function bodySections(content) {
  const body = String(content || '').replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, '');
  return [...body.matchAll(/^##\s+(.+?)\s*$/gm)].map((match) => match[1].replace(/\s*\(.*\)$/, '').trim()).filter(Boolean);
}

async function validationPart(targetDir) {
  const result = await validateProjectContextFile(targetDir);
  const rel = '.aioson/context/project.context.md';
  if (result.valid) {
    const essentials = {};
    for (const field of ESSENTIAL_FIELDS) {
      const value = result.data && result.data[field];
      if (value !== undefined && value !== null && value !== '') essentials[field] = value;
    }
    if (result.data && result.data.web3_enabled === true) essentials.web3_enabled = true;
    const content = readText(path.join(targetDir, rel)) || '';
    return {
      valid: true,
      project: {
        ...essentials,
        sections: bodySections(content),
        full: `${rel} (${Buffer.byteLength(content)} B): read it when the task touches a listed section; an activated agent's kernel reads it itself`
      }
    };
  }
  const reason = !result.exists ? 'missing_file' : !result.parsed ? 'invalid_frontmatter' : 'invalid_fields';
  return {
    valid: false,
    reason,
    issues: (result.issues || []).slice(0, ISSUES_MAX).map((issue) => issue.id || issue.key),
    next: `read ${rel}; if still invalid after an objectively inferable repair, run /setup (.aioson/agents/setup.md) — details: aioson context:validate . --json`
  };
}

function rulesCount(targetDir) {
  try {
    return fs.readdirSync(path.join(targetDir, '.aioson', 'rules')).filter((name) => name.endsWith('.md') && name.toLowerCase() !== 'readme.md').length;
  } catch {
    return 0;
  }
}

function learningsPart(targetDir, words) {
  const rel = '.aioson/learnings/INDEX.md';
  const content = readText(path.join(targetDir, rel));
  if (content === null) return null;
  const lines = content.split(/\r?\n/).filter((line) => /^\s*[-*]\s+\S/.test(line)).map((line) => line.trim());
  if (lines.length === 0) return { total: 0 };
  const matched = words.length === 0 ? [] : lines.filter((line) => {
    const own = new Set(taskWords(line));
    return words.some((word) => own.has(word));
  }).slice(0, LEARNINGS_MAX);
  return {
    total: lines.length,
    ...(matched.length > 0 ? { matched } : {}),
    ...(lines.length > matched.length ? { rest: `read ${rel} when the task or files change (${lines.length - matched.length} line(s) not shown)` } : {})
  };
}

async function recall(targetDir, options) {
  const { runOpList } = require('../commands/op-list');
  const silent = { log() {}, error() {}, warn() {} };
  return runOpList({ args: [targetDir], options: { json: true, 'titles-only': true, ...options }, logger: silent });
}

async function memoryPart(targetDir, task, env) {
  if (String(env.AIOSON_OPERATOR_MEMORY || '').trim().toLowerCase() === 'false') return { off: true };
  let top;
  try { top = await recall(targetDir, { limit: String(MEMORY_TOP) }); } catch { return { unavailable: true, full: 'aioson op:list . --json --titles-only' }; }
  if (!top || !top.ok) return { unavailable: true, full: 'aioson op:list . --json --titles-only' };
  if (top.identity_source === 'anonymous-fallback') {
    return { identity_source: top.identity_source, skipped: 'anonymous identity: operator memory not loaded (set git user.email)' };
  }
  let matched = { items: {} };
  if (taskWords(task).length > 0) {
    try { matched = await recall(targetDir, { match: task, limit: String(MEMORY_MATCHED) }); } catch { matched = { items: {} }; }
  }
  const items = { ...(matched.items || {}) };
  for (const [slug, title] of Object.entries(top.items || {})) if (!(slug in items)) items[slug] = title;
  const total = Number(top.total) || Object.keys(items).length;
  return {
    total,
    items,
    ...(total > Object.keys(items).length ? { more: `${total - Object.keys(items).length} more: aioson op:list . --json --titles-only --match="<task words>" (--limit=0: all)` } : {}),
    body: 'aioson op:show <slug>'
  };
}

async function activeFeature(targetDir) {
  try {
    const { resolveActiveFeature } = require('../commands/feature-current');
    const active = await resolveActiveFeature(targetDir);
    if (active.ambiguous) return { ambiguous: active.candidates };
    return active.slug ? { slug: active.slug, summary: 'aioson feature:current . --with-summary --json' } : null;
  } catch {
    return null;
  }
}

async function buildSessionDigest(targetDir, { task = '', env = process.env } = {}) {
  const words = taskWords(task);
  const validation = await validationPart(targetDir);
  const learnings = learningsPart(targetDir, words);
  const memory = await memoryPart(targetDir, task, env);
  const feature = await activeFeature(targetDir);
  const rules = rulesCount(targetDir);
  return {
    ok: true,
    ...validation,
    ...(rules > 0 ? { rules } : {}),
    ...(learnings ? { learnings } : {}),
    memory,
    ...(feature ? { feature } : {}),
    routing: 'active /agent: .aioson/agents/<agent>.md (it reads project.context.md itself); none: .aioson/docs/gateway/agent-routing.md'
  };
}

module.exports = { buildSessionDigest, taskWords, ESSENTIAL_FIELDS, MEMORY_MATCHED, MEMORY_TOP };
