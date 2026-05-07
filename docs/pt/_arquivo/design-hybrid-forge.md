# [Arquivado] `design-hybrid-forge`

> **Esta doc foi substituída.**
> A ficha do `@design-hybrid-forge` agora vive em [`../4-agentes/design-hybrid-forge.md`](../4-agentes/design-hybrid-forge.md).
> Para a receita prática de clonar e combinar designs, veja [`../3-receitas/clonar-design-de-site.md`](../3-receitas/clonar-design-de-site.md).
> Conteúdo abaixo preservado para referência histórica.

---

# `design-hybrid-forge`

Página canônica do fluxo de criação de skills híbridas de design do AIOSON.

Esse fluxo existe para transformar 2 skills de design já existentes em uma nova skill local do projeto, com suporte opcional a um preset visual temporário gerado por `design-hybrid:options`.

## O que ele faz

- cria uma nova skill em `.aioson/installed-skills/{slug}/`
- exige 2 skills primárias
- aceita 0 a 2 modificadores por padrão
- aceita 0 a 3 modificadores no modo avançado
- pode aplicar um overlay visual mais extravagante, clássico, animado ou CSS-forward
- registra autor, modelo e origem quando esses dados estiverem disponíveis
- preserva histórico da geração em `.aioson/context/history/design-variation-presets/`

## Fluxo recomendado

1. Escolha ou confirme as 2 skills primárias.
2. Se quiser uma direção visual mais marcada, rode `aioson design-hybrid:options`.
3. O comando monta um preset em `.aioson/context/design-variation-preset.md`.
4. O agente `@design-hybrid-forge` lê esse preset e conduz a síntese.
5. A skill final nasce em `.aioson/installed-skills/{slug}/`.
6. Depois da geração, o preset ativo deve sair do contexto e ficar só o histórico.

## Locale

O seletor usa `conversation_language` do `project.context.md` quando existir.

Se você quiser forçar a interface, use:

```bash
aioson design-hybrid:options . --locale=pt-BR
```

Use `--locale` como override, não como regra principal.

## Modificadores

Por padrão, o sistema trabalha com até 2 modificadores. Eles servem para lanes pequenas:

- motion
- textura
- tipografia
- navegação secundária
- detalhes de componentes

No modo avançado, `aioson design-hybrid:options --advanced` libera um 3º modificador. Mesmo assim, ele continua sem poder assumir substrato ou estrutura.

## Preset temporário

O arquivo `.aioson/context/design-variation-preset.md` não é configuração permanente do projeto.

Ele deve ser tratado como:

- input temporário para a próxima geração
- referência de execução para a skill híbrida
- artefato descartável após a geração

A cópia em `.aioson/context/history/design-variation-presets/` é a trilha de auditoria e pode ficar arquivada.

## Onde a skill nasce

O destino padrão é sempre:

```text
.aioson/installed-skills/{slug}/
```

Esse é o local que o AIOSON usa para skills instaladas ou geradas localmente no projeto. Se houver promoção para o core ou marketplace, isso é uma segunda etapa separada.

## Quando usar

Use esse fluxo quando você quiser:

- criar uma skill de design nova a partir de duas já existentes
- evitar resultado genérico ou "mais do mesmo"
- combinar estrutura de uma skill com a expressão visual de outra
- gerar uma skill local versionada no projeto

Não use esse fluxo para aplicar uma skill em um produto já existente. Nesse caso, use a skill final gerada em seu próprio `SKILL.md`.

---

## Como funciona o `aioson design-hybrid:options`

O comando abre um seletor interativo no terminal com 7 grupos de perguntas. Cada grupo é apresentado um de cada vez — você responde, confirma, e avança para o próximo.

### Navegação

```
↑ / ↓    mover o cursor entre opções
espaço   marcar / desmarcar uma opção
enter    confirmar as seleções do grupo atual e avançar
q        cancelar tudo
```

Cada grupo permite múltiplas seleções. Ao pressionar enter, você avança para o próximo grupo automaticamente.

---

### Grupo 1 — Modos de estilo

> Escolha de 1 a 3 atitudes visuais gerais.

