'use strict';

const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const CONFIG_DIR = path.join(os.homedir(), '.aioson');
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');
const DEFAULT_SITE_URL = 'https://aioson.com';

// Endereço canônico de um site: `new URL` põe o host em minúsculas e tira a
// porta padrão; fica origem + caminho, sem barra final. Só http(s) e sem
// usuário/senha (`https://aioson.com@outro.host` é o outro host). `null` quando
// não é endereço de site (ex.: `localhost:3000`, sem esquema).
function normalizeSiteUrl(url) {
  let parsed;
  try {
    parsed = new URL(String(url == null ? '' : url).trim());
  } catch {
    return null;
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
  if (parsed.username || parsed.password || !parsed.hostname) return null;
  return `${parsed.origin}${parsed.pathname.replace(/\/+$/, '')}`;
}

function siteHostname(url) {
  try {
    return new URL(url).hostname.toLowerCase().replace(/\.$/, '');
  } catch {
    return '';
  }
}

// A própria máquina: localhost, *.localhost, 127.0.0.0/8, ::1 e 0.0.0.0.
function isLoopbackSite(url) {
  const host = siteHostname(url);
  return host === 'localhost' || host.endsWith('.localhost') || host === '[::1]' || host === '0.0.0.0' ||
    /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host);
}

// Rede local: 10/8, 172.16/12, 192.168/16 e nomes `.local` (mDNS).
function isPrivateSite(url) {
  const host = siteHostname(url);
  if (host.endsWith('.local')) return true;
  const octets = host.match(/^(\d{1,3})\.(\d{1,3})\.\d{1,3}\.\d{1,3}$/);
  if (!octets) return false;
  const [a, b] = [Number(octets[1]), Number(octets[2])];
  return a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
}

// O token só viaja cifrado: http:// só vale na própria máquina ou na rede local
// (`http://aioson.com`, um erro de digitação, mandaria o token aberto).
function isSecureSite(url) {
  const normalized = normalizeSiteUrl(url);
  if (!normalized) return false;
  return normalized.startsWith('https://') || isLoopbackSite(normalized) || isPrivateSite(normalized);
}

// Qual aioson.com o comando usa e o login dele. O padrão é o site do último
// `auth:login` (ou aioson.com); `--base-url` / AIOSON_BASE_URL apontam para outro
// (ex.: o site local na porta 3000) sem trocar o padrão. Cada site guarda o
// próprio token em `aiosonTokens`, porque um token não vale no site do lado.
// `--base-url` presente mas vazio é erro de uso: um `--base-url=$VAR` com a
// variável vazia publicaria no site padrão. `requireSecure: false` só no logout,
// que não manda nada pela rede (tira até o token de um login antigo em http://).
function resolveSite(config, options = {}, t = null, { requireSecure = true } = {}) {
  const say = (key, params) => (t ? t(key, params) : key);
  const flag = options['base-url'];
  if (flag !== undefined && (typeof flag !== 'string' || !flag.trim())) {
    throw new Error(say('auth.error_base_url_blank'));
  }
  // Padrão gravado fora do formato (ex.: `localhost:3000` de um login antigo)
  // segue como chave do token dele; o envio abaixo recusa.
  const storedDefault = String(config.aiosonBaseUrl || DEFAULT_SITE_URL).trim();
  const defaultBaseUrl = normalizeSiteUrl(storedDefault) || storedDefault.replace(/\/+$/, '');
  const explicit = flag !== undefined ? flag.trim() : String(process.env.AIOSON_BASE_URL || '').trim();
  let baseUrl = defaultBaseUrl;
  if (explicit) {
    baseUrl = normalizeSiteUrl(explicit);
    if (!baseUrl) throw new Error(say('auth.error_base_url_invalid', { url: explicit }));
  }
  if (requireSecure && !normalizeSiteUrl(baseUrl)) throw new Error(say('auth.error_base_url_invalid', { url: baseUrl }));
  if (requireSecure && !isSecureSite(baseUrl)) {
    throw new Error(say('auth.error_base_url_insecure', { url: baseUrl, https: baseUrl.replace(/^http:/, 'https:') }));
  }
  const isDefault = baseUrl === defaultBaseUrl;
  const tokens = config.aiosonTokens && typeof config.aiosonTokens === 'object' ? config.aiosonTokens : {};
  const token = tokens[baseUrl] || (isDefault ? config.aiosonToken : null) || null;
  return { baseUrl, token, isDefault, defaultBaseUrl };
}

