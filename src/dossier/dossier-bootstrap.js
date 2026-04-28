'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');

const { isValidSlug, SCHEMA_VERSION, ALLOWED_CLASSIFICATIONS, validateFrontmatter } = require('./schema');
const { featureDir, dossierPath, parseSections, parseFrontmatter } = require('./store');

// Maps canonical artifact filenames to the agent that typically produces them.
const ARTIFACT_AGENTS = {
  [`prd`]: 'product',
  [`spec`]: 'architect',
  [`sheldon-enrichment`]: 'sheldon',
  [`requirements`]: 'analyst',
  [`architecture`]: 'architect'
};

async function fileExists(p) {
  try { await fs.access(p); return true; } catch { return false; }
}

async function readText(p) {
  try { return await fs.readFile(p, 'utf8'); } catch { return null; }
}

function extractSection(markdown, headingNames) {
  if (!markdown) return null;
  const sections = parseSections(markdown);
  for (const name of headingNames) {
    if (sections[name]) {
      const t = sections[name].trim();
      if (t) return t;
    }
  }
  return null;
}

function artifactHash(artifacts) {
  const keys = Object.keys(artifacts).sort();
  const payload = keys.map(k => `${k}=${artifacts[k] ? artifacts[k].length : 0}`).join(';');
  return crypto.createHash('sha256').update(payload).digest('hex').slice(0, 12);
}

function buildBootstrapDossier({ slug, classification, createdAt, artifacts, why, what, agentTrail }) {
  const fm = [
    '---',
    `feature_slug: ${slug}`,
    `schema_version: "${SCHEMA_VERSION}"`,
    `created_by: dossier-init`,
    `created_at: ${createdAt}`,
    `status: ${artifacts.done ? 'closed' : 'active'}`,
    `classification: ${classification}`,
    `last_updated_by: dossier-init`,
    `last_updated_at: ${createdAt}`,
    `bootstrap_hash: ${artifactHash(artifacts)}`,
    '---',
    ''
  ].join('\n');

  const whyText = why || '_(não encontrado — preencher manualmente)_';
  const whatText = what || '_(não encontrado — preencher manualmente)_';

  const trailLines = agentTrail.length > 0
    ? agentTrail.map(e => `- **${e.timestamp}** | @${e.agent} | _${e.artifact}_`).join('\n')
    : '_(sintetizado a partir de artefatos existentes)_';

  const body = [
    '## Why',
    '',
    whyText,
    '',
    '## What',
    '',
    whatText,
    '',
    '## Code Map',
    '',
    '```yaml',
    'files: []',
    'modules: []',
    'patterns: []',
    '```',
    '',
    '## Rules & Design-Docs aplicáveis',
    '',
    '_(populado via dossier:link-rule)_',
    '',
    '## Agent Trail',
    '',
    trailLines,
    '',
    '## Revision Requests',
    '',
    '_(vazio)_',
    ''
  ].join('\n');

  return fm + body;
}

