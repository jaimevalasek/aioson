'use strict';

// OpenCode has no shell hooks: the adapter is a plugin on its hook API that
// turns tool calls and replies into runtime events and hands a compacted
// session its checkpoint back. The generated file is loaded for real here and
// driven with the shapes @opencode-ai/plugin documents.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const {
  buildOpencodePlugin,
  configPaths,
  runHooksInstall,
  runHooksUninstall,
  OPENCODE_PLUGIN_SIGNATURE
} = require('../src/commands/hooks-install');
const { HEADER } = require('../src/lib/compaction-recap');

const CLI = path.join(__dirname, '..', 'bin', 'aioson.js');

function captureLogger() {
  const lines = [];
  return { lines, log: (line) => lines.push(String(line)), error: (line) => lines.push(String(line)) };
}

function makeProject() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aioson-oc-plugin-'));
  fs.mkdirSync(path.join(dir, '.aioson'), { recursive: true });
  fs.writeFileSync(path.join(dir, '.aioson', 'config.md'), '# project\n', 'utf8');
  return dir;
}

async function loadPlugin(dir, agent = 'dev') {
  const file = path.join(dir, 'aioson-plugin.mjs');
  fs.writeFileSync(file, buildOpencodePlugin(agent), 'utf8');
  const mod = await import(pathToFileURL(file).href);
  return mod.AiosonPlugin;
}

