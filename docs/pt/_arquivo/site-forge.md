# [Arquivado] `site-forge`

> **Esta doc foi substituída.**
> A ficha do `@site-forge` agora vive em [`../4-agentes/site-forge.md`](../4-agentes/site-forge.md).
> Para a receita prática, veja [`../3-receitas/clonar-design-de-site.md`](../3-receitas/clonar-design-de-site.md).
> Conteúdo abaixo preservado para referência histórica.

---

# `site-forge`

Agente de clonagem inteligente do AIOSON — estuda um site real e reconstrói como projeto Next.js, forja uma skill de design, ou ambos.

## O que ele faz

- recebe uma URL e guia você até o modo certo com um **questionário de onboarding**
- captura screenshots, assets (img, background-image, srcset, lazy-loaded, video) via browser MCP
- faz crawl de links internos para capturar assets e padrões de sub-páginas
- extrai estrutura, comportamento e interações
- forja design skills, mescla tokens, ou aplica skills existentes conforme o modo escolhido
- constrói um projeto Next.js com worktrees paralelas

## Pré-requisitos

### 1. Browser MCP

O agente precisa de automação de browser para navegar, capturar screenshots, disparar lazy loads e testar interações. Configure um antes de usar:

```bash
# Playwright MCP (recomendado)
npx @playwright/mcp@latest

# Puppeteer MCP (alternativa)
npx @modelcontextprotocol/server-puppeteer
```

Adicione o browser MCP escolhido nas configurações de MCP do seu cliente AI. O agente detecta automaticamente qual está disponível.

### 2. Design skill (quando aplicável)

Modos que usam uma skill existente precisam de uma skill já instalada. Use uma das skills nativas:

```text
.aioson/skills/design/aurora-command-ui/
.aioson/skills/design/cognitive-core-ui/
.aioson/skills/design/glassmorphism-ui/
.aioson/skills/design/bold-editorial-ui/
.aioson/skills/design/neo-brutalist-ui/
.aioson/skills/design/warm-craft-ui/
.aioson/skills/design/clean-saas-ui/
```

Ou use uma skill gerada pelo `@design-hybrid-forge`:

```text
.aioson/installed-skills/{slug}/
```

## Modos de operação

O agente tem **5 modos**. Se você não especificar o modo, ele roda o **onboarding inteligente** e te guia até o certo.

| Modo | Entrada | Output |
|------|---------|--------|
| **A — Transform** | URL + skill | Site construído com a skill aplicada à estrutura clonada |
| **B — Faithful clone** | URL | Réplica fiel + nova skill forjada do site |
| **C — Content harvest** | URL + skill | Site construído com conteúdo/imagens do site + layout da skill |
| **D — Skill only** | URL | Só a skill forjada — nenhum site é construído |
| **E — Blend** | URL + skill + ratio | Site com tokens misturados entre o site e a skill |

## Onboarding inteligente

Quando você chamar `/aioson:agent:site-forge` sem especificar o modo, o agente pergunta:

```
O que você quer fazer com este site?

  A — Extrair conteúdo e imagens → construir um novo site com uma das suas skills
  B — Clonar fielmente → réplica visual + forjar uma skill com o design do site
  C — Extrair somente o design (CSS, animações) → criar uma skill reutilizável (sem construir o site)
  D — Clonar com textos e imagens originais + mesclar com uma das suas skills (50/50)
```

Depois coleta os dados que faltam (URL, skill, ratio) e já avança.

## Como invocar

```text
/aioson:agent:site-forge <url> <skill>              → Modo A (transform)
/aioson:agent:site-forge <url>                      → Onboarding guiado
/aioson:agent:site-forge <url> --skill-only         → Modo D (só a skill)
/aioson:agent:site-forge <url> <skill> --blend      → Modo E (blend 50/50)
/aioson:agent:site-forge <url> <skill> --blend=70   → Modo E (70% site / 30% skill)
```

Com flags opcionais:

```text
--viewport=desktop    # só desktop (padrão: todos os três)
--no-download         # pular download de assets
--no-crawl            # pular crawl de links internos
--crawl-depth=N       # seguir N níveis de links (padrão: 1)
--output=./dir        # diretório customizado
--verbose             # log detalhado
```

## Extração de assets melhorada

O agente captura imagens de **todas as fontes**, não só `<img>`:

- `<img>` com `srcset` e `data-src` (lazy loading)
- `background-image` em **qualquer elemento** via `getComputedStyle`
- `<picture> <source srcset>`
- `<video poster>` e `<source>` de vídeo
- `<use href>` de SVG externos
- `style=""` com `background-image` inline
- meta tags `og:image` e `twitter:image`

Antes de extrair, o agente faz scroll completo pela página para **disparar todos os lazy loads**.

## Crawl de links internos

Por padrão o agente segue links internos para capturar assets e padrões de sub-páginas:

| Modo | Links seguidos (padrão) |
|------|------------------------|
| A, C (content harvest) | até 10 |
| B, D, E | até 5 |

Use `--no-crawl` para desativar ou `--crawl-depth=N` para ajustar.

## Fluxo por fase

