# Memória Viva — guia em português

> **Memória Viva** é o nome do conjunto de capacidades que mantém o AIOSON ciente do projeto **enquanto ele muda**. Em vez de ler o repositório do zero a cada sessão, o framework guarda um resumo semântico em `bootstrap/`, atualiza esse resumo automaticamente quando uma sessão muda algo relevante, e usa um contrato de autonomia em três níveis para decidir o que pode rodar sozinho, o que precisa notificar, e o que precisa de humano.

Esta pasta é a porta de entrada para entender e usar a feature. Ela é dividida em **conceito**, **como funciona**, **referência** e **operação**.

---

## Para que serve

- **Acelerar agentes** — quando `@dev`, `@qa` ou `@deyvin` começam uma sessão, eles leem o `bootstrap/` em vez de varrer o código. Menos contexto consumido, mais sessão útil.
- **Manter o resumo fiel** — toda sessão que mexe em rotas, models, PRDs ou volume alto de código atualiza `bootstrap/*.md` antes do próximo agente entrar. Sem intervenção humana.
- **Dar autonomia controlada** — o agente pode rodar comandos read-only (tier 1) sem perguntar, comandos de memória interna (tier 2) com notificação, e nunca pode disparar operações irreversíveis (tier 3) sozinho.
- **Diagnosticar o estado da memória** — `aioson doctor` reporta cobertura de bootstrap, drift de permissões, slashes ausentes e version mismatch com hints acionáveis.

---

## Roteiro de leitura

### Estou começando — quero entender o conceito (10 min)
1. [O que é Memória Viva](./memoria-viva.md) — as 4 camadas, ciclo de vida de uma sessão, problema que resolve
2. [Diagramas](./diagramas.md) — fluxo de uma sessão completa em ASCII

### Quero saber como a reflexão funciona por baixo (15 min)
3. [Reflexão In-Harness](./reflexao-in-harness.md) — engine determinístico, manifest, validação, exemplos com comandos reais
4. [Diagramas](./diagramas.md) seção *Reflection flow*

### Vou configurar permissões / notify / harness (20 min)
5. [Autonomy Contract](./autonomy-contract.md) — 3 tiers, comandos canônicos por tier, como cada harness aplica
6. [Notificações inline](./notificacoes-info.md) — `aioson notify`, levels ℹ/⚠/⛔, exit codes, integração com dashboard

### Algo quebrou — preciso resolver agora
7. [Troubleshooting](./troubleshooting.md) — bootstrap 0/4, agente parece burro, push bloqueado, version drift, permissions drift, reflect rejeitado

---

## Comandos canônicos

Os comandos abaixo são o vocabulário mínimo da Memória Viva. Cada um tem um doc próprio com detalhes.

| Comando | O que faz | Doc |
|---|---|---|
| `aioson memory:status .` | Mostra cobertura de bootstrap, devlogs, brains, runtime | [memoria-viva](./memoria-viva.md) |
| `aioson memory:summary . --last=5` | Resumo compacto para abrir sessão fria | [memoria-viva](./memoria-viva.md) |
| `aioson memory:reflect-prepare . --agent=<a>` | Roda heurística + gera manifest em `.aioson/runtime/reflect-prompt.json` | [reflexao-in-harness](./reflexao-in-harness.md) |
| `aioson memory:reflect-commit . --agent=<a> --output=<json>` | Valida output do agente e escreve em `bootstrap/*.md` | [reflexao-in-harness](./reflexao-in-harness.md) |
| `aioson notify . --level=info\|warn\|block --topic=<t> --message=<m>` | Notificação inline com prefixo visual + telemetria | [notificacoes-info](./notificacoes-info.md) |
| `aioson doctor .` | Diagnóstico completo, incluindo 5 checks de Memória Viva | [troubleshooting](./troubleshooting.md) |
| `aioson doctor . --fix` | Aplica auto-correções: regenera permissões, restaura slashes, cria diretórios | [troubleshooting](./troubleshooting.md) |

---

## Onde os artefatos vivem

| Arquivo | Papel |
|---|---|
| `.aioson/context/bootstrap/what-is.md` | Identidade do sistema, usuários, valor |
| `.aioson/context/bootstrap/how-it-works.md` | Arquitetura, módulos, fluxo de dados |
| `.aioson/context/bootstrap/what-it-does.md` | Features, regras de negócio, workflows |
| `.aioson/context/bootstrap/current-state.md` | O que já foi entregue (append-only) |
| `.aioson/config/autonomy-protocol.json` | Contrato canônico de autonomia (v1.1 com `tiers`) |
| `.aioson/runtime/reflect-prompt.json` | Manifest pendente de reflexão (efêmero — apagado após commit) |
| `.aioson/runtime/aios.sqlite` | Telemetria: eventos `memory_reflect_*`, `notify_*` |
| `.claude/settings.json` + `.codex/`/`.gemini/`/`.opencode/` | Permissões nativas geradas a partir do protocol |

---

## Status

A feature `living-memory` foi entregue em 5 fases entre 2026-04 e 2026-05:

| Fase | Entrega | Status |
|---|---|---|
| 0 | Slash `/discover` em todos harnesses + `doctor.js` reconhece slashes | ✅ |
| 1 | Engine determinístico + `memory:reflect-prepare/commit` + 3 templates | ✅ |
| 2 | `autonomy-protocol.json` v1.1 com `tiers` + `permissions-generator` (4 harnesses) + `notify` | ✅ |
| 3 | Capability `reflect_memory` nos manifests + hooks em `workflow:next` + `runAgentDone` + agentes com Memory reflection | ✅ |
| 4 | 5 checks em `doctor` + 5 fix actions + i18n en/pt-BR/es/fr | ✅ |
| 5 | Esta documentação | ✅ |

A arquitetura completa está em `.aioson/context/architecture-living-memory.md`. As decisões da implementação (D1-D28) estão em `.aioson/context/spec-living-memory.md`.
