'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { createTranslator } = require('../src/i18n');
const { runAgentEpilogue } = require('../src/commands/agent-epilogue');
const { runReviewCycle } = require('../src/commands/review-cycle');
const { initManifest } = require('../src/agent-execution/manifest');

async function makeTempDir() {
  return fs.mkdtemp(path.join(os.tmpdir(), 'aioson-agent-ops-'));
}

async function writeFile(dir, relPath, content) {
  const full = path.join(dir, relPath);
  await fs.mkdir(path.dirname(full), { recursive: true });
  await fs.writeFile(full, content, 'utf8');
}

function makeLogger() {
  const lines = [];
  return {
    lines,
    log: (line = '') => lines.push(String(line)),
    error: (line = '') => lines.push(String(line))
  };
}

test('agent:epilogue updates pulse and registers agent completion', async () => {
  const dir = await makeTempDir();
  const { t } = createTranslator('en');
  const result = await runAgentEpilogue({
    args: [dir],
    options: {
      json: true,
      agent: 'analyst',
      feature: 'checkout',
      summary: 'Requirements mapped',
      next: '@architect',
      'no-dossier': true
    },
    logger: makeLogger(),
    t
  });

  assert.equal(result.ok, true);
  assert.equal(result.agent, '@analyst');
  assert.ok(result.steps.some((step) => step.name === 'pulse:update' && step.ok));
  assert.ok(result.steps.some((step) => step.name === 'agent:done' && step.ok));
  assert.equal(result.agent_done.auto_advance.skipped, 'no_active_workflow');

  const pulse = await fs.readFile(path.join(dir, '.aioson/context/project-pulse.md'), 'utf8');
  assert.match(pulse, /last_agent: analyst/);
  assert.match(pulse, /active_feature: checkout/);
  assert.match(pulse, /Requirements mapped/);
});

test('agent:prompt sheldon injects the RF-LEAN directive when workflow.config routes sheldon -> dev', async () => {
  const dir = await makeTempDir();
  const { runAgentPrompt } = require('../src/commands/agents');
  await writeFile(dir, '.aioson/context/project.context.md', '---\nclassification: SMALL\n---\n# Project\n');
  await writeFile(
    dir,
    '.aioson/context/workflow.config.json',
    JSON.stringify({ version: 1, feature: { SMALL: ['product', 'sheldon', 'dev', 'qa'] } })
  );

  const res = await runAgentPrompt({
    args: ['sheldon', dir],
    options: { headless: true, feature: 'demo' },
    logger: makeLogger(),
    t: () => undefined
  });

  assert.ok(res.prompt.includes('Active lane: LEAN'), 'lean directive must be injected');
  assert.ok(res.prompt.includes('RF-LEAN'));
  assert.ok(res.prompt.includes('spec-demo.md'));
});

test('agent:prompt sheldon does NOT inject the lean directive in the full chain (no config)', async () => {
  const dir = await makeTempDir();
  const { runAgentPrompt } = require('../src/commands/agents');
  await writeFile(dir, '.aioson/context/project.context.md', '---\nclassification: SMALL\n---\n# Project\n');

  const res = await runAgentPrompt({
    args: ['sheldon', dir],
    options: { headless: true, feature: 'demo' },
    logger: makeLogger(),
    t: () => undefined
  });

  assert.ok(!res.prompt.includes('Active lane: LEAN'), 'full chain must not inject the lean directive');
});

