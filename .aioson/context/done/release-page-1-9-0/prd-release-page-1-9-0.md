---
slug: release-page-1-9-0
classification: MICRO
status: in_progress
created_at: 2026-05-18
owner: product
---

# PRD — Release Page v1.9.0

## Vision
Página HTML estática em `tutorials/releases/1-9-0/` que narra os 10 dias de evolução que culminaram no AIOSON v1.9.0, mais polish dos 4 tutoriais existentes pra deixar a pasta `tutorials/` coerente.

## Problem
O AIOSON evoluiu intensamente entre 2026-05-07 e 2026-05-17 (Living Memory, Brains procedural, Active Learning Loop, hardening de segurança R4-7, lay-user mode, dev-state-producer, cross-platform Windows). Quem chega no repo via `tutorials/` hoje vê 4 páginas HTML soltas, sem narrativa do que o framework virou e sem ponto de entrada que mostre evolução. A nova release v1.9.0 ficou sem porta de entrada.

## Users
- **Dev avaliando AIOSON pela primeira vez**: precisa entender em <3min o que o framework faz hoje e por que evoluiu desse jeito.
- **Usuário existente migrando pra v1.9.0**: quer saber o que mudou, o que ganhou, o que precisa atualizar.
- **Você (futuro you)**: copia manualmente esta página depois pra `aioson-com` quando o site estiver pronto pra receber a seção `/docs`.

## MVP scope

### Must-have 🔴
- **Página release `tutorials/releases/1-9-0/index.html`** com 6 blocos:
  1. **Hero** — "AIOSON v1.9.0 — Living Memory Era" + data release + tagline curta + CTA (GitHub / install)
  2. **Métricas** — 2500 tests / 15 features done / 0 blockers / 10 dias / 3 brains indexed
  3. **Timeline visual dos 10 dias** — eixo cronológico 2026-05-07→17 com commits temáticos marcados
  4. **Evolução por tema (cards)** — 7 áreas: Living Memory, Brains procedural, Active Learning Loop, Hardening Security (R4-7), Cross-platform Windows, Lay-User Mode + dev-state-producer, Genomes/copywriting
  5. **What's next** — pontas soltas confirmadas: autonomy v1.1 cross-project, harness-isolation, dev.md kernel <15KB
  6. **CTAs finais** — install / GitHub / próximas releases
- **Apêndice: Changelog técnico completo** ao final da página — lista bruta de commits 2026-05-07→17 agrupados por feature.
- **Snippets de comando ancorados** dentro dos cards temáticos quando aplicável (ex: `/discover`, `aioson memory:status`, `aioson brain:query`, `aioson notify`, `aioson dev:state:write`).
- **`tutorials/index.html` redesenhado como hub** — lista os 4 tutoriais existentes (SDD index, SDD automation, Squads) + nova seção "Releases" linkando v1.9.0.
- **Estrutura de pastas `tutorials/releases/{version}/`** criada e documentada (próximo release vai em `tutorials/releases/1-10-0/`).

### Should-have 🟡
- **Polish visual dos 4 tutoriais existentes** — header/footer/CSS uniformes, ajustes de espaçamento, paleta consistente com a nova página release. Sem revisão de conteúdo.
- **Microinterações leves** — fade-in on scroll nos cards de evolução, hover nos CTAs. CSS puro, sem JS pesado.

## Out of scope
- **Projeto `aioson-com`** — qualquer trabalho cross-repo. Você copia manualmente depois.
- **i18n** — página em pt-BR ou en (decisão tática do @dev), sem framework de tradução.
- **MDX, build pipeline, framework de docs** — HTML estático puro, abre em `file://`.
- **Revisão de conteúdo dos 4 tutoriais existentes** — só polish visual, não rescrita.
- **Design skill formal / `@ux-ui` dedicado** — `@dev` implementa o visual reusando padrões do que já existe em `tutorials/`.
- **Page de release pra v1.10.0+** — só v1.9.0 nesta feature; a estrutura preparada acomoda as próximas.
- **Screenshots/vídeos** — pode incluir se trivial; não bloqueia.
- **Versionamento de docs estilo Mintlify** — não aplica.
- **Search / sidebar / breadcrumb global** — hub é uma lista plana.

## User flows

### Visitante chegando pela home
User abre `tutorials/index.html` → vê hub com seções "Tutoriais" (SDD, Squads) e "Releases" (v1.9.0) → clica no card v1.9.0 → cai em `tutorials/releases/1-9-0/index.html` → lê hero + métricas → scrolla por timeline e cards de evolução → vê snippets de comando ancorados → chega no CTA final → opcionalmente expande apêndice changelog técnico.

### Migrando entre versões
User googla "aioson v1.9.0 changelog" → cai direto na release page → busca a seção "What's next" pra saber se atualizar agora vale a pena.

## Success metrics
- **Página standalone**: `tutorials/releases/1-9-0/index.html` abre em `file://` e fica visualmente íntegra sem build, sem servidor.
- **Visual consistente**: header/footer/cores da nova página e dos 4 tutoriais existentes saem do mesmo CSS compartilhado (1 arquivo).
- **Cobertura do escopo**: 7 áreas de evolução nomeadas e cobertas; apêndice changelog reflete `git log --since="2026-05-07"`; ≥5 snippets de comando reais e copiáveis.
- **Time-to-comprehension**: leitor consegue resumir em uma frase "o que o AIOSON v1.9.0 ganhou" depois de skimming de 60s. (Heurística — não medido formalmente.)

## Open questions
- **Tom da copy do hero e dos cards** — `@dev` define com base no resumo da conversa anterior (`@neo` já consolidou) sem novo trabalho de copywriter.
- **Acessibilidade**: nível mínimo viável (contraste WCAG AA, alt text em ícones, html semântico). Sem audit formal.
- **CSS compartilhado**: arquivo único em `tutorials/_assets/style.css` ou inline por página? Decisão de @dev na hora.

## Visual identity

### Design skill
`pending-selection` — sem design skill formal. `@dev` reusa padrões visuais já presentes em `tutorials/sdd/automation.html` (referência) e padroniza a partir dali. Sem leitura de `.aioson/skills/design/{skill}/SKILL.md`.

### Aesthetic direction
Editorial técnico — densidade informativa, leitura confortável, hierarquia clara. Inspiração: Stripe Press / Vercel changelog / Linear release notes. Sem decoração gratuita.

### Color & theme
Reusa paleta dos tutorials existentes. Se inexistente/inconsistente, `@dev` propõe uma paleta neutra (dark-mode-first opcional) durante implementação. Decisão fica registrada em `spec-release-page-1-9-0.md` se criado.

### Typography
Reusa stack existente em `tutorials/`. Tendência segura: system font stack + monospace pra code blocks. `@dev` confirma na hora.

### Motion & interactions
Mínimas: fade-in scroll nos cards (intersection observer simples), hover states em CTAs/cards, anchor scroll suave entre seções. Sem libs externas.

### Component style
- **Cards** pros 7 temas de evolução (grid responsivo)
- **Timeline** vertical ou horizontal em CSS puro (sem libs)
- **Code blocks** pros snippets — monospace, highlight básico opcional
- **Metric tiles** pros números (2500 / 15 / 0 / 10 / 3)
- **Hero** com gradient sutil ou background pattern leve

### Quality bar
- Standalone HTML que abre em `file://` (zero build)
- Visual íntegro sem JS quebrar (JS é progressive enhancement)
- Mobile-friendly até 360px de largura
- Tempo de leitura informado (cabeçalho da página: "~4 min")
- Apêndice changelog colapsável (`<details>` nativo)
