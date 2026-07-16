'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const {
  CONTEXT_REQUIRED_FIELDS,
  CONTEXT_ALLOWED_CLASSIFICATIONS,
  CONTEXT_ALLOWED_PROJECT_TYPES,
  CONTEXT_ALLOWED_PROFILES
} = require('./constants');
const { exists } = require('./utils');

function stripOuterQuotes(value) {
  const text = String(value || '').trim();
  if (
    (text.startsWith('"') && text.endsWith('"')) ||
    (text.startsWith("'") && text.endsWith("'"))
  ) {
    return text.slice(1, -1);
  }
  return text;
}

function parseScalar(value) {
  const text = stripOuterQuotes(value);
  if (text === 'true') return true;
  if (text === 'false') return false;
  return text;
}

function parseYamlFrontmatter(markdown) {
  const text = String(markdown || '');
  if (!text.startsWith('---\n') && !text.startsWith('---\r\n')) {
    return {
      ok: false,
      data: null,
      reason: 'missing_frontmatter'
    };
  }

  const lines = text.split(/\r?\n/);
  let closingIndex = -1;
  for (let i = 1; i < lines.length; i += 1) {
    if (lines[i].trim() === '---') {
      closingIndex = i;
      break;
    }
  }

  if (closingIndex === -1) {
    return {
      ok: false,
      data: null,
      reason: 'unclosed_frontmatter'
    };
  }

  const data = {};
  for (let i = 1; i < closingIndex; i += 1) {
    const line = lines[i].trim();
    if (!line || line.startsWith('#')) continue;

    const match = line.match(/^([a-zA-Z0-9_]+)\s*:\s*(.*)$/);
    if (!match) {
      return {
        ok: false,
        data: null,
        reason: 'invalid_frontmatter_line',
        line
      };
    }

    const key = match[1];
    const rawValue = match[2];
    data[key] = parseScalar(rawValue);
  }

  return {
    ok: true,
    data
  };
}

function isValidLanguageTag(value) {
  const tag = String(value || '').trim();
  return /^[a-zA-Z]{2,3}(-[a-zA-Z0-9]{2,8})*$/.test(tag);
}

function normalizeLanguageTag(value, fallback = 'en') {
  const tag = String(value || '').trim().replace(/_/g, '-');
  if (!tag) return fallback;
  return isValidLanguageTag(tag) ? tag : fallback;
}

function getInteractionLanguage(data, fallback = 'en') {
  if (!data || typeof data !== 'object') return fallback;
  if (Object.prototype.hasOwnProperty.call(data, 'interaction_language')) {
    return normalizeLanguageTag(data.interaction_language, fallback);
  }
  if (Object.prototype.hasOwnProperty.call(data, 'conversation_language')) {
    return normalizeLanguageTag(data.conversation_language, fallback);
  }
  return fallback;
}

