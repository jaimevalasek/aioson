# @neo — Roteador: "o que faço agora?"

> **Para quem é:** quem está perdido num projeto em curso ou retomando após pausa.
> **Tempo de leitura:** 3 min.
> **O que você vai sair sabendo:**
> - Quando usar @neo e o que ele mostra.
> - Como ele decide qual agente é o próximo.

## Para que serve

Você abre um projeto que ficou parado alguns dias. Qual o próximo passo? O que foi feito? Qual feature está em curso? Qual agente deve entrar agora?

Essas perguntas têm resposta nos artefatos do projeto — mas encontrá-la manualmente consome tempo. O `@neo` faz isso por você: lê `project-pulse.md`, `dev-state.md`, as specs das features ativas, e devolve um diagnóstico em segundos, com o caminho claro.

Ele não implementa, não produz artefatos. Só orienta e roteia.

## Quando invocar

- "Onde paramos?" — após qualquer pausa no projeto.
- "Qual o próximo agente?" — quando você não lembra o fluxo.
- "O projeto está bloqueado?" — para diagnosticar impedimentos.
- Quer ver o estado geral antes de decidir o que fazer.
- Quer um catálogo de todos os agentes disponíveis (modo ecosystem-inquiry).

## Quando NÃO invocar

- Você sabe exatamente qual agente precisa e está prontos os artefatos — vá direto.
- Quer implementar continuidade — `@deyvin` é o caminho.
- Quer ver o mapa estático de agentes — `1-entender/mapa-do-ecossistema.md` já faz isso.

## Diálogo típico

```
Você > @neo

@neo > Lendo project-pulse.md...
       Projeto: loja-artesanal (SMALL, pt-BR)
       Feature ativa: checkout-stripe (fase: @dev em andamento)
       Último agente: @dev (ontem, 14h32)
       dev-state.md: 3/6 steps concluídos, próximo: implementar webhook Stripe

       Estado:
       ✓ product — spec criada
       ✓ analyst — domain map OK
       ✓ architect — decisões registradas
       → dev — EM ANDAMENTO (retomar com @deyvin)
       · qa — pendente
       · validator — pendente

       Recomendação: @deyvin para retomar a implementação.
       Alternativas: @sheldon (revisar spec antes), @pentester (audit antecipado).

       O que prefere?
```

## Saídas em disco

Nenhuma. `@neo` é somente leitura — ele não escreve artefatos.

## Como ele lê seu projeto

Nesta ordem:

1. `.aioson/context/project-pulse.md` — estado global e última atividade.
2. `.aioson/context/dev-state.md` — se @dev ou @deyvin tinham sessão ativa.
3. `.aioson/context/project.context.md` — classificação e stack.
4. `.aioson/context/features.md` e specs das features ativas.
5. Arquivos de presença (`prd.md`, `discovery.md`, `architecture.md`) para inferir qual fase do workflow está completa.

## Comandos CLI relacionados

```bash
# Ver próximo agente no workflow
npx @jaimevalasek/aioson workflow:next .

# Ver estado de memória recente (5 últimos eventos)
npx @jaimevalasek/aioson memory:summary . --last=5
```

## Handoff típico

- **Vem de:** qualquer ponto — @neo é válido em qualquer momento.
- **Vai para:** o agente que ele recomendar.

## Detalhes recentes

Em Mai/2026 (commit `5fbbef3`), o @neo recebeu um catálogo completo do ecossistema de agentes e um novo **modo ecosystem-inquiry**: você pode perguntar "quais agentes de segurança existem?" ou "o que faz o @briefing?" e ele explica, sem precisar abrir arquivos.

## Próximo passo

- Ver o ecossistema completo → [Mapa do ecossistema](../1-entender/mapa-do-ecossistema.md)
- Retomar implementação → [@deyvin](./deyvin.md)
- Entender project-pulse → [@setup](./setup.md)
