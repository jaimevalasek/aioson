'use strict';

/**
 * The `qa-lane` profile: what the lane reviewer — an ephemeral external
 * process of the `qa` role (or the lane's `{lane}_qa` override) — runs after a
 * lane unit passed. It is NOT the @qa kernel: @qa owns the feature's single
 * delivery verdict (qa-report, Gate D, handoff). The lane reviewer reviews and
 * tests ONE unit, may apply a bounded set of simple fixes inside the unit's
 * own files, and reports everything else as findings for the integration
 * owner (dev). The risk checklist is extracted from the installed `qa.md` so
 * the lane review never drifts from the kernel's own priorities.
 */

const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { extractSection } = require('../lib/feature-completeness-format');

const QA_KERNEL_RELATIVE_PATH = '.aioson/agents/qa.md';
const PROFILE_SECTIONS = [
  {
    id: 'risk-first-checklist',
    headings: ['Risk-first checklist', 'Checklist orientado a risco', 'Checklist de risco']
  }
];

function sha256(text) {
  return crypto.createHash('sha256').update(String(text)).digest('hex');
}

function renderQaProfile(sections, { maxFixFiles = 3 } = {}) {
  const lines = [
    '# AIOSON qa-lane profile',
    '',
    'You are a lane reviewer: one ephemeral process reviewing and testing ONE implemented unit (a plan phase inside one lane) of a feature whose QA stage is owned by the parent session. You inherit the risk priorities of the QA kernel below; you do not write the feature verdict, the qa-report or any handoff.',
    ''
  ];
  for (const section of sections) {
    lines.push(`## ${section.heading}`, '', section.text, '');
  }
  lines.push(
    '## Lane review rules',
    '',
    '1. Review the unit against its contract: the listed files, the capabilities and acceptance criteria, and the "done when" line. Read the code that was written; do not trust the implementer\'s report.',
    '2. Run the unit\'s verification commands and the focused tests with the project\'s real test runner. Evidence is observed output, not assertion.',
    `3. You MAY fix simple, local defects (an off-by-one, a missing null check, a wrong import, a failing assertion the code — not the test — got wrong) in at most ${maxFixFiles} file(s), and ONLY among the unit's own files. This correction budget applies to this review attempt; previous rounds do not consume it. Preserve previous corrections and regressions. Every fix goes into the report as one \`corrections[]\` entry: {path, summary}. Re-run the verification after fixing.`,
    '4. Everything you cannot fix inside that boundary — design gaps, cross-lane integration, missing capabilities, anything touching files outside the unit — goes into `findings[]` as {severity: critical|high|medium|low, cap, ac, path, summary}. Never touch files outside the unit; never widen the scope.',
    '5. Never run stage-ownership or publishing commands (workflow:next, agent:done, live:handoff, feature:close, git commit/push). The parent session owns the stage.',
    '6. What a later unit or the integration owner must know goes into `messages[]` of your report as {to: "lane:<id>" | "unit:<id>" | "integration", kind: contract_change | note | question, text, paths?}; an implementer message you disagree with is a finding, not a reply.',
    '7. Report verdict PASS only when the verification passes after your corrections and no critical/high finding remains; otherwise FAIL with the findings. Write the JSON report exactly where the execution contract appended below says, then stop.',
    '8. Use Git only for read-only inspection in this shared worktree. Never stash, reset, restore, checkout, switch, clean, add, merge or rebase. Compare baselines with git show without replacing working files; an incomplete baseline comparison does not prove a failure is pre-existing. The parent owns Git mutations.',
    ''
  );
  return lines.join('\n');
}

/**
 * Derive the reviewer profile from the installed QA kernel. When the kernel
 * or its checklist is missing the profile still renders (rules only) and
 * reports `missing` — the review must not silently lose its priorities, so
 * the caller surfaces it as a warning.
 */
async function buildQaLaneProfile(projectDir, { kernelPath, maxFixFiles = 3 } = {}) {
  const relative = kernelPath || QA_KERNEL_RELATIVE_PATH;
  const file = path.resolve(projectDir, relative);
  let content = null;
  try {
    content = await fs.readFile(file, 'utf8');
  } catch {
    content = null;
  }
  const sections = [];
  const missing = [];
  for (const spec of PROFILE_SECTIONS) {
    const body = content === null ? null : extractSection(content, spec.headings);
    if (body === null || !body.trim()) missing.push(spec.id);
    else sections.push({ id: spec.id, heading: spec.headings[0], text: body.trim() });
  }
  const text = renderQaProfile(sections, { maxFixFiles });
  return {
    ok: missing.length === 0,
    reason: content === null ? 'qa_kernel_missing' : (missing.length > 0 ? 'qa_profile_sections_missing' : null),
    source: relative,
    sections: sections.map((section) => section.id),
    missing,
    text,
    digest: sha256(text)
  };
}

module.exports = { QA_KERNEL_RELATIVE_PATH, PROFILE_SECTIONS, buildQaLaneProfile, renderQaProfile };
