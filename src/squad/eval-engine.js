'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const {
  REPORT_SCHEMA_VERSION,
  hashObject,
  normalizeRelativePath,
  resolveContainedPath,
  sha256,
  verdictFromStatuses
} = require('./eval-contract');
const { normalizeGenomeBindings } = require('../genomes/bindings');
const { runWorker } = require('../worker-runner');

const SOURCE_KINDS = new Set([
  'responsibility',
  'depth',
  'grounding',
  'handoff',
  'anti_pattern',
  'scope'
]);

function round(value) {
  return Math.round(Number(value) * 1000) / 1000;
}

function scoreValue(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  return Math.max(0, Math.min(1, number));
}

function normalizeExpected(value) {
  if (Array.isArray(value)) return value.map(String).filter(Boolean);
  if (value === undefined || value === null || value === '') return [];
  return [String(value)];
}

function evaluateNumericDimension(name, definition = {}) {
  const spec = typeof definition === 'number' ? { candidate: definition } : (definition || {});
  const baseline = scoreValue(spec.baseline);
  const candidate = scoreValue(spec.candidate ?? spec.score);
  const threshold = scoreValue(spec.threshold) ?? 0.8;
  const critical = Boolean(spec.critical);
  if (candidate === null) {
    return {
      name,
      status: 'unverified',
      critical,
      baseline,
      candidate: null,
      delta: null,
      threshold,
      evidence: spec.evidence || 'candidate score was not produced'
    };
  }

  const delta = baseline === null ? null : round(candidate - baseline);
  let status = candidate >= threshold ? 'pass' : (critical ? 'fail' : 'warn');
  if (baseline !== null && candidate < baseline) status = 'fail';
  return {
    name,
    status,
    critical,
    baseline,
    candidate,
    delta,
    threshold,
    evidence: spec.evidence || null
  };
}

async function readText(projectDir, relativePath) {
  const target = resolveContainedPath(projectDir, relativePath);
  if (!target) return { ok: false, reason: `path escapes project: ${relativePath}` };
  try {
    return {
      ok: true,
      path: normalizeRelativePath(path.relative(projectDir, target)),
      content: await fs.readFile(target, 'utf8')
    };
  } catch {
    return { ok: false, reason: `file not found: ${relativePath}` };
  }
}

function findExecutor(manifest, slug) {
  return (manifest.executors || []).find((executor) => executor.slug === slug) || null;
}

function resolveManifestReference(manifest, reference) {
  if (!String(reference || '').startsWith('manifest.')) return null;
  const tokens = String(reference)
    .slice('manifest.'.length)
    .match(/[A-Za-z0-9_-]+|\[\d+\]/g);
  if (!tokens || tokens.length === 0) return null;
  let value = manifest;
  for (const token of tokens) {
    const key = token.startsWith('[') ? Number(token.slice(1, -1)) : token;
    if (value === null || value === undefined || !Object.prototype.hasOwnProperty.call(value, key)) {
      return null;
    }
    value = value[key];
  }
  return value;
}

async function resolveCriterionSource(projectDir, manifest, reference) {
  const manifestValue = resolveManifestReference(manifest, reference);
  if (manifestValue !== null) {
    const content = typeof manifestValue === 'string'
      ? manifestValue
      : JSON.stringify(manifestValue);
    return {
      ok: true,
      path: reference,
      content,
      hash: sha256(content)
    };
  }
  const file = await readText(projectDir, reference);
  return file.ok
    ? { ...file, hash: sha256(file.content) }
    : file;
}

async function evaluateSourceCriterion(projectDir, manifest, criterion, index) {
  const executor = findExecutor(manifest, criterion.executor);
  const artifactPath = criterion.artifact || executor?.file;
  const expected = normalizeExpected(criterion.expectedTerms || criterion.expected);
  const id = criterion.id || `criterion-${index + 1}`;
  const kind = SOURCE_KINDS.has(criterion.kind) ? criterion.kind : 'scope';
  const critical = criterion.critical === true || ['depth', 'grounding'].includes(kind);
  const base = {
    id,
    executor: criterion.executor || null,
    kind,
    statement: criterion.statement || criterion.claim || id,
    source: criterion.source || null,
    critical
  };

  if (!criterion.source) {
    return { ...base, status: 'unverified', reason: 'criterion has no source citation' };
  }
  const source = await resolveCriterionSource(projectDir, manifest, criterion.source);
  if (!source.ok) {
    return { ...base, status: 'unverified', reason: `criterion source is unresolved: ${source.reason}` };
  }
  if (!artifactPath) {
    return { ...base, status: 'unverified', reason: 'criterion has no executor artifact' };
  }
  const artifact = await readText(projectDir, artifactPath);
  if (!artifact.ok) {
    return { ...base, status: 'fail', artifact: normalizeRelativePath(artifactPath), reason: artifact.reason };
  }
  if (expected.length === 0) {
    return {
      ...base,
      status: 'unverified',
      artifact: artifact.path,
      reason: 'criterion has no deterministic expected terms'
    };
  }
  const haystack = artifact.content.toLocaleLowerCase();
  const missing = expected.filter((term) => !haystack.includes(term.toLocaleLowerCase()));
  return {
    ...base,
    status: missing.length === 0 ? 'pass' : 'fail',
    artifact: artifact.path,
    source_hash: source.hash,
    expected,
    missing,
    artifact_hash: sha256(artifact.content),
    reason: missing.length === 0 ? 'all expected terms are present' : `missing: ${missing.join(', ')}`
  };
}

