'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const { SquadDaemon } = require('../squad-daemon');
const { openRuntimeDb } = require('../runtime-store');
const { consume: consumeInterSquadEvents } = require('../squad/inter-squad-events');
const { resolveTargetDir } = require('../lib/project-root');
const deliveryStore = require('../squad/event-delivery');

async function handleDeliveries(projectDir, squadSlug, options, { logger }) {
  if (!squadSlug) return { ok: false, error: 'squad_required' };
  const handle = await openRuntimeDb(projectDir, { mustExist: true });
  if (!handle) return { ok: false, error: 'runtime_not_found' };
  try {
    deliveryStore.recover(handle.db, squadSlug);
    if (options.sub === 'reconcile') {
      const result = deliveryStore.reconcile(handle.db, {
        squad: squadSlug, key: options.delivery, resolution: options.resolution, evidence: options.evidence
      });
      logger.log(result.ok ? `Delivery ${result.delivery_key}: ${result.status}` : `Reconciliation refused: ${result.error}`);
      return result;
    }
    const result = deliveryStore.list(handle.db, squadSlug);
    for (const batch of result.batches) {
      if (batch.error) logger.log(`Batch ${batch.source_id}: ${batch.error}`);
    }
    for (const row of result.deliveries) {
      logger.log(`${row.delivery_key}: ${row.worker_slug} — ${row.status}; attempts=${row.attempts}/${row.max_attempts}${row.error ? `; ${row.error}` : ''}`);
    }
    logger.log('Reconcile after checking the effect: --sub=reconcile --delivery=<key> --resolution=retry|completed|failed --evidence="receipt or reason"');
    return { ok: true, ...result };
  } finally { handle.db.close(); }
}

async function handleStart(projectDir, squadSlug, options, { logger, t }) {
  if (!squadSlug) {
    logger.error(t('squad_daemon.squad_required'));
    return { ok: false };
  }

  let squadConfig = {};
  try {
    const squadJsonPath = path.join(projectDir, '.aioson', 'squads', squadSlug, 'squad.json');
    squadConfig = JSON.parse(await fs.readFile(squadJsonPath, 'utf8'));
  } catch { /* squad.json is optional */ }

  const daemon = new SquadDaemon(projectDir, squadSlug, {
    port: options.port ? Number(options.port) : 0,
    poll: options.poll ? Number(options.poll) : 10000,
    config: squadConfig
  });

  try {
    const info = await daemon.start();
    logger.log(t('squad_daemon.started', {
      squad: squadSlug,
      port: info.port,
      workers: info.workers,
      cron: info.cronJobs
    }));
    logger.log(t('squad_daemon.webhook_hint', { port: info.port }));
    logger.log(t('squad_daemon.stop_hint'));

    // Keep alive until signal
    await new Promise((resolve) => {
      process.on('SIGINT', resolve);
      process.on('SIGTERM', resolve);
    });

    logger.log(t('squad_daemon.stopping'));
    await daemon.stop();
    return { ok: true, ...info };
  } catch (err) {
    logger.error(t('squad_daemon.start_failed', { error: err.message }));
    return { ok: false, error: err.message };
  }
}

async function handleStatus(projectDir, squadSlug, { logger, t }) {
  if (!squadSlug) {
    // List all daemons
    const handle = await openRuntimeDb(projectDir, { mustExist: true });
    if (!handle) {
      logger.error(t('squad_daemon.no_runtime'));
      return { ok: false };
    }
    const { db } = handle;
    try {
      const daemons = db.prepare('SELECT * FROM squad_daemons ORDER BY squad_slug').all();
      if (daemons.length === 0) {
        logger.log(t('squad_daemon.no_daemons'));
        return { ok: true, daemons: [] };
      }
      logger.log(`Daemons (${daemons.length}):`);
      for (const d of daemons) {
        const icon = d.status === 'running' ? '[*]' : '[ ]';
        logger.log(`  ${icon} ${d.squad_slug} (${d.status}) port:${d.port || '-'} pid:${d.pid || '-'} heartbeat:${d.last_heartbeat || '-'}`);
      }
      return { ok: true, daemons };
    } finally {
      db.close();
    }
  }

  // Specific squad daemon status
  const handle = await openRuntimeDb(projectDir, { mustExist: true });
  if (!handle) {
    logger.error(t('squad_daemon.no_runtime'));
    return { ok: false };
  }
  const { db } = handle;
  try {
    const record = db.prepare('SELECT * FROM squad_daemons WHERE squad_slug = ?').get(squadSlug);
    if (!record) {
      logger.log(t('squad_daemon.not_found', { squad: squadSlug }));
      return { ok: true, daemon: null };
    }
    logger.log(`Daemon: ${record.squad_slug}`);
    logger.log(`  Status: ${record.status}`);
    logger.log(`  PID: ${record.pid || '-'}`);
    logger.log(`  Port: ${record.port || '-'}`);
    logger.log(`  Started: ${record.started_at || '-'}`);
    logger.log(`  Heartbeat: ${record.last_heartbeat || '-'}`);
    if (record.error_message) logger.log(`  Error: ${record.error_message}`);
    if (record.config_json) {
      try {
        const config = JSON.parse(record.config_json);
        if (config.cronJobs && config.cronJobs.length > 0) {
          logger.log(`  Cron Jobs:`);
          for (const job of config.cronJobs) {
            logger.log(`    - ${job.worker} (${job.cron})`);
          }
        }
      } catch { /* ignore */ }
    }
    return { ok: true, daemon: record };
  } finally {
    db.close();
  }
}

