'use strict';

/**
 * aioson phase:next [dir] --feature=<slug> --finished=<n> --note="<text>" [--tool=<harness>] [--json]
 *
 * Closes one phase of implementation-plan-<slug>.md, right after @dev's
 * checkpoint (focused verification, rules:check --changed, dev:state:write):
 *
 *  1. refuses without `--note` ("none"/"nenhuma" is a note) and refuses a
 *     `--finished` that is not a phase of the plan;
 *  2. appends the note to the dossier Agent Trail — the decisions that live
 *     only in the conversation survive the conversation;
 *  3. computes the next phase in plan order (gaps such as 1, 3, 5 allowed), or
 *     next_stage `qa` after the last one;
 *  4. resolves the restart policy: project.context.md `phase_restart`
 *     (auto | suggest | off), else `auto` inside the Play (AIOSON_PLAY=1),
 *     else `suggest`;
 *  5. with `auto`, records ONE `phase_restart_requested` event on the live
 *     session running this command — resolved as hooks:emit resolves it
 *     (AIOSON_LIVE_SESSION_KEY → that session's running run) — carrying the
 *     kickoff of the next agent for every registered harness. The Play's
 *     runtime watcher reads it and reopens the harness in a new conversation.
 *
 * `auto` means "stop here, the Play takes over". With no live session to carry
 * the event, or a note that could not be recorded, nobody would take over, so
 * the effective policy drops to `suggest` and says why (`downgrade_reason`).
 * The JSON `directive` is what the agent does next, per the effective policy.
 */

const fs = require('node:fs/promises');
const path = require('node:path');
const { isValidSlug } = require('../dossier/schema');
const { resolveTargetDir } = require('../lib/project-root');
const { validateProjectContextFile } = require('../context');
const { openRuntimeDb, appendRunEvent } = require('../runtime-store');
const { buildKickoffMap } = require('../lib/session-kickoff');
const { listSupportedTools } = require('../lib/tool-capabilities');
const { resolveKickoffTool, resolvePlanPhase, launcherLiveSession, optionText } = require('./session-kickoff');

const EVENT_TYPE = 'phase_restart_requested';
const PHASE_RESTART_POLICIES = ['auto', 'suggest', 'off'];
const NO_NOTE = /^(none|nenhuma|nenhum)$/i;

function insidePlay(env) {
  const value = String((env && env.AIOSON_PLAY) || '').trim().toLowerCase();
  return Boolean(value) && value !== '0' && value !== 'false';
}

/**
 * `{ policy, source, warning }` — the project option first, then the Play,
 * then the terminal default. An unknown option value is ignored with a warning.
 */
async function resolvePhaseRestartPolicy(targetDir, env = process.env) {
  let raw;
  try {
    const context = await validateProjectContextFile(targetDir);
    raw = context && context.data ? context.data.phase_restart : undefined;
  } catch {
    raw = undefined;
  }
  const value = raw === undefined || raw === null ? '' : String(raw).trim().toLowerCase();
  if (PHASE_RESTART_POLICIES.includes(value)) return { policy: value, source: 'project', warning: null };
  const warning = value ? `project.context.md phase_restart: "${raw}" is not auto, suggest or off; ignored.` : null;
  if (insidePlay(env)) return { policy: 'auto', source: 'play', warning };
  return { policy: 'suggest', source: 'default', warning };
}

/** Appends the phase note to the dossier Agent Trail (bootstrapping the dossier from the PRD when missing). */
async function recordNote(targetDir, feature, content) {
  try {
    const { runDossierAddFinding } = require('./dossier');
    const result = await runDossierAddFinding({
      args: [targetDir],
      options: { slug: feature, agent: 'dev', section: 'Agent Trail', content, json: true }
    });
    return result && result.ok
      ? { recorded: true, added: Boolean(result.added), bootstrapped: Boolean(result.bootstrapped) }
      : { recorded: false, reason: (result && result.reason) || 'dossier_write_failed' };
  } catch (error) {
    return { recorded: false, reason: 'dossier_write_failed', error: error.message };
  }
}

const PAYLOAD_FIELD = (field) => `CASE WHEN json_valid(payload_json) THEN json_extract(payload_json, '$.${field}') END`;
const PRIOR_EVENT_SQL = `
  SELECT id FROM execution_events
  WHERE run_key = ? AND event_type = ? AND ${PAYLOAD_FIELD('feature')} = ? AND ${PAYLOAD_FIELD('finished')} = ?
  ORDER BY id DESC LIMIT 1
`;

/**
 * Writes the restart request on the live session's running run — agent_events
 * and execution_events (the latter carries session_key) through appendRunEvent
 * — once per run, feature and finished phase: a retried phase:next never asks
 * the Play for a second restart.
 */
async function recordRestartEvent(targetDir, live, payload, message) {
  const opened = await openRuntimeDb(targetDir, { mustExist: true });
  if (!opened) return { recorded: false, reason: 'no_runtime' };
  const binding = { run_key: live.runKey, session_key: live.sessionKey };
  try {
    const prior = opened.db.prepare(PRIOR_EVENT_SQL).get(live.runKey, EVENT_TYPE, payload.feature, payload.finished);
    if (prior) return { recorded: false, reason: 'already_recorded', id: prior.id, ...binding };
    appendRunEvent(opened.db, { runKey: live.runKey, eventType: EVENT_TYPE, phase: 'live', status: 'running', message, payload });
    const row = opened.db.prepare('SELECT id FROM execution_events WHERE run_key = ? AND event_type = ? ORDER BY id DESC LIMIT 1').get(live.runKey, EVENT_TYPE);
    return { recorded: true, id: row ? row.id : null, ...binding };
  } finally {
    opened.db.close();
  }
}

