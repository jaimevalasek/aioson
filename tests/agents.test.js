'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  normalizeAgentName,
  getAgentDefinition,
  resolveInstructionPath,
  buildAgentPrompt,
  listAgentDefinitions
} = require('../src/agents');

test('normalizeAgentName strips @ and lowercases value', () => {
  assert.equal(normalizeAgentName('@Setup'), 'setup');
});

test('getAgentDefinition resolves known agent', () => {
  const agent = getAgentDefinition('setup');
  assert.equal(Boolean(agent), true);
  assert.equal(agent.id, 'setup');
});

test('getAgentDefinition resolves ux-ui agent', () => {
  const agent = getAgentDefinition('ux-ui');
  assert.equal(Boolean(agent), true);
  assert.equal(agent.id, 'ux-ui');
  assert.equal(agent.displayName, 'UI/UX');
  assert.equal(agent.output.includes('.aioson/context/ui-spec.md'), true);
});

test('getAgentDefinition resolves deyvin agent', () => {
  const agent = getAgentDefinition('deyvin');
  assert.equal(Boolean(agent), true);
  assert.equal(agent.id, 'deyvin');
  assert.equal(agent.displayName, 'Deyvin');
  assert.equal(agent.output.includes('continuity'), true);
});

test('getAgentDefinition keeps pair as a compatibility alias', () => {
  const agent = getAgentDefinition('pair');
  assert.equal(Boolean(agent), true);
  assert.equal(agent.id, 'deyvin');
  assert.equal(agent.command, '@deyvin');
});

test('getAgentDefinition resolves profiler-forge agent', () => {
  const agent = getAgentDefinition('profiler-forge');
  assert.equal(Boolean(agent), true);
  assert.equal(agent.id, 'profiler-forge');
  assert.equal(agent.output.includes('.aioson/advisors/{person-slug}-advisor.md'), true);
});

test('getAgentDefinition resolves briefing-refiner agent', () => {
  const agent = getAgentDefinition('briefing-refiner');
  assert.equal(Boolean(agent), true);
  assert.equal(agent.id, 'briefing-refiner');
  assert.equal(agent.command, '@briefing-refiner');
  assert.equal(agent.output.includes('refinement-feedback.json'), true);
});

test('buildAgentPrompt includes target output', () => {
  const agent = getAgentDefinition('analyst');
  const prompt = buildAgentPrompt(agent, 'codex', {
    instructionPath: resolveInstructionPath(agent, 'pt-BR'),
    interactionLanguage: 'pt-BR',
    autonomyMode: 'trusted',
    capabilitySummary: 'Declared capabilities: analyze_requirements (analyze).'
  });
  assert.equal(prompt.includes(agent.output), true);
  assert.equal(prompt.includes('.aioson/agents/analyst.md'), true);
  assert.equal(prompt.includes('Autonomy Contract'), true);
  assert.equal(prompt.includes('Autonomy mode:** trusted'), true);
  assert.equal(prompt.includes('analyze_requirements'), true);
  assert.equal(prompt.includes('AIOSON Runtime boundary'), true);
  assert.equal(prompt.includes('All user-facing communication must be in pt-BR.'), true);
  assert.equal(prompt.includes('--agent=@analyst'), false);
  assert.equal(prompt.includes('aioson agent:prompt'), true);
});

test('buildAgentPrompt appends autopilot exception only when autoHandoff is true', () => {
  const agent = getAgentDefinition('analyst');
  const baseOptions = {
    instructionPath: resolveInstructionPath(agent, 'en'),
    interactionLanguage: 'en',
    autonomyMode: 'guarded'
  };
  const manualPrompt = buildAgentPrompt(agent, 'claude', baseOptions);
  assert.equal(manualPrompt.includes('autopilot-handoff.md'), false);

  const autopilotPrompt = buildAgentPrompt(agent, 'claude', { ...baseOptions, autoHandoff: true });
  assert.equal(autopilotPrompt.includes('.aioson/docs/autopilot-handoff.md'), true);
  assert.equal(autopilotPrompt.includes('post-dev review cycle'), true);
  assert.equal(autopilotPrompt.includes('feature:close'), true);
});

test('listAgentDefinitions returns non-empty list', () => {
  const list = listAgentDefinitions();
  assert.equal(list.length > 0, true);
});
