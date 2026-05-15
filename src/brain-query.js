'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');

function splitCsv(value) {
  return String(value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeBrainPath(targetDir, brainPath) {
  const raw = String(brainPath || '').trim();
  if (!raw) return null;
  // SF-project-23: fail-closed containment. _index.json declares brain files
  // by relative path under .aioson/brains/. Absolute paths and relative paths
  // that escape that root have no legitimate use here, so reject them up front
  // and let the caller emit its existing "Brain file not found" warning.
  if (path.isAbsolute(raw)) return null;
  const brainsRoot = path.resolve(targetDir, '.aioson', 'brains');
  const candidate = raw.startsWith('.aioson/brains/')
    ? path.resolve(targetDir, raw)
    : path.resolve(brainsRoot, raw);
  if (candidate !== brainsRoot && !candidate.startsWith(brainsRoot + path.sep)) {
    return null;
  }
  return candidate;
}

async function readJsonFile(filePath) {
  const content = await fs.readFile(filePath, 'utf8');
  return JSON.parse(content);
}

function brainMatches({ brain, tags, agent }) {
  if (agent) {
    const agents = Array.isArray(brain.agents) ? brain.agents : [];
    if (!agents.includes(agent)) return false;
  }
  if (tags.length > 0) {
    const brainTags = Array.isArray(brain.tags) ? brain.tags : [];
    if (!tags.some((tag) => brainTags.includes(tag))) return false;
  }
  return true;
}

function nodeMatches({ node, tags, matchMode, minQuality, verdicts, ids, avoidOnly }) {
  if (ids.length > 0) return ids.includes(node.id);

  const nodeTags = Array.isArray(node.tags) ? node.tags : [];
  if (tags.length > 0) {
    const ok = matchMode === 'all'
      ? tags.every((tag) => nodeTags.includes(tag))
      : tags.some((tag) => nodeTags.includes(tag));
    if (!ok) return false;
  }

  if (minQuality > 0 && Number(node.q || 0) < minQuality) return false;

  if (verdicts.length > 0) {
    const verdict = String(node.v || '').toUpperCase();
    if (!verdicts.includes(verdict)) return false;
  }

  if (avoidOnly) {
    const verdict = String(node.v || '').toUpperCase();
    if (verdict !== 'AVOID' && verdict !== 'BROKEN') return false;
  }

  return true;
}

async function queryBrains({
  targetDir,
  tags = [],
  matchMode = 'any',
  minQuality = 0,
  agent = '',
  verdicts = [],
  ids = [],
  avoidOnly = false
}) {
  const brainsDir = path.join(targetDir, '.aioson', 'brains');
  const indexPath = path.join(brainsDir, '_index.json');

  let index;
  try {
    index = await readJsonFile(indexPath);
  } catch {
    return {
      ok: false,
      reason: 'missing_index',
      indexPath,
      brainFiles: [],
      nodes: [],
      warnings: [`No _index.json found at ${indexPath}`]
    };
  }

  const requestedTags = Array.isArray(tags) ? tags : splitCsv(tags);
  const requestedVerdicts = (Array.isArray(verdicts) ? verdicts : splitCsv(verdicts))
    .map((verdict) => verdict.toUpperCase());
  const requestedIds = Array.isArray(ids) ? ids : splitCsv(ids);
  const requestedAgent = String(agent || '').replace(/^@/, '').trim();
  const normalizedMatchMode = matchMode === 'all' ? 'all' : 'any';
  const minQ = Number(minQuality || 0);

  const indexedBrains = Array.isArray(index.brains) ? index.brains : [];
  const selectedBrains = indexedBrains.filter((brain) => brainMatches({
    brain,
    tags: requestedTags,
    agent: requestedAgent
  }));

  const warnings = [];
  const nodes = [];

  for (const brain of selectedBrains) {
    const brainPath = normalizeBrainPath(targetDir, brain.path);
    if (!brainPath) {
      warnings.push(`Brain ${brain.id || '(unknown)'} has no path`);
      continue;
    }

    let data;
    try {
      data = await readJsonFile(brainPath);
    } catch {
      warnings.push(`Brain file not found or invalid: ${brainPath}`);
      continue;
    }

    const brainNodes = Array.isArray(data.nodes) ? data.nodes : [];
    for (const node of brainNodes) {
      if (nodeMatches({
        node,
        tags: requestedTags,
        matchMode: normalizedMatchMode,
        minQuality: minQ,
        verdicts: requestedVerdicts,
        ids: requestedIds,
        avoidOnly
      })) {
        nodes.push({ ...node, _brain: brain.id || null, _brain_path: brain.path || null });
      }
    }
  }

  return {
    ok: true,
    indexPath,
    brainFiles: selectedBrains.map((brain) => brain.path),
    nodes,
    warnings
  };
}

function formatBrainNodesCompact(nodes) {
  if (!nodes || nodes.length === 0) return '(no matches)';
  return nodes
    .map((node) => `[${node.q || 0}* ${node.v || 'UNKNOWN'}] ${node.id} - ${node.title}\n  ${node.s || ''}`.trimEnd())
    .join('\n\n');
}

module.exports = {
  splitCsv,
  normalizeBrainPath,
  queryBrains,
  formatBrainNodesCompact
};
