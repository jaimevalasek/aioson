'use strict';

/**
 * Did this agent read a credential source during its session?
 *
 * A framing agent needed to see a logged-in screen, had no route it could load, and
 * read `.env` to mint itself an admin session, against the rule in its own kernel. It
 * then saved a note teaching the next session the trick. The rule was prose, so nothing
 * noticed. The hooks see every shell command, so they flag the read as it happens and
 * `agent:done` reports it.
 *
 * The flag is computed on the full command: the event keeps only its first 200
 * characters, and in that session `.env` began at character 200.
 *
 * The command is split the way a shell splits it, because a pattern cannot tell
 * `grep -E ".env|secret" list` from `grep SECRET .env`. Over the real commands of four
 * projects it flags reads and nothing else. Advisory: it reports, and a session still
 * closes. It sees the Bash tool only, the one the hooks record, and no plain file read.
 */

const MAX_TEXT = 200 * 1024;
const MAX_LINE = 4000;
const MAX_DEPTH = 3;

// A template holds no secret, and `.envrc` is another file. A backslash is a folder only
// after a path character: `\.env`, `^\.env` and `.*\.env` are patterns.
const ENV_PATH = /^(?:[^\s|;&()*^]*\/|[^\s|;&()*^]*[\w.-]\\)?\.env(?:\.(?!example\b|sample\b|template\b|dist\b)[A-Za-z0-9_-]+)*$/i;
// A script that opens the file by name, in the languages an agent reaches for.
const SCRIPT_READ = /\b(?:readFileSync|readFile|ReadAllText|ReadAllLines|open|Path)\(\s*[^)]*?['"`][^'"`]*\.env(?:\.(?!example\b|sample\b|template\b|dist\b)[A-Za-z0-9_-]+)*['"`]/i;

// Tools that read every file they are given.
const FILE_READERS = new Set(['cat', 'tac', 'nl', 'more', 'less', 'head', 'tail', 'cut', 'sort', 'strings', 'od', 'xxd', 'base64', 'type', 'source', '.', 'get-content', 'gc']);
// Tools whose first plain argument is a pattern or a script: `grep .env .gitignore`
// reads `.gitignore`, and `ls -a | grep .env` reads nothing.
const PATTERN_READERS = new Set(['grep', 'egrep', 'fgrep', 'rg', 'ag', 'ack', 'sed', 'awk', 'gawk', 'findstr', 'select-string', 'sls']);
const FILE_OPTIONS = new Set(['-f', '--file', '-path', '-literalpath']);
const WRAPPERS = new Set(['sudo', 'command', 'builtin', 'time', 'nohup', 'exec', 'env']);
const SHELLS = new Set(['bash', 'sh', 'zsh', 'dash', 'ksh', 'cmd', 'pwsh', 'powershell']);
const SHELL_BODY = new Set(['-c', '-lc', '/c', '-command']);
const SEPARATORS = new Set([';', '|', '&', '(', ')', '`']);

const isEnvPath = (word) => typeof word === 'string' && ENV_PATH.test(word);

function append(state, text, quoted = false) {
  state.word = state.word || { text: '', quoted: false };
  state.word.text += text;
  state.word.quoted = state.word.quoted || quoted;
}

function endWord(state) {
  const { word, redirect } = state;
  if (!word) return;
  state.word = null;
  state.redirect = null;
  if (redirect === 'input') state.inputs.push(word.text);
  else if (redirect === 'heredoc') state.heredoc = word.text;
  else if (redirect !== 'skip') state.words.push(word.text);
}

function endCommand(state) {
  endWord(state);
  if (state.words.length > 0 || state.inputs.length > 0) state.commands.push({ words: state.words, inputs: state.inputs });
  state.words = [];
  state.inputs = [];
  state.redirect = null;
}

/** The bodies of `$(...)` and backticks inside quoted text, which the shell still runs. */
function substitutions(text) {
  const found = text.split('`').filter((_, index) => index % 2 === 1);
  let at = text.indexOf('$(');
  while (at !== -1) {
    let depth = 1;
    let end = at + 2;
    while (end < text.length && depth > 0) {
      if (text[end] === '(') depth += 1;
      if (text[end] === ')') depth -= 1;
      end += 1;
    }
    found.push(text.slice(at + 2, depth === 0 ? end - 1 : end));
    at = text.indexOf('$(', end);
  }
  return found;
}

function readQuoted(line, start, state) {
  const mark = line[start];
  let end = start + 1;
  while (end < line.length && line[end] !== mark) end += mark === '"' && line[end] === '\\' ? 2 : 1;
  const inner = line.slice(start + 1, end);
  if (mark === '"') state.nested.push(...substitutions(inner));
  append(state, inner, true);
  return end + 1;
}

function readInput(line, at, state) {
  if (line[at + 1] === '(') {
    endCommand(state);
    return at + 2;
  }
  endWord(state);
  if (line[at + 1] === '<' && line[at + 2] === '<') {
    state.redirect = 'skip';
    return at + 3;
  }
  if (line[at + 1] === '<') {
    state.redirect = 'heredoc';
    return line[at + 2] === '-' ? at + 3 : at + 2;
  }
  state.redirect = 'input';
  return at + 1;
}

function readOutput(line, at, state) {
  // The digit of `2>` belongs to the redirect, and what it names is written, not read.
  if (state.word && !state.word.quoted && /^\d+$/.test(state.word.text)) state.word = null;
  endWord(state);
  state.redirect = 'skip';
  let next = at + 1;
  if (line[next] === '>') next += 1;
  if (line[next] === '&') {
    state.redirect = null;
    next += 1;
    while (/\d/.test(line[next] || '')) next += 1;
  }
  return next;
}

function step(line, at, state) {
  const char = line[at];
  if (char === '\\') {
    append(state, line.slice(at, at + 2));
    return at + 2;
  }
  if (char === "'" || char === '"') return readQuoted(line, at, state);
  if (char === ' ' || char === '\t') {
    endWord(state);
    return at + 1;
  }
  if (char === '$' && line[at + 1] === '(') {
    endCommand(state);
    return at + 2;
  }
  if (SEPARATORS.has(char)) {
    endCommand(state);
    return at + 1;
  }
  if (char === '<') return readInput(line, at, state);
  if (char === '>') return readOutput(line, at, state);
  append(state, char);
  return at + 1;
}

function parseLine(line) {
  const state = { commands: [], words: [], inputs: [], word: null, redirect: null, nested: [], heredoc: null };
  let at = 0;
  while (at < line.length) at = step(line, at, state);
  endCommand(state);
  return state;
}

function baseName(word) {
  return word.replace(/\\/g, '/').split('/').pop().toLowerCase().replace(/\.exe$/, '');
}

function commandIndex(words) {
  let at = 0;
  while (at < words.length && (/^[A-Za-z_]\w*=/.test(words[at]) || WRAPPERS.has(baseName(words[at])))) at += 1;
  return at;
}

function patternToolReads(args) {
  let plain = 0;
  return args.some((arg, index) => {
    if (arg.startsWith('-')) return FILE_OPTIONS.has(arg.toLowerCase()) && isEnvPath(args[index + 1]);
    plain += 1;
    return plain > 1 && isEnvPath(arg);
  });
}

function commandReads({ words, inputs }, depth) {
  if (inputs.some(isEnvPath)) return true;
  const at = commandIndex(words);
  if (at >= words.length) return false;
  const name = baseName(words[at]);
  const args = words.slice(at + 1);
  if (FILE_READERS.has(name)) return args.some(isEnvPath);
  if (PATTERN_READERS.has(name)) return patternToolReads(args);
  if (!SHELLS.has(name)) return false;
  const body = args.findIndex((arg) => SHELL_BODY.has(arg.toLowerCase()));
  return body !== -1 && scan(args.slice(body + 1).join(' '), depth + 1);
}

function parsedLineReads(parsed, depth) {
  return parsed.commands.some((command) => commandReads(command, depth)) || parsed.nested.some((body) => scan(body, depth + 1));
}

// A line with neither the name nor a heredoc cannot change the answer.
const lineMatters = (line) => line.includes('.env') || line.includes('<<');

function scan(text, depth) {
  if (depth > MAX_DEPTH) return false;
  let terminator = null;
  for (const raw of text.split('\n')) {
    const line = raw.slice(0, MAX_LINE).replace(/\r$/, '');
    if (SCRIPT_READ.test(line)) return true;
    if (terminator !== null) {
      if (line.trim() === terminator) terminator = null;
      continue;
    }
    if (!lineMatters(line)) continue;
    const parsed = parseLine(line);
    if (parsedLineReads(parsed, depth)) return true;
    terminator = parsed.heredoc;
  }
  return false;
}

function readsCredentialSource(command) {
  const text = String(command || '').slice(0, MAX_TEXT).replace(/\\\r?\n/g, ' ');
  return text.includes('.env') && scan(text, 0);
}

const MARKER = 'open credential sources';

/** The rule lives in the agent's own kernel, so a consumer agent that adopts it is measured too. */
function kernelForbidsCredentialSources(kernelText) {
  return String(kernelText || '').includes(MARKER);
}

const SESSION_ID_SQL = "CASE WHEN json_valid(payload_json) THEN json_extract(payload_json, '$.session_id') END";
const CREDENTIAL_FLAG_SQL = "CASE WHEN json_valid(payload_json) THEN json_extract(payload_json, '$.credential_read') END";

/**
 * What the shell commands of this agent's last activation read. The hooks write one
 * run per project and agent handle, windows included, so the activation names both
 * the stretch and the harness session. No activation on record, nothing to attribute.
 */
function credentialReadsSinceActivation(db, agent) {
  const handle = `@${String(agent || '').replace(/^@/, '')}`;
  const activation = db.prepare(
    `SELECT id, run_key, ${SESSION_ID_SQL} AS sid FROM agent_events WHERE event_type = 'agent_activated' AND message = ? ORDER BY id DESC LIMIT 1`
  ).get(handle);
  if (!activation) return [];
  const inSession = `run_key = ? AND id > ? AND (${SESSION_ID_SQL} IS ? OR ? IS NULL)`;
  const scope = [activation.run_key, activation.id, activation.sid, activation.sid];
  const next = db.prepare(`SELECT MIN(id) AS id FROM agent_events WHERE event_type = 'agent_activated' AND ${inSession}`).get(...scope);
  return db.prepare(`SELECT message FROM agent_events WHERE ${CREDENTIAL_FLAG_SQL} = 1 AND ${inSession} AND id < ? ORDER BY id ASC`)
    .all(...scope, next && next.id ? next.id : Number.MAX_SAFE_INTEGER)
    .map((row) => String(row.message || ''));
}

/**
 * The advisory `agent:done` prints, or null. Best-effort by contract: a broken store
 * never affects an agent's session close, and an observation keeps it for the owner.
 */
async function resolveCredentialReads({ db, targetDir, agent }) {
  const bare = String(agent || '').replace(/^@/, '');
  try {
    const fs = require('node:fs/promises');
    const path = require('node:path');
    const kernel = await fs.readFile(path.join(targetDir, '.aioson', 'agents', `${bare}.md`), 'utf8');
    if (!kernelForbidsCredentialSources(kernel)) return null;
    const commands = credentialReadsSinceActivation(db, bare);
    if (commands.length === 0) return null;
    const { addObservation } = require('./observations');
    await addObservation(targetDir, {
      kind: 'risk',
      agent: bare,
      summary: `@${bare} read a credential source in its session, which its kernel forbids. For a logged-in screen it has .aioson/docs/briefing/logged-in-screens.md`
    }).catch(() => {});
    return { count: commands.length, sample: commands[0].slice(0, 120) };
  } catch {
    return null;
  }
}

function logCredentialReadsLine(logger, reads) {
  if (!reads) return;
  logger.log(`agent:done — credential source read (advisory): ${reads.count} command(s) of this session read one, the first: ${reads.sample}. To see a logged-in screen, use .aioson/docs/briefing/logged-in-screens.md, and tell the owner a session or secret may have been exposed.`);
}

module.exports = {
  credentialReadsSinceActivation,
  kernelForbidsCredentialSources,
  logCredentialReadsLine,
  readsCredentialSource,
  resolveCredentialReads
};
