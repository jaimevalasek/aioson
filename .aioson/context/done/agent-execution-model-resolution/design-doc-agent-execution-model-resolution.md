---
slug: agent-execution-model-resolution
classification: SMALL
gate_design: approved
status: approved
---

# Design doc — Agent Execution Model Resolution

## Decisão
Adicionar duas responsabilidades pequenas ao domínio existente: `model-catalog.js` carrega/valida catálogos declarados por capability; `model-resolver.js` executa matching puro e determinístico. Manifest/CLI/dispatcher consomem essa camada antes de construir argv, enquanto adapters continuam responsáveis apenas pela tradução nativa do host.

## Catálogo Codex
- Fonte: `CODEX_HOME/models_cache.json` quando `CODEX_HOME` existir; senão `os.homedir()/.codex/models_cache.json`.
- O path é derivado do ambiente confiável do processo, nunca do manifesto. Leitura read-only, tamanho limitado e validação do shape `{fetched_at, client_version, models[]}`.
- Campos usados: `slug`, `display_name`, `supported_reasoning_levels[].effort`; desconhecidos são ignorados. Conteúdo bruto não entra em state/log/telemetria.
- Ausência, excesso, JSON inválido ou versão incompatível retorna capability indisponível com diagnóstico sanitizado.

## Resolver
1. `configured-default` retorna sem lookup, marcado como default do host.
2. Comparar slug exato.
3. Comparar chave normalizada de slug/display name: NFKD, lowercase e tokens alfanuméricos; números mantêm ordem/valor.
4. Aceitar alias somente se os tokens pedidos formarem sufixo inequívoco e não forem genéricos.
5. Aplicar distância Damerau-Levenshtein limitada somente entre candidatos com os mesmos tokens numéricos informados e família compatível; exigir vencedor único e margem para o segundo lugar.
6. Retornar estrutura `{requested,resolved,strategy,catalog_source,catalog_fetched_at,supported_efforts}` ou erro `{reason,candidates}`. Candidatos são slugs sanitizados, ordenados e limitados.

## Integração
- `capabilities.js`: Codex external declara `model_catalog` e `reasoning_effort`; outros hosts permanecem false até adapter comprovado.
- `schema.js` + schema JSON: `reasoning_effort` opcional no objeto do agente; nenhuma concatenação dentro de `model`.
- `manifest.js`: defaults omitem o campo; merge aditivo preserva valores. A resolução assíncrona é uma função nova, mantendo o resolver estrutural atual compatível.
- `dispatcher.js`: resolve antes de criar attempt/spawn; congela metadados na attempt; fallback resolve e valida o candidato antes de executar.
- `adapters/codex.js`: argv separado `--model <slug>` e `-c model_reasoning_effort="<effort>"`; prompt continua stdin e `shell:false` vem do base adapter.
- `reports.js`, execution prompt e `verification-plan.js`: expõem campos opcionais de resolução/esforço sem quebrar relatórios v1 antigos.
- `runtime-store.js`/telemetry bridge: migração aditiva ou payload estruturado permite consultar requested/resolved/effort/strategy sem persistir catálogo bruto.
- `agent:execution:show|validate`: executam preflight de resolução e mostram correção/ambiguidade; dispatch/resume usam o mesmo core.

## Segurança e compatibilidade
- Sem shell/eval, sem command string e sem path configurável pelo usuário para catálogo.
- Resolver puro recebe catálogos injetados em testes; a suíte não lê o perfil real nem usa rede.
- Cache não comprova entitlement/capacidade; erros runtime continuam classificados pelo adapter e `capacity_policy`.
- Attempt ativa não é re-resolvida no resume; mudança de manifesto continua protegida por digest.
- Schema distribuído e workspace permanecem idênticos; docs template/workspace são atualizadas juntas.

## Caminhos
- Criar: `src/agent-execution/model-catalog.js`, `src/agent-execution/model-resolver.js`, testes unitários correspondentes.
- Modificar: schema/manifest/capabilities/dispatcher/Codex adapter/reports/telemetry, comando `agent-execution`, verification plan e testes existentes.
- Distribuir: `template/.aioson/schemas/agent-execution.schema.json`, `.aioson/schemas/agent-execution.schema.json`, docs de autopilot/phase-loop em template e workspace.
- Reusar: executable resolver, base adapter, capacity policy, state digest, report binding e redactors atuais.
