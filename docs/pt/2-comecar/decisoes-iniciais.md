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

#### MICRO — `@setup → @product (opcional) → @dev`

- Para: scripts, automações, protótipos, apps pessoais simples.
- Não há `@analyst` nem `@architect`. Você fala direto com `@dev`.
- `@product` é opcional — você pode passar a spec direto no chat se quiser.
- Sem `@qa` no fluxo padrão (você pode invocar manualmente).

**Exemplos típicos:**
- Script Python que processa CSV
- Bot Telegram simples
- Página estática de portfólio
- Mini-API de 3 endpoints

#### SMALL — `@setup → @product → @analyst → @scope-check → @architect → @dev → @qa`

- Para: a maioria dos apps reais.
- Tem o ciclo completo de discovery+desenvolvimento+QA.
- Sem `@ux-ui`, `@pm` ou `@orchestrator` no fluxo padrão (você pode invocar pontualmente).

**Exemplos típicos:**
- App SaaS para um único persona
- API com auth e algumas regras
- Loja online simples
- Blog com painel admin

#### MEDIUM — workflow completo

- Para: produtos com múltiplos tipos de usuário, várias integrações, regras complexas.
- Adiciona `@ux-ui`, `@pm`, `@orchestrator`.
- Gates de qualidade aplicados em cada handoff.
- Lanes paralelas possíveis (`@orchestrator` coordena).
- Threshold de contexto mais agressivo (55% — alerta cedo).

**Exemplos típicos:**
- Marketplace (vendedor + comprador + admin)
- ERP / CRM
- Plataforma multi-tenant com cobrança por tier
- App fintech com KYC e compliance

### Casos de fronteira

| Situação | Sugestão |
|---|---|
| Projeto pessoal, mas com uma integração externa pesada | SMALL — a integração compensa o `@architect` |
| Score 1, mas sei que vou crescer | Comece MICRO. Pode promover depois com `@setup` |
| Score 4, mas time é só você | MEDIUM mesmo. As regras de negócio complexas se beneficiam dos artefatos |
| Score 2, mas é greenfield e quero design caprichado | SMALL + ative o design skill no wizard |

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

Inclui os 29 agentes oficiais (product, analyst, dev, qa, etc.). Suficiente para 95% dos projetos.

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

Disponíveis no wizard:

| Skill | Estilo | Casos |
|---|---|---|
| **Clean SaaS UI** | Limpo, tipografia clara, neutros | Painéis, dashboards |
| **Aurora Command UI** | Dark, gradientes sutis, comando central | Tools de desenvolvedor |
| **Cognitive Core UI** | Cards com peso, depth via sombras | Apps com muita info |
| **Bold Editorial UI** | Tipografia editorial, hierarquia forte | Blogs, conteúdo |
| **Warm Craft UI** | Cores quentes, textura suave | E-commerce artesanal |
| **Glassmorphism UI** | Vidro, blur, translúcido | Apps modernos premium |
| **Neo Brutalist UI** | Contornos pretos, cores fortes, sem sombra | Marcas marcantes |

**Pular** é uma opção legítima. Você pode:
- Escolher depois com `@ux-ui`
- Clonar o design de um site real com `@site-forge`
- Criar um híbrido com `@design-hybrid-forge` (ex: clean-saas + neo-brutalist)

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
| Trocar design skill | `@ux-ui` no cliente AI ou `aioson install --reconfigure` |
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
Design? Pular ou Clean SaaS UI
Idioma? pt-BR

Pronto. Rode aioson init.
```

---

## Próximo passo

- [Primeiro projeto do zero](./primeiro-projeto.md)
- [Em projeto existente](./projeto-existente.md)
- Curioso sobre os princípios? → [Por que ele existe](../1-entender/por-que-existe.md)
