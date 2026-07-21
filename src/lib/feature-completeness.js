'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const {
  scanArtifacts,
  readFileSafe,
  detectClassification,
  parseFrontmatter
} = require('../preflight-engine');
const { checkLedger } = require('../verification/ledger-store');

const REQ_ID_RE = /\bREQ(?:-[A-Za-z0-9]+)+\b/g;
const AC_ID_RE = /\bAC(?:-[A-Za-z0-9]+)+\b/g;
const CAP_ID_RE = /\bCAP(?:-[A-Za-z0-9]+)+\b/g;
const CAP_ID_EXACT_RE = /^CAP(?:-[A-Za-z0-9]+)+$/i;

const CANONICAL_LENSES = Object.freeze([
  'primary-outcome',
  'user-interaction',
  'data-state-lifecycle',
  'validation-business-rules',
  'failure-recovery',
  'permissions-security',
  'integration-dependency',
  'side-effects-async',
  'notification',
  'import-export',
  'observability',
  'performance-scale',
  'compatibility-migration',
  'accessibility-localization',
  'operational-management'
]);

const OPERATIONAL_CONCERNS = Object.freeze([
  'create',
  'list',
  'detail',
  'update',
  'delete-or-archive',
  'restore',
  'management-surface',
  'input-validation',
  'search',
  'filter',
  'sort',
  'pagination',
  'empty-state',
  'loading-state',
  'error-state',
  'permissions'
]);

const SCOPE_DECISIONS = new Set(['required', 'not_applicable', 'deferred']);
const LEVERAGE_DECISIONS = new Set([
  'reuse',
  'framework_native',
  'new_dependency',
  'custom',
  'not_applicable'
]);

const DECISION_ALIASES = Object.freeze({
  required: 'required',
  must: 'required',
  core: 'required',
  obrigatorio: 'required',
  obrigatoria: 'required',
  necessario: 'required',
  necessaria: 'required',
  'not-applicable': 'not_applicable',
  'not_applicable': 'not_applicable',
  'not applicable': 'not_applicable',
  'nao-aplicavel': 'not_applicable',
  na: 'not_applicable',
  'n-a': 'not_applicable',
  deferred: 'deferred',
  defer: 'deferred',
  adiado: 'deferred',
  adiada: 'deferred',
  futuro: 'deferred',
  'out-of-scope': 'deferred',
  'fora-de-escopo': 'deferred'
});

const LEVERAGE_ALIASES = Object.freeze({
  reuse: 'reuse',
  reutilizar: 'reuse',
  reutilizacao: 'reuse',
  'framework-native': 'framework_native',
  framework_native: 'framework_native',
  native: 'framework_native',
  nativo: 'framework_native',
  'new-dependency': 'new_dependency',
  new_dependency: 'new_dependency',
  'nova-dependencia': 'new_dependency',
  custom: 'custom',
  personalizado: 'custom',
  personalizada: 'custom',
  'not-applicable': 'not_applicable',
  not_applicable: 'not_applicable',
  'nao-aplicavel': 'not_applicable',
  na: 'not_applicable',
  'n-a': 'not_applicable'
});

const LENS_ALIASES = Object.freeze({
  'resultado-principal': 'primary-outcome',
  'interacao-do-usuario': 'user-interaction',
  'ciclo-de-vida-de-dados-e-estados': 'data-state-lifecycle',
  'validacao-e-regras-de-negocio': 'validation-business-rules',
  'falha-e-recuperacao': 'failure-recovery',
  'permissoes-e-seguranca': 'permissions-security',
  'integracao-e-dependencia': 'integration-dependency',
  'efeitos-colaterais-e-assincronos': 'side-effects-async',
  notificacao: 'notification',
  'importacao-e-exportacao': 'import-export',
  observabilidade: 'observability',
  'desempenho-e-escala': 'performance-scale',
  'compatibilidade-e-migracao': 'compatibility-migration',
  'acessibilidade-e-localizacao': 'accessibility-localization',
  'gerenciamento-operacional': 'operational-management'
});

