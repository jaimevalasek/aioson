'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const {
  scanArtifacts,
  readFileSafe,
  detectClassification,
  parseFrontmatter
} = require('../preflight-engine');
const {
  validateCurrentSystemFit,
  validateImplementationDelta,
  validateArchitectureDecisions,
  validateInterfaceContract,
  validateEngineeringControls
} = require('./feature-repository-fit');
const { validatePrototypeBinding } = require('./prototype-binding');
const { validateSourceLineage } = require('./feature-source-lineage');
const {
  findBriefing,
  readBriefingRegistry
} = require('./refiner/briefing-registry');
const {
  REQ_ID_RE,
  AC_ID_RE,
  CAP_ID_RE,
  CAP_ID_EXACT_RE,
  AC_ID_EXACT_RE,
  CANONICAL_LENSES,
  OPERATIONAL_CONCERNS,
  SCOPE_DECISIONS,
  LEVERAGE_DECISIONS,
  foldDiacritics,
  normalizeLabel,
  cleanCell,
  isPlaceholder,
  extractIds,
  normalizeDecision,
  normalizeLeverageDecision,
  normalizeLens,
  normalizeOperationalConcern,
  parseSurfacesOverride,
  detectRichSurfaces,
  extractSection,
  parseFirstMarkdownTable,
  mapColumns,
  finding,
  missingSection,
  genericEvidence,
  genericBehavior
} = require('./feature-completeness-format');
const { readBrowserEvidence } = require('./browser-evidence');
const { validatePlanContract } = require('./plan-contract');
const { evaluateFollowups, VERDICT: FOLLOWUP_VERDICT } = require('./delivery-followups');

function validateProductCapabilityMap(content, artifact) {
  const findings = [];
  const section = extractSection(content, ['Feature Capability Map', 'Mapa de Capacidades da Feature']);
  if (!section) {
    findings.push(missingSection('product', 'feature_capability_map_missing', 'Feature Capability Map in the PRD', artifact));
    return { findings, rows: [], requiredCaps: [], allCaps: [] };
  }
  const table = parseFirstMarkdownTable(section);
  if (!table) {
    findings.push(finding('product', 'feature_capability_map_invalid', 'Feature Capability Map must contain a Markdown table', artifact));
    return { findings, rows: [], requiredCaps: [], allCaps: [] };
  }
  for (const bad of table.malformed) {
    findings.push(finding('product', 'feature_capability_map_row_malformed', `Feature Capability Map row ${bad.row} has ${bad.cells} cell(s), expected ${table.headers.length}; escape literal pipes as \\|`, artifact));
  }
  const columns = mapColumns(table, {
    cap: ['CAP', 'Capability ID', 'ID'],
    outcome: ['Promised outcome', 'Outcome', 'Resultado prometido', 'Resultado'],
    actor: ['Actor / trigger', 'Actor trigger', 'Actor / gatilho', 'Ator / gatilho', 'Ator'],
    decision: ['Scope decision', 'Decision', 'Decisao de escopo', 'Decisao'],
    rationale: ['Rationale', 'Reason', 'Justificativa', 'Motivo']
  });
  if (columns.missing.length > 0) {
    findings.push(finding('product', 'feature_capability_map_columns', `Feature Capability Map missing column(s): ${columns.missing.join(', ')}`, artifact));
    return { findings, rows: [], requiredCaps: [], allCaps: [] };
  }
  if (table.rows.length === 0) {
    findings.push(finding('product', 'feature_capability_map_empty', 'Feature Capability Map has no promise rows', artifact));
  }
  const rows = [];
  const seen = new Set();
  table.rows.forEach((row, index) => {
    const cap = cleanCell(row[columns.indexes.cap]);
    const outcome = cleanCell(row[columns.indexes.outcome]);
    const actor = cleanCell(row[columns.indexes.actor]);
    const decision = normalizeDecision(row[columns.indexes.decision]);
    const rationale = cleanCell(row[columns.indexes.rationale]);
    const rowNumber = index + 1;
    if (!CAP_ID_EXACT_RE.test(cap)) findings.push(finding('product', 'feature_cap_id_invalid', `Feature Capability Map row ${rowNumber} must use a stable CAP-* ID`, artifact));
    const key = cap.toLowerCase();
    if (seen.has(key)) findings.push(finding('product', 'feature_cap_id_duplicate', `duplicate capability ID: ${cap}`, artifact));
    seen.add(key);
    if (isPlaceholder(outcome)) findings.push(finding('product', 'feature_cap_outcome_missing', `${cap || `row ${rowNumber}`} has no observable promised outcome`, artifact));
    if (isPlaceholder(actor)) findings.push(finding('product', 'feature_cap_actor_missing', `${cap || `row ${rowNumber}`} has no actor or system trigger`, artifact));
    if (!SCOPE_DECISIONS.has(decision)) findings.push(finding('product', 'feature_cap_decision_invalid', `${cap || `row ${rowNumber}`} decision must be required, not_applicable, or deferred`, artifact));
    if (isPlaceholder(rationale)) findings.push(finding('product', 'feature_cap_rationale_missing', `${cap || `row ${rowNumber}`} requires a concrete scope rationale`, artifact));
    rows.push({ cap, outcome, actor, decision, rationale });
  });
  const requiredCaps = rows.filter((row) => row.decision === 'required' && CAP_ID_EXACT_RE.test(row.cap)).map((row) => row.cap);
  if (requiredCaps.length === 0) {
    findings.push(finding('product', 'feature_required_capability_missing', 'Feature Capability Map must contain at least one required CAP-*', artifact));
  }
  return {
    findings,
    rows,
    requiredCaps,
    allCaps: rows.filter((row) => CAP_ID_EXACT_RE.test(row.cap)).map((row) => row.cap)
  };
}

function validateRequirementsBaseline(content, artifact, applicable) {
  if (!applicable) return { findings: [], reqs: [], acs: [] };
  const reqs = extractIds(content, REQ_ID_RE);
  const acs = extractIds(content, AC_ID_RE);
  const findings = [];
  if (reqs.length === 0) findings.push(finding('requirements', 'requirements_ids_missing', 'formal feature requirements must declare at least one REQ-* ID', artifact));
  if (acs.length === 0) findings.push(finding('requirements', 'acceptance_criteria_ids_missing', 'formal feature requirements must declare at least one AC-* ID; zero criteria cannot pass', artifact));
  return { findings, reqs, acs };
}

