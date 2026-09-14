'use strict';

/**
 * The `dev-lane` profile: what a lane worker — an ephemeral external process
 * of the role's host/model — runs INSTEAD of the whole @dev kernel.
 *
 * `dev.md` owns the DEV stage: it calls `workflow:next --complete=dev`,
 * `dev:state:write`, `pulse:update`, `agent:done` and hands off to @qa. Two
 * processes running that kernel on one feature would fight over the workflow
 * state. A lane keeps the implementation discipline and drops the stage
 * ownership. The discipline is extracted from `dev.md` itself so the profile
 * can never drift from the kernel — a second hand-maintained prompt is exactly
 * the drift this module exists to prevent; the digest lets `verify:artifact`
 * flag a compiled plan whose profile predates a kernel update.
 */

const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { extractSection } = require('../lib/feature-completeness-format');

const DEV_KERNEL_RELATIVE_PATH = '.aioson/agents/dev.md';
const PROFILE_SECTIONS = [
  {
    id: 'implementation-strategy',
    headings: ['Implementation strategy', 'Estratégia de implementação', 'Estrategia de implementacao']
  },
  {
    id: 'execution-invariants',
    headings: ['Execution invariants', 'Invariantes de execução', 'Invariantes de execucao']
  }
];
const STAGE_OWNERSHIP_COMMANDS = [
  'workflow:next',
  'dev:state:write',
  'pulse:update',
  'agent:done',
  'agent:epilogue',
  'live:handoff',
  'live:close',
  'feature:close',
  'git commit',
  'git push'
];

function sha256(text) {
  return crypto.createHash('sha256').update(String(text)).digest('hex');
}

function renderProfile(sections) {
  const lines = [
    '# AIOSON dev-lane profile',
    '',
    'You are a development lane worker: one ephemeral process implementing ONE unit (a plan phase inside one lane) of a feature whose DEV stage is owned by the parent session. You inherit the implementation discipline of the DEV kernel below and none of its stage ownership.',
    'The unit contract specializes the inherited strategy: implement and verify only your assigned files and local Done when. Cross-lane production wiring and capability-wide acceptance belong to integration after all producers finish. Read focused files and selected rules, preserving checkpoints on disk; do not load the whole feature to satisfy a vertical-phase instruction.',
    ''
  ];
  for (const section of sections) {
    lines.push(`## ${section.heading}`, '', section.text, '');
  }
  lines.push(
    '## Lane rules',
    '',
    `1. Never run stage-ownership or publishing commands: ${STAGE_OWNERSHIP_COMMANDS.join(', ')}. The parent session owns the stage, the integration and the handoff.`,
    '2. Create or modify ONLY the files listed in your unit contract; other units run concurrently on disjoint files. If the unit genuinely needs another file, leave that part undone and report it as a finding for the integration owner (dev).',
    "3. Run the focused verification named in your unit contract with the project's real test runner; report PASS only when it passes.",
    '4. Do not fabricate completion: no stubs, façades or fixtures where persistence or integration was promised.',
    '5. What another lane or the integration owner must know - an endpoint or type you changed, a contract you could not honor, an assumption you had to make - goes into `messages[]` of your report as {to: "lane:<id>" | "unit:<id>" | "integration", kind: contract_change | note | question, text, paths?}, never into prose. Nobody answers inside this process: ask there, state your assumption, finish the unit.',
    '6. Write the JSON report exactly where the execution contract appended below says, then stop.',
    '7. Use Git only for read-only inspection in this shared worktree. Never stash, reset, restore, checkout, switch, clean, add, merge or rebase; these can disturb other units or earlier work. Compare baselines with git show without replacing working files. The parent owns Git mutations.',
    ''
  );
  return lines.join('\n');
}

/**
 * Derive the profile from the installed DEV kernel.
 * `ok:false` with `dev_kernel_missing` | `dev_profile_sections_missing` when
 * the kernel is absent or lost one of the marker sections.
 */
async function buildDevLaneProfile(projectDir, { kernelPath } = {}) {
  const relative = kernelPath || DEV_KERNEL_RELATIVE_PATH;
  const file = path.resolve(projectDir, relative);
  let content;
  try {
    content = await fs.readFile(file, 'utf8');
  } catch (error) {
    return {
      ok: false,
      reason: error.code === 'ENOENT' ? 'dev_kernel_missing' : 'dev_kernel_unreadable',
      source: relative,
      sections: [],
      missing: PROFILE_SECTIONS.map((section) => section.id),
      text: '',
      digest: null
    };
  }
  const sections = [];
  const missing = [];
  for (const spec of PROFILE_SECTIONS) {
    const body = extractSection(content, spec.headings);
    if (body === null || !body.trim()) missing.push(spec.id);
    else sections.push({ id: spec.id, heading: spec.headings[0], text: body.trim() });
  }
  const text = renderProfile(sections);
  return {
    ok: missing.length === 0,
    reason: missing.length > 0 ? 'dev_profile_sections_missing' : null,
    source: relative,
    sections: sections.map((section) => section.id),
    missing,
    text,
    digest: sha256(text)
  };
}

module.exports = {
  DEV_KERNEL_RELATIVE_PATH,
  PROFILE_SECTIONS,
  STAGE_OWNERSHIP_COMMANDS,
  buildDevLaneProfile,
  renderProfile
};
