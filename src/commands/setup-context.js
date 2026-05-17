'use strict';

const path = require('node:path');
const readline = require('node:readline/promises');
const { detectFramework, isMonorepoDetection } = require('../detector');
const { normalizeLanguageTag } = require('../context');

/**
 * Infer conversation language from the OS locale environment variables.
 * Supports LANGUAGE, LANG, and LC_ALL in priority order.
 * Maps POSIX locale codes (e.g. pt_BR.UTF-8) to AIOSON locale codes (e.g. pt-BR).
 */
function detectSystemLanguage() {
  const raw = process.env.LANGUAGE || process.env.LANG || process.env.LC_ALL || '';
  const base = raw.split(':')[0].split('.')[0].trim();
  if (!base || base === 'C' || base === 'POSIX') return 'en';
  return normalizeLanguageTag(base, 'en');
}
const { getCliVersionSync } = require('../version');
const {
  calculateClassification,
  normalizeBoolean,
  renderProjectContext,
  writeProjectContext,
  renderSquadApiSection
} = require('../context-writer');
const { applyAgentLocale } = require('../locales');
const { openRuntimeDb, logAgentEvent } = require('../runtime-store');
const {
  BACKEND_CHOICES,
  FRONTEND_CHOICES,
  AUTH_CHOICES,
  normalizeChoice,
  normalizeProfile,
  inferProjectTypeFromFramework,
  inferWeb3NetworkFromFramework,
  buildDeveloperProfile,
  recommendCreatorProfile,
  buildTeamProfile
} = require('../onboarding');

const JETSTREAM_ACTION_CHOICES = {
  '1': 'continue_without_jetstream',
  '2': 'recreate_with_jetstream',
  '3': 'manual_install_risk'
};

const SERVICE_PATTERNS = [
  { pattern: /queue|horizon/i, field: 'queues', value: 'Redis/Horizon' },
  { pattern: /storage|s3|r2/i, field: 'storage', value: 'S3-compatible' },
  { pattern: /websocket|reverb|pusher/i, field: 'websockets', value: 'Reverb/Pusher' },
  { pattern: /payment|stripe|mercadopago|pagseguro/i, field: 'payments', value: 'Payments provider' },
  { pattern: /email|mailgun|resend|ses/i, field: 'email', value: 'Transactional provider' },
  { pattern: /cache|redis/i, field: 'cache', value: 'Redis' },
  { pattern: /search|meilisearch|algolia/i, field: 'search', value: 'Meilisearch/Algolia' }
];

function hasOption(options, name) {
  return Object.prototype.hasOwnProperty.call(options, name);
}

function resolveOption(options, name, fallback = '') {
  return hasOption(options, name) ? String(options[name]) : fallback;
}

function isWeb3Framework(framework) {
  return inferProjectTypeFromFramework(framework) === 'dapp';
}

function inferWeb3Network(framework) {
  return inferWeb3NetworkFromFramework(framework) || 'ethereum';
}

function uniqueStrings(values) {
  return values.filter((value, index, arr) => value && arr.indexOf(value) === index);
}

