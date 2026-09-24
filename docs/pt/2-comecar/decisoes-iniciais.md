# Decisões iniciais — MICRO, SMALL ou MEDIUM? Qual cliente AI?

> **Para quem é:** você está prestes a rodar `aioson init` e quer escolher bem.
> **Tempo de leitura:** 6 min.
> **O que você vai sair sabendo:** como AIOSON classifica seu projeto, e como escolher cliente AI / design / idioma.

---

## A classificação: MICRO, SMALL, MEDIUM

AIOSON é o oposto de "tamanho único". Ele aplica **mais cerimônia em projetos maiores e menos em menores**. Isso é o Artigo II da Constitution: *Right-Sized Process*.

### Como o número é calculado

Soma de três fatores (cada um vale 0, 1 ou 2 pontos):

| Fator | 0 pts | 1 pt | 2 pts |
|---|---|---|---|
| **Tipos de usuário** | 1 | 2 | 3+ |
| **Integrações externas** | 0 | 1–2 | 3+ |
| **Regras de negócio não-óbvias** | nenhuma | algumas | complexas |

| Soma | Classificação |
|---|---|
| 0–1 | **MICRO** |
| 2–3 | **SMALL** |
| 4–6 | **MEDIUM** |

### O que muda em cada uma

A esteira é a mesma nos três níveis:

```text
@briefing → @refiner → @product → @sheldon → @planner → @dev → @qa → @tester → @pentester
```

Briefing e Refiner são a entrada de fonte crua — opcionais quando a direção já está clara, mas se iniciados precisam ser concluídos e aprovados (escopo visual exige o protótipo aprovado). Sheldon é a revisão independente obrigatória do mesmo PRD. QA é o Gate D; Tester e Pentester são o endurecimento que vem depois, habilitados por feature. A classificação regula profundidade, orçamento de arquivos, cobertura de risco e quantidade de evidência — não cria outra cadeia de agentes.

Para uma mudança bounded, a rota curta (**Simple Plan**, via `@dev`) existe em qualquer classificação e não passa pela esteira.

#### MICRO

- Para: scripts, automações, protótipos e apps pessoais simples que ainda precisam de memória de feature.
- PRD e plano são curtos, mas continuam sendo as duas autoridades antes do código.
- QA revisa os ACs alterados, testes focados e um smoke pelo caminho real.

**Exemplos típicos:**
- Script Python que processa CSV
- Bot Telegram simples
- Página estática de portfólio
- Mini-API de 3 endpoints

#### SMALL

- Para: a maioria dos apps reais.
- O PRD tem ACs concretos e o Planner cria um único plano vertical.
- Sheldon pode enriquecer o PRD, mas não cria uma especificação paralela.
- QA cobre todos os ACs da feature, regressão focada e um smoke pelo caminho real.

**Exemplos típicos:**
- App SaaS para um único persona
- API com auth e algumas regras
- Loja online simples
- Blog com painel admin

#### MEDIUM

- Para: produtos com múltiplos tipos de usuário, várias integrações, regras complexas.
- Usa o mesmo PRD, o mesmo plano e o mesmo veredito QA, com mais detalhe nos riscos nomeados.
- Analyst, Architect, PM, UX/UI e Discovery Design Doc continuam disponíveis por pedido explícito, sem virar pré-requisitos.
- O DEV pode usar faixas de desenvolvimento declaradas por host, modelo, prompt e `write_paths`; executa-as sequencialmente e integra o resultado.
- Tester e Pentester (as duas últimas fases da esteira) e o Validator opt-in ficam desligados por padrão: entram depois do PASS do QA, quando você os habilita para a feature. Em MEDIUM eles quase sempre valem a pena.
- Threshold de contexto mais agressivo (55% — alerta cedo).

**Exemplos típicos:**
- Marketplace (vendedor + comprador + admin)
- ERP / CRM
- Plataforma multi-tenant com cobrança por tier
- App fintech com KYC e compliance

### Casos de fronteira

| Situação | Sugestão |
|---|---|
| Projeto pessoal, mas com uma integração externa pesada | SMALL — a integração pede mais detalhe no PRD, plano e QA |
| Score 1, mas sei que vou crescer | Comece MICRO. Pode promover depois com `@setup` |
| Score 4, mas time é só você | MEDIUM mesmo. As regras de negócio complexas se beneficiam dos artefatos |
| Score 2, mas é greenfield e quero design caprichado | SMALL + forneça imagens de referência para o `interface-design` desde o início |

> **Verdade frequentemente esquecida:** AIOSON luta contra cerimônia desnecessária. Se você está em dúvida entre dois níveis, **escolha o menor**. Promover depois é fácil. Demover depois é doloroso.

---

## Escolhendo o cliente AI

Você pode marcar **mais de um** no wizard — eles convivem no mesmo projeto.

| Cliente | Forte para... | Marcas registradas |
|---|---|---|
| **Claude Code** | Agentes longos, refatorações, tarefas planejadas | Skills nativos, slash commands, hooks |
| **Codex CLI** | Tarefas curtas, foco em código direto | Modo `@` para incluir arquivos |
| | Multi-modal, custo baixo em alguns planos | Janela de contexto generosa |
| **OpenCode** | Open-source, integração com vários providers | Configuração granular |

