# Glossário AIOSON

> **Para quem é:** qualquer um lendo as outras docs e tropeçando em jargão.
> **Tempo de leitura:** consulta — leia o que precisar.
> **Como usar:** Ctrl+F é seu amigo.

Termos em ordem alfabética. Cada um tem **definição curta** + **exemplo concreto** + **onde ver mais**.

---

## Agente

**Definição:** um especialista virtual com prompt próprio, regras próprias e responsabilidade específica. Vive em `.aioson/agents/<nome>.md`.

**Exemplo:** `@dev` é o agente que implementa código. `@qa` é o que escreve testes. `@pentester` é o que tenta quebrar a feature de propósito.

**Como invocar:** digite `@nome` no seu cliente AI (Claude, Codex, Gemini, OpenCode) ou descreva a intenção em linguagem natural ("vamos implementar a feature").

---

## AIOSON

**Definição:** o framework em si. Um pacote npm (`@jaimevalasek/aioson`) que instala uma estrutura de agentes, regras e ferramentas no seu projeto.

**Exemplo:** rodando `npx @jaimevalasek/aioson init meu-app` cria a pasta `.aioson/` no seu projeto.

---

## AIOSON Cloud / aioson.com

**Definição:** o serviço hospedado para publicar e instalar squads, genomes e skills entre projetos.

**Exemplo:** você cria um squad de agentes para o domínio jurídico no seu projeto, roda `aioson system:publish`, e qualquer outro projeto pode rodar `aioson system:install <slug>`.

**Onde ver mais:** doc em construção em `5-referencia/aioson-com-store.md`.

---

## Artefato

**Definição:** qualquer arquivo que um agente cria ou atualiza como saída do seu trabalho.

**Exemplos:**
- `.aioson/context/project.context.md` — contexto do projeto (criado por `@setup`)
- `.aioson/context/features/<slug>/spec.md` — especificação de uma feature (criada por `@product`/`@analyst`)
- `.aioson/context/dossier/<slug>/` — dossier de feature (criado pelo agent-chain)

**Por que importa:** Artigo III da Constitution diz que trabalho importante deixa artefato. Sem artefato, o trabalho "não aconteceu" oficialmente.

---

## Brains

**Definição:** memória procedural de um agente — conhecimento estruturado em "nodes" (estilo Zettelkasten) que o agente carrega sob demanda.

**Exemplo:** o `@site-forge` tem brains com 14 nodes sobre como o `pt.squarespace.com` estrutura suas páginas, usados quando você pede um clone.

**Onde fica:** `.aioson/brains/<agente>/`.

---

## Briefing

**Definição:** documento pré-PRD que enquadra um problema antes de virar feature. Saída do agente `@briefing` (antigo `@cypher`).

**Exemplo:** você tem 5 anotações soltas sobre uma ideia. O `@briefing` as transforma num briefing estruturado com problema, hipóteses e *frames* de discovery.

---

## Classificação (MICRO / SMALL / MEDIUM)

**Definição:** o tamanho do projeto, calculado a partir de 3 fatores (tipos de usuário, integrações externas, regras de negócio). Define quanta cerimônia o workflow vai aplicar.

**Como funciona:**
- 0–1 ponto → **MICRO** (`@setup → @product → @dev`)
- 2–3 pontos → **SMALL** (`@setup → @product → @analyst → @architect → @dev → @qa`)
- 4–6 pontos → **MEDIUM** (workflow completo, todos os gates, todos os artefatos)

**Onde aparece:** `classification:` no frontmatter do `project.context.md`.

---

## Cliente AI

**Definição:** o programa onde você de fato conversa com a IA. AIOSON é agnóstico — funciona com vários.

**Suportados oficialmente:** Claude Code, Codex CLI, Gemini CLI, OpenCode.
**Funciona também via terminal:** VS Code, Cursor, Windsurf, JetBrains IDEs, Zed, Antigravity (qualquer um que abra um terminal).

**Onde ver mais:** `clientes-ai.md`.

---

## Committer

**Definição:** o agente `@committer` que gera mensagens de commit profissionais a partir do diff e do contexto.

**Exemplo:** depois de implementar uma feature, `@committer` lê o que mudou, propõe a mensagem, mostra um checkbox no terminal, e commita.

---

## Constitution

**Definição:** os 6 (atualmente 7, com Zero Trust) princípios em `.aioson/constitution.md`. Nenhum agente pode contradizer um artigo.