test('agent:epilogue emits an advisory contract:integrity step for a runtime dev completion without a contract', async () => {
  const dir = await makeTempDir();
  const { t } = createTranslator('en');
  const slug = 'runtime-untracked';
  // Runtime signal the framework can locate (prototype manifest), no contract.
  await writeFile(dir, `.aioson/briefings/${slug}/prototype-manifest.md`, '# Core interactions\n');

  const result = await runAgentEpilogue({
    args: [dir],
    options: {
      json: true,
      agent: 'dev',
      feature: slug,
      summary: 'Implemented the slice',
      'no-dossier': true
    },
    logger: makeLogger(),
    t
  });

  const advisory = result.steps.find((step) => step.name === 'contract:integrity');
  assert.ok(advisory, 'expected a contract:integrity advisory step');
  assert.equal(advisory.ok, false);
  assert.match(String(advisory.reason), /missing_runtime_contract/);
  // Advisory must never be promoted to a blocking error.
  assert.ok(!result.errors.some((e) => e.step === 'contract:integrity'));
});

test('agent:epilogue does not emit a contract:integrity step for a non dev/qa agent', async () => {
  const dir = await makeTempDir();
  const { t } = createTranslator('en');
  const slug = 'runtime-analyst';
  await writeFile(dir, `.aioson/briefings/${slug}/prototype-manifest.md`, '# Core interactions\n');

  const result = await runAgentEpilogue({
    args: [dir],
    options: { json: true, agent: 'analyst', feature: slug, summary: 'Mapped', 'no-dossier': true },
    logger: makeLogger(),
    t
  });

  assert.ok(!result.steps.some((step) => step.name === 'contract:integrity'));
});

test('agent:epilogue emits an advisory audit:code step for a dev completion with a HIGH anti-pattern in the diff', async () => {
  const { execFileSync } = require('node:child_process');
  const dir = await makeTempDir();
  const { t } = createTranslator('en');
  execFileSync('git', ['init', '-q'], { cwd: dir });
  execFileSync('git', ['config', 'user.email', 'a@b.c'], { cwd: dir });
  execFileSync('git', ['config', 'user.name', 'a'], { cwd: dir });
  // Untracked changed file carrying a HIGH anti-pattern (eval) — picked up by --changed.
  await writeFile(dir, 'src/bad.ts', 'export const r = eval("1+1");\n');

  const result = await runAgentEpilogue({
    args: [dir],
    options: { json: true, agent: 'dev', feature: 'feat-x', summary: 'did the slice', 'no-dossier': true },
    logger: makeLogger(),
    t
  });

  const audit = result.steps.find((step) => step.name === 'audit:code');
  assert.ok(audit, 'expected an audit:code advisory step');
  assert.equal(audit.ok, false);
  assert.match(String(audit.reason), /HIGH/);
  // Advisory only — never a blocking error, never flips ok.
  assert.ok(!result.errors.some((e) => e.step === 'audit:code'));
});

test('agent:epilogue: a clean diff never yields a failing audit:code advisory', async () => {
  const { execFileSync } = require('node:child_process');
  const dir = await makeTempDir();
  const { t } = createTranslator('en');
  execFileSync('git', ['init', '-q'], { cwd: dir });
  execFileSync('git', ['config', 'user.email', 'a@b.c'], { cwd: dir });
  execFileSync('git', ['config', 'user.name', 'a'], { cwd: dir });
  await writeFile(dir, 'src/clean.ts', 'export const add = (a: number, b: number): number => a + b;\n');

  const result = await runAgentEpilogue({
    args: [dir],
    options: { json: true, agent: 'dev', feature: 'feat-y', summary: 'clean slice', 'no-dossier': true },
    logger: makeLogger(),
    t
  });
  const audit = result.steps.find((step) => step.name === 'audit:code');
  assert.ok(!audit || audit.ok === true, 'a clean diff must not produce a failing audit:code advisory');
});

test('agent:epilogue does not emit an audit:code step for a non dev/qa agent', async () => {
  const { execFileSync } = require('node:child_process');
  const dir = await makeTempDir();
  const { t } = createTranslator('en');
  execFileSync('git', ['init', '-q'], { cwd: dir });
  execFileSync('git', ['config', 'user.email', 'a@b.c'], { cwd: dir });
  execFileSync('git', ['config', 'user.name', 'a'], { cwd: dir });
  await writeFile(dir, 'src/bad.ts', 'export const r = eval("1+1");\n');

  const result = await runAgentEpilogue({
    args: [dir],
    options: { json: true, agent: 'pm', feature: 'feat-z', summary: 'planned', 'no-dossier': true },
    logger: makeLogger(),
    t
  });
  assert.ok(!result.steps.some((step) => step.name === 'audit:code'));
});

