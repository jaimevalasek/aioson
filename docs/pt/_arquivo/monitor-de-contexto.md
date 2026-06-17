# [Arquivado] Monitor de Contexto

> **Esta doc foi consolidada em [`5-referencia/memoria-e-contexto.md`](../5-referencia/memoria-e-contexto.md)**.
> Conteúdo abaixo preservado para referência histórica.

---

# Monitor de Contexto

> Visualiza em tempo real o uso de janela de contexto por agente, com alertas automáticos de warning e critical. Também funciona no modo de budget de projeto para sessões diretas.

O `context:monitor` tem dois modos de operação:
- **Modo squad** — lê `context-monitor.json` da squad e exibe barras de progresso por agente
- **Modo budget** — recebe `--budget` + `--tokens` e calcula a zona de alerta da sessão atual

---

## Modo squad

### `context:monitor --squad`

```bash
aioson context:monitor [path] [opções]
```

**Opções:**

| Opção | Descrição |
|---|---|
| `--squad=<slug>` | Squad a monitorar (obrigatório neste modo) |
| `--agent=<id>` | Filtrar por agente específico (opcional) |
| `--json` | Retorna dados estruturados em JSON |

**Exemplos:**

```bash
# Monitorar todos os agentes de uma squad
aioson context:monitor . --squad=meu-squad

# Monitorar apenas um agente
aioson context:monitor . --squad=meu-squad --agent=dev

# Output JSON para dashboards ou scripts
aioson context:monitor . --squad=meu-squad --json
```

---

## Modo budget de projeto

Útil em sessões diretas (sem squad) para checar se você está próximo do limite da janela de contexto.

### `context:monitor --budget`

```bash
aioson context:monitor [path] --budget=<tokens-totais> --tokens=<tokens-atuais>
```

**Opções:**

| Opção | Descrição |
|---|---|
| `--budget=<n>` | Limite total em tokens (ex: `80000` para Claude Sonnet) |
| `--tokens=<n>` | Tokens consumidos atualmente na sessão |
| `--json` | Retorna JSON com zona, percentual e budget |

**Zonas:**

| Zona | Faixa | Ícone | Ação sugerida |
|---|---|---|---|
| safe | < 60% | ✓ | Continuar normalmente |
| warning | 60–80% | ⚠ | Planejar `/compact` antes do próximo agente; usar `/clear` só para reset forte |
| critical | ≥ 80% | ! | Rodar `context:health` e reduzir carga |

**Exemplos:**

```bash
# Sessão em safe zone
aioson context:monitor . --budget=80000 --tokens=28000
#   ✓ Context: 28,000 tokens (35%) — SAFE

# Sessão em warning zone
aioson context:monitor . --budget=80000 --tokens=52000
#   ⚠ Context: 52,000 tokens (65%) — WARNING
#   Suggestion: /compact before next agent activation; use /clear only for a hard reset

# Sessão em critical zone
aioson context:monitor . --budget=80000 --tokens=67000
#   ! Context: 67,000 tokens (84%) — CRITICAL
#   Run: aioson context:health . for reduction options

# JSON para automação
aioson context:monitor . --budget=80000 --tokens=52000 --json
# { "ok": true, "tokens": 52000, "budget": 80000, "pct": 65, "zone": "warning" }
```

Quando a zona é `warning` ou `critical`, um evento `context_budget_warning` ou `context_budget_critical` é automaticamente registrado no SQLite (na run ativa mais recente), ficando visível no dashboard.

---

## Saída

```
  Context Monitor — meu-squad

   ✓ dev              [████████░░░░░░░░░░░░] 42%  42000/100000
   ⚠ qa               [█████████████████░░░] 85%  85000/100000
   ! analyst          [████████████████████] 97%  97000/100000

  Thresholds: warning=85%  critical=95%
  Updated: 2026-03-30T14:23:00.000Z
```

---

## Níveis de alerta

| Ícone | Nível | Limiar | Situação |
|---|---|---|---|
| ✓ | normal | < 85% | Contexto confortável |
| ⚠ | warning | 85–94% | Prepare recovery, evite carregar novos arquivos grandes |
| ! | critical | 95–99% | Recovery deve ser gerado agora |
| X | overflow | ≥ 100% | Compactação iminente ou já ocorreu |

---

## Quando usar

- Antes de iniciar uma tarefa longa em um agente que já está com contexto parcialmente cheio
- Para saber qual agente da squad está mais próximo de compactar
- Para integrar alertas em scripts de monitoramento via `--json`

---

## JSON output

Com `--json`, retorna objeto com os agentes e seus níveis:

```json
{
  "ok": true,
  "squadSlug": "meu-squad",
  "agents": {
    "dev": {
      "totalUsed": 42000,
      "windowSize": 100000,
      "warningLevel": "normal"
    },
    "qa": {
      "totalUsed": 85000,
      "windowSize": 100000,
      "warningLevel": "warning"
    }
  },
  "updatedAt": "2026-03-30T14:23:00.000Z"
}
```

---

## Relação com recovery automático

Em squads, o monitor detecta automaticamente quando o uso de contexto de um agente cai mais de 30% entre duas medições (sinal de compactação) e injeta um arquivo de recovery. Esse comportamento é coordenado por `checkAndInjectRecovery()` dentro do Squad Dashboard.

Para sessões diretas (sem squad), use [`recovery:generate`](./recuperacao-de-sessao.md).
