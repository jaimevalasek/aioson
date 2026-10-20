'use strict';

const fs = require('node:fs/promises');
const { parseFrontmatter } = require('../preflight-engine');
const { resolveInsideRoot } = require('../verification/path-policy');
const { isMeasuredRun } = require('./measured-run');

const CURRENT_STATUS = 'current';
const NONE_STATUS = 'none';
// Third status, valid only inside a measured benchmark round (marker-gated):
// the traversal skips the prototype stage without claiming the feature is
// non-visual — `none` means "genuinely nonvisual", this means "deliberately
// unmeasured visual contract". Outside a measured run it is a hard error.
const SKIPPED_MEASURED_RUN_STATUS = 'skipped_measured_run';
const NULL_TOKENS = new Set(['', 'null', 'none', '~']);

const IDENTITY_CURRENT = 'current';
const IDENTITY_PROJECT = 'project';
const IDENTITY_NONE = 'none';
const IDENTITY_STATUSES = [IDENTITY_CURRENT, IDENTITY_PROJECT, IDENTITY_NONE];
const PROJECT_IDENTITY_PATH = '.aioson/context/identity.md';

function normalizeRelPath(value) {
  return String(value || '')
    .trim()
    .replace(/^["']|["']$/g, '')
    .replace(/\\/g, '/')
    .replace(/^\.\//, '');
}

function scalar(value) {
  const normalized = String(value ?? '').trim().replace(/^["']|["']$/g, '');
  if (NULL_TOKENS.has(normalized.toLowerCase())) return null;
  // `identity: none — API-only feature`: the explicit none with its reason the
  // Product kernel asks for. Only the token before the reason is the value.
  const lead = normalized.match(/^(?:null|none|~)(?:\s*[—–:(;,]|\s+-)/i);
  return lead ? null : normalized;
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

function parseManifestStatus(manifest) {
  const frontmatter = parseFrontmatter(String(manifest || ''));
  const frontmatterStatus = scalar(frontmatter.status);
  if (frontmatterStatus) return frontmatterStatus.toLowerCase();
  const contractStatus = parseContractField(manifest, 'status');
  return contractStatus ? contractStatus.toLowerCase() : null;
}

function parseManifestIdentity(manifest) {
  const frontmatter = parseFrontmatter(String(manifest || ''));
  const frontmatterIdentity = scalar(frontmatter.identity);
  if (frontmatterIdentity) return frontmatterIdentity;
  return parseContractField(manifest, 'identity');
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

// feature:archive moves `.aioson/briefings/{slug}/` under
// `.aioson/context/done/{slug}/briefings/`. A partially archived feature
// (interrupted close, retroactive audit) must not read as a dangling binding:
// the binding path in the PRD stays canonical, only the read falls back.
async function readFeatureOwnedFile(targetDir, feature, primaryPath, fileName) {
  const live = await readFileSafe(primaryPath);
  if (live !== null || !feature) return { content: live, archived: false };
  const fallback = resolveInsideRoot(
    targetDir,
    `.aioson/context/done/${feature}/briefings/${fileName}`
  );
  if (!fallback.ok) return { content: null, archived: false };
  const content = await readFileSafe(fallback.path);
  return { content, archived: content !== null };
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
  const measuredRun = targetDir ? isMeasuredRun(targetDir) : false;
  const allowedStatuses = measuredRun
    ? [CURRENT_STATUS, NONE_STATUS, SKIPPED_MEASURED_RUN_STATUS]
    : [CURRENT_STATUS, NONE_STATUS];
  const issues = [];
  const warnings = [];
  const checks = {
    binding_consistent: false,
    feature_owned_paths: false,
    prototype_exists: false,
    manifest_exists: false,
    manifest_feature_matches: false,
    manifest_status_approved: false
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
  const sectionStatus = allowedStatuses.includes(sectionStatusValue)
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

  if (rawStatus && !allowedStatuses.includes(rawStatus)) {
    issues.push(issue(
      'invalid_prototype_status',
      rawStatus === SKIPPED_MEASURED_RUN_STATUS
        ? `prototype_status \`${SKIPPED_MEASURED_RUN_STATUS}\` is only valid inside a measured benchmark run (missing .aioson/benchmark/measured-run.json).`
        : `prototype_status must be \`${CURRENT_STATUS}\` or \`${NONE_STATUS}\`, not \`${rawStatus}\`.`,
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
  const status = allowedStatuses.includes(rawStatus) ? rawStatus : inferredStatus;

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

  if (status === SKIPPED_MEASURED_RUN_STATUS) {
    if (prototypePath || sectionManifest) {
      issues.push(issue(
        'prototype_binding_conflict',
        'prototype_status is `skipped_measured_run`, but the PRD still carries a prototype or manifest path.',
        prototypePath ? 'prototype' : 'manifest'
      ));
    }
    if (strict && frontStatus !== SKIPPED_MEASURED_RUN_STATUS) {
      issues.push(issue(
        'prototype_status_missing',
        'A measured-run PRD that skips the prototype must declare `prototype_status: skipped_measured_run` in PRD frontmatter.',
        'prototype_status'
      ));
    }
    if (strict && !hasPrototypeField) {
      issues.push(issue(
        'prototype_field_missing',
        'A measured-run PRD that skips the prototype must declare `prototype: null` in PRD frontmatter.',
        'prototype'
      ));
    }
    if (strict && !hasFeatureField) {
      issues.push(issue(
        'prototype_feature_missing',
        'A measured-run PRD that skips the prototype must declare `prototype_feature: null` in PRD frontmatter.',
        'prototype_feature'
      ));
    } else if (strict && frontFeature) {
      issues.push(issue(
        'prototype_binding_conflict',
        'prototype_status is `skipped_measured_run`, so PRD frontmatter must declare `prototype_feature: null`.',
        'prototype_feature'
      ));
    }
    checks.binding_consistent = issues.length === 0;
    return {
      ok: issues.length === 0,
      applicable: false,
      explicit: true,
      measured_run: true,
      status: SKIPPED_MEASURED_RUN_STATUS,
      feature,
      checks,
      issues,
      warnings,
      message: issues.length === 0
        ? 'Measured run: the prototype stage was deliberately skipped, and this PRD never becomes product authority.'
        : firstIssue({ issues }).message
    };
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
  let prototypeArchived = false;
  if (prototypeSafe.ok && checks.feature_owned_paths) {
    const read = await readFeatureOwnedFile(targetDir, feature, prototypeSafe.path, 'prototype.html');
    prototypeContent = read.content;
    prototypeArchived = read.archived;
    checks.prototype_exists = prototypeContent !== null;
    if (!checks.prototype_exists) {
      issues.push(issue(
        'dangling_prototype',
        `Prototype binding points to \`${prototypePath}\`, but that file is missing (checked the live briefing and \`.aioson/context/done/${feature}/briefings/\`).`,
        'prototype'
      ));
    } else if (prototypeArchived) {
      warnings.push(issue(
        'prototype_archived',
        `Prototype resolved from the feature archive \`.aioson/context/done/${feature}/briefings/prototype.html\`; the live briefing was already archived.`,
        'prototype'
      ));
    }
  }

  let manifest = null;
  let manifestFeature = null;
  let manifestStatus = null;
  if (manifestSafe.ok && checks.feature_owned_paths) {
    const read = await readFeatureOwnedFile(targetDir, feature, manifestSafe.path, 'prototype-manifest.md');
    manifest = read.content;
    checks.manifest_exists = manifest !== null;
    if (!checks.manifest_exists) {
      issues.push(issue(
        'missing_manifest',
        checks.prototype_exists
          ? `Prototype exists but its manifest \`${sectionManifest}\` is missing.`
          : `Prototype manifest \`${sectionManifest}\` is missing.`,
        'manifest'
      ));
    } else {
      manifestFeature = parseManifestFeature(manifest);
      manifestStatus = parseManifestStatus(manifest);
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
      checks.manifest_status_approved = manifestStatus === 'approved';
      if (strict && !checks.manifest_status_approved) {
        issues.push(issue(
          'prototype_manifest_not_approved',
          `Prototype manifest \`${sectionManifest}\` must declare \`status: approved\` after human briefing approval.`,
          'status'
        ));
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
    manifest_status: manifestStatus,
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

// Identity binding — the second half of the visual contract.
//
// `identity.md` is the extracted, editable record that parameterizes the one design
// engine. Unlike a prototype it has three legitimate shapes, so it is NOT a binary
// current/none field:
//   current  → feature-owned  .aioson/briefings/{feature}/identity.md  (scope: briefing)
//   project  → shared brand   .aioson/context/identity.md              (scope: brand)
//   none     → intent-first, no extracted identity
//
// An exploration identity is non-canonical by contract and may never reach a PRD.
//
// Policy: fail on a lie, stay quiet on silence. A PRD that never mentions identity is
// not broken — most features legitimately have none, and every in-flight PRD predates
// this field. The one case that DOES fail is the leak this guard exists for: the
// prototype manifest records the identity it was built from and the PRD drops it.
async function validateIdentityBinding({
  targetDir,
  slug,
  prd,
  manifest = null,
  prototypeApplicable = false,
  strict = false
}) {
  const feature = String(slug || '').trim();
  const frontmatter = parseFrontmatter(String(prd || ''));
  const section = prototypeContractSection(prd);
  const issues = [];
  const warnings = [];
  const checks = {
    declaration_present: false,
    path_owned: false,
    identity_exists: false,
    scope_matches: false
  };

  const hasIdentityField = Object.prototype.hasOwnProperty.call(frontmatter, 'identity');
  const hasStatusField = Object.prototype.hasOwnProperty.call(frontmatter, 'identity_status');
  const frontIdentity = scalar(frontmatter.identity);
  const sectionIdentity = parseContractField(section, 'identity');
  const frontStatus = String(frontmatter.identity_status || '')
    .trim()
    .replace(/^["']|["']$/g, '')
    .toLowerCase();

  const manifestIdentity = manifest ? parseManifestIdentity(manifest) : null;
  const declared = hasIdentityField || hasStatusField || Boolean(sectionIdentity);

  if (!declared) {
    // The upstream prototype was built from an identity and the PRD lost it.
    if (manifestIdentity) {
      issues.push(issue(
        'identity_binding_dropped',
        `The approved prototype manifest was built from \`${manifestIdentity}\`, but the PRD declares no identity binding. Carry it as \`identity\`/\`identity_status\` so implementation inherits the same visual record.`,
        'identity'
      ));
      return {
        ok: false,
        declared: false,
        status: IDENTITY_NONE,
        feature,
        identity: null,
        scope: null,
        manifest_identity: manifestIdentity,
        checks,
        issues,
        warnings,
        message: issues[0].message
      };
    }
    if (strict && prototypeApplicable) {
      warnings.push(issue(
        'identity_binding_undeclared',
        'PRD binds a current prototype but declares no identity binding. Declare `identity_status: current|project|none` so the visual record is explicit.',
        'identity_status'
      ));
    }
    return {
      ok: true,
      declared: false,
      status: IDENTITY_NONE,
      feature,
      identity: null,
      scope: null,
      manifest_identity: null,
      checks,
      issues,
      warnings,
      message: 'PRD declares no identity binding.'
    };
  }

  checks.declaration_present = true;
  const identityPath = frontIdentity || sectionIdentity;
  const inferredStatus = identityPath
    ? (normalizeRelPath(identityPath).toLowerCase() === PROJECT_IDENTITY_PATH
      ? IDENTITY_PROJECT
      : IDENTITY_CURRENT)
    : IDENTITY_NONE;
  const status = IDENTITY_STATUSES.includes(frontStatus) ? frontStatus : inferredStatus;

  if (frontStatus && !IDENTITY_STATUSES.includes(frontStatus)) {
    issues.push(issue(
      'invalid_identity_status',
      `identity_status must be \`${IDENTITY_STATUSES.join('`, `')}\`, not \`${frontStatus}\`.`,
      'identity_status'
    ));
  }
  if (frontIdentity && sectionIdentity
    && normalizeRelPath(frontIdentity).toLowerCase() !== normalizeRelPath(sectionIdentity).toLowerCase()) {
    issues.push(issue(
      'identity_binding_conflict',
      `PRD frontmatter points to identity \`${frontIdentity}\`, but its Prototype contract points to \`${sectionIdentity}\`.`,
      'identity'
    ));
  }
  if (manifestIdentity && identityPath
    && normalizeRelPath(manifestIdentity).toLowerCase() !== normalizeRelPath(identityPath).toLowerCase()) {
    issues.push(issue(
      'identity_binding_conflict',
      `The approved prototype manifest was built from \`${manifestIdentity}\`, but the PRD binds \`${identityPath}\`.`,
      'identity'
    ));
  }

  if (status === IDENTITY_NONE) {
    if (identityPath) {
      issues.push(issue(
        'identity_binding_conflict',
        'identity_status is `none`, but the PRD still carries an identity path.',
        'identity'
      ));
    }
    if (manifestIdentity) {
      issues.push(issue(
        'identity_binding_dropped',
        `identity_status is \`none\`, but the approved prototype manifest was built from \`${manifestIdentity}\`.`,
        'identity_status'
      ));
    }
    return {
      ok: issues.length === 0,
      declared: true,
      status: IDENTITY_NONE,
      feature,
      identity: null,
      scope: null,
      manifest_identity: manifestIdentity,
      checks,
      issues,
      warnings,
      message: issues.length === 0
        ? 'Feature explicitly declares that it has no identity record; the design engine runs intent-first.'
        : issues[0].message
    };
  }

  if (!identityPath) {
    issues.push(issue(
      'missing_identity_path',
      `identity_status is \`${status}\` but no identity path is declared.`,
      'identity'
    ));
    return {
      ok: false,
      declared: true,
      status,
      feature,
      identity: null,
      scope: null,
      manifest_identity: manifestIdentity,
      checks,
      issues,
      warnings,
      message: issues[0].message
    };
  }

  const normalizedIdentity = normalizeRelPath(identityPath);
  const expectedIdentity = status === IDENTITY_PROJECT
    ? PROJECT_IDENTITY_PATH
    : (feature ? `.aioson/briefings/${feature}/identity.md` : null);

  const identitySafe = resolveInsideRoot(targetDir, identityPath);
  if (!identitySafe.ok) {
    issues.push(issue(
      identitySafe.reason,
      `Identity path is invalid: ${identityPath}.`,
      'identity'
    ));
  } else if (expectedIdentity && normalizedIdentity.toLowerCase() !== expectedIdentity.toLowerCase()) {
    issues.push(issue(
      'identity_feature_mismatch',
      `Identity \`${identityPath}\` is not owned by feature \`${feature}\`; expected \`${expectedIdentity}\`.`,
      'identity'
    ));
  } else {
    checks.path_owned = true;
  }

  if (checks.path_owned) {
    // Project-scope identity lives outside the briefing and is never archived
    // per-feature; only the feature-owned record gets the done/ fallback.
    const read = status === IDENTITY_PROJECT
      ? { content: await readFileSafe(identitySafe.path), archived: false }
      : await readFeatureOwnedFile(targetDir, feature, identitySafe.path, 'identity.md');
    const content = read.content;
    checks.identity_exists = content !== null;
    if (!checks.identity_exists) {
      issues.push(issue(
        'dangling_identity',
        `Identity binding points to \`${identityPath}\`, but that file is missing.`,
        'identity'
      ));
    } else {
      if (read.archived) {
        warnings.push(issue(
          'identity_archived',
          `Identity resolved from the feature archive \`.aioson/context/done/${feature}/briefings/identity.md\`; the live briefing was already archived.`,
          'identity'
        ));
      }
      const recordFrontmatter = parseFrontmatter(content);
      const kind = scalar(recordFrontmatter.kind);
      const scope = String(scalar(recordFrontmatter.scope) || '').toLowerCase();
      const recordSlug = scalar(recordFrontmatter.slug);
      const expectedScope = status === IDENTITY_PROJECT ? 'brand' : 'briefing';

      if (kind && kind.toLowerCase() !== 'identity') {
        issues.push(issue(
          'identity_kind_mismatch',
          `\`${identityPath}\` declares \`kind: ${kind}\`; an identity binding must point at an identity record.`,
          'identity'
        ));
      } else if (!kind) {
        warnings.push(issue(
          'identity_kind_missing',
          `\`${identityPath}\` does not declare \`kind: identity\`. Regenerate it with reference-identity-extract so the record stays verifiable.`,
          'identity'
        ));
      }

      if (scope === 'exploration') {
        issues.push(issue(
          'identity_scope_non_canonical',
          `\`${identityPath}\` has \`scope: exploration\`. An exploration identity is non-canonical and may never bind a PRD; consolidate it into the feature-owned identity first.`,
          'identity'
        ));
      } else if (scope && scope !== expectedScope) {
        issues.push(issue(
          'identity_scope_mismatch',
          `identity_status is \`${status}\` but \`${identityPath}\` declares \`scope: ${scope}\`; expected \`${expectedScope}\`.`,
          'identity'
        ));
      } else {
        checks.scope_matches = true;
      }

      if (status === IDENTITY_CURRENT && feature && recordSlug
        && recordSlug.toLowerCase() !== feature.toLowerCase()) {
        issues.push(issue(
          'identity_feature_mismatch',
          `\`${identityPath}\` declares \`slug: ${recordSlug}\`, not \`${feature}\`.`,
          'identity'
        ));
      }
    }
  }

  return {
    ok: issues.length === 0,
    declared: true,
    status,
    feature,
    identity: normalizedIdentity || null,
    scope: status === IDENTITY_PROJECT ? 'brand' : 'briefing',
    manifest_identity: manifestIdentity,
    checks,
    issues,
    warnings,
    message: issues.length > 0
      ? issues[0].message
      : warnings.length > 0
        ? warnings[0].message
        : `Identity binding \`${normalizedIdentity}\` is owned and readable.`
  };
}

module.exports = {
  CURRENT_STATUS,
  NONE_STATUS,
  SKIPPED_MEASURED_RUN_STATUS,
  IDENTITY_CURRENT,
  IDENTITY_PROJECT,
  IDENTITY_NONE,
  IDENTITY_STATUSES,
  PROJECT_IDENTITY_PATH,
  normalizeRelPath,
  prototypeContractSection,
  parseContractField,
  parseManifestFeature,
  parseManifestStatus,
  parseManifestIdentity,
  validatePrototypeBinding,
  validateIdentityBinding
};
