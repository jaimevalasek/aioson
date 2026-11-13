'use strict';

const { TOOL_CAPS, getToolCapabilities, listSupportedTools } = require('../lib/tool-capabilities');

// Expose the per-tool capability map (resume support, install command, etc.)
// so external clients (AIOSON Play, IDE extensions) can drive UI without
// hard-coding their own copy of this lookup.
//
// Usage:
//   aioson tool:capabilities --json
//   aioson tool:capabilities --tool=claude --json

// What `live:*` accepts beyond one session per folder and label. A client
// reads this block before it opens a second session in a folder; a CLI that
// answers without it takes one session per label.
//   own_session     — `live:start --session=<key> --own-session`, and
//                     `live:status` / `live:close --session=<key>`
//   session_feature — each live session keeps its own feature
//                     (`feature:current`, `session:kickoff` without --feature)
const LIVE_SESSION_CAPS = Object.freeze({ own_session: true, session_feature: true });

async function runToolCapabilities({ args: _args, options = {}, logger, t: _t }) {
  const tool = options.tool ? String(options.tool).trim() : null;

  let payload;
  if (tool) {
    const caps = getToolCapabilities(tool);
    if (!caps) {
      const supported = listSupportedTools();
      throw new Error(`tool_unknown:${tool} (supported: ${supported.join(', ')})`);
    }
    payload = { tool: tool.toLowerCase(), capabilities: caps };
  } else {
    payload = {
      tools: TOOL_CAPS,
      schema_version: 2,
      live_sessions: { ...LIVE_SESSION_CAPS },
    };
  }

  if (options.json) {
    // The CLI owns JSON serialization. Return the historical bare payload so
    // external clients keep the same top-level `tools` / `schema_version`
    // contract without duplicate or mixed output.
    return payload;
  }

  // Human-readable fallback
  if (tool) {
    const caps = payload.capabilities;
    logger.log(`Tool: ${payload.tool}`);
    logger.log(`  binary:                ${caps.binary}`);
    logger.log(`  install_command:       ${caps.install_command}`);
    logger.log(`  supports_resume:       ${caps.supports_resume}`);
    if (caps.supports_resume) {
      logger.log(`  resume_last:           ${(caps.resume_last || []).join(' ')}`);
      logger.log(`  supports_session_id:   ${caps.supports_session_id}`);
      if (caps.supports_session_id) {
        logger.log(`  resume_session_id:     ${(caps.resume_session_id || []).join(' ')}`);
      }
      logger.log(`  supports_session_picker: ${caps.supports_session_picker}`);
      if (caps.supports_session_picker) {
        logger.log(`  session_picker:        ${(caps.session_picker || []).join(' ')}`);
      }
    }
    logger.log(`  supports_yolo:         ${caps.supports_yolo}`);
    if (caps.supports_yolo) {
      logger.log(`  yolo_args:             ${(caps.yolo_args || []).join(' ')}`);
    }
  } else {
    logger.log(`Supported tools: ${listSupportedTools().join(', ')}`);
    logger.log(`Live sessions: own_session=${LIVE_SESSION_CAPS.own_session}, session_feature=${LIVE_SESSION_CAPS.session_feature}`);
    logger.log(`Run with --tool=<name> for details, or --json for the full map.`);
  }

  return { ok: true, payload };
}

module.exports = {
  runToolCapabilities,
  LIVE_SESSION_CAPS,
};