| Opção | O que significa |
|-------|----------------|
| `classic-editorial` | Hierarquia medida, autoridade com serifa, luxo mais contido |
| `extravagant-maximalist` | Camadas densas, cor forte, abundância visual deliberada |
| `cinematic-immersive` | Narrativa atmosférica, contraste dramático, seções como cenas |
| `playful-dopamine` | Paletas vibrantes, energia otimista, detalhes expressivos |
| `neo-brutalist` | Arestas duras, estrutura visível, rejeição da polidez genérica |
| `retrofuturist` | Cromado, nostalgia sci-fi, otimismo arcade, futuro visto pelo passado |
| `luxury-modern` | Alto refinamento, respiro premium, ornamento seletivo, acabamento forte |
| `collage-handmade` | Ritmo de recorte, mixed media, imperfeição intencional |

---

### Grupo 2 — Movimentos de layout

> Escolha de 1 a 3 assinaturas de layout.

| Opção | O que significa |
|-------|----------------|
| `asymmetric-composition` | Peso desigual, blocos deslocados, tensão no lugar da simetria genérica |
| `narrative-scroll` | As seções se comportam como capítulos, não como pilhas de cards |
| `experimental-navigation` | Gavetas ocultas, ideias radiais, exploração em mapa, entradas não convencionais |
| `dense-mosaic` | Muitas superfícies, tamanhos variados de cards, colagem de informação |
| `split-screen` | Tensão persistente entre duas zonas visuais |
| `hero-signature` | Composição de abertura marcante que define o sistema inteiro |

---

### Grupo 3 — Sistema de motion

> Escolha de 0 a 3 direções de motion.

| Opção | O que significa |
|-------|----------------|
| `restrained-microinteractions` | Feedback preciso e funcional, sem espetáculo gratuito |
| `kinetic-typography` | Tipografia animada como camada principal de narrativa |
| `scroll-driven-scenes` | Seções animam pelo progresso do scroll, não por reveals genéricos |
| `view-transitions` | A navegação carrega continuidade entre telas e estados |
| `cursor-reactive` | Proximidade do ponteiro, profundidade no hover, highlights reativos |
| `gamified-feedback` | Mudanças de estado lúdicas, loops de recompensa, momentos de delight |

---

### Grupo 4 — Materiais e texturas

> Escolha de 0 a 3 linguagens de superfície.

| Opção | O que significa |
|-------|----------------|
| `glass-layers` | Blur, translucidez, bordas luminosas, profundidade via substrato |
| `grain-noise` | Textura controlada para quebrar a suavidade digital |
| `paper-editorial` | Superfícies quentes, ritmo de impresso, sombras e fibras sutis |
| `chrome-metallic` | Highlights especulares, acabamento de luxo futurista, reflexos |
| `soft-neumorphic` | Controles elevados/escavados com sensação tátil usados com moderação |
| `collage-cutout` | Fragmentos em camadas, bordas coladas, sensação de mixed media |

---

### Grupo 5 — Movimentos tipográficos

> Escolha de 1 a 3 direções tipográficas.

| Opção | O que significa |
|-------|----------------|
| `bold-display` | Títulos grandes com personalidade forte |
| `variable-font-axes` | Variação de peso/largura/tamanho óptico usada como material de design |
| `serif-revival` | Calor, autoridade ou profundidade cultural contra a fadiga digital |
| `mono-rails` | Labels técnicos e ritmo de metadata como dispositivo estrutural |
| `compressed-headlines` | Drama alto ou condensado para sistemas cinematográficos ou editoriais |
| `mixed-type-system` | Duas ou mais famílias com papéis bem separados |

---

### Grupo 6 — CSS avançado

> Escolha de 0 a 4 técnicas de implementação.

| Opção | O que significa |
|-------|----------------|
| `scroll-driven-animations` | Use timelines de scroll/view em CSS para lógica de cenas |
| `view-transition-api` | Carrega continuidade entre rotas ou estados da UI |
| `mask-clip-path` | Revelações não retangulares, janelas de imagem, cortes ornamentais |
| `svg-filters-noise` | Distorção, grão, displacement, imperfeição tátil |
| `backdrop-filter` | Profundidade de vidro e translucidez em camadas |
| `3d-transforms` | Cards em perspectiva, pilhas com profundidade, momentos de hero imersivos |
| `sticky-storytelling` | Capítulos fixados, revelações progressivas, narrativa encenada |

---

### Grupo 7 — Guardrails anti-mesmice

> Escolha de 2 a 4 traços que devem aparecer no resultado final.

