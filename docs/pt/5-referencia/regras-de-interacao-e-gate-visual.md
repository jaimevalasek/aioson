# Regras de interação e gate visual

> Quatro regras do framework definem como uma interface se comporta. O gate visual mede se o que foi construído respeita esse contrato.

O AIOSON separa duas coisas que costumam ser confundidas:

- **Estética** — paleta, tipografia, espaçamento, profundidade. É trabalho de skill de design.
- **Contrato de interação** — o que acontece quando o usuário digita um CPF, clica em "Excluir", arrasta um card entre colunas ou abre a home de um sistema de gestão. Isso não é gosto, é comportamento esperado.

As regras de interação cuidam da segunda parte. Elas vêm instaladas com o template, em `.aioson/rules/`, e são carregadas automaticamente pelos agentes quando a tarefa toca o assunto.

---

## As quatro regras

Todas ficam em `.aioson/rules/`, com `priority: 10` e `load_tier: trigger`. Só entram no contexto quando a tarefa realmente combina.

### `form-fields-masks-and-validation.md`

Todo campo estruturado (CPF, CNPJ, CEP, telefone, data, hora, moeda, percentual, cartão, placa) nasce com máscara ou formatador ao vivo. Um input de texto puro para dado estruturado é defeito.

Pontos principais:

- Semântica correta de input: `type`, `inputmode`, `autocomplete` e `maxlength` coerentes com a máscara.
- Validação em camadas: a máscara restringe a digitação; a validação semântica roda no blur (dígito verificador de CPF/CNPJ, Luhn de cartão); obrigatoriedade e regras cruzadas rodam no submit.
- Mensagem de erro específica, nomeando o formato esperado ("CNPJ inválido — use 00.000.000/0000-00"), inline ao lado do campo, com `aria-invalid` e `aria-describedby`. Nunca só cor, nunca um toast genérico.
- O idioma do projeto (`interaction_language` no contexto) decide os formatos padrão.

### `status-change-confirmation.md`

Qualquer controle que muda o status de uma entidade (aprovar, rejeitar, cancelar, publicar, desativar), exclui, arquiva ou aplica edição difícil de reverter abre um modal de confirmação do design system.

Pontos principais:

- Nunca `alert`, `confirm` ou `prompt` nativos. O modal sai do design system do projeto.
- Anatomia do modal: título nomeando ação e objeto, uma linha de consequência dizendo se é reversível, botão de confirmar rotulado com o verbo e um secundário de cancelar. Foco preso, `Esc` cancela.
- Confirmação digitada (nome da entidade) só para exclusões de alto impacto — um workspace, uma conta, dados em massa. Não para registro de rotina.
- Edição de rotina salva sem interceptação. Confirmar demais treina o usuário a clicar sem ler.

### `status-flow-drag-and-drop.md`

Quando itens andam entre status repetidamente e nos dois sentidos — kanban, funil de vendas, pipeline de tarefas, fila de prioridade, lista ordenada — arrastar e soltar é a interação **primária**. Um dropdown como único caminho é defeito.

Pontos principais:

- A interação precisa ser visível: alça de arraste, estado levantado durante o drag, destino válido destacado, estado de destino inválido.
- O movimento é otimista, com desfazer (toast "Desfazer") em vez de modal. Modal a cada arraste mata o fluxo. Drop em destino destrutivo ou terminal ainda confirma.
- Toda transição por arraste tem equivalente acessível: mover por teclado via menu de contexto ou controle "mover para…", anunciado em live region.
- Botão e menu continuam valendo para transições pontuais que não se repetem.

### `management-home-widgets.md`

Se o produto gerencia trabalho quantificável — CRM, ERP, cockpit, painel administrativo, back office — a tela inicial abre com widgets que geram decisão, não com um menu vazio, uma tabela em branco ou uma splash de logo.

Pontos principais:

- Cada widget responde a uma de duas perguntas: "como estamos" (um KPI com unidade, período e tendência — número sem contexto é decoração) ou "o que precisa de mim agora" (indicador de atenção, ligado à lista filtrada).
- Gráficos saem de dados reais ou seeded, com eixos rotulados e uma linha de resumo em texto. Nunca gráfico decorativo de enfeite.
- Conjunto pequeno e priorizado: 3 a 6 widgets, com um widget focal dominante — não um mural de tiles de peso igual.
- Todo widget faz drill-down: clicar leva aos registros por trás, já filtrados.
- Teste de valor: remova o widget. Se nenhuma decisão ficou mais difícil, ele era decoração.

---

## A cadeia — da origem à verificação

Uma regra de interação não vale só na hora de codar. Cada uma nomeia, no próprio frontmatter (`## Applies to`), o que cada agente da rota precisa fazer com ela. O resultado é uma cadeia fechada: o contrato nasce como escopo, é desenhado, é implementado e é verificado — em vez de ser descoberto como ausência no fim.

