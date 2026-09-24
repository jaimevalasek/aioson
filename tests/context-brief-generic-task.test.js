'use strict';

/**
 * A workflow-only brief task ("implement {slug} from the approved PRD and
 * plan") routes no domain rule: keyword routing reads the task only, so the
 * form/listing/status rules a feature needs never reached must_load while the
 * brief still looked healthy. Measured on a consumer: 112 of 191 dev closes
 * had no brief since the previous close, 43 more were recorded under a
 * literal `'dev'` agent that escaped every kernel-bound check.
 *
 * Pins: the vocabulary detector, the brief gap + low confidence + PRD-title
 * booster, the brief_built payload flag, agent:done's consulted_generic state,
 * quote-stripped agent names, and context:usage's per-session flags.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const { analyzeTaskVocabulary } = require('../src/lib/task-vocabulary');
const { buildContextBrief } = require('../src/context-brief');
const { runContextBrief } = require('../src/commands/context-brief');
const { collectContextUsage } = require('../src/lib/context-usage');
const { openRuntimeDb, appendContextBriefEvent } = require('../src/runtime-store');
const { runAgentDone } = require('../src/commands/runtime');

const quiet = { log() {}, error() {}, warn() {} };

const CRUD_RULE = `---
name: registry-forms
description: Every create/edit surface keeps field parity and stable row identity
priority: 10
load_tier: trigger
modes: [planning, executing]
task_types: [crud, form, listing]
triggers: [edit form, create form, listing]
entities: [Form, Table]
---

# Registry forms

- Create and edit forms expose the same fields.
`;

async function makeProject() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'aioson-generic-task-'));
  const aioson = path.join(dir, '.aioson');
  await fs.mkdir(path.join(aioson, 'rules'), { recursive: true });
  await fs.mkdir(path.join(aioson, 'context'), { recursive: true });
  await fs.mkdir(path.join(aioson, 'agents'), { recursive: true });
  await fs.writeFile(path.join(aioson, 'rules', 'registry-forms.md'), CRUD_RULE);
  await fs.writeFile(
    path.join(aioson, 'context', 'prd-customer-registry.md'),
    '---\nfeature: customer-registry\n---\n\n# PRD — Customer registry with listing and edit form\n\n## Vision\n\nText.\n'
  );
  await fs.writeFile(path.join(aioson, 'agents', 'dev.md'), '# Dev\n\nRun `aioson context:brief . --agent=dev` first.\n');
  return dir;
}

test('workflow-only tasks are generic in English and pt-BR; domain words and domain hyphenations are not', () => {
  const slugs = ['customer-registry'];
  for (const task of [
    'implement customer-registry from the approved PRD and plan',
    'implement {slug} from the approved PRD and plan',
    'verify customer-registry against the approved PRD and real application',
    'implementar a feature customer-registry conforme o PRD aprovado e o plano',
    'create the executable plan for customer-registry'
  ]) {
    assert.equal(analyzeTaskVocabulary(task, { featureSlugs: slugs }).generic, true, task);
  }
  const domain = analyzeTaskVocabulary('implement drag-and-drop between status columns', { featureSlugs: slugs });
  assert.equal(domain.generic, false);
  assert.ok(domain.content_terms.includes('drag-and-drop'));
  assert.equal(analyzeTaskVocabulary('implementar formulário de edição do cadastro', { featureSlugs: slugs }).generic, false);
  assert.equal(analyzeTaskVocabulary('', {}).generic, false, 'an empty task is missing_task, not generic');
});

test('a generic brief reports generic_task at low confidence and boosts only with the PRD title', async () => {
  const dir = await makeProject();
  try {
    const generic = await buildContextBrief(dir, {
      agent: 'dev', mode: 'executing', feature: 'customer-registry', noSemantic: true,
      task: 'implement customer-registry from the approved PRD and plan'
    });
    assert.equal(generic.task_vocabulary.generic, true);
    assert.equal(generic.task_vocabulary.augmented_with, 'Customer registry with listing and edit form');
    assert.ok(generic.gaps.some((gap) => gap.code === 'generic_task'));
    assert.equal(generic.confidence, 'low');
    assert.equal(generic.task, 'implement customer-registry from the approved PRD and plan', 'the reported task is the one the agent wrote');
    assert.ok(generic.must_load.some((item) => item.path.endsWith('registry-forms.md')), 'the PRD title names the listing and edit form');

    const domain = await buildContextBrief(dir, {
      agent: 'dev', mode: 'executing', feature: 'customer-registry', noSemantic: true,
      task: 'build the customer edit form and listing table', paths: 'src/customers/form.js'
    });
    assert.equal(domain.task_vocabulary.generic, false);
    assert.equal(domain.task_vocabulary.augmented_with, null);
    assert.ok(!domain.gaps.some((gap) => gap.code === 'generic_task'));
    assert.ok(domain.must_load.some((item) => item.path.endsWith('registry-forms.md')));
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test('agent:done tells a generic-only consultation apart and strips literal quotes from the agent name', async () => {
  const dir = await makeProject();
  try {
    await openRuntimeDb(dir).then(({ db }) => db.close());
    await runContextBrief({
      args: [dir],
      options: { agent: 'dev', mode: 'executing', task: 'implement customer-registry from the approved PRD and plan', 'no-semantic': true, json: true },
      logger: quiet
    });
    const lines = [];
    const done = await runAgentDone({ args: [dir], options: { agent: "'dev'", summary: 'done' }, logger: { log: (line) => lines.push(line), error() {}, warn() {} } });
    assert.equal(done.ok, true);
    assert.equal(done.agent, '@dev', 'cmd.exe quotes never become a separate agent');
    assert.equal(done.context_brief.required, true);
    assert.equal(done.context_brief.state, 'consulted_generic');
    assert.ok(lines.some((line) => /workflow-only task/.test(line)));
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test('context:usage counts closes without a brief per session, even for an agent that briefs sometimes', async () => {
  const dir = await makeProject();
  try {
    const t0 = Date.parse('2026-09-20T10:00:00.000Z');
    const at = (hours) => new Date(t0 + hours * 3_600_000).toISOString();
    const { db } = await openRuntimeDb(dir);
    try {
      appendContextBriefEvent(db, { agentName: 'dev', payload: { mode: 'executing', must_load: [], generic_task: false }, createdAt: at(0) });
      appendContextBriefEvent(db, { agentName: 'dev', payload: { mode: 'executing', must_load: [], generic_task: true }, createdAt: at(3) });
    } finally {
      db.close();
    }
    // Four closes: after the domain brief, after nothing, after nothing (two
    // hours later), after the generic brief. The legacy quoted name counts too.
    const agents = ['dev', "'dev'", 'dev', 'dev'];
    for (const agent of agents) {
      await runAgentDone({ args: [dir], options: { agent, summary: 'phase', json: true }, logger: quiet });
    }
    const { db: db2 } = await openRuntimeDb(dir);
    try {
      const runs = db2.prepare("SELECT DISTINCT run_key FROM execution_events WHERE event_type IN ('agent_done','finished','failed','stage_completed') ORDER BY id").all();
      const hours = [1, 2, 2.5, 4];
      runs.forEach((row, index) => {
        db2.prepare('UPDATE execution_events SET created_at = ? WHERE run_key = ?').run(at(hours[index]), row.run_key);
      });
      // A legacy row written before the fix, with the quotes baked in.
      db2.prepare("UPDATE execution_events SET agent_name = ? WHERE run_key = ?").run("@'dev'", runs[1].run_key);
    } finally {
      db2.close();
    }

    const report = await collectContextUsage(dir, { since: 3650 });
    const dev = report.agents.find((entry) => entry.agent === 'dev');
    assert.ok(!report.agents.some((entry) => entry.agent.includes("'")), 'quoted legacy rows fold into the real agent');
    assert.equal(dev.dones, 4);
    assert.equal(dev.dones_without_brief, 2, 'the closes at 2h and 2.5h had no brief since the previous close (30 min apart: separate sessions)');
    assert.equal(dev.dones_with_generic_brief_only, 1);
    assert.deepEqual(report.flags.done_without_brief, [], 'dev briefed sometimes, so the zero-brief flag stays silent');
    assert.deepEqual(report.flags.sessions_without_brief, [{ agent: 'dev', dones: 4, without_brief: 2 }]);
    assert.deepEqual(report.flags.generic_brief_sessions, [{ agent: 'dev', dones: 4, generic_only: 1 }]);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});
