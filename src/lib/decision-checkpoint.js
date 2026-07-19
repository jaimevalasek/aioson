'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');

const SCHEMA_VERSION = 'feature-decision-checkpoint/v1';
const ITEM_CLASSES = new Set(['required-inferable', 'blocking-decision', 'optional-contextual']);
const ITEM_STATUSES = new Set(['included', 'pending', 'deferred', 'rejected']);

function checkpointPath(targetDir, slug) {
  return path.join(targetDir, '.aioson', 'context', 'features', slug, 'decision-checkpoint.json');
}

function validateCheckpoint(value, slug) {
  const errors = [];
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { ok: false, errors: ['checkpoint must be an object'], pending: [] };
  }
  if (value.schema_version !== SCHEMA_VERSION) errors.push(`schema_version must be ${SCHEMA_VERSION}`);
  if (value.feature_slug !== slug) errors.push(`feature_slug must be ${slug}`);
  if (!['clear', 'pending'].includes(value.status)) errors.push('status must be clear or pending');
  if (!Array.isArray(value.items)) errors.push('items must be an array');

  const items = Array.isArray(value.items) ? value.items : [];
  items.forEach((item, index) => {
    if (!item || typeof item !== 'object') {
      errors.push(`items[${index}] must be an object`);
      return;
    }
    if (!item.id) errors.push(`items[${index}].id is required`);
    if (!ITEM_CLASSES.has(item.classification)) errors.push(`items[${index}].classification is invalid`);
    if (!ITEM_STATUSES.has(item.status)) errors.push(`items[${index}].status is invalid`);
    if (!item.evidence) errors.push(`items[${index}].evidence is required`);
    if (!item.omission_consequence) errors.push(`items[${index}].omission_consequence is required`);
    if (!item.recommendation) errors.push(`items[${index}].recommendation is required`);
  });

  const pending = items.filter((item) => item
    && item.classification === 'blocking-decision'
    && item.status === 'pending');
  if (value.status === 'clear' && pending.length > 0) {
    errors.push('status clear conflicts with pending blocking decisions');
  }
  if (value.status === 'pending' && pending.length === 0) {
    errors.push('status pending requires at least one pending blocking decision');
  }
  return { ok: errors.length === 0, errors, pending };
}

async function readDecisionCheckpoint(targetDir, slug) {
  const filePath = checkpointPath(targetDir, slug);
  let raw;
  try {
    raw = await fs.readFile(filePath, 'utf8');
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      return { exists: false, ok: false, path: filePath, errors: ['decision checkpoint is missing'], pending: [] };
    }
    return { exists: false, ok: false, path: filePath, errors: [error.message], pending: [] };
  }
  try {
    const checkpoint = JSON.parse(raw);
    return { exists: true, path: filePath, checkpoint, ...validateCheckpoint(checkpoint, slug) };
  } catch (error) {
    return { exists: true, ok: false, path: filePath, errors: [`invalid JSON: ${error.message}`], pending: [] };
  }
}

module.exports = {
  SCHEMA_VERSION,
  checkpointPath,
  validateCheckpoint,
  readDecisionCheckpoint
};
