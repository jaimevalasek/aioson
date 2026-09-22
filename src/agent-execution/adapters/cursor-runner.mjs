#!/usr/bin/env node
/**
 * Headless Cursor agent runner for AIOSON lane workers.
 * Spawned as: node cursor-runner.mjs [flags]  (prompt on stdin)
 *
 * Requires Node >= 22.13 and @cursor/sdk (optional dependency of aioson).
 * Auth: CURSOR_API_KEY
 */

import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { applyProjectEnv } = require('../../lib/project-env.js');

const RUNNER_VERSION = '1.0.0';
const MIN_NODE = [22, 13, 0];

function nodeAtLeast(current, required) {
  for (let i = 0; i < 3; i += 1) {
    const have = Number(current[i] || 0);
    const need = Number(required[i] || 0);
    if (have > need) return true;
    if (have < need) return false;
  }
  return true;
}

function parseArgs(argv) {
  const out = { model: 'composer-2.5', permissionMode: 'yolo', dirs: [], jsonl: true, version: false };
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--version') out.version = true;
    else if (arg === '--model') out.model = argv[++i];
    else if (arg === '--permission-mode') out.permissionMode = argv[++i];
    else if (arg === '--add-dir') out.dirs.push(argv[++i]);
    else if (arg === '--jsonl') out.jsonl = true;
    else if (arg === '--no-jsonl') out.jsonl = false;
  }
  return out;
}

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf8');
}

function emit(obj, jsonl) {
  if (!jsonl) return;
  process.stdout.write(`${JSON.stringify(obj)}\n`);
}

async function loadSdk() {
  try {
    return await import('@cursor/sdk');
  } catch (error) {
    const message = error && error.code === 'ERR_MODULE_NOT_FOUND'
      ? '@cursor/sdk is not installed — run: npm install @cursor/sdk'
      : (error?.message || String(error));
    process.stderr.write(`${message}\n`);
    process.exit(1);
  }
}

async function main() {
  const args = parseArgs(process.argv);
  const sdk = await loadSdk();
  const { Agent, CursorAgentError } = sdk;

  if (args.version) {
    let sdkVersion = 'unknown';
    try {
      const { createRequire } = await import('node:module');
      sdkVersion = createRequire(import.meta.url)('@cursor/sdk/package.json').version;
    } catch { /* optional dependency may be absent */ }
    process.stdout.write(`aioson-cursor-runner ${RUNNER_VERSION} (@cursor/sdk ${sdkVersion})\n`);
    process.exit(0);
  }

  const nodeParts = process.versions.node.split('.').map(Number);
  if (!nodeAtLeast(nodeParts, MIN_NODE)) {
    process.stderr.write(`Cursor SDK requires Node >= ${MIN_NODE.join('.')} (current ${process.versions.node})\n`);
    process.exit(1);
  }

  applyProjectEnv(process.cwd());
  const apiKey = String(process.env.CURSOR_API_KEY || '').trim();
  if (!apiKey) {
    process.stderr.write('CURSOR_API_KEY is required for cursor execution hosts\n');
    process.exit(1);
  }

  const prompt = await readStdin();
  const cwd = process.cwd();
  const readOnly = args.permissionMode === 'read-only' || args.permissionMode === 'plan';
  const modelId = args.model === 'configured-default' ? 'composer-2.5' : args.model;
  // Cursor SDK sandboxing is not available on Windows; read-only probes still
  // run with autoReview off and sandbox disabled so host:signature can pass.
  const sandboxEnabled = readOnly && process.platform !== 'win32';

  const local = {
    cwd,
    ...(args.dirs.length ? { dirs: args.dirs } : {}),
    settingSources: [],
    autoReview: !readOnly,
    sandboxOptions: { enabled: sandboxEnabled },
    enableAgentRetries: true
  };

  const options = {
    apiKey,
    model: { id: modelId },
    local
  };

  try {
    const agent = await Agent.create(options);
    try {
      const run = await agent.send(prompt);
      for await (const event of run.stream()) {
        emit(event, args.jsonl);
      }
      const result = await run.wait();
      if (result?.usage) {
        emit({ type: 'aioson_usage', usage: result.usage }, args.jsonl);
      }
      if (result?.status === 'finished') {
        process.exit(0);
      }
      process.stderr.write(`cursor run status: ${result?.status || 'unknown'}\n`);
      process.exit(2);
    } finally {
      await agent.close?.();
      await agent[Symbol.asyncDispose]?.().catch(() => {});
    }
  } catch (error) {
    if (CursorAgentError && error instanceof CursorAgentError) {
      process.stderr.write(`${error.message}\n`);
      process.exit(1);
    }
    throw error;
  }
}

main().catch((error) => {
  process.stderr.write(String(error?.message || error));
  process.exit(1);
});
