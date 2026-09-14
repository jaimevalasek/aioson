# AIOSON Design-DNA v1 — Tinta & Ouro

> Autoridade visual do ecossistema: site, AIOSON Play, Cockpit, Capture, AudioText e apps do catálogo.
> Origem: exploração `aioson-ecosystem-identity` · variant-d · rodadas 9–11 (2026-08-11/12).
> Tokens executáveis: `tokens.css` (web) e `tokens.json` (qualquer runtime).
> Demonstração navegável: `../prototype.html#/dna`.

## Tese

Uma assinatura, todos os softwares. O concorrente direto é dono do preto-absoluto + laranja + verde-neon + pixel; o AIOSON não disputa esse uniforme — ocupa o espaço que ninguém tem: **forja e orquestra**. Fundo de tinta quente (nunca azul), luz de porcelana (nunca branco frio), e o ouro como batuta da marca.

## Fundamentos

| Token | Tinta (dark, padrão) | Porcelana (light) | Papel |
|---|---|---|---|
| `tinta` | `#0B0A08` | `#F1EDE3` | fundo |
| `superficie` / `-2` / `solido` | `#161310` / `#1D1914` / `#242019` | `#F9F6EE` / `#FFFDF7` | cards, painéis, menus |
| `marfim` / `-2` | `#F5F1E8` / `#CDC5B4` | `#1C1710` / `#4C4436` | texto |
| `fumaca` | `#8F8674` | `#7D7362` | apoio, metadados |

Regra dura: **nenhum azul estrutural**. Cinzas são quentes; o único frio da família é a prata — e ela é acento, nunca fundo.

## Materiais — seis metais e uma pedra

| Material | Dono | Tinta | Porcelana | História |
|---|---|---|---|---|
| **Ouro** | Marca · ação primária · gates | `#E8BA52` | `#8A6512` | A batuta. Nenhum produto o toma para si. |
| **Cobre** | AIOSON Play | `#D8895B` | `#A55A30` | A forja: onde a construção acontece. |
| **Patina** | AIOSON Cockpit · estado vivo | `#6EC6A2` | `#177A58` | Operação estável; o metal de tudo que está no ar. |
| **Prata** | Protótipos · Squads | `#B3C2D6` | `#5C6D80` | O rascunho e a estrutura. |
| **Rosé** | Genomes | `#D18D80` | `#A15A55` | O organismo aplicado ao squad. |
| **Nióbio** | AIOSON Capture | `#B49BD8` | `#6C4E9B` | O metal que muda de cor conforme a luz. |
| **Granada** | AIOSON AudioText | `#C9697A` | `#9C3F52` | A única pedra: a voz humana não sai da forja. |

Regras: um metal por contexto; o gate fala em ouro (gate é decisão humana); vivo/sucesso fala em patina; erro fala em `perigo` (`#E25D5D` / `#BF3D47`). Material novo só com software novo.

## As três vozes

| Voz | Tipo | Uso |
|---|---|---|
| **Estrutura** | Sans (Inter/Segoe/system) | Títulos, navegação, corpo — a voz neutra. |
| **Intenção humana** | Serif itálico (Georgia/system) | Sempre curta, sempre no metal do contexto. Marca o momento em que uma pessoa decide. **A máquina nunca fala em serif.** |
| **Máquina** | Mono (JetBrains Mono/Cascadia) | Eyebrows, chips, versões, evidência, custo. **A intenção nunca fala em mono.** |

## Dispositivos

- **D-01 · Batuta** — o traço do eyebrow surge do nada e acelera (`linear-gradient(90deg, transparent, currentColor)`, 26×2px).
- **D-02 · Pauta** — cinco linhas finas (1px a cada 8px) dividem seções e o rodapé, com o compasso de 2px no metal da rota.
- **D-03 · Palavra viva** — a headline digita o objeto da frase em serif itálico, no metal da rota que ela nomeia; a palavra é um link.
- **D-04 · Poeira de ouro** — nebulosa no metal da rota + fagulhas ouro/cobre atrás de cada hero; respiram em 8s no escuro, ficam estáticas na porcelana e com `prefers-reduced-motion`. **Nunca um campo de estrelas literal** (território do concorrente).

## Aplicação nos softwares

- O shell de cada software usa tinta + neutros + **o próprio metal**; ouro aparece só nos momentos de marca e gate.
- Semântica de terminal (verde=sucesso, vermelho=erro, aviso=cobre) sobrevive dentro dos panes em qualquer produto — a patina É o verde de sucesso da família.
- Abas internas do Play: cada app com o ponto do seu material; o ativo sublinha em cobre.
- Screenshots antigos (identidade azul) são evidência de migração pendente, nunca base para novos componentes.

## Não fazer

- Não reintroduzir cyan `#00B5FF`, violet `#AA56FF`, coral `#FF796D`, amber `#FFB84D`, mint `#55E6B2` ou qualquer fundo azulado.
- Não usar vermelho/preto + neon do concorrente; diferenciação é a posição.
- Não dar ouro a um produto, nem serif à máquina, nem mono à intenção.
- Não criar material novo sem software novo que o justifique.