function validateFeatureCapabilityMatrix(content, artifact, productMap) {
  const findings = [];
  const section = extractSection(content, ['Feature Capability Matrix', 'Matriz de Capacidades da Feature']);
  if (!section) {
    findings.push(missingSection('requirements', 'feature_capability_matrix_missing', 'Feature Capability Matrix in requirements', artifact));
    return { findings, rows: [], requiredLenses: [], capToAcs: {} };
  }
  const table = parseFirstMarkdownTable(section);
  if (!table) {
    findings.push(finding('requirements', 'feature_capability_matrix_invalid', 'Feature Capability Matrix must contain a Markdown table', artifact));
    return { findings, rows: [], requiredLenses: [], capToAcs: {} };
  }
  for (const bad of table.malformed) {
    findings.push(finding('requirements', 'feature_capability_matrix_row_malformed', `Feature Capability Matrix row ${bad.row} has ${bad.cells} cell(s), expected ${table.headers.length}; escape literal pipes as \\|`, artifact));
  }
  const columns = mapColumns(table, {
    cap: ['CAP', 'Capability', 'Capacidade'],
    lens: ['Lens', 'Completeness lens', 'Lente', 'Lente de completude'],
    decision: ['Decision', 'Status', 'Decisao'],
    behavior: ['Behavior / rationale', 'Behavior rationale', 'Comportamento / justificativa', 'Comportamento'],
    req: ['REQ', 'Requirement', 'Requisito'],
    ac: ['AC', 'Acceptance criteria', 'Criterio de aceite']
  });
  if (columns.missing.length > 0) {
    findings.push(finding('requirements', 'feature_capability_matrix_columns', `Feature Capability Matrix missing column(s): ${columns.missing.join(', ')}`, artifact));
    return { findings, rows: [], requiredLenses: [], capToAcs: {} };
  }
  if (table.rows.length === 0) {
    findings.push(finding('requirements', 'feature_capability_matrix_empty', 'Feature Capability Matrix has no decision rows', artifact));
  }

  const knownCaps = new Set(productMap.allCaps.map((cap) => cap.toLowerCase()));
  const rows = [];
  const seen = new Set();
  const capToAcs = new Map();
  table.rows.forEach((row, index) => {
    const scope = cleanCell(row[columns.indexes.cap]);
    const caps = extractIds(scope, CAP_ID_RE);
    const featureWide = ['feature-wide', 'feature', 'toda-a-feature'].includes(normalizeLabel(scope));
    const lens = normalizeLens(row[columns.indexes.lens]);
    const decision = normalizeDecision(row[columns.indexes.decision]);
    const behavior = cleanCell(row[columns.indexes.behavior]);
    const reqs = extractIds(row[columns.indexes.req], REQ_ID_RE);
    const acs = extractIds(row[columns.indexes.ac], AC_ID_RE);
    const rowNumber = index + 1;
    if (!featureWide && caps.length === 0) findings.push(finding('requirements', 'feature_matrix_cap_missing', `Feature Capability Matrix row ${rowNumber} must cite CAP-* or feature-wide`, artifact));
    for (const cap of caps) {
      if (!knownCaps.has(cap.toLowerCase())) findings.push(finding('requirements', 'feature_matrix_cap_unknown', `Feature Capability Matrix references undeclared capability: ${cap}`, artifact));
    }
    if (isPlaceholder(lens)) findings.push(finding('requirements', 'feature_matrix_lens_missing', `Feature Capability Matrix row ${rowNumber} has no lens`, artifact));
    if (!SCOPE_DECISIONS.has(decision)) findings.push(finding('requirements', 'feature_matrix_decision_invalid', `Feature Capability Matrix row ${rowNumber} decision must be required, not_applicable, or deferred`, artifact));
    if (isPlaceholder(behavior)) findings.push(finding('requirements', 'feature_matrix_behavior_missing', `Feature Capability Matrix row ${rowNumber} requires observable behavior or a concrete rationale`, artifact));
    if (decision === 'required' && (reqs.length === 0 || acs.length === 0)) {
      findings.push(finding('requirements', 'feature_matrix_trace_missing', `Feature Capability Matrix row ${rowNumber} is required and must cite at least one REQ-* and one AC-*`, artifact));
    }
    const key = `${normalizeLabel(scope)}:${lens}`;
    if (seen.has(key)) findings.push(finding('requirements', 'feature_matrix_decision_duplicate', `duplicate capability/lens decision: ${scope} / ${lens}`, artifact));
    seen.add(key);
    for (const cap of caps) {
      if (!capToAcs.has(cap.toLowerCase())) capToAcs.set(cap.toLowerCase(), new Set());
      acs.forEach((ac) => capToAcs.get(cap.toLowerCase()).add(ac));
    }
    rows.push({ scope, caps, featureWide, lens, decision, behavior, reqs, acs });
  });

  const presentLenses = new Set(rows.map((row) => row.lens));
  const missingLenses = CANONICAL_LENSES.filter((lens) => !presentLenses.has(lens));
  if (missingLenses.length > 0) {
    findings.push(finding('requirements', 'feature_completeness_lenses_missing', `no explicit decision for completeness lens(es): ${missingLenses.join(', ')}`, artifact));
  }
  for (const cap of productMap.requiredCaps) {
    const uncoveredLenses = CANONICAL_LENSES.filter((lens) => !rows.some((row) =>
      row.lens === lens
      && (row.featureWide || row.caps.some((value) => value.toLowerCase() === cap.toLowerCase()))));
    if (uncoveredLenses.length > 0) {
      findings.push(finding('requirements', 'feature_capability_lenses_missing', `${cap} has no scoped or feature-wide decision for: ${uncoveredLenses.join(', ')}`, artifact));
    }
    const hasPrimaryTrace = rows.some((row) => row.lens === 'primary-outcome'
      && row.decision === 'required'
      && row.caps.some((value) => value.toLowerCase() === cap.toLowerCase())
      && row.reqs.length > 0
      && row.acs.length > 0);
    if (!hasPrimaryTrace) {
      findings.push(finding('requirements', 'feature_capability_primary_trace_missing', `${cap} has no required primary-outcome row with REQ-* and AC-*`, artifact));
    }
  }

  return {
    findings,
    rows,
    requiredLenses: [...new Set(rows.filter((row) => row.decision === 'required').map((row) => row.lens))],
    capToAcs: Object.fromEntries([...capToAcs].map(([cap, acs]) => [cap, [...acs]]))
  };
}

function validateOperationalSurfaceMap(content, artifact) {
  const findings = [];
  const section = extractSection(content, ['Operational Surface Map', 'Mapa de Superficie Operacional']);
  if (!section) {
    findings.push(missingSection('product', 'operational_surface_map_missing', 'Operational Surface Map in the PRD for the operational-management extension', artifact));
    return { findings, objects: [] };
  }
  const table = parseFirstMarkdownTable(section);
  if (!table) {
    findings.push(finding('product', 'operational_surface_map_invalid', 'Operational Surface Map must contain a Markdown table', artifact));
    return { findings, objects: [] };
  }
  for (const bad of table.malformed) {
    findings.push(finding('product', 'operational_surface_map_row_malformed', `Operational Surface Map row ${bad.row} has ${bad.cells} cell(s), expected ${table.headers.length}; escape literal pipes as \\|`, artifact));
  }
  const columns = mapColumns(table, {
    object: ['Object', 'Core object', 'Objeto'],
    parent: ['Parent / owner', 'Parent owner', 'Pai / responsavel', 'Proprietario'],
    actions: ['Required actions', 'Actions', 'Acoes obrigatorias', 'Acoes'],
    surface: ['Management surface', 'Superficie de gerenciamento', 'Tela de gerenciamento'],
    states: ['Empty / error states', 'Empty error states', 'Estados vazio / erro', 'Estados vazios / erro'],
    permissions: ['Permissions / roles', 'Permissions roles', 'Permissoes / papeis', 'Papeis']
  });
  if (columns.missing.length > 0) {
    findings.push(finding('product', 'operational_surface_map_columns', `Operational Surface Map missing column(s): ${columns.missing.join(', ')}`, artifact));
    return { findings, objects: [] };
  }
  const objects = [];
  table.rows.forEach((row, index) => {
    const object = cleanCell(row[columns.indexes.object]);
    const incomplete = Object.entries(columns.indexes)
      .filter(([, column]) => isPlaceholder(row[column]))
      .map(([name]) => name);
    if (incomplete.length > 0) findings.push(finding('product', 'operational_surface_map_incomplete', `Operational Surface Map row ${index + 1} has empty/placeholder field(s): ${incomplete.join(', ')}`, artifact));
    if (!isPlaceholder(object)) objects.push(object);
  });
  if (table.rows.length === 0) findings.push(finding('product', 'operational_surface_map_empty', 'Operational Surface Map has no Core object rows', artifact));
  return { findings, objects: [...new Set(objects)] };
}

