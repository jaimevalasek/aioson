# Memória do operador

A memória do operador guarda decisões persistentes da pessoa que usa o AIOSON, separadas por identidade local. Ela é opcional, fica em `~/.aioson/operators/` e não deve ser commitada no projeto.

## Ativar ou desativar

Em instalações v1.15.0 ou mais novas, o carregamento automático fica **ligado por padrão**. Para desativar explicitamente:

```bash
$env:AIOSON_OPERATOR_MEMORY="false"  # PowerShell
export AIOSON_OPERATOR_MEMORY=false   # macOS/Linux
```

Em instalações antigas, `AIOSON_OPERATOR_MEMORY=true` ativa o comportamento. Quando habilitado, o agente lê `MEMORY.md` no início da sessão e carrega uma decisão completa apenas quando o título ou o tipo de sinal combina com a tarefa. Se uma regra em `.aioson/rules/` conflitar com uma decisão, a regra do projeto sempre vence e o aviso aparece no stderr.

## Identidade e armazenamento

Por padrão a identidade é `sha256(git config user.email)[0..16]`. Em CI ou em uma máquina compartilhada, use um ID explícito por processo:

```bash
aioson op:identity show --json
aioson op:identity set ci-bot-shared
```

O armazenamento fica em:

```text
~/.aioson/operators/{identity}/
├── MEMORY.md              # decisões ativas, carregadas no preflight
├── MEMORY-archive.md      # decisões arquivadas, carregadas sob demanda
├── decisions/             # fonte de verdade das decisões
├── proposals/             # sinais aguardando promoção
└── history/               # itens esquecidos/arquivados
```

O ID explícito vale para o processo atual; persista-o no ambiente do CI se esse for o comportamento desejado.

## Capturar uma decisão

Agentes observam quatro tipos de sinal: `authorization`, `exclusion`, `correction` e `confirmation`.

```bash
aioson op:capture \
  --signal=authorization \
  --quote="Pode commitar depois que eu aprovar a fatia" \
  --proposal="commit autônomo após aprovação explícita" \
  --source-agent=dev
```

O slug é derivado de forma determinística do proposal. A promoção depende do tipo de sinal e do que a citação literal do usuário diz:

| Sinal | Detecções para promover |
|---|---:|
| `authorization` | 1 se a citação diz que vale daqui pra frente; senão 2 |
| `exclusion` | 1 |
| `correction` | 1 |
| `confirmation` | 2 |

Exclusões e correções valem na primeira vez: esquecer uma proibição é uma falha que ninguém vê. Uma autorização só vale na primeira vez quando a citação traz uma marca de permanência ("sempre", "daqui pra frente", "não precisa perguntar", "from now on", "de ahora en adelante", ou nomeia todos os projetos); "sim", "confirmo" ou uma opção escolhida são respostas daquele momento e esperam a repetição. Enquanto espera, `op:capture` diz isso numa linha (`held: "awaiting_repeat"` em `--json`), para o agente não anunciar que guardou.

A repetição é reconhecida pelo sentido, não pelo texto: a paráfrase do agente muda a cada sessão, então um sinal sem nada no slug exato é comparado com as decisões e propostas do mesmo tipo pelas palavras de conteúdo (Jaccard ≥ 0,4, ao menos 3 palavras em comum) e só casa quando os identificadores são os mesmos (números, versões, slugs de feature ou arquivo): "fase 2" e "fase 3" continuam duas decisões. Casada pelo sentido, a saída traz `matched_by: "meaning"` e a similaridade.

Uma decisão vale só no projeto em que foi dita até o mesmo sinal aparecer num segundo projeto ou até a citação do próprio usuário nomear todos os projetos ("em todos os meus projetos", "in every project"). Uma negação só a mantém local quando nega esse escopo ("não se aplica a todos os projetos", "doesn't apply to every project", "nem em todos"); a negação de uma ação não: "nunca use yarn em qualquer projeto" e "never push to main in any repo" são proibições para todos os projetos.

Uma decisão salva antes dos escopos existirem (sem campo `scope`) não registrou onde se aplica. Ela fica fora do topo que toda sessão recebe sem pedir e responde quando a tarefa a nomeia (`--match`) com duas palavras ou mais (ou todas as palavras pedidas). Dita de novo, é adotada pelo projeto onde foi dita (`adopted: true`) e se amplia num segundo projeto como qualquer outra.

## Reforço idempotente

Se um sinal já promovido aparecer novamente, ele não cria outra linha no índice FTS nem reseta `promoted_at`. O AIOSON atualiza somente `last_reinforced` e incrementa `reinforcement_count`.

Para reforçar manualmente uma decisão:

```bash
aioson op:reinforce commit-autonomo-apos-aprovacao --json
```

O comando preserva título, corpo e trigger quotes byte a byte. Para desfazer uma decisão, use o slug exibido no `op:capture`:

```bash
aioson op:forget commit-autonomo-apos-aprovacao
```

## Inspecionar e administrar

```bash
aioson op:list
aioson op:list --proposals
aioson op:list --include-archived
aioson op:show <slug> --json
```

