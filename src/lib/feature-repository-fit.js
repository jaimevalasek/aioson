'use strict';

const path = require('node:path');

const FIT_DECISIONS = new Set(['reuse', 'extend', 'replace', 'new']);
const DELTA_ACTIONS = new Set(['reuse', 'modify', 'create', 'retire']);

const FIT_ALIASES = Object.freeze({
  reuse: 'reuse',
  reutilizar: 'reuse',
  reutilizacao: 'reuse',
  extend: 'extend',
  extension: 'extend',
  estender: 'extend',
  extensao: 'extend',
  replace: 'replace',
  substituir: 'replace',
  substituicao: 'replace',
  new: 'new',
  novo: 'new',
  nova: 'new'
});

const ACTION_ALIASES = Object.freeze({
  reuse: 'reuse',
  reutilizar: 'reuse',
  reutilizacao: 'reuse',
  modify: 'modify',
  modificar: 'modify',
  alteracao: 'modify',
  create: 'create',
  criar: 'create',
  criacao: 'create',
  retire: 'retire',
  retirar: 'retire',
  remover: 'retire',
  remocao: 'retire'
});

function normalizeMappedDecision(value, aliases, toolkit) {
  const raw = toolkit.cleanCell(value).toLowerCase();
  return aliases[raw] || aliases[toolkit.normalizeLabel(raw)] || toolkit.normalizeLabel(raw);
}

