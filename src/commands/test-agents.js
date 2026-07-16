'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const { TEMPLATE_DIR } = require('../installer');
const { AGENT_DEFINITIONS, MANAGED_FILES } = require('../constants');

const OBSERVABILITY_EXEMPT = new Set(['neo']);

const REQUIRED_SECTIONS = [
  {
    key: 'mission',
    pattern: /^## Mission\s*$/im,
    label: 'Mission section'
  },
  {
    key: 'required_input',
    pattern: /^## Required input\s*$/im,
    label: 'Required input section'
  },
  {
    key: 'hard_constraints',
    pattern: /^## Hard constraints\s*$/im,
    label: 'Hard constraints section'
  },
  {
    key: 'language_boundary',
    pattern: /language boundary/i,
    label: 'language boundary'
  }
];

async function readFile(filePath) {
  try {
    return await fs.readFile(filePath, 'utf8');
  } catch (error) {
    if (error && error.code === 'ENOENT') return null;
    throw error;
  }
}

async function isDirectory(dirPath) {
  try {
    return (await fs.stat(dirPath)).isDirectory();
  } catch {
    return false;
  }
}

function normalizePath(filePath) {
  return String(filePath || '').split(path.sep).join('/');
}

function relativeDisplayPath(baseDir, filePath) {
  const relative = normalizePath(path.relative(baseDir, filePath));
  return relative && !relative.startsWith('../') ? relative : normalizePath(filePath);
}

function definitionFileName(agent) {
  return path.basename(agent.path);
}

function aliasDefinitions() {
  return AGENT_DEFINITIONS.flatMap((agent) => (
    Array.isArray(agent.aliases)
      ? agent.aliases.map((alias) => ({ id: alias, target: agent.id }))
      : []
  ));
}

async function findLocaleAgentFiles(localesRoot) {
  let localeEntries = [];
  try {
    localeEntries = await fs.readdir(localesRoot, { withFileTypes: true });
  } catch (error) {
    if (error && error.code === 'ENOENT') return [];
    throw error;
  }

  const found = [];
  for (const localeEntry of localeEntries) {
    if (!localeEntry.isDirectory()) continue;
    const agentsDir = path.join(localesRoot, localeEntry.name, 'agents');
    let agentEntries = [];
    try {
      agentEntries = await fs.readdir(agentsDir, { withFileTypes: true });
    } catch (error) {
      if (error && error.code === 'ENOENT') continue;
      throw error;
    }
    for (const agentEntry of agentEntries) {
      if (agentEntry.isFile() && agentEntry.name.endsWith('.md')) {
        found.push(path.join(agentsDir, agentEntry.name));
      }
    }
  }
  return found;
}

async function resolveSurfaces(args) {
  const explicitTarget = Boolean(args[0]);
  const targetDir = path.resolve(process.cwd(), args[0] || '.');
  const sourceTemplateRoot = path.join(targetDir, 'template', '.aioson', 'agents');
  const workspaceRoot = path.join(targetDir, '.aioson', 'agents');

  if (await isDirectory(sourceTemplateRoot)) {
    return {
      targetDir,
      source: 'source_template',
      canonicalRoot: sourceTemplateRoot,
      parityRoot: await isDirectory(workspaceRoot) ? workspaceRoot : null,
      localeRoots: [
        path.join(targetDir, 'template', '.aioson', 'locales'),
        path.join(targetDir, '.aioson', 'locales')
      ]
    };
  }

  if (await isDirectory(workspaceRoot)) {
    return {
      targetDir,
      source: 'workspace',
      canonicalRoot: workspaceRoot,
      parityRoot: null,
      localeRoots: [path.join(targetDir, '.aioson', 'locales')]
    };
  }

  if (!explicitTarget) {
    const packagedRoot = path.join(TEMPLATE_DIR, '.aioson', 'agents');
    if (await isDirectory(packagedRoot)) {
      return {
        targetDir: path.dirname(TEMPLATE_DIR),
        source: 'package_template',
        canonicalRoot: packagedRoot,
        parityRoot: null,
        localeRoots: [path.join(TEMPLATE_DIR, '.aioson', 'locales')]
      };
    }
  }

  return {
    targetDir,
    source: null,
    canonicalRoot: null,
    parityRoot: null,
    localeRoots: []
  };
}

