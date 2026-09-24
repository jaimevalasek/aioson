# O que é o AIOSON

> **Para quem é:** quem ainda não usou.
> **Tempo de leitura:** 5 min.
> **O que você vai sair sabendo:** o que é AIOSON, o que ele faz por você, e quando *não* usar.

---

## Em uma frase

AIOSON transforma uma única IA genérica num **time de especialistas que se revezam** durante o seu projeto, cada um focado em uma etapa, com regras claras de quando começar e quando passar a tarefa para o próximo.

## A analogia da orquestra

Imagine que você quer construir uma casa.

**Sem AIOSON:** você contrata um único profissional super-genérico e diz "faz minha casa". Ele tenta ser arquiteto, pedreiro, eletricista, encanador e fiscal de obra ao mesmo tempo. Às vezes acerta. Frequentemente esquece detalhes. Quando algo dá errado, ele não lembra mais por que tomou a decisão de duas horas atrás.

**Com AIOSON:** você tem uma equipe.

A esteira principal é sempre a mesma, e cada fase só entrega quando tem prova:

- O **Briefing** ouve sua ideia ainda crua (a "conversa de bar") e devolve um briefing estruturado, com fontes preservadas, promessas numeradas e o que ainda é dúvida — *antes* de virar projeto.
- O **Refiner** monta a maquete: um protótipo navegável com as telas e os estados reais. Você caminha por ele e só então aprova. A planta chega antes do concreto.
- O **Product** converte o que você aprovou no PRD: o que o morador precisa poder fazer, com critério verificável e o que fica explicitamente fora.
- O **Sheldon** revisa o PRD como um arquiteto sênior que já viu de tudo: confronta com as fontes, com o protótipo e com o seu código real, corrige lacuna e contradição no próprio arquivo, e sela.
- O **Planner** corta a obra em etapas verticais — arquivos exatos, risco e check em cada uma.
- O **Dev** constrói, etapa por etapa, pela rota real do produto.
- O **QA** vistoria — e o veredito é independente de quem construiu.
- O **Tester** amplia a cobertura para proteger o que já foi entregue.
- O **Pentester** testa as fechaduras: ataca a superfície com autorização, corrige e ataca de novo.

Fora da esteira ficam os consultores que você chama quando precisa: **Analyst** (o que já existe no terreno), **Architect** (qual estrutura escolher), **UX-UI** (uma decisão de interação que o protótipo não resolveu). Eles respondem uma pergunta nomeada e vão embora — não são etapas obrigatórias.

E o próprio **Dev** também é o empreiteiro que retoma a obra quando você volta de viagem: lê o que está confirmado, marca o que é só inferência, e segue um passo pequeno de cada vez sem você precisar re-explicar nada. Para mudanças pequenas, ele resolve sozinho pela rota curta. No fim, o **Committer** escreve a ata da reforma (mensagem de commit).

Cada um sabe quando entrar, quando sair, e que documento entregar para o próximo. Você fala com qualquer um deles digitando `@nome` no seu cliente AI.

> Esteira completa, em uma linha:
> `@briefing → @refiner → @product → @sheldon → @planner → @dev → @qa → @tester → @pentester`
> Detalhe fase a fase no [Mapa do ecossistema](./mapa-do-ecossistema.md#a-esteira-principal).

## O que isso muda na prática

| Sem AIOSON | Com AIOSON |
|---|---|
| Um prompt enorme tentando fazer tudo | Vários prompts menores, cada um com escopo claro |
| A IA "esquece" decisões antigas no meio do trabalho | Decisões viram **artefatos em disco** (specs, dossiers, planos) |
| Você reescreve do zero quando troca de sessão | A próxima sessão lê os artefatos e continua de onde parou |
| Difícil voltar e auditar o que foi feito | Cada agente deixa um rastro: o que decidiu, por quê, com base em quê |
| Time grande discorda do estilo de cada IA | Toda equipe usa o mesmo conjunto de agentes e regras |

## O que AIOSON instala no seu projeto

Quando você roda `aioson init`, ele cria:

```
seu-projeto/
├── .aioson/
│   ├── agents/              ← os prompts de cada especialista
│   ├── config.md            ← regras do projeto (tamanho, idioma, stack)
│   ├── constitution.md      ← os 6 princípios que ninguém quebra
│   ├── context/             ← contexto vivo: project.context.md, project-pulse.md
│   ├── rules/               ← regras hard que agentes seguem (segurança, etc.)
│   ├── skills/              ← pacotes plugáveis (design systems, processos)
│   └── runtime/             ← telemetria local (SQLite)
├── .claude/  .codex/                         ← configuração nativa dos clientes
├── CLAUDE.md  AGENTS.md  OPENCODE.md         ← instruções por cliente
└── docs/                                      ← documentação opcional
```

Você abre seu cliente AI favorito e digita `@setup`, `@product`, `@dev` etc. — e os agentes assumem.

## Cabe em qualquer cliente AI

Funciona com **qualquer IDE que tenha um terminal**:

- Claude Code · Codex CLI · OpenCode
- VS Code, Google Antigravity, Cursor, Windsurf, JetBrains, Zed (com qualquer um dos clientes acima)

Os agentes são *prompts*, não plugins. Eles vivem em arquivos `.md` e o cliente AI os lê quando você invoca via `@nome`.

## Quando AIOSON brilha

- **Projetos onde decisões importam** — você quer rastreio, não improviso.
- **Times** — vários humanos e várias IAs precisam ler a mesma narrativa.
- **Sessões longas ou retomadas** — você precisa parar hoje e voltar amanhã sem perder contexto.
- **Quando você quer especialização** — segurança séria, UX cuidado, testes sistemáticos.

## Quando *não* usar AIOSON

- **Script de 20 linhas** que vai rodar uma vez. Use prompt direto, sem cerimônia.
- **Você quer experimentar livremente** uma ideia em 5 minutos. AIOSON pede setup primeiro.
- **Você não vai abrir o projeto de novo.** O valor está justamente em sessões repetidas.

Para esses casos, o próprio AIOSON tem um caminho leve — o **Simple Plan**, em que o `@dev` confirma o escopo, registra um plano mínimo, implementa a menor fatia útil e fecha com a verificação combinada. Sem PRD, sem esteira. Se o escopo crescer no meio, a rota escala sozinha para a esteira completa. Mas se nem o Simple Plan for adequado, não force.

## Próximo passo

- Quer entender *por que* AIOSON foi feito desse jeito? → [Por que ele existe](./por-que-existe.md)
- Quer ver o time todo de relance? → [Mapa do ecossistema](./mapa-do-ecossistema.md)
- Quer começar agora? → [Primeiro projeto do zero](../2-comecar/primeiro-projeto.md)