function caseDimensions(testCase = {}, baselineOutput = null, candidateOutput = null) {
  const baseline = baselineOutput?.dimensions || baselineOutput?.scores || {};
  const candidate = candidateOutput?.dimensions || candidateOutput?.scores || {};
  const declared = testCase.dimensions && typeof testCase.dimensions === 'object'
    ? testCase.dimensions
    : {};
  const names = [...new Set([...Object.keys(baseline), ...Object.keys(candidate)])];
  return Object.fromEntries(names.map((name) => [
    name,
    {
      baseline: baseline[name],
      candidate: candidate[name],
      critical: (testCase.criticalDimensions || []).includes(name)
        || declared[name]?.critical === true,
      threshold: testCase.thresholds?.[name] ?? declared[name]?.threshold,
      evidence: declared[name]?.evidence || 'score produced by held-out worker execution'
    }
  ]));
}

async function executeHeldOutRun(projectDir, squadSlug, definition, label, control = {}) {
  if (!definition) return null;
  const config = typeof definition === 'string' ? { worker: definition } : definition;
  if (!config.worker) {
    return { label, ok: false, error: 'worker is required', output: null };
  }
  const result = await runWorker(
    projectDir,
    squadSlug,
    config.worker,
    {
      ...(config.input || {}),
      _aioson_eval: {
        variant: label,
        task: control.task || null,
        genome_enabled: Boolean(control.genomeEnabled),
        genome_bindings: control.genomeBindings || []
      }
    },
    {
      triggerType: 'eval',
      noRetry: config.retry !== true,
      timeoutMs: Number(config.timeoutMs || 30_000)
    }
  );
  return {
    label,
    worker: config.worker,
    ok: Boolean(result.ok),
    error: result.ok ? null : result.error,
    attempt: result.attempt || result.attempts || 0,
    duration_ms: result.durationMs || 0,
    controlled_variant: label,
    genome_enabled: Boolean(control.genomeEnabled),
    input_hash: hashObject(config.input || {}),
    output: result.ok ? result.output : null,
    output_hash: result.ok ? hashObject(result.output) : null
  };
}

