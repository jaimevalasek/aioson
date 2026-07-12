'use strict';
const test=require('node:test');const assert=require('node:assert/strict');
const {normalizeModelName,resolveModel,validateReasoningEffort}=require('../src/agent-execution/model-resolver');

const catalog={available:true,source:'fixture',fetched_at:'2026-07-11',models:[
  {slug:'gpt-5.6-sol',display_name:'GPT-5.6-Sol',supported_efforts:['low','medium','high','xhigh','max','ultra']},
  {slug:'gpt-5.6-terra',display_name:'GPT-5.6-Terra',supported_efforts:['low','medium','high','xhigh','max','ultra']},
  {slug:'gpt-5.6-luna',display_name:'GPT-5.6-Luna',supported_efforts:['low','medium','high','xhigh','max']}
]};

test('AC-AEMR-03 exact canonical slug remains unchanged',()=>{const r=resolveModel('gpt-5.6-terra',catalog);assert.equal(r.ok,true);assert.equal(r.resolved,'gpt-5.6-terra');assert.equal(r.strategy,'exact_slug')});
test('AC-AEMR-04 display form normalizes to the canonical slug',()=>{assert.equal(normalizeModelName('GPT 5.6 Terra'),'gpt-5-6-terra');const r=resolveModel('GPT 5.6 Terra',catalog);assert.equal(r.resolved,'gpt-5.6-terra');assert.equal(r.strategy,'normalized_name')});
test('AC-AEMR-05 unique alias resolves and duplicate alias blocks with sorted candidates',()=>{const unique=resolveModel('terra',catalog);assert.equal(unique.resolved,'gpt-5.6-terra');assert.equal(unique.strategy,'unique_alias');const duplicate={...catalog,models:[...catalog.models,{slug:'gpt-5.7-terra',display_name:'GPT-5.7-Terra',supported_efforts:['high']}]};const ambiguous=resolveModel('terra',duplicate);assert.equal(ambiguous.ok,false);assert.equal(ambiguous.reason,'ambiguous_model');assert.deepEqual(ambiguous.candidates,['gpt-5.6-terra','gpt-5.7-terra'])});
test('AC-AEMR-06 conservative typo resolves but generic, numeric drift and ties block',()=>{const typo=resolveModel('gpt-5.6-tera',catalog);assert.equal(typo.resolved,'gpt-5.6-terra');assert.equal(typo.strategy,'fuzzy_unique');assert.equal(resolveModel('gpt',catalog).reason,'model_not_found');assert.equal(resolveModel('gpt-5.7-terra',catalog).reason,'model_not_found');const tied={...catalog,models:[{slug:'gpt-5.6-terra',display_name:'Terra'},{slug:'gpt-5.6-terna',display_name:'Terna'}]};assert.equal(resolveModel('gpt-5.6-tera',tied).reason,'ambiguous_model')});
test('AC-AEMR-07 no catalog match fails before execution',()=>{const r=resolveModel('gpt-5.6-ocean',catalog);assert.equal(r.ok,false);assert.equal(r.reason,'model_not_found')});
test('AC-AEMR-08 unavailable catalog preserves literal ids but rejects display forms',()=>{const unavailable={available:false,reason:'catalog_unavailable',models:[]};const literal=resolveModel('private-model-v2',unavailable);assert.equal(literal.ok,true);assert.equal(literal.strategy,'unverified_literal');assert.equal(resolveModel('Private Model V2',unavailable).reason,'catalog_unavailable');assert.equal(resolveModel('configured-default',unavailable).strategy,'configured_default')});
test('AC-AEMR-11 reasoning effort never downgrades when the resolved model rejects it',()=>{const terra=resolveModel('terra',catalog);assert.equal(validateReasoningEffort(terra,'ultra').ok,true);const luna=resolveModel('luna',catalog);const unsupported=validateReasoningEffort(luna,'ultra');assert.equal(unsupported.ok,false);assert.equal(unsupported.reason,'unsupported_reasoning_effort');assert.deepEqual(unsupported.supported,['low','medium','high','xhigh','max'])});
test('security: oversized names fail before fuzzy distance allocation',()=>{const r=resolveModel('x'.repeat(201),catalog);assert.equal(r.ok,false);assert.equal(r.reason,'invalid_model')});
