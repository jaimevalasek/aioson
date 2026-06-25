'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');

const { resolveInsideRoot, relativeFromRoot, toPosixPath } = require('./path-policy');

async function fileExists(filePath) {
  try {
    const stat = await fs.stat(filePath);
    return stat.isFile() || stat.isDirectory();
  } catch {
    return false;
  }
}

async function listDirSafe(dir) {
  try {
    return await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }
}

async function walkFiles(rootDir, relativeDir, predicate, limit = 100) {
  const start = path.join(rootDir, relativeDir);
  const found = [];

  async function walk(absDir) {
    if (found.length >= limit) return;
    const entries = await listDirSafe(absDir);
    for (const entry of entries) {
      if (found.length >= limit) break;
      const full = path.join(absDir, entry.name);
      if (entry.isDirectory()) {
        await walk(full);
      } else if (entry.isFile() && predicate(entry.name, full)) {
        found.push(relativeFromRoot(rootDir, full));
      }
    }
  }

  if (await fileExists(start)) {
    await walk(start);
  }
  return found;
}

function addArtifact(artifacts, seen, artifact) {
  if (!artifact || !artifact.path) return;
  const key = `${artifact.type}:${toPosixPath(artifact.path)}`;
  if (seen.has(key)) return;
  seen.add(key);
  artifacts.push({
    type: artifact.type,
    path: toPosixPath(artifact.path),
    role: artifact.role || 'source'
  });
}

async function addIfExists(rootDir, artifacts, seen, type, relPath, role = 'source') {
  const safe = resolveInsideRoot(rootDir, relPath);
  if (!safe.ok) return;
  if (await fileExists(safe.path)) {
    addArtifact(artifacts, seen, { type, path: safe.relative_path, role });
  }
}

function ledgerSourceArtifacts(ledger) {
  if (!ledger || !Array.isArray(ledger.source_artifacts)) return [];
  return ledger.source_artifacts
    .filter((artifact) => artifact && artifact.path)
    .map((artifact) => ({
      type: artifact.type || 'ledger_source',
      path: artifact.path,
      role: artifact.role || 'ledger_declared'
    }));
}

function ledgerEvidenceFiles(ledger) {
  if (!ledger || !Array.isArray(ledger.claims)) return [];
  const files = [];
  for (const claim of ledger.claims) {
    if (!claim || !Array.isArray(claim.evidence)) continue;
    for (const evidence of claim.evidence) {
      if (evidence && evidence.path) {
        files.push({
          type: 'implementation_evidence',
          path: evidence.path,
          role: claim.id ? `claim:${claim.id}` : 'claim'
        });
      }
    }
  }
  return files;
}

async function discoverSourceArtifacts(rootDir, slug, ledger = null) {
  const artifacts = [];
  const seen = new Set();

  await addIfExists(rootDir, artifacts, seen, 'prd', `.aioson/context/prd-${slug}.md`, 'product_authority');
  await addIfExists(rootDir, artifacts, seen, 'requirements', `.aioson/context/requirements-${slug}.md`, 'acceptance_criteria');
  await addIfExists(rootDir, artifacts, seen, 'spec', `.aioson/context/spec-${slug}.md`, 'living_memory');
  await addIfExists(rootDir, artifacts, seen, 'sheldon_enrichment', `.aioson/context/sheldon-enrichment-${slug}.md`, 'product_review');
  await addIfExists(rootDir, artifacts, seen, 'sheldon_validation', `.aioson/context/sheldon-validation-${slug}.md`, 'product_review');
  await addIfExists(rootDir, artifacts, seen, 'design_doc', `.aioson/context/design-doc-${slug}.md`, 'design_authority');
  await addIfExists(rootDir, artifacts, seen, 'readiness', `.aioson/context/readiness-${slug}.md`, 'implementation_readiness');
  await addIfExists(rootDir, artifacts, seen, 'ui_spec', `.aioson/context/ui-spec-${slug}.md`, 'ui_contract');
  await addIfExists(rootDir, artifacts, seen, 'implementation_plan', `.aioson/context/implementation-plan-${slug}.md`, 'execution_plan');
  await addIfExists(rootDir, artifacts, seen, 'simple_plan', `.aioson/context/simple-plans/${slug}.md`, 'simple_plan');
  await addIfExists(rootDir, artifacts, seen, 'scope_check', `.aioson/context/scope-check-${slug}.md`, 'scope_alignment');
  await addIfExists(rootDir, artifacts, seen, 'qa_report', `.aioson/context/qa-report-${slug}.md`, 'qa_findings');
  await addIfExists(rootDir, artifacts, seen, 'security_findings', `.aioson/context/security-findings-${slug}.json`, 'security_findings');
  await addIfExists(rootDir, artifacts, seen, 'dossier', `.aioson/context/features/${slug}/dossier.md`, 'feature_dossier');
  await addIfExists(rootDir, artifacts, seen, 'sheldon_plan', `.aioson/plans/${slug}/manifest.md`, 'phased_plan');
  await addIfExists(rootDir, artifacts, seen, 'harness', `.aioson/plans/${slug}/harness-contract.json`, 'binary_criteria');
  await addIfExists(rootDir, artifacts, seen, 'harness_progress', `.aioson/plans/${slug}/progress.json`, 'binary_criteria_state');
  await addIfExists(rootDir, artifacts, seen, 'harness_output', `.aioson/plans/${slug}/last-check-output.json`, 'binary_criteria_output');
  await addIfExists(rootDir, artifacts, seen, 'prototype', `.aioson/briefings/${slug}/prototype.html`, 'prototype_contract');
  await addIfExists(rootDir, artifacts, seen, 'prototype_manifest', `.aioson/briefings/${slug}/prototype-manifest.md`, 'prototype_contract');
  await addIfExists(rootDir, artifacts, seen, 'prototype_report', `.aioson/briefings/${slug}/prototype-report.md`, 'prototype_contract');

  const prdFiles = await walkFiles(rootDir, 'prds', (name) => name.includes(slug) && name.endsWith('.md'), 25);
  for (const rel of prdFiles) addArtifact(artifacts, seen, { type: 'source_prd', path: rel, role: 'draft_source' });

  const rootPlanFiles = await walkFiles(rootDir, 'plans', (name, full) => {
    const rel = relativeFromRoot(rootDir, full);
    return rel.includes(slug);
  }, 50);
  for (const rel of rootPlanFiles) addArtifact(artifacts, seen, { type: 'source_plan', path: rel, role: 'preproduction_source' });

  const testFiles = await walkFiles(rootDir, 'tests', (name) => name.includes(slug), 50);
  for (const rel of testFiles) addArtifact(artifacts, seen, { type: 'test', path: rel, role: 'verification' });

  const contextReviewFiles = await walkFiles(rootDir, '.aioson/context', (name) => (
    /^qa-report-/.test(name) && name.includes(slug) && name.endsWith('.md')
  ), 25);
  for (const rel of contextReviewFiles) addArtifact(artifacts, seen, { type: 'qa_report', path: rel, role: 'qa_findings' });

  for (const artifact of [...ledgerSourceArtifacts(ledger), ...ledgerEvidenceFiles(ledger)]) {
    const safe = resolveInsideRoot(rootDir, artifact.path);
    if (safe.ok && await fileExists(safe.path)) {
      addArtifact(artifacts, seen, { ...artifact, path: safe.relative_path });
    }
  }

  return artifacts;
}

module.exports = {
  discoverSourceArtifacts
};
