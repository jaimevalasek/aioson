'use strict';

/**
 * The craft docs must reach the agents that build visuals — measured against
 * the SHIPPED docs and rules, for the tasks those agents really run.
 *
 * `visual-effects.md` carried the CSS vocabulary (radial wash, glass, conic
 * ring, grain, drift) but declared `modes: [executing]` and source-only paths,
 * so a refiner building `.aioson/briefings/{slug}/prototype.html` in planning
 * mode got it as broad recall at best — while two unrelated interaction rules
 * reached must_load on semantic recall alone. Reachability is a frontmatter
 * contract; this test pins it.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const { buildContextBrief } = require('../src/context-brief');

const ROOT = path.resolve(__dirname, '..');

async function shippedProject() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'aioson-docs-reach-'));
  await fs.mkdir(path.join(dir, '.aioson', 'context'), { recursive: true });
  await fs.writeFile(path.join(dir, '.aioson', 'context', 'project.context.md'), [
    '---',
    'framework: Node.js',
    'project_type: web-app',
    'conversation_language: pt-BR',
    'load_tier: always',
    '---',
    '# Project'
  ].join('\n'), 'utf8');
  await fs.cp(path.join(ROOT, 'template', '.aioson', 'docs'), path.join(dir, '.aioson', 'docs'), { recursive: true });
  await fs.cp(path.join(ROOT, 'template', '.aioson', 'rules'), path.join(dir, '.aioson', 'rules'), { recursive: true });
  return dir;
}

const paths = (list) => (list || []).map((item) => item.path);

test('the effects vocabulary reaches the refiner building a prototype, and the dev implementing the hero', async () => {
  const dir = await shippedProject();
  try {
    const task = 'build the landing prototype hero: display typography at 120px, a radial wash glow background with ambient drift, glass nav, entrance reveals, premium dark cinematic register';
    const refiner = await buildContextBrief(dir, { agent: 'refiner', mode: 'planning', task, paths: '.aioson/briefings/landing/prototype.html' });
    const loaded = [...paths(refiner.must_load), ...paths(refiner.should_load)];
    assert.ok(loaded.includes('.aioson/docs/design/visual-effects.md'), `refiner: ${loaded.join(', ')}`);
    assert.ok(loaded.includes('.aioson/docs/briefing/prototype-and-delegation.md'), `refiner: ${loaded.join(', ')}`);
    // Interaction rules that merely share the words "build"/"prototype" are
    // read on demand, never law for a landing page.
    const must = paths(refiner.must_load);
    assert.equal(must.includes('.aioson/rules/status-flow-drag-and-drop.md'), false, must.join(', '));
    assert.equal(must.includes('.aioson/rules/management-home-widgets.md'), false, must.join(', '));

    for (const agent of ['dev']) {
      const brief = await buildContextBrief(dir, { agent, mode: 'executing', task: 'implement the hero section with a glow background, grain texture and an entrance reveal animation', paths: 'src/components/Hero.tsx' });
      const docs = [...paths(brief.must_load), ...paths(brief.should_load)];
      assert.ok(docs.includes('.aioson/docs/design/visual-effects.md'), `${agent}: ${docs.join(', ')}`);
      assert.ok(docs.includes('.aioson/docs/dev/visual-implementation.md'), `${agent}: ${docs.join(', ')}`);
    }
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test('a rule reaches must_load on a hard signal only; semantic recall alone demotes it to should_load', async () => {
  const dir = await shippedProject();
  try {
    // A kanban board component: paths/entities/triggers hit → law.
    const board = await buildContextBrief(dir, { agent: 'dev', mode: 'executing', task: 'add drag and drop between kanban board columns so a card moves to the next stage', paths: 'src/ui/KanbanBoard.tsx' });
    assert.ok(paths(board.must_load).includes('.aioson/rules/status-flow-drag-and-drop.md'), paths(board.must_load).join(', '));
    // A changelog note that only shares generic words → read on demand.
    const note = await buildContextBrief(dir, { agent: 'dev', mode: 'executing', task: 'write the release note for this build of the prototype briefing', paths: 'CHANGELOG.md' });
    assert.equal(paths(note.must_load).includes('.aioson/rules/management-home-widgets.md'), false, paths(note.must_load).join(', '));
    assert.equal(paths(note.must_load).includes('.aioson/rules/status-flow-drag-and-drop.md'), false, paths(note.must_load).join(', '));
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});
