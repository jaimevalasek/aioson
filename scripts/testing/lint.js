'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const { createHash } = require('node:crypto');
const ROOT = path.resolve(__dirname, '..', '..');

function fingerprint(file, message) {
  return createHash('sha256').update(JSON.stringify([file, message.ruleId, message.message])).digest('hex');
}

function classifyMessages(results, baseline, root) {
  const remaining = new Map(Object.entries(baseline.counts || {}));
  const findings = [];
  let existing = 0;
  for (const result of results) {
    const file = path.relative(root, result.filePath).replace(/\\/g, '/');
    for (const message of result.messages) {
      const key = fingerprint(file, message);
      const count = remaining.get(key) || 0;
      // Parser failures and undefined identifiers are always blocking. They
      // cannot be adopted into historical debt by a baseline update.
      if (!message.fatal && message.ruleId !== 'no-undef' && count > 0) {
        remaining.set(key, count - 1);
        existing++;
      } else findings.push({ file, ...message, fingerprint: key });
    }
  }
  return { ok: findings.length === 0, existing, findings };
}

async function runLint(options = {}) {
  const { ESLint } = require('eslint');
  const root = options.root || ROOT;
  const baselinePath = options.baseline || path.join(root, '.quality', 'eslint-baseline.json');
  const baseline = JSON.parse(await fs.readFile(baselinePath, 'utf8'));
  if (baseline.schema_version !== 1 || !baseline.counts || typeof baseline.counts !== 'object') throw new Error('Invalid ESLint baseline.');
  const eslint = new ESLint({ cwd: root, concurrency: 'off' });
  const results = await eslint.lintFiles(options.paths || ['src', 'bin', 'scripts', 'tests', 'eslint.config.cjs']);
  return { ...classifyMessages(results, baseline, root), files: results.length };
}

if (require.main === module) {
  runLint().then(result => {
    for (const finding of result.findings) process.stderr.write(`${finding.file}:${finding.line || 1} ${finding.ruleId || 'parser'} ${finding.message}\n`);
    process.stdout.write(`ESLint: ${result.files} files; ${result.existing} baseline findings; ${result.findings.length} new findings.\n`);
    process.exitCode = result.ok ? 0 : 1;
  }).catch(error => { process.stderr.write(`${error.message}\n`); process.exitCode = 2; });
}

module.exports = { classifyMessages, fingerprint, runLint };
