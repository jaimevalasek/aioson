# @deyvin — Pair programming e continuidade de sessão

> **Para quem é:** quem quer retomar uma feature em curso ou trabalhar em parceria com a IA numa tarefa conhecida.
> **Tempo de leitura:** 4 min.
> **O que você vai sair sabendo:**
> - Quando usar @deyvin em vez de @dev.
> - Como ele recupera contexto de uma sessão anterior.

Em correções de continuidade de uma feature rastreada, Deyvin valida primeiro se o protótipo pertence ao mesmo slug do PRD. Um protótipo de feature fechada é apenas histórico. Se o vínculo atual for `none`, Deyvin informa isso no chat e compara o comportamento aprovado com o código, os testes e o caminho real da aplicação; corrige somente um bug limitado e já definido, ou encaminha uma mudança de intenção para Product/DEV.

## Para que serve

Você estava implementando uma feature ontem. Fechou o editor. Hoje quer continuar. Mas você não quer re-explicar tudo para a IA — stack, o que foi feito, o que falta, por que tomou aquela decisão.

É exatamente isso que o `@deyvin` resolve. Ele lê `dev-state.md` e os artefatos da feature ativa antes de tocar em qualquer código, e entra no meio da conversa como se nunca tivesse saído. É o agente de **continuidade** — não de greenfield.

Também funciona como pair-programming clássico: você e ele trabalham juntos em pequenos passos validados, cada um confirmado antes do próximo.

Alias `@pair` é equivalente — mesmo agente, nome alternativo.

## Quando invocar

- Retomar feature que estava em andamento (`dev-state.md` existe com status `in_progress`).
- Corrigir ou polir uma fatia pequena já conhecida.
- Debugar um problema específico junto.
- Inspecionar código e entender o que está acontecendo antes de agir.
- Fazer ajustes rápidos sem abrir um fluxo de planejamento completo.

## Quando NÃO invocar

- Feature nova, greenfield, ou que mistura produto + UX + implementação → `@product` primeiro.
- Sessão de planejamento ampla → `@analyst` ou `@architect`.
- Você não sabe o que fazer → `@neo`.
- A feature precisa de testes sistemáticos completos → `@qa` ou `@tester`.

## Diálogo típico

```
Você > @deyvin

@deyvin > Lendo dev-state.md...
          Feature ativa: checkout-stripe
          Status: em andamento — 3/6 steps concluídos
          Último checkpoint: rota POST /checkout implementada, retorna session_id
          Próximo step: webhook handler para confirmação de pagamento

          Continuo de onde paramos?
Você > Sim, pode ir.

@deyvin > Lendo .aioson/context/features/checkout-stripe/spec.md...
          AC relevante para este step: "Stripe envia evento checkout.session.completed,
          sistema confirma pedido e envia email de confirmação."

          Vou criar src/webhooks/stripe.js. Antes: qual a lib de email configurada?
Você > nodemailer com template em emails/order-confirmed.html

@deyvin > Perfeito. Implementando...
          [código criado]
          Rodei smoke test manual. Funcionou. Atualizei dev-state.md (4/6).
          Próximo: testar com payload real do Stripe. Quer continuar agora?
```

## Saídas em disco

| Arquivo | O que atualiza |
|---|---|
| `.aioson/context/dev-state.md` | Status atualizado a cada checkpoint concluído |

O código implementado vai onde a spec determina (seus `src/`, `app/`, etc.).

## Como ele lê seu projeto

1. `.aioson/context/dev-state.md` — estado da sessão anterior (step atual, feature, próximos passos).
2. `.aioson/context/features/{slug}/spec.md` — ACs da feature ativa.
3. `.aioson/context/project.context.md` — stack e classificação.
4. `.aioson/docs/deyvin/continuity-recovery.md` — protocolo interno de recuperação de contexto.

## Comandos CLI relacionados

```bash
# Ver estado atual da implementação
cat .aioson/context/dev-state.md

# Iniciar sessão rastreada (aparece no dashboard)
npx @jaimevalasek/aioson live:start . --tool=claude --agent=deyvin --no-launch
```

## Opção `--help`

Uma ativação com `--help` (`/deyvin --help`, ou `/pair --help`) imprime um resumo rápido — o que faz, quando usar, chamada típica, o que produz, próximo agente — localizado no seu idioma, e para sem executar nada. Fonte: `.aioson/docs/agent-help.md`.

## Handoff típico

- **Vem de:** `@dev` (quando uma sessão fica incompleta) ou `@neo` (quando detecta `in_progress`).
- **Vai para:** `@qa` (quando a implementação está completa) ou `@sheldon` (se um trecho precisa de revisão profunda).

## Escopo — regra importante

`@deyvin` é deliberadamente estreito. Se você pedir algo grande (novo módulo, redesign amplo, mistura de escopos), ele rejeita e aponta o agente certo. Não é limitação — é proteção contra implementar a coisa errada.

## Próximo passo

- Implementação nova → [Mapa do ecossistema](../1-entender/mapa-do-ecossistema.md)
- Entender dev-state → [@dev](./dev.md) *(ficha em construção)*
- Termos como "feature ativa" e "dossier" → [Glossário](../1-entender/glossario.md)
