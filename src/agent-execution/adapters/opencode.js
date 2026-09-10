'use strict';
const { createAdapter } = require('./base');
// OpenCode's unattended flag is registered (src/lib/tool-capabilities.js:
// `opencode run --auto`, auto-approve every permission not explicitly denied),
// so a lane worker's `workspace-write` arrives here as `--auto` through
// sandbox_args. It registers no read-only flag: a read-only request is refused
// by createAdapter (`sandbox_mode_unsupported`) instead of getting a process
// that runs with write access — more power than a read-only researcher's
// contract.
module.exports=createAdapter('opencode',i=>['run',...(i.sandbox_args||[]),...(i.model==='configured-default'?[]:['--model',i.model]),i.prompt_text]);
