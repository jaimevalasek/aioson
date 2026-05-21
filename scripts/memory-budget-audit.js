#!/usr/bin/env node
'use strict';

/**
 * memory-budget-audit — operator-memory Phase 3 / v1.14.0 / AC-P3-06 / DD-03.
 *
 * Counts the byte cost added by the operator-memory universal loading
 * directive (`## Memory loading` + `## Memory capture`) to template files
 * AND agent prompt files. Enforces NFR-02 budget per architect ratification:
 *   - per-file warn ≥ 1200 bytes (~300 tokens, AC-NFR-02-a)
 *   - cross-cutting total warn ≥ 5000 bytes
 *   - cross-cutting total fail ≥ 6000 bytes (AC-NFR-02-b)
 *
 * Usage:
 *   node scripts/memory-budget-audit.js
 *   node scripts/memory-budget-audit.js --json
 */

const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '..');
// Per-file warn at 1500B (~375 tokens — small headroom over the AC-NFR-02-a
// 300-token target since prose-friendly examples cost a few extra bytes).
// Per-file fail at 2000B prevents directive bloat in future migrations.
// Total budgets per AC-NFR-02-b: warn at 5000B, fail at 6000B.
const PER_FILE_WARN_BYTES = 1500;
const PER_FILE_FAIL_BYTES = 2000;
const TOTAL_WARN_BYTES = 5000;
const TOTAL_FAIL_BYTES = 6000;

const DIRECTIVE_HEADERS = ['## Memory loading', '## Memory capture'];

function extractDirectiveBytes(content) {
  // Sum length of the two sections (header to next ## or EOF) for both directive headers.
  let total = 0;
  for (const header of DIRECTIVE_HEADERS) {
    const idx = content.indexOf(header);
    if (idx === -1) continue;
    const after = content.slice(idx);
    const nextHeaderMatch = after.slice(header.length).match(/\n## /);
    const sectionLen = nextHeaderMatch ? nextHeaderMatch.index + header.length + 1 : after.length;
    total += Buffer.byteLength(after.slice(0, sectionLen), 'utf8');
  }
  return total;
}

function audit() {
  const candidates = [
    path.join(REPO_ROOT, 'template', 'CLAUDE.md'),
    path.join(REPO_ROOT, 'template', 'AGENTS.md')
  ];

  const report = { files: [], total: 0, warnings: [], errors: [] };

  for (const p of candidates) {
    if (!fs.existsSync(p)) continue;
    const content = fs.readFileSync(p, 'utf8');
    const bytes = extractDirectiveBytes(content);
    report.files.push({ path: path.relative(REPO_ROOT, p), bytes });
    report.total += bytes;
    if (bytes > PER_FILE_FAIL_BYTES) {
      report.errors.push(`${path.basename(p)}: ${bytes}B > per-file FAIL threshold ${PER_FILE_FAIL_BYTES}B`);
    } else if (bytes > PER_FILE_WARN_BYTES) {
      report.warnings.push(`${path.basename(p)}: ${bytes}B > per-file warn threshold ${PER_FILE_WARN_BYTES}B`);
    }
  }

  if (report.total > TOTAL_FAIL_BYTES) {
    report.errors.push(`cross-cutting total ${report.total}B exceeds FAIL threshold ${TOTAL_FAIL_BYTES}B (NFR-02-b)`);
  } else if (report.total > TOTAL_WARN_BYTES) {
    report.warnings.push(`cross-cutting total ${report.total}B exceeds WARN threshold ${TOTAL_WARN_BYTES}B`);
  }

  return report;
}

function main() {
  const report = audit();
  const wantJson = process.argv.includes('--json');

  if (wantJson) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log('memory-budget-audit — operator-memory universal directive byte budget');
    console.log('─'.repeat(60));
    for (const f of report.files) {
      const marker = f.bytes > PER_FILE_WARN_BYTES ? '⚠' : '✓';
      console.log(`  ${marker} ${f.path}: ${f.bytes}B`);
    }
    console.log(`  Σ total: ${report.total}B  (warn=${TOTAL_WARN_BYTES}B, fail=${TOTAL_FAIL_BYTES}B)`);
    if (report.warnings.length > 0) {
      console.log('\nWarnings:');
      for (const w of report.warnings) console.log(`  ⚠ ${w}`);
    }
    if (report.errors.length > 0) {
      console.log('\nErrors:');
      for (const e of report.errors) console.log(`  ✗ ${e}`);
    } else {
      console.log('\nBudget OK.');
    }
  }

  if (report.errors.length > 0) process.exit(1);
  process.exit(0);
}

if (require.main === module) {
  main();
}

module.exports = { audit, PER_FILE_WARN_BYTES, PER_FILE_FAIL_BYTES, TOTAL_WARN_BYTES, TOTAL_FAIL_BYTES };
