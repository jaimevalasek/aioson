'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');

const CHAIN_AGENTS = Object.freeze([
  'product',
  'sheldon',
  'analyst',
  'architect',
  'ux-ui',
  'pm',
  'orchestrator',
  'dev',
  'qa'
]);

const FEATURE_DOSSIER_HEADER = '## Feature dossier';

function resolveProjectRoot(targetDir) {
  return path.resolve(process.cwd(), targetDir || '.');
}

async function readFileOrNull(filePath) {
  try {
    return await fs.readFile(filePath, 'utf8');
  } catch (err) {
    if (err && err.code === 'ENOENT') return null;
    throw err;
  }
}

function extractSection(raw, header) {
  if (typeof raw !== 'string') return null;
  const headerRe = new RegExp(`(^|\\n)${header.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\$&')}\\s*\\n`);
  const match = raw.match(headerRe);
  if (!match) return null;
  const startIdx = match.index + (match[1] === '\n' ? 1 : 0);
  const afterHeader = startIdx + header.length + 1;
  const remainder = raw.slice(afterHeader);
  const nextSectionMatch = remainder.match(/\n## /);
  const endIdx = nextSectionMatch ? afterHeader + nextSectionMatch.index + 1 : raw.length;
  return raw.slice(startIdx, endIdx);
}

async function checkTemplateParity({ projectRoot, agents }) {
  const violations = [];
  const checked = [];

  for (const agent of agents) {
    const workspacePath = path.join(projectRoot, '.aioson', 'agents', `${agent}.md`);
    const templatePath = path.join(projectRoot, 'template', '.aioson', 'agents', `${agent}.md`);

    const workspaceRaw = await readFileOrNull(workspacePath);
    const templateRaw = await readFileOrNull(templatePath);

    if (workspaceRaw === null && templateRaw === null) continue;

    const workspaceSection = workspaceRaw ? extractSection(workspaceRaw, FEATURE_DOSSIER_HEADER) : null;
    const templateSection = templateRaw ? extractSection(templateRaw, FEATURE_DOSSIER_HEADER) : null;

    checked.push(agent);

    if (workspaceSection === templateSection) continue;

    const workspaceLen = workspaceSection ? workspaceSection.length : 0;
    const templateLen = templateSection ? templateSection.length : 0;

    let kind;
    if (workspaceSection && !templateSection) kind = 'workspace_only';
    else if (!workspaceSection && templateSection) kind = 'template_only';
    else if (workspaceLen > templateLen) kind = 'workspace_ahead';
    else kind = 'template_ahead';

    violations.push({
      agent,
      kind,
      workspace_chars: workspaceLen,
      template_chars: templateLen
    });
  }

  return { checked, violations };
}

function parseFeaturesTable(raw) {
  if (typeof raw !== 'string') return [];
  const out = [];
  const lines = raw.split('\n');
  let inTable = false;
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('|')) {
      inTable = false;
      continue;
    }
    if (/^\|\s*-+\s*\|/.test(trimmed)) {
      inTable = true;
      continue;
    }
    if (!inTable) continue;
    const cells = trimmed.split('|').slice(1, -1).map((c) => c.trim());
    if (cells.length < 2) continue;
    const [slug, status] = cells;
    if (!slug || slug.toLowerCase() === 'slug') continue;
    out.push({ slug, status: (status || '').toLowerCase() });
  }
  return out;
}

function parseFrontmatterField(raw, key) {
  if (typeof raw !== 'string') return null;
  const fmMatch = raw.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!fmMatch) return null;
  const fieldRe = new RegExp(`^${key}:\\s*"?([^"\\n]+)"?\\s*$`, 'm');
  const match = fmMatch[1].match(fieldRe);
  return match ? match[1].trim() : null;
}

