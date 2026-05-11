'use strict';

// Notify renderer — visual prefixes for the `aioson notify` command.
// Pure: no side effects, no IO.

const LEVELS = {
  info:  { prefix: 'ℹ',  exitCode: 0 },
  warn:  { prefix: '⚠',  exitCode: 0 },
  block: { prefix: '⛔', exitCode: 2 }
};

const DEFAULT_LEVEL = 'info';

function normalizeLevel(level) {
  const key = String(level || '').trim().toLowerCase();
  return Object.prototype.hasOwnProperty.call(LEVELS, key) ? key : DEFAULT_LEVEL;
}

function render({ level, topic, message }) {
  const normalized = normalizeLevel(level);
  const { prefix, exitCode } = LEVELS[normalized];
  const topicLabel = topic ? `[${String(topic).trim()}]` : '';
  const parts = [prefix, topicLabel, String(message || '').trim()].filter(Boolean);
  return { level: normalized, line: parts.join(' '), exitCode };
}

module.exports = {
  LEVELS,
  DEFAULT_LEVEL,
  normalizeLevel,
  render
};
