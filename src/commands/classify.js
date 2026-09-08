'use strict';

/**
 * aioson classify — deterministic classification scoring (MICRO/SMALL/MEDIUM).
 *
 * Reads prd-{slug}.md or requirements-{slug}.md and counts complexity indicators.
 * Falls back to --interactive mode if insufficient data.
 *
 * Usage:
 *   aioson classify . --feature=checkout
 *   aioson classify . --feature=checkout --json
 *   aioson classify . --interactive
 */

const path = require('node:path');
const readline = require('node:readline');
const fs = require('node:fs/promises');
const { readFileSafe, contextDir, parseFrontmatter } = require('../preflight-engine');
const {
  foldDiacritics,
  detectRichSurfaces,
  parseSurfacesOverride
} = require('../lib/feature-completeness');
const { resolveTargetDir } = require('../lib/project-root');

const BAR = '━'.repeat(30);

// Scoring thresholds
// user_types: 1→0, 2→1, 3+→2
// external_integrations: 0→0, 1-2→1, 3+→2
// rule_complexity: none→0, some→1, complex→2
// Score: 0-1=MICRO, 2-3=SMALL, 4-6=MEDIUM

function scoreUserTypes(count) {
  if (count >= 3) return 2;
  if (count >= 2) return 1;
  return 0;
}

function scoreIntegrations(count) {
  if (count >= 3) return 2;
  if (count >= 1) return 1;
  return 0;
}

function scoreComplexity(level) {
  if (level === 'complex') return 2;
  if (level === 'some') return 1;
  return 0;
}

function scoreToClassification(score) {
  if (score <= 1) return 'MICRO';
  if (score <= 3) return 'SMALL';
  return 'MEDIUM';
}

function classificationToPhaseDepth(classification) {
  if (classification === 'MICRO') {
    return {
      specify: 'compact PRD with observable capabilities and acceptance criteria',
      research: 'bounded PRD challenge by @sheldon',
      requirements: 'acceptance criteria inside the PRD',
      design: 'technical decisions inside the implementation plan',
      plan: 'required (@planner), compact vertical plan',
      execute: 'from approved PRD + vertical plan, then independent QA'
    };
  }
  if (classification === 'SMALL') {
    return {
      specify: 'full PRD',
      research: 'PRD challenge by @sheldon',
      requirements: 'acceptance criteria inside the PRD',
      design: 'technical decisions inside the implementation plan',
      plan: 'required (@planner)',
      execute: 'from approved PRD + vertical plan'
    };
  }
  return {
    specify: 'full PRD + stakeholder review',
    research: 'deep PRD challenge by @sheldon',
    requirements: 'detailed acceptance criteria inside the PRD',
    design: 'deeper repository/technical decisions inside the implementation plan',
    plan: 'required (@planner), vertical and risk-aware',
    execute: 'from approved PRD + vertical plan with broader QA'
  };
}

// Pattern-based auto-detection from markdown content

const USER_TYPE_PATTERNS = [
  /\b(admin|administrator)\b/gi,
  /\b(user|customer|client|buyer|seller|vendor|manager|operator|guest|visitor|member|owner|reviewer|moderator)\b/gi,
  /\bAs an? ([a-z]+)/gi,
  /\brole[s]?\b.*?:\s*([^,\n]+)/gi
];

const INTEGRATION_PATTERNS = [
  /\b(stripe|paypal|braintree|square)\b/gi,
  /\b(sendgrid|mailchimp|ses|postmark|smtp)\b/gi,
  /\b(twilio|vonage|nexmo)\b/gi,
  /\b(s3|cloudinary|gcs|azure blob)\b/gi,
  /\b(oauth|jwt|saml|sso|auth0|firebase auth)\b/gi,
  /\b(redis|memcached|elasticsearch|algolia)\b/gi,
  /\bAPI\s+(integration|endpoint|call)\b/gi,
  /\bthird.party\b/gi,
  /\bwebhook[s]?\b/gi,
  /\bexternal\s+service\b/gi
];

const COMPLEXITY_HIGH_PATTERNS = [
  /\b(multi.step|multi-phase|pipeline|workflow)\b/gi,
  /\b(state machine|finite state|transition)\b/gi,
  /\b(calculation|formula|algorithm|score|pricing engine)\b/gi,
  /\b(complex|intricate|elaborate)\s+(logic|rule|condition)/gi,
  /\b(concurrent|parallel|async|queue)\b/gi,
  /\b(if.+then.+else|conditional|depends on)\b/gi
];