async function initFromExisting({ slug, contextDir, classification, targetDir, now = () => new Date() } = {}) {
  if (!isValidSlug(slug)) {
    const err = new Error(`invalid slug (must be kebab-case): ${JSON.stringify(slug)}`);
    err.code = 'EDOSSIERSLUG';
    throw err;
  }

  const dir = featureDir(contextDir, slug);
  const p = dossierPath(contextDir, slug);

  // Check if dossier already exists (idempotency guard)
  if (await fileExists(p)) {
    // Check if it has the same bootstrap_hash — if artifacts unchanged, it's a no-op
    const raw = await readText(p);
    const fmParse = raw ? parseFrontmatter(raw) : { ok: false };
    if (fmParse.ok && fmParse.data.bootstrap_hash) {
      // Re-compute hash to detect changes
      const artifacts = await gatherArtifacts(slug, contextDir, targetDir);
      const newHash = artifactHash(artifacts);
      if (newHash === fmParse.data.bootstrap_hash) {
        return { created: false, reason: 'unchanged', path: p };
      }
    }
    const err = new Error(`dossier already exists at ${p} — use dossier:show to inspect`);
    err.code = 'EDOSSIEREXISTS';
    err.path = p;
    throw err;
  }

  const artifacts = await gatherArtifacts(slug, contextDir, targetDir);

  // Must have at least one artifact to synthesize from
  const hasAny = Object.values(artifacts).some(Boolean);
  if (!hasAny) {
    const err = new Error(`no artifacts found for slug "${slug}" — use dossier:init without --from-existing`);
    err.code = 'EBOOTSTRAPEMPTY';
    throw err;
  }

  // Resolve classification
  let cls = classification;
  if (!cls) {
    const ctxPath = path.join(contextDir, 'project.context.md');
    const ctxRaw = await readText(ctxPath);
    if (ctxRaw) {
      const m = ctxRaw.match(/^classification:\s*"?([A-Z]+)"?\s*$/m);
      if (m && ALLOWED_CLASSIFICATIONS.has(m[1])) cls = m[1];
    }
  }
  cls = cls || 'MEDIUM';

  // Extract Why/What
  const prdContent = artifacts.prd || artifacts.prdGlobal;
  const why = extractSection(prdContent, ['Problem', 'Why', 'Vision', 'Problema']);
  const what = extractSection(prdContent, ['Escopo do MVP', 'Scope', 'What', 'Escopo']);

  // Build agent trail from artifact metadata
  const createdAt = now().toISOString();
  const agentTrail = buildAgentTrail(artifacts, createdAt);

  // Validate frontmatter before writing
  const fmCheck = validateFrontmatter({
    feature_slug: slug,
    schema_version: SCHEMA_VERSION,
    created_by: 'dossier-init',
    created_at: createdAt,
    status: artifacts.done ? 'closed' : 'active',
    classification: cls,
    last_updated_by: 'dossier-init',
    last_updated_at: createdAt
  });
  if (!fmCheck.valid) {
    const err = new Error(`schema error: ${fmCheck.errors.join('; ')}`);
    err.code = 'EDOSSIERSCHEMA';
    throw err;
  }

  const markdown = buildBootstrapDossier({ slug, classification: cls, createdAt, artifacts, why, what, agentTrail });

  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(p, markdown, 'utf8');

  return { created: true, path: p, classification: cls, artifactsFound: Object.keys(artifacts).filter(k => artifacts[k]) };
}

async function gatherArtifacts(slug, contextDir, targetDir) {
  const base = targetDir || path.join(contextDir, '..', '..');
  const artifacts = {};

  // Per-slug artifacts
  artifacts.prd = await readText(path.join(contextDir, `prd-${slug}.md`));
  artifacts.spec = await readText(path.join(contextDir, `spec-${slug}.md`));
  artifacts.sheldonEnrichment = await readText(path.join(contextDir, `sheldon-enrichment-${slug}.md`));
  artifacts.requirements = await readText(path.join(contextDir, `requirements-${slug}.md`));
  artifacts.architecture = await readText(path.join(contextDir, `architecture-${slug}.md`));

  // Global PRD fallback
  artifacts.prdGlobal = !artifacts.prd ? await readText(path.join(contextDir, 'prd.md')) : null;

  // done/ directory (feature already closed)
  const doneDir = path.join(contextDir, 'done', slug);
  artifacts.done = await fileExists(doneDir) ? doneDir : null;

  return artifacts;
}

function buildAgentTrail(artifacts, fallbackTimestamp) {
  const trail = [];
  const add = (artifact, agent) => {
    if (artifacts[artifact]) trail.push({ artifact, agent, timestamp: fallbackTimestamp });
  };
  add('prd', 'product');
  add('prdGlobal', 'product');
  add('requirements', 'analyst');
  add('sheldonEnrichment', 'sheldon');
  add('architecture', 'architect');
  add('spec', 'architect');
  return trail;
}

module.exports = { initFromExisting };
