'use strict';

const { openRuntimeDb, appendDossierEvent } = require('../runtime-store');

/**
 * Emit a single runtime event for dossier auto-init lifecycle.
 *
 * Silent: failures are swallowed (telemetry must never break the calling flow).
 * Used by feature-close.js and workflow-next.js to report:
 *   - feature_close_dossier_synthesized (mode: from-existing | minimal-fallback)
 *   - dossier_auto_initialized (trigger: workflow-next | product-prompt)
 *   - sync_agents_parity_violation
 */
async function emitDossierEvent(targetDir, { agent, type, summary, meta }) {
  try {
    // A run-bound event (logAgentEvent) needs the runtime dir and opens a
    // session per caller; called with none it threw every time and the catch
    // below hid it, so no dossier event ever landed. These events belong to
    // no run: one row each.
    const { db } = await openRuntimeDb(targetDir);
    try {
      appendDossierEvent(db, { agentName: agent, eventType: type, message: summary || '', payload: meta });
    } finally {
      db.close();
    }
  } catch {
    // Telemetry failures must not break the calling flow. The dashboard misses
    // one event; the user-visible operation continues.
  }
}

module.exports = { emitDossierEvent };
