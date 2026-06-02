# PRD — AIOSON

## Visão
AIOSON é um framework operacional de IA que transforma desenvolvimento assistido por agentes em engenharia de software real — orquestrando agentes especializados via Spec-Driven Development para produzir sistemas organizados, componentizados e sustentáveis.

## Problema
Desenvolvimento assistido por LLM sem governança produz bases de código caóticas: arquivos monolíticos com milhares de linhas, pastas planas sem hierarquia semântica, código duplicado e nenhuma fase de design antes da implementação. O agente sabe *o que* fazer mas não tem contrato claro de *como organizar* — o resultado é um sistema que funciona mas não escala e não é mantível. O `@dev` e o `@deyvin` hoje implementam sem ler qualquer regra de estrutura de código, e o `@discovery-design-doc` existe mas está órfão — nunca é chamado em nenhum workflow.

## Usuários
- **Desenvolvedor (usuário principal)**: precisa construir software de qualidade usando agentes de IA sem precisar revisar e reorganizar manualmente o output dos agentes

## Escopo do MVP
### Obrigatório 🔴
- **CLI AIOSON**: orquestração de agentes especializados via comandos `aioson workflow:next`, `aioson agent:done`, `aioson live:*`, `aioson runtime:emit`, etc.
- **SDD workflow com gates obrigatórios**: pipeline Spec-Driven com classificação MICRO/SMALL/MEDIUM determinando quais agentes são obrigatórios
- **Design-doc base permanente por projeto**: arquivo `.aioson/context/design-doc.md` fixo que define as regras de organização de código para o projeto — estrutura de pastas e subpastas, nomeclatura semântica (singular/plural, kebab-case), padrões de componentização, política de reuso, guideline de tamanho de arquivo (300–500 linhas recomendado; acima de 500 → agente deve emitir alerta explícito e propor alternativas concretas de split ou extração sem quebrar o sistema)
- **`@discovery-design-doc` como gate obrigatório em SMALL e MEDIUM**: integrado antes de `@dev` — lê o design-doc base + PRD + artefatos do `@architect` e gera um plano técnico concreto por feature (quais arquivos criar, onde exatamente, quais componentes existentes reusar, quais novos componentes pequenos criar)
- **`@dev` e `@deyvin` carregam design-doc como contexto obrigatório**: ambos os agentes de implementação leem o design-doc base antes de qualquer escrita de código — sem leitura do design-doc, não implementam
- **Runtime telemetry**: SQLite via better-sqlite3 para observabilidade de sessões no dashboard externo
- **Template AIOSON instalável**: estrutura distribuída via `aioson setup .` contendo agentes, skills, rules e locales

### Desejável 🟡
- **Task breakdown com paths exatos**: `@pm` inclui o path exato do arquivo em cada task gerada (ex: `src/components/auth/LoginForm.tsx`) em vez de descrições genéricas como "criar tela de login"
- **`@architect` gera scaffold inicial de pastas**: estrutura de diretórios sugerida como artefato explícito do `@architect` para projetos novos, alinhada com o design-doc base

## Fora do escopo
- Sub-agentes paralelos por pasta ou componente
- Limites rígidos de linhas como erro bloqueante (é guideline de engenharia, não constraint hard)
- Dashboard UI (aplicação separada, fora deste repositório)

## Fluxos de usuário
### Workflow SMALL com design governance
Usuário ativa `@product` → PRD gerado → `@analyst` mapeia entidades e requisitos → `@architect` define estrutura técnica → **`@discovery-design-doc` lê design-doc base + spec e gera plano técnico da feature (paths exatos, componentes, reuso)** → `@dev` lê design-doc + plano e implementa com organização garantida → `@qa` valida

### Workflow MEDIUM com design governance
Usuário ativa `@product` → PRD → `@analyst` → `@architect` → **`@discovery-design-doc`** → `@ux-ui` → `@pm` (tasks com paths exatos) → `@orchestrator` → `@dev`/`@deyvin` (ambos leem design-doc obrigatoriamente) → `@qa`

### Alerta de tamanho de arquivo
Durante implementação, quando `@dev` ou `@deyvin` percebe que um arquivo vai ultrapassar 500 linhas → emite alerta explícito no output → propõe alternativas concretas de componentização ou extração → aguarda confirmação antes de continuar

## Métricas de sucesso
- Novos projetos gerados com estrutura de pastas semântica e hierárquica sem intervenção manual do usuário
- Zero arquivos acima de 500 linhas criados sem alerta e proposta de split
- `@discovery-design-doc` invocado em 100% dos workflows SMALL e MEDIUM
- `@dev` e `@deyvin` nunca iniciam implementação sem carregar o design-doc base

## Perguntas em aberto
- Quem gera o design-doc base: `@setup` na inicialização do projeto, ou `@architect` na primeira feature SMALL/MEDIUM?
- O design-doc base é mutável (agentes o atualizam quando descobrem novos padrões) ou imutável após a criação?
- Como o alerta de 500 linhas opera em sessões `@deyvin` em modo pair programming, onde o usuário está dirigindo ativamente a implementação?

## Visual identity
<!-- added by @ux-ui -->

AIOSON não tem uma UI de produto neste repositório. A identidade de experiência deste core é CLI-first: operacional, precisa, densa e orientada a artefatos. O dashboard permanece uma aplicação separada e fora do escopo deste PRD.

