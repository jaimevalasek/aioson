# Feature Export — Exportar artefatos para um local limpo

O `feature:export` **copia** todos os artefatos de uma feature para um diretório de saída que você escolhe, deixando a árvore original intacta.

É o irmão não-destrutivo do [`feature:archive`](./feature-archive.md): em vez de **mover** os arquivos para `.aioson/context/done/{slug}/`, ele **copia** para um `--out` arbitrário. O objetivo é transformar a saída em markdown do AIOSON num entregável portátil — para analisar as specs fora do projeto, entregar a um cliente, ou usar o AIOSON apenas como gerador de specs.

---

## Como funciona

O comando reutiliza exatamente a mesma enumeração de artefatos do `feature:archive` (incluindo o guard contra colisão de slugs parecidos), mas:

- **Copia** em vez de mover — a árvore de origem nunca é alterada.
- Escreve no `--out` que você indicar (ou em `<projeto>/{slug}-export` por padrão).
- Funciona tanto para features **ativas** (artefatos no root + diretórios por slug) quanto para features **já arquivadas** (`context/done/{slug}/`).
- Gera um `INDEX.md` listando tudo que foi exportado e a origem de cada arquivo.

```bash
# Exporta a feature checkout para ./checkout-export/ (mirrored + INDEX.md)
aioson feature:export . --feature=checkout

# Destino customizado
aioson feature:export . --feature=checkout --out=../checkout-specs

# Tudo num diretório só (sem subpastas), nomes prefixados por label
aioson feature:export . --feature=checkout --flatten

# Sem o INDEX.md
aioson feature:export . --feature=checkout --no-index

# Ver o que seria copiado sem escrever nada
aioson feature:export . --feature=checkout --dry-run
```

---

## O que é copiado

A mesma superfície que o `feature:archive` identifica:

- Arquivos no **root** de `.aioson/context/` no padrão `*-{slug}.{md,yaml,yml,json}` (ex.: `prd-checkout.md`, `spec-checkout.md`, `requirements-checkout.md`, `conformance-checkout.yaml`, `security-findings-checkout.json`).
- Diretórios por slug: `context/features/{slug}/` (dossier), `.aioson/plans/{slug}/`, `.aioson/briefings/{slug}/`.
- `context/done/{slug}/` quando a feature já foi arquivada (sempre incluído).

**O que nunca é copiado:** arquivos globais (`project.context.md`, `project-pulse.md`, `features.md`, etc.) e arquivos de outra feature — o guard contra colisão garante que `checkout-v2` nunca vaze numa exportação de `checkout`.

---

## Estrutura de saída

### Mirrored (padrão)

```
checkout-export/
├── INDEX.md                    ← manifesto gerado
├── prd-checkout.md             ← arquivos do root
├── spec-checkout.md
├── requirements-checkout.md
├── dossier/
│   └── dossier.md
├── plans/
│   ├── manifest.md
│   └── plan-phase-1.md
├── briefings/
│   └── briefing.md
└── done/                       ← presente se a feature já foi arquivada
    └── ...
```

### Flatten (`--flatten`)

Tudo num nível só. Arquivos do root mantêm o nome; arquivos aninhados viram `label-...-arquivo.ext` (livre de colisão por construção):

```
checkout-export/
├── INDEX.md
├── prd-checkout.md
├── spec-checkout.md
├── dossier-dossier.md
├── plans-manifest.md
├── plans-plan-phase-1.md
└── briefings-briefing.md
```

---

## O INDEX.md

Gerado por padrão (desabilite com `--no-index`). Lista cada arquivo exportado, o grupo de origem e o caminho fonte:

```markdown
# Feature Export — checkout

> 7 file(s) copied from AIOSON on 2026-06-08.
> Non-destructive snapshot — the original artefacts were left untouched.

| group | file | source |
|-------|------|--------|
| context | prd-checkout.md | .aioson/context/prd-checkout.md |
| dossier | dossier/dossier.md | .aioson/context/features/checkout/dossier.md |
| plans | plans/manifest.md | .aioson/plans/checkout/manifest.md |
```

---

## Opções

| Opção | Padrão | Descrição |
|-------|--------|-----------|
| `--feature=<slug>` | — | Identificador da feature (obrigatório). |
| `--out=<dir>` | `<projeto>/{slug}-export` | Diretório de destino. |
| `--flatten` | mirrored | Achata a estrutura num nível só. |
| `--no-index` | gera INDEX | Não escreve o `INDEX.md`. |
| `--dry-run` | — | Mostra o que seria copiado sem escrever nada. |
| `--json` | — | Saída JSON estruturada (`outDir`, `count`, `copied`, `index`). |

---

## Saída JSON

```bash
aioson feature:export . --feature=checkout --json
```

```json
{
  "ok": true,
  "slug": "checkout",
  "outDir": "checkout-export",
  "flatten": false,
  "count": 7,
  "copied": ["prd-checkout.md", "spec-checkout.md", "dossier/dossier.md"],
  "index": true
}
```

---

## Diferenças em relação ao feature:archive

| | `feature:archive` | `feature:export` |
|---|---|---|
| Operação | **move** (`fs.rename`) | **copia** (não-destrutivo) |
| Destino | `.aioson/context/done/{slug}/` (dentro do projeto) | `--out` arbitrário |
| Quem aciona | agentes (via `feature:close`) | o usuário |
| Guard de status | exige `done` (ou `--force`) | nenhum — exporta feature em progresso também |
| Efeito na origem | remove do root | intacta |

---

## Veja também

- [Feature Archive](./feature-archive.md) — limpeza automática do contexto (move, não copia)
- [Feature Dossier](./feature-dossier.md) — o que o dossier consolida antes de exportar/arquivar
- [Fluxo de artefatos](./fluxo-artefatos.md) — mapa de quem cria o quê
