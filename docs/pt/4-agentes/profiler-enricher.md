# @profiler-enricher — Analisar cognitivamente o material de pesquisa

> **Para quem é:** quem já tem o material coletado pelo `@profiler-researcher` e quer transformá-lo em um perfil cognitivo estruturado.
> **Tempo de leitura:** 3 min.
> **O que você vai sair sabendo:**
> - O que o enricher produz e em que formato
> - Quais frameworks ele aplica sobre o material

---

## Para que serve

Material bruto coletado não é perfil. O `@profiler-enricher` lê o `research-report.md` gerado pelo researcher e aplica análise psicométrica e comportamental baseada em evidências — extraindo padrões de decisão, comunicação, valores e pontos cegos.

Esta é a **etapa 2 de 3** do pipeline Profiler:

```
@profiler-researcher → @profiler-enricher → @profiler-forge
     coleta                  analisa              gera
```

O enricher **não inventa** características — cada inferência é atribuída a uma fonte específica do material. Se não há evidência, ele declara incerteza.

---

## Quando invocar

- O `@profiler-researcher` já rodou e gerou `research-report.md`
- Você quer adicionar materiais extras (transcrições, textos pessoais) antes da análise
- Você está reprocessando um perfil com material novo

---

## Quando NÃO invocar

- O `research-report.md` ainda não existe — rode `@profiler-researcher` primeiro
- Você quer apenas o genome final sem revisar a análise intermediária — o `@profiler-forge` pode rodar após o enricher sem interação extra

---

## Diálogo típico

```
Você > @profiler-enricher david-ogilvy

@profiler-enricher > Base de pesquisa carregada para David Ogilvy (27 fontes).
                     Você pode enriquecer com materiais extras agora.
                     Envie textos, links ou transcrições, ou digite 'proceed'.
Você > proceed

@profiler-enricher > Analisando...
                     DISC: D-moderado / C-alto
                     Enneagram: 3w4 (realizador com autoconhecimento artístico)
                     Big Five: baixo Neuroticismo, alto Conscienciosidade
                     MBTI: ENTJ
                     Estilo de decisão: pesquisa exaustiva antes de executar; confia em dados, não em instintos
                     Pontos cegos: pode subestimar audiências sem background publicitário

@profiler-enricher > Perfil salvo em:
                     .aioson/profiler-reports/david-ogilvy/enriched-profile.md
                     Próximo: @profiler-forge david-ogilvy
```

---

## Saídas em disco

```
.aioson/profiler-reports/{slug}/
├── research-report.md       ← entrada (criada pelo researcher)
└── enriched-profile.md      ← saída desta etapa
```

> **Método operacional (v1.29.0):** além do perfil psicométrico (DISC, Big Five, etc.), o enricher extrai das evidências o **método executável** da pessoa — procedimento em passos, estrutura de output, métricas de estilo, proibições e checklist de entrega (a seção `## Operational Method` do perfil). É o que faz o genome simular *o que a pessoa faz*, não só suas opiniões. Quando a fonte não documenta um método passo a passo, ele é reconstruído e marcado `inferred` — nunca inventado.

---

## Como ele lê seu projeto

- `.aioson/profiler-reports/{slug}/research-report.md` — base obrigatória
- `.aioson/context/project.context.md` — idioma de interação

---

## Handoff típico

- **Vem de:** `@profiler-researcher`
- **Vai para:** `@profiler-forge` — geração do Genome 4.0 e do advisor

---

## Próximo passo

- Etapa anterior: [profiler-researcher.md](./profiler-researcher.md)
- Próxima etapa: [profiler-forge.md](./profiler-forge.md)
