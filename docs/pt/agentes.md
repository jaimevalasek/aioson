# Guia de Agentes

> **Versão tabular alternativa (legado).** Para fichas individuais detalhadas com diálogos, saídas em disco e handoff, veja [`4-agentes/README.md`](./4-agentes/README.md).

> `@pair` é alias de `@deyvin` e não possui ficha separada.

> Quando usar cada agente, o que ele entrega e como ativá-lo.

---

## Visão geral

O AIOSON tem agentes oficiais de projeto e também pode criar agentes de squad. Você não precisa usar todos — use apenas os que o contexto pede.

```
@setup        ← sempre o primeiro
@product      ← gera o PRD base vivo e roteia o fluxo
@deyvin       ← companheiro tecnico para continuidade e pequenas implementacoes
@discovery-design-doc ← quando precisa clarear escopo e gerar design doc vivo
@analyst      ← projetos SMALL e MEDIUM
@scope-check  ← valida alinhamento antes de codar ou depois de fix relevante
@architect    ← projetos SMALL e MEDIUM
@ux-ui        ← UI/UX quando há interfaces (SMALL e MEDIUM)
@pm           ← apenas MEDIUM
@orchestrator ← apenas MEDIUM
@pentester    ← revisao adversarial e seguranca antes do fechamento (MEDIUM)
@dev          ← sempre o último antes do QA
@qa           ← projetos SMALL e MEDIUM
@tester       ← engenharia de testes e cobertura sistematica
@squad        ← cria squads especializados no projeto
@genome       ← cria genomes de domínio reutilizáveis

# Agentes especializados (uso sob demanda)
@committer          ← gera mensagens de commit semanticas
@copywriter         ← copy para paginas e estrategia de conversao
@briefing           ← transforma plans em briefings estruturados
@design-hybrid-forge ← cria skills hibridas de design
@discover           ← descobre o sistema e mapeia conhecimento
@neo                ← guia de inicio, status e proximos passos
@orache             ← pesquisa de mercado e competidores
@profiler-researcher  ← pesquisa perfil/DNA mental
@profiler-enricher    ← enriquece perfil cognitivo
@profiler-forge       ← gera advisor da persona (genome 3.0)
@site-forge          ← clona/rebuild de sites com skill
@validator           ← valida entregaveis e contratos
```

> **Nota sobre estrutura de arquivos (v1.7.3+):** Os manifests dos agentes (arquivos `.manifest.json`) foram movidos para `.aioson/agents/manifests/` para reduzir clutter no diretório de agentes. Os arquivos `.md` de instrução continuam em `.aioson/agents/`. Isso facilita a navegação e separa metadados de prompts.

> Para o fluxo completo de `@squad` e `@genome`, veja também [Squad e Genome](./4-agentes/squad.md).
> Para criar agentes customizados (my-agents e squad agents), veja [Agentes Customizados](./4-agentes/squad.md).
> Para uma explicação focada no agente de continuidade, veja também [Deyvin](./4-agentes/deyvin.md).

## Fluxo brownfield apos scan

Quando o projeto ja existe e voce roda `scan:project`, o handoff correto agora e:

```text
scan:project -> @analyst -> @scope-check -> @architect -> @dev
```

Regras do fluxo:
- os artefatos locais do scan (`scan-index.md`, `scan-folders.md`, `scan-<pasta>.md`, `scan-aioson.md`) servem como mapas brutos do codigo
- `discovery.md` continua sendo a memoria comprimida que os agentes usam para entender o sistema sem reler tudo
- esse `discovery.md` pode ser gerado por `scan:project --with-llm` ou pelo `@analyst` usando os artefatos locais do scan
- `@architect`, `@ux-ui`, `@pm`, `@qa` e o fluxo de `@dev` nao devem pular direto dos mapas brutos para a execucao quando a tarefa depende do comportamento atual do sistema
- para continuidade de sessao, pequenas correcoes e implementacoes guiadas, `@deyvin` pode entrar depois que a memoria minima estiver pronta

---

## @setup

**Quando usar:** Sempre. É o primeiro agente de qualquer projeto.

**O que faz:**
- Lê `.aioson/context/project.context.md`
- Confirma stack, classificação e idioma
- Define o plano de execução (quais agentes serão usados)
- Orienta o desenvolvedor sobre os próximos passos
- Recomenda `@discovery-design-doc` quando houver ambiguidade, feature grande ou risco alto, mas sem tornar isso obrigatório

**Como ativar:**
```
/aioson:agent:setup
```

**O que ele pergunta:**
- O que o projeto precisa fazer e quem vai usar (sem pressuposições)
- Detecta a stack automaticamente — se não reconhecer, pergunta e registra o que o usuário descrever
- Confirma framework, classificação e idioma antes de finalizar

> **Qualquer stack funciona.** @setup não força um framework da lista. Se você usa Django, Go, Rust,
> FastAPI, SvelteKit ou qualquer outra tecnologia, ele registra o que você descrever.

**Entrega:**
- Confirmação do plano de agentes
- Resumo do contexto do projeto
- Geração opcional do `spec.md` (documento vivo para acompanhar o projeto entre sessões)

