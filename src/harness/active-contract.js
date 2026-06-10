'use strict';

/**
 * Descoberta do contrato de harness ATIVO (loop-guardrails C-01 / REQ-20).
 *
 * Heurística única, compartilhada entre `git:guard` (camada 2 do scope guard)
 * e `self:loop` (auto-descoberta quando nem --contract nem --spec são
 * passados): varre `.aioson/plans/{slug}/progress.json`, considera candidato quem
 * está `in_progress` ou `human_gate` e tem `harness-contract.json` ao lado,
 * e desempata pelo `last_updated` mais recente.
 *
 * Best-effort por contrato (progress ilegível não é candidato), mas a função
 * em si lança apenas em falha de I/O inesperada — chamadores que precisam de
 * "nunca quebrar" devem envolver em try/catch.
 */

const path = require('node:path');
const fs = require('node:fs');

function findActiveContract(targetDir) {
  const plansDir = path.join(targetDir, '.aioson', 'plans');
  if (!fs.existsSync(plansDir)) return null;
  const candidates = [];
  for (const slug of fs.readdirSync(plansDir)) {
    const planDir = path.join(plansDir, slug);
    try {
      const progress = JSON.parse(fs.readFileSync(path.join(planDir, 'progress.json'), 'utf8'));
      if (progress.status === 'in_progress' || progress.status === 'human_gate') {
        const contractPath = path.join(planDir, 'harness-contract.json');
        if (fs.existsSync(contractPath)) {
          candidates.push({ slug, contractPath, lastUpdated: progress.last_updated || '' });
        }
      }
    } catch { /* sem progress legível — não é candidato */ }
  }
  if (!candidates.length) return null;
  candidates.sort((a, b) => String(b.lastUpdated).localeCompare(String(a.lastUpdated)));
  return candidates[0];
}

module.exports = { findActiveContract };
