# @profiler-researcher — Coletar material bruto para perfil cognitivo

> **Para quem é:** quem quer criar um genome de persona baseado em evidências reais, não em suposições.
> **Tempo de leitura:** 3 min.
> **O que você vai sair sabendo:**
> - O que o researcher coleta e onde salva
> - Como ele se encaixa no pipeline de 3 etapas

---

## Para que serve

Criar um advisor que "pensa como Steve Jobs" a partir de impressões vagas produz um estereótipo, não um perfil. O `@profiler-researcher` resolve isso coletando **material público real** — entrevistas, transcrições, posts, livros, ensaios — de forma sistemática e categorizada, antes de qualquer análise.

Esta é a **etapa 1 de 3** do pipeline Profiler:

```
@profiler-researcher → @profiler-enricher → @profiler-forge
     coleta                  analisa              gera
```

O researcher **não analisa nem infere**. Ele organiza evidências.

---

## Quando invocar

- Você quer criar um genome de persona baseado em pessoa pública real
- O `@genome` te redirecionou aqui ao detectar `type: persona`
- Você tem materiais brutos (entrevistas, transcrições) e quer organizá-los antes da análise

---

## Quando NÃO invocar

- Você quer um genome de domínio ou função (não persona) — use `@genome` direto
- Você quer um perfil rápido sem evidências — use `@genome --quick` com disclaimer de baixa fidelidade

---

## Diálogo típico

```
Você > @profiler-researcher David Ogilvy copywriter

@profiler-researcher > Iniciando pesquisa cognitiva para David Ogilvy.
                       Contexto: copywriter, publicidade, Ogilvy & Mather
                       Domínio de interesse: princípios de persuasão e escrita

@profiler-researcher > Pesquisando fontes...
                       - Entrevistas: 7 encontradas (Agency, Advertising Age, BBC)
                       - Livros: "Ogilvy on Advertising", "Confessions of an Advertising Man"
                       - Discursos: 3 transcrições públicas
                       - Princípios documentados: 14 extraídos

@profiler-researcher > Relatório salvo em:
                       .aioson/profiler-reports/david-ogilvy/research-report.md
                       Próximo: @profiler-enricher david-ogilvy
```

---

## Saídas em disco

```
.aioson/profiler-reports/{slug}/
└── research-report.md    ← material categorizado por fonte
```

---

## Como ele lê seu projeto

- `.aioson/context/project.context.md` — idioma de interação

---

## Comandos CLI relacionados

Ativação direta no cliente AI:
```
@profiler-researcher [nome completo + contexto]
```

---

## Handoff típico

- **Vem de:** `@genome` (redirect automático) ou pedido direto do usuário
- **Vai para:** `@profiler-enricher` — análise cognitiva do material coletado

---

## Próximo passo

- Próxima etapa: [profiler-enricher.md](./profiler-enricher.md)
- Etapa final: [profiler-forge.md](./profiler-forge.md)
- O que é genome: [glossario.md](../1-entender/glossario.md#genome)
