'use strict';

/**
 * Validação de schema do harness-contract.json (loop-guardrails REQ-1).
 *
 * Responsabilidade distinta de `harness:validate` (que valida a IMPLEMENTAÇÃO
 * contra criteria via @validator). Aqui valida-se o CONTRATO em si, no
 * preflight do `self:loop` — um typo em `allowed_files` não pode desligar o
 * scope guard silenciosamente. Mensagens usam "contract schema invalid",
 * nunca "validation verdict".
 *
 * Retrocompat (REQ-11 / EC-12): contratos antigos (feature/contract_mode/
 * governor/criteria) passam; campos novos são todos opcionais.
 */

const { validateGlobPattern } = require('./glob-match');

/** REQ-4 — defaults proibidos, sempre aplicados e não-removíveis (SEC-SBD-05). */
const DEFAULT_FORBIDDEN_GLOBS = Object.freeze([
  '.env*',
  '*.pem',
  '*.key',
  'secrets/**',
  '.git/**',
  'node_modules/**',
  'package-lock.json',
  'yarn.lock',
  'pnpm-lock.yaml',
  'npm-shrinkwrap.json',
  'bun.lockb'
]);

const HUMAN_GATE_THEMES = Object.freeze([
  'payment_logic_change',
  'auth_permission_change',
  'database_destructive_change',
  'publish'
]);

/** Mapa default tema→globs (requirements §2.1); override via human_gate.themes[].paths. */
const DEFAULT_THEME_PATHS = Object.freeze({
  payment_logic_change: Object.freeze(['**/billing/**', '**/payment/**']),
  auth_permission_change: Object.freeze(['**/auth/**']),
  database_destructive_change: Object.freeze(['**/migrations/**']),
  publish: Object.freeze([]) // gate de comando (REQ-13), nunca diff
});

/**
 * Presets do contract_mode (REQ-19). Preenchem apenas valores do governor
 * NÃO definidos explicitamente no contrato; valor explícito sempre vence.
 * `BALANCED` mantém o comportamento atual (nenhum preenchimento).
 */
const CONTRACT_PRESETS = Object.freeze({
  safe: Object.freeze({
    max_steps: 10,
    error_streak_limit: 3,
    cost_ceiling_tokens: 200000,
    max_runtime_minutes: 30,
    max_changed_files: 20,
    max_diff_lines: 1500
  }),
  builder: Object.freeze({
    max_steps: 30,
    error_streak_limit: 5,
    cost_ceiling_tokens: 1000000,
    max_runtime_minutes: 120,
    max_changed_files: 60,
    max_diff_lines: 6000
  }),
  autopilot: Object.freeze({
    max_steps: 50,
    error_streak_limit: 8,
    cost_ceiling_tokens: 3000000,
    max_runtime_minutes: 360,
    max_changed_files: null,
    max_diff_lines: null
  })
});

const KNOWN_TOP_FIELDS = new Set([
  'feature', 'contract_mode', 'governor', 'criteria',
  'allowed_files', 'forbidden_files', 'human_gate'
]);
const KNOWN_GOVERNOR_FIELDS = new Set([
  'max_steps', 'error_streak_limit', 'cost_ceiling_tokens',
  'max_runtime_minutes', 'max_changed_files', 'max_diff_lines'
]);
const KNOWN_HUMAN_GATE_FIELDS = new Set(['required_for', 'themes']);
const KNOWN_THEME_FIELDS = new Set(['name', 'paths']);
const KNOWN_CRITERIA_FIELDS = new Set([
  'id', 'description', 'assertion', 'binary', 'verification',
  // SG-* static criteria (build-independent): proven by reading files, not running a command.
  'must_match', 'must_not_match', 'files'
]);

const VALID_MODES = new Set(['balanced', 'safe', 'builder', 'autopilot']);

function isPlainObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function isPositiveInt(v) {
  return Number.isInteger(v) && v > 0;
}

