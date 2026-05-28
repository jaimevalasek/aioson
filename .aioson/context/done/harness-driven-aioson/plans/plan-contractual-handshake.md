---
phase: 2
slug: contractual-handshake
title: Contractual Handshake
depends_on: gateway-ativo
status: pending
---

# Fase 2 — Contractual Handshake

## Escopo desta fase
Implementar o ciclo completo de criação e assinatura do contrato antes da implementação começar. Entrega:
1. Comando `aioson harness:init` — scaffolding do contrato e progress file
2. `@sheldon` como Harness Engineer — gera `harness-contract.json` como parte do enrichment
3. Skill `harness-validate` — validação rápida (schema + lint) sem LLM ao final de cada fase de dev
4. `progress.json` como memória de sessão — @dev retoma sem re-analisar o codebase

Ao final desta fase: toda feature MEDIUM tem um contrato assinado antes de codar e memória persistente entre sessões.

## Entidades novas ou modificadas
- **`src/commands/harness.js`** — novo comando CLI: `harness:init`, futuramente `harness:validate`
- **`src/i18n/messages/en.js` e `pt-BR.js`** — adicionar strings do comando harness
- **`template/.aioson/agents/sheldon.md`** — adicionar seção de geração de `harness-contract.json` para features MEDIUM
- **`.aioson/agents/sheldon.md`** — sincronizar com template após update
- **`template/.aioson/skills/static/harness-validate/SKILL.md`** — nova skill; @dev carrega ao finalizar cada fase em projeto MEDIUM
- **`harness-contract.json`** (por feature) — gerado pelo @sheldon ou pelo `harness:init`; fica em `.aioson/plans/{slug}/`
- **`progress.json`** (por feature) — criado pelo `harness:init`; atualizado pelo gateway (Fase 1) e pelo @dev

## Fluxos cobertos nesta fase
- **Fluxo harness:init:** `aioson harness:init . --slug=feature-name` → cria template de `harness-contract.json` + `progress.json` em `.aioson/plans/{slug}/`
- **Fluxo @sheldon MEDIUM:** ao gerar enrichment, preenche `harness-contract.json` com critérios derivados dos ACs do PRD
- **Fluxo de retomada:** @dev inicia sessão → lê `progress.json` → carrega apenas `completed_steps` já feitos → retoma do próximo passo
- **Fluxo harness-validate:** @dev finaliza fase → invoca skill → skill roda ESLint/tsc → retorna pass/fail por critério → @dev corrige antes de marcar done

## Acceptance criteria desta fase
| AC | Descrição |
|---|---|
| AC-HD-05 | Dado `aioson harness:init . --slug=feature-name`, quando executado em projeto MEDIUM, cria `.aioson/plans/{slug}/harness-contract.json` e `progress.json` com template válido e preenchível |
| AC-HD-06 | Dado @sheldon ativado para feature MEDIUM, quando gera enrichment, produz `harness-contract.json` com critérios do PRD no formato `{id, description, assertion, binary}` |
| AC-HD-07 | Dado `progress.json` com `session_count > 1`, quando @dev inicia nova sessão, lê estado anterior e retoma de onde parou sem re-analisar o codebase inteiro |
| AC-HD-08 | Dado `harness-validate` skill ativa ao final de fase, quando @dev finaliza fase, skill valida schema e lint do output e retorna resultado binário antes de marcar como done |

## Sequência de implementação sugerida
1. Implementar `src/commands/harness.js` com subcomando `harness:init`:
   - Recebe `--slug` (obrigatório) e `--mode` (opcional: ECONOMICAL/BALANCED/URGENT, default BALANCED)
   - Cria `.aioson/plans/{slug}/harness-contract.json` com template + `.aioson/plans/{slug}/progress.json` com estado inicial
   - Verificar se arquivos já existem antes de criar (não sobrescrever)
2. Registrar `harness` em `src/cli.js` (ou onde comandos são registrados)
3. Adicionar strings i18n para `harness:init` em `en.js` e `pt-BR.js`
4. Criar `template/.aioson/skills/static/harness-validate/SKILL.md`:
   - Instruções para @dev invocar ESLint e tsc como verificadores
   - Mapear resultado de cada ferramenta para critérios do `harness-contract.json`
   - Retornar lista de critérios: pass ✓ / fail ✗ com mensagem de erro específica
5. Atualizar `template/.aioson/agents/sheldon.md`:
   - Adicionar seção "Geração de harness-contract.json (MEDIUM)" após RF-08
   - @sheldon deriva critérios dos ACs do PRD enriquecido; um critério por AC verificável
6. Sincronizar agentes: `npm run sync:agents`
7. Testar fluxo completo: harness:init → abrir contrato gerado → verificar template → simular sessão de retomada com progress.json

## Dependências externas
- Fase 1 concluída (gateway lê `harness-contract.json` que esta fase cria)
- Node.js readline nativo disponível (já usado em `src/commands/briefing.js` — seguir mesmo padrão)
- `npm run sync:agents` para sincronizar template → workspace

## Notas para @dev
- Seguir o padrão de implementação de `src/commands/briefing.js` para o novo `harness.js` — mesmo estilo de readline, mesmo padrão de flags
- O template de `harness-contract.json` gerado pelo `harness:init` deve ter `criteria: []` vazio — preenchimento é responsabilidade do @sheldon no enrichment
- `progress.json` deve ser criado com `circuit_state: "CLOSED"`, `session_count: 1`, `completed_steps: []` e `status: "in_progress"`
- A skill `harness-validate` é uma skill **static** (carregada automaticamente para MEDIUM) — não requer instalação manual

## Notas para @qa
- Testar `harness:init` com `--slug` existente: deve avisar e não sobrescrever
- Testar `harness:init` em projeto MICRO: deve avisar que harness é opcional para essa classificação
- Verificar que `harness-validate` skill retorna erros específicos por critério — não apenas "falhou"
- Testar retomada de sessão: criar `progress.json` com `session_count: 2` e `completed_steps: ["step-1"]`, verificar que @dev pula step-1

## Fontes de referência desta fase
> Consulte se precisar de mais detalhes durante a implementação.

- [pesquisa] Harness contract schema COINE 2026 — `researchs/harness-contract-schema-2026/summary.md`
- [pesquisa] Validator architecture (skill vs agent) — `researchs/validator-architecture-2026/summary.md`
- [arquivo] PBQ Framework — contrato e progress files — `plans/Harness-Driven/Harness-Engineering-resumo.txt` (seção 2-3)
- [código] Padrão de comando existente — `src/commands/briefing.js`
