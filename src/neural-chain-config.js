'use strict';

/**
 * Neural Chain — config reader for autonomy mode + auto-fix threshold.
 *
 * Reads `.aioson/config.md` YAML frontmatter (if present) for two keys:
 *   - `autonomy_mode`         → 'guarded' | 'standard' | 'autonomous'
 *   - `chain_auto_threshold`  → REAL in [0.0, 1.0]
 *
 * EC-NC-07: missing file / missing frontmatter / missing key / invalid value
 * → runtime defaults (`guarded`, 0.8). Never force-edits the config file.
 *
 * The current canonical `.aioson/config.md` is a pure documentation Markdown
 * file with no frontmatter; users opt in to Neural Chain knobs by adding a
 * `---` frontmatter block at the top of that file. See spec § BR-NC-03 +
 * `requirements-neural-chain.md` § chain_auto_threshold for the contract.
 */

const fs = require('node:fs');
const path = require('node:path');
const { parseYamlFrontmatter } = require('./context');

const VALID_AUTONOMY_MODES = Object.freeze(['guarded', 'standard', 'autonomous']);
const DEFAULT_AUTONOMY_MODE = 'guarded';
const DEFAULT_CHAIN_AUTO_THRESHOLD = 0.8;

function normalizeAutonomyMode(value) {
  if (typeof value !== 'string') return null;
  const v = value.trim().toLowerCase();
  return VALID_AUTONOMY_MODES.includes(v) ? v : null;
}

function normalizeThreshold(value) {
  let n;
  if (typeof value === 'number') {
    n = value;
  } else if (typeof value === 'string') {
    n = parseFloat(value.trim());
  } else {
    return null;
  }
  if (!Number.isFinite(n) || n < 0 || n > 1) return null;
  // SF-NC-03 — reject negative zero. JS quirk: -0 < 0 is false, so the range
  // check above passes, but using -0 as a threshold is operationally
  // equivalent to setting threshold=0 (everything above 0 confidence auto-
  // fixes in standard/autonomous mode) and is a smell that the source value
  // was crafted to dodge validation. Normalize positive zero only.
  if (Object.is(n, -0)) return null;
  return n;
}

function readChainConfig({ targetDir } = {}) {
  const defaults = {
    autonomyMode: DEFAULT_AUTONOMY_MODE,
    chainAutoThreshold: DEFAULT_CHAIN_AUTO_THRESHOLD,
    source: 'defaults'
  };

  if (!targetDir || typeof targetDir !== 'string') return defaults;

  const filePath = path.join(targetDir, '.aioson', 'config.md');
  let text;
  try {
    text = fs.readFileSync(filePath, 'utf8');
  } catch (err) {
    if (err && err.code === 'ENOENT') return defaults;
    // Any other I/O error → defaults (best-effort, never blocks the hook).
    return { ...defaults, source: 'read_error', error: err.message };
  }

  const parsed = parseYamlFrontmatter(text);
  if (!parsed.ok) {
    // No frontmatter / malformed → defaults. EC-NC-07 forbids force-editing.
    return { ...defaults, source: 'no_frontmatter', reason: parsed.reason };
  }

  const autonomyMode = normalizeAutonomyMode(parsed.data.autonomy_mode) || DEFAULT_AUTONOMY_MODE;
  const threshold = normalizeThreshold(parsed.data.chain_auto_threshold);
  const chainAutoThreshold = threshold === null ? DEFAULT_CHAIN_AUTO_THRESHOLD : threshold;

  return {
    autonomyMode,
    chainAutoThreshold,
    source: 'config_md'
  };
}

module.exports = {
  readChainConfig,
  normalizeAutonomyMode,
  normalizeThreshold,
  VALID_AUTONOMY_MODES,
  DEFAULT_AUTONOMY_MODE,
  DEFAULT_CHAIN_AUTO_THRESHOLD
};
