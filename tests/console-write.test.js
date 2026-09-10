'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');

const { writeThrough } = require('../src/lib/console-write');

// A Windows console decodes fd writes with its legacy codepage (cp850), so
// UTF-8 glyphs written through fs.writeSync render as mojibake (✓ → Ô£ô).
// TTY output must therefore go through the stream, which uses the console's
// Unicode API; only pipes/files keep the raw synchronous fd write.
test('writeThrough uses stream.write when the stream is a TTY', () => {
  const written = [];
  const fakeTty = { isTTY: true, write: (text) => written.push(text) };

  writeThrough(fakeTty, 99, 'hooks ✓ instalados — pt-BR\n');

  assert.deepEqual(written, ['hooks ✓ instalados — pt-BR\n']);
});

test('writeThrough writes synchronously to the fd when not a TTY', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aioson-console-write-'));
  const file = path.join(dir, 'out.txt');
  const fd = fs.openSync(file, 'w');
  const pipeLike = {
    isTTY: undefined,
    write() {
      throw new Error('non-TTY output must not go through the stream');
    }
  };

  try {
    writeThrough(pipeLike, fd, 'json para automação → síncrono\n');
    // Read back through the same fd before any close/flush: the write must
    // already be on the file, which is the synchronous-delivery guarantee
    // automation consuming --json depends on.
    assert.equal(
      fs.readFileSync(file, 'utf8'),
      'json para automação → síncrono\n'
    );
  } finally {
    fs.closeSync(fd);
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// The incident shape: on POSIX the child's stdout fd turns O_NONBLOCK as soon
// as process.stdout exists, so with a reader slower than the writer a raw
// writeSync threw EAGAIN a few hundred lines in (a harness saw `--help` end
// mid-list) and one large --json payload arrived as a bare prefix, silently.
// Both shapes must arrive whole on every platform.
test('writeThrough delivers every byte to a slow pipe reader — many lines and one large JSON payload', async () => {
  const modulePath = JSON.stringify(path.join(__dirname, '..', 'src', 'lib', 'console-write.js'));
  const script = [
    `const { writeThrough } = require(${modulePath});`,
    "for (let i = 0; i < 2000; i += 1) writeThrough(process.stdout, 1, `line ${i} ${'x'.repeat(90)}\\n`);",
    "writeThrough(process.stdout, 1, `${JSON.stringify({ items: Array.from({ length: 20000 }, (_, i) => ({ i, pad: 'y'.repeat(40) })) })}\\n`);"
  ].join('\n');
  const child = spawn(process.execPath, ['-e', script], { stdio: ['ignore', 'pipe', 'pipe'] });
  let stderr = '';
  child.stderr.on('data', (chunk) => { stderr += chunk; });
  const closed = new Promise((resolve) => child.on('close', resolve));

  // The slow consumer: nothing is read for a while, so the pipe fills up.
  await new Promise((resolve) => setTimeout(resolve, 600));
  const chunks = [];
  child.stdout.on('data', (chunk) => chunks.push(chunk));
  const code = await closed;

  assert.equal(code, 0, stderr);
  const lines = Buffer.concat(chunks).toString('utf8').split('\n');
  assert.equal(lines.filter((line) => line.startsWith('line ')).length, 2000);
  assert.equal(lines[1999].startsWith('line 1999 '), true);
  assert.equal(JSON.parse(lines[2000]).items.length, 20000);
  assert.equal(lines[2001], '');
});
