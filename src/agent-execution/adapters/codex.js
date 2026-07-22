'use strict';
const { createAdapter } = require('./base');
module.exports=createAdapter('codex',i=>({args:[
  'exec',
  ...(i.sandbox_mode==='read-only'?['--sandbox','read-only']:[]),
  ...(i.model==='configured-default'?[]:['--model',i.model]),
  ...(i.reasoning_effort?['-c',`model_reasoning_effort="${i.reasoning_effort}"`]:[]),
  ...(i.writable_roots||[]).flatMap(root=>['--add-dir',root]),
  '-'
],stdin:true}));
