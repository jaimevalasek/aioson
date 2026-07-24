'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { heuristicDecompose } = require('../src/squad/task-decomposer');

test('AC-premium-05 decomposition records owner reviewer decision rights and contribution', () => {
  const executors = [
    {
      slug: 'domain-researcher',
      role: 'Senior researcher',
      type: 'agent',
      persistent: true,
      contribution: 'Own source discovery',
      keywords: ['researcher', 'research', 'source'],
      skills: []
    },
    {
      slug: 'quality-reviewer',
      role: 'Independent quality reviewer',
      type: 'reviewer',
      persistent: true,
      contribution: 'Veto unsupported claims',
      keywords: ['reviewer', 'quality', 'validator'],
      skills: []
    }
  ];
  const plan = heuristicDecompose(
    'Research current sources; write the source-grounded recommendation; review every claim',
    executors
  );

  assert.ok(plan.tasks.length >= 3);
  for (const task of plan.tasks) {
    assert.ok(task.owner);
    assert.ok(task.reviewer);
    assert.notEqual(task.owner, task.reviewer);
    assert.equal(task.decision_right.owner, 'final');
    assert.equal(task.decision_right.reviewer, 'veto-on-quality-failure');
    assert.ok(task.contribution);
  }
  assert.deepEqual(plan.composition.persistent_core.sort(), ['domain-researcher', 'quality-reviewer']);
});

test('AC-premium-07 capability gap adds a task-bound specialist without inflating persistent core', () => {
  const executors = [{
    slug: 'integration-owner',
    role: 'Coordinator',
    type: 'agent',
    persistent: true,
    contribution: 'Integrate final output',
    keywords: ['coordinator'],
    skills: []
  }];
  const plan = heuristicDecompose(
    'Analyze quantum error correction benchmarks for the recommendation',
    executors
  );
  const task = plan.tasks[0];

  assert.equal(task.owner, 'integration-owner');
  assert.equal(task.specialist.persistent, false);
  assert.equal(task.specialist.integration_owner, 'integration-owner');
  assert.deepEqual(plan.composition.persistent_core, ['integration-owner']);
  assert.equal(plan.composition.ephemeral_specialists.length, 1);
  assert.equal(plan.composition.ephemeral_specialists[0].slug, task.specialist.slug);
});

test('Portuguese task verbs select research and review expertise', () => {
  const executors = [
    { slug: 'pesquisador', role: 'Senior researcher', type: 'agent', keywords: ['researcher'], skills: [] },
    { slug: 'revisor', role: 'Quality reviewer', type: 'reviewer', keywords: ['reviewer'], skills: [] }
  ];
  const plan = heuristicDecompose(
    'Pesquisar fontes atuais; revisar as afirmações encontradas',
    executors
  );

  assert.equal(plan.tasks[0].owner, 'pesquisador');
  assert.equal(plan.tasks[1].owner, 'revisor');
});