| Opção | O que significa |
|-------|----------------|
| `avoid-generic-hero` | A seção de abertura precisa ter um movimento estrutural distintivo |
| `uneven-rhythm` | Quebre a monotonia da grade repetitiva com variação controlada |
| `domain-specific-ornament` | A linguagem visual deve vir do domínio do produto, não do clichê SaaS |
| `signature-surface` | Pelo menos um tratamento de superfície deve ser inconfundível |
| `color-courage` | Permita contraste mais forte ou paleta mais rica quando servir à identidade |
| `motion-with-purpose` | Motion precisa comunicar hierarquia ou sensação, não preencher espaço |

---

### O que o comando gera

Após as 7 telas, o seletor salva dois arquivos:

- **Ativo:** `.aioson/context/design-variation-preset.md` — lido pelo `@design-hybrid-forge` na próxima execução
- **Histórico:** `.aioson/context/history/design-variation-presets/<timestamp>.md` — trilha permanente

E exibe no terminal o bloco YAML para copiar direto ao prompt, caso prefira não usar o arquivo:

```yaml
variation_overlay:
  style_modes:
    - cinematic-immersive
    - luxury-modern
  layout_moves:
    - hero-signature
    - narrative-scroll
  motion_system:
    - scroll-driven-scenes
    - restrained-microinteractions
  materials_textures:
    - glass-layers
  typography_moves:
    - compressed-headlines
    - mixed-type-system
  advanced_css:
    - scroll-driven-animations
    - backdrop-filter
  anti_sameness:
    - avoid-generic-hero
    - signature-surface
    - motion-with-purpose
```

---

## Exemplos práticos

### Dashboard SaaS dark com vidro e comando

Perfil: produto técnico, B2B, dark mode obrigatório.

Seleções no `design-hybrid:options`:

```
Style modes:        cinematic-immersive, luxury-modern
Layout moves:       hero-signature, dense-mosaic
Motion system:      restrained-microinteractions, scroll-driven-scenes
Materials:          glass-layers
Typography:         mono-rails, bold-display
Advanced CSS:       backdrop-filter, scroll-driven-animations
Anti-sameness:      avoid-generic-hero, signature-surface, motion-with-purpose
```

Depois ativar:

```text
/design-hybrid-forge
→ skills primárias: aurora-command-ui + cognitive-core-ui
→ nome sugerido: aurora-cognitive-command
```

---

### Landing page de produto consumer com energia lúdica

Perfil: app mobile, público jovem, cor como protagonista.

Seleções no `design-hybrid:options`:

```
Style modes:        playful-dopamine, extravagant-maximalist
Layout moves:       asymmetric-composition, hero-signature
Motion system:      gamified-feedback, cursor-reactive, kinetic-typography
Materials:          grain-noise, collage-cutout
Typography:         bold-display, variable-font-axes
Advanced CSS:       view-transition-api, mask-clip-path
Anti-sameness:      color-courage, uneven-rhythm, avoid-generic-hero, domain-specific-ornament
```

Depois ativar:

```text
/design-hybrid-forge
→ skills primárias: warm-craft-ui + neo-brutalist-ui
→ nome sugerido: warm-brutalist-play
```

---

### Site editorial para marca de luxo

Perfil: marca premium, slow content, autoridade visual.

Seleções no `design-hybrid:options`:

```
Style modes:        classic-editorial, luxury-modern
Layout moves:       narrative-scroll, split-screen
Motion system:      restrained-microinteractions, view-transitions
Materials:          paper-editorial, grain-noise
Typography:         serif-revival, compressed-headlines
Advanced CSS:       sticky-storytelling, view-transition-api
Anti-sameness:      domain-specific-ornament, signature-surface, color-courage
```

Depois ativar:

```text
/design-hybrid-forge
→ skills primárias: bold-editorial-ui + clean-saas-ui
→ nome sugerido: luxury-editorial-saas
```

---

## Exemplos de uso do CLI

Criar preset visual interativo:

```bash
aioson design-hybrid:options .
```

Forçar PT-BR e modo avançado (3 modificadores):

```bash
aioson design-hybrid:options . --locale=pt-BR --advanced
```

Inspecionar o catálogo completo sem abrir a UI interativa:

```bash
aioson design-hybrid:options . --json
```

Depois, ativar a skill híbrida gerada:

```text
@design-hybrid-forge
```

ou, em clientes com slash commands:

```text
/design-hybrid-forge
```
