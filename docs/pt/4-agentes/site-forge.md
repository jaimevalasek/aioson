# @site-forge — Clonar, reconstruir ou extrair design de qualquer URL

> **Para quem é:** quem quer replicar a estrutura ou o visual de um site real, ou extrair um design skill a partir dele.
> **Tempo de leitura:** 4 min.
> **O que você vai sair sabendo:**
> - Os 5 modos de operação e quando usar cada um
> - Como o sistema de brains melhora a fidelidade visual ao longo do tempo

---

## Para que serve

Você viu um site que tem exatamente o layout que quer. Redescrever tudo para a IA é lento e impreciso. O `@site-forge` faz o caminho inverso: **lê o site real, extrai estrutura e visual, e constrói um projeto ou design skill** a partir do que encontrou.

Além de clonar, ele aprende: cada projeto que usa o `@site-forge` pode registrar aprendizados em `.aioson/brains/site-forge/` — uma memória procedural que melhora a fidelidade de clones futuros.

---

## Quando invocar

- Você quer replicar a estrutura de um site com o seu design system
- Você quer uma cópia fiel de um site como ponto de partida
- Você quer extrair apenas o design skill de um site (sem construir código)
- Você quer misturar a estrutura de um site com um design skill num percentual específico

---

## Quando NÃO invocar

- Você quer criar um design system do zero — use `@ux-ui` ou `@design-hybrid-forge`
- O site que você quer clonar está atrás de login (o forge só acessa conteúdo público)

---

## Os 5 modos

| Modo | O que você passa | O que recebe |
|---|---|---|
| **A — Transform** | URL + skill | Site com visual do skill aplicado à estrutura clonada |
| **B — Clone fiel** | URL | Réplica fiel + design skill extraído do site |
| **C — Conteúdo** | URL + skill | Conteúdo do site encaixado no layout do skill |
| **D — Skill apenas** | URL | Só o design skill extraído — sem construir site |
| **E — Blend** | URL + skill + ratio | Estrutura clonada com tokens misturados em proporção |

---

## Diálogo típico

```
Você > @site-forge https://linear.app usando clean-saas-ui

@site-forge > Modo A — Transform detectado.
              Lendo brains... 3 nodes relevantes carregados (animações, layout SaaS, hover).
              Carregando site...

              Estrutura extraída:
              - Hero com headline centrada
              - Features em 3 colunas
              - Pricing em cards
              - CTA final

@site-forge > Aplicando clean-saas-ui à estrutura...
              Construindo Next.js...
              Projeto criado. Design skill salvo como referência.
              Novo aprendizado registrado em .aioson/brains/site-forge/visual-patterns.brain.json
```

---

## Saídas em disco

```
src/                              ← projeto Next.js (modos A, B, C, E)
.aioson/installed-skills/{slug}/  ← design skill extraído (modos B, D)
.aioson/brains/site-forge/        ← aprendizados registrados após cada clone
```

---

## Como ele lê seu projeto

- `.aioson/brains/_index.json` — índice da memória procedural (carregado na ativação)
- `.aioson/rules/` — restrições do projeto
- `.aioson/context/design-doc*.md` — contexto visual existente

---

## Handoff típico

- **Vem de:** pedido direto do usuário
- **Vai para:** `@dev` para implementar funcionalidades sobre a estrutura clonada, ou `@design-hybrid-forge` para refinar o design skill extraído

---

## Detalhes recentes

O sistema de brains (2026): cada sessão de `@site-forge` pode registrar novos nodes de aprendizado visual. Nodes com qualidade `q >= 4` se tornam o approach padrão em clones futuros. Nodes com `v === "AVOID"` são bloqueados automaticamente.

---

## Próximo passo

- Para combinar dois design skills: [design-hybrid-forge.md](./design-hybrid-forge.md)
- Para implementar funcionalidades no clone: ficha `dev.md` (em construção)
