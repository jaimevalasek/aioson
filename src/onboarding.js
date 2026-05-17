'use strict';

const BACKEND_CHOICES = {
  '1': 'Laravel',
  '2': 'Rails',
  '3': 'Django',
  '4': 'Node/Express',
  '5': 'Next.js',
  '6': 'Nuxt',
  '7': 'Hardhat',
  '8': 'Foundry',
  '9': 'Truffle',
  '10': 'Anchor',
  '11': 'Solana Web3',
  '12': 'Cardano',
  '13': 'Other'
};

const FRONTEND_CHOICES = {
  '1': 'TALL Stack',
  '2': 'VILT Stack',
  '3': 'Blade',
  '4': 'Next.js',
  '5': 'Nuxt',
  '6': 'React',
  '7': 'Vue',
  '8': 'Other'
};

const AUTH_CHOICES = {
  '1': 'Breeze',
  '2': 'Jetstream + Livewire',
  '3': 'Filament Shield',
  '4': 'Custom'
};

const UIUX_CHOICES = {
  '1': 'Tailwind',
  '2': 'Flux UI',
  '3': 'shadcn/ui',
  '4': 'Filament'
};

const DATABASE_CHOICES = {
  '1': 'MySQL',
  '2': 'PostgreSQL',
  '3': 'SQLite',
  '4': 'MongoDB',
  '5': 'Supabase',
  '6': 'PlanetScale'
};

const SERVICE_CHOICES = {
  queues: 'Queues (Redis/Horizon)',
  storage: 'Storage (S3-compatible)',
  websockets: 'WebSockets',
  payments: 'Payments',
  email: 'Transactional Email',
  cache: 'Cache (Redis)',
  search: 'Full-text Search'
};

const SERVICE_ALIASES = {
  queues: ['queues', 'queue', 'horizon', 'redis queue', 'redis'],
  storage: ['storage', 's3', 'r2', 'object storage'],
  websockets: ['websockets', 'websocket', 'reverb', 'pusher'],
  payments: ['payments', 'payment', 'stripe', 'mercadopago', 'pagseguro'],
  email: ['email', 'transactional email', 'mailgun', 'resend', 'ses'],
  cache: ['cache', 'redis cache'],
  search: ['search', 'full-text', 'full text', 'meilisearch', 'algolia']
};

const PROFILE_CHOICES = {
  '1': 'developer',
  '2': 'creator',
  '3': 'team'
};

function normalizeText(value) {
  return String(value || '').trim();
}

function normalizeChoice(value, choices, fallback = '') {
  const input = normalizeText(value);
  if (!input) return fallback;
  if (Object.prototype.hasOwnProperty.call(choices, input)) {
    return choices[input];
  }

  const lowerInput = input.toLowerCase();
  for (const selected of Object.values(choices)) {
    if (selected.toLowerCase() === lowerInput) return selected;
  }
  return input;
}

function normalizeProfile(value, fallback = 'developer') {
  const input = normalizeText(value);
  if (!input) return fallback;
  if (Object.prototype.hasOwnProperty.call(PROFILE_CHOICES, input)) {
    return PROFILE_CHOICES[input];
  }
  const lower = input.toLowerCase();
  // Accept legacy 'beginner' as input but normalize to 'creator' (E4 migration shim).
  if (lower === 'beginner') return 'creator';
  if (['developer', 'creator', 'team'].includes(lower)) return lower;
  return fallback;
}

function parseServices(input) {
  const text = normalizeText(input);
  if (!text) return [];
  return text
    .split(',')
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean)
    .map((token) => {
      const canonical = Object.entries(SERVICE_ALIASES).find(([, aliases]) =>
        aliases.includes(token)
      );
      if (canonical) {
        return SERVICE_CHOICES[canonical[0]];
      }
      return SERVICE_CHOICES[token] || token;
    })
    .filter((value, index, arr) => arr.indexOf(value) === index);
}

function inferProjectTypeFromFramework(framework) {
  const value = normalizeText(framework).toLowerCase();
  if (['hardhat', 'foundry', 'truffle', 'anchor', 'solana web3', 'cardano'].includes(value)) {
    return 'dapp';
  }
  return 'web_app';
}

function inferWeb3NetworkFromFramework(framework) {
  const value = normalizeText(framework).toLowerCase();
  if (['hardhat', 'foundry', 'truffle'].includes(value)) return 'ethereum';
  if (['anchor', 'solana web3'].includes(value)) return 'solana';
  if (value === 'cardano') return 'cardano';
  return '';
}

