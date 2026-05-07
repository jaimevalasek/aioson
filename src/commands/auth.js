'use strict';

const http = require('http');
const crypto = require('crypto');
const readline = require('readline');
const { spawn } = require('child_process');
const { readConfig, writeConfig, CONFIG_DIR } = require('./config');

const DEFAULT_BASE_URL = 'https://aioson.com';

function resolveBaseUrl(config, options = {}) {
  return String(options['base-url'] || config.aiosonBaseUrl || DEFAULT_BASE_URL).replace(/\/+$/, '');
}

async function fetchAuthMe(baseUrl, token) {
  try {
    const response = await fetch(`${baseUrl}/api/me`, {
      headers: { authorization: `Bearer ${token}`, accept: 'application/json' },
      signal: AbortSignal.timeout(8000)
    });
    if (response.ok) {
      const data = await response.json();
      return data.user || data;
    }
  } catch {
    // API unreachable
  }
  return null;
}

// ─── Detectar ambiente sem browser ───────────────────────────────────────

function isHeadlessEnv() {
  // WSL2, SSH sem X11, CI
  if (process.env.WSL_DISTRO_NAME || process.env.WSL_INTEROP) return true;
  if (process.env.CI) return true;
  if (process.env.SSH_CLIENT && !process.env.DISPLAY) return true;
  return false;
}

function openBrowser(url) {
  return new Promise((resolve) => {
    // SF-project-14: only http(s) URLs may be opened, and they are passed as
    // a literal argv element so embedded shell metacharacters cannot escape.
    let parsed;
    try {
      parsed = new URL(url);
    } catch {
      resolve(false);
      return;
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      resolve(false);
      return;
    }
    const safeUrl = parsed.toString();
    const platform = process.platform;
    const command = platform === 'darwin' ? 'open'
                  : platform === 'win32'  ? 'cmd'
                                          : 'xdg-open';
    const args = platform === 'win32'
      ? ['/c', 'start', '', safeUrl]
      : [safeUrl];
    try {
      const child = spawn(command, args, { stdio: 'ignore', detached: true });
      let settled = false;
      const settle = (ok) => { if (!settled) { settled = true; resolve(ok); } };
      child.on('error', () => settle(false));
      child.on('spawn', () => settle(true));
      child.unref();
      setTimeout(() => settle(true), 5000);
    } catch {
      resolve(false);
    }
  });
}

// ─── Fluxo A: callback local (Mac/Windows nativos) ────────────────────────

function callbackLogin(baseUrl, state, logger, t) {
  return new Promise((resolve, reject) => {
    let settled = false;
    function done(err, value) {
      if (settled) return;
      settled = true;
      if (err) reject(err); else resolve(value);
    }

    const timeout = setTimeout(() => {
      server.close();
      done(new Error(t('auth.browser_timeout')));
    }, 120_000);

    const server = http.createServer((req, res) => {
      const url = new URL(req.url, 'http://localhost');
      if (url.pathname !== '/callback') { res.writeHead(404); res.end(); return; }

      const token = url.searchParams.get('token');
      const receivedState = url.searchParams.get('state');

      if (receivedState !== state || !token) {
        res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(htmlPage('Erro', 'State inválido ou token ausente. Tente novamente.', false));
        server.close(); clearTimeout(timeout);
        done(new Error(t('auth.browser_state_mismatch')));
        return;
      }

      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(htmlPage('Autenticado!', 'Login realizado. Pode fechar esta aba e voltar ao terminal.', true));
      server.close(); clearTimeout(timeout);
      done(null, token);
    });

    server.on('error', (err) => {
      clearTimeout(timeout);
      done(new Error(`${t('auth.browser_server_error')}: ${err.message}`));
    });

    server.listen(0, '127.0.0.1');
    server.once('listening', () => resolve({ _server: server, _port: server.address().port }));
  });
}

// ─── Fluxo B: paste — CLI mostra URL, usuário cola o token ───────────────

