'use strict';const test=require('node:test');const assert=require('node:assert/strict');const {defaults}=require('../src/agent-execution/manifest');
const {validateManifest}=require('../src/agent-execution/schema');const {redact}=require('../src/agent-execution/adapters/base');
// AC-AED-12 AC-AED-17
test('manifest has no command strings or secrets and fallback is opt-in',()=>{const m=defaults('safe');assert.equal(JSON.stringify(m).includes('token'),false);assert.deepEqual(m.agents.dev.fallbacks,[]);assert.equal(m.capacity_policy.strategy,'pause')});
test('runtime schema rejects unknown and nested secret fields',()=>{const m=defaults('safe');m.agents.dev.token='secret';m.unknown=true;const r=validateManifest(m);assert.equal(r.ok,false);assert.ok(r.errors.some(e=>e.path==='$.agents.dev.token'));assert.ok(r.errors.some(e=>e.path==='$.unknown'))});
test('adapter errors redact common credential forms',()=>{const value=redact('Authorization: Bearer abc123 api_key=xyz password=hunter2');assert.equal(value.includes('abc123'),false);assert.equal(value.includes('xyz'),false);assert.equal(value.includes('hunter2'),false)});
