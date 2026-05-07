'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const { isValidSlug, RESEARCH_VERDICTS, isCanonicalAgent } = require('./schema');

const FEATURES_SUBDIR = 'features';
const DOSSIER_FILENAME = 'dossier.md';
const SECTION_HEADER = '## Research Index';
const FOLLOWING_SECTION_HEADER = '## Agent Trail';

const WHY_RELEVANT_MAX = 200;

function dossierPath(contextDir, slug) {
  return path.join(contextDir, FEATURES_SUBDIR, slug, DOSSIER_FILENAME);
}

function stripQuotes(s) {
  return s.replace(/^["']|["']$/g, '');
}

function parseResearchIndexBlock(raw) {
  const sectionStart = raw.indexOf(SECTION_HEADER + '\n');
  if (sectionStart === -1) return null;
  const nextSection = raw.indexOf('\n## ', sectionStart + SECTION_HEADER.length);
  const sectionEnd = nextSection === -1 ? raw.length : nextSection;
  const marker = '```yaml\n';
  const blockStart = raw.indexOf(marker, sectionStart);
  if (blockStart === -1 || blockStart > sectionEnd) return null;
  const codeStart = blockStart + marker.length;
  const codeEnd = raw.indexOf('\n```', codeStart);
  if (codeEnd === -1 || codeEnd > sectionEnd) return null;
  return { sectionStart, sectionEnd, blockStart, codeStart, codeEnd };
}

function parseYamlResearchIndex(yamlText) {
  const result = { researchs: [] };
  const lines = yamlText.split('\n');
  let inSection = false;
  let currentItem = null;

  const flushItem = () => {
    if (currentItem !== null) {
      result.researchs.push(currentItem);
      currentItem = null;
    }
  };

  for (const line of lines) {
    if (!line.trim()) continue;

    if (/^researchs:\s*(\[\])?\s*$/.test(line)) {
      inSection = true;
      continue;
    }

    if (!inSection) continue;

    const listItemMatch = line.match(/^-\s+(\w+):\s*(.*)$/);
    if (listItemMatch) {
      flushItem();
      currentItem = {};
      currentItem[listItemMatch[1]] = stripQuotes(listItemMatch[2]);
      continue;
    }

    const kvMatch = line.match(/^\s+(\w+):\s*(.*)$/);
    if (kvMatch && currentItem !== null) {
      currentItem[kvMatch[1]] = stripQuotes(kvMatch[2]);
    }
  }
  flushItem();
  return result;
}

function serializeResearchIndex(index) {
  if (!index || !Array.isArray(index.researchs) || index.researchs.length === 0) {
    return 'researchs: []';
  }
  const lines = ['researchs:'];
  for (const item of index.researchs) {
    const entries = Object.entries(item);
    if (entries.length === 0) continue;
    lines.push(`- ${entries[0][0]}: ${entries[0][1]}`);
    for (const [k, v] of entries.slice(1)) {
      lines.push(`  ${k}: ${v}`);
    }
  }
  return lines.join('\n');
}

function validateResearchEntry(entry) {
  const errors = [];
  if (!entry.slug || !isValidSlug(entry.slug)) {
    errors.push(`slug must be kebab-case (got: ${JSON.stringify(entry.slug)})`);
  }
  if (!entry.verdict || !RESEARCH_VERDICTS.has(entry.verdict)) {
    errors.push(`verdict must be one of [${[...RESEARCH_VERDICTS].join(', ')}] (got: ${JSON.stringify(entry.verdict)})`);
  }
  if (!entry.agent_who_added || !isCanonicalAgent(entry.agent_who_added)) {
    errors.push(`agent_who_added must be a canonical agent id (got: ${JSON.stringify(entry.agent_who_added)})`);
  }
  if (!entry.why_relevant || typeof entry.why_relevant !== 'string') {
    errors.push('why_relevant is required (string)');
  }
  if (entry.why_relevant && entry.why_relevant.length > WHY_RELEVANT_MAX) {
    errors.push(`why_relevant must be ≤ ${WHY_RELEVANT_MAX} chars (got: ${entry.why_relevant.length})`);
  }
  if (!entry.summary_path || typeof entry.summary_path !== 'string') {
    errors.push('summary_path is required');
  }
  return errors;
}

function insertResearchIndexSection(raw, yamlContent) {
  const sectionBlock = `${SECTION_HEADER}\n\n\`\`\`yaml\n${yamlContent}\n\`\`\`\n`;
  const agentTrailIdx = raw.indexOf('\n' + FOLLOWING_SECTION_HEADER);
  if (agentTrailIdx !== -1) {
    return raw.slice(0, agentTrailIdx + 1) + sectionBlock + '\n' + raw.slice(agentTrailIdx + 1);
  }
  return raw + (raw.endsWith('\n') ? '' : '\n') + '\n' + sectionBlock;
}

async function addResearch({
  slug,
  contextDir,
  researchSlug,
  verdict,
  agent,
  whyRelevant,
  summaryPath,
  now = () => new Date()
}) {
  if (!isValidSlug(slug)) {
    const err = new Error(`invalid feature slug: ${JSON.stringify(slug)}`);
    err.code = 'EDOSSIERSLUG';
    throw err;
  }

  const computedSummaryPath = summaryPath || `researchs/${researchSlug}/summary.md`;

  const candidate = {
    slug: researchSlug,
    verdict,
    agent_who_added: agent,
    why_relevant: whyRelevant,
    added_at: now().toISOString(),
    summary_path: computedSummaryPath
  };

  const errors = validateResearchEntry(candidate);
  if (errors.length > 0) {
    const err = new Error(`invalid research entry: ${errors.join('; ')}`);
    err.code = 'ERESEARCHVALIDATION';
    err.errors = errors;
    throw err;
  }

  const p = dossierPath(contextDir, slug);
  let raw;
  try {
    raw = await fs.readFile(p, 'utf8');
  } catch (err) {
    if (err && err.code === 'ENOENT') {
      const e = new Error(`dossier not found for slug "${slug}"`);
      e.code = 'EDOSSIERMISSING';
      throw e;
    }
    throw err;
  }

  const parsed = parseResearchIndexBlock(raw);
  let index = { researchs: [] };
  if (parsed) {
    const yamlText = raw.slice(parsed.codeStart, parsed.codeEnd);
    index = parseYamlResearchIndex(yamlText);
  }

  // Idempotency: dedup by slug.
  // last-write-wins on verdict + why_relevant; preserve agent_who_added + added_at from first write.
  const existingIdx = index.researchs.findIndex(r => r.slug === researchSlug);
  let action;
  if (existingIdx !== -1) {
    const existing = index.researchs[existingIdx];
    if (
      existing.verdict === verdict &&
      existing.why_relevant === whyRelevant &&
      existing.summary_path === computedSummaryPath
    ) {
      return { added: false, updated: false, slug: researchSlug };
    }
    existing.verdict = verdict;
    existing.why_relevant = whyRelevant;
    existing.summary_path = computedSummaryPath;
    action = 'updated';
  } else {
    index.researchs.push(candidate);
    action = 'added';
  }

  const newYaml = serializeResearchIndex(index);
  let newRaw;
  if (parsed) {
    newRaw = raw.slice(0, parsed.codeStart) + newYaml + raw.slice(parsed.codeEnd);
  } else {
    newRaw = insertResearchIndexSection(raw, newYaml);
  }

  await fs.writeFile(p, newRaw, 'utf8');
  return {
    added: action === 'added',
    updated: action === 'updated',
    slug: researchSlug
  };
}

module.exports = {
  addResearch,
  parseResearchIndexBlock,
  parseYamlResearchIndex,
  serializeResearchIndex,
  validateResearchEntry,
  insertResearchIndexSection,
  SECTION_HEADER,
  WHY_RELEVANT_MAX
};
