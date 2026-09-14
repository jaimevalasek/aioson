'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', 'template', '.aioson', 'skills', 'process', 'decision-presentation');

test('decision-presentation keeps its hot path compact without losing decision safeguards', async () => {
  const [kernel, diagnostics] = await Promise.all([
    fs.readFile(path.join(ROOT, 'SKILL.md'), 'utf8'),
    fs.readFile(path.join(ROOT, 'references', 'compatibility-and-doctor.md'), 'utf8')
  ]);

  assert.equal(kernel.length < 7000, true, `decision-presentation kernel is ${kernel.length} chars`);
  assert.match(kernel, /Rule 1[\s\S]*Rule 2[\s\S]*Rule 3[\s\S]*Rule 4[\s\S]*Rule 5[\s\S]*Rule 6[\s\S]*Rule 7/i);
  assert.match(kernel, /one per turn|one question per turn/i);
  assert.match(kernel, /recommended first option/i);
  assert.match(kernel, /pause option/i);
  assert.match(kernel, /jargon-map\.\{interaction_language\}\.yaml/i);
  assert.match(kernel, /No question without a blocked decision/i);
  assert.match(kernel, /compatibility-and-doctor\.md.*only when/is);
  assert.match(diagnostics, /jargon_leak_detection[\s\S]*warning/i);
  assert.match(diagnostics, /profile: beginner[\s\S]*profile: creator/i);
});

test('Product loads the decision contract before asking in every profile, including developer', async () => {
  const projectRoot = path.resolve(__dirname, '..');
  for (const base of ['template/.aioson', '.aioson']) {
    const read = (file) => fs.readFile(path.join(projectRoot, base, file), 'utf8');
    const [product, playbook, decision] = await Promise.all([
      read('agents/product.md'), read('docs/product/conversation-playbook.md'),
      read('skills/process/decision-presentation/SKILL.md')
    ]);
    assert.match(product, /Before any user-facing decision[^\n]*decision-presentation\/SKILL\.md/);
    assert.match(product, /recommended first option/);
    assert.match(playbook, /every profile[^\n]*concrete options[^\n]*recommended option first/i);
    assert.match(decision, /\| `developer` \|[^\n]*recommended first option/);
    assert.match(decision, /structured question tool[^\n]*every profile/);
    assert.match(decision, /Product always presents one decision at a time/);
    assert.match(decision, /If unavailable[^\n]*numbered options[^\n]*recommendation/);
    assert.doesNotMatch(decision, /recommendation optional|Structured decisions in creator mode/);
  }
});

test('continuity and prompt repair cannot invent a default Analyst gate', async () => {
  const projectRoot = path.resolve(__dirname, '..');
  for (const base of ['template/.aioson', '.aioson']) {
    const recovery = await fs.readFile(path.join(projectRoot, base, 'docs/deyvin/continuity-recovery.md'), 'utf8');
    const sharpener = await fs.readFile(path.join(projectRoot, base, 'skills/process/prompt-sharpener/SKILL.md'), 'utf8');
    assert.doesNotMatch(recovery, /discovery\.md[^\n]*missing[^\n]*stop and hand off/);
    assert.match(recovery, /missing `discovery\.md` is not a gate/);
    assert.match(recovery, /@analyst[^\n]*explicitly requested/);
    assert.doesNotMatch(sharpener, /requirements drift -> `@analyst`/);
    assert.match(sharpener, /requirements drift -> `@product`/);
  }
});
