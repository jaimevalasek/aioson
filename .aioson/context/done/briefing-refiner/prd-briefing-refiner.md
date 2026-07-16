# PRD — Briefing Refiner

## Vision
O Briefing Refiner é um agente de pré-produção que transforma briefings gerados pelo `@briefing` em uma revisão humana interativa, editável e reaplicável antes de o `@product` gerar o PRD. Classificação: SMALL.

## Problem
Hoje o `@briefing` já cria arquivos Markdown estruturados, mas a revisão humana ainda acontece de forma linear, em chat ou edição manual do Markdown. Isso dificulta enxergar ambiguidades, redundâncias, decisões pendentes e o impacto do que será feito antes de aprovar o briefing para virar PRD.

## Users
- Feature owner / analista humano: precisa revisar a especificação inicial com clareza, editar trechos, marcar discordâncias e adicionar notas antes de aprovar o avanço para `@product`.
- `@product`: precisa consumir um briefing mais claro, corrigido e explicitamente validado, sem herdar ambiguidades do estágio anterior.
- AIOSON operator: precisa de um fluxo rastreável em disco, com artefatos que mostrem o que foi alterado e o que foi aplicado.

## MVP scope
### Must-have 🔴
- Novo agente `@briefing-refiner` registrado nos prompts, docs de roteamento e listas de agentes do AIOSON.
- Detecção de briefings existentes em `.aioson/briefings/config.md`, priorizando briefings `draft` ou `approved` sem PRD gerado.
- Leitura dos arquivos de `.aioson/briefings/{slug}/`, com foco obrigatório em `briefings.md`.
- Auditoria de refinamento do briefing: ambiguidades, redundâncias, lacunas, riscos genéricos, perguntas abertas vagas, termos inconsistentes e trechos difíceis de analisar.
- Geração de um HTML local de revisão em `.aioson/briefings/{slug}/review.html`, voltado para especificação de implementação, não para apresentação genérica.
- Interface HTML com seções editáveis, marcações por trecho, comentários/notas, status de decisão e visão clara de "o que será feito", "o que está incerto" e "o que bloqueia o PRD".
- Persistência estruturada das edições humanas em `.aioson/briefings/{slug}/refinement-feedback.json`, para o agente não depender de interpretar HTML livre.
- Reentrada do agente: ao ser chamado novamente, detectar `refinement-feedback.json`, resumir alterações pelo harness e pedir confirmação antes de atualizar `briefings.md`.
- Aplicação confirmada das alterações no `briefings.md`, preservando o contrato obrigatório do `@briefing`: Context, Problem, Proposed solution, Themes, Risks, Identified gaps, Sources e Open questions.
- Registro de auditoria em `.aioson/briefings/{slug}/refinement-report.md`, contendo alterações aplicadas, comentários não aplicados e pendências para `@product`.
- Handoff final explícito: briefing refinado -> aprovação via CLI -> `@product`.

### Should-have 🟡
- Modo somente revisão que gera o HTML e relatório sem alterar o briefing.
- Filtros no HTML por tipo de problema: ambiguidade, redundância, lacuna, risco, decisão pendente e sugestão de escopo.
- Indicadores visuais de severidade para itens que bloqueiam PRD versus itens apenas recomendados.
- Exportação de snapshot de revisão para facilitar comparação entre versões.
- Suporte a arquivos adicionais dentro de `.aioson/briefings/{slug}/`, quando o `@briefing` tiver separado temas complexos.

## Out of scope
- Criar ou alterar PRDs diretamente; isso continua sendo responsabilidade do `@product`.
- Aprovar briefing automaticamente; aprovação continua explícita via CLI.
- Substituir o `@briefing`; o novo agente atua somente depois de existir um briefing.
- Construir dashboard web persistente ou servidor local.
- Sincronização multiusuário em tempo real.
- Usar serviços externos para comentários, armazenamento ou renderização.
- Permitir que `@dev` consuma briefings diretamente.