function validateOperationalDecisionMatrix(content, artifact, productSurface, productMap) {
  const findings = [];
  const section = extractSection(content, ['Operational Decision Matrix', 'Matriz de Decisoes Operacionais']);
  if (!section) {
    findings.push(missingSection('requirements', 'operational_decision_matrix_missing', 'Operational Decision Matrix in requirements for the operational-management extension', artifact));
    return { findings, rows: [] };
  }
  const table = parseFirstMarkdownTable(section);
  if (!table) {
    findings.push(finding('requirements', 'operational_decision_matrix_invalid', 'Operational Decision Matrix must contain a Markdown table', artifact));
    return { findings, rows: [] };
  }
  for (const bad of table.malformed) {
    findings.push(finding('requirements', 'operational_decision_matrix_row_malformed', `Operational Decision Matrix row ${bad.row} has ${bad.cells} cell(s), expected ${table.headers.length}; escape literal pipes as \\|`, artifact));
  }
  const columns = mapColumns(table, {
    object: ['Object', 'Core object', 'Objeto'],
    concern: ['Concern', 'Capability', 'Preocupacao', 'Capacidade'],
    decision: ['Decision', 'Status', 'Decisao'],
    rationale: ['Rationale', 'Behavior / rationale', 'Justificativa', 'Motivo'],
    cap: ['CAP', 'Capability ID', 'ID'],
    req: ['REQ', 'Requirement', 'Requisito'],
    ac: ['AC', 'Acceptance criteria', 'Criterio de aceite']
  });
  if (columns.missing.length > 0) {
    findings.push(finding('requirements', 'operational_decision_matrix_columns', `Operational Decision Matrix missing column(s): ${columns.missing.join(', ')}`, artifact));
    return { findings, rows: [] };
  }
  const knownCaps = new Set(productMap.allCaps.map((cap) => cap.toLowerCase()));
  const objectNames = new Map(productSurface.objects.map((object) => [normalizeLabel(object), object]));
  const rows = [];
  const seen = new Set();
  table.rows.forEach((row, index) => {
    const object = cleanCell(row[columns.indexes.object]);
    const objectKey = normalizeLabel(object);
    const concern = normalizeOperationalConcern(row[columns.indexes.concern]);
    const decision = normalizeDecision(row[columns.indexes.decision]);
    const rationale = cleanCell(row[columns.indexes.rationale]);
    const caps = extractIds(row[columns.indexes.cap], CAP_ID_RE);
    const reqs = extractIds(row[columns.indexes.req], REQ_ID_RE);
    const acs = extractIds(row[columns.indexes.ac], AC_ID_RE);
    const rowNumber = index + 1;
    if (!objectNames.has(objectKey)) findings.push(finding('requirements', 'operational_object_unknown', `Operational Decision Matrix row ${rowNumber} references an object absent from Operational Surface Map: ${object}`, artifact));
    if (!OPERATIONAL_CONCERNS.includes(concern)) findings.push(finding('requirements', 'operational_concern_unknown', `Operational Decision Matrix row ${rowNumber} uses unknown concern: ${cleanCell(row[columns.indexes.concern])}`, artifact));
    if (!SCOPE_DECISIONS.has(decision)) findings.push(finding('requirements', 'operational_decision_invalid', `Operational Decision Matrix row ${rowNumber} decision must be required, not_applicable, or deferred`, artifact));
    if (isPlaceholder(rationale)) findings.push(finding('requirements', 'operational_rationale_missing', `Operational Decision Matrix row ${rowNumber} requires behavior or a concrete rationale`, artifact));
    if (decision === 'required' && (caps.length === 0 || reqs.length === 0 || acs.length === 0)) {
      findings.push(finding('requirements', 'operational_trace_missing', `Operational Decision Matrix row ${rowNumber} is required and must cite CAP-*, REQ-*, and AC-*`, artifact));
    }
    caps.forEach((cap) => {
      if (!knownCaps.has(cap.toLowerCase())) findings.push(finding('requirements', 'operational_cap_unknown', `Operational Decision Matrix references undeclared capability: ${cap}`, artifact));
    });
    const key = `${objectKey}:${concern}`;
    if (seen.has(key)) findings.push(finding('requirements', 'operational_decision_duplicate', `duplicate operational decision: ${object} / ${concern}`, artifact));
    seen.add(key);
    rows.push({ object, objectKey, concern, decision, caps, reqs, acs });
  });
  for (const [objectKey, object] of objectNames) {
    const present = new Set(rows.filter((row) => row.objectKey === objectKey).map((row) => row.concern));
    const missing = OPERATIONAL_CONCERNS.filter((concern) => !present.has(concern));
    if (missing.length > 0) findings.push(finding('requirements', 'operational_decisions_missing', `${object} has no explicit operational decision for: ${missing.join(', ')}`, artifact));
  }
  return { findings, rows };
}

