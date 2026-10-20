'use strict';

// In an `interaction_language: en` project the cycle printed Portuguese:
// briefing:approve ("✓ Briefing … aprovado. / Ative @product …"), the dossier
// bootstrap placeholder ("_(não encontrado — preencher manualmente)_") and the
// runtime task title ("Workflow do projeto"). They now follow the project's
// language; pt-BR projects keep the Portuguese wording.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const Database = require('better-sqlite3');

const { runBriefingApprove } = require('../src/commands/briefing');
const { writeBriefingRegistry } = require('../src/lib/refiner/briefing-registry');
const { initFromExisting } = require('../src/dossier/dossier-bootstrap');
const { syncWorkflowRuntime } = require('../src/execution-gateway');
const { createTranslator } = require('../src/i18n');

const PORTUGUESE = /aprovado|Ative @|não encontrado|preencher|Workflow do projeto|Workflow da feature/;

async function project(language) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), `aioson-i18n-${language}-`));
  await fs.mkdir(path.join(dir, '.aioson', 'context'), { recursive: true });
  await fs.writeFile(path.join(dir, '.aioson', 'context', 'project.context.md'), `---\nproject_name: "demo"\nclassification: "MICRO"\ninteraction_language: "${language}"\nconversation_language: "${language}"\n---\n`, 'utf8');
  return dir;
}

test('briefing:approve speaks the project language', async () => {
  for (const [language, expected] of [['en', /Briefing "demo" approved\./], ['pt-BR', /Briefing "demo" aprovado\./]]) {
    const dir = await project(language);
    await fs.mkdir(path.join(dir, '.aioson', 'briefings', 'demo'), { recursive: true });
    await fs.writeFile(path.join(dir, '.aioson', 'briefings', 'demo', 'briefings.md'), '---\nprototype: not_applicable\n---\n\n# Briefing\n', 'utf8');
    await writeBriefingRegistry(dir, { updated_at: '2026-10-20', briefings: [{ slug: 'demo', status: 'draft', source_plans: [], created_at: '2026-10-20', approved_at: null, prd_generated: null }] });
    const lines = [];
    const result = await runBriefingApprove({ args: [dir], options: { slug: 'demo' }, logger: { log: (m) => lines.push(m), error: (m) => lines.push(m) } });
    assert.equal(result.ok, true);
    assert.match(lines.join('\n'), expected);
    if (language === 'en') assert.doesNotMatch(lines.join('\n'), PORTUGUESE);
  }
});

test('a dossier bootstrapped in an English project has English placeholders', async () => {
  const dir = await project('en');
  const ctx = path.join(dir, '.aioson', 'context');
  await fs.writeFile(path.join(ctx, 'prd-demo.md'), '# PRD — demo\n\n## Problem\n\nDeadlines are forgotten.\n', 'utf8');
  const result = await initFromExisting({ slug: 'demo', contextDir: ctx, targetDir: dir });
  const dossier = await fs.readFile(result.path, 'utf8');
  assert.match(dossier, /_\(not found — fill in manually\)_/);
  assert.doesNotMatch(dossier, /não encontrado/);
});

test('the workflow runtime task title follows the project language', async () => {
  const dir = await project('en');
  await syncWorkflowRuntime(dir, { state: { mode: 'project', current: 'product' }, activationAgent: 'product', eventPayload: {} });
  const db = new Database(path.join(dir, '.aioson', 'runtime', 'aios.sqlite'), { readonly: true });
  try {
    const task = db.prepare("SELECT title, goal FROM tasks WHERE created_by = '@workflow'").get();
    assert.equal(task.title, 'Project workflow');
    assert.doesNotMatch(`${task.title} ${task.goal}`, PORTUGUESE);
  } finally {
    db.close();
  }
});

test('every locale carries the new keys, so no command prints a raw key', () => {
  for (const locale of ['en', 'pt-BR', 'es', 'fr']) {
    const { t } = createTranslator(locale);
    for (const key of ['briefing_approval.approved', 'briefing_approval.returned_many', 'dossier_bootstrap.not_found', 'workflow_runtime.task_title_project', 'cli.help_hooks_recap', 'cli.help_observe', 'cli.help_observation_list', 'cli.help_observation_resolve', 'cli.help_op_list']) {
      assert.notEqual(t(key), key, `${locale}: ${key}`);
    }
  }
});
