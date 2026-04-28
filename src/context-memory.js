'use strict';

const path = require('node:path');
const fs = require('node:fs/promises');
const { exists, readTextIfExists, ensureDir } = require('./utils');

const CONTEXT_DIR = '.aioson/context';
const PROJECT_CONTEXT_FILE = `${CONTEXT_DIR}/project.context.md`;
const DISCOVERY_FILE = `${CONTEXT_DIR}/discovery.md`;
const SKELETON_FILE = `${CONTEXT_DIR}/skeleton-system.md`;
const ARCHITECTURE_FILE = `${CONTEXT_DIR}/architecture.md`;
const SPEC_FILE = `${CONTEXT_DIR}/spec.md`;
const SPEC_CURRENT_FILE = `${CONTEXT_DIR}/spec-current.md`;
const SPEC_HISTORY_FILE = `${CONTEXT_DIR}/spec-history.md`;
const MEMORY_INDEX_FILE = `${CONTEXT_DIR}/memory-index.md`;
const DESIGN_DOC_FILE = `${CONTEXT_DIR}/design-doc.md`;
const READINESS_FILE = `${CONTEXT_DIR}/readiness.md`;
const PRD_FILE = `${CONTEXT_DIR}/prd.md`;
const UI_SPEC_FILE = `${CONTEXT_DIR}/ui-spec.md`;
const SCAN_INDEX_FILE = `${CONTEXT_DIR}/scan-index.md`;
const SCAN_FOLDERS_FILE = `${CONTEXT_DIR}/scan-folders.md`;
const SCAN_AIOSON_FILE = `${CONTEXT_DIR}/scan-aioson.md`;
const CONTEXT_PACK_FILE = `${CONTEXT_DIR}/context-pack.md`;
const BOOTSTRAP_DIR = '.aioson/context/bootstrap';
const BOOTSTRAP_WHAT_IS = `${BOOTSTRAP_DIR}/what-is.md`;
const BOOTSTRAP_HOW_IT_WORKS = `${BOOTSTRAP_DIR}/how-it-works.md`;
const BOOTSTRAP_WHAT_IT_DOES = `${BOOTSTRAP_DIR}/what-it-does.md`;
const BOOTSTRAP_CURRENT_STATE = `${BOOTSTRAP_DIR}/current-state.md`;

const SPEC_SECTION_ALIASES = {
  stack: ['stack'],
  current_state: ['estado atual', 'current state', 'estado actual', 'etat actuel'],
  done: ['concluido', 'done', 'completado', 'termine'],
  in_progress: ['em andamento', 'in progress', 'en progreso', 'en cours'],
  planned: ['planejado', 'planned', 'planificado', 'planifie'],
  open_decisions: ['decisoes em aberto', 'open decisions', 'decisiones abiertas', 'decisions ouvertes'],
  decided: ['decisoes tomadas', 'decisions taken', 'decisiones tomadas', 'decisions prises'],
  notes: ['notas', 'notes']
};

