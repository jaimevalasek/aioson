'use strict';

const fs = require('fs');

// Why two paths. fs.writeSync on a Windows console handle goes through
// WriteFile, so the console decodes our UTF-8 bytes with its legacy codepage
// (cp850/cp437) and renders mojibake: ✓ becomes Ô£ô, — becomes ÔÇö, and every
// pt-BR accent breaks. TTY streams write through the console's Unicode API
// instead, which renders correctly under any codepage — and the CLI never
// calls process.exit(), so pending TTY writes always flush before the process
// ends. Pipes and files keep a raw fd write: bytes pass through untouched and
// delivery is synchronous even where stream writes are not (POSIX pipes),
// which automation consuming --json output relies on.
//
// "Synchronous" has to be earned on POSIX. Creating process.stdout for a pipe
// — which reading `stream.isTTY` already does — makes libuv switch the shared
// fd to O_NONBLOCK, and from then on one raw write either lands partially or
// throws EAGAIN whenever the reader is slower than the writer: a busy harness
// got `--help` cut after 163 lines, and a 1.2 MB `--json` payload arrived as
// its first 64 KB with no error at all. So the fd path writes until the whole
// buffer is delivered, waiting for the reader on EAGAIN instead of dropping
// the rest. Windows pipes are blocking and never take the wait.
const WAIT_CELL = new Int32Array(new SharedArrayBuffer(4));
const EAGAIN_WAIT_MS = 1;

function writeAllSync(fd, text) {
  const buffer = Buffer.from(text, 'utf8');
  let offset = 0;
  while (offset < buffer.length) {
    let written = 0;
    try {
      written = fs.writeSync(fd, buffer, offset, buffer.length - offset);
    } catch (error) {
      if (error.code !== 'EAGAIN') throw error;
    }
    if (written > 0) offset += written;
    else Atomics.wait(WAIT_CELL, 0, 0, EAGAIN_WAIT_MS);
  }
}

function writeThrough(stream, fd, text) {
  if (stream.isTTY) stream.write(text);
  else writeAllSync(fd, text);
}

module.exports = { writeThrough, writeAllSync };