// Site + token de um comando da loja. Sem login no site escolhido, a mensagem
// diz o login exato que falta — nunca manda o token de outro site.
function requireSite(config, options, t) {
  const site = resolveSite(config, options, t);
  if (!site.token) {
    throw new Error(site.isDefault
      ? t('store.error_not_authenticated')
      : t('store.error_not_authenticated_site', { url: site.baseUrl }));
  }
  return site;
}

async function readConfig() {
  try {
    const raw = await fs.readFile(CONFIG_FILE, 'utf8');
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

// O arquivo guarda os tokens: só o dono lê (0600, pasta nova 0700). `mode` só
// vale na criação, então um config.json antigo (0644) é fechado com chmod.
async function writeConfig(data) {
  await fs.mkdir(CONFIG_DIR, { recursive: true, mode: 0o700 });
  await fs.writeFile(CONFIG_FILE, `${JSON.stringify(data, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
  await fs.chmod(CONFIG_FILE, 0o600).catch(() => {});
}

async function runConfig({ args, options, logger, t }) {
  const subcommand = args[0];

  if (subcommand === 'set') {
    const pair = args[1];
    if (!pair || !pair.includes('=')) {
      logger.error(t('config.usage_error'));
      return { ok: false, error: { code: 'usage_error' } };
    }
    const eqIdx = pair.indexOf('=');
    const key = pair.slice(0, eqIdx).trim();
    const value = pair.slice(eqIdx + 1).trim();
    if (!key) {
      logger.error(t('config.usage_error'));
      return { ok: false, error: { code: 'usage_error' } };
    }
    const config = await readConfig();
    config[key] = value;
    await writeConfig(config);
    logger.log(t('config.set_ok', { key, path: CONFIG_FILE }));
    return { ok: true, key, path: CONFIG_FILE };
  }

  if (subcommand === 'get') {
    const key = args[1];
    if (!key) {
      logger.error(t('config.usage_error'));
      return { ok: false, error: { code: 'usage_error' } };
    }
    const config = await readConfig();
    if (!Object.prototype.hasOwnProperty.call(config, key)) {
      logger.log(t('config.key_not_found', { key }));
      return { ok: true, key, value: null };
    }
    logger.log(t('config.get_line', { key, value: config[key] }));
    return { ok: true, key, value: config[key] };
  }

  if (!subcommand || subcommand === 'show') {
    const config = await readConfig();
    const keys = Object.keys(config);
    // O `--json` leva o mesmo valor mascarado da saída humana: agentes e CI
    // guardam o que ele imprime, então um token nunca sai inteiro.
    const shown = { ...config };
    logger.log(t('config.show_header', { path: CONFIG_FILE }));
    if (keys.length === 0) {
      logger.log(t('config.show_empty'));
    } else {
      for (const key of keys) {
        const value = config[key];
        const raw = value && typeof value === 'object' ? JSON.stringify(value) : String(value);
        const lower = key.toLowerCase();
        const secret = lower.includes('key') || lower.includes('secret') || lower.includes('token');
        const masked = secret ? `${raw.slice(0, 6)}${'*'.repeat(Math.max(0, raw.length - 6))}` : raw;
        if (secret) shown[key] = masked;
        logger.log(t('config.show_line', { key, value: masked }));
      }
    }
    return { ok: true, config: shown };
  }

  logger.error(t('config.usage_error'));
  return { ok: false, error: { code: 'usage_error' } };
}

module.exports = {
  runConfig,
  readConfig,
  writeConfig,
  resolveSite,
  requireSite,
  normalizeSiteUrl,
  isLoopbackSite,
  isSecureSite,
  DEFAULT_SITE_URL,
  CONFIG_DIR,
  CONFIG_FILE
};
