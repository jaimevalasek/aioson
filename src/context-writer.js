'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const { ensureDir, copyFileWithDir, nowStamp, toRelativeSafe } = require('./utils');

const PROJECT_CONTEXT_REL = '.aioson/context/project.context.md';

function toPositiveInt(value, fallback = 0) {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.max(0, Math.floor(num));
}

function scoreUserTypes(userTypesCount) {
  const n = toPositiveInt(userTypesCount, 1);
  if (n <= 1) return 0;
  if (n === 2) return 1;
  return 2;
}

function scoreIntegrations(integrationsCount) {
  const n = toPositiveInt(integrationsCount, 0);
  if (n === 0) return 0;
  if (n <= 2) return 1;
  return 2;
}

function scoreRulesComplexity(rulesComplexity) {
  const value = String(rulesComplexity || 'none').trim().toLowerCase();
  if (value === 'none') return 0;
  if (value === 'some') return 1;
  if (value === 'complex') return 2;
  return 0;
}

function classificationFromScore(score) {
  if (score <= 1) return 'MICRO';
  if (score <= 3) return 'SMALL';
  return 'MEDIUM';
}

function calculateClassification(input) {
  const score =
    scoreUserTypes(input.userTypesCount) +
    scoreIntegrations(input.integrationsCount) +
    scoreRulesComplexity(input.rulesComplexity);

  return {
    score,
    classification: classificationFromScore(score)
  };
}

function normalizeBoolean(value, fallback = false) {
  if (typeof value === 'boolean') return value;
  if (value === undefined || value === null) return fallback;
  const text = String(value).trim().toLowerCase();
  if (['true', 'yes', 'y', '1'].includes(text)) return true;
  if (['false', 'no', 'n', '0'].includes(text)) return false;
  return fallback;
}

function renderProjectContext(data) {
  const language = data.interactionLanguage || data.conversationLanguage || 'en';
  const codeCommentLanguage = data.codeCommentLanguage || language;
  const generatedAt = data.generatedAt || new Date().toISOString();
  const designSkill = data.designSkill || '';
  const testRunner = data.testRunner || '';
  const web3Enabled = Boolean(data.web3Enabled);
  const web3Networks = data.web3Networks || '';
  const contractFramework = data.contractFramework || '';
  const walletProvider = data.walletProvider || '';
  const indexer = data.indexer || '';
  const rpcProvider = data.rpcProvider || '';
  const autoHandoff = normalizeBoolean(data.autoHandoff, true);
  const notes = Array.isArray(data.notes) ? data.notes.filter(Boolean) : [];

  return `---
project_name: "${data.projectName}"
project_type: "${data.projectType}"
profile: "${data.profile}"
framework: "${data.framework}"
framework_installed: ${data.frameworkInstalled ? 'true' : 'false'}
classification: "${data.classification}"
interaction_language: "${language}"
conversation_language: "${language}"
design_skill: "${designSkill}"
test_runner: "${testRunner}"
auto_handoff: ${autoHandoff ? 'true' : 'false'}
web3_enabled: ${web3Enabled ? 'true' : 'false'}
web3_networks: "${web3Networks}"
contract_framework: "${contractFramework}"
wallet_provider: "${walletProvider}"
indexer: "${indexer}"
rpc_provider: "${rpcProvider}"
aioson_version: "${data.aiosonVersion}"
generated_at: "${generatedAt}"
---

# Project Context

## Stack
- Backend: ${data.backend || ''}
- Frontend: ${data.frontend || ''}
- Database: ${data.database || ''}
- Auth: ${data.auth || ''}
- UI/UX: ${data.uiux || ''}

## Services
- Queues: ${data.queues || ''}
- Storage: ${data.storage || ''}
- WebSockets: ${data.websockets || ''}
- Email: ${data.email || ''}
- Payments: ${data.payments || ''}
- Cache: ${data.cache || ''}
- Search: ${data.search || ''}

## Web3
- Enabled: ${web3Enabled ? 'yes' : 'no'}
- Networks: ${web3Networks || '[not applicable]'}
- Contract framework: ${contractFramework || '[not applicable]'}
- Wallet provider: ${walletProvider || '[not applicable]'}
- Indexer: ${indexer || '[not applicable]'}
- RPC provider: ${rpcProvider || '[not applicable]'}

## Installation commands
${data.installCommands || (data.frameworkInstalled ? '[already installed]' : '[add commands here]')}

## Notes
${notes.length > 0 ? notes.map((note) => `- ${note}`).join('\n') : '- [none]'}

## Conventions
- Language: ${language}
- Code comments language: ${codeCommentLanguage}
- Source code identifiers: English (paths, filenames, classes, functions, variables — product copy stays in the project language)
- DB naming: snake_case
- JS/TS naming: camelCase
`;
}

// generated_at is stamped fresh on every render, so two renders of the same
// answers never match byte for byte; the comparison ignores that one line.
function withoutGeneratedAt(text) {
  return String(text).replace(/^generated_at: .*$/m, '');
}

const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/;

