'use strict';

/**
 * operator-memory — the frontmatter lines decisions and proposals share. Every
 * scalar stays on one line: a newline inside a quote ended the frontmatter
 * early (a `---` line closed it) and the record read back unscoped. Every
 * free-text value is quoted, and a quoted value reads back as the string it was
 * written as: an all-digit fingerprint, a session "123", an agent named "123",
 * "true" or "null" never turn into a number or null.
 */

const { parseList, projectSets, serializeProjectSets } = require('./project-scope');

function escapeYamlString(value) {
  const s = String(value || '').replace(/[\r\n]+/g, ' ');
  return `'${s.replace(/'/g, "''")}'`;
}

/**
 * A scalar as the parsers read it: `rawValue` as written, `unquoted` with its
 * quotes removed. Quoted, it stays that string; bare, digits become a number
 * and `null` (where the record has nullable fields) becomes null.
 */
function readScalar(rawValue, unquoted, nulls = true) {
  if (/^(['"]).*\1$/.test(String(rawValue).trim())) return unquoted;
  if (nulls && unquoted === 'null') return null;
  return /^\d+$/.test(unquoted) ? Number(unquoted) : unquoted;
}

function quotesToYaml(quotes) {
  if (!quotes || quotes.length === 0) return '[]';
  return '\n' + quotes.map((q) => `  - ${escapeYamlString(q)}`).join('\n');
}

/**
 * The project identities of a record: `projects` stays the flat union of every
 * key, so a reader that predates identity sets still matches; `project_sets`
 * groups them, one set per project, with `project_names` alongside.
 */
function projectLines(record) {
  const sets = projectSets(record);
  return [
    `projects: ${escapeYamlString([...new Set(sets.flat())].join(','))}`,
    `project_sets: ${escapeYamlString(serializeProjectSets(sets))}`,
    `project_names: ${escapeYamlString(parseList(record.project_names).join(','))}`
  ];
}

module.exports = { escapeYamlString, quotesToYaml, projectLines, readScalar };
