'use strict';

// One document, one lens per agent. A rule or doc shared by several agents may
// address sections to some of them:
//
//   ## Planning  <!-- agents: planner -->
//   ## Implementation  <!-- agents: dev -->
//
// An agent reads the preamble, every section addressed to nobody, and the
// sections addressed to it; sections addressed only to other agents are
// skipped. H3 sections inherit their H2's addressing unless they carry their
// own marker. A document without markers is read whole, as before — the lens
// only ever removes what was explicitly written for someone else.

const { outlineMarkdown } = require('./section-focus');
const { canonicalAgentId } = require('../agents');

const MARKER = /<!--\s*agents\s*:\s*([^>]*?)\s*-->/i;

function audienceOf(section) {
  const fromHeading = MARKER.exec(section.heading);
  const firstLine = String(section.text || '').split('\n').find((line) => line.trim() !== '') || '';
  const fromBody = MARKER.exec(firstLine);
  const marker = fromHeading || fromBody;
  if (!marker) return null;
  return marker[1].split(',').map((agent) => canonicalAgentId(agent.replace(/^@/, ''))).filter(Boolean);
}

function mergeRanges(sections) {
  const ranges = [];
  for (const section of sections) {
    const last = ranges[ranges.length - 1];
    if (last && section.start_line <= last.end + 1) {
      last.end = Math.max(last.end, section.end_line);
      continue;
    }
    ranges.push({ start: section.start_line, end: section.end_line, heading: section.heading.replace(MARKER, '').trim() });
  }
  return ranges.map((range) => ({ lines: `${range.start}-${range.end}`, heading: range.heading }));
}

/**
 * @returns {null | { chars: number, lines: number, focus: Array<{lines: string, heading: string}>,
 *   focus_chars: number, skipped: string[] }} null when the document addresses nobody
 */
function lensOf(content, agent) {
  const text = String(content || '');
  const sections = outlineMarkdown(text);
  let inherited = null;
  let addressed = false;
  const resolved = sections.map((section) => {
    const own = audienceOf(section);
    if (section.level === 2 || section.heading === '(preamble)') inherited = own;
    const audience = own || (section.level === 3 ? inherited : null);
    if (audience) addressed = true;
    return { section, audience };
  });
  if (!addressed) return null;

  const wanted = canonicalAgentId(agent);
  const kept = resolved.filter(({ audience }) => !audience || audience.includes(wanted) || audience.includes('all'));
  const skipped = resolved.filter((entry) => !kept.includes(entry)).map(({ section }) => section.heading.replace(MARKER, '').trim());
  if (skipped.length === 0) return null;
  return {
    chars: text.length,
    lines: text.length === 0 ? 0 : text.split(/\r?\n/).length,
    focus: mergeRanges(kept.map(({ section }) => section)),
    focus_chars: kept.reduce((sum, { section }) => sum + section.chars, 0),
    skipped
  };
}

/** Narrow every brief item whose document addresses sections to other agents. */
function applyLenses(items, documents, agent) {
  return items.map((item) => {
    const content = documents.get(item.path);
    if (content === undefined) return item;
    const lens = lensOf(content, agent);
    if (!lens) return item;
    return { ...item, chars: lens.chars, lines: lens.lines, read: 'lens', focus: lens.focus, skipped_sections: lens.skipped };
  });
}

module.exports = { applyLenses, lensOf };