function frontmatterFields(text) {
  const fields = new Map();
  const match = FRONTMATTER_RE.exec(String(text || ''));
  if (!match) return fields;
  for (const line of match[1].split(/\r?\n/)) {
    const field = /^([A-Za-z0-9_]+):\s*(.*)$/.exec(line);
    if (field && field[1] !== 'generated_at') fields.set(field[1], field[2].trim());
  }
  return fields;
}

/**
 * What replacing `current` with `next` would change, in terms a dry-run can
 * print: each frontmatter field whose value differs, and whether the body
 * (sections the user may have added by hand) differs at all.
 */
function describeContextChanges(current, next) {
  const before = frontmatterFields(current);
  const after = frontmatterFields(next);
  const fields = [];
  for (const field of new Set([...before.keys(), ...after.keys()])) {
    const from = before.has(field) ? before.get(field) : '';
    const to = after.has(field) ? after.get(field) : '';
    if (from !== to) fields.push({ field, from, to });
  }
  const body = (text) => String(text || '').replace(FRONTMATTER_RE, '').trim();
  return { fields, bodyChanged: body(current) !== body(next) };
}

/**
 * Write project.context.md without losing what it held. The file is where a
 * user (or @setup) refined the project's context, and `setup --defaults`
 * re-renders it from detection alone: a version that differs is copied to
 * `.aioson/backups/<stamp>/.aioson/context/project.context.md` first, and one
 * that already says the same thing is not touched at all — no rewrite, no
 * backup folder to crowd out the real ones under rollback retention.
 *
 * @returns {Promise<{filePath:string, action:'created'|'updated'|'unchanged',
 *   backupPath:string|null, changes:{fields:object[], bodyChanged:boolean}|null,
 *   dryRun:boolean}>} backupPath is project-relative; `changes` describes an
 *   update; in dry-run every field says what a real run would do and nothing
 *   is written.
 */
async function saveProjectContext(targetDir, content, options = {}) {
  const dryRun = Boolean(options.dryRun);
  const filePath = path.join(targetDir, PROJECT_CONTEXT_REL);
  let current;
  try {
    current = await fs.readFile(filePath, 'utf8');
  } catch {
    current = null;
  }

  if (current !== null && withoutGeneratedAt(current) === withoutGeneratedAt(content)) {
    return { filePath, action: 'unchanged', backupPath: null, changes: null, dryRun };
  }

  let backupPath = null;
  if (current !== null) {
    const backupRoot = options.backupRoot || path.join(targetDir, '.aioson', 'backups', nowStamp());
    const backupAbs = path.join(backupRoot, PROJECT_CONTEXT_REL);
    if (!dryRun) await copyFileWithDir(filePath, backupAbs);
    backupPath = toRelativeSafe(targetDir, backupAbs);
  }

  if (!dryRun) {
    await ensureDir(path.dirname(filePath));
    await fs.writeFile(filePath, content, 'utf8');
  }
  return {
    filePath,
    action: current === null ? 'created' : 'updated',
    backupPath,
    changes: current === null ? null : describeContextChanges(current, content),
    dryRun
  };
}

async function writeProjectContext(targetDir, content, options = {}) {
  const result = await saveProjectContext(targetDir, content, options);
  return result.filePath;
}

async function renderSquadApiSection(projectDir) {
  const squadsDir = path.join(projectDir, '.aioson', 'squads');
  let slugs = [];
  try {
    const entries = await fs.readdir(squadsDir, { withFileTypes: true });
    slugs = entries.filter(e => e.isDirectory()).map(e => e.name);
  } catch {
    return '';
  }

  const endpointRows = [];
  for (const slug of slugs) {
    let squadJson = null;
    try {
      const raw = await fs.readFile(path.join(squadsDir, slug, 'squad.json'), 'utf8');
      squadJson = JSON.parse(raw);
    } catch { continue; }

    if (!Array.isArray(squadJson?.api_endpoints) || squadJson.api_endpoints.length === 0) continue;
    for (const ep of squadJson.api_endpoints) {
      endpointRows.push(
        `| ${slug} | \`${ep.method || 'POST'} http://localhost:${squadJson.port || '?'}/api${ep.path}\` | ${ep.description || ''} |`
      );
    }
  }

  if (endpointRows.length === 0) return '';

  return [
    '## Squad API Endpoints',
    '',
    'Endpoints HTTP expostos pelos squad-daemons para chamadas do frontend.',
    '',
    '| Squad | Endpoint | Descrição |',
    '|-------|----------|-----------|',
    ...endpointRows,
    '',
    'Use estes endpoints ao implementar componentes frontend que precisam consultar dados dos squads.',
  ].join('\n');
}

module.exports = {
  toPositiveInt,
  scoreUserTypes,
  scoreIntegrations,
  scoreRulesComplexity,
  calculateClassification,
  classificationFromScore,
  normalizeBoolean,
  renderProjectContext,
  describeContextChanges,
  saveProjectContext,
  writeProjectContext,
  renderSquadApiSection
};