const COMPLEXITY_SOME_PATTERNS = [
  /\b(validation|constraint|rule)\b/gi,
  /\b(permission|role.based|access control)\b/gi,
  /\b(notification|trigger|event)\b/gi
];

// Sensitive-surface floor (Gap 3B): a feature touching any of these surfaces is
// never MICRO. Mirrors the secure-tdd sensitive list in @dev. The floor can only
// RAISE the tier (MICRO -> SMALL); it never lowers it. Keep patterns tight — a
// false positive needlessly costs the SMALL chain. Patterns are bilingual
// (EN + pt-BR) and matched against diacritic-folded text. Tune as the project learns.
const SENSITIVE_SURFACE_PATTERNS = [
  { surface: 'money', re: /\b(money|stripe|paypal|braintree|square|payments?|payouts?|refunds?|subscriptions?|billing|invoices?|credit card|pagamentos?|pagar|cobran[cç]as?|faturas?|assinaturas?|reembolsos?|cartao de credito|boleto|pix)\b/i },
  { surface: 'auth', re: /\b(oauth|jwt|saml|sso|auth0|firebase auth|log[- ]?in|sign[- ]?in|sign[- ]?up|passwords?|authenticat\w*|2fa|mfa|autentica\w*|senhas?|cadastr(o|os|ar))\b/i },
  { surface: 'authz', re: /\b(authoriz\w*|access control|role[- ]based|rbac|ownership|owner[- ]only|only the owner|autoriza(cao|r)|controle de acesso|apenas o dono|somente o dono)\b/i },
  { surface: 'uploads', re: /\b(file uploads?|uploads?|attachments?|anexos?|envio de arquivos?|upload de arquivos?)\b/i },
  { surface: 'external_url', re: /\b(webhooks?|callback urls?|ssrf|user[- ]?supplied urls?|url de retorno|urls? fornecidas?)\b/i },
  { surface: 'secrets', re: /\b(secrets?|api keys?|credentials?|private key|access tokens?|segredos?|chaves? de api|credenciais|chave privada|tokens? de acesso)\b/i },
  { surface: 'sensitive_storage', re: /\b(pii|personal data|ssn|sensitive (data|storage|information)|dados (pessoais|sensiveis)|cpf|informac\w* sensivel)\b/i }
];

function detectSensitiveSurfaces(content) {
  const c = foldDiacritics(content);
  const found = [];
  for (const { surface, re } of SENSITIVE_SURFACE_PATTERNS) {
    if (re.test(c)) found.push(surface);
  }
  return found;
}

function applySensitiveFloor(classification) {
  return classification === 'MICRO' ? 'SMALL' : classification;
}

const CLASSIFICATION_RANK = { MICRO: 0, SMALL: 1, MEDIUM: 2 };

function applyClassificationFloor(classification, floor) {
  const current = CLASSIFICATION_RANK[classification] ?? 0;
  const required = CLASSIFICATION_RANK[floor] ?? 0;
  return required > current ? floor : classification;
}

function uniqueMatches(content, pattern) {
  const values = new Set();
  let match;
  pattern.lastIndex = 0;
  while ((match = pattern.exec(content)) !== null) values.add(String(match[1] || match[0]).toLowerCase());
  return values;
}