**Recomendação para iniciante:** comece com Claude Code, é o que tem mais paridade com AIOSON. Adicione outros depois com `aioson install --reconfigure`.

---

## Escolhendo Modo: Development vs Development + Squads

### Development (padrão)

Inclui os 29 agentes oficiais — a esteira inteira (briefing, refiner, product, sheldon, planner, dev, qa, tester, pentester), o boot e roteamento (setup, neo), a entrega (committer, discover) e os especialistas opt-in. Suficiente para 95% dos projetos.

### Development + Squads

Adiciona o sistema de squads — você pode criar squads customizados para domínios fora do padrão.

**Exemplo prático:** seu projeto é jurídico. Você cria um squad "compliance" com agentes:
- `@regulator` — entende regulação brasileira
- `@attorney` — interpreta cláusulas
- `@auditor` — checa conformidade

```bash
# Dentro do cliente AI
> @squad montar compliance

# Ou via CLI
npx @jaimevalasek/aioson squad:scaffold compliance
```

**Quando ativar Squads:**
- Você sabe que vai precisar de especialização fora do padrão
- Time grande com domínios diferentes
- Vai publicar squads no aioson.com (ver `system:publish`)

**Quando NÃO ativar:**
- Projeto pessoal MICRO
- Você ainda não usou agentes padrão o suficiente para saber se precisa

> Pode ativar depois com `aioson install --reconfigure`.

---

## Escolhendo o Design System

> **A rota: `interface-design` + suas imagens de referência.** O template embarca exatamente uma design skill — o motor `interface-design`. Em vez de herdar o visual idêntico de um preset fixo, você fornece imagens de referência (identidade/marca e, opcionalmente, estrutura de componentes); a skill `reference-identity-extract` as converte **uma única vez** num `identity.md` de texto que o motor aplica em tudo que vier depois (protótipo e build). Não há pergunta: `design_skill: "interface-design"` já nasce no `project.context.md` e nenhum agente pede para escolher ou confirmar uma design skill — só uma skill forjada pelo próprio projeto (`@site-forge` ou `@design-hybrid-forge`) substitui o motor, quando você a nomeia. Imagens são opcionais: sem nenhuma, o motor roda mesmo assim, decidindo sozinho (modo origem).

**Pular** as imagens é uma opção legítima. Você pode:
- Fornecer depois com `@setup`/`@refiner` — mesma rota, sempre com confirmação explícita
- Clonar o design de um site real com `@site-forge`
- Criar um híbrido a partir de duas skills que você já forjou com `@design-hybrid-forge`

---

## Escolhendo o idioma de interação

| Idioma | Quando faz sentido |
|---|---|
| **English** | Times internacionais; quer máximo de qualidade nos prompts |
| **Português (pt-BR)** | Time 100% PT; clientes finais leem PT |
| **Español** | Time 100% ES |
| **Français** | Time 100% FR |

**Importante:** os arquivos de agente *internos* permanecem em inglês (são prompts, e o modelo performa melhor em inglês). O `interaction_language` muda apenas como o agente **fala com você** — perguntas, explicações, mensagens.

Decisão deliberada do projeto: separar **idioma do prompt** (en, sempre) do **idioma da interação** (escolha sua). Essa separação aconteceu nos commits `efb0902` e `6629730`.

---

## Wizard skip — instalações relâmpago

```bash
# Tudo: todos os clientes, modo Squads, sem design, EN
npx @jaimevalasek/aioson init meu-app --all

# Sem nenhuma pergunta (defaults), idioma inglês
npx @jaimevalasek/aioson install --no-interactive
```

---

## Como mudo depois?

| Quero mudar... | Comando |
|---|---|
| Adicionar Codex ao mesmo projeto | `aioson install --reconfigure` |
| Ativar Squads | `aioson install --reconfigure` (e marque) |
| Trocar design skill ou identidade visual | Edite `design_skill:` em `project.context.md` (uma skill forjada pelo projeto) ou refaça o `identity.md`; não existe pergunta de design no `@setup` nem no `install --reconfigure` |
| Mudar idioma de interação | Edite `interaction_language:` em `project.context.md` ou rode `@setup` de novo |
| Mudar a classificação | Edite `classification:` em `project.context.md`. Próximas sessões respeitam. |

---

## Decisão final em 30 segundos

```
Tipo de coisa que você está construindo? Risco? Quantas integrações?
                              │
                              ▼
                       Pequeno e simples?
                       SIM → MICRO
                       NÃO → ↓
                              ▼
                  3+ tipos de usuário OU 3+ integrações
                       OU regras complexas?
                       SIM → MEDIUM
                       NÃO → SMALL

Cliente AI principal? Claude Code (recomendado para começar)
Squads? Não, por enquanto
Idioma? pt-BR

Pronto. Rode aioson init.
```

---

## Próximo passo

- [Primeiro projeto do zero](./primeiro-projeto.md)
- [Em projeto existente](./projeto-existente.md)
- Curioso sobre os princípios? → [Por que ele existe](../1-entender/por-que-existe.md)