**Regra importante:**
- `@setup` continua sendo o primeiro agente
- `@discovery-design-doc` entra como recomendação contextual, não como etapa obrigatória
- se o pedido já estiver claro e pequeno, o fluxo pode seguir direto para `@dev`, `@analyst` ou `@architect`
- se o usuário pedir o painel local do AIOSON, o fluxo correto agora é:
  - abrir o app do dashboard já instalado no computador
  - clicar em criar/adicionar projeto
  - selecionar a pasta do projeto que já contém `.aioson/`

---

## @product

**Quando usar:** Depois do `@setup` em projetos novos. Em features novas de projeto existente, pode entrar direto sem repetir `@setup`.

**O que faz:**
- varre a raiz do projeto em busca de documentos de entrada (`plans/*.md`, `prds/*.md`) antes de iniciar a conversa
- conduz a conversa de produto e gera o `PRD base`
- registra visão, problema, usuários, escopo inicial e perguntas em aberto
- detecta sinais visuais cedo e preserva a intenção no PRD
- faz classificação preliminar do escopo
- aponta o próximo agente do fluxo
- em brownfield, usa `discovery.md` quando já existir e trata os artefatos locais do scan apenas como orientação estrutural, nunca como substituto do `@analyst`

**Documentos de kickoff (plans/ e prds/ na raiz):**

Você pode criar arquivos de entrada na raiz do projeto antes de ativar o `@product`:

```
plans/minha-ideia.md     ← notas, esboços, planos escritos por você
prds/visao-produto.md    ← rascunhos de requisitos, referências
```

O `@product` detecta esses arquivos automaticamente e pergunta se deve usá-los como fonte. Se sim, ele sintetiza o conteúdo e gera o PRD formal em `.aioson/context/`. Os arquivos originais nunca são modificados — você pode deletá-los depois que o PRD estiver gerado.

**Sinal de greenfield vs feature:**
- `plans/*.md` ou `prds/*.md` existem + `prd.md` ainda não existe → kickoff de projeto novo
- `plans/*.md` ou `prds/*.md` existem + `prd.md` já existe → nova feature ou refinamento

**Como ativar:**
```
/aioson:agent:product
```

**Entrega:** Arquivo `.aioson/context/prd.md` ou `.aioson/context/prd-{slug}.md` com:
- visão e problema do produto
- usuários e escopo inicial do MVP
- fluxos principais
- métricas de sucesso
- perguntas em aberto
- identidade visual inicial, quando houver sinal suficiente
- `## Specify depth` (projetos SMALL e MEDIUM) — classificação aplicada, profundidade de spec escolhida e lista de ambiguidades que devem ser resolvidas antes que `@analyst` avance

> Se o pedido mencionar explicitamente um command center premium, control tower, tri-rail shell ou estilo AIOS Dashboard, o `@product` deve registrar a skill `premium-command-center-ui` na seção de identidade visual do PRD.

---

## @deyvin

**Quando usar:** Quando voce quer continuar uma sessao anterior, entender o que foi feito por ultimo, corrigir uma tarefa pequena, investigar um bug ou implementar em modo colaborativo.

**O que faz:**
- atua como um companheiro tecnico de continuidade
- le primeiro a memoria do projeto e o runtime antes de ir ao Git
- verifica sempre `.aioson/rules/` e os docs apontados por essas rules
- resume o que ja esta confirmado sobre o estado atual
- pergunta o que voce quer fazer agora
- toca passos pequenos de implementacao, correcao e validacao
- encaminha para `@product`, `@discovery-design-doc`, `@analyst`, `@architect`, `@ux-ui`, `@dev` ou `@qa` quando a tarefa sair do modo pair

**Ordem mental de contexto do `@deyvin`:**
1. `project.context.md`
2. `.aioson/rules/`
3. `.aioson/docs/`
4. `context-pack.md` quando existir e combinar com a tarefa
5. `memory-index.md`
6. `spec-current.md` + `spec-history.md`
7. `spec.md`
8. `features.md` e artefatos da feature em andamento, se houver
9. `skeleton-system.md`, `discovery.md`, `architecture.md`
10. runtime SQLite
11. Git como fallback

**Como ativar:**
```
/aioson:agent:deyvin
```

Alias compativel:
```text
/aioson:agent:pair
```

**Exemplos bons de uso:**
```text
@deyvin ve o que fizemos ontem e vamos continuar
@deyvin revisa as ultimas tasks do runtime e me diga onde paramos
@deyvin vamos corrigir esse bug pequeno juntos
@deyvin leia as rules ativas, veja os docs relacionados e ajuste esse fluxo
```

**Entrega esperada:**
- resumo curto do ultimo contexto confirmado
- proximo passo pequeno e objetivo
- implementacao/correcao em lote pequeno
- atualizacao de `spec.md` ou `spec-{slug}.md` quando fizer sentido

**Regra importante:**
- `@deyvin` nao substitui discovery, produto ou arquitetura formal
- quando a demanda cresce demais ou fica vaga, ele deve fazer handoff em vez de fingir que tudo cabe numa sessao de continuidade
- se o pedido abrir projeto novo, greenfield, feature grande, escopo contraditorio ou misturar produto + UX + implementacao, o `@deyvin` deve fazer handoff imediato e nao comecar a codar
- se voce quiser uma explicacao mais direta e focada no uso dele, consulte [Deyvin](./4-agentes/deyvin.md)

