'use strict';

const crypto = require('node:crypto');

const MANDATORY_SECTIONS = [
  'Context',
  'Problem',
  'Proposed solution',
  'Themes',
  'Risks',
  'Identified gaps',
  'Sources',
  'Open questions'
];

function sectionId(title) {
  return String(title || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

// The review page and the findings key sections by id. Headings that normalize alike, or
// a title with no Latin letter, must not share one, or an edit lands on the wrong section.
function uniqueSectionId(title, used) {
  const base = sectionId(title) || 'section';
  let id = base;
  for (let suffix = 2; used.has(id); suffix += 1) id = `${base}-${suffix}`;
  used.add(id);
  return id;
}

function hashText(text) {
  return crypto.createHash('sha256').update(String(text || ''), 'utf8').digest('hex');
}

function headingSpans(content, matches) {
  return matches.map((match, index) => ({
    title: match[1].trim(),
    bodyStart: match.index + match[0].length,
    bodyEnd: index + 1 < matches.length ? matches[index + 1].index : content.length
  }));
}

function parseBriefingSections(markdown, sourcePath = 'briefings.md') {
  const content = String(markdown || '');
  const matches = [...content.matchAll(/^##\s+(.+?)\s*$/gm)];
  const usedIds = new Set();
  const sections = headingSpans(content, matches).map(({ title, bodyStart, bodyEnd }) => {
    const originalText = content.slice(bodyStart, bodyEnd).replace(/^\r?\n/, '').replace(/\s+$/, '');
    return {
      id: uniqueSectionId(title, usedIds),
      title,
      source_path: sourcePath,
      original_text: originalText,
      original_hash: hashText(originalText),
      current_text: originalText,
      status: 'unchanged',
      comments_count: 0
    };
  });

  const missing = MANDATORY_SECTIONS.filter((title) => !sections.some((section) => section.title === title));
  return { sections, missing, source_hash: hashText(content) };
}

function assertMandatorySections(sections) {
  const missing = MANDATORY_SECTIONS.filter((title) => !sections.some((section) => section.title === title));
  if (missing.length > 0) {
    const error = new Error(`Missing mandatory briefing sections: ${missing.join(', ')}`);
    error.code = 'missing_sections';
    error.missing = missing;
    throw error;
  }
}

// Reject duplicate headers: an injected `## ` line in a section body would
// otherwise collapse onto the same title in byTitle, silently relocating or
// dropping content during the round-trip. Fail closed before mutating.
function headingMatches(content) {
  const matches = [...content.matchAll(/^##\s+(.+?)\s*$/gm)];
  const titles = matches.map((match) => match[1].trim());
  const duplicates = [...new Set(titles.filter((title, index) => titles.indexOf(title) !== index))];
  if (duplicates.length > 0) {
    const error = new Error(`Duplicate briefing sections: ${duplicates.join(', ')}`);
    error.code = 'duplicate_sections';
    throw error;
  }
  return matches;
}

function serializeBriefingSections(originalMarkdown, sections) {
  assertMandatorySections(sections);
  const byTitle = new Map(sections.map((section) => [section.title, section]));
  const content = String(originalMarkdown || '');
  const matches = headingMatches(content);
  if (matches.length === 0) {
    throw new Error('Cannot serialize briefing without Markdown sections');
  }

  let output = '';
  let cursor = 0;
  for (const { title, bodyStart, bodyEnd } of headingSpans(content, matches)) {
    output += content.slice(cursor, bodyStart);
    const replacement = byTitle.get(title);
    const nextText = replacement ? replacement.current_text || '' : content.slice(bodyStart, bodyEnd).replace(/^\r?\n/, '');
    output += `\n${nextText.trimEnd()}\n\n`;
    cursor = bodyEnd;
  }

  output += content.slice(cursor);
  const written = output.replace(/\n{3,}/g, '\n\n').trimEnd() + '\n';
  // New text is held to the same rule, or the next round could not read this file.
  headingMatches(written);
  return written;
}

module.exports = {
  MANDATORY_SECTIONS,
  assertMandatorySections,
  hashText,
  parseBriefingSections,
  sectionId,
  serializeBriefingSections
};
