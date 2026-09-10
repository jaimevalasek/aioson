'use strict';

const {
  resolveExistingInsideRoot,
  resolveInsideRoot
} = require('../verification/path-policy');
const {
  collectBriefingSourceFiles,
  sha256File
} = require('./briefing-source-pack');
const {
  AC_ID_RE,
  CAP_ID_RE,
  PROM_ID_EXACT_RE,
  SOURCE_ID_EXACT_RE,
  SCOPE_DECISIONS,
  cleanCell,
  extractIds,
  extractSection,
  finding,
  foldDiacritics,
  isPlaceholder,
  mapColumns,
  missingSection,
  normalizeDecision,
  normalizeCoverageDecision,
  normalizeLabel,
  parseFirstMarkdownTable,
  parseSurfacesOverride
} = require('./feature-completeness-format');

function normalizeSha256(value) {
  return cleanCell(value).toLowerCase().replace(/^sha256:/, '');
}

// Where a pinned source may live: the raw-source area and the research area
// (`web:save`/`web:extract` captures, orache research) — a captured page or a
// distilled extract is a source like any other once its fingerprint is pinned.
const SOURCE_ROOTS = ['plans/', 'researchs/'];
const SOURCE_ROOTS_LABEL = SOURCE_ROOTS.join(' or ');
// Whole words only — "webhook", "website" and "researcher" cite no web
// research. `\b` breaks on accented letters, so boundaries are spelled
// with \p{L}\p{N}.
const RESEARCH_WORD = /(?<![\p{L}\p{N}_])(?:web|research|pesquisas?)(?![\p{L}\p{N}_])/iu;

function insideSourceRoot(sourcePath) {
  return SOURCE_ROOTS.some((root) => sourcePath.startsWith(root));
}

function extractPhysicalSourcePlans(briefing) {
  return [...new Set(
    parseSurfacesOverride(briefing, 'source_plans')
      .map((item) => cleanCell(item).replace(/\\/g, '/'))
      .filter((item) => insideSourceRoot(item))
  )];
}

async function collectFeatureSourceFiles(targetDir, slug) {
  const collected = await collectBriefingSourceFiles(targetDir, slug);
  if (!collected.ok) return [];
  return collected.files.map((file) => file.path);
}

