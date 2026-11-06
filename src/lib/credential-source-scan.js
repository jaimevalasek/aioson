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
 * The command is read the way a shell reads it, because a pattern cannot tell
 * `grep -E ".env|secret" list` from `grep SECRET .env`, nor a commit message that names
 * the file from a command that opens it. Advisory: it reports, and a session still
 * closes. It sees the Bash tool only, the one the hooks record, and no plain file read.
 * A file named through a variable (`for f in .env; do cat "$f"; done`) goes unseen, and
 * a message that quotes a call such as `open('.env')` counts as one.
 */

const MAX_TEXT = 200 * 1024;
const MAX_LINE = 4000;
const MAX_DEPTH = 6;
const MAX_ARITHMETIC = 500;
// How far into a command the shell it feeds can sit: `sudo -u x docker exec -i app sh <<EOF`.
const MAX_RUNNER_WORDS = 8;

// A template holds no secret, and `.envrc` is another file. A backslash is a folder only
// after a path character: `\.env`, `^\.env` and `.*\.env` are patterns.
const ENV_PATH = /^(?:[^|;&()^]*\/|[^|;&()*^]*[\w.-]\\+)?\.env(?:\.(?!example\b|sample\b|template\b|dist\b)[A-Za-z0-9_$*{}-]+)*\*?$/i;
// A script that opens the file by name, in the languages an agent reaches for.
const SCRIPT_READ = /\b(?:readFileSync|readFile|ReadAllText|ReadAllLines|open|fopen|read|Path|file_get_contents|parse_ini_file|dotenv_values)\(\s*[^)]*?['"`][^'"`]*\.env(?:\.(?!example\b|sample\b|template\b|dist\b)[A-Za-z0-9_-]+)*['"`]/i;

// Tools that read every file they are given.
const FILE_READERS = new Set(['cat', 'bat', 'tac', 'nl', 'more', 'less', 'head', 'tail', 'cut', 'sort', 'strings', 'od', 'xxd', 'base64', 'type', 'source', '.', 'get-content', 'gc']);
// Tools whose first plain argument is a pattern or a script: `grep .env .gitignore`
// reads `.gitignore`, and `ls -a | grep .env` reads nothing.
const PATTERN_READERS = new Set(['grep', 'egrep', 'fgrep', 'rg', 'ag', 'ack', 'sed', 'awk', 'gawk', 'findstr', 'select-string', 'sls']);
const SCRIPT_OPTIONS = new Set(['-f', '--file']);
const VALUE_OPTIONS = new Set(['-A', '-B', '-C', '-m', '-g', '-t', '--glob', '--type', '--include', '--exclude', '--max-count', '--max-depth', '--maxdepth', '--context', '--after-context', '--before-context']);
const GIVES_PATTERN = new Set(['script', 'pattern', 'attached']);
const TAKES_NEXT = new Set(['script', 'path', 'pattern', 'value']);
// Words a command starts behind, none with options of its own.
const PREFIX_WORDS = new Set(['if', 'then', 'elif', 'else', 'while', 'until', 'do', '!', '{', 'time', 'command', 'builtin', 'nohup', 'exec']);
// Tools that run a command given in their own arguments, after options of their own.
const RUNNERS = new Set(['sudo', 'doas', 'env', 'timeout', 'nice', 'ionice', 'stdbuf', 'xargs', 'watch', 'eval', 'wsl', 'winpty', 'busybox', 'ssh', 'docker', 'podman', 'kubectl']);
const SHELLS = new Set(['bash', 'sh', 'zsh', 'dash', 'ksh', 'cmd', 'pwsh', 'powershell']);
const SHELL_BODY = /^(?:-[a-z]*c|\/c|-command)$/i;
const DOUBLE_QUOTE_ESCAPES = new Set(['"', '\\', '$', '`']);

// `${ENV_FILE:-.env}` names the file when nothing else does.
const isEnvPath = (word) => typeof word === 'string' && ENV_PATH.test(word.replace(/\$\{\w+:?-([^}]{0,500})\}/g, '$1'));
const runsItsInput = (word) => SHELLS.has(baseName(word)) || baseName(word) === 'ssh';

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
  else if (redirect === 'heredoc') state.heredocs.push({ ...word, feedsShell: state.words.slice(0, MAX_RUNNER_WORDS).some(runsItsInput) });
  else if (redirect !== 'skip') state.words.push(word.text);
}

function endCommand(state) {
  endWord(state);
  if (state.words.length > 0 || state.inputs.length > 0) state.commands.push({ words: state.words, inputs: state.inputs });
  state.words = [];
  state.inputs = [];
  state.redirect = null;
}

/** `$(...)`, backticks and parentheses hold commands of their own, in the middle of this word. */
function readNested(state, at, closer) {
  if (state.depth >= MAX_DEPTH) return at;
  const outer = { word: state.word, words: state.words, inputs: state.inputs, redirect: state.redirect };
  Object.assign(state, { word: null, words: [], inputs: [], redirect: null, depth: state.depth + 1 });
  const next = parseUntil(state, at, closer);
  endCommand(state);
  Object.assign(state, outer, { depth: state.depth - 1 });
  return next;
}