function localizeSetupNote(note, t) {
  const raw = String(note || '').trim();
  if (!raw) return '';

  const jetstreamTeams = raw.match(/^Jetstream teams:\s*(enabled|disabled)$/i);
  if (jetstreamTeams) {
    return t('setup_context.note_jetstream_teams', {
      status:
        jetstreamTeams[1].toLowerCase() === 'enabled'
          ? t('setup_context.note_status_enabled')
          : t('setup_context.note_status_disabled')
    });
  }

  const selectedServices = raw.match(/^Selected services:\s*(.+)$/i);
  if (selectedServices) {
    return t('setup_context.note_selected_services', {
      services: selectedServices[1]
    });
  }

  const railsFlags = raw.match(/^Rails setup flags:\s*(.+)$/i);
  if (railsFlags) {
    return t('setup_context.note_rails_setup_flags', {
      flags: railsFlags[1]
    });
  }

  const nextSetupFlags = raw.match(/^Next\.js setup flags:\s*(.+)$/i);
  if (nextSetupFlags) {
    return t('setup_context.note_next_setup_flags', {
      flags: nextSetupFlags[1]
    });
  }

  const nextCreateFlags = raw.match(/^Next\.js create flags:\s*(.+)$/i);
  if (nextCreateFlags) {
    return t('setup_context.note_next_create_flags', {
      flags: nextCreateFlags[1]
    });
  }

  const jetstreamAction = raw.match(/^Jetstream existing-project action:\s*(.+)$/i);
  if (jetstreamAction) {
    return t('setup_context.note_jetstream_existing_action', {
      action: jetstreamAction[1]
    });
  }

  if (raw === 'Mobile-first requirement detected; consider React Native/Expo as follow-up.') {
    return t('setup_context.note_mobile_first');
  }
  if (raw === 'VPS preference detected; keep deployment scripts simple and reproducible.') {
    return t('setup_context.note_vps_preference');
  }
  if (raw === 'Cloud profile detected; use managed DB and object storage from day one.') {
    return t('setup_context.note_cloud_profile');
  }
  if (raw === 'Web3 terms detected; dApp starter recommendation applied.') {
    return t('setup_context.note_web3_terms');
  }
  if (raw === 'This recommendation is a starter profile; adjust once requirements are clearer.') {
    return t('setup_context.note_starter_profile');
  }
  if (raw === 'Team profile selected; preserve explicit team conventions and CI rules.') {
    return t('setup_context.note_team_profile');
  }
  if (raw === 'Starter recommendation declined; using custom stack from onboarding.') {
    return t('setup_context.note_beginner_declined');
  }
  if (raw.startsWith('Monorepo detected:')) {
    return t('setup_context.note_monorepo');
  }

  return raw;
}

function localizeProfileNotes(profileData, t) {
  if (!profileData || !Array.isArray(profileData.notes)) return profileData;
  return {
    ...profileData,
    notes: uniqueStrings(profileData.notes.map((note) => localizeSetupNote(note, t)))
  };
}

function servicesToContextFields(services, fallback = {}) {
  const output = {
    queues: fallback.queues || '',
    storage: fallback.storage || '',
    websockets: fallback.websockets || '',
    payments: fallback.payments || '',
    email: fallback.email || '',
    cache: fallback.cache || '',
    search: fallback.search || ''
  };

  for (const raw of services || []) {
    const item = String(raw || '').trim();
    if (!item) continue;
    for (const rule of SERVICE_PATTERNS) {
      if (rule.pattern.test(item)) {
        output[rule.field] = output[rule.field] || rule.value;
      }
    }
  }

  return output;
}

function mergeProfileData(data, profileData) {
  if (!profileData) return data;

  const merged = {
    ...data,
    profile: profileData.profile || data.profile,
    projectType: profileData.projectType || data.projectType,
    framework: profileData.framework || data.framework,
    backend: profileData.backend || data.backend,
    frontend: profileData.frontend || data.frontend,
    database: profileData.database || data.database,
    auth: profileData.auth || data.auth,
    uiux: profileData.uiux || data.uiux,
    web3Enabled: profileData.web3Enabled !== undefined ? Boolean(profileData.web3Enabled) : data.web3Enabled,
    web3Networks: profileData.web3Networks || data.web3Networks,
    contractFramework: profileData.contractFramework || data.contractFramework,
    notes: uniqueStrings([...(data.notes || []), ...(profileData.notes || [])])
  };

  return {
    ...merged,
    ...servicesToContextFields(profileData.services, merged)
  };
}

