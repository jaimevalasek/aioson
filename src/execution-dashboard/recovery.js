'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');
const { statusExecution, decideExecution } = require('../agent-execution/execution-run');
const { leasePath } = require('../agent-execution/dispatcher');

function supervisedMaintenance(projectDir, feature, snapshot) {
  if (snapshot.engine?.alive || snapshot.run?.status !== 'paused' || !String(snapshot.run?.reason || '').startsWith('supervisor_')) return false;
  try {
    const lease = JSON.parse(fs.readFileSync(leasePath(projectDir, feature), 'utf8'));
    return typeof lease.owner === 'string' && Number(lease.expires_at) > Date.now();
  } catch { return false; }
}

function processAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return true; // Unknown is not proof of death.
  try { process.kill(pid, 0); return true; } catch (error) { return error.code !== 'ESRCH'; }
}

function launchRecovery({ projectDir, feature, runId, onFinish }) {
  const relative = `.aioson/runtime/dashboard-recovery/${crypto.randomUUID()}`;
  const directory = path.join(projectDir, relative);
  fs.mkdirSync(directory, { recursive: true });
  const out = fs.openSync(path.join(directory, 'stdout.log'), 'a');
  let err;
  try { err = fs.openSync(path.join(directory, 'stderr.log'), 'a'); }
  catch (error) { fs.closeSync(out); throw error; }
  const cli = path.resolve(__dirname, '../../bin/aioson.js');
  return new Promise((resolve, reject) => {
    let child;
    try {
      child = spawn(process.execPath, [cli, 'execution:run', projectDir, `--feature=${feature}`, '--resume', `--expect-run=${runId}`, '--json'], { cwd: projectDir, detached: true, windowsHide: true, stdio: ['ignore', out, err] });
    } catch (error) { reject(error); return; }
    finally { fs.closeSync(out); fs.closeSync(err); }
    child.once('error', reject);
    child.once('exit', code => onFinish(code));
    child.once('spawn', () => { child.unref(); resolve({ pid: child.pid, log: relative }); });
  });
}

function createRecoveryController(projectDir, { status = statusExecution, decide = decideExecution, launch = launchRecovery, isProcessAlive = processAlive, now = Date.now } = {}) {
  const jobs = new Map();
  const observed = new Map();
  return {
    async observe(feature, snapshot) {
      const run = snapshot.run;
      if (snapshot.archived || !snapshot.until_complete || !run || run.status !== 'running') { observed.delete(feature); return; }
      if (snapshot.engine?.alive) {
        observed.set(feature, { run_id: run.run_id, pid: snapshot.engine.pid, last_attempt: null });
        return;
      }
      const prior = observed.get(feature);
      if (!prior || prior.run_id !== run.run_id || prior.pid !== snapshot.engine?.pid
          || snapshot.decisions_pending?.length || jobs.get(feature)?.busy || isProcessAlive(prior.pid)
          || (prior.last_attempt !== null && now() - prior.last_attempt < 30000)) return;
      // Only an observed continuous run whose exact process is now dead can
      // restart automatically. Pauses, live/hung processes and old history do not.
      prior.last_attempt = now();
      return this.recover(feature, { run_id: run.run_id });
    },
    status(feature, snapshot) {
      if (supervisedMaintenance(projectDir, feature, snapshot)) return { busy: true, phase: 'maintenance', message: 'O supervisor está corrigindo esta execução e preservando as aprovações. A retomada será automática após a correção; nenhuma confirmação é necessária.' };
      const job = jobs.get(feature);
      if (!job || job.run_id !== snapshot.run?.run_id) return { busy: false };
      return job.busy && snapshot.engine?.alive ? { ...job, phase: 'running', message: 'Retomada em execução. Acompanhe as unidades e o QA.' } : { ...job };
    },
    async recover(feature, payload) {
      if (!payload || typeof payload !== 'object' || Array.isArray(payload) || Object.keys(payload).some(key => !['run_id', 'unit'].includes(key)) || typeof payload.run_id !== 'string' || !/^[a-zA-Z0-9-]{1,100}$/.test(payload.run_id) || (payload.unit !== undefined && (typeof payload.unit !== 'string' || !/^[a-zA-Z0-9-]{1,120}$/.test(payload.unit)))) {
        return { code: 400, data: { error: 'Pedido de recuperação inválido.' } };
      }
      if (jobs.get(feature)?.busy) return { code: 409, data: { error: 'Uma retomada já está em andamento.' } };
      const job = { run_id: payload.run_id, busy: true, phase: 'preparing', message: 'Preparando a retomada.' };
      jobs.set(feature, job);
      try {
        const snapshot = await status({ projectDir, feature });
        if (!snapshot.run || snapshot.run.run_id !== payload.run_id) return { code: 409, data: { error: 'A execução mudou. Atualize o painel.' } };
        if (supervisedMaintenance(projectDir, feature, snapshot)) return { code: 409, data: { error: 'Correção pelo supervisor em andamento. A retomada será automática ao liberar os arquivos.' } };
        if (snapshot.engine?.alive || !['paused', 'decision_required', 'running'].includes(snapshot.run.status)) return { code: 409, data: { error: 'A execução está ativa ou já terminou.' } };
        const pending = snapshot.decisions_pending || [];
        const targets = payload.unit ? pending.filter(item => item.unit === payload.unit) : pending;
        if (payload.unit && targets.length !== 1) return { code: 409, data: { error: 'Esta unidade não possui mais uma decisão pendente.' } };
        for (const decision of targets) {
          const result = await decide({ projectDir, feature, unit: decision.unit, choice: 'retry', expectedRunId: payload.run_id, leaseWaitMs: 0 });
          if (!result.ok) return { code: 409, data: { error: `Retomada recusada: ${result.reason}.`, reason: result.reason } };
        }
        const updated = await status({ projectDir, feature });
        if (updated.run?.run_id !== payload.run_id) return { code: 409, data: { error: 'A execução mudou durante a preparação.' } };
        if (updated.decisions_pending?.length) return { code: 200, data: { status: 'other_decisions_pending', message: 'Unidade preparada. Recupere as demais pendências para iniciar.' } };
        const launched = await launch({ projectDir, feature, runId: payload.run_id, onFinish: code => {
          job.busy = false; job.phase = code === 0 ? 'finished' : 'failed';
          job.message = code === 0 ? 'O processo de retomada terminou. Confira o resultado e o QA.' : 'O processo terminou com impedimento. Confira as pendências e o estado da execução.';
        } });
        Object.assign(job, launched, { phase: 'starting', message: 'Executor iniciado; aguardando o primeiro sinal de atividade.' });
        return { code: 202, data: { status: 'starting', message: job.message, pid: launched.pid } };
      } catch {
        job.phase = 'failed'; job.message = 'Não foi possível iniciar o executor.';
        return { code: 503, data: { error: job.message } };
      } finally {
        if (job.phase === 'preparing') { job.busy = false; job.phase = 'idle'; job.message = ''; }
        if (job.phase === 'failed') job.busy = false;
      }
    }
  };
}

module.exports = { createRecoveryController, launchRecovery };