async function readClassificationForFeature({ projectRoot, slug }) {
  const ctxDir = path.join(projectRoot, '.aioson', 'context');
  const candidates = [
    path.join(ctxDir, 'features', slug, 'dossier.md'),
    path.join(ctxDir, `prd-${slug}.md`),
    path.join(ctxDir, `spec-${slug}.md`)
  ];
  for (const candidate of candidates) {
    const raw = await readFileOrNull(candidate);
    if (!raw) continue;
    const cls = parseFrontmatterField(raw, 'classification');
    if (cls) return cls.toUpperCase();
  }
  return null;
}

async function checkCoverage({ projectRoot }) {
  const ctxDir = path.join(projectRoot, '.aioson', 'context');
  const featuresPath = path.join(ctxDir, 'features.md');
  const featuresRaw = await readFileOrNull(featuresPath);
  if (featuresRaw === null) {
    return { features_checked: [], missing_dossier: [], features_md_missing: true };
  }

  const features = parseFeaturesTable(featuresRaw);
  const missing = [];
  const checked = [];

  for (const feature of features) {
    if (feature.status !== 'in_progress') continue;
    const classification = await readClassificationForFeature({ projectRoot, slug: feature.slug });
    checked.push({ slug: feature.slug, status: feature.status, classification });
    if (classification !== 'SMALL' && classification !== 'MEDIUM') continue;
    const dossierPath = path.join(ctxDir, 'features', feature.slug, 'dossier.md');
    const dossierRaw = await readFileOrNull(dossierPath);
    if (dossierRaw === null) {
      missing.push({ slug: feature.slug, classification });
    }
  }

  return { features_checked: checked, missing_dossier: missing, features_md_missing: false };
}

async function runDossierAudit({ args = [], options = {}, logger } = {}) {
  const targetDir = args[0] || '.';
  const jsonOut = Boolean(options.json);
  const log = (msg) => { if (logger && !jsonOut) logger.log(msg); };
  const projectRoot = resolveProjectRoot(targetDir);

  const check = options.check ? String(options.check) : null;
  if (!check) {
    if (jsonOut) return { ok: false, reason: 'missing_check' };
    log('--check=<template-parity|coverage> is required.');
    return { ok: false };
  }

  if (check === 'template-parity') {
    const result = await checkTemplateParity({ projectRoot, agents: CHAIN_AGENTS });
    const ok = result.violations.length === 0;
    if (jsonOut) return { ok, check, ...result };
    if (ok) {
      log(`template-parity OK — ${result.checked.length} chain agent(s) verified.`);
    } else {
      log(`template-parity FAILED — ${result.violations.length} violation(s):`);
      for (const v of result.violations) {
        log(`  - @${v.agent}: ${v.kind} (workspace=${v.workspace_chars} chars, template=${v.template_chars} chars)`);
      }
    }
    return { ok, check, ...result };
  }

  if (check === 'coverage') {
    const result = await checkCoverage({ projectRoot });
    const ok = result.missing_dossier.length === 0 && !result.features_md_missing;
    if (jsonOut) return { ok, check, ...result };
    if (result.features_md_missing) {
      log('coverage check skipped — .aioson/context/features.md missing.');
    } else if (ok) {
      log(`coverage OK — ${result.features_checked.length} in-progress feature(s) verified; all SMALL/MEDIUM have a dossier.`);
    } else {
      log(`coverage FAILED — ${result.missing_dossier.length} feature(s) without dossier:`);
      for (const m of result.missing_dossier) {
        log(`  - ${m.slug} (${m.classification})`);
      }
    }
    return { ok, check, ...result };
  }

  if (jsonOut) return { ok: false, reason: 'unknown_check', check };
  log(`Unknown --check="${check}" — use template-parity or coverage.`);
  return { ok: false };
}

module.exports = {
  runDossierAudit,
  CHAIN_AGENTS,
  FEATURE_DOSSIER_HEADER,
  extractSection,
  parseFeaturesTable,
  parseFrontmatterField,
  checkTemplateParity,
  checkCoverage
};