/** events.ndjson of the launched session, append-only (state.json belongs to live:*). */
async function appendLiveRecord(live, record) {
  if (!live || !live.sessionDir) return;
  await fs.appendFile(path.join(live.sessionDir, 'events.ndjson'), `${JSON.stringify(record)}\n`, 'utf8').catch(() => {});
}

function nextTarget(nextId) {
  return nextId ? `phase ${nextId}` : 'QA';
}

function buildDirective({ policy, finished, nextId, kickoff }) {
  const target = nextTarget(nextId);
  if (policy === 'auto') {
    return `Phase ${finished} is done; the Play opens ${target} in a new session. End your reply now with that one sentence and do no further work in this conversation.`;
  }
  if (policy === 'suggest') {
    return `Continue with ${target} in this conversation. Quote this once so the person can restart it in a new session instead: ${kickoff}`;
  }
  return `Continue with ${target} in this conversation.`;
}

/** The auto policy with what it needs to be honored: an event the Play will read. */
async function honorAuto({ targetDir, live, note, payload, message }) {
  if (!note.recorded && note.text !== 'none') return { downgrade: 'note_not_recorded', event: null };
  if (!live) return { downgrade: 'no_live_session', event: { recorded: false, reason: 'no_live_session' } };
  const event = await recordRestartEvent(targetDir, live, payload, message)
    .catch((error) => ({ recorded: false, reason: 'event_write_failed', error: error.message }));
  if (event.recorded || event.reason === 'already_recorded') return { downgrade: null, event };
  return { downgrade: event.reason || 'event_not_recorded', event };
}

function logResult(logger, result) {
  const source = result.downgrade_reason ? `${result.policy_source}; auto dropped: ${result.downgrade_reason}` : result.policy_source;
  logger.log(`Phase ${result.finished} closed → next: ${nextTarget(result.next_phase)} · policy: ${result.policy} (${source})`);
  logger.log(result.note.recorded ? 'Note recorded in the dossier Agent Trail.' : `Note NOT recorded (${result.note.reason}).`);
  if (result.event && result.event.recorded) logger.log(`Event ${EVENT_TYPE} #${result.event.id} on live session ${result.event.session_key}.`);
  for (const warning of result.warnings) logger.error(warning);
  logger.log(result.directive);
}

async function runPhaseNext({ args = [], options = {}, logger, env = process.env } = {}) {
  const targetDir = resolveTargetDir(args);
  const refuse = (reason, message, extra = {}) => {
    if (!options.json && logger) logger.error(message);
    return { ok: false, reason, ...extra };
  };

  const feature = optionText(options.feature || options.slug);
  if (!feature) return refuse('missing_feature', '--feature=<slug> is required.');
  if (!isValidSlug(feature)) return refuse('invalid_feature', `Not a feature slug: ${feature}.`);
  const noteInput = optionText(options.note);
  if (!noteInput) return refuse('missing_note', '--note="<decisions that are not on disk>" is required; pass --note=none when there are none.');
  if (!optionText(options.finished)) return refuse('missing_finished', '--finished=<n> (the phase that just ended) is required.');

  const checked = await resolvePlanPhase(targetDir, feature, options.finished, refuse, 'finished');
  if (checked.refused) return checked.refused;
  const finished = checked.id;
  const nextId = checked.phases[checked.phases.indexOf(finished) + 1] || null;
  const nextStage = nextId ? 'dev' : 'qa';

  const live = await launcherLiveSession(targetDir);
  const tool = await resolveKickoffTool(targetDir, options.tool, live);
  if (tool.error) {
    return refuse('unknown_tool', `Unknown harness: ${tool.error}. Known: ${listSupportedTools().join(', ')}.`, { tools: listSupportedTools() });
  }

  const noteText = NO_NOTE.test(noteInput) ? 'none' : noteInput;
  const note = { text: noteText, ...(await recordNote(targetDir, feature, `Phase ${finished} closed; next: ${nextTarget(nextId)}. Decisions not on disk: ${noteText}`)) };

  const kickoffs = buildKickoffMap({ targetDir, agent: nextStage, feature, phase: nextId });
  const payload = {
    feature,
    finished: Number(finished),
    next_phase: nextId ? Number(nextId) : null,
    next_stage: nextStage,
    kickoff: kickoffs
  };

  const resolved = await resolvePhaseRestartPolicy(targetDir, env);
  let policy = resolved.policy;
  let event = null;
  let downgrade = null;
  if (policy === 'auto') {
    const message = `Phase ${finished} of ${feature} done; next: ${nextTarget(nextId)} in a new session`;
    ({ downgrade, event } = await honorAuto({ targetDir, live, note, payload, message }));
    if (downgrade) policy = 'suggest';
    if (event && event.recorded) await appendLiveRecord(live, { ts: new Date().toISOString(), type: EVENT_TYPE, message, feature, finished: payload.finished, next_phase: payload.next_phase, next_stage: nextStage });
  }

  const kickoff = kickoffs[tool.tool];
  const result = {
    ok: true,
    feature,
    finished: payload.finished,
    next_phase: payload.next_phase,
    next_stage: nextStage,
    policy,
    policy_source: resolved.source,
    ...(downgrade ? { policy_requested: 'auto', downgrade_reason: downgrade } : {}),
    tool: tool.tool,
    kickoff,
    note,
    event,
    directive: buildDirective({ policy, finished, nextId, kickoff }),
    warnings: resolved.warning ? [resolved.warning] : []
  };
  if (!options.json && logger) logResult(logger, result);
  return result;
}

module.exports = {
  EVENT_TYPE,
  PHASE_RESTART_POLICIES,
  runPhaseNext,
  resolvePhaseRestartPolicy
};
