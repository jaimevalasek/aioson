# @orache — Investigar um domínio antes de criar squad ou strategy

> **Para quem é:** quem quer entender um domínio de verdade — não superficialmente — antes de criar agentes ou tomar decisões estratégicas.
> **Tempo de leitura:** 4 min.
> **O que você vai sair sabendo:**
> - O que o orache investiga e em que profundidade
> - Como o relatório alimenta o `@squad` e o `@product`

---

## Para que serve

Criar um squad de "marketing de conteúdo" sem entender como profissionais de marketing de conteúdo **realmente** pensam produz executores genéricos. O `@orache` investiga um domínio em profundidade — frameworks reais que experts usam, vocabulário insider, anti-padrões comuns, benchmarks de qualidade, vozes de referência — e salva um relatório que o `@squad` e outros agentes usam como fundação.

Você não é um motor de busca: você é um analista de domínio que usa busca como ferramenta.

---

## Quando invocar

- Antes de criar um squad para um domínio novo ou pouco familiar
- Quando `@squad` detecta que precisa de investigação antes de definir executores
- Quando você quer entender um mercado ou território antes de tomar decisões de produto
- Quando precisa de investigação parcial (só frameworks, ou só anti-padrões)

---

## Quando NÃO invocar

- Você já conhece bem o domínio — crie o squad diretamente
- Você precisa de pesquisa sobre uma pessoa específica — use o pipeline `@profiler-researcher`
- Você quer pesquisa de mercado para produto — o `@product` e o `@analyst` cobrem o necessário no contexto de features

---

## Os 3 modos de investigação

| Modo | Rodadas de busca | Quando usar |
|---|---|---|
| **Full (padrão)** | 3–7 | Domínio novo, squad que vai rodar muitas vezes |
| **Targeted** | 2–3 | Domínio parcialmente conhecido, enriquecimento específico |
| **Quick Scan** | 1–2 | Squad efêmero, prazo curto |

---

## As 7 dimensões investigadas

1. **Frameworks** — modelos mentais que profissionais realmente usam
2. **Anti-padrões** — erros comuns que insiders evitam
3. **Benchmarks de qualidade** — o que "bom" significa neste domínio
4. **Vozes de referência** — quem o domínio cita como autoridade
5. **Vocabulário** — termos insider vs termos genéricos
6. **Padrões estruturais** — como outputs são organizados neste campo
7. **Lacunas de conhecimento** — o que ainda não está documentado

---

## Diálogo típico

```
Você > @orache nutrição esportiva para atletas amadores

@orache > Iniciando investigação: nutrição esportiva (amadores).
          Modo: Full (7 dimensões). Estimativa: 4–5 rodadas.

@orache > Frameworks identificados:
          - Periodização nutricional (CHO cycling)
          - Janela anabólica (revisada: 2h, não 30min)
          - ISSN guidelines para amadores
          Anti-padrões:
          - Suplementar sem baseline de dieta
          - Replicar protocolo de atleta elite sem ajuste calórico
          Vocabulário-chave: macros, CHO, RPE, DEA, periodização...

@orache > Relatório completo salvo em:
          .aioson/context/orache-report-nutricao-esportiva.md
          Pronto para @squad usar como fundação.
```

---

## Saídas em disco

```
.aioson/context/orache-report-{slug}.md    ← relatório completo das 7 dimensões
```

---

## Como ele lê seu projeto

- `.aioson/context/project.context.md` — idioma e contexto do projeto
- Cache de pesquisas em `researchs/{slug}/summary.md` — se criado recentemente (< 7 dias), reutiliza em vez de rebuscar

---

## Opção `--help`

Uma ativação com `--help` (`/orache --help`) imprime um resumo rápido — o que faz, quando usar, chamada típica, o que produz, próximo agente — localizado no seu idioma, e para sem executar nada. Fonte: `.aioson/docs/agent-help.md`.

---

## Handoff típico

- **Vem de:** `@squad` (redirect automático) ou pedido direto do usuário
- **Vai para:** `@squad` — o relatório alimenta a definição dos executores

---

## Próximo passo

- Depois da investigação: [squad.md](./squad.md)
- Para investigação de persona: [profiler-researcher.md](./profiler-researcher.md)