async function runTestAgents({ args = [], options = {}, logger }) {
  const jsonMode = Boolean(options.json);
  const log = jsonMode ? () => {} : logger.log.bind(logger);
  const surfaces = await resolveSurfaces(args);

  if (!surfaces.canonicalRoot) {
    const result = {
      ok: false,
      reason: 'agents_not_found',
      targetDir: surfaces.targetDir,
      passed: 0,
      failed: 1,
      total: 1,
      score: 0,
      checks: [{
        id: 'agents:root:exists',
        name: 'canonical agents directory exists',
        ok: false,
        detail: `No template/.aioson/agents or .aioson/agents directory found under ${surfaces.targetDir}`
      }]
    };
    if (!jsonMode) log(result.checks[0].detail);
    return result;
  }

  const checks = [];
  let passed = 0;
  let failed = 0;

  function addCheck(id, name, ok, detail = '', metadata = {}) {
    const check = { id, name, ok, detail, ...metadata };
    checks.push(check);
    if (ok) {
      passed += 1;
      log(`  \u2713 ${name}`);
    } else {
      failed += 1;
      log(`  \u2717 ${name}${detail ? ` \u2014 ${detail}` : ''}`);
    }
  }

  log('');
  log(`Canonical agents (${surfaces.source}):`);

  const ids = AGENT_DEFINITIONS.map((agent) => agent.id);
  const paths = AGENT_DEFINITIONS.map((agent) => agent.path);
  addCheck(
    'catalog:unique_ids',
    'agent catalog has unique ids',
    new Set(ids).size === ids.length
  );
  addCheck(
    'catalog:unique_paths',
    'agent catalog has unique paths',
    new Set(paths).size === paths.length
  );

  for (const agent of AGENT_DEFINITIONS) {
    const fileName = definitionFileName(agent);
    const filePath = path.join(surfaces.canonicalRoot, fileName);
    const displayPath = relativeDisplayPath(surfaces.targetDir, filePath);
    const content = await readFile(filePath);

    addCheck(
      `agent:${agent.id}:exists`,
      `@${agent.id} exists`,
      content !== null,
      content === null ? `File not found: ${displayPath}` : '',
      { agent: agent.id, file: displayPath }
    );

    addCheck(
      `agent:${agent.id}:managed`,
      `@${agent.id} is managed`,
      MANAGED_FILES.includes(agent.path),
      MANAGED_FILES.includes(agent.path) ? '' : `Missing from MANAGED_FILES: ${agent.path}`,
      { agent: agent.id, file: agent.path }
    );

    if (content === null) continue;

    for (const section of REQUIRED_SECTIONS) {
      addCheck(
        `agent:${agent.id}:${section.key}`,
        `@${agent.id} has ${section.label}`,
        section.pattern.test(content),
        '',
        { agent: agent.id, file: displayPath }
      );
    }

    if (!OBSERVABILITY_EXEMPT.has(agent.id)) {
      addCheck(
        `agent:${agent.id}:observability`,
        `@${agent.id} registers completion`,
        /aioson agent:done\b/.test(content),
        '',
        { agent: agent.id, file: displayPath }
      );
    }
  }

  const aliases = aliasDefinitions();
  for (const alias of aliases) {
    const filePath = path.join(surfaces.canonicalRoot, `${alias.id}.md`);
    const displayPath = relativeDisplayPath(surfaces.targetDir, filePath);
    const content = await readFile(filePath);
    addCheck(
      `alias:${alias.id}:exists`,
      `@${alias.id} alias exists`,
      content !== null,
      content === null ? `File not found: ${displayPath}` : '',
      { agent: alias.id, file: displayPath }
    );
    if (content !== null) {
      addCheck(
        `alias:${alias.id}:target`,
        `@${alias.id} delegates to @${alias.target}`,
        content.includes(`@${alias.target}`) && content.includes(`${alias.target}.md`),
        '',
        { agent: alias.id, file: displayPath }
      );
    }
  }

  if (surfaces.parityRoot) {
    log('');
    log('Template/workspace parity:');
    const parityFiles = [
      ...AGENT_DEFINITIONS.map(definitionFileName),
      ...aliases.map((alias) => `${alias.id}.md`)
    ];
    for (const fileName of parityFiles) {
      const canonicalPath = path.join(surfaces.canonicalRoot, fileName);
      const workspacePath = path.join(surfaces.parityRoot, fileName);
      const [canonicalContent, workspaceContent] = await Promise.all([
        readFile(canonicalPath),
        readFile(workspacePath)
      ]);
      const workspaceDisplayPath = relativeDisplayPath(surfaces.targetDir, workspacePath);
      addCheck(
        `parity:${path.basename(fileName, '.md')}`,
        `${fileName} template/workspace parity`,
        canonicalContent !== null && workspaceContent !== null && canonicalContent === workspaceContent,
        workspaceContent === null
          ? `Workspace file not found: ${workspaceDisplayPath}`
          : canonicalContent !== workspaceContent
            ? `Content drift: ${workspaceDisplayPath}`
            : '',
        { file: workspaceDisplayPath }
      );
    }
  }

  const localeAgentFiles = [];
  for (const localeRoot of surfaces.localeRoots) {
    localeAgentFiles.push(...await findLocaleAgentFiles(localeRoot));
  }
  addCheck(
    'locales:canonical_only',
    'legacy locale agent packs are absent',
    localeAgentFiles.length === 0,
    localeAgentFiles.length > 0
      ? localeAgentFiles.slice(0, 5).map((file) => relativeDisplayPath(surfaces.targetDir, file)).join(', ')
      : ''
  );

  const total = passed + failed;
  const score = total > 0 ? Math.round((passed / total) * 100) : 0;

  if (!jsonMode) {
    log('');
    log(`Result: ${passed}/${total} checks passed (${score}%)`);
    log(failed > 0 ? `${failed} check(s) failed.` : 'All checks passed.');
  }

  return {
    ok: failed === 0,
    targetDir: surfaces.targetDir,
    source: surfaces.source,
    canonicalRoot: relativeDisplayPath(surfaces.targetDir, surfaces.canonicalRoot),
    parityRoot: surfaces.parityRoot
      ? relativeDisplayPath(surfaces.targetDir, surfaces.parityRoot)
      : null,
    agentCount: AGENT_DEFINITIONS.length,
    aliasCount: aliases.length,
    passed,
    failed,
    total,
    score,
    checks
  };
}

module.exports = { runTestAgents };
