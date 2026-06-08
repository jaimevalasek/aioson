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

function hashText(text) {
  return crypto.createHash('sha256').update(String(text || ''), 'utf8').digest('hex');
}

function parseBriefingSections(markdown, sourcePath = 'briefings.md') {
  const content = String(markdown || '');
  const matches = [...content.matchAll(/^##\s+(.+?)\s*$/gm)];
  const sections = [];

  for (let index = 0; index < matches.length; index += 1) {
    const match = matches[index];
    const title = match[1].trim();
    const bodyStart = match.index + match[0].length;
    const bodyEnd = index + 1 < matches.length ? matches[index + 1].index : content.length;
    const originalText = content.slice(bodyStart, bodyEnd).replace(/^\r?\n/, '').replace(/\s+$/, '');
    sections.push({
      id: sectionId(title),
      title,
      source_path: sourcePath,
      original_text: originalText,
      original_hash: hashText(originalText),
      current_text: originalText,
      status: 'unchanged',
      comments_count: 0
    });
  }

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

function serializeBriefingSections(originalMarkdown, sections) {
  assertMandatorySections(sections);
  const byTitle = new Map(sections.map((section) => [section.title, section]));
  const content = String(originalMarkdown || '');
  const matches = [...content.matchAll(/^##\s+(.+?)\s*$/gm)];
  if (matches.length === 0) {
    throw new Error('Cannot serialize briefing without Markdown sections');
  }

  // Reject duplicate headers: an injected `## ` line in a section body would
  // otherwise collapse onto the same title in byTitle, silently relocating or
  // dropping content during the round-trip. Fail closed before mutating.
  const titles = matches.map((match) => match[1].trim());
  const duplicates = [...new Set(titles.filter((title, index) => titles.indexOf(title) !== index))];
  if (duplicates.length > 0) {
    const error = new Error(`Duplicate briefing sections: ${duplicates.join(', ')}`);
    error.code = 'duplicate_sections';
    throw error;
  }

  let output = '';
  let cursor = 0;
  for (let index = 0; index < matches.length; index += 1) {
    const match = matches[index];
    const title = match[1].trim();
    const bodyStart = match.index + match[0].length;
    const bodyEnd = index + 1 < matches.length ? matches[index + 1].index : content.length;
    output += content.slice(cursor, bodyStart);
    const replacement = byTitle.get(title);
    const nextText = replacement ? replacement.current_text || '' : content.slice(bodyStart, bodyEnd).replace(/^\r?\n/, '');
    output += `\n${nextText.trimEnd()}\n\n`;
    cursor = bodyEnd;
  }

  output += content.slice(cursor);
  return output.replace(/\n{3,}/g, '\n\n').trimEnd() + '\n';
}

module.exports = {
  MANDATORY_SECTIONS,
  assertMandatorySections,
  hashText,
  parseBriefingSections,
  sectionId,
  serializeBriefingSections
};