function countFeaturePaths(content) {
  const paths = uniqueMatches(content, /`((?:\.?[a-z0-9_-]+[\\/])+[a-z0-9_.{}*\/-]+|[a-z0-9_-]+\.(?:js|ts|tsx|jsx|json|md|rs|go|py|rb|php|java|kt|cs|sql|html|css))`/gi);
  const modules = new Set();
  for (const value of paths) {
    const parts = value.replace(/\\/g, '/').replace(/^\.\//, '').split('/').filter(Boolean);
    if (parts.length >= 3) modules.add(`${parts[0]}/${parts[1]}`);
    else if (parts.length >= 1) modules.add(parts[0]);
  }
  return { pathCount: paths.size, moduleCount: modules.size };
}

const FEATURE_BOUNDARY_PATTERNS = [
  ['persistence', /\b(database|sqlite|postgres|mysql|migration|schema|persist\w*|banco de dados|migracao|persistencia)\b/i],
  ['service_contract', /\b(api|endpoint|http|webhook|ipc|rpc|command contract|contrato de comando)\b/i],
  ['process_runtime', /\b(worker|child process|external process|background job|queue|fila|processo externo|processo em background)\b/i],
  ['orchestration', /\b(workflow|state machine|autopilot|orchestrat\w*|handoff|pipeline|maquina de estados|orquestra\w*)\b/i],
  ['filesystem', /\b(filesystem|file system|directory|artifact|manifest|sistema de arquivos|diretorio|arquivo gerado)\b/i],
  ['client_runtime', /\b(tauri|electron|desktop|native window|webview|frontend|backend|janela nativa)\b/i],
  ['realtime', /\b(websocket|streaming|event stream|real[- ]?time|tempo real)\b/i]
];

function analyzeFeatureScope(content) {
  const normalized = foldDiacritics(content);
  const capabilityCount = uniqueMatches(content, /\b(CAP-[A-Z0-9][A-Z0-9-]*)\b/gi).size;
  const acceptanceIds = uniqueMatches(content, /\b(AC-[A-Z0-9][A-Z0-9-]*)\b/gi).size;
  const checkboxes = (content.match(/^[-*]\s+\[[ xX]\]/gm) || []).length;
  const acceptanceCount = Math.max(acceptanceIds, checkboxes);
  const phases = uniqueMatches(
    content,
    /(?:^|\b)(?:phase|fase|stage|etapa|sprint|iteration|iteracao)\s*[:#-]?\s*(\d+)\b/gim
  );
  const { pathCount, moduleCount } = countFeaturePaths(content);
  const boundaries = FEATURE_BOUNDARY_PATTERNS
    .filter(([, pattern]) => pattern.test(normalized))
    .map(([name]) => name);

  let floor = 'MICRO';
  const reasons = [];
  const requireMedium = [
    [capabilityCount >= 4, `${capabilityCount} independently traceable capabilities`],
    [acceptanceCount >= 10 && capabilityCount >= 2, `${acceptanceCount} acceptance criteria across ${capabilityCount} capabilities`],
    [phases.size >= 3, `${phases.size} delivery phases`],
    [boundaries.length >= 3 && (capabilityCount >= 2 || acceptanceCount >= 6 || moduleCount >= 4), `${boundaries.length} runtime boundaries`],
    [moduleCount >= 5 && (capabilityCount >= 2 || acceptanceCount >= 6), `${moduleCount} affected modules`]
  ];
  for (const [matched, reason] of requireMedium) {
    if (matched) {
      floor = 'MEDIUM';
      reasons.push(reason);
    }
  }

  if (floor !== 'MEDIUM') {
    const requireSmall = [
      [capabilityCount >= 2, `${capabilityCount} independently traceable capabilities`],
      [acceptanceCount >= 5, `${acceptanceCount} acceptance criteria`],
      [phases.size >= 2, `${phases.size} delivery phases`],
      [boundaries.length >= 2, `${boundaries.length} runtime boundaries`],
      [moduleCount >= 3, `${moduleCount} affected modules`]
    ];
    for (const [matched, reason] of requireSmall) {
      if (matched) {
        floor = 'SMALL';
        reasons.push(reason);
      }
    }
  }

  return {
    floor,
    reasons,
    metrics: {
      capabilities: capabilityCount,
      acceptance_criteria: acceptanceCount,
      phases: phases.size,
      paths: pathCount,
      modules: moduleCount,
      boundaries
    }
  };
}

function setDeclaredClassification(content, classification) {
  const frontmatter = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!frontmatter) return `---\nclassification: ${classification}\n---\n${content}`;
  const body = frontmatter[1];
  const nextBody = /^classification\s*:/mi.test(body)
    ? body.replace(/^classification\s*:.*$/mi, `classification: ${classification}`)
    : `${body}\nclassification: ${classification}`;
  return content.replace(frontmatter[0], `---\n${nextBody}\n---`);
}

function analyzeContent(content) {
  // Count unique user types
  const userTypeSet = new Set();
  for (const pattern of USER_TYPE_PATTERNS) {
    let m;
    while ((m = pattern.exec(content)) !== null) {
      userTypeSet.add(m[1] ? m[1].toLowerCase() : m[0].toLowerCase());
    }
  }
  const userTypeCount = Math.min(userTypeSet.size, 5);

  // Count integrations
  const integrationSet = new Set();
  for (const pattern of INTEGRATION_PATTERNS) {
    let m;
    while ((m = pattern.exec(content)) !== null) {
      integrationSet.add(m[0].toLowerCase());
    }
  }
  const integrationCount = integrationSet.size;

  // Complexity level
  let complexityLevel = 'none';
  const highMatches = COMPLEXITY_HIGH_PATTERNS.some((p) => p.test(content));
  if (highMatches) {
    complexityLevel = 'complex';
  } else {
    const someMatches = COMPLEXITY_SOME_PATTERNS.some((p) => p.test(content));
    if (someMatches) complexityLevel = 'some';
  }

  return { userTypeCount, integrationCount, complexityLevel };
}

async function runInteractive(logger) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const ask = (q) => new Promise((resolve) => rl.question(q, resolve));

  try {
    logger.log('');
    logger.log('Classification — Interactive Mode');
    logger.log(BAR);

    const utRaw = await ask('User types (1 / 2 / 3+): ');
    const userTypeCount = parseInt(utRaw) || 1;

    const intRaw = await ask('External integrations (0 / 1-2 / 3+): ');
    const integrationCount = parseInt(intRaw) || 0;

    const cxRaw = await ask('Business rule complexity (none / some / complex): ');
    const complexityLevel = ['none', 'some', 'complex'].includes(cxRaw.trim().toLowerCase())
      ? cxRaw.trim().toLowerCase()
      : 'none';

    rl.close();
    return { userTypeCount, integrationCount, complexityLevel };
  } catch {
    rl.close();
    return { userTypeCount: 1, integrationCount: 0, complexityLevel: 'none' };
  }
}

