'use strict';

// aioson memory:reflect-commit [.] --agent=<name> [--output=<path-to-json>] [--json]
//
// Reads the reflect manifest written by memory:reflect-prepare, accepts the
// agent's reflected output (as a JSON map of relative path → new content),
// validates it, and writes the approved files to .aioson/context/bootstrap/*.md.

const fs = require('node:fs/promises');
const path = require('node:path');
const { openRuntimeDb, logAgentEvent } = require('../runtime-store');
const { validate, readBootstrapSnapshot } = require('../memory-reflect-engine');
const { REFLECT_PROMPT_RELATIVE } = require('./memory-reflect-prepare');
const { stripInjectionChars } = require('../lib/llm-content-sanitizer');

async function readJsonFile(filePath) {
  const raw = await fs.readFile(filePath, 'utf8');
  return JSON.parse(raw);
}

async function readStdin() {
  if (process.stdin.isTTY) return '';
  return new Promise((resolve, reject) => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => { data += chunk; });
    process.stdin.on('end', () => resolve(data));
    process.stdin.on('error', reject);
  });
}

async function loadAgentOutput(options) {
  if (options.files && typeof options.files === 'object') {
    return { files: options.files };
  }
  if (options.output) {
    const outputPath = path.resolve(process.cwd(), String(options.output));
    return readJsonFile(outputPath);
  }
  const stdinData = await readStdin();
  if (stdinData.trim()) return JSON.parse(stdinData);
  throw new Error('memory:reflect-commit requires --output=<path> or JSON on stdin');
}

async function emitEvent(targetDir, agent, type, message, payload) {
  try {
    const { db, runtimeDir } = await openRuntimeDb(targetDir);
    try {
      await logAgentEvent(db, runtimeDir, {
        agentName: agent,
        message,
        type,
        meta: payload || undefined
      });
    } finally {
      db.close();
    }
  } catch {
    // best-effort
  }
}

async function runMemoryReflectCommit({ args, options = {}, logger }) {
  const targetDir = path.resolve(process.cwd(), args?.[0] || '.');
  const agent = String(options.agent || '').trim() || 'unknown';

  const manifestPath = path.join(targetDir, REFLECT_PROMPT_RELATIVE);
  let manifest;
  try {
    manifest = await readJsonFile(manifestPath);
  } catch {
    const message = `manifest not found at ${path.relative(targetDir, manifestPath)} — run memory:reflect-prepare first`;
    if (!options.json) logger.log(`✗ ${message}`);
    return { ok: false, error: 'missing_manifest', message };
  }

  let payload;
  try {
    payload = await loadAgentOutput(options);
  } catch (err) {
    if (!options.json) logger.log(`✗ ${err.message}`);
    return { ok: false, error: 'bad_input', message: err.message };
  }

  const files = (payload && payload.files) || {};
  const currentSnapshot = await readBootstrapSnapshot(targetDir);
  const result = validate({ manifest, files, currentSnapshot });

  if (!result.ok) {
    if (!options.json) {
      logger.log('✗ reflect-commit validation failed:');
      for (const err of result.errors) logger.log(`  - ${err}`);
    }
    await emitEvent(targetDir, agent, 'memory_reflect_failed', 'validation failed', {
      errors: result.errors,
      snapshot_hash: manifest.snapshot_hash
    });
    return { ok: false, error: 'validation_failed', errors: result.errors };
  }

  // SECURITY: defense in depth — even after validate() approves the paths,
  // verify that every resolved absolute path stays under the project's
  // bootstrap directory. validate() already rejects absolute paths and
  // `..` segments, but this is the second wall in case the manifest's
  // allowed_paths is ever extended beyond bootstrap/.
  const bootstrapRoot = path.resolve(targetDir, '.aioson/context/bootstrap');
  const written = [];
  for (const [relPath, content] of Object.entries(files)) {
    const absPath = path.resolve(targetDir, relPath);
    if (!absPath.startsWith(bootstrapRoot + path.sep) && absPath !== bootstrapRoot) {
      const msg = `refused write outside bootstrap/: ${relPath}`;
      if (!options.json) logger.log(`✗ ${msg}`);
      await emitEvent(targetDir, agent, 'memory_reflect_failed', msg, {
        attempted_path: relPath,
        resolved: absPath
      });
      return { ok: false, error: 'path_escape', message: msg };
    }
    // SF-project-22: scrub zero-width / bidi / HTML-comment injection carriers
    // from the LLM-authored content before it lands in bootstrap. Path
    // containment is already enforced above; this is the content layer of the
    // same defense pattern (SF-08/09).
    const safeContent = stripInjectionChars(content);
    await fs.mkdir(path.dirname(absPath), { recursive: true });
    await fs.writeFile(absPath, safeContent, 'utf8');
    written.push(relPath);
  }

  // remove the manifest — it's been consumed
  try { await fs.unlink(manifestPath); } catch { /* ignore */ }

  if (!options.json) {
    logger.log(`✓ reflect committed: ${written.length} file(s)`);
    for (const w of written) logger.log(`  - ${w}`);
  }

  await emitEvent(targetDir, agent, 'memory_reflect_committed', `wrote ${written.length} bootstrap file(s)`, {
    files: written,
    snapshot_hash: manifest.snapshot_hash,
    targets: manifest.targets
  });

  return { ok: true, written, manifest };
}

module.exports = {
  runMemoryReflectCommit
};
