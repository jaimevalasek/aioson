'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const Ajv = require('ajv');
const { createHash } = require('node:crypto');
const { validateEvidencePack } = require('./evidence-pack');

const SCHEMA_RELATIVE_PATH = path.join('.aioson', 'schemas', 'squad-manifest.schema.json');
const SHIPPED_SCHEMA_PATH = path.resolve(
  __dirname,
  '..',
  '..',
  'template',
  '.aioson',
  'schemas',
  'squad-manifest.schema.json'
);

function isContainedPath(rootDir, candidatePath) {
  const root = path.resolve(rootDir);
  const candidate = path.resolve(candidatePath);
  return candidate === root || candidate.startsWith(`${root}${path.sep}`);
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => (
      `${JSON.stringify(key)}:${stableJson(value[key])}`
    )).join(',')}}`;
  }
  return JSON.stringify(value);
}

function hashObject(value) {
  return createHash('sha256').update(stableJson(value), 'utf8').digest('hex');
}

async function pathExists(targetPath) {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function resolveManifestSchemaPath(projectDir) {
  const workspaceSchema = path.resolve(projectDir, SCHEMA_RELATIVE_PATH);
  if (isContainedPath(projectDir, workspaceSchema) && await pathExists(workspaceSchema)) {
    return workspaceSchema;
  }
  return SHIPPED_SCHEMA_PATH;
}

function normalizeSchemaErrors(errors = []) {
  return (errors || []).map((error) => {
    const location = error.instancePath || '/';
    const detail = error.params?.missingProperty
      ? `${location === '/' ? '' : location}/${error.params.missingProperty}`
      : location;
    return {
      code: `schema.${error.keyword}`,
      path: detail || '/',
      message: `${detail || '/'} ${error.message || 'is invalid'}`.trim()
    };
  });
}

async function compileManifestSchema(projectDir) {
  const schemaPath = await resolveManifestSchemaPath(projectDir);
  const raw = await fs.readFile(schemaPath, 'utf8');
  const schema = JSON.parse(raw);
  const ajv = new Ajv({
    allErrors: true,
    strict: false,
    allowUnionTypes: true
  });
  ajv.addFormat('date', /^\d{4}-\d{2}-\d{2}$/);
  return {
    schemaPath,
    validate: ajv.compile(schema)
  };
}

async function validateSquadManifest(projectDir, manifest) {
  try {
    const compiled = await compileManifestSchema(projectDir);
    const valid = compiled.validate(manifest);
    return {
      valid: Boolean(valid),
      schemaPath: compiled.schemaPath,
      errors: normalizeSchemaErrors(compiled.validate.errors)
    };
  } catch (error) {
    return {
      valid: false,
      schemaPath: null,
      errors: [{
        code: 'schema.unavailable',
        path: '/',
        message: `Canonical squad schema could not be loaded: ${error.message}`
      }]
    };
  }
}

async function collectJsonFiles(rootDir) {
  const output = [];
  async function walk(current) {
    let entries;
    try {
      entries = await fs.readdir(current, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const target = path.join(current, entry.name);
      if (entry.isDirectory()) await walk(target);
      else if (entry.isFile() && entry.name.endsWith('.json')) output.push(target);
    }
  }
  await walk(rootDir);
  return output;
}

async function readJsonSafe(filePath) {
  try {
    return JSON.parse(await fs.readFile(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function normalizeEvidenceFreshness(value) {
  if (typeof value === 'number') {
    return { maxAgeHours: value * 24, expectedPolicy: null, expectedSquad: null };
  }
  return {
    maxAgeHours: Number(value?.maxAgeHours || 24),
    expectedPolicy: value?.expectedPolicy || null,
    expectedSquad: value?.expectedSquad || null
  };
}

async function findCurrentEvidencePack(projectDir, slug, freshness = {}) {
  const policy = normalizeEvidenceFreshness(freshness);
  const evidenceRoot = path.resolve(projectDir, '.aioson', 'squads', slug, 'sessions');
  if (!isContainedPath(path.resolve(projectDir, '.aioson', 'squads'), evidenceRoot)) {
    return { current: false, reason: 'Evidence Pack path escapes squads root', pack: null };
  }
  const files = await collectJsonFiles(evidenceRoot);
  const packs = [];
  for (const file of files.filter((candidate) => candidate.includes(`${path.sep}evidence${path.sep}`))) {
    const pack = await readJsonSafe(file);
    if (!pack?.collected_at || !pack?.policy?.type) continue;
    if (policy.expectedPolicy && pack.policy.type !== policy.expectedPolicy) continue;
    if (policy.expectedSquad && pack.squad !== policy.expectedSquad) continue;
    const timestamp = Date.parse(pack.collected_at);
    if (!Number.isFinite(timestamp)) continue;
    packs.push({ file, pack, timestamp });
  }
  packs.sort((a, b) => b.timestamp - a.timestamp);
  const latest = packs[0] || null;
  if (!latest) return { current: false, reason: 'no Evidence Pack found', pack: null };
  const ageMs = Date.now() - latest.timestamp;
  const current = Number.isFinite(ageMs)
    && ageMs >= 0
    && ageMs <= policy.maxAgeHours * 3_600_000;
  return {
    current,
    reason: current ? null : `latest Evidence Pack is older than ${policy.maxAgeHours} hour(s)`,
    pack: latest.pack,
    path: path.relative(projectDir, latest.file).replace(/\\/g, '/')
  };
}

function flattenGenomeBindings(manifest) {
  const value = manifest.genomeBindings;
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return Array.isArray(manifest.genomes) ? manifest.genomes : [];
  }
  return [
    ...(Array.isArray(value.squad) ? value.squad : []),
    ...Object.values(value.executors || {}).flatMap((entries) => (
      Array.isArray(entries) ? entries : []
    ))
  ];
}

async function validatePremiumManifest(projectDir, slug, manifest, options = {}) {
  const errors = [];
  const warnings = [];
  const squadRoot = path.resolve(projectDir, '.aioson', 'squads', slug);
  const agentsRoot = path.join(squadRoot, 'agents');
  const executors = Array.isArray(manifest.executors) ? manifest.executors : [];

  for (const executor of executors) {
    if (!executor.file) {
      errors.push(`Premium executor "${executor.slug}" is missing file`);
      continue;
    }
    const target = path.resolve(projectDir, normalizePath(executor.file));
    if (!isContainedPath(agentsRoot, target)) {
      errors.push(`Premium executor "${executor.slug}" escapes squad agents directory: ${executor.file}`);
    }
  }
  for (const sourceDoc of manifest.sourceDocs || []) {
    const target = path.resolve(projectDir, normalizePath(sourceDoc));
    if (!isContainedPath(projectDir, target)) {
      errors.push(`sourceDocs path escapes project: ${sourceDoc}`);
    }
  }

  const policy = manifest.researchPolicy?.policy;
  if (!policy) {
    errors.push('Premium readiness requires researchPolicy.policy (use closed-world when external research is not applicable)');
  } else if (['live-required', 'live-check'].includes(policy)) {
    const policyDefaultHours = policy === 'live-required' ? 6 : 24;
    const declaredHours = manifest.researchPolicy.maxAgeHours !== undefined
      ? Number(manifest.researchPolicy.maxAgeHours)
      : manifest.researchPolicy.maxAgeDays !== undefined
        ? Number(manifest.researchPolicy.maxAgeDays) * 24
        : policyDefaultHours;
    const maxAgeHours = Math.min(
      Number.isFinite(declaredHours) && declaredHours > 0 ? declaredHours : policyDefaultHours,
      policyDefaultHours
    );
    const evidence = await findCurrentEvidencePack(projectDir, slug, {
      maxAgeHours,
      expectedPolicy: policy,
      expectedSquad: slug
    });
    if (!evidence.current) {
      errors.push(`Premium research evidence is not current: ${evidence.reason}`);
    } else {
      const pack = evidence.pack;
      const packValidation = validateEvidencePack(pack);
      const claims = Array.isArray(pack.claims) ? pack.claims : [];
      const supportedClaims = claims.filter((claim) => claim.status === 'supported');
      const claimsAreGrounded = supportedClaims.length > 0
        && supportedClaims.length === claims.length;
      if (!packValidation.valid) {
        errors.push(`Premium research Evidence Pack is invalid: ${packValidation.errors.join('; ')}`);
      }
      if (
        pack.status !== 'pass'
        || pack.provider?.available !== true
        || (pack.sources || []).length === 0
        || !claimsAreGrounded
      ) {
        errors.push(`Premium research Evidence Pack is not live/verified: ${evidence.path}`);
      }
    }
  }

  const composition = manifest.composition;
  if (!composition || !Array.isArray(composition.persistent_core) || composition.persistent_core.length === 0) {
    errors.push('Premium readiness requires composition.persistent_core');
  }
  const persistent = executors.filter((executor) => executor.persistent !== false);
  for (const executor of persistent) {
    if (!executor.contribution) {
      errors.push(`Persistent executor "${executor.slug}" is missing contribution`);
    }
    if (!Array.isArray(executor.decisionRights) || executor.decisionRights.length === 0) {
      errors.push(`Persistent executor "${executor.slug}" is missing decisionRights`);
    }
  }
  const reviewers = new Set(executors.filter((executor) => executor.type === 'reviewer').map((executor) => executor.slug));
  for (const workflow of manifest.workflows || []) {
    for (const phase of workflow.phases || []) {
      if (phase.review?.reviewer && phase.review.reviewer !== phase.executor) {
        reviewers.add(phase.review.reviewer);
      }
    }
  }
  if (persistent.length > 0 && reviewers.size === 0) {
    errors.push('Premium readiness requires an independent reviewer or review assignment');
  }

  const bindings = flattenGenomeBindings(manifest);
  for (const binding of bindings) {
    if (binding.status !== 'compiled' || !binding.compilationId) {
      errors.push(`Genome binding "${binding.slug || '?'}" is ${binding.status || 'pending'}; compiled status and identity are required`);
    }
  }

  const evaluation = manifest.evaluation;
  const deferred = manifest.ephemeral === true && typeof evaluation?.deferReason === 'string'
    && evaluation.deferReason.trim().length >= 8;
  if (!evaluation) {
    errors.push('Premium readiness requires an evaluation contract');
  } else {
    if (!Array.isArray(evaluation.criteria) || evaluation.criteria.length === 0) {
      errors.push('Premium evaluation requires source-grounded criteria');
    }
    if (!Array.isArray(evaluation.heldOutCases) || evaluation.heldOutCases.length === 0) {
      errors.push('Premium evaluation requires held-out cases');
    }
  }

  if (!options.skipEval && !deferred) {
    const latestPath = path.join(squadRoot, 'evals', 'latest.json');
    const latest = await readJsonSafe(latestPath);
    if (!latest) {
      errors.push('Persistent/regulatory premium squad requires a current eval report');
    } else {
      const maxAgeDays = Number(evaluation?.maxAgeDays || 30);
      const ageMs = Date.now() - Date.parse(latest.generated_at);
      if (!Number.isFinite(ageMs) || ageMs < 0 || ageMs > maxAgeDays * 86_400_000) {
        errors.push(`Latest eval report is older than ${maxAgeDays} day(s)`);
      }
      if (latest.inputs?.manifest_hash !== hashObject(manifest)) {
        errors.push('Latest eval report is stale for the current manifest');
      }
      if (latest.verdict !== 'PASS' || latest.critical_failures > 0) {
        errors.push(`Latest eval verdict is ${latest.verdict || 'unverified'}; PASS with zero critical failures is required`);
      }
    }
  }
  if (deferred) {
    warnings.push(`Ephemeral squad explicitly deferred eval: ${evaluation.deferReason.trim()}`);
  }

  return { errors, warnings };
}

function normalizePath(value) {
  return String(value || '').replace(/\\/g, '/').replace(/^\.\//, '');
}

module.exports = {
  SCHEMA_RELATIVE_PATH,
  SHIPPED_SCHEMA_PATH,
  isContainedPath,
  resolveManifestSchemaPath,
  normalizeSchemaErrors,
  compileManifestSchema,
  validateSquadManifest,
  hashObject,
  normalizeEvidenceFreshness,
  findCurrentEvidencePack,
  flattenGenomeBindings,
  validatePremiumManifest
};