function validateContextData(data) {
  const issues = [];

  for (const key of CONTEXT_REQUIRED_FIELDS) {
    if (!Object.prototype.hasOwnProperty.call(data, key)) {
      issues.push({
        id: `context:missing:${key}`,
        key: 'doctor.context_required_field',
        params: { field: key },
        hintKey: 'doctor.context_required_field_hint'
      });
    }
  }

  const hasInteractionLanguage = Object.prototype.hasOwnProperty.call(data, 'interaction_language');
  const hasConversationLanguage = Object.prototype.hasOwnProperty.call(data, 'conversation_language');

  if (!hasInteractionLanguage && !hasConversationLanguage) {
    issues.push({
      id: 'context:missing:interaction_language',
      key: 'doctor.context_required_field',
      params: { field: 'interaction_language (or legacy conversation_language)' },
      hintKey: 'doctor.context_required_field_hint'
    });
  }

  if (
    Object.prototype.hasOwnProperty.call(data, 'framework_installed') &&
    typeof data.framework_installed !== 'boolean'
  ) {
    issues.push({
      id: 'context:framework_installed:type',
      key: 'doctor.context_framework_installed_type',
      params: {},
      hintKey: 'doctor.context_framework_installed_type_hint'
    });
  }

  if (
    Object.prototype.hasOwnProperty.call(data, 'classification') &&
    !CONTEXT_ALLOWED_CLASSIFICATIONS.includes(String(data.classification))
  ) {
    issues.push({
      id: 'context:classification:value',
      key: 'doctor.context_classification_value',
      params: { expected: CONTEXT_ALLOWED_CLASSIFICATIONS.join('|') },
      hintKey: 'doctor.context_classification_value_hint'
    });
  }

  if (
    Object.prototype.hasOwnProperty.call(data, 'project_type') &&
    !CONTEXT_ALLOWED_PROJECT_TYPES.includes(String(data.project_type))
  ) {
    issues.push({
      id: 'context:project_type:value',
      key: 'doctor.context_project_type_value',
      params: { expected: CONTEXT_ALLOWED_PROJECT_TYPES.join('|') },
      hintKey: 'doctor.context_project_type_value_hint'
    });
  }

  if (
    Object.prototype.hasOwnProperty.call(data, 'profile') &&
    !CONTEXT_ALLOWED_PROFILES.includes(String(data.profile))
  ) {
    issues.push({
      id: 'context:profile:value',
      key: 'doctor.context_profile_value',
      params: { expected: CONTEXT_ALLOWED_PROFILES.join('|') },
      hintKey: 'doctor.context_profile_value_hint'
    });
  }

  if (
    hasInteractionLanguage &&
    !isValidLanguageTag(data.interaction_language)
  ) {
    issues.push({
      id: 'context:interaction_language:format',
      key: 'doctor.context_interaction_language_format',
      params: {},
      hintKey: 'doctor.context_interaction_language_format_hint'
    });
  }

  if (
    hasConversationLanguage &&
    !isValidLanguageTag(data.conversation_language)
  ) {
    issues.push({
      id: 'context:conversation_language:format',
      key: 'doctor.context_conversation_language_format',
      params: {},
      hintKey: 'doctor.context_conversation_language_format_hint'
    });
  }

  if (
    hasInteractionLanguage &&
    hasConversationLanguage &&
    isValidLanguageTag(data.interaction_language) &&
    isValidLanguageTag(data.conversation_language) &&
    String(data.interaction_language).toLowerCase() !== String(data.conversation_language).toLowerCase()
  ) {
    issues.push({
      id: 'context:language:mismatch',
      key: 'doctor.context_language_mismatch',
      params: {
        interaction: data.interaction_language,
        conversation: data.conversation_language
      },
      hintKey: 'doctor.context_language_mismatch_hint'
    });
  }

  return issues;
}

async function validateProjectContextFile(targetDir) {
  const filePath = path.join(targetDir, '.aioson/context/project.context.md');
  if (!(await exists(filePath))) {
    return {
      exists: false,
      parsed: false,
      valid: false,
      filePath,
      data: null,
      issues: []
    };
  }

  const content = await fs.readFile(filePath, 'utf8');
  const parsed = parseYamlFrontmatter(content);
  if (!parsed.ok) {
    return {
      exists: true,
      parsed: false,
      valid: false,
      filePath,
      data: null,
      parseError: parsed.reason,
      issues: [
        {
          id: 'context:frontmatter:invalid',
          key: 'doctor.context_frontmatter_invalid',
          params: { reason: parsed.reason },
          hintKey: 'doctor.context_frontmatter_invalid_hint'
        }
      ]
    };
  }

  const issues = validateContextData(parsed.data);
  return {
    exists: true,
    parsed: true,
    valid: issues.length === 0,
    filePath,
    data: parsed.data,
    issues
  };
}

module.exports = {
  parseYamlFrontmatter,
  validateContextData,
  validateProjectContextFile,
  isValidLanguageTag,
  normalizeLanguageTag,
  getInteractionLanguage
};
