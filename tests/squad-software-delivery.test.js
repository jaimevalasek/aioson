'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { spawnSync } = require('node:child_process');
const { readPreservedOutput } = require('../src/squad/delivery-artifacts');

test('software delivery requires its executable verifier and resumes without rebuilding accepted work', async t => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'aioson-software-delivery-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const squad = path.join(dir, '.aioson/squads/software');
  const session = path.join(squad, 'sessions/build-one');
  await fs.mkdir(session, { recursive: true });
  await fs.writeFile(path.join(squad, 'squad.manifest.json'), JSON.stringify({ slug: 'software', mode: 'software' }));
  for (const slug of ['builder', 'verifier']) {
    const folder = path.join(squad, 'workers', slug);
    await fs.mkdir(folder, { recursive: true });
    await fs.writeFile(path.join(folder, 'worker.json'), JSON.stringify({ slug, type: 'manual', retry: { attempts: 1 } }));
    const code = slug === 'builder' ? `
      const fs=require('node:fs'),path=require('node:path');
      const input=JSON.parse(process.argv[2]);
      fs.appendFileSync(path.join(input.project_dir,'builds.txt'),'build\\n');
      fs.writeFileSync(path.join(input.project_dir,'app.cjs'),"process.stdout.write('incorrect');");
      process.stdout.write(JSON.stringify({artifact:'app.cjs'}));
    ` : `
      const path=require('node:path'),{spawnSync}=require('node:child_process');
      const input=JSON.parse(process.argv[2]);
      const result=spawnSync(process.execPath,[path.join(input.project_dir,'app.cjs'),'21'],{encoding:'utf8'});
      if(result.status!==0 || result.stdout!=='42') {process.stderr.write('Entry point did not return 42');process.exit(1);}
      process.stdout.write(JSON.stringify({entry:'app.cjs',arguments:['21'],exit_code:result.status,stdout:result.stdout}));
    `;
    await fs.writeFile(path.join(folder, 'run.js'), code);
  }
  const tasks = [
    { id: 'build', executor: 'builder', status: 'pending', dependencies: [] },
    { id: 'verify', executor: 'verifier', status: 'pending', dependencies: ['build'] }
  ];
  await fs.writeFile(path.join(session, 'plan.json'), JSON.stringify({ session_id: 'build-one', squad_slug: 'software',
    goal: 'Build a CLI that doubles its numeric argument', tasks, parallel_groups: { 1: ['build'], 2: ['verify'] } }));
  const invoke = action => {
    const child = spawnSync(process.execPath, [path.resolve(__dirname, '../bin/aioson.js'), 'squad', action, dir,
      '--squad=software', '--session=build-one', '--no-gap-closure', '--json'], { encoding: 'utf8' });
    return { code: child.status, result: JSON.parse(child.stdout) };
  };
  const failed = invoke('run');
  assert.equal(failed.code, 1);
  assert.equal(failed.result.status, 'incomplete');
  const original = JSON.parse(await fs.readFile(path.join(session, 'plan.json'), 'utf8'));
  assert.equal(original.tasks[0].status, 'completed');
  assert.equal(original.tasks[1].status, 'failed');
  await fs.writeFile(path.join(dir, 'app.cjs'), "process.stdout.write(String(Number(process.argv[2])*2));");
  // Operator checked the failure and repaired the artifact. Explicitly rearm
  // only the side-effect-free verifier; resume must not replay failed effects.
  await require('../src/squad/task-decomposer').updateTaskStatus(dir, 'software', 'build-one', 'verify', 'pending');
  const resumed = invoke('resume');
  assert.equal(resumed.result.status, 'completed', JSON.stringify(resumed));
  const accepted = JSON.parse(await fs.readFile(path.join(session, 'plan.json'), 'utf8'));
  assert.deepEqual(accepted.tasks[0].result, original.tasks[0].result);
  assert.equal(await fs.readFile(path.join(dir, 'builds.txt'), 'utf8'), 'build\n');
  const receipt = await readPreservedOutput(dir, accepted.tasks[1].result.delivery_evidence);
  assert.deepEqual(receipt.output, { entry: 'app.cjs', arguments: ['21'], exit_code: 0, stdout: '42' });
});