async function handleStop(projectDir, squadSlug, { logger, t }) {
  if (!squadSlug) {
    logger.error(t('squad_daemon.squad_required'));
    return { ok: false };
  }

  const handle = await openRuntimeDb(projectDir, { mustExist: true });
  if (!handle) {
    logger.error(t('squad_daemon.no_runtime'));
    return { ok: false };
  }
  const { db } = handle;
  try {
    const record = db.prepare('SELECT * FROM squad_daemons WHERE squad_slug = ?').get(squadSlug);
    if (!record || record.status !== 'running') {
      logger.log(t('squad_daemon.not_running', { squad: squadSlug }));
      return { ok: true };
    }

    // Try to kill the process
    if (record.pid) {
      try {
        process.kill(record.pid, 'SIGTERM');
        logger.log(t('squad_daemon.signal_sent', { squad: squadSlug, pid: record.pid }));
      } catch {
        logger.log(t('squad_daemon.process_gone', { squad: squadSlug }));
      }
    }

    // Update record
    db.prepare(
      "UPDATE squad_daemons SET status = 'stopped' WHERE squad_slug = ?"
    ).run(squadSlug);

    return { ok: true };
  } finally {
    db.close();
  }
}

async function handleLogs(projectDir, squadSlug, { logger, t }) {
  if (!squadSlug) {
    logger.error(t('squad_daemon.squad_required'));
    return { ok: false };
  }

  // Show recent worker runs as daemon logs
  const handle = await openRuntimeDb(projectDir, { mustExist: true });
  if (!handle) {
    logger.error(t('squad_daemon.no_runtime'));
    return { ok: false };
  }
  const { db } = handle;
  try {
    const runs = db.prepare(
      'SELECT * FROM worker_runs WHERE squad_slug = ? ORDER BY created_at DESC LIMIT 30'
    ).all(squadSlug);
    if (runs.length === 0) {
      logger.log(t('squad_daemon.no_logs'));
      return { ok: true, runs: [] };
    }
    logger.log(`Recent daemon activity for "${squadSlug}" (${runs.length}):`);
    for (const r of runs) {
      const icon = r.status === 'completed' ? '[ok]' : r.status === 'failed' ? '[!!]' : '[..]';
      const ms = r.duration_ms ? `${r.duration_ms}ms` : '-';
      logger.log(`  ${icon} ${r.created_at} ${r.worker_slug} (${r.trigger_type}) ${ms}`);
      if (r.error_message) logger.log(`       ${r.error_message}`);
    }
    return { ok: true, runs };
  } finally {
    db.close();
  }
}

// ─── Persistent Execution Loop (4.3) ─────────────────────────────────────────

/**
 * Parse a loop-delay string like '30s', '2m', '1h' into milliseconds.
 */
function parseLoopDelay(str, defaultMs = 30_000) {
  const s = String(str || '').trim().toLowerCase();
  const match = s.match(/^(\d+)(s|m|h)?$/);
  if (!match) return defaultMs;
  const val = parseInt(match[1], 10);
  const unit = match[2] || 's';
  if (unit === 'h') return val * 3_600_000;
  if (unit === 'm') return val * 60_000;
  return val * 1_000;
}

/**
 * Persistent daemon loop for a squad.
 *
 * Each iteration:
 *   1. Check inter_squad_events for this squad (via manifest subscriptions)
 *   2. If pending events: trigger squad:autorun to process them
 *   3. Write daemon-alive.json heartbeat
 *   4. Sleep loop-delay
 *
 * Exits gracefully on SIGTERM (waits for current iteration to finish).
 */
