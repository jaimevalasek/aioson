'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const { resolveTargetDir } = require('../lib/project-root');

function nowIso() {
  return new Date().toISOString();
}

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

function extractBulletValue(text, label) {
  // Matches "**Label:**" or "- **Label:**" patterns (case-insensitive)
  const re = new RegExp(`\\*\\*${label}[:\\s][*]*\\*\\*:?\\s*(.+)`, 'i');
  const match = text.match(re);
  if (match) return match[1].trim();
  // Fallback: plain "Label:" without bold
  const re2 = new RegExp(`^[-*]?\\s*${label}[:\\s]+(.+)`, 'im');
  const m2 = text.match(re2);
  return m2 ? m2[1].trim() : null;
}

function parsePhases(content) {
  // Match phase headers: ### Fase N — title or ## Phase N — title
  const phasePattern = /^#{2,4}\s+(Fase|Phase)\s+(\d+)\s*[—\-–]\s*(.+)$/im;
  const phases = [];

  // Split by phase headers
  const lines = content.split(/\r?\n/);
  let currentPhase = null;
  let currentLines = [];

  for (const line of lines) {
    const m = line.match(/^(#{2,4})\s+(Fase|Phase)\s+(\d+)\s*[—\-–]\s*(.+)$/i);
    if (m) {
      if (currentPhase) {
        currentPhase.body = currentLines.join('\n');
        phases.push(currentPhase);
      }
      currentPhase = {
        number: parseInt(m[3], 10),
        title: m[4].trim(),
        body: ''
      };
      currentLines = [];
    } else if (currentPhase) {
      currentLines.push(line);
    }
  }
  if (currentPhase) {
    currentPhase.body = currentLines.join('\n');
    phases.push(currentPhase);
  }

  return phases.map((phase) => {
    const what = extractBulletValue(phase.body, 'O que') ||
                 extractBulletValue(phase.body, 'What');
    const dependsOn = extractBulletValue(phase.body, 'Depende de') ||
                      extractBulletValue(phase.body, 'Depends on');
    const inputs = extractBulletValue(phase.body, 'Artefatos de entrada') ||
                   extractBulletValue(phase.body, 'Input artifacts') ||
                   extractBulletValue(phase.body, 'Inputs');
    const done = extractBulletValue(phase.body, 'Critério de done') ||
                 extractBulletValue(phase.body, 'Done criterion') ||
                 extractBulletValue(phase.body, 'Done criteria') ||
                 extractBulletValue(phase.body, 'Criterio de done');
    const checkpoint = extractBulletValue(phase.body, 'Checkpoint');
    const parallel = /parallel:\s*true/i.test(phase.body);

    return {
      number: phase.number,
      title: phase.title,
      what,
      dependsOn,
      inputs,
      done,
      checkpoint,
      parallel
    };
  });
}

function extractParallelNotes(content) {
  // Find "Fases paralelas" or "Parallel" section
  const re = /^#{1,4}\s+(Fases paralelas|Parallel phases?)[^\n]*\n([\s\S]*?)(?=^#{1,4}|\s*$)/im;
  const m = content.match(re);
  if (!m) return [];
  return m[2]
    .split(/\r?\n/)
    .map((l) => l.replace(/^[-*]\s*/, '').trim())
    .filter(Boolean);
}

function extractOpenAssumptions(content) {
  const re = /^#{1,4}\s+(Decisões adiadas|Deferred decisions|Open assumptions)[^\n]*\n([\s\S]*?)(?=^#{1,4}|\s*$)/im;
  const m = content.match(re);
  if (!m) return [];
  return m[2]
    .split(/\r?\n/)
    .map((l) => l.replace(/^[-*]\s*/, '').trim())
    .filter(Boolean)
    .slice(0, 5); // cap to avoid bloat
}

function buildTasksDoc({ title, slug, planPath, phases, parallelNotes, openAssumptions, generatedAt }) {
  const lines = [];
  const header = title || (slug ? `tasks-${slug}` : 'tasks');

  lines.push(`# Tasks — ${header}`);
  lines.push('');
  lines.push(`> Generated from: \`${path.basename(planPath)}\``);
  lines.push(`> Generated at: ${generatedAt}`);
  lines.push(`> Do not edit manually — regenerate from the plan when phases change.`);
  lines.push('');

  for (const phase of phases) {
    lines.push(`## Phase ${phase.number} — ${phase.title}`);
    lines.push('');

    if (phase.inputs) {
      lines.push(`- [ ] Read input artifacts: ${phase.inputs}`);
    } else {
      lines.push(`- [ ] Read required input artifacts`);
    }

    if (phase.what) {
      lines.push(`- [ ] Execute: ${phase.what}`);
    } else {
      lines.push(`- [ ] Execute planned work`);
    }

    if (phase.done) {
      lines.push(`- [ ] Verify done criterion: ${phase.done}`);
    } else {
      lines.push(`- [ ] Verify done criterion`);
    }

    if (phase.checkpoint) {
      lines.push(`- [ ] Pass checkpoint gate: ${phase.checkpoint}`);
    } else {
      lines.push(`- [ ] Pass checkpoint gate`);
    }

    if (phase.dependsOn && phase.dependsOn !== 'nada' && phase.dependsOn !== 'nothing' && phase.dependsOn !== 'none') {
      lines.push('');
      lines.push(`> Depends on: ${phase.dependsOn}`);
    }

    if (phase.parallel) {
      lines.push(`> Can run in parallel (no shared entities with adjacent phases)`);
    }

    lines.push('');
  }

  if (parallelNotes.length > 0) {
    lines.push('## Parallel notes');
    lines.push('');
    for (const note of parallelNotes) {
      lines.push(`- ${note}`);
    }
    lines.push('');
  }

  if (openAssumptions.length > 0) {
    lines.push('## Deferred decisions');
    lines.push('');
    for (const item of openAssumptions) {
      lines.push(`- ${item}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

async function runSpecTasks({ args, options = {}, logger }) {
  const targetDir = resolveTargetDir(args);
  const contextDir = path.join(targetDir, '.aioson', 'context');

  // Resolve plan path
  let planPath;
  if (options.plan) {
    // If absolute path or starts with ./ — use as-is relative to cwd
    planPath = path.resolve(process.cwd(), options.plan);
  } else {
    // Default: look for implementation-plan.md in context dir
    planPath = path.join(contextDir, 'implementation-plan.md');
  }

  let planContent;
  try {
    planContent = await fs.readFile(planPath, 'utf8');
  } catch {
    if (!options.json) {
      logger.log(`Error: plan file not found: ${planPath}`);
      logger.log('Usage: aioson spec:tasks . --plan=.aioson/context/implementation-plan-{slug}.md');
    }
    return { ok: false, reason: 'plan_not_found', planPath };
  }

  const fm = parseFrontmatter(planContent);
  const featureSlug = fm.feature_slug && fm.feature_slug !== 'null' ? fm.feature_slug : null;
  const planTitle = fm.project || null;

  const phases = parsePhases(planContent);

  if (phases.length === 0) {
    if (!options.json) {
      logger.log('Warning: no phases found in plan. Check that phases follow the format:');
      logger.log('  ### Fase N — title');
    }
    return { ok: false, reason: 'no_phases', planPath };
  }

  const parallelNotes = extractParallelNotes(planContent);
  const openAssumptions = extractOpenAssumptions(planContent);
  const generatedAt = nowIso();

  const tasksContent = buildTasksDoc({
    title: planTitle,
    slug: featureSlug,
    planPath,
    phases,
    parallelNotes,
    openAssumptions,
    generatedAt
  });

  // Determine output path
  const outputFilename = featureSlug ? `tasks-${featureSlug}.md` : 'tasks.md';
  const outputPath = path.join(contextDir, outputFilename);

  // Ensure context dir exists
  try {
    await fs.mkdir(contextDir, { recursive: true });
  } catch { /* already exists */ }

  await fs.writeFile(outputPath, tasksContent, 'utf8');

  if (options.json) {
    return {
      ok: true,
      planPath,
      outputPath,
      featureSlug,
      phasesCount: phases.length,
      generatedAt
    };
  }

  logger.log(`spec:tasks — ${path.basename(planPath)}`);
  logger.log('─'.repeat(50));
  logger.log(`Phases parsed: ${phases.length}`);
  for (const p of phases) {
    const parallelLabel = p.parallel ? ' [parallel]' : '';
    logger.log(`  Phase ${p.number}: ${p.title}${parallelLabel}`);
  }
  if (parallelNotes.length > 0) logger.log(`Parallel notes: ${parallelNotes.length}`);
  if (openAssumptions.length > 0) logger.log(`Deferred decisions: ${openAssumptions.length}`);
  logger.log('─'.repeat(50));
  logger.log(`Output: ${outputPath}`);
  logger.log('');
  logger.log(`Next: open ${outputFilename} and start executing phase by phase with @dev`);

  return {
    ok: true,
    planPath,
    outputPath,
    featureSlug,
    phasesCount: phases.length,
    generatedAt
  };
}

module.exports = { runSpecTasks };
