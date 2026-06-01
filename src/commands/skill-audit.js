'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');

const CHARS_PER_TOKEN = 4;
const ROUTER_TARGET_CHARS = 4000;
const ROUTER_HARD_CHARS = 8000;
const REFERENCE_TARGET_CHARS = 12000;
const REFERENCE_HARD_CHARS = 24000;

const SKILL_ROOTS = [
  { rel: '.aioson/skills', category: 'builtin_skill' },
  { rel: '.aioson/installed-skills', category: 'installed_skill' },
  { rel: 'template/.aioson/skills', category: 'template_skill' }
];

function estimateTokens(chars) {
  return Math.ceil(chars / CHARS_PER_TOKEN);
}

function formatKb(chars) {
  return `${(chars / 1024).toFixed(1)}KB`;
}

function formatTokens(tokens) {
  return `~${tokens.toLocaleString()} tok`;
}

function normalizeRel(projectDir, filePath) {
  return path.relative(projectDir, filePath).split(path.sep).join('/');
}

function classifySkillFile(relativePath) {
  const base = path.basename(relativePath);
  const normalized = relativePath.split('/').join('/');

  if (base === 'SKILL.md') {
    return {
      kind: 'router',
      targetChars: ROUTER_TARGET_CHARS,
      hardChars: ROUTER_HARD_CHARS
    };
  }

  if (normalized.includes('/references/')) {
    return {
      kind: 'reference',
      targetChars: REFERENCE_TARGET_CHARS,
      hardChars: REFERENCE_HARD_CHARS
    };
  }

  return {
    kind: 'support',
    targetChars: REFERENCE_TARGET_CHARS,
    hardChars: REFERENCE_HARD_CHARS
  };
}

async function collectMarkdownFiles(dirPath) {
  const files = [];
  let entries;

  try {
    entries = await fs.readdir(dirPath, { withFileTypes: true });
  } catch {
    return files;
  }

  for (const entry of entries) {
    const filePath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      files.push(...await collectMarkdownFiles(filePath));
      continue;
    }

    if (entry.isFile() && entry.name.endsWith('.md')) {
      files.push(filePath);
    }
  }

  return files;
}

async function scanSkillFile(filePath, projectDir, category) {
  let content;
  try {
    content = await fs.readFile(filePath, 'utf8');
  } catch {
    return null;
  }

  const relativePath = normalizeRel(projectDir, filePath);
  const classification = classifySkillFile(relativePath);
  const chars = content.length;
  const status =
    chars > classification.hardChars
      ? 'over_hard'
      : chars > classification.targetChars
        ? 'over_target'
        : 'ok';

  return {
    file: relativePath,
    category,
    kind: classification.kind,
    chars,
    tokens: estimateTokens(chars),
    target_chars: classification.targetChars,
    hard_chars: classification.hardChars,
    status
  };
}

function summarizeFiles(files) {
  const totals = {
    files: files.length,
    chars: files.reduce((sum, file) => sum + file.chars, 0),
    tokens: files.reduce((sum, file) => sum + file.tokens, 0),
    over_target: files.filter((file) => file.status === 'over_target').length,
    over_hard: files.filter((file) => file.status === 'over_hard').length,
    routers: files.filter((file) => file.kind === 'router').length,
    references: files.filter((file) => file.kind === 'reference').length,
    support: files.filter((file) => file.kind === 'support').length
  };

  totals.by_category = {};
  totals.by_kind = {};
  for (const file of files) {
    totals.by_category[file.category] = (totals.by_category[file.category] || 0) + file.tokens;
    totals.by_kind[file.kind] = (totals.by_kind[file.kind] || 0) + file.tokens;
  }

  return totals;
}

async function runSkillAudit({ args, options = {}, logger }) {
  const targetDir = path.resolve(process.cwd(), args[0] || '.');
  const files = [];
  const roots = SKILL_ROOTS.map((root) => root.rel);

  for (const root of SKILL_ROOTS) {
    const rootPath = path.join(targetDir, ...root.rel.split('/'));
    const markdownFiles = await collectMarkdownFiles(rootPath);
    for (const filePath of markdownFiles) {
      const result = await scanSkillFile(filePath, targetDir, root.category);
      if (result) files.push(result);
    }
  }

  files.sort((a, b) => b.chars - a.chars);

  if (files.length === 0) {
    if (!options.json) logger.log('No skill markdown files found.');
    return { ok: false, reason: 'no_files', roots };
  }

  const totals = summarizeFiles(files);

  if (options.json) {
    return { ok: true, roots, totals, files };
  }

  logger.log('Skill Audit');
  logger.log('─'.repeat(72));
  logger.log(`Roots          : ${roots.join(', ')}`);
  logger.log(`Files scanned  : ${totals.files}`);
  logger.log(`Total tokens   : ${formatTokens(totals.tokens)}`);
  logger.log(`Routers        : ${totals.routers}   References: ${totals.references}   Support: ${totals.support}`);
  logger.log(`Over hard limit: ${totals.over_hard}   Over target: ${totals.over_target}`);
  logger.log('');

  const COL = { file: 48, kind: 12, category: 18, tokens: 12 };
  logger.log(
    'File'.padEnd(COL.file) +
    'Kind'.padEnd(COL.kind) +
    'Category'.padEnd(COL.category) +
    'Tokens'.padEnd(COL.tokens) +
    'Status'
  );
  logger.log('─'.repeat(72));

  for (const file of files) {
    const statusLabel = { ok: 'ok', over_target: 'target', over_hard: 'hard' }[file.status];
    logger.log(
      file.file.slice(0, COL.file - 1).padEnd(COL.file) +
      file.kind.padEnd(COL.kind) +
      file.category.padEnd(COL.category) +
      formatTokens(file.tokens).padEnd(COL.tokens) +
      statusLabel
    );
  }

  return { ok: true, roots, totals };
}

module.exports = {
  runSkillAudit
};
