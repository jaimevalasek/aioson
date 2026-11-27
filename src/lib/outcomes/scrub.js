'use strict';

/**
 * The person's own words about aioson — what was good, what was bad — leave
 * this module with nothing that names or locates the project they came from.
 *
 * A comment is the only free text the outcome record carries; everything else
 * is numbers and enumerations (schema.js). What is stored locally is what
 * could ever be shared, so the scrub runs when the comment is SAVED, not only
 * when it would be sent: the person reads, in the record and in any preview,
 * exactly the text that exists.
 *
 * Removed, each replaced by one marker so the sentence still reads:
 *   - secrets (the telemetry redaction the runtime store already trusts, a
 *     bearer value, long letter+digit tokens);
 *   - URLs (with or without a scheme), git remotes, e-mail addresses,
 *     IPv4/IPv6 addresses, localhost;
 *   - file-system paths (Windows, UNC, POSIX — folder names with spaces too)
 *     and file names with a known extension;
 *   - the project's own names (project_name, folder name, feature slug) in
 *     any script, matched accent- and case-insensitively, with plurals and
 *     with words run together or split by space, dot, hyphen or underscore;
 *   - long digit runs (phone, document and card numbers — dates stay);
 *   - control characters.
 * Then whitespace collapses and the text is cut at TEXT_MAX characters.
 *
 * Deterministic and build-free. It cannot know every private noun a person
 * may type — the feedback screen says so and shows the scrubbed text back —
 * but every shape a machine can recognize as locating the project is gone.
 * When in doubt it removes: a lost word costs less than a leaked one.
 */

const { redactTelemetryText } = require('../telemetry-redaction');

const TEXT_MAX = 500;
const MARK = '[removido]';