async function runClassify({ args, options = {}, logger }) {
  const targetDir = resolveTargetDir(args);
  const slug = options.feature ? String(options.feature) : null;
  const interactive = Boolean(options.interactive);

  let userTypeCount, integrationCount, complexityLevel;
  let sourceFile = null;
  let content = null;
  let scopeContent = null;
  const scopeSourceFiles = [];

  if (interactive) {
    ({ userTypeCount, integrationCount, complexityLevel } = await runInteractive(logger));
  } else {
    // Auto-detect from the canonical PRD; legacy sources remain fallbacks.
    const dir = contextDir(targetDir);
    const candidates = slug
      ? [
          path.join(dir, `prd-${slug}.md`),
          path.join(dir, `requirements-${slug}.md`),
          path.join(dir, `sheldon-enrichment-${slug}.md`)
        ]
      : [path.join(dir, 'requirements.md'), path.join(dir, 'prd.md')];

    for (const candidate of candidates) {
      content = await readFileSafe(candidate);
      if (content) {
        sourceFile = path.relative(targetDir, candidate);
        scopeSourceFiles.push(sourceFile);
        break;
      }
    }

    if (!content) {
      if (options.json) return { ok: false, reason: 'no_source', message: 'No prd or requirements file found. Use --interactive or --feature=<slug>.' };
      logger.log('No source file found. Use --interactive or provide --feature=<slug>.');
      return { ok: false };
    }

    ({ userTypeCount, integrationCount, complexityLevel } = analyzeContent(content));
    scopeContent = content;
    if (slug) {
      const planPath = path.join(dir, `implementation-plan-${slug}.md`);
      const planContent = await readFileSafe(planPath);
      if (planContent) {
        scopeContent += `\n\n${planContent}`;
        scopeSourceFiles.push(path.relative(targetDir, planPath));
      }
    }
  }

  const utScore = scoreUserTypes(userTypeCount);
  const intScore = scoreIntegrations(integrationCount);
  const cxScore = scoreComplexity(complexityLevel);
  const totalScore = utScore + intScore + cxScore;
  let classification = scoreToClassification(totalScore);
  const scoredClassification = classification;
  const featureScope = analyzeFeatureScope(scopeContent || content || '');
  const declaredRaw = content ? String(parseFrontmatter(content).classification || '').toUpperCase() : '';
  const declaredClassification = Object.hasOwn(CLASSIFICATION_RANK, declaredRaw) ? declaredRaw : null;
  const floorReasons = [];
  let floored = false;

  const scopeRaised = applyClassificationFloor(classification, featureScope.floor);
  if (scopeRaised !== classification) {
    classification = scopeRaised;
    floored = true;
    floorReasons.push(...featureScope.reasons.map((reason) => `scope:${reason}`));
  }

  if (declaredClassification) {
    const declaredRaised = applyClassificationFloor(classification, declaredClassification);
    if (declaredRaised !== classification) {
      classification = declaredRaised;
      floored = true;
      floorReasons.push(`declared:${declaredClassification}`);
    }
  }

  // Gap 3B — sensitive-surface floor (deterministic; raises MICRO -> SMALL only).
  const detectedSurfaces = content ? detectSensitiveSurfaces(content) : [];
  const declaredSurfaces = content ? parseSurfacesOverride(content, 'sensitive_surfaces') : [];
  const sensitiveSurfaces = [...new Set([...detectedSurfaces, ...declaredSurfaces])];
  if (sensitiveSurfaces.length > 0) {
    const scored = classification;
    classification = applySensitiveFloor(classification);
    floored = floored || classification !== scored;
    if (classification !== scored) floorReasons.push(`sensitive:${sensitiveSurfaces.join(',')}`);
  }

  // Operational-surface floor (deterministic; raises MICRO -> SMALL only). A rich
  // operational surface receives a larger planning and verification budget; it
  // does not add mandatory specialist stages or documents.
  const detectedOps = content ? detectRichSurfaces(content) : [];
  const declaredOps = content ? parseSurfacesOverride(content, 'operational_surfaces') : [];
  const operationalSurfaces = [...new Set([...detectedOps, ...declaredOps])];
  if (operationalSurfaces.length > 0) {
    const scored = classification;
    classification = applySensitiveFloor(classification);
    floored = floored || classification !== scored;
    if (classification !== scored) floorReasons.push(`operational:${operationalSurfaces.join(',')}`);
  }

  const phaseDepth = classificationToPhaseDepth(classification);
  let applied = false;
  if (options.apply && sourceFile && content) {
    const updated = setDeclaredClassification(content, classification);
    if (updated !== content) {
      await fs.writeFile(path.resolve(targetDir, sourceFile), updated, 'utf8');
      applied = true;
    }
  }

  // A rich operational surface is exactly the case a clickable prototype is meant
  // to de-risk (management screens + interactions before the PRD). Emit the
  // recommendation from the deterministic tool so it does not rely on agent prose
  // alone — @product/@refiner key off this flag.
  const recommendPrototype = operationalSurfaces.length > 0;

  const result = {
    ok: true,
    feature_slug: slug,
    source_file: sourceFile,
    inputs: { user_types: userTypeCount, external_integrations: integrationCount, rule_complexity: complexityLevel },
    scores: { user_types: utScore, integrations: intScore, complexity: cxScore, total: totalScore },
    scored_classification: scoredClassification,
    classification,
    declared_classification: declaredClassification,
    scope_floor: featureScope.floor,
    scope_metrics: featureScope.metrics,
    scope_source_files: scopeSourceFiles,
    floor_reasons: floorReasons,
    applied,
    sensitive_surfaces: sensitiveSurfaces,
    operational_surfaces: operationalSurfaces,
    floored,
    recommend_prototype: recommendPrototype,
    phase_depth: phaseDepth
  };

  if (options.json) return result;

  const header = slug ? `Classification — ${slug}` : 'Classification';
  logger.log('');
  logger.log(header);
  logger.log(BAR);
  if (sourceFile) logger.log(`Source: ${sourceFile}`);
  logger.log(`User types:              ${userTypeCount}  → +${utScore}`);
  logger.log(`External integrations:   ${integrationCount}  → +${intScore}`);
  logger.log(`Business rule complexity: ${complexityLevel} → +${cxScore}`);
  logger.log(`Feature scope: CAP=${featureScope.metrics.capabilities}, AC=${featureScope.metrics.acceptance_criteria}, phases=${featureScope.metrics.phases}, modules=${featureScope.metrics.modules}, boundaries=${featureScope.metrics.boundaries.length} → floor ${featureScope.floor}`);
  logger.log(BAR);
  logger.log(`Score: ${totalScore} → ${classification}`);
  if (floorReasons.length > 0) logger.log(`Classification floor: ${floorReasons.join('; ')}`);
  if (applied) logger.log(`Applied classification ${classification} to ${sourceFile}`);
  if (sensitiveSurfaces.length > 0) {
    logger.log(`Sensitive surfaces: ${sensitiveSurfaces.join(', ')}${floored ? ' → floored to SMALL' : ''}`);
  }
  if (operationalSurfaces.length > 0) {
    logger.log(`Operational surfaces: ${operationalSurfaces.join(', ')}${floored ? ' → floored to at least SMALL' : ''}`);
  }
  if (recommendPrototype) {
    logger.log('Recommendation: generate a clickable prototype in @refiner before @product (surfaces management screens + interactions early).');
  }
  logger.log('');
  logger.log('Phase depth:');
  for (const [phase, desc] of Object.entries(phaseDepth)) {
    logger.log(`  ${phase.padEnd(14)}: ${desc}`);
  }
  logger.log('');

  return result;
}

module.exports = {
  analyzeFeatureScope,
  applyClassificationFloor,
  setDeclaredClassification,
  runClassify
};
