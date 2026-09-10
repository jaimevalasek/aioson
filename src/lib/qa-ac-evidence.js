'use strict';

const path = require('node:path');
const fs = require('node:fs/promises');
const { validatePrdAcceptanceCriteria, extractSection, CAP_ID_RE } = require('./feature-completeness');
const { readBrowserEvidence } = require('./browser-evidence');

function legacyCriteria(content) {
  const rows = [...content.matchAll(/\|\s*(AC-[\w-]+)\s*\|\s*([^|]+)\|/gi)]
    .map((match) => ({ id: match[1], description: match[2].trim() }));
  if (rows.length) return rows;
  return [...content.matchAll(/🔴\s*([^\n]+)/g)].map((match, index) => ({ id: `AC-${String(index + 1).padStart(2, '0')}`, description: match[1].trim() }));
}

function parseCriteria(content, artifact) {
  if (extractSection(content, ['Acceptance Criteria', 'Criterios de Aceite'])) {
    const allCaps = [...new Set(content.match(CAP_ID_RE) || [])];
    const parsed = validatePrdAcceptanceCriteria(content, artifact, { allCaps, requiredCaps: [] });
    return { items: parsed.rows.length ? parsed.rows.map((row) => ({ id: row.ac, description: row.behavior })) : legacyCriteria(content), gaps: parsed.findings };
  }
  // Compatibility for old standalone PRDs; never invent coverage from MVP bullets.
  const items = legacyCriteria(content);
  return { items, gaps: [{ check: 'legacy_ac_format', message: 'Use an Acceptance Criteria table; legacy rows are inventory only.' }] };
}

function targetKey(value) {
  try { const url = new URL(value); return url.origin + url.pathname.replace(/\/$/, ''); } catch { return null; }
}

async function collectQaAcEvidence(targetDir, feature, url) {
  if (feature && !/^[a-z0-9][a-z0-9_-]*$/i.test(feature)) throw new Error('invalid_feature');
  const prdPath = path.join(targetDir, '.aioson/context', feature ? `prd-${feature}.md` : 'prd.md');
  let content;
  try { content = await fs.readFile(prdPath, 'utf8'); } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    return { feature, items: [], gaps: [{ check: 'prd_missing', message: 'No PRD was found for this QA scope.' }] };
  }
  const parsed = parseCriteria(content, prdPath);
  const modifiedAt = (await fs.stat(prdPath)).mtimeMs;
  const evidence = feature ? readBrowserEvidence(targetDir, feature) : { reports: [], ids: new Map() };
  const reports = new Map(evidence.reports.map((report) => [report._file, report]));
  const gaps = [...parsed.gaps];
  if (!feature) gaps.push({ check: 'feature_unbound', message: 'Set --feature=<slug> or config.feature to bind delivery walkthroughs.' });
  const items = parsed.items.map((ac) => {
    const candidate = evidence.ids.get(ac.id.toUpperCase());
    const report = candidate && reports.get(candidate.report);
    const valid = parsed.gaps.length === 0 && report && report.feature === feature && report.scope === 'delivery'
      && targetKey(url) && targetKey(report.target?.url) === targetKey(url)
      && Date.parse(candidate.finished_at) >= modifiedAt && candidate.steps.length > 0;
    if (candidate && !valid) gaps.push({ check: 'walkthrough_binding_invalid', ac: ac.id, message: 'Walkthrough owner, target, date or steps do not prove this criterion.' });
    const row = valid ? candidate : null;
    // A walkthrough that stopped before the AC's step records `not_reached`
    // (rollupUnreached); read as Partial it summed "AC exercised: 2/2". Only
    // a status that says the step ran counts as exercise.
    const status = row ? ({ pass: 'Covered', fail: 'Missing', partial: 'Partial' }[row.status] || 'Not exercised') : 'Not exercised';
    return { ...ac, status, walkthrough: row ? row.report : '', screenshot: '' };
  });
  return { feature, items, gaps };
}

module.exports = { collectQaAcEvidence };