function normalizePathKey(value) {
  const normalized = String(value || '').replace(/\\/g, '/').replace(/^\.\//, '');
  return process.platform === 'win32' ? normalized.toLowerCase() : normalized;
}

function isSafeRepositoryPath(targetDir, relPath) {
  if (!relPath || path.isAbsolute(relPath)) return false;
  const absolute = path.resolve(targetDir, relPath);
  const relative = path.relative(targetDir, absolute);
  return Boolean(relative) && !relative.startsWith('..') && !path.isAbsolute(relative);
}

function validateCurrentSystemFit({
  content,
  artifact,
  productMap,
  required,
  toolkit
}) {
  const findings = [];
  const section = toolkit.extractSection(content, [
    'Current System Fit',
    'Encaixe no Sistema Atual',
    'Aderencia ao Sistema Atual'
  ]);
  if (!section) {
    if (required) {
      findings.push(toolkit.finding(
        'product',
        'current_system_fit_missing',
        'feature completeness requires ## Current System Fit in the PRD',
        artifact
      ));
    }
    return { findings, rows: [] };
  }

  const table = toolkit.parseFirstMarkdownTable(section);
  if (!table) {
    findings.push(toolkit.finding(
      'product',
      'current_system_fit_invalid',
      'Current System Fit must contain a Markdown table',
      artifact
    ));
    return { findings, rows: [] };
  }

  for (const bad of table.malformed) {
    findings.push(toolkit.finding(
      'product',
      'current_system_fit_row_malformed',
      `Current System Fit row ${bad.row} has ${bad.cells} cell(s), expected ${table.headers.length}; escape literal pipes as \\|`,
      artifact
    ));
  }

  const columns = toolkit.mapColumns(table, {
    cap: ['CAP', 'Capability', 'Capacidade'],
    evidence: [
      'Existing behavior / evidence',
      'Existing behavior',
      'Existing evidence',
      'Comportamento existente / evidencia',
      'Evidencia existente'
    ],
    decision: ['Fit decision', 'Decision', 'Decisao de encaixe', 'Encaixe'],
    delta: ['Required product delta', 'Product delta', 'Delta de produto requerido', 'Delta requerido']
  });
  if (columns.missing.length > 0) {
    findings.push(toolkit.finding(
      'product',
      'current_system_fit_columns',
      `Current System Fit missing column(s): ${columns.missing.join(', ')}`,
      artifact
    ));
    return { findings, rows: [] };
  }

  const knownCaps = new Set(productMap.allCaps.map((cap) => cap.toLowerCase()));
  const seenCaps = new Set();
  const rows = [];

  table.rows.forEach((row, index) => {
    const cap = toolkit.cleanCell(row[columns.indexes.cap]);
    const evidence = toolkit.cleanCell(row[columns.indexes.evidence]);
    const decision = normalizeMappedDecision(row[columns.indexes.decision], FIT_ALIASES, toolkit);
    const delta = toolkit.cleanCell(row[columns.indexes.delta]);
    const rowNumber = index + 1;
    const capKey = cap.toLowerCase();

    if (!toolkit.CAP_ID_EXACT_RE.test(cap)) {
      findings.push(toolkit.finding('product', 'current_system_fit_cap_invalid', `Current System Fit row ${rowNumber} must cite one CAP-*`, artifact));
    } else if (!knownCaps.has(capKey)) {
      findings.push(toolkit.finding('product', 'current_system_fit_cap_unknown', `Current System Fit references undeclared capability: ${cap}`, artifact));
    }
    if (seenCaps.has(capKey)) {
      findings.push(toolkit.finding('product', 'current_system_fit_duplicate', `${cap} appears more than once in Current System Fit`, artifact));
    }
    seenCaps.add(capKey);
    if (toolkit.isPlaceholder(evidence)) {
      findings.push(toolkit.finding('product', 'current_system_fit_evidence_missing', `${cap || `row ${rowNumber}`} has no inspected existing behavior or greenfield evidence`, artifact));
    }
    if (!FIT_DECISIONS.has(decision)) {
      findings.push(toolkit.finding('product', 'current_system_fit_decision_invalid', `${cap || `row ${rowNumber}`} fit decision must be reuse, extend, replace, or new`, artifact));
    }
    if (toolkit.isPlaceholder(delta)) {
      findings.push(toolkit.finding('product', 'current_system_fit_delta_missing', `${cap || `row ${rowNumber}`} has no required product delta`, artifact));
    }
    rows.push({ cap, evidence, decision, delta });
  });

  for (const cap of productMap.requiredCaps) {
    if (!seenCaps.has(cap.toLowerCase())) {
      findings.push(toolkit.finding('product', 'current_system_fit_coverage_missing', `${cap} has no current-system fit decision`, artifact));
    }
  }
  if (table.rows.length === 0) {
    findings.push(toolkit.finding('product', 'current_system_fit_empty', 'Current System Fit has no rows', artifact));
  }

  return { findings, rows };
}

async function validateImplementationDelta({
  targetDir,
  content,
  artifact,
  productMap,
  delivery,
  required,
  preImplementation,
  toolkit
}) {
  const findings = [];
  const section = toolkit.extractSection(content, [
    'Implementation Delta',
    'Delta de Implementacao',
    'Delta de Implementação'
  ]);
  if (!section) {
    if (required) {
      findings.push(toolkit.finding(
        'plan',
        'implementation_delta_missing',
        'feature completeness requires ## Implementation Delta in the implementation plan',
        artifact
      ));
    }
    return { findings, rows: [] };
  }

  const table = toolkit.parseFirstMarkdownTable(section);
  if (!table) {
    findings.push(toolkit.finding('plan', 'implementation_delta_invalid', 'Implementation Delta must contain a Markdown table', artifact));
    return { findings, rows: [] };
  }

  for (const bad of table.malformed) {
    findings.push(toolkit.finding(
      'plan',
      'implementation_delta_row_malformed',
      `Implementation Delta row ${bad.row} has ${bad.cells} cell(s), expected ${table.headers.length}; escape literal pipes as \\|`,
      artifact
    ));
  }

  const columns = toolkit.mapColumns(table, {
    cap: ['CAP', 'Capability', 'Capacidade'],
    action: ['Action', 'Path action', 'Acao', 'Ação'],
    evidence: ['Existing evidence', 'Repository evidence', 'Evidencia existente', 'Evidencia do repositorio'],
    paths: ['Exact paths', 'Paths', 'Caminhos exatos', 'Caminhos'],
    change: ['Required change', 'Change', 'Mudanca requerida', 'Alteracao requerida']
  });
  if (columns.missing.length > 0) {
    findings.push(toolkit.finding('plan', 'implementation_delta_columns', `Implementation Delta missing column(s): ${columns.missing.join(', ')}`, artifact));
    return { findings, rows: [] };
  }

  const knownCaps = new Set(productMap.allCaps.map((cap) => cap.toLowerCase()));
  const coveredCaps = new Set();
  const seenCapPaths = new Set();
  const pathActions = new Map();
  const rows = [];

  for (let index = 0; index < table.rows.length; index += 1) {
    const row = table.rows[index];
    const cap = toolkit.cleanCell(row[columns.indexes.cap]);
    const action = normalizeMappedDecision(row[columns.indexes.action], ACTION_ALIASES, toolkit);
    const evidence = toolkit.cleanCell(row[columns.indexes.evidence]);
    const paths = toolkit.extractPlannedPaths(row[columns.indexes.paths]);
    const change = toolkit.cleanCell(row[columns.indexes.change]);
    const rowNumber = index + 1;
    const capKey = cap.toLowerCase();

    if (!toolkit.CAP_ID_EXACT_RE.test(cap)) {
      findings.push(toolkit.finding('plan', 'implementation_delta_cap_invalid', `Implementation Delta row ${rowNumber} must cite one CAP-*`, artifact));
    } else if (!knownCaps.has(capKey)) {
      findings.push(toolkit.finding('plan', 'implementation_delta_cap_unknown', `Implementation Delta references undeclared capability: ${cap}`, artifact));
    } else {
      coveredCaps.add(capKey);
    }
    if (!DELTA_ACTIONS.has(action)) {
      findings.push(toolkit.finding('plan', 'implementation_delta_action_invalid', `${cap || `row ${rowNumber}`} action must be reuse, modify, create, or retire`, artifact));
    }
    if (toolkit.isPlaceholder(evidence)) {
      findings.push(toolkit.finding('plan', 'implementation_delta_evidence_missing', `${cap || `row ${rowNumber}`} has no inspected repository evidence`, artifact));
    }
    if (paths.length === 0) {
      findings.push(toolkit.finding('plan', 'implementation_delta_paths_missing', `${cap || `row ${rowNumber}`} has no concrete repository-relative path`, artifact));
    }
    if (toolkit.isPlaceholder(change)) {
      findings.push(toolkit.finding('plan', 'implementation_delta_change_missing', `${cap || `row ${rowNumber}`} has no required change`, artifact));
    }

    for (const relPath of paths) {
      const pathKey = normalizePathKey(relPath);
      const capPathKey = `${capKey}:${pathKey}`;
      if (!isSafeRepositoryPath(targetDir, relPath)) {
        findings.push(toolkit.finding('plan', 'implementation_delta_path_outside_repository', `${cap || `row ${rowNumber}`} uses an unsafe or absolute path: ${relPath}`, artifact));
        continue;
      }
      if (seenCapPaths.has(capPathKey)) {
        findings.push(toolkit.finding('plan', 'implementation_delta_path_duplicate', `${cap} classifies ${relPath} more than once`, artifact));
      }
      seenCapPaths.add(capPathKey);
      if (pathActions.has(pathKey) && pathActions.get(pathKey) !== action) {
        findings.push(toolkit.finding('plan', 'implementation_delta_path_conflict', `${relPath} has conflicting actions: ${pathActions.get(pathKey)} and ${action}`, artifact));
      } else if (DELTA_ACTIONS.has(action)) {
        pathActions.set(pathKey, action);
      }

      if (!DELTA_ACTIONS.has(action)) continue;
      const exists = await toolkit.pathExistsInsideRoot(targetDir, relPath);
      if (['reuse', 'modify'].includes(action) && !exists) {
        findings.push(toolkit.finding('plan', 'implementation_delta_existing_path_missing', `${cap} marks ${relPath} as ${action}, but the file does not exist`, artifact));
      }
      if (preImplementation && action === 'retire' && !exists) {
        findings.push(toolkit.finding('plan', 'implementation_delta_existing_path_missing', `${cap} marks ${relPath} as retire, but the file does not exist`, artifact));
      }
      if (preImplementation && action === 'create' && exists) {
        findings.push(toolkit.finding('plan', 'implementation_delta_create_path_exists', `${cap} marks ${relPath} as create, but the file already exists`, artifact));
      }
    }

    rows.push({ cap, action, evidence, paths, change });
  }

  for (const cap of productMap.requiredCaps) {
    if (!coveredCaps.has(cap.toLowerCase())) {
      findings.push(toolkit.finding('plan', 'implementation_delta_coverage_missing', `${cap} has no implementation-delta decision`, artifact));
    }
  }
  if (table.rows.length === 0) {
    findings.push(toolkit.finding('plan', 'implementation_delta_empty', 'Implementation Delta has no rows', artifact));
  }

  const deltaPathsByCap = new Map();
  for (const row of rows) {
    const capKey = row.cap.toLowerCase();
    if (!deltaPathsByCap.has(capKey)) deltaPathsByCap.set(capKey, new Set());
    row.paths.forEach((relPath) => deltaPathsByCap.get(capKey).add(normalizePathKey(relPath)));
  }
  for (const row of delivery.rows || []) {
    const capKey = row.cap.toLowerCase();
    const deliveryPaths = new Set(toolkit.extractPlannedPaths(row.files).map(normalizePathKey));
    const deltaPaths = deltaPathsByCap.get(capKey) || new Set();
    for (const relPath of deliveryPaths) {
      if (!deltaPaths.has(relPath)) {
        findings.push(toolkit.finding('plan', 'capability_delivery_path_unclassified', `${row.cap} delivery path ${relPath} is absent from Implementation Delta`, artifact));
      }
    }
    for (const relPath of deltaPaths) {
      if (!deliveryPaths.has(relPath)) {
        findings.push(toolkit.finding('plan', 'implementation_delta_path_undelivered', `${row.cap} delta path ${relPath} is absent from Capability Delivery Plan`, artifact));
      }
    }
  }

  return { findings, rows };
}

function validateEngineeringControls({
  content,
  artifact,
  required,
  toolkit
}) {
  const findings = [];
  const section = toolkit.extractSection(content, [
    'Engineering Controls',
    'Controles de Engenharia'
  ]);
  if (!section) {
    if (required) {
      findings.push(toolkit.finding(
        'plan',
        'engineering_controls_missing',
        'feature completeness requires ## Engineering Controls in the implementation plan',
        artifact
      ));
    }
    return { findings, rows: [], explicitNone: false };
  }

  const table = toolkit.parseFirstMarkdownTable(section);
  if (!table) {
    const explicitNone = /(?:no|none|nenhum|nenhuma)\b[\s\S]{0,100}\b(?:material|cross-cutting|transversal|engineering|engenharia)/i.test(section);
    const inspectedEvidence = /`[^`]+`|(?:src|app|lib|tests?|packages?|services?|package\.json|manifest)[/\\.:]/i.test(section);
    if (!explicitNone || !inspectedEvidence) {
      findings.push(toolkit.finding(
        'plan',
        'engineering_controls_invalid',
        'Engineering Controls must contain its evidence table or explicitly state that no material cross-cutting concern was found and name the inspected boundary',
        artifact
      ));
    }
    return { findings, rows: [], explicitNone: explicitNone && inspectedEvidence };
  }

  for (const bad of table.malformed) {
    findings.push(toolkit.finding(
      'plan',
      'engineering_controls_row_malformed',
      `Engineering Controls row ${bad.row} has ${bad.cells} cell(s), expected ${table.headers.length}; escape literal pipes as \\|`,
      artifact
    ));
  }

  const columns = toolkit.mapColumns(table, {
    concern: ['Concern', 'Engineering concern', 'Risco / restricao', 'Risco / restrição', 'Preocupacao', 'Preocupação'],
    evidence: ['Evidence / trigger', 'Evidence', 'Trigger', 'Evidencia / gatilho', 'Evidência / gatilho'],
    control: ['Planned control', 'Control', 'Controle planejado', 'Controle'],
    verification: ['Verification', 'Check', 'Verificacao', 'Verificação'],
    recovery: ['Recovery', 'Rollback / recovery', 'Rollback', 'Recuperacao', 'Recuperação']
  });
  if (columns.missing.length > 0) {
    findings.push(toolkit.finding(
      'plan',
      'engineering_controls_columns',
      `Engineering Controls missing column(s): ${columns.missing.join(', ')}`,
      artifact
    ));
    return { findings, rows: [], explicitNone: false };
  }

  const rows = [];
  table.rows.forEach((row, index) => {
    const concern = toolkit.cleanCell(row[columns.indexes.concern]);
    const evidence = toolkit.cleanCell(row[columns.indexes.evidence]);
    const control = toolkit.cleanCell(row[columns.indexes.control]);
    const verification = toolkit.cleanCell(row[columns.indexes.verification]);
    const recovery = toolkit.cleanCell(row[columns.indexes.recovery]);
    const rowNumber = index + 1;

    if (toolkit.isPlaceholder(concern)) {
      findings.push(toolkit.finding('plan', 'engineering_controls_concern_missing', `Engineering Controls row ${rowNumber} has no material concern`, artifact));
    }
    if (toolkit.isPlaceholder(evidence)) {
      findings.push(toolkit.finding('plan', 'engineering_controls_evidence_missing', `${concern || `row ${rowNumber}`} has no repository/PRD/runtime trigger`, artifact));
    }
    if (toolkit.isPlaceholder(control)) {
      findings.push(toolkit.finding('plan', 'engineering_controls_control_missing', `${concern || `row ${rowNumber}`} has no planned control`, artifact));
    }
    if (toolkit.isPlaceholder(verification)) {
      findings.push(toolkit.finding('plan', 'engineering_controls_verification_missing', `${concern || `row ${rowNumber}`} has no executable verification`, artifact));
    }
    if (toolkit.isPlaceholder(recovery)) {
      findings.push(toolkit.finding('plan', 'engineering_controls_recovery_missing', `${concern || `row ${rowNumber}`} must name recovery or explain why it is not applicable`, artifact));
    }
    rows.push({ concern, evidence, control, verification, recovery });
  });

  if (table.rows.length === 0) {
    findings.push(toolkit.finding('plan', 'engineering_controls_empty', 'Engineering Controls has no rows', artifact));
  }

  return { findings, rows, explicitNone: false };
}

module.exports = {
  validateCurrentSystemFit,
  validateImplementationDelta,
  validateEngineeringControls,
  FIT_DECISIONS,
  DELTA_ACTIONS
};
