# Doctor checks — curadoria de memória

> Os três novos checks aparecem em `aioson doctor .` com `severity='warning'`. Warnings não afetam `ok=true` — o projeto continua funcionando. Mas cada um representa uma lacuna de curadoria que, se ignorada, torna a memória do projeto menos útil ao longo do tempo.

---

## Como os checks aparecem

```bash
aioson doctor .
```

Quando tudo está saudável:

```
[OK] living-memory:rule_staleness
[OK] living-memory:learning_orphans
[OK] living-memory:distillation_lag
```

Quando há lacunas:

```
[WARN] living-memory:rule_staleness (2 stale rules)
  ...
[WARN] living-memory:learning_orphans (1 orphan)
  ...
[WARN] living-memory:distillation_lag
  ...
```

Os três checks só rodam em projetos com classificação **SMALL** ou **MEDIUM**. Projetos MICRO optam para fora automaticamente — nenhum dos três será exibido.

---

## `living-memory:rule_staleness`

**O que detecta:** regras (arquivos em `.aioson/rules/`) que não tiveram nenhum evento `rule_loaded` nas últimas N features fechadas.

**Por que importa:** se nenhum agente carregou uma regra nas últimas N features, ela provavelmente perdeu relevância — o contexto do projeto mudou, a regra foi superada, ou simplesmente nunca foi usada. Regras obsoletas ocupam espaço no contexto dos agentes sem agregar valor.

**Como N é calculado:**

```
N = max(5, ceil(média de dias entre as últimas 5 features / 7))
```

Projetos com features frequentes (1 por semana) têm N = 5. Projetos com ritmo mais lento (1 por mês) têm N maior — a janela se expande para cobrir o mesmo período de tempo real.

`staleness_window_features_min: 5` em `learning-loop.json` define o piso.

**Saída típica:**

```
[WARN] living-memory:rule_staleness (2 stale rules)
  Rule 'legacy-session-cookies' has 0 rule_loaded events in last 7 features.
  Rule 'old-rate-limit-policy' has 0 rule_loaded events in last 7 features.
  Hint:
    aioson memory:archive --id=rule:legacy-session-cookies --reason="<motivo>"
    aioson memory:archive --id=rule:old-rate-limit-policy --reason="<motivo>"
```

**Como agir:**

1. Verifique se a regra ainda é relevante para o projeto atual.
2. Se não for: use o hint do doctor para arquivar.
3. Se ainda for relevante mas não está sendo carregada: adicione `context:load` aos agentes que deveriam usá-la.
4. Se você não tem certeza: arquive com `--dry-run` para ver o impacto antes de executar.

**Falso positivo:** o check só funciona quando os agentes estão usando `aioson context:load` para declarar carregamentos. Se seus agentes customizados não fazem isso, o check vai reportar tudo como stale. Solução: adicionar `aioson context:load` ao início das sessões.

---

## `living-memory:learning_orphans`

**O que detecta:** learnings com `status='promoted'` cujo target rule não teve nenhum evento `rule_loaded` após a data de promoção.

**Por que importa:** quando um learning é promovido, ele gerou (ou deveria ter gerado) uma regra. Se essa regra nunca foi carregada por nenhum agente desde a promoção, significa uma de duas coisas: ou a regra nunca chegou a ser criada (falha no fluxo de promoção), ou foi criada mas os agentes não a estão consultando. De qualquer forma, é uma lacuna.

**Saída típica:**

```
[WARN] living-memory:learning_orphans (1 orphan)
  Learning 'jwt-expiry-pattern' (promoted 2026-04-10) — target rule had no
  rule_loaded events after promotion date.
  Hint:
    aioson memory:archive --id=learning:jwt-expiry-pattern --reason="<motivo>"
```

**Como agir:**

1. Verifique se a regra correspondente existe em `.aioson/rules/`.
2. Se a regra não existe: o learning foi promovido mas nunca materializou uma regra — crie a regra manualmente ou arquive o learning.
3. Se a regra existe mas nunca foi carregada: adicione `context:load` onde apropriado, ou arquive a regra se ela não é mais relevante.
4. Se o learning foi promovido erroneamente: arquive-o.

---

## `living-memory:distillation_lag`

**O que detecta:** projetos onde o número de features fechadas é significativamente maior que o número de eventos `auto_distillation` registrados em `evolution_log`. Threshold: 5+ features fechadas com menos destilações do que fechamentos.

**Por que importa:** se `feature:close` está sendo chamado mas a destilação não está rodando, o loop está silenciosamente quebrado. Os learnings estão acumulando sem destilação. Pode ser que `--no-distill` esteja sendo usado consistentemente, que o hook esteja falhando silenciosamente, ou que o projeto tenha migrado para o framework depois de fechar várias features.

**Saída típica:**

```
[WARN] living-memory:distillation_lag
  8 features closed, 5 auto_distillation events recorded.
  Hint: check if distillation is failing silently:
    sqlite3 .aioson/runtime/aios.sqlite \
      "SELECT feature_slug, payload_json FROM evolution_log \
       WHERE event_type='distillation_failed' ORDER BY start_at DESC LIMIT 5;"
  Or run distillation manually on recent features.
```

**Como agir:**

1. Execute o comando SQLite do hint para ver se há falhas silenciosas registradas.
2. Se há `distillation_failed`: veja o `payload_json.error_phase` para entender onde está falhando e consulte [Troubleshooting](./troubleshooting.md).
3. Se não há falhas mas há lag: provavelmente as features foram fechadas com `--no-distill` ou antes de o hook existir. O lag vai diminuir naturalmente à medida que novas features forem fechadas.
4. Se o projeto é novo no framework mas tinha features antigas: o lag é esperado e vai se resolver.

---

## Resumo rápido

| Check | Sinal problemático | Ação imediata |
|---|---|---|
| `rule_staleness` | Regra sem `rule_loaded` em N features | Verificar relevância → arquivar ou adicionar `context:load` |
| `learning_orphans` | Learning promovido, regra nunca carregada | Verificar se regra existe → criar, arquivar learning, ou adicionar `context:load` |
| `distillation_lag` | Mais features fechadas do que destilações | Inspecionar `distillation_failed` em `evolution_log` |

---

## Sobre a severidade `warning`

Os três checks são `severity='warning'`, não `severity='error'`. Isso significa:

- `report.ok` continua `true` mesmo com warnings.
- `report.failedCount` inclui warnings.
- Não há `doctor --fix` automático para esses checks — as ações são semânticas e requerem julgamento humano.
- O hint de cada check inclui o comando exato para executar quando você decidir agir.

---

## Continue lendo

- [Como usar](./como-usar.md) — exemplos de archive e restore
- [Referência CLI](./comandos-cli.md) — flags de `memory:archive` e `memory:restore`
- [Troubleshooting](./troubleshooting.md) — lock preso, falhas de destilação
