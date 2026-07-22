'use strict';
const { createAdapter } = require('./base');
module.exports=createAdapter('claude',i=>[
  '--print',
  ...(i.sandbox_mode==='read-only'?['--permission-mode','plan']:[]),
  ...(i.model==='configured-default'?[]:['--model',i.model]),
  ...(i.writable_roots?.length?['--add-dir',...i.writable_roots]:[]),
  i.prompt_text
]);
