# Execução de agentes, faixas de desenvolvimento e modelos

O AIOSON usa `.aioson/context/agent-execution-{feature}.json` para executar uma tarefa delimitada por um host CLI e um modelo registrados. Esse manifesto é configuração de runtime, não outra especificação.

## Padrões

Um manifesto novo habilita somente:

- `dev`;
- `qa`.

`tester`, `pentester`, `validator` e todas as faixas de desenvolvimento começam desligados. A classificação MICRO/SMALL/MEDIUM nunca os habilita.

A rota canônica continua Product → Sheldon → Planner → DEV → QA. Faixas opcionais rodam dentro do DEV; revisores opcionais só podem rodar depois do QA quando estiverem explicitamente habilitados e tiverem um gatilho concreto.

## Comandos

```bash
aioson agent:execution:init . --feature=minha-feature --host=codex
aioson agent:execution:validate . --feature=minha-feature --json
aioson agent:execution:show . --feature=minha-feature --json
aioson agent:execution:dispatch . --feature=minha-feature --agent=qa
aioson agent:execution:dispatch . --feature=minha-feature --lane=backend
aioson agent:execution:resume . --feature=minha-feature
aioson agent:execution:status . --feature=minha-feature --json
```

A inicialização é create-once. Novos init, resume e seeds do workflow preservam byte por byte o manifesto que já pertence ao desenvolvedor.

## Schema v2: orquestração e Neural Chain

Manifestos novos usam a versão 2, enquanto a versão 1 continua aceita sem alteração. Os campos aditivos são:

- `orchestration.mode`: `autopilot` por padrão, ou `inherit` / `step_by_step` quando o desenvolvedor alterar;
- `orchestration.max_checkpoints`: orçamento do runner no Autopilot efetivo (padrão 10);
- `orchestration.stop_conditions`: motivos terminais explícitos;
- `chain_work_policy`: roteamento tipo→responsável, fallback de especialista, revalidação pelo QA e gate de itens acionáveis do DEV.

Itens de teste/segurança vão para Tester/Pentester apenas quando as entradas existentes desses especialistas estão habilitadas. Caso contrário retornam ao DEV. Isso nunca habilita um especialista opcional por classificação.

## Faixas de desenvolvimento

Use faixas somente quando o usuário ou o plano aprovado pedir hosts/modelos diferentes ou escopos separados.

```json
{
  "development_lanes": {
    "strategy": "split",
    "integration_owner": "dev",
    "lanes": {
      "backend": {
        "enabled": true,
        "host": "codex",
        "mode": "external",
        "model": "gpt-5.6-sol",
        "reasoning_effort": "high",
        "writable_roots": [],
        "prompt": ".aioson/context/execution-prompts/minha-feature/backend.md",
        "write_paths": ["src/api/**", "tests/api/**"],
        "fallbacks": [],
        "report": ".aioson/context/reports/minha-feature/{run_id}/dev-backend.json"
      },
      "frontend": {
        "enabled": true,
        "host": "opencode",
        "mode": "external",
        "model": "provider/model-id",
        "writable_roots": [],
        "prompt": ".aioson/context/execution-prompts/minha-feature/frontend.md",
        "write_paths": ["src/ui/**", "tests/ui/**"],
        "fallbacks": [],
        "report": ".aioson/context/reports/minha-feature/{run_id}/dev-frontend.json"
      }
    }
  }
}
```

`host` identifica um adaptador CLI registrado; `model` é o identificador de modelo/provedor aceito por esse host. Um modelo como Grok pode ser usado por um host compatível, como OpenCode; não é necessário criar agentes canônicos `@frontend` e `@backend`.

O DEV cria o prompt curto de runtime a partir do PRD e do plano aprovados, despacha as faixas habilitadas sequencialmente no worktree compartilhado, confere o diff contra `write_paths`, integra as fronteiras compartilhadas e roda a verificação completa. O relatório vincula a identidade da faixa e seus caminhos declarados.

Os hosts vêm de um registro único (`src/lib/tool-capabilities.js`, exposto por `aioson tool:capabilities --json`): Antigravity, Claude Code, Codex, Grok, Kimi Code, OpenCode e Qwen Code são despacháveis (`listExecutionHosts()`); Muse permanece somente interativo. `antigravity` é o id lógico e sempre resolve pelo registro para o CLI headless `agy` — nunca para `antigravity.cmd`, o launcher Electron do editor. Um host novo precisa de adaptador para manter resolução de executável, capabilities, argumentos, redação e telemetria em modo fail-closed.

## Não assistido por política

