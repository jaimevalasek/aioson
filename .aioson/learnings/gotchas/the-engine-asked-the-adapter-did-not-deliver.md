---
title: "O motor pedia certo, o adaptador não entregava — e a falha não tinha saída"
scope: [agent-execution, execution-run, adapters, host-signature, lease, execution-plan, autopilot]
paths:
  - src/lib/tool-capabilities.js
  - src/commands/live.js
  - src/agent-execution/adapters/antigravity.js
  - src/agent-execution/adapters/base.js
  - src/agent-execution/execution-run.js
  - src/lib/host-signature.js
  - src/agent-execution/execution-plan.js
discovered_at: 2026-09-03
src: "AIOSON supervised session: primeira execução orquestrada real de ponta a ponta num projeto consumidor (6 unidades / 4 ondas / 2 lanes / 10 processos)"
status: corrigido no framework
---

# O motor pedia certo, o adaptador não entregava — e a falha não tinha saída

## O que o consumidor sentiu

1. Uma lane passou a noite pedindo aprovação; o log parou em `dev: started codex/<model>` e nada mais aconteceu. Corrigido à mão no pacote instalado (que é um symlink para este repo — o "patch no pacote" caiu na árvore de trabalho daqui).
2. Corrigido isso, a onda seguinte morreu aos 10 min com arquivos escritos pela metade, relatada como `timeout` — como se o worker tivesse falhado. Subir o orçamento nos roles invalidou o plano (`roles_changed`), recompilar trocou o `plan_digest`, e a run recomeçou do zero.
3. `--resume` depois do kill: `run_lease_held: another execution run ... holds this feature`. A lease expiraria sozinha em ≤30 s; a mensagem não dizia, e o operador apagou o lock à mão — o único caminho realmente perigoso.
4. O plano compilava limpo com o bloco inteiro de fases duplicado (2× `## Execution Sequence`), e as cópias discordavam da onda de um arquivo.

## Por que todo gate ficou verde

- **Misfire** (B1): o registro de hosts já declarava `codex.yolo_args`; três adaptadores o consultavam, o do codex carregava a própria tradução `--sandbox workspace-write` (a escrita sandboxed cujas escalações ainda passam pela política de aprovação). Nenhum teste comparava os quatro.
- **Superfície descoberta** (I1/I2): não existia `permission_mode` em lugar nenhum da cadeia, e a assinatura provava login + modelo, nunca "edita sem pedir". O preflight conferia o binário na PATH e dizia `ready`.
- **Heurística errada** (I3): o detector de travamento exigia silêncio ANTES de olhar o disco; um worker bloqueado num prompt imprime o prompt sem parar e nunca fica silencioso. Ao contrário, 4 das 5 unidades saudáveis foram marcadas `stalled` (host `--print` não transmite nada até o fim).
- **Default de comando, não de worker** (B4/I5): `600000` + `||` (zero era ausência) + digest bruto do arquivo de roles preso ao plano.
- **UX que mente por omissão** (B3): o arquivo do lock carrega `expires_at`; a mensagem não o lia.

## O que agora impede em todo projeto

- Tradução de `sandbox_mode` é do registro (`read_only_args` ao lado de `yolo_args`) e `createAdapter` a aplica para todo adaptador; host sem tradução recusa (`sandbox_mode_unsupported` / `permission_mode_unsupported`) — teste de paridade host × modo em `tests/execution-unattended.test.js`.
- Lane worker roda **sempre não assistido**; o modo `sandbox` do provedor saiu do framework por decisão do dono depois da medição: nesta máquina o `codex-windows-sandbox-setup.exe` não carrega ("módulo não encontrado"), e sob `--sandbox workspace-write` o modelo respondeu DONE após 96 s SEM escrever o arquivo; sob o flag não assistido escreveu em 14 s. Não existe knob de permissão por papel de propósito.
- Workers orquestrados não têm cutoff de contexto nem prazo de relógio do AIOSON; campos legados de orçamento são ignorados. Janela/pico de contexto, tokens, duração e atividade aparecem somente nos relatórios. O digest de ligação do plano cobre só o que molda as unidades (papéis, paralelismo, `require_independent_qa`) — spawner fica fora; planos antigos seguem frescos.
- `timeout` diz o que o disco viu (`still writing` → retry com orçamento maior; `never wrote` → fallback/abort) em `pending_decision.detail`.
- `unproductive` continua medido no disco; além do aviso, o guard estruturado encerra 4 ações estruturadas idênticas ou 24 ações apenas de leitura para liberar fallback, a segunda recuperação equivalente sem mudança medida abre o circuito e uma unidade volta do QA ao DEV no máximo 5 vezes.
- Lease: run e decide esperam uma lease que ninguém renova (≤35 s, anunciado) e recusam só a que alguém renova, com caminho e tempo restante; nunca apagam o lock.
- `host:signature` ganha a sonda de escrita não assistida (`unattended.yolo`, `host_not_unattended`); o preflight a lê — assinatura sem sonda é aviso com o comando de re-assinar. A sonda nunca roda o sandbox do provedor (rodá-lo abriu um diálogo de erro do Windows na tela do dono).
- `execution:compile` recusa heading canônico duplicado (`duplicate_plan_section`); PRD duplicado avisa.
- `antigravity` é o id lógico do host; o executável headless é `agy`. Resolver o id diretamente na PATH chama `antigravity.cmd`, o launcher Electron do editor. Todo launch consulta `tool-capabilities.binary`, e o worker usa `shell:false`, pipes e `windowsHide:true`. No AGY, `--print-timeout 0ms` significa retorno parcial imediato, não ilimitado; o sentinel sem limite precisa ser traduzido para a maior duração aceita pelo cliente.

## Armadilhas para a próxima vez

- O Bash tool no Windows come barras invertidas até em heredoc com delimitador entre aspas: regex `\.`/`\d` e `\'` viram lixo e o `<<'EOF'` quebra com "unexpected EOF". Código de teste com regex entra por Edit/Write.
- Pinos que quase quebraram: ids dos checks do preflight (`['plan','manifest','host:*','units']` — avisos vão em `preflight.warnings`, nunca em check novo); chaves raiz do seed (`execution` não pode ser semeado); `deepEqual` da lane compilada (ganhou `permission_mode`); `getExecutionCapabilities(...)` deepEqual (campos novos ficam no TOPO do host, nunca dentro de `execution`); primeiro evento do run é `run:started` (o `budget` vem depois).
- Testes que seguram lease precisam de `leaseWaitMs: 0` (o default espera 35 s e depois ACEITA a lease do teste, que ninguém renova).
- Sonda real no consumidor custa uma chamada de modelo por assinatura (TTL 24 h), nunca por run.

Relacionado: [[orchestrated-unit-was-never-measured]], [[orchestrated-path-had-no-first-door]]
