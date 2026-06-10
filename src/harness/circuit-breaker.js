const fs = require('fs');

/**
 * Circuit Breaker para o AIOSON — Módulo Puro
 * Estados: CLOSED | OPEN | HALF_OPEN
 * Persistência: progress.json
 */
class CircuitBreaker {
  constructor(contractPath, progressPath) {
    this.contractPath = contractPath;
    this.progressPath = progressPath;
    this.contract = null;
    this.progress = null;
  }

  /**
   * Carrega os arquivos de contrato e progresso do disco.
   * Se o progresso estiver corrompido, tenta recuperar ou cria novo.
   */
  async load() {
    try {
      this.contract = JSON.parse(fs.readFileSync(this.contractPath, 'utf8'));
    } catch (err) {
      throw new Error(`[CircuitBreaker] Falha ao carregar contrato: ${err.message}`);
    }

    try {
      if (fs.existsSync(this.progressPath)) {
        this.progress = JSON.parse(fs.readFileSync(this.progressPath, 'utf8'));
      } else {
        this.progress = this._createInitialProgress();
      }
    } catch (err) {
      // Recuperação em caso de JSON corrompido
      console.warn(`[CircuitBreaker] Progress corrompido, recriando...`);
      this.progress = this._createInitialProgress();
    }
  }

  /**
   * Verifica se uma nova iteração é permitida.
   * Retorna { allowed: boolean, reason: string|null }
   */
  check() {
    if (!this.progress || !this.contract) return { allowed: true, reason: null };

    const { circuit_state, iterations, consecutive_errors } = this.progress;
    const { max_steps, error_streak_limit } = this.contract.governor;

    // HUMAN_GATE (loop-guardrails D4): gate humano pendente nega execução até
    // decisão via harness:approve / harness:reject (REQ-12/15).
    const pendingGates = Array.isArray(this.progress.pending_gates) ? this.progress.pending_gates : [];
    if (this.progress.status === 'human_gate' || pendingGates.length > 0) {
      return { allowed: false, reason: 'human_gate_pending' };
    }

    if (circuit_state === 'OPEN') {
      return { allowed: false, reason: 'circuit_open' };
    }

    if (max_steps > 0 && iterations >= max_steps) {
      return { allowed: false, reason: 'max_steps_reached' };
    }

    if (error_streak_limit > 0 && consecutive_errors >= error_streak_limit) {
      return { allowed: false, reason: 'error_streak_limit_reached' };
    }

    return { allowed: true, reason: null };
  }

  /**
   * Registra um sucesso no loop.
   * Reseta erros consecutivos e pode fechar o circuit se estiver HALF_OPEN.
   */
  async recordSuccess() {
    this.progress.consecutive_errors = 0;
    this.progress.iterations += 1;
    this.progress.last_updated = new Date().toISOString();
    this.progress.ready_for_done_gate = true;

    if (this.progress.circuit_state === 'HALF_OPEN') {
      this.progress.circuit_state = 'CLOSED';
      this.progress.status = 'in_progress';
    }

    await this._save();
  }

  /**
   * Registra um erro no loop.
   * Incrementa erros consecutivos e abre o circuit se atingir limites.
   */
  async recordError(reason) {
    this.progress.consecutive_errors += 1;
    this.progress.last_error = reason;
    this.progress.last_updated = new Date().toISOString();
    this.progress.ready_for_done_gate = false;

    const { error_streak_limit, max_steps } = this.contract.governor;

    if (error_streak_limit > 0 && this.progress.consecutive_errors >= error_streak_limit) {
      this.progress.circuit_state = 'OPEN';
      this.progress.status = 'circuit_open';
      this.progress.last_error = `error_streak_limit_reached: ${reason}`;
    } else if (max_steps > 0 && this.progress.iterations >= max_steps) {
      this.progress.circuit_state = 'OPEN';
      this.progress.status = 'circuit_open';
      this.progress.last_error = `max_steps_reached: ${reason}`;
    }

    await this._save();
  }

  _createInitialProgress() {
    return {
      feature: this.contract ? this.contract.feature : 'unknown',
      phase: 1,
      status: 'in_progress',
      completed_steps: [],
      last_error: null,
      session_count: 1,
      last_updated: new Date().toISOString(),
      circuit_state: 'CLOSED',
      iterations: 0,
      consecutive_errors: 0,
      ready_for_done_gate: false
    };
  }

  async _save() {
    fs.writeFileSync(this.progressPath, JSON.stringify(this.progress, null, 2), 'utf8');
  }

  getState() {
    return this.progress ? this.progress.circuit_state : 'CLOSED';
  }
}

module.exports = {
  createCircuitBreaker: (contractPath, progressPath) => new CircuitBreaker(contractPath, progressPath)
};