Todo harness que o framework lança para orquestração ou implementação roda **sem pedir permissão**: um prompt de aprovação dentro de um run orquestrado é o run não acontecendo. A política mora no registro de hosts (`src/lib/tool-capabilities.js`, exposto por `aioson tool:capabilities`): todo CLI registrado declara seu flag não assistido (`yolo_args` — `--dangerously-skip-permissions`, `--dangerously-bypass-approvals-and-sandbox`, `kimi --auto`, `qwen --yolo`, `opencode run --auto`, `grok --always-approve`, `muse --yolo`, `agy --dangerously-skip-permissions`), e toda superfície de lançamento o lê: `live:start` assume `--permission-mode=yolo` (`--permission-mode=default` é a forma explícita de ter prompts; host sem flag ainda abre, com aviso), todo lane worker e todo `agent:execution:dispatch` direto rodam `workspace-write` como esse flag, o runner headless o acrescenta. Host sem flag pode ser usado interativamente, mas nunca é despachado (`permission_mode_unsupported`). Adicionar um harness é uma entrada no registro com o flag, mais um adaptador (provado por `host:signature`) quando ele deve rodar faixas. O sandbox do próprio provedor nunca é argv de lane worker (medido: respondeu sem escrever).

## Assinaturas de host

Uma assinatura é a prova, no nível da máquina, de que uma combinação `(host, modelo, effort)` realmente funciona aqui — CLI instalado, login válido, ID de modelo aceito, effort suportado — registrada antes de qualquer despacho, em vez de descoberta como `executable_not_found` / `auth` / `invalid_model` no meio de uma execução.

```bash
aioson host:signature . --host=kimi --model=kimi-k3
aioson host:signature . --host=codex --model=gpt-5.6 --effort=high --ttl=24
aioson host:signature . --host=kimi --model=kimi-k3 --status --json
aioson host:signature . --list --json
aioson execution:profiles:validate . --json
aioson agent:execution:validate . --feature=minha-feature --strict --json
```

A sonda monta exatamente o argv que o adaptador de execução usaria (mesmos flags não-interativos, modo read-only do provedor), roda num diretório temporário vazio com um prompt de uma palavra e classifica a saída pela normalização de erros do próprio adaptador. Nunca lê contexto de projeto e nunca escreve dentro de um projeto. O resultado fica em `~/.aioson/hosts/signatures.json` (override: `AIOSON_HOST_SIGNATURES`), chaveado por host, modelo e effort, com TTL (padrão 24h).

`execution:profiles:validate` é o diagnóstico explícito em lote: lê todos os perfis habilitados de `.aioson/config/execution-roles.json`, elimina rotas host/modelo/effort repetidas e prova com esse mesmo harness as rotas ausentes, expiradas ou inválidas (três simultâneas por padrão, `--concurrency=1..10`). Os resultados são mesclados uma única vez no arquivo de assinaturas, sem uma sonda paralela apagar outra. `--refresh` testa novamente o cache válido; `--status` só consulta. O veredito `routing.ready` percorre do perfil ativo toda a cadeia ordenada de fallback; o comando ainda sai com 1 quando qualquer rota habilitada falha, para uma reserva quebrada ficar visível mesmo com a rota principal funcionando. Ele não é pré-requisito manual do run: um `execution:run` real testa automaticamente as rotas ausentes/expiradas/inválidas do perfil ativo e de sua cadeia alcançável antes do preflight, e repete essa validação JIT quando o arquivo de papéis salvo muda antes de um despacho posterior. `execution:run --preflight` continua somente leitura.

Login e ID de modelo não dizem nada sobre o host **editar sem pedir permissão** — que é o que um lane worker é; a primeira execução orquestrada real tinha toda assinatura válida e uma faixa passou a noite pedindo aprovação. Por isso a sonda são duas chamadas: depois da read-only passar, uma **sonda de escrita não assistida** roda exatamente o argv `workspace-write` não assistido que um lane worker recebe, em outro diretório temporário vazio, e pede um arquivo. Escreveu → `verified`; saiu sem escrever → `unverified` (a assinatura segue válida, o preflight avisa); vivo além do orçamento sem sair → `blocked`; recusado → `failed` — os dois últimos invalidam a assinatura (`host_not_unattended`). O resultado fica registrado em `unattended.yolo` e é lido pelo `execution:run --preflight`; `--unattended-probe=false` pula a sonda e mantém o que uma sonda anterior provou. Medido na máquina do operador: o Codex escreveu o arquivo em 14 s sob o flag não assistido; sob o próprio `--sandbox workspace-write` respondeu DONE depois de 96 s sem escrever — por isso o sandbox do provedor nunca é argv de lane worker.

- Recusas são determinísticas a partir do registro: `unknown_host`, `unsupported_host_execution` (host só interativo — Muse), `effort_unsupported_by_host`, `invalid_reasoning_effort`, `permission_mode_unsupported` (sem flag não assistido registrado — nenhum hoje). Host sem flag read-only (OpenCode ou Antigravity) é sondado sem essa precaução (`probe.sandbox: none`), nunca recusado por isso; a sonda de escrita não assistida roda igual.
- Resultados da sonda: `valid`, ou `invalid` com `executable_not_found` (trazendo o comando de instalação), `auth`, `invalid_model`, `capacity`, `timeout`, `crash`, `host_not_unattended` (a sonda de escrita bloqueou ou falhou).
- `--status` e `--list` são somente leitura e sempre saem com 0; a resposta está no campo `state` (`valid | expired | invalid | missing`).
- `agent:execution:validate --strict` exige assinatura válida e não expirada para todo agente e faixa **habilitados** (entradas desligadas são ignoradas) e reporta fallbacks declarados sem assinatura como aviso. Sem `--strict`, o manifesto mantém o contrato `validated_at_dispatch` inalterado.

