'use strict';

const { parseFrontmatter } = require('../preflight-engine');
const { readPolicy, evaluateFollowups, featureText, VERDICT } = require('./delivery-followups');

async function deliveryStatus(root, slug) {
  if (!slug) return null;
  try {
    const verdict = String(parseFrontmatter(await featureText(root, slug, 'qa-report')).verdict || '').toLowerCase();
    const policy = await readPolicy(root);
    const followups = verdict === VERDICT ? await evaluateFollowups(root, slug) : null;
    return { verdict, auto_close: policy.enabled && policy.auto_close,
      state: verdict === VERDICT ? (followups.eligible ? 'ready_with_followups' : 'blocked_followups')
        : verdict === 'pass' ? 'ready_for_close_check' : verdict === 'fail' ? 'qa_failed' : 'qa_pending',
      reason: followups?.error || followups?.reason || (verdict === 'fail' ? `QA rejected delivery; inspect qa-report-${slug}.md before the next bounded correction` : null),
      command: ['pass', VERDICT].includes(verdict)
        ? `aioson feature:close . --feature=${slug} --verdict=${verdict.toUpperCase()}` : null };
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    return { state: 'blocked_followups', reason: error.message };
  }
}

async function closeAfterQa(root, { completedStage, featureSlug, nextAgent, step = false }, logger) {
  if (completedStage !== 'qa' || !featureSlug || nextAgent || step) return null;
  const delivery = await deliveryStatus(root, featureSlug);
  if (!delivery?.auto_close) return delivery ? { attempted: false, ...delivery } : null;
  if (!['ready_with_followups', 'ready_for_close_check'].includes(delivery.state)) return { attempted: false, ...delivery };
  // A normal PASS must meet the same comprehensive Gate D as conditional QA.
  const check = await require('../commands/gate-check').runGateCheck({ args: [root], options: { feature: featureSlug, gate: 'D', json: true }, logger });
  if (!check.ok) return { attempted: true, ok: false, reason: 'gate_d_blocked', missing: check.missing, command: delivery.command };
  const result = await require('../commands/feature-close').runFeatureClose({ args: [root],
    options: { feature: featureSlug, verdict: delivery.verdict, json: true }, logger });
  return { attempted: true, ...result, command: result.ok ? null : delivery.command };
}

module.exports = { deliveryStatus, closeAfterQa };
