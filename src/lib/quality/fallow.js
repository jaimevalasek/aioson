'use strict';

// Adapter for the captured Fallow 3.23 combined/v11 wire contract. A schema
// upgrade requires a real fixture and review, never an empty-results fallback.
const { createHash } = require('node:crypto');

function requireArray(value, label) {
  if (!Array.isArray(value)) throw new Error(`Invalid Fallow output: ${label} must be an array.`);
  return value;
}

function categoryFor(rule) {
  if (/boundar|cycle|circular/.test(rule)) return 'architecture';
  if (/dependenc|import/.test(rule)) return 'dependency';
  if (/duplic|clone/.test(rule)) return 'duplication';
  if (/unused/.test(rule)) return 'dead-code';
  return 'governance';
}

function locationsOf(item) {
  if (item.path || item.file) return [item];
  const locations = item.locations || item.imported_from || item.edges || item.files;
  if (Array.isArray(locations) && locations.length) {
    return locations.map(value => typeof value === 'string' ? { path: value } : value);
  }
  throw new Error('Invalid Fallow finding: no source location.');
}

function flattenCheck(check) {
  if (!check || check.schema_version !== 9 || !Number.isInteger(check.total_issues)) {
    throw new Error('Unsupported Fallow dead-code schema (expected v9).');
  }
  requireArray(check.unused_files, 'check.unused_files');
  requireArray(check.unused_exports, 'check.unused_exports');
  const findings = [];
  let nativeCount = 0;
  for (const [group, items] of Object.entries(check)) {
    if (!Array.isArray(items) || ['next_steps', 'workspace_diagnostics'].includes(group)) continue;
    const rule = group.replace(/_/g, '-');
    nativeCount += items.length;
    for (const item of items) findings.push(...checkFinding(item, rule));
  }
  if (nativeCount !== check.total_issues) {
    throw new Error(`Incomplete Fallow output: ${nativeCount}/${check.total_issues} dead-code findings.`);
  }
  return findings;
}

function checkFinding(item, rule) {
  if (!item || typeof item !== 'object') throw new Error(`Invalid Fallow ${rule} finding.`);
  const symbol = item.export_name || item.package_name || item.member_name || item.name || '';
  return locationsOf(item).map(location => ({ ...location, rule, category: categoryFor(rule),
    severity: /boundar|unresolved/.test(rule) ? 'high' : 'medium', message: `${rule}${symbol ? `: ${symbol}` : ''}`,
    symbol, action: item.actions?.[0]?.description || null }));
}

function flattenFallow(output) {
  if (output.kind !== 'combined' || output.schema_version !== 11 || typeof output.version !== 'string') {
    throw new Error('Unsupported Fallow envelope (expected combined/v11).');
  }
  const findings = flattenCheck(output.check);
  findings.push(...healthFindings(output.health), ...cloneFindings(output.dupes));
  return findings;
}

function healthFindings(health) {
  const findings = [];
  const complex = requireArray(health?.findings, 'health.findings');
  if (health.summary?.functions_above_threshold !== complex.length) throw new Error('Incomplete Fallow health findings.');
  for (const item of complex) {
    findings.push({
      ...item, category: 'complexity', rule: 'complexity', symbol: item.name,
      message: `Complexity: ${item.name || '(anonymous)'}`,
      metrics: { cyclomatic: item.cyclomatic, cognitive: item.cognitive, line_count: item.line_count },
      action: item.actions?.[0]?.description || null
    });
  }
  for (const item of requireArray(health.large_functions ?? [], 'health.large_functions')) {
    findings.push({ ...item, category: 'complexity', rule: 'function-size', symbol: item.name,
      severity: 'medium', message: `Function size: ${item.name}`, metrics: { line_count: item.line_count } });
  }
  return findings;
}

function cloneFindings(dupes) {
  const findings = [];
  const groups = requireArray(dupes?.clone_groups, 'dupes.clone_groups');
  if (dupes.stats?.clone_groups !== groups.length) throw new Error('Incomplete Fallow duplication groups.');
  for (const group of groups) {
    for (const instance of requireArray(group.instances, 'clone.instances')) {
      // Include a snippet hash: unlike a line number it survives preceding edits.
      const snippet = String(instance.fragment || '').replace(/\s+/g, ' ').trim();
      findings.push({
        path: instance.file, line: instance.start_line,
        category: 'duplication', rule: 'code-duplication', severity: 'medium',
        fingerprint: `clone:${createHash('sha256').update(snippet).digest('hex')}`,
        message: 'Duplicated code', action: group.actions?.[0]?.description || null
      });
    }
  }
  return findings;
}

module.exports = { flattenFallow };