## Execução orquestrada (papéis, offer, compile)

O caminho orquestrado roda as unidades do planner como processos externos paralelos, cada um com o host/modelo de um **papel**. Ele é destravado por um único arquivo de projeto. O planner o **semeia** desligado — `aioson execution:seed`: um `{lane}_dev` por faixa, `integration_dev` e `qa`, cada um numa CLI de execução instalada na máquina (o revisor numa segunda CLI quando há mais de uma), todo modelo no padrão do harness `configured-default`, nunca por cima de um arquivo existente — e uma pessoa, ou o cliente desktop supervisor depois de validar as assinaturas, escolhe os modelos, liga o arquivo e assina os hosts. O framework nunca o liga e nunca o distribui em `template/`. Ausente, desligado ou inválido, a opção não existe e a rota de DEV único fica intocada; a oferta então nomeia o passo de destravamento em vez de ficar em silêncio.

```json
// .aioson/config/execution-roles.json
{
  "version": 1,
  "source": "aioson-play",
  "enabled": true,
  "roles": {
    "backend_dev":  { "host": "codex", "model": "gpt-5.6",         "reasoning_effort": "high" },
    "frontend_dev": { "host": "kimi",  "model": "kimi-k3",         "reasoning_effort": null },
    "integration_dev": { "host": "codex", "model": "gpt-5.6",       "reasoning_effort": "high" },
    "qa":           { "host": "claude", "model": "claude-sonnet-5", "reasoning_effort": null }
  },
  "parallel": { "max_concurrent_lanes": 10 },
  "on_unavailable": "ask",
  "execution": { "spawner": { "command": "cockpitctl", "args": ["unit", "spawn"] }, "require_independent_qa": false }
}
```

Papéis são snake_case: `{lane}_dev` (obrigatório por faixa), `qa` (revisor das unidades e do resultado final, obrigatório), `{lane}_qa` (override opcional que herda de `qa`) e `integration_dev` (opcional em arquivos antigos, semeado nos novos). Declarar `integration_dev` habilita o supervisor corretivo final automático, seguido pelo QA compartilhado. `max_concurrent_lanes` é um nome legado: ele limita pipelines de unidade, inclusive várias unidades disjuntas da mesma faixa lógica, aceita 1–10 e tem padrão 10. Hosts vêm do registro (`tool:capabilities`), effort só é aceito onde o host declara suporte, segredos são recusados. Não existe knob de permissão por papel: worker roda não assistido por contrato. O campo legado `unit_timeout_ms` é aceito, mas ignorado; workers orquestrados não têm prazo de relógio imposto pelo AIOSON.

Com `profiles`, `active_profile` é a escolha principal do usuário. Um perfil com `fallback_use:true` pode declarar `fallback_profiles` ordenados; a cadeia é transitiva, uma rota host/modelo/effort repetida só é tentada uma vez e ciclos indiretos são inválidos. Falha de capacidade, cota, autenticação, provedor, executável ou modelo avança automaticamente para a próxima rota validada. O arquivo salvo continua sendo a fonte de verdade em runtime: antes de cada despacho DEV/QA o motor recarrega perfil, host, modelo, effort, fallbacks e a política de QA independente, valida em tempo de execução rotas novas ou expiradas sem editar esse arquivo e, durante o agendamento, recarrega o tamanho do pool. Uma prova real bem-sucedida do harness autoriza aquele modelo/effort exato mesmo quando o catálogo do provedor ainda não listou o modelo recém-liberado. Se a sonda principal falhar, o run usa o próximo fallback salvo que funcionar; só pede decisão quando nenhuma rota configurada funciona de fato. Adicionar `integration_dev` antes da etapa final habilita o supervisor; essas mudanças não exigem recompilar. Um processo já iniciado conserva a identidade com que nasceu; o próximo estágio ou retry usa a escolha salva.

```bash
aioson execution:seed . --feature=minha-feature --lanes=backend,frontend --json   # arquivo de papéis: desligado, hosts instalados, modelo padrão
aioson execution:offer . --feature=minha-feature --json      # disponível? (papéis + assinaturas; tabelas do plano + escala medida; passo de destravamento)
aioson execution:offer . --confirm-defaults --json            # registra "roda com os modelos padrão" para os papéis que continuam nele
aioson execution:profiles:validate . --json                  # prova todas as rotas primárias/fallback habilitadas com o harness
aioson execution:compile . --feature=minha-feature --json    # tabelas + papéis → plano de execução, prompts, faixas do manifesto
aioson execution:compile . --feature=minha-feature --dry-run --json
aioson verify:artifact . --kind=execution-plan --slug=minha-feature
```

