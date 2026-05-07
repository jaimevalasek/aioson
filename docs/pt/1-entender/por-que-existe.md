# Por que o AIOSON existe

> **Para quem é:** quem já usa IA para programar e quer entender o "porquê" do design.
> **Tempo de leitura:** 7 min.
> **O que você vai sair sabendo:** os 3 problemas que AIOSON resolve, e os 6 princípios da constitution.

---

## Os 3 problemas que motivaram o AIOSON

### Problema 1 — O prompt-monolito

Quando você abre uma IA e digita "monta um app SaaS de assinatura com Stripe, autenticação, painel admin e relatórios", está pedindo para ela ser **tudo ao mesmo tempo**: Product Manager, arquiteta, designer, dev backend, dev frontend, QA, especialista em segurança.

Resultado típico:
- Decisões importantes são tomadas implicitamente, sem você perceber.
- A IA escolhe a primeira biblioteca que lhe vem à cabeça em vez da que faz sentido.
- Quando você pede ajuste, ela refaz três coisas que já estavam OK.
- Não dá para auditar: por que ela escolheu Postgres? Quando? Você não consegue achar.

**Como AIOSON resolve:** divide o monolito em agentes especialistas. Cada um tem foco estreito, regras próprias, e produz um artefato verificável antes de passar adiante.

### Problema 2 — A amnésia entre sessões

Você programa uma feature por 2 horas com a IA, vai dormir, volta no dia seguinte. A IA "lembra" o quê?

- Em IDEs sem memória persistente: **nada**.
- Em IDEs com memória: um resumo aproximado, geralmente apagando os "porquês".

**Como AIOSON resolve:** decisões e contexto viram **artefatos em disco** (`project.context.md`, `spec.md`, `dossier.md`, `dev-state.md`, `project-pulse.md`). A próxima sessão lê esses arquivos antes de qualquer coisa. É memória externa, não memória interna do modelo.

### Problema 3 — Inconsistência no time

Em time, cada pessoa tem um estilo de prompt. Cada IA cliente (Claude, Codex, Gemini) responde diferente. O resultado é um codebase costurado por estéticas e padrões diferentes.

**Como AIOSON resolve:**
- Os mesmos agentes (`.aioson/agents/`) são lidos por **qualquer** cliente AI.
- Regras de projeto (`.aioson/rules/`) e governança (`.aioson/constitution.md`) são compartilhadas no Git.
- Quem entra no time herda automaticamente o "como aqui se trabalha".

---

## Os 6 princípios da Constitution

AIOSON é governado por seis artigos que **nenhum agente pode sobrescrever**. Eles vivem em `.aioson/constitution.md` e são citados pelos agentes quando precisam justificar uma decisão.

### Artigo I — Spec First
> Features começam como especificação, não como código. Implementação sem artefato de spec é exploração, não desenvolvimento.

**Tradução prática:** o `@dev` se recusa a implementar antes de ler uma spec. Isso evita que você acorde com 800 linhas de código que resolvem o problema errado.

### Artigo II — Right-Sized Process
> MICRO, SMALL e MEDIUM não recebem a mesma profundidade de processo. Aplicar cerimônia de MEDIUM num projeto MICRO desperdiça mais do que protege.

**Tradução prática:** a IA não vai te pedir um PRD de 30 páginas para um script de 50 linhas. Cada classificação tem o seu fluxo próprio.

### Artigo III — Observable Work
> Ações importantes deixam artefatos visíveis ou sinais em runtime. Trabalho que existe só no histórico de conversa é trabalho que pode se perder.

**Tradução prática:** se um agente toma uma decisão importante, ela aparece num arquivo. Você pode revisar, vetar, voltar atrás.

### Artigo IV — Testable Behavior
> Critérios de aceitação devem ser verificáveis independentemente. "Funciona corretamente" não é um critério. "Retorna 403 quando o usuário A acessa o recurso do usuário B" é.

**Tradução prática:** o `@qa` rejeita ACs vagos. Você é forçado a ser específico antes de aprovar.

### Artigo V — Clean Handoffs
> Artefatos devem ser auto-suficientes para o próximo agente começar sem reler toda a cadeia. Se o próximo agente precisar perguntar "por onde começo?", o handoff falhou.

**Tradução prática:** o `dossier` de uma feature inclui tudo: spec, decisões, código tocado, status. Quando o `@dev` passa para o `@qa`, o `@qa` não precisa entrevistar o `@dev`.

### Artigo VI — Simplicity Over Ceremony
> Não adicione camadas, arquivos ou workflows a menos que reduzam ambiguidade lá na frente. Três linhas parecidas são melhor do que abstração prematura. Uma spec bem escrita é melhor do que cinco artefatos finos.

**Tradução prática:** AIOSON luta o tempo todo contra a tentação de adicionar burocracia. **"Small project, small solution"** é o lema oficial.

### Artigo VII — Zero Trust by Default
> Segurança é baseline, não feature. Todo agente técnico (`@analyst`, `@architect`, `@dev`, `@qa`) consome o baseline declarado em `.aioson/rules/security-baseline.md`, com controles ID-versionados (`SEC-SBD-01..08`) que ninguém pode silenciosamente enfraquecer.

**Tradução prática:** o `@dev` automaticamente sabe que precisa sanitizar input, validar autorização, redijir secrets. Não é um pedido extra seu — é o padrão.

---

## A regra de ouro

Acima dos 6 artigos paira uma frase que aparece em quase todo prompt do AIOSON:

> **Small project, small solution.**
> Projeto pequeno, solução pequena.

Se você tem que escolher entre um agente fazer mais coisas ou menos coisas — sempre menos. Se tem que escolher entre criar um artefato a mais ou se virar com o que já existe — sempre se virar. AIOSON é proativamente preguiçoso, e isso é uma feature.

---

## E o que NÃO está coberto pelos princípios

- **Estilo de código pessoal.** AIOSON não tem opinião sobre tabs vs spaces, eslint config, etc. Isso fica nas suas regras (`.aioson/rules/`).
- **Stack tecnológico.** Os agentes detectam o stack do projeto e se adaptam. AIOSON funciona em Node, Python, Go, Rust, PHP, Ruby, etc.
- **Vendor lock-in.** Funciona com qualquer cliente AI que leia arquivos `.md` no projeto.

---

## Próximo passo

- Ver o time inteiro mapeado: [Mapa do ecossistema](./mapa-do-ecossistema.md)
- Vocabulário completo: [Glossário](./glossario.md)
- Pôr em prática: [Primeiro projeto do zero](../2-comecar/primeiro-projeto.md)