## User flows
### Gerar revisão interativa
Usuário ativa `@briefing-refiner` → agente lista briefings refináveis → usuário escolhe um slug → agente lê `briefings.md` e arquivos adicionais → agente identifica problemas de clareza e decisão → agente gera `review.html`, `refinement-feedback.json` inicial e `refinement-report.md` preliminar → usuário abre o HTML local e revisa.

### Revisar no HTML
Usuário lê as seções do briefing no HTML → edita trechos diretamente → adiciona notas por bloco → marca itens como aceitar, alterar, remover ou bloqueia PRD → o JavaScript atualiza instantaneamente o estado estruturado em `refinement-feedback.json` ou em uma área exportável quando escrita direta em disco não for possível pelo navegador.

### Reaplicar feedback no briefing
Usuário chama `@briefing-refiner` novamente → agente detecta feedback pendente → agente resume alterações, comentários bloqueantes e trechos editados → usuário confirma aplicação → agente atualiza `briefings.md` e registra `refinement-report.md` → agente orienta aprovação via `aioson briefing:approve`.

### Handoff para produto
Usuário aprova o briefing refinado via CLI → ativa `@product` → `@product` detecta briefing aprovado sem PRD gerado → usa o briefing refinado como fonte principal do PRD.

## Success metrics
- 100% dos briefings refinados mantêm o contrato Markdown obrigatório do `@briefing`.
- `@product` consegue gerar PRD a partir de um briefing refinado sem pedir novamente decisões já resolvidas no HTML.
- Toda alteração humana aplicada ao briefing tem origem rastreável em `refinement-feedback.json` e `refinement-report.md`.
- Zero alterações automáticas em `briefings.md` sem confirmação explícita do usuário na reentrada do agente.
- Revisões com comentários bloqueantes não são encaminhadas como prontas para `@product` sem sinalização explícita.

## Open questions
- O HTML deve tentar salvar `refinement-feedback.json` via File System Access API quando suportado, ou deve sempre expor um botão de exportar/copiar JSON para máxima compatibilidade?
- O agente deve aceitar refinar briefings `approved` ou apenas `draft`? Recomendação inicial: permitir ambos, mas alertar que refinamento de `approved` exige nova aprovação antes do `@product`.
- O `review.html` deve ser sobrescrito em cada nova revisão ou versionado como `review-{timestamp}.html`?
- O CLI precisa de um comando dedicado, como `aioson briefing:refine`, ou a V1 pode operar apenas via agente e arquivos?
- Quais mudanças no `briefings.md` devem rebaixar automaticamente o status de `approved` para `draft`, se isso for permitido?

## Visual identity
### Design skill
Não aplicável ao produto principal: este repositório é `project_type=script` e `design_skill` permanece vazio. Para o `review.html`, usar uma UI local, funcional e densa, sem depender de design skill externa.

### Aesthetic direction
Interface de revisão técnica, parecida com uma ferramenta de análise de especificação: navegação por seções, painel de problemas, comentários por bloco e destaque claro de decisões pendentes. Evitar aparência de landing page ou documento decorativo.

### Color & theme
Paleta neutra e operacional, com cores de estado bem distintas: bloqueio, alteração proposta, aceito e comentário. A cor não pode ser o único indicador; cada estado precisa de texto ou ícone.

### Typography
Tipografia legível para leitura longa e edição. Títulos compactos, corpo com boa altura de linha e blocos editáveis visualmente separados sem parecerem cards promocionais.

### Motion & interactions
Interações discretas: edição inline, seleção de status, adicionar comentário, filtrar problemas e salvar/exportar feedback. Sem animações decorativas.

### Component style
Layout em duas ou três áreas: sumário/seções, conteúdo editável e painel de revisão. Usar controles familiares: checkboxes, toggles, menus, botões com ícones e estados persistentes.

### Quality bar
O HTML precisa ajudar o usuário a decidir o que será feito, o que deve mudar e o que não pode avançar. Se a UI for bonita mas não melhorar a análise do briefing, falhou.
