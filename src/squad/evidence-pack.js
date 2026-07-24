'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const { createHash, randomUUID } = require('node:crypto');

function sha256(content) {
  return createHash('sha256').update(String(content || ''), 'utf8').digest('hex');
}

function slugify(value) {
  return String(value || 'general')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'general';
}

function createEvidencePack(input = {}) {
  const collectedAt = input.collectedAt || new Date().toISOString();
  const sources = (input.sources || []).map((source, index) => {
    const content = String(source.content || source.text || source.html || '');
    return {
      id: source.id || `source-${index + 1}`,
      url: source.url || null,
      title: source.title || null,
      published_at: source.published_at || null,
      collected_at: source.collected_at || collectedAt,
      content_hash: source.content_hash || sha256(content),
      source_type: source.source_type || 'web',
      primary: Boolean(source.primary),
      independent: Boolean(source.independent),
      excerpt: content.slice(0, Number(input.maxExcerptChars || 2000))
    };
  });
  const claims = (input.claims || []).map((claim, index) => {
    const value = typeof claim === 'string' ? { text: claim } : claim;
    const claimSources = Array.isArray(value.source_ids)
      ? [...new Set(value.source_ids.map(String).filter(Boolean))]
      : [];
    const citations = claimSources
      .map((id) => sources.find((source) => source.id === id)?.url)
      .filter(Boolean);
    return {
      id: value.id || `claim-${index + 1}`,
      text: String(value.text || ''),
      status: value.status || 'unverified',
      source_ids: claimSources,
      citations
    };
  });

  return {
    schemaVersion: '1.0.0',
    id: input.id || randomUUID(),
    squad: input.squad || null,
    session_id: input.sessionId || input.session_id || null,
    topic: slugify(input.topic),
    query: String(input.query || input.topic || ''),
    policy: input.policy,
    status: input.status || 'unverified',
    provider: input.provider || { available: false, source: 'none' },
    collected_at: collectedAt,
    sources,
    claims,
    contradictions: input.contradictions || [],
    gaps: input.gaps || [],
    provenance: {
      worker: input.worker || null,
      run_id: input.runId || input.run_id || input.sessionId || null,
      generated_by: 'aioson',
      content_hash: sha256(JSON.stringify({ sources, claims }))
    }
  };
}

function validateEvidencePack(pack) {
  const errors = [];
  if (!pack || typeof pack !== 'object') errors.push('pack must be an object');
  if (!pack?.schemaVersion) errors.push('schemaVersion is required');
  if (!pack?.topic) errors.push('topic is required');
  if (!pack?.policy?.type) errors.push('policy.type is required');
  if (!['pass', 'warn', 'fail', 'unverified', 'not-applicable'].includes(pack?.status)) {
    errors.push(`unsupported status: ${pack?.status}`);
  }
  if (!Array.isArray(pack?.sources)) errors.push('sources must be an array');
  if (!Array.isArray(pack?.claims)) errors.push('claims must be an array');
  for (const source of Array.isArray(pack?.sources) ? pack.sources : []) {
    if (!source.id) errors.push('source.id is required');
    if (!source.content_hash) errors.push(`source ${source.id || '?'} is missing content_hash`);
  }
  const knownSources = new Map(
    (Array.isArray(pack?.sources) ? pack.sources : []).map((source) => [source.id, source])
  );
  if (knownSources.size !== (Array.isArray(pack?.sources) ? pack.sources.length : 0)) {
    errors.push('source IDs must be unique');
  }
  for (const claim of Array.isArray(pack?.claims) ? pack.claims : []) {
    if (!claim.id) errors.push('claim.id is required');
    if (!claim.text) errors.push(`claim ${claim.id || '?'} is missing text`);
    if (!['supported', 'unverified', 'contradicted'].includes(claim.status)) {
      errors.push(`claim ${claim.id || '?'} has unsupported status ${claim.status}`);
    }
    for (const sourceId of claim.source_ids || []) {
      if (!knownSources.has(sourceId)) errors.push(`claim ${claim.id || '?'} references unknown source ${sourceId}`);
    }
    if (claim.status === 'supported' && (claim.source_ids || []).length === 0) {
      errors.push(`supported claim ${claim.id || '?'} has no explicit source mapping`);
    }
    if (claim.status === 'supported' && (claim.citations || []).length === 0) {
      errors.push(`supported claim ${claim.id || '?'} has no resolvable citation`);
    }
    if (claim.status === 'supported') {
      const mappedUrls = new Set(
        (claim.source_ids || [])
          .map((sourceId) => knownSources.get(sourceId)?.url)
          .filter(Boolean)
      );
      for (const citation of claim.citations || []) {
        if (!mappedUrls.has(citation)) {
          errors.push(`supported claim ${claim.id || '?'} cites a URL outside its source mapping`);
        }
      }
    }
  }
  return { valid: errors.length === 0, errors };
}

async function writeEvidencePack(projectDir, squadSlug, sessionId, pack) {
  const validation = validateEvidencePack(pack);
  if (!validation.valid) {
    throw new Error(`Invalid Evidence Pack: ${validation.errors.join('; ')}`);
  }
  const evidenceDir = path.resolve(
    projectDir,
    '.aioson',
    'squads',
    slugify(squadSlug),
    'sessions',
    slugify(sessionId || 'shared'),
    'evidence'
  );
  const projectRoot = path.resolve(projectDir);
  if (!evidenceDir.startsWith(`${projectRoot}${path.sep}`)) {
    throw new Error('Evidence Pack path escapes project root');
  }
  await fs.mkdir(evidenceDir, { recursive: true });
  const targetPath = path.join(evidenceDir, `${slugify(pack.topic)}.json`);
  const temporaryPath = `${targetPath}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(temporaryPath, `${JSON.stringify(pack, null, 2)}\n`, 'utf8');
  await fs.rename(temporaryPath, targetPath);
  return targetPath;
}

module.exports = {
  sha256,
  slugify,
  createEvidencePack,
  validateEvidencePack,
  writeEvidencePack
};