---

## @analyst

**Quando usar:** Projetos SMALL e MEDIUM, antes de @architect.

**O que faz:**
- Fase 1 (Discovery): Faz 6 perguntas de descoberta para entender o domínio
- Fase 2 (Modelagem): Mapeia entidades, atributos e regras de negócio
- Fase 3 (Análise): Produz tabela de entidades com campos e tipos
- Identifica integrações externas e riscos
- Em modo feature, passa a consumir `design-doc.md` e `readiness.md` quando já existirem
- Usa skills e documentos sob demanda para evitar reabrir discovery desnecessária
- em brownfield, pode gerar `discovery.md` diretamente a partir de `scan-index.md`, `scan-folders.md`, `scan-<pasta>.md` e `scan-aioson.md`, mesmo sem API configurada no `aioson`

**Como ativar:**
```
/aioson:agent:analyst
```

**Exemplo de perguntas que ele faz:**
```
1. Quem são os usuários e quais são seus objetivos principais?
2. Qual é o fluxo principal que gera valor para o negócio?
3. Existe algum processo manual hoje que este sistema vai substituir?
4. Quais são as regras de negócio mais críticas?
5. Há integrações com sistemas externos?
6. Quais dados são mais sensíveis ou críticos?
```

**Entrega:** Arquivo `.aioson/context/discovery.md` com:
- Mapa de entidades e atributos
- Tabela de campos com tipo e restrições
- Integrações mapeadas
- Riscos identificados
- Referências visuais (wireframes, links)

Em **modo feature**, entrega adicionalmente:
- `requirements-{slug}.md` — regras de negócio com IDs rastreáveis (`REQ-{slug}-N`) e acceptance criteria verificáveis por QA (`AC-{slug}-N`)
- `spec-{slug}.md` — esqueleto de memória da feature, com `phase_gates` no frontmatter para que `@dev` e `@deyvin` saibam quais fases já foram aprovadas

---

## @discovery-design-doc

**Quando usar:** Quando a demanda ainda está vaga, quando você quer um `design-doc.md` vivo antes de implementar, ou quando precisa medir se o contexto já está pronto para planejamento/execução.

**O que faz:**
- transforma briefing bruto em problema claro
- identifica o que já está definido e o que ainda falta
- produz `.aioson/context/design-doc.md`
- produz `.aioson/context/readiness.md`
- detecta `modo projeto` ou `modo feature`
- recomenda skills e documentos sob demanda para a próxima etapa
- recomenda o próximo agente ou documento do fluxo

**Como ativar:**
```
/aioson:agent:discovery-design-doc
```

**Entrega:**
- `design-doc.md` com objetivo, escopo, fora de escopo, módulos afetados, integrações, riscos, decisões e critérios de aceite
- `readiness.md` com score objetivo por dimensão, nível de prontidão e próximo passo recomendado

**Quando preferir este agente ao @analyst:**
- quando o problema ainda está ambíguo
- quando você precisa de um documento vivo de decisão antes de modelar tudo
- quando a dúvida principal é escopo e prontidão, não modelagem profunda de entidades
- quando o projeto já existe e você quer planejar uma feature grande sem sair codando cedo demais

**Quando preferir @analyst:**
- quando o problema principal é domínio, entidades, regras de negócio e modelagem de dados

---

## @architect

**Quando usar:** Após @analyst, em projetos SMALL e MEDIUM.

**O que faz:**
- Escolhe a estrutura de pastas proporcional ao tamanho do projeto
- Documenta decisões técnicas (banco de dados, autenticação, etc.)
- Define padrões de código para o time
- Usa `design-doc.md` como documento de decisão do escopo atual
- Respeita `readiness.md`; se a prontidão ainda estiver baixa, devolve bloqueios em vez de fingir certeza
- só deve arquitetar em cima de `discovery.md`; se houver apenas artefatos brutos de scan, o passo correto ainda é `@analyst` antes

**Como ativar:**
```
/aioson:agent:architect
```

**Estruturas que ele propõe (exemplo Laravel SMALL):**
```
app/
  Actions/          ← lógica de negócio
  Http/Controllers/ ← apenas orquestração
  Models/
  Policies/
resources/views/
database/migrations/
tests/
```

**Entrega:** Arquivo `.aioson/context/architecture.md` com:
- Estrutura de pastas (proporcional ao tamanho)
- Stack definitiva
- Decisões técnicas documentadas com **rationale** — não só o que foi decidido, mas por que aquela escolha reduz risco de debug e manutenção futura
- Padrões de código
- **Gate B** — sinal explícito de aprovação ao final do arquivo (`@dev` só pode iniciar implementação após este gate)

---

## @ux-ui

**Quando usar:** Quando o projeto tem interfaces (web apps, landing pages com formulários). SMALL e MEDIUM.

