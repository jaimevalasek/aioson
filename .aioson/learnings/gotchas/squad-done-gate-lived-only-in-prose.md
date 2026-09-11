# O Done gate do @squad vivia só em prosa — 8 de 8 squads reais fechados verdes falhavam no strict

**Escopo:** `@squad` (kernel + docs/tasks), `squad:validate` (Layer 6, lint de executores), `squad:eval` (`--no-persist`), `verify:artifact --kind=squad-package` (auto-fire no `agent:done`), `squad:preflight`, `worker-runner` (transporte de payload), teste de alcançabilidade doc↔CLI.

## O que aconteceu

Sessão supervisionada de 2026-09-11, medindo os squads criados em projetos consumidores (17 pacotes reais em 6 projetos), sem escrever nada neles:

- **Todos os 8 squads testados falham `squad:validate --strict`** (de 1 a 72 erros); o melhor tira nota D (49/100) no `squad:score`. Cada um tinha sido fechado com sessão verde.
- **Executores de 273 bytes ao lado de executores de 20 KB.** Um "fechador" de três linhas passava porque o validate só fazia `fs.access` no arquivo; um squad de copy pagava ~31k tokens de prompt por sessão sem ninguém medir.
- **`squad:eval` quebrava com `spawn ENAMETOOLONG` no Windows** em squads com workers reais: o runner passava o payload inteiro (com os outputs completos do baseline e do candidato) por `argv[2]`.
- **`squad:eval` gravava no projeto** (`evals/*.json`, `latest.json`, `docs/EVAL-*.md`) sem opção de dry-run; a própria medição sujou dois consumidores e precisou de revert.
- **Os docs mandavam rodar `aioson squad:agent:create`, comando que nunca existiu** (o CLI registra `squad:agent-create`): a única porta documentada para o gerador de executores de 36 KB caía em "unknown command" há meses.
- **Ativação padrão carregava ~124 KB (~31k tokens) de prompt** antes de qualquer trabalho: a escada de lanes restava 6 vezes, a lista de arquivos do pacote 5 vezes, o depth block 10 vezes; 35% da superfície era prosa sem verbo executável.

## Por que todo gate ficou verde

Quatro classes ao mesmo tempo. **Misfire:** o Done gate (validate strict + eval + pilot) existia só como texto no kernel; `artifact-kinds.js` ligava `squad` apenas a `squad-pilot`, então `agent:done` nunca rodava o validate. **Superfície descoberta:** nenhum check lia o corpo dos executores nem os entrypoints dos workers. **Heurística errada:** o transporte por argv assumia payload pequeno. **Deriva doc↔CLI sem teste:** nenhum teste comparava os comandos escritos nos prompts com os registrados em `cli.js`.

## O que previne agora

- `verify:artifact --kind=squad-package` roda `squad:validate --strict` + lint de executores e **auto-dispara no `agent:done --agent=squad`** (rider em `AGENT_ARTIFACT_KIND.squad.also`). Um squad não fecha mais em silêncio com erros estritos.
- `src/lib/squad-executor-lint.js` (Layer 6 do validate): prompt < 400 bytes ou com TODO/FIXME/lorem ipsum = erro no `--strict` (provável pelo texto); magro (< 600), inchado (> 16 KB), sem seções mission/constraints/output (aliases pt-BR), quase-duplicados (Jaccard de 3-shingles ≥ 0,6) e workers só-argv = avisos com amostra. O relatório carrega `executors.estimatedTokens`.
- `worker-runner`: payload acima do orçamento de argv da plataforma (24 KB no Windows, 100 KB fora) vai por arquivo temporário anunciado em `AIOSON_WORKER_INPUT_FILE`, `argv[2]` leva o envelope `{ "$inputFile" }`; falha de spawn vira resultado do worker, não crash do CLI; o template gerado lê os dois.
- `squad:eval --no-persist` mede sem gravar.
- `squad:preflight --operation --lane --mode --signals --json` devolve tasks/módulos/router com bytes e tokens e o Done gate da lane; o kernel encolheu de 12 136 para 10 586 chars (teto 10 752) e não carrega mais a tabela de 17 linhas.
- Alias `squad:agent:create` registrado e `tests/squad-prompt-cli-reachability.test.js` garante que todo `aioson x:y` escrito em kernel/tasks/docs/skills do squad existe em `cli.js`.

## Receita

Ao investigar "o agente X produz coisa ruim": medir os artefatos reais dos consumidores com o próprio CLI **sempre com `--no-persist`** (e conferir `git status` no consumidor depois), perguntar "qual kind o `agent:done` dispara para esse agente?" e "qual check lê o corpo do artefato, não só a existência?", e antes de tocar um kernel: `grep -rn "<frase>" tests/` e o ratchet de 256 chars em `kernel-and-skill-size-budgets.test.js`.