**Detalhe completo:** [Por que ele existe](./por-que-existe.md#os-6-princípios-da-constitution).

---

## Context Pack

**Definição:** um conjunto mínimo, curado, de arquivos que um agente lê para fazer o seu trabalho — em vez de varrer o projeto todo.

**Por que importa:** economiza janela de contexto. O `@dev` para uma feature de "adicionar campo no formulário" não precisa ler o projeto inteiro.

---

## Continuity (agent-chain-continuity)

**Definição:** o sistema que garante que, se uma sessão cair no meio de uma feature, a próxima sessão consegue retomar sem perder contexto. Implementado em fases (1 a 8) ao longo de Mar–Mai 2026.

**Componentes principais:** `dossier`, `dev-state.md`, `dev-resume`, `handoff-protocol.json` v2, drift detection.

---

## Design Skill

**Definição:** um skill especializado em um sistema visual (cores, tipografia, espaçamento, componentes). Pode ser um skill nativo ou um híbrido criado pelo `@design-hybrid-forge`.

**Exemplos prontos:** Clean SaaS UI, Aurora Command UI, Cognitive Core UI, Bold Editorial UI, Warm Craft UI, Glassmorphism UI, Neo Brutalist UI.

**Onde escolher:** durante o `aioson init`, no wizard.

---

## Dossier (Feature Dossier)

**Definição:** uma pasta `.aioson/context/dossier/<slug>/` que contém **tudo** sobre uma feature em curso: spec, plano, decisões, código tocado, índice de pesquisas, status.

**Por que importa:** é o ponto único para onde qualquer agente que entra na feature vai consultar. Substitui "vou reler o histórico inteiro".

**Comandos:** `aioson dossier:init`, `dossier:show`, `dossier:add-research`, `dossier:audit`.

---

## Genome

**Definição:** "DNA cognitivo" de uma persona — um YAML estruturado com traços de personalidade (DISC, Enneagram, Big Five, MBTI, HEXACO-H), estilo, tom, e instruções de advisor.

**Para que serve:** criar advisors (assistentes personalizados) que falam como uma pessoa específica. Exemplo: gerar um advisor "estilo Steve Jobs" para revisar pitch decks.

**Versão atual:** Genome 4.0 com `anchor_prompt`, `relations`, `hexaco_h`, `trait_interactions`.

**Onde ver mais:** `5-referencia/genome-4.0-spec.md` (em construção).

---

## Handoff

**Definição:** o momento em que um agente termina sua parte e passa para o próximo, deixando os artefatos prontos.

**Onde fica registrado:** `.aioson/context/handoff-protocol.json` (v2).

---

## Live Session

**Definição:** uma sessão "rastreada" — ou seja, um envelope que registra cada milestone no SQLite local para o dashboard mostrar.

**Comandos:** `aioson live:start`, `live:status`, `live:handoff`, `live:close`.

---

## Memory

**Definição:** a memória persistente do AIOSON. Recentemente ganhou uma camada de **active retrieval** — agentes podem buscar memórias relevantes, não só ler tudo.

**Onde fica:** `.aioson/memory/` (no projeto) e `~/.claude/projects/<hash>/memory/` (no usuário, para Claude Code).

---

## Neo

**Definição:** o agente `@neo` — roteador inteligente. Ele olha o estado do projeto e te diz qual agente faz sentido invocar agora.

**Quando usar:** quando você não sabe por onde continuar ("show project status", "where do I start?"). Recentemente ganhou catálogo completo do ecossistema e modo *ecosystem-inquiry*.

---

## Pentester

**Definição:** agente `@pentester` que faz revisão adversarial de segurança — varre OWASP Top 10, LLM Top 10, supply chain, e mapeia superfícies de ataque.

**Quando usar:** antes de publicar feature em produção, ou quando precisar de um audit point específico.

---

## Pipeline / Workflow

**Definição:** a sequência ordenada de agentes que o AIOSON aplica para uma feature, baseada na classificação.

**Comando central:** `aioson workflow:next .` — mostra qual agente é o próximo.

---

## Plan

**Definição:** documentos em `/plans/` (raiz do projeto) que descrevem uma execução planejada. Não são commitados (memória local).

**Para que servem:** planejar antes de executar; servem como "plano-semente" para features.

---

## Profiler (researcher / enricher / forge)

**Definição:** o pipeline em 3 etapas que cria um Genome a partir de uma pessoa pública.

1. `@profiler-researcher` — coleta material bruto.
2. `@profiler-enricher` — analisa cognitivamente.
3. `@profiler-forge` — gera o Genome 4.0 e o advisor.

---

## Project Pulse

**Definição:** arquivo `.aioson/context/project-pulse.md` — estado global vivo do projeto. Lido no início de cada sessão, atualizado no fim.

**Para que serve:** dar a qualquer agente entrante uma visão "o que está acontecendo neste projeto agora?".

---

## Rules

**Definição:** regras *hard* do projeto, em `.aioson/rules/*.md`. Ao contrário de instruções soltas no prompt, regras são lidas automaticamente por todos os agentes aplicáveis.

**Exemplo:** `security-baseline.md` declara os controles `SEC-SBD-01..08` que `@dev` e `@qa` consomem.

---

## Skill

**Definição:** um pacote plugável de instrução. Tipos:
- **Process skills** — metodologias (ex: `aioson-spec-driven`)
- **Design skills** — sistemas visuais (ex: `clean-saas-ui`)
- **Static skills** — conhecimento de domínio fixo
- **Dynamic skills** — geram instruções em tempo real

**Onde ficam:** `.aioson/skills/` no projeto, ou globalmente.

---

## Squad

**Definição:** um grupo de agentes customizados — feito sob medida para um domínio que o time padrão não cobre bem.

**Exemplo:** squad "compliance jurídico" com agentes `@regulator`, `@attorney`, `@auditor`, sob comando do `@squad`.

**Comandos:** `aioson squad:assemble`, `squad:agent-create`, `squad:refresh`.

---

## Tester

**Definição:** agente `@tester` — engenharia de testes sistemática para apps já implementados. Usa quando o `@qa` regular não basta (legacy, brownfield, lacunas em 3+ módulos).

**Recente:** ganhou *coverage quality tier* e *test smell audit*.

---

## Validator

**Definição:** agente `@validator` — valida tecnicamente uma feature contra o contrato de sucesso definido na spec, antes do close-out.

---

## Workflow

Ver **Pipeline / Workflow**.

---

## Zero Trust

**Definição:** Artigo VII da Constitution. Segurança não é uma "feature opcional" — é o estado padrão. Toda feature passa por checks automáticos do baseline.

---

Não achou um termo? Procure no [Mapa do ecossistema](./mapa-do-ecossistema.md) ou no [guia de agentes](../agentes.md).