function checkOptionalLimit(errors, field, value) {
  if (value === undefined || value === null) return;
  if (!isPositiveInt(value)) {
    errors.push({ field, reason: 'must be a positive integer or null' });
  }
}

function checkGlobArray(errors, field, value) {
  if (!Array.isArray(value)) {
    errors.push({ field, reason: 'must be an array of glob strings' });
    return;
  }
  value.forEach((pattern, i) => {
    const result = validateGlobPattern(pattern);
    if (!result.ok) {
      errors.push({ field: `${field}[${i}]`, reason: result.reason });
    }
  });
}

/**
 * Valida o contrato. Retorna { ok, errors: [{field, reason}], warnings: [{field, reason}] }.
 * `ok === false` quando há ao menos um erro — o preflight deve encerrar antes
 * de qualquer execução (REQ-1).
 */
function validateContract(contract) {
  const errors = [];
  const warnings = [];

  if (!isPlainObject(contract)) {
    return { ok: false, errors: [{ field: '(root)', reason: 'contract must be a JSON object' }], warnings };
  }

  for (const key of Object.keys(contract)) {
    if (!KNOWN_TOP_FIELDS.has(key)) {
      errors.push({ field: key, reason: 'unknown field — check for typos (contract schema invalid)' });
    }
  }

  if (typeof contract.feature !== 'string' || !contract.feature.trim()) {
    errors.push({ field: 'feature', reason: 'must be a non-empty string' });
  }

  if (contract.contract_mode !== undefined) {
    if (typeof contract.contract_mode !== 'string' || !VALID_MODES.has(contract.contract_mode.toLowerCase())) {
      errors.push({ field: 'contract_mode', reason: 'must be one of: balanced, safe, builder, autopilot' });
    }
  }

  if (!isPlainObject(contract.governor)) {
    errors.push({ field: 'governor', reason: 'must be an object' });
  } else {
    for (const key of Object.keys(contract.governor)) {
      if (!KNOWN_GOVERNOR_FIELDS.has(key)) {
        errors.push({ field: `governor.${key}`, reason: 'unknown field — check for typos (contract schema invalid)' });
      }
    }
    const g = contract.governor;
    if (g.max_steps !== undefined && g.max_steps !== null && !(Number.isInteger(g.max_steps) && g.max_steps >= 0)) {
      errors.push({ field: 'governor.max_steps', reason: 'must be a non-negative integer' });
    }
    if (g.error_streak_limit !== undefined && g.error_streak_limit !== null && !(Number.isInteger(g.error_streak_limit) && g.error_streak_limit >= 0)) {
      errors.push({ field: 'governor.error_streak_limit', reason: 'must be a non-negative integer' });
    }
    checkOptionalLimit(errors, 'governor.cost_ceiling_tokens', g.cost_ceiling_tokens);
    checkOptionalLimit(errors, 'governor.max_runtime_minutes', g.max_runtime_minutes);
    checkOptionalLimit(errors, 'governor.max_changed_files', g.max_changed_files);
    checkOptionalLimit(errors, 'governor.max_diff_lines', g.max_diff_lines);
  }

  if (contract.allowed_files !== undefined) {
    checkGlobArray(errors, 'allowed_files', contract.allowed_files);
    // EC-5: allowlist vazia bloquearia tudo — warning + tratada como ausente
    if (Array.isArray(contract.allowed_files) && contract.allowed_files.length === 0) {
      warnings.push({
        field: 'allowed_files',
        reason: 'empty allowlist would block every write — treated as absent'
      });
    }
  }

  if (contract.forbidden_files !== undefined) {
    checkGlobArray(errors, 'forbidden_files', contract.forbidden_files);
  }

  if (contract.human_gate !== undefined) {
    if (!isPlainObject(contract.human_gate)) {
      errors.push({ field: 'human_gate', reason: 'must be an object' });
    } else {
      for (const key of Object.keys(contract.human_gate)) {
        if (!KNOWN_HUMAN_GATE_FIELDS.has(key)) {
          errors.push({ field: `human_gate.${key}`, reason: 'unknown field — check for typos (contract schema invalid)' });
        }
      }
      const hg = contract.human_gate;
      if (!Array.isArray(hg.required_for)) {
        errors.push({ field: 'human_gate.required_for', reason: 'must be an array of themes (required when human_gate is present)' });
      } else {
        hg.required_for.forEach((theme, i) => {
          if (!HUMAN_GATE_THEMES.includes(theme)) {
            errors.push({ field: `human_gate.required_for[${i}]`, reason: `unknown theme "${theme}" — valid: ${HUMAN_GATE_THEMES.join(', ')}` });
          }
        });
      }
      if (hg.themes !== undefined) {
        if (!Array.isArray(hg.themes)) {
          errors.push({ field: 'human_gate.themes', reason: 'must be an array' });
        } else {
          hg.themes.forEach((theme, i) => {
            if (!isPlainObject(theme)) {
              errors.push({ field: `human_gate.themes[${i}]`, reason: 'must be an object { name, paths }' });
              return;
            }
            for (const key of Object.keys(theme)) {
              if (!KNOWN_THEME_FIELDS.has(key)) {
                errors.push({ field: `human_gate.themes[${i}].${key}`, reason: 'unknown field — check for typos (contract schema invalid)' });
              }
            }
            if (!HUMAN_GATE_THEMES.includes(theme.name)) {
              errors.push({ field: `human_gate.themes[${i}].name`, reason: `unknown theme "${theme.name}" — valid: ${HUMAN_GATE_THEMES.join(', ')}` });
            }
            checkGlobArray(errors, `human_gate.themes[${i}].paths`, theme.paths);
          });
        }
      }
    }
  }

  if (contract.criteria !== undefined) {
    if (!Array.isArray(contract.criteria)) {
      errors.push({ field: 'criteria', reason: 'must be an array' });
    } else {
      contract.criteria.forEach((criterion, i) => {
        if (!isPlainObject(criterion)) {
          errors.push({ field: `criteria[${i}]`, reason: 'must be an object' });
          return;
        }
        for (const key of Object.keys(criterion)) {
          if (!KNOWN_CRITERIA_FIELDS.has(key)) {
            errors.push({ field: `criteria[${i}].${key}`, reason: 'unknown field — check for typos (contract schema invalid)' });
          }
        }
        if (typeof criterion.id !== 'string' || !criterion.id.trim()) {
          errors.push({ field: `criteria[${i}].id`, reason: 'must be a non-empty string' });
        }
        if (criterion.verification !== undefined && (typeof criterion.verification !== 'string' || !criterion.verification.trim())) {
          errors.push({ field: `criteria[${i}].verification`, reason: 'must be a non-empty shell command string when present' });
        }
        if (criterion.binary !== undefined && typeof criterion.binary !== 'boolean') {
          errors.push({ field: `criteria[${i}].binary`, reason: 'must be a boolean' });
        }

        // SG-* static criteria — must_match / must_not_match are arrays of
        // non-empty pattern strings; files[] is the (non-empty) set they read.
        for (const patField of ['must_match', 'must_not_match']) {
          if (criterion[patField] === undefined) continue;
          if (!Array.isArray(criterion[patField])) {
            errors.push({ field: `criteria[${i}].${patField}`, reason: 'must be an array of non-empty pattern strings' });
            continue;
          }
          criterion[patField].forEach((pat, j) => {
            if (typeof pat !== 'string' || !pat.trim()) {
              errors.push({ field: `criteria[${i}].${patField}[${j}]`, reason: 'must be a non-empty string' });
            }
          });
        }
        if (criterion.files !== undefined) {
          if (!Array.isArray(criterion.files)) {
            errors.push({ field: `criteria[${i}].files`, reason: 'must be an array of file paths' });
          } else {
            criterion.files.forEach((fp, j) => {
              if (typeof fp !== 'string' || !fp.trim()) {
                errors.push({ field: `criteria[${i}].files[${j}]`, reason: 'must be a non-empty file path' });
              }
            });
          }
        }
        const isStatic =
          (Array.isArray(criterion.must_match) && criterion.must_match.length > 0) ||
          (Array.isArray(criterion.must_not_match) && criterion.must_not_match.length > 0);
        if (isStatic) {
          // A static criterion needs files[] to read.
          if (!Array.isArray(criterion.files) || criterion.files.length === 0) {
            errors.push({ field: `criteria[${i}].files`, reason: 'a static criterion (must_match / must_not_match) requires a non-empty files[] to read' });
          }
          // A criterion is either runtime (verification) or static (patterns), not both.
          if (criterion.verification !== undefined) {
            errors.push({ field: `criteria[${i}].verification`, reason: 'a criterion is either runtime (verification) or static (must_match / must_not_match), not both — split into two criteria' });
          }
        }

        // Cobertura executável: critério binário sem verification continua
        // válido (julgado pelo @validator), mas é dívida de verificação. Um
        // critério SG-* estático já é checável deterministicamente — não é dívida.
        if (criterion.binary === true && criterion.verification === undefined && !isStatic) {
          warnings.push({
            field: `criteria[${i}].verification`,
            reason: `binary criterion "${criterion.id}" has no executable verification command — @validator will LLM-judge it`
          });
        }
      });
    }
  }

  return { ok: errors.length === 0, errors, warnings };
}

