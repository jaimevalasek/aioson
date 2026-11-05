'use strict';

/**
 * Source masker shared by the AC test audit and the test-oracle lint: blanks
 * comments and string/template contents while preserving offsets and newlines,
 * so syntax can be read without string bodies posing as code. Rust gets its two
 * lexing exceptions (lifetimes, raw strings). Pure text, no dependencies — it
 * sits below both consumers on purpose.
 */

// Rust is the one supported language whose quotes need their own lexing: an
// apostrophe may be a lifetime rather than a literal, and a raw string carries
// its own delimiter. The masker relaxes those two rules for these files only,
// because in every other language a single quote does open a string and must
// keep being blanked.
function isRustSource(relPath) {
  return /\.rs$/i.test(String(relPath || ''));
}

// A Rust lifetime or loop label is an apostrophe followed by an identifier that
// no closing apostrophe terminates: `'static`, `'a`, `'_`, `'outer:`. A char
// literal always closes, so `'a'` and `b'a'` still read as literals, and an
// escape (`'\n'`, `'\''`) never starts an identifier.
function isRustLifetimeAt(chars, index) {
  if (!/[A-Za-z_]/.test(chars[index + 1] || '')) return false;
  let end = index + 1;
  while (end < chars.length && /[A-Za-z0-9_]/.test(chars[end])) end += 1;
  return chars[end] !== "'";
}

// A Rust raw string takes no escapes and may hold quotes of its own: `r"..."`,
// `r#"..."#`, `br##"..."##`. Reading one as an ordinary string closes it at the
// first inner quote and leaves the mask inverted for the rest of the file —
// hiding real assertions and, worse, exposing string bodies as if they were
// code. Returns the index of the closing delimiter, or null when `index` does
// not open a raw string. An unterminated one masks to the end, which is the
// conservative direction.
function rustRawStringAt(chars, index) {
  let hashes = 0;
  let prefix = index - 1;
  while (prefix >= 0 && chars[prefix] === '#') {
    hashes += 1;
    prefix -= 1;
  }
  if (chars[prefix] !== 'r') return null;
  if (chars[prefix - 1] === 'b' || chars[prefix - 1] === 'c') prefix -= 1;
  // The prefix must open the token, never end a longer identifier.
  if (prefix > 0 && /[A-Za-z0-9_]/.test(chars[prefix - 1] || '')) return null;

  for (let i = index + 1; i < chars.length; i += 1) {
    if (chars[i] !== '"') continue;
    let closed = true;
    for (let hash = 1; hash <= hashes; hash += 1) {
      if (chars[i + hash] !== '#') {
        closed = false;
        break;
      }
    }
    if (closed) return i + hashes;
  }
  return chars.length - 1;
}

// Blank comments and string/template contents while preserving offsets and
// newlines. AC ids may legitimately live in test titles/comments, so matching
// still uses the original source; only test/assertion syntax is read from this
// masked view. This is deliberately conservative: ambiguous text is never
// promoted to executable proof.
function maskNonCode(content, options = {}) {
  const text = String(content || '');
  // Rust needs two exceptions the other languages do not: a lifetime opens no
  // literal, and a raw string carries its own delimiter. Lexing either as an
  // ordinary quote desynchronises the mask for the rest of the file.
  const rust = options.rust ?? isRustSource(options.file);
  const chars = [...text];
  let state = 'code';
  let quote = null;
  let escaped = false;

  for (let i = 0; i < chars.length; i += 1) {
    const current = chars[i];
    const next = chars[i + 1];

    if (state === 'line-comment') {
      if (current === '\n' || current === '\r') state = 'code';
      else chars[i] = ' ';
      continue;
    }
    if (state === 'block-comment') {
      if (current === '*' && next === '/') {
        chars[i] = ' ';
        chars[i + 1] = ' ';
        i += 1;
        state = 'code';
      } else if (current !== '\n' && current !== '\r') {
        chars[i] = ' ';
      }
      continue;
    }
    if (state === 'string') {
      if (current !== '\n' && current !== '\r') chars[i] = ' ';
      if (escaped) {
        escaped = false;
      } else if (current === '\\') {
        escaped = true;
      } else if (current === quote) {
        state = 'code';
        quote = null;
      }
      continue;
    }

    if (current === '/' && next === '/') {
      chars[i] = ' ';
      chars[i + 1] = ' ';
      i += 1;
      state = 'line-comment';
    } else if (current === '/' && next === '*') {
      chars[i] = ' ';
      chars[i + 1] = ' ';
      i += 1;
      state = 'block-comment';
    } else if (current === '"' || current === "'" || current === '`') {
      if (rust && current === "'" && isRustLifetimeAt(chars, i)) continue;
      const rawEnd = rust && current === '"' ? rustRawStringAt(chars, i) : null;
      if (rawEnd !== null) {
        for (let j = i; j <= rawEnd; j += 1) {
          if (chars[j] !== '\n' && chars[j] !== '\r') chars[j] = ' ';
        }
        i = rawEnd;
        continue;
      }
      chars[i] = ' ';
      state = 'string';
      quote = current;
      escaped = false;
    }
  }
  return chars.join('');
}

module.exports = { maskNonCode, isRustSource };
