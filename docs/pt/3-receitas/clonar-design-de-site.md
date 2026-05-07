# Receita: Clonar ou extrair o design de um site

> **Para quem é:** desenvolvedor ou designer que quer replicar a estética de um site de referência, extrair um design system, ou combinar dois estilos num único skill.
> **Tempo de execução:** 20–60 min.
> **O que você vai ter no fim:** uma design skill reutilizável baseada no visual do site, pronta para ser aplicada em qualquer projeto AIOSON.

---

## Cenário

Você viu um site com um visual que combina perfeitamente com seu produto. Não quer copiar o conteúdo — quer entender o sistema visual: as cores, tipografia, espaçamentos, padrões de componentes. E quer usar isso como um skill que os agentes AIOSON aplicam automaticamente nos próximos projetos.

Ou: você quer combinar dois estilos. O minimalismo clean de um site com a seriedade editorial de outro. O `@design-hybrid-forge` resolve isso depois do `@site-forge`.

---

## Os dois agentes desta receita

**`@site-forge`** — clona, extrai ou transforma o visual de qualquer URL. Tem cinco modos (veja abaixo). Usa **brains** (memória procedural) para aplicar técnicas aprendidas de sessões anteriores.

**`@design-hybrid-forge`** — combina dois design skills existentes num único skill híbrido. Calcula um "ponto de tensão" entre as duas estéticas e gera tokens e instruções de composição.

---

## Pré-requisitos

- AIOSON instalado no projeto
- Claude Code (ou outro cliente AI com acesso à web para o `@site-forge`)
- A URL do site de referência (pode ser qualquer site público)

---

## Modo A — Transformar um site clonado com sua estética

Você quer reconstruir a estrutura de um site com um skill visual diferente. Exemplo: clonar a estrutura de documentação do Stripe mas com o estilo Aurora Command UI.

```
Você > @site-forge https://stripe.com/docs/api com aurora-command-ui

@site-forge > Modo A — Transform detectado.
              URL: stripe.com/docs/api
              Skill alvo: aurora-command-ui

              Fase 1: Extraindo estrutura...
              Seções identificadas: NavSidebar, ContentArea, CodeBlock, APIEndpoint,
                                    SearchBar, BreadcrumbNav, VersionBadge

              Fase 2: Carregando brains...
              [site-forge/visual-patterns.brain.json] — 14 nodes carregados
              Nó relevante: "dark-sidebar-patterns" (quality 5) — aplicando

              Fase 3: Aplicando aurora-command-ui à estrutura clonada...
              Gerando: Next.js + Tailwind
              Tokens aplicados: bg-gray-950 (fundo), text-violet-400 (accent),
                                font-mono (código), border-gray-800 (separadores)

              Fase 4: Gravando nova skill no brain...
              Brain atualizado: site-forge/visual-patterns.brain.json

@site-forge > Projeto criado em meu-projeto/
              Design skill: aurora-command-ui aplicada ✓
```

---

## Modo B — Clone fiel + extrair um novo skill do site

Você quer uma réplica fiel do visual do site E quer que isso vire uma skill reutilizável.

```
Você > @site-forge https://linear.app

@site-forge > Sem skill especificado — Modo B — Faithful clone + skill forge.

              Posso: (1) clonar o site fielmente, (2) extrair apenas o design skill.
              O que prefere?
Você > Extrair apenas a design skill — não preciso do clone completo

@site-forge > Modo D — Skill forge only.

              Analisando linear.app...
              Paleta extraída:
                Primária: #5E6AD2 (roxo médio)
                Fundo: #16161D (quase preto)
                Superfície: #1F1F28 (cinza escuro)
                Texto: #E8E8F0 (quase branco)
                Accent: #5B8AF5 (azul)

              Tipografia: Inter, size base 14px, leading relaxed
              Espaçamento: multíplos de 4px
              Raio: 6px (componentes), 0px (separadores)
              Sombra: sutil, apenas no hover

              Padrões de componentes identificados:
                - ListItem com ícone à esquerda + metadata à direita
                - Badge minimal (sem borda, apenas background)
                - Sidebar colapsável com ícones monocromáticos

              Design skill criada: .aioson/skills/design/linear-inspired-ui/
              Para usar em projeto: adicione "design_skill: linear-inspired-ui"
              em project.context.md.

@site-forge > Brain atualizado com 3 novos nodes sobre dark minimal patterns.
```