const CONTEXT_DOC_SPECS = [
  {
    relPath: PROJECT_CONTEXT_FILE,
    title: 'Project Context',
    group: 'foundation',
    readWhen: 'stack, classification, framework installation status, language and tool assumptions',
    tags: ['foundation', 'project', 'stack']
  },
  {
    relPath: MEMORY_INDEX_FILE,
    title: 'Memory Index',
    group: 'foundation',
    readWhen: 'you want to decide the minimum context to load next',
    tags: ['foundation', 'index', 'routing']
  },
  {
    relPath: SKELETON_FILE,
    title: 'System Skeleton',
    group: 'system',
    readWhen: 'you need a quick structural map before opening deeper files',
    tags: ['system', 'structure', 'quick']
  },
  {
    relPath: DISCOVERY_FILE,
    title: 'Discovery',
    group: 'system',
    readWhen: 'you need entities, routes, conventions, dependencies or what must be preserved',
    tags: ['system', 'domain', 'entities', 'routes']
  },
  {
    relPath: ARCHITECTURE_FILE,
    title: 'Architecture',
    group: 'system',
    readWhen: 'you need technical boundaries, module order, migration sequence or implementation structure',
    tags: ['system', 'architecture', 'implementation']
  },
  {
    relPath: SPEC_FILE,
    title: 'Spec',
    group: 'development',
    readWhen: 'you need the authoritative living development memory for the whole project',
    tags: ['development', 'source-of-truth', 'spec']
  },
  {
    relPath: SPEC_CURRENT_FILE,
    title: 'Spec Current',
    group: 'development',
    readWhen: 'you only need current state, in-progress items and open decisions',
    tags: ['development', 'current', 'spec']
  },
  {
    relPath: SPEC_HISTORY_FILE,
    title: 'Spec History',
    group: 'development',
    readWhen: 'you need completed work, historical decisions, regressions or previous implementation context',
    tags: ['development', 'history', 'decisions', 'regression']
  },
  {
    relPath: DESIGN_DOC_FILE,
    title: 'Design Doc',
    group: 'scope',
    readWhen: 'you need the living scope framing for the current initiative',
    tags: ['scope', 'design-doc', 'planning']
  },
  {
    relPath: READINESS_FILE,
    title: 'Readiness',
    group: 'scope',
    readWhen: 'you need to know if the current scope is ready for planning or implementation',
    tags: ['scope', 'readiness', 'planning']
  },
  {
    relPath: PRD_FILE,
    title: 'PRD',
    group: 'scope',
    readWhen: 'you need product intent, MVP scope or acceptance targets',
    tags: ['scope', 'product', 'acceptance']
  },
  {
    relPath: UI_SPEC_FILE,
    title: 'UI Spec',
    group: 'scope',
    readWhen: 'you need UI tokens, screen map, states or handoff notes',
    tags: ['scope', 'ui', 'design']
  },
  {
    relPath: SCAN_INDEX_FILE,
    title: 'Scan Index',
    group: 'scan',
    readWhen: 'you need the brownfield scan footprint and links to local maps',
    tags: ['scan', 'brownfield', 'index']
  },
  {
    relPath: SCAN_FOLDERS_FILE,
    title: 'Folder Map',
    group: 'scan',
    readWhen: 'you need the top-level directory map of the project',
    tags: ['scan', 'brownfield', 'folders']
  },
  {
    relPath: SCAN_AIOSON_FILE,
    title: 'AIOSON Generated Map',
    group: 'scan',
    readWhen: 'you need generated context pages, squads, genomes or local MCP artifacts',
    tags: ['scan', 'brownfield', 'aioson']
  },
  {
    relPath: BOOTSTRAP_WHAT_IS,
    title: 'System Identity',
    group: 'bootstrap',
    readWhen: 'you need to understand what the system IS, who uses it, and why it exists',
    tags: ['bootstrap', 'identity', 'semantic']
  },
  {
    relPath: BOOTSTRAP_HOW_IT_WORKS,
    title: 'System Mechanics',
    group: 'bootstrap',
    readWhen: 'you need to understand how the system works — architecture, modules, data flow',
    tags: ['bootstrap', 'architecture', 'semantic']
  },
  {
    relPath: BOOTSTRAP_WHAT_IT_DOES,
    title: 'System Features',
    group: 'bootstrap',
    readWhen: 'you need to know what features exist, business rules, and user workflows',
    tags: ['bootstrap', 'features', 'semantic']
  },
  {
    relPath: BOOTSTRAP_CURRENT_STATE,
    title: 'System Current State',
    group: 'bootstrap',
    readWhen: 'you need to know what is implemented, in progress, or planned',
    tags: ['bootstrap', 'state', 'semantic']
  }
];

