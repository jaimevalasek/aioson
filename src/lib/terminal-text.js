'use strict';

/**
 * Text from another project's files, made safe to print on a terminal.
 *
 * Project names and context values come from files anyone can write — a
 * cloned repository's `project.context.md` included. Printed as they are, an
 * ESC sequence in a `project_name` clears the screen or rewrites what the
 * line above said. A human line drops escape sequences, the remaining control
 * characters (C0, DEL, C1) and the invisible format characters
 * (llm-content-sanitizer.js); JSON keeps the original value.
 */

const { stripInjectionChars } = require('./llm-content-sanitizer');

const ESC = String.fromCharCode(0x1b);
const BEL = String.fromCharCode(0x07);
// CSI (ESC [ … final), OSC (ESC ] … BEL or ESC \), and two-byte ESC sequences.
const ESCAPE_SEQUENCE = new RegExp(`${ESC}\\[[0-?]*[ -/]*[@-~]|${ESC}\\][^${BEL}${ESC}]*(?:${BEL}|${ESC}\\\\)?|${ESC}[@-_]`, 'g');
// C0, DEL and C1, as code points: a character class written with them.
const CONTROL = new RegExp(`[${String.fromCharCode(0x00)}-${String.fromCharCode(0x1f)}${String.fromCharCode(0x7f)}-${String.fromCharCode(0x9f)}]`, 'g');

/** `value` as one printable line: escape sequences and control characters removed. */
function printable(value) {
  return stripInjectionChars(String(value == null ? '' : value)).replace(ESCAPE_SEQUENCE, '').replace(CONTROL, '');
}

module.exports = { printable };
