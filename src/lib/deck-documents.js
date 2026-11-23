'use strict';

// The documents the AIOSON Deck keeps in a project live in `docs/deck/` (deck-work-breadth,
// RULE-deck-work-breadth-05): team agreements, manuals and minutes the session's AI reads.
// They are the author's working notes, never part of what a store package delivers, so the
// package leaves every file there out and the report names each one with this reason.

const fs = require('node:fs/promises');
const path = require('node:path');

const DECK_DOCUMENTS_DIR = 'docs/deck';
const DECK_DOCUMENTS_REASON = 'Deck document (docs/deck/), kept out of the package';

/** True for `docs/deck` at the app's root and everything under it (any letter case). */
function isDeckDocumentsPath(relativePath) {
  const normalized = String(relativePath).replace(/\\/g, '/').toLowerCase();
  return normalized === DECK_DOCUMENTS_DIR || normalized.startsWith(`${DECK_DOCUMENTS_DIR}/`);
}

/** Every file under `fullPath` (links are listed, never followed), as `relativePath/...`. */
async function filesUnder(fullPath, relativePath) {
  const found = [];
  let entries;
  try {
    entries = await fs.readdir(fullPath, { withFileTypes: true });
  } catch {
    return [relativePath];
  }
  for (const entry of entries) {
    const childRelative = `${relativePath}/${entry.name}`;
    if (entry.isDirectory()) found.push(...(await filesUnder(path.join(fullPath, entry.name), childRelative)));
    else found.push(childRelative);
  }
  return found.length ? found : [relativePath];
}

/** Records each file of a `docs/deck` folder as excluded, one report line per file. */
async function excludeDeckDocuments(fullPath, relativePath, exclude) {
  for (const file of await filesUnder(fullPath, relativePath)) exclude(file, DECK_DOCUMENTS_REASON);
}

module.exports = { DECK_DOCUMENTS_DIR, DECK_DOCUMENTS_REASON, isDeckDocumentsPath, excludeDeckDocuments };