async function evaluateHeldOutCase(projectDir, squadSlug, manifest, testCase, index) {
  const compiledBindings = flattenBindings(manifest)
    .filter((binding) => binding.status === 'compiled')
    .map((binding) => ({
      slug: binding.slug,
      compilationId: binding.compilationId || null
    }));
  const genomeEnabled = compiledBindings.length > 0;
  const baselineRun = await executeHeldOutRun(
    projectDir,
    squadSlug,
    testCase.baselineRun,
    'baseline',
    {
      task: testCase.task,
      genomeEnabled: false,
      genomeBindings: []
    }
  );
  const candidateRun = await executeHeldOutRun(
    projectDir,
    squadSlug,
    testCase.candidateRun || (testCase.worker ? {
      worker: testCase.worker,
      input: testCase.input,
      timeoutMs: testCase.timeoutMs
    } : null),
    'candidate',
    {
      task: testCase.task,
      genomeEnabled,
      genomeBindings: compiledBindings
    }
  );
  const dimensions = Object.entries(caseDimensions(
    testCase,
    baselineRun?.output,
    candidateRun?.output
  ))
    .map(([name, definition]) => evaluateNumericDimension(name, definition));
  for (const execution of [baselineRun, candidateRun].filter(Boolean)) {
    if (!execution.ok) {
      dimensions.push({
        name: `${execution.label}-execution`,
        status: 'fail',
        critical: true,
        baseline: null,
        candidate: null,
        delta: null,
        threshold: 1,
        evidence: execution.error
      });
    }
  }
  const controlledAb = Boolean(
    genomeEnabled
    && baselineRun?.ok
    && candidateRun?.ok
    && baselineRun.worker === candidateRun.worker
    && baselineRun.input_hash === candidateRun.input_hash
    && baselineRun.genome_enabled === false
    && candidateRun.genome_enabled === true
  );
  if (genomeEnabled && baselineRun && candidateRun && !controlledAb) {
    dimensions.push({
      name: 'genome-ab-control',
      status: 'fail',
      critical: true,
      baseline: null,
      candidate: null,
      delta: null,
      threshold: 1,
      evidence: 'Genome A/B must execute the same worker and task with only the controlled genome binding changed'
    });
  }
  const artifactPath = testCase.artifact || testCase.output;
  let artifact = null;
  if (artifactPath) {
    artifact = await readText(projectDir, artifactPath);
    const expected = normalizeExpected(testCase.expectedContains);
    const forbidden = normalizeExpected(testCase.expectedNotContains);
    if (!artifact.ok) {
      dimensions.push({
        name: 'task-output',
        status: 'fail',
        critical: true,
        baseline: null,
        candidate: null,
        delta: null,
        threshold: 1,
        evidence: artifact.reason
      });
    } else if (expected.length > 0 || forbidden.length > 0) {
      const text = artifact.content.toLocaleLowerCase();
      const missing = expected.filter((term) => !text.includes(term.toLocaleLowerCase()));
      const presentForbidden = forbidden.filter((term) => text.includes(term.toLocaleLowerCase()));
      dimensions.push({
        name: 'task-output',
        status: missing.length === 0 && presentForbidden.length === 0 ? 'pass' : 'fail',
        critical: true,
        baseline: null,
        candidate: missing.length === 0 && presentForbidden.length === 0 ? 1 : 0,
        delta: null,
        threshold: 1,
        evidence: missing.length === 0 && presentForbidden.length === 0
          ? 'artifact expectations satisfied'
          : `missing=${missing.join(',')}; forbidden=${presentForbidden.join(',')}`
      });
    }
  }
  if (dimensions.length === 0) {
    dimensions.push({
      name: 'task-output',
      status: 'unverified',
      critical: true,
      baseline: null,
      candidate: null,
      delta: null,
      threshold: 1,
      evidence: 'held-out case has no executable dimensions or artifact assertions'
    });
  }
  return {
    id: testCase.id || `held-out-${index + 1}`,
    task: testCase.task || testCase.description || null,
    executor: testCase.executor || null,
    artifact: artifact?.ok ? artifact.path : normalizeRelativePath(artifactPath),
    artifact_hash: artifact?.ok ? sha256(artifact.content) : null,
    ab_controlled: controlledAb,
    executions: [baselineRun, candidateRun].filter(Boolean),
    status: verdictFromStatuses(dimensions).toLowerCase().replace('_', '-'),
    dimensions
  };
}

function flattenBindings(manifest) {
  const normalized = normalizeGenomeBindings(manifest.genomeBindings || manifest.genomes);
  return [
    ...normalized.squad,
    ...Object.values(normalized.executors).flat()
  ];
}

function summarizeGenomeComparison(manifest, heldOutCases) {
  const bindings = flattenBindings(manifest);
  const compiled = bindings.filter((binding) => binding.status === 'compiled');
  if (bindings.length === 0) {
    return {
      status: 'not-applicable',
      bindings: [],
      dimensions: [],
      reason: 'no genome binding declared'
    };
  }
  if (compiled.length !== bindings.length) {
    return {
      status: 'fail',
      bindings: bindings.map((binding) => ({
        slug: binding.slug,
        status: binding.status,
        compilationId: binding.compilationId || null
      })),
      dimensions: [],
      reason: 'one or more genome bindings are not compiled'
    };
  }
  const compared = heldOutCases.flatMap((testCase) => (
    (testCase.ab_controlled ? testCase.dimensions : [])
      .filter((dimension) => dimension.baseline !== null && dimension.candidate !== null)
      .map((dimension) => ({ case: testCase.id, ...dimension }))
  ));
  if (compared.length === 0) {
    return {
      status: 'unverified',
      bindings: compiled.map((binding) => ({
        slug: binding.slug,
        status: binding.status,
        compilationId: binding.compilationId || null
      })),
      dimensions: [],
      reason: 'compiled genome has no held-out A/B comparison'
    };
  }
  return {
    status: verdictFromStatuses(compared).toLowerCase().replace('_', '-'),
    bindings: compiled.map((binding) => ({
      slug: binding.slug,
      status: binding.status,
      compilationId: binding.compilationId || null
    })),
    dimensions: compared,
    reason: compared.some((dimension) => dimension.status === 'fail')
      ? 'at least one dimension regressed or failed its threshold'
      : 'all compared dimensions improved or held their threshold'
  };
}

function collectDimensionSummary(sourceCriteria, heldOutCases, genomeComparison) {
  const output = {};
  const add = (name, item) => {
    if (!output[name]) output[name] = { pass: 0, warn: 0, fail: 0, unverified: 0, 'not-applicable': 0, critical_failures: 0 };
    output[name][item.status] = (output[name][item.status] || 0) + 1;
    if (item.critical && item.status === 'fail') output[name].critical_failures += 1;
  };
  for (const criterion of sourceCriteria) add(criterion.kind, criterion);
  for (const testCase of heldOutCases) {
    for (const dimension of testCase.dimensions) add(dimension.name, dimension);
  }
  for (const dimension of genomeComparison.dimensions || []) add(`genome:${dimension.name}`, dimension);
  return output;
}

