# @profiler-forge — Gerar Genome 4.0 e advisor a partir do perfil enriquecido

> **Para quem é:** quem quer transformar o perfil cognitivo analisado em um artefato utilizável — genome ou advisor.
> **Tempo de leitura:** 3 min.
> **O que você vai sair sabendo:**
> - O que o profiler-forge gera e onde salva
> - Como usar o advisor gerado no seu projeto

---

## Para que serve

Análise cognitiva na cabeça não serve para nada. O `@profiler-forge` pega o `enriched-profile.md` e o transforma em dois artefatos deployáveis: um **Genome 4.0** (YAML estruturado com todos os campos psicométricos e operacionais) e/ou um **Advisor Agent** (prompt pronto para vincular a um squad ou usar diretamente no cliente AI).

Esta é a **etapa 3 de 3** do pipeline Profiler:

```
@profiler-researcher → @profiler-enricher → @profiler-forge
     coleta                  analisa              gera
```

O forge **não pesquisa nem analisa** — ele sintetiza, estrutura e formata.

---

## Quando invocar

- O `@profiler-enricher` já gerou `enriched-profile.md`
- Você quer o genome em formato 4.0 (com campos `anchor_prompt`, `relations`, `hexaco_h`, `trait_interactions`)
- Você quer um advisor pronto para o cliente AI

---

## Quando NÃO invocar

- O `enriched-profile.md` ainda não existe — o forge vai te pedir para voltar às etapas anteriores
- Você não precisa de um artefato formal — para uso rápido, `@genome --quick` gera algo sem pipeline

---

## Diálogo típico

```
Você > @profiler-forge david-ogilvy

@profiler-forge > Perfil cognitivo carregado para David Ogilvy.
                  DISC: D-moderado/C-alto | Enneagram: 3w4 | MBTI: ENTJ
                  Pontos de evidência: 27 | Confiança: alta

                  O que você quer gerar?
                  [1] Genome 4.0
                  [2] Advisor Agent
                  [3] Ambos
                  [4] Ambos + aplicar a um squad
Você > 3

@profiler-forge > Gerando...
                  Genome: .aioson/genomes/david-ogilvy.genome.json
                  Advisor: .aioson/genomes/david-ogilvy-advisor.md

                  Para usar o advisor: inclua o arquivo no seu cliente AI
                  ou vincule ao squad via squad.json → genome_binding.
```

---

## Saídas em disco

```
.aioson/genomes/{slug}.genome.json       ← Genome 4.0 completo
.aioson/genomes/{slug}-advisor.md        ← advisor como prompt utilizável
```

> **Seções operacionais (v1.29.0):** o forge emite o método capturado pelo enricher como cinco seções obrigatórias no genome — `## Operating Procedure`, `## Output Structure`, `## Style Metrics`, `## Prohibitions`, `## Delivery Checklist`. Um genome de persona-praticante sem `## Operating Procedure` é tratado como defeito de geração. Veja [genome.md](./genome.md) para como essas seções se propagam ao vincular num squad.

---

## Como ele lê seu projeto

- `.aioson/profiler-reports/{slug}/enriched-profile.md` — entrada obrigatória

---

## Handoff típico

- **Vem de:** `@profiler-enricher`
- **Vai para:** uso direto do advisor / vinculação ao squad via `@squad`

---

## Próximo passo

- Etapa anterior: [profiler-enricher.md](./profiler-enricher.md)
- Usar o genome num squad: [squad.md](./squad.md)
- Publicar o genome: `aioson system:publish --type=genome --slug=<slug>`
