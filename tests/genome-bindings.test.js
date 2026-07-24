'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  attachBindingsToExecutors,
  flattenGenomeBindings,
  mergeGenomeBindings,
  normalizeGenomeBindings,
  resolveExecutorGenomes
} = require('../src/genomes/bindings');

test('normalizeGenomeBindings accepts legacy manifest array with squad and executor scopes', () => {
  const bindings = normalizeGenomeBindings([
    { slug: 'copywriting', scope: 'squad', priority: 110 },
    { slug: 'storytelling', scope: 'agent', agentSlug: 'Roteirista Viral', priority: 120 },
    'audience-research'
  ]);

  assert.equal(bindings.squad.length, 2);
  assert.deepEqual(bindings.squad.map((item) => item.slug), ['copywriting', 'audience-research']);
  assert.equal(bindings.executors['roteirista-viral'].length, 1);
  assert.equal(bindings.executors['roteirista-viral'][0].slug, 'storytelling');

  const flattened = flattenGenomeBindings(bindings);
  assert.equal(flattened.filter((item) => item.scope === 'squad').length, 2);
  assert.equal(flattened.filter((item) => item.scope === 'executor').length, 1);
});

test('mergeGenomeBindings keeps explicit structured bindings over legacy executor genomes', () => {
  const merged = mergeGenomeBindings({
    blueprintBindings: {
      squad: [{ slug: 'copywriting', priority: 105 }],
      executors: {
        writer: [{ slug: 'storytelling', priority: 100 }]
      }
    },
    manifestBindings: {
      executors: {
        writer: [
          { slug: 'storytelling', type: 'function', priority: 120 },
          { slug: 'copy-ctr', priority: 110 }
        ]
      }
    },
    legacyExecutors: [
      {
        slug: 'writer',
        genomes: ['storytelling', 'legacy-voice']
      }
    ]
  });

  const writerBindings = resolveExecutorGenomes('writer', merged);
  assert.deepEqual(
    writerBindings.map((item) => item.slug),
    ['storytelling', 'copy-ctr', 'copywriting', 'legacy-voice']
  );
  assert.equal(writerBindings[0].type, 'function');
});

test('attachBindingsToExecutors applies squad-level bindings to each executor', () => {
  const genomeBindings = normalizeGenomeBindings({
    squad: [{ slug: 'base-context', priority: 100 }],
    executors: {
      reviewer: [{ slug: 'qa-pass', priority: 130 }]
    }
  });

  const executors = attachBindingsToExecutors(
    [
      { slug: 'writer', role: 'Writes content' },
      { slug: 'reviewer', role: 'Reviews content' }
    ],
    genomeBindings
  );

  assert.deepEqual(executors[0].genomes.map((item) => item.slug), ['base-context']);
  assert.deepEqual(executors[1].genomes.map((item) => item.slug), ['qa-pass', 'base-context']);
});

test('AC-premium-08 binding lifecycle and compilation identity survive normalization round-trip', () => {
  const pending = normalizeGenomeBindings({
    executors: {
      writer: [{
        slug: 'evidence-writing',
        status: 'pending',
        compilationId: null,
        sourceHash: 'abc123',
        dependencies: ['foundation'],
        conflicts: [],
        owner: 'writer',
        action: 'install foundation'
      }]
    }
  });
  const binding = pending.executors.writer[0];
  assert.equal(binding.status, 'pending');
  assert.equal(binding.compilationId, null);
  assert.equal(binding.sourceHash, 'abc123');
  assert.deepEqual(binding.dependencies, ['foundation']);
  assert.equal(binding.owner, 'writer');
  assert.equal(binding.action, 'install foundation');

  const roundTrip = normalizeGenomeBindings(JSON.parse(JSON.stringify(pending)));
  assert.deepEqual(roundTrip, pending);
});