function normalizeForLookup(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[`*_]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function sanitizeContextSegment(value) {
  return String(value || '')
    .trim()
    .replace(/\\/g, '/')
    .replace(/^\.\/+/, '')
    .replace(/[/.]+/g, '-')
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '') || 'module';
}

function buildModuleMemoryRelativePath(folder) {
  return `${CONTEXT_DIR}/module-${sanitizeContextSegment(folder)}.md`;
}

function splitFrontmatter(markdown) {
  const text = String(markdown || '');
  if (!text.startsWith('---\n')) {
    return { frontmatter: '', body: text };
  }

  const markerIndex = text.indexOf('\n---\n', 4);
  if (markerIndex === -1) {
    return { frontmatter: '', body: text };
  }

  return {
    frontmatter: text.slice(0, markerIndex + 5).trim(),
    body: text.slice(markerIndex + 5)
  };
}

function extractMarkdownSection(markdown, aliases) {
  const wanted = new Set((aliases || []).map(normalizeForLookup));
  if (wanted.size === 0) return '';

  const { body } = splitFrontmatter(markdown);
  const lines = String(body || '').split('\n');
  let start = -1;
  let level = 0;

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const match = /^(#{1,6})\s+(.+?)\s*$/.exec(line);
    if (!match) continue;

    const headingLevel = match[1].length;
    const heading = normalizeForLookup(match[2]);

    if (start === -1 && wanted.has(heading)) {
      start = i + 1;
      level = headingLevel;
      continue;
    }

    if (start !== -1 && headingLevel <= level) {
      return lines.slice(start, i).join('\n').trim();
    }
  }

  if (start !== -1) {
    return lines.slice(start).join('\n').trim();
  }

  return '';
}

function trimExcerpt(markdown, maxChars = 2200) {
  const text = String(markdown || '').trim();
  if (text.length <= maxChars) return text;
  return `${text.slice(0, maxChars).trimEnd()}\n... [truncated at ${maxChars} chars]`;
}

function takeLastListItems(markdown, maxItems = 5) {
  const lines = String(markdown || '')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => /^[-*]\s+/.test(line) || /^\d+\.\s+/.test(line));

  if (lines.length === 0) return '';
  return lines.slice(-maxItems).join('\n');
}

function fallbackSection(text) {
  const trimmed = String(text || '').trim();
  return trimmed || '_Not captured in spec.md_';
}

function buildSpecCurrentMarkdown(specContent, generatedAt) {
  if (!specContent) return null;

  const stack = extractMarkdownSection(specContent, SPEC_SECTION_ALIASES.stack);
  const currentState = extractMarkdownSection(specContent, SPEC_SECTION_ALIASES.current_state);
  const inProgress = extractMarkdownSection(specContent, SPEC_SECTION_ALIASES.in_progress);
  const planned = extractMarkdownSection(specContent, SPEC_SECTION_ALIASES.planned);
  const openDecisions = extractMarkdownSection(specContent, SPEC_SECTION_ALIASES.open_decisions);
  const notes = extractMarkdownSection(specContent, SPEC_SECTION_ALIASES.notes);
  const latestDecisions = takeLastListItems(
    extractMarkdownSection(specContent, SPEC_SECTION_ALIASES.decided),
    5
  );

  return [
    '# Spec Current',
    `_Generated from spec.md — ${generatedAt}_`,
    '',
    '## Source',
    `- Authoritative source: \`${SPEC_FILE}\``,
    '- This file is a focused view for current implementation context.',
    '',
    '## Stack',
    fallbackSection(stack),
    '',
    '## Current state',
    fallbackSection(currentState),
    '',
    '## In progress',
    fallbackSection(inProgress),
    '',
    '## Planned next',
    fallbackSection(planned),
    '',
    '## Open decisions',
    fallbackSection(openDecisions),
    '',
    '## Latest decisions',
    fallbackSection(latestDecisions),
    '',
    '## Notes for the next session',
    fallbackSection(notes)
  ].join('\n');
}

function buildSpecHistoryMarkdown(specContent, generatedAt) {
  if (!specContent) return null;

  const done = extractMarkdownSection(specContent, SPEC_SECTION_ALIASES.done);
  const decided = extractMarkdownSection(specContent, SPEC_SECTION_ALIASES.decided);
  const notes = extractMarkdownSection(specContent, SPEC_SECTION_ALIASES.notes);

  return [
    '# Spec History',
    `_Generated from spec.md — ${generatedAt}_`,
    '',
    '## Source',
    `- Authoritative source: \`${SPEC_FILE}\``,
    '- Use this view when you need historical implementation context, completed work or dated decisions.',
    '',
    '## Completed work',
    fallbackSection(done),
    '',
    '## Decision log',
    fallbackSection(decided),
    '',
    '## Archived notes',
    fallbackSection(notes)
  ].join('\n');
}

function extractTreeBlock(markdown) {
  const match = /```text\n([\s\S]*?)\n```/.exec(String(markdown || ''));
  return match ? match[1].trim() : '';
}

function summarizeTree(tree) {
  const lines = String(tree || '').split('\n').filter(Boolean);
  const directories = lines.filter((line) => line.trim().endsWith('/')).length;
  const files = Math.max(0, lines.length - directories);
  return { directories, files, preview: lines.slice(0, 18).join('\n') };
}

