'use strict';
const { createAdapter } = require('./base');
// sandbox_mode is translated by the registry (src/lib/tool-capabilities.js)
// through createAdapter: 'read-only' → plan mode (no edits); 'workspace-write'
// → the registry's unattended flags (the same the desktop client uses for its
// yolo sessions) — a lane worker must edit files and run tests non-interactively.
//
// reasoning_effort: `claude --effort <low|medium|high|xhigh|max>` sets the
// effort for the session. The registry declares the capability; the levels the
// CLI accepts are the same vocabulary the schema already carries, minus
// `ultra`, which the schema keeps for hosts that go further.
// Print mode reads a closed text stdin pipe; recovery context can exceed argv.
module.exports=createAdapter('claude',i=>({args:[
  '--print',
  ...(i.captureUsage?['--output-format','stream-json','--verbose']:[]),
  ...(i.sandbox_args||[]),
  ...(i.model==='configured-default'?[]:['--model',i.model]),
  ...(i.reasoning_effort?['--effort',i.reasoning_effort]:[]),
  ...(i.writable_roots?.length?['--add-dir',...i.writable_roots]:[])
],stdin:true}));
