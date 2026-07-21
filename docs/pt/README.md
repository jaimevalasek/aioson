# Documentação AIOSON — Português

> **AIOSON** é um framework que dá a cada sessão de IA um **papel**, um **protocolo** e um **ciclo de vida**.
> Em vez de um único prompt gigante tentando fazer tudo, agentes especializados se revezam: cada um cuida de uma fatia (descobrir, planejar, implementar, testar, revisar) e passa o bastão para o próximo de forma limpa.

Esta é a porta de entrada da documentação em português. Não é um índice alfabético — é um **mapa por trilhas**. Escolha a sua e siga.

---

## Trilhas — escolha a sua

### Sou novo aqui, quero entender em 15 minutos
1. [O que é AIOSON](./1-entender/o-que-e-aioson.md) — analogia simples e o que ele resolve
2. [Por que ele existe](./1-entender/por-que-existe.md) — o problema do prompt-monolito
3. [Mapa do ecossistema](./1-entender/mapa-do-ecossistema.md) — diagrama dos agentes

### Quero usar agora, num projeto
1. [Primeiro projeto do zero](./2-comecar/primeiro-projeto.md) — passo a passo, com diálogos reais
2. [Em projeto existente](./2-comecar/projeto-existente.md) — install + scan + primeira feature
3. [Decisões iniciais](./2-comecar/decisoes-iniciais.md) — MICRO, SMALL ou MEDIUM? Qual cliente AI?

### Quero uma receita pronta para o meu caso

**Trilhas canônicas — como features chegam ao dev:**
1. **[Feature completa com @sheldon](./3-receitas/feature-completa-com-sheldon.md)** — as duas trilhas: **SMALL lean** `@product → @sheldon → @dev → @qa` e **MEDIUM maestro** `@product → @orchestrator → @dev → @pentester → @qa` (com detours opt-in de `@tester`, `@validator`)
2. [Da ideia ao PRD via @briefing](./3-receitas/da-ideia-ao-prd-via-briefing.md) — quando a ideia ainda é vaga
3. [Plans externos para @product](./3-receitas/plans-externos-para-product.md) — quando você planejou em ChatGPT/Claude.io e quer trazer

**Por cenário:**
4. [Landing page](./3-receitas/landing-page.md) — `@product` → `@ux-ui` → `@dev` → `@qa`, com `@copywriter` opcional
5. [App SaaS do zero](./3-receitas/app-saas-do-zero.md) — workflow MEDIUM completo, auth + billing + admin
6. [Integração em codebase grande](./3-receitas/integracao-em-codebase-grande.md) — install + `@discover` + `@analyst` em legacy
7. [Refatoração grande](./3-receitas/refatoracao-grande.md) — `@sheldon` antes do `@dev`, ciclo autônomo QA→Dev
8. [Auditoria de segurança](./3-receitas/auditoria-seguranca.md) — `@pentester` end-to-end (OWASP + LLM Top 10 + supply chain)
9. [Publicar no aioson.com](./3-receitas/publicar-no-aioson-com.md) — `system:package` + `system:publish` (com `--invite`)
10. [Clonar design de site](./3-receitas/clonar-design-de-site.md) — `@site-forge` + `@design-hybrid-forge`
11. [Continuidade entre sessões](./3-receitas/continuidade-entre-sessoes.md) — feature dossier, dev-resume, drift detection

### Quero a referência técnica de um agente ou comando
- **[Fichas dos 29 agentes (30 entradas com 1 alias)](./4-agentes/README.md)** — uma ficha por agente, com diálogo típico, saídas em disco e handoff
- **[Referência técnica completa](./5-referencia/README.md)** — 34 docs organizados em 5 categorias (novos 2026, artefatos, CLI/config, agentes/squads, skills/design)
- [Guia de agentes (legado)](./agentes.md) — visão tabular alternativa