const OPERATIONAL_ALIASES = Object.freeze({
  create: 'create', add: 'create', criar: 'create', cadastrar: 'create', cadastro: 'create',
  list: 'list', index: 'list', listar: 'list', listagem: 'list',
  detail: 'detail', view: 'detail', read: 'detail', detalhe: 'detail', visualizar: 'detail',
  update: 'update', edit: 'update', editar: 'update', atualizar: 'update',
  delete: 'delete-or-archive', archive: 'delete-or-archive', excluir: 'delete-or-archive', arquivar: 'delete-or-archive',
  'delete-archive': 'delete-or-archive', 'delete-or-archive': 'delete-or-archive',
  restore: 'restore', restaurar: 'restore',
  management: 'management-surface', 'management-surface': 'management-surface',
  'superficie-de-gerenciamento': 'management-surface',
  validation: 'input-validation', 'input-validation': 'input-validation', validacao: 'input-validation',
  search: 'search', busca: 'search',
  filter: 'filter', filters: 'filter', filtro: 'filter', filtros: 'filter',
  sort: 'sort', sorting: 'sort', ordenacao: 'sort',
  pagination: 'pagination', paging: 'pagination', paginacao: 'pagination',
  'empty-state': 'empty-state', 'estado-vazio': 'empty-state',
  'loading-state': 'loading-state', 'estado-de-carregamento': 'loading-state',
  'error-state': 'error-state', 'estado-de-erro': 'error-state',
  permissions: 'permissions', permission: 'permissions', permissoes: 'permissions'
});

function foldDiacritics(content) {
  return String(content || '').normalize('NFD').replace(/\p{Diacritic}/gu, '');
}