async function hashSourceInputs(projectDir, manifest) {
  const entries = [];
  const paths = [
    ...(manifest.sourceDocs || []),
    ...(manifest.executors || []).map((executor) => executor.file).filter(Boolean)
  ];
  for (const relativePath of paths) {
    const content = await readText(projectDir, relativePath);
    entries.push(content.ok
      ? { path: content.path, hash: sha256(content.content) }
      : { path: normalizeRelativePath(relativePath), hash: null });
  }
  return {
    entries,
    hash: hashObject(entries)
  };
}

async function evaluateSquad({
  projectDir,
  slug,
  manifest,
  precheck,
  now = new Date().toISOString()
}) {
  const evaluation = manifest.evaluation || manifest.evalPolicy || {};
  const criteria = Array.isArray(evaluation.criteria) ? evaluation.criteria : [];
  const heldOut = Array.isArray(evaluation.heldOutCases) ? evaluation.heldOutCases : [];
  const sourceCriteria = [];
  for (let index = 0; index < criteria.length; index++) {
    sourceCriteria.push(await evaluateSourceCriterion(projectDir, manifest, criteria[index], index));
  }
  if (sourceCriteria.length === 0) {
    sourceCriteria.push({
      id: 'source-rubric',
      executor: null,
      kind: 'grounding',
      statement: 'Source-grounded rubric is declared',
      source: null,
      critical: true,
      status: 'unverified',
      reason: 'manifest.evaluation.criteria is empty'
    });
  }
  const heldOutCases = [];
  for (let index = 0; index < heldOut.length; index++) {
    heldOutCases.push(await evaluateHeldOutCase(projectDir, slug, manifest, heldOut[index], index));
  }
  if (heldOutCases.length === 0) {
    heldOutCases.push({
      id: 'held-out-required',
      task: null,
      executor: null,
      artifact: null,
      artifact_hash: null,
      status: 'unverified',
      dimensions: [{
        name: 'task-output',
        status: 'unverified',
        critical: true,
        baseline: null,
        candidate: null,
        delta: null,
        threshold: 1,
        evidence: 'manifest.evaluation.heldOutCases is empty'
      }]
    });
  }
  const genomeComparison = summarizeGenomeComparison(manifest, heldOutCases);
  const sourceStatuses = sourceCriteria.map((criterion) => ({
    status: criterion.status,
    critical: criterion.critical
  }));
  const heldOutStatuses = heldOutCases.flatMap((testCase) => testCase.dimensions);
  const combinedStatuses = [
    {
      status: precheck?.valid ? 'pass' : 'fail',
      critical: true
    },
    ...sourceStatuses,
    ...heldOutStatuses,
    {
      status: genomeComparison.status,
      critical: genomeComparison.status !== 'not-applicable'
    }
  ];
  const sourceInputs = await hashSourceInputs(projectDir, manifest);
  const verdict = verdictFromStatuses(combinedStatuses);
  const criticalFailures = combinedStatuses.filter((item) => item.critical && item.status === 'fail').length;

  return {
    schemaVersion: REPORT_SCHEMA_VERSION,
    squad: slug,
    generated_at: now,
    verdict,
    inputs: {
      manifest_hash: hashObject(manifest),
      source_hash: sourceInputs.hash,
      sources: sourceInputs.entries
    },
    precheck: {
      status: precheck?.valid ? 'pass' : 'fail',
      strict: true,
      errors: precheck?.errors || [],
      warnings: precheck?.warnings || []
    },
    source_rubric: {
      status: verdictFromStatuses(sourceStatuses).toLowerCase().replace('_', '-'),
      criteria: sourceCriteria
    },
    held_out: {
      status: verdictFromStatuses(heldOutStatuses).toLowerCase().replace('_', '-'),
      cases: heldOutCases
    },
    genome_comparison: genomeComparison,
    dimensions: collectDimensionSummary(sourceCriteria, heldOutCases, genomeComparison),
    critical_failures: criticalFailures,
    reproduction: {
      command: `aioson squad:eval . --squad=${slug} --json`,
      deterministic: true,
      contract: REPORT_SCHEMA_VERSION
    }
  };
}

module.exports = {
  SOURCE_KINDS,
  evaluateNumericDimension,
  resolveManifestReference,
  resolveCriterionSource,
  evaluateSourceCriterion,
  executeHeldOutRun,
  evaluateHeldOutCase,
  summarizeGenomeComparison,
  evaluateSquad
};
