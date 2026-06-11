# harness:retro — Dossiê retrospectivo de loop

> Minera deterministicamente o histórico de falhas de uma feature e materializa um dossiê retrospectivo — sem LLM, sem rede.

Introduzido na v1.23.0 como parte do **RHO-lite** (Retrospective Harness Optimization). Resolve um problema comum após loops com múltiplas tentativas: entender o que falhou, quantos ciclos FAIL→PASS aconteceram e quais correções foram aplicadas, sem precisar ler dezenas de arquivos espalhados.

---

## Quando usar

- Após a conclusão de uma feature com iterações do `self:loop` para entender o histórico de falhas.
- Antes de iniciar `@qa` ou `@validator` em features que passaram por correções — o dossiê é um insumo de contexto.
- Para identificar padrões recorrentes entre features (`--last=N`).

---

## Comandos

### harness:retro

```bash
# Dossiê de uma feature específica
aioson harness:retro . --feature=<slug>

# Dossiê das N features mais recentes (ordenadas por data de PASS)
aioson harness:retro . --last=<N>

# Output JSON (propagando exit codes para automação)
aioson harness:retro . --feature=<slug> --json

# Locale específico
aioson harness:retro . --feature=<slug> --locale=pt-BR
```

**Exit codes:**

| Código | Significado |
|---|---|
| 0 | Sucesso (inclusive dossiê vazio — sem falhas mineradas) |
| 1 | Erro de I/O inesperado |
| 12 | Erro de input (slug inválido, flags conflitantes, feature inexistente) |

**Saída:** `.aioson/context/retro/{slug}.md` (ou `window-last-{N}.md`). A operação é de **leitura**, exceto pela escrita do dossiê — os arquivos-fonte nunca são alterados.

### harness:preview

```bash
# Exibir prévia de um artefato (com truncação segura)
aioson harness:preview <arquivo>
```

Usado principalmente na interface de feedback do `self:loop` quando um critério falha — exibe o conteúdo do artefato relevante sem despejar o arquivo inteiro no contexto do agente. Truncação UTF-8-safe, best-effort write, modo read-only.

---

## Fontes mineradas

O `harness:retro` lê sete fontes por feature:

| Fonte | O que captura |
|---|---|
| Relatórios QA | Falhas e severidades de `@qa` |
| Planos de correção | Correções aplicadas por ciclo |
| Trilha do dossier | Ciclos FAIL→PASS do Agent Trail |
| `execution_events` | Eventos de telemetria do loop |
| Diretório de tentativas | Artefatos de cada iteração (`attempts/`) |
| Assinaturas de falha | Padrões de erro recorrentes |
| Devlogs | Resumos de sessão escritos manualmente |

---

## Estrutura do dossiê

O arquivo gerado tem frontmatter YAML e três seções principais:

```markdown
---
feature: minha-feature
generated_at: ...
schema_version: "1.0"
sources:
  qa_reports: 2
  corrections: 1
  dossier_trail: 8
  attempts: 3
---

## Propostas candidatas
<!-- Falhas de severidade high com múltiplas ocorrências ou ciclo FAIL→PASS -->

### feature::C-01
- Âncora, severidade, ocorrências, correções aplicadas, custo de retrabalho

## Observações
<!-- Falhas de severidade medium/low que não atingiram a promoção a candidato -->

## Trilha minerada
<!-- Paths, contagens por fonte, avisos de degradação -->
```

**Promoção a candidato (REQ-2):** uma falha vira "proposta candidata" quando atinge a barra de severidade ou ocorrência definida no schema. As demais ficam em "observações".

---

## Segurança

O texto livre minerado (títulos de findings, descrições de correções) passa por `neutralizeText()` antes de ser renderizado no dossiê. Isso remove caracteres de controle, bidi e zero-width que poderiam injetar estrutura Markdown num dossiê compartilhado com `@sheldon`. O comportamento é byte-stable em texto limpo.

---

## Exemplos práticos

```bash
# Após fechar a feature checkout, gerar retrospectiva
aioson harness:retro . --feature=checkout

# Ver o dossiê gerado
aioson harness:preview .aioson/context/retro/checkout.md

# Retrospectiva das 5 features mais recentes
aioson harness:retro . --last=5

# Passar para @sheldon como contexto
# Abra uma sessão @sheldon e carregue .aioson/context/retro/checkout.md
```

---

## Próximos passos

- [Loop Guardrails](./loop-guardrails.md) — contrato verificável que gera os artefatos que o retro minera
- [Motor Hardening](./motor-hardening.md) — gates técnicos e auto-cura
- [Feature Dossier](./feature-dossier.md) — ponto único de verdade de uma feature