function buildModuleMemoryMarkdown({ folder, scanRelativePath, scanMarkdown, generatedAt }) {
  const tree = extractTreeBlock(scanMarkdown);
  const treeSummary = summarizeTree(tree);

  return [
    `# Module Memory: ${folder}`,
    `_Generated from ${scanRelativePath} — ${generatedAt}_`,
    '',
    '## Read this when',
    `- you are working inside \`${folder}/\``,
    '- you want a focused context slice before opening the raw scan map',
    '- you need to route a context pack to this module or folder',
    '',
    '## Scope',
    `- Source folder: \`${folder}/\``,
    `- Source scan map: \`${scanRelativePath}\``,
    `- Approx structure: ${treeSummary.directories} directories, ${treeSummary.files} files`,
    '',
    '## Quick map',
    treeSummary.preview
      ? ['```text', treeSummary.preview, '```'].join('\n')
      : '_No tree preview available_',
    '',
    '## Related memory',
    `- \`${SKELETON_FILE}\` for project-wide structure`,
    `- \`${DISCOVERY_FILE}\` for domain, conventions and entities`,
    `- \`${ARCHITECTURE_FILE}\` for technical boundaries`,
    `- \`${SPEC_CURRENT_FILE}\` for active implementation context`
  ].join('\n');
}

async function loadExistingFolderScans(targetDir) {
  const contextDir = path.join(targetDir, CONTEXT_DIR);
  let names = [];
  try {
    names = await fs.readdir(contextDir);
  } catch {
    return [];
  }

  const scanFiles = names
    .filter((name) => /^scan-.+\.md$/.test(name))
    .filter((name) => !['scan-index.md', 'scan-folders.md', 'scan-aioson.md'].includes(name))
    .sort((a, b) => a.localeCompare(b));

  const out = [];
  for (const name of scanFiles) {
    const relPath = `${CONTEXT_DIR}/${name}`;
    const markdown = await readTextIfExists(path.join(targetDir, relPath));
    if (!markdown) continue;
    const titleMatch = /^# Folder Scan: (.+)$/m.exec(markdown);
    const folder = titleMatch ? titleMatch[1].trim() : name.replace(/^scan-/, '').replace(/\.md$/, '');
    out.push({
      folder,
      relativePath: relPath,
      absolutePath: path.join(targetDir, relPath),
      markdown
    });
  }
  return out;
}

async function collectContextCatalog(targetDir) {
  const docs = [];

  for (const spec of CONTEXT_DOC_SPECS) {
    docs.push({
      ...spec,
      exists: await exists(path.join(targetDir, spec.relPath))
    });
  }

  const contextDir = path.join(targetDir, CONTEXT_DIR);
  let names = [];
  try {
    names = await fs.readdir(contextDir);
  } catch {
    return docs;
  }

  const dynamicFiles = names
    .filter((name) => name.endsWith('.md'))
    .filter((name) => !docs.some((doc) => path.basename(doc.relPath) === name))
    .sort((a, b) => a.localeCompare(b));

  for (const name of dynamicFiles) {
    const relPath = `${CONTEXT_DIR}/${name}`;
    if (/^module-.+\.md$/.test(name)) {
      docs.push({
        relPath,
        title: `Module Memory (${name.replace(/^module-/, '').replace(/\.md$/, '')})`,
        group: 'modules',
        readWhen: 'you need a focused module-level slice instead of the whole project memory',
        tags: ['module', 'focus'],
        exists: true
      });
      continue;
    }

    if (/^scan-.+\.md$/.test(name)) {
      docs.push({
        relPath,
        title: `Scan Map (${name.replace(/^scan-/, '').replace(/\.md$/, '')})`,
        group: 'scan',
        readWhen: 'you need raw brownfield structure for a specific folder',
        tags: ['scan', 'brownfield'],
        exists: true
      });
      continue;
    }

    if (/^prd-.+\.md$/.test(name)) {
      docs.push({
        relPath,
        title: `Feature PRD (${name.replace(/^prd-/, '').replace(/\.md$/, '')})`,
        group: 'scope',
        readWhen: 'you are working on a feature-specific product scope',
        tags: ['scope', 'prd', 'feature'],
        exists: true
      });
      continue;
    }

    if (/^spec-.+\.md$/.test(name)) {
      docs.push({
        relPath,
        title: `Feature Spec (${name.replace(/^spec-/, '').replace(/\.md$/, '')})`,
        group: 'development',
        readWhen: 'you need implementation details for a specific feature rather than the whole project',
        tags: ['development', 'feature', 'spec'],
        exists: true
      });
      continue;
    }

    if (/^requirements-.+\.md$/.test(name)) {
      docs.push({
        relPath,
        title: `Feature Requirements (${name.replace(/^requirements-/, '').replace(/\.md$/, '')})`,
        group: 'scope',
        readWhen: 'you need feature-specific requirements and edge cases',
        tags: ['scope', 'feature', 'requirements'],
        exists: true
      });
    }
  }

  return docs;
}