// The plugin spawns `aioson`; the suite points it at this checkout, and no
// inherited live session may capture the events.
async function withPluginEnv(fn) {
  const saved = {
    AIOSON_BIN: process.env.AIOSON_BIN,
    AIOSON_LIVE_SESSION_KEY: process.env.AIOSON_LIVE_SESSION_KEY,
    AIOSON_LIVE_SESSION: process.env.AIOSON_LIVE_SESSION
  };
  process.env.AIOSON_BIN = `node ${CLI}`;
  delete process.env.AIOSON_LIVE_SESSION_KEY;
  delete process.env.AIOSON_LIVE_SESSION;
  try {
    return await fn();
  } finally {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

test('buildOpencodePlugin bakes the agent in, signs the file and refuses shell-control names', () => {
  const source = buildOpencodePlugin('qa');
  assert.ok(source.startsWith(OPENCODE_PLUGIN_SIGNATURE));
  assert.match(source, /const AGENT = "qa";/);
  assert.match(source, /export const AiosonPlugin = async/);
  for (const hook of ['tool.execute.after', 'chat.message', 'experimental.text.complete', 'experimental.session.compacting', 'experimental.chat.system.transform']) {
    assert.ok(source.includes(`"${hook}"`), `hook ${hook} is wired`);
  }
  assert.throws(() => buildOpencodePlugin('dev; echo x'), /invalid agent name/);
});

test('the plugin records tool calls and replies, then gives a compacted session its checkpoint back, once', async () => {
  const dir = makeProject();
  try {
    await withPluginEnv(async () => {
      const AiosonPlugin = await loadPlugin(dir);
      const hooks = await AiosonPlugin({ directory: dir, worktree: dir, project: {}, client: null, $: null });

      await hooks['tool.execute.after'](
        { tool: 'write', sessionID: 's1', callID: 'c1', args: { filePath: path.join(dir, 'src', 'refund.js'), content: '' } },
        { title: 'refund.js', output: '', metadata: {} }
      );
      await hooks['tool.execute.after'](
        { tool: 'bash', sessionID: 's1', callID: 'c2', args: { command: 'npm test' } },
        { title: 'npm test', output: 'FAIL src/refund.test.js\n Tests  1 failed | 12 passed (13)', metadata: { exit: 1 } }
      );
      await hooks['tool.execute.after'](
        { tool: 'read', sessionID: 's1', callID: 'c3', args: { filePath: path.join(dir, 'README.md') } },
        { title: 'README.md', output: '', metadata: {} }
      );
      await hooks['experimental.text.complete'](
        { sessionID: 's1', messageID: 'm1', partID: 'p1' },
        { text: 'Corrigi o refund; falta o teste de borda.' }
      );

      const compacting = { context: [] };
      await hooks['experimental.session.compacting']({ sessionID: 's1' }, compacting);
      assert.equal(compacting.context.length, 1, 'the checkpoint goes into the compaction prompt');
      const checkpoint = compacting.context[0];
      assert.ok(checkpoint.startsWith(HEADER), checkpoint);
      assert.match(checkpoint, /Files changed, newest first: src\/refund\.js/);
      assert.doesNotMatch(checkpoint, /README/, 'reads are not recorded');
      assert.match(checkpoint, /Still failing \(latest run\): \$ npm test → FAIL src\/refund\.test\.js · Tests 1 failed \| 12 passed \(13\)/);
      assert.match(checkpoint, /Agent's last message \(its own claim\): Corrigi o refund/);

      await hooks.event({ event: { type: 'session.compacted', properties: { sessionID: 's1' } } });
      const system = { system: ['base prompt'] };
      await hooks['experimental.chat.system.transform']({ sessionID: 's1' }, system);
      assert.equal(system.system.length, 2, 'the first turn after the compaction gets the checkpoint');
      assert.ok(system.system[1].startsWith(HEADER));

      const again = { system: [] };
      await hooks['experimental.chat.system.transform']({ sessionID: 's1' }, again);
      assert.equal(again.system.length, 0, 'injected once per compaction');
      const other = { system: [] };
      await hooks['experimental.chat.system.transform']({ sessionID: 's2' }, other);
      assert.equal(other.system.length, 0, 'another session is untouched');
    });
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('edits through apply_patch (and the older patch) are recorded: GPT models in OpenCode edit with it', async (t) => {
  const dir = makeProject();
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  await withPluginEnv(async () => {
    const hooks = await (await loadPlugin(dir))({ directory: dir, worktree: dir });
    await hooks['tool.execute.after'](
      { tool: 'apply_patch', sessionID: 'p1', callID: 'c1', args: { patchText: '*** Begin Patch\n*** Update File: src/refund.js\n@@\n-a\n+b\n*** End Patch' } },
      { title: 'apply_patch', output: 'Success', metadata: { files: [{ type: 'update', filePath: path.join(dir, 'src', 'refund.js'), relativePath: 'src/refund.js' }] } }
    );
    await hooks['tool.execute.after'](
      { tool: 'patch', sessionID: 'p1', callID: 'c2', args: {} },
      { title: 'patch', output: 'Success', metadata: { files: [{ type: 'update', filePath: path.join(dir, 'src', 'other.js'), relativePath: 'src/other.js' }] } }
    );
    const compacting = { context: [] };
    await hooks['experimental.session.compacting']({ sessionID: 'p1' }, compacting);
    assert.match(compacting.context[0] || '', /Files changed, newest first: src\/other\.js, src\/refund\.js/, compacting.context[0]);
  });
});

test('the checkpoint speaks for the OpenCode session that compacted, not for another one on the project', async (t) => {
  const dir = makeProject();
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  await withPluginEnv(async () => {
    const hooks = await (await loadPlugin(dir))({ directory: dir, worktree: dir });
    const write = (session, file) => hooks['tool.execute.after']({ tool: 'write', sessionID: session, callID: file, args: { filePath: path.join(dir, file) } }, { title: '', output: '', metadata: {} });
    await write('s1', 'a.js');
    await write('s2', 'b.js');
    const compacting = { context: [] };
    await hooks['experimental.session.compacting']({ sessionID: 's1' }, compacting);
    assert.match(compacting.context[0] || '', /Files changed, newest first: a\.js/);
    assert.doesNotMatch(compacting.context[0] || '', /b\.js/);
  });
});

test('a hook never holds OpenCode: the telemetry is queued, and a compaction waits for the queue first', async (t) => {
  const dir = makeProject();
  const marker = path.join(dir, 'emits.log');
  const fake = path.join(dir, 'slow-aioson.js');
  fs.writeFileSync(fake, [
    "const fs = require('node:fs');",
    'const args = process.argv.slice(2);',
    "if (args[0] === 'hooks:recap') { process.stdout.write(JSON.stringify({ additionalContext: 'checkpoint' })); process.exit(0); }",
    `setTimeout(() => { fs.appendFileSync(${JSON.stringify(marker)}, args[0] + '\\n'); process.exit(0); }, 1500);`
  ].join('\n'), 'utf8');
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  await withPluginEnv(async () => {
    process.env.AIOSON_BIN = `node ${fake}`;
    const hooks = await (await loadPlugin(dir))({ directory: dir, worktree: dir });
    await hooks['tool.execute.after']({ tool: 'bash', sessionID: 'q1', callID: 'c1', args: { command: 'npm test' } }, { title: '', output: 'ok', metadata: { exit: 0 } });
    assert.equal(fs.existsSync(marker), false, 'the tool call returned before the event was written');
    const compacting = { context: [] };
    await hooks['experimental.session.compacting']({ sessionID: 'q1' }, compacting);
    assert.deepEqual(fs.readFileSync(marker, 'utf8').trim().split('\n'), ['hooks:emit', 'hooks:emit'], 'the queued event first, then the compaction marker');
    assert.deepEqual(compacting.context, ['checkpoint']);
  });
});

test('a project folder with a cmd metacharacter still gets its events (Windows runs the plugin through cmd.exe)', async (t) => {
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'aioson-oc-meta-'));
  const dir = path.join(parent, 'R&D-app');
  fs.mkdirSync(path.join(dir, '.aioson'), { recursive: true });
  fs.writeFileSync(path.join(dir, '.aioson', 'config.md'), '# project\n', 'utf8');
  t.after(() => fs.rmSync(parent, { recursive: true, force: true }));
  await withPluginEnv(async () => {
    const hooks = await (await loadPlugin(dir))({ directory: dir, worktree: dir });
    await hooks['tool.execute.after']({ tool: 'write', sessionID: 'm1', callID: 'c1', args: { filePath: path.join(dir, 'src', 'a.js') } }, { title: '', output: '', metadata: {} });
    const compacting = { context: [] };
    await hooks['experimental.session.compacting']({ sessionID: 'm1' }, compacting);
    assert.match(compacting.context[0] || '', /Files changed, newest first: src\/a\.js/);
  });
});

test('a directory without .aioson gets no hooks at all', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aioson-oc-none-'));
  try {
    const AiosonPlugin = await loadPlugin(dir);
    const hooks = await AiosonPlugin({ directory: dir, worktree: dir, project: {}, client: null, $: null });
    assert.deepEqual(hooks, {});
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('hooks:install --tool=opencode writes the plugin into the OpenCode config; uninstall removes only ours', async () => {
  const home = await fsp.mkdtemp(path.join(os.tmpdir(), 'aioson-oc-home-'));
  // The home redirected and the harnesses' own overrides cleared: nothing here
  // reads or writes the real ~/.config/opencode.
  const saved = { HOME: process.env.HOME, USERPROFILE: process.env.USERPROFILE, XDG_CONFIG_HOME: process.env.XDG_CONFIG_HOME, CODEX_HOME: process.env.CODEX_HOME, CLAUDE_CONFIG_DIR: process.env.CLAUDE_CONFIG_DIR };
  process.env.HOME = home;
  process.env.USERPROFILE = home;
  delete process.env.XDG_CONFIG_HOME;
  delete process.env.CODEX_HOME;
  delete process.env.CLAUDE_CONFIG_DIR;
  try {
    const pluginPath = configPaths().opencode;
    assert.equal(pluginPath, path.join(home, '.config', 'opencode', 'plugins', 'aioson.js'));

    const out = captureLogger();
    const installed = await runHooksInstall({ args: ['.'], options: { tool: 'opencode', agent: 'dev' }, logger: out });
    assert.equal(installed.ok, true);
    assert.ok((await fsp.readFile(pluginPath, 'utf8')).startsWith(OPENCODE_PLUGIN_SIGNATURE));
    assert.ok(out.lines.some((line) => /restart/i.test(line)), 'OpenCode loads plugins at startup');

    await fsp.writeFile(pluginPath, '// someone else\'s plugin\nexport const Mine = async () => ({});\n', 'utf8');
    const refused = await runHooksInstall({ args: ['.'], options: { tool: 'opencode', agent: 'dev' }, logger: captureLogger() });
    assert.equal(refused.results[0].skipped, 'foreign-file', 'a file that is not ours is never overwritten');
    const kept = await runHooksUninstall({ args: ['.'], options: { tool: 'opencode' }, logger: captureLogger() });
    assert.equal(kept.results[0].removed, false);
    assert.match(await fsp.readFile(pluginPath, 'utf8'), /someone else/);

    await fsp.unlink(pluginPath);
    await runHooksInstall({ args: ['.'], options: { tool: 'opencode', agent: 'dev' }, logger: captureLogger() });
    const removed = await runHooksUninstall({ args: ['.'], options: { tool: 'opencode' }, logger: captureLogger() });
    assert.equal(removed.results[0].removed, true);
    await assert.rejects(fsp.access(pluginPath));
  } finally {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    await fsp.rm(home, { recursive: true, force: true });
  }
});