async function handlePersistent(projectDir, squadSlug, options, { logger }) {
  if (!squadSlug) {
    logger.error('Error: --squad is required for --persistent');
    return { ok: false, error: 'missing_squad' };
  }

  const loopDelayMs = parseLoopDelay(options['loop-delay'] || options.loopDelay, 30_000);

  // Load manifest for subscriptions
  let manifest = {};
  try {
    const manifestPath = path.join(projectDir, '.aioson', 'squads', squadSlug, 'squad.manifest.json');
    manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
  } catch { /* manifest optional */ }

  const subscriptions = [
    ...(manifest.subscriptions || []),
    ...(manifest.depends_on || []).map((d) => d.event).filter(Boolean)
  ];

  const aliveJsonPath = path.join(projectDir, '.aioson', 'squads', squadSlug, 'daemon-alive.json');

  logger.log(`Persistent daemon — squad: ${squadSlug}`);
  logger.log(`Loop delay: ${loopDelayMs / 1000}s`);
  logger.log(`Subscriptions: ${subscriptions.length > 0 ? subscriptions.join(', ') : '(none)'}`);
  logger.log('Press Ctrl+C to stop');
  logger.log('');

  let running = true;
  process.on('SIGTERM', () => { running = false; });
  process.on('SIGINT', () => { running = false; });

  let iteration = 0;

  while (running) {
    iteration++;
    const now = new Date().toISOString();

    // Write heartbeat
    await fs.mkdir(path.dirname(aliveJsonPath), { recursive: true });
    await fs.writeFile(aliveJsonPath, JSON.stringify({
      squad: squadSlug,
      iteration,
      last_check: now,
      subscriptions,
      pid: process.pid
    }, null, 2), 'utf8').catch(() => {});

    // Check inter-squad events
    if (subscriptions.length > 0) {
      const events = await consumeInterSquadEvents(projectDir, {
        toSquad: squadSlug,
        subscriptions
      }).catch(() => []);

      if (events.length > 0) {
        logger.log(`[${now.slice(11, 19)}] ${events.length} inter-squad event(s) received:`);
        for (const ev of events) {
          logger.log(`  ← [${ev.fromSquad}] ${ev.event}`);
        }
        logger.log(`  → Triggering squad:autorun for "${squadSlug}"...`);

        // Trigger autorun via CLI subprocess
        const { spawnSync } = require('node:child_process');
        const goal = events.map((e) => `Process event: ${e.event} from ${e.fromSquad}`).join('; ');
        const autorunResult = spawnSync('aioson', [
          'squad:autorun', projectDir,
          `--squad=${squadSlug}`,
          `--goal=${goal}`,
          '--reflect'
        ], {
          encoding: 'utf8',
          timeout: 300_000, // 5 min per autorun
          stdio: 'pipe'
        });

        if (autorunResult.status === 0) {
          logger.log('  ✓ Autorun completed');
        } else {
          logger.log(`  ✗ Autorun exited ${autorunResult.status}: ${(autorunResult.stderr || '').trim().slice(0, 100)}`);
        }
      } else {
        logger.log(`[${now.slice(11, 19)}] No pending events for "${squadSlug}" — sleeping ${loopDelayMs / 1000}s`);
      }
    } else {
      logger.log(`[${now.slice(11, 19)}] Iteration ${iteration} — no subscriptions configured, heartbeat only`);
    }

    // Sleep loop-delay (interruptible)
    if (running) {
      await new Promise((resolve) => setTimeout(resolve, loopDelayMs));
    }
  }

  logger.log('');
  logger.log(`Persistent daemon stopped (${iteration} iteration(s) completed)`);
  await fs.unlink(aliveJsonPath).catch(() => {});

  return { ok: true, iterations: iteration };
}

async function runSquadDaemon({ args, options, logger, t }) {
  const targetDir = resolveTargetDir(args);
  const sub = options.sub || 'status';
  const squadSlug = options.squad;

  // --persistent flag triggers persistent loop mode regardless of sub
  if (options.persistent) {
    return handlePersistent(targetDir, squadSlug, options, { logger });
  }

  switch (sub) {
    case 'start':
      return handleStart(targetDir, squadSlug, options, { logger, t });
    case 'status':
      return handleStatus(targetDir, squadSlug, { logger, t });
    case 'stop':
      return handleStop(targetDir, squadSlug, { logger, t });
    case 'logs':
      return handleLogs(targetDir, squadSlug, { logger, t });
    case 'deliveries':
    case 'reconcile':
      return handleDeliveries(targetDir, squadSlug, options, { logger });
    default:
      logger.error(t('squad_daemon.unknown_sub', { sub }));
      return { ok: false };
  }
}

module.exports = { runSquadDaemon };