function validateLeverageMatrix(content, artifact, productMap) {
  const findings = [];
  const section = extractSection(content, ['Implementation Leverage Matrix', 'Matriz de Aproveitamento de Implementacao', 'Matriz de Reuso e Implementacao']);
  if (!section) {
    findings.push(missingSection('design', 'implementation_leverage_matrix_missing', 'Implementation Leverage Matrix in architecture/design-doc', artifact));
    return { findings, rows: [] };
  }
  const table = parseFirstMarkdownTable(section);
  if (!table) {
    findings.push(finding('design', 'implementation_leverage_matrix_invalid', 'Implementation Leverage Matrix must contain a Markdown table', artifact));
    return { findings, rows: [] };
  }
  for (const bad of table.malformed) {
    findings.push(finding('design', 'implementation_leverage_matrix_row_malformed', `Implementation Leverage Matrix row ${bad.row} has ${bad.cells} cell(s), expected ${table.headers.length}; escape literal pipes as \\|`, artifact));
  }
  const columns = mapColumns(table, {
    cap: ['CAP', 'Capability', 'Capacidade'],
    concern: ['Concern', 'Area', 'Preocupacao'],
    decision: ['Decision', 'Status', 'Decisao'],
    evidence: ['Evidence', 'Evidencia'],
    target: ['Target', 'Path / package', 'Destino', 'Caminho / pacote']
  });
  if (columns.missing.length > 0) {
    findings.push(finding('design', 'implementation_leverage_matrix_columns', `Implementation Leverage Matrix missing column(s): ${columns.missing.join(', ')}`, artifact));
    return { findings, rows: [] };
  }
  const knownCaps = new Set(productMap.allCaps.map((cap) => cap.toLowerCase()));
  const rows = [];
  const seen = new Set();
  table.rows.forEach((row, index) => {
    const caps = extractIds(row[columns.indexes.cap], CAP_ID_RE);
    const concern = cleanCell(row[columns.indexes.concern]);
    const decision = normalizeLeverageDecision(row[columns.indexes.decision]);
    const evidence = cleanCell(row[columns.indexes.evidence]);
    const target = cleanCell(row[columns.indexes.target]);
    const rowNumber = index + 1;
    if (caps.length === 0) findings.push(finding('design', 'implementation_leverage_cap_missing', `Implementation Leverage Matrix row ${rowNumber} must cite a declared CAP-*`, artifact));
    caps.forEach((cap) => {
      if (!knownCaps.has(cap.toLowerCase())) findings.push(finding('design', 'implementation_leverage_cap_unknown', `Implementation Leverage Matrix references undeclared capability: ${cap}`, artifact));
      const key = `${cap.toLowerCase()}:${normalizeLabel(concern)}`;
      if (seen.has(key)) findings.push(finding('design', 'implementation_leverage_duplicate', `duplicate leverage decision: ${cap} / ${concern}`, artifact));
      seen.add(key);
    });
    if (isPlaceholder(concern)) findings.push(finding('design', 'implementation_leverage_concern_missing', `Implementation Leverage Matrix row ${rowNumber} has no concern`, artifact));
    if (!LEVERAGE_DECISIONS.has(decision)) findings.push(finding('design', 'implementation_leverage_decision_invalid', `Implementation Leverage Matrix row ${rowNumber} has invalid decision`, artifact));
    if (isPlaceholder(evidence)) findings.push(finding('design', 'implementation_leverage_evidence_missing', `Implementation Leverage Matrix row ${rowNumber} must cite inspected repository/package evidence or a concrete N/A reason`, artifact));
    if (decision !== 'not_applicable' && isPlaceholder(target)) findings.push(finding('design', 'implementation_leverage_target_missing', `Implementation Leverage Matrix row ${rowNumber} must name the reused/new/custom path or package`, artifact));
    rows.push({ caps, concern, decision, evidence, target });
  });
  for (const cap of productMap.requiredCaps) {
    if (!rows.some((row) => row.caps.some((value) => value.toLowerCase() === cap.toLowerCase()))) {
      findings.push(finding('design', 'implementation_leverage_coverage_missing', `${cap} has no repository leverage decision`, artifact));
    }
  }
  return { findings, rows };
}

function validateDeliveryPlan(content, artifact, productMap) {
  const findings = [];
  const section = extractSection(content, ['Capability Delivery Plan', 'Plano de Entrega de Capacidades', 'Matriz de Entrega de Capacidades']);
  if (!section) {
    findings.push(missingSection('plan', 'capability_delivery_plan_missing', 'Capability Delivery Plan in implementation-plan', artifact));
    return { findings, rows: [] };
  }
  const table = parseFirstMarkdownTable(section);
  if (!table) {
    findings.push(finding('plan', 'capability_delivery_plan_invalid', 'Capability Delivery Plan must contain a Markdown table', artifact));
    return { findings, rows: [] };
  }
  for (const bad of table.malformed) {
    findings.push(finding('plan', 'capability_delivery_plan_row_malformed', `Capability Delivery Plan row ${bad.row} has ${bad.cells} cell(s), expected ${table.headers.length}; escape literal pipes as \\|`, artifact));
  }
  const columns = mapColumns(table, {
    cap: ['CAP', 'Capability ID', 'ID'],
    phase: ['Phase', 'Fase'],
    files: ['Files', 'Paths', 'Arquivos', 'Caminhos'],
    verification: ['Verification', 'Check', 'Verificacao']
  });
  if (columns.missing.length > 0) {
    findings.push(finding('plan', 'capability_delivery_plan_columns', `Capability Delivery Plan missing column(s): ${columns.missing.join(', ')}`, artifact));
    return { findings, rows: [] };
  }
  const knownCaps = new Set(productMap.allCaps.map((cap) => cap.toLowerCase()));
  const byCap = new Map();
  const rows = [];
  table.rows.forEach((row, index) => {
    const cap = cleanCell(row[columns.indexes.cap]);
    const phase = cleanCell(row[columns.indexes.phase]);
    const files = cleanCell(row[columns.indexes.files]);
    const verification = cleanCell(row[columns.indexes.verification]);
    const rowNumber = index + 1;
    if (!CAP_ID_EXACT_RE.test(cap)) findings.push(finding('plan', 'capability_delivery_cap_invalid', `Capability Delivery Plan row ${rowNumber} must cite one CAP-*`, artifact));
    if (CAP_ID_EXACT_RE.test(cap) && !knownCaps.has(cap.toLowerCase())) findings.push(finding('plan', 'capability_delivery_cap_unknown', `Capability Delivery Plan references undeclared capability: ${cap}`, artifact));
    if (isPlaceholder(phase)) findings.push(finding('plan', 'capability_delivery_phase_missing', `${cap || `row ${rowNumber}`} has no implementation phase`, artifact));
    if (isPlaceholder(files)) findings.push(finding('plan', 'capability_delivery_files_missing', `${cap || `row ${rowNumber}`} has no concrete create/modify/reuse paths`, artifact));
    if (isPlaceholder(verification)) findings.push(finding('plan', 'capability_delivery_verification_missing', `${cap || `row ${rowNumber}`} has no verification command or runtime check`, artifact));
    const key = cap.toLowerCase();
    if (byCap.has(key)) findings.push(finding('plan', 'capability_delivery_duplicate', `${cap} appears more than once in Capability Delivery Plan`, artifact));
    byCap.set(key, true);
    rows.push({ cap, phase, files, verification });
  });
  const missingCaps = productMap.requiredCaps.filter((cap) => !byCap.has(cap.toLowerCase()));
  if (missingCaps.length > 0) findings.push(finding('plan', 'capability_delivery_coverage_missing', `required capabilities missing from delivery plan: ${missingCaps.join(', ')}`, artifact));
  return { findings, rows };
}

function extractPlannedPaths(value) {
  const candidates = String(value || '')
    .replace(/<br\s*\/?>/gi, ',')
    .split(/[,;\n]/)
    .map((item) => cleanCell(item)
      .replace(/^\s*(?:create|modify|reuse|retire|criar|modificar|reusar|remover)\s*:\s*/i, '')
      .replace(/\s+\((?:create|modify|reuse|retire|new|existing|criar|modificar|reusar|novo|existente)\)\s*$/i, '')
      .trim())
    .filter(Boolean);

  return [...new Set(candidates.filter((candidate) => {
    if (/[*?{}[\]]/.test(candidate)) return false;
    if (/^(?:https?:|[a-z]+\s)/i.test(candidate)) return false;
    return /[\\/]/.test(candidate) || /\.[a-z0-9]{1,10}$/i.test(candidate);
  }))];
}

