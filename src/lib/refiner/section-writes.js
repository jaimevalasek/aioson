'use strict';

/**
 * What applying a review writes, section by section, next to what the file holds. The
 * apply writes this and the clean-round rule judges this, so the two cannot differ.
 *
 * The review works on sanitized text, which drops anything shaped like a tag. A line
 * nobody changed keeps its bytes, or `Map<string, User>` would leave with no type.
 * Sections are found by title, the way the write finds them.
 */

const { parseBriefingSections } = require('./briefing-sections');
const { sanitizeText } = require('./feedback-schema');

// Lines that read alike go back in file order, so deleting the first of two keeps the
// wrong one. The clean-round rule asks in that case, because a line with markup is gone.
function restoreLines(text, fileText) {
  const originals = new Map();
  for (const line of fileText.split(/\r?\n/)) {
    const shown = sanitizeText(line).trimEnd();
    if (shown !== line && shown) originals.set(shown, [...(originals.get(shown) || []), line]);
  }
  return text.split('\n').map((line) => {
    const stock = originals.get(line.trimEnd());
    return stock && stock.length > 0 ? stock.shift() : line;
  }).join('\n');
}

function textToWrite(section, fileText) {
  if (section.status === 'remove_requested') return 'TBD';
  const text = sanitizeText(section.current_text || section.original_text || '').trimEnd();
  if (fileText === undefined) return text;
  return sanitizeText(fileText).trimEnd() === text ? fileText : restoreLines(text, fileText);
}

/**
 * Each section of the feedback with `current_text` as it would be written, `file_text`
 * and `file_id` as the file has them (undefined when no heading has that title, and the
 * write will drop it), and `requested_text` as the feedback asked.
 */
function planSectionWrites(markdown, feedback) {
  const fileSections = new Map(parseBriefingSections(markdown).sections.map((section) => [section.title, section]));
  return (feedback.sections || []).map((section) => {
    const inFile = fileSections.get(section.title) || {};
    return {
      ...section,
      requested_text: section.current_text,
      file_id: inFile.id,
      file_text: inFile.original_text,
      current_text: textToWrite(section, inFile.original_text)
    };
  });
}

module.exports = { planSectionWrites };