test('agent:epilogue human output surfaces workflow auto-advance outcome', async () => {
  const dir = await makeTempDir();
  const { t } = createTranslator('en');
  const logger = makeLogger();
  const result = await runAgentEpilogue({
    args: [dir],
    options: {
      agent: 'analyst',
      feature: 'checkout',
      summary: 'Requirements mapped',
      'no-dossier': true
    },
    logger,
    t
  });

  assert.equal(result.ok, true);
  assert.ok(logger.lines.some((line) => /workflow skip: no_active_workflow/.test(line)));
});

test('review-cycle:advance uses agentic policy cap and stops at limit', async () => {
  const dir = await makeTempDir();
  await writeFile(
    dir,
    '.aioson/context/workflow-execute.json',
    JSON.stringify({
      agentic_policy: {
        enabled: true,
        review_cycle: {
          max_dev_qa_cycles: 2,
          max_tester_correction_cycles: 3,
          max_pentester_correction_cycles: 3
        }
      }
    }, null, 2)
  );

  const first = await runReviewCycle({
    args: [dir],
    options: { sub: 'advance', json: true, feature: 'checkout', plan: '.aioson/plans/checkout/corrections.md' },
    logger: makeLogger()
  });
  assert.equal(first.ok, true);
  assert.equal(first.action, 'invoke_dev');
  assert.equal(first.cycle, 1);
  assert.equal(first.max_cycles, 2);

  const second = await runReviewCycle({
    args: [dir],
    options: { sub: 'advance', json: true, feature: 'checkout', plan: '.aioson/plans/checkout/corrections.md' },
    logger: makeLogger()
  });
  assert.equal(second.cycle, 2);
  assert.equal(second.remaining_cycles, 0);

  const third = await runReviewCycle({
    args: [dir],
    options: { sub: 'advance', json: true, feature: 'checkout', plan: '.aioson/plans/checkout/corrections.md' },
    logger: makeLogger()
  });
  assert.equal(third.ok, true);
  assert.equal(third.action, 'stop_cycle_limit');
  assert.equal(third.reason, 'cycle_limit_reached');

  await assert.rejects(
    fs.access(path.join(dir, '.aioson/runtime/qa-dev-cycle.json')),
    { code: 'ENOENT' }
  );
});

test('review-cycle uses agent-execution selection and cycle limits before legacy policy', async () => {
  const dir = await makeTempDir();
  const created = await initManifest(dir, 'checkout', 'codex');
  created.manifest.cycle_limits.dev_qa = 1;
  await fs.writeFile(created.path, JSON.stringify(created.manifest, null, 2));
  await writeFile(
    dir,
    '.aioson/context/workflow-execute.json',
    JSON.stringify({
      agentic_policy: {
        enabled: true,
        review_cycle: { max_dev_qa_cycles: 5 }
      }
    })
  );
  await writeFile(dir, '.aioson/plans/checkout/corrections.md', '---\nstatus: open\n---\n# Corrections\n');

  const first = await runReviewCycle({
    args: [dir],
    options: {
      sub: 'advance',
      json: true,
      feature: 'checkout',
      plan: '.aioson/plans/checkout/corrections.md',
      source: 'qa',
      to: 'qa'
    },
    logger: makeLogger()
  });
  assert.equal(first.action, 'correct_locally');
  assert.equal(first.max_cycles, 1);

  const resolved = await runReviewCycle({
    args: [dir],
    options: {
      sub: 'resolve',
      json: true,
      feature: 'checkout',
      plan: '.aioson/plans/checkout/corrections.md',
      source: 'qa',
      to: 'qa'
    },
    logger: makeLogger()
  });
  assert.equal(resolved.action, 'invoke_qa');
  assert.equal(resolved.plan_update.reason, 'awaiting_independent_qa');
  const plan = await fs.readFile(path.join(dir, '.aioson/plans/checkout/corrections.md'), 'utf8');
  assert.match(plan, /status: open/);

  const stopped = await runReviewCycle({
    args: [dir],
    options: {
      sub: 'advance',
      json: true,
      feature: 'checkout',
      plan: '.aioson/plans/checkout/corrections.md',
      source: 'qa',
      to: 'qa'
    },
    logger: makeLogger()
  });
  assert.equal(stopped.action, 'stop_cycle_limit');
});

