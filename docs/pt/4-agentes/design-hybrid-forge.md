# @design-hybrid-forge — Combinar dois design skills num híbrido original

> **Para quem é:** quem tem dois design skills mas quer o melhor dos dois mundos num único sistema visual coerente.
> **Tempo de leitura:** 4 min.
> **O que você vai sair sabendo:**
> - Como o processo de fusão funciona
> - O que "tensão criativa" significa na prática

---

## Para que serve

Nenhum design skill pronto cobre exatamente o que você precisa. O Clean SaaS UI é limpo demais para a sua marca assertiva. O Neo Brutalist é forte demais para os seus clientes corporativos. O `@design-hybrid-forge` funde dois skills primários — respeitando regras de compatibilidade entre pares — e gera um **terceiro skill instalável** com identidade própria, tokens definidos, e previews HTML para aprovação visual.

O hybrid resultante é local ao seu projeto (em `.aioson/installed-skills/`) por padrão. Você pode promovê-lo ao aioson.com se quiser compartilhar.

---

## Quando invocar

- Nenhum skill nativo atende sozinho
- Você quer criar uma identidade visual diferenciada para o projeto
- Você tem um preset de variação definido em `design-variation-preset.md`

---

## Quando NÃO invocar

- Um skill nativo já cobre — criar hybrid sem necessidade gera overhead de manutenção
- Você quer clonar o visual de um site real — use `@site-forge` (modo D ou B)
- Você não sabe quais skills usar — peça ajuda ao `@ux-ui` antes

---

## Diálogo típico

```
Você > @design-hybrid-forge

@design-hybrid-forge > Skills disponíveis:
                       - clean-saas-ui
                       - aurora-command-ui
                       - cognitive-core-ui
                       - bold-editorial-ui
                       - warm-craft-ui
                       - glassmorphism-ui
                       - neo-brutalist-ui
                       + installed-skills/...

                       Escolha 2 primários para fundir:
Você > bold-editorial-ui + clean-saas-ui

@design-hybrid-forge > Verificando compatibilidade...
                       Par válido. Tensão criativa:
                       Bold: tipografia grande, hierarquia forte, ausência de neutralidade
                       Clean: espaço branco, clareza funcional, controle
                       Substrate winner: Clean (estrutura de layout)
                       Acento Bold: peso tipográfico e cor de destaque

                       Nome sugerido: "editorial-saas-ui"
Você > aceito

@design-hybrid-forge > Gerando...
                       .aioson/installed-skills/editorial-saas-ui/SKILL.md       ✓
                       .aioson/installed-skills/editorial-saas-ui/previews/*.html ✓
                       Mirrored para .claude/skills/editorial-saas-ui/            ✓
```

---

## Saídas em disco

```
.aioson/installed-skills/{hybrid-name}/
├── SKILL.md
├── references/
├── previews/{hybrid-name}.html
├── previews/{hybrid-name}-website.html
└── .skill-meta.json

.claude/skills/{hybrid-name}/       ← mirror Claude Code
.cursor/skills/{hybrid-name}/       ← mirror Cursor (se existir)
.windsurf/skills/{hybrid-name}/     ← mirror Windsurf (se existir)
```

---

## Como ele lê seu projeto

- `.aioson/skills/design/` e `.aioson/installed-skills/` — lista de skills disponíveis
- `.aioson/context/design-variation-preset.md` — preset de variação (se existir, é carregado antes de qualquer pergunta)
- `references/pair-compatibility.md` — regras de compatibilidade entre pares
- `references/crossover-protocol.md` — protocolo de fusão

---

## Comandos CLI relacionados

```bash
# Ver opções de variação disponíveis
aioson design-hybrid:options
```

---

## Handoff típico

- **Vem de:** `@ux-ui` (quando nenhum skill nativo serve) ou pedido direto
- **Vai para:** `@dev` ou `@site-forge` — o skill híbrido é usado como design system nas implementações

---

## Próximo passo

- Para clonar design de um site real: [site-forge.md](./site-forge.md)
- Para aplicar o skill num build: ficha `ux-ui.md` (em construção)
