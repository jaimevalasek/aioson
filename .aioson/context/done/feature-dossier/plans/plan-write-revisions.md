---
phase: 2
slug: "write-revisions"
schema_version: "1.0"
---

# Phase 2 — Write + Revisões sugeridas

## Scope

Habilitar **escrita controlada** no dossier por cada agente e o ciclo completo de **invocação reversa sugerida** (open → list → resolve). Estender `handoff-contract` de forma backwards-compatible. Bloquear handoff em revisões `severity: blocking`. Implementar contador anti-loop.

## New or modified entities

- **Novo:** `.aioson/context/features/{slug}/revisions.json` — schema completo conforme manifest §3.3.
- **Novo CLI:** `aioson dossier:add-finding {slug} --agent={X} --section={Y} --content="..."` — append-only em `## Agent Trail` da seção do agente (idempotente por hash do content).
- **Novo CLI:** `aioson revision:open {slug} --requested-by={agent} --target={agent} --target-artifact=<path> --reason="..." --severity=blocking|advisory [--evidence-code-refs=<list>]`.
- **Novo CLI:** `aioson revision:list {slug} [--status=pending|approved|rejected|resolved]`.
- **Novo CLI:** `aioson revision:resolve {rev-id} --approve|--reject [--force-revision]`.
- **Modificado:** schema do `handoff-contract.json` ganha campos opcionais:
  ```json
  {
    "dossier_uri": ".aioson/context/features/{slug}/dossier.md",
    "pending_revisions_count": 0,
    "blocking_revisions": []
  }
  ```
  Ausência dos campos = legado (tratado como `null` / `0` / `[]`).
- **Modificado:** `aioson workflow:execute` consulta `pending_revisions_count` antes de qualquer handoff. Se houver `blocking_revisions` não-resolvidas, recusa o handoff com mensagem explícita listando os `rev-id`.
- **Modificado:** `workflow.state.json` ganha array `revision_rounds` por gate:
  ```json
  {
    "gate_revision_rounds": {
      "design": 0,
      "plan": 1,
      "execution": 0
    }
  }
  ```
  Incrementa quando uma revision aprovada re-roda agente upstream do gate atual. Limite default = 3.
- **Modificado:** prompts dos agentes ganham instrução explícita "ao detectar gap em decisão upstream, abrir revision_request via `aioson revision:open`".

## User flows covered

- **F4 — Agent escreve no dossier:** `@analyst` termina sua análise → roda `dossier:add-finding --agent=analyst --section="Code Map" --content="..."` → seção é populada de forma append-only.
- **F5 — Reverse invocation suggested:** `@analyst` lê dossier, descobre que PRD assume integração síncrona mas módulo X é event-driven → `aioson revision:open feature-x --requested-by=analyst --target=product --target-artifact=.aioson/context/prd-feature-x.md --reason="..." --severity=blocking`. CLI grava em `revisions.json` e atualiza `## Revision Requests` no dossier.
- **F6 — Handoff bloqueado:** `@analyst` tenta `workflow:next --complete`. CLI vê `blocking_revisions` → recusa com mensagem listando `rev-001`. Usuário vê alerta.
- **F7 — User aprova revision:** `aioson revision:resolve rev-001 --approve` → CLI re-roda `@product` com input adicional contendo a revision_request específica. Após @product fechar, marca `resolved`. `gate_revision_rounds.requirements++`.
- **F8 — User rejeita:** `aioson revision:resolve rev-001 --reject` → revision marcada `rejected` com timestamp. Handoff destravado.
- **F9 — Anti-loop:** terceira aprovação no mesmo gate → CLI exige `--force-revision` explícito antes de re-rodar.

## Acceptance criteria

- AC1: `revision:open` cria entrada em `revisions.json` com `id` único (`rev-NNN`), valida schema (`severity` ∈ `blocking|advisory`, `target_artifact` é path relativo).
- AC2: `revision:open` atualiza seção `## Revision Requests` do `dossier.md` com resumo legível (id, requested_by, target, severity, status).
- AC3: `revision:list feature-x --status=pending` retorna apenas pendentes.
- AC4: `revision:resolve rev-001 --reject` é terminal — `rev-001` não pode ser re-aberta (precisa nova `rev-002`).
- AC5: `workflow:execute` recusa handoff quando `blocking_revisions.length > 0`. Mensagem inclui lista dos `rev-id`.
- AC6: `revision:resolve --approve` incrementa `gate_revision_rounds.{gate}` no `workflow.state.json`.
- AC7: Quarta aprovação no mesmo gate exige `--force-revision`. Sem o flag, CLI exit-code != 0.
- AC8: Handoff legado (sem campos `dossier_uri` / `pending_revisions_count`) NÃO é quebrado.
- AC9: `dossier:add-finding` é idempotente — chamada repetida com mesmo content não duplica.
- AC10: `feature:archive` snapshota `revisions.json` final (incluindo rejeitadas) em `done/{slug}/dossier/revisions.json`.
- AC11: Templates concretos por agente em `.aioson/docs/dossier/agent-templates.md` (o que cada agente escreve em qual seção).
- AC12: Telemetria: `revision:open`, `revision:resolve`, e bloqueio de handoff emitem evento via `runtime:emit` (mirror em SQLite, não fonte de verdade).

