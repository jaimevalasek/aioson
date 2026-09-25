---
slug: squad-clean-install
status: done
owner: dev
created_at: 2026-09-25
---

# Instalação reproduzível para validar Squad

## Scope
Sincronizar package-lock com dependência opcional e binário Cursor já declarados no package.json.

## Context selected
Instalação limpa na cópia Linux falhou EUSAGE com @cursor/sdk@1.0.31 e dependências ausentes no lockfile. package.json não mudou neste incremento.

## Implementation intelligence
Regenerar somente lock com npm install --package-lock-only --ignore-scripts; preservar versões já travadas. Nenhuma instalação global.

## Expected paths
- behavior: package-lock.json
- support: este plano e bootstrap/current-state.md

## Useful options considered
- Include now: metadados faltantes do SDK opcional e binário já declarado.
- Defer: upgrades de dependências, fora do defeito reproduzido.
- Escalate: nenhum.

## Verification
npm ci --omit=optional --no-audit --no-fund passou na cópia Linux após correção; testes Squad foram iniciados sobre essa instalação limpa. Omitir o SDK opcional não é teste funcional do SDK.
