# [Arquivado] Deyvin

> **Esta doc foi substituída.**
> A ficha do `@deyvin` agora vive em [`../4-agentes/deyvin.md`](../4-agentes/deyvin.md) com diálogo típico, saídas em disco e handoff.
> Conteúdo abaixo preservado para referência histórica.

---

# Deyvin

> Guia focado no agente `@deyvin`, o companheiro tecnico de continuidade do AIOSON.

## O que e

`@deyvin` e o agente de continuidade e pair programming do AIOSON. Ele existe para ajudar quando voce quer retomar trabalho sem abrir um fluxo completo de produto, descoberta ou arquitetura.

O foco dele nao e decidir a visao do produto nem desenhar a arquitetura inteira. O foco e continuar, corrigir, diagnosticar e implementar em passos pequenos, usando a memoria viva do projeto como ponto de partida.

## Para que serve

Use `@deyvin` quando precisar de apoio em situacoes como:

- continuar uma sessao anterior sem perder contexto
- entender o que foi feito recentemente
- revisar tasks, runs e logs do runtime do projeto
- olhar `spec.md`, `spec-current.md`, `spec-history.md` e o `context-pack.md` antes de tocar no Git
- corrigir bugs pequenos e pontuais
- implementar ajustes incrementais com validacao a cada passo
- destravar um lote pequeno de trabalho antes de escalar para outro agente

## Como ele auxilia

O `@deyvin` ajuda de forma pratica:

1. Lendo primeiro a memoria do projeto.
2. Checando `rules` e docs relevantes.
3. Consultando o runtime SQLite quando existir historico recente.
4. Resumindo o estado atual para voce.
5. Propondo o menor proximo passo util.
6. Executando a correcao ou implementacao em lotes pequenos.
7. Fazendo handoff quando perceber que o trabalho ficou grande demais.

## Ordem de leitura

Quando o `@deyvin` entra em acao, a ordem mental e esta:

1. `project.context.md`
2. `.aioson/rules/`
3. `.aioson/docs/`
4. `context-pack.md`, quando existir
5. `memory-index.md`
6. `spec-current.md` e `spec-history.md`
7. `spec.md`
8. `features.md` e artefatos da feature em andamento
9. `skeleton-system.md`, `discovery.md` e `architecture.md`
10. runtime SQLite
11. Git apenas como fallback

Essa ordem evita que o agente releia o projeto inteiro quando ja existe memoria suficiente.

## O que ele nao faz

`@deyvin` nao substitui:

- `@product` para abrir feature nova ou consolidar PRD
- `@discovery-design-doc` quando a demanda ainda esta vaga
- `@analyst` quando faltam regras, entidades ou discovery brownfield
- `@architect` quando a arquitetura precisa ser formalizada
- `@ux-ui` quando a direcao visual precisa de definicao
- `@dev` quando a implementacao deve seguir o fluxo tecnico completo
- `@qa` quando a tarefa pede uma revisao formal de risco e teste

## Alias compativel

O nome oficial e `@deyvin`.
O alias `@pair` continua aceito por compatibilidade.

## Exemplos de uso

```text
@deyvin ve o que foi feito ontem e vamos continuar
@deyvin revisa o runtime e me diga onde paramos
@deyvin corrige esse bug pequeno comigo
@deyvin leia as rules ativas e os docs relacionados antes de agir
```

## Sessao viva rastreada

Quando voce entrar por `aioson live:start`, o `@deyvin` deve continuar trabalhando na mesma `session_key` e registrar apenas marcos compactos:

```bash
aioson live:start . --tool=codex --agent=deyvin --plan=plan.md --no-launch
aioson runtime:emit . --agent=deyvin --type=task_started --title="Corrigir modal de estoque"
aioson runtime:emit . --agent=deyvin --type=task_completed --summary="Corrigi o modal de estoque" --refs="src/app.js,src/styles.css"
aioson live:handoff . --agent=deyvin --to=product --reason="Escopo exige decisao de produto"
```

Nesse modo, o `@deyvin` nao deve abrir uma sessao paralela de `runtime:session:*`. O agente ativo passa a ser trocado por `live:handoff`, o status fica disponivel em `live:status` e o fechamento final fica em `live:close`.


## Quando escolher ele

Escolha `@deyvin` quando:

- voce quer velocidade sem perder contexto
- o problema e pequeno ou ainda esta sendo entendido
- voce quer trabalhar como se tivesse um colega sênior do lado
- o objetivo principal e continuar, nao planejar do zero

## Quando nao escolher ele

Nao escolha `@deyvin` quando:

- a feature ainda nao esta clara
- existe uma descoberta maior para fazer
- a arquitetura ainda esta indefinida
- a conversa precisa virar PRD, discovery ou plano formal
- o pedido abre um projeto novo ou greenfield para construir um sistema inteiro
- o prompt mistura mais de um produto, muda a identidade do sistema no meio do texto ou junta varios modulos centrais de uma vez

Nesses casos, o comportamento correto e handoff imediato. `@deyvin` nao deve "ir codando para ajudar" quando o escopo ainda precisa ser enquadrado.

Nesses casos, o caminho certo e acionar o agente especializado antes.