| Fase | O que acontece | Modos |
|------|---------------|-------|
| **0 — Preflight** | Browser MCP, skill, projeto Next.js | Todos |
| **1 — Reconnaissance** | Screenshots, deep asset extraction, crawl, interações | Todos |
| **2 — Extraction** | Spec de estrutura + conteúdo; valores estéticos (modos B/D/E) | Todos |
| **3A — Transform** | Mapa componente → skill com tokens | A, C |
| **3B — Skill forge** | Extrai design system e forja skill em `.aioson/installed-skills/` | B, D, E |
| **3E — Blend** | Mescla tokens do site com tokens da skill no ratio definido | E |
| **4 — Build** | Constrói componentes com worktrees, verifica `npm run build` | A, B, C, E |
| **5 — QA** | Screenshot diff, testes de interação, fidelidade de tokens | A, B, C, E |

**Modo D** termina após a Fase 3B — nenhum site é construído.

## Output por modo

```text
Todos os modos:
  docs/research/<hostname>/
    reconnaissance.json        ← dados da navegação
    crawl-manifest.json        ← URLs visitadas e assets por página
    structure-spec.md          ← topologia e layout
    interaction-spec.md        ← modelo de interação
    qa-report.md               ← resultado do QA (modos A/B/C/E)

Modo A, C:
    component-map.md           ← mapeamento componente → skill

Modo B, D, E:
    aesthetics-raw.json        ← valores CSS extraídos

Modo E:
    blend-map.md               ← decisões de blend por token
    blended-tokens.css         ← tokens mesclados prontos para uso

Modos A, B, C, E (constrói site):
  src/components/[todos os componentes]
  src/app/page.tsx
  src/app/globals.css
  public/images/<hostname>/[assets baixados]

Modos B, D, E (forja skill):
  .aioson/installed-skills/<hostname>/
    SKILL.md
    references/design-tokens.md
    references/components.md
    references/patterns.md
    references/motion.md
    references/websites.md
    .skill-meta.json
```

## Fluxo completo: forge + clone

O caminho mais poderoso é criar uma skill sob medida com `design-hybrid-forge` e aplicá-la.

### Passo 1 — Gerar o preset visual

```bash
aioson design-hybrid:options . --locale=pt-BR
```

### Passo 2 — Forjar a skill híbrida

```text
/aioson:agent:design-hybrid-forge
→ skills primárias: aurora-command-ui + cognitive-core-ui
→ nome: aurora-cognitive-command
```

### Passo 3 — Aplicar no clone

```text
/aioson:agent:site-forge https://datadog.com aurora-cognitive-command
```

Resultado: estrutura e interações do Datadog, visual da `aurora-cognitive-command`.

---

Veja a documentação completa do seletor interativo em: [`design-hybrid-forge.md`](design-hybrid-forge.md)

---

## Exemplos práticos

### Modo A — Clone com skill existente

```text
/aioson:agent:site-forge https://stripe.com aurora-command-ui
```

Estrutura e fluxo do Stripe, visual da `aurora-command-ui`.

---

### Modo B — Réplica fiel + nova skill

```text
/aioson:agent:site-forge https://linear.app
```

Forja uma skill em `.aioson/installed-skills/linear.app/` e constrói uma réplica fiel.

---

### Modo C — Colher conteúdo + nova estrutura com skill

Perguntar o modo via onboarding:

```text
/aioson:agent:site-forge https://framer.com
→ escolha A no onboarding
→ skill: clean-saas-ui
```

Textos e imagens do Framer, layout e visual do `clean-saas-ui`.

---

### Modo D — Só a skill, sem construir

```text
/aioson:agent:site-forge https://resend.com --skill-only
```

Forja `.aioson/installed-skills/resend.com/`. Nenhuma página é construída.

---

### Modo E — Blend 50/50

```text
/aioson:agent:site-forge https://vercel.com neo-brutalist-ui --blend
```

Tokens mesclados 50% Vercel / 50% `neo-brutalist-ui`.

---

### Blend assimétrico (70% site)

```text
/aioson:agent:site-forge https://notion.so glassmorphism-ui --blend=70
```

70% tokens do Notion, 30% tokens da `glassmorphism-ui`.

---

### Clone em projeto existente

```bash
cd meu-projeto-nextjs
/aioson:agent:site-forge https://loom.com cognitive-core-ui
```

O agente detecta o `package.json` com `next` e usa o projeto existente.

## Diferença em relação a clonar manualmente

| Aspecto | Clone manual | site-forge |
|---------|-------------|--------------|
| Extração de imagens | Só `<img>` visíveis | img + CSS bg + srcset + lazy + video + SVG |
| Sub-páginas | Ignoradas | Crawl automático |
| Estética | Replica o original | Skill tokens, blend, ou extração fiel |
| Interações | Esquecidas facilmente | Mapeadas antes de construir |
| Build | Erros no final | Verificado após cada worktree |
| QA | Manual | Screenshot diff + checklist formal |

## Nota sobre conteúdo e assets

Os textos e imagens extraídos são apenas para estruturar o clone durante o desenvolvimento. **Substitua todo o conteúdo antes de publicar.** O agente avisa ao final da Fase 1.

## Quando usar

- você quer o comportamento/layout de um site de referência
- quer prototipar rapidamente com estrutura testada
- quer extrair o design de um site como skill reutilizável
- quer mesclar o visual de um site com sua brand
- o cliente mostrou um concorrente como referência de fluxo

## Quando não usar

- o site tem proteção pesada (SPA autenticada, bot protection agressivo)
- você quer criar a estrutura do zero com total liberdade → use `/aioson:agent:deyvin` ou `/aioson:agent:dev`
