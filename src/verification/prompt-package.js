'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');

const { machineReportSchemaExample } = require('./schema');
const { verificationRunsDir, relativeFromRoot, resolveInsideRoot } = require('./path-policy');

const DEFAULT_PROMPT_BUDGET_CHARS = 24000;

function timestampForFile(date = new Date()) {
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

function asJson(value) {
  return JSON.stringify(value, null, 2);
}

function compactBundleForBudget(evidenceBundle) {
  return {
    ...evidenceBundle,
    artifact_summaries: (evidenceBundle.artifact_summaries || []).map((artifact) => ({
      type: artifact.type,
      role: artifact.role,
      path: artifact.path,
      exists: artifact.exists,
      size_bytes: artifact.size_bytes,
      omitted_reason: artifact.omitted_reason || 'prompt_budget_compact_mode'
    }))
  };
}

function truncateText(value, maxChars) {
  const text = String(value || '');
  if (!maxChars || text.length <= maxChars) return text;
  return `${text.slice(0, Math.max(0, maxChars - 3))}...`;
}

function compactCommandPlan(commands, limit = 25) {
  const list = Array.isArray(commands) ? commands : [];
  const selected = list.slice(0, limit).map((command) => ({
    order: command.order,
    command: command.command,
    required: command.required,
    source: command.source,
    last_status: command.last_status || command.status
  }));
  if (list.length > selected.length) {
    selected.push({
      omitted_count: list.length - selected.length,
      omitted_reason: 'prompt_budget_command_plan_limit'
    });
  }
  return selected;
}

function minimalBundleForBudget(evidenceBundle, limits = {}) {
  const sourceLimit = limits.sourceLimit || 40;
  const claimLimit = limits.claimLimit || 80;
  const gapLimit = limits.gapLimit || 20;
  const commandLimit = limits.commandLimit || 25;
  const summaryMax = limits.summaryMax || 220;
  return {
    ...compactBundleForBudget(evidenceBundle),
    source_artifacts: (evidenceBundle.source_artifacts || []).slice(0, sourceLimit).map((artifact) => ({
      type: artifact.type,
      role: artifact.role,
      path: artifact.path
    })),
    artifact_summaries: [],
    ledger_claims: compactLedgerClaims(evidenceBundle.ledger_claims || [], { summaryMax }).slice(0, claimLimit),
    known_gaps: (evidenceBundle.known_gaps || []).slice(0, gapLimit).map((gap) => ({
      id: gap.id,
      owner: gap.owner,
      blocks: gap.blocks,
      gap: truncateText(gap.gap, summaryMax)
    })),
    command_plan: compactCommandPlan(evidenceBundle.command_plan || [], commandLimit),
    verification_commands: compactCommandPlan(evidenceBundle.verification_commands || [], commandLimit)
  };
}

function compactLedgerClaims(claims, options = {}) {
  const summaryMax = options.summaryMax || 220;
  return (claims || []).map((claim) => ({
    id: claim.id,
    kind: claim.kind,
    summary: truncateText(claim.summary, summaryMax),
    owner: claim.owner,
    status: claim.status,
    evidence_count: Array.isArray(claim.evidence) ? claim.evidence.length : 0
  }));
}

function buildPromptMarkdown({ slug, policy, ledger, evidenceBundle, promptBudget = {} }) {
  const budget = {
    max_chars: promptBudget.max_chars || DEFAULT_PROMPT_BUDGET_CHARS,
    compact_mode: Boolean(promptBudget.compact_mode),
    artifact_summary_mode: promptBudget.artifact_summary_mode || 'preview'
  };
  const claims = budget.compact_mode
    ? compactLedgerClaims(evidenceBundle.ledger_claims || ledger.claims || [])
    : (evidenceBundle.ledger_claims || ledger.claims || []);
  return `# Clean Auditor Prompt - ${slug}

You are an independent adversarial implementation auditor. Do not trust implementation summaries. Verify each claim against real files, git state, tests, and source artifacts.

## Mission

Judge whether the implementation evidence confirms the approved behavior for \`${slug}\`. Your job is not to be nice; your job is to find mismatches without inventing false positives.

## Hard Rules

- Read the ledger claims before judging.
- Treat tests passed as evidence, not proof of full behavior.
- Distinguish "not found" from "false".
- Report exact \`file:line\` for divergences when available.
- Respect explicit false-positive exceptions from source artifacts or the ledger.
- Do not execute destructive commands.
- Do not propose broad unrelated refactors.
- No courtesy PASS.
- Produce the \`Machine Report\` JSON block exactly.

## PASS Criteria

PASS only when every implemented or partial required claim is confirmed against files/tests/artifacts, required commands are passed or explicitly justified, scope gaps are owned, and no blocking finding remains. A green test suite alone is not enough.

## Owner Routing

- Implementation infidelity, missing behavior, broken wiring -> \`NEEDS_DEV_FIX\` / \`dev\`.
- Product or scope contradiction -> \`NEEDS_SCOPE_DECISION\` / \`product\` or \`sheldon\`.
- Tests not rerun, weak coverage, stale verification -> \`NEEDS_QA_RECHECK\` / \`qa\` or \`tester\`.
- Security-sensitive finding -> \`NEEDS_SECURITY_REVIEW\` / \`pentester\`.
- Missing required evidence -> \`INCONCLUSIVE\` with the missing command or artifact named.

## Prompt Package Controls

\`\`\`json
${asJson({
  prompt_budget: budget,
  redactions: evidenceBundle.redactions || {},
  preview_budget: evidenceBundle.preview_budget || {}
})}
\`\`\`

## Policy

\`${policy}\`

## Source Artifacts

\`\`\`json
${asJson(evidenceBundle.source_artifacts || [])}
\`\`\`

## Artifact Summaries

\`\`\`json
${asJson(evidenceBundle.artifact_summaries || [])}
\`\`\`

## Git State

\`\`\`json
${asJson(evidenceBundle.git || {})}
\`\`\`

## Ledger Claims

\`\`\`json
${asJson(claims)}
\`\`\`

## Known Gaps

\`\`\`json
${asJson(evidenceBundle.known_gaps || ledger.known_gaps || [])}
\`\`\`

## Required Verification Command Plan

\`\`\`json
${asJson(evidenceBundle.command_plan || evidenceBundle.verification_commands || [])}
\`\`\`

## Required Output

Return Markdown with these sections:

## Verdict
## Commands Run
## Findings
## Before And Now
## Residual Risk
## Recommended Route
## Machine Report

The \`Machine Report\` section must contain one fenced \`json\` block matching:

\`\`\`json
${asJson(machineReportSchemaExample(slug, policy))}
\`\`\`
`;
}

function buildWithinBudget({ slug, policy, ledger, evidenceBundle, maxChars = DEFAULT_PROMPT_BUDGET_CHARS }) {
  let promptBudget = {
    max_chars: maxChars,
    compact_mode: false,
    artifact_summary_mode: 'preview'
  };
  let markdown = buildPromptMarkdown({ slug, policy, ledger, evidenceBundle, promptBudget });
  if (markdown.length <= maxChars) {
    return { markdown, prompt_budget: { ...promptBudget, actual_chars: markdown.length, over_budget: false } };
  }

  const compactBundle = compactBundleForBudget(evidenceBundle);
  promptBudget = {
    max_chars: maxChars,
    compact_mode: true,
    artifact_summary_mode: 'path_only'
  };
  markdown = buildPromptMarkdown({ slug, policy, ledger, evidenceBundle: compactBundle, promptBudget });
  if (markdown.length <= maxChars) {
    return {
      markdown,
      prompt_budget: {
        ...promptBudget,
        actual_chars: markdown.length,
        over_budget: false
      }
    };
  }

  const tiers = [
    { artifactSummaryMode: 'minimal_path_only', sourceLimit: 40, claimLimit: 80, gapLimit: 20, commandLimit: 25, summaryMax: 220 },
    { artifactSummaryMode: 'minimal_tight', sourceLimit: 30, claimLimit: 50, gapLimit: 12, commandLimit: 20, summaryMax: 140 },
    { artifactSummaryMode: 'minimal_floor', sourceLimit: 20, claimLimit: 35, gapLimit: 8, commandLimit: 14, summaryMax: 100 },
    { artifactSummaryMode: 'minimal_core', sourceLimit: 12, claimLimit: 24, gapLimit: 5, commandLimit: 10, summaryMax: 80 }
  ];

  for (const tier of tiers) {
    const minimalBundle = minimalBundleForBudget(evidenceBundle, tier);
    promptBudget = {
      max_chars: maxChars,
      compact_mode: true,
      artifact_summary_mode: tier.artifactSummaryMode,
      claim_summary_chars: tier.summaryMax
    };
    markdown = buildPromptMarkdown({ slug, policy, ledger, evidenceBundle: minimalBundle, promptBudget });
    if (markdown.length <= maxChars) {
      return {
        markdown,
        prompt_budget: {
          ...promptBudget,
          actual_chars: markdown.length,
          over_budget: false
        }
      };
    }
  }

  return {
    markdown,
    prompt_budget: {
      ...promptBudget,
      actual_chars: markdown.length,
      over_budget: markdown.length > maxChars
    }
  };
}

async function writePromptPackage(rootDir, slug, markdown, outPath = null) {
  let targetPath;
  if (outPath) {
    const safe = resolveInsideRoot(rootDir, outPath);
    if (!safe.ok) return safe;
    targetPath = safe.path;
  } else {
    const runsDir = verificationRunsDir(rootDir, slug);
    await fs.mkdir(runsDir, { recursive: true });
    targetPath = path.join(runsDir, `${timestampForFile()}-prompt.md`);
  }
  await fs.mkdir(path.dirname(targetPath), { recursive: true });
  await fs.writeFile(targetPath, markdown, 'utf8');
  return { ok: true, prompt_path: relativeFromRoot(rootDir, targetPath) };
}

async function buildAndWritePromptPackage({ rootDir, slug, policy, ledger, evidenceBundle, outPath }) {
  const { markdown, prompt_budget: promptBudget } = buildWithinBudget({ slug, policy, ledger, evidenceBundle });
  const written = await writePromptPackage(rootDir, slug, markdown, outPath);
  if (!written.ok) return written;
  return {
    ok: true,
    feature_slug: slug,
    policy,
    prompt_path: written.prompt_path,
    prompt_chars: markdown.length,
    prompt_budget: promptBudget,
    redactions: evidenceBundle.redactions || {},
    source_artifacts: evidenceBundle.source_artifacts,
    artifact_summaries: evidenceBundle.artifact_summaries,
    verification_commands: evidenceBundle.verification_commands,
    command_plan: evidenceBundle.command_plan
  };
}

module.exports = {
  buildPromptMarkdown,
  buildAndWritePromptPackage,
  timestampForFile,
  machineReportSchemaExample,
  DEFAULT_PROMPT_BUDGET_CHARS
};
