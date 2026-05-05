'use strict';

// scaffold:complete — Emite o evento `scaffold_complete` no `aios.sqlite` ativo
// para sinalizar a um runner externo (ex.: AIOSON Play) que o scaffolding foi
// concluído e o app está pronto para ser promovido (rename de drafts/{uuid}/
// para apps/{slug}/, gravação do manifest.json, etc.).
//
// Schema do evento:
//   event_type: 'scaffold_complete'
//   payload: { slug, manifest, scaffold_path }
//
// Uso típico (executado pelo agente após criar o app):
//   aioson scaffold:complete --slug=<slug>
//   aioson scaffold:complete --slug=<slug> --manifest=./manifest.json
//   aioson scaffold:complete --slug=<slug> --manifest=./notecards/manifest.json --scaffold-path=./notecards

const fs = require('node:fs/promises');
const path = require('node:path');
const {
  resolveRuntimePaths,
  openRuntimeDb,
  appendRunEvent
} = require('../runtime-store');

function resolveTargetDir(args) {
  return path.resolve(process.cwd(), args[0] || '.');
}

function requireOption(options, key, t) {
  const value = options[key];
  if (value === undefined || value === null || String(value).trim() === '') {
    throw new Error(
      (t && t('runtime.option_required', { option: `--${key}` })) ||
        `Required option missing: --${key}`
    );
  }
  return String(value).trim();
}

const SLUG_RE = /^[a-z0-9][a-z0-9-]*[a-z0-9]$/;

function validateSlug(slug) {
  if (!SLUG_RE.test(slug)) {
    throw new Error(
      `Invalid slug "${slug}". Use lowercase letters, digits, and hyphens (must start and end with letter/digit).`
    );
  }
}

function validateManifest(manifest, slug) {
  const required = ['name', 'description', 'version'];
  const missing = required.filter((k) => !manifest[k] || String(manifest[k]).trim() === '');
  if (missing.length > 0) {
    throw new Error(
      `Manifest is missing required fields: ${missing.join(', ')}. Required: ${required.join(', ')}.`
    );
  }
  if (manifest.slug && manifest.slug !== slug) {
    throw new Error(
      `Slug mismatch: --slug=${slug} but manifest.slug=${manifest.slug}.`
    );
  }
}

async function readManifest(manifestPath) {
  const raw = await fs.readFile(manifestPath, 'utf-8');
  try {
    return JSON.parse(raw);
  } catch (err) {
    throw new Error(`Invalid JSON in ${manifestPath}: ${err.message}`);
  }
}

function findActiveRun(db, { sessionKey, agent }) {
  // Prioridade: --session > --agent > running mais recente.
  if (sessionKey) {
    const row = db
      .prepare(
        `SELECT run_key, agent_name, session_key, status, started_at
         FROM agent_runs
         WHERE session_key = ?
         ORDER BY started_at DESC
         LIMIT 1`
      )
      .get(sessionKey);
    if (!row) {
      throw new Error(`No agent_run found for session_key=${sessionKey}.`);
    }
    return row;
  }
  if (agent) {
    const row = db
      .prepare(
        `SELECT run_key, agent_name, session_key, status, started_at
         FROM agent_runs
         WHERE agent_name = ? AND status IN ('running', 'starting', 'handoff')
         ORDER BY started_at DESC
         LIMIT 1`
      )
      .get(agent);
    if (!row) {
      throw new Error(`No active agent_run found for agent=${agent}.`);
    }
    return row;
  }
  const row = db
    .prepare(
      `SELECT run_key, agent_name, session_key, status, started_at
       FROM agent_runs
       WHERE status IN ('running', 'starting', 'handoff')
       ORDER BY started_at DESC
       LIMIT 1`
    )
    .get();
  if (!row) {
    throw new Error(
      'No active agent_run found. Use `aioson live:start ...` first, or pass --session/--agent.'
    );
  }
  return row;
}

async function runScaffoldComplete({ args, options = {}, logger, t }) {
  const targetDir = resolveTargetDir(args);
  const slug = requireOption(options, 'slug', t);
  validateSlug(slug);

  const manifestRel = String(options.manifest || './manifest.json').trim();
  const manifestPath = path.resolve(targetDir, manifestRel);
  const scaffoldPathRel = String(options['scaffold-path'] || options.scaffoldPath || '.').trim();
  const scaffoldPath = path.resolve(targetDir, scaffoldPathRel);

  const manifest = await readManifest(manifestPath);
  validateManifest(manifest, slug);
  if (!manifest.slug) {
    manifest.slug = slug;
  }

  const handle = await openRuntimeDb(targetDir, { mustExist: true });
  if (!handle) {
    const { dbPath } = resolveRuntimePaths(targetDir);
    throw new Error(`Runtime DB not found at ${dbPath}. Use \`aioson live:start ...\` first.`);
  }
  const { db, dbPath } = handle;

  try {
    const sessionKey = options.session ? String(options.session).trim() : null;
    const agent = options.agent ? String(options.agent).trim() : null;
    const run = findActiveRun(db, { sessionKey, agent });

    const payload = {
      slug,
      manifest,
      scaffold_path: scaffoldPath
    };

    appendRunEvent(db, {
      runKey: run.run_key,
      eventType: 'scaffold_complete',
      message: `Scaffold complete: ${slug}`,
      payload,
      phase: 'scaffold',
      status: 'completed'
    });

    if (!options.json && logger) {
      logger.log(
        `Scaffold complete event emitted: slug=${slug} | run=${run.run_key} | session=${run.session_key} | db=${dbPath}`
      );
    }

    return {
      ok: true,
      targetDir,
      dbPath,
      slug,
      runKey: run.run_key,
      sessionKey: run.session_key,
      agent: run.agent_name,
      manifestPath,
      scaffoldPath
    };
  } finally {
    db.close();
  }
}

module.exports = { runScaffoldComplete };
