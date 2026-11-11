'use strict';

/**
 * How often the host compacts a session, and how full its context was.
 *
 * A host that works with a small window for the model it runs — an outdated
 * CLI that does not recognize the model and assumes its smallest window, a
 * capped setting — compacts every few minutes. From inside the session nothing
 * says whether the framework's own reads or the host is the cause, and the
 * person at the keyboard only sees the work stopping to summarize itself.
 *
 * The hooks already see every compaction. PreCompact records how full the
 * context was, read from the tail of the harness's own transcript, and the
 * SessionStart after the compaction measures the gap since the previous one.
 * Both are numbers on record: nothing here knows any model's window, so a new
 * model or a new host needs no table kept up to date.
 *
 * Only automatic compactions count: a person who types `/compact` twice in a
 * row chose to.
 */

const fs = require('node:fs');

const TAIL_BYTES = 1024 * 1024;
// Two automatic compactions closer than this are pressure. Sessions on a large
// window compact hours apart; the ones on a window too small for the work
// measured 3 to 30 minutes.
const PRESSURE_GAP_MINUTES = 45;

function count(value) {
  return Number.isSafeInteger(value) && value > 0 ? value : null;
}

/**
 * The context size one transcript line reports, or null: the usage of a Claude
 * Code assistant turn (what the request carried in), or a Codex `token_count`
 * (which also names the window the harness works with).
 */
function contextOfEntry(entry) {
  if (!entry || typeof entry !== 'object' || entry.isSidechain) return null;
  const usage = entry.type === 'assistant' && entry.message ? entry.message.usage : null;
  if (usage && typeof usage === 'object') {
    const tokens = count((usage.input_tokens || 0) + (usage.cache_read_input_tokens || 0) + (usage.cache_creation_input_tokens || 0));
    return tokens ? { context_tokens: tokens } : null;
  }
  const payload = entry.type === 'event_msg' ? entry.payload : entry;
  const info = payload && payload.type === 'token_count' ? payload.info : null;
  const tokens = info && info.last_token_usage ? count(info.last_token_usage.total_tokens) : null;
  if (!tokens) return null;
  const window = count(info.model_context_window);
  return window ? { context_tokens: tokens, window_tokens: window } : { context_tokens: tokens };
}

/**
 * The context size the harness last reported in its transcript — the tail
 * only, newest line first. `{}` when there is no transcript, it cannot be
 * read, or its format says nothing this reads: the marker is recorded anyway.
 */
function contextAtCompaction(transcriptPath) {
  if (typeof transcriptPath !== 'string' || !transcriptPath.trim()) return {};
  let fd = null;
  try {
    fd = fs.openSync(transcriptPath, 'r');
    const { size } = fs.fstatSync(fd);
    const length = Math.min(size, TAIL_BYTES);
    const buffer = Buffer.alloc(length);
    fs.readSync(fd, buffer, 0, length, size - length);
    const lines = buffer.toString('utf8').split('\n');
    for (let index = lines.length - 1; index >= 0; index -= 1) {
      const line = lines[index].trim();
      if (!line) continue;
      let found = null;
      // The first line of the tail may be cut mid-entry.
      try { found = contextOfEntry(JSON.parse(line)); } catch { /* not a whole entry */ }
      if (found) return found;
    }
  } catch { /* unreadable transcript: no measurement */ } finally {
    if (fd !== null) { try { fs.closeSync(fd); } catch { /* already closed */ } }
  }
  return {};
}

function parsePayload(event) {
  if (event && event.payload && typeof event.payload === 'object') return event.payload;
  try {
    return event && event.payload_json ? JSON.parse(event.payload_json) || {} : {};
  } catch {
    return {};
  }
}

/**
 * @param {Array<{event_type: string, created_at?: string, payload_json?: string, payload?: object}>} events  one harness session's events, oldest first
 * @returns {{count: number, minutes: number, context_tokens: number|null, window_tokens: number|null}|null}  null when the session is not under pressure
 */
function compactionPressure(events) {
  const markers = (Array.isArray(events) ? events : [])
    .filter((event) => event && event.event_type === 'compaction')
    .map((event) => ({ at: Date.parse(event.created_at), payload: parsePayload(event) }))
    .filter((marker) => marker.payload.trigger !== 'manual');
  if (markers.length < 2) return null;
  const last = markers[markers.length - 1];
  const gap = last.at - markers[markers.length - 2].at;
  if (!Number.isFinite(gap) || gap < 0 || gap >= PRESSURE_GAP_MINUTES * 60 * 1000) return null;
  return {
    count: markers.length,
    minutes: Math.max(1, Math.round(gap / 60000)),
    context_tokens: count(last.payload.context_tokens),
    window_tokens: count(last.payload.window_tokens)
  };
}

function ordinal(n) {
  const tens = n % 100;
  if (tens >= 11 && tens <= 13) return `${n}th`;
  return `${n}${['th', 'st', 'nd', 'rd'][n % 10] || 'th'}`;
}

function thousands(tokens) {
  return `${Math.round(tokens / 1000)}k`;
}

function measured(pressure) {
  const of = pressure.window_tokens ? ` of a ${thousands(pressure.window_tokens)} window` : '';
  const fill = pressure.context_tokens ? `, context at ~${thousands(pressure.context_tokens)} tokens${of}` : '';
  return `${ordinal(pressure.count)} automatic compaction of this session, ${pressure.minutes} min after the previous one${fill}`;
}

/** The measurement as one line of the session checkpoint: recorded data, like the rest of it. */
function pressureLine(pressure) {
  return pressure ? `Compaction pressure on record: ${measured(pressure)} — the host window is small for this work.` : null;
}

/** The same measurement for the person at the keyboard, with where to look. */
function pressureNotice(pressure) {
  if (!pressure) return null;
  return `AIOSON: ${measured(pressure)}. A window this small for the work usually comes from the host, not from the project: `
    + 'a CLI too old to recognize the model assumes its smallest window, or a setting caps it. '
    + 'Check the host version and its context report (Claude Code: `claude --version`, `/context`).';
}

module.exports = {
  contextAtCompaction,
  compactionPressure,
  pressureLine,
  pressureNotice,
  PRESSURE_GAP_MINUTES
};
