# O banco do runtime apagava linhas e nunca devolvia o espaço — 119 MB com 76 MB de páginas mortas

**Escopo:** `.aioson/runtime/aios.sqlite`, `src/runtime-maintenance.js` (retenção, vivo × stale, saúde, `maintainRuntimeDb`), poda automática da ponte de telemetria (`pruneExecutionOutput`/`pruneExecutionTelemetry`), `feature:close`, `doctor` (`runtime:db_health` + `--fix`), `runtime:storage|prune|compact`, módulo `neo/runtime-storage.md`.

## O que aconteceu

O operador reclamou que `.aioson/runtime/` acumulava lixo e queria saber o que precisa ficar e o que só serve durante a implementação. Medido read-only em 42 projetos (fonte: sessão supervisionada AIOSON, projetos consumidores com lanes orquestradas):

- O maior `aios.sqlite` tinha **118,9 MB, dos quais 76 MB eram páginas livres**. Outros: 66,9 MB (25 MB livres) e 50 MB. `auto_vacuum = 0` em todos: DELETE nunca encolhe o arquivo, e nada rodava `VACUUM` sozinho.
- A família dominante era `agent_execution_events` com `event_type = 'output'` — a saída bruta das lanes, que só serve enquanto a feature está em andamento.
- **A retenção não alcançava a saída de runs mortos.** A regra exigia `state IN ('passed','failed','cancelled')`; o dispatcher deixa `correcting` quando o veredito não é PASS/FAIL, e um motor morto deixa `running`. Resultado: 33 mil eventos de output de julho presos para sempre (a prévia antiga achava 17,5 mil linhas; a nova acha 50,9 mil).
- **A compactação era bloqueada para sempre.** `runtime:compact`/`--compact` recusavam qualquer linha `running`: 55 tasks + 92 agent_runs "running", a mais velha de quatro meses, nenhuma tocada no último dia. Sem `--force` o espaço nunca voltava.
- **Nada amarrava a telemetria ao ciclo da feature.** `feature:close` não tocava no banco; a poda só existia como comando manual e na partida do motor (sem `VACUUM`).
- Bônus: `idx_agent_execution_events_cursor` duplicava exatamente o índice do `UNIQUE(telemetry_run_id, sequence_no)` — 3,3–3,6 MB por banco.

## Por que todo gate ficou verde

Classe **heurística errada + misfire**: a retenção existia mas não enxergava estados não terminais de motor morto; a compactação existia mas tratava "status ativo" como "processo vivo"; e nada disparava a manutenção num ponto quieto do ciclo. Nenhum check media o tamanho do banco.

## O que previne agora

- `feature:close` (qualquer veredito) roda `maintainRuntimeDb`: apaga o output bruto das lanes da feature fechada (linhas de run, eventos de ciclo de vida e relatórios ficam), aplica a retenção e compacta quando há ≥ 8 MB e ≥ 25% de páginas livres e nada vivo; reporta `runtime db: … compacted 118.9 MB -> 20.0 MB`.
- Retenção: estados de espera (`correcting`, `waiting_report`, `paused`) expiram por inatividade; estado de processo sem nenhum evento na janela = motor morto (só o output sai — a linha do run `running` nunca é removida, AC-10). `abandoned` (de `agent:recover`) passa a expirar.
- Vivo = status ativo **e** movimento nos últimos 120 min (update ou evento). O resto aparece como `stale` no `runtime:storage` (recomendação `recover_stale_runs`) e não bloqueia compactação.
- `doctor` reporta `runtime:db_health` (advisory: páginas livres acima do limiar ou > 64 MB de dados vivos); `doctor --fix` poda e compacta.
- O índice duplicado é removido em todo `openRuntimeDb`.
- Live-fire em cópias: 118,9 → 20,0 MB; 66,9 → 15,6 MB; 50,0 → 10,9 MB.

## Receita

- Medir tamanho de SQLite: `dbstat` por tabela + `freelist_count × page_size`; arquivo grande com freelist alto = falta `VACUUM`, não excesso de dados.
- "Ativo" para manutenção é atividade recente, nunca só o status gravado — processos morrem sem gravar o estado final.
- Medição em banco de consumidor: abrir `readonly` ou trabalhar numa cópia; `openRuntimeDb` migra e escreve.
- Arquivos soltos que agentes deixam em `.aioson/runtime/` (zips, binários de banco, logs) não são do framework; ficam fora deste ciclo.