#### Destaques de `5-referencia/` (features 2026 sem doc PT antes)
- [Feature Dossier](./5-referencia/feature-dossier.md) — pasta única de feature: spec, plano, status, pesquisas
- [Agent-chain continuity](./5-referencia/agent-chain-continuity.md) — handoff v2, dev-resume, drift detection
- [SDD Framework](./5-referencia/sdd-framework.md) — Constitution, project-pulse, skill `aioson-spec-driven`
- [Live Sessions](./5-referencia/live-sessions.md) — sessões rastreadas com tmux, status bar, handoff
- [Secure by Default](./5-referencia/secure-by-default.md) — baseline `SEC-SBD-01..08` + `git:guard`
- [aioson.com Store](./5-referencia/aioson-com-store.md) — publish/install de squads, genomes, skills
- **[Memória Viva](./living-memory/README.md)** — bootstrap auto-atualizado + autonomy contract (3 tiers) + `notify` (ℹ/⚠/⛔) + 5 checks novos no doctor
- **[Active Learning Loop](./active-learning-loop/README.md)** — destilação automática no `feature:close` + busca BM25 em learnings + archive/restore com `evolution_log` + 3 novos checks de curadoria no doctor
- **[Deyvin Sub-Task Scout](./deyvin-subtask-scout/README.md)** — primitiva de diagnóstico estruturado do `@deyvin`: `scout:prep/validate/commit`, contexto isolado, caps configuráveis, archivamento por feature
- **[Execução de subagentes](./5-referencia/agent-execution.md)** — manifesto por feature, aliases de modelo, `reasoning_effort`, fallback e telemetria auditável
- **[Memória do operador](./5-referencia/operator-memory.md)** — decisões por identidade, promoção por tipo de sinal e reforço idempotente

### Arquivo histórico
[`_arquivo/`](./_arquivo/) — versões anteriores das docs, preservadas com nota de redirect para o novo equivalente. Nenhum conteúdo foi perdido.

---

## Glossário rápido

Termos que aparecem o tempo todo. Versão expandida em [`1-entender/glossario.md`](./1-entender/glossario.md).

| Termo | O que é |
|---|---|
| **Agente** | Uma personagem especialista (`@product`, `@dev`, `@qa`...) com prompt e regras próprias |
| **Squad** | Um grupo de agentes customizados criado por você para um domínio específico |
| **Genome** | "DNA cognitivo" de uma persona — usado para criar advisors com personalidade |
| **Skill** | Um pacote de instrução plugável (design system, processo, conhecimento de domínio) |
| **Dossier** | Pasta de uma feature: spec, plano, decisões, status — tudo num só lugar |
| **Classificação** | MICRO / SMALL / MEDIUM — define o quanto de processo o projeto precisa |
| **Constitution** | 6 princípios que todo agente respeita — não pode ser sobrescrito |

---

## Em três comandos

```bash
# 1. Instale na sua máquina (uma vez)
npx @jaimevalasek/aioson init meu-projeto

# 2. Entre no projeto
cd meu-projeto

# 3. Abra seu cliente AI (Claude Code, Codex e OpenCode) e digite:
/aioson:agent:setup
```

A partir daí, os agentes guiam você. Detalhes em [Primeiro projeto do zero](./2-comecar/primeiro-projeto.md).

---

## Outras línguas

Atualmente só PT está em reforma. EN/ES/FR continuam usando os arquivos legados em `docs/en/`. Próxima fase: replicar esta estrutura para `docs/en/`.

---

## Status desta documentação

**Fase A (entender + começar)** — concluída · 8 docs em `1-entender/` e `2-comecar/`.
**Fase B (receitas práticas + ficha por agente)** — concluída · 11 receitas em `3-receitas/` + 29 fichas em `4-agentes/`.
**Fase C (referência técnica completa)** — concluída · 34 docs em `5-referencia/`, incluindo execução de subagentes, memória do operador e Review Intelligence atualizadas para a versão 1.39.0.
**Fase D (trilhas de workflow)** — concluída · 3 trilhas canônicas de feature: briefing→PRD, plans externos, e trilha completa com @sheldon.

**Métricas finais:** 85 docs, ~96.000 palavras, 5 trilhas, 16 arquivos legados preservados em [`_arquivo/`](./_arquivo/) com redirects.

Próximos passos do projeto de docs (fora desta entrega):
- Replicar a estrutura em `docs/en/` (atualmente legacy)
- Replicar em `docs/es/` e `docs/fr/`
- Adicionar diagramas SVG opcionais (hoje só ASCII)
