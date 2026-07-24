'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const Ajv = require('ajv');
const { createHash } = require('node:crypto');
const { isContainedPath } = require('./manifest-validator');

const REPORT_SCHEMA_VERSION = '1.0.0';
const VERDICTS = Object.freeze([
  'PASS',
  'WARN',
  'FAIL',
  'UNVERIFIED',
  'NOT_APPLICABLE'
]);
const DIMENSION_STATUSES = Object.freeze([
  'pass',
  'warn',
  'fail',
  'unverified',
  'not-applicable'
]);
const SHIPPED_REPORT_SCHEMA_PATH = path.resolve(
  __dirname,
  '..',
  '..',
  'template',
  '.aioson',
  'schemas',
  'squad-eval-report.schema.json'
);

function sha256(value) {
  return createHash('sha256').update(String(value || ''), 'utf8').digest('hex');
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => (
      `${JSON.stringify(key)}:${stableJson(value[key])}`
    )).join(',')}}`;
  }
  return JSON.stringify(value);
}

function hashObject(value) {
  return sha256(stableJson(value));
}

function normalizeRelativePath(value) {
  return String(value || '').replace(/\\/g, '/').replace(/^\.\//, '');
}

function resolveContainedPath(projectDir, relativePath) {
  const target = path.resolve(projectDir, normalizeRelativePath(relativePath));
  return isContainedPath(projectDir, target) ? target : null;
}

async function pathExists(targetPath) {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function resolveReportSchemaPath(projectDir) {
  const workspacePath = path.resolve(
    projectDir,
    '.aioson',
    'schemas',
    'squad-eval-report.schema.json'
  );
  if (isContainedPath(projectDir, workspacePath) && await pathExists(workspacePath)) {
    return workspacePath;
  }
  return SHIPPED_REPORT_SCHEMA_PATH;
}

function normalizeSchemaErrors(errors = []) {
  return errors.map((error) => ({
    code: `schema.${error.keyword}`,
    path: error.instancePath || '/',
    message: error.message || 'is invalid'
  }));
}

async function validateEvalReport(projectDir, report) {
  try {
    const schemaPath = await resolveReportSchemaPath(projectDir);
    const schema = JSON.parse(await fs.readFile(schemaPath, 'utf8'));
    const ajv = new Ajv({ allErrors: true, strict: false, allowUnionTypes: true });
    const validate = ajv.compile(schema);
    const valid = validate(report);
    return {
      valid: Boolean(valid),
      schemaPath,
      errors: normalizeSchemaErrors(validate.errors || [])
    };
  } catch (error) {
    return {
      valid: false,
      schemaPath: null,
      errors: [{
        code: 'schema.unavailable',
        path: '/',
        message: error.message
      }]
    };
  }
}

function verdictFromStatuses(items = []) {
  const relevant = items.filter((item) => item && item.status !== 'not-applicable');
  if (relevant.some((item) => item.status === 'fail' && item.critical)) return 'FAIL';
  if (relevant.some((item) => item.status === 'fail')) return 'FAIL';
  if (relevant.some((item) => item.status === 'unverified')) return 'UNVERIFIED';
  if (relevant.some((item) => item.status === 'warn')) return 'WARN';
  if (relevant.length > 0 && relevant.every((item) => item.status === 'pass')) return 'PASS';
  return 'NOT_APPLICABLE';
}

module.exports = {
  REPORT_SCHEMA_VERSION,
  VERDICTS,
  DIMENSION_STATUSES,
  SHIPPED_REPORT_SCHEMA_PATH,
  sha256,
  stableJson,
  hashObject,
  normalizeRelativePath,
  resolveContainedPath,
  resolveReportSchemaPath,
  validateEvalReport,
  verdictFromStatuses
};
