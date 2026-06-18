'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { buildGuardResponse } = require('../context-guard');

// `aioson context:guard [path] --tool=claude [--json]`
//
// Reference adapter for the operational retrieval loop. A harness hook pipes the
// pending tool event on stdin; the guard answers with a harness-shaped injection
// payload (or an empty object when no project rule is salient). Always exits 0 —
// it is advisory and must never block the host harness.
async function runContextGuard({ args, options = {}, logger }) {
  const targetDir = path.resolve(process.cwd(), args[0] || '.');
  const event = await resolveEvent(args, options);

  const response = await buildGuardResponse(event || {}, targetDir, {
    tool: options.tool || 'claude',
    agent: options.agent || options.a || 'dev'
  });

  const guard = response && response._guard;

  if (options.json) {
    // Keep the wire payload pristine — strip the internal observability field.
    const { _guard, ...wire } = response;
    return wire;
  }

  if (guard && guard.injected) {
    logger.log(`context:guard injected ${guard.rules.length} rule(s): ${guard.rules.join(', ')} (confidence ${guard.confidence})`);
  } else {
    logger.log('context:guard: no salient project rule for this change');
  }

  return response;
}

async function resolveEvent(args, options) {
  if (typeof options.event === 'string') return safeParse(options.event);
  if (typeof options['event-file'] === 'string') {
    try {
      const raw = fs.readFileSync(path.resolve(process.cwd(), options['event-file']), 'utf8');
      return safeParse(raw);
    } catch {
      return null;
    }
  }
  return readStdinEvent();
}

function safeParse(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function readStdinEvent() {
  return new Promise((resolve) => {
    if (process.stdin.isTTY) {
      resolve(null);
      return;
    }
    let data = '';
    let settled = false;
    const settle = (value) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => { data += chunk; });
    process.stdin.on('end', () => settle(safeParse(data)));
    process.stdin.on('error', () => settle(null));
  });
}

module.exports = { runContextGuard };
