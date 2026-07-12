'use strict';
const test=require('node:test');const assert=require('node:assert/strict');const {runAgentExecution}=require('../src/commands/agent-execution');
test('AC-09 telemetry CLI exposes stable status schema',async()=>{const r=await runAgentExecution({args:['.'],options:{sub:'status',feature:'none'},logger:console});assert.equal(r.ok,true);assert.equal(r.schema_version,1);assert.ok(Array.isArray(r.runs))});
test('MEDIUM: events rejects telemetry run owned by another feature',async()=>{const r=await runAgentExecution({args:['.'],options:{sub:'events',feature:'other',run:'missing'},logger:console});assert.equal(r.ok,false);assert.equal(r.reason,'telemetry_run_not_found')});