test('review-cycle respects a disabled target in agent-execution manifest', async () => {
  const dir = await makeTempDir();
  const created = await initManifest(dir, 'checkout', 'codex');
  created.manifest.agents.pentester.enabled = false;
  await fs.writeFile(created.path, JSON.stringify(created.manifest, null, 2));

  const result = await runReviewCycle({
    args: [dir],
    options: {
      sub: 'advance',
      json: true,
      feature: 'checkout',
      plan: '.aioson/context/security-findings-checkout.json',
      source: 'qa',
      to: 'pentester'
    },
    logger: makeLogger()
  });

  assert.equal(result.ok, true);
  assert.equal(result.action, 'stop_agent_disabled');
  assert.equal(result.reason, 'agent_disabled_in_execution_manifest');
});

test('review-cycle:resolve marks correction plan resolved and routes back to qa', async () => {
  const dir = await makeTempDir();
  await writeFile(
    dir,
    '.aioson/plans/checkout/corrections.md',
    '---\nstatus: open\n---\n\n# Corrections\n'
  );

  await runReviewCycle({
    args: [dir],
    options: { sub: 'advance', json: true, feature: 'checkout', plan: '.aioson/plans/checkout/corrections.md' },
    logger: makeLogger()
  });

  const resolved = await runReviewCycle({
    args: [dir],
    options: { sub: 'resolve', json: true, feature: 'checkout', plan: '.aioson/plans/checkout/corrections.md' },
    logger: makeLogger()
  });

  assert.equal(resolved.ok, true);
  assert.equal(resolved.action, 'invoke_qa');
  assert.equal(resolved.next_agent, 'qa');
  assert.equal(resolved.plan_update.ok, true);

  const plan = await fs.readFile(path.join(dir, '.aioson/plans/checkout/corrections.md'), 'utf8');
  assert.match(plan, /status: resolved/);
});

test('review-cycle:resolve does not write markdown frontmatter into non-markdown artifacts', async () => {
  const dir = await makeTempDir();
  const artifact = JSON.stringify({ findings: [{ id: 'SF-1', status: 'open' }] }, null, 2);
  await writeFile(dir, '.aioson/context/security-findings-checkout.json', artifact);

  await runReviewCycle({
    args: [dir],
    options: {
      sub: 'advance',
      json: true,
      source: 'pentester',
      feature: 'checkout',
      plan: '.aioson/context/security-findings-checkout.json'
    },
    logger: makeLogger()
  });

  const resolved = await runReviewCycle({
    args: [dir],
    options: {
      sub: 'resolve',
      json: true,
      source: 'pentester',
      feature: 'checkout',
      plan: '.aioson/context/security-findings-checkout.json'
    },
    logger: makeLogger()
  });

  assert.equal(resolved.ok, true);
  assert.equal(resolved.action, 'invoke_qa');
  assert.equal(resolved.plan_update.skipped, true);
  assert.equal(resolved.plan_update.reason, 'non_markdown_plan');

  const unchanged = await fs.readFile(path.join(dir, '.aioson/context/security-findings-checkout.json'), 'utf8');
  assert.equal(unchanged, artifact);
});