`execution:offer` responde `available` só quando o arquivo de papéis está presente, válido e habilitado, todo papel no modelo padrão foi confirmado, **e** todo papel declarado tem assinatura válida e não expirada nesta máquina; caso contrário `reason` nomeia o primeiro bloqueio (`roles_file_missing | roles_disabled | roles_invalid | defaults_unconfirmed | signature_missing | signature_expired | signature_invalid`). Sempre sai com 0 — é uma pergunta, não um gate.

Uma oferta indisponível nunca é beco sem saída. A resposta sempre carrega `onboarding` — `state` (`not_unlocked | invalid | disabled | pending_confirmation | unsigned | ready`) e `next`, o único comando ou edição que move o estado (`execution:seed …`, `set "enabled": true …`, `execution:offer --confirm-defaults`, a primeira dica de `host:signature`, `execution:compile …`) — e `hosts` (`registered`, e `installed` nesta máquina). Entre *ligado* e *assinado* há mais um degrau, avaliado antes para ninguém ser mandado assinar um modelo que ia trocar: papéis ainda no modelo padrão respondem `defaults_unconfirmed` com `pending_confirmation[]` (papel, host, modelo). `aioson execution:offer . --confirm-defaults` registra a resposta do dono em `.aioson/config/execution-roles.confirmed.json` contra um digest do mapa de papéis — ao lado do arquivo de papéis, nunca dentro dele, porque o leitor do cliente desktop recusa chave de raiz desconhecida — e a pergunta não volta até um papel mudar, e aí só para os papéis que continuam no padrão. Papel com modelo escolhido pelo dono nunca pergunta.

Com `--feature`, `plan` também carrega a **escala medida**: `scale.files` (arquivos distintos entre o Implementation Delta, o Capability Delivery Plan e a Execution Sequence), `create`, `modify`, `phases`, `waves`, `parallel_phases`, `bytes`, `areas[]` (arquivos agrupados pelos dois primeiros segmentos do caminho — matéria-prima para faixas, nunca faixas) e `split_candidate` (arquivos no piso ou acima: 12, `AIOSON_EXECUTION_SPLIT_MIN_FILES` move) — mais `execution_choice` (`single` do frontmatter do plano, `orchestrated` da tabela de faixas, `null` quando nada foi registrado) e `lanes[]`. É o número sobre o qual o planner pergunta: um candidato a divisão ganha a pergunta DEV único/orquestrado esteja o caminho destravado ou não, e o plano que a responde registra a resposta (`execution: single` no frontmatter, ou a tabela de faixas). `plan` também carrega `recommendation` — `{choice, reasons[]}`, o lado medido da pergunta: `single` abaixo do piso ou quando nada roda em paralelo, `orchestrated` para um candidato a divisão com corte real (duas superfícies, ou linhas que já dividem uma onda), cada razão um número. O estado de trava do arquivo de papéis deliberadamente **não** é entrada — um incidente mostrou o modelo que pergunta lendo "travado" como "não aconselhável" e recomendando um contexto só para um plano de 52 arquivos e duas superfícies — então a disponibilidade apenas nomeia o passo de destravamento; ela nunca inverte a recomendação. A decisão continua do dono.

O plano também é medido **por unidade e como grafo**, porque um processo é um contexto: um plano orquestrado cuja única faixa era dona de todos os caminhos de escrita rodou uma fase vertical inteira por processo — 15 de 28 arquivos num contexto só, quatro ondas em série estrita, um modelo para tudo — com todo gate verde. `scale.units[]` (uma por linha da Execution Sequence: `files`, `acs`, `caps`, `shared_files`, `surfaces`, `two_sided`, `depth`, `over_budget` com `reasons`), `scale.parallelism` (`waves`, `max_concurrent_units`, `serial_chain`, `critical_path_processes`, `serial`), `scale.seams[]` (arquivos que várias linhas escrevem), `scale.ceiling` (10 arquivos / 6 critérios de aceite por unidade; `AIOSON_EXECUTION_UNIT_MAX_FILES` e `AIOSON_EXECUTION_UNIT_MAX_ACS` movem) e `scale.surfaces` (cada arquivo classificado `backend | frontend | shared` por extensão, diretório ou nome — testes à parte — com `two_sided` e `shared_test_root`: testes numa raiz que nenhuma faixa pode ter sozinha). As faixas são o eixo em que os modelos são atribuídos — cada papel `{lane}_dev` tem seu próprio host/modelo — então um plano de duas superfícies que ainda não declara duas faixas também recebe `plan.split_proposal`: uma faixa por superfície com caminhos de escrita derivados, cada linha cortada em `{fase}-backend` / `{fase}-frontend` dentro da própria onda, os arquivos que ninguém consegue alocar nomeados com o motivo, as costuras que pedem uma linha `IF-*`. Matéria-prima para as tabelas do planner, nunca uma tabela; a saída humana imprime, e `onboarding.next` nomeia essas faixas antes de qualquer tabela existir.