function applyExplicitOverrides(data, options, detectedInstalled) {
  const output = { ...data };

  if (hasOption(options, 'project-name')) output.projectName = String(options['project-name']);
  if (hasOption(options, 'project-type')) output.projectType = String(options['project-type']);
  if (hasOption(options, 'profile')) output.profile = normalizeProfile(options.profile, output.profile);
  if (hasOption(options, 'framework')) output.framework = String(options.framework);
  if (hasOption(options, 'framework-installed')) {
    output.frameworkInstalled = normalizeBoolean(options['framework-installed'], detectedInstalled);
  }
  const langValue = options.language ?? options.lang;
  if (langValue !== undefined) {
    output.conversationLanguage = String(langValue);
    output.interactionLanguage = String(langValue);
  }
  if (hasOption(options, 'design-skill')) output.designSkill = String(options['design-skill']);
  if (hasOption(options, 'test-runner')) output.testRunner = String(options['test-runner']);
  if (hasOption(options, 'web3-enabled')) {
    output.web3Enabled = normalizeBoolean(options['web3-enabled'], output.web3Enabled);
  }
  if (hasOption(options, 'web3-networks')) output.web3Networks = String(options['web3-networks']);
  if (hasOption(options, 'contract-framework')) output.contractFramework = String(options['contract-framework']);
  if (hasOption(options, 'wallet-provider')) output.walletProvider = String(options['wallet-provider']);
  if (hasOption(options, 'indexer')) output.indexer = String(options.indexer);
  if (hasOption(options, 'rpc-provider')) output.rpcProvider = String(options['rpc-provider']);
  if (hasOption(options, 'backend')) output.backend = String(options.backend);
  if (hasOption(options, 'frontend')) output.frontend = String(options.frontend);
  if (hasOption(options, 'database')) output.database = String(options.database);
  if (hasOption(options, 'auth')) output.auth = String(options.auth);
  if (hasOption(options, 'uiux')) output.uiux = String(options.uiux);
  if (hasOption(options, 'queues')) output.queues = String(options.queues);
  if (hasOption(options, 'storage')) output.storage = String(options.storage);
  if (hasOption(options, 'websockets')) output.websockets = String(options.websockets);
  if (hasOption(options, 'payments')) output.payments = String(options.payments);
  if (hasOption(options, 'email')) output.email = String(options.email);
  if (hasOption(options, 'cache')) output.cache = String(options.cache);
  if (hasOption(options, 'search')) output.search = String(options.search);
  if (hasOption(options, 'install-commands')) output.installCommands = String(options['install-commands']);
  if (hasOption(options, 'aioson-version')) output.aiosonVersion = String(options['aioson-version']);

  return output;
}

function buildDeveloperProfileFromOptions(options, defaults, t) {
  const output = buildDeveloperProfile({
    backendChoice: resolveOption(options, 'backend-choice', defaults.framework),
    backend: resolveOption(options, 'backend', defaults.backend),
    framework: resolveOption(options, 'framework', defaults.framework),
    frontendChoice: resolveOption(options, 'frontend-choice', defaults.frontend),
    authChoice: resolveOption(options, 'auth-choice', defaults.auth),
    uiuxChoice: resolveOption(options, 'uiux-choice', defaults.uiux),
    databaseChoice: resolveOption(options, 'database-choice', defaults.database),
    servicesChoice: resolveOption(options, 'services', ''),
    laravelVersion: resolveOption(options, 'laravel-version', ''),
    teamsEnabled: normalizeBoolean(options['teams-enabled'], false)
  });

  const railsFlags = resolveOption(options, 'rails-options', '');
  if (railsFlags) {
    output.notes.push(
      t('setup_context.note_rails_setup_flags', {
        flags: railsFlags
      })
    );
  }
  const nextFlags = resolveOption(options, 'next-options', '');
  if (nextFlags) {
    output.notes.push(
      t('setup_context.note_next_setup_flags', {
        flags: nextFlags
      })
    );
  }
  return output;
}