function buildMemoryIndexMarkdown({ generatedAt, catalog }) {
  const available = catalog.filter((doc) => doc.exists);
  const grouped = new Map();
  for (const doc of available) {
    if (!grouped.has(doc.group)) grouped.set(doc.group, []);
    grouped.get(doc.group).push(doc);
  }

  const lines = [
    '# Memory Index',
    `_Generated by aioson memory refresh — ${generatedAt}_`,
    '',
    '## Start here',
    `- Read \`${PROJECT_CONTEXT_FILE}\` first for stack, classification, framework state and language.`,
    `- Read \`${MEMORY_INDEX_FILE}\` when you need to decide the smallest useful context pack.`,
    `- Read \`${SKELETON_FILE}\` before \`${DISCOVERY_FILE}\` when you only need quick orientation.`,
    `- Treat \`${DISCOVERY_FILE}\` + \`${SPEC_FILE}\` as the full project memory pair.`,
    `- Prefer \`${SPEC_CURRENT_FILE}\` for the active state and \`${SPEC_HISTORY_FILE}\` for historical decisions.`,
    '',
    '## Suggested reading order by task',
    `- Code change: \`${PROJECT_CONTEXT_FILE}\` -> \`${SKELETON_FILE}\` -> \`${DISCOVERY_FILE}\` -> \`${SPEC_CURRENT_FILE}\` -> \`${ARCHITECTURE_FILE}\``,
    `- Regression / bugfix: \`${PROJECT_CONTEXT_FILE}\` -> \`${SKELETON_FILE}\` -> \`${DISCOVERY_FILE}\` -> \`${SPEC_CURRENT_FILE}\` -> \`${SPEC_HISTORY_FILE}\``,
    `- Product / planning: \`${PROJECT_CONTEXT_FILE}\` -> \`${DISCOVERY_FILE}\` -> \`${PRD_FILE}\` -> \`${DESIGN_DOC_FILE}\` -> \`${READINESS_FILE}\``,
    `- Brownfield deep dive: \`${SCAN_INDEX_FILE}\` -> module memory -> folder scan -> \`${DISCOVERY_FILE}\``,
    ''
  ];

  const groupOrder = ['foundation', 'bootstrap', 'system', 'development', 'scope', 'modules', 'scan'];
  const groupTitles = {
    foundation: 'Foundation Docs',
    bootstrap: 'Bootstrap — Semantic Knowledge Cache',
    system: 'System Memory',
    development: 'Development Memory',
    scope: 'Scope Docs',
    modules: 'Module Docs',
    scan: 'Brownfield Maps'
  };

  for (const group of groupOrder) {
    const docs = grouped.get(group) || [];
    if (docs.length === 0) continue;
    lines.push(`## ${groupTitles[group]}`);
    lines.push('| File | Read when |');
    lines.push('|------|-----------|');
    for (const doc of docs) {
      lines.push(`| ${doc.relPath} | ${doc.readWhen} |`);
    }
    lines.push('');
  }

  if (available.length === 0) {
    lines.push('_No context documents detected yet_');
  }

  return lines.join('\n').trim();
}