`execution:seed` grava o arquivo de papéis para as faixas dadas (`--lanes=a,b`, a tabela `## Development execution lanes` do plano com `--feature`, ou — antes de a tabela existir — uma faixa por superfície medida de um plano de duas superfícies, `lanes_source: surfaces`) e reporta `outcome`: `seeded` (os papéis, os hosts encontrados, `independent_review`), `already_present` (nada mudou; `missing_roles` nomeia o que as faixas precisam e o arquivo não tem), `no_execution_host` (nada gravado; o comando de instalação por host registrado — exit 1), `write_failed` (a causa — exit 1), `lanes_required`, `lane_invalid`, `too_many_lanes`.

A tabela `## Execution Sequence` pode trazer uma coluna opcional `Depends on`: nomes das fases de que esta fase precisa, cada um com um portão opcional — `(dev)` libera a dependente assim que o relatório do implementador daquela fase passou; sem sufixo (ou `(qa)`) quando a revisão de faixa dela terminou. Uma fase que declara dependências é escalonada por elas (pode começar enquanto o resto da onda anterior ainda roda); uma fase sem dependências mantém a barreira da onda. Dependências apontam para ondas anteriores e nunca para trabalho de integração; uma aresta entre faixas vira aviso (`dependency_cross_lane_without_contract`) quando nem o plano nem o PRD têm seção `## Interface Contract`. Uma célula com um número de fase puro depende de todas as linhas daquela fase (`1` → `1-backend` e `1-frontend`); um rótulo nomeia uma linha. O plano compilado carrega `edges[]`, `units[].depends_on` e `scheduling: waves | dependencies`; achados: `dependency_unknown`, `dependency_self`, `dependency_wave_violation`, `dependency_on_integration`, `cycle_detected`.

Três achados a mais são **avisos medidos nas unidades compiladas**: `unit_over_budget` (unidade de faixa acima do teto — arquivos ou critérios de aceite, incluídas as linhas do PRD das suas capacidades — com os números e o corte a fazer), `unit_spans_surfaces` (uma unidade escrevendo arquivos de backend e de frontend num contexto só — uma linha por faixa/superfície deixa cada lado rodar no seu modelo), `orchestration_serial` (uma faixa dona de todos os caminhos de escrita e uma unidade por onda: contextos frescos e revisão por unidade, nunca paralelismo). `summary.parallelism` traz `max_concurrent_units`, `serial_chain`, `critical_path_processes` e `serial`; `summary.ceiling` o teto em vigor; `summary.context_bytes_max` o maior contexto de unidade. Todo prompt de unidade embute a própria seção `## Phase N` do plano (subtítulos incluídos) e termina com um **contrato de contexto**: plano e PRD estão embutidos (abrir só por referência cruzada), o protótipo é nomeado apenas para unidade que escreve arquivos de frontend (`units[].context.reads`, com o tamanho), as regras chegam por `aioson context:brief --agent=dev --paths=<arquivos da unidade>` — nunca `.aioson/rules/` inteiro — e todo o resto fica fora do contexto da unidade de propósito.

`execution:compile` lê as tabelas `## Development execution lanes` e `## Execution Sequence` do plano e recusa com achados nomeados, sem escrever nada:

| Achado | Significado |
|---|---|
| `lanes_table_missing`, `lanes_table_invalid`, `no_wave_column` | as tabelas do planner estão ausentes ou não parseiam |
| `lane_write_paths_overlap`, `unsafe_path`, `lane_id_invalid`, `too_many_lanes` | faixas não são disjuntas, escapam do projeto ou excedem o limite do manifesto |
| `phase_mixed_ownership` | uma fase toca arquivos de duas faixas (ou de uma faixa mais arquivos sem dono) — divida-a, ou mova os arquivos compartilhados para uma onda solo posterior do dev |
| `wave_file_overlap` | duas fases da mesma onda compartilham um arquivo |
| `integration_before_lanes`, `no_lane_units` | trabalho de integração (arquivos fora de toda faixa) agendado antes das ondas de faixa, ou nenhuma fase cai numa faixa |
| `lane_without_role`, `qa_role_missing`, `role_signature_missing|expired|invalid` | o arquivo de papéis não tem o `{lane}_dev` da faixa, não tem revisor, ou o papel não está assinado aqui (cada um traz a dica do `host:signature`) |
| `dev_kernel_missing`, `dev_profile_sections_missing` | o `.aioson/agents/dev.md` instalado está ausente ou perdeu as seções das quais o perfil de faixa deriva |

Em sucesso escreve `.aioson/context/execution-plan-{slug}.json` — unidades (fase × faixa, ou integração do dev), ondas, capacidades/critérios de aceite/comandos de verificação por unidade, os papéis por faixa e os digests de tudo de que foi compilado — mais um prompt por unidade de faixa e por faixa em `.aioson/context/execution-prompts/{slug}/`, e atualiza **somente** `development_lanes` (estratégia `split`, as faixas compiladas com seu bloco `qa`, faixas que saíram do plano desligadas) e `orchestration.execution: orchestrated` no manifesto. Todo o resto do manifesto — agentes da sessão, política de capacidade, fallbacks declarados, caminhos de relatório customizados, um `qa.max_fix_files` do operador — é preservado.