## Implementation sequence

1. Templates por agente em `.aioson/docs/dossier/agent-templates.md` (o que `@product`, `@sheldon`, `@analyst`, `@architect`, `@ux-ui`, `@pm`, `@orchestrator`, `@dev` escrevem).
2. `src/lib/dossier-store.js` ganha `addFinding(slug, agent, section, content)` (append-only, dedupe por hash).
3. `src/lib/revision-store.js` — CRUD de `revisions.json` + atualização do dossier.
4. Comando `src/commands/dossier.js` ganha sub-command `add-finding`.
5. Comando novo `src/commands/revision.js` (`open`, `list`, `resolve`).
6. Estender `src/lib/handoff-contract.js` com campos opcionais e função `getBlockingRevisions(slug)`.
7. `src/commands/workflow.js` (`workflow:execute`, `workflow:next`) consulta `getBlockingRevisions` antes de handoff.
8. `workflow.state.json` ganha `gate_revision_rounds`; helper `incrementRevisionRound(gate)` + verificação de limite.
9. Re-execução de agente: `revision:resolve --approve` chama `aioson agent:prompt {target} --revision-context={path-to-revision-payload}`.
10. Estender `feature:archive` para snapshot do `revisions.json`.
11. Telemetria: emitir `revision_opened`, `revision_resolved`, `handoff_blocked_by_revision` via `runtime:emit`.
12. Tests: integração end-to-end `dossier:init → add-finding → revision:open → workflow:next (bloqueado) → revision:resolve --approve → re-run @product → resolved → workflow:next (passa)`.

## External dependencies

Nenhuma. Reutiliza `runtime:emit`, `agent:prompt`, e schema YAML/JSON existentes.

## Notes for @dev

- **Append-only no dossier:** nunca reescrever seções existentes. Sempre append em `## Agent Trail` com marcador de timestamp + agente.
- **Concorrência:** seções são append-only — múltiplos agentes podem escrever em seções diferentes sem lock. Para mesma seção, usar lockfile temporário (`features/{slug}/.dossier.lock`) com timeout de 30s.
- **Idempotência:** hash SHA-256 do content + section. Se hash já presente em `## Agent Trail`, no-op silencioso.
- **`revision_id` único:** sequencial por feature (`rev-001`, `rev-002`...), gerado a partir do count atual em `revisions.json`.
- **Re-execução do agente upstream:** `revision:resolve --approve` deve chamar `agent:prompt` com env var `AIOSON_REVISION_CONTEXT={revision-id}` para o agente saber que está em ciclo de revisão. O agente alvo lê `revisions.json[rev-id]` e refina seu artefato.
- **NÃO criar gate "revisão"** no workflow — gates existentes permanecem; revisão é um sub-ciclo dentro do gate atual.
- **Backwards-compat:** todo código novo trata ausência de `dossier_uri` em handoffs como "feature legada, segue fluxo antigo".

## Notes for @qa

- Verify AC1-AC12 automaticamente.
- Edge: `revision:resolve` em `rev-id` inexistente — exit-code 1 + mensagem clara.
- Edge: `revision:open` com `target` inválido (não é nome de agente) — recusa.
- Edge: dois agentes tentam `dossier:add-finding` simultaneamente na mesma seção — lockfile resolve, segundo espera/falha graciosamente.
- Edge: `workflow:next --complete` com `gate_revision_rounds.{gate} >= 3` E sem `--force-revision` — recusa.
- Smoke: feature legada (sem `features/{slug}/`) ainda completa fluxo end-to-end sem warnings.

## Phase-specific reference sources

- `.aioson/context/handoff-protocol.json` — schema atual do handoff (referência para extensão backwards-compatible)
- `.aioson/plans/feature-dossier/manifest.md` — decisões fechadas (especialmente §6, §7, §8)
- Commit `981a8fd` (feat(sdlc): handoff-contract) — base do contrato de handoff atual
