'use strict';

// Long options that are switches, never key/value pairs. Keeping this at
// module scope avoids rebuilding the set for every parse and makes the parser
// contract available to integrity tests.
const BOOLEAN_FLAGS = new Set([
  'all', 'force', 'dry-run', 'no-interactive', 'fix', 'json',
  'help', 'version', 'no-launch', 'attach', 'tmux',
  'allow-warnings', 'install-hook', 'uninstall-hook', 'remove-hook',
  'agent-safe', 'agentic', 'headless',
  // workflow:execute — pure booleans; `--seed .` / `--step .` must not
  // swallow the path positional as their value.
  'seed', 'seed-only', 'step',
  'selective',
  'status', 'suggest', 'apply', 'complete',
  'runtime-only', 'template-only', 'inception', 'locales',
  // Documented switches shared by command-specific help entries.
  'advanced', 'defaults', 'finish', 'headed', 'html',
  'include-archived', 'include-external', 'keep', 'no-backup',
  'no-recall', 'no-semantic', 'paid', 'private', 'remote',
  'sensitive', 'skip-audit', 'snapshots-only', 'staged-only',
  'strict-env', 'verbose', 'with-infra', 'with-llm', 'write',
  // feature:export structure/output toggles — pure booleans; without these
  // a following positional (e.g. `--flatten .`) would be swallowed as the value.
  'flatten', 'no-index',
  // harness:validate — pure boolean; `--no-diff .` must not swallow the path.
  'no-diff',
  // audit:code / harness:check — pure booleans; `--changed .` / `--strict .`
  // must not swallow the trailing path positional.
  'changed', 'strict',
  // verify:artifact — pure booleans; `--advisory .` / `--no-build .` must
  // not swallow the path positional.
  'advisory', 'no-build',
  // briefing:apply-feedback — pure booleans; `--confirm .` / `--declined .`
  // / `--allow-stale .` must not swallow the path positional.
  'confirm', 'declined', 'allow-stale',
  // model delegation — execution is permitted only when the user explicitly
  // named another model; this switch must never swallow the project path.
  'explicit-model-request',
  // `--resume` alone means "resume last"; `--resume=<id>` carries a value
  // and is handled by the `=` branch below.
  'resume'
]);

function parseArgv(argv) {
  const [, , ...tokens] = argv;
  const args = [];
  const options = {};
  let command = 'help';

  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i];

    if (token.startsWith('--')) {
      // Split on the FIRST `=` only — values may contain `=` (e.g. URLs,
      // SQL, or natural-language sentences like "profile=creator").
      // Using `.split('=')` without a limit + array destructuring discards
      // anything after the second `=`, truncating flag values silently.
      const stripped = token.slice(2);
      const eqIdx = stripped.indexOf('=');
      if (eqIdx !== -1) {
        const k = stripped.slice(0, eqIdx);
        const v = stripped.slice(eqIdx + 1);
        options[k] = v;
        continue;
      }
      const k = stripped;

      const next = tokens[i + 1];
      if (next && !next.startsWith('-') && !BOOLEAN_FLAGS.has(k)) {
        options[k] = next;
        i += 1;
      } else {
        options[k] = true;
      }
      continue;
    }

    if (token.startsWith('-')) {
      const shortFlags = token.replace(/^-/, '').split('');
      for (const flag of shortFlags) {
        if (flag === 'f') options.force = true;
        if (flag === 'd') options['dry-run'] = true;
        if (flag === 'h') options.help = true;
        if (flag === 'j') options.json = true;
        if (flag === 'v') options.version = true;
      }
      continue;
    }

    if (command === 'help') {
      command = token;
    } else {
      args.push(token);
    }
  }

  return { command, args, options };
}

module.exports = {
  BOOLEAN_FLAGS,
  parseArgv
};