**O que faz:**
- Recebe constraints do @architect (componentes-chave, paleta)
- Lê o PRD antes de decidir a direção visual
- Define hierarquia visual e padrões de UI
- Especifica componentes reutilizáveis
- Cria guia de acessibilidade
- Decide dark/light e direção visual de forma autônoma quando o contexto já for suficiente
- Só pergunta preferência estética quando a ambiguidade realmente mudar a solução
- Carrega `premium-command-center-ui` apenas quando houver pedido explícito de interface operacional premium ou quando essa skill já estiver registrada no PRD
- em brownfield, usa `discovery.md` como memória comprimida do sistema; se esse arquivo ainda não existir e o trabalho depender do comportamento atual da aplicação, o próximo passo correto é `@analyst`

**Como ativar o agente UI/UX:**
```
/aioson:agent:ux-ui
```

**Submodos disponíveis:**
```
/aioson:agent:ux-ui research       → pesquisa visual e hipóteses de direção
/aioson:agent:ux-ui audit          → auditoria com inventário, achados por severidade e plano de consolidação
/aioson:agent:ux-ui tokens         → contrato formal de design tokens (primitivos, semânticos, escalas)
/aioson:agent:ux-ui component-map  → mapeamento de componentes (Atomic Design), gap analysis
/aioson:agent:ux-ui a11y           → auditoria WCAG focada, integração com @qa
```

**Entrega principal:** Arquivo `.aioson/context/ui-spec.md` com:
- Sistema de design (tokens, cores, tipografia)
- Componentes principais e estados
- Fluxos de navegação
- Checklist de acessibilidade
- Enriquecimento da seção `Identidade visual` do PRD, sem reescrever visão, problema ou usuários

**Entregas dos submodos** (opcionais, em `.aioson/context/`):
- `ui-research.md` — benchmarking visual e direções
- `ui-audit.md` — inventário + achados + plano de consolidação
- `ui-tokens.md` — contrato de tokens com posse (`:root` vs `[data-theme]`)
- `ui-component-map.md` — catálogo de componentes com variantes e estados
- `ui-a11y.md` — relatório WCAG com checks automatizados e manuais

> Se o usuário disser para o agente seguir sozinho, o comportamento esperado é decidir a direção visual com base no contexto do produto e continuar sem abrir questionário de estilo.

---

## @pm

**Quando usar:** Apenas projetos MEDIUM. Ative após @architect e @ux-ui.

**O que faz:**
- Enriquece o PRD vivo com priorização e corte por fase
- Define ordem de entrega sem apagar a intenção original de produto
- Adiciona critérios de aceite compactos quando isso trouxer clareza para execução e QA
- Preserva identidade visual, visão, problema, usuários e demais seções já existentes
- usa `discovery.md` e `architecture.md` como base; não deve priorizar diretamente a partir de mapas brutos de scan

**Como ativar:**
```
/aioson:agent:pm
```

**Regra de ouro do @pm:** O documento deve ter no máximo 2 páginas. Se passar disso, corte funcionalidades do MVP.

**Entrega:** Atualização do `.aioson/context/prd.md` com:
- priorização final do MVP
- plano de entrega por fase
- critérios de aceite compactos
- preservação das seções existentes do PRD base

---

## @orchestrator

**Quando usar:** Sempre útil para gerenciar sessões de trabalho, obrigatório em projetos MEDIUM para paralelismo.

**O que faz:**
- Gerencia o **protocolo de sessão** (início, durante, fim) — define objetivo, acompanha progresso, atualiza spec.md
- Em MEDIUM: lê o `prd.md` e `architecture.md`, cria grafo de dependências e divide em lanes paralelas
- Gerencia progresso via arquivos de status e `shared-decisions.md`

**Comando `*update-spec`:** atualiza `.aioson/context/spec.md` com features concluídas, novas decisões e blockers da sessão atual.

**Como ativar:**
```
/aioson:agent:orchestrator
```

**Ou via CLI para preparar os arquivos:**
```bash
npx @jaimevalasek/aioson parallel:init
npx @jaimevalasek/aioson parallel:assign --source=prd --workers=3
npx @jaimevalasek/aioson parallel:status
```

**Entrega:**
- `.aioson/context/parallel/shared-decisions.md`
- `.aioson/context/parallel/agent-1.status.md` (e 2, 3...)
- Cada lane tem seu escopo definido

---

## @squad

**Quando usar:** Quando você quer criar um time de agentes especializados para um domínio específico dentro do projeto.

**O que faz:**
- Pergunta o objetivo e o tipo de trabalho
- Consolida um mini pacote de `discovery/design-doc/readiness` antes de compor a squad
- Gera uma squad modular, não apenas uma pasta de agentes
- Cria `.aioson/squads/{squad-slug}/agents/agents.md`
- Cria `.aioson/squads/{squad-slug}/squad.manifest.json`
- Cria `.aioson/squads/{squad-slug}/docs/design-doc.md`
- Cria `.aioson/squads/{squad-slug}/docs/readiness.md`
- Cria executores reais em `.aioson/squads/{squad-slug}/agents/`
- Cria um `@orquestrador` próprio para esse squad
- Registra metadata em `.aioson/squads/{slug}/squad.md`
- Declara `skills`, `MCPs`, política de `subagentes` e diretório `media/`
- Declara `contentBlueprints` quando a squad for orientada a conteúdo
- Trabalha com autonomia alta por padrão e evita perguntas extras quando a inferência já é suficiente
- Detecta se o pedido parece mais `modo projeto` ou `modo feature`
- Recomenda skills e documentos sob demanda em vez de inflar o contexto inteiro
- Reaproveita skills instaladas em `.aioson/squads/{slug}/skills/` antes de criar especializações novas
- Materializa o pacote minimo de contexto da squad para o runtime, dashboard e cloud
- Pode organizar entregáveis estruturados como `content.json + index.html` por `content_key`
- Usa `contentBlueprints` como contrato dinâmico do domínio; o framework fixa a casca do conteúdo, não os campos internos
- Quando o usuário pedir painel local da squad, deve apontar para o app do dashboard instalado separadamente e para a seleção da pasta que já contém `.aioson/`, sem mandar usar `dashboard:*`