O prompt de uma unidade é o **perfil dev-lane** (as seções `## Implementation strategy` e `## Execution invariants` extraídas do `dev.md` instalado, mais as regras de faixa: nenhum comando de posse de estágio, só os arquivos da unidade, verificação real, o relatório JSON vinculado) seguido do contrato da unidade e das linhas do PRD/plano das capacidades daquela unidade — nunca os documentos inteiros. Avisos (`lane_role_mismatch`, `self_review_same_model`, `cap_without_unit`, `unit_without_cap`, `prd_missing`, `lane_without_units`, `active_run_state`) ficam registrados no plano e nunca bloqueiam.

`verify:artifact --kind=execution-plan` é o gate de frescor: falha quando o plano, o arquivo de papéis, as faixas do manifesto, um prompt gerado ou uma assinatura de host deixaram de corresponder ao compilado (`plan_digest_stale`, `roles_changed`, `manifest_lanes_diverged`, `prompt_stale`, `signature_missing`) e avisa quando o kernel do dev mudou desde então (`dev_profile_stale`). Dispara automaticamente no `agent:done` do planner e fica em silêncio para features que nunca compilaram um plano.

### Roteamento

A cadeia canônica não muda (`@product → @sheldon → @planner → @dev → @qa`); o caminho orquestrado é servido por pinos e gates determinísticos dentro do `workflow:next`, então um projeto que nunca o destravou recebe prompts byte a byte idênticos:

- **Ativação do planner** — quando `execution:offer` responde `available` (arquivo de destravamento + todo papel assinado), o contexto de ativação pina a oferta (papéis, a escolha de uma pergunta só, o comando de compile) e, quando existe plano compilado, se está fresco ou obsoleto. Quando não responde, features MEDIUM ou maiores recebem uma linha nomeando o estado travado (`reason`, as CLIs de execução instaladas nesta máquina) e o passo de destravamento; ativações MICRO/SMALL ficam byte a byte iguais — a lane enxuta nunca carrega isso.
- **Conclusão do planner** — `workflow:next --complete=planner` mede o plano: um candidato a divisão (`plan.scale`) sem escolha de execução registrada imprime o aviso `[Execution Scale]` com os números, a recomendação medida (que um arquivo de papéis travado nunca inverte) e as duas formas de registrar a resposta. Advisory, nunca bloqueia: DEV único pode muito bem ser a resposta certa; o que se cobra é que ninguém a registrou. Um plano orquestrado **serial por construção** (uma unidade por onda) ou com unidade acima do teto imprime o mesmo aviso com a forma e o corte a fazer — mesmo com o arquivo de papéis e o plano compilado verdes.
- **Conclusão do planner** — com `orchestration.execution: orchestrated` no manifesto, `workflow:next --complete=planner` é **bloqueado** com plano compilado ausente ou obsoleto (`[Execution Plan BLOCKED]` … `aioson execution:compile`). É o gate "não roda sem modelos por papel", no motor.
- **Ativação do DEV / @orchestrator** — com o manifesto orquestrado, o contexto de ativação pina o estado do run (`compiled, not started` / decisões pendentes com suas dicas / `completed` com as unidades de integração) e aponta para o doc roteado `.aioson/docs/dev/execution-lanes.md` § Compiled orchestrated execution, que carrega o protocolo (`execution:run` → `execution:decide` → `--resume` → `execution:status` → integrar → concluir DEV como sempre). `@orchestrator` segue como desvio explícito cujo kernel roda o mesmo motor e entrega o ledger ao `@dev`.
- **Conclusão do DEV** — resumo `execution` advisory no resultado quando as faixas compiladas nunca rodaram até o fim (`run: not_started | decision_required | …`); nunca bloqueia.

### Rodando o plano (`execution:run`, `execution:decide`, `execution:status`, `execution:graph`)

```bash
aioson execution:graph . --feature=minha-feature                    # o grafo compilado (ascii); --format=mermaid|json; estado do run por cima
aioson execution:run . --feature=minha-feature --preflight --json   # só o preflight determinístico
aioson execution:run . --feature=minha-feature                      # linhas ao vivo no stdout; --json move-as para stderr
aioson execution:decide . --feature=minha-feature --unit=phase-2 --choice=fallback:qwen/qwen-3.8-max
aioson execution:run . --feature=minha-feature --resume
aioson execution:status . --feature=minha-feature --json
```