function plannedPathKey(value) {
  const normalized = String(value || '').replace(/\\/g, '/').replace(/^\.\//, '');
  return process.platform === 'win32' ? normalized.toLowerCase() : normalized;
}

async function pathExistsInsideRoot(targetDir, relPath) {
  const absolute = path.resolve(targetDir, relPath);
  const relative = path.relative(targetDir, absolute);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) return false;
  try {
    const [rootReal, targetReal, stat] = await Promise.all([
      fs.realpath(targetDir),
      fs.realpath(absolute),
      fs.stat(absolute)
    ]);
    const realRelative = path.relative(rootReal, targetReal);
    return stat.isFile()
      && Boolean(realRelative)
      && !realRelative.startsWith('..')
      && !path.isAbsolute(realRelative);
  } catch {
    return false;
  }
}

async function validateDeliveryPaths(targetDir, productMap, delivery, artifact, implementationDelta = { rows: [] }) {
  const findings = [];
  const plannedPathsByCap = new Map();
  const retiredPaths = new Set(
    (implementationDelta.rows || [])
      .filter((row) => row.action === 'retire')
      .flatMap((row) => row.paths || [])
      .map(plannedPathKey)
  );

  for (const row of delivery.rows) {
    if (!productMap.requiredCaps.some((cap) => cap.toLowerCase() === row.cap.toLowerCase())) continue;
    const plannedPaths = extractPlannedPaths(row.files);
    plannedPathsByCap.set(row.cap.toLowerCase(), plannedPaths);
    if (plannedPaths.length === 0) {
      findings.push(finding('execution', 'capability_delivery_paths_not_concrete', `${row.cap} has no deterministically checkable file path`, artifact));
      continue;
    }
    const missingPaths = [];
    const presentRetiredPaths = [];
    for (const plannedPath of plannedPaths) {
      const exists = await pathExistsInsideRoot(targetDir, plannedPath);
      if (retiredPaths.has(plannedPathKey(plannedPath))) {
        if (exists) presentRetiredPaths.push(plannedPath);
      } else if (!exists) {
        missingPaths.push(plannedPath);
      }
    }
    if (missingPaths.length > 0) {
      findings.push(finding('execution', 'capability_delivery_files_missing', `${row.cap} planned file(s) do not exist: ${missingPaths.join(', ')}`, artifact));
    }
    if (presentRetiredPaths.length > 0) {
      findings.push(finding('execution', 'capability_retired_files_present', `${row.cap} retired file(s) still exist: ${presentRetiredPaths.join(', ')}`, artifact));
    }
  }

  return { findings, plannedPathsByCap };
}