```text
@briefing            → registra o contrato como promessa ou pergunta classificada
      ▼
@product             → a spec nomeia formato, máscara, transição, widget e decisão servida
      ▼
@refiner    → o protótipo demonstra o contrato funcionando sobre estado mock
  / @benchmark          (input sem máscara, botão destrutivo sem modal, kanban só de clique
                         e home sem valor são achados bloqueantes)
      ▼
@dev                 → implementa contra a mutação real, usando os utilitários do projeto
      ▼
@qa                  → prova cada contrato prometido na superfície real, com uma linha
                       de evidência CAP/AC; falha vira FAIL, não observação de estilo
```

O que o `@qa` prova, por regra:

| Regra | Evidência de verificação |
|---|---|
| `form-fields-masks-and-validation` | exercita cada campo estruturado com entrada válida e malformada; campo que aceita o que a máscara rejeita é FAIL |
| `status-change-confirmation` | todo controle destrutivo ou de mudança de status tem caminho de teste pelo confirmar **e** pelo cancelar |
| `status-flow-drag-and-drop` | arrasta um card real e confirma que o novo status/ordem persiste depois de um reload; movimento que só muda o DOM é FAIL |
| `management-home-widgets` | altera o dado por trás e confirma que cada widget reflete a mudança; widget congelado no valor de seed é FAIL |

Duas travas importam aqui:

- **Nada disso adiciona escopo.** A verificação cobra o que o PRD, o plano ou um AC prometeu. Um contrato que nada prometeu segue sendo recomendação.
- **A origem é o `@briefing`.** O lugar mais barato de registrar um contrato de interação é antes do PRD existir; o mais caro é depois do código pronto.

## Como as regras chegam ao agente

Duas rotas, e elas se complementam.

**1. Seleção de contexto.** `context:select` e `context:brief` pontuam cada regra pelos campos do frontmatter (`agents`, `paths`, `triggers`, `task_types`, `entities`, `aliases`, `priority`). Quando o agente vai planejar ou implementar algo que casa com os gatilhos, a regra entra no contexto dele.

**2. `context:guard` no momento da escrita.** Instalado como hook `PreToolUse` (veja [Hooks e Session Guard](./hooks-session-guard.md)), o guard lê o arquivo que está prestes a ser escrito, roda o mesmo motor de brief e injeta as restrições das regras salientes antes da escrita acontecer. É advisory: sempre sai com código 0, nunca bloqueia a ferramenta.

### `guard_surfaces:` — a regra sabe onde vale

As quatro regras de interação declaram `guard_surfaces: [ui]` no frontmatter. Isso limita a injeção do guard ao tipo de artefato certo.

Uma regra com `guard_surfaces` declarado só injeta quando o arquivo editado é de um dos tipos listados. Hoje existe um tipo, `ui`, e o guard o reconhece assim:

| Arquivo | Conta como `ui`? |
|---|---|
| `.html`, `.htm`, `.css`, `.scss`, `.sass`, `.less`, `.jsx`, `.tsx`, `.vue`, `.svelte`, `.astro` | Sim, pela extensão |
| `.md`, `.mdx` | Sim — briefings, manifestos e PRDs carregam contrato de interação |
| `.js`, `.mjs`, `.cjs`, `.ts`, `.mts`, `.cts` | Só se o conteúdo tocar o DOM (`document.querySelector`, `classList.`, `innerHTML`, JSX, `useState(`, `createRoot(`) |
| Qualquer outro (JSON, YAML, fonte de CLI, script de build) | Não |

O motivo é direto: um arquivo *sobre* formulários não é um formulário. Sem esse vínculo, uma regra universal de interação aparecia dentro de código de CLI, dado JSON e harness de teste só porque o texto mencionava "form" ou "status".

### `paths:` — escopo por caminho

Independente de `guard_surfaces`, uma regra que declara `paths:` (ou `globs:`) no frontmatter é um contrato sobre aqueles arquivos. O guard confere o caminho editado contra os padrões e não injeta fora deles, mesmo que a regra tenha aparecido no brief por sobreposição fuzzy de palavra-chave.

Ordem da checagem, para uma regra qualquer:

1. Declara `paths`? O caminho editado precisa casar. Se não casar, não injeta.
2. Declara `guard_surfaces`? A superfície detectada precisa estar na lista. Se não estiver, não injeta.
3. A regra ainda precisa de sinal forte no brief (`triggers`, `paths`, `entities`, `aliases`, `task_types`) e de confiança pelo menos `medium`.

---

## O gate visual mede o contrato

`verify:artifact --kind=visual` lê o HTML/CSS que foi realmente escrito e devolve números. Além das métricas de craft (aderência a token, grade de espaçamento, profundidade, tipografia, motion, estados, aninhamento de card), ele mede os contratos de interação acima.

```bash
aioson verify:artifact . --kind=visual --slug=pedidos --advisory --runtime
aioson verify:artifact . --kind=visual --dir=src/ui --advisory --runtime
aioson verify:artifact . --kind=visual --file=app/index.html --json
```

