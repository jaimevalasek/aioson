# O @neo custava 27 mil tokens por ativação e podia discordar do motor

**Escopo:** `@neo` (kernel + `docs/neo/state-diagnostics.md` + `docs/neo/routing-matrix.md`), hosts que iniciam todo item de trabalho no @neo, `workflow:status`, `preflight`, review-intelligence (autoridades do pacote).

## O que aconteceu

Sessão supervisionada de 2026-10-10 (fonte: AIOSON supervised session — um host desktop que começa cada trabalho no @neo e compara a proposta dele com `workflow:status`). Medição em cópia descartável do estado real do projeto, com os agentes e docs do template atual:

- O protocolo de ativação do kernel (pulse, `memory:status`, `memory:summary`, `workflow:next --status`, `hygiene:scan --json`, `context:brief` com recall e semântica, `harness:status`, `preflight`, skill de decisão, `routing-matrix.md`) somava ~27.000 tokens de entrada e dez chamadas de ferramenta antes da primeira resposta. `context:brief` sozinho levava 12–26 s (índice de recall), `workflow:status` 6,5 s a frio.
- `hygiene:scan --json` tinha 12 KB (itens de todos os buckets); a saída texto tem 1 KB com os mesmos contadores. `preflight` tinha 11 KB, quase todo `path_states`. `feature:trace` tinha 37 KB.
- Divergência real: a pulse dizia "Gate C aprovado → @dev"; `workflow:status` dizia "próximo @sheldon: review obsoleta para o PRD/autoridades atuais". Causa: `project.context.md` (autoridade dura de todo pacote de review) foi editado depois do PASS do Sheldon; os quatro pacotes (briefing, product, refiner, sheldon) ficaram `no_current_packet`. `preflight` dizia READY porque lê só os marcadores de frontmatter (`product_scope`, `prd_ready`, `status: approved`).
- O kernel mandava "quando a sugestão do `workflow:next --status` diferir da sua rota por evidência, mostre as duas" — ou seja, o Neo podia propor outro agente; o host recusava o despacho e o trabalho parava. Modelos pequenos terminavam sem o bloco `---routing---`.

## Por que todo gate ficou verde

**Superfície descoberta:** ninguém media o custo de uma ativação do Neo nem o número de chamadas; o kernel acumulou leituras "para garantir". **Dois roteadores:** a prosa do Neo e o motor chegavam a rotas diferentes a partir das mesmas pastas; a pulse (escrita pelo último agente) e o `preflight` (frontmatter) não reavaliam os reviews hash-bound que o motor reavalia a cada chamada. **Self-grading:** nenhum teste pinava o protocolo de ativação.

## O que previne agora

- Kernel do @neo: três leituras (pulse, `workflow:status . --json`, `hygiene:scan .` texto); `context:brief` só para pedido concreto e com `--no-semantic --no-recall` (1 s, só regras); `preflight`/`harness:status`/`memory:summary` só quando a pergunta é sobre eles. Medido na mesma cópia: ~4.600 tokens, 4 chamadas e 7 s de CLI num pedido concreto (~3.500 tokens na ativação sem pedido), contra ~27.000, dez chamadas e ~45 s.
- Feature vinculada (`--feature=<slug>` na ativação ou pedido que continua a ativa): `agent:` é o `state.next` do motor, sem exceção; pulse/gate/`preflight` discordando viram `confidence: medium` + causa em `reason`. Bloco de roteamento em toda resposta, inclusive falha.
- Feature nova entra na cadeia pela primeira etapa que falta (`@briefing` para pensamento cru ou superfície visual sem protótipo aprovado; `@product` para escopo já decidido); regra do projeto em `must_load` vence o default.
- `tests/neo-agent-kernel.test.js` pina as três leituras, as flags do brief, a regra "motor dono da rota", a ausência de `feature:trace`, o bloco obrigatório e o espelho template/workspace.

## Decisões em aberto (do dono)

- `project.context.md` como autoridade dura dos pacotes de review: uma edição de prosa (ex.: precisar a stack) invalida todos os reviews de todas as features em andamento. Opções: tornar `soft`, ou hashear só o frontmatter de contrato. Mudança de semântica para todos os consumidores; não feita.
- `preflight` poderia carregar `workflow.next_stage`/`contract_missing` (aditivo) para nunca contradizer o motor num mesmo payload.
- Leitura compacta de progresso de implementação (fases do plano × caminhos presentes, dev-state, checks do harness, veredito QA, drift) para supervisão — hoje só existe espalhado em `preflight.gate_c_baseline.path_states`, `harness:status`, `feature:trace`.

## Receita

Medir uma ativação de agente como medimos um artefato: tokens de cada entrada, número de chamadas, latência de cada comando, numa cópia descartável do consumidor (agentes do template por cima). Quando dois comandos do framework discordam sobre a mesma feature, o motor (`workflow:status`) é a autoridade e os outros têm que dizer isso; o agente nunca arbitra entre eles.