O run segura o lease da feature durante toda a execução e agenda unidades por **prontidão**: uma unidade começa quando suas dependências reais estão satisfeitas, enquanto unidades independentes e com arquivos disjuntos podem ocupar até dez workers mesmo quando pertencem à mesma faixa lógica. `execution:graph` mostra dependências explícitas e barreiras implícitas de onda. Cada unidade é um pipeline `dev → qa`: o DEV roda não assistido dentro da propriedade exata de arquivos, grava o relatório vinculado e sai; o QA revisa e testa em processo separado, com correções medidas no worktree. O painel informa separadamente workers ativos, unidades prontas e unidades bloqueadas por dependência/conflito; `1/10` não quer dizer que existam nove tarefas executáveis. Quando `integration_dev` está configurado, todos os pipelines são seguidos por um DEV supervisor corretivo sobre o resultado combinado e a verificação completa, e depois pelo QA compartilhado sobre esse estado final; o ciclo QA→DEV também para em cinco retornos. Sem `integration_dev`, unidades de integração continuam listadas para o DEV da sessão, mantendo compatibilidade com arquivos antigos.

Nada decide em silêncio. Uma unidade cujo papel dev não consegue iniciar (`executable_not_found`, `auth`, `capacity`, `invalid_model` …), estoura o tempo, quebra, não escreve o relatório vinculado ou reporta `FAIL`/`BLOCKED` — ou cujo revisor não consegue rodar — deixa um `decision_required` em `.aioson/context/execution-state-{slug}.json` e um evento `decision_required` na telemetria de execução daquela unidade (`agent_execution_events`, a tabela que um cliente supervisor já consulta); as outras unidades da onda terminam e o run pausa com `status: decision_required`. `execution:decide` responde por unidade — `retry`, `fallback:<host>/<modelo>[/<effort>]` (o fallback precisa de assinatura de host válida), `skip` (estágio dev: o dono da integração implementa, registrado como `unit_skipped`), `skip-qa` (estágio qa: registrado como `qa_skipped`), `abort` — e registra a decisão (`decision_applied`); `execution:run --resume` continua de forma idempotente: unidades aprovadas nunca rodam de novo, e um plano ou manifesto alterado desde o início do run recusa com `run_state_stale` (`--fresh` recomeça). Uma revisão reprovada (veredito `FAIL`) é achado para a integração, não bloqueio.

Vida é medida, não declarada: cada processo envia sua saída para a telemetria, e uma unidade sem saída **e** sem mudança nos próprios arquivos por `stallMs` é marcada `stalled`. A medição olha os arquivos declarados da unidade, nunca raízes de unidades irmãs nem `.aioson/`; uma varredura parcial reporta `measured: false`, sem inventar ausência de escrita. O sinal `unproductive` registra falta de mudança mesmo quando há saída. Essas observações de tempo são advisórias, não prazos de execução. Os guards decisivos usam comportamento: quatro ações estruturadas idênticas ou 24 ações consecutivas apenas de leitura encerram a tentativa como `unproductive_loop` para liberar um fallback autorizado; uma segunda recuperação equivalente sem mudança medida abre `recovery_no_progress`; e uma unidade pode voltar do QA ao DEV no máximo cinco vezes antes de `dev_qa_cycle_limit`. O AIOSON não aplica corte por tokens nem por relógio. Se um provedor/cliente reportar `timeout`, o ledger o identifica como `external_host_or_client` e preserva a atividade medida no disco. A cada 15 s o pulso registra tempo decorrido, última escrita, arquivos alterados e flags; janela de contexto, pico observado, duração e totais de tokens ficam somente nos relatórios.

**Loop de rework.** `qa.max_rework_rounds` (0–3, default 0) é a política local limitada. Na recuperação contínua/Autopilot, aceite reprovado pode seguir além dela, mas nunca indefinidamente: a mesma unidade volta do QA ao DEV no máximo cinco vezes durante toda a run. A falha seguinte vira `dev_qa_cycle_limit`, preservando achados e relatórios. Cada rodada é um novo par de processos com relatório vinculado próprio; unidades já aprovadas não rodam de novo.

**Mailbox — as arestas laterais.** Um processo de faixa não fala com outro concorrente, e um processo que terminou não responde a nada: a única aresta entre unidades que existe em todo host é assíncrona — é contrato, não canal. Um relatório pode trazer `messages[]` — `{to: "lane:<id>" | "unit:<id>" | "integration" | "orchestrator", kind: contract_change | note | question, text (≤ 500 chars), paths?}`, no máximo 10 — e o motor entrega onde existe um leitor: uma unidade que começa depois recebe, no seu prompt de runtime (`## Messages for you`), toda mensagem endereçada a ela ou à sua faixa por unidades que já terminaram; o revisor de uma unidade recebe as mensagens do implementador dela (`## Implementer messages`) mais a mesma caixa de entrada; o dono da integração recebe tudo por `execution:status` (`mailbox[]`, com `from`/`stage`/`wave`). Uma `question` vira o achado de run `unanswered_question` na conclusão — o processo que perguntou já morreu; o dono da integração responde — nunca um bloqueio. Entradas malformadas são descartadas e contadas (`mailbox_invalid`). Os prompts compilados nunca mudam: as mensagens entram no prompt de runtime como o relatório do implementador entra no do revisor. Um cliente que possui terminais vivos (um spawner) pode relayar uma mensagem para uma sessão em execução por cima disso; o arquivo é o contrato, o relay é bônus.

