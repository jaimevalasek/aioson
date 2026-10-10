'use strict';

const { readModelsConfig } = require('./models-config');
const { mergeDotEnvKeys } = require('./project-env');

const ROUTES = {
  openrouter: {
    endpoint: 'https://openrouter.ai/api/alpha/decisions',
    model: 'typesafe/jev-1.13',
    apiKeyEnv: 'OPENROUTER_API_KEY',
    provider: 'openrouter'
  },
  typesafe: {
    endpoint: 'https://api.typesafe.ai/v1/systemone',
    model: 'jev-1.13.0',
    apiKeyEnv: 'TYPESAFE_API_KEY',
    provider: 'typesafe'
  }
};

const ROUTE_ALIASES = {
  direct: 'typesafe'
};

const DEFAULT_MIN_NOUL = 0.6;

function unconfigured() {
  return {
    enabled: false,
    status: 'unconfigured',
    reason: null,
    route: null,
    model: null,
    endpoint: null,
    apiKeyEnv: null,
    apiKey: null,
    minNoul: DEFAULT_MIN_NOUL,
    source: null
  };
}

function invalid(reason, partial = {}) {
  return {
    ...unconfigured(),
    status: 'invalid',
    reason,
    route: partial.route || null,
    model: partial.model || null,
    endpoint: partial.endpoint || null,
    apiKeyEnv: partial.apiKeyEnv || null,
    minNoul: partial.minNoul || DEFAULT_MIN_NOUL,
    source: partial.source || null
  };
}

function parseBool(value) {
  if (typeof value === 'boolean') return value;
  const text = String(value ?? '').trim().toLowerCase();
  if (['true', 'yes', '1', 'on'].includes(text)) return true;
  if (['false', 'no', '0', 'off'].includes(text)) return false;
  return null;
}

function isPlaceholderKey(value) {
  const text = String(value || '').trim();
  if (!text) return true;
  return /^YOUR_[A-Z0-9_]+$/.test(text);
}

// `OPENROUTER_API_KEY`, `$OPENROUTER_API_KEY` or `${OPENROUTER_API_KEY}` in
// `api_key` names an environment variable; no provider key is upper-case
// letters and underscores only, so the shape cannot hide a real key.
const ENV_REFERENCE = /^\$?\{?([A-Z][A-Z0-9_]{2,})\}?$/;

function envReference(value) {
  const match = String(value || '').trim().match(ENV_REFERENCE);
  return match && !isPlaceholderKey(match[1]) ? match[1] : null;
}

function endpointAllowed(endpoint, route) {
  const expected = ROUTES[route]?.endpoint;
  if (!expected) return false;
  try {
    return new URL(endpoint).href === new URL(expected).href;
  } catch {
    return false;
  }
}

function resolveJevSection(data, source, env) {
  const jev = data?.jev;
  if (!jev || typeof jev !== 'object' || Array.isArray(jev)) return unconfigured();

  const explicit = jev.enabled != null && jev.enabled !== '';
  const enabledFlag = explicit ? parseBool(jev.enabled) : null;
  if (explicit && enabledFlag == null) return invalid('invalid_enabled', { source });

  const requestedRoute = String(jev.route || 'openrouter').trim().toLowerCase();
  const route = ROUTE_ALIASES[requestedRoute] || requestedRoute;
  if (!ROUTES[route]) return invalid('invalid_route', { source });
  const defaults = ROUTES[route];
  const provider = data.providers?.[defaults.provider];
  const model = String(jev.model || defaults.model).trim();
  if (!/^[A-Za-z0-9_~./-]{1,80}$/.test(model)) return invalid('invalid_model', { route, source });

  const endpoint = String(jev.endpoint || defaults.endpoint).trim();
  if (!endpointAllowed(endpoint, route)) return invalid('endpoint_not_allowed', { route, model, source });

  let minNoul = DEFAULT_MIN_NOUL;
  if (jev.min_noul != null && jev.min_noul !== '') {
    minNoul = Number(jev.min_noul);
    if (!Number.isFinite(minNoul) || minNoul <= 0 || minNoul > 1) {
      return invalid('invalid_min_noul', { route, model, source });
    }
  }

  if (enabledFlag === false) {
    return {
      ...unconfigured(),
      status: 'disabled',
      route,
      model,
      endpoint,
      apiKeyEnv: defaults.apiKeyEnv,
      minNoul,
      source
    };
  }

  const fromEnv = String(env?.[defaults.apiKeyEnv] || '').trim();
  const reference = provider ? envReference(provider.api_key) : null;
  if (reference && !fromEnv) {
    const referenced = String(env?.[reference] || '').trim();
    if (!referenced) {
      // A variable name in the file was being sent as the key itself; say what is missing instead.
      return invalid('api_key_env_unset', { route, model, endpoint, apiKeyEnv: reference, minNoul, source });
    }
  }
  const fromProvider = provider && !isPlaceholderKey(provider.api_key)
    ? (reference ? String(env?.[reference] || '').trim() : String(provider.api_key).trim())
    : '';
  const apiKey = fromEnv || fromProvider;
  if (!apiKey || (enabledFlag == null && !fromProvider)) {
    if (enabledFlag === true) {
      return invalid('missing_api_key', {
        route,
        model,
        endpoint,
        apiKeyEnv: defaults.apiKeyEnv,
        minNoul,
        source
      });
    }
    return { ...unconfigured(), source };
  }

  return {
    enabled: true,
    status: 'ready',
    reason: null,
    route,
    model,
    endpoint,
    apiKeyEnv: defaults.apiKeyEnv,
    apiKey,
    minNoul,
    cacheEnabled: jev.cache === true,
    cacheTtlMs: 24 * 60 * 60 * 1000,
    source
  };
}

function loadJevConfig(projectDir, env = process.env) {
  const loaded = readModelsConfig(projectDir);
  if (!loaded.ok) {
    if (loaded.error === 'config_missing') return unconfigured();
    return invalid(loaded.error === 'config_invalid' ? 'config_invalid' : 'config_unreadable', {
      source: loaded.rel
    });
  }
  // The Jev key may live in the project's `.env` (gitignored, like the app
  // secrets). It is merged into a private copy for this resolution only —
  // never into `process.env`, so orchestrated workers do not inherit it.
  const route = ROUTE_ALIASES[String(loaded.data?.jev?.route || 'openrouter').trim().toLowerCase()] || String(loaded.data?.jev?.route || 'openrouter').trim().toLowerCase();
  const reference = envReference(loaded.data?.providers?.[ROUTES[route]?.provider]?.api_key);
  const keys = [...new Set([...Object.values(ROUTES).map((item) => item.apiKeyEnv), reference].filter(Boolean))];
  let merged = env;
  try {
    merged = mergeDotEnvKeys(projectDir, env, keys);
  } catch {
    // An unreadable `.env` leaves the process environment as the only source.
  }
  const resolved = resolveJevSection(loaded.data, loaded.rel, merged);
  if (resolved.status !== 'ready') return resolved;
  // Where the key came from — named, never shown — so a check can say which file to fix.
  const name = env?.[ROUTES[route]?.apiKeyEnv] || merged?.[ROUTES[route]?.apiKeyEnv] ? ROUTES[route]?.apiKeyEnv : reference;
  const keySource = name && String(env?.[name] || '').trim() ? 'environment'
    : name && String(merged?.[name] || '').trim() ? 'project .env'
      : loaded.rel;
  return { ...resolved, keySource, keyName: name || null };
}

module.exports = {
  ROUTES,
  DEFAULT_MIN_NOUL,
  loadJevConfig,
  endpointAllowed,
  isPlaceholderKey
};
