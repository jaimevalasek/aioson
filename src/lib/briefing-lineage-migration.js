'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');
const {
  PROM_ID_EXACT_RE,
  SOURCE_ID_EXACT_RE,
  SCOPE_DECISIONS,
  cleanCell,
  extractSection,
  mapColumns,
  normalizeCoverageDecision,
  normalizeDecision,
  normalizeLabel,
  parseFirstMarkdownTable,
  parseSurfacesOverride
} = require('./feature-completeness-format');
const {
  findBriefing,
  readBriefingRegistry,
  repinApproval
} = require('./refiner/briefing-registry');
const { resolveBriefingPath } = require('./refiner/briefing-paths');
const {
  isInsideRoot,
  relativeFromRoot,
  resolveExistingInsideRoot,
  resolveInsideRoot,
  toPosixPath
} = require('../verification/path-policy');

const MAX_BRIEFING_BYTES = 5 * 1024 * 1024;
const SAFE_SLUG = /^[a-z0-9][a-z0-9-]*$/;
const SOURCE_REF_RE = /\bSRC(?:-[A-Za-z0-9]+)+\b/gi;
// Report names carry digest prefixes; the full hashes live inside the report.
// Two whole sha256s put a report at 179 chars + slug below the project root,
// past Git for Windows' 260-char path limit on a modest root.
const NAME_DIGEST_CHARS = 16;

// A report a pre-1.74 run already wrote under the full-digest name is reused, never duplicated.
async function prepareReportPath(plan, migrationRelative) {
  await ensureSecureDirectory(plan.projectDir, `${migrationRelative}/reports`);
  const legacy = `${migrationRelative}/reports/${plan.before_sha256}-${plan.after_sha256}.json`;
  const short = `${migrationRelative}/reports/${plan.before_sha256.slice(0, NAME_DIGEST_CHARS)}-${plan.after_sha256.slice(0, NAME_DIGEST_CHARS)}.json`;
  return fs.access(path.join(plan.projectDir, legacy)).then(() => legacy, () => short);
}

function migrationError(code, message, details = {}) {
  const error = new Error(message);
  error.code = code;
  Object.assign(error, details);
  return error;
}

function sha256(content) {
  return crypto.createHash('sha256').update(content).digest('hex');
}

function canonicalJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function validateSlug(slug) {
  if (typeof slug !== 'string' || slug.length < 1) {
    throw migrationError('invalid_slug', 'A non-empty briefing slug is required.');
  }
  if (slug.length > 128 || !SAFE_SLUG.test(slug)) {
    throw migrationError('invalid_slug', 'Briefing slug must be 1-128 lowercase alphanumeric/hyphen characters.');
  }
  return slug;
}

function tableCell(value) {
  return String(value == null ? '' : value)
    .replace(/\r?\n/g, ' ')
    .replace(/\|/g, '\\|')
    .trim();
}

function referenceValue(value) {
  const cleaned = cleanCell(value);
  const markdownLink = cleaned.match(/^\[[^\]]+\]\(([^)]+)\)$/);
  return (markdownLink ? markdownLink[1] : cleaned).replace(/\\/g, '/');
}