`execution:status` é o ledger consolidado: resumo do run, ondas, status dev/qa por unidade com hosts, vereditos, caminhos de relatório, correções e achados (dev, qa e nível de run), decisões pendentes com suas dicas, unidades de integração, `resume_command` — mais a visão de fora: `engine` (`alive` / `missing` / `idle`, medido pelo próprio pulso do estado; um engine `missing` nomeia o `--resume` que recupera as unidades interrompidas) e `running[]` (cada estágio em execução com sua medição ao vivo). `--watch[=<segundos>]` relê até o run sair de `running` (a visão de segundo terminal que o próprio run nomeia no início), `--format=line` é uma linha para um painel de status.

### A costura do cliente — `execution.spawner` (a unidade como terminal do cliente)

Por padrão o motor spawna ele mesmo a CLI do host de cada unidade, e o processo fica invisível para quem supervisiona a sessão. Um cliente que possui terminais — uma IDE desktop, um cockpit de missões — pode assumir o **spawn** sem assumir o motor: declara um spawner (`execution.spawner` no arquivo de papéis, ou `AIOSON_EXECUTION_SPAWNER` no ambiente da sessão — o ambiente vence, é a dica do cliente que possui o PTY da sessão) e, para cada unidade, o motor entrega a esse comando um envelope JSON no stdin em vez de spawnar o host:

```json
{ "version": 1, "action": "spawn", "feature": "my-feature", "run_id": "…", "attempt_id": "…",
  "unit": "phase-1", "lane": "backend", "wave": 1, "role": "dev",
  "host": "codex", "model": "gpt-5.6", "reasoning_effort": "high",
  "cwd": "/project", "prompt_path": ".aioson/context/reports/my-feature/<run_id>/phase-1.prompt.md",
  "report_path": ".aioson/context/reports/my-feature/<run_id>/phase-1.json",
  "write_paths": ["src/api/**"], "writable_roots": [],
  "command": "codex", "args": ["exec", "--skip-git-repo-check", "--dangerously-bypass-approvals-and-sandbox", "…"], "prompt_stdin": true, "sandbox_mode": "workspace-write" }
```

O cliente abre o processo onde quiser, alimenta-o com o prompt e responde uma linha JSON — `{"ok": true, "session_id": "…", "pid": 123}`. O motor espera o **relatório vinculado**, registra `session_id` e só pede ao cliente para fechar a sessão quando a própria orquestração é abortada. O envelope não expõe campo de timeout. Spawner fora da PATH falha o preflight (`spawner_not_found`); spawner que recusa, quebra ou não responde `ok: true` deixa `decision_required` (`spawner_failed`). `execution:offer` reporta `context_limit_enabled: false` e `time_limit_enabled: false` com o spawner ativo. Configuração legada de timeout é ignorada.

## Fallback somente explícito

CLI ausente, capability incompatível ou modelo indisponível pausa a execução. O modelo do chat atual nunca pode imitar silenciosamente o modelo solicitado.

Um fallback só roda quando a entrada e a política global o autorizam:

```json
{
  "fallbacks": [
    {
      "host": "codex",
      "model": "configured-default",
      "on": ["unavailable", "capacity"]
    }
  ],
  "capacity_policy": {
    "strategy": "fallback",
    "max_attempts": 2,
    "backoff_ms": 0,
    "allow_cross_host": true
  }
}
```

Sem essa declaração, o estado fica `paused` e traz um comando de retomada.

## Resolução e vínculo do relatório

Nomes de modelos Codex são resolvidos de forma conservadora pelo catálogo local: slug exato, nome normalizado, alias único e correção curta limitada. Versões numéricas nunca mudam. Outros hosts aceitam IDs literais seguros quando não possuem catálogo.

Estado, relatório e telemetria preservam:

- modelo solicitado e resolvido;
- estratégia de resolução;
- reasoning effort quando suportado;
- host e histórico de fallback;
- feature, run, tentativa, agente/faixa, raízes graváveis e caminhos declarados.

Relatórios que não correspondem à tentativa registrada são recusados.

## Política de revisão

`aioson verification:plan . --feature=minha-feature --trigger=per-phase` não roda revisor por padrão. Em `end-of-feature`, somente QA é padrão. Tester, Pentester e Validator só rodam automaticamente quando sua entrada no manifesto estiver habilitada e o gatilho correspondente existir. Uma chamada direta do usuário ativa apenas aquele passe do especialista e não altera o manifesto nem habilita execuções futuras.

Antes de Tester/Pentester editar produção, seu relatório precisa declarar `allowed_fix_paths`. O `review-cycle:advance` aceita no máximo 3 paths de comportamento/5 totais e captura o baseline Git. Se o especialista estiver desligado e o passe foi pedido diretamente pelo usuário, o comando exige `--manual`. O `review-cycle:resolve` só devolve ao QA quando o diff líquido respeita os paths persistidos; caso contrário retorna `stop_scope_violation` e transfere o pacote completo ao DEV.
