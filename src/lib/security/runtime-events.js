'use strict';

const { openRuntimeDb, appendRunEvent } = require('../../runtime-store');
const { recordRuntimeOperation, makeWorkflowSessionKey } = require('../../execution-gateway');

function normalizeText(value) {
  return String(value || '').trim();
}

async function emitSecurityRuntimeEvent({
  targetDir,
  eventType,
  message,
  payload = null,
  runKey = null,
  status = 'completed',
  agentName = 'qa',
  source = 'direct',
  workflowState = null,
  workflowStage = null
}) {
  if (!targetDir || !eventType) {
    return { ok: false, reason: 'missing_target_or_event' };
  }

  try {
    if (runKey) {
      const handle = await openRuntimeDb(targetDir);
      try {
        appendRunEvent(handle.db, {
          runKey,
          eventType,
          phase: 'security',
          status,
          message: normalizeText(message) || eventType,
          payload: payload && typeof payload === 'object' ? payload : null,
          toolName: 'aioson'
        });
        return { ok: true, dbPath: handle.dbPath, runKey };
      } finally {
        handle.db.close();
      }
    }

    const workflowId = workflowState ? makeWorkflowSessionKey(workflowState) : null;
    const featureSlug = normalizeText(workflowState && workflowState.featureSlug);
    const resolvedStage = normalizeText(workflowStage || (workflowState && workflowState.current) || '');

    return await recordRuntimeOperation(targetDir, {
      agentName,
      source,
      workflowId: workflowId || null,
      workflowStage: resolvedStage || null,
      sessionKey: workflowId
        ? `${workflowId}:security:${eventType}:${Date.now()}`
        : `security:${eventType}:${Date.now()}`,
      title: featureSlug
        ? `Security event ${eventType} (${featureSlug})`
        : `Security event ${eventType}`,
      runTitle: eventType,
      goal: featureSlug
        ? `Registrar ${eventType} para ${featureSlug}`
        : `Registrar ${eventType}`,
      phase: 'security',
      eventType,
      status,
      message: normalizeText(message) || eventType,
      summary: normalizeText(message) || eventType,
      payload: payload && typeof payload === 'object' ? payload : null,
      toolName: 'aioson'
    });
  } catch {
    return { ok: false, reason: 'runtime_emit_failed' };
  }
}

module.exports = { emitSecurityRuntimeEvent };
