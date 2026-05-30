'use strict';

const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const TECHNICAL_KIND_PATTERNS = {
  gotcha: [
    'gotcha',
    'naive',
    'actual behavior',
    'contradicts',
    'hardcoded',
    'pitfall',
    'caveat',
    'csp',
    'x-frame-options',
    'frame-ancestors',
    'iframe'
  ],
  resolution: [
    'resolution',
    'recipe',
    'fix',
    'workaround',
    'root cause',
    'symptom',
    'solution',
    'commands',
    'cleanup',
    'stop-process',
    'orphan',
    'fatal'
  ],
  operatorPreference: [
    'operator preference',
    'user preference',
    'my preference',
    'prefer that',
    'always respond',
    'tone',
    'style preference'
  ]
};

function defaultClaudeProjectHash(targetDir) {
  return path.resolve(targetDir)
    .replace(/\\/g, '/')
    .split('')
    .map((ch) => /[A-Za-z0-9]/.test(ch) ? ch : '-')
    .join('')
    .replace(/-+$/g, '');
}

function normalizeProjectHash(value, targetDir) {
  const hash = String(value || defaultClaudeProjectHash(targetDir)).trim();
  if (!hash || hash.includes('..') || /[\\/]/.test(hash) || !/^[A-Za-z0-9._-]+$/.test(hash)) {
    const err = new Error(`invalid Claude project hash: ${hash || '<empty>'}`);
    err.code = 'bad_project_hash';
    throw err;
  }
  return hash;
}

function stripFrontmatter(content) {
  return String(content || '').replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, '');
}

function titleFromMarkdown(content, filePath) {
  const body = stripFrontmatter(content);
  const heading = body.match(/^#\s+(.+?)\s*$/m);
  if (heading) return heading[1].trim();
  return path.basename(filePath, '.md')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function scorePatterns(text, patterns) {
  const haystack = String(text || '').toLowerCase();
  let score = 0;
  for (const pattern of patterns) {
    if (haystack.includes(pattern)) score += 1;
  }
  return score;
}

function classifyClaudeMemory({ title, body }) {
  const text = `${title}\n${body}`;
  const operatorScore = scorePatterns(text, TECHNICAL_KIND_PATTERNS.operatorPreference);
  const gotchaScore = scorePatterns(text, TECHNICAL_KIND_PATTERNS.gotcha);
  const resolutionScore = scorePatterns(text, TECHNICAL_KIND_PATTERNS.resolution);

  if (operatorScore > 0 && gotchaScore === 0 && resolutionScore === 0) {
    return { classification: 'operator-preference', kind: null };
  }
  if (gotchaScore === 0 && resolutionScore === 0) {
    return { classification: 'unknown', kind: null };
  }
  if (gotchaScore >= resolutionScore) {
    return { classification: 'gotcha', kind: 'gotcha' };
  }
  return { classification: 'resolution', kind: 'resolution' };
}

function extractMarkdownLinks(indexContent) {
  const links = new Set();
  const markdownLink = /\]\(([^)]+?\.md)(?:#[^)]+)?\)/gi;
  let match;
  while ((match = markdownLink.exec(indexContent))) {
    const value = match[1].trim();
    if (!/^[a-z]+:/i.test(value)) links.add(value);
  }

  const plainFile = /^\s*[-*]\s+([A-Za-z0-9_.\/-]+\.md)\s*$/gm;
  while ((match = plainFile.exec(indexContent))) {
    links.add(match[1].trim());
  }
  return [...links];
}

function safeResolveUnder(rootDir, relativePath) {
  const normalized = String(relativePath || '').replace(/\\/g, path.sep).replace(/\//g, path.sep);
  const absolute = path.resolve(rootDir, normalized);
  const root = path.resolve(rootDir);
  if (absolute !== root && !absolute.startsWith(root + path.sep)) return null;
  return absolute;
}

async function linkedMemoryFiles(memoryDir, indexContent) {
  const links = extractMarkdownLinks(indexContent);
  if (links.length > 0) {
    return links
      .map((link) => {
        const absolute = safeResolveUnder(memoryDir, link);
        if (!absolute) return null;
        return { absolute, relative: path.relative(memoryDir, absolute).replace(/\\/g, '/') };
      })
      .filter(Boolean);
  }

  const entries = await fs.readdir(memoryDir, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.md') && entry.name !== 'MEMORY.md')
    .map((entry) => ({
      absolute: path.join(memoryDir, entry.name),
      relative: entry.name
    }));
}

async function loadClaudeMemoryCandidates({ targetDir, projectHash, claudeHome } = {}) {
  const root = path.resolve(targetDir || process.cwd());
  const hash = normalizeProjectHash(projectHash, root);
  const home = path.resolve(claudeHome || process.env.AIOSON_CLAUDE_HOME || os.homedir());
  const memoryDir = path.join(home, '.claude', 'projects', hash, 'memory');
  const indexPath = path.join(memoryDir, 'MEMORY.md');

  let indexContent;
  try {
    indexContent = await fs.readFile(indexPath, 'utf8');
  } catch {
    const err = new Error(`Claude memory not found: ${indexPath}`);
    err.code = 'memory_not_found';
    err.memoryDir = memoryDir;
    throw err;
  }

  const files = await linkedMemoryFiles(memoryDir, indexContent);
  const candidates = [];
  for (const file of files) {
    let content;
    try {
      content = await fs.readFile(file.absolute, 'utf8');
    } catch {
      continue;
    }
    const body = stripFrontmatter(content).trim();
    const title = titleFromMarkdown(content, file.relative);
    const classification = classifyClaudeMemory({ title, body });
    candidates.push({
      index: candidates.length + 1,
      title,
      source: file.relative,
      evidence: body,
      classification: classification.classification,
      kind: classification.kind
    });
  }

  return { hash, memoryDir, indexPath, candidates };
}

function parseSelection(value) {
  if (!value) return null;
  const raw = String(value).trim();
  if (!raw) return null;
  if (raw.toLowerCase() === 'all') return 'all';
  const selected = new Set();
  for (const part of raw.split(',')) {
    const n = Number.parseInt(part.trim(), 10);
    if (Number.isInteger(n) && n > 0) selected.add(n);
  }
  return selected;
}

function isSelected(selection, index) {
  if (!selection) return false;
  if (selection === 'all') return true;
  return selection.has(index);
}

module.exports = {
  defaultClaudeProjectHash,
  loadClaudeMemoryCandidates,
  parseSelection,
  isSelected,
  classifyClaudeMemory
};