function normalizeLabel(value) {
  return foldDiacritics(value)
    .toLowerCase()
    .replace(/[`*_]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function cleanCell(value) {
  return String(value || '')
    .trim()
    .replace(/^`|`$/g, '')
    .replace(/^\*\*|\*\*$/g, '')
    .trim();
}

function isPlaceholder(value) {
  const normalized = normalizeLabel(cleanCell(value));
  return !normalized
    || ['-', 'tbd', 'todo', 'pending', 'pendente', 'placeholder', 'not-discussed', 'nao-discutido'].includes(normalized)
    || /^x+$/.test(normalized);
}

function extractIds(content, regex) {
  return [...new Set(String(content || '').match(regex) || [])];
}

function normalizeDecision(value) {
  const raw = cleanCell(value).toLowerCase();
  return DECISION_ALIASES[raw] || DECISION_ALIASES[normalizeLabel(raw)] || normalizeLabel(raw);
}

function normalizeLeverageDecision(value) {
  const raw = cleanCell(value).toLowerCase();
  return LEVERAGE_ALIASES[raw] || LEVERAGE_ALIASES[normalizeLabel(raw)] || normalizeLabel(raw);
}

function normalizeLens(value) {
  const token = normalizeLabel(value);
  return LENS_ALIASES[token] || token;
}

function normalizeOperationalConcern(value) {
  const token = normalizeLabel(value);
  return OPERATIONAL_ALIASES[token] || token;
}

function parseSurfacesOverride(content, key = 'operational_surfaces') {
  const fm = String(content || '').match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!fm) return [];
  const items = [];
  const inline = fm[1].match(new RegExp(`^${key}:[ \\t]*(.+)$`, 'm'));
  if (inline) {
    inline[1].trim().replace(/^\[|\]$/g, '').split(',').forEach((part) => {
      const value = part.trim().replace(/^["']|["']$/g, '');
      if (value) items.push(value);
    });
  }
  const block = fm[1].match(new RegExp(`^${key}:[ \\t]*\\r?\\n((?:[ \\t]*-[ \\t]*.+\\r?\\n?)+)`, 'm'));
  if (block) {
    block[1].split(/\r?\n/).forEach((line) => {
      const match = line.match(/^[ \t]*-[ \t]*(.+)$/);
      if (!match) return;
      const value = match[1].trim().replace(/^["']|["']$/g, '');
      if (value) items.push(value);
    });
  }
  return items;
}

// High-confidence advisory detector. Ambiguous "management" + verbs are
// intentionally excluded: words from unrelated paragraphs must not activate a
// CRUD contract. Agents remain responsible for the contextual decision and
// persist it through the explicit `operational_surfaces` declaration.
function detectRichSurfaces(content) {
  const c = foldDiacritics(content);
  const found = [];
  if (/\b(kanban|trello|scrum board|task board|quadro kanban|quadro de tarefas)\b/i.test(c)) found.push('kanban');
  if ((/\bboards?\b/i.test(c) && /\bcards?\b/i.test(c))
    || (/\bquadros?\b/i.test(c) && /\bcart(ao|oes)\b/i.test(c))
    || (/\btableros?\b/i.test(c) && /\btarjetas?\b/i.test(c))
    || (/\btableaux?\b/i.test(c) && /\bcartes?\b/i.test(c))) found.push('board_cards');
  if (/\b(crm|sales pipeline|deals? pipeline|leads? pipeline|funil de vendas|pipeline de (vendas|negocios|leads)|embudo de ventas|pipeline commercial)\b/i.test(c)) found.push('crm_pipeline');
  if (/\bcrud\b/i.test(c)
    || /\badmin (panel|dashboard|area|console)\b/i.test(c)
    || /\bmanagement (screen|page|panel|dashboard|interface|surface)\b/i.test(c)
    || /\barea administrativa\b/i.test(c)
    || /\bpainel (de )?admin(istracao)?\b/i.test(c)
    || /\b(painel|tela|pagina|area|console) de (administracao|gestao|gerenciamento)\b/i.test(c)
    || /\b(panel|pagina|area|consola) de administracion\b/i.test(c)
    || /\b(panneau|page|espace|console) d'administration\b/i.test(c)) {
    found.push('crud_admin');
  }
  return [...new Set(found)];
}

function extractSection(content, headingAliases) {
  const lines = String(content || '').split(/\r?\n/);
  const aliases = headingAliases.map(normalizeLabel);
  let start = -1;
  let level = null;
  for (let i = 0; i < lines.length; i += 1) {
    const match = lines[i].match(/^(#{1,6})\s+(.+?)\s*$/);
    if (!match) continue;
    const heading = normalizeLabel(match[2]);
    if (aliases.some((alias) => heading === alias || heading.startsWith(`${alias}-`))) {
      start = i + 1;
      level = match[1].length;
      break;
    }
  }
  if (start === -1) return null;
  let end = lines.length;
  for (let i = start; i < lines.length; i += 1) {
    const match = lines[i].match(/^(#{1,6})\s+/);
    if (match && match[1].length <= level) {
      end = i;
      break;
    }
  }
  return lines.slice(start, end).join('\n').trim();
}

function splitTableRow(line) {
  let text = String(line || '').trim();
  if (!text.includes('|')) return [];
  if (text.startsWith('|')) text = text.slice(1);
  if (text.endsWith('|')) text = text.slice(0, -1);
  return text.split('|').map(cleanCell);
}

function isDelimiterRow(cells) {
  return cells.length > 0 && cells.every((cell) => /^:?-{3,}:?$/.test(cell.replace(/\s/g, '')));
}

function parseFirstMarkdownTable(section) {
  const lines = String(section || '').split(/\r?\n/);
  for (let i = 0; i < lines.length - 1; i += 1) {
    const headers = splitTableRow(lines[i]);
    const delimiter = splitTableRow(lines[i + 1]);
    if (headers.length < 2 || delimiter.length !== headers.length || !isDelimiterRow(delimiter)) continue;
    const rows = [];
    for (let j = i + 2; j < lines.length; j += 1) {
      const cells = splitTableRow(lines[j]);
      if (cells.length === 0) break;
      if (cells.length === headers.length) rows.push(cells);
    }
    return { headers, normalizedHeaders: headers.map(normalizeLabel), rows };
  }
  return null;
}

function findColumn(table, aliases) {
  const normalized = aliases.map(normalizeLabel);
  return table.normalizedHeaders.findIndex((header) => normalized.includes(header));
}

function mapColumns(table, definitions) {
  const indexes = {};
  const missing = [];
  for (const [name, aliases] of Object.entries(definitions)) {
    indexes[name] = findColumn(table, aliases);
    if (indexes[name] === -1) missing.push(name);
  }
  return { indexes, missing };
}

function finding(stage, check, message, artifact) {
  return {
    severity: 'error',
    stage,
    check,
    message,
    artifacts: artifact ? [artifact] : []
  };
}

function missingSection(stage, check, heading, artifact) {
  return finding(stage, check, `feature completeness requires ## ${heading}`, artifact);
}

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

function claimCapabilities(claim) {
  const declared = Array.isArray(claim && claim.capability_ids) ? claim.capability_ids : [];
  return [...new Set(declared.filter((cap) => CAP_ID_EXACT_RE.test(cap)))];
}

function mentionsStableId(value, id) {
  return new RegExp(`(?<![\\w-])${String(id).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\w-])`, 'i')
    .test(String(value || ''));
}

async function readJsonFile(filePath) {
  try {
    return JSON.parse(await fs.readFile(filePath, 'utf8'));
  } catch {
    return null;
  }
}

async function verifiedHarnessEvidence(targetDir, slug, cap, acs, plannedPaths) {
  const planDir = path.join(targetDir, '.aioson', 'plans', slug);
  const contractPath = path.join(planDir, 'harness-contract.json');
  const reportPath = path.join(planDir, 'last-check-output.json');
  const [contract, report] = await Promise.all([
    readJsonFile(contractPath),
    readJsonFile(reportPath)
  ]);
  if (!contract || !report || report.ok !== true || report.slug !== slug) {
    return { ok: false, reason: 'missing_or_failed_harness_report', criteria: [] };
  }

  const checkedAt = Date.parse(report.checked_at || '');
  if (!Number.isFinite(checkedAt)) {
    return { ok: false, reason: 'invalid_harness_timestamp', criteria: [] };
  }
  let reportMtime;
  try {
    reportMtime = (await fs.stat(reportPath)).mtimeMs;
  } catch {
    return { ok: false, reason: 'missing_or_failed_harness_report', criteria: [] };
  }
  const freshnessPaths = [
    contractPath,
    path.join(targetDir, '.aioson', 'context', `prd-${slug}.md`),
    path.join(targetDir, '.aioson', 'context', `requirements-${slug}.md`),
    path.join(targetDir, '.aioson', 'context', `implementation-plan-${slug}.md`),
    ...plannedPaths.map((relPath) => path.resolve(targetDir, relPath))
  ];
  for (const filePath of freshnessPaths) {
    try {
      const stat = await fs.stat(filePath);
      if (stat.mtimeMs > reportMtime) {
        return { ok: false, reason: 'stale_harness_report', criteria: [] };
      }
    } catch {
      return { ok: false, reason: 'missing_harness_input', criteria: [] };
    }
  }

  const passedChecks = new Map((Array.isArray(report.checks) ? report.checks : [])
    .filter((check) => check && check.ok === true)
    .map((check) => [String(check.id), check]));
  const traceIds = [cap, ...(Array.isArray(acs) ? acs : [])];
  const criteria = (Array.isArray(contract.criteria) ? contract.criteria : []).filter((criterion) => {
    if (!criterion || typeof criterion.verification !== 'string' || !criterion.verification.trim()) return false;
    const check = passedChecks.get(String(criterion.id));
    if (!check || check.command !== criterion.verification) return false;
    const serialized = JSON.stringify(criterion);
    return traceIds.some((id) => mentionsStableId(serialized, id));
  });
  return {
    ok: criteria.length > 0,
    reason: criteria.length > 0 ? null : 'no_passed_criterion_for_capability',
    criteria: criteria.map((criterion) => criterion.id)
  };
}

async function validateDeliveryPaths(targetDir, productMap, delivery, artifact) {
  const findings = [];
  const plannedPathsByCap = new Map();

  for (const row of delivery.rows) {
    if (!productMap.requiredCaps.some((cap) => cap.toLowerCase() === row.cap.toLowerCase())) continue;
    const plannedPaths = extractPlannedPaths(row.files);
    plannedPathsByCap.set(row.cap.toLowerCase(), plannedPaths);
    if (plannedPaths.length === 0) {
      findings.push(finding('execution', 'capability_delivery_paths_not_concrete', `${row.cap} has no deterministically checkable file path`, artifact));
      continue;
    }
    const missingPaths = [];
    for (const plannedPath of plannedPaths) {
      if (!await pathExistsInsideRoot(targetDir, plannedPath)) missingPaths.push(plannedPath);
    }
    if (missingPaths.length > 0) {
      findings.push(finding('execution', 'capability_delivery_files_missing', `${row.cap} planned file(s) do not exist: ${missingPaths.join(', ')}`, artifact));
    }
  }

  return { findings, plannedPathsByCap };
}

async function validateExecutionEvidence(targetDir, slug, productMap, requirementsMatrix, delivery) {
  const artifact = `.aioson/context/features/${slug}/implementation-ledger.md`;
  const deliveryPaths = await validateDeliveryPaths(targetDir, productMap, delivery, artifact);
  const findings = [...deliveryPaths.findings];
  const { plannedPathsByCap } = deliveryPaths;

  const ledgerResult = await checkLedger(targetDir, slug);
  if (!ledgerResult.ok) {
    findings.push(finding('execution', 'implementation_ledger_not_ready', `implementation ledger is not ready: ${ledgerResult.reason || 'invalid or incomplete ledger'}`, artifact));
    return { findings, ledger: null, coveredCaps: [] };
  }

  const ledger = ledgerResult.ledger;
  const claims = Array.isArray(ledger.claims) ? ledger.claims : [];
  const blockingGaps = (Array.isArray(ledger.known_gaps) ? ledger.known_gaps : [])
    .filter((gap) => gap && gap.blocks === true);
  if (blockingGaps.length > 0) {
    findings.push(finding(
      'execution',
      'implementation_ledger_blocking_gaps',
      `implementation ledger has unresolved blocking gap(s): ${blockingGaps.map((gap) => gap.id || gap.gap || '(unnamed)').join(', ')}`,
      artifact
    ));
  }
  const coveredCaps = [];
  for (const cap of productMap.requiredCaps) {
    const capClaims = claims.filter((claim) => claimCapabilities(claim)
      .some((value) => value.toLowerCase() === cap.toLowerCase()));
    const implementedClaims = capClaims.filter((claim) => claim.status === 'implemented');
    if (implementedClaims.length === 0) {
      findings.push(finding('execution', 'capability_implementation_claim_missing', `${cap} has no implemented ledger claim`, artifact));
      continue;
    }
    const hasExistingFileEvidence = (await Promise.all(implementedClaims.flatMap((claim) =>
      (Array.isArray(claim.evidence) ? claim.evidence : [])
        .filter((evidence) => evidence && evidence.path)
        .map((evidence) => pathExistsInsideRoot(targetDir, evidence.path))))).some(Boolean);
    if (!hasExistingFileEvidence) {
      findings.push(finding('execution', 'capability_file_evidence_missing', `${cap} has no existing implementation evidence path`, artifact));
    }
    const harnessEvidence = await verifiedHarnessEvidence(
      targetDir,
      slug,
      cap,
      requirementsMatrix.capToAcs[cap.toLowerCase()] || [],
      plannedPathsByCap.get(cap.toLowerCase()) || []
    );
    if (!harnessEvidence.ok) {
      findings.push(finding('execution', 'capability_verification_evidence_missing', `${cap} has no fresh passed harness criterion (${harnessEvidence.reason})`, artifact));
    }
    if (hasExistingFileEvidence && harnessEvidence.ok) coveredCaps.push(cap);
  }

  return { findings, ledger, coveredCaps };
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
  const briefingRoot = path.join(targetDir, '.aioson', 'briefings', slug);
  return {
    prd: artifacts.prd.content || '',
    requirements: artifacts.requirements.content || '',
    architecture: artifacts.architecture.content || '',
    designDoc: artifacts.design_doc.content || '',
    readiness: artifacts.readiness?.content || '',
    plan: artifacts.implementation_plan.content || '',
    scopeExpansion: await readFileSafe(path.join(targetDir, '.aioson', 'context', 'features', slug, 'scope-expansion.md')),
    expansionAudit: await readFileSafe(path.join(targetDir, '.aioson', 'context', 'features', slug, 'expansion-audit.md')),
    expansionScout: await readFileSafe(path.join(briefingRoot, 'expansion-scout.md')),
    solutionOptions: await readFileSafe(path.join(briefingRoot, 'solution-options.md'))
  };
}

async function analyzeFeatureCompleteness(targetDir, slug, options = {}) {
  const artifacts = options.artifacts || await scanArtifacts(targetDir, slug);
  const classification = String(options.classification || await detectClassification(targetDir, slug) || '').toUpperCase();
  const inputs = await readFeatureInputs(targetDir, slug, artifacts);
  const discoverySources = [
    inputs.prd,
    inputs.requirements,
    inputs.scopeExpansion,
    inputs.expansionAudit,
    inputs.expansionScout,
    inputs.solutionOptions
  ].filter(Boolean);
  const detectedSurfaces = discoverySources.flatMap(detectRichSurfaces);
  const declaredSurfaces = discoverySources.flatMap((content) => parseSurfacesOverride(content));
  const operationalSurfaces = [...new Set([...detectedSurfaces, ...declaredSurfaces])];
  const prdFrontmatter = parseFrontmatter(inputs.prd || '');
  const requirementsFrontmatter = parseFrontmatter(inputs.requirements || '');
  const explicitlyRequired = [prdFrontmatter, requirementsFrontmatter]
    .some((fm) => String(fm.feature_completeness || '').toLowerCase() === 'required');
  const contractPresent = hasCompletenessSection(inputs);
  const formal = ['SMALL', 'MEDIUM'].includes(classification);
  const meaningfulPromise = hasMeaningfulFeaturePromise(inputs);
  const applicable = Boolean(options.force
    || explicitlyRequired
    || contractPresent
    || operationalSurfaces.length > 0
    || (formal && meaningfulPromise));

  const stageFindings = { product: [], requirements: [], design: [], plan: [], execution: [] };
  let productMap = { findings: [], rows: [], requiredCaps: [], allCaps: [] };
  let requirementsMatrix = { findings: [], rows: [], requiredLenses: [], capToAcs: {} };
  let productSurface = { findings: [], objects: [] };
  let operationalMatrix = { findings: [], rows: [] };
  let leverage = { findings: [], rows: [] };
  let delivery = { findings: [], rows: [] };
  let execution = { findings: [], ledger: null, coveredCaps: [] };
  let baseline = { findings: [], reqs: [], acs: [] };

  if (applicable) {
    productMap = validateProductCapabilityMap(inputs.prd, artifacts.prd.path || `prd-${slug}.md`);
    baseline = validateRequirementsBaseline(inputs.requirements, artifacts.requirements.path || `requirements-${slug}.md`, true);
    requirementsMatrix = validateFeatureCapabilityMatrix(inputs.requirements, artifacts.requirements.path || `requirements-${slug}.md`, productMap);

    const operationalRequired = operationalSurfaces.length > 0
      || requirementsMatrix.rows.some((row) => row.lens === 'operational-management' && row.decision === 'required');
    if (operationalRequired) {
      productSurface = validateOperationalSurfaceMap(inputs.prd, artifacts.prd.path || `prd-${slug}.md`);
      operationalMatrix = validateOperationalDecisionMatrix(
        inputs.requirements,
        artifacts.requirements.path || `requirements-${slug}.md`,
        productSurface,
        productMap
      );
    }

    const designCandidates = [
      { content: inputs.readiness, artifact: artifacts.readiness?.path || `readiness-${slug}.md` },
      { content: inputs.designDoc, artifact: artifacts.design_doc.path || `design-doc-${slug}.md` },
      { content: inputs.architecture, artifact: artifacts.architecture.path || 'architecture.md' }
    ];
    const selectedDesign = designCandidates.find((item) => extractSection(item.content, ['Implementation Leverage Matrix', 'Matriz de Aproveitamento de Implementacao', 'Matriz de Reuso e Implementacao']))
      || designCandidates.find((item) => item.content)
      || designCandidates[0];
    leverage = validateLeverageMatrix(selectedDesign.content, selectedDesign.artifact, productMap);
    delivery = validateDeliveryPlan(inputs.plan, artifacts.implementation_plan.path || `implementation-plan-${slug}.md`, productMap);

    stageFindings.product.push(...productMap.findings, ...productSurface.findings);
    stageFindings.requirements.push(...baseline.findings, ...requirementsMatrix.findings, ...operationalMatrix.findings);
    stageFindings.design.push(...leverage.findings);
    stageFindings.plan.push(...delivery.findings);
    if (options.includeExecution && delivery.findings.length === 0) {
      execution = await validateExecutionEvidence(targetDir, slug, productMap, requirementsMatrix, delivery);
      stageFindings.execution.push(...execution.findings);
    } else if (options.includeExecutionStructure && delivery.findings.length === 0) {
      const structural = await validateDeliveryPaths(
        targetDir,
        productMap,
        delivery,
        `.aioson/context/features/${slug}/implementation-ledger.md`
      );
      execution = { findings: structural.findings, ledger: null, coveredCaps: [] };
      stageFindings.execution.push(...structural.findings);
    }
  }

  const findings = Object.values(stageFindings).flat();
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
    product_map: productMap,
    requirements_matrix: requirementsMatrix,
    operational_matrix: operationalMatrix,
    leverage_matrix: leverage,
    delivery_plan: delivery,
    execution_evidence: execution,
    baseline: { reqs: baseline.reqs, acs: baseline.acs },
    summary: {
      promised_capabilities: productMap.rows.length,
      required_capabilities: productMap.requiredCaps.length,
      lens_decisions: requirementsMatrix.rows.length,
      leverage_rows: leverage.rows.length,
      delivery_rows: delivery.rows.length,
      executed_capabilities: execution.coveredCaps.length,
      errors: findings.length
    }
  };
}

function findingsThroughStage(analysis, stage) {
  const stages = {
    product: ['product'],
    requirements: ['product', 'requirements'],
    design: ['product', 'requirements', 'design'],
    plan: ['product', 'requirements', 'design', 'plan'],
    execution: ['product', 'requirements', 'design', 'plan', 'execution']
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
  analyzeFeatureCompleteness,
  findingsThroughStage
};
