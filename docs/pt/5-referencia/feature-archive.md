# Feature Archive — Limpeza automática do contexto

O `feature:archive` move os artefatos de uma feature concluída para `.aioson/context/done/{slug}/` e mantém um manifest que permite aos agentes consultarem o histórico sem carregar os arquivos arquivados.

O objetivo é manter o root de `.aioson/context/` enxuto automaticamente — o usuário não precisa fazer nada.

---

## Como funciona

Quando o `@qa` aprova uma feature e roda `aioson feature:close --verdict=PASS`, o arquivamento acontece no mesmo ato:

```
@qa aprova → aioson feature:close --feature={slug} --verdict=PASS
                ├── atualiza spec-{slug}.md (QA sign-off)
                ├── atualiza features.md → done
                ├── limpa project-pulse.md
                └── chama feature:archive automaticamente
                        ├── move *-{slug}.{md,yaml,yml,json} → done/{slug}/
                        └── atualiza done/MANIFEST.md
```

Não existe etapa manual. O contexto fica limpo sem que o desenvolvedor precise lembrar de nada.

---

## Arquivos que são movidos

O comando identifica os artefatos da feature pelo padrão de nome: qualquer arquivo no **root** de `.aioson/context/` que contenha o slug da feature no nome. Exemplos para `--feature=checkout`:

```
prd-checkout.md
spec-checkout.md
requirements-checkout.md
architecture-checkout.md
implementation-plan-checkout.md
sheldon-enrichment-checkout.md
qa-report-checkout.md
qa-report-checkout-hardening.md   ← sufixo extra: também capturado
conformance-checkout.yaml
security-findings-checkout.json
```

**O que nunca é movido:**

- Arquivos globais do projeto: `project.context.md`, `project-pulse.md`, `features.md`, `discovery.md`, `design-doc.md`, `prd.md`, `architecture.md`, `scan-*.md`, `test-plan.md`, `test-inventory.md`, `module-src.md`, `context-pack.md`, `memory-index.md`, `handoff-*.json`, etc.
- Subdiretórios: `bootstrap/`, `forensics/`, `parallel/`, `seeds/`, `done/`
- Arquivos de outra feature (proteção contra colisão de slugs similares)

---

## O manifest

Após cada arquivamento, `.aioson/context/done/MANIFEST.md` é atualizado com uma linha por feature:

```markdown
| slug | completed | files | summary |
|------|-----------|-------|---------|
| checkout | 2026-04-24 | 7 | Fluxo completo de checkout com Stripe e endereço. |
| user-auth | 2026-03-10 | 5 | Autenticação JWT com refresh token e 2FA opcional. |
```

O summary é extraído automaticamente da seção `## Vision` do PRD da feature.

Agentes que precisam de contexto histórico (`@briefing`, `@neo`, `@discover`, `@sheldon`) leem o manifest em vez de varrer os arquivos arquivados — custo de tokens mínimo.

---

## Comandos disponíveis

### Arquivamento (chamado automaticamente pelo feature:close)

```bash
# Já acontece automaticamente via feature:close --verdict=PASS
aioson feature:close . --feature=checkout --verdict=PASS

# Mas você pode rodar diretamente se precisar
aioson feature:archive . --feature=checkout

# Ver o que seria movido sem mover nada
aioson feature:archive . --feature=checkout --dry-run

# Desabilitar o archive automático em um feature:close específico
aioson feature:close . --feature=checkout --verdict=PASS --no-archive
```

### Restauração (para reabrir uma feature arquivada)

```bash
# Ver o que seria restaurado
aioson feature:archive . --feature=checkout --restore --dry-run

# Restaurar os arquivos de volta ao root
aioson feature:archive . --feature=checkout --restore
```

Após restaurar, atualize `features.md` manualmente se quiser mudar o status da feature de `done` para `in_progress`.

### Arquivamento retroativo

Para features que já estão como `done` em `features.md` mas ainda têm arquivos no root (projetos que fizeram upgrade do AIOSON):

```bash
aioson feature:archive . --feature=briefing-agent
aioson feature:archive . --feature=harness-driven-aioson
# etc.
```

O comando é idempotente — rodar duas vezes na mesma feature é no-op seguro.

### Opção --force

```bash
# Arquivar mesmo que o slug não esteja registrado em features.md
aioson feature:archive . --feature=minha-feature --force
```

Use apenas em emergências ou migrações manuais.

### Saída JSON

```bash
aioson feature:archive . --feature=checkout --json
```

```json
{
  "ok": true,
  "slug": "checkout",
  "completed": "2026-04-24",
  "archiveDir": ".aioson/context/done/checkout",
  "moved": ["prd-checkout.md", "spec-checkout.md"],
  "skipped": [],
  "totalArchived": 7,
  "manifestEntry": {
    "slug": "checkout",
    "completed": "2026-04-24",
    "files": "7",
    "summary": "Fluxo completo de checkout com Stripe e endereço."
  }
}
```

---

## Estrutura após o arquivamento

```
.aioson/context/
├── project.context.md       ← global, nunca arquivado
├── project-pulse.md         ← global
├── features.md              ← registro de todas as features
├── prd-nova-feature.md      ← feature ativa (ainda no root)
├── done/
│   ├── MANIFEST.md          ← resumo de todas as features concluídas
│   ├── checkout/
│   │   ├── prd-checkout.md
│   │   ├── spec-checkout.md
│   │   └── ...
│   └── user-auth/
│       ├── prd-user-auth.md
│       └── ...
└── bootstrap/               ← cache semântico (separado)
```

---

## Impacto nos agentes

| Agente | Comportamento |
|--------|--------------|
| `@qa` | Roda `aioson feature:close --verdict=PASS` ao fechar — o archive cascateia automaticamente |
| `@dev`, `@analyst`, `@architect`, `@tester`, `@pm`, `@ux-ui` | Sem mudança — já operavam apenas na feature ativa |
| `@product` | Sem mudança — vê apenas `prd.md` e `prd-{slug}.md` ativos |
| `@briefing` | Lê `done/MANIFEST.md` para evitar duplicar briefings de features já entregues |
| `@neo` | Lê `done/MANIFEST.md` para contexto geral do projeto |
| `@discover` | Lê `done/MANIFEST.md` ao montar `bootstrap/what-it-does.md` |
| `@sheldon` | Lê `done/MANIFEST.md` — features arquivadas não aparecem no menu de enrichment |

---

## Safety guards

| Situação | Comportamento |
|----------|--------------|
| Feature com status `in_progress` em `features.md` | Aborta com erro (use `--force` para forçar) |
| Feature não registrada em `features.md` | Aborta com erro (use `--force` para forçar) |
| Arquivo já presente no destino | Skip silencioso (idempotente) |
| `--restore` com conflito no root | Aborta e lista os conflitos — resolve manualmente |
| `--verdict=FAIL` no feature:close | Sem arquivamento (feature permanece no root para correção) |
| Subdiretórios em `.aioson/context/` | Nunca afetados — o glob é somente sobre arquivos no root |

---

## Veja também

- [Feature Export](./feature-export.md) — **copiar** (não mover) os artefatos para um local limpo, sem mexer na origem
- [Feature Dossier](./feature-dossier.md) — o que o dossier carrega *antes* de arquivar a feature
- [Continuidade entre sessões](../3-receitas/continuidade-entre-sessoes.md) — retomar feature interrompida com dossier + dev-resume
- [Fluxo de artefatos](./fluxo-artefatos.md) — mapa de quem cria o quê e quem consome