function labeledSmokeField(section, aliases) {
  const escaped = aliases.map((item) => item.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
  const match = String(section || '').match(
    new RegExp(`^[-*]\\s*(?:\\*\\*)?(?:${escaped})(?:\\*\\*)?\\s*:\\s*(.+?)\\s*$`, 'im')
  );
  return match ? cleanCell(match[1]) : '';
}


async function validateExecutionEvidence(
  targetDir,
  slug,
  productMap,
  requirementsMatrix,
  delivery,
  qaReport,
  implementationDelta = { rows: [] }
) {
  const artifact = `.aioson/context/qa-report-${slug}.md`;
  const deliveryPaths = await validateDeliveryPaths(
    targetDir,
    productMap,
    delivery,
    artifact,
    implementationDelta
  );
  const findings = [...deliveryPaths.findings];
  const coveredCaps = [];
  const disposition = parseFrontmatter(qaReport || '').verdict === FOLLOWUP_VERDICT
    ? await evaluateFollowups(targetDir, slug) : null;
  const deferred = new Set(disposition?.eligible ? disposition.deferred_acs : []);
  if (disposition && !disposition.eligible) findings.push(finding('execution', 'closure_followups_invalid', disposition.error || disposition.reason, artifact));
  const evidenceByCap = new Map();

  if (!String(qaReport || '').trim()) {
    findings.push(finding('execution', 'qa_execution_evidence_missing', `QA report is missing: ${artifact}`, artifact));
    findings.push(finding(
      'execution',
      'executed_capability_coverage_incomplete',
      `executed capabilities 0/${productMap.requiredCaps.length}; zero or partial execution can never pass Gate D`,
      artifact
    ));
    return { findings, ledger: null, coveredCaps };
  }

  const evidenceSection = extractSection(qaReport, [
    'CAP/AC evidence table',
    'Capability acceptance evidence',
    'Evidencias CAP/AC'
  ]);
  if (!evidenceSection) {
    findings.push(missingSection('execution', 'qa_capability_evidence_missing', 'CAP/AC evidence table in the QA report', artifact));
  } else {
    const table = parseFirstMarkdownTable(evidenceSection);
    if (!table) {
      findings.push(finding('execution', 'qa_capability_evidence_invalid', 'QA CAP/AC evidence must contain a Markdown table', artifact));
    } else {
      const columns = mapColumns(table, {
        cap: ['CAP', 'Capability', 'Capacidade'],
        ac: ['AC', 'Acceptance criterion', 'Criterio de aceite'],
        result: ['Result', 'Verdict', 'Resultado', 'Veredito'],
        evidence: ['Evidence', 'Proof', 'Evidencia', 'Prova']
      });
      if (columns.missing.length > 0) {
        findings.push(finding('execution', 'qa_capability_evidence_columns', `QA CAP/AC evidence missing column(s): ${columns.missing.join(', ')}`, artifact));
      } else {
        for (const row of table.rows) {
          const caps = extractIds(row[columns.indexes.cap], CAP_ID_RE);
          const acs = extractIds(row[columns.indexes.ac], AC_ID_RE);
          const result = normalizeLabel(row[columns.indexes.result]);
          const evidence = cleanCell(row[columns.indexes.evidence]);
          const passed = result === 'pass' || result === 'passed';
          for (const cap of caps) {
            const key = cap.toLowerCase();
            if (!evidenceByCap.has(key)) evidenceByCap.set(key, new Map());
            for (const ac of acs) {
              evidenceByCap.get(key).set(ac.toLowerCase(), {
                passed,
                evidence,
                concrete: !genericEvidence(evidence)
              });
            }
          }
        }
      }
    }
  }

  // A QA PASS row is a human claim; a failed browser walkthrough for the same
  // AC is a machine measurement taken on the real application. When the latest
  // measurement says fail, the claim does not stand until the walkthrough is
  // re-run green — the gate never takes prose over a replayable script.
  const browserEvidence = readBrowserEvidence(targetDir, slug);
  if (browserEvidence.ids.size > 0) {
    const contradicted = [];
    for (const [, acRows] of evidenceByCap) {
      for (const [ac, row] of acRows) {
        const measured = browserEvidence.ids.get(ac.toUpperCase());
        if (row.passed && measured && measured.status === 'fail' && !contradicted.includes(ac.toUpperCase())) contradicted.push(ac.toUpperCase());
      }
    }
    if (contradicted.length > 0) {
      findings.push(finding(
        'execution',
        'qa_pass_contradicts_browser_evidence',
        `QA records PASS for ${contradicted.join(', ')} but the latest browser walkthrough failed them — re-run the walkthrough green or change the verdict`,
        artifact
      ));
    }
  }

  for (const cap of productMap.requiredCaps) {
    const requiredAcs = requirementsMatrix.capToAcs[cap.toLowerCase()] || [];
    const capEvidence = evidenceByCap.get(cap.toLowerCase()) || new Map();
    const missingAcs = requiredAcs.filter((ac) => {
      const row = capEvidence.get(ac.toLowerCase());
      return !row || (!row.passed && !deferred.has(ac.toUpperCase())) || !row.concrete;
    });
    if (requiredAcs.length === 0 || missingAcs.length > 0) {
      findings.push(finding(
        'execution',
        'capability_runtime_evidence_missing',
        `${cap} lacks concrete QA PASS evidence for: ${missingAcs.length > 0 ? missingAcs.join(', ') : 'its acceptance criteria'}`,
        artifact
      ));
    } else {
      coveredCaps.push(cap);
    }
  }

  const commandsSection = extractSection(qaReport, [
    'Commands executed and results',
    'Comandos executados e resultados'
  ]);
  if (!commandsSection
    || !/\b(?:npm|node|npx|pnpm|yarn|bun|cargo|pytest|python|go|dotnet|make)\b/i.test(commandsSection)
    || !/\b(?:PASS|PASSED|exit(?: code)?\s*[:=]?\s*0|success|sucesso)\b/i.test(commandsSection)) {
    findings.push(finding(
      'execution',
      'qa_executed_command_evidence_missing',
      'QA must record at least one exact executed command and a successful result/exit code',
      artifact
    ));
  }

  const smokeSection = extractSection(qaReport, [
    'Production-path smoke',
    'Smoke do caminho de producao'
  ]);
  const smokeFields = {
    entry: labeledSmokeField(smokeSection, ['Entry', 'Production entry', 'Entrada']),
    trigger: labeledSmokeField(smokeSection, ['Trigger', 'Action', 'Gatilho', 'Acao']),
    boundary: labeledSmokeField(smokeSection, ['Real boundary', 'Boundary', 'Fronteira real', 'Fronteira']),
    state: labeledSmokeField(smokeSection, ['State change', 'Persistent state', 'Mudanca de estado', 'Estado alterado']),
    visible: labeledSmokeField(smokeSection, ['Visible result', 'Observable result', 'Resultado visivel', 'Resultado observavel'])
  };
  const missingSmoke = Object.entries(smokeFields)
    .filter(([, value]) => isPlaceholder(value) || genericEvidence(value))
    .map(([key]) => key);
  if (!smokeSection || missingSmoke.length > 0) {
    findings.push(finding(
      'execution',
      'production_path_smoke_not_reproducible',
      `Production-path smoke must record concrete entry, trigger, real boundary, state change, and visible result${missingSmoke.length > 0 ? ` (missing: ${missingSmoke.join(', ')})` : ''}`,
      artifact
    ));
  }

  if (coveredCaps.length !== productMap.requiredCaps.length) {
    findings.push(finding(
      'execution',
      'executed_capability_coverage_incomplete',
      `executed capabilities ${coveredCaps.length}/${productMap.requiredCaps.length}; zero or partial execution can never pass Gate D`,
      artifact
    ));
  }

  return { findings, ledger: null, coveredCaps };
}

function hasMeaningfulFeaturePromise(inputs) {
  const content = [inputs.prd, inputs.requirements, inputs.plan].filter(Boolean).join('\n');
  if (extractIds(content, CAP_ID_RE).length > 0
    || extractIds(content, REQ_ID_RE).length > 0
    || extractIds(content, AC_ID_RE).length > 0) return true;
  const withoutFrontmatter = content.replace(/^---\r?\n[\s\S]*?\r?\n---/m, '');
  const prose = withoutFrontmatter
    .replace(/^#{1,6}\s+.*$/gm, ' ')
    .replace(/^\s*\|?\s*:?-{3,}.*$/gm, ' ')
    .replace(/[`*_#|>-]/g, ' ');
  const words = foldDiacritics(prose).match(/\b[a-z0-9]{3,}\b/gi) || [];
  return words.length >= 12;
}

function hasCompletenessSection(inputs) {
  return Boolean(
    extractSection(inputs.prd, ['Feature Capability Map', 'Mapa de Capacidades da Feature'])
    || extractSection(inputs.requirements, ['Feature Capability Matrix', 'Matriz de Capacidades da Feature'])
    || extractSection(`${inputs.readiness}\n${inputs.designDoc}\n${inputs.architecture}`, ['Implementation Leverage Matrix', 'Matriz de Aproveitamento de Implementacao', 'Matriz de Reuso e Implementacao'])
    || extractSection(inputs.plan, ['Capability Delivery Plan', 'Plano de Entrega de Capacidades', 'Matriz de Entrega de Capacidades'])
  );
}

async function readFeatureInputs(targetDir, slug, artifacts) {
  // A6: feature:archive move briefings/{slug} → done/{slug}/briefings e
  // features/{slug} → done/{slug}/dossier; leituras caem para o arquivado.
  const briefingRoot = path.join(targetDir, '.aioson', 'briefings', slug);
  const archivedRoot = path.join(targetDir, '.aioson', 'context', 'done', slug);
  const dossierRoot = path.join(targetDir, '.aioson', 'context', 'features', slug);
  const readBriefingFile = async (name) =>
    (await readFileSafe(path.join(briefingRoot, name)))
    || (await readFileSafe(path.join(archivedRoot, 'briefings', name)));
  const readDossierFile = async (name) =>
    (await readFileSafe(path.join(dossierRoot, name)))
    || (await readFileSafe(path.join(archivedRoot, 'dossier', name)));
  return {
    prd: artifacts.prd.content || '',
    requirements: artifacts.requirements.content || '',
    architecture: artifacts.architecture.content || '',
    designDoc: artifacts.design_doc.content || '',
    readiness: artifacts.readiness?.content || '',
    plan: artifacts.implementation_plan.content || '',
    qaReport: artifacts.qa_report?.content || '',
    briefing: await readBriefingFile('briefings.md'),
    refinementReport: await readBriefingFile('refinement-report.md'),
    scopeExpansion: await readDossierFile('scope-expansion.md'),
    expansionAudit: await readDossierFile('expansion-audit.md'),
    expansionScout: await readBriefingFile('expansion-scout.md'),
    solutionOptions: await readBriefingFile('solution-options.md')
  };
}

function validatePrdAcceptanceCriteria(content, artifact, productMap) {
  const findings = [];
  const section = extractSection(content, ['Acceptance Criteria', 'Criterios de Aceite']);
  if (!section) {
    findings.push(missingSection('specification', 'acceptance_criteria_missing', 'Acceptance Criteria in the PRD', artifact));
    return { findings, rows: [], capToAcs: {} };
  }

  const table = parseFirstMarkdownTable(section);
  if (!table) {
    findings.push(finding('specification', 'acceptance_criteria_invalid', 'Acceptance Criteria must contain a Markdown table', artifact));
    return { findings, rows: [], capToAcs: {} };
  }

  const columns = mapColumns(table, {
    ac: ['AC', 'Acceptance criterion', 'Criterio de aceite'],
    cap: ['CAP', 'Capability', 'Capacidade'],
    behavior: ['Observable behavior', 'Behavior', 'Comportamento observavel', 'Comportamento'],
    evidence: ['Evidence', 'Verification', 'Evidencia', 'Verificacao']
  });
  if (columns.missing.length > 0) {
    findings.push(finding('specification', 'acceptance_criteria_columns', `Acceptance Criteria missing column(s): ${columns.missing.join(', ')}`, artifact));
    return { findings, rows: [], capToAcs: {} };
  }

  for (const bad of table.malformed) {
    findings.push(finding('specification', 'acceptance_criteria_row_malformed', `Acceptance Criteria row ${bad.row} has ${bad.cells} cell(s), expected ${table.headers.length}; escape literal pipes as \\|`, artifact));
  }

  const knownCaps = new Set(productMap.allCaps.map((cap) => cap.toLowerCase()));
  const seenAcs = new Set();
  const capToAcs = new Map();
  const rows = [];
  table.rows.forEach((row, index) => {
    const ac = cleanCell(row[columns.indexes.ac]);
    const caps = extractIds(row[columns.indexes.cap], CAP_ID_RE);
    const behavior = cleanCell(row[columns.indexes.behavior]);
    const evidence = cleanCell(row[columns.indexes.evidence]);
    const rowNumber = index + 1;

    if (!AC_ID_EXACT_RE.test(ac)) {
      findings.push(finding('specification', 'acceptance_criterion_id_invalid', `Acceptance Criteria row ${rowNumber} must use one stable AC-* ID`, artifact));
    }
    if (seenAcs.has(ac.toLowerCase())) {
      findings.push(finding('specification', 'acceptance_criterion_duplicate', `duplicate acceptance criterion: ${ac}`, artifact));
    }
    seenAcs.add(ac.toLowerCase());
    if (caps.length === 0) {
      findings.push(finding('specification', 'acceptance_criterion_cap_missing', `${ac || `row ${rowNumber}`} must cite at least one CAP-*`, artifact));
    }
    for (const cap of caps) {
      if (!knownCaps.has(cap.toLowerCase())) {
        findings.push(finding('specification', 'acceptance_criterion_cap_unknown', `${ac || `row ${rowNumber}`} references undeclared capability: ${cap}`, artifact));
      }
      if (!capToAcs.has(cap.toLowerCase())) capToAcs.set(cap.toLowerCase(), new Set());
      if (AC_ID_EXACT_RE.test(ac)) capToAcs.get(cap.toLowerCase()).add(ac);
    }
    if (isPlaceholder(behavior)) {
      findings.push(finding('specification', 'acceptance_criterion_behavior_missing', `${ac || `row ${rowNumber}`} has no observable behavior`, artifact));
    } else if (genericBehavior(behavior)) {
      findings.push(finding('specification', 'acceptance_criterion_behavior_generic', `${ac || `row ${rowNumber}`} states a verdict ("${behavior}"), not an observable behavior — write the trigger and what the user sees or the system returns`, artifact));
    }
    if (isPlaceholder(evidence)) {
      findings.push(finding('specification', 'acceptance_criterion_evidence_missing', `${ac || `row ${rowNumber}`} has no verification method`, artifact));
    }
    rows.push({ ac, caps, behavior, evidence });
  });

  for (const cap of productMap.requiredCaps) {
    if (!(capToAcs.get(cap.toLowerCase())?.size > 0)) {
      findings.push(finding('specification', 'acceptance_criteria_capability_coverage_missing', `${cap} has no acceptance criterion`, artifact));
    }
  }
  if (table.rows.length === 0) {
    findings.push(finding('specification', 'acceptance_criteria_empty', 'Acceptance Criteria has no rows', artifact));
  }

  return {
    findings,
    rows,
    capToAcs: Object.fromEntries([...capToAcs].map(([cap, acs]) => [cap, [...acs]]))
  };
}

async function analyzeFeatureCompleteness(targetDir, slug, options = {}) {
  const artifacts = options.artifacts || await scanArtifacts(targetDir, slug);
  const classification = String(options.classification || await detectClassification(targetDir, slug) || '').toUpperCase();
  const inputs = await readFeatureInputs(targetDir, slug, artifacts);
  const discoverySources = [inputs.prd, inputs.scopeExpansion, inputs.expansionAudit, inputs.expansionScout, inputs.solutionOptions].filter(Boolean);
  const detectedSurfaces = discoverySources.flatMap(detectRichSurfaces);
  const declaredSurfaces = discoverySources.flatMap((content) => parseSurfacesOverride(content));
  const operationalSurfaces = [...new Set([...detectedSurfaces, ...declaredSurfaces])];
  const prdFrontmatter = parseFrontmatter(inputs.prd || '');
  const explicitlyRequired = String(prdFrontmatter.feature_completeness || '').toLowerCase() === 'required';
  const contractPresent = Boolean(
    extractSection(inputs.prd, ['Feature Capability Map', 'Mapa de Capacidades da Feature'])
    || extractSection(inputs.prd, ['Acceptance Criteria', 'Criterios de Aceite'])
    || extractSection(inputs.plan, ['Capability Delivery Plan', 'Plano de Entrega de Capacidades', 'Matriz de Entrega de Capacidades'])
  );
  const formal = ['MICRO', 'SMALL', 'MEDIUM'].includes(classification);
  const meaningfulPromise = hasMeaningfulFeaturePromise(inputs);
  const briefingRegistryEntry = await readBriefingRegistry(targetDir)
    .then((registry) => findBriefing(registry, slug))
    .catch(() => null);
  const applicable = Boolean(options.force
    || explicitlyRequired
    || contractPresent
    || operationalSurfaces.length > 0
    || (formal && meaningfulPromise));

  const stageFindings = { product: [], specification: [], plan: [], execution: [] };
  let productMap = { findings: [], rows: [], requiredCaps: [], allCaps: [] };
  let sourceLineage = { applicable: false, findings: [], inventory: [], promises: [], coverage: [] };
  let currentSystemFit = { findings: [], rows: [] };
  let acceptance = { findings: [], rows: [], capToAcs: {} };
  let delivery = { findings: [], rows: [] };
  let planContract = { findings: [], warnings: [] };
  let engineeringControls = { findings: [], rows: [], explicitNone: false };
  let architectureDecisions = { findings: [], rows: [] };
  let interfaceContract = { findings: [], rows: [] };
  let implementationDelta = { findings: [], rows: [] };
  let execution = { findings: [], ledger: null, coveredCaps: [] };
  let prototypeBinding = {
    ok: true,
    applicable: false,
    status: 'not_applicable',
    issues: [],
    warnings: []
  };

  if (applicable) {
    productMap = validateProductCapabilityMap(inputs.prd, artifacts.prd.path || `prd-${slug}.md`);
    const repositoryFitToolkit = {
      CAP_ID_EXACT_RE,
      cleanCell,
      normalizeLabel,
      isPlaceholder,
      extractSection,
      parseFirstMarkdownTable,
      mapColumns,
      finding,
      extractPlannedPaths,
      pathExistsInsideRoot
    };
    currentSystemFit = validateCurrentSystemFit({
      content: inputs.prd,
      artifact: artifacts.prd.path || `prd-${slug}.md`,
      productMap,
      required: explicitlyRequired,
      toolkit: repositoryFitToolkit
    });
    prototypeBinding = await validatePrototypeBinding({
      targetDir,
      slug,
      prd: inputs.prd,
      strict: explicitlyRequired
    });
    acceptance = validatePrdAcceptanceCriteria(inputs.prd, artifacts.prd.path || `prd-${slug}.md`, productMap);
    sourceLineage = await validateSourceLineage({
      targetDir,
      slug,
      briefing: inputs.briefing,
      prd: inputs.prd,
      productMap,
      acceptance,
      lifecycle: {
        registry_entry: briefingRegistryEntry,
        prd_exists: Boolean(artifacts.prd.exists)
      }
    });
    delivery = validateDeliveryPlan(inputs.plan, artifacts.implementation_plan.path || `implementation-plan-${slug}.md`, productMap);
    planContract = await validatePlanContract({ targetDir, slug, content: inputs.plan, acceptance, delivery });
    engineeringControls = validateEngineeringControls({
      content: inputs.plan,
      artifact: artifacts.implementation_plan.path || `implementation-plan-${slug}.md`,
      // Enforce the new Planner contract at Gate C/Dev preflight without
      // retroactively invalidating an already implemented legacy plan at Gate D.
      required: explicitlyRequired && options.preImplementation === true,
      toolkit: repositoryFitToolkit
    });
    architectureDecisions = validateArchitectureDecisions({
      content: inputs.plan,
      artifact: artifacts.implementation_plan.path || `implementation-plan-${slug}.md`,
      toolkit: repositoryFitToolkit
    });
    interfaceContract = validateInterfaceContract({
      content: inputs.plan,
      artifact: artifacts.implementation_plan.path || `implementation-plan-${slug}.md`,
      productMap,
      toolkit: { ...repositoryFitToolkit, extractIds, CAP_ID_RE }
    });
    implementationDelta = await validateImplementationDelta({
      targetDir,
      content: inputs.plan,
      artifact: artifacts.implementation_plan.path || `implementation-plan-${slug}.md`,
      productMap,
      delivery,
      required: explicitlyRequired,
      preImplementation: options.preImplementation === true,
      toolkit: repositoryFitToolkit
    });

    stageFindings.product.push(
      ...productMap.findings,
      ...sourceLineage.findings,
      ...currentSystemFit.findings,
      ...prototypeBinding.issues.map((item) => finding(
        'product',
        `prototype_${item.reason}`,
        item.message,
        artifacts.prd.path || `prd-${slug}.md`
      ))
    );
    stageFindings.specification.push(...acceptance.findings);
    stageFindings.plan.push(...planContract.findings, ...delivery.findings, ...engineeringControls.findings, ...architectureDecisions.findings, ...interfaceContract.findings, ...implementationDelta.findings);
    if (options.includeExecution && delivery.findings.length === 0) {
      execution = await validateExecutionEvidence(
        targetDir,
        slug,
        productMap,
        { rows: acceptance.rows, capToAcs: acceptance.capToAcs },
        delivery,
        inputs.qaReport,
        implementationDelta
      );
      stageFindings.execution.push(...execution.findings);
    } else if (options.includeExecutionStructure && delivery.findings.length === 0) {
      const structural = await validateDeliveryPaths(
        targetDir,
        productMap,
        delivery,
        `.aioson/context/features/${slug}/implementation-ledger.md`,
        implementationDelta
      );
      execution = { findings: structural.findings, ledger: null, coveredCaps: [] };
      stageFindings.execution.push(...structural.findings);
    }
  }

  const findings = Object.values(stageFindings).flat();
  const ownership = findings.map((item) => {
    let owner = item.stage === 'execution'
      ? 'dev'
      : item.stage === 'plan'
        ? 'planner'
        : item.stage === 'specification'
          ? 'sheldon'
          : 'product';
    let action = `resolve ${item.check}`;
    if (item.check.startsWith('source_')) {
      owner = 'briefing-lineage-migration';
      action = `run briefing:migrate-lineage for ${slug} or repair its canonical source evidence`;
    } else if (
      item.check.startsWith('implementation_delta_')
      && options.implementationBaseline?.blocking
    ) {
      owner = options.implementationBaseline.owner;
      action = options.implementationBaseline.recommendation;
    }
    return { check: item.check, stage: item.stage, owner, action };
  });
  return {
    ok: findings.length === 0,
    feature: slug,
    classification: classification || 'unknown',
    applicable,
    activation: {
      explicit: explicitlyRequired,
      contract_present: contractPresent,
      formal_with_promise: formal && meaningfulPromise,
      operational_surface: operationalSurfaces.length > 0
    },
    operational_surfaces: operationalSurfaces,
    stage_findings: stageFindings,
    findings,
    ownership,
    implementation_baseline: options.implementationBaseline || null,
    product_map: productMap,
    source_lineage: sourceLineage,
    current_system_fit: currentSystemFit,
    prototype_binding: prototypeBinding,
    acceptance_criteria: acceptance,
    requirements_matrix: { rows: acceptance.rows, capToAcs: acceptance.capToAcs },
    operational_matrix: { rows: [] },
    leverage_matrix: { rows: implementationDelta.rows },
    plan_contract: planContract,
    engineering_controls: engineeringControls,
    architecture_decisions: architectureDecisions,
    interface_contract: interfaceContract,
    implementation_delta: implementationDelta,
    delivery_plan: delivery,
    execution_evidence: execution,
    baseline: { reqs: [], acs: acceptance.rows.map((row) => row.ac).filter(Boolean) },
    summary: {
      promised_capabilities: productMap.rows.length,
      source_promises: sourceLineage.promises.length,
      source_promises_covered: sourceLineage.coverage.length,
      required_capabilities: productMap.requiredCaps.length,
      current_system_fit_rows: currentSystemFit.rows.length,
      prototype_binding: prototypeBinding.status,
      acceptance_criteria: acceptance.rows.length,
      lens_decisions: 0,
      engineering_controls: engineeringControls.rows.length,
      leverage_rows: implementationDelta.rows.length,
      delivery_rows: delivery.rows.length,
      executed_capabilities: execution.coveredCaps.length,
      errors: findings.length
    }
  };
}

function findingsThroughStage(analysis, stage) {
  const stages = {
    product: ['product'],
    specification: ['product', 'specification'],
    requirements: ['product', 'specification'],
    design: ['product', 'specification'],
    plan: ['product', 'specification', 'plan'],
    execution: ['product', 'specification', 'plan', 'execution']
  };
  return (stages[stage] || stages.execution).flatMap((name) => analysis.stage_findings[name] || []);
}

module.exports = {
  REQ_ID_RE,
  AC_ID_RE,
  CAP_ID_RE,
  CANONICAL_LENSES,
  OPERATIONAL_CONCERNS,
  foldDiacritics,
  detectRichSurfaces,
  parseSurfacesOverride,
  extractSection,
  parseFirstMarkdownTable,
  validateRequirementsBaseline,
  validatePrdAcceptanceCriteria,
  analyzeFeatureCompleteness,
  findingsThroughStage,
  extractPlannedPaths,
  plannedPathKey
};