// `$((1<<2))` is arithmetic: no command and no heredoc in there, and never a file name.
function arithmeticEnd(text, open) {
  const window = text.slice(open, open + MAX_ARITHMETIC);
  const end = window.indexOf('))');
  return end !== -1 && !/\.env/i.test(window.slice(0, end)) ? open + end + 2 : -1;
}

function readSubstitution(state, at) {
  const end = state.text.startsWith('$((', at) ? arithmeticEnd(state.text, at) : -1;
  return end !== -1 ? end : readNested(state, at + 2, ')');
}

// Inside double quotes the shell still runs substitutions, and a backslash only escapes four characters.
function stepDouble(state, at) {
  const { text } = state;
  if (text[at] === '\\') {
    append(state, DOUBLE_QUOTE_ESCAPES.has(text[at + 1]) ? text[at + 1] : text.slice(at, at + 2));
    return at + 2;
  }
  if (text.startsWith('$(', at)) return readSubstitution(state, at);
  if (text[at] === '`') return readNested(state, at + 1, '`');
  append(state, text[at]);
  return at + 1;
}

function readDouble(state, start) {
  append(state, '', true);
  let at = start + 1;
  while (at < state.text.length && state.text[at] !== '"') at = stepDouble(state, at);
  return at + 1;
}

function readSingle(state, start) {
  const found = state.text.indexOf("'", start + 1);
  const end = found === -1 ? state.text.length : found;
  append(state, state.text.slice(start + 1, end), true);
  return end + 1;
}

function readInput(state, at) {
  const { text } = state;
  endWord(state);
  if (text.startsWith('<<<', at)) {
    state.redirect = 'skip';
    return at + 3;
  }
  if (text.startsWith('<<', at)) {
    state.redirect = 'heredoc';
    return text[at + 2] === '-' ? at + 3 : at + 2;
  }
  state.redirect = 'input';
  return at + 1;
}

function readOutput(state, at) {
  const { text } = state;
  // The digit of `2>` belongs to the redirect, and what it names is written, not read.
  if (state.word && !state.word.quoted && /^\d+$/.test(state.word.text)) state.word = null;
  endWord(state);
  state.redirect = 'skip';
  let next = at + 1;
  if (text[next] === '>') next += 1;
  if (text[next] === '&') {
    state.redirect = null;
    next += 1;
    while (/\d/.test(text[next] || '')) next += 1;
  }
  return next;
}

function innerState(state, body) {
  return { ...state, text: body, word: null, words: [], inputs: [], redirect: null, heredocs: [], depth: state.depth + 1 };
}

// A quoted terminator keeps the body as text. Unquoted, the shell runs what its `$(...)` holds.
function runExpansions(state, body) {
  if (state.depth >= MAX_DEPTH) return;
  const inner = innerState(state, body);
  let at = 0;
  while (at < body.length) at = stepDouble(inner, at);
}

// Fed to a shell or to ssh, the body is the script.
function runScript(state, body) {
  if (state.depth >= MAX_DEPTH) return;
  const inner = innerState(state, body);
  parseUntil(inner, 0, null);
  endCommand(inner);
}

// Inside `$(...)` a heredoc also ends at `EOF)`, and the parenthesis still closes the substitution.
function heredocEnd(state, start, terminator) {
  const { text } = state;
  let line = start;
  while (line < text.length) {
    const found = text.indexOf('\n', line);
    const stop = found === -1 ? text.length : found;
    const content = text.slice(line, stop).trim();
    if (content === terminator) return { bodyEnd: line, next: stop + 1 };
    if (state.depth > 0 && content.startsWith(`${terminator})`)) return { bodyEnd: line, next: text.indexOf(')', line) };
    line = stop + 1;
  }
  return { bodyEnd: text.length, next: text.length };
}

function readHeredoc(state, start, word) {
  const terminator = word.text.replace(/\\/g, '');
  const { bodyEnd, next } = heredocEnd(state, start, terminator);
  const body = state.text.slice(start, bodyEnd);
  if (word.feedsShell) runScript(state, body);
  else if (!word.quoted && terminator === word.text) runExpansions(state, body);
  return next;
}

function readNewline(state, at) {
  endCommand(state);
  let next = at + 1;
  for (const word of state.heredocs) next = readHeredoc(state, next, word);
  state.heredocs = [];
  return next;
}

function readComment(state, at) {
  if (state.word) {
    append(state, '#');
    return at + 1;
  }
  const found = state.text.indexOf('\n', at);
  return found === -1 ? state.text.length : found;
}

function readDollar(state, at) {
  if (state.text[at + 1] === '(') return readSubstitution(state, at);
  append(state, '$');
  return at + 1;
}

