'use strict';

// The briefing kernel's own `dossier:add-finding` always failed — "Dossier not
// found … no prd-{slug}.md to bootstrap it from" — so @briefing's trail line
// vanished behind `|| true`. And when Product's first write did bootstrap the
// dossier, it stamped the project's tier instead of the PRD's.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const { runDossierAddFinding } = require('../src/commands/dossier');

async function project(t, files) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'dossier-briefing-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  for (const [rel, content] of Object.entries({ '.aioson/context/project.context.md': '---\nclassification: "MICRO"\n---\n', ...files })) {
    await fs.mkdir(path.dirname(path.join(dir, rel)), { recursive: true });
    await fs.writeFile(path.join(dir, rel), content, 'utf8');
  }
  return dir;
}

const add = (dir, agent) => runDossierAddFinding({
  args: [dir],
  options: { slug: 'due-dates', agent, section: 'Agent Trail', content: 'Briefing updated with risks and open questions', json: true }
});

test("@briefing's trail line bootstraps the dossier from the briefing before any PRD exists", async (t) => {
  const dir = await project(t, {
    '.aioson/briefings/due-dates/briefings.md': '---\nslug: due-dates\n---\n\n# Briefing\n\n## Problem\n\nDeadlines are forgotten.\n\n## Proposed solution\n\nOptional due date and an overdue view.\n'
  });
  const result = await add(dir, 'briefing');
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(result.bootstrapped, true);
  const dossier = await fs.readFile(path.join(dir, '.aioson/context/features/due-dates/dossier.md'), 'utf8');
  assert.match(dossier, /Deadlines are forgotten/);
  assert.match(dossier, /Briefing updated with risks and open questions/);
});

test("a dossier Product's first write bootstraps carries the PRD tier", async (t) => {
  const dir = await project(t, {
    '.aioson/context/prd-due-dates.md': '---\nfeature: due-dates\nclassification: MEDIUM\n---\n\n# PRD\n\n## Problem\n\nDeadlines are forgotten.\n'
  });
  assert.equal((await add(dir, 'product')).bootstrapped, true);
  const dossier = await fs.readFile(path.join(dir, '.aioson/context/features/due-dates/dossier.md'), 'utf8');
  assert.match(dossier, /^classification: MEDIUM$/m);
});