### Achado bloqueante

Um só, porque a camada bloqueante precisa ser provável a partir do texto:

- **Chamada de diálogo nativo** — `alert(`, `confirm(` ou `prompt(`, puro ou com `window.` na frente. É o veto direto da regra `status-change-confirmation`.

O detector é estreito de propósito: chamada de método em outro objeto (`modal.confirm(`), identificador que só termina no nome (`showConfirm(`) e caminho de URL não contam; verbo em português (`confirmar(`) também não.

### Avisos (limiar que pede julgamento)

| Aviso | Regra por trás |
|---|---|
| Campo estruturado sem semântica de input — identidade do campo diz CPF/telefone/moeda mas não há `type` semântico, `inputmode`, `pattern`, `maxlength`, `autocomplete` nem classe de máscara | `form-fields-masks-and-validation` |
| Controle destrutivo sem maquinaria de diálogo no corpus (`<dialog>`, `role="dialog"`, `aria-modal`, `modal`) | `status-change-confirmation` |
| Superfície kanban/pipeline sem marcador de drag-and-drop (`draggable=`, `dragstart`, `dragover`, `ondrop`, `sortable`, `pointerdown`) | `status-flow-drag-and-drop` |
| Superfície de gestão (dashboard, CRM, ERP, back office, painel, admin) sem marcador de widget/KPI/gráfico | `management-home-widgets` |

Todos são presença/ausência de marcador léxico. São evidência para o revisor decidir, não veredito.

### Comentários não contam

A varredura ignora comentário HTML (`<!-- -->`), comentário CSS (`/* */`) e comentário JavaScript (`//` e `/* */`) antes de medir. Um `// confirm('...')` comentado não dispara a camada bloqueante, um `<input name="cpf">` comentado não vira campo sem máscara, e um cabeçalho de racional dizendo "não é densidade de admin" não faz o arquivo virar superfície de gestão.

### Medição em browser

`--runtime` é parte da invocação padrão nos fluxos visuais do framework, não um extra. Ele mede o que só existe depois do layout, a 1280px e 360px: overflow horizontal, texto cortado, elemento empurrado para fora da tela, tap target abaixo de 44px e contraste WCAG computado de verdade.

O Playwright é dependência opcional. Quando falta, o relatório diz que a medição não aconteceu. Ele nunca degrada para um "passou" silencioso. Registre o resultado ao declarar o trabalho visual concluído: medido, com N achados corrigidos, ou o motivo de não ter rodado.

Para saber se a sua máquina tem a medição disponível:

```bash
aioson doctor
```

O check `visual:runtime_telemetry` responde. Quando o Playwright falta:

```
[FAIL] Visual runtime telemetry (Playwright present)
  Hint: Visual gates are static-only. Enable browser measurement with: npm i -D playwright && npx playwright install chromium
```

A severidade é `warning` — ele aparece na lista, mas não derruba o resultado geral do `doctor`. O Playwright é resolvido primeiro a partir do `node_modules` do projeto, depois da árvore do próprio CLI.

---

## Onde mais isso aparece

- **`prototype:check`** roda a mesma telemetria automaticamente quando resolve um protótipo próprio, sempre como bloco advisory. Nunca altera o veredito do vínculo.
- **Brain de qualidade visual** (`.aioson/brains/design/visual-quality.brain.json`) carrega os mesmos contratos como nós de conhecimento consultáveis: `vq-009` (máscaras e validação), `vq-010` (confirmação de status), `vq-011` (drag-and-drop), `vq-012` (widgets da home de gestão), `vq-014` (reanimação de classe exige reflow forçado) e `vq-015` (máscara ao vivo preserva o cursor). O nó `vq-000` declara que uma regra do projeto prevalece sobre o brain.

  Os agentes chegam a esses nós por consulta dirigida, cada um com a lente do seu papel:

  ```bash
  # @briefing — na origem, sobre Problem e Proposed solution
  aioson brain:query . --agent=briefing --tags=spec-quality --min-quality=4 --format=compact

  # @qa — na verificação, sobre a superfície entregue
  aioson brain:query . --agent=qa --tags=interaction,forms --min-quality=4 --format=compact
  ```

- **Regra própria do projeto** vence a regra do framework. Use `aioson rule:new` com `--priority` acima de 10 (o padrão do comando é 50) para sobrepor qualquer um destes contratos com o que o seu produto exige. Veja [Comandos do CLI](./comandos-cli.md#rulenew).

---

## Ver também

- [Hooks e Session Guard](./hooks-session-guard.md) — como o `context:guard` é instalado e o que ele faz
- [Comandos do CLI](./comandos-cli.md) — `verify:artifact`, `rule:new`, `prototype:check`
- [Governança de design docs](./design-docs-governance.md) — regras hard de código aplicadas pelos agentes