function readEscape(state, at) {
  append(state, state.text.slice(at, at + 2));
  return at + 2;
}

function readParen(state, at) {
  endCommand(state);
  const end = state.text[at + 1] === '(' ? arithmeticEnd(state.text, at) : -1;
  return end !== -1 ? end : readNested(state, at + 1, ')');
}

function readBacktick(state, at) {
  return readNested(state, at + 1, '`');
}

function readSpace(state, at) {
  endWord(state);
  return at + 1;
}

function readSeparator(state, at) {
  endCommand(state);
  return at + 1;
}

const READERS = new Map([
  [' ', readSpace], ['\t', readSpace], ['\r', readSpace],
  [';', readSeparator], ['|', readSeparator], ['&', readSeparator], [')', readSeparator],
  ['\n', readNewline], ['\\', readEscape], ["'", readSingle], ['"', readDouble], ['#', readComment],
  ['$', readDollar], ['`', readBacktick], ['(', readParen], ['<', readInput], ['>', readOutput]
]);

function parseUntil(state, start, closer) {
  const { text } = state;
  let at = start;
  while (at < text.length) {
    if (text[at] === closer) return at + 1;
    const read = READERS.get(text[at]);
    if (read) {
      at = read(state, at);
    } else {
      append(state, text[at]);
      at += 1;
    }
  }
  return at;
}

function parseCommands(text) {
  const state = { text, commands: [], words: [], inputs: [], word: null, redirect: null, heredocs: [], depth: 0 };
  parseUntil(state, 0, null);
  endCommand(state);
  return state.commands;
}

function baseName(word) {
  return word.replace(/\\/g, '/').split('/').pop().toLowerCase().replace(/\.exe$/, '');
}

function commandIndex(words) {
  let at = 0;
  while (at < words.length && (/^[A-Za-z_]\w*=/.test(words[at]) || PREFIX_WORDS.has(baseName(words[at])))) at += 1;
  return at;
}

function optionKind(arg) {
  if (SCRIPT_OPTIONS.has(arg)) return 'script';
  if (/^-(?:literal)?path$/i.test(arg)) return 'path';
  if (/^-[A-Za-z]*e$/.test(arg) || ['--regexp', '-pattern'].includes(arg.toLowerCase())) return 'pattern';
  if (/^-e.|^--regexp=/.test(arg)) return 'attached';
  if (VALUE_OPTIONS.has(arg)) return 'value';
  return arg.startsWith('-') ? 'flag' : 'plain';
}

function patternToolReads(args) {
  const plain = [];
  let patternGiven = false;
  for (let at = 0; at < args.length; at += 1) {
    const kind = optionKind(args[at]);
    if (kind === 'plain') plain.push(args[at]);
    if ((kind === 'script' || kind === 'path') && isEnvPath(args[at + 1])) return true;
    patternGiven = patternGiven || GIVES_PATTERN.has(kind);
    if (TAKES_NEXT.has(kind)) at += 1;
  }
  return plain.slice(patternGiven ? 0 : 1).some(isEnvPath);
}

function shellBodyReads(args, depth) {
  const body = args.findIndex((arg) => SHELL_BODY.test(arg));
  return body !== -1 && scan(args.slice(body + 1).join(' '), depth + 1);
}

const canBeRun = (name) => name !== '.' && (FILE_READERS.has(name) || PATTERN_READERS.has(name) || SHELLS.has(name));

// `sudo -u www cat .env`, `timeout 5 cat .env`, `ssh prod "cat .env"`: in each command of
// what the tool was given, the first word that reads anything is the command.
function runnerReads(args, depth) {
  if (depth >= MAX_DEPTH) return false;
  return parseCommands(args.join(' ')).some(({ words, inputs }) => {
    if (inputs.some(isEnvPath)) return true;
    const at = words.findIndex((word) => canBeRun(baseName(word)));
    return at !== -1 && toolReads(baseName(words[at]), words.slice(at + 1), depth + 1);
  });
}

function toolReads(name, args, depth) {
  if (FILE_READERS.has(name)) return args.some(isEnvPath);
  if (PATTERN_READERS.has(name)) return patternToolReads(args);
  if (SHELLS.has(name)) return shellBodyReads(args, depth);
  return RUNNERS.has(name) && runnerReads(args, depth);
}

function commandReads({ words, inputs }, depth) {
  if (inputs.some(isEnvPath)) return true;
  const at = commandIndex(words);
  return at < words.length && toolReads(baseName(words[at]), words.slice(at + 1), depth);
}

function scan(text, depth) {
  if (depth > MAX_DEPTH) return false;
  return parseCommands(text).some((command) => commandReads(command, depth));
}

function readsCredentialSource(command) {
  const text = String(command || '').slice(0, MAX_TEXT).replace(/\\\r?\n/g, ' ');
  if (!/\.env/i.test(text)) return false;
  return text.split('\n').some((line) => SCRIPT_READ.test(line.slice(0, MAX_LINE))) || scan(text, 0);
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
