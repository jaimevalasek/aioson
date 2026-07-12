'use strict';
const { createAdapter } = require('./base');
module.exports=createAdapter('opencode',i=>['run',...(i.model==='configured-default'?[]:['--model',i.model]),i.prompt_text]);
