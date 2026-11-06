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
 * characters, and in that session `.env` was the last word, at character 200.
 *
 * Advisory: it reports, and a session still closes. It sees shell commands only, because
 * the hooks do not record plain file reads.
 */

const MAX_TEXT = 200 * 1024;
const MAX_LINE = 4000;

// A template holds no secret. `.envrc` and the like are other files.
const ENV_NAME = String.raw`\.env(?:\.(?!example\b|sample\b|template\b|dist\b)[A-Za-z0-9_-]+)?`;
// A folder before it: a backslash counts only after a path character, because `\.env`,
// `^\.env` and `.*\.env` are patterns.
const ENV_PATH = String.raw`(?:[^\s|;&()]*\/|[^\s|;&()]*[\w.-]\\)?${ENV_NAME}`;
const ENV_ONLY = new RegExp(`^${ENV_PATH}$`, 'i');
// The file is the last thing the tool reads: `grep .env .gitignore` names it as a pattern
// and reads another file.
const FILE_POSITION = String.raw`(?:\s+-{1,2}[\w=-]+)*\s*(?:$|[|;&)<>])`;
// A redirect right after the tool writes, it does not read.
const READER = String.raw`(?:^|[\s;&|(])(?:cat|type|more|less|head|tail|grep|egrep|fgrep|rg|sed|awk|cut|sort|strings|findstr|source|Get-Content|gc|Select-String|sls)\b(?!\s*>)[^;&]*?`;
const SHELL_READ = new RegExp(`${READER}[\\s=]${ENV_PATH}${FILE_POSITION}`, 'i');
const DOT_SOURCE = /(?:^|[;&|(]\s*)\.\s+(?:\S*\/)?\.env\s*(?:$|[;&|)])/;
const QUOTED = /"(?:[^"\\]|\\.)*"|'[^']*'/g;
// A script that opens the file by name, in the languages an agent reaches for.
const SCRIPT_READ = /\b(?:readFileSync|readFile|open|Path)\(\s*[^)]*?['"`][^'"`]*\.env(?:\.(?!example\b|sample\b|template\b|dist\b)[A-Za-z0-9_-]+)?['"`]/i;
const HEREDOC_OPEN = /<<-?\s*['"]?([A-Za-z_]\w*)/;

/** Each line once, cut to a bound, with whether it sits inside a heredoc body. */
function commandLines(command) {
  const lines = [];
  let terminator = null;
  for (const raw of String(command || '').slice(0, MAX_TEXT).split('\n')) {
    const line = raw.slice(0, MAX_LINE);
    if (terminator) {
      if (line.trim() === terminator) terminator = null;
      else lines.push({ line, body: true });
      continue;
    }
    lines.push({ line, body: false });
    const open = HEREDOC_OPEN.exec(line);
    if (open) terminator = open[1];
  }
  return lines;
}

// Quoted text is a pattern or a message, whatever it mentions: `grep -E ".env|secret"`
// and `sed 's/x/reading .env; y/'` read no such file. A quoted path stays a path.
function withoutQuotedText(line) {
  return line.replace(QUOTED, (quoted) => {
    const inner = quoted.slice(1, -1);
    return ENV_ONLY.test(inner) ? inner : 'Q';
  });
}

function readsCredentialSource(command) {
  // A heredoc body is text being written, or a script: only a script can read by name.
  return commandLines(command).some(({ line, body }) => {
    if (SCRIPT_READ.test(line)) return true;
    if (body) return false;
    const plain = withoutQuotedText(line);
    return SHELL_READ.test(plain) || DOT_SOURCE.test(plain);
  });
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
  return db.prepare(`SELECT message FROM agent_events WHERE ${CREDENTIAL_FLAG_SQL} = 1 AND ${inSession} AND id < ?`)
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
