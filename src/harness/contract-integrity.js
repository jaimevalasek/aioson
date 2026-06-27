'use strict';

/**
 * Contract-integrity check — the deterministic core of @validator's Step 0
 * (harness-contract.md §2c). Catches two contract-SHAPE failures a blind
 * executor must never let through on a runtime feature:
 *
 *   1. missing_runtime_gate — a runtime feature whose contract carries NONE of
 *      the RG-* runtime-gate criteria (build / migrate / boot / smoke). The
 *      app's build, migrations, boot and Core happy-path are then unverified —
 *      the exact green-but-broken failure mode §2c exists to stop.
 *   2. duplicate_verification — two binary criteria sharing an identical
 *      `verification` command (padding 11 criteria out of 6 real commands to
 *      fake an "11/11" score).
 *
 * This is contract-SHAPE verification, never a product judgment. Runtime-feature
 * detection (see detect-runtime-feature.js) only fires on signals the framework
 * can locate deterministically; the Play `manifest.json` `has_api` flag lives in
 * the target app and stays with the LLM @validator. `isRuntimeFeature: false`
 * therefore means "no reliable runtime signal", not "proven non-runtime" — so a
 * duplicate on a non-runtime contract is reported as a warning, not a hard error.
 */

const RUNTIME_GATE_IDS = Object.freeze(['RG-build', 'RG-migrate', 'RG-boot', 'RG-smoke']);

function normId(id) {
  return String(id || '').trim().toLowerCase();
}

const RUNTIME_GATE_ID_SET = new Set(RUNTIME_GATE_IDS.map(normId));

/**
 * A criterion counts as a runtime-gate criterion when its id is one of the
 * canonical RG-* ids (case-insensitive) or starts with `rg-`. We deliberately
 * match on the id, not the verification text, so a contract author opts in
 * explicitly (an RG-smoke that runs a unit test is a lie the author signs).
 */
function isRuntimeGateCriterion(criterion) {
  const id = normId(criterion && criterion.id);
  return RUNTIME_GATE_ID_SET.has(id) || id.startsWith('rg-');
}

function hasRuntimeGate(contract) {
  const criteria = Array.isArray(contract && contract.criteria) ? contract.criteria : [];
  return criteria.some(isRuntimeGateCriterion);
}

/**
 * Groups of criterion ids that share an identical non-empty `verification`
 * command among `binary: true` criteria. Each group has length >= 2.
 */
function findDuplicateVerifications(contract) {
  const criteria = Array.isArray(contract && contract.criteria) ? contract.criteria : [];
  const byCommand = new Map();
  for (const criterion of criteria) {
    if (!criterion || criterion.binary !== true) continue;
    const command = typeof criterion.verification === 'string' ? criterion.verification.trim() : '';
    if (!command) continue;
    if (!byCommand.has(command)) byCommand.set(command, []);
    byCommand.get(command).push(criterion.id);
  }
  const duplicates = [];
  for (const [command, ids] of byCommand) {
    if (ids.length > 1) duplicates.push({ command, ids });
  }
  return duplicates;
}

/**
 * @param {object} contract  parsed harness-contract.json
 * @param {{ isRuntimeFeature?: boolean }} options
 * @returns {{ ok: boolean, errors: Array<{code,message}>, warnings: Array<{code,message}>, isRuntimeFeature: boolean }}
 *   `ok === false` only when there is at least one blocking error. Warnings never
 *   set `ok = false` (advisory).
 */
function checkContractIntegrity(contract, options = {}) {
  const isRuntimeFeature = Boolean(options.isRuntimeFeature);
  const errors = [];
  const warnings = [];

  const duplicates = findDuplicateVerifications(contract);
  for (const dup of duplicates) {
    const entry = {
      code: 'duplicate_verification',
      message: `criteria ${dup.ids.join(', ')} share an identical verification command ("${dup.command}") — each binary criterion must map to a distinct check (harness-contract.md §2c).`
    };
    // Padding only fakes coverage on a runtime feature; on a non-runtime
    // contract a shared command (e.g. two ACs both proven by `npm test`) can be
    // legitimate, so it is advisory there.
    if (isRuntimeFeature) errors.push(entry);
    else warnings.push(entry);
  }

  if (isRuntimeFeature && !hasRuntimeGate(contract)) {
    errors.push({
      code: 'missing_runtime_gate',
      message: 'runtime feature but the contract has no RG-build / RG-migrate / RG-boot / RG-smoke criterion — the app\'s build, migrations, boot and Core happy-path are unverified. Add the §2c runtime-gate criteria, then re-run @dev.'
    });
  }

  return { ok: errors.length === 0, errors, warnings, isRuntimeFeature };
}

module.exports = {
  RUNTIME_GATE_IDS,
  normId,
  isRuntimeGateCriterion,
  hasRuntimeGate,
  findDuplicateVerifications,
  checkContractIntegrity
};