**Como ativar:**
```
/aioson:agent:squad
```

**Entrega:**
- Manifesto textual da squad
- Manifesto JSON da squad
- Executores reais do squad
- Metadata do squad
- Estrutura de output, logs, mídia e sessão

> Guia completo: [Squad e Genome](./4-agentes/squad.md)

---

## @genome

**Quando usar:** Quando você quer criar uma base de conhecimento de domínio reutilizável e aplicá-la a squads ou agentes específicos.

**O que faz:**
- Gera `O que saber`, `Mentes` e `Skills`
- Pode salvar em `.aioson/genomes/`
- Pode ser aplicado depois a um squad já existente
- Atua como camada cognitiva do sistema, não como executor

**Como ativar:**
```
/aioson:agent:genome
```

**Entrega:**
- Genome estruturado
- Opcionalmente, vínculo persistente com um squad

**Não confundir:**
- `skill` = capacidade operacional
- `genome` = forma de pensar, lentes e repertório
- `executor` = quem faz o trabalho
- `subagente` = investigação temporária

Quando uma skill vier do catálogo online ou de outro pacote, ela deve ser salva em:
- `.aioson/squads/{slug}/skills/{dominio}/{skill-slug}.md`

Depois disso, ela passa a ser parte real do pacote local da squad e deve ser considerada pelos agentes sob demanda.

> Guia completo: [Squad e Genome](./4-agentes/squad.md)

---

## @dev

**Quando usar:** Sempre — é o agente que escreve o código.

**O que faz:**
- Lê o contexto, `design-doc.md`, `readiness.md`, discovery, arquitetura e (se existir) `ui-spec`
- Implementa os módulos na ordem correta
- Segue as convenções definidas pelo @architect
- Registra decisões em `shared-decisions.md` (MEDIUM)
- Carrega skills e docs detalhados sob demanda, em vez de inflar contexto inteiro
- Não deve seguir para implementação quando `readiness.md` ainda apontar falta de discovery ou de arquitetura

**Como ativar:**
```
/aioson:agent:dev
```

**Princípios que ele aplica em qualquer stack:**
- Isolar lógica de negócio dos handlers de requisição
- Validar input na fronteira do sistema (nunca depois)
- Seguir as convenções nativas do framework do projeto
- Verificar skills disponíveis em `.aioson/skills/static/` antes de implementar

**TDD Gate** — Antes de qualquer implementação de lógica de negócio, o `@dev` verifica o test runner configurado em `project.context.md`. Se não houver nenhum configurado, escaneia a raiz em busca de arquivos de configuração conhecidos (`pest.xml`, `vitest.config.*`, `pytest.ini`, `.rspec`, `foundry.toml`) e pergunta ao usuário se deseja configurar um antes de começar.

| Classificação | Mandato |
|---|---|
| MICRO | Escrever o teste junto com a implementação — obrigatório antes do commit |
| SMALL | Escrever o teste com falha (RED) **antes** de qualquer código de implementação |
| MEDIUM | Igual ao SMALL. Anotar o teste no checkpoint do plano de implementação |

**Exceções ao TDD** (nenhum teste exigido): arquivos de configuração, migrations sem regras de negócio, conteúdo estático, scaffolding de UI sem lógica de estado.

Se o usuário pedir para pular o teste, o `@dev` resiste, explica, e só cede após insistência — nunca implementa lógica de negócio sem teste existindo primeiro.

**Execução atômica** — O @dev trabalha em passos pequenos e validados, nunca implementa uma feature inteira de uma vez:
1. Declara o próximo passo antes de escrever código
2. Escreve o teste com falha (RED) — o teste deve falhar antes de qualquer implementação
3. Implementa apenas o suficiente para o teste passar (GREEN)
4. Verifica que o teste passa — lê o output completo, não um resumo
5. Faz commit com mensagem semântica
6. Repete para o próximo passo

**Em projetos com Laravel especificamente:**
- Form Requests para validação (nunca inline no controller)
- Actions para lógica de negócio
- Policies para autorização
- N+1 prevenido com eager loading
- Events + Listeners para side effects

**Entrega:** Código implementado seguindo os padrões definidos pelo @architect, para qualquer stack.

---

## @qa

**Quando usar:** Projetos SMALL e MEDIUM, após @dev.

**O que faz:**
- Revisa o código implementado
- Escreve testes para achados Critical e High
- Identifica casos de borda não cobertos
- Valida se os critérios de aceite foram atendidos
- usa `discovery.md` como fonte de regras e relacionamentos; se só existirem artefatos de scan, o fluxo correto ainda passa por `@analyst`

