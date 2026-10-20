'use strict';

// The refiner kernel asks `classify . --feature={slug}` whether to build a
// prototype — while refining, before any PRD exists. classify then exited 1
// with "No prd or requirements file found. Use --interactive or
// --feature=<slug>" although --feature was given. It now measures the briefing,
// and never rewrites it on --apply.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const { runClassify } = require('../src/commands/classify');

const BRIEFING = `---
slug: orders-board
---

# Briefing — Orders board

## Proposed solution

A Kanban board of orders: drag a card between columns to change its status, filter the list by customer, edit an order in a side panel.
`;

async function project() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'aioson-classify-briefing-'));
  await fs.mkdir(path.join(dir, '.aioson', 'briefings', 'orders-board'), { recursive: true });
  await fs.writeFile(path.join(dir, '.aioson', 'briefings', 'orders-board', 'briefings.md'), BRIEFING, 'utf8');
  return dir;
}

test('before a PRD, classify --feature reads the briefing instead of failing', async () => {
  const dir = await project();
  const result = await runClassify({ args: [dir], options: { json: true, feature: 'orders-board' }, logger: { log() {}, error() {} } });
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(result.source_file.replace(/\\/g, '/'), '.aioson/briefings/orders-board/briefings.md');
  assert.equal(typeof result.recommend_prototype, 'boolean');
});

test('--apply never rewrites the briefing', async () => {
  const dir = await project();
  const result = await runClassify({ args: [dir], options: { json: true, feature: 'orders-board', apply: true }, logger: { log() {}, error() {} } });
  assert.equal(result.ok, true);
  assert.equal(result.applied, false);
  assert.equal(await fs.readFile(path.join(dir, '.aioson', 'briefings', 'orders-board', 'briefings.md'), 'utf8'), BRIEFING);
});

test('with neither a PRD nor a briefing the message no longer asks for the flag that was given', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'aioson-classify-none-'));
  const result = await runClassify({ args: [dir], options: { json: true, feature: 'ghost' }, logger: { log() {}, error() {} } });
  assert.equal(result.reason, 'no_source');
  assert.doesNotMatch(result.message, /--feature=<slug>/);
});
