'use strict';

const { launchCLI } = require('./cli-launcher');

const DEFAULT_ATTEMPTS = { haiku: 3, sonnet: 2, opus: 1 };

// Model IDs por alias. Injetados via ANTHROPIC_MODEL env var para Claude Code.
const MODEL_MAP = {
  haiku:  'claude-haiku-4-5',
  sonnet: 'claude-sonnet-5',
  opus:   'claude-opus-5'
};

/**
 * Executa uma task com cascade de modelos.
 *
 * Para cada modelo na cadeia:
 *   1. Tenta até N vezes (DEFAULT_ATTEMPTS ou customizado)
 *   2. Se result.ok: verifica via gateConfig (opcional)
 *   3. Se aprovado: retorna resultado imediatamente
 *   4. Se reprovado ou falha: tenta próximo modelo
 *
 * @param {string} projectDir
 * @param {string} prompt
 * @param {string[]} modelChain  ex: ['haiku', 'sonnet', 'opus']
 * @param {object} options
 * @param {string} [options.tool]         CLI a usar (padrão: auto-detectado)
 * @param {Function} [options.gateCheck]  fn(output: string) → {passed: boolean, reason?: string}
 * @param {Function} [options.onProgress] fn({model, attempt, maxAttempts, status, reason?})
 * @param {number} [options.timeout]      Timeout em ms por tentativa
 * @returns {Promise<{ok: boolean, result?, modelUsed?: string, attempts?: number, error?: string}>}
 */
async function runWithCascade(projectDir, prompt, modelChain, options = {}) {
  const { tool, gateCheck, onProgress, timeout } = options;

  for (const modelAlias of modelChain) {
    const maxAttempts = DEFAULT_ATTEMPTS[modelAlias] ?? 1;
    const modelId = MODEL_MAP[modelAlias];

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      if (onProgress) {
        onProgress({ model: modelAlias, attempt, maxAttempts, status: 'running' });
      }

      // Injeta o modelo via ANTHROPIC_MODEL (compatível com Claude Code)
      const extraEnv = modelId ? { ANTHROPIC_MODEL: modelId } : {};

      const result = await launchCLI(projectDir, prompt, {
        tool,
        timeout,
        env: extraEnv
      });

      if (!result.ok) {
        if (onProgress) {
          onProgress({ model: modelAlias, attempt, maxAttempts, status: 'cli_failed' });
        }
        continue;
      }

      // Verifica qualidade se gate configurado
      if (gateCheck) {
        const gateResult = gateCheck(result.output);
        if (gateResult.passed) {
          return { ok: true, result, modelUsed: modelAlias, attempts: attempt };
        }
        if (onProgress) {
          onProgress({
            model: modelAlias,
            attempt,
            maxAttempts,
            status: 'gate_failed',
            reason: gateResult.reason || 'quality gate failed'
          });
        }
        // Não retorna — tenta próxima tentativa ou próximo modelo
      } else {
        // Sem gate: aceita o resultado
        return { ok: true, result, modelUsed: modelAlias, attempts: attempt };
      }
    }
  }

  return { ok: false, error: 'All cascade models exhausted without passing quality gate' };
}

/**
 * Parseia uma string de cascade como "haiku,sonnet,opus" para um array.
 * @param {string} cascadeStr
 * @returns {string[]}
 */
function parseCascadeChain(cascadeStr) {
  if (!cascadeStr) return [];
  return cascadeStr.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
}

module.exports = { runWithCascade, parseCascadeChain, MODEL_MAP, DEFAULT_ATTEMPTS };