**Como ativar:**
```
/aioson:agent:qa
```

**Entrega:**
- Lista de problemas encontrados por severidade
- Testes para achados críticos
- Relatório de cobertura

**Fechamento de feature (automático):**

Quando o QA é aprovado, o `@qa` roda:

```bash
aioson feature:close . --feature={slug} --verdict=PASS --residual="..."
```

Isso faz tudo de uma vez — sem etapas manuais:
1. Adiciona QA sign-off em `spec-{slug}.md`
2. Marca a feature como `done` em `features.md`
3. Limpa `project-pulse.md`
4. Move todos os artefatos da feature (`prd-`, `spec-`, `requirements-`, etc.) para `.aioson/context/done/{slug}/`
5. Atualiza `.aioson/context/done/MANIFEST.md`

O root de `.aioson/context/` fica limpo automaticamente. O desenvolvedor não precisa rodar nenhum comando adicional.

> **@qa vs @tester** — O `@qa` é um revisor: lê o que foi implementado, aponta riscos e escreve testes pontuais para achados críticos. O `@tester` é um engenheiro de testes: parte de cobertura zero e constrói uma estratégia sistemática (inventário, mapa de risco, estratégia por camada). Use `@tester` quando a aplicação foi implementada sem testes adequados ou quando `@qa` identificar lacunas em 3+ módulos.

---

## @tester

**Quando usar:** Após `@dev`, quando a aplicação foi implementada sem testes adequados. Também em projetos legados ou quando `@qa` identificar cobertura insuficiente em múltiplos módulos.

**O que faz:**
- Produz um inventário completo de cobertura (`test-inventory.md`)
- Mapeia regras de negócio descobertas vs testes existentes, priorizando por risco
- Escolhe e documenta a estratégia de teste antes de escrever qualquer linha
- Escreve testes por módulo em ordem de prioridade, com commit atômico por módulo
- Gera relatório de cobertura antes vs depois

**Estratégias disponíveis:**

| Cenário | Estratégia |
|---|---|
| Código legado sem testes, precisa refatorar | Characterization Testing |
| App implementada, cobertura zero | Test Pyramid Bottom-up |
| Cobertura razoável, regras descobertas | Risk-first Gap Filling |
| Código crítico com edge cases complexos | Property-based Testing |
| APIs entre times | Contract Testing |
| Suspeita de testes fracos que sempre passam | Mutation Testing |

**Frameworks detectados automaticamente por stack:**

| Stack | Test Runner | Unit | Integration | E2E |
|---|---|---|---|---|
| Laravel | Pest PHP | Pest unit | Pest feature (HTTP) | Dusk/Playwright |
| Next.js | Vitest | Vitest + RTL | MSW + Vitest | Playwright |
| Django | pytest-django | pytest | pytest + client | Playwright |
| FastAPI | pytest + httpx | pytest | AsyncClient | — |
| Rails | RSpec | RSpec unit | Request specs | Capybara |
| Solidity | Foundry | forge unit | forge integration | — |

**Como ativar:**
```
/aioson:agent:tester
```

**Entrega:**
- `.aioson/context/test-inventory.md` — mapa de cobertura por arquivo
- `.aioson/context/test-plan.md` — estratégia escolhida + cobertura antes/depois
- Testes escritos por módulo, commitados incrementalmente

**Restrições:**
- Nunca modifica código de produção
- Se encontrar um bug real: documenta em `test-plan.md` e para — não corrige silenciosamente
- Testes sem assertions são proibidos

---

## @sheldon

**Quando usar:** Após `@product`, antes de iniciar a cadeia de execução — para garantir que o PRD está completo, sem lacunas e pronto para gerar código correto.

**O que faz:**
- Detecta documentos de entrada na raiz (`plans/*.md`, `prds/*.md`) e oferece incorporá-los ao enriquecimento do PRD
- Analisa o PRD por prioridade de melhorias
- Decide entre enriquecimento in-place ou plano de fases externo
- Valida se o PRD está legível e implementável antes de ativar `@dev`

**Modos de operação:**

| Modo | Como ativar | O que faz |
|---|---|---|
| A — Enriquecimento (padrão) | `/aioson:agent:sheldon` | Analisa o PRD alvo e sugere melhorias prioritárias |
| B — Revisão Global | `/aioson:agent:sheldon` + "revisão geral" | Escaneia todos os PRDs e planos ativos |
| C — Validação Completa | `/aioson:agent:sheldon` + "validar" ou "preparar para dev" | Auditoria completa + checklist final antes de codar |

**Como ativar:**
```
/aioson:agent:sheldon
```

**Entrega:**
- PRD enriquecido in-place com sinal de **spec-hardened** ao final — o campo `readiness` em `sheldon-enrichment-{slug}.md` indica se o PRD está pronto para downstream (`ready_for_downstream`) ou ainda tem itens bloqueantes (`needs_work`) (Modo A)
- Relatório de status de todos os PRDs (Modo B)
- Checklist de validação + decisão go/no-go para implementação (Modo C)

---

---

## Agentes especializados e auxiliares

Agentes que nao fazem parte do fluxo principal de entrega, mas entram sob demanda para tarefas especificas.

