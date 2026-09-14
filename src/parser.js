'use strict';

// Long options that are switches, never key/value pairs. Keeping this at
// module scope avoids rebuilding the set for every parse and makes the parser
// contract available to integrity tests.
const BOOLEAN_FLAGS = new Set([
  'accept-craft',
  'all', 'force', 'dry-run', 'confirm-defaults', 'no-interactive', 'fix', 'json',
  'help', 'version', 'no-launch', 'attach', 'tmux',
  'allow-warnings', 'install-hook', 'uninstall-hook', 'remove-hook',
  'agent-safe', 'agentic', 'headless',
  // workflow:execute — pure booleans; `--seed .` / `--step .` must not
  // swallow the path positional as their value.
  'seed', 'seed-only', 'step',
  'selective',
  'status', 'suggest', 'apply', 'complete',
  'runtime-only', 'template-only', 'inception', 'locales',
  'reachability', 'usage',
  // Documented switches shared by command-specific help entries.
  'advanced', 'compact', 'defaults', 'finish', 'headed', 'html',
  'include-archived', 'include-external', 'keep', 'no-backup',
  'include-resolved',
  'no-recall', 'no-semantic', 'paid', 'private', 'remote',
  'sensitive', 'skip-audit', 'snapshots-only', 'staged-only',
  'strict-env', 'verbose', 'with-infra', 'with-llm', 'write',
  // feature:export structure/output toggles — pure booleans; without these
  // a following positional (e.g. `--flatten .`) would be swallowed as the value.
  'flatten', 'no-index',
  // harness:validate — pure boolean; `--no-diff .` must not swallow the path.
  'no-diff',
  // audit:code / harness:check / rules:check — pure booleans; `--changed .` /
  // `--strict .` / `--baseline .` must not swallow the trailing path positional.
  'changed', 'strict', 'baseline',
  // context:evals — pure boolean; `--no-coverage .` must not swallow the path.
  'no-coverage',
  // feature:archive — pure boolean; `--keep-diagnostics .` must not swallow the path.
  'keep-diagnostics',
  // host:signature / learning:rollback / pentester:report — pure boolean;
  // `--list .` must not swallow the path positional.
  'list',
  // execution:run — pure booleans; `--preflight .` / `--resume .` / `--fresh .`
  // must not swallow the path positional.
  'preflight', 'resume', 'fresh', 'no-context-limit', 'context-limit',
  'until-complete', 'bounded-recovery', 'refresh',
  // `--watch` alone is the default cadence (execution:status 5 s, live:status
  // and runtime:session:status 2 s); `--watch=<seconds>` carries its value
  // through the `=` branch above. Bare, it must not swallow the path
  // positional — `aioson execution:status --watch .` is the shape a reader
  // types when following a run.
  'watch',
  // verify:artifact — pure booleans; `--advisory .` / `--no-build .` /
  // `--runtime .` / `--screenshots .` must not swallow the path positional
  // (`--screenshots=full` still carries its value through the `=` branch).
  'advisory', 'no-build', 'runtime', 'screenshots',
  // workflow:status — pure boolean; `--repair ../proj` repaired the cwd.
  'repair',
  // browser:run / verify:artifact — pure booleans; `--prototype .` /
  // `--continue .` / `--no-persist .` must not swallow the path positional.
  'prototype', 'continue', 'no-persist',
  // system:publish — pure booleans; `--build ./meu-app` must not swallow the
  // app directory as the flag's value (it silently published the CWD instead).
  'build', 'allow-raw-source',
  // init/install/update hooks default and hooks:install guard opt-outs —
  // pure booleans; `--no-hooks .` / `--no-guard .` must not swallow the path.
  'no-hooks', 'no-guard',
  // update downgrade-guard escape hatch — pure boolean; `--allow-downgrade .`
  // must not swallow the path positional.
  'allow-downgrade',
  // pentester:report — pure boolean; `--list .` must not swallow the path.
  'list',
  // workflow:mode / feature:diff / feature:current — pure booleans;
  // `--auto .` / `--paths-only .` / `--with-summary .` must not swallow the
  // path positional. (`--step` is already boolean above.)
  'auto', 'paths-only', 'with-summary', 'titles-only',
  // feature:close / feature:archive — pure booleans; `--preflight .`,
  // `--restore .`, `--no-archive .` etc. must not swallow the path positional.
  'preflight', 'explain', 'restore', 'sweep', 'no-archive', 'no-distill', 'no-trim',
  // briefing:apply-feedback — pure booleans; `--confirm .` / `--declined .`
  // / `--allow-stale .` must not swallow the path positional.
  'confirm', 'declined', 'allow-stale',
  // model delegation — execution is permitted only when the user explicitly
  // named another model; this switch must never swallow the project path.
  'explicit-model-request',
  // quality:evals seed validation never consumes the target path.
  'validate-seeds',
  'enable', 'disable', 'allow-secondary',
  // `--resume` alone means "resume last"; `--resume=<id>` carries a value
  // and is handled by the `=` branch below.
  'resume'
]);

// Booleans whose value, when given, is a number: `live:status --watch 3` and
// `runtime:session:status --watch 5` read the cadence (they did until `watch`
// joined BOOLEAN_FLAGS, when the `3` became the project path).
const NUMERIC_VALUE_FLAGS = new Set(['watch']);

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
      // A boolean that also takes a cadence keeps the space form it had
      // before it became boolean: `--watch 3` is three seconds, while
      // `--watch .` leaves the path positional. Only a bare number counts.
      if (next && NUMERIC_VALUE_FLAGS.has(k) && /^\d+(?:\.\d+)?$/.test(next)) {
        options[k] = next;
        i += 1;
        continue;
      }
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
