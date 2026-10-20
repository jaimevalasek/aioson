'use strict';

// A dossier bootstrapped from a briefing (dossier:add-finding before any PRD)
// went through store.init, whose placeholders are hard-coded Portuguese and
// speak of a missing PRD: an English project got "_(preencher manualmente —
// PRD não encontrado …)_". The placeholder now follows the project's language.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const { runDossierAddFinding } = require('../src/commands/dossier');

const SLUG = 'due-dates';
// Headings @briefing did not take from the canonical schema: no Problem, no Proposed solution.
const BRIEFING = `---\nslug: ${SLUG}\n---\n\n# Briefing\n\n## Problem statement\n\nDeadlines are forgotten.\n\n## Solution\n\nAn optional due date.\n`;

async function bootstrap(t, language) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'aioson-cycle-dossier-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  for (const [rel, content] of Object.entries({
    '.aioson/context/project.context.md': `---\nproject_name: "demo"\nclassification: "SMALL"\nconversation_language: "${language}"\ninteraction_language: "${language}"\n---\n`,
    [`.aioson/briefings/${SLUG}/briefings.md`]: BRIEFING
  })) {
    await fs.mkdir(path.dirname(path.join(dir, rel)), { recursive: true });
    await fs.writeFile(path.join(dir, rel), content, 'utf8');
  }
  const result = await runDossierAddFinding({ args: [dir], options: { slug: SLUG, agent: 'briefing', section: 'Agent Trail', content: 'Briefing written', json: true } });
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(result.bootstrapped, true);
  return fs.readFile(path.join(dir, '.aioson', 'context', 'features', SLUG, 'dossier.md'), 'utf8');
}

test('an English project bootstrapped from its briefing gets English placeholders', async (t) => {
  const dossier = await bootstrap(t, 'en');
  const why = dossier.split('## Why')[1].split('## What')[0];
  const what = dossier.split('## What')[1].split('## Code Map')[0];
  for (const section of [why, what]) {
    assert.match(section, /not found — fill in manually/);
    assert.doesNotMatch(section, /preencher|PRD não encontrado/);
  }
});

test('a pt-BR project gets the pt-BR placeholder, without the misleading "PRD not found"', async (t) => {
  const dossier = await bootstrap(t, 'pt-BR');
  const why = dossier.split('## Why')[1].split('## What')[0];
  assert.match(why, /não encontrado — preencher manualmente/);
  assert.doesNotMatch(why, /PRD não encontrado/);
});
