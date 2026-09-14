'use strict';

const { createExecutionDashboard } = require('../execution-dashboard/server');

async function runExecutionDashboard({ projectDir, feature, options, logger }) {
  const port = options.port === undefined ? 4181 : Number(options.port);
  if (options.port === true || !Number.isInteger(port) || port < 1 || port > 65535) {
    const message = 'Use --port=<1–65535>.';
    if (!options.json) logger.error(message);
    return { ok: false, reason: 'invalid_port', message, exitCode: 1 };
  }
  const dashboard = createExecutionDashboard(projectDir, { port, feature, autoPort: options.port === undefined });
  let stop;
  const stopped = new Promise(resolve => { stop = resolve; });
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
  try {
    const info = await dashboard.start();
    const message = { ok: true, status: 'listening', ...info, read_only: false, actions: ['retry_and_resume', 'configure_routing'] };
    // The CLI intentionally supplies a silent logger in JSON mode. A long-lived
    // server must publish its URL now, before the final result on shutdown.
    if (options.json) process.stdout.write(`${JSON.stringify(message)}\n`);
    else {
      logger.log(`AIOSON · Monitor de execuções: ${info.url}`);
      logger.log('Atualização automática · Ctrl+C encerra o painel; as execuções continuam.');
    }
    await stopped;
    return { ...message, status: 'stopped' };
  } catch (error) {
    if (error.code === 'EADDRINUSE') {
      const message = `Porta ${port} em uso. Escolha outra com --port=<n>.`;
      logger.error(message);
      return { ok: false, reason: 'port_in_use', message, exitCode: 1 };
    }
    throw error;
  } finally {
    process.removeListener('SIGINT', stop);
    process.removeListener('SIGTERM', stop);
    if (dashboard.server.listening) await dashboard.stop();
  }
}

module.exports = { runExecutionDashboard };
