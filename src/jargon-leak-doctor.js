'use strict';

/**
 * lay-user-agent-mode — Phase 3 doctor check `jargon_leak_detection`.
 *
 * Pure-where-possible helpers consumed by `src/doctor.js#runDoctor`. The check
 * scans `agent_events` rows from the 5 MVP agents (neo, setup, product, dev,
 * deyvin) and flags occurrences of framework jargon (MICRO/SMALL/MEDIUM, Gate
 * A-D, tier1/2/3, etc.) emitted while the project's profile is `creator`.
 *
 * Profile semantics (lay-user-agent-mode E4):
 *   - profile=creator (or absent/auto/empty) → run the check
 *   - profile=developer → skip (jargon permitted; ok=true with skipped marker)
 *   - profile=team     → skip (jargon permitted in operator-facing flow)
 *
 * Word-boundary matching: case-sensitive `\b{term}\b` semantics implemented
 * via non-word lookarounds so multi-word keys ("Gate D") match correctly and
 * substring hits ("MICRO" inside "MICROserviços") DO NOT trigger.
 *
 * EC-LUM-05: missing/empty runtime DB → ok=true count=0 (greenfield).
 * EC-LUM-08: missing/deleted jargon-map → ok=true count=0 with marker.
 * EC-LUM-10: 50+ leaks → samples truncated to MAX_SAMPLES.
 * EC-LUM-11: future enhancement — `payload_json.jargon_intentional=true` opt-out.
 */

const fs = require('node:fs/promises');
const path = require('node:path');

const MVP_AGENTS = ['neo', 'setup', 'product', 'dev', 'deyvin'];
const MAX_SAMPLES = 10;
const MAX_EVENTS_SCANNED = 500;
const JARGON_MAP_REL = '.aioson/skills/process/decision-presentation/references/jargon-map.en.yaml';

// Extract canonical term keys from the YAML's `terms:` block without pulling
// in a YAML parser. Schema is fixed by E2 (version: 1, terms: { KEY: {...} }).
// Keys are either bare identifiers (MICRO) or quoted ("Gate D").
function extractTermKeys(yamlContent) {
  if (typeof yamlContent !== 'string') return [];
  const inTermsMatch = yamlContent.match(/^terms:\s*\n([\s\S]*)$/m);
  if (!inTermsMatch) return [];
  const keys = [];
  const lines = inTermsMatch[1].split('\n');
  for (const line of lines) {
    // 2-space indent, then key (bare or quoted), then trailing colon.
    const m = line.match(/^  (?:"([^"]+)"|'([^']+)'|([A-Za-z_][^:\s]*)):\s*$/);
    if (m) keys.push(m[1] || m[2] || m[3]);
  }
  return keys;
}

async function loadJargonTerms(targetDir) {
  try {
    const raw = await fs.readFile(path.join(targetDir, JARGON_MAP_REL), 'utf8');
    return extractTermKeys(raw);
  } catch {
    return [];
  }
}