---

## Modo E — Combinar dois sites com blend ratio

Você quer 70% do visual do site A e 30% do site B.

```
Você > @site-forge https://vercel.com com aurora-command-ui --blend 70

@site-forge > Modo E — Blend detectado.
              Blendando vercel.com (70%) com aurora-command-ui (30%)...
              [extração + combinação de tokens]
              Skill híbrida criada: vercel-aurora-blend-ui
```

---

## Criar um híbrido de dois skills existentes

Se você já tem dois skills no projeto e quer uma combinação:

```
Você > @design-hybrid-forge

@design-hybrid-forge > Quais são os dois skills "pais"?
Você > clean-saas-ui e neo-brutalist-ui

@design-hybrid-forge > Eixo de tensão: minimalismo vs. impacto visual.
                        Analisando tokens dos dois...

                        Decisões de blend:
                        - Tipografia: Inter (clean) mas peso 700+ (neo) → tensão no heading
                        - Cor: paleta neutra (clean) com um accent bold preto/amarelo (neo)
                        - Bordas: 4px radius (clean) nos cards, 0px (neo) nos botões primários
                        - Sombra: presente nos cards (clean), ausente nos botões (neo)

@design-hybrid-forge > Skill híbrida criada: clean-neo-contrast-ui
                        Salva em .aioson/skills/design/clean-neo-contrast-ui/
                        Inclui: tokens, instruções de composição, exemplos de componentes.
```

---

## O sistema de brains (memória visual)

O `@site-forge` aprende com cada clone. Quando extrai padrões visuais, grava nodes em `.aioson/brains/site-forge/visual-patterns.brain.json`. Cada node tem:

- `q` — quality score (1–5). Nodes com `q >= 4` são aplicados como padrão.
- `v` — "AVOID" para anti-padrões conhecidos.
- `see[]` — links para nodes relacionados.

Na próxima vez que você clonar um site com características similares (dark sidebar, typography editorial, glassmorphism), o `@site-forge` consulta o brain antes de inventar uma solução do zero. Você acumula conhecimento visual entre projetos.

---

## O que ficou em disco (rastreio)

```
.aioson/
├── skills/design/
│   ├── linear-inspired-ui/        ← novo skill extraído do linear.app
│   │   ├── system.md              ← tokens, tipografia, componentes
│   │   └── manifest.json          ← metadados do skill
│   └── clean-neo-contrast-ui/     ← híbrido gerado
└── brains/
    └── site-forge/
        └── visual-patterns.brain.json   ← memória acumulada
```

---

## Variações

| Situação | Ajuste |
|---|---|
| Quero o clone em Astro/Vue/Svelte | Diga no prompt. `@site-forge` adapta o output. |
| Quero apenas os tokens sem o código | Use Modo D (skill forge only) com `--no-build`. |
| Quero combinar 3 skills | Faça em dois passos: híbrido de A+B, depois híbrido do resultado com C. |
| Quero publicar a skill criada | Siga [Publicar no aioson.com](./publicar-no-aioson-com.md). |

---

## Quando NÃO usar

- Para copiar conteúdo protegido (texto, imagens de terceiros). O `@site-forge` clona estrutura e visual, não conteúdo proprietário.
- Para clonar sistemas de login ou áreas autenticadas — escopo proibido.
- Para projetos puramente de API sem nenhuma interface visual — não faz sentido.

---

## Solução de problemas

| Problema | Solução |
|---|---|
| `@site-forge` não conseguiu acessar a URL | Confirme que a URL é pública e acessível. Sites com Cloudflare agressivo podem bloquear. |
| Skill extraída tem cores incorretas | O site usa CSS-in-JS dinâmico que dificulta extração estática. Ajuste os tokens manualmente em `system.md`. |
| Híbrido ficou sem identidade visual clara | Experimente blend ratio diferente. Se os dois skills são muito similares, o resultado será genérico. |
| Brain não foi atualizado | Ative `@site-forge` e peça explicitamente: "salve os padrões visuais extraídos no brain". |

---

## Próximo passo

- Aplicar a nova skill num projeto: mencione `design_skill: <nome>` em `project.context.md` ou diga ao `@ux-ui`.
- Publicar a skill: → [Publicar no aioson.com](./publicar-no-aioson-com.md)
- Construir uma landing com a skill: → [Landing page](./landing-page.md)