function buildBeginnerProfileFromOptions(options, t) {
  const profile = recommendCreatorProfile({
    projectSummary: resolveOption(options, 'project-summary', ''),
    expectedUsers: resolveOption(options, 'expected-users', ''),
    mobileRequirement: resolveOption(options, 'mobile-requirement', ''),
    hostingPreference: resolveOption(options, 'hosting-preference', '')
  });
  return localizeProfileNotes(profile, t);
}

function buildTeamProfileFromOptions(options, defaults) {
  return buildTeamProfile({
    projectType: resolveOption(options, 'project-type', defaults.projectType),
    framework: resolveOption(options, 'framework', defaults.framework),
    backend: resolveOption(options, 'backend', defaults.backend),
    frontend: resolveOption(options, 'frontend', defaults.frontend),
    database: resolveOption(options, 'database', defaults.database),
    auth: resolveOption(options, 'auth', defaults.auth),
    uiux: resolveOption(options, 'uiux', defaults.uiux),
    services: resolveOption(options, 'services', ''),
    web3Enabled: resolveOption(options, 'web3-enabled', String(defaults.web3Enabled)),
    web3Networks: resolveOption(options, 'web3-networks', defaults.web3Networks),
    contractFramework: resolveOption(options, 'contract-framework', defaults.contractFramework)
  });
}

async function ask(rl, question, fallback = '') {
  const suffix = fallback ? ` (${fallback})` : '';
  const value = await rl.question(`${question}${suffix}: `);
  const cleaned = String(value || '').trim();
  if (!cleaned) return fallback;
  return cleaned;
}

async function askDeveloperProfile(rl, data, t) {
  const developerInput = {
    framework: data.framework,
    backendChoice: await ask(rl, t('setup_context.q_backend_menu'), data.framework)
  };
  const backend = normalizeChoice(developerInput.backendChoice, BACKEND_CHOICES, data.framework);
  if (backend === 'Other') {
    developerInput.backend = await ask(
      rl,
      t('setup_context.q_backend_text'),
      data.backend || data.framework
    );
  }

  if (String(backend).toLowerCase() === 'laravel') {
    developerInput.laravelVersion = await ask(rl, t('setup_context.q_laravel_version'), '11');
    developerInput.frontendChoice = await ask(rl, t('setup_context.q_frontend_menu'), '1');
    developerInput.authChoice = await ask(rl, t('setup_context.q_auth_menu'), '2');
    developerInput.uiuxChoice = await ask(rl, t('setup_context.q_uiux_menu'), '2');
    const auth = normalizeChoice(developerInput.authChoice, AUTH_CHOICES, '');
    if (auth === 'Jetstream + Livewire') {
      developerInput.teamsEnabled = normalizeBoolean(
        await ask(rl, t('setup_context.q_jetstream_teams'), 'true'),
        true
      );
    }
  } else {
    developerInput.frontendChoice = await ask(rl, t('setup_context.q_frontend_menu'), data.frontend || '6');
    const frontend = normalizeChoice(
      developerInput.frontendChoice,
      FRONTEND_CHOICES,
      data.frontend || ''
    );
    if (frontend === 'Other') {
      developerInput.frontendText = await ask(
        rl,
        t('setup_context.q_frontend_text'),
        data.frontend || ''
      );
    }
    developerInput.auth = await ask(rl, t('setup_context.q_auth_text'), data.auth || 'Custom');
    developerInput.uiuxChoice = await ask(rl, t('setup_context.q_uiux_menu'), data.uiux || '1');

    if (backend === 'Rails') {
      developerInput.railsOptions = await ask(rl, t('setup_context.q_rails_options'), '');
    }
    if (backend === 'Next.js') {
      developerInput.nextOptions = await ask(rl, t('setup_context.q_next_options'), '');
    }
  }

  developerInput.databaseChoice = await ask(rl, t('setup_context.q_database_menu'), data.database || '3');
  developerInput.servicesChoice = await ask(rl, t('setup_context.q_services_list'), '');

  const profileData = buildDeveloperProfile(developerInput);

  if (backend === 'Laravel' && profileData.auth === 'Jetstream + Livewire' && data.frameworkInstalled) {
    const action = await ask(rl, t('setup_context.q_jetstream_existing_action'), '2');
    const resolvedAction = normalizeChoice(action, JETSTREAM_ACTION_CHOICES, 'recreate_with_jetstream');
    profileData.notes.push(
      t('setup_context.note_jetstream_existing_action', {
        action: resolvedAction
      })
    );
  }
  if (developerInput.railsOptions) {
    profileData.notes.push(
      t('setup_context.note_rails_setup_flags', {
        flags: developerInput.railsOptions
      })
    );
  }
  if (developerInput.nextOptions) {
    profileData.notes.push(
      t('setup_context.note_next_create_flags', {
        flags: developerInput.nextOptions
      })
    );
  }

  return localizeProfileNotes(profileData, t);
}

