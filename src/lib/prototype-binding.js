'use strict';

const fs = require('node:fs/promises');
const { parseFrontmatter } = require('../preflight-engine');
const { resolveInsideRoot } = require('../verification/path-policy');

const CURRENT_STATUS = 'current';
const NONE_STATUS = 'none';
const NULL_TOKENS = new Set(['', 'null', 'none', '~']);

function normalizeRelPath(value) {
  return String(value || '')
    .trim()
    .replace(/^["']|["']$/g, '')
    .replace(/\\/g, '/')
    .replace(/^\.\//, '');
}

function scalar(value) {
  const normalized = String(value ?? '').trim().replace(/^["']|["']$/g, '');
  return NULL_TOKENS.has(normalized.toLowerCase()) ? null : normalized;
}

function prototypeContractSection(prd) {
  const match = String(prd || '').match(
    /##\s+Prototype (?:contract|reference)[^\n]*\n([\s\S]*?)(?=\n##\s|$)/i
  );
  return match ? match[1] : null;
}

function parseRawContractField(section, key) {
  const match = String(section || '').match(
    new RegExp(`^[-*]\\s*${key}:\\s*(.+?)\\s*$`, 'mi')
  );
  return match ? String(match[1]).trim().replace(/^["']|["']$/g, '') : null;
}

function parseContractField(section, key) {
  return scalar(parseRawContractField(section, key));
}

function parseManifestFeature(manifest) {
  const frontmatter = parseFrontmatter(String(manifest || ''));
  const frontmatterFeature = scalar(frontmatter.feature);
  if (frontmatterFeature) return frontmatterFeature;
  return parseContractField(manifest, 'feature');
}

function issue(reason, message, field = null) {
  return { reason, message, ...(field ? { field } : {}) };
}

function firstIssue(result) {
  return Array.isArray(result?.issues) && result.issues.length > 0
    ? result.issues[0]
    : null;
}

async function readFileSafe(filePath) {
  try {
    return await fs.readFile(filePath, 'utf8');
  } catch {
    return null;
  }
}

async function validatePrototypeBinding({
  targetDir,
  slug,
  prd,
  strict = false,
  includeManifestContent = false
}) {
  const feature = String(slug || '').trim();
  const frontmatter = parseFrontmatter(String(prd || ''));
  const section = prototypeContractSection(prd);
  const issues = [];
  const warnings = [];
  const checks = {
    binding_consistent: false,
    feature_owned_paths: false,
    prototype_exists: false,
    manifest_exists: false,
    manifest_feature_matches: false
  };

  const hasPrototypeField = Object.prototype.hasOwnProperty.call(frontmatter, 'prototype');
  const hasStatusField = Object.prototype.hasOwnProperty.call(frontmatter, 'prototype_status');
  const hasFeatureField = Object.prototype.hasOwnProperty.call(frontmatter, 'prototype_feature');
  const frontPrototype = scalar(frontmatter.prototype);
  const sectionPrototype = parseContractField(section, 'prototype');
  const sectionManifest = parseContractField(section, 'manifest');
  const frontFeature = scalar(frontmatter.prototype_feature);
  const sectionFeature = parseContractField(section, 'feature');
  const sectionStatusValue = String(parseRawContractField(section, 'status') || '').toLowerCase();
  const sectionStatus = [CURRENT_STATUS, NONE_STATUS].includes(sectionStatusValue)
    ? sectionStatusValue
    : null;
  const frontStatus = String(frontmatter.prototype_status || '')
    .trim()
    .replace(/^["']|["']$/g, '')
    .toLowerCase();
  const rawStatus = String(frontStatus || sectionStatus || '').toLowerCase();

  const hasAnyBindingSignal = Boolean(
    section
    || hasPrototypeField
    || hasStatusField
    || hasFeatureField
  );
  if (!hasAnyBindingSignal) {
    if (strict) {
      issues.push(
        issue(
          'prototype_status_missing',
          'PRD must explicitly declare `prototype_status: current` or `prototype_status: none`.',
          'prototype_status'
        ),
        issue(
          'prototype_field_missing',
          'PRD must explicitly declare a feature-owned prototype path or `prototype: null`.',
          'prototype'
        ),
        issue(
          'prototype_feature_missing',
          'PRD must explicitly declare `prototype_feature: {slug}` or `prototype_feature: null`.',
          'prototype_feature'
        )
      );
      return {
        ok: false,
        applicable: false,
        status: NONE_STATUS,
        feature,
        checks,
        issues,
        warnings,
        message: issues[0].message
      };
    }
    return {
      ok: true,
      applicable: false,
      status: 'not_applicable',
      feature,
      checks,
      issues,
      warnings,
      message: 'PRD has no prototype binding declaration.'
    };
  }

  if (rawStatus && ![CURRENT_STATUS, NONE_STATUS].includes(rawStatus)) {
    issues.push(issue(
      'invalid_prototype_status',
      `prototype_status must be \`${CURRENT_STATUS}\` or \`${NONE_STATUS}\`, not \`${rawStatus}\`.`,
      'prototype_status'
    ));
  }
  if (frontStatus && sectionStatus && frontStatus !== sectionStatus) {
    issues.push(issue(
      'prototype_status_conflict',
      `PRD frontmatter declares prototype_status \`${frontStatus}\`, but its Prototype contract declares \`${sectionStatus}\`.`,
      'prototype_status'
    ));
  }

  const prototypePath = frontPrototype || sectionPrototype;
  const inferredStatus = prototypePath ? CURRENT_STATUS : NONE_STATUS;
  const status = [CURRENT_STATUS, NONE_STATUS].includes(rawStatus) ? rawStatus : inferredStatus;

  if (frontPrototype && sectionPrototype
    && normalizeRelPath(frontPrototype).toLowerCase() !== normalizeRelPath(sectionPrototype).toLowerCase()) {
    issues.push(issue(
      'prototype_binding_conflict',
      `PRD frontmatter points to \`${frontPrototype}\`, but its Prototype contract points to \`${sectionPrototype}\`.`,
      'prototype'
    ));
  }

  if (frontFeature && feature && frontFeature.toLowerCase() !== feature.toLowerCase()) {
    issues.push(issue(
      'prototype_feature_mismatch',
      `prototype_feature \`${frontFeature}\` does not own feature \`${feature}\`.`,
      'prototype_feature'
    ));
  }
  if (sectionFeature && feature && sectionFeature.toLowerCase() !== feature.toLowerCase()) {
    issues.push(issue(
      'prototype_feature_mismatch',
      `Prototype contract feature \`${sectionFeature}\` does not match active feature \`${feature}\`.`,
      'feature'
    ));
  }

  if (status === NONE_STATUS) {
    if (prototypePath || sectionManifest) {
      issues.push(issue(
        'prototype_binding_conflict',
        'prototype_status is `none`, but the PRD still carries a prototype or manifest path.',
        prototypePath ? 'prototype' : 'manifest'
      ));
    }
    if (strict && frontStatus !== NONE_STATUS) {
      issues.push(issue(
        'prototype_status_missing',
        'A feature without a prototype must declare `prototype_status: none` in PRD frontmatter.',
        'prototype_status'
      ));
    }
    if (strict && !hasPrototypeField) {
      issues.push(issue(
        'prototype_field_missing',
        'A feature without a prototype must declare `prototype: null` in PRD frontmatter.',
        'prototype'
      ));
    }
    if (strict && !hasFeatureField) {
      issues.push(issue(
        'prototype_feature_missing',
        'A feature without a prototype must declare `prototype_feature: null` in PRD frontmatter.',
        'prototype_feature'
      ));
    } else if (strict && frontFeature) {
      issues.push(issue(
        'prototype_binding_conflict',
        'prototype_status is `none`, so PRD frontmatter must declare `prototype_feature: null`.',
        'prototype_feature'
      ));
    }
    checks.binding_consistent = issues.length === 0;
    return {
      ok: issues.length === 0,
      applicable: false,
      explicit: true,
      status: NONE_STATUS,
      feature,
      checks,
      issues,
      warnings,
      message: issues.length === 0
        ? 'Feature explicitly declares that it has no binding prototype.'
        : firstIssue({ issues }).message
    };
  }

  if (!section) {
    issues.push(issue(
      'missing_prototype_contract',
      'PRD declares a current prototype but has no `## Prototype contract` section.',
      'prototype'
    ));
  }
  if (!prototypePath) {
    issues.push(issue(
      'missing_prototype_path',
      'Current prototype binding has no prototype path.',
      'prototype'
    ));
  }
  if (!sectionManifest) {
    issues.push(issue(
      'missing_manifest_path',
      'Current prototype binding has no manifest path in `## Prototype contract`.',
      'manifest'
    ));
  }

  if (strict && frontStatus !== CURRENT_STATUS) {
    issues.push(issue(
      'prototype_status_missing',
      'A binding prototype must declare `prototype_status: current` in PRD frontmatter.',
      'prototype_status'
    ));
  }
  if (strict && !frontPrototype) {
    issues.push(issue(
      'prototype_field_missing',
      'A binding prototype must declare its canonical path in PRD frontmatter.',
      'prototype'
    ));
  }
  if (strict && !frontFeature) {
    issues.push(issue(
      'prototype_feature_missing',
      'A binding prototype must declare its owner with `prototype_feature` in PRD frontmatter.',
      'prototype_feature'
    ));
  }

  const expectedPrototype = feature
    ? `.aioson/briefings/${feature}/prototype.html`
    : null;
  const expectedManifest = feature
    ? `.aioson/briefings/${feature}/prototype-manifest.md`
    : null;
  const normalizedPrototype = normalizeRelPath(prototypePath);
  const normalizedManifest = normalizeRelPath(sectionManifest);

  let prototypeSafe = { ok: false, reason: 'missing_path' };
  if (prototypePath) {
    prototypeSafe = resolveInsideRoot(targetDir, prototypePath);
    if (!prototypeSafe.ok) {
      issues.push(issue(
        prototypeSafe.reason,
        `Prototype path is invalid: ${prototypePath}.`,
        'prototype'
      ));
    }
  }

  let manifestSafe = { ok: false, reason: 'missing_path' };
  if (sectionManifest) {
    manifestSafe = resolveInsideRoot(targetDir, sectionManifest);
    if (!manifestSafe.ok) {
      issues.push(issue(
        manifestSafe.reason,
        `Prototype manifest path is invalid: ${sectionManifest}.`,
        'manifest'
      ));
    }
  }

  if (feature && prototypeSafe.ok
    && normalizedPrototype.toLowerCase() !== expectedPrototype.toLowerCase()) {
    issues.push(issue(
      'prototype_feature_mismatch',
      `Prototype \`${prototypePath}\` is not owned by feature \`${feature}\`; expected \`${expectedPrototype}\`.`,
      'prototype'
    ));
  }
  if (feature && manifestSafe.ok
    && normalizedManifest.toLowerCase() !== expectedManifest.toLowerCase()) {
    issues.push(issue(
      'prototype_feature_mismatch',
      `Manifest \`${sectionManifest}\` is not owned by feature \`${feature}\`; expected \`${expectedManifest}\`.`,
      'manifest'
    ));
  }
  checks.feature_owned_paths = Boolean(
    prototypeSafe.ok
    && manifestSafe.ok
    && (!feature || (
      normalizedPrototype.toLowerCase() === expectedPrototype.toLowerCase()
      && normalizedManifest.toLowerCase() === expectedManifest.toLowerCase()
    ))
  );

  let prototypeContent = null;
  if (prototypeSafe.ok && checks.feature_owned_paths) {
    prototypeContent = await readFileSafe(prototypeSafe.path);
    checks.prototype_exists = prototypeContent !== null;
    if (!checks.prototype_exists) {
      issues.push(issue(
        'dangling_prototype',
        `Prototype binding points to \`${prototypePath}\`, but that file is missing.`,
        'prototype'
      ));
    }
  }

  let manifest = null;
  let manifestFeature = null;
  if (manifestSafe.ok && checks.feature_owned_paths) {
    manifest = await readFileSafe(manifestSafe.path);
    checks.manifest_exists = manifest !== null;
    if (!checks.manifest_exists) {
      issues.push(issue(
        'missing_manifest',
        `Prototype exists but its manifest \`${sectionManifest}\` is missing.`,
        'manifest'
      ));
    } else {
      manifestFeature = parseManifestFeature(manifest);
      if (!manifestFeature) {
        const missingOwner = issue(
          'manifest_feature_missing',
          `Prototype manifest \`${sectionManifest}\` does not declare \`feature: ${feature || '{slug}'}\`.`,
          'manifest'
        );
        if (strict) issues.push(missingOwner);
        else warnings.push(missingOwner);
      } else if (feature && manifestFeature.toLowerCase() !== feature.toLowerCase()) {
        issues.push(issue(
          'prototype_feature_mismatch',
          `Prototype manifest belongs to feature \`${manifestFeature}\`, not \`${feature}\`.`,
          'manifest'
        ));
      } else {
        checks.manifest_feature_matches = true;
      }
    }
  }

  checks.binding_consistent = issues.length === 0;
  return {
    ok: issues.length === 0,
    applicable: true,
    explicit: hasStatusField && hasFeatureField,
    status: CURRENT_STATUS,
    feature,
    prototype: normalizedPrototype || null,
    manifest: normalizedManifest || null,
    ...(includeManifestContent ? { manifest_content: manifest } : {}),
    manifest_feature: manifestFeature,
    checks,
    issues,
    warnings,
    message: issues.length > 0
      ? firstIssue({ issues }).message
      : warnings.length > 0
        ? warnings[0].message
        : `Prototype binding is owned by feature \`${feature}\` and its files exist.`
  };
}

module.exports = {
  CURRENT_STATUS,
  NONE_STATUS,
  normalizeRelPath,
  prototypeContractSection,
  parseContractField,
  parseManifestFeature,
  validatePrototypeBinding
};