function rankContextDoc(doc, { agent, goal, module }) {
  let score = 0;
  const reasons = [];
  const lowerGoal = normalizeForLookup(goal);
  const lowerAgent = normalizeForLookup(agent);
  const lowerModule = normalizeForLookup(module);
  const lookupText = `${lowerAgent} ${lowerGoal}`.trim();

  if (doc.relPath === PROJECT_CONTEXT_FILE) {
    score += 100;
    reasons.push('base project metadata');
  }
  if (doc.relPath === MEMORY_INDEX_FILE) {
    score += 90;
    reasons.push('routing map for minimal context');
  }
  if (doc.relPath === SKELETON_FILE) {
    score += 80;
    reasons.push('fast structural orientation');
  }
  if (doc.relPath === DISCOVERY_FILE) {
    score += 75;
    reasons.push('domain and conventions');
  }
  if (doc.relPath === SPEC_CURRENT_FILE) {
    score += 70;
    reasons.push('active development state');
  }
  if (doc.relPath === SPEC_HISTORY_FILE && /(history|historico|historic|regress|rollback|why|decision|decisao|decisión)/.test(lowerGoal)) {
    score += 70;
    reasons.push('historical decision context');
  }
  if (doc.relPath === ARCHITECTURE_FILE && /(architect|dev|qa|refactor|endpoint|service|migration|model|api)/.test(lowerAgent || lowerGoal)) {
    score += 60;
    reasons.push('technical boundaries and sequencing');
  }
  if (doc.relPath === UI_SPEC_FILE && /(ui|ux|layout|screen|tela|css|design|frontend)/.test(lowerGoal || lowerAgent)) {
    score += 60;
    reasons.push('UI-specific context');
  }
  if (doc.relPath === PRD_FILE && /(product|pm|qa|accept|scope|mvp|feature)/.test(lowerGoal || lowerAgent)) {
    score += 45;
    reasons.push('product and acceptance context');
  }
  if (doc.relPath === DESIGN_DOC_FILE && /(scope|product|analyst|architect|pm|plan)/.test(lowerGoal || lowerAgent)) {
    score += 45;
    reasons.push('current scope framing');
  }
  if (doc.relPath === READINESS_FILE && /(ready|readiness|plan|architect|analyst|pm)/.test(lowerGoal || lowerAgent)) {
    score += 35;
    reasons.push('readiness signal');
  }
  if (doc.group === 'bootstrap') {
    if (doc.relPath === BOOTSTRAP_WHAT_IS && /(product|analyst|what|identity|understand|discover|bootstrap|memory|continuity)/.test(lookupText)) {
      score += 70;
      reasons.push('semantic system identity');
    }
    if (doc.relPath === BOOTSTRAP_HOW_IT_WORKS && /(dev|architect|how|architecture|implement|refactor|bootstrap|memory|continuity)/.test(lookupText)) {
      score += 70;
      reasons.push('semantic system mechanics');
    }
    if (doc.relPath === BOOTSTRAP_WHAT_IT_DOES && /(product|analyst|feature|business|rule|workflow|bootstrap|memory|continuity)/.test(lookupText)) {
      score += 65;
      reasons.push('semantic features and business rules');
    }
    if (doc.relPath === BOOTSTRAP_CURRENT_STATE && /(dev|qa|state|current|progress|status|bootstrap|memory|continuity)/.test(lookupText)) {
      score += 65;
      reasons.push('semantic current state');
    }
  }
  if (/module-/.test(doc.relPath) && lowerModule) {
    if (normalizeForLookup(doc.relPath).includes(lowerModule)) {
      score += 80;
      reasons.push(`module focus: ${module}`);
    }
  }
  if (/scan-/.test(doc.relPath) && lowerModule) {
    if (normalizeForLookup(doc.relPath).includes(lowerModule)) {
      score += 55;
      reasons.push(`raw scan for module: ${module}`);
    }
  }
  if (/module-/.test(doc.relPath) && /(module|folder|area|feature)/.test(lowerGoal)) {
    score += 25;
    reasons.push('module-focused request');
  }
  if (/(bug|fix|regress|refactor|implement|endpoint|route|service|model|migration|auth|caption|editor)/.test(lowerGoal)) {
    if ([DISCOVERY_FILE, SPEC_CURRENT_FILE, ARCHITECTURE_FILE, SKELETON_FILE].includes(doc.relPath)) {
      score += 20;
    }
  }

  if (reasons.length === 0 && doc.group === 'scan') {
    score += 10;
    reasons.push('fallback brownfield map');
  }

  return { score, reasons };
}

function buildPackExcerpt(content, relPath) {
  if (!content) return '_File not found_';
  if (relPath === SPEC_HISTORY_FILE) {
    const lines = String(content).trim().split('\n');
    return trimExcerpt(lines.slice(-80).join('\n'), 2200);
  }
  if (relPath.endsWith('project.context.md') || relPath.endsWith('memory-index.md')) {
    return trimExcerpt(content, 2800);
  }
  if (/module-|scan-/.test(path.basename(relPath))) {
    return trimExcerpt(content, 1800);
  }
  return trimExcerpt(content, 2400);
}

function buildContextPackMarkdown({ generatedAt, agent, goal, module, selectedDocs }) {
  const lines = [
    '# Context Pack',
    `_Generated by aioson context:pack — ${generatedAt}_`,
    '',
    '## Request',
    `- Agent: ${agent ? `@${agent}` : '(not specified)'}`,
    `- Goal: ${goal || '(not specified)'}`,
    `- Module focus: ${module || '(not specified)'}`,
    '',
    '## Recommended reading order'
  ];

  if (selectedDocs.length === 0) {
    lines.push('_No context files matched yet. Run setup:context, scan:project, or create the relevant context docs first._');
  } else {
    selectedDocs.forEach((doc, index) => {
      lines.push(`${index + 1}. \`${doc.relPath}\` — ${doc.reason}`);
    });
  }

  lines.push('', '## Embedded context');
  if (selectedDocs.length === 0) {
    lines.push('', '_No embedded excerpts available yet_');
  } else {
    for (const doc of selectedDocs) {
      lines.push('', `### ${doc.relPath}`);
      lines.push(`Reason: ${doc.reason}`);
      lines.push('```md');
      lines.push(doc.excerpt);
      lines.push('```');
    }
  }

  return lines.join('\n');
}