O recall de início de sessão (`aioson op:list --json --titles-only`) imprime `items` como um mapa `slug: título` (sinal, categoria e datas ficam no `op:show` e na tabela; uma decisão arquivada ou presa a outro projeto diz isso entre colchetes depois do título) e lista as 40 decisões mais bem ranqueadas: as deste projeto primeiro; dentro de cada grupo, exclusões e correções antes de autorizações e confirmações (esquecer uma proibição é uma falha que o agente não vê, esquecer uma permissão custa só uma pergunta); depois as mais frescas pela meia-vida da categoria e pelos reforços. Sempre que há um corte, a saída traz `total` e `omitted` (0 quando nada ficou de fora); `--match="<palavras da tarefa>"` encontra o resto (palavras de duas letras ou mais, como `CI` e `PR`; sem nenhuma palavra utilizável, a saída diz `match_ignored: true` e o corte normal vale) e `--limit=0` lista todas. O corte padrão vale só para esse formato de ativação: `--titles-only` também corta a tabela de texto, enquanto `--feature` e `--proposals` listam tudo, a não ser que `--limit` seja passado.

Os comandos que recebem um slug aceitam `[path] <slug>` e também `<slug> [path]` (`aioson op:show <slug> .`). As linhas que `op:capture` e `op:promote` imprimem seguem `--locale` quando informado e, sem ele, o `interaction_language` do projeto.

`MEMORY.md` é um índice pequeno; o corpo da decisão vive em `decisions/{slug}.md`. `MEMORY-archive.md` lista as decisões fora do recall, com o motivo, e é uma leitura de cada decisão, não uma mudança de arquivo: `op:show` e `op:list --include-archived` continuam lendo, e um reforço a traz de volta. Dois motivos:

- `unproven`: decisão sem escopo, nunca reforçada, cuja citação não tem marca de permanência;
- `stale`: permissão (`authorization`, `confirmation`) sem reforço por duas meias-vidas da categoria (180 dias em `default`). Exclusões e correções nunca envelhecem: uma proibição obedecida nunca é repetida.

Decisões de categoria `identity` nunca vão para o arquivo. `op:list` informa quantas ficaram de fora (`archived`).

Uma vez por dia, o `op:capture` faz a manutenção do armazenamento: propostas não repetidas em 90 dias vão para `history/` (recuperáveis lá por um ano), entradas de `history/` com mais de um ano saem e o índice é reescrito. Decisões nunca são apagadas por essa manutenção.

## Projetos desta máquina

Cada início de sessão (`context:digest`) registra o projeto aberto em `~/.aioson/projects.json`: caminho, nome (`project_name`), primeira e última vez visto. Só entram raízes AIOSON com `.aioson/context/project.context.md`; nunca uma pasta dentro de `.aioson/` nem uma pasta descartável sob o diretório temporário do sistema. O registro grava no máximo uma vez por hora por projeto, um projeto cuja pasta sumiu sai da lista na próxima gravação, e nada sai do computador. Desligue com `AIOSON_PROJECT_REGISTRY=false` (ou com a memória do operador desligada).

`aioson op:profile` lê essa lista e responde, sem modelo, o que você costuma escolher: tipo, framework, idioma, Autopilot, runner de testes, tamanho e design, com a contagem de cada um; os padrões para um projeto novo (só maioria clara: ao menos 3 projetos com o campo preenchido, que sejam metade dos projetos, e um valor com 60% deles; tamanho e design aparecem mas nunca são sugeridos); os projetos abaixo da versão da CLI, os mais antigos primeiro; e as decisões que valem em dois ou mais projetos. `--scan=<pasta>` importa de uma vez os projetos que já estão no disco (`--depth=<n>`, padrão 3; pastas de dependência, ocultas e o interior de um projeto ficam de fora). `--json` devolve tudo em campos (`choices`, `suggested`, `outdated`, `habits`, `recent`).

Num projeto novo, `aioson setup:detect . --json` traz `portfolio` quando há 3 ou mais outros projetos com maioria clara: os mesmos padrões (o projeto que está sendo configurado não conta) e as `flags` do `setup:context` que os gravam (`--project-type=web_app --framework=Node --language=pt-BR --auto-handoff=true`). O `@setup` os oferece como resposta recomendada onde o workspace não prova nada, dizendo de onde vêm; a evidência do workspace sempre vence e nada é gravado sem confirmação.

No início de cada sessão, o `context:digest` mostra em `memory.habits` até 5 decisões que valem em dois ou mais projetos (vistas em dois projetos distintos ou ditas para todos os projetos com as suas palavras), à parte do topo deste projeto e sem repetir nenhuma. Enquanto não existe nenhuma, o campo não aparece.

## Privacidade e limites

- a memória é por identidade e não é sincronizada pelo Git;
- `quotes` são limitadas e servem como trilha de auditoria;
- captura é best-effort: uma falha não deve interromper a sessão do agente;
- regras do projeto vencem decisões pessoais;
- o índice SQLite/FTS5 é local e regenerável a partir dos arquivos Markdown;
- para compartilhar uma decisão com a equipe, registre-a em uma regra ou documento versionado do projeto, não copie `~/.aioson/operators/`.

## Diagnóstico rápido

1. Rode `aioson op:identity show` e confirme a identidade esperada.
2. Verifique `AIOSON_OPERATOR_MEMORY=true` no mesmo processo do cliente de IA.
3. Rode `aioson op:list --proposals` para diferenciar sinal pendente de decisão promovida.
4. Use `aioson op:show <slug>` para conferir `signal_type`, `promoted_at` e `last_reinforced`.
5. Se o título não aparecer, confira se `.aioson/rules/` está vencendo a decisão ou se o item foi arquivado (`aioson op:list --include-archived` mostra o motivo).
