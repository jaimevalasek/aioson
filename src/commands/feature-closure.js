'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const { resolveTargetDir } = require('../lib/project-root');
const { parseFrontmatter } = require('../preflight-engine');
const { readProjectFile } = require('../lib/plan-document');
const { POLICY_PATH, readPolicy, safeWrite, prepareFollowups, evaluateFollowups } = require('../lib/delivery-followups');

async function listFollowups(root) {
  const directory = '.aioson/context/simple-plans';
  let entries;
  try { entries = await fs.readdir(path.join(root, directory)); }
  catch (error) { if (error.code === 'ENOENT') return []; throw error; }
  const plans = [];
  for (const entry of entries.sort()) {
    if (!entry.endsWith('.md')) continue;
    const file = `${directory}/${entry}`;
    const meta = parseFrontmatter(await readProjectFile(root, file));
    if (meta.source_feature && meta.source_finding) plans.push({ file, feature: meta.source_feature, finding: meta.source_finding, status: meta.status || 'pending' });
  }
  return plans;
}

async function runFeatureClosure({ args = [], options = {}, logger = console }) {
  const root = resolveTargetDir(args);
  try {
    let result;
    if (options.enable === true || options.disable === true) {
      if (options.enable && options.disable) throw new Error('Choose enable or disable');
      if (!options.by || !String(options.by).trim()) throw new Error('--by=<owner> records the policy authorization');
      const policy = { schema_version: 1, enabled: options.enable === true,
        auto_close: options.auto === true, allow_secondary_ac_deferral: options['allow-secondary'] === true,
        authorized_by: String(options.by).trim(), authorized_at: new Date().toISOString() };
      await safeWrite(root, POLICY_PATH, JSON.stringify(policy, null, 2) + '\n');
      result = { ok: true, policy, policy_path: POLICY_PATH };
    } else if (options.list) {
      const plans = await listFollowups(root);
      result = { ok: true, plans: options['include-resolved'] ? plans : plans.filter(plan => !['done', 'dismissed'].includes(plan.status)) };
    } else {
      const slug = String(options.feature || options.slug || '');
      if (!slug) result = { ok: true, policy: await readPolicy(root) };
      else if (options.prepare) {
        const input = JSON.parse(await readProjectFile(root, String(options.prepare)));
        const evaluation = await prepareFollowups(root, slug, input);
        result = { ...evaluation, ok: evaluation.eligible };
      } else result = { ok: true, ...await evaluateFollowups(root, slug) };
    }
    if (options.json) logger.log(JSON.stringify(result, null, 2));
    else if (result.plans) for (const plan of result.plans) logger.log(`${plan.status} | ${plan.feature} | ${plan.file}`);
    else logger.log(JSON.stringify(result, null, 2));
    return result;
  } catch (error) {
    const result = { ok: false, reason: 'feature_closure_failed', error: error.message };
    logger.log(options.json ? JSON.stringify(result) : error.message);
    return result;
  }
}

module.exports = { runFeatureClosure, listFollowups };