async function writeTextFile(filePath, content) {
  await ensureDir(path.dirname(filePath));
  await fs.writeFile(filePath, `${String(content).trim()}\n`, 'utf8');
}

async function writeDerivedContextMemory({
  targetDir,
  generatedAt = new Date().toISOString().replace(/\.\d+Z$/, 'Z'),
  folderScans = []
}) {
  const effectiveFolderScans =
    folderScans.length > 0 ? folderScans : await loadExistingFolderScans(targetDir);

  const specContent = await readTextIfExists(path.join(targetDir, SPEC_FILE));
  const written = [];

  let specCurrentPath = null;
  let specHistoryPath = null;
  if (specContent) {
    specCurrentPath = path.join(targetDir, SPEC_CURRENT_FILE);
    specHistoryPath = path.join(targetDir, SPEC_HISTORY_FILE);
    await writeTextFile(specCurrentPath, buildSpecCurrentMarkdown(specContent, generatedAt));
    await writeTextFile(specHistoryPath, buildSpecHistoryMarkdown(specContent, generatedAt));
    written.push(SPEC_CURRENT_FILE, SPEC_HISTORY_FILE);
  }

  const moduleDocs = [];
  for (const scan of effectiveFolderScans) {
    const relativePath = buildModuleMemoryRelativePath(scan.folder);
    const absolutePath = path.join(targetDir, relativePath);
    const markdown = buildModuleMemoryMarkdown({
      folder: scan.folder,
      scanRelativePath: scan.relativePath,
      scanMarkdown: scan.markdown,
      generatedAt
    });
    await writeTextFile(absolutePath, markdown);
    moduleDocs.push({
      folder: scan.folder,
      relativePath,
      absolutePath
    });
    written.push(relativePath);
  }

  const catalog = await collectContextCatalog(targetDir);
  const catalogWithMemoryIndex = catalog.some((doc) => doc.relPath === MEMORY_INDEX_FILE)
    ? catalog
    : [
      ...catalog,
      {
        relPath: MEMORY_INDEX_FILE,
        title: 'Memory Index',
        group: 'foundation',
        readWhen: 'you want to decide the minimum context to load next',
        tags: ['foundation', 'index', 'routing'],
        exists: true
      }
    ];
  const memoryIndexPath = path.join(targetDir, MEMORY_INDEX_FILE);
  const memoryIndexMarkdown = buildMemoryIndexMarkdown({
    generatedAt,
    catalog: catalogWithMemoryIndex
  });
  await writeTextFile(memoryIndexPath, memoryIndexMarkdown);
  written.push(MEMORY_INDEX_FILE);

  return {
    written,
    memoryIndexPath,
    specCurrentPath,
    specHistoryPath,
    moduleDocs
  };
}

async function collectActiveDossiers(targetDir) {
  const featuresDir = path.join(targetDir, CONTEXT_DIR, 'features');
  let slugs = [];
  try {
    const entries = await fs.readdir(featuresDir, { withFileTypes: true });
    slugs = entries.filter((e) => e.isDirectory()).map((e) => e.name);
  } catch {
    return [];
  }

  const active = [];
  for (const slug of slugs) {
    const p = path.join(featuresDir, slug, 'dossier.md');
    try {
      const raw = await fs.readFile(p, 'utf8');
      const statusMatch = raw.match(/^status:\s*(\S+)\s*$/m);
      const updatedMatch = raw.match(/^last_updated_at:\s*(\S+)\s*$/m);
      if (!statusMatch || statusMatch[1] !== 'active') continue;
      const relPath = `${CONTEXT_DIR}/features/${slug}/dossier.md`;
      active.push({
        relPath,
        slug,
        lastUpdatedAt: updatedMatch ? updatedMatch[1] : null,
        title: `Feature Dossier (${slug})`,
        group: 'dossier',
        readWhen: `active feature "${slug}" synthesis — why, what, code map, agent trail`,
        tags: ['dossier', 'feature', 'active'],
        exists: true
      });
    } catch {
      // skip unreadable
    }
  }

  // Sort by last_updated_at descending (most recent first)
  active.sort((a, b) => {
    if (!a.lastUpdatedAt && !b.lastUpdatedAt) return 0;
    if (!a.lastUpdatedAt) return 1;
    if (!b.lastUpdatedAt) return -1;
    return b.lastUpdatedAt.localeCompare(a.lastUpdatedAt);
  });

  return active;
}

