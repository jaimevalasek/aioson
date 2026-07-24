'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const {
  isContainedPath,
  validatePremiumManifest,
  validateSquadManifest
} = require('../squad/manifest-validator');
const { isValidSlug } = require('../dossier/schema');

async function pathExists(targetPath) {
  try { await fs.access(targetPath); return true; } catch { return false; }
}

async function readJsonIfExists(filePath) {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    return JSON.parse(raw);
  } catch { return null; }
}

function normalizeRelPath(relPath) {
  return String(relPath || '').replace(/\\/g, '/').replace(/^\.\//, '').replace(/\/+$/, '');
}

function isLocaleSpecific(localeScope) {
  return Boolean(localeScope && localeScope !== 'universal');
}

function validateManifestFields(manifest) {
  const errors = [];
  const warnings = [];
  const required = ['schemaVersion', 'slug', 'name', 'mode', 'mission', 'goal'];

  for (const field of required) {
    if (!manifest[field]) {
      errors.push(`Missing required field: ${field}`);
    }
  }

  if (manifest.slug && !/^[a-z0-9][a-z0-9-]*[a-z0-9]$/.test(manifest.slug)) {
    errors.push(`Invalid slug format: "${manifest.slug}" (must be kebab-case)`);
  }

  if (manifest.mode && !['content', 'software', 'research', 'mixed'].includes(manifest.mode)) {
    warnings.push(`Unknown mode: "${manifest.mode}"`);
  }

  if (manifest.locale_scope && !/^(universal|[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*)$/.test(manifest.locale_scope)) {
    errors.push(`Invalid locale_scope: "${manifest.locale_scope}"`);
  }

  if (!manifest.package || typeof manifest.package !== 'object') {
    warnings.push('Missing package object — squad uses legacy manifest contract');
  }

  if (!manifest.rules || typeof manifest.rules !== 'object') {
    warnings.push('Missing rules object — squad uses legacy manifest contract');
  }

  return { errors, warnings };
}

async function validateStructure(projectDir, slug, manifest) {
  const errors = [];
  const warnings = [];
  const squadDir = path.join(projectDir, '.aioson', 'squads', slug);

  const requiredFiles = [
    { rel: 'squad.manifest.json', label: 'Manifest' },
    { rel: 'agents/agents.md', label: 'Agents manifesto' },
    { rel: 'agents/orquestrador.md', label: 'Orchestrator agent' },
  ];

  for (const { rel, label } of requiredFiles) {
    if (!(await pathExists(path.join(squadDir, rel)))) {
      errors.push(`Missing required file: ${rel} (${label})`);
    }
  }

  // Check executor files
  const executors = Array.isArray(manifest.executors) ? manifest.executors : [];
  for (const exec of executors) {
    if (exec.file) {
      const absPath = path.resolve(projectDir, exec.file);
      if (!isContainedPath(projectDir, absPath)) {
        errors.push(`Executor "${exec.slug}" file escapes project: ${exec.file}`);
        continue;
      }
      if (!(await pathExists(absPath))) {
        errors.push(`Executor "${exec.slug}" file not found: ${exec.file}`);
      }
    }
  }

  // Check api_endpoints workers
  const apiEndpoints = Array.isArray(manifest.api_endpoints) ? manifest.api_endpoints : [];
  for (const ep of apiEndpoints) {
    if (ep.worker) {
      const workerDir = path.join(squadDir, 'workers', ep.worker);
      if (!(await pathExists(workerDir))) {
        const rel = path.relative(projectDir, workerDir).replace(/\\/g, '/');
        errors.push(`api_endpoints: worker "${ep.worker}" not found at ${rel}`);
      }
    }
  }

  // Check output dir (warning only)
  const outputRel = normalizeRelPath(manifest?.rules?.outputsDir || `output/${slug}`);
  const outputDir = path.join(projectDir, outputRel);
  if (!(await pathExists(outputDir))) {
    warnings.push(`Output directory not found: ${outputRel}/`);
  }

  return { errors, warnings };
}

async function validateSemantics(manifest) {
  const errors = [];
  const warnings = [];
  const executors = Array.isArray(manifest.executors) ? manifest.executors : [];

  // Check for duplicate slugs
  const slugs = executors.map(e => e.slug);
  const dupes = slugs.filter((s, i) => slugs.indexOf(s) !== i);
  if (dupes.length > 0) {
    errors.push(`Duplicate executor slugs: ${[...new Set(dupes)].join(', ')}`);
  }

  // Check executors without skills
  for (const exec of executors) {
    const skills = Array.isArray(exec.skills) ? exec.skills : [];
    if (skills.length === 0) {
      warnings.push(`Executor "${exec.slug}" has no skills declared`);
    }
  }

  return { errors, warnings };
}

async function validateSemanticDeep(projectDir, slug, manifest) {
  const errors = [];
  const warnings = [];

  // 1. Slug do manifesto bate com diretório
  if (manifest.slug && manifest.slug !== slug) {
    errors.push(`Slug mismatch: manifest says "${manifest.slug}" but directory is "${slug}"`);
  }

  // 2. Skills referenciadas pelos executores estão declaradas no manifesto
  const declaredSkills = Array.isArray(manifest.skills) ? manifest.skills.map(s => s.slug) : [];
  const executors = Array.isArray(manifest.executors) ? manifest.executors : [];
  for (const exec of executors) {
    const execSkills = Array.isArray(exec.skills) ? exec.skills : [];
    for (const skillSlug of execSkills) {
      if (!declaredSkills.includes(skillSlug)) {
        warnings.push(`Executor "${exec.slug}" references skill "${skillSlug}" not declared in manifest.skills`);
      }
    }
  }

  // 3. Content blueprints têm sections válidas
  const blueprints = Array.isArray(manifest.contentBlueprints) ? manifest.contentBlueprints : [];
  for (const bp of blueprints) {
    if (!bp.sections || bp.sections.length === 0) {
      warnings.push(`Content blueprint "${bp.slug}" has no sections defined`);
    }
  }

  // 4. CLAUDE.md e AGENTS.md mencionam o squad
  const claudeMd = path.join(projectDir, 'CLAUDE.md');
  const agentsMd = path.join(projectDir, 'AGENTS.md');
  try {
    const claudeContent = await fs.readFile(claudeMd, 'utf8');
    if (!claudeContent.includes(slug)) {
      warnings.push(`CLAUDE.md does not reference squad "${slug}"`);
    }
  } catch { warnings.push('CLAUDE.md not found'); }

  try {
    const agentsContent = await fs.readFile(agentsMd, 'utf8');
    if (!agentsContent.includes(slug)) {
      warnings.push(`AGENTS.md does not reference squad "${slug}"`);
    }
  } catch { warnings.push('AGENTS.md not found'); }

  // 5. Output strategy validation
  const outputStrategy = manifest.outputStrategy && typeof manifest.outputStrategy === 'object'
    ? manifest.outputStrategy
    : null;

  if (outputStrategy) {
    const validModes = ['files', 'sqlite', 'hybrid'];
    if (outputStrategy.mode && !validModes.includes(outputStrategy.mode)) {
      errors.push(`Invalid outputStrategy.mode: "${outputStrategy.mode}" (expected: ${validModes.join(', ')})`);
    }

    const delivery = outputStrategy.delivery && typeof outputStrategy.delivery === 'object'
      ? outputStrategy.delivery
      : null;

    if (delivery) {
      const webhooks = Array.isArray(delivery.webhooks) ? delivery.webhooks : [];
      for (const wh of webhooks) {
        if (!wh.slug) {
          errors.push('Webhook missing required "slug" field');
        }
        if (!wh.trigger) {
          errors.push(`Webhook "${wh.slug || '?'}" missing required "trigger" field`);
        }
        const validTriggers = ['on-publish', 'on-create', 'manual'];
        if (wh.trigger && !validTriggers.includes(wh.trigger)) {
          warnings.push(`Webhook "${wh.slug}" has unknown trigger: "${wh.trigger}"`);
        }
        if (wh.url && wh.url.includes('{{ENV:')) {
          const envMatch = wh.url.match(/\{\{ENV:(\w+)\}\}/);
          if (envMatch && !process.env[envMatch[1]]) {
            warnings.push(`Webhook "${wh.slug}" references unset env var: ${envMatch[1]}`);
          }
        }
        if (wh.worker) {
          const workerPath = path.join(projectDir, wh.worker);
          if (!(await pathExists(workerPath))) {
            warnings.push(`Webhook "${wh.slug}" worker not found: ${wh.worker}`);
          }
        }
      }

      if (delivery.autoPublish && webhooks.length === 0 && !delivery.cloudPublish) {
        warnings.push('autoPublish is enabled but no webhooks or cloudPublish configured');
      }
    }

    if (outputStrategy.mode === 'files' && outputStrategy.dataOutput && outputStrategy.dataOutput.enabled) {
      warnings.push('outputStrategy.mode is "files" but dataOutput.enabled is true — consider "hybrid"');
    }
    if (outputStrategy.mode === 'sqlite' && outputStrategy.fileOutput && outputStrategy.fileOutput.enabled) {
      warnings.push('outputStrategy.mode is "sqlite" but fileOutput.enabled is true — consider "hybrid"');
    }
  }

  // 6. Task decomposition validation
  for (const exec of executors) {
    const tasks = Array.isArray(exec.tasks) ? exec.tasks : [];
    if (tasks.length > 0) {
      const orders = tasks.map(t => t.order).sort((a, b) => a - b);
      for (let i = 0; i < orders.length; i++) {
        if (orders[i] !== i + 1) {
          warnings.push(`Executor "${exec.slug}": task order is not sequential (expected ${i + 1}, got ${orders[i]})`);
          break;
        }
      }
    }
  }

  // 6b. Model tiering validation
  for (const exec of executors) {
    if (exec.usesLLM === false && exec.modelTier && exec.modelTier !== 'none') {
      warnings.push(`Executor "${exec.slug}": usesLLM is false but modelTier is "${exec.modelTier}" (expected "none")`);
    }
    if (exec.type === 'worker' && exec.modelTier && exec.modelTier !== 'none') {
      warnings.push(`Executor "${exec.slug}": type is "worker" but modelTier is "${exec.modelTier}" (expected "none")`);
    }
  }

  // 7. Review loop validation
  const workflows = Array.isArray(manifest.workflows) ? manifest.workflows : [];
  const executorSlugs = executors.map(e => e.slug);
  for (const wf of workflows) {
    const phases = Array.isArray(wf.phases) ? wf.phases : [];
    const phaseIds = phases.map(p => p.id);
    for (const phase of phases) {
      if (phase.review) {
        const rv = phase.review;
        if (rv.reviewer && !executorSlugs.includes(rv.reviewer)) {
          errors.push(`Workflow "${wf.slug}" phase "${phase.id}": reviewer "${rv.reviewer}" is not a declared executor`);
        }
        if (rv.onReject && !phaseIds.includes(rv.onReject)) {
          errors.push(`Workflow "${wf.slug}" phase "${phase.id}": onReject target "${rv.onReject}" is not a valid phase ID`);
        }
        if (rv.reviewer && rv.reviewer === phase.executor) {
          warnings.push(`Workflow "${wf.slug}" phase "${phase.id}": reviewer should not be the same as the creator executor`);
        }
      }
      if (phase.review && (!phase.vetoConditions || phase.vetoConditions.length === 0)) {
        warnings.push(`Workflow "${wf.slug}" phase "${phase.id}": has review but no vetoConditions — consider adding veto guards`);
      }
    }
  }

  // 7. Readiness não contradiz blockers
  if (manifest.readiness) {
    for (const [dim, val] of Object.entries(manifest.readiness)) {
      if (val && val.status === 'ready' && val.blocker) {
        warnings.push(`Readiness "${dim}" is "ready" but has blocker: "${val.blocker}"`);
      }
    }
  }

  // 8. Canonical package contract
  const packageInfo = manifest.package && typeof manifest.package === 'object' ? manifest.package : {};
  const rules = manifest.rules && typeof manifest.rules === 'object' ? manifest.rules : {};
  const canonicalPaths = [
    ['package.rootDir', packageInfo.rootDir, `.aioson/squads/${slug}`],
    ['package.agentsDir', packageInfo.agentsDir, `.aioson/squads/${slug}/agents`],
    ['package.workersDir', packageInfo.workersDir, `.aioson/squads/${slug}/workers`],
    ['package.workflowsDir', packageInfo.workflowsDir, `.aioson/squads/${slug}/workflows`],
    ['package.checklistsDir', packageInfo.checklistsDir, `.aioson/squads/${slug}/checklists`],
    ['package.skillsDir', packageInfo.skillsDir, `.aioson/squads/${slug}/skills`],
    ['package.templatesDir', packageInfo.templatesDir, `.aioson/squads/${slug}/templates`],
    ['package.docsDir', packageInfo.docsDir, `.aioson/squads/${slug}/docs`],
    ['rules.outputsDir', rules.outputsDir, `output/${slug}`],
    ['rules.logsDir', rules.logsDir, `aioson-logs/${slug}`],
    ['rules.mediaDir', rules.mediaDir, `media/${slug}`]
  ];

  for (const [label, actual, expected] of canonicalPaths) {
    if (!actual) {
      warnings.push(`Missing ${label} — expected "${expected}"`);
      continue;
    }
    if (normalizeRelPath(actual) !== expected) {
      warnings.push(`${label} points to "${actual}" instead of canonical "${expected}"`);
    }
  }

  // 9. Locale policy validation
  if (isLocaleSpecific(manifest.locale_scope) && !manifest.locale_rationale) {
    warnings.push(`locale_scope "${manifest.locale_scope}" is locale-specific but locale_rationale is missing`);
  }

  // 10. Source docs validation
  const sourceDocs = Array.isArray(manifest.sourceDocs) ? manifest.sourceDocs : [];
  for (const docPath of sourceDocs) {
    const absPath = path.join(projectDir, normalizeRelPath(docPath));
    if (!(await pathExists(absPath))) {
      warnings.push(`sourceDocs entry not found: ${docPath}`);
    }
  }

  // 11. Investigation validation
  const investigation = manifest.investigation && typeof manifest.investigation === 'object'
    ? manifest.investigation
    : null;
  const domainClassification = manifest.domainClassification && typeof manifest.domainClassification === 'object'
    ? manifest.domainClassification
    : null;

  if (investigation) {
    if (!investigation.slug) {
      warnings.push('investigation object is missing "slug"');
    }
    if (investigation.path) {
      const investigationPath = path.join(projectDir, normalizeRelPath(investigation.path));
      if (!(await pathExists(investigationPath))) {
        warnings.push(`investigation.path not found: ${investigation.path}`);
      }
    } else {
      warnings.push('investigation object is missing "path"');
    }
  }

  const investigationRequired = domainClassification?.tier === 'tier-1-regulated'
    || domainClassification?.investigationPolicy === 'required';

  if (investigationRequired && !manifest.ephemeral && !investigation) {
    errors.push('Regulated squad is missing required investigation metadata');
  }

  return { errors, warnings };
}

async function runSquadValidate({ args = [], options = {}, logger = console } = {}) {
  const projectDir = path.resolve(process.cwd(), args[0] || '.');
  const slug = options.squad || args[1];
  const strict = options.strict === true || options.strict === 'true';

  if (!slug) {
    logger.error('Usage: aioson squad:validate [path] --squad=<slug>');
    return { valid: false, errors: ['No slug provided'], warnings: [] };
  }
  if (!isValidSlug(slug)) {
    logger.error(`Invalid squad slug: "${slug}"`);
    return {
      ok: false,
      valid: false,
      strict,
      errors: ['Invalid squad slug'],
      warnings: [],
      status: 'INVALID'
    };
  }

  const manifestPath = path.join(projectDir, '.aioson', 'squads', slug, 'squad.manifest.json');
  const manifest = await readJsonIfExists(manifestPath);

  if (!manifest) {
    logger.error(`Squad "${slug}" not found or invalid manifest at ${manifestPath}`);
    return { valid: false, errors: ['Manifest not found or invalid JSON'], warnings: [] };
  }

  const allErrors = [];
  const allWarnings = [];

  // Layer 1: canonical Draft-07 schema plus legacy compatibility checks.
  const legacySchema = validateManifestFields(manifest);
  allErrors.push(...legacySchema.errors);
  allWarnings.push(...legacySchema.warnings);

  const canonicalSchema = await validateSquadManifest(projectDir, manifest);
  const canonicalMessages = canonicalSchema.errors.map((error) => (
    `Canonical schema ${error.code} at ${error.path}: ${error.message}`
  ));
  if (strict) {
    allErrors.push(...canonicalMessages);
  } else {
    allWarnings.push(...canonicalMessages);
  }

  // Layer 2: Structure
  const structure = await validateStructure(projectDir, slug, manifest);
  allErrors.push(...structure.errors);
  allWarnings.push(...structure.warnings);

  // Layer 3: Semantics (basic)
  const semantics = await validateSemantics(manifest);
  allErrors.push(...semantics.errors);
  allWarnings.push(...semantics.warnings);

  // Layer 4: Semantic deep
  const semanticDeep = await validateSemanticDeep(projectDir, slug, manifest);
  allErrors.push(...semanticDeep.errors);
  allWarnings.push(...semanticDeep.warnings);

  const premium = strict
    ? await validatePremiumManifest(projectDir, slug, manifest, {
      skipEval: options.skipEval === true || options.skipEval === 'true'
    })
    : { errors: [], warnings: [] };
  allErrors.push(...premium.errors);
  allWarnings.push(...premium.warnings);

  // Report
  const valid = allErrors.length === 0;
  const status = valid
    ? (allWarnings.length > 0 ? 'VALID (with warnings)' : 'VALID')
    : 'INVALID';

  if (!options.json) {
    logger.log('');
    logger.log(`\u2550\u2550 Squad Validation: ${slug} \u2550\u2550`);
    logger.log('');
    logger.log(`  Canonical schema: ${canonicalSchema.valid ? '\u2705 PASS' : (strict ? '\u274c FAIL' : '\u26a0\ufe0f  ADVISORY')}`);
    logger.log(`  Legacy schema:    ${legacySchema.errors.length === 0 ? '\u2705 PASS' : '\u274c FAIL'}`);
    logger.log(`  Structure:        ${structure.errors.length === 0 ? '\u2705 PASS' : '\u274c FAIL'}`);
    logger.log(`  Semantics:        ${semantics.errors.length === 0 ? (semantics.warnings.length > 0 ? '\u26a0\ufe0f  WARNINGS' : '\u2705 PASS') : '\u274c FAIL'}`);
    logger.log(`  Semantic deep:    ${semanticDeep.errors.length === 0 ? (semanticDeep.warnings.length > 0 ? '\u26a0\ufe0f  WARNINGS' : '\u2705 PASS') : '\u274c FAIL'}`);
    if (strict) {
      logger.log(`  Premium gate:     ${premium.errors.length === 0 ? (premium.warnings.length > 0 ? '\u26a0\ufe0f  WARNINGS' : '\u2705 PASS') : '\u274c FAIL'}`);
    }
    logger.log(`  Output strategy:  ${manifest.outputStrategy ? `${manifest.outputStrategy.mode || 'unknown'} mode` : 'not configured'}`);

    if (allErrors.length > 0) {
      logger.log('');
      logger.log('  Errors:');
      for (const err of allErrors) logger.log(`    \u274c ${err}`);
    }

    if (allWarnings.length > 0) {
      logger.log('');
      logger.log('  Warnings:');
      for (const warn of allWarnings) logger.log(`    \u26a0\ufe0f  ${warn}`);
    }

    logger.log('');
    logger.log(`  Result: ${status}`);
    logger.log('');
  }

  return {
    ok: valid,
    valid,
    strict,
    schema: {
      valid: canonicalSchema.valid,
      path: canonicalSchema.schemaPath
        ? path.relative(projectDir, canonicalSchema.schemaPath).replace(/\\/g, '/')
        : null,
      errors: canonicalSchema.errors
    },
    premium: strict ? premium : null,
    errors: allErrors,
    warnings: allWarnings,
    status
  };
}

module.exports = { runSquadValidate };
