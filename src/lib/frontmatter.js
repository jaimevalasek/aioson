'use strict';

// Frontmatter of every AIOSON Markdown artifact — rules, docs, skills, PRDs,
// plans, learnings. A deliberately small YAML subset, but a faithful one:
// whatever shape the docs teach (inline or block lists, trailing comments,
// quoted items) must read the same, because a list that parses differently
// silently changes which agents receive a rule.
//
// Public names are this module's own (`parseFrontmatterText`,
// `parseFrontmatterList`); preflight-engine keeps `parseFrontmatter` as the
// engine API the commands have always imported.

function isQuote(ch) {
  return ch === '"' || ch === "'";
}

// One step inside a quoted run starting at `i`: where the scan resumes and
// whether the quote is still open. `''` escapes a single quote, `\"` a double.
function stepInQuote(text, i, quote) {
  if (text[i] !== quote) return { i, quote };
  if (quote === "'" && text[i + 1] === "'") return { i: i + 1, quote };
  if (quote === '"' && text[i - 1] === '\\') return { i, quote };
  return { i, quote: null };
}

// Index of the `#` that opens a YAML comment — at the start of the value or
// after whitespace, never inside a quoted scalar or quoted flow item — or -1.
function commentStart(value) {
  let quote = null;
  let atItemStart = true;
  for (let i = 0; i < value.length; i += 1) {
    if (quote) {
      ({ i, quote } = stepInQuote(value, i, quote));
      continue;
    }
    const ch = value[i];
    if (isQuote(ch) && atItemStart) {
      quote = ch;
      atItemStart = false;
      continue;
    }
    if (ch === '#' && (i === 0 || /\s/.test(value[i - 1]))) return i;
    atItemStart = ch === '[' || ch === ',' || (atItemStart && /\s/.test(ch));
  }
  return -1;
}

// Without this, the comments in the documented rule example stayed inside the
// values: `agents: [planner, dev]  # only these` read as `["[planner", "dev] #
// only these"]` and silently excluded the rule from BOTH agents.
function stripYamlComment(value) {
  const at = commentStart(value);
  return at < 0 ? value : value.slice(0, at).trimEnd();
}

function unquoteScalar(text) {
  const value = String(text).trim();
  const first = value[0];
  if (value.length >= 2 && isQuote(first) && value[value.length - 1] === first) {
    const inner = value.slice(1, -1);
    return first === "'" ? inner.replace(/''/g, "'") : inner.replace(/\\"/g, '"');
  }
  return value.replace(/^["']|["']$/g, '');
}

// Split a flow-list body (`a, "b, c", 'd'`) on the commas that separate
// items — a comma inside a quoted item is part of that item, so a trigger
// phrase such as "criar pastas, subpastas" stays one phrase.
function splitFlowItems(body) {
  const items = [];
  let start = 0;
  let quote = null;
  for (let i = 0; i < body.length; i += 1) {
    if (quote) {
      ({ i, quote } = stepInQuote(body, i, quote));
      continue;
    }
    if (isQuote(body[i]) && body.slice(start, i).trim() === '') quote = body[i];
    else if (body[i] === ',') {
      items.push(body.slice(start, i));
      start = i + 1;
    }
  }
  items.push(body.slice(start));
  return items.map((item) => unquoteScalar(item)).filter(Boolean);
}

/** List-valued frontmatter (`[a, b]`, `a, b`, or a block list) as an array of strings. */
function parseFrontmatterList(value) {
  if (Array.isArray(value)) return value.map((item) => String(item).trim()).filter(Boolean);
  if (value === undefined || value === null) return [];
  const raw = String(value).trim();
  if (!raw || raw === '[]') return [];
  return splitFlowItems(raw.startsWith('[') && raw.endsWith(']') ? raw.slice(1, -1) : raw);
}

const BLOCK_SEQUENCE_ITEM = /^\s*-(?:\s+(.*))?$/;

// A block sequence item is a list entry only when it is a plain or quoted
// scalar; `- key: value` (a mapping) or a nested collection keeps the legacy
// flat reading instead of being guessed at.
function blockSequenceScalar(line) {
  const match = BLOCK_SEQUENCE_ITEM.exec(line);
  if (!match) return null;
  const item = stripYamlComment((match[1] || '').trim());
  if (!item) return null;
  if (/^["']/.test(item)) return item;
  if (/^[[{]/.test(item) || /:(?:\s|$)/.test(item)) return null;
  return item;
}

// `key:` followed by `- item` lines is the same list as `key: [item, ...]`.
// The parser used to drop the items and leave the key empty — and an empty
// `agents:` means "every agent", so a rule written for one agent reached all.
function readBlockSequence(lines, start) {
  const items = [];
  let last = start - 1;
  for (let j = start; j < lines.length; j += 1) {
    const trimmed = lines[j].trim();
    if (trimmed === '' || trimmed.startsWith('#')) continue;
    if (!BLOCK_SEQUENCE_ITEM.test(lines[j])) break;
    const item = blockSequenceScalar(lines[j]);
    if (item === null) return null;
    items.push(item);
    last = j;
  }
  if (items.length === 0) return null;
  const flow = items.map((item) => (/^["']/.test(item) || !/[,[\]]/.test(item) ? item : `"${item.replace(/"/g, '\\"')}"`));
  return { value: `[${flow.join(', ')}]`, last };
}

// YAML block scalars (`description: >-` / `|`): the value is the indented
// block that follows — folded (`>`) joins the lines with a space, literal
// (`|`) keeps the line breaks. Without this the indicator itself (`>-`) was
// the value and every continuation line holding a colon became a bogus key —
// the shipped design engine's description was unreadable to the selector and
// printed as `>-` by skill:list.
function readBlockScalar(lines, start, style) {
  const parts = [];
  let last = start;
  while (last + 1 < lines.length && (/^\s/.test(lines[last + 1]) || lines[last + 1].trim() === '')) {
    last += 1;
    parts.push(lines[last].trim());
  }
  while (parts.length > 0 && parts[parts.length - 1] === '') parts.pop();
  const value = style === '>' ? parts.join(' ').replace(/\s+/g, ' ').trim() : parts.join('\n').trim();
  return { value, last };
}

// One `key: value` entry starting at line `i`, or null for a line that is not
// one (a comment, a stray line). `last` is the final line the entry consumed.
function readEntry(lines, i) {
  const line = lines[i];
  const colonIdx = line.indexOf(':');
  if (line.trim().startsWith('#') || colonIdx === -1) return null;
  const key = line.slice(0, colonIdx).trim();
  const value = stripYamlComment(line.slice(colonIdx + 1).trim());
  const sequence = value === '' ? readBlockSequence(lines, i + 1) : null;
  if (sequence) return { key, ...sequence };
  const block = /^([>|])[+-]?$/.exec(value);
  if (block) return { key, ...readBlockScalar(lines, i, block[1]) };
  return { key, value: value.startsWith('[') ? value : unquoteScalar(value), last: i };
}

function parseFrontmatterText(content) {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return {};
  const result = {};
  const lines = match[1].split(/\r?\n/);
  for (let i = 0; i < lines.length; i += 1) {
    const entry = readEntry(lines, i);
    if (!entry) continue;
    if (entry.key) result[entry.key] = entry.value;
    i = entry.last;
  }
  return result;
}

module.exports = {
  parseFrontmatterText,
  parseFrontmatterList
};
