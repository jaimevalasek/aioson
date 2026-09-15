'use strict';
const { createAdapter } = require('./base');
// sandbox_mode is translated by the registry (src/lib/tool-capabilities.js)
// through createAdapter — never here: 'read-only' → `--sandbox read-only`;
// 'workspace-write' → the unattended flag, always. This file once carried its
// own `--sandbox workspace-write` for a lane worker, and that sandbox left the
// lane asking for permission all night with nothing in the log (measured
// since: the Windows sandbox setup fails to load, and under it the model
// answers DONE without writing) — the registry is the one place that decides.
//
// --skip-git-repo-check: Codex refuses to run outside a Git repository, and the
// caller decides where it runs — a lane worker runs in the project (a repo),
// but `host:signature` probes in an empty temporary directory on purpose. The
// declared write paths and the run's measured scope findings are what bound a
// lane worker; the repo check only bounds where.
module.exports=createAdapter('codex',i=>({args:[
  'exec',
  '--skip-git-repo-check',
  ...(i.captureUsage ? ['--json'] : []),
  ...(i.sandbox_args||[]),
  ...(i.model==='configured-default'?[]:['--model',i.model]),
  ...(i.reasoning_effort?['-c',`model_reasoning_effort="${i.reasoning_effort}"`]:[]),
  ...(i.writable_roots||[]).flatMap(root=>['--add-dir',root]),
  '-'
],stdin:true}));