async function pasteLogin(baseUrl, logger, t) {
  const state = crypto.randomBytes(16).toString('hex');
  const loginUrl = `${baseUrl}/auth/cli?state=${state}`;

  logger.log('');
  logger.log(t('auth.paste_open_browser'));
  logger.log('');
  logger.log(`  ${loginUrl}`);
  logger.log('');
  logger.log(t('auth.paste_instruction'));
  logger.log('');

  // Tentar abrir browser automaticamente (ignora falha)
  openBrowser(loginUrl).catch(() => {});

  // Aguardar input do usuário
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const token = await new Promise((resolve) => {
    rl.question(`${t('auth.paste_token_prompt')} `, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });

  if (!token) throw new Error(t('auth.paste_no_token'));
  return token;
}

// ─── Login principal ──────────────────────────────────────────────────────

async function runAuthLogin({ args, options, logger, t }) {
  const tokenOpt = String(options.token || '').trim();
  const config = await readConfig();
  const baseUrl = resolveBaseUrl(config, options);

  let token = tokenOpt;

  if (!token) {
    const headless = isHeadlessEnv() || options['no-browser'];

    if (headless) {
      // Fluxo B: paste
      try {
        token = await pasteLogin(baseUrl, logger, t);
      } catch (err) {
        logger.log(t('auth.browser_failed', { error: err.message }));
        return { ok: false, error: { code: 'paste_login_failed' } };
      }
    } else {
      // Fluxo A: callback local, com fallback para paste se browser não abrir
      const state = crypto.randomBytes(16).toString('hex');
      let server, port;

      try {
        const result = await new Promise((resolve, reject) => {
          const s = http.createServer();
          s.listen(0, '127.0.0.1', () => resolve({ server: s, port: s.address().port }));
          s.on('error', reject);
        });
        server = result.server;
        port = result.port;
      } catch {
        // Sem servidor local → paste
        token = await pasteLogin(baseUrl, logger, t);
      }

      if (server && port) {
        const callbackUrl = `http://127.0.0.1:${port}/callback`;
        const loginUrl = `${baseUrl}/auth/cli?callback=${encodeURIComponent(callbackUrl)}&state=${state}`;

        const opened = await openBrowser(loginUrl);

        if (!opened) {
          // Browser não abriu → paste
          server.close();
          token = await pasteLogin(baseUrl, logger, t);
        } else {
          logger.log(t('auth.browser_opening'));
          logger.log(t('auth.browser_waiting'));

          // Aguardar callback
          token = await new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
              server.close();
              reject(new Error(t('auth.browser_timeout')));
            }, 120_000);

            server.on('request', (req, res) => {
              const url = new URL(req.url, 'http://localhost');
              if (url.pathname !== '/callback') { res.writeHead(404); res.end(); return; }
              const t2 = url.searchParams.get('token');
              const s2 = url.searchParams.get('state');
              if (s2 !== state || !t2) {
                res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
                res.end(htmlPage('Erro', 'State inválido. Tente novamente.', false));
                server.close(); clearTimeout(timeout);
                reject(new Error('State inválido'));
                return;
              }
              res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
              res.end(htmlPage('Autenticado!', 'Pode fechar esta aba e voltar ao terminal.', true));
              server.close(); clearTimeout(timeout);
              resolve(t2);
            });
          });
        }
      }
    }
  }

  logger.log('');
  logger.log(t('auth.login_verifying'));
  const user = await fetchAuthMe(baseUrl, token);

  config.aiosonToken = token;
  if (baseUrl !== DEFAULT_BASE_URL) config.aiosonBaseUrl = baseUrl;
  if (user?.username) config.aiosonUsername = user.username;
  await writeConfig(config);

  if (user?.username) {
    logger.log(t('auth.login_ok', { username: user.username, path: CONFIG_DIR }));
  } else {
    logger.log(t('auth.login_saved', { path: CONFIG_DIR }));
  }

  return { ok: true, username: user?.username || null };
}

async function runAuthLogout({ args, options, logger, t }) {
  const config = await readConfig();
  delete config.aiosonToken;
  delete config.aiosonUsername;
  await writeConfig(config);
  logger.log(t('auth.logout_ok'));
  return { ok: true };
}

async function runAuthStatus({ args, options, logger, t }) {
  const config = await readConfig();
  const token = config.aiosonToken;

  if (!token) {
    logger.log(t('auth.status_not_authenticated'));
    logger.log(t('auth.login_hint'));
    return { ok: true, authenticated: false };
  }

  const baseUrl = resolveBaseUrl(config, options);
  logger.log(t('auth.status_checking'));
  const user = await fetchAuthMe(baseUrl, token);

  if (user?.username) {
    logger.log(t('auth.status_ok', { username: user.username }));
    return { ok: true, authenticated: true, username: user.username, apiReachable: true };
  }

  const savedUsername = config.aiosonUsername || '?';
  logger.log(t('auth.status_token_offline', { username: savedUsername }));
  return { ok: true, authenticated: true, username: savedUsername, apiReachable: false };
}

function htmlPage(title, message, success) {
  const color = success ? '#22c55e' : '#ef4444';
  const icon = success ? '✓' : '✗';
  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><title>AIOSON CLI — ${title}</title>
<style>body{margin:0;font-family:system-ui,sans-serif;background:#0f1117;color:#e8eaf0;display:flex;align-items:center;justify-content:center;min-height:100vh;text-align:center}
.card{background:#1a1d27;border:1px solid #2e334d;border-radius:14px;padding:40px 48px;max-width:420px}
.icon{font-size:40px;margin-bottom:16px;color:${color}}h1{font-size:22px;font-weight:700;margin:0 0 10px}p{color:#9ca3af;margin:0;line-height:1.6}</style>
</head><body><div class="card"><div class="icon">${icon}</div><h1>${title}</h1><p>${message}</p></div></body></html>`;
}

module.exports = { runAuthLogin, runAuthLogout, runAuthStatus };
