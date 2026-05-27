'use strict';

const { TOOL_CAPS, getToolCapabilities, listSupportedTools } = require('../lib/tool-capabilities');

// Expose the per-tool capability map (resume support, install command, etc.)
// so external clients (AIOSON Play, IDE extensions) can drive UI without
// hard-coding their own copy of this lookup.
//
// Usage:
//   aioson tool:capabilities --json
//   aioson tool:capabilities --tool=claude --json
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
    };
  }

  if (options.json) {
    logger.log(JSON.stringify(payload, null, 2));
    return { ok: true, payload };
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
    logger.log(`Run with --tool=<name> for details, or --json for the full map.`);
  }

  return { ok: true, payload };
}

module.exports = {
  runToolCapabilities,
};
