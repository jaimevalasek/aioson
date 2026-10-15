'use strict';

const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const CONFIG_DIR = path.join(os.homedir(), '.aioson');
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');
const DEFAULT_SITE_URL = 'https://aioson.com';

function normalizeSiteUrl(url) {
  return String(url).trim().replace(/\/+$/, '');
}

function isLoopbackSite(url) {
  try {
    const { hostname } = new URL(url);
    return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]';
  } catch {
    return false;
  }
}

// Qual aioson.com o comando usa e o login dele. O padrão é o site do último
// `auth:login` (ou aioson.com); `--base-url` / AIOSON_BASE_URL apontam para outro
// (ex.: o site local na porta 3000) sem trocar o padrão. Cada site guarda o
// próprio token em `aiosonTokens`, porque um token não vale no site do lado.
function resolveSite(config, options = {}) {
  const defaultBaseUrl = normalizeSiteUrl(config.aiosonBaseUrl || DEFAULT_SITE_URL);
  const flag = typeof options['base-url'] === 'string' ? options['base-url'].trim() : '';
  const explicit = flag || String(process.env.AIOSON_BASE_URL || '').trim();
  const baseUrl = explicit ? normalizeSiteUrl(explicit) : defaultBaseUrl;
  const isDefault = baseUrl === defaultBaseUrl;
  const tokens = config.aiosonTokens && typeof config.aiosonTokens === 'object' ? config.aiosonTokens : {};
  const token = tokens[baseUrl] || (isDefault ? config.aiosonToken : null) || null;
  return { baseUrl, token, isDefault, defaultBaseUrl };
}

async function readConfig() {
  try {
    const raw = await fs.readFile(CONFIG_FILE, 'utf8');
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

async function writeConfig(data) {
  await fs.mkdir(CONFIG_DIR, { recursive: true });
  await fs.writeFile(CONFIG_FILE, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
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
    logger.log(t('config.show_header', { path: CONFIG_FILE }));
    if (keys.length === 0) {
      logger.log(t('config.show_empty'));
    } else {
      for (const key of keys) {
        const value = config[key];
        const raw = value && typeof value === 'object' ? JSON.stringify(value) : String(value);
        const lower = key.toLowerCase();
        const masked = lower.includes('key') || lower.includes('secret') || lower.includes('token')
          ? `${raw.slice(0, 6)}${'*'.repeat(Math.max(0, raw.length - 6))}`
          : raw;
        logger.log(t('config.show_line', { key, value: masked }));
      }
    }
    return { ok: true, config };
  }

  logger.error(t('config.usage_error'));
  return { ok: false, error: { code: 'usage_error' } };
}

module.exports = {
  runConfig,
  readConfig,
  writeConfig,
  resolveSite,
  isLoopbackSite,
  DEFAULT_SITE_URL,
  CONFIG_DIR,
  CONFIG_FILE
};