async function validateSourceLineage({
  targetDir,
  slug,
  briefing,
  prd,
  productMap,
  acceptance,
  lifecycle = {}
}) {
  const briefingArtifact = `.aioson/briefings/${slug}/briefings.md`;
  const prdArtifact = `.aioson/context/prd-${slug}.md`;
  if (!String(briefing || '').trim()) {
    return {
      applicable: false,
      findings: [],
      inventory: [],
      promises: [],
      coverage: []
    };
  }

  const findings = [];
  const inventory = [];
  const inventorySection = extractSection(briefing, ['Source Inventory', 'Inventario de Fontes']);
  const physicalPlans = [...new Set([
    ...extractPhysicalSourcePlans(briefing),
    ...await collectFeatureSourceFiles(targetDir, slug)
  ])];
  const knownSources = new Set();
  const missingInventorySources = [];

  if (physicalPlans.length > 0 && !inventorySection) {
    findings.push(missingSection('product', 'source_inventory_missing', 'Source Inventory in the briefing', briefingArtifact));
  } else if (inventorySection) {
    const table = parseFirstMarkdownTable(inventorySection);
    if (!table) {
      findings.push(finding('product', 'source_inventory_invalid', 'Source Inventory must contain a Markdown table', briefingArtifact));
    } else {
      const columns = mapColumns(table, {
        source: ['SRC', 'Source', 'Source ID', 'Fonte', 'ID da fonte'],
        path: ['Path', 'File', 'Caminho', 'Arquivo'],
        fingerprint: ['Fingerprint', 'SHA-256', 'SHA256', 'Hash'],
        purpose: ['Purpose', 'Use', 'Proposito', 'Finalidade', 'Uso']
      });
      if (columns.missing.length > 0) {
        findings.push(finding('product', 'source_inventory_columns', `Source Inventory missing column(s): ${columns.missing.join(', ')}`, briefingArtifact));
      } else {
        for (const [index, row] of table.rows.entries()) {
          const source = cleanCell(row[columns.indexes.source]);
          const sourcePath = cleanCell(row[columns.indexes.path]).replace(/\\/g, '/');
          const fingerprint = normalizeSha256(row[columns.indexes.fingerprint]);
          const purpose = cleanCell(row[columns.indexes.purpose]);
          const rowNumber = index + 1;
          if (!SOURCE_ID_EXACT_RE.test(source)) {
            findings.push(finding('product', 'source_id_invalid', `Source Inventory row ${rowNumber} must use a stable SRC-* ID`, briefingArtifact));
          }
          const sourceKey = source.toLowerCase();
          if (knownSources.has(sourceKey)) {
            findings.push(finding('product', 'source_id_duplicate', `duplicate source ID: ${source}`, briefingArtifact));
          }
          knownSources.add(sourceKey);
          if (!insideSourceRoot(sourcePath)) {
            findings.push(finding('product', 'source_path_invalid', `${source || `row ${rowNumber}`} must point inside root ${SOURCE_ROOTS_LABEL}`, briefingArtifact));
          }
          if (!/^[a-f0-9]{64}$/.test(fingerprint)) {
            findings.push(finding('product', 'source_fingerprint_invalid', `${source || `row ${rowNumber}`} must record a SHA-256 fingerprint`, briefingArtifact));
          }
          if (isPlaceholder(purpose)) {
            findings.push(finding('product', 'source_purpose_missing', `${source || `row ${rowNumber}`} must state how the source was used`, briefingArtifact));
          }

          const lexical = resolveInsideRoot(targetDir, sourcePath);
          const safe = lexical.ok && insideSourceRoot(sourcePath)
            ? await resolveExistingInsideRoot(targetDir, sourcePath)
            : { ok: false, reason: 'path_outside_root' };
          if (
            !lexical.ok
            || !insideSourceRoot(sourcePath)
            || (!safe.ok && safe.reason !== 'path_missing')
          ) {
            findings.push(finding('product', 'source_path_unsafe', `${source || `row ${rowNumber}`} source path is outside the permitted ${SOURCE_ROOTS_LABEL} input areas`, briefingArtifact));
          } else if (!safe.ok) {
            missingInventorySources.push({ source, sourcePath });
          } else {
            try {
              const current = await sha256File(safe.real_path);
              if (fingerprint && current !== fingerprint) {
                findings.push(finding('product', 'source_fingerprint_stale', `${source} changed after the briefing snapshot: ${sourcePath}`, briefingArtifact));
              }
            } catch {
              missingInventorySources.push({ source, sourcePath });
            }
          }
          inventory.push({
            source,
            path: sourcePath,
            fingerprint,
            purpose,
            file_status: safe.ok ? 'present' : 'missing'
          });
        }
      }
    }
  }

  const inventoryPaths = new Set(inventory.map((item) => item.path.toLowerCase()));

  const promises = [];
  const promiseSection = extractSection(briefing, ['Source Promise Map', 'Mapa de Promessas das Fontes']);
  if (!promiseSection) {
    findings.push(missingSection('product', 'source_promise_map_missing', 'Source Promise Map in the briefing', briefingArtifact));
  } else {
    const table = parseFirstMarkdownTable(promiseSection);
    if (!table) {
      findings.push(finding('product', 'source_promise_map_invalid', 'Source Promise Map must contain a Markdown table', briefingArtifact));
    } else {
      const columns = mapColumns(table, {
        promise: ['Promise', 'PROM', 'Promise ID', 'Promessa', 'ID da promessa'],
        source: ['Source', 'SRC', 'Fonte'],
        intent: ['Approved intent', 'Intent', 'Intencao aprovada', 'Intencao'],
        state: ['State', 'Decision', 'Estado', 'Decisao']
      });
      if (columns.missing.length > 0) {
        findings.push(finding('product', 'source_promise_map_columns', `Source Promise Map missing column(s): ${columns.missing.join(', ')}`, briefingArtifact));
      } else {
        const seen = new Set();
        for (const [index, row] of table.rows.entries()) {
          const promise = cleanCell(row[columns.indexes.promise]);
          const sources = String(row[columns.indexes.source] || '').match(/\bSRC(?:-[A-Za-z0-9]+)+\b/g) || [];
          const sourceText = cleanCell(row[columns.indexes.source]);
          const intent = cleanCell(row[columns.indexes.intent]);
          const state = normalizeDecision(row[columns.indexes.state]);
          const rowNumber = index + 1;
          if (!PROM_ID_EXACT_RE.test(promise)) {
            findings.push(finding('product', 'source_promise_id_invalid', `Source Promise Map row ${rowNumber} must use one stable PROM-* ID`, briefingArtifact));
          }
          const key = promise.toLowerCase();
          if (seen.has(key)) findings.push(finding('product', 'source_promise_id_duplicate', `duplicate promise ID: ${promise}`, briefingArtifact));
          seen.add(key);
          if (sources.length === 0 && !/(conversation|conversational|user statement|conversa|declaracao do usuario|web|research|pesquisa)/i.test(sourceText)) {
            findings.push(finding('product', 'source_promise_source_missing', `${promise || `row ${rowNumber}`} must cite SRC-* or an explicit conversational/research source`, briefingArtifact));
          }
          for (const source of sources) {
            if (!knownSources.has(source.toLowerCase())) {
              findings.push(finding('product', 'source_promise_source_unknown', `${promise || `row ${rowNumber}`} references undeclared source: ${source}`, briefingArtifact));
            }
          }
          if (isPlaceholder(intent)) findings.push(finding('product', 'source_promise_intent_missing', `${promise || `row ${rowNumber}`} has no approved intent`, briefingArtifact));
          if (!SCOPE_DECISIONS.has(state)) {
            findings.push(finding('product', 'source_promise_state_invalid', `${promise || `row ${rowNumber}`} state must be required, deferred, or not_applicable`, briefingArtifact));
          }
          // A promise that leans on web research without a pinned SRC-* row
          // is traceable to nothing a fingerprint can re-check — measured,
          // reported as a warning by kind=sources, never a refusal.
          promises.push({ promise, sources, intent, state, research_unpinned: sources.length === 0 && RESEARCH_WORD.test(sourceText) });
        }
      }
    }
  }
  if (promises.filter((item) => item.state === 'required').length === 0) {
    findings.push(finding('product', 'source_required_promise_missing', 'An approved briefing must preserve at least one required PROM-*', briefingArtifact));
  }

  const coverage = [];
  const validCoveragePromises = new Set();
  const coverageSection = extractSection(prd, ['Source Coverage', 'Cobertura das Fontes']);
  if (!coverageSection) {
    findings.push(missingSection('product', 'source_coverage_missing', 'Source Coverage in the PRD', prdArtifact));
  } else {
    const table = parseFirstMarkdownTable(coverageSection);
    if (!table) {
      findings.push(finding('product', 'source_coverage_invalid', 'Source Coverage must contain a Markdown table', prdArtifact));
    } else {
      const columns = mapColumns(table, {
        promise: ['Promise', 'PROM', 'Promessa'],
        decision: ['Product decision', 'Decision', 'Decisao do produto', 'Decisao'],
        trace: ['CAP / AC', 'CAP/AC', 'Trace', 'Rastreio'],
        // `Evidence or rationale` is the header prd-contract.md printed from
        // 2026-09-08: PRDs copied from that "exact shape" must not be blocked
        // at Gates A/B over a conjunction.
        rationale: ['Evidence / rationale', 'Evidence or rationale', 'Rationale', 'Evidence', 'Evidencia / justificativa', 'Evidencia ou justificativa', 'Justificativa']
      });
      if (columns.missing.length > 0) {
        findings.push(finding('product', 'source_coverage_columns', `Source Coverage missing column(s): ${columns.missing.join(', ')}`, prdArtifact));
      } else {
        const knownPromises = new Set(promises.map((item) => item.promise.toLowerCase()));
        const promiseById = new Map(promises.map((item) => [item.promise.toLowerCase(), item]));
        const knownCaps = new Set(productMap.allCaps.map((item) => item.toLowerCase()));
        const knownAcs = new Set(acceptance.rows.map((item) => item.ac.toLowerCase()));
        const seen = new Set();
        for (const [index, row] of table.rows.entries()) {
          const promise = cleanCell(row[columns.indexes.promise]);
          const decision = normalizeCoverageDecision(row[columns.indexes.decision]);
          const trace = cleanCell(row[columns.indexes.trace]);
          const caps = extractIds(trace, CAP_ID_RE);
          const acs = extractIds(trace, AC_ID_RE);
          const rationale = cleanCell(row[columns.indexes.rationale]);
          const rowNumber = index + 1;
          if (!PROM_ID_EXACT_RE.test(promise)) {
            findings.push(finding('product', 'source_coverage_promise_invalid', `Source Coverage row ${rowNumber} must cite one PROM-*`, prdArtifact));
          }
          const key = promise.toLowerCase();
          if (!knownPromises.has(key)) findings.push(finding('product', 'source_coverage_promise_unknown', `Source Coverage references unknown promise: ${promise}`, prdArtifact));
          if (seen.has(key)) findings.push(finding('product', 'source_coverage_promise_duplicate', `Source Coverage duplicates promise: ${promise}`, prdArtifact));
          seen.add(key);
          if (!decision) findings.push(finding('product', 'source_coverage_decision_invalid', `${promise || `row ${rowNumber}`} decision must be required, already_satisfied, deferred, rejected, or not_applicable`, prdArtifact));
          if (['required', 'already_satisfied'].includes(decision)) {
            if (caps.length === 0 || acs.length === 0) {
              findings.push(finding('product', 'source_coverage_trace_missing', `${promise || `row ${rowNumber}`} must trace to at least one CAP-* and AC-*`, prdArtifact));
            }
            for (const cap of caps) {
              if (!knownCaps.has(cap.toLowerCase())) findings.push(finding('product', 'source_coverage_cap_unknown', `${promise} references undeclared capability: ${cap}`, prdArtifact));
            }
            for (const ac of acs) {
              if (!knownAcs.has(ac.toLowerCase())) findings.push(finding('product', 'source_coverage_ac_unknown', `${promise} references undeclared acceptance criterion: ${ac}`, prdArtifact));
            }
          }
          const originalPromise = promiseById.get(key);
          if (
            originalPromise?.state === 'required'
            && ['deferred', 'rejected', 'not_applicable'].includes(decision)
            && !/(user[- ]approved|approved by (?:the )?user|user decision|usuario aprovou|aprovado pelo usuario|decisao do usuario)/i.test(foldDiacritics(rationale))
          ) {
            findings.push(finding(
              'product',
              'source_required_promise_downgraded_without_user_approval',
              `${promise} was required in the approved briefing; a non-required Product decision must cite explicit user approval`,
              prdArtifact
            ));
          }
          if (isPlaceholder(rationale)) findings.push(finding('product', 'source_coverage_rationale_missing', `${promise || `row ${rowNumber}`} requires evidence or rationale`, prdArtifact));
          if (
            PROM_ID_EXACT_RE.test(promise)
            && knownPromises.has(key)
            && !seen.has(`invalid:${key}`)
            && decision
          ) {
            validCoveragePromises.add(key);
          }
          coverage.push({ promise, decision, caps, acs, rationale });
        }
        for (const promise of promises) {
          if (!seen.has(promise.promise.toLowerCase())) {
            findings.push(finding('product', 'source_promise_dropped', `${promise.promise} from the approved briefing is absent from the PRD Source Coverage`, prdArtifact));
          }
        }
      }
    }
  }

  const registryEntry = lifecycle.registry_entry || null;
  const generatedPrd = Boolean(registryEntry && registryEntry.prd_generated);
  const lifecycleContradictory = Boolean(
    (generatedPrd && registryEntry.status === 'draft')
    || (generatedPrd && (!lifecycle.prd_exists || !String(prd || '').trim()))
  );
  const coverageComplete = promises.length > 0
    && promises.every((item) => validCoveragePromises.has(item.promise.toLowerCase()));
  const absorbed = Boolean(
    generatedPrd
    && !lifecycleContradictory
    && coverageComplete
  );
  const lifecycleStage = lifecycleContradictory
    ? 'contradictory'
    : absorbed
      ? 'post_prd_absorbed'
      : 'pre_product';

  if (lifecycleContradictory || (generatedPrd && !coverageComplete)) {
    findings.push(finding(
      'product',
      'source_lifecycle_contradictory',
      'Briefing registry and generated PRD do not prove complete canonical source absorption',
      briefingArtifact
    ));
  }
  if (!absorbed) {
    for (const item of missingInventorySources) {
      findings.push(finding('product', 'source_file_missing', `${item.source} source file is missing: ${item.sourcePath}`, briefingArtifact));
    }
  }
  for (const sourcePath of physicalPlans) {
    if (inventoryPaths.has(sourcePath.toLowerCase())) continue;
    const present = await resolveExistingInsideRoot(targetDir, sourcePath);
    if (absorbed && present.reason === 'path_missing') continue;
    findings.push(finding('product', 'source_plan_not_in_inventory', `source_plans entry is absent from Source Inventory: ${sourcePath}`, briefingArtifact));
  }

  return {
    applicable: true,
    findings,
    inventory,
    promises,
    coverage,
    lifecycle: {
      stage: lifecycleStage,
      absorbed,
      registry_status: registryEntry ? registryEntry.status : null,
      prd_generated: registryEntry ? registryEntry.prd_generated : null
    }
  };
}

module.exports = {
  validateSourceLineage
};
