'use strict';

// squad:playbook — the squad generator's "what-works" delta memory (ACE-style,
// append-only). Closes the feedback loop the runtime maps as missing: eval-gate
// failures become reusable generation lessons, loaded back into design/create so
// future squads don't repeat the same mistake.
//
//   capture --rule="<generation rule>" --lesson="<what works instead>" [--from=<slug>/<claim>]
//   list [--json]
//
// File-backed (no SQLite schema change): .aioson/squads/.playbook/generation-playbook.json

const fs = require('node:fs/promises');
const path = require('node:path');

function playbookPath(projectDir) {
  return path.join(projectDir, '.aioson', 'squads', '.playbook', 'generation-playbook.json');
}

async function loadPlaybook(file) {
  try {
    const data = JSON.parse(await fs.readFile(file, 'utf8'));
    return Array.isArray(data.entries) ? data : { entries: [] };
  } catch {
    return { entries: [] };
  }
}

async function savePlaybook(file, data) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(data, null, 2) + '\n', 'utf8');
}

function norm(s) {
  return String(s || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

// Playbook entries are agent-loaded later, so neutralize injection framing on capture:
// collapse to one bounded line (no fake multi-line <system> blocks) and strip role/control
// tags. SF-squad-self-improving-02 (persistent indirect prompt injection).
function sanitizeText(s, max = 280) {
  return String(s || '')
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/<\|[^|]*\|>/g, ' ')                          // <|im_start|> / <|im_end|>
    .replace(/<\/?(system|assistant|user|tool)\b[^>]*>/gi, ' ') // fake role tags
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

async function runSquadPlaybook({ args = [], options = {}, logger = console } = {}) {
  const sub = args[0] || 'list';
  const projectDir = path.resolve(process.cwd(), options.dir || options.path || '.');
  const file = playbookPath(projectDir);

  if (sub === 'capture') {
    const rule = sanitizeText(options.rule);
    const lesson = sanitizeText(options.lesson);
    if (!rule || !lesson) {
      logger.error('Usage: aioson squad:playbook capture --rule="<generation rule>" --lesson="<what works>" [--from=<slug>/<claim>]');
      return { ok: false, error: 'missing_fields' };
    }
    const data = await loadPlaybook(file);
    const key = `${norm(rule)} => ${norm(lesson)}`;
    let entry = data.entries.find((e) => e._key === key);
    if (entry) {
      entry.count += 1;
      if (options.from) entry.from = options.from;
    } else {
      entry = { _key: key, rule, lesson, from: options.from || null, count: 1, status: 'active' };
      data.entries.push(entry);
    }
    await savePlaybook(file, data);
    if (options.json) return { ok: true, captured: entry, total: data.entries.length };
    logger.log(`Playbook ${entry.count > 1 ? 'reinforced' : 'captured'} (x${entry.count}): ${rule} -> ${lesson}`);
    return { ok: true, captured: entry, total: data.entries.length };
  }

  if (sub === 'list') {
    const data = await loadPlaybook(file);
    const active = data.entries
      .filter((e) => (e.status || 'active') === 'active')
      .sort((a, b) => b.count - a.count || String(a.rule).localeCompare(String(b.rule)));
    if (options.json) return { ok: true, entries: active };
    if (active.length === 0) {
      logger.log('Generation playbook is empty.');
      return { ok: true, entries: [] };
    }
    logger.log('== Generation Playbook (apply before writing executors) ==');
    for (const e of active) {
      logger.log(`  (x${e.count}) ${e.rule} -> ${e.lesson}${e.from ? `  [${e.from}]` : ''}`);
    }
    return { ok: true, entries: active };
  }

  logger.error(`Unknown subcommand "${sub}". Use: capture | list`);
  return { ok: false, error: 'unknown_subcommand' };
}

module.exports = { runSquadPlaybook };
