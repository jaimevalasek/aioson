'use strict';

// Read-only facts for real candidate artifacts. Semantic quality is judged
// independently; a structurally valid artifact is never assigned an AI score.
const path = require('node:path');
const { analyzeFeatureCompleteness } = require('../../src/lib/feature-completeness');
const { featureText } = require('../../src/lib/delivery-followups');
const { contentHash } = require('../../src/lib/plan-document');

async function measure(root, slug) {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug || '')) throw new Error('Supply a feature slug');
  const hashes = {};
  for (const name of ['prd', 'implementation-plan', 'qa-report']) {
    try { hashes[name] = contentHash(await featureText(root, slug, name)); }
    catch (error) { if (error.code !== 'ENOENT') throw error; hashes[name] = null; }
  }
  const report = await analyzeFeatureCompleteness(root, slug, { includeExecution: Boolean(hashes['qa-report']) });
  return { schema_version: 1, feature: slug, measured_at: new Date().toISOString(), artifact_hashes: hashes,
    applicable: report.applicable, summary: report.summary, findings: report.findings,
    plan_contract: report.plan_contract,
    semantic_review: { status: 'required', instructions: 'Compare the approved raw sources and repository against these exact artifact hashes using docs/sdd-delivery-reliability.md. Do not use mechanical success as a semantic quality score.' } };
}

if (require.main === module) measure(path.resolve(process.argv[2] || '.'), process.argv[3]).then(result => {
  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
}).catch(error => { process.stderr.write(error.message + '\n'); process.exitCode = 1; });

module.exports = { measure };
