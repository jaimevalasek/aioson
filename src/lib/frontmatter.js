'use strict';

// Frontmatter of every AIOSON Markdown artifact — rules, docs, skills, PRDs,
// plans, learnings. A deliberately small YAML subset, but a faithful one:
// whatever shape the docs teach (inline or block lists, trailing comments,
// quoted items) must read the same, because a list that parses differently
// silently changes which agents receive a rule.

// A YAML comment opens at `#` that starts the value or follows whitespace —
// never inside a quoted scalar or a quoted flow item. Without this, the
// comments in the documented rule example stayed inside the values:
// `agents: [planner, dev]  # only these` read as `["[planner", "dev] # only
// these"]` and silently excluded the rule from BOTH agents.
function stripYamlComment(value) {
  let quote = null;
  let atItemStart = true;
  for (let i = 0; i < value.length; i += 1) {
    const ch = value[i];
    if (quote) {
      if (ch !== quote) continue;
      if (quote === "'" && value[i + 1] === "'") { i += 1; continue; }
      if (quote === '"' && value[i - 1] === '\\') continue;
      quote = null;
      continue;
    }
    if ((ch === '"' || ch === "'") && atItemStart) { quote = ch; atItemStart = false; continue; }
    if (ch === '#' && (i === 0 || /\s/.test(value[i - 1]))) return value.slice(0, i).trimEnd();
    if (ch === '[' || ch === ',') { atItemStart = true; continue; }
    if (!/\s/.test(ch)) atItemStart = false;
  }
  return value;
}

function unquoteScalar(text) {
  const value = String(text).trim();
  const first = value[0];
  if (value.length >= 2 && (first === '"' || first === "'") && value[value.length - 1] === first) {
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
  let current = '';
  let quote = null;
  for (let i = 0; i < body.length; i += 1) {
    const ch = body[i];
    if (quote) {
      current += ch;
      if (ch !== quote) continue;
      if (quote === "'" && body[i + 1] === "'") { current += "'"; i += 1; continue; }
      if (quote === '"' && body[i - 1] === '\\') continue;
      quote = null;
      continue;
    }
    if ((ch === '"' || ch === "'") && current.trim() === '') { quote = ch; current += ch; continue; }
    if (ch === ',') { items.push(current); current = ''; continue; }
    current += ch;
  }
  items.push(current);
  return items.map((item) => unquoteScalar(item)).filter(Boolean);
}

/** List-valued frontmatter (`[a, b]`, `a, b`, or a block list) as an array of strings. */
function parseFlowList(value) {
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
  const flow = items.map((item) => {
    if (/^["']/.test(item) || !/[,[\]]/.test(item)) return item;
    return `"${item.replace(/"/g, '\\"')}"`;
  });
  return { value: `[${flow.join(', ')}]`, last };
}

function parseFrontmatter(content) {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return {};
  const result = {};
  const lines = match[1].split(/\r?\n/);
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (line.trim().startsWith('#')) continue;
    const colonIdx = line.indexOf(':');
    if (colonIdx === -1) continue;
    const key = line.slice(0, colonIdx).trim();
    let value = stripYamlComment(line.slice(colonIdx + 1).trim());
    if (value === '') {
      const sequence = readBlockSequence(lines, i + 1);
      if (sequence) {
        if (key) result[key] = sequence.value;
        i = sequence.last;
        continue;
      }
    }
    // YAML block scalars (`description: >-` / `|`): the value is the indented
    // block that follows — folded (`>`) joins the lines with a space, literal
    // (`|`) keeps the line breaks. Without this the indicator itself (`>-`)
    // was the value and every continuation line holding a colon became a
    // bogus key — the shipped design engine's description was unreadable to
    // the selector and printed as `>-` by skill:list.
    const block = /^([>|])[+-]?$/.exec(value);
    if (block) {
      const parts = [];
      while (i + 1 < lines.length && (/^\s/.test(lines[i + 1]) || lines[i + 1].trim() === '')) {
        i += 1;
        parts.push(lines[i].trim());
      }
      while (parts.length > 0 && parts[parts.length - 1] === '') parts.pop();
      value = block[1] === '>'
        ? parts.join(' ').replace(/\s+/g, ' ').trim()
        : parts.join('\n').trim();
    } else if (!value.startsWith('[')) {
      value = unquoteScalar(value);
    }
    if (key) result[key] = value;
  }
  return result;
}

module.exports = {
  parseFrontmatter,
  parseFlowList,
  stripYamlComment
};
