'use strict';

const SCHEMA_VERSION = '1.2';
const SUPPORTED_SCHEMA_VERSIONS = Object.freeze(new Set(['1.0', '1.1', '1.2']));

const CANONICAL_AGENT_IDS = Object.freeze(new Set([
  'analyst',
  'architect',
  'committer',
  'copywriter',
  'cypher',
  'design-hybrid-forge',
  'dev',
  'deyvin',
  'discover',
  'discovery-design-doc',
  'genome',
  'neo',
  'orache',
  'orchestrator',
  'pair',
  'pentester',
  'pm',
  'product',
  'profiler-enricher',
  'profiler-forge',
  'profiler-researcher',
  'qa',
  'setup',
  'sheldon',
  'site-forge',
  'squad',
  'tester',
  'ux-ui',
  'validator'
]));

const ORIGIN_PSEUDO_IDS = Object.freeze(new Set(['dossier-init', 'dossier-init-prompt']));

const REQUIRED_FRONTMATTER_FIELDS = Object.freeze([
  'feature_slug',
  'schema_version',
  'created_by',
  'created_at',
  'status',
  'classification',
  'last_updated_by',
  'last_updated_at'
]);

const ALLOWED_STATUSES = Object.freeze(new Set(['active', 'paused', 'closed']));
const ALLOWED_CLASSIFICATIONS = Object.freeze(new Set(['MICRO', 'SMALL', 'MEDIUM']));

const REQUIRED_SECTIONS = Object.freeze([
  'Why',
  'What',
  'Code Map',
  'Rules & Design-Docs aplicáveis',
  'Agent Trail',
  'Revision Requests'
]);

// v1.2 additions — Research Index is an optional section, not required for a valid dossier
const RESEARCH_VERDICTS = Object.freeze(new Set(['confirmed', 'has-alternatives', 'outdated', 'deprecated']));

const SLUG_REGEX = /^[a-z0-9][a-z0-9-]*$/;
const ISO_DATE_REGEX = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/;

function isValidSlug(value) {
  return typeof value === 'string' && SLUG_REGEX.test(value);
}

function isValidIsoDate(value) {
  if (typeof value !== 'string' || !ISO_DATE_REGEX.test(value)) return false;
  const ts = Date.parse(value);
  return Number.isFinite(ts);
}

function isCanonicalAgent(value) {
  return typeof value === 'string' && CANONICAL_AGENT_IDS.has(value);
}

function isAllowedAuthor(value) {
  return isCanonicalAgent(value) || (typeof value === 'string' && ORIGIN_PSEUDO_IDS.has(value));
}

function validateFrontmatter(fm) {
  const errors = [];

  if (!fm || typeof fm !== 'object') {
    return { valid: false, errors: ['frontmatter is missing or not an object'] };
  }

  for (const field of REQUIRED_FRONTMATTER_FIELDS) {
    if (!Object.prototype.hasOwnProperty.call(fm, field) || fm[field] === '' || fm[field] === null || fm[field] === undefined) {
      errors.push(`missing required field: ${field}`);
    }
  }

  if (fm.feature_slug !== undefined && !isValidSlug(fm.feature_slug)) {
    errors.push(`feature_slug must be kebab-case (got: ${JSON.stringify(fm.feature_slug)})`);
  }

  if (fm.schema_version !== undefined && !SUPPORTED_SCHEMA_VERSIONS.has(fm.schema_version)) {
    errors.push(`unsupported schema_version: ${JSON.stringify(fm.schema_version)} (supported: ${[...SUPPORTED_SCHEMA_VERSIONS].join(', ')})`);
  }

  if (fm.status !== undefined && !ALLOWED_STATUSES.has(fm.status)) {
    errors.push(`status must be one of [${[...ALLOWED_STATUSES].join(', ')}] (got: ${JSON.stringify(fm.status)})`);
  }

  if (fm.classification !== undefined && !ALLOWED_CLASSIFICATIONS.has(fm.classification)) {
    errors.push(`classification must be one of [${[...ALLOWED_CLASSIFICATIONS].join(', ')}] (got: ${JSON.stringify(fm.classification)})`);
  }

  if (fm.created_by !== undefined && !isAllowedAuthor(fm.created_by)) {
    errors.push(`created_by must be a canonical agent id or 'dossier-init' (got: ${JSON.stringify(fm.created_by)})`);
  }

  if (fm.last_updated_by !== undefined && !isAllowedAuthor(fm.last_updated_by)) {
    errors.push(`last_updated_by must be a canonical agent id or 'dossier-init' (got: ${JSON.stringify(fm.last_updated_by)})`);
  }

  if (fm.created_at !== undefined && !isValidIsoDate(fm.created_at)) {
    errors.push(`created_at must be ISO 8601 (got: ${JSON.stringify(fm.created_at)})`);
  }

  if (fm.last_updated_at !== undefined && !isValidIsoDate(fm.last_updated_at)) {
    errors.push(`last_updated_at must be ISO 8601 (got: ${JSON.stringify(fm.last_updated_at)})`);
  }

  return { valid: errors.length === 0, errors };
}

function assertFrontmatter(fm) {
  const result = validateFrontmatter(fm);
  if (!result.valid) {
    const err = new Error(`invalid dossier frontmatter: ${result.errors.join('; ')}`);
    err.code = 'EDOSSIERSCHEMA';
    err.errors = result.errors;
    throw err;
  }
}

module.exports = {
  SCHEMA_VERSION,
  SUPPORTED_SCHEMA_VERSIONS,
  CANONICAL_AGENT_IDS,
  ORIGIN_PSEUDO_IDS,
  REQUIRED_FRONTMATTER_FIELDS,
  ALLOWED_STATUSES,
  ALLOWED_CLASSIFICATIONS,
  REQUIRED_SECTIONS,
  RESEARCH_VERDICTS,
  isValidSlug,
  isValidIsoDate,
  isCanonicalAgent,
  isAllowedAuthor,
  validateFrontmatter,
  assertFrontmatter
};