async function askBeginnerProfile(rl, data, logger, t) {
  const projectSummary = await ask(rl, t('setup_context.q_beginner_summary'), '');
  const expectedUsers = await ask(rl, t('setup_context.q_beginner_users'), '1');
  const mobileRequirement = await ask(rl, t('setup_context.q_beginner_mobile'), '2');
  const hostingPreference = await ask(rl, t('setup_context.q_beginner_hosting'), '1');

  const recommendation = recommendCreatorProfile({
    projectSummary,
    expectedUsers,
    mobileRequirement,
    hostingPreference
  });

  logger.log(
    t('setup_context.beginner_recommendation', {
      framework: recommendation.framework,
      frontend: recommendation.frontend || 'n/a',
      database: recommendation.database || 'n/a',
      auth: recommendation.auth || 'n/a'
    })
  );

  const useRecommendation = normalizeBoolean(
    await ask(rl, t('setup_context.q_beginner_accept_recommendation'), 'true'),
    true
  );
  if (useRecommendation) return localizeProfileNotes(recommendation, t);

  const custom = buildTeamProfile({
    projectType: await ask(rl, t('setup_context.q_project_type'), data.projectType),
    framework: await ask(rl, t('setup_context.q_framework'), recommendation.framework),
    backend: await ask(rl, t('setup_context.q_backend_text'), recommendation.backend),
    frontend: await ask(rl, t('setup_context.q_frontend_text'), recommendation.frontend),
    database: await ask(rl, t('setup_context.q_database_text'), recommendation.database),
    auth: await ask(rl, t('setup_context.q_auth_text'), recommendation.auth),
    uiux: await ask(rl, t('setup_context.q_uiux_text'), recommendation.uiux),
    services: await ask(rl, t('setup_context.q_services_list'), '')
  });

  return {
    ...custom,
    profile: 'creator',
    notes: uniqueStrings([
      ...localizeProfileNotes(recommendation, t).notes,
      t('setup_context.note_beginner_declined')
    ])
  };
}

async function askTeamProfile(rl, data, t) {
  return localizeProfileNotes(
    buildTeamProfile({
    projectType: await ask(rl, t('setup_context.q_project_type'), data.projectType),
    framework: await ask(rl, t('setup_context.q_framework'), data.framework),
    backend: await ask(rl, t('setup_context.q_backend_text'), data.backend || data.framework),
    frontend: await ask(rl, t('setup_context.q_frontend_text'), data.frontend),
    database: await ask(rl, t('setup_context.q_database_text'), data.database),
    auth: await ask(rl, t('setup_context.q_auth_text'), data.auth),
    uiux: await ask(rl, t('setup_context.q_uiux_text'), data.uiux),
    services: await ask(rl, t('setup_context.q_services_list'), '')
    }),
    t
  );
}