function buildDeveloperProfile(input) {
  const backend = normalizeChoice(
    input.backendChoice,
    BACKEND_CHOICES,
    input.backend || input.framework || 'Laravel'
  );
  const frontend = normalizeChoice(input.frontendChoice, FRONTEND_CHOICES, input.frontend || '');
  const auth = normalizeChoice(input.authChoice, AUTH_CHOICES, input.auth || '');
  const uiux = normalizeChoice(input.uiuxChoice, UIUX_CHOICES, input.uiux || '');
  const database = normalizeChoice(input.databaseChoice, DATABASE_CHOICES, input.database || '');
  const services = parseServices(input.servicesChoice || input.services || '');
  const laravelVersion = normalizeText(input.laravelVersion);
  const teamsEnabled = input.teamsEnabled === true;

  const backendValue =
    backend === 'Other'
      ? normalizeText(input.backend || input.framework) || 'Custom backend'
      : backend;
  const frontendValue =
    frontend === 'Other'
      ? normalizeText(input.frontendText || input.frontend) || 'Custom frontend'
      : frontend;
  const framework = backendValue === 'Laravel' && laravelVersion ? `Laravel ${laravelVersion}` : backendValue;
  const projectType = inferProjectTypeFromFramework(backendValue);
  const web3Network = inferWeb3NetworkFromFramework(backendValue);

  const notes = [];
  if (backend === 'Laravel' && auth === 'Jetstream + Livewire') {
    notes.push(`Jetstream teams: ${teamsEnabled ? 'enabled' : 'disabled'}`);
  }
  if (services.length > 0) {
    notes.push(`Selected services: ${services.join(', ')}`);
  }

  return {
    profile: 'developer',
    projectType,
    framework,
    backend: backendValue,
    frontend: frontendValue,
    auth,
    uiux,
    database,
    services,
    web3Enabled: projectType === 'dapp',
    web3Networks: web3Network,
    contractFramework: projectType === 'dapp' ? backendValue : '',
    notes
  };
}

function recommendCreatorProfile(input = {}) {
  const expectedUsers = normalizeText(input.expectedUsers).toLowerCase();
  const mobileNeed = normalizeText(input.mobileRequirement).toLowerCase();
  const hosting = normalizeText(input.hostingPreference).toLowerCase();
  const summary = normalizeText(input.projectSummary);

  const recommendation = {
    profile: 'creator',
    projectType: 'web_app',
    framework: 'Laravel',
    backend: 'Laravel',
    frontend: 'TALL Stack',
    auth: 'Jetstream + Livewire',
    uiux: 'Flux UI',
    database: 'SQLite',
    services: [],
    web3Enabled: false,
    web3Networks: '',
    contractFramework: '',
    notes: []
  };

  if (expectedUsers === '2' || expectedUsers.includes('small')) {
    recommendation.database = 'MySQL';
  }
  if (expectedUsers === '3' || expectedUsers.includes('external')) {
    recommendation.database = 'PostgreSQL';
    recommendation.services.push('Queues (Redis/Horizon)');
    recommendation.services.push('Transactional Email');
  }

  if (mobileNeed === '1' || mobileNeed.includes('app')) {
    recommendation.frontend = 'Next.js';
    recommendation.notes.push('Mobile-first requirement detected; consider React Native/Expo as follow-up.');
  }

  if (hosting === '2' || hosting.includes('vps')) {
    recommendation.notes.push('VPS preference detected; keep deployment scripts simple and reproducible.');
  }
  if (hosting === '3' || hosting.includes('cloud')) {
    recommendation.database = recommendation.database === 'SQLite' ? 'PostgreSQL' : recommendation.database;
    recommendation.services.push('Storage (S3-compatible)');
    recommendation.notes.push('Cloud profile detected; use managed DB and object storage from day one.');
  }

  if (/wallet|token|nft|blockchain|web3|smart contract/i.test(summary)) {
    recommendation.projectType = 'dapp';
    recommendation.framework = 'Hardhat';
    recommendation.backend = 'Hardhat';
    recommendation.frontend = 'Next.js';
    recommendation.auth = 'Custom';
    recommendation.database = 'PostgreSQL';
    recommendation.web3Enabled = true;
    recommendation.web3Networks = 'ethereum';
    recommendation.contractFramework = 'Hardhat';
    recommendation.services = ['Payments', 'Cache (Redis)'];
    recommendation.notes.push('Web3 terms detected; dApp starter recommendation applied.');
  }

  recommendation.services = recommendation.services.filter(
    (value, index, arr) => arr.indexOf(value) === index
  );
  recommendation.notes.push('This recommendation is a starter profile; adjust once requirements are clearer.');
  return recommendation;
}

function buildTeamProfile(input = {}) {
  const framework = normalizeText(input.framework || input.backend || 'Node/Express');
  const projectType = normalizeChoice(
    input.projectType,
    { web_app: 'web_app', dapp: 'dapp', api: 'api', site: 'site', script: 'script' },
    inferProjectTypeFromFramework(framework)
  );
  const web3Enabled = projectType === 'dapp' || String(input.web3Enabled).toLowerCase() === 'true';
  return {
    profile: 'team',
    projectType,
    framework,
    backend: normalizeText(input.backend || framework),
    frontend: normalizeText(input.frontend || ''),
    auth: normalizeText(input.auth || ''),
    uiux: normalizeText(input.uiux || ''),
    database: normalizeText(input.database || ''),
    services: parseServices(input.services || ''),
    web3Enabled,
    web3Networks: normalizeText(
      input.web3Networks || (web3Enabled ? inferWeb3NetworkFromFramework(framework) : '')
    ),
    contractFramework: normalizeText(
      input.contractFramework || (web3Enabled ? framework : '')
    ),
    notes: ['Team profile selected; preserve explicit team conventions and CI rules.']
  };
}

module.exports = {
  BACKEND_CHOICES,
  FRONTEND_CHOICES,
  AUTH_CHOICES,
  UIUX_CHOICES,
  DATABASE_CHOICES,
  PROFILE_CHOICES,
  SERVICE_CHOICES,
  normalizeChoice,
  normalizeProfile,
  parseServices,
  inferProjectTypeFromFramework,
  inferWeb3NetworkFromFramework,
  buildDeveloperProfile,
  recommendCreatorProfile,
  buildTeamProfile
};
