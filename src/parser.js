'use strict';

function parseArgv(argv) {
  const [, , ...tokens] = argv;
  const args = [];
  const options = {};
  let command = 'help';

  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i];

    if (token.startsWith('--')) {
      const [k, v] = token.replace(/^--/, '').split('=');
      if (v !== undefined) {
        options[k] = v;
        continue;
      }

      // Boolean-only flags that never consume the next token
      const boolOnly = new Set([
        'all', 'force', 'dry-run', 'no-interactive', 'fix', 'json',
        'help', 'version', 'no-launch', 'attach', 'tmux',
        'allow-warnings', 'install-hook', 'uninstall-hook', 'remove-hook',
        'agent-safe',
        'status', 'suggest', 'apply',
        // `--resume` alone means "resume last"; `--resume=<id>` carries a value
        // and is handled by the `=` branch above. Without this entry, `--resume`
        // followed by `--tool=claude` would swallow the next token as its value.
        'resume'
      ]);

      const next = tokens[i + 1];
      if (next && !next.startsWith('-') && !boolOnly.has(k)) {
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
  parseArgv
};