---

## @committer

**Quando usar:** Quando voce quer gerar mensagens de commit semanticas ou preparar um conjunto de mudancas para o Git.

**O que faz:**
- Le o diff staged (ou working tree) e gera mensagem de commit no formato convencional
- Pode gerar `commit-prep.json` com lista de arquivos, tipo de mudanca e descricao
- Respeita o escopo do projeto e o formato definido no `spec.md`

**Como ativar:**
```
/aioson:agent:committer
```

**Entrega:**
- Mensagem de commit pronta para copiar ou mensagem semantica no formato `tipo(escopo): descricao`
- Opcionalmente `.aioson/context/commit-prep.json`

---

## @copywriter

**Quando usar:** Quando voce precisa de copy para landing pages, emails, CTAs ou qualquer texto voltado a conversao.

**O que faz:**
- Escreve copy com foco em conversao e clareza
- Pode seguir uma voz de marca definida no PRD ou no `design-doc.md`
- Gera variantes de headline, descricao e CTA
- Nao substitui um redator humano, mas acelera a primeira versao

**Como ativar:**
```
/aioson:agent:copywriter
```

**Entrega:**
- Textos prontos para uso em interfaces, landing pages ou campanhas

---

## @briefing

**Quando usar:** Quando voce tem notas, rascunhos ou plans brutos em `plans/` e quer transforma-los em um briefing estruturado antes de iniciar o fluxo de produto. Tambem util quando voce tem uma ideia mas ainda nao sabe se vira feature — o agente conduz uma conversa estruturada e entrega o briefing pronto pro @product decidir.