const TLDS = 'com|net|org|io|dev|app|ai|co|br|us|uk|de|fr|es|pt|it|nl|ca|au|mx|ar|cl|info|biz|me|tech|cloud|site|online|store|shop|xyz|gov|edu|mil|int|local|internal|lan|test|tv|cc|ly|sh|gg|page|digital|agency|studio|solutions|services';
const URL_RE = /\b(?:https?|ftp|file|wss?|ssh|git):\/\/[^\s<>"']+|\bwww\.[^\s<>"']+/gi;
const SCP_RE = /\b[\w.-]+@[\w.-]+:[\w./~-]+/g;
const EMAIL_RE = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g;
const DOMAIN_RE = new RegExp(`\\b(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\\.)+(?:${TLDS})\\b(?::\\d{2,5})?(?:\\/[^\\s"'<>]*)?`, 'gi');
const LOCALHOST_RE = /\blocalhost(?::\d{2,5})?(?:\/[^\s"'<>]*)?/gi;
const IPV4_RE = /\b(?:\d{1,3}\.){3}\d{1,3}(?::\d{2,5})?\b/g;
// fe80::1ff:fe23:4567:890a, ::1 — a time (12:30:45) has neither `::` nor a hex letter and stays.
const IPV6_RE = /(?<![\w.:])(?:[0-9a-f]{0,4}:){2,7}[0-9a-f]{0,4}(?:%\w+)?(?![\w:])/gi;
// A folder may hold spaces ("Ana Lima\"): a segment with up to three inner
// spaces is part of the path only when a separator follows it.
const WIN_PATH_RE = /(?:\b[A-Za-z]:[\\/]|\\\\)(?:[^\\/\s"'<>|]+(?: [^\\/\s"'<>|]+){0,3}[\\/])*[^\s"'<>|\\/]*/g;
const POSIX_PATH_RE = /(^|[\s("'`])((?:~|\.{1,2})?\/(?:[^\s/"'`<>]+(?: [^\s/"'`<>]+){0,3}\/)+[^\s"'`<>/]*)/g;
const RELATIVE_PATH_RE = /\b[\w.-]+(?:[\\/][\w.-]+){2,}\b/g;
// login.php, UserController.ts, contrato.docx — a name with a known code,
// config, office or media extension. Plain words with a dot stay.
const FILE_RE = /(^|[^\w@])(\.?[\w-]+(?:\.[\w-]+)*\.(?:js|mjs|cjs|jsx|ts|tsx|vue|svelte|php|py|rb|go|rs|java|kt|kts|swift|cs|cpp|cc|c|h|hpp|sql|json|ya?ml|toml|ini|env|lock|md|mdx|html?|css|scss|sass|less|sh|ps1|bat|xml|gradle|dart|ex|exs|blade|twig|prisma|graphql|gql|txt|log|csv|tsv|pdf|png|jpe?g|webp|gif|svg|zip|rar|7z|tar|gz|docx?|xlsx?|pptx?|odt|ods|odp|rtf|key|numbers|pages|fig|sketch|psd|ai|xd|mp4|mov|avi|mkv|mp3|wav|m4a|apk|ipa|exe|dmg|msi|jar|war|sqlite3?|db|bak))\b/gi;
const DOTENV_RE = /(^|\s)(\.env(?:\.[\w-]+)?)\b/g;
const BEARER_RE = /\b(Bearer|Basic|Token)\s+[A-Za-z0-9._~+/=-]{6,}/gi;
// API keys, hashes, ids: 20+ characters mixing letters and digits.
const LONG_TOKEN_RE = /[A-Za-z0-9_+=-]{20,}/g;
// Library names written like files or domains: a stack, never a location.
const LIBRARY_NAMES = new Set(['node.js', 'next.js', 'nuxt.js', 'vue.js', 'react.js', 'express.js', 'nest.js', 'three.js', 'd3.js', 'chart.js', 'alpine.js', 'ember.js', 'backbone.js', 'socket.io', 'deno.land', 'bun.sh', 'aioson.com']);
const DIGITS_RE = /\d[\d .\-/]{7,}\d/g;
// Control characters (all but tab, newline, carriage return), built from
// code points so the source holds no control character itself.
const CONTROL_RE = new RegExp(`[${[[0, 8], [11, 12], [14, 31], [127, 127]].map(([a, b]) => `\\u${a.toString(16).padStart(4, '0')}-\\u${b.toString(16).padStart(4, '0')}`).join('')}]`, 'g');
// Dates are not identifiers: 27/11/2026, 2026-11-27.
const DATE_RE = /^(?:\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}|\d{4}-\d{2}-\d{2})$/;
// A one-word folder name that says nothing about whose project it is.
const GENERIC_NAMES = new Set(['app', 'apps', 'web', 'site', 'api', 'backend', 'frontend', 'server', 'client', 'projeto', 'project', 'demo', 'teste', 'test', 'sistema', 'system', 'dashboard', 'admin', 'src', 'code', 'aioson']);

function fold(text) {
  return String(text || '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
}

function foldWords(text) {
  return fold(text).split(/[^\p{L}\p{N}]+/u).filter(Boolean);
}

// A path or URL at the end of a clause keeps the clause's punctuation.
function markKeepingPunctuation(match) {
  const tail = /[.,;:!?)\]]+$/.exec(match);
  return tail ? MARK + tail[0] : MARK;
}

function escapeRegExp(text) {
  return String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * One pattern per project name, over accent-folded text: each word may take
 * a plural (s / es) and words may be joined by space, dot, hyphen, underscore
 * or nothing — "Loja da Maria", "lojas-da-maria", "LojasDaMaria".
 */
function namePatterns(names) {
  const seen = new Set();
  const out = [];
  for (const raw of names || []) {
    const words = foldWords(raw);
    const key = words.join(' ');
    if (seen.has(key) || words.join('').length < 3) continue;
    if (words.length === 1 && GENERIC_NAMES.has(words[0])) continue;
    seen.add(key);
    out.push(words.map((w) => `${escapeRegExp(w)}(?:e?s)?`).join('[\\s._-]*'));
  }
  return out.sort((a, b) => b.length - a.length);
}

/**
 * Removes the project names from `text`. Matching runs on a folded copy kept
 * one UTF-16 unit per character of the original, so a match maps back by
 * position.
 */
function removeNames(text, names) {
  const patterns = namePatterns(names);
  if (patterns.length === 0) return text;
  const chars = [...text];
  const folded = chars.map((ch) => {
    const f = fold(ch);
    const one = f.length === 1 ? f : (f[0] || ch.toLowerCase());
    return one.length === 1 ? one : ' ';
  }).join('');
  const pattern = new RegExp(`(^|[^\\p{L}\\p{N}])(${patterns.join('|')})(?=$|[^\\p{L}\\p{N}])`, 'gu');
  const spans = [];
  let match;
  while ((match = pattern.exec(folded)) !== null) {
    const start = match.index + match[1].length;
    spans.push([start, start + match[2].length]);
    if (match[0].length === 0) pattern.lastIndex += 1;
  }
  if (spans.length === 0) return text;
  let out = '';
  let cursor = 0;
  for (const [start, end] of spans) {
    out += chars.slice(cursor, start).join('') + MARK;
    cursor = end;
  }
  return out + chars.slice(cursor).join('');
}

function keepLibrary(match) {
  return LIBRARY_NAMES.has(match.toLowerCase()) ? match : markKeepingPunctuation(match);
}

function removeSecrets(text) {
  return redactTelemetryText(text)
    .replace(BEARER_RE, (whole, scheme) => `${scheme} ${MARK}`)
    .replace(LONG_TOKEN_RE, (match) => (/\d/.test(match) && /[A-Za-z]/.test(match) ? MARK : match));
}

function removeLocators(text) {
  return text.replace(URL_RE, markKeepingPunctuation)
    .replace(SCP_RE, MARK)
    .replace(EMAIL_RE, MARK)
    .replace(WIN_PATH_RE, markKeepingPunctuation)
    .replace(POSIX_PATH_RE, (whole, lead, p) => lead + markKeepingPunctuation(p))
    .replace(DOMAIN_RE, keepLibrary)
    .replace(LOCALHOST_RE, markKeepingPunctuation)
    .replace(RELATIVE_PATH_RE, (match) => (DATE_RE.test(match) ? match : MARK))
    .replace(IPV4_RE, MARK)
    .replace(IPV6_RE, (match) => (match.includes('::') || /[a-f]/i.test(match) ? MARK : match))
    .replace(DOTENV_RE, (whole, lead) => `${lead}${MARK}`)
    .replace(FILE_RE, (whole, lead, p) => (LIBRARY_NAMES.has(p.toLowerCase()) ? whole : lead + MARK))
    .replace(DIGITS_RE, (match) => (DATE_RE.test(match.trim()) ? match : MARK));
}

/**
 * Scrubs one comment. `names` are the project's own names (project_name,
 * folder name, feature slug). Returns '' for an empty or all-removed comment.
 */
function scrubComment(text, { names = [], max = TEXT_MAX } = {}) {
  if (text === null || text === undefined) return '';
  let out = String(text).normalize('NFC').replace(CONTROL_RE, ' ');
  out = removeLocators(removeSecrets(out));
  out = removeNames(out, names);
  out = out.replace(/(?:\[removido\][\s:/\\]*){2,}/g, `${MARK} `).replace(/\s+/g, ' ').trim();
  if (out.replace(/\[removido\]/g, '').replace(/[\s.,;:!?-]/g, '') === '') return '';
  if ([...out].length > max) out = `${[...out].slice(0, max - 1).join('').trimEnd()}…`;
  return out;
}

module.exports = { scrubComment, namePatterns, TEXT_MAX, MARK };
