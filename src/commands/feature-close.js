'use strict';

/**
 * aioson feature:close — close a feature after QA sign-off.
 *
 * Updates spec-{slug}.md (adds QA sign-off block), features.md (sets status to done),
 * and project-pulse.md (removes from active work).
 *
 * Usage:
 *   aioson feature:close . --feature=checkout --verdict=PASS
 *   aioson feature:close . --feature=checkout --verdict=PASS --residual="Email delivery not tested E2E"
 *   aioson feature:close . --feature=checkout --verdict=FAIL --notes="Auth edge case missing"
 */

const fs = require('node:fs/promises');
const path = require('node:path');
const { contextDir, readFileSafe, parseFrontmatter } = require('../preflight-engine');
const { runFeatureArchive } = require('./feature-archive');

function nowDate() {
  return new Date().toISOString().slice(0, 10);
}

function nowTimestamp() {
  return new Date().toISOString();
}

function quoteYaml(value) {
  return `"${String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

function extractRecentActivities(content) {
  if (!content) return [];
  const activityMatch = content.match(/## Recent Activity\n([\s\S]*?)(?=\n##|\s*$)/);
  if (!activityMatch) return [];
  return activityMatch[1]
    .split('\n')
    .filter((line) => line.trim().startsWith('-'))
    .slice(-2);
}

async function updateProjectPulseFile(pulsePath, slug, verdict, summary, date) {
  const existing = await readFileSafe(pulsePath);
  if (!existing) return false;

  const fm = parseFrontmatter(existing);
  const gate = `Gate D: ${verdict === 'PASS' ? 'approved' : 'rejected'}`;
  const recentActivities = extractRecentActivities(existing);
  let activityLine = `- ${date} @qa → ${slug} (${gate}) VERDICT: ${verdict}`;
  if (summary) activityLine += `: ${summary}`;
  const dedupedActivities = recentActivities.filter((line) => line !== activityLine);

  const activeFeature = verdict === 'PASS' ? '(none)' : slug;
  const activeWork = verdict === 'PASS' ? '' : `${slug} → @qa → qa_failed`;
  const blockers = verdict === 'PASS'
    ? 'none'
    : (summary || fm.blockers || 'QA blockers pending');
  const nextRecommendation = verdict === 'PASS'
    ? '@product start the next feature'
    : '@dev fix QA blockers and return to @qa';

  const lines = [
    '---',
    `last_updated: ${nowTimestamp()}`,
    'last_agent: qa',
    `last_gate: ${gate}`,
    `active_feature: ${activeFeature}`,
    `active_work: ${quoteYaml(activeWork)}`,
    `blockers: ${quoteYaml(blockers)}`,
    `next_recommendation: ${quoteYaml(nextRecommendation)}`,
    '---',
    '',
    '# Project Pulse',
    '',
    '## Status',
    '',
    '- **Last agent:** @qa',
    `- **Last gate:** ${gate}`,
    `- **Active feature:** ${activeFeature}`,
    `- **Active work:** ${activeWork || 'none'}`,
    `- **Blockers:** ${blockers}`,
    `- **Next:** ${nextRecommendation}`,
    '',
    '## Recent Activity',
    '',
    ...dedupedActivities,
    activityLine,
    ''
  ];

  await fs.writeFile(pulsePath, lines.join('\n'), 'utf8');
  return true;
}

async function updateSpecFile(specPath, verdict, residual, date) {
  const content = await readFileSafe(specPath);
  if (!content) return false;

  const signOff = [
    '',
    '## QA Sign-off',
    '',
    `- **Date:** ${date}`,
    `- **Verdict:** ${verdict}`,
    residual ? `- **Residual:** ${residual}` : null,
    `- **Gate D (execution):** ${verdict === 'PASS' ? 'approved' : 'rejected'}`,
    ''
  ].filter((l) => l !== null).join('\n');

  // Update gate_execution in frontmatter first (on original content)
  const newStatus = verdict === 'PASS' ? 'approved' : 'rejected';
  const fm = parseFrontmatter(content);
  let baseContent = content;
  if (Object.keys(fm).length > 0) {
    baseContent = content.replace(
      /^---\r?\n[\s\S]*?\r?\n---/,
      (block) => {
        if (block.includes('gate_execution')) {
          return block.replace(/gate_execution:\s*.+/, `gate_execution: ${newStatus}`);
        }
        return block.replace(/^---\r?\n/, `---\ngate_execution: ${newStatus}\n`);
      }
    );
  }

  // Now apply QA sign-off on top of the frontmatter-updated content
  if (baseContent.includes('## QA Sign-off')) {
    const updated = baseContent.replace(
      /## QA Sign-off[\s\S]*?(?=\n##|\s*$)/,
      signOff.trimStart()
    );
    await fs.writeFile(specPath, updated, 'utf8');
  } else {
    await fs.writeFile(specPath, baseContent + signOff, 'utf8');
  }

  return true;
}

function escapeSlugForRegex(slug) {
  return slug.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function updateFeaturesFile(featuresPath, slug, verdict, date) {
  const content = await readFileSafe(featuresPath);
  if (!content) return false;

  const status = verdict === 'PASS' ? 'done' : 'qa_failed';
  const rowRe = new RegExp(
    `^(\\|\\s*${escapeSlugForRegex(slug)}\\s*\\|)\\s*[^|]*\\s*\\|\\s*([^|]*)\\s*\\|\\s*([^|]*)\\s*\\|(.*)$`,
    'm'
  );

  const updated = content.replace(rowRe, (match, slugCol, startedCol, _completedCol, rest) => {
    const started = startedCol.trim() || date;
    return `${slugCol} ${status} | ${started} | ${date} |${rest}`;
  });

  if (updated !== content) {
    await fs.writeFile(featuresPath, updated, 'utf8');
    return true;
  }

  // Append if not found
  const line = `| ${slug} | ${status} | ${date} | ${date} |`;
  const needsNewline = !content.endsWith('\n');
  await fs.appendFile(featuresPath, `${needsNewline ? '\n' : ''}${line}\n`, 'utf8');
  return true;
}

async function runFeatureClose({ args, options = {}, logger }) {
  const targetDir = path.resolve(process.cwd(), args[0] || '.');
  const slug = options.feature ? String(options.feature) : null;
  const verdict = options.verdict ? String(options.verdict).toUpperCase() : null;
  const residual = options.residual ? String(options.residual) : null;
  const notes = options.notes ? String(options.notes) : null;

  if (!slug) {
    if (options.json) return { ok: false, reason: 'missing_feature' };
    logger.log('--feature=<slug> is required.');
    return { ok: false };
  }

  if (!verdict || !['PASS', 'FAIL'].includes(verdict)) {
    if (options.json) return { ok: false, reason: 'invalid_verdict' };
    logger.log('--verdict=PASS or --verdict=FAIL is required.');
    return { ok: false };
  }

  const today = nowDate();
  const dir = contextDir(targetDir);
  const updates = [];

  // 1. Update spec file
  const specPath = path.join(dir, `spec-${slug}.md`);
  const specUpdated = await updateSpecFile(specPath, verdict, residual || notes, today);
  if (specUpdated) {
    updates.push(`spec-${slug}.md: added QA sign-off (${today}, ${verdict})`);
  } else {
    updates.push(`spec-${slug}.md: not found (skipped)`);
  }

  // 2. Update features.md
  const featuresPath = path.join(dir, 'features.md');
  const featuresContent = await readFileSafe(featuresPath);
  if (featuresContent) {
    await updateFeaturesFile(featuresPath, slug, verdict, today);
    updates.push(`features.md: ${slug} → ${verdict === 'PASS' ? 'done' : 'qa_failed'} (${today})`);
  } else {
    updates.push('features.md: not found (skipped)');
  }

  // 3. Update project-pulse.md
  const pulsePath = path.join(dir, 'project-pulse.md');
  const pulseUpdated = await updateProjectPulseFile(
    pulsePath,
    slug,
    verdict,
    residual || notes || null,
    today
  );
  if (pulseUpdated) {
    updates.push('project-pulse.md: updated active work');
  } else {
    updates.push('project-pulse.md: not found (skipped)');
  }

  // 4. Auto-archive on PASS (default-on — user never has to remember).
  // Disable explicitly with --no-archive when needed (e.g. re-running feature:close idempotently).
  let archive = null;
  const skipArchive = options['no-archive'] === true || options.archive === false;
  if (verdict === 'PASS' && !skipArchive) {
    try {
      archive = await runFeatureArchive({
        args: [targetDir],
        options: { feature: slug, json: true },
        logger: null
      });
      if (archive && archive.ok && archive.moved && archive.moved.length > 0) {
        updates.push(`archive: moved ${archive.moved.length} file(s) to ${archive.archiveDir}/`);
        updates.push(`archive: manifest updated at .aioson/context/done/MANIFEST.md`);
      } else if (archive && archive.ok && archive.noop) {
        updates.push('archive: nothing to move (already clean)');
      } else if (archive && !archive.ok) {
        updates.push(`archive: skipped (${archive.reason || 'unknown'})`);
      }
    } catch (err) {
      updates.push(`archive: failed (${err.message || err})`);
    }
  }

  const result = {
    ok: true,
    feature: slug,
    verdict,
    date: today,
    residual: residual || notes || null,
    updates,
    archive
  };

  if (options.json) return result;

  logger.log(`Feature closure — ${slug}:`);
  for (const u of updates) logger.log(`  ${u}`);

  return result;
}

module.exports = { runFeatureClose };
