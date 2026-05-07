'use strict';

const { openRuntimeDb } = require('../runtime-store');
const { logAgentEvent } = require('../runtime-store');

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
    const { db } = await openRuntimeDb(targetDir);
    try {
      await logAgentEvent(db, null, {
        agentName: agent,
        message: summary || '',
        type,
        summary,
        meta,
        finish: false
      });
    } finally {
      db.close();
    }
  } catch {
    // Telemetry failures must not break the calling flow. The dashboard misses
    // one event; the user-visible operation continues.
  }
}

module.exports = { emitDossierEvent };