/**
 * Resolve o contrato VALIDADO para sua forma efetiva:
 * - preset do contract_mode preenche valores do governor não definidos (REQ-19);
 * - `forbidden_files` mesclado com os defaults não-removíveis (REQ-4);
 * - `allowed_files: []` tratado como ausente (EC-5);
 * - mapa tema→paths resolvido (override substitui, não mescla).
 *
 * Não muta o contrato original; retorna um objeto efetivo para os guards.
 */
function resolveContract(contract) {
  const mode = typeof contract.contract_mode === 'string'
    ? contract.contract_mode.toLowerCase()
    : 'balanced';
  const preset = CONTRACT_PRESETS[mode] || null;

  const governor = { ...(contract.governor || {}) };
  if (preset) {
    for (const [key, value] of Object.entries(preset)) {
      if (governor[key] === undefined) governor[key] = value;
    }
  }

  const forbidden = [
    ...DEFAULT_FORBIDDEN_GLOBS,
    ...(Array.isArray(contract.forbidden_files) ? contract.forbidden_files : [])
  ];

  const allowed = Array.isArray(contract.allowed_files) && contract.allowed_files.length > 0
    ? contract.allowed_files.slice()
    : null;

  const themePaths = { ...DEFAULT_THEME_PATHS };
  const requiredFor = contract.human_gate && Array.isArray(contract.human_gate.required_for)
    ? contract.human_gate.required_for.slice()
    : [];
  if (contract.human_gate && Array.isArray(contract.human_gate.themes)) {
    for (const theme of contract.human_gate.themes) {
      if (theme && HUMAN_GATE_THEMES.includes(theme.name) && Array.isArray(theme.paths)) {
        themePaths[theme.name] = theme.paths.slice();
      }
    }
  }

  return {
    feature: contract.feature,
    contract_mode: mode,
    governor,
    criteria: Array.isArray(contract.criteria) ? contract.criteria : [],
    allowed_files: allowed,
    forbidden_files: forbidden,
    human_gate: {
      required_for: requiredFor,
      theme_paths: themePaths
    }
  };
}

module.exports = {
  DEFAULT_FORBIDDEN_GLOBS,
  HUMAN_GATE_THEMES,
  DEFAULT_THEME_PATHS,
  CONTRACT_PRESETS,
  validateContract,
  resolveContract
};
