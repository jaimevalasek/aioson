'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');

const {
  LEDGER_SCHEMA_VERSION,
  validateImplementationLedger,
  missingLedgerEvidence,
  makeError
} = require('./result');
const {
  featureContextDir,
  verificationRunsDir,
  resolveInsideRoot,
  relativeFromRoot
} = require('./path-policy');

const REQUIRED_LEDGER_SECTIONS = [
  { id: 'source_of_truth', heading: 'Source Of Truth' },
  { id: 'intended_behavior_claims', heading: 'Intended Behavior Claims' },
  { id: 'implementation_evidence', heading: 'Implementation Evidence' },
  { id: 'verification_commands', heading: 'Verification Commands' },
  { id: 'known_gaps', heading: 'Known Gaps' },
  { id: 'handoff_notes', heading: 'Handoff Notes' },
  { id: 'machine_ledger', heading: 'Machine Ledger' }
];

async function exists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

function sectionPattern(heading) {
  return new RegExp(`^##\\s+${heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`, 'im');
}

function findMissingSections(content) {
  return REQUIRED_LEDGER_SECTIONS
    .filter((section) => !sectionPattern(section.heading).test(content))
    .map((section) => section.id);
}

function extractJsonBlock(content, heading) {
  const text = String(content || '');
  const headingRe = new RegExp(`^##\\s+${heading}\\s*$`, 'im');
  const headingMatch = headingRe.exec(text);
  let scope = text;
  if (headingMatch) {
    const start = headingMatch.index + headingMatch[0].length;
    const rest = text.slice(start);
    const nextHeading = rest.search(/^##\s+/m);
    scope = nextHeading === -1 ? rest : rest.slice(0, nextHeading);
  }
  const block = scope.match(/```json\s*([\s\S]*?)```/i);
  return block ? block[1].trim() : null;
}

function createLedgerTemplate(slug, sourceArtifacts = []) {
  const machine = {
    schema_version: LEDGER_SCHEMA_VERSION,
    feature_slug: slug,
    source_artifacts: sourceArtifacts.map((artifact) => ({
      type: artifact.type,
      path: artifact.path,
      role: artifact.role || 'source'
    })),
    claims: [],
    known_gaps: [],
    verification_commands: []
  };

  return `# Implementation Ledger - ${slug}

## Source Of Truth

List the PRD, requirements, spec, plan, prototype, harness, or source plan that defines this implementation.

## Intended Behavior Claims

List every behavior the implementation claims to satisfy. Use stable claim IDs such as \`CLAIM-001\`. For a formal feature capability, add \`capability_ids: ["CAP-..."]\` to the machine claim so Gate D can close it without inference.

## Implementation Evidence

Link each claim to files, line ranges, tests, commands, or explicit N/A rationale.

## Verification Commands

Record commands that should be run by the developer or clean auditor. Include last known status only when actually run.

## Known Gaps

Record deferred, blocked, or not-applicable items with an owner and rationale.

## Handoff Notes

Notes for @scope-check, @qa, or a clean auditor. This ledger is evidence, not proof.

## Machine Ledger

\`\`\`json
${JSON.stringify(machine, null, 2)}
\`\`\`
`;
}

async function prepareLedger(rootDir, slug, sourceArtifacts = []) {
  const featureDir = featureContextDir(rootDir, slug);
  const runsDir = verificationRunsDir(rootDir, slug);
  const ledgerPath = path.join(featureDir, 'implementation-ledger.md');

  await fs.mkdir(runsDir, { recursive: true });
  const alreadyExists = await exists(ledgerPath);
  if (!alreadyExists) {
    await fs.writeFile(ledgerPath, createLedgerTemplate(slug, sourceArtifacts), 'utf8');
  }

  return {
    ok: true,
    feature_slug: slug,
    ledger_path: relativeFromRoot(rootDir, ledgerPath),
    created: !alreadyExists,
    source_artifacts_found: sourceArtifacts.length > 0,
    warnings: sourceArtifacts.length > 0 ? [] : ['source_artifacts_not_found']
  };
}

async function readLedger(rootDir, slug) {
  const ledgerPath = path.join(featureContextDir(rootDir, slug), 'implementation-ledger.md');
  const resolved = resolveInsideRoot(rootDir, ledgerPath);
  if (!resolved.ok) return resolved;
  try {
    const content = await fs.readFile(resolved.path, 'utf8');
    return {
      ok: true,
      path: resolved.path,
      relative_path: resolved.relative_path,
      content
    };
  } catch {
    return makeError('ledger_not_found', {
      feature_slug: slug,
      ledger_path: resolved.relative_path
    });
  }
}

function validateLedgerContent(content, rootDir, slug) {
  const missingSections = findMissingSections(content);
  if (missingSections.length > 0) {
    return makeError('missing_ledger_sections', {
      feature_slug: slug,
      missing_sections: missingSections,
      ready_for_prompt: false
    });
  }

  const rawJson = extractJsonBlock(content, 'Machine Ledger');
  if (!rawJson) {
    return makeError('missing_machine_ledger', {
      feature_slug: slug,
      ready_for_prompt: false
    });
  }

  let ledger;
  try {
    ledger = JSON.parse(rawJson);
  } catch (error) {
    return makeError('invalid_machine_ledger_json', {
      feature_slug: slug,
      detail: error.message,
      ready_for_prompt: false
    });
  }

  const errors = validateImplementationLedger(ledger, { rootDir, slug });
  const claims = Array.isArray(ledger.claims) ? ledger.claims : [];
  const missingEvidence = missingLedgerEvidence(ledger);

  if (errors.length > 0) {
    return makeError('invalid_machine_ledger', {
      feature_slug: slug,
      errors,
      ready_for_prompt: false
    });
  }

  return {
    ok: true,
    feature_slug: slug,
    ledger,
    missing_sections: [],
    missing_evidence: missingEvidence,
    ready_for_prompt: claims.length > 0 && missingEvidence.length === 0
  };
}

async function checkLedger(rootDir, slug) {
  const loaded = await readLedger(rootDir, slug);
  if (!loaded.ok) return loaded;
  const validation = validateLedgerContent(loaded.content, rootDir, slug);
  return {
    ...validation,
    ledger_path: loaded.relative_path
  };
}

module.exports = {
  REQUIRED_LEDGER_SECTIONS,
  createLedgerTemplate,
  prepareLedger,
  readLedger,
  checkLedger,
  validateLedgerContent,
  extractJsonBlock
};
