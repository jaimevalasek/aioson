'use strict';

/**
 * Section focus — read the part of a large file the task names, not the file.
 *
 * Measured on a consumer runtime: a brief's must_load averaged ~24k chars, but
 * its should_load offered ~200k (bootstrap state at 30k chars in 41 of 51
 * briefs, a 46k-char PRD in 19). A path list gives the model one choice —
 * read all of it or none of it. This module turns a large markdown file into
 * line-ranged sections, scores them against the task's content terms, and
 * returns the few that match, so the brief can say "read lines 120-188".
 *
 * Deterministic and build-free: headings H2/H3 outside fenced code, folded
 * accents (pt-BR tasks match English-less docs and vice versa only by the
 * words they share — no translation, no model call).
 */

const LARGE_FILE_CHARS = 8000;
const MAX_FOCUS_SECTIONS = 3;
const MAX_OUTLINE_ENTRIES = 12;

function fold(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
}

/**
 * Flat H2/H3 sections with 1-based inclusive line ranges. Text before the
 * first heading is the `(preamble)` section (frontmatter + H1 + intro).
 */
function outlineMarkdown(content) {
  const lines = String(content || '').split(/\r?\n/);
  const sections = [];
  let current = { heading: '(preamble)', level: 1, start: 1, body: [] };
  let fence = null;
  lines.forEach((line, index) => {
    const fenceMatch = line.match(/^\s*(```+|~~~+)/);
    if (fenceMatch) {
      if (!fence) fence = fenceMatch[1][0];
      else if (fenceMatch[1][0] === fence) fence = null;
    }
    const heading = !fence && line.match(/^(#{2,3})\s+(.+?)\s*#*\s*$/);
    if (heading) {
      current.end = index;
      sections.push(current);
      current = { heading: heading[2].trim(), level: heading[1].length, start: index + 1, body: [] };
      return;
    }
    current.body.push(line);
  });
  current.end = lines.length;
  sections.push(current);
  return sections
    .filter((section) => section.end >= section.start)
    .map((section) => {
      const body = section.body.join('\n');
      return {
        heading: section.heading,
        level: section.level,
        start_line: section.start,
        end_line: section.end,
        chars: body.length + (section.heading === '(preamble)' ? 0 : section.heading.length + section.level + 1),
        text: body
      };
    })
    .filter((section) => section.heading !== '(preamble)' || section.text.trim().length > 0);
}

function scoreSection(section, terms) {
  const heading = fold(section.heading);
  const body = fold(section.text);
  let score = 0;
  const matched = [];
  for (const term of terms) {
    const inHeading = heading.includes(term);
    const inBody = body.includes(term);
    if (!inHeading && !inBody) continue;
    matched.push(term);
    score += inHeading ? 3 : 1;
  }
  return { score, matched };
}

/**
 * @param {string} content markdown file content
 * @param {string[]} terms task content terms (already folded, stop words out)
 * @returns {{ chars: number, lines: number, large: boolean,
 *   focus: Array<{heading: string, lines: string, chars: number, matched: string[]}>,
 *   focus_chars: number, outline: string[] }}
 */
function focusFile(content, terms, options = {}) {
  const text = String(content || '');
  const threshold = options.largeFileChars || LARGE_FILE_CHARS;
  const lineCount = text.length === 0 ? 0 : text.split(/\r?\n/).length;
  const base = { chars: text.length, lines: lineCount, large: text.length > threshold, focus: [], focus_chars: 0, outline: [] };
  if (!base.large) return base;

  const usable = [...new Set((terms || []).map(fold).filter((term) => term.length >= 4))];
  const sections = outlineMarkdown(text);
  const scored = sections
    .map((section) => ({ section, ...scoreSection(section, usable) }))
    .filter((entry) => entry.score > 0 && entry.section.heading !== '(preamble)')
    // Two distinct terms, or one in the heading: a single body mention of a
    // common word is not a reason to read a section.
    .filter((entry) => entry.matched.length >= 2 || fold(entry.section.heading).includes(entry.matched[0]))
    .sort((a, b) => (b.score - a.score) || (a.section.chars - b.section.chars))
    .slice(0, options.maxSections || MAX_FOCUS_SECTIONS)
    .sort((a, b) => a.section.start_line - b.section.start_line);

  base.focus = scored.map(({ section, matched }) => ({
    heading: section.heading,
    lines: `${section.start_line}-${section.end_line}`,
    chars: section.chars,
    matched: matched.slice(0, 5)
  }));
  base.focus_chars = base.focus.reduce((sum, entry) => sum + entry.chars, 0);
  if (base.focus.length === 0) {
    base.outline = sections
      .filter((section) => section.level === 2)
      .slice(0, MAX_OUTLINE_ENTRIES)
      .map((section) => `${section.start_line}: ${section.heading}`);
  }
  return base;
}

module.exports = { focusFile, outlineMarkdown, LARGE_FILE_CHARS };
