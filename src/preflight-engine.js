'use strict';

/**
 * preflight-engine — shared deterministic utilities for preflight, gate:check, artifact:validate.
 * No LLM calls. Pure file parsing + logic.
 */

const fs = require('node:fs/promises');
const path = require('node:path');

// ─── Frontmatter parser ───────────────────────────────────────────────────────

function parseFrontmatter(content) {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return {};
  const result = {};
  for (const line of match[1].split(/\r?\n/)) {
    const colonIdx = line.indexOf(':');
    if (colonIdx === -1) continue;
    const key = line.slice(0, colonIdx).trim();
    const value = line.slice(colonIdx + 1).trim().replace(/^["']|["']$/g, '');
    if (key) result[key] = value;
  }
  return result;
}

async function readFileSafe(filePath) {
  try {
    return await fs.readFile(filePath, 'utf8');
  } catch {
    return null;
  }
}

async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function fileStat(filePath) {
  try {
    return await fs.stat(filePath);
  } catch {
    return null;
  }
}

// ─── Framework detection ──────────────────────────────────────────────────────

const FRAMEWORK_INDICATORS = [
  { file: 'composer.json', key: 'laravel/framework', name: 'Laravel' },
  { file: 'composer.json', key: 'symfony/framework-bundle', name: 'Symfony' },
  { file: 'package.json', key: '"next"', name: 'Next.js' },
  { file: 'package.json', key: '"nuxt"', name: 'Nuxt.js' },
  { file: 'package.json', key: '"react"', name: 'React' },
  { file: 'package.json', key: '"vue"', name: 'Vue' },
  { file: 'package.json', key: '"svelte"', name: 'Svelte' },
  { file: 'package.json', key: '"express"', name: 'Express' },
  { file: 'Gemfile', key: 'rails', name: 'Rails' },
  { file: 'requirements.txt', key: 'django', name: 'Django' },
  { file: 'requirements.txt', key: 'fastapi', name: 'FastAPI' },
  { file: 'requirements.txt', key: 'flask', name: 'Flask' },
  { file: 'go.mod', key: 'gin-gonic', name: 'Gin' },
  { file: 'go.mod', key: 'echo', name: 'Echo' },
  { file: 'Cargo.toml', key: 'actix-web', name: 'Actix' },
  { file: 'foundry.toml', key: null, name: 'Foundry (Solidity)' }
];

async function detectFramework(targetDir) {
  for (const { file, key, name } of FRAMEWORK_INDICATORS) {
    const filePath = path.join(targetDir, file);
    const content = await readFileSafe(filePath);
    if (!content) continue;
    if (!key || content.toLowerCase().includes(key.toLowerCase())) {
      return name;
    }
  }
  return null;
}

// ─── Test runner detection ────────────────────────────────────────────────────

const TEST_RUNNER_INDICATORS = [
  { file: 'phpunit.xml', name: 'Pest/PHPUnit', command: 'php artisan test' },
  { file: 'phpunit.xml.dist', name: 'PHPUnit', command: './vendor/bin/phpunit' },
  { file: 'jest.config.js', name: 'Jest', command: 'npx jest' },
  { file: 'jest.config.ts', name: 'Jest', command: 'npx jest' },
  { file: 'jest.config.mjs', name: 'Jest', command: 'npx jest' },
  { file: 'vitest.config.js', name: 'Vitest', command: 'npx vitest' },
  { file: 'vitest.config.ts', name: 'Vitest', command: 'npx vitest' },
  { file: 'vitest.config.mjs', name: 'Vitest', command: 'npx vitest' },
  { file: 'pytest.ini', name: 'Pytest', command: 'pytest' },
  { file: 'setup.cfg', name: 'Pytest', command: 'pytest', key: '[tool:pytest]' },
  { file: 'pyproject.toml', name: 'Pytest', command: 'pytest', key: '[tool.pytest' },
  { file: '.rspec', name: 'RSpec', command: 'bundle exec rspec' },
  { file: 'foundry.toml', name: 'Forge', command: 'forge test' },
  { file: 'Makefile', name: 'Make', command: 'make test', key: 'test:' }
];

async function detectTestRunner(targetDir) {
  for (const { file, name, command, key } of TEST_RUNNER_INDICATORS) {
    const filePath = path.join(targetDir, file);
    const content = await readFileSafe(filePath);
    if (!content) continue;
    if (key && !content.includes(key)) continue;
    return { name, command, configFile: file };
  }

  // Check package.json scripts (test, test:unit, test:e2e, etc.)
  const pkgContent = await readFileSafe(path.join(targetDir, 'package.json'));
  if (pkgContent) {
    try {
      const pkg = JSON.parse(pkgContent);
      if (pkg.scripts) {
        // Check all test-related script keys, prioritize "test" then "test:*"
        const testKeys = Object.keys(pkg.scripts).filter((k) => k === 'test' || k.startsWith('test:'));
        for (const key of testKeys) {
          const script = pkg.scripts[key];
          if (script.includes('jest')) return { name: 'Jest', command: `npm run ${key}`, configFile: 'package.json' };
          if (script.includes('vitest')) return { name: 'Vitest', command: `npm run ${key}`, configFile: 'package.json' };
          if (script.includes('mocha')) return { name: 'Mocha', command: `npm run ${key}`, configFile: 'package.json' };
          if (script.includes('node --test') || script.includes('node:test')) return { name: 'node:test', command: `npm run ${key}`, configFile: 'package.json' };
        }
        if (pkg.scripts.test) {
          return { name: 'npm test', command: 'npm test', configFile: 'package.json' };
        }
      }
    } catch { /* ignore malformed package.json */ }
  }

  return null;
}

// ─── Context file paths ───────────────────────────────────────────────────────

function contextDir(targetDir) {
  return path.join(targetDir, '.aioson', 'context');
}

function rulesDir(targetDir) {
  return path.join(targetDir, '.aioson', 'rules');
}

function designDocsDir(targetDir) {
  return path.join(targetDir, '.aioson', 'design-docs');
}

function artifactPath(targetDir, name, slug) {
  const dir = contextDir(targetDir);
  if (slug) return path.join(dir, `${name}-${slug}.md`);
  return path.join(dir, `${name}.md`);
}

// ─── Project context reader ───────────────────────────────────────────────────

async function loadProjectContext(targetDir) {
  const filePath = path.join(contextDir(targetDir), 'project.context.md');
  const content = await readFileSafe(filePath);
  if (!content) return { exists: false, data: {} };
  const data = parseFrontmatter(content);
  return { exists: true, data, content };
}

// ─── Sheldon manifest scanner ─────────────────────────────────────────────────

function parseManifestPhaseTable(content) {
  if (!content) return [];
  const phases = [];
  const tableRe = /^\|([^|]+)\|([^|]+)\|([^|]+)\|([^|]+)\|$/gm;
  let match;
  let headerPassed = false;
  while ((match = tableRe.exec(content)) !== null) {
    const cols = [match[1], match[2], match[3], match[4]].map((c) => c.trim());
    if (!headerPassed) {
      // Skip header row and separator row
      if (cols[0].toLowerCase() === 'phase' || /^-+$/.test(cols[0])) {
        headerPassed = cols[0].toLowerCase() === 'phase';
        continue;
      }
    }
    if (!headerPassed) continue;
    if (/^-+$/.test(cols[0])) continue;
    const phaseNum = parseInt(cols[0], 10);
    if (!Number.isFinite(phaseNum)) continue;
    phases.push({ phase: phaseNum, file: cols[1].replace(/`/g, ''), status: cols[2], purpose: cols[3] });
  }
  return phases;
}

async function scanActiveManifest(targetDir, slug) {
  if (!slug) return { exists: false };
  const manifestPath = path.join(targetDir, '.aioson', 'plans', slug, 'manifest.md');
  const stat = await fileStat(manifestPath);
  if (!stat) return { exists: false };
  const content = await readFileSafe(manifestPath);
  const fm = content ? parseFrontmatter(content) : {};
  const status = fm.status || null;
  const isDone = status === 'complete' || status === 'done';

  // Parse phase table to find the first pending phase (AC-SDLC-27)
  const phases = parseManifestPhaseTable(content);
  const DONE_STATUSES = new Set(['done', 'complete', 'qa_approved', 'completed']);
  const nextPendingPhase = phases.find((p) => !DONE_STATUSES.has(String(p.status).toLowerCase())) || null;

  return {
    exists: true,
    path: `.aioson/plans/${slug}/manifest.md`,
    status,
    is_active: !isDone,
    phases,
    next_pending_phase: nextPendingPhase ? {
      phase: nextPendingPhase.phase,
      file: nextPendingPhase.file,
      status: nextPendingPhase.status
    } : null
  };
}

// ─── Artifact scanner ─────────────────────────────────────────────────────────

async function scanArtifacts(targetDir, slug) {
  const dir = contextDir(targetDir);

  async function check(name, filePath) {
    const stat = await fileStat(filePath);
    if (!stat) return { exists: false };

    const content = await readFileSafe(filePath);
    const fm = content ? parseFrontmatter(content) : {};

    return {
      exists: true,
      path: path.relative(targetDir, filePath),
      size: stat.size,
      frontmatter: fm,
      content
    };
  }

  const results = {
    project_context: await check('project.context', path.join(dir, 'project.context.md')),
    prd: slug ? await check('prd', path.join(dir, `prd-${slug}.md`)) : { exists: false },
    sheldon_enrichment: slug ? await check('sheldon', path.join(dir, `sheldon-enrichment-${slug}.md`)) : { exists: false },
    requirements: slug ? await check('requirements', path.join(dir, `requirements-${slug}.md`)) : { exists: false },
    spec: slug ? await check('spec', path.join(dir, `spec-${slug}.md`)) : await check('spec', path.join(dir, 'spec.md')),
    architecture: await check('architecture', path.join(dir, 'architecture.md')),
    implementation_plan: slug ? await check('impl-plan', path.join(dir, `implementation-plan-${slug}.md`)) : { exists: false },
    conformance: slug ? await check('conformance', path.join(dir, `conformance-${slug}.yaml`)) : { exists: false },
    dev_state: await check('dev-state', path.join(dir, 'dev-state.md')),
    features: await check('features', path.join(dir, 'features.md'))
  };

  return results;
}

// ─── Gate reader ─────────────────────────────────────────────────────────────

const GATE_NAMES = {
  A: 'requirements',
  B: 'design',
  C: 'plan',
  D: 'execution'
};

const GATE_ALIASES = {
  requirements: 'A',
  design: 'B',
  plan: 'C',
  execution: 'D'
};

function parseGatesFromSpec(content) {
  if (!content) return {};
  const fm = parseFrontmatter(content);
  const gates = {};

  // Try explicit gate fields: gate_requirements, gate_design, gate_plan, gate_execution
  for (const [letter, name] of Object.entries(GATE_NAMES)) {
    const val = fm[`gate_${name}`] || fm[`gate${letter}`] || fm[`gate_${letter}`];
    if (val) gates[name] = val.toLowerCase();
  }

  // Try phase_gates JSON field
  if (fm.phase_gates) {
    try {
      const parsed = JSON.parse(fm.phase_gates.replace(/'/g, '"'));
      Object.assign(gates, parsed);
    } catch {
      // phase_gates field exists but is not valid JSON — gate data from this field is lost
    }
  }

  // Try scanning content for gate approval lines
  const gateLineRe = /gate\s+([A-D])[^:]*:\s*(approved|pending|rejected)/gi;
  let m;
  while ((m = gateLineRe.exec(content)) !== null) {
    const letter = m[1].toUpperCase();
    const name = GATE_NAMES[letter];
    if (name && !gates[name]) gates[name] = m[2].toLowerCase();
  }

  return gates;
}

async function readPhaseGates(targetDir, slug) {
  const specFile = slug
    ? path.join(contextDir(targetDir), `spec-${slug}.md`)
    : path.join(contextDir(targetDir), 'spec.md');

  const content = await readFileSafe(specFile);
  if (!content) return {};
  return parseGatesFromSpec(content);
}

// ─── Dev state reader ─────────────────────────────────────────────────────────

async function readDevState(targetDir) {
  const filePath = path.join(contextDir(targetDir), 'dev-state.md');
  const content = await readFileSafe(filePath);
  if (!content) return { exists: false };
  // F1 (workflow-handoff-integrity v1.9.7) — corrupt detection (AC-F1-08).
  // dev-state.md by convention ALWAYS has frontmatter; missing markers OR
  // unparseable frontmatter both indicate corruption.
  const hasFrontmatterMarkers = /^---\r?\n[\s\S]*?\r?\n---/.test(content);
  const fm = parseFrontmatter(content);
  const fmIsEmpty = Object.keys(fm).length === 0;
  const parseError = content.trim().length > 0 && (!hasFrontmatterMarkers || fmIsEmpty);
  return { exists: true, parseError, ...fm, content };
}

// ─── Project pulse reader ────────────────────────────────────────────────────

async function readProjectPulse(targetDir) {
  const filePath = path.join(contextDir(targetDir), 'project-pulse.md');
  const content = await readFileSafe(filePath);
  if (!content) return { exists: false };
  const fm = parseFrontmatter(content);
  return { exists: true, ...fm, content };
}

// ─── Classification reader ────────────────────────────────────────────────────

async function detectClassification(targetDir, slug) {
  // 1. Try project context
  const ctx = await loadProjectContext(targetDir);
  if (ctx.data.classification) return ctx.data.classification.toUpperCase();

  // 2. Try spec frontmatter
  if (slug) {
    const specContent = await readFileSafe(path.join(contextDir(targetDir), `spec-${slug}.md`));
    if (specContent) {
      const fm = parseFrontmatter(specContent);
      if (fm.classification) return fm.classification.toUpperCase();
    }

    // 3. Try PRD frontmatter
    const prdContent = await readFileSafe(path.join(contextDir(targetDir), `prd-${slug}.md`));
    if (prdContent) {
      const fm = parseFrontmatter(prdContent);
      if (fm.classification) return fm.classification.toUpperCase();
    }
  }

  return null;
}

// ─── Rules discovery ──────────────────────────────────────────────────────────

function parseAgentList(value) {
  if (value === undefined || value === null) return null;
  const raw = String(value).trim();
  if (!raw) return [];
  if (raw === '[]') return [];
  if (raw.startsWith('[') && raw.endsWith(']')) {
    return raw
      .slice(1, -1)
      .split(',')
      .map((item) => item.trim().replace(/^["']|["']$/g, ''))
      .filter(Boolean);
  }
  return raw
    .split(',')
    .map((item) => item.trim().replace(/^["']|["']$/g, ''))
    .filter(Boolean);
}

function appliesToAgent(frontmatter, agent) {
  const agents = parseAgentList(frontmatter.agents);
  if (agents === null) return true;
  if (agents.length === 0) return true;
  return agents.includes('all') || agents.includes(agent);
}

async function discoverRules(targetDir, agent) {
  const dir = rulesDir(targetDir);
  const rules = [];

  let entries;
  try {
    entries = await fs.readdir(dir);
  } catch {
    return rules;
  }

  for (const entry of entries) {
    if (!entry.endsWith('.md')) continue;
    if (entry.toLowerCase() === 'readme.md') continue;
    const content = await readFileSafe(path.join(dir, entry));
    if (!content) continue;

    // Check applicability: universal rules or agent-specific
    const fm = parseFrontmatter(content);
    if (appliesToAgent(fm, agent)) rules.push(entry);
  }

  return rules.sort();
}

async function discoverDesignDocs(targetDir, agent) {
  const dir = designDocsDir(targetDir);
  const docs = [];

  let entries;
  try {
    entries = await fs.readdir(dir);
  } catch {
    return docs;
  }

  for (const entry of entries) {
    if (!entry.endsWith('.md')) continue;
    if (entry.toLowerCase() === 'readme.md') continue;
    const content = await readFileSafe(path.join(dir, entry));
    if (!content) continue;

    const fm = parseFrontmatter(content);
    if (!appliesToAgent(fm, agent)) continue;
    docs.push(path.join('.aioson', 'design-docs', entry).split(path.sep).join('/'));
  }

  return docs.sort();
}

// ─── Context package builder ──────────────────────────────────────────────────

function buildContextPackage(agent, slug, classification, artifacts, devState, manifest) {
  const pkg = [];

  if (artifacts.project_context.exists) pkg.push(artifacts.project_context.path);

  if (slug) {
    const downstreamAgents = ['pm', 'orchestrator', 'dev', 'deyvin', 'qa'];
    const shouldCarryFullFeatureContext = downstreamAgents.includes(agent);

    if (shouldCarryFullFeatureContext && artifacts.prd.exists) pkg.push(artifacts.prd.path);
    if (shouldCarryFullFeatureContext && artifacts.sheldon_enrichment.exists) pkg.push(artifacts.sheldon_enrichment.path);
    if ((shouldCarryFullFeatureContext || ['analyst', 'architect'].includes(agent)) && artifacts.requirements.exists) {
      pkg.push(artifacts.requirements.path);
    }

    if (artifacts.spec.exists) pkg.push(artifacts.spec.path);

    if (shouldCarryFullFeatureContext && artifacts.architecture.exists) pkg.push(artifacts.architecture.path);
    if (shouldCarryFullFeatureContext && artifacts.conformance.exists) pkg.push(artifacts.conformance.path);

    // Manifest precedence (AC-SDLC-24, AC-SDLC-25):
    // If active Sheldon manifest exists and is not done, it is the primary execution artifact.
    // implementation-plan is supporting context only.
    if (manifest && manifest.exists && manifest.is_active && (agent === 'dev' || agent === 'deyvin')) {
      pkg.push(manifest.path + ' [PRIMARY — active Sheldon manifest]');
      if (manifest.next_pending_phase && manifest.next_pending_phase.file) {
        pkg.push(path.join(path.dirname(manifest.path), manifest.next_pending_phase.file).split(path.sep).join('/') + ' [current phase]');
      }
      if (artifacts.implementation_plan.exists) {
        pkg.push(artifacts.implementation_plan.path + ' [supporting context only]');
      }
    } else if (artifacts.implementation_plan.exists) {
      pkg.push(artifacts.implementation_plan.path);
    }
  }

  // Agent-specific additions
  if (agent === 'dev' && artifacts.dev_state.exists) pkg.push('dev-state.md (check for stale state before using)');
  if (agent === 'architect' && artifacts.architecture.exists) pkg.push(artifacts.architecture.path);

  return [...new Set(pkg)];
}

// ─── Stale dev-state detection ───────────────────────────────────────────────

/**
 * Stale dev-state detection — synchronous baseline.
 *
 * F1 (workflow-handoff-integrity v1.9.7) extends the previous 2-condition logic
 * with parseError detection (AC-F1-08). For richer detection (orphan in
 * features.md, TTL > 30d), use the async `detectStaleDevStateRich` instead.
 */
function detectStaleDevState(devState, slug) {
  if (!devState.exists) return null;
  if (devState.parseError) {
    return `dev-state.md is corrupt (missing or unparseable frontmatter) — cannot trust as active context. Run \`aioson state:reset\` to clear, then \`aioson state:save --feature=<slug>\` for the current feature`;
  }
  if (devState.status === 'done') {
    return `dev-state.md is marked done (feature: ${devState.active_feature || 'unknown'}) — it belongs to a completed session and should not be used as active context`;
  }
  if (slug && devState.active_feature && devState.active_feature !== slug) {
    return `dev-state.md belongs to feature "${devState.active_feature}", not "${slug}" — load the correct dev-state or ignore this one`;
  }
  return null;
}

/**
 * Stale dev-state detection — async + features-aware.
 *
 * F1 (workflow-handoff-integrity v1.9.7) — extends `detectStaleDevState` with:
 *   - (a) feature marked `done` or `abandoned` in features.md
 *   - (b) feature absent from features.md (orphan / cross-project leak)
 *   - (c) `last_updated` > 30 days vs now
 *
 * All warnings embed an actionable command suggestion (state:reset or state:save)
 * per AC-F1-01.
 *
 * @param {object} devState   Result of `readDevState`.
 * @param {string|null} slug  Active feature slug (for mismatch check).
 * @param {string} targetDir  Project root (used to read features.md).
 * @param {number} [now]      Override Date.now() for testing.
 * @returns {Promise<string|null>}  Warning string or null when not stale.
 */
async function detectStaleDevStateRich(devState, slug, targetDir, now = Date.now()) {
  // Sync baseline first — corrupt / done / mismatch.
  const baseline = detectStaleDevState(devState, slug);
  if (baseline) return baseline;
  if (!devState.exists || !devState.active_feature) return null;

  // (a)+(b) — cross-reference features.md.
  const featuresPath = path.join(contextDir(targetDir), 'features.md');
  const featuresContent = await readFileSafe(featuresPath);
  if (featuresContent) {
    const featuresMap = parseFeaturesMap(featuresContent);
    const featureStatus = featuresMap.get(devState.active_feature);
    if (featureStatus === 'done' || featureStatus === 'abandoned') {
      return `dev-state.md points to feature "${devState.active_feature}" already marked \`${featureStatus}\` in features.md — run \`aioson state:reset\` to clear, then \`aioson state:save --feature=<new>\` for the next feature`;
    }
    if (featureStatus === undefined && featuresMap.size > 0) {
      return `dev-state.md points to feature "${devState.active_feature}" not present in features.md (orphan or cross-project leak) — run \`aioson state:reset\` to clear`;
    }
  }

  // (c) — TTL check.
  if (devState.last_updated) {
    const lastUpdatedTs = Date.parse(devState.last_updated);
    if (!Number.isNaN(lastUpdatedTs)) {
      const ageMs = now - lastUpdatedTs;
      const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000;
      if (ageMs > THIRTY_DAYS) {
        const days = Math.round(ageMs / (24 * 60 * 60 * 1000));
        return `dev-state.md is ${days} days old (last_updated: ${devState.last_updated}) — likely stale. Run \`aioson state:reset\` or \`aioson state:save --feature=<current>\` to refresh`;
      }
    }
  }

  return null;
}

/**
 * Parse features.md table into Map<slug, status>.
 * Tolerant of malformed rows and trailing whitespace.
 */
function parseFeaturesMap(content) {
  const map = new Map();
  for (const line of String(content || '').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('|')) continue;
    const parts = trimmed.split('|').map((p) => p.trim());
    if (parts.length < 5) continue;
    const slug = parts[1];
    const status = parts[2];
    if (!slug || slug === 'slug' || /^-+$/.test(slug)) continue;
    map.set(slug, status);
  }
  return map;
}

// ─── Readiness evaluator ─────────────────────────────────────────────────────

function evaluateReadiness(artifacts, phaseGates, classification, agent, devState, slug) {
  const blockers = [];
  const warnings = [];

  if (!artifacts.project_context.exists) blockers.push('project.context.md missing');

  if (agent === 'sheldon') {
    if (!artifacts.prd.exists) {
      blockers.push('prd file missing — @product must produce prd-{slug}.md first');
    }
    if (!artifacts.sheldon_enrichment.exists) {
      warnings.push('sheldon-enrichment file not found — this will be a first-session enrichment');
    }
  }

  if (agent === 'analyst') {
    if (!artifacts.prd.exists) blockers.push('prd file missing — @product must produce prd-{slug}.md first');
  }

  if (agent === 'architect') {
    if (!artifacts.requirements.exists) {
      blockers.push('requirements file missing — @analyst must produce requirements-{slug}.md first (Gate A)');
    }
  }

  if (agent === 'pm') {
    if (!artifacts.architecture.exists) {
      blockers.push('architecture.md missing — @architect must complete design first (Gate B)');
    }
    if (!artifacts.requirements.exists) {
      warnings.push('requirements file missing — @pm should review it before writing the implementation plan');
    }
  }

  if (agent === 'orchestrator') {
    if (!artifacts.requirements.exists) {
      blockers.push('requirements file missing — Gate A not satisfied');
    }
    if (!artifacts.spec.exists) {
      blockers.push('spec file missing — Gate C not satisfied');
    }
    const implementationPlan = artifacts.implementation_plan || { exists: false, frontmatter: {} };
    if (classification === 'MEDIUM' && !implementationPlan.exists) {
      blockers.push('implementation-plan-{slug}.md missing — @pm must produce it before orchestration');
    } else if (classification === 'MEDIUM' && implementationPlan.frontmatter.status !== 'approved') {
      blockers.push(`implementation plan is not approved: ${implementationPlan.frontmatter.status || 'missing status'} — @pm must approve it`);
    }
    if (phaseGates.plan !== 'approved') {
      blockers.push(`Gate C (plan) not approved: ${phaseGates.plan || 'pending'} — @pm must produce and approve implementation-plan-{slug}.md`);
    }
  }

  if (agent === 'dev' || agent === 'deyvin') {
    if (!artifacts.spec.exists) blockers.push('spec file missing');
    if (classification === 'MEDIUM') {
      const implementationPlan = artifacts.implementation_plan || { exists: false, frontmatter: {} };
      if (!implementationPlan.exists) {
        blockers.push('implementation-plan-{slug}.md missing — @pm must produce it before implementation');
      } else if (implementationPlan.frontmatter.status !== 'approved') {
        blockers.push(`implementation plan is not approved: ${implementationPlan.frontmatter.status || 'missing status'}`);
      }
    }
    if (classification && classification !== 'MICRO') {
      if (phaseGates.plan !== 'approved') {
        blockers.push(`Gate C (plan) not approved: ${phaseGates.plan || 'pending'} — run "aioson gate:check . --feature=${slug || '<slug>'} --gate=C"`);
      }
    }
    // Dev-state stale check
    if (devState) {
      const staleWarning = detectStaleDevState(devState, slug);
      if (staleWarning) warnings.push(`dev-state stale: ${staleWarning}`);
    }
  }

  if (agent === 'qa') {
    if (!artifacts.spec.exists) blockers.push('spec file missing');
    if (classification === 'MEDIUM') {
      const implementationPlan = artifacts.implementation_plan || { exists: false, frontmatter: {} };
      if (!implementationPlan.exists) {
        blockers.push('implementation-plan-{slug}.md missing');
      } else if (implementationPlan.frontmatter.status !== 'approved') {
        blockers.push(`implementation plan is not approved: ${implementationPlan.frontmatter.status || 'missing status'}`);
      }
    }
    if (classification && classification !== 'MICRO') {
      if (phaseGates.plan !== 'approved') {
        blockers.push(`Gate C (plan) not approved: ${phaseGates.plan || 'pending'}`);
      }
    }
  }

  if (blockers.length > 0) return { status: 'BLOCKED', blockers, warnings };
  if (warnings.length > 0) return { status: 'READY_WITH_WARNINGS', blockers: [], warnings };
  return { status: 'READY', blockers: [], warnings: [] };
}

// ─── Spec version extractor ───────────────────────────────────────────────────

function extractSpecVersion(artifact) {
  if (!artifact.exists) return null;
  return artifact.frontmatter.version || null;
}

function extractLastCheckpoint(artifact) {
  if (!artifact.exists) return null;
  const fm = artifact.frontmatter;
  if (fm.last_checkpoint) return fm.last_checkpoint;

  // Scan content for checkpoint patterns — use last occurrence (most recent)
  if (artifact.content) {
    const matches = artifact.content.match(/last_checkpoint:\s*(.+)/g);
    if (matches && matches.length > 0) {
      const last = matches[matches.length - 1];
      const val = last.replace(/^last_checkpoint:\s*/, '').trim().replace(/^["']|["']$/g, '');
      return val;
    }
  }
  return null;
}

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = {
  parseFrontmatter,
  readFileSafe,
  fileExists,
  fileStat,
  detectFramework,
  detectTestRunner,
  contextDir,
  rulesDir,
  designDocsDir,
  artifactPath,
  loadProjectContext,
  scanArtifacts,
  scanActiveManifest,
  parseGatesFromSpec,
  readPhaseGates,
  readDevState,
  detectStaleDevStateRich,
  parseFeaturesMap,
  readProjectPulse,
  detectClassification,
  parseAgentList,
  appliesToAgent,
  discoverRules,
  discoverDesignDocs,
  buildContextPackage,
  evaluateReadiness,
  detectStaleDevState,
  extractSpecVersion,
  extractLastCheckpoint,
  GATE_NAMES,
  GATE_ALIASES
};