**O que faz:**
- Le arquivos de `plans/` e sintetiza um briefing enriquecido
- Identifica gaps, riscos e perguntas em aberto (com taxonomia: research-able / testable / decision-required / out-of-scope)
- Faz web research para validar suposicoes tecnicas ou de mercado
- Aplica frameworks de discovery (Opportunity Solution Tree, Jobs-to-be-Done, Cagan's 4 risks) quando relevantes
- Produz `.aioson/briefings/{slug}/briefings.md`
- Nao cria PRD — isso e responsabilidade do @product

**Como ativar:**
```
/aioson:agent:briefing
```

**Entrega:**
- `.aioson/briefings/{slug}/briefings.md` com contexto, problema, solucao proposta, riscos, gaps e open questions
- `.aioson/briefings/config.md` — registro de todos os briefings

---

## @design-hybrid-forge

**Quando usar:** Quando voce quer criar uma skill de design hibrida combinando duas skills primarias ja existentes.

**O que faz:**
- Recebe duas skills de design (ex: `frontend-design` + `interface-design`)
- Analisa os principios, tokens e decisoes de cada uma
- Gera uma skill hibrida com contrato unico, nome, descricao e referencias
- Salva em `.aioson/installed-skills/{hybrid-name}/`

**Como ativar:**
```
/aioson:agent:design-hybrid-forge
```

**Entrega:**
- Skill hibrida completa em `.aioson/installed-skills/{slug}/SKILL.md`

---

## @discover

**Quando usar:** Quando voce quer mapear um projeto existente (brownfield) antes de comecar a trabalhar nele, ou quando quer atualizar a memoria do sistema.

**O que faz:**
- Escaneia a estrutura de pastas e arquivos do projeto
- Gera indices e mapas semanticos (`scan-index.md`, `scan-folders.md`)
- Pode gerar ou atualizar `discovery.md` e `skeleton-system.md`
- Constroi um cache de conhecimento que outros agentes consomem

**Como ativar:**
```
/aioson:agent:discover
```

**Ou via CLI:**
```bash
npx @jaimevalasek/aioson scan:project . --folder=src
```

**Entrega:**
- `scan-index.md`, `scan-folders.md`, `scan-<pasta>.md`, `scan-aioson.md`
- `memory-index.md`, `module-<pasta>.md`
- Com `--with-llm`: `discovery.md` e `skeleton-system.md`

---

## @neo

**Quando usar:** Quando voce esta perdido, quer entender o status atual do projeto ou nao sabe qual agente ativar em seguida.

**O que faz:**
- Le `project-pulse.md`, `features.md`, `spec.md` e `workflow.state.json`
- Resume o estado atual do projeto em poucas linhas
- Sugere o proximo agente ou acao com base no estado do workflow
- Responde perguntas do tipo "por onde comeco?" e "o que falta fazer?"

**Como ativar:**
```
/aioson:agent:neo
```

**Entrega:**
- Resumo do status do projeto
- Recomendacao do proximo passo

---

## @orache

**Quando usar:** Quando voce precisa de pesquisa de mercado, analise competitiva ou investigacao de dominio antes de definir o escopo do produto.

**O que faz:**
- Pesquisa na web sobre mercado, concorrentes e tendencias
- Valida suposicoes de produto com dados externos
- Gera resumos estruturados salvos em `researchs/{slug}/summary.md`
- Segue o protocolo de cache de pesquisa: verifica `researchs/` antes de buscar novamente

**Como ativar:**
```
/aioson:agent:orache
```

**Entrega:**
- `researchs/{slug}/summary.md` com frontmatter (searched_at, agent, query, verdict) + findings
- `researchs/{slug}/files/` com conteudo raw das fontes consultadas

---

## @pentester

**Quando usar:** Antes do fechamento de uma feature (especialmente MEDIUM), quando voce quer uma revisao adversarial focada em seguranca.

**O que faz:**
- Atua com mentalidade de atacante, nao de validador
- Revisa superficies de ataque: memory context, tool invocation, auth, handoff, protocol contracts, secrets, runtime permissions
- Gera findings estruturados em `.aioson/context/security-findings-{slug}.json`
- So opera em ambiente local/controlado — nunca em producao ou internet publica
- Findings `high`/`critical` podem bloquear o Gate D no @qa

**Como ativar:**
```
/aioson:agent:pentester
```

**Entrega:**
- `.aioson/context/security-findings-{slug}.json` com review_contract, threat_surfaces e findings priorizados

> **Importante:** O `@pentester` nao corrige vulnerabilidades — ele apenas encontra e documenta. A correcao e feita pelo `@dev` e a aprovacao pelo `@qa`.

---

## @profiler-researcher

**Quando usar:** Quando voce quer pesquisar o "DNA mental" de uma pessoa — perfil cognitivo, comportamental e de comunicacao.

**O que faz:**
- Pesquisa na web e em fontes disponiveis sobre a pessoa-alvo
- Gera um perfil inicial com dimensoes cognitivas e comportamentais
- Salva o resultado para enriquecimento posterior

**Como ativar:**
```
/aioson:agent:profiler-researcher
```

**Entrega:**
- Perfil inicial da persona em formato estruturado

---

## @profiler-enricher

**Quando usar:** Quando voce ja tem um perfil inicial e quer aprofundar a analise cognitiva.

**O que faz:**
- Le o perfil gerado pelo `@profiler-researcher`
- Analisa padroes de cognicao, comunicacao e decisao
- Enriquece o perfil com insights mais profundos

**Como ativar:**
```
/aioson:agent:profiler-enricher
```

**Entrega:**
- Perfil cognitivo enriquecido

---

## @profiler-forge

**Quando usar:** Quando voce quer transformar um perfil enriquecido em um advisor funcional (genome 3.0) que pode ser usado por squads ou agentes.

**O que faz:**
- Le o perfil enriquecido
- Gera um advisor com voice DNA, principios de decisao e framework operacional
- Materializa o genome em um artefato reutilizavel

**Como ativar:**
```
/aioson:agent:profiler-forge
```

**Entrega:**
- Advisor/Gerome 3.0 da persona

---

## @site-forge

**Quando usar:** Quando voce quer clonar o design de um site existente ou reconstruir uma URL usando uma skill de design especifica.

**O que faz:**
- Recebe uma URL e uma skill de design (ou extrai a skill do proprio site)
- Gera a estrutura, componentes e estilos necessarios
- Pode produzir entregaveis HTML/CSS/JS ou integrar com o framework do projeto

**Como ativar:**
```
/aioson:agent:site-forge
```

**Exemplos de uso:**
```
Clone este site com a skill premium-command-center-ui
Reconstrua https://exemplo.com usando a skill clean-saas-ui
Extraia o design de https://exemplo.com como uma skill
```

**Entrega:**
- Codigo e/ou skill extraida do site alvo

---

## @validator

**Quando usar:** Quando voce quer validar entregaveis, contratos ou checklists antes de aprovar uma etapa.

**O que faz:**
- Valida se artefatos cumprem criterios definidos
- Pode verificar conformidade com schemas, contratos ou regras de negocio
- Funciona como uma camada adicional de verificacao antes de gates

**Como ativar:**
```
/aioson:agent:validator
```

**Entrega:**
- Relatorio de validacao com pass/fail por criterio

---

## Resumo: fluxo por tamanho

### MICRO
```
@setup → @dev
```
Duração típica: minutos a horas. Sem análise, sem arquitetura formal.

### SMALL
```
@setup → @product → [@sheldon] → @analyst → @architect → @dev → @qa → [@tester]
```
Duração típica: horas a dias. Análise leve, estrutura clara.

### MEDIUM
```
@setup → @product → [@sheldon] → @analyst → @architect → @ux-ui → @pm → @orchestrator → @dev → @pentester → @qa → [@tester]
```
Duração típica: dias a semanas. Análise completa, paralelismo, backlog formal, revisao adversarial obrigatoria.

> O `@pentester` entra obrigatoriamente em projetos MEDIUM entre `@dev` e `@qa`. Em projetos sensiveis ou com requisitos de seguranca, ative-o tambem em SMALL.

`[@sheldon]` — opcional, recomendado antes de iniciar a cadeia de execução para validar o PRD.
`[@tester]` — opcional, recomendado quando a cobertura de testes for insuficiente após `@dev`.

---

## Veja também

- [Fluxo de artefatos entre agentes](./5-referencia/fluxo-artefatos.md) — o que cada agente produz, o que @dev lê de fato e como o plano do Sheldon chega à implementação
- [Cenários completos com exemplos práticos](./3-receitas/README.md)
- [Início rápido](./2-comecar/primeiro-projeto.md)
- [Guia do engenheiro: pair programming com IA](./4-agentes/deyvin.md)
