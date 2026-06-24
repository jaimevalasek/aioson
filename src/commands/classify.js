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
const { readFileSafe, contextDir } = require('../preflight-engine');

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
      specify: 'brief note or inline',
      research: 'not needed',
      requirements: 'optional',
      design: 'skip',
      plan: 'optional',
      execute: 'direct from task description'
    };
  }
  if (classification === 'SMALL') {
    return {
      specify: 'full PRD',
      research: 'recommended (@sheldon)',
      requirements: 'required (requirements-{slug}.md)',
      design: 'selective (only if new pattern)',
      plan: 'recommended',
      execute: 'from requirements + spec'
    };
  }
  return {
    specify: 'full PRD + stakeholder review',
    research: 'required (@sheldon)',
    requirements: 'required + conformance YAML',
    design: 'required (@ux-ui + @architect)',
    plan: 'required + @pm backlog',
    execute: 'from approved plan, phased delivery'
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
// false positive needlessly costs the SMALL chain. Tune as the project learns.
const SENSITIVE_SURFACE_PATTERNS = [
  { surface: 'money', re: /\b(money|stripe|paypal|braintree|square|payments?|payouts?|refunds?|subscriptions?|billing|invoices?|credit card)\b/i },
  { surface: 'auth', re: /\b(oauth|jwt|saml|sso|auth0|firebase auth|log[- ]?in|sign[- ]?in|sign[- ]?up|passwords?|authenticat\w*|2fa|mfa)\b/i },
  { surface: 'authz', re: /\b(authoriz\w*|access control|role[- ]based|rbac|ownership|owner[- ]only|only the owner)\b/i },
  { surface: 'uploads', re: /\b(file uploads?|uploads?|attachments?)\b/i },
  { surface: 'external_url', re: /\b(webhooks?|callback urls?|ssrf|user[- ]?supplied urls?)\b/i },
  { surface: 'secrets', re: /\b(secrets?|api keys?|credentials?|private key|access tokens?)\b/i },
  { surface: 'sensitive_storage', re: /\b(pii|personal data|ssn|sensitive (data|storage|information))\b/i }
];

function detectSensitiveSurfaces(content) {
  const found = [];
  for (const { surface, re } of SENSITIVE_SURFACE_PATTERNS) {
    if (re.test(content)) found.push(surface);
  }
  return found;
}

// Operational-surface floor: a rich operational surface (workspaces, boards +
// cards, Kanban/CRM pipelines, explicit CRUD/admin management) is never MICRO —
// it needs management screens, so it must get at least the SMALL chain so
// @analyst/@architect/the prototype are not skipped. Patterns are kept tight to
// avoid flooring genuinely simple features. Bare "dashboard" is intentionally
// NOT a signal (too common); only admin/management dashboards count.
function detectRichSurfaces(content) {
  const c = String(content || '');
  const found = [];
  if (/\b(kanban|trello|scrum board|task board)\b/i.test(c)) found.push('kanban');
  if (/\bworkspaces?\b/i.test(c)) found.push('workspace');
  if (/\bboards?\b/i.test(c) && /\bcards?\b/i.test(c)) found.push('board_cards');
  if (/\b(crm|sales pipeline|deals? pipeline|leads? pipeline)\b/i.test(c)) found.push('crm_pipeline');
  if (/\bcrud\b/i.test(c)
    || /\badmin (panel|dashboard|area|console)\b/i.test(c)
    || /\bmanagement (screen|page|panel|dashboard|interface|surface)\b/i.test(c)) found.push('crud_admin');
  return [...new Set(found)];
}

// Explicit `sensitive_surfaces:` frontmatter override — additive, can only force
// the floor when content detection misses. Supports inline (`[a, b]` / `a, b`)
// and YAML block list forms.
function parseSurfacesOverride(content, key) {
  const fm = String(content || '').match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!fm) return [];
  const body = fm[1];
  const items = [];
  const inline = body.match(new RegExp(`^${key}:[ \\t]*(.+)$`, 'm'));
  if (inline) {
    inline[1].trim().replace(/^\[|\]$/g, '').split(',').forEach((s) => {
      const v = s.trim().replace(/^["']|["']$/g, '');
      if (v) items.push(v);
    });
  }
  const block = body.match(new RegExp(`^${key}:[ \\t]*\\r?\\n((?:[ \\t]*-[ \\t]*.+\\r?\\n?)+)`, 'm'));
  if (block) {
    block[1].split(/\r?\n/).forEach((line) => {
      const m = line.match(/^[ \t]*-[ \t]*(.+)$/);
      if (m) {
        const v = m[1].trim().replace(/^["']|["']$/g, '');
        if (v) items.push(v);
      }
    });
  }
  return items;
}

function applySensitiveFloor(classification) {
  return classification === 'MICRO' ? 'SMALL' : classification;
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
  const targetDir = path.resolve(process.cwd(), args[0] || '.');
  const slug = options.feature ? String(options.feature) : null;
  const interactive = Boolean(options.interactive);

  let userTypeCount, integrationCount, complexityLevel;
  let sourceFile = null;
  let content = null;

  if (interactive) {
    ({ userTypeCount, integrationCount, complexityLevel } = await runInteractive(logger));
  } else {
    // Auto-detect from PRD or requirements file
    const dir = contextDir(targetDir);
    const candidates = slug
      ? [
          path.join(dir, `requirements-${slug}.md`),
          path.join(dir, `prd-${slug}.md`),
          path.join(dir, `sheldon-enrichment-${slug}.md`)
        ]
      : [path.join(dir, 'requirements.md'), path.join(dir, 'prd.md')];

    for (const candidate of candidates) {
      content = await readFileSafe(candidate);
      if (content) { sourceFile = path.relative(targetDir, candidate); break; }
    }

    if (!content) {
      if (options.json) return { ok: false, reason: 'no_source', message: 'No prd or requirements file found. Use --interactive or --feature=<slug>.' };
      logger.log('No source file found. Use --interactive or provide --feature=<slug>.');
      return { ok: false };
    }

    ({ userTypeCount, integrationCount, complexityLevel } = analyzeContent(content));
  }

  const utScore = scoreUserTypes(userTypeCount);
  const intScore = scoreIntegrations(integrationCount);
  const cxScore = scoreComplexity(complexityLevel);
  const totalScore = utScore + intScore + cxScore;
  let classification = scoreToClassification(totalScore);

  // Gap 3B — sensitive-surface floor (deterministic; raises MICRO -> SMALL only).
  const detectedSurfaces = content ? detectSensitiveSurfaces(content) : [];
  const declaredSurfaces = content ? parseSurfacesOverride(content, 'sensitive_surfaces') : [];
  const sensitiveSurfaces = [...new Set([...detectedSurfaces, ...declaredSurfaces])];
  let floored = false;
  if (sensitiveSurfaces.length > 0) {
    const scored = classification;
    classification = applySensitiveFloor(classification);
    floored = classification !== scored;
  }

  // Operational-surface floor (deterministic; raises MICRO -> SMALL only). A rich
  // operational surface needs management screens, so a Trello/Kanban/CRM/workspace
  // feature can't take the MICRO shortcut that skips @analyst/@architect/prototype.
  const detectedOps = content ? detectRichSurfaces(content) : [];
  const declaredOps = content ? parseSurfacesOverride(content, 'operational_surfaces') : [];
  const operationalSurfaces = [...new Set([...detectedOps, ...declaredOps])];
  if (operationalSurfaces.length > 0) {
    const scored = classification;
    classification = applySensitiveFloor(classification);
    floored = floored || classification !== scored;
  }

  const phaseDepth = classificationToPhaseDepth(classification);

  const result = {
    ok: true,
    feature_slug: slug,
    source_file: sourceFile,
    inputs: { user_types: userTypeCount, external_integrations: integrationCount, rule_complexity: complexityLevel },
    scores: { user_types: utScore, integrations: intScore, complexity: cxScore, total: totalScore },
    classification,
    sensitive_surfaces: sensitiveSurfaces,
    operational_surfaces: operationalSurfaces,
    floored,
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
  logger.log(BAR);
  logger.log(`Score: ${totalScore} → ${classification}`);
  if (sensitiveSurfaces.length > 0) {
    logger.log(`Sensitive surfaces: ${sensitiveSurfaces.join(', ')}${floored ? ' → floored to SMALL' : ''}`);
  }
  if (operationalSurfaces.length > 0) {
    logger.log(`Operational surfaces: ${operationalSurfaces.join(', ')}${floored ? ' → floored to at least SMALL' : ''}`);
  }
  logger.log('');
  logger.log('Phase depth:');
  for (const [phase, desc] of Object.entries(phaseDepth)) {
    logger.log(`  ${phase.padEnd(14)}: ${desc}`);
  }
  logger.log('');

  return result;
}

module.exports = { runClassify };