Direção confirmada para este projeto:
- Produto: CLI Node.js para orquestração de agentes e workflow SDD.
- Superfícies UX: comandos de terminal, help text, saídas JSON, relatórios Markdown, handoffs e artefatos em `.aioson/context/`.
- Design skill: não aplicável; `project_type=script` e `design_skill` permanece vazio de propósito.
- Barra de qualidade: toda saída deve tornar estado, bloqueios, próximos comandos e artefatos legíveis sem depender de contexto implícito ou dashboard externo.

## UX Considerations
<!-- added by @ux-ui -->

- O usuário principal precisa saber rapidamente qual stage está ativo, qual gate bloqueia, qual artefato falta e qual comando executa a próxima transição.
- Saídas human-readable devem priorizar status, escopo e próxima ação antes de detalhes.
- Saídas `--json` devem permanecer limpas, estáveis e sem texto humano misturado.
- Relatórios em Markdown devem começar por status/escopo e listar limitações, advisory e caminhos de artefato.
- Mensagens localizadas devem respeitar `pt-BR`, preservando nomes de comandos, flags, paths e chaves JSON em inglês.
- Acessibilidade em CLI significa texto legível em logs, sem dependência de cor e sem símbolos como único indicador de status.

## Delivery plan
<!-- added by @pm -->

### Phase 1 - Governance baseline
1. Consolidar `.aioson/context/design-doc.md` como contrato base permanente.
2. Garantir que `@dev` e `@deyvin` carreguem o design-doc antes de editar código.
3. Validar que o template instalado também recebe o contrato.

### Phase 2 - Workflow integration
1. Inserir `@discovery-design-doc` no fluxo SMALL/MEDIUM antes de implementação.
2. Ajustar handoffs para carregar PRD, discovery, architecture, ui-spec e design-doc sem redescoberta.
3. Manter `workflow:next` como motor único de transição.

### Phase 3 - Implementation guardrails
1. Implementar alerta de tamanho de arquivo em agentes de implementação.
2. Exigir plano técnico com paths exatos antes de `@dev` em trabalho MEDIUM.
3. Validar nomenclatura, componentização e reuso contra `.aioson/design-docs/`.

### Phase 4 - QA and rollout
1. QA valida contrato, carregamento obrigatório, template/workspace parity e critérios de arquivo.
2. Documentar limitações conhecidas e atualizar bootstrap/pulse.
3. Encerrar apenas quando os artefatos forem suficientes para próxima sessão sem contexto oral.

## Acceptance criteria
<!-- added by @pm -->

| AC | Description |
|---|---|
| AC-01 | Dado um projeto SMALL ou MEDIUM, quando o workflow chega à etapa pré-implementação, `.aioson/context/design-doc.md` existe ou é criado antes de `@dev`. |
| AC-02 | Dado que `@dev` ou `@deyvin` inicia implementação, o agente registra que carregou o design-doc base antes de qualquer edição de código. |
| AC-03 | Dado um workflow SMALL ou MEDIUM, `@discovery-design-doc` é roteado antes de implementação ou existe uma justificativa explícita de desvio no handoff. |
| AC-04 | Dado um plano técnico de feature, cada task de implementação referencia paths ou módulos concretos em vez de descrições genéricas. |
| AC-05 | Dado que uma alteração pode levar um arquivo acima de 500 linhas, o agente emite alerta explícito e propõe alternativa de split antes de prosseguir. |
| AC-06 | Dado um projeto instalado via template, as regras e agentes distribuídos preservam o mesmo contrato de design governance do workspace core. |
| AC-07 | Dado um output de CLI ou relatório de gate, o usuário consegue identificar status, bloqueador, próximo comando e artefato sem abrir o dashboard externo. |
| AC-08 | Dado QA Gate D, `@qa` consegue verificar todos os itens acima por artefatos em disco e comandos locais, sem depender apenas do histórico de conversa. |

## Planning risks
<!-- added by @pm -->

| Risk | Mitigation |
|---|---|
| Workflow real divergir do PRD e pular `@discovery-design-doc`. | `@orchestrator` deve validar o estado real de `workflow.config.json`/`workflow:status` antes de entregar para `@dev`. |
| Template e workspace ficarem fora de sincronia. | Toda mudança em agente/rule deve considerar `template/.aioson/` e workspace ativo, com verificação de parity quando aplicável. |
| Alerta de 500 linhas virar bloqueio rígido demais. | Tratar como guardrail com proposta concreta; QA valida evidência, não contagem cega. |

## Specify depth
- Classification: MEDIUM
- Specify depth applied: full
- Ambiguidades que DEVEM ser resolvidas antes do @analyst prosseguir:
  - Quem é responsável por criar o design-doc base: `@setup` ou `@architect`?
  - O design-doc base é por projeto (único, compartilhado por todas as features) ou por feature (gerado a cada PRD)?
- Ambiguidades que PODEM ser resolvidas durante a discovery:
  - Seções obrigatórias do design-doc base (formato mínimo exigido)
  - Protocolo do alerta de 500 linhas no agente `@deyvin` em modo pair
  - Como `@pm` inclui paths exatos sem precisar rodar análise de código em tempo de breakdown