function findHeadingRange(content, aliases) {
  const headings = [...String(content).matchAll(/^(#{1,6})\s+(.+?)\s*$/gm)];
  const normalizedAliases = aliases.map(normalizeLabel);
  const index = headings.findIndex((match) => normalizedAliases.includes(normalizeLabel(match[2])));
  if (index === -1) return null;
  const heading = headings[index];
  const level = heading[1].length;
  const next = headings.slice(index + 1).find((match) => match[1].length <= level);
  return {
    start: heading.index,
    end: next ? next.index : String(content).length
  };
}

function replaceRanges(content, replacements) {
  let output = content;
  for (const item of [...replacements].sort((left, right) => right.start - left.start)) {
    output = `${output.slice(0, item.start)}${item.value}${output.slice(item.end)}`;
  }
  return output;
}

function requireTable(section, code, label) {
  const table = parseFirstMarkdownTable(section);
  if (!table || table.malformed.length > 0) {
    throw migrationError(code, `${label} must contain one well-formed Markdown table.`);
  }
  return table;
}

function parseLegacyPromises(briefing) {
  const section = extractSection(briefing, ['Source Promise Map', 'Mapa de Promessas das Fontes']);
  if (!section) throw migrationError('source_promise_map_missing', 'Source Promise Map is missing.');
  const table = requireTable(section, 'source_promise_map_invalid', 'Source Promise Map');
  const canonical = mapColumns(table, {
    promise: ['Promise'],
    source: ['Source'],
    intent: ['Approved intent'],
    state: ['State']
  });
  if (canonical.missing.length === 0) return { canonical: true, rows: [] };

  const legacy = mapColumns(table, {
    promise: ['ID', 'Promise ID', 'ID da promessa'],
    intent: ['Promessa material preservada', 'Material promise preserved', 'Promise'],
    state: ['Disposição', 'Disposition', 'Decision', 'Estado']
  });
  if (legacy.missing.length > 0) {
    throw migrationError('source_promise_map_columns', `Legacy Source Promise Map is missing: ${legacy.missing.join(', ')}.`);
  }
  const optionalSource = mapColumns(table, { source: ['Source', 'Fonte', 'Origem'] }).indexes.source;
  const seen = new Set();
  const rows = table.rows.map((row, index) => {
    const promise = cleanCell(row[legacy.indexes.promise]);
    const intent = cleanCell(row[legacy.indexes.intent]);
    const state = normalizeDecision(row[legacy.indexes.state]);
    if (!PROM_ID_EXACT_RE.test(promise)) {
      throw migrationError('source_promise_id_invalid', `Source Promise Map row ${index + 1} must preserve one PROM-* ID.`);
    }
    const key = promise.toLowerCase();
    if (seen.has(key)) throw migrationError('source_promise_id_duplicate', `Duplicate promise ID: ${promise}.`);
    seen.add(key);
    if (!intent) throw migrationError('source_promise_intent_missing', `${promise} has no preserved intent.`);
    if (!SCOPE_DECISIONS.has(state)) {
      throw migrationError('source_promise_state_invalid', `${promise} has an unsupported disposition.`);
    }
    return {
      promise,
      source: optionalSource >= 0 ? cleanCell(row[optionalSource]) : '',
      intent,
      state
    };
  });
  if (rows.filter((row) => row.state === 'required').length === 0) {
    throw migrationError('source_required_promise_missing', 'At least one required PROM-* must be preserved.');
  }
  return { canonical: false, rows };
}

function verifyPrdCoverage(prd, promises) {
  if (!prd) return false;
  const section = extractSection(prd, ['Source Coverage', 'Cobertura das Fontes']);
  if (!section) throw migrationError('prd_source_coverage_missing', 'Generated PRD has no Source Coverage.');
  const table = requireTable(section, 'prd_source_coverage_invalid', 'PRD Source Coverage');
  const columns = mapColumns(table, {
    promise: ['Promise', 'PROM', 'Promessa'],
    decision: ['Product decision', 'Decision', 'Decisao do produto', 'Decisao']
  });
  if (columns.missing.length > 0) {
    throw migrationError('prd_source_coverage_columns', `PRD Source Coverage is missing: ${columns.missing.join(', ')}.`);
  }
  const covered = new Set();
  for (const row of table.rows) {
    const promise = cleanCell(row[columns.indexes.promise]);
    if (PROM_ID_EXACT_RE.test(promise) && normalizeCoverageDecision(row[columns.indexes.decision])) {
      covered.add(promise.toLowerCase());
    }
  }
  const missing = promises.filter((row) => !covered.has(row.promise.toLowerCase()));
  if (missing.length > 0) {
    throw migrationError('prd_source_coverage_incomplete', `Generated PRD does not cover: ${missing.map((row) => row.promise).join(', ')}.`);
  }
  return true;
}

async function sha256File(filePath) {
  return sha256(await fs.readFile(filePath));
}

function generatedSourceId(slug, index) {
  return `SRC-${slug.toUpperCase()}-${String(index + 1).padStart(3, '0')}`;
}

async function parseLegacyInventory({ projectDir, slug, briefing, absorbed }) {
  const section = extractSection(briefing, ['Source Inventory', 'Inventario de Fontes']);
  if (!section) throw migrationError('source_inventory_missing', 'Source Inventory is missing.');
  const table = requireTable(section, 'source_inventory_invalid', 'Source Inventory');
  const canonical = mapColumns(table, {
    source: ['Source'],
    path: ['Path'],
    fingerprint: ['Fingerprint'],
    purpose: ['Purpose']
  });
  if (canonical.missing.length === 0) return { canonical: true, sources: [], evidence: [], sourceMap: new Map() };

  const legacy = mapColumns(table, {
    source: ['ID', 'Source ID', 'ID da fonte'],
    reference: ['Fonte consultada', 'Consulted source', 'Source consulted'],
    purpose: ['Finalidade', 'Purpose', 'Use']
  });
  if (legacy.missing.length > 0) {
    throw migrationError('source_inventory_columns', `Legacy Source Inventory is missing: ${legacy.missing.join(', ')}.`);
  }

  const sources = [];
  const evidence = [];
  const sourceMap = new Map();
  const seenIds = new Set();
  for (const [index, row] of table.rows.entries()) {
    const legacyId = cleanCell(row[legacy.indexes.source]);
    const reference = referenceValue(row[legacy.indexes.reference]);
    const purpose = cleanCell(row[legacy.indexes.purpose]);
    if (!legacyId || seenIds.has(legacyId.toLowerCase())) {
      throw migrationError('source_id_duplicate', `Invalid or duplicate legacy source ID at row ${index + 1}.`);
    }
    seenIds.add(legacyId.toLowerCase());
    if (!reference || !purpose) {
      throw migrationError('source_inventory_row_invalid', `Legacy Source Inventory row ${index + 1} loses material information.`);
    }

    if (!/^plans\//i.test(reference)) {
      evidence.push({ id: legacyId, evidence: reference, purpose, availability: 'preserved' });
      continue;
    }

    const lexical = resolveInsideRoot(projectDir, reference);
    const resolved = await resolveExistingInsideRoot(projectDir, reference);
    if (!lexical.ok || (resolved.reason && resolved.reason !== 'path_missing')) {
      throw migrationError('source_path_unsafe', `Source path escapes the project root: ${reference}.`);
    }
    if (!resolved.ok) {
      if (!absorbed) throw migrationError('source_file_missing', `Source file is missing before canonical absorption: ${reference}.`);
      evidence.push({ id: legacyId, evidence: reference, purpose, availability: 'unavailable-after-absorption' });
      continue;
    }
    const source = SOURCE_ID_EXACT_RE.test(legacyId) ? legacyId : generatedSourceId(slug, sources.length);
    if (sources.some((item) => item.source.toLowerCase() === source.toLowerCase())) {
      throw migrationError('source_id_duplicate', `Duplicate canonical source ID: ${source}.`);
    }
    sources.push({
      source,
      path: toPosixPath(reference),
      fingerprint: `sha256:${await sha256File(resolved.real_path)}`,
      purpose
    });
    sourceMap.set(legacyId.toLowerCase(), source);
  }

  const declaredPlans = [...new Set([
    ...parseSurfacesOverride(briefing, 'source_plans')
  ].map(referenceValue).filter((item) => /^plans\//i.test(item)))];
  for (const declared of declaredPlans) {
    const represented = [...sources, ...evidence].some((item) => (
      String(item.path || item.evidence).toLowerCase() === declared.toLowerCase()
    ));
    if (!represented) {
      throw migrationError('source_plan_not_in_inventory', `source_plans entry is absent from legacy Source Inventory: ${declared}.`);
    }
  }
  return { canonical: false, sources, evidence, sourceMap };
}

function resolvePromiseSources(rows, inventory, briefing) {
  const conversational = parseSurfacesOverride(briefing, 'source_plans')
    .some((item) => /^(conversational|conversation|conversa)$/i.test(cleanCell(item)));
  return rows.map((row) => {
    let source = row.source;
    const explicitIds = [...new Set(`${source} ${row.intent}`.match(SOURCE_REF_RE) || [])];
    for (const id of explicitIds) {
      const mapped = inventory.sourceMap.get(id.toLowerCase());
      if (!mapped) throw migrationError('source_promise_source_unknown', `${row.promise} references undeclared source: ${id}.`);
      source = source
        ? source.replace(new RegExp(`\\b${id}\\b`, 'gi'), mapped)
        : mapped;
    }
    if (!source && explicitIds.length > 0) source = explicitIds.map((id) => inventory.sourceMap.get(id.toLowerCase())).join(' and ');
    if (!source && conversational) source = 'Legacy conversational source';
    if (!source && inventory.sources.length === 1) source = inventory.sources[0].source;
    if (!source && inventory.evidence.length === 1) source = `Legacy research evidence: ${inventory.evidence[0].id}`;
    if (!source) throw migrationError('source_promise_source_ambiguous', `${row.promise} has no unambiguous explicit source.`);
    return { ...row, source };
  });
}

function renderInventory(inventory, eol) {
  const lines = [
    '### Source Inventory',
    '',
    '| Source | Path | Fingerprint | Purpose |',
    '|---|---|---|---|',
    ...inventory.sources.map((row) => `| ${tableCell(row.source)} | \`${tableCell(row.path)}\` | \`${row.fingerprint}\` | ${tableCell(row.purpose)} |`)
  ];
  if (inventory.evidence.length > 0) {
    lines.push(
      '',
      '### Complementary lineage evidence (non-canonical)',
      '',
      '| ID | Evidence | Purpose | Availability |',
      '|---|---|---|---|',
      ...inventory.evidence.map((row) => `| ${tableCell(row.id)} | \`${tableCell(row.evidence)}\` | ${tableCell(row.purpose)} | ${row.availability} |`)
    );
  }
  return `${lines.join(eol)}${eol}${eol}`;
}

function renderPromises(rows, eol) {
  return `${[
    '### Source Promise Map',
    '',
    '| Promise | Source | Approved intent | State |',
    '|---|---|---|---|',
    ...rows.map((row) => `| ${row.promise} | ${tableCell(row.source)} | ${tableCell(row.intent)} | ${row.state} |`)
  ].join(eol)}${eol}${eol}`;
}

function mergeExistingComplementaryEvidence(briefing, inventory) {
  const aliases = ['Complementary lineage evidence (non-canonical)', 'Evidencias complementares de linhagem (nao canonicas)'];
  const range = findHeadingRange(briefing, aliases);
  if (!range) return { inventory, range: null };
  const table = requireTable(
    briefing.slice(range.start, range.end),
    'complementary_evidence_invalid',
    'Complementary lineage evidence'
  );
  const columns = mapColumns(table, {
    id: ['ID'],
    evidence: ['Evidence', 'Evidencia'],
    purpose: ['Purpose', 'Finalidade'],
    availability: ['Availability', 'Disponibilidade']
  });
  if (columns.missing.length > 0) {
    throw migrationError('complementary_evidence_columns', `Complementary lineage evidence is missing: ${columns.missing.join(', ')}.`);
  }
  const evidence = [...inventory.evidence];
  const byId = new Map(evidence.map((item) => [item.id.toLowerCase(), item]));
  for (const row of table.rows) {
    const item = {
      id: cleanCell(row[columns.indexes.id]),
      evidence: referenceValue(row[columns.indexes.evidence]),
      purpose: cleanCell(row[columns.indexes.purpose]),
      availability: cleanCell(row[columns.indexes.availability])
    };
    if (!item.id || !item.evidence || !item.purpose || !item.availability) {
      throw migrationError('complementary_evidence_row_invalid', 'Complementary lineage evidence contains an incomplete row.');
    }
    const existing = byId.get(item.id.toLowerCase());
    if (existing && JSON.stringify(existing) !== JSON.stringify(item)) {
      throw migrationError('complementary_evidence_conflict', `Complementary evidence ID has conflicting values: ${item.id}.`);
    }
    if (!existing) {
      evidence.push(item);
      byId.set(item.id.toLowerCase(), item);
    }
  }
  return { inventory: { ...inventory, evidence }, range };
}

async function affectedReviews(projectDir, slug, briefingRelativePath) {
  const packetsRelative = `.aioson/context/features/${slug}/reviews/packets`;
  const packetsPath = resolveInsideRoot(projectDir, packetsRelative);
  if (!packetsPath.ok) return [];
  const entries = await fs.readdir(packetsPath.path, { withFileTypes: true }).catch(() => []);
  const affected = [];
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.json')) continue;
    const packet = JSON.parse(await fs.readFile(path.join(packetsPath.path, entry.name), 'utf8'));
    const bindings = [packet.artifact, ...(Array.isArray(packet.authorities) ? packet.authorities : [])];
    if (bindings.some((binding) => toPosixPath(binding && binding.path) === briefingRelativePath)) {
      affected.push({ agent: packet.agent, packet_id: packet.packet_id, packet_path: `${packetsRelative}/${entry.name}` });
    }
  }
  return affected;
}

async function analyzeBriefingLineageMigration({ projectDir, slug }) {
  const root = path.resolve(projectDir || '.');
  const rootStat = await fs.stat(root).catch(() => null);
  if (!rootStat || !rootStat.isDirectory()) throw migrationError('project_not_found', 'Project path does not exist or is not a directory.');
  validateSlug(slug);

  const registry = await readBriefingRegistry(root).catch((error) => {
    throw migrationError('briefing_registry_invalid', `Cannot read briefing registry: ${error.message}`);
  });
  const entry = findBriefing(registry, slug);
  if (!entry) throw migrationError('briefing_not_registered', `Briefing slug is not registered: ${slug}.`);
  if (!['draft', 'approved'].includes(entry.status)) {
    throw migrationError('briefing_lifecycle_unsupported', `Briefing lifecycle is not migratable: ${entry.status}.`);
  }

  const briefingPath = resolveBriefingPath(root, slug, 'briefings.md');
  const briefingRelativePath = relativeFromRoot(root, briefingPath);
  const safeBriefing = await resolveExistingInsideRoot(root, briefingRelativePath);
  if (!safeBriefing.ok) throw migrationError('briefing_path_unsafe', 'briefings.md is missing or escapes the project root.');
  const stat = await fs.stat(safeBriefing.real_path);
  if (stat.size > MAX_BRIEFING_BYTES) throw migrationError('briefing_too_large', 'briefings.md exceeds the migration size limit.');
  const beforeContent = await fs.readFile(safeBriefing.real_path, 'utf8');

  const parsedPromises = parseLegacyPromises(beforeContent);
  let prd = '';
  if (entry.prd_generated) {
    const prdName = String(entry.prd_generated);
    if (path.basename(prdName) !== prdName || !prdName.endsWith('.md')) {
      throw migrationError('prd_path_invalid', 'Registry prd_generated must name one Markdown file.');
    }
    const prdRelative = `.aioson/context/${prdName}`;
    const safePrd = await resolveExistingInsideRoot(root, prdRelative);
    if (!safePrd.ok) throw migrationError('prd_missing', `Generated PRD is missing: ${prdRelative}.`);
    prd = await fs.readFile(safePrd.real_path, 'utf8');
  }
  const absorbed = parsedPromises.canonical ? Boolean(prd) : verifyPrdCoverage(prd, parsedPromises.rows);
  let inventory = await parseLegacyInventory({ projectDir: root, slug, briefing: beforeContent, absorbed });
  const complementary = inventory.canonical
    ? { inventory, range: null }
    : mergeExistingComplementaryEvidence(beforeContent, inventory);
  inventory = complementary.inventory;

  if (parsedPromises.canonical && inventory.canonical) {
    return {
      ok: true,
      status: 'already_canonical',
      slug,
      projectDir: root,
      briefingPath,
      briefing_relative_path: briefingRelativePath,
      beforeContent,
      afterContent: beforeContent,
      before_sha256: sha256(beforeContent),
      after_sha256: sha256(beforeContent),
      source_rows_migrated: 0,
      promise_rows_migrated: 0,
      complementary_evidence: 0,
      affected_reviews: []
    };
  }

  const eol = beforeContent.includes('\r\n') ? '\r\n' : '\n';
  const replacements = [];
  if (!inventory.canonical) {
    const range = findHeadingRange(beforeContent, ['Source Inventory', 'Inventario de Fontes']);
    if (!range) throw migrationError('source_inventory_missing', 'Source Inventory heading is missing.');
    if (complementary.range && complementary.range.start < range.end) {
      throw migrationError('complementary_evidence_position_invalid', 'Complementary lineage evidence must follow Source Inventory.');
    }
    replacements.push({
      ...range,
      end: complementary.range ? complementary.range.end : range.end,
      value: renderInventory(inventory, eol)
    });
  }
  const promises = parsedPromises.canonical
    ? []
    : resolvePromiseSources(parsedPromises.rows, inventory, beforeContent);
  if (!parsedPromises.canonical) {
    const range = findHeadingRange(beforeContent, ['Source Promise Map', 'Mapa de Promessas das Fontes']);
    if (!range) throw migrationError('source_promise_map_missing', 'Source Promise Map heading is missing.');
    replacements.push({ ...range, value: renderPromises(promises, eol) });
  }
  const afterContent = replaceRanges(beforeContent, replacements);
  const beforeHash = sha256(beforeContent);
  const afterHash = sha256(afterContent);
  return {
    ok: true,
    status: 'migration_planned',
    slug,
    projectDir: root,
    briefingPath,
    briefing_relative_path: briefingRelativePath,
    beforeContent,
    afterContent,
    before_sha256: beforeHash,
    after_sha256: afterHash,
    source_rows_migrated: inventory.canonical ? 0 : inventory.sources.length,
    promise_rows_migrated: parsedPromises.canonical ? 0 : promises.length,
    complementary_evidence: inventory.canonical ? 0 : inventory.evidence.length,
    affected_reviews: await affectedReviews(root, slug, briefingRelativePath)
  };
}

async function ensureSecureDirectory(root, relativePath) {
  const lexical = resolveInsideRoot(root, relativePath);
  if (!lexical.ok) throw migrationError('migration_storage_unsafe', 'Migration storage escapes the project root.');
  await fs.mkdir(lexical.path, { recursive: true });
  const realRoot = await fs.realpath(root);
  const realDirectory = await fs.realpath(lexical.path);
  if (!isInsideRoot(realRoot, realDirectory)) {
    throw migrationError('migration_storage_unsafe', 'Migration storage resolves outside the project root.');
  }
  return lexical.path;
}

async function writeImmutable(filePath, content) {
  try {
    const handle = await fs.open(filePath, 'wx', 0o600);
    try {
      await handle.writeFile(content);
      await handle.sync();
    } finally {
      await handle.close();
    }
    return true;
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
    const stat = await fs.lstat(filePath);
    if (!stat.isFile() || stat.isSymbolicLink()) {
      throw migrationError('migration_storage_unsafe', `Immutable migration artifact is not a regular file: ${filePath}.`);
    }
    if (!Buffer.from(await fs.readFile(filePath)).equals(Buffer.from(content))) {
      throw migrationError('migration_artifact_conflict', `Immutable migration artifact already exists with different content: ${filePath}.`);
    }
    return false;
  }
}

async function atomicReplace(filePath, content) {
  const tempPath = `${filePath}.${process.pid}-${crypto.randomUUID()}.tmp`;
  let handle;
  try {
    handle = await fs.open(tempPath, 'wx', 0o600);
    await handle.writeFile(content);
    await handle.sync();
    await handle.close();
    handle = null;
    await fs.rename(tempPath, filePath);
  } finally {
    if (handle) await handle.close().catch(() => {});
    await fs.rm(tempPath, { force: true }).catch(() => {});
  }
}

async function applyBriefingLineageMigration(plan, options = {}) {
  if (!plan || plan.status === 'already_canonical') return { ...plan, mode: 'write' };
  const current = await fs.readFile(plan.briefingPath, 'utf8');
  if (sha256(current) !== plan.before_sha256) {
    throw migrationError('briefing_changed_concurrently', 'briefings.md changed after migration analysis.');
  }

  const migrationRelative = `.aioson/briefings/${plan.slug}/lineage-migration`;
  const migrationDir = await ensureSecureDirectory(plan.projectDir, migrationRelative);
  const backupRelative = `${migrationRelative}/backups/${plan.before_sha256}.md`;
  const markerPath = path.join(migrationDir, 'transaction.json');
  await ensureSecureDirectory(plan.projectDir, `${migrationRelative}/backups`);
  const reportRelative = await prepareReportPath(plan, migrationRelative);
  await writeImmutable(path.join(plan.projectDir, backupRelative), plan.beforeContent);

  const report = {
    schema_version: 'briefing-lineage-migration/v1',
    feature_slug: plan.slug,
    briefing_path: plan.briefing_relative_path,
    before_sha256: plan.before_sha256,
    after_sha256: plan.after_sha256,
    source_rows_migrated: plan.source_rows_migrated,
    promise_rows_migrated: plan.promise_rows_migrated,
    complementary_evidence: plan.complementary_evidence,
    affected_reviews: plan.affected_reviews,
    next_action: plan.affected_reviews.length > 0 ? 'reprepare affected reviews' : 'rerun feature validation'
  };
  const marker = canonicalJson({ ...report, backup_path: backupRelative, report_path: reportRelative });
  let committed = false;
  try {
    await atomicReplace(markerPath, marker);
    const rechecked = await fs.readFile(plan.briefingPath, 'utf8');
    if (sha256(rechecked) !== plan.before_sha256) {
      throw migrationError('briefing_changed_concurrently', 'briefings.md changed before migration commit.');
    }
    await atomicReplace(plan.briefingPath, plan.afterContent);
    committed = true;
    if (options.hooks && options.hooks.afterBriefingCommit) {
      await options.hooks.afterBriefingCommit();
    }
    await writeImmutable(path.join(plan.projectDir, reportRelative), canonicalJson(report));
    await fs.rm(markerPath, { force: true });
  } catch (error) {
    if (committed) {
      try {
        await atomicReplace(plan.briefingPath, plan.beforeContent);
        await fs.rm(markerPath, { force: true });
      } catch (recoveryError) {
        throw migrationError('migration_recovery_failed', 'Migration failed and automatic restoration did not complete.', {
          cause_code: error.code || 'migration_failed',
          recovery_code: recoveryError.code || 'recovery_failed'
        });
      }
    } else {
      await fs.rm(markerPath, { force: true }).catch(() => {});
    }
    throw error;
  }
  await repinApproval(plan.projectDir, plan.slug, plan.beforeContent, plan.afterContent).catch(() => {});

  return {
    ok: true,
    mode: 'write',
    status: 'migrated',
    slug: plan.slug,
    briefing_path: plan.briefing_relative_path,
    before_sha256: plan.before_sha256,
    after_sha256: plan.after_sha256,
    source_rows_migrated: plan.source_rows_migrated,
    promise_rows_migrated: plan.promise_rows_migrated,
    complementary_evidence: plan.complementary_evidence,
    affected_reviews: plan.affected_reviews,
    backup_path: backupRelative,
    report_path: reportRelative,
    next_action: report.next_action
  };
}

function publicMigrationPlan(plan) {
  return {
    ok: true,
    mode: 'dry-run',
    status: plan.status,
    slug: plan.slug,
    briefing_path: plan.briefing_relative_path,
    before_sha256: plan.before_sha256,
    after_sha256: plan.after_sha256,
    source_rows_migrated: plan.source_rows_migrated,
    promise_rows_migrated: plan.promise_rows_migrated,
    complementary_evidence: plan.complementary_evidence,
    affected_reviews: plan.affected_reviews,
    next_action: plan.status === 'already_canonical' ? 'none' : 'rerun with --write to apply'
  };
}

module.exports = {
  analyzeBriefingLineageMigration,
  applyBriefingLineageMigration,
  publicMigrationPlan
};