function rankDossier(dossier, { agent, goal }, rank) {
  // Base score: between PRD (45) and bootstrap (65). Most recent dossier gets 60.
  let score = 60 - rank * 5;
  const reasons = [`active feature dossier (${dossier.slug})`];
  const lookupText = `${normalizeForLookup(agent)} ${normalizeForLookup(goal)}`.trim();
  if (lookupText.includes(dossier.slug.replace(/-/g, ' '))) {
    score += 15;
    reasons.push('matches active feature slug');
  }
  if (/(dev|architect|qa|implement|feature|dossier)/.test(lookupText)) {
    score += 10;
    reasons.push('agent/goal matches dossier context');
  }
  return { score: Math.max(score, 0), reasons };
}

async function createContextPack({
  targetDir,
  agent = '',
  goal = '',
  module = '',
  maxFiles = 8
}) {
  const generatedAt = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
  await writeDerivedContextMemory({ targetDir, generatedAt });
  const requestedMaxFiles = Number(maxFiles);
  const normalizedMaxFiles = Number.isFinite(requestedMaxFiles)
    ? Math.max(1, Math.min(20, Math.trunc(requestedMaxFiles)))
    : 8;

  const catalog = (await collectContextCatalog(targetDir)).filter((doc) => doc.exists);

  // Inject active dossiers as ranked sources (reference, not inline copy)
  const activeDossiers = await collectActiveDossiers(targetDir);
  const dossierDocs = activeDossiers.map((d, i) => {
    const rank = rankDossier(d, { agent, goal }, i);
    return { ...d, score: rank.score, reason: rank.reasons.join('; ') };
  });

  const ranked = [
    ...catalog.map((doc) => {
      const rank = rankContextDoc(doc, { agent, goal, module });
      return {
        ...doc,
        score: rank.score,
        reason: rank.reasons.join('; ') || doc.readWhen
      };
    }),
    ...dossierDocs
  ]
    .filter((doc) => doc.score > 0)
    .sort((a, b) => b.score - a.score || a.relPath.localeCompare(b.relPath));

  const selectedDocs = [];
  const seen = new Set();
  for (const doc of ranked) {
    if (seen.has(doc.relPath)) continue;
    selectedDocs.push(doc);
    seen.add(doc.relPath);
    if (selectedDocs.length >= normalizedMaxFiles) break;
  }

  const withContent = [];
  for (const doc of selectedDocs) {
    const content = await readTextIfExists(path.join(targetDir, doc.relPath));
    withContent.push({
      relPath: doc.relPath,
      reason: doc.reason,
      excerpt: buildPackExcerpt(content, doc.relPath)
    });
  }

  const packMarkdown = buildContextPackMarkdown({
    generatedAt,
    agent,
    goal,
    module,
    selectedDocs: withContent
  });

  const outputPath = path.join(targetDir, CONTEXT_PACK_FILE);
  await writeTextFile(outputPath, packMarkdown);

  return {
    ok: true,
    targetDir,
    agent,
    goal,
    module,
    maxFiles: normalizedMaxFiles,
    packPath: outputPath,
    selectedFiles: withContent.map((doc) => ({
      path: doc.relPath,
      reason: doc.reason
    }))
  };
}

module.exports = {
  PROJECT_CONTEXT_FILE,
  DISCOVERY_FILE,
  SKELETON_FILE,
  ARCHITECTURE_FILE,
  SPEC_FILE,
  SPEC_CURRENT_FILE,
  SPEC_HISTORY_FILE,
  MEMORY_INDEX_FILE,
  DESIGN_DOC_FILE,
  READINESS_FILE,
  PRD_FILE,
  UI_SPEC_FILE,
  SCAN_INDEX_FILE,
  SCAN_FOLDERS_FILE,
  SCAN_AIOSON_FILE,
  CONTEXT_PACK_FILE,
  BOOTSTRAP_DIR,
  BOOTSTRAP_WHAT_IS,
  BOOTSTRAP_HOW_IT_WORKS,
  BOOTSTRAP_WHAT_IT_DOES,
  BOOTSTRAP_CURRENT_STATE,
  buildModuleMemoryRelativePath,
  buildSpecCurrentMarkdown,
  buildSpecHistoryMarkdown,
  buildMemoryIndexMarkdown,
  writeDerivedContextMemory,
  createContextPack,
  collectContextCatalog,
  loadExistingFolderScans
};