async function readProjectProfile(targetDir) {
  try {
    const raw = await fs.readFile(
      path.join(targetDir, '.aioson/context/project.context.md'),
      'utf8'
    );
    const m = raw.match(/^profile\s*:\s*["']?([\w-]+)["']?/m);
    return m ? m[1].toLowerCase() : null;
  } catch {
    return null;
  }
}

// Default-profile rule from the skill: absent/empty/auto → creator (safer).
// Legacy `beginner` already migrated by src/migrations/profile-rename, but
// accept it defensively in case migration didn't run.
function normalizeEffectiveProfile(raw) {
  if (!raw) return 'creator';
  const v = String(raw).toLowerCase();
  if (v === 'auto' || v === '') return 'creator';
  if (v === 'beginner') return 'creator';
  return v;
}

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Build one alternation regex with all terms. Non-word lookarounds enforce
// word-boundary semantics WITHOUT \b (which fails for terms containing
// spaces, like "Gate D"). Treat hyphen as a word char so terms like
// "harness-contract" do not split on the dash.
function buildJargonRegex(terms) {
  if (!terms || terms.length === 0) return null;
  // Sort longest-first so "Gate D" wins over a hypothetical "Gate" key.
  const sorted = [...terms].sort((a, b) => b.length - a.length);
  const alt = sorted.map(escapeRegex).join('|');
  return new RegExp(`(?<![\\w-])(${alt})(?![\\w-])`, 'g');
}

// Find all term occurrences in a string. Returns the matched substrings.
function findLeaks(text, regex) {
  if (!text || !regex) return [];
  const out = [];
  regex.lastIndex = 0;
  let m;
  while ((m = regex.exec(text)) !== null) {
    out.push(m[1]);
  }
  return out;
}

// Pure: detect leaks across a list of event records. Truncates samples to
// MAX_SAMPLES; `count` reflects the total occurrence count across all events.
function detectJargonInEvents(events, terms) {
  const regex = buildJargonRegex(terms);
  const samples = [];
  let count = 0;
  if (!regex || !Array.isArray(events)) return { count, samples };

  for (const ev of events) {
    if (!ev) continue;
    const message = typeof ev.message === 'string' ? ev.message : '';
    const payload = typeof ev.payload_json === 'string' ? ev.payload_json : '';

    // EC-LUM-11 opt-out: explicit `jargon_intentional: true` skips this event.
    if (payload) {
      try {
        const parsed = JSON.parse(payload);
        if (parsed && parsed.jargon_intentional === true) continue;
      } catch {
        // not JSON — ignore opt-out, treat payload as opaque text below
      }
    }

    const hits = [...findLeaks(message, regex), ...findLeaks(payload, regex)];
    if (hits.length === 0) continue;

    count += hits.length;
    if (samples.length < MAX_SAMPLES) {
      samples.push({
        agent: ev.agent_name || null,
        created_at: ev.created_at || null,
        terms: Array.from(new Set(hits)).slice(0, 3),
        excerpt: message.slice(0, 120)
      });
    }
  }
  return { count, samples };
}

/**
 * Top-level assessment consumed by doctor.js.
 *
 * @param {object} opts
 * @param {object|null} opts.db                better-sqlite3 handle (or null)
 * @param {string}      opts.targetDir         project root
 * @param {string[]}    [opts.scope]           agent_name whitelist (defaults to MVP_AGENTS)
 * @param {number}      [opts.eventLimit]      cap on agent_events scanned
 *
 * @returns {Promise<{
 *   ok: boolean,
 *   count: number,
 *   samples: Array<{agent,created_at,terms,excerpt}>,
 *   profile: string,
 *   skipped?: boolean,
 *   reason?: string,
 *   eventsScanned?: number,
 *   jargonMapMissing?: boolean
 * }>}
 */
async function assessJargonLeak(opts) {
  const {
    db,
    targetDir,
    scope = MVP_AGENTS,
    eventLimit = MAX_EVENTS_SCANNED
  } = opts || {};

  const rawProfile = await readProjectProfile(targetDir);
  const profile = normalizeEffectiveProfile(rawProfile);

  // AC-LUM-08: developer/team skip — jargon permitted in those modes.
  if (profile === 'developer' || profile === 'team') {
    return {
      ok: true,
      skipped: true,
      reason: 'profile-permits-jargon',
      profile,
      count: 0,
      samples: []
    };
  }

  // EC-LUM-05: no runtime DB → fresh project, nothing to scan.
  if (!db) {
    return { ok: true, count: 0, samples: [], profile, eventsScanned: 0 };
  }

  const terms = await loadJargonTerms(targetDir);
  if (terms.length === 0) {
    // EC-LUM-08: jargon-map missing — fail open (cannot detect without dict).
    return {
      ok: true,
      count: 0,
      samples: [],
      profile,
      jargonMapMissing: true,
      eventsScanned: 0
    };
  }

  let events;
  try {
    const placeholders = scope.map(() => '?').join(',');
    events = db
      .prepare(
        `SELECT ae.message AS message,
                ae.payload_json AS payload_json,
                ar.agent_name AS agent_name,
                ae.created_at AS created_at
         FROM agent_events ae
         JOIN agent_runs ar ON ae.run_key = ar.run_key
         WHERE ar.agent_name IN (${placeholders})
         ORDER BY ae.created_at DESC
         LIMIT ?`
      )
      .all(...scope, eventLimit);
  } catch {
    // Schema drift / missing tables on a stale runtime DB. Treat as greenfield.
    return { ok: true, count: 0, samples: [], profile, eventsScanned: 0 };
  }

  const { count, samples } = detectJargonInEvents(events, terms);
  return {
    ok: count === 0,
    count,
    samples,
    profile,
    eventsScanned: events.length
  };
}

module.exports = {
  MVP_AGENTS,
  MAX_SAMPLES,
  MAX_EVENTS_SCANNED,
  JARGON_MAP_REL,
  extractTermKeys,
  loadJargonTerms,
  readProjectProfile,
  normalizeEffectiveProfile,
  escapeRegex,
  buildJargonRegex,
  findLeaks,
  detectJargonInEvents,
  assessJargonLeak
};