async function runSetupContext({ args, options, logger, t }) {
  const targetDir = path.resolve(process.cwd(), args[0] || '.');
  const defaultsMode = Boolean(options.defaults);

  const detection = await detectFramework(targetDir);
  const detectedFramework = detection.framework || 'Node';
  const detectedInstalled = detection.installed;
  const inferredProjectType = inferProjectTypeFromFramework(detectedFramework);
  const inferredWeb3Enabled = inferredProjectType === 'dapp';
  const baseName = path.basename(targetDir) || 'my-project';
  const monorepoDetected = isMonorepoDetection(detection);

  let data = {
    projectName: baseName,
    projectType: inferredProjectType,
    profile: 'developer',
    framework: detectedFramework,
    frameworkInstalled: detectedInstalled,
    conversationLanguage: detectSystemLanguage(),
    interactionLanguage: detectSystemLanguage(),
    designSkill: '',
    testRunner: '',
    web3Enabled: inferredWeb3Enabled,
    web3Networks: inferredWeb3Enabled ? inferWeb3Network(detectedFramework) : '',
    contractFramework: inferredWeb3Enabled ? detectedFramework : '',
    walletProvider: '',
    indexer: '',
    rpcProvider: '',
    backend: '',
    frontend: '',
    database: '',
    auth: '',
    uiux: '',
    queues: '',
    storage: '',
    websockets: '',
    payments: '',
    email: '',
    cache: '',
    search: '',
    installCommands: '',
    notes: [],
    aiosonVersion: getCliVersionSync()
  };

  if (monorepoDetected) {
    data.notes.push(t('setup_context.note_monorepo'));
  }

  let userTypesCount = Number(options['user-types'] || 1);
  let integrationsCount = Number(options.integrations || 0);
  let rulesComplexity = resolveOption(options, 'rules-complexity', 'none');

  if (!defaultsMode) {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    try {
      logger.log(
        t('setup_context.detected', { framework: detectedFramework, installed: String(detectedInstalled) })
      );

      data.projectName = await ask(rl, t('setup_context.q_project_name'), data.projectName);

      if (detection.framework) {
        const useDetection = normalizeBoolean(
          await ask(rl, t('setup_context.q_use_detected_framework'), 'true'),
          true
        );
        if (!useDetection) {
          data.framework = await ask(rl, t('setup_context.q_framework'), data.framework);
          data.frameworkInstalled = normalizeBoolean(
            await ask(rl, t('setup_context.q_framework_installed'), String(data.frameworkInstalled)),
            data.frameworkInstalled
          );
        }
      } else {
        data.framework = await ask(rl, t('setup_context.q_framework'), data.framework);
        data.frameworkInstalled = normalizeBoolean(
          await ask(rl, t('setup_context.q_framework_installed'), String(data.frameworkInstalled)),
          data.frameworkInstalled
        );
      }

      data.profile = normalizeProfile(await ask(rl, t('setup_context.q_profile'), data.profile), data.profile);
      data.conversationLanguage = await ask(rl, t('setup_context.q_language'), data.conversationLanguage);
      data.interactionLanguage = data.conversationLanguage;

      let profileData = null;
      if (data.profile === 'developer') {
        profileData = await askDeveloperProfile(rl, data, t);
      } else if (data.profile === 'creator') {
        profileData = await askBeginnerProfile(rl, data, logger, t);
      } else {
        profileData = await askTeamProfile(rl, data, t);
      }
      data = mergeProfileData(data, profileData);

      data.projectType = await ask(rl, t('setup_context.q_project_type'), data.projectType);
      data.web3Enabled = normalizeBoolean(
        await ask(rl, t('setup_context.q_web3_enabled'), String(data.web3Enabled)),
        data.web3Enabled
      );
      if (data.web3Enabled) {
        data.web3Networks = await ask(rl, t('setup_context.q_web3_networks'), data.web3Networks);
        data.contractFramework = await ask(
          rl,
          t('setup_context.q_contract_framework'),
          data.contractFramework || data.framework
        );
        data.walletProvider = await ask(rl, t('setup_context.q_wallet_provider'), data.walletProvider);
        data.indexer = await ask(rl, t('setup_context.q_indexer'), data.indexer);
        data.rpcProvider = await ask(rl, t('setup_context.q_rpc_provider'), data.rpcProvider);
      } else {
        data.web3Networks = '';
        data.contractFramework = '';
        data.walletProvider = '';
        data.indexer = '';
        data.rpcProvider = '';
      }

      userTypesCount = Number(await ask(rl, t('setup_context.q_user_types'), String(userTypesCount)));
      integrationsCount = Number(await ask(rl, t('setup_context.q_integrations'), String(integrationsCount)));
      rulesComplexity = await ask(rl, t('setup_context.q_rules_complexity'), rulesComplexity);
    } finally {
      rl.close();
    }
  } else {
    const profile = normalizeProfile(resolveOption(options, 'profile', data.profile), data.profile);
    let profileData = null;
    if (profile === 'developer') {
      profileData = buildDeveloperProfileFromOptions(options, data, t);
    } else if (profile === 'creator') {
      profileData = buildBeginnerProfileFromOptions(options, t);
    } else {
      profileData = localizeProfileNotes(buildTeamProfileFromOptions(options, data), t);
    }
    profileData = localizeProfileNotes(profileData, t);
    data = mergeProfileData(data, profileData);
  }

  data = applyExplicitOverrides(data, options, detectedInstalled);
  if (!data.interactionLanguage) data.interactionLanguage = data.conversationLanguage || 'en';
  if (!data.conversationLanguage) data.conversationLanguage = data.interactionLanguage;

  const classificationResult = calculateClassification({
    userTypesCount,
    integrationsCount,
    rulesComplexity
  });

  data.classification = resolveOption(options, 'classification', classificationResult.classification);
  if (data.projectType === 'dapp') {
    data.web3Enabled = true;
  }
  if (data.web3Enabled && !data.web3Networks) {
    data.web3Networks = inferWeb3Network(data.framework);
  }
  if (data.web3Enabled && !data.contractFramework && isWeb3Framework(data.framework)) {
    data.contractFramework = data.framework;
  }
  if (!data.web3Enabled) {
    data.web3Networks = '';
    data.contractFramework = '';
    data.walletProvider = '';
    data.indexer = '';
    data.rpcProvider = '';
  }

  const content = renderProjectContext(data);
  const squadApiSection = await renderSquadApiSection(targetDir);
  const fullContent = squadApiSection ? content + '\n' + squadApiSection + '\n' : content;
  const filePath = await writeProjectContext(targetDir, fullContent);
  const localeApplyResult = await applyAgentLocale(targetDir, data.interactionLanguage, {
    dryRun: false
  });

  logger.log(t('setup_context.written', { path: filePath }));
  logger.log(
    t('setup_context.classification_result', {
      classification: data.classification,
      score: classificationResult.score
    })
  );
  logger.log(
    t('setup_context.locale_applied', {
      locale: localeApplyResult.locale,
      count: localeApplyResult.copied.length
    })
  );

  try {
    const handle = await openRuntimeDb(targetDir);
    const { db, runtimeDir } = handle;
    try {
      await logAgentEvent(db, runtimeDir, {
        agentName: '@setup',
        message: `Project context created: ${data.projectName} (${data.classification} / ${data.framework})`,
        type: 'completed',
        taskTitle: `@setup — ${data.projectName}`,
        finish: true,
        status: 'completed',
        summary: `Setup: ${data.projectType} · ${data.framework} · ${data.classification}`
      });
    } finally {
      db.close();
    }
  } catch {
    // Runtime DB may not exist yet on first setup — not a fatal error
  }

  return {
    ok: true,
    targetDir,
    filePath,
    data,
    classificationScore: classificationResult.score,
    localeApplyResult
  };
}

module.exports = {
  runSetupContext,
  servicesToContextFields,
  mergeProfileData,
  applyExplicitOverrides,
  detectSystemLanguage
};
