'use strict';

module.exports = {
  cli: {
    title: 'CLI do AIOSON',
    title_line: '{title}\n',
    usage: 'Uso:',
    help_item_line: '  {text}',
    help_init:
      'aioson init <project-name> [--force] [--dry-run] [--lang=<bcp47-tag>] [--tool=codex|claude|opencode] [--locale=pt-BR]',
    help_install:
      'aioson install [path] [--force] [--dry-run] [--lang=<bcp47-tag>] [--tool=codex|claude|opencode] [--locale=pt-BR]',
    help_setup:
      'aioson setup [path] [--defaults] [--framework=<nome>] [--lang=<bcp47-tag>] [--project-name=<nome>] [--force] [--dry-run] [--tool=codex|claude|opencode] [--locale=pt-BR]',
    help_update:
      'aioson update [path] [--dry-run] [--lang=<bcp47-tag>] [--locale=pt-BR]',
    help_info: 'aioson info [path] [--json] [--locale=pt-BR]',
    help_doctor: 'aioson doctor [path] [--fix] [--dry-run] [--json] [--locale=pt-BR]',
    help_i18n_add: 'aioson i18n:add <locale> [--force] [--dry-run] [--locale=pt-BR]',
    help_agents: 'aioson agents [path] [--lang=<bcp47-tag>] [--locale=pt-BR]',
    help_agent_prompt:
      'aioson agent:prompt <agent> [path] [--tool=codex|claude|opencode] [--lang=<bcp47-tag>] [--locale=pt-BR]',
    help_agent_help:
      'aioson agent:help [agent] [--json]',
    help_agent_invoke:
      'aioson agent:invoke <agent> [path] [--tool=codex|claude|opencode] [--mode=framework_target|app_target] [--feature=<slug>] [--scope=<area>] [--lang=<bcp47-tag>] [--locale=pt-BR]',
    help_context_validate: 'aioson context:validate [path] [--json] [--locale=pt-BR]',
    help_context_pack:
      'aioson context:pack [path] [--agent=<agente>] [--goal=<texto>] [--module=<modulo-ou-pasta>] [--max-files=8] [--json] [--locale=pt-BR]',
    help_context_load:
      'aioson context:load [path] --target=<rule|brain>:<slug> --agent=<nome> [--batch="slug1,slug2"] [--feature=<slug>] [--classification=<MICRO|SMALL|MEDIUM>] [--verbose] [--json] [--locale=pt-BR]',
    help_chain_audit:
      'aioson chain:audit <arquivo> [path] [--limit=N] [--feature=<slug>] [--json] [--locale=pt-BR]',
    chain_audit: {
      file_required: 'chain:audit exige um caminho de arquivo. Uso: aioson chain:audit <arquivo> [--limit=N] [--feature=<slug>] [--json]',
      runtime_unavailable: 'chain:audit runtime db indisponível: {error}',
      query_failed: 'chain:audit falhou ao consultar chain_edges: {error}',
      no_impacts: 'chain:audit {file} → nenhum impacto detectado ({duration}ms)',
      results_header: 'chain:audit {file} → {count} impacto(s) ({duration}ms):'
    },
    context_load: {
      target_required: 'context:load exige --target=<rule|brain>:<slug>.',
      agent_required: 'context:load exige --agent=<nome>.',
      target_invalid: 'context:load valor inválido para --target: {target}. Esperado rule:<slug> ou brain:<slug>.',
      success: 'context:load emitiu {count} evento(s) para o agente {agent}.'
    },
    help_memory_status: 'aioson memory:status [path] [--json] [--locale=pt-BR]',
    help_memory_summary: 'aioson memory:summary [path] [--last=5] [--json] [--locale=pt-BR]',
    help_memory_search:
      'aioson memory:search "<consulta>" [path] [--limit=5] [--surface=rules|learnings|all] [--include-archived] [--json] [--locale=pt-BR]',
    help_memory_archive:
      'aioson memory:archive [path] --id=<rule|learning|brain>:<slug> --reason="<texto>" [--feature=<slug>] [--dry-run] [--json] [--locale=pt-BR]',
    help_memory_restore:
      'aioson memory:restore [path] --id=<rule|learning|brain>:<slug> [--reason="<texto>"] [--feature=<slug>] [--dry-run] [--json] [--locale=pt-BR]',
    memory_archive: {
      id_required: 'memory:archive exige --id=<rule|learning|brain>:<slug>.',
      reason_required: 'memory:archive exige --reason="<texto>".',
      invalid_id: 'memory:archive valor inválido para --id: "{value}". Esperado rule|learning|brain:<slug>.',
      hook_blocked: 'memory:archive não pode ser invocado por hook (BR-ALL-01: tier-2 exige ação humana).',
      target_not_found: 'memory:archive: {kind} "{slug}" não encontrado em estado ativo.',
      already_archived: 'memory:archive: "{path}" já está arquivado. No-op.',
      notify_template: 'arquivando {kind} "{slug}": {reason}',
      dry_run_summary: 'memory:archive [dry-run]: moveria {source} → {dest} (entry ativa: {has_active}).',
      archived_success: 'memory:archive ✓ {kind} "{slug}" arquivado em {dest}.'
    },
    memory_restore: {
      id_required: 'memory:restore exige --id=<rule|learning|brain>:<slug>.',
      invalid_id: 'memory:restore valor inválido para --id: "{value}". Esperado rule|learning|brain:<slug>.',
      hook_blocked: 'memory:restore não pode ser invocado por hook (BR-ALL-01: tier-2 exige ação humana).',
      target_not_archived: 'memory:restore: {kind} "{slug}" não encontrado no arquivo.',
      target_already_active: 'memory:restore: {kind} "{slug}" já está ativo. No-op.',
      target_not_found: 'memory:restore: {kind} "{slug}" não encontrado.',
      notify_template: 'restaurando {kind} "{slug}": {reason}',
      dry_run_summary: 'memory:restore [dry-run]: moveria {source} → {dest}.',
      restored_success: 'memory:restore ✓ {kind} "{slug}" restaurado para {dest}.'
    },
    help_memory_trim:
      'aioson memory:trim [caminho] [--keep=<N>] [--archive=<path>] [--dry-run] [--json] [--locale=pt-BR]',
    memory_trim: {
      hook_blocked: 'memory:trim não pode ser invocado por um hook de runtime (tier-2 exige ação humana).',
      no_current_state: 'memory:trim: {path} não encontrado (nada a aparar).',
      archive_path_escape: 'memory:trim: --archive fora do projeto recusado: {path}',
      section_not_found: 'memory:trim: seção "## What the system already has" não encontrada — nada a fazer.',
      nothing_to_archive: 'memory:trim: {kept} entradas dentro da janela keep={keep} — nada a arquivar.',
      dry_run_summary: 'memory:trim [dry-run]: arquivaria {archived}/{total} entradas (keep={keep}, slug ativo isento). {before_kb}KB → {after_kb}KB (economiza {saved_kb}KB). Nenhum arquivo escrito.',
      notify_template: 'aparando current-state.md: arquivando {archived} entradas frias',
      trimmed_success: 'memory:trim ✓ {archived} entradas arquivadas (mantidas {kept}). {before_kb}KB → {after_kb}KB. Arquivo: {archive}'
    },
    memory_search: {
      query_empty: 'memory:search requer uma consulta não-vazia.',
      query_too_long: 'memory:search consulta excede {max} caracteres.',
      query_unparseable: 'memory:search consulta "{value}" fica vazia após sanitização (somente operadores / aspas).',
      invalid_surface: 'memory:search valor inválido para --surface: {value}. Esperado rules, learnings ou all.',
      no_results: 'Nenhum resultado para "{query}".',
      results_header: 'Top {count} resultados para "{query}":',
      snippet_truncated: 'Trecho truncado.'
    },
    help_brain_query:
      'aioson brain:query [path] [--tags=<csv>] [--agent=<agente>] [--min-quality=4] [--format=compact|json|ids] [--json] [--locale=pt-BR]',
    help_setup_context:
      'aioson setup:context [path] [--defaults] [--project-type=web_app|api|site|script|dapp|desktop_app] [--framework=<name>] [--backend=<name>] [--frontend=<name>] [--database=<name>] [--auth=<name>] [--uiux=<name>] [--language=<bcp47-tag>] [--web3-enabled=true|false] [--locale=pt-BR]',
    help_locale_apply:
      'aioson locale:apply [path] [--lang=<bcp47-tag>] [--dry-run] [--locale=pt-BR]',
    help_locale_diff: 'aioson locale:diff [agent] [--lang=<bcp47-tag>] [--json] [--locale=en]',
    help_test_agents: 'aioson test:agents [--json] [--locale=en]',
    help_test_smoke:
      'aioson test:smoke [workspace-path] [--lang=<bcp47-tag>] [--web3=ethereum|solana|cardano] [--profile=standard|mixed|parallel] [--keep] [--json] [--locale=pt-BR]',
    help_test_package:
      'aioson test:package [source-path] [--keep] [--dry-run] [--json] [--locale=pt-BR]',
    help_dossier_init:
      'aioson dossier:init [path] --slug=<slug-da-feature> [--classification=MICRO|SMALL|MEDIUM] [--json] [--locale=pt-BR]',
    help_dossier_show:
      'aioson dossier:show [path] --slug=<slug-da-feature> [--json] [--locale=pt-BR]',
    dossier_created: 'Dossier criado em {path} (classification={classification}).',
    dossier_already_exists: 'Dossier já existe em {path}. Abortando (init atômico, sem --force).',
    dossier_not_found: 'Dossier não encontrado para o slug "{slug}" (esperado em {path}).',
    help_workflow_plan:
      'aioson workflow:plan [path] [--classification=MICRO|SMALL|MEDIUM] [--json] [--locale=pt-BR]',
    help_workflow_next:
      'aioson workflow:next [path] [--complete[=<agente>]] [--agent=<agente>] [--skip=<agente>] [--status] [--suggest] [--tool=codex|claude|opencode] [--json] [--locale=pt-BR]',
    help_workflow_status:
      'aioson workflow:status [path] [--suggest] [--tool=codex|claude|opencode] [--json] [--locale=pt-BR]',
    help_workflow_execute:
      'aioson workflow:execute [path] [--steps=<n>] [--dry-run] [--lane=<n>] [--json] [--locale=pt-BR]',
    help_parallel_init:
      'aioson parallel:init [path] [--workers=2..6] [--force] [--dry-run] [--json] [--locale=pt-BR]',
    help_parallel_doctor:
      'aioson parallel:doctor [path] [--workers=2..6] [--fix] [--force] [--dry-run] [--json] [--locale=pt-BR]',
    help_parallel_assign:
      'aioson parallel:assign [path] [--source=auto|prd|architecture|discovery|<file>] [--workers=2..6] [--force] [--dry-run] [--json] [--locale=pt-BR]',
    help_parallel_status:
      'aioson parallel:status [path] [--json] [--locale=pt-BR]',
    help_parallel_merge:
      'aioson parallel:merge [path] [--apply] [--json] [--locale=pt-BR]',
    help_parallel_guard:
      'aioson parallel:guard [path] --lane=<n> --paths=<path[,path2]> [--json] [--locale=pt-BR]',
    help_mcp_init:
      'aioson mcp:init [path] [--tool=claude|codex|opencode] [--dry-run] [--json] [--locale=pt-BR]',
    help_mcp_doctor:
      'aioson mcp:doctor [path] [--strict-env] [--json] [--locale=pt-BR]',
    help_qa_doctor:
      'aioson qa:doctor [path] [--json] [--locale=pt-BR]',
    help_qa_init:
      'aioson qa:init [path] [--url=<app-url>] [--dry-run] [--json] [--locale=pt-BR]',
    help_qa_run:
      'aioson qa:run [path] [--url=<app-url>] [--persona=naive|hacker|power|mobile] [--headed] [--html] [--json] [--locale=pt-BR]',
    help_qa_scan:
      'aioson qa:scan [path] [--url=<app-url>] [--depth=3] [--max-pages=50] [--headed] [--html] [--json] [--locale=pt-BR]',
    help_qa_report:
      'aioson qa:report [path] [--html] [--json] [--locale=pt-BR]',
    help_harness_init:
      'aioson harness:init [path] --slug=<slug> [--mode=BALANCED|URGENT|ECONOMICAL] [--locale=pt-BR]',
    help_harness_validate:
      'aioson harness:validate [path] --slug=<slug> [--artifact=<path>] [--locale=pt-BR]',
    help_harness_retro:
      'aioson harness:retro [path] --feature=<slug> | --last=<N> [--json] [--locale=pt-BR]',
    help_harness_preview:
      'aioson harness:preview <file> [--max-bytes=8192] [--json] [--locale=pt-BR]',
    harnessRetro: {
      need_target: 'harness:retro requer --feature=<slug> ou --last=<N>.',
      invalid_slug: 'Slug inválido: {slug} (deve casar ^[a-z0-9][a-z0-9-]*$).',
      invalid_last: 'Valor inválido para --last: {value} (use inteiro >= 1).',
      feature_not_found: 'Feature não encontrada: {slug} (procurado em .aioson/context/, .aioson/plans/{slug}/, .aioson/context/features/{slug}/, .aioson/context/done/{slug}/).',
      no_closed_features: 'Nenhuma feature fechada em .aioson/context/done/ para minerar.',
      written: 'Dossiê retrospectivo gerado: {path} ({candidates} candidatos, {observations} observações).',
      empty: 'Dossiê gerado sem propostas: {path} (fontes sem trilha minerável).',
      io_error: 'Erro de I/O ao escrever o dossiê: {error}',
      window_truncated: '--last={n} excede features disponíveis ({available}); minerando todas.',
      undatable_excluded: '{count} feature(s) sem data de PASS determinável excluída(s) da janela: {slugs}'
    },
    harnessPreview: {
      file_required: 'harness:preview requer um caminho de arquivo <file>.',
      not_found: 'Arquivo não encontrado: {path}',
      read_error: 'Não foi possível ler o arquivo: {path} ({error})'
    },
    help_web_map:
      'aioson web:map [path] --url=<url> [--depth=<N>] [--max-pages=<N>] [--include-external] [--json] [--locale=pt-BR]',
    help_web_scrape:
      'aioson web:scrape [path] --url=<url> [--format=markdown|text|html|links] [--json] [--locale=pt-BR]',
    help_scan_project:
      'aioson scan:project [path] --folder=<pasta[,pasta2]> [--summary-mode=titles|summaries|raw] [--context-mode=merge|rewrite] [--with-llm] [--provider=<name>] [--llm-model=<name>] [--dry-run] [--json] [--locale=pt-BR]',
    help_config:
      'aioson config <set KEY=value|show|get KEY> [--json] [--locale=pt-BR]',
    help_genome_doctor:
      'aioson genome:doctor <arquivo> [--json] [--locale=pt-BR]',
    help_genome_migrate:
      'aioson genome:migrate <arquivo-ou-diretorio> [--write] [--no-backup] [--json] [--locale=pt-BR]',
    help_squad_status:
      'aioson squad:status [path] [--json] [--locale=pt-BR]',
    help_squad_doctor:
      'aioson squad:doctor [path] [--squad=<slug>] [--stale-minutes=5] [--json] [--locale=pt-BR]',
    help_squad_repair_genomes:
      'aioson squad:repair-genomes <manifest.json> [--write] [--no-backup] [--json] [--locale=pt-BR]',
    help_squad_validate:
      'aioson squad:validate [path] --squad=<slug> [--locale=pt-BR]',
    help_squad_export:
      'aioson squad:export [path] --squad=<slug> [--locale=pt-BR]',
    help_squad_pipeline:
      'aioson squad:pipeline [path] [--sub=list|show|status] [--pipeline=<slug>] [--locale=pt-BR]',
    help_squad_agent_create:
      'aioson squad:agent-create [path] --name=<nome> [--scope=my-agents|squad] [--squad=<slug>] [--type=agent|assistant|clone|worker] [--tier=0|1|2|3] [--disc=<perfil>] [--mission=<texto>] [--domain=<texto>] [--specialist=<nome>] [--with-infra] [--locale=pt-BR]',
    help_squad_investigate:
      'aioson squad:investigate [path] [--sub=list|show|score|link|register] [--investigation=<slug>] [--squad=<slug>] [--locale=pt-BR]',
    help_squad_learning:
      'aioson squad:learning [path] [--sub=list|stats|archive|promote|export] [--squad=<slug>] [--status=<status>] [--locale=pt-BR]',
    help_agent_audit:
      'aioson agent:audit [caminho] [--runtime-only|--template-only|--inception] [--locales] [--verbose] [--fix] [--json] [--locale=pt-BR]',
    help_quality_audit:
      'aioson quality:audit [caminho] [--feature=<slug>] [--provider-output=<caminho>] [--baseline=<caminho>] [--changed=<arquivo[,arquivo]>] [--json] [--locale=pt-BR]',
    help_squad_dashboard:
      'aioson squad:dashboard [path] [--port=4180] [--squad=<slug>] [--locale=pt-BR]',
    help_squad_worker:
      'aioson squad:worker [path] [--sub=list|run|test|logs|scaffold] [--squad=<slug>] [--worker=<slug>] [--input=<json>] [--locale=pt-BR]',
    help_squad_daemon:
      'aioson squad:daemon [path] [--sub=start|status|stop|logs] [--squad=<slug>] [--port=<N>] [--locale=pt-BR]',
    help_squad_mcp:
      'aioson squad:mcp [path] [--sub=status|connectors|configure|test] [--squad=<slug>] [--mcp=<slug>] [--connector=<id>]',
    help_squad_roi:
      'aioson squad:roi [path] [--sub=config|metric|report|export] [--squad=<slug>] [--key=<metrica>] [--value=<N>]',
    help_squad_score:
      'aioson squad:score [path] --squad=<slug> [--locale=pt-BR]',
    help_commit_prepare:
      'aioson commit:prepare [path] [--staged-only] [--agent-safe] [--mode=guarded|trusted|headless] [--json] [--locale=pt-BR]',
    help_learning:
      'aioson learning [path] [--sub=list|stats|promote|import-from-claude] [--status=<status>] [--id=<learning-id>] [--project-hash=<hash>] [--dry-run] [--select=<n[,n]|all>] [--locale=pt-BR]',
    help_runtime_init:
      'aioson runtime:init [path] [--json] [--locale=pt-BR]',
    help_runtime_ingest:
      'aioson runtime:ingest [path] [--squad=<slug>] [--agent=<nome>] [--session=<chave>] [--task=<chave>] [--json] [--locale=pt-BR]',
    help_runtime_task_start:
      'aioson runtime:task:start [path] --title=<texto> [--squad=<slug>] [--session=<chave>] [--goal=<texto>] [--by=<agente>] [--task=<chave>] [--json] [--locale=pt-BR]',
    help_runtime_start:
      'aioson runtime:start [path] --agent=<nome> [--squad=<slug>] [--session=<chave>] [--title=<texto>] [--run=<chave>] [--json] [--locale=pt-BR]',
    help_runtime_update:
      'aioson runtime:update [path] --run=<chave> [--message=<texto>] [--summary=<texto>] [--output=<path>] [--json] [--locale=pt-BR]',
    help_runtime_task_finish:
      'aioson runtime:task:finish [path] --task=<chave> [--goal=<texto>] [--json] [--locale=pt-BR]',
    help_runtime_finish:
      'aioson runtime:finish [path] --run=<chave> [--summary=<texto>] [--output=<path>] [--json] [--locale=pt-BR]',
    help_runtime_task_fail:
      'aioson runtime:task:fail [path] --task=<chave> [--goal=<texto>] [--json] [--locale=pt-BR]',
    help_runtime_fail:
      'aioson runtime:fail [path] --run=<chave> [--message=<texto>] [--summary=<texto>] [--output=<path>] [--json] [--locale=pt-BR]',
    help_runtime_status:
      'aioson runtime:status [path] [--json] [--locale=pt-BR]',
    help_agent_recover:
      'aioson agent:recover [path] [--dry-run] [--older-than=<24h|7d>] [--json] [--locale=pt-BR]',
    help_runtime_log:
      'aioson runtime:log [path] --agent=<nome> --message=<texto> [--type=<evento>] [--finish] [--status=completed|failed] [--summary=<texto>] [--title=<titulo-task>] [--json] [--locale=pt-BR]',
    help_runtime_session_start:
      'aioson runtime:session:start [path] --agent=<nome> [--title=<texto>] [--message=<texto>] [--session=<chave>] [--json] [--locale=pt-BR]',
    help_runtime_session_log:
      'aioson runtime:session:log [path] --agent=<nome> --message=<texto> [--type=<evento>] [--title=<texto>] [--json] [--locale=pt-BR]',
    help_runtime_session_finish:
      'aioson runtime:session:finish [path] --agent=<nome> [--message=<texto>] [--summary=<texto>] [--status=completed|failed] [--json] [--locale=pt-BR]',
    help_runtime_session_status:
      'aioson runtime:session:status [path] --agent=<nome> [--limit=8] [--watch=2] [--json] [--locale=pt-BR]',
    help_runtime_emit:
      'aioson runtime:emit [path] --agent=<nome> [--type=<evento>] [--summary=<texto>] [--title=<texto>] [--refs=<arquivo[,arquivo2]>] [--plan-step=<id>] [--meta=<json>] [--json] [--locale=pt-BR]',
    help_live_start:
      'aioson live:start [path] --tool=codex|claude|opencode --agent=<nome> [--tool-bin=<binario>] [--permission-mode=default|yolo] [--tool-args=<args>] [--title=<texto>] [--goal=<texto>] [--plan=<arquivo>] [--session=<chave>] [--message=<texto>] [--attach] [--no-launch] [--tmux] [--json] [--locale=pt-BR]',
    help_live_status:
      'aioson live:status [path] [--agent=<nome>] [--limit=8] [--watch=2] [--format=compact|tmux-bar] [--json] [--locale=pt-BR]',
    help_live_handoff:
      'aioson live:handoff [path] --agent=<nome> --to=<nome> [--reason=<texto>] [--summary=<texto>] [--message=<texto>] [--json] [--locale=pt-BR]',
    help_live_close:
      'aioson live:close [path] [--agent=<nome>] [--summary=<texto>] [--message=<texto>] [--status=completed|failed] [--json] [--locale=pt-BR]',
    help_live_list:
      'aioson live:list [path] [--json] [--locale=pt-BR]',
    help_runtime_backup:
      'aioson runtime:backup [caminho] [--tables=tasks,runs,...] [--force] [--dry-run] [--json] [--locale=pt-BR]',
    help_runtime_restore:
      'aioson runtime:restore [caminho] [--tables=tasks,runs,...] [--dry-run] [--json] [--locale=pt-BR]',
    help_skill_install:
      'aioson skill:install [caminho] --slug=<nome> [--from=npm|cloud|./caminho] [--force] [--json] [--locale=pt-BR]',
    help_skill_list:
      'aioson skill:list [caminho] [--json] [--locale=pt-BR]',
    help_skill_remove:
      'aioson skill:remove [caminho] --slug=<nome> [--json] [--locale=pt-BR]',
    help_skill_audit:
      'aioson skill:audit [caminho] [--json] [--locale=pt-BR]',
    help_design_hybrid_options:
      'aioson design-hybrid:options [caminho] [--advanced] [--json] [--locale=pt-BR]',
    help_cloud_import_squad:
      'aioson cloud:import:squad [path] --url=<snapshot-url> [--force] [--snapshots-only] [--dry-run] [--json] [--locale=pt-BR]',
    help_cloud_import_genome:
      'aioson cloud:import:genome [path] --url=<snapshot-url> [--force] [--snapshots-only] [--dry-run] [--json] [--locale=pt-BR]',
    help_cloud_publish_squad:
      'aioson cloud:publish:squad [path] --slug=<slug> --resource-version=<versao> [--url=<publish-url>|--base-url=<site>] [--title=<texto>] [--summary=<texto>] [--compatibility-min=<versao>] [--compatibility-max=<versao>] [--linked-genome-version=<versao>] [--dry-run] [--json] [--locale=pt-BR]',
    help_cloud_publish_genome:
      'aioson cloud:publish:genome [path] --slug=<slug> --resource-version=<versao> [--url=<publish-url>|--base-url=<site>] [--title=<texto>] [--summary=<texto>] [--source-kind=LOCAL|AIOSLITE|IMPORTED|REMOTE_PROVIDER] [--dry-run] [--json] [--locale=pt-BR]',
    dashboard_moved:
      'O fluxo `{command}` foi removido do CLI. O dashboard do AIOSON agora e instalado separadamente. Abra o app do dashboard no seu computador, crie ou adicione um projeto e selecione a pasta que ja contem `.aioson/`.',
    dashboard_moved_line: '{message}\n',
    unknown_command: 'Comando desconhecido: {command}',
    unknown_command_line: '{message}\n',
    error_prefix: 'Erro: {message}'
  },
  cloud: {
    project_missing: 'Diretorio do projeto nao encontrado: {path}',
    url_required: 'Informe --url com o endpoint JSON do snapshot do squad.',
    import_squad_dry_run: 'Dry run: squad {slug}@{version} pronto para import cloud.',
    import_squad_done: 'Snapshot do squad {slug}@{version} importado.',
    import_genome_dry_run: 'Dry run: genome {slug}@{version} pronto para import cloud.',
    import_genome_done: 'Snapshot do genome {slug}@{version} importado.',
    publish_squad_dry_run: 'Dry run: squad {slug}@{version} pronto para publish cloud.',
    publish_squad_done: 'Squad {slug}@{version} publicado no cloud.',
    publish_genome_dry_run: 'Dry run: genome {slug}@{version} pronto para publish cloud.',
    publish_genome_done: 'Genome {slug}@{version} publicado no cloud.'
  },
  init: {
    usage_error:
      'Uso: aioson init <project-name> [--force] [--dry-run] [--all] [--lang=<bcp47-tag>] [--tool=codex|claude|opencode] [--locale=pt-BR]',
    non_empty_dir: 'Diretorio nao esta vazio: {targetDir}. Use --force para continuar.',
    created_at: 'Projeto criado em: {targetDir}',
    files_copied: 'Arquivos copiados: {count}',
    files_skipped: 'Arquivos ignorados: {count}',
    next_steps: 'Proximos passos:',
    step_cd: '1. cd {projectName}',
    step_setup: '2. Abra na sua AI CLI e execute @setup',
    step_agents: '3. Se nao aparecer seletor visual, execute: aioson agents',
    step_agent_prompt:
      '4. Gere o prompt de setup para sua ferramenta: aioson agent:prompt setup --tool={tool}'
  },
  init_all: {
    installing_full: 'Instalacao completa (todas as ferramentas + squads) — wizard ignorado via --all'
  },
  install: {
    framework_detected: 'Framework detectado: {framework} ({evidence})',
    framework_not_detected: 'Nenhum framework detectado. Instalando em modo generico.',
    done_at: 'Instalacao concluida em: {targetDir}',
    files_copied: 'Arquivos copiados: {count}',
    files_skipped: 'Arquivos ignorados: {count}',
    dry_run_header: '⚠  DRY RUN — nenhum arquivo foi escrito. Mostrando o que o install faria:',
    dry_run_done_at: 'DRY RUN: nada foi escrito em {targetDir}',
    dry_run_files_copied: 'Arquivos que seriam copiados (would be copied): {count}',
    dry_run_files_skipped: 'Arquivos que seriam ignorados (would be skipped): {count}',
    next_steps: 'Proximos passos:',
    step_setup_context: '1. Gere/atualize o contexto do projeto: aioson setup:context --defaults',
    step_agents: '2. Se nao aparecer seletor visual, execute: aioson agents',
    step_agent_prompt:
      '3. Gere o prompt de setup para sua ferramenta: aioson agent:prompt setup --tool={tool}',
    existing_project_detected:
      '⚠ Projeto existente detectado ({count} arquivos). Rode o scanner antes de comecar:',
    existing_project_scan_hint:
      '  aioson scan:project . --folder=src --with-llm --provider=<provider>   (gera discovery.md + skeleton-system.md; sem --with-llm gera apenas os mapas locais)',
    using_saved_profile: 'Usando perfil de instalacao salvo em .aioson/install.json.',
    fallback_no_saved_profile: '⚠  Sem perfil salvo e sem wizard interativo disponivel — fallback para install-all (todos os arquivos do template serao copiados).',
    reconfigure_needs_tty: '--reconfigure requer um terminal interativo (bloqueado por: {reason}). Rode novamente em um TTY real, sem --no-interactive/--dry-run.',
    opening_wizard: '› Abrindo wizard de instalacao (↑/↓ navega, espaco marca, enter confirma, q/Ctrl+C cancela)...',
    wizard_cancelled_using_saved: '⚠  Wizard cancelado — usando perfil de instalacao salvo.',
    wizard_cancelled_install_all: '⚠  Wizard cancelado e sem perfil salvo — fallback para install-all.'
  },
  install_wizard: {
    ready_to_install: 'Pronto para instalar:',
    press_enter_to_install: 'Pressione enter para instalar ou q para cancelar.',
    deselected_warning: '⚠  Itens desmarcados NAO serao removidos automaticamente.',
    deselected_hint: '     Remova manualmente se necessario.'
  },
  update: {
    not_installed: 'Nenhuma instalacao do AIOSON encontrada em {targetDir}.',
    done_at: 'Atualizacao concluida em: {targetDir}',
    files_updated: 'Arquivos atualizados: {count}',
    backups_created: 'Backups criados: {count}',
    profile_renamed: 'i Perfil `beginner` renomeado para `creator` em project.context.md para descrever melhor o usuario. Comportamento inalterado. Edite o arquivo para mudar para `developer` se preferir.',
    reconfigure_hint: 'Novas opcoes podem estar disponiveis. Execute: aioson install --reconfigure'
  },
  info: {
    cli_version: 'AIOSON CLI: v{version}',
    directory: 'Diretorio: {targetDir}',
    installed_here: 'Instalado neste diretorio: {value}',
    framework_detected: 'Framework detectado: {framework}',
    evidence: 'Evidencia: {evidence}',
    yes: 'sim',
    no: 'nao',
    none: 'nenhum'
  },
  doctor: {
    ok: 'OK',
    fail: 'FALHA',
    diagnosis_ok: 'Diagnostico: instalacao saudavel.',
    diagnosis_fail: 'Diagnostico: {count} problema(s) encontrado(s).',
    hint_prefix: '-> {hint}',
    check_line: '[{icon}] {message}',
    hint_line: '  Dica: {hint}',
    fix_action_line: '- Acao: {action}',
    detail_line: '  Detalhe: {text}',
    required_file: 'Arquivo obrigatorio: {rel}',
    context_generated: 'Contexto principal gerado',
    context_hint: 'Execute @setup para gerar .aioson/context/project.context.md',
    context_frontmatter_valid: 'Frontmatter do contexto do projeto esta valido',
    context_frontmatter_valid_hint:
      'Garanta que project.context.md comeca com frontmatter YAML delimitado por ---',
    context_frontmatter_invalid: 'Frontmatter do contexto do projeto esta invalido ({reason})',
    context_frontmatter_invalid_hint:
      'Reescreva project.context.md usando o formato de saida do @setup.',
    context_required_field: 'Campo obrigatorio ausente no contexto: {field}',
    context_required_field_hint:
      'Execute novamente @setup e confirme que todos os campos obrigatorios estao presentes.',
    context_framework_installed_type: '`framework_installed` deve ser booleano (true/false)',
    context_framework_installed_type_hint:
      'Defina framework_installed como true ou false sem aspas.',
    context_classification_value: '`classification` deve ser um de {expected}',
    context_classification_value_hint: 'Use MICRO, SMALL ou MEDIUM exatamente.',
    context_project_type_value: '`project_type` deve ser um de {expected}',
    context_project_type_value_hint: 'Use web_app, api, site, script, dapp ou desktop_app exatamente.',
    context_profile_value: '`profile` deve ser um de {expected}',
    context_profile_value_hint: 'Use developer, creator ou team exatamente.',
    context_interaction_language_format:
      '`interaction_language` nao e uma tag BCP-47 valida',
    context_interaction_language_format_hint: 'Use valores como en, en-US, pt-BR.',
    context_conversation_language_format:
      '`conversation_language` nao e uma tag BCP-47 valida',
    context_conversation_language_format_hint: 'Use valores como en, en-US, pt-BR.',
    node_version: 'Node.js >= 18 (atual: {version})',
    gateway_claude_pointer: 'Gateway do CLAUDE referencia arquivos compartilhados do AIOSON',
    gateway_claude_pointer_hint:
      'Garanta que CLAUDE.md referencie .aioson/config.md e .aioson/agents/setup.md.',
    gateway_codex_pointer: 'Gateway do Codex referencia arquivos compartilhados do AIOSON',
    gateway_codex_pointer_hint:
      'Garanta que AGENTS.md referencie .aioson/config.md e .aioson/agents/.',
    gateway_opencode_pointer: 'Gateway do OpenCode referencia arquivos compartilhados do AIOSON',
    gateway_opencode_pointer_hint:
      'Garanta que OPENCODE.md referencie .aioson/config.md e .aioson/agents/.',
    fix_start: 'Modo de correcao segura habilitado.',
    fix_start_dry_run: 'Modo de correcao segura habilitado (dry-run).',
    fix_action_required_files: 'Restaurar arquivos gerenciados ausentes a partir do template',
    fix_action_gateway_contracts:
      'Restaurar arquivos de contrato de gateway quebrados a partir do template',
    fix_action_locale_sync: 'Sincronizar prompts ativos dos agentes com o idioma do contexto',
    fix_action_claude_commands: 'Restaurar slashes ausentes em .claude/commands/aioson/agent/* a partir do template',
    fix_action_features_dir: 'Criar o diretorio .aioson/context/features/',
    fix_action_permissions_in_sync: 'Regenerar arquivos nativos de permissao a partir de autonomy-protocol.json',
    fix_action_bootstrap_coverage: 'Rode /discover para popular os arquivos de bootstrap (semantico — nao aplicado automaticamente)',
    fix_action_version_drift: 'Atualize o CLI (npm i -g @jaimevalasek/aioson) ou ajuste project.context.md aioson_version (manual)',
    fix_not_applicable: 'Nao aplicavel para o estado atual.',
    fix_target_count: 'Alvos identificados: {count}',
    fix_applied_count: 'Mudancas aplicadas: {count}',
    fix_planned_count: 'Mudancas planejadas: {count}',
    fix_locale: 'Locale resolvido: {locale}',
    fix_summary: 'Mudancas de correcao segura aplicadas: {count}',
    fix_summary_dry_run: '[dry-run] Mudancas de correcao segura planejadas: {count}',
    bootstrap_coverage: 'Cobertura do bootstrap: {present}/{required}',
    bootstrap_coverage_hint: 'Rode /discover para atualizar os arquivos de bootstrap.',
    bootstrap_coverage_hint_seed: 'Rode /discover para criar .aioson/context/bootstrap/{what-is,how-it-works,what-it-does,current-state}.md',
    features_dir_present: 'Diretorio de features presente (.aioson/context/features/)',
    features_dir_present_hint: 'Crie .aioson/context/features/ para hospedar dossies por feature (doctor --fix cria automaticamente).',
    auto_handoff_declared: 'Flag de autopilot handoff declarada (auto_handoff no project.context.md)',
    auto_handoff_declared_hint: 'O protocolo autopilot-handoff esta instalado mas auto_handoff nao esta definido no frontmatter do project.context.md — o autopilot fica inativo. Defina auto_handoff: true para ativar, ou auto_handoff: false para silenciar este aviso.',
    claude_commands_present: 'Slash commands do Claude presentes ({missing} ausentes de {required})',
    claude_commands_present_hint: 'Ausentes: {paths}. Rode `aioson doctor . --fix` para restaurar a partir do template.',
    version_drift: 'Versao do CLI bate com project.context.md (contexto: {context}, CLI: {cli})',
    version_drift_hint: 'project.context.md aioson_version ({context}) difere do CLI ({cli}). Atualize manualmente.',
    permissions_in_sync: 'Permissoes nativas sincronizadas com autonomy-protocol.json ({drifted} drift, {missing} ausentes)',
    permissions_in_sync_hint: 'Rode `aioson doctor . --fix` para regenerar: {paths}.',
    permissions_protocol_missing_hint: 'autonomy-protocol.json esta ausente — rode `aioson update .` para reinstalar.',
    learning_loop: {
      distillation_complete: 'distillation: {promoted} promovidos, {review} para revisão, {merge} candidatos a merge ({duration}ms)',
      distillation_failed_silent: 'distillation falhou silenciosamente para feature "{slug}" — fase: {phase}',
      skipped_micro: 'distillation ignorada: classificação da feature é MICRO',
      skipped_no_distill: 'distillation ignorada: flag --no-distill ativa',
      lock_held: 'distillation ignorada: outra instância em progresso para "{slug}"',
      notify_template: 'distillation: {promoted} promovidos, {review} para revisão, {merge} candidatos a merge'
    },
    living_memory: {
      rule_staleness: 'Rules estagnadas: {stale} de {total} sem load nas últimas {threshold} features fechadas',
      rule_staleness_hint: 'Rules estagnadas (primeiras 5): {slugs}. Proposta: {propose}',
      rule_staleness_skipped_micro: 'Check de rule_staleness ignorado: classificação do projeto é MICRO (BR-ALL-11)',
      learning_orphans: 'Learnings órfãos: {orphans} learnings promovidos para rules que nunca foram carregadas',
      learning_orphans_hint: 'learning_ids órfãos (primeiros 5): {ids}. Use `aioson memory:why --id=<id>` para inspecionar.',
      learning_orphans_skipped_micro: 'Check de learning_orphans ignorado: classificação do projeto é MICRO (BR-ALL-11)',
      distillation_lag: 'Lag de distillation: {closed} features fechadas mas apenas {distillations} têm evento auto_distillation (limite {threshold})',
      distillation_lag_hint: 'Features sem distillation (primeiras 5): {missing_slugs}. Verifique o hook da Phase 5.',
      distillation_lag_skipped_micro: 'Check de distillation_lag ignorado: classificação do projeto é MICRO (BR-ALL-11)'
    },
    jargon_leak_detection: {
      ok: 'Sem vazamento de jargão nos eventos dos agentes user-facing ({events} eventos analisados, profile={profile})',
      fail: 'Vazamento de jargão: {count} ocorrências em {events} eventos dos agentes do MVP (profile={profile})',
      hint: 'Eventos afetados (primeiros 5): {samples}. Traduza o termo via jargon-map.{en,pt-BR}.yaml ou atualize o dicionário se o termo for intencional.',
      skipped_dev: 'Check de jargon_leak_detection ignorado: profile do projeto é `{profile}` (jargão permitido nesse modo)'
    }
  },
  i18n_add: {
    usage_error: 'Uso: aioson i18n:add <locale> [--force] [--dry-run] [--locale=pt-BR]',
    invalid_locale: 'Codigo de locale invalido: {locale}. Formatos esperados como en, fr, pt-br.',
    base_locale: 'O locale "en" e o dicionario base e nao pode ser gerado.',
    locale_exists: 'Arquivo de locale ja existe: {path}. Use --force para sobrescrever.',
    dry_run_created: '[dry-run] O scaffold de locale seria criado: {locale}',
    dry_run_overwritten: '[dry-run] O scaffold de locale seria sobrescrito: {locale}',
    created: 'Scaffold de locale criado: {locale}',
    overwritten: 'Scaffold de locale sobrescrito: {locale}',
    file_path: 'Arquivo de locale: {path}',
    next_steps: 'Proximos passos:',
    step_translate: '1. Substitua as strings em ingles pelos textos traduzidos nesse arquivo.',
    step_try: '2. Execute a CLI com --locale={locale} para validar o novo dicionario.'
  },
  agents: {
    list_title: 'Agentes disponiveis (locale resolvido: {locale}):',
    path: 'Caminho',
    active_path: 'Caminho ativo',
    depends: 'Depende de',
    output: 'Saida',
    agent_line: '- Agente: {label} - {command} ({id})',
    path_line: '  Caminho: {path}',
    active_path_line: '  Caminho ativo: {path}',
    depends_line: '  Depende de: {value}',
    output_line: '  Saida: {value}',
    none: 'nenhum',
    prompt_usage_error:
      'Uso: aioson agent:prompt <agent> [path] [--tool=codex|claude|opencode] [--lang=en|pt-BR|es|fr] [--locale=pt-BR]',
    prompt_unknown_agent: 'Agente desconhecido: {agent}',
    prompt_invalid_target_mode:
      'Modo de target do pentester invalido: {mode}. Use framework_target ou app_target.',
    prompt_missing_feature_for_app_target:
      'Pentester app_target exige --feature=<slug> (ou --slug=<slug>).',
    prompt_missing_scope_for_app_target:
      'Pentester app_target exige --scope=<area>.',
    prompt_title: 'Prompt para o agente "{agent}" na ferramenta "{tool}" (locale: {locale}):',
    help_available: 'Agentes disponíveis:',
    help_run_detail: 'Execute "aioson agent:help <nome>" para detalhes de um agente específico.',
    help_usage: 'Uso:',
    help_claude_code: '(Claude Code)',
    help_common_options: 'Opções comuns:',
    help_opt_tool: 'Ferramenta alvo (codex|claude|opencode)',
    help_opt_language: 'Idioma de interação (ex: pt-BR, en)',
    help_opt_headless: 'Saída apenas do prompt, sem rastreamento de runtime',
    help_opt_output: 'Salvar prompt headless em arquivo',
    help_opt_json: 'Modo de saída JSON',
    help_agent_options: 'Opções específicas do agente ({command}):',
    help_requires: 'Requer:',
    help_produces: 'Produz:',
    help_instruction_file: 'Arquivo de instrução:',
    help_unknown_agent: 'Agente desconhecido: {agent}'
  },
  context_validate: {
    missing_file: 'Arquivo de contexto nao encontrado: {path}',
    hint_setup: 'Execute @setup para gerar o arquivo primeiro.',
    invalid_frontmatter: 'O arquivo de contexto tem frontmatter YAML invalido.',
    file_path: 'Arquivo de contexto: {path}',
    parse_reason_unknown: 'desconhecido',
    parse_reason_missing_frontmatter: 'delimitador inicial do frontmatter ausente',
    parse_reason_unclosed_frontmatter: 'bloco de frontmatter nao fechado',
    parse_reason_invalid_frontmatter_line: 'sintaxe invalida em linha do frontmatter',
    parse_reason: 'Motivo do parse: {reason}',
    hint_fix_frontmatter: 'Use @setup para regenerar um arquivo de contexto valido.',
    invalid_fields: 'O arquivo de contexto foi lido, mas tem problemas de validacao:',
    issue_line: '- {issue}',
    valid: 'O arquivo de contexto esta valido.'
  },
  context_pack: {
    generated: 'Context pack escrito em: {path}',
    no_matches: 'Nenhum arquivo de contexto relevante foi selecionado ainda. Gere setup/contexto/scan antes de empacotar.',
    selected_title: 'Arquivos incluidos no pack:',
    selected_line: '  {index}. {path} — {reason}',
    hint_use: 'Use {path} como contexto minimo inicial na sua sessao de IA.'
  },
  setup: {
    installing: 'Instalando template AIOSON...',
    installed: 'Template instalado ({count} arquivos).',
    no_framework_detected: 'Nenhum framework detectado neste diretorio (projeto novo).',
    framework_detected: 'Framework detectado: {framework} (instalado={installed})',
    writing_context: 'Escrevendo contexto do projeto...',
    done: 'Setup concluido.',
    step_agents: '  Proximo: abra seu cliente de IA e ative @setup para confirmar ou ajustar o contexto.',
    step_agent_prompt: '  Ou execute: aioson agent:prompt setup . --tool={tool}',
    q_project_name: 'Nome do projeto',
    q_framework: 'Framework / stack principal (ex: Python, Node, Laravel, Django)',
    q_lang: 'Idioma para respostas dos agentes (ex: en, pt-BR, es, fr)',
    q_confirm_framework: 'Usar framework detectado? (true/false)',
    q_override_framework: 'Framework',
    q_framework_installed: 'Framework instalado? (true/false)'
  },
  setup_context: {
    detected: 'Framework detectado: {framework} (installed={installed})',
    q_project_name: 'Nome do projeto',
    q_project_type: 'Tipo do projeto (web_app|api|site|script|dapp|desktop_app)',
    q_profile: 'Perfil: [1] developer [2] creator [3] team',
    q_use_detected_framework: 'Usar framework detectado? (true/false)',
    q_framework: 'Framework',
    q_framework_installed: 'Framework instalado? (true/false)',
    q_language: 'Idioma da conversa (por exemplo en ou pt-BR)',
    q_backend_menu:
      'Backend: [1] Laravel [2] Rails [3] Django [4] Node/Express [5] Next.js [6] Nuxt [7] Hardhat [8] Foundry [9] Truffle [10] Anchor [11] Solana Web3 [12] Cardano [13] Other',
    q_backend_text: 'Backend (texto livre)',
    q_laravel_version: 'Versao do Laravel (por exemplo 11, 10)',
    q_frontend_menu:
      'Frontend: [1] TALL Stack [2] VILT Stack [3] Blade [4] Next.js [5] Nuxt [6] React [7] Vue [8] Other',
    q_frontend_text: 'Frontend (texto livre)',
    q_auth_menu:
      'Auth (Laravel): [1] Breeze [2] Jetstream + Livewire [3] Filament Shield [4] Custom',
    q_web3_enabled: 'Web3 habilitado? (true/false)',
    q_web3_networks: 'Redes Web3 (por exemplo ethereum, solana, cardano)',
    q_contract_framework: 'Framework de contratos (por exemplo Hardhat, Foundry, Anchor, Aiken)',
    q_wallet_provider: 'Wallet provider (por exemplo wagmi, RainbowKit, Phantom, Lace)',
    q_indexer: 'Indexer (por exemplo The Graph, Helius, Blockfrost)',
    q_rpc_provider: 'RPC provider (por exemplo Alchemy, Infura, QuickNode)',
    q_jetstream_teams: 'Jetstream com teams habilitado? (true/false)',
    q_jetstream_existing_action:
      'Projeto Laravel existente sem Jetstream detectado. Acao: [1] continuar sem Jetstream [2] recriar com Jetstream (recomendado) [3] instalacao manual (risco)',
    q_auth_text: 'Estrategia de autenticacao (texto livre)',
    q_uiux_menu: 'UI/UX: [1] Tailwind [2] Flux UI [3] shadcn/ui [4] Filament',
    q_uiux_text: 'Abordagem de UI/UX (texto livre)',
    q_database_menu:
      'Banco de dados: [1] MySQL [2] PostgreSQL [3] SQLite [4] MongoDB [5] Supabase [6] PlanetScale',
    q_database_text: 'Banco de dados (texto livre)',
    q_services_list:
      'Servicos adicionais (lista separada por virgula): queues, storage, websockets, payments, email, cache, search',
    q_rails_options:
      'Opcoes usadas no Rails (lista por virgula, ex: --database=postgresql,--css=tailwind,--api)',
    q_next_options:
      'Opcoes do create-next-app (lista por virgula, ex: TypeScript,ESLint,Tailwind CSS,App Router,src/ directory)',
    q_beginner_summary: 'Descreva seu projeto em uma frase',
    q_beginner_users:
      'Usuarios esperados: [1] pessoal/pequeno ate 10 [2] time pequeno ate 100 [3] clientes externos',
    q_beginner_mobile: 'Requisito mobile: [1] app mobile [2] web responsiva [3] apenas desktop',
    q_beginner_hosting: 'Preferencia de hospedagem: [1] gerenciado simples [2] VPS [3] cloud provider',
    q_beginner_accept_recommendation: 'Aceitar recomendacao inicial? (true/false)',
    beginner_recommendation:
      'Recomendacao inicial -> framework: {framework}, frontend: {frontend}, database: {database}, auth: {auth}',
    q_user_types: 'Quantos tipos de usuario?',
    q_integrations: 'Quantas integracoes externas?',
    q_rules_complexity: 'Complexidade de regras (none|some|complex)',
    note_status_enabled: 'habilitado',
    note_status_disabled: 'desabilitado',
    note_jetstream_teams: 'Jetstream teams: {status}',
    note_selected_services: 'Servicos selecionados: {services}',
    note_rails_setup_flags: 'Flags de setup do Rails: {flags}',
    note_next_setup_flags: 'Flags de setup do Next.js: {flags}',
    note_next_create_flags: 'Flags do create-next-app: {flags}',
    note_jetstream_existing_action: 'Acao para projeto existente com Jetstream: {action}',
    note_mobile_first:
      'Requisito mobile-first detectado; considere React Native/Expo como proximo passo.',
    note_vps_preference:
      'Preferencia por VPS detectada; mantenha scripts de deploy simples e reproduziveis.',
    note_cloud_profile:
      'Perfil cloud detectado; use banco gerenciado e object storage desde o inicio.',
    note_web3_terms: 'Termos Web3 detectados; recomendacao inicial de dApp aplicada.',
    note_starter_profile:
      'Esta recomendacao e um perfil inicial; ajuste quando os requisitos ficarem mais claros.',
    note_team_profile:
      'Perfil de time selecionado; preserve convencoes explicitas de equipe e regras de CI.',
    note_beginner_declined:
      'Recomendacao inicial recusada; usando stack customizada do onboarding.',
    note_monorepo:
      'Monorepo detectado: framework Web3 e framework de aplicacao coexistem. Confirmar framework primario com o usuario e documentar estrutura em Notes.',
    written: 'Arquivo de contexto escrito: {path}',
    classification_result: 'Classificacao: {classification} (score={score}/6)',
    locale_applied: 'Idioma de interacao sincronizado: {locale} ({count} prompts de agente restaurados)'
  },
  locale_apply: {
    applied: 'Idioma de interacao sincronizado: {locale}',
    dry_run_applied: '[dry-run] Idioma de interacao seria sincronizado: {locale}',
    copied_count: 'Arquivos copiados: {count}',
    missing_count: 'Arquivos de locale ausentes: {count}',
    copy_line: '  Arquivo: {source} -> {target}'
  },
  smoke: {
    start: 'Executando smoke test em: {projectDir}',
    using_web3_profile: 'Usando perfil Web3 de smoke: {target}',
    using_mixed_profile: 'Usando perfil misto Web2+Web3 para smoke test.',
    using_parallel_profile: 'Usando perfil de smoke para orquestracao paralela.',
    seeded_web3_workspace: 'Workspace inicializado para alvo Web3: {target}',
    seeded_mixed_workspace: 'Workspace inicializado para perfil misto Web2+Web3.',
    seeded_parallel_context: 'Contexto discovery/architecture/prd inicializado para perfil paralelo.',
    step_ok: 'OK: {step}',
    web3_detected: 'Framework Web3 detectado: {framework} ({network})',
    web3_context_verified: 'Contexto Web3 verificado para rede: {network}',
    mixed_context_verified: 'Contexto do perfil misto verificado (framework: {framework}).',
    parallel_status_verified: 'Status paralelo verificado para lanes: {count}',
    invalid_web3_target: 'Alvo --web3 invalido: {target}. Use ethereum, solana ou cardano.',
    invalid_profile: 'Valor invalido para --profile: {profile}. Use standard, mixed ou parallel.',
    profile_conflict: 'Nao combine --profile=mixed com --web3. Escolha um modo de perfil.',
    assert_install_files: 'install copiou zero arquivos',
    assert_web3_framework: 'deteccao de framework web3 inesperada: {framework}',
    assert_setup_written: 'setup:context nao gravou o arquivo de contexto',
    assert_setup_project_type_dapp: 'setup nao inferiu project_type=dapp',
    assert_setup_web3_network: 'setup nao inferiu a rede web3 esperada',
    assert_setup_web3_framework: 'setup nao manteve o framework web3 esperado',
    assert_mixed_project_type_dapp: 'perfil mixed nao inferiu project_type=dapp',
    assert_mixed_web3_enabled: 'perfil mixed nao inferiu web3_enabled=true',
    assert_mixed_framework: 'perfil mixed nao priorizou o framework web3 esperado',
    assert_locale_apply_files: 'locale:apply copiou zero arquivos',
    assert_agents_count: 'comando agents retornou contagem inesperada',
    assert_prompt_path: 'agent:prompt nao incluiu o caminho esperado',
    assert_context_validate: 'context:validate falhou',
    assert_web3_context_valid: 'falha ao validar parse do contexto web3',
    assert_web3_context_project_type: 'project_type do contexto nao e dapp',
    assert_web3_context_enabled: 'web3_enabled do contexto nao e true',
    assert_web3_context_network: 'web3_networks do contexto nao inclui o alvo esperado',
    assert_doctor_ok: 'checagem doctor falhou',
    assert_parallel_init_ok: 'parallel:init falhou',
    assert_parallel_init_workers: 'workers de parallel:init nao conferem',
    assert_parallel_assign_ok: 'parallel:assign falhou',
    assert_parallel_assign_scope: 'parallel:assign nao gerou escopos',
    assert_parallel_status_ok: 'parallel:status falhou',
    assert_parallel_status_lanes: 'quantidade de lanes em parallel:status nao confere',
    assert_parallel_doctor_ok: 'parallel:doctor falhou',
    assert_parallel_doctor_summary: 'parallel:doctor reportou falhas',
    completed: 'Smoke test concluido com sucesso.',
    steps_count: 'Etapas validadas: {count}',
    workspace_kept: 'Workspace mantido: {path}',
    workspace_removed: 'Workspace removido: {path}'
  },
  package_test: {
    start: 'Executando teste de pacote a partir da origem: {sourceDir}',
    pack_done: 'Tarball do pacote criado: {tarball}',
    completed: 'Teste de pacote concluido com {count} etapas validadas.',
    workspace: 'Workspace do teste de pacote: {path}',
    error_unknown_detail: 'erro desconhecido',
    error_npm_pack: 'Falha no npm pack: {detail}',
    error_tarball_missing: 'npm pack nao retornou o nome do tarball',
    error_npx_init: 'Falha no npx init: {detail}',
    error_npx_setup_context: 'Falha no npx setup:context: {detail}',
    error_npx_doctor: 'Falha no npx doctor: {detail}',
    error_doctor_not_ok: 'doctor retornou ok=false durante o teste de pacote',
    error_npx_mcp_init: 'Falha no npx mcp:init: {detail}',
    error_mcp_not_ok: 'mcp:init retornou ok=false durante o teste de pacote'
  },
  workflow_plan: {
    context_missing:
      'Arquivo de contexto nao encontrado. Usando workflow de fallback com base na classificacao informada/padrao.',
    title: 'Workflow recomendado para classificacao {classification}:',
    notes: 'Notas:',
    command_line: '  Comando: {command}',
    note_line: '  Nota: {note}',
    note_framework_not_installed:
      'Framework ainda nao esta instalado; conclua a instalacao da stack antes de @dev.',
    note_dapp_context:
      'Contexto dApp detectado; inclua skills Web3 durante @architect e @dev.',
    note_micro_scope:
      'Mantenha o escopo de implementacao minimo e evite agentes opcionais.',
    note_product_optional:
      '@product e opcional para MICRO — pule e va direto ao @dev se a ideia ja esta clara.',
    note_feature_flow:
      'Fluxo para nova feature (apos configuracao inicial): @product → @analyst → @scope-check → @dev → @qa. Sem @setup.'
  },
  workflow_next: {
    title: 'Handoff do workflow para {mode} ({classification}):',
    completed: 'Etapa concluida: {agent}',
    detour: 'Desvio ativo: {agent} (retorna para {returnTo})',
    current_agent: 'Agente atual: {agent}',
    next_agent: 'Proximo/retorno: {agent}',
    done: 'Workflow concluido. Nao ha proximo agente.',
    state_file: 'Arquivo de estado: {path}'
  },
  workflow_heal: {
    title: '🩹 Auto-cura ativada para {stage} (tentativa {count}/3):'
  },
  parallel_init: {
    context_missing:
      'Arquivo de contexto nao encontrado: {path}. Execute setup:context primeiro.',
    context_invalid: 'Arquivo de contexto invalido ou nao parseavel: {path}.',
    classification_unknown: 'desconhecida',
    requires_medium:
      'Inicializacao paralela so e suportada para classificacao MEDIUM (atual: {classification}). Use --force para sobrescrever.',
    invalid_workers:
      'Valor invalido para --workers. Use um inteiro entre {min} e {max}.',
    already_exists:
      'Arquivos de contexto paralelo ja existem ({count}). Use --force para sobrescrever.',
    prepared: 'Workspace paralelo inicializado em: {path}',
    dry_run_prepared: '[dry-run] Workspace paralelo seria inicializado em: {path}',
    workers_count: 'Workers: {count}',
    files_count: 'Arquivos preparados: {count}',
    missing_prereq_count: 'Arquivos de contexto prerequisitos ausentes: {count}',
    file_line: '  Arquivo: {file}'
  },
  parallel_doctor: {
    prefix_ok: 'OK',
    prefix_warn: 'AVISO',
    prefix_fail: 'FALHA',
    check_line: '[{prefix}] {id} - {message}',
    hint_line: '  Dica: {hint}',
    invalid_workers:
      'Valor invalido para --workers. Use um inteiro entre {min} e {max}.',
    classification_unknown: 'desconhecida',
    requires_medium:
      'Modo de correcao do parallel doctor requer classificacao MEDIUM (atual: {classification}). Use --force para sobrescrever.',
    report_title: 'Relatorio do parallel doctor: {path}',
    summary: 'Resumo: {passed} aprovados, {failed} falhas, {warnings} avisos.',
    fix_summary: 'Mudancas de correcao paralela aplicadas: {count}',
    fix_summary_dry_run: '[dry-run] Mudancas de correcao paralela planejadas: {count}',
    check_context_exists_ok: 'project.context.md existe.',
    check_context_exists_missing: 'project.context.md esta ausente.',
    check_context_exists_hint: 'Execute setup:context antes do parallel doctor.',
    check_context_parsed_ok: 'project.context.md esta parseavel.',
    check_context_parsed_invalid: 'project.context.md esta invalido.',
    check_context_parsed_hint:
      'Corrija o frontmatter do contexto antes de executar parallel doctor.',
    check_context_classification_ok:
      'Modo paralelo permitido para classificacao {classification}.',
    check_context_classification_invalid:
      'Modo paralelo requer classificacao MEDIUM (atual: {classification}).',
    check_context_classification_hint: 'Use --force para sobrescrever a regra de classificacao.',
    check_parallel_dir_ok: 'Diretorio .aioson/context/parallel existe.',
    check_parallel_dir_missing: 'Diretorio .aioson/context/parallel esta ausente.',
    check_parallel_dir_hint: 'Execute parallel:init ou parallel:doctor --fix.',
    check_parallel_shared_ok: 'shared-decisions.md esta presente.',
    check_parallel_shared_missing: 'shared-decisions.md esta ausente.',
    check_parallel_shared_hint:
      'Execute parallel:doctor --fix para restaurar os arquivos base.',
    check_parallel_manifest_ok: 'workspace.manifest.json esta presente.',
    check_parallel_manifest_missing: 'workspace.manifest.json esta ausente.',
    check_parallel_manifest_hint:
      'Execute parallel:doctor --fix para restaurar o manifest do workspace.',
    check_parallel_ownership_ok: 'ownership-map.json esta presente.',
    check_parallel_ownership_missing: 'ownership-map.json esta ausente.',
    check_parallel_ownership_hint:
      'Execute parallel:doctor --fix para restaurar o mapa de ownership.',
    check_parallel_merge_ok: 'merge-plan.json esta presente.',
    check_parallel_merge_missing: 'merge-plan.json esta ausente.',
    check_parallel_merge_hint:
      'Execute parallel:doctor --fix para restaurar o plano de merge.',
    check_machine_sync_ok:
      'Os artefatos paralelos machine-readable estao sincronizados com os arquivos de lane.',
    check_machine_sync_stale:
      'Os artefatos paralelos machine-readable estao stale: {files}.',
    check_machine_sync_hint:
      'Execute parallel:doctor --fix para reconstruir os artefatos stale.',
    check_ownership_conflicts_ok:
      'Nenhum conflito de ownership foi detectado entre os escopos das lanes.',
    check_ownership_conflicts_found:
      '{count} conflito(s) de ownership foi/foram detectado(s) entre os escopos das lanes.',
    check_ownership_conflicts_hint:
      'Ajuste o ownership para que cada scope key pertenca a apenas uma lane.',
    check_write_scope_present_ok:
      'Todas as lanes com escopo atribuido tambem declaram write_paths.',
    check_write_scope_present_missing:
      '{count} lane(s) com escopo atribuido ainda nao declaram write_paths.',
    check_write_scope_present_hint:
      'Declare caminhos relativos ao projeto ou prefixos recursivos (por exemplo src/auth/**) no bloco Ownership de cada lane.',
    check_write_scope_valid_ok:
      'Todos os write_paths declarados usam padroes suportados.',
    check_write_scope_valid_invalid:
      '{count} padrao(oes) invalido(s) de write_paths foi/foram detectado(s).',
    check_write_scope_valid_hint:
      'Use caminhos relativos exatos ao projeto ou padroes recursivos terminando com /**.',
    check_write_scope_conflicts_ok:
      'Nenhuma sobreposicao de write_paths foi detectada entre as lanes.',
    check_write_scope_conflicts_found:
      '{count} sobreposicao(oes) de write_paths foi/foram detectada(s) entre as lanes.',
    check_write_scope_conflicts_hint:
      'Separe o ownership para que cada padrao de caminho pertenca a apenas uma lane.',
    check_dependencies_valid_ok:
      'Todas as dependencias declaradas entre lanes apontam para lanes validas.',
    check_dependencies_valid_invalid:
      '{count} referencia(s) invalida(s) de dependencia entre lanes foi/foram detectada(s).',
    check_dependencies_valid_hint:
      'Use referencias lane-N apenas para lanes existentes ou mova a coordenacao compartilhada para shared-decisions.',
    check_dependencies_blocked_ok:
      'Nenhuma lane esta bloqueada neste momento por dependencia incompleta.',
    check_dependencies_blocked_found:
      '{count} bloqueio(s) por dependencia entre lanes foi/foram detectado(s) com base no status atual.',
    check_dependencies_blocked_hint:
      'Conclua as lanes upstream ou retorne a lane dependente para pending antes da execucao.',
    check_merge_order_ok:
      'A ordem de merge respeita as dependencias declaradas entre lanes.',
    check_merge_order_invalid:
      '{count} violacao(oes) de ordem de merge contra dependencias declaradas foi/foram detectada(s).',
    check_merge_order_hint:
      'Ajuste merge ranks ou dependencias para que as lanes upstream sejam mescladas primeiro.',
    check_lanes_present_ok: '{count} arquivo(s) de lane detectado(s).',
    check_lanes_present_missing: 'Nenhum arquivo de status de lane foi encontrado.',
    check_lanes_present_hint: 'Execute parallel:init ou parallel:doctor --fix.',
    check_lanes_sequence_ok: 'Sequencia de lanes e continua (1..{workers}).',
    check_lanes_sequence_missing: 'Arquivos de lane ausentes na sequencia: {lanes}',
    check_lanes_sequence_hint:
      'Execute parallel:doctor --fix para restaurar as lanes ausentes.',
    check_workers_option: 'Opcao de workers solicitada: {workers}.',
    check_prereq_ok: 'Todos os arquivos de contexto prerequisitos estao presentes.',
    check_prereq_missing: '{count} arquivo(s) de contexto prerequisito ausente(s).',
    check_prereq_hint:
      'Crie os arquivos discovery/architecture/prd antes da orquestracao.'
  },
  parallel_assign: {
    invalid_workers:
      'Valor invalido para --workers. Use um inteiro entre {min} e {max}.',
    context_missing: 'Arquivo de contexto nao encontrado: {path}.',
    context_invalid: 'Arquivo de contexto invalido ou nao parseavel: {path}.',
    classification_unknown: 'desconhecida',
    requires_medium:
      'A atribuicao paralela requer classificacao MEDIUM (atual: {classification}). Use --force para sobrescrever.',
    parallel_missing:
      'Diretorio paralelo nao encontrado: {path}. Execute parallel:init primeiro.',
    no_lanes: 'Nenhum arquivo de lane foi encontrado em .aioson/context/parallel.',
    missing_lanes: 'Arquivos de lane ausentes para os workers solicitados: {lanes}.',
    source_missing: 'Nao foi possivel resolver o documento de origem com --source={source}.',
    applied: 'Atribuicao de escopo paralelo aplicada ({count} item(ns) de escopo).',
    dry_run_applied:
      '[dry-run] Atribuicao de escopo paralelo planejada ({count} item(ns) de escopo).',
    source_info: 'Documento de origem: {source}',
    workers_count: 'Workers: {count}',
    files_count: 'Arquivos atualizados: {count}',
    lane_scope_line: '- lane {lane}: {count} item(ns) de escopo'
  },
  parallel_status: {
    parallel_missing:
      'Diretorio paralelo nao encontrado: {path}. Execute parallel:init primeiro.',
    no_lanes: 'Nenhum arquivo de lane foi encontrado em .aioson/context/parallel.',
    title: 'Relatorio de status paralelo: {path}',
    lanes_count: 'Lanes: {count}',
    statuses_title: 'Status:',
    status_line: '- {status}: {count}',
    status_pending: 'pendente',
    status_in_progress: 'em_andamento',
    status_completed: 'concluido',
    status_merged: 'mesclado',
    status_blocked: 'bloqueado',
    status_other: 'outro',
    scopes_count: 'Total de itens de escopo: {count}',
    deliverables_progress: 'Entregaveis: {completed}/{total} concluidos',
    blockers_count: 'Bloqueios em aberto: {count}',
    shared_decisions: 'Entradas no log de decisoes compartilhadas: {count}',
    ownership_conflicts: 'Conflitos de ownership: {count}',
    write_scope_summary:
      'Write scope: lanes_com_paths={lanes}, caminhos={paths}, lanes_com_escopo_sem_path={uncovered}, conflitos={conflicts}, invalidos={invalid}',
    dependencies_summary:
      'Dependencias: declaradas={declared}, invalidas={invalid}, bloqueadas={blocked}, violacoes_de_ordem={orderViolations}',
    sync_summary: 'Drift dos arquivos machine-readable: {count}',
    sync_stale_line: '- stale: {file}',
    lane_line: '- lane {lane}: status={status}, escopo={scope}, bloqueios={blockers}'
  },
  parallel_merge: {
    parallel_missing:
      'Diretorio paralelo nao encontrado: {path}. Execute parallel:init primeiro.',
    no_lanes: 'Nenhum arquivo de lane foi encontrado em .aioson/context/parallel.',
    ready: 'O merge deterministico esta pronto para {count} lane(s).',
    applied: 'O merge deterministico foi aplicado em {count} lane(s).',
    blocked: 'O merge deterministico esta bloqueado para {count} lane(s).',
    order: 'Ordem de merge: {order}',
    structural_summary:
      'Checagens estruturais: stale={stale}, conflitos_de_ownership={conflicts}, conflitos_de_write_scope={writeConflicts}, write_paths_invalidos={invalidWritePaths}, dependencias_invalidas={invalid}, dependencias_bloqueadas={blocked}, violacoes_de_ordem={orderViolations}',
    lane_line: '- lane {lane}: acao={action}, status={status}'
  },
  parallel_guard: {
    invalid_lane: 'Valor invalido para --lane. Use um inteiro positivo.',
    paths_required:
      'Falta o valor de --paths. Informe um ou mais caminhos relativos ao projeto separados por virgula.',
    parallel_missing:
      'Diretorio paralelo nao encontrado: {path}. Execute parallel:init primeiro.',
    no_lanes: 'Nenhum arquivo de lane foi encontrado em .aioson/context/parallel.',
    lane_missing: 'A lane {lane} nao existe no workspace paralelo atual.',
    allowed: 'O guard de escrita liberou a lane {lane} para {count} caminho(s).',
    blocked: 'O guard de escrita bloqueou a lane {lane} para {count} caminho(s).',
    write_scope_summary:
      'Resumo do write scope: caminhos={paths}, conflitos={conflicts}, invalidos={invalid}',
    path_line: '- path {path}: status={status}, owners={owners}'
  },
  mcp_init: {
    context_missing:
      'Arquivo de contexto nao encontrado. Gerando plano MCP base com suposicoes genericas.',
    invalid_tool: 'Valor invalido para --tool: {tool}. Use um de: {expected}.',
    reason_filesystem: 'Acesso local obrigatorio ao workspace.',
    reason_context7: 'Use documentacao oficial atualizada no momento da implementacao.',
    reason_database_none: 'Nenhuma stack de banco de dados foi detectada ainda.',
    reason_database_enabled:
      'O contexto indica recursos com banco de dados (endpoint MCP remoto recomendado).',
    reason_web_search: 'Util para avaliacao de pacotes e verificacao de release notes.',
    reason_chain_rpc_disabled: 'Web3 esta desabilitado para este projeto.',
    reason_chain_rpc_enabled: 'Contexto dApp detectado; acesso RPC de chain e necessario.',
    note_workspace_local: 'Este e um preset local de workspace gerado pelo AIOSON.',
    note_replace_placeholders:
      'Substitua comandos placeholder pelos servidores MCP que voce realmente usa.',
    note_keep_secrets_env:
      'Mantenha segredos em variaveis de ambiente, nunca inline tokens.',
    generated: 'Plano MCP escrito: {path}',
    dry_run_generated: '[dry-run] Plano MCP seria escrito: {path}',
    server_count: 'Servidores MCP no plano: {count}',
    preset_count: 'Presets de ferramentas gerados: {count}',
    preset_written: 'Preset escrito ({tool}): {path}',
    preset_dry_run: '[dry-run] Preset seria escrito ({tool}): {path}'
  },
  mcp_doctor: {
    prefix_ok: 'OK',
    prefix_warn: 'AVISO',
    prefix_fail: 'FALHA',
    check_line: '[{prefix}] {id} - {message}',
    hint_line: '  Dica: {hint}',
    context_missing: 'project.context.md nao foi encontrado.',
    context_missing_hint: 'Execute setup primeiro para validacao MCP orientada por contexto.',
    context_parse_invalid: 'project.context.md nao pode ser parseado ({reason}).',
    context_parse_invalid_hint:
      'Corrija a formatacao do contexto para habilitar validacao MCP por stack.',
    context_ok: 'project.context.md esta disponivel e parseavel.',
    plan_missing: 'Arquivo do plano MCP nao encontrado (.aioson/mcp/servers.local.json).',
    plan_missing_hint: 'Execute: aioson mcp:init',
    plan_invalid: 'JSON do plano MCP invalido: {error}',
    plan_invalid_hint: 'Regenere o plano com: aioson mcp:init',
    plan_ok: 'Arquivo do plano MCP presente e com JSON valido.',
    plan_servers_ok: 'Plano MCP declara {count} definicao(oes) de servidor.',
    plan_servers_missing: 'Plano MCP nao possui definicoes de servidor.',
    plan_servers_hint: 'Regenere com: aioson mcp:init',
    core_enabled: 'Servidor MCP core "{server}" esta habilitado.',
    core_missing: 'Servidor MCP core "{server}" esta ausente ou desabilitado.',
    core_missing_hint: 'Regenere e mantenha os servidores core basicos habilitados.',
    presets_any_ok: '{count} arquivo(s) de preset MCP encontrado(s).',
    presets_any_missing: 'Nenhum arquivo de preset MCP foi encontrado.',
    presets_any_hint: 'Execute: aioson mcp:init',
    presets_coverage_partial: 'Apenas {existing}/{total} presets de ferramentas estao presentes.',
    presets_coverage_partial_hint:
      'Execute: aioson mcp:init (sem --tool) para gerar todos os presets.',
    presets_coverage_full:
      'Todos os presets de ferramentas estao presentes (claude, codex, opencode).',
    env_none_required: 'Nenhuma variavel de ambiente obrigatoria nos servidores MCP habilitados.',
    env_missing: '{missing}/{total} variavel(is) de ambiente obrigatoria(s) ausente(s): {vars}',
    env_missing_hint_strict: 'Defina as variaveis ausentes antes da execucao.',
    env_missing_hint_relaxed:
      'Defina variaveis para prontidao total de runtime. Use --strict-env para falhar nesta checagem.',
    env_all_present: 'Todas as variaveis obrigatorias estao disponiveis ({count}).',
    compat_database_ok: 'Database MCP corresponde ao engine da stack de contexto ({engine}).',
    compat_database_mismatch:
      'Database MCP nao corresponde completamente a stack de contexto ({engine}).',
    compat_database_hint:
      'Regenere com: aioson mcp:init, ou ajuste manualmente o servidor de database.',
    compat_web3_ok: 'MCP chain-rpc esta habilitado para contexto Web3.',
    compat_web3_missing: 'Contexto Web3 detectado, mas chain-rpc MCP esta ausente ou desabilitado.',
    compat_web3_missing_hint: 'Regenere com: aioson mcp:init',
    compat_web3_unneeded: 'chain-rpc MCP esta habilitado, mas o contexto nao e Web3.',
    compat_web3_unneeded_hint: 'Desabilite chain-rpc se nao for necessario.',
    report_title: 'Relatorio MCP doctor: {path}',
    summary: 'Resumo: {passed} aprovados, {failed} falhas, {warnings} avisos.'
  },
  qa_doctor: {
    prefix_ok: 'OK',
    prefix_warn: 'AVISO',
    prefix_fail: 'FALHA',
    check_line: '[{prefix}] {id} - {message}',
    hint_line: '  Dica: {hint}',
    report_title: 'Relatorio QA doctor: {path}',
    summary: 'Resumo: {passed} aprovados, {failed} falhas, {warnings} avisos.',
    playwright_ok: 'Playwright esta instalado.',
    playwright_missing: 'Pacote Playwright nao encontrado.',
    playwright_missing_hint: 'Execute: npm install -g playwright && npx playwright install chromium',
    chromium_ok: 'Binario do Chromium encontrado.',
    chromium_missing: 'Binario do Chromium nao encontrado.',
    chromium_missing_hint: 'Execute: npx playwright install chromium',
    config_ok: 'aios-qa.config.json encontrado e valido.',
    config_missing: 'aios-qa.config.json nao encontrado.',
    config_missing_hint: 'Execute: aioson qa:init --url=<url-da-sua-app>',
    config_invalid: 'aios-qa.config.json nao e um JSON valido: {error}',
    url_ok: 'URL de destino acessivel ({url}).',
    url_missing: 'Nenhuma URL configurada em aios-qa.config.json.',
    url_missing_hint: 'Execute: aioson qa:init --url=<url-da-sua-app>',
    url_unreachable: 'URL de destino inacessivel ({url}): {error}',
    url_unreachable_hint: 'Inicie sua aplicacao antes de executar qa:run ou qa:scan.',
    context_ok: 'project.context.md encontrado — testes serao enriquecidos com o contexto do projeto.',
    context_missing: 'project.context.md nao encontrado — executando em modo generico.',
    prd_ok: 'prd.md encontrado — {count} criterios de aceite mapeados como cenarios de teste.',
    prd_missing: 'prd.md nao encontrado — mapeamento de cobertura AC sera ignorado.'
  },
  qa_init: {
    context_found: 'Contexto encontrado: projeto={name}, url={url}',
    prd_found: 'prd.md encontrado — {count} criterios de aceite extraidos como cenarios de teste.',
    prd_missing: 'prd.md nao encontrado — nenhum cenario AC gerado. Adicione prd.md para enriquecer os testes.',
    generated: 'Configuracao QA escrita: {path}',
    dry_run_generated: '[dry-run] Configuracao QA seria escrita: {path}',
    scenarios_count: 'Cenarios de teste do prd.md: {count}',
    personas_count: 'Personas habilitadas: {count} (naive, hacker, power, mobile)',
    probes_count: 'Sondas de seguranca habilitadas: {count}',
    next_steps: 'Proximos passos:',
    step_doctor: '1. Verificar pre-requisitos: aioson qa:doctor',
    step_run: '2. Executar testes no browser: aioson qa:run'
  },
  qa_run: {
    playwright_missing: 'Playwright nao instalado. Execute: npm install -g playwright && npx playwright install chromium',
    config_missing: 'aios-qa.config.json nao encontrado. Execute: aioson qa:init --url=<url-da-sua-app>',
    url_missing: 'Nenhuma URL configurada. Adicione url ao aios-qa.config.json ou use --url=<app-url>.',
    starting: 'Iniciando sessao de QA no browser: {url}',
    persona_start: 'Executando persona: {persona}',
    persona_done: 'Persona "{persona}" concluida — {count} finding(s)',
    accessibility: 'Executando auditoria de acessibilidade...',
    performance: 'Capturando metricas de performance...',
    ac_scenarios: 'Documentando cobertura de AC...',
    done: 'Sessao de QA concluida.',
    report_written: 'Relatorio escrito: {path}',
    json_written: 'Relatorio JSON escrito: {path}',
    screenshots_dir: 'Screenshots salvos em: {path}',
    findings_summary: 'Findings: {critical} critico(s), {high} alto(s), {medium} medio(s), {low} baixo(s)',
    html_report_written: 'Relatorio HTML escrito: {path}'
  },
  qa_scan: {
    playwright_missing: 'Playwright nao instalado. Execute: npm install -g playwright && npx playwright install chromium',
    config_missing: 'aios-qa.config.json nao encontrado. Execute: aioson qa:init --url=<url-da-sua-app>',
    url_missing: 'Nenhuma URL configurada. Adicione url ao aios-qa.config.json ou use --url=<app-url>.',
    starting: 'Iniciando scan autonomo: {url}',
    crawling: 'Rastreando rotas (profundidade max {depth}, max {pages} paginas)...',
    routes_found: 'Rotas descobertas: {count}',
    scanning_route: 'Escaneando: {route}',
    done: 'Scan autonomo concluido.',
    report_written: 'Relatorio escrito: {path}',
    findings_summary: 'Findings: {critical} critico(s), {high} alto(s), {medium} medio(s), {low} baixo(s)',
    html_report_written: 'Relatorio HTML escrito: {path}'
  },
  qa_report: {
    not_found: 'Nenhum relatorio QA encontrado. Execute: aioson qa:run ou aioson qa:scan',
    html_report_written: 'Relatorio HTML escrito: {path}'
  },
  harness: {
    init_success: 'Harness inicializado para a feature: {slug}',
    init_exists: 'Harness ja inicializado em {path}',
    contract_not_found: 'Contrato nao encontrado para o slug: {slug}',
    validating: 'Validando harness para {slug}...',
    blocked: 'Execucao pausada: {reason}',
    init_dry_run: '[dry-run] Inicializaria harness para {slug}'
  },
  web_map: {
    url_missing: 'Opcao obrigatoria ausente: --url=<url>.',
    starting: 'Mapeando site: {url}',
    pages_found: 'Paginas descobertas: {count}',
    page_line: '- {url} | profundidade={depth} | status={status} | links={links}',
    done: 'Mapa web concluido.',
    failed: 'Falha no mapa web: {error}'
  },
  web_scrape: {
    url_missing: 'Opcao obrigatoria ausente: --url=<url>.',
    invalid_format: 'Valor invalido para --format: {format}. Use markdown, text, html ou links.',
    fetching: 'Buscando pagina: {url}',
    title_line: 'Titulo: {title}',
    status_line: 'Status: {status} | Content-Type: {type}',
    done: 'Web scrape concluido ({format}).',
    failed: 'Falha no web scrape: {error}'
  },
  config: {
    usage_error:
      'Uso: aioson config <set KEY=value|show|get KEY> [--json] [--locale=pt-BR]',
    set_ok: 'Chave configurada: {key} (salva em {path})',
    show_header: 'Config global: {path}',
    show_empty: '  (nenhuma chave configurada)',
    show_line: '  {key} = {value}',
    get_line: '{key} = {value}',
    key_not_found: 'Chave nao encontrada: {key}'
  },
  runtime: {
    option_required: 'Opcao obrigatoria ausente: {option}',
    store_missing:
      'Runtime store nao encontrado: {path}. Execute: aioson runtime:init',
    init_ok: 'Runtime store inicializado: {path}',
    ingest_ok: 'Conteudos indexados no runtime: {indexed} | ignorados: {skipped} ({path})',
    task_start_ok: 'Task iniciada: {task} ({path})',
    start_ok: 'Execucao iniciada: {run} ({path})',
    update_ok: 'Execucao atualizada: {run} ({path})',
    task_finish_ok: 'Task concluida: {task} ({path})',
    finish_ok: 'Execucao concluida: {run} ({path})',
    task_fail_ok: 'Task marcada como falha: {task} ({path})',
    fail_ok: 'Execucao marcada como falha: {run} ({path})',
    log_ok: 'Evento registrado: {agent} / {run} ({path})',
    log_finish_ok: 'Execucao encerrada: {agent} / {run} ({path})',
    log_agent_required: 'Opcao obrigatoria ausente: --agent',
    status_title: 'Status do runtime: {path}',
    status_db: 'Banco: {path}',
    status_task_counts:
      'Tasks -> Fila: {queued} | Rodando: {running} | Concluidas: {completed} | Falhas: {failed}',
    status_counts:
      'Runs  -> Fila: {queued} | Rodando: {running} | Concluidas: {completed} | Falhas: {failed}',
    status_no_active_tasks: 'Nenhuma task ativa.',
    status_active_tasks_title: 'Tasks ativas:',
    status_active_task_line: '- {task} | squad: {squad} | status: {status} | trabalho: {title}',
    status_no_active: 'Nenhuma execucao ativa de agente.',
    status_active_title: 'Execucoes ativas:',
    status_active_line: '- {agent} | squad: {squad} | status: {status} | trabalho: {title}',
    status_live_sessions_title: 'Sessoes vivas ativas:',
    status_live_session_line: '- {task} | agente: {agent} | status: {status} | plano: {plan} | micro: {micro} | handoffs: {handoffs} | trabalho: {title}',
    status_micro_tasks_title: 'Micro-tarefas ativas:',
    status_micro_task_line: '- {task} | pai: {parent} | status: {status} | trabalho: {title}',
    status_handoffs_title: 'Handoffs recentes:',
    status_handoff_line: '- {created} | {from} -> {to} | sessao: {session} | {message}'
  },
  live: {
    unsupported_tool: 'Ferramenta live nao suportada: {tool}. Ferramentas suportadas: {supported}',
    plan_not_found: 'Arquivo de plano nao encontrado: {plan}',
    no_active_session: 'Nenhuma sessao live ativa encontrada para {agent}.',
    session_not_active: 'A sessao live de {agent} nao esta ativa.',
    json_requires_no_launch: '--json requer --no-launch para live:start porque o lancamento em primeiro plano e interativo.',
    tool_binary_not_found: 'Binario da ferramenta nao encontrado no PATH: {binary}',
    tool_mismatch: 'A sessao ativa usa a ferramenta "{existing}" mas --tool={requested} foi informado. Encerre a sessao primeiro ou use a mesma ferramenta.',
    tool_mismatch_auto_closed: 'A sessao live anterior usava "{existing}" e foi fechada automaticamente. Iniciando nova sessao com "{requested}".',
    micro_task_already_open: 'Uma micro-tarefa live ja esta aberta para {agent}. Emita task_completed antes de task_started novamente.',
    handoff_same_agent: 'live:handoff requer valores diferentes para --agent e --to.',
    handoff_agent_mismatch: 'Nenhuma sessao live ativa encontrada para {agent}.',
    watch_json_conflict: '--watch nao pode ser combinado com --json.',
    no_session_found: 'Nenhuma sessao live encontrada.',
    no_session_for_agent: 'Nenhuma sessao live encontrada para {agent}.',
    session_already_closed: 'A sessao live {session} ja esta encerrada.',
    session_already_active: 'Sessao live ja ativa: {agent} | sessao: {session} | run: {runKey} ({dbPath})',
    session_started: 'Sessao live iniciada: {agent} | ferramenta: {tool} | sessao: {session} ({dbPath})',
    event_recorded: 'Evento live registrado: {agent} | {eventType} | {session} ({dbPath})',
    standalone_event_recorded: 'Evento de runtime standalone registrado: {agent} | {eventType} | run: {runKey} ({dbPath})',
    handoff_recorded: 'Handoff live registrado: {from} -> {to} | {session} ({dbPath})',
    session_closed: 'Sessao live encerrada: {agent} | {session} ({dbPath})',
    process_dead_warning: 'O processo morreu enquanto a sessao live ainda esta aberta. Encerre manualmente com `aioson live:close . --status=failed`.',
    tmux_not_found: 'tmux nao encontrado. Instale tmux para usar --tmux, ou remova a flag para continuar sem split de terminal.',
    tmux_starting: 'Iniciando sessao tmux: agente {agent} | ferramenta {tool} ...',
    tmux_recreate: 'Sessao tmux anterior encerrada. Recriando sessao live para {agent} ({session})...',
    tmux_reattach: 'Sessao tmux ainda ativa. Reanexando a {agent} ({session})...',
    list_title: 'Sessoes live ({count}):',
    list_empty: 'Nenhuma sessao live encontrada.',
    list_line: '- {session} | {agent} | {tool} | {phase} | {updatedAt}'
  },
  squad_status: {
    no_squad: 'Nenhum squad encontrado.',
    hint: 'Use @squad na sua sessao de IA para montar um squad.',
    squads_found: '{count} squad(s) encontrados:',
    most_recent: '(mais recente)',
    squad_item: '  [{file}]{marker}',
    name: '    Squad       : {value}',
    mode: '    Modo        : {value}',
    goal: '    Objetivo    : {value}',
    agents: '    Agentes     : {specialists} especialistas / {total} total ({path})',
    sessions: '    Sessoes     : {count} ({path})',
    latest_html: '    Latest HTML : {value}',
    logs: '    Logs        : {count} ({path})',
    genomes: '    Genomes     : {count} no squad / {agent_count} vinculos por agente',
    model_tiers: '    Model Tiers : {value}',
    estimated_cost: '    Custo Est.  : ~${value}/run'
  },
  squad_agent_create: {
    no_name: 'Uso: aioson squad:agent-create [path] --name=<nome-agente> [--type=agent|assistant|clone|worker] [--scope=my-agents|squad] [--squad=<slug>]',
    invalid_scope: 'Escopo inválido: "{scope}". Use "my-agents" ou "squad".',
    invalid_type: 'Tipo inválido: "{type}". Use: agent, assistant, clone, worker.',
    invalid_tier: 'Tier inválido: "{tier}". Use: 0 (foundation), 1 (master), 2 (systematizer), 3 (specialist).',
    invalid_disc: 'Perfil DISC inválido: "{disc}".',
    no_squads: 'Nenhuma squad encontrada. Crie uma squad com @squad ou forneça --squad=<slug>.',
    squad_required: '--squad=<slug> obrigatório quando scope é "squad".',
    squad_not_found: 'Squad "{squad}" não encontrada.',
    already_exists: 'Agente já existe: {path}'
  },
  squad_doctor: {
    prefix_ok: 'OK',
    prefix_warn: 'AVISO',
    prefix_fail: 'FALHA',
    report_title: 'Relatorio da squad {squad}: {path}',
    check_line: '[{prefix}] {message}',
    check_metadata: 'Metadata da squad presente: {path}',
    check_manifest: 'Manifesto da squad presente: {path}',
    check_rules: 'Rules/agents.md presente: {path}',
    check_design_doc: 'Design doc da squad: {path}',
    check_readiness: 'Readiness da squad: {path}',
    check_executors: 'Executores declarados: {count} | arquivos ausentes: {missing}',
    check_output_dir: 'Diretorio de output da squad: {path}',
    check_media_dir: 'Diretorio de media da squad: {path}',
    check_runtime_missing: 'Runtime store ausente. Execute aioson runtime:init.',
    check_active_runs: 'Runs ativas: {count} | possivelmente travadas (> {minutes} min): {stale}',
    check_content_indexing: 'Conteudos indexados: {indexed} | arquivos pendentes de indexacao: {pending}',
    summary: 'Resumo -> checks OK: {passed} | avisos: {warned} | falhas: {failed}'
  },
  scan_project: {
    scanning: 'aioson scan:project — escaneando {dir}',
    folder_required:
      'Informe --folder=<pasta[,pasta2]> para gerar o mapa completo das pastas desejadas. Exemplo: --folder=src ou --folder=app.',
    folder_required_examples_title: '\x1b[33mGuia rapido:\x1b[0m',
    folder_required_example_local:
      '  Mapas locais    : aioson scan:project . --folder=src',
    folder_required_example_multi:
      '  Varias pastas   : aioson scan:project . --folder=src,app',
    folder_required_example_llm:
      '  API automatica  : aioson scan:project . --folder=src --with-llm --provider=openai',
    folder_required_example_cli:
      '  Sem API LLM     : aioson scan:project . --folder=src  -> depois execute @analyst no seu Codex/Claude',
    folder_required_example_prompt:
      '  Prompt pronto   : aioson agent:prompt analyst --tool=codex',
    folder_required_example_next:
      '  Workflow apos scan completo: @analyst -> @scope-check -> @architect -> @dev',
    folder_not_found: 'A pasta "{folder}" nao foi encontrada neste projeto. Pastas de nivel superior detectadas: {available}',
    config_missing: '{file} nao encontrado. Para usar o modo com LLM, copie aioson-models.json e preencha suas chaves de API.',
    config_invalid: 'JSON invalido em aioson-models.json: {error}',
    provider_missing: 'Provider de LLM "{provider}" nao encontrado em aioson-models.json. Disponiveis: {available}',
    provider_info: '  Provider : {provider}',
    model_info: '  Modelo   : {model}',
    context_found: '  Contexto : project.context.md encontrado',
    context_missing: '  Contexto : project.context.md nao encontrado (execute aioson setup:context primeiro)',
    spec_found: '  Spec     : spec.md encontrado — memoria de desenvolvimento incluida',
    existing_discovery_found: '  Contexto : discovery.md existente encontrado em {path}',
    existing_skeleton_found: '  Contexto : skeleton-system.md existente encontrado em {path}',
    context_update_mode: '  Modo     : update/merge do contexto existente ativado para discovery.md + skeleton-system.md',
    context_mode: '  Contexto : context-mode={mode} (padrao recomendado para brownfield: merge)',
    local_only: '  LLM      : desativada por padrao — scan local apenas (use --with-llm para gerar discovery.md + skeleton-system.md)',
    walking: '  Escaneando estrutura do projeto...',
    walk_done: '  Arquivos : {files} entradas mapeadas | Arquivos chave: {keys} lidos',
    index_written: '  Indice   : scan local escrito em {path} (modo: {mode})',
    folders_written: '  Pastas   : mapa de pastas escrito em {path}',
    folder_written: '  Pasta    : mapa completo de {folder} escrito em {path}',
    forge_written: '  AIOS     : mapa util do .aioson escrito em {path}',
    memory_index_written: '  Memoria  : memory-index.md escrito em {path}',
    spec_current_written: '  Memoria  : spec-current.md escrito em {path}',
    spec_history_written: '  Memoria  : spec-history.md escrito em {path}',
    module_memory_written: '  Modulo   : memoria focada de {folder} escrita em {path}',
    dry_run_done: '[dry-run] Escanearia {treeCount} entradas e {keyCount} arquivos chave — nenhuma chamada LLM feita.',
    local_done: '  Resultado: scan local concluido — index, mapa de pastas, scans solicitados e .aioson estao prontos.',
    local_missing: '  Falta    : discovery.md + skeleton-system.md ainda nao foram gerados neste scan local.',
    architecture_note: '  Nota     : architecture.md nao e gerado pelo scan:project; esse arquivo vem depois com @architect.',
    local_paths_title: '\n\x1b[33m  Como gerar o discovery agora:\x1b[0m',
    local_path_api: '  \x1b[32mCaminho A — API automatica\x1b[0m',
    calling_llm: '  Chamando {provider} ({model})...',
    llm_missing_api_key:
      'A chave de API do provider "{provider}" ainda nao foi configurada em {file}. Preencha providers.{provider}.api_key ou escolha outro provider com --provider=...',
    llm_error: 'Chamada LLM falhou: {error}',
    gitignore_policy_written:
      '  Gitignore: politica do AIOSON atualizada em {path} para ignorar arquivos gerenciados do framework',
    gitignore_tracked_note:
      '  Gitignore: se esses arquivos ja estavam rastreados pelo Git antes, ainda sera preciso remover do indice uma vez com git rm --cached para eles pararem de aparecer no status',
    invalid_llm_output_discovery_empty:
      'A LLM retornou discovery.md vazio. Nenhum arquivo existente foi sobrescrito. Mantenha o backup atual e tente um modelo mais forte ou menos pastas por execucao.',
    invalid_llm_output_skeleton_empty:
      'A LLM retornou skeleton-system.md vazio apos o delimitador. Nenhum arquivo existente foi sobrescrito. Tente novamente com um modelo mais forte ou um escopo menor.',
    gitignore_backups_written: '  Gitignore: backup local garantido em {path}',
    backups_written: '  Backup   : {count} arquivo(s) salvo(s) em {path}',
    discovery_written: 'discovery.md escrito: {path} ({chars} chars)',
    skeleton_written: 'skeleton-system.md escrito: {path} ({chars} chars)',
    skeleton_missing: 'Delimitador skeleton nao encontrado na resposta LLM — skeleton-system.md nao escrito.',
    local_next_steps: '  1. Rode: aioson scan:project {target} --folder={folders} --with-llm --provider=<provider>',
    local_path_cli: '  \x1b[36mCaminho B — Seu AI CLI (sem API no aioson)\x1b[0m',
    local_cli_step_analyst: '  2. No Codex, Claude Code ou outro cliente, execute @analyst — ele pode usar scan-index.md + scan-folders.md + scan-<pasta>.md para escrever discovery.md',
    local_cli_step_prompt_codex: '  3. Se o cliente nao entender @analyst, gere um prompt pronto: aioson agent:prompt analyst --tool=codex',
    local_cli_step_prompt_claude: '  4. Troque --tool=codex por --tool=claude quando necessario quando necessario',
    local_cli_step_model_hint: '  5. Se seu cliente permitir escolher modelo, prefira um modelo rapido/barato para esta etapa de discovery',
    local_workflow_title: '\n\x1b[33m  Depois do discovery:\x1b[0m',
    local_step_architect: '  3. Execute @architect — gera architecture.md a partir do discovery consolidado',
    local_step_dev: '  4. Execute @dev — use codigo somente depois de discovery.md + architecture.md estarem prontos',
    next_steps: '\n  Proximos passos:',
    step_analyst: '  1. Abra sua sessao de IA e execute @analyst — revisa discovery.md + skeleton-system.md e consolida o escopo atual',
    step_architect: '  2. Execute @architect — gera architecture.md a partir do discovery consolidado',
    step_dev: '  3. Execute @dev — le skeleton-system.md primeiro, depois discovery.md + architecture.md + spec.md'
  },
  squad_investigate: {
    no_runtime: 'Runtime store nao encontrado. Execute aioson runtime:init primeiro.',
    no_investigations: 'Nenhuma investigacao encontrada.',
    not_found: 'Investigacao nao encontrada: {slug}',
    no_report: 'Investigacao "{slug}" nao possui arquivo de relatorio.',
    report_missing: 'Arquivo de relatorio nao encontrado: {path}',
    show_usage: 'Uso: aioson squad:investigate [path] --sub=show --investigation=<slug>',
    score_usage: 'Uso: aioson squad:investigate [path] --sub=score --investigation=<slug>',
    link_usage: 'Uso: aioson squad:investigate [path] --sub=link --investigation=<slug> --squad=<slug>',
    register_usage: 'Uso: aioson squad:investigate [path] --sub=register --report=<caminho> [--domain=<nome>] [--squad=<slug>]',
    linked: 'Investigacao "{investigation}" vinculada ao squad "{squad}".',
    registered: 'Investigacao registrada: {slug} ({path})',
    unknown_sub: 'Subcomando desconhecido: {sub}. Use: list, show, score, link, register.'
  },
  squad_daemon: {
    squad_required: 'Slug do squad e obrigatorio. Use --squad=<slug>.',
    started: 'Daemon iniciado para squad "{squad}" na porta {port} ({workers} workers, {cron} cron jobs)',
    webhook_hint: 'Endpoint webhook: POST http://127.0.0.1:{port}/webhook/<worker-slug>',
    stop_hint: 'Pressione Ctrl+C para parar.',
    stopping: 'Parando daemon...',
    start_failed: 'Falha ao iniciar daemon: {error}',
    no_runtime: 'Runtime store nao encontrado. Execute aioson runtime:init primeiro.',
    no_daemons: 'Nenhum registro de daemon encontrado.',
    not_found: 'Nenhum registro de daemon para o squad: {squad}',
    not_running: 'O daemon do squad "{squad}" nao esta rodando.',
    signal_sent: 'SIGTERM enviado ao daemon de "{squad}" (pid {pid}).',
    process_gone: 'O processo do daemon de "{squad}" nao esta mais rodando.',
    no_logs: 'Nenhum log de atividade do daemon encontrado.',
    unknown_sub: 'Subcomando desconhecido: {sub}. Use: start, status, stop, logs.'
  },

  squad_mcp: {
    squad_required: 'Slug do squad e obrigatorio. Use --squad=<slug>.',
    connectors_title: 'Conectores MCP Integrados:',
    actions: 'Acoes',
    required_config: 'Obrigatorio',
    no_integrations: 'Nenhuma integracao configurada para o squad "{squad}".',
    missing_config: 'Config ausente',
    calls: 'Chamadas',
    mcp_required: 'Slug do MCP e obrigatorio. Use --mcp=<slug>.',
    connector_required: 'ID do conector e obrigatorio. Use --connector=<id>.',
    unknown_connector: 'Conector desconhecido: {connector}. Use --sub=connectors para listar.',
    configured: 'Integracao "{mcp}" configurada com conector "{connector}" (status: {status}).',
    still_missing: 'Ainda faltam env/config: {keys}',
    not_configured: 'Integracao "{mcp}" nao esta configurada.',
    test_missing: 'Integracao "{mcp}" tem config ausente: {keys}',
    test_ok: 'Integracao "{mcp}" ({connector}) — config OK.',
    health_url: 'URL de health check: {url}',
    testing_connection: 'Testando conexao...',
    health_ok: 'Conexao OK (HTTP {statusCode})',
    health_error: 'Erro na conexao: {error}',
    health_skipped: 'Verificacao de saude nao disponivel para este connector',
    action_required: 'Slug da acao e obrigatorio. Use --action=<slug>.',
    invalid_input: 'JSON invalido. Forneca JSON valido com --input.',
    unknown_sub: 'Subcomando desconhecido: {sub}. Use: status, connectors, configure, test, call.'
  },

  squad_roi: {
    squad_required: 'Slug do squad e obrigatorio. Use --squad=<slug>.',
    config_saved: 'Config de ROI salva para o squad "{squad}".',
    pricing_model: 'Modelo de precificacao',
    setup_fee: 'Taxa de implantacao',
    monthly_fee: 'Mensalidade',
    percentage: 'Percentual',
    contract: 'Contrato',
    metric_required: 'Chave e valor da metrica sao obrigatorios. Use --key=<nome> --value=<N>.',
    metric_saved: 'Metrica "{key}" = {value} salva para o squad "{squad}".',
    no_metrics: 'Nenhuma metrica encontrada para o squad "{squad}".',
    report_title: 'Relatorio de ROI — {squad}',
    baseline: 'Baseline',
    actual: 'Atual',
    target: 'Meta',
    period: 'Periodo',
    cost_section: 'Resumo de Custos:',
    monthly_cost: 'Custo mensal efetivo',
    exported: 'Relatorio exportado para {file} ({format}).',
    unknown_sub: 'Subcomando desconhecido: {sub}. Use: config, metric, report, export.'
  },

  squad_worker: {
    squad_required: 'Slug do squad e obrigatorio. Use --squad=<slug>.',
    no_workers: 'Nenhum worker encontrado para este squad.',
    run_usage: 'Uso: aioson squad:worker --sub=run --squad=<slug> --worker=<slug> [--input=<json>]',
    test_usage: 'Uso: aioson squad:worker --sub=test --squad=<slug> --worker=<slug>',
    scaffold_usage: 'Uso: aioson squad:worker --sub=scaffold --squad=<slug> --worker=<slug> [--trigger=manual|event|scheduled]',
    not_found: 'Worker nao encontrado: {worker}',
    invalid_input: 'JSON invalido. Forneca JSON valido com --input.',
    run_success: 'Worker "{worker}" concluido com sucesso.',
    run_failed: 'Worker "{worker}" falhou: {error}',
    test_passed: 'Worker "{worker}" teste aprovado.',
    test_failed: 'Worker "{worker}" teste falhou: {error}',
    scaffold_created: 'Worker "{worker}" criado em {path}',
    no_runtime: 'Runtime store nao encontrado. Execute aioson runtime:init primeiro.',
    no_logs: 'Nenhuma execucao de worker encontrada.',
    unknown_sub: 'Subcomando desconhecido: {sub}. Use: list, run, test, logs, scaffold.'
  },

  squad_dashboard: {
    started: 'Squad Dashboard rodando em {url} (porta {port})',
    filtered: 'Filtrando para squad: {squad}',
    stop_hint: 'Pressione Ctrl+C para parar.',
    stopping: 'Parando Squad Dashboard...',
    port_in_use: 'Porta {port} ja esta em uso. Tente --port=<outra>'
  },
  implementation_plan: {
    not_found: 'Plano de implementacao nao encontrado: {file}',
    no_runtime: 'Runtime store nao encontrado. Execute aioson runtime:init primeiro.',
    no_plans: 'Nenhum plano de implementacao registrado.',
    no_created_date: 'Plano nao possui data de criacao no frontmatter — nao e possivel verificar obsolescencia.',
    is_stale: 'Plano esta OBSOLETO — artefatos fonte foram alterados apos a criacao do plano.',
    is_fresh: 'Plano esta atualizado.',
    checkpoint_usage: 'Uso: aioson plan [path] --sub=checkpoint --feature=<slug> --phase=<N>',
    phase_completed: 'Fase {phase} marcada como concluida.',
    phase_not_found: 'Fase {phase} nao encontrada no plano.',
    registered: 'Plano de implementacao registrado: {planId} ({phases} fases)'
  },
  squad_plan: {
    slug_required: 'Slug do squad e obrigatorio.',
    not_found: 'Plano de execucao nao encontrado para o squad: {slug}',
    no_runtime: 'Runtime store nao encontrado. Execute aioson runtime:init primeiro.',
    no_plan: 'Nenhum plano de execucao registrado para o squad: {slug}',
    no_created_date: 'Plano nao possui data de criacao no frontmatter — nao e possivel verificar obsolescencia.',
    is_stale: 'Plano de execucao esta OBSOLETO — artefatos do squad foram alterados apos a criacao do plano.',
    is_fresh: 'Plano de execucao esta atualizado.',
    checkpoint_usage: 'Uso: aioson squad:plan [path] --sub=checkpoint --squad=<slug> --round=<N>',
    round_completed: 'Round {round} marcado como concluido.',
    round_not_found: 'Round {round} nao encontrado no plano.',
    registered: 'Plano de execucao registrado: {planSlug} ({rounds} rounds)'
  },

  squad_learning: {
    slug_required: 'Slug do squad e obrigatorio.',
    no_runtime: 'Runtime store nao encontrado. Execute aioson runtime:init primeiro.',
    no_learnings: 'Nenhum learning encontrado para o squad: {slug}',
    not_found: 'Learning nao encontrado: {id}',
    archived_count: '{count} learning(s) marcado(s) como obsoleto(s) para o squad: {slug}',
    promote_usage: 'Uso: aioson squad:learning [path] --sub=promote --squad=<slug> --id=<learning-id> [--to=<caminho-regra>]',
    promoted: 'Learning {id} promovido a regra em {path}'
  },

  learning: {
    no_runtime: 'Runtime store nao encontrado. Execute aioson runtime:init primeiro.',
    no_learnings: 'Nenhum learning de projeto encontrado.',
    not_found: 'Learning nao encontrado: {id}',
    promote_usage: 'Uso: aioson learning [path] --sub=promote --id=<learning-id> [--to=<caminho-regra>]',
    promoted: 'Learning {id} promovido a regra em {path}'
  },

  auth: {
    login_no_token: 'Nenhum token informado. Obtenha o seu em: {url}',
    login_hint: 'Execute: aioson auth:login',
    login_hint_token: 'Ou obtenha um token manualmente em: {url}',
    login_verifying: 'Verificando token...',
    login_ok: '✓ Autenticado como {username}. Token salvo em {path}.',
    login_saved: '✓ Token salvo em {path}. (Nao foi possivel verificar — API pode estar offline.)',
    logout_ok: 'Logout realizado. Token removido.',
    status_not_authenticated: 'Nao autenticado.',
    status_checking: 'Verificando token...',
    status_ok: 'Autenticado como {username}.',
    status_token_offline: 'Token salvo (ultimo usuario conhecido: {username}). API offline ou inacessivel.',
    // Fluxo browser (callback — Mac/Windows nativos)
    browser_opening: 'Abrindo o browser...',
    browser_waiting: 'Aguardando autenticacao no browser... (Ctrl+C para cancelar)',
    browser_timeout: 'Tempo esgotado. Tente novamente.',
    browser_state_mismatch: 'Falha de seguranca: state invalido.',
    browser_no_token: 'Nenhum token recebido do browser.',
    browser_failed: 'Login via browser falhou: {error}',
    browser_server_error: 'Erro ao iniciar servidor local de callback',
    // Fluxo paste (WSL2, SSH, headless)
    paste_open_browser: 'Abra o link abaixo no seu navegador:',
    paste_instruction: 'Apos fazer login, a pagina exibira um token. Copie-o e cole aqui.',
    paste_token_prompt: 'Cole o token aqui:',
    paste_no_token: 'Nenhum token informado.',
  },

  workspace: {
    registering: 'Registrando workspace no aioson.com...',
    init_ok: 'Workspace "{slug}" vinculado.\n  Local: {path}\n  Online: {url}',
    already_linked: 'Workspace ja vinculado: {slug}\n  Online: {url}',
    not_linked: 'Nenhum workspace vinculado a este projeto.',
    init_hint: 'Execute: aioson workspace:init',
    status_slug: 'Workspace: {slug}',
    status_id: 'ID: {id}',
    status_url: 'URL: {url}',
    status_created: 'Criado em: {date}',
    open_url: 'Abra no navegador: {url}'
  },

  store: {
    error_not_authenticated: 'Nao autenticado. Execute: aioson auth:login',
    error_missing_slug: 'Informe --slug.',
    error_missing_code_or_slug: 'Informe um slug (--slug=X) ou um codigo de instalacao.',
    error_invalid_response: 'Resposta invalida do aioson.com.',
    error_genome_not_found: 'Genome "{slug}" nao encontrado em {path}.',
    error_skill_not_found: 'Skill "{slug}" nao encontrada em .aioson/skills/ ou .aioson/installed-skills/.',
    error_skill_missing_skillmd: 'Skill "{slug}" nao tem SKILL.md.',
    error_squad_not_found: 'Squad "{slug}" nao encontrado em {path}.',

    publish_dry_run: '[dry-run] Publicaria {type} "{slug}" (visibilidade: {visibility}).',
    publish_genome_validating: 'Validando genome...',
    publish_genome_sending: 'Enviando para aioson.com...',
    publish_genome_done: 'Publicado: aioson.com/store/genomes/{slug}\n  Instalar: aioson genome:install --slug={slug}',
    publish_skill_collecting: 'Coletando arquivos da skill...',
    publish_skill_files: '  Arquivos: {count}',
    publish_skill_sending: 'Enviando {count} arquivo(s) para aioson.com...',
    publish_skill_done: 'Publicado: aioson.com/store/skills/{slug}\n  Instalar: aioson skill:install --slug={slug}',
    publish_squad_analyzing_agents: 'Analisando agentes...',
    publish_squad_agents_found: '  Agentes: {count}',
    publish_squad_analyzing_deps: 'Analisando dependencias...',
    publish_squad_bundling_skill: '  Empacotando skill: {slug}',
    publish_squad_skill_missing: '  Skill nao encontrada (ignorada): {slug}',
    publish_squad_bundling_genome: '  Empacotando genome: {slug}',
    publish_squad_genome_missing: '  Genome nao encontrado (ignorado): {slug}',
    publish_squad_sending: 'Enviando para aioson.com...',
    publish_squad_done: 'Publicado: aioson.com/store/squads/{slug}\n  Instalar: aioson squad:install --slug={slug}',
    publish_squad_summary: '  Agentes: {agents} | Skills empacotadas: {skills} | Genomes empacotados: {genomes}',

    install_skill_fetching: 'Buscando skill "{ref}" no aioson.com...',
    install_skill_done: 'Skill "{slug}" instalada em {path}.',
    install_genome_fetching:'Buscando genome "{ref}" no aioson.com...',
    install_genome_done: 'Genome "{slug}" instalado em {path}.',
    install_backing_up: '  Backup salvo: {path}',
    install_squad_fetching: 'Buscando squad "{ref}" no aioson.com...',
    install_squad_writing: 'Instalando arquivos...',
    install_squad_dep_skip: '  {type} "{slug}" ja instalado — ignorando (use --force para substituir).',
    install_squad_done: 'Squad "{slug}" instalado em {path}.',

    list_genome_empty: 'Nenhum genome instalado neste projeto.',
    list_genome_header: '{count} genome(s) instalado(s):',
    list_genome_item: '  {slug}{version}',
    list_genome_item_v2: '  {folderMarker} {advisorMarker} {slug}  {name}  {track}{fidelity}{advisor}',
    list_genome_conflict_warn: '⚠️  {slug}: ambos os formatos (pasta e arquivo único) existem; pasta tem precedência (rode "aioson genome:remove --slug={slug}" para limpar).',
    publish_genome_folder_collecting: 'Coletando arquivos do genome (Track 4.2/4.3 modular)...',
    publish_genome_folder_files: '  Arquivos: {count}',
    publish_genome_folder_track: '  Track: {track} · Fidelity: {fidelity} · Advisor-ready: {advisor}',
    publish_genome_folder_sending: 'Enviando {count} arquivo(s) para aioson.com (formato pasta)...',
    publish_genome_conflict_warn: '⚠️  {slug}: ambos os formatos existem localmente; pasta tem precedência no publish.',
    install_backing_up_legacy: '  Conflito com formato antigo detectado; backup em: {path}',
    install_folder_exists: '  Pasta existente em {path} será sobrescrita (use --force para suprimir este aviso).',
    install_genome_folder_done: 'Genome "{slug}" instalado em {path} ({count} arquivos, formato pasta).',
    error_genome_missing_skillmd: 'Pasta do genome "{slug}" não tem SKILL.md.',
    error_genome_missing_manifest: 'Pasta do genome "{slug}" não tem manifest.json.',
    error_genome_invalid_manifest: 'manifest.json do genome "{slug}" é inválido: {detail}',
    remove_genome_done: 'Genome "{slug}" removido.',
    list_remote_fetching: 'Buscando {type} no aioson.com...',
    list_remote_empty: 'Nenhum(a) {type} publicado(a) ainda.',
    list_remote_header: '{count} {type} publicado(s):',
    list_remote_item: '  {slug}  [{visibility}]  {name}',
    list_squad_empty: 'Nenhum squad neste projeto.',
    list_squad_header: '{count} squad(s):',
    list_squad_item: '  {slug}  [{visibility}]',

    grant_error_missing_code: 'Codigo ausente. Uso: aioson squad:grant <codigo> <email>',
    grant_error_missing_email: 'Email ausente. Uso: aioson squad:grant <codigo> <email>',
    grant_sending: 'Concedendo acesso a {email} para o codigo {code}...',
    grant_ok: '{email} agora pode instalar usando o codigo {code}.',

    publish_scanning: 'Executando varredura de seguranca...',
    publish_scan_ok: 'Varredura de seguranca aprovada. Hash do pacote: {hash}...',
    error_scan_failed: 'Publicacao bloqueada: a varredura de seguranca encontrou erros. Corrija-os ou entre em contato com o suporte.',
    error_scan_warnings: 'Publicacao bloqueada: {count} padrao(oes) suspeito(s) detectado(s). Revise os avisos acima. Use --force se tiver certeza de que o pacote e seguro.',

    install_scanning: 'Verificando integridade do pacote...',
    error_install_scan_failed: 'Instalacao bloqueada: o pacote "{slug}" falhou na varredura de seguranca. Pode ter sido adulterado.',
    error_hash_mismatch: 'Instalacao bloqueada: hash divergente para "{slug}". O pacote pode ter sido alterado em transito.',

    install_preview_header: 'Pacote: {slug}  v{version}  por {publisher}',
    install_preview_trusted: '  Status: Publisher verificado',
    install_preview_unverified: '  Status: Publisher nao verificado \u2014 revise os arquivos antes de usar',
    install_preview_downloads: '  Downloads: {count}',
    install_preview_rating: '  Avaliacao: {rating}',
    install_preview_hash: '  Hash: {hash}...',
    install_inspect_files: 'Arquivos neste pacote ({count} no total):',
    install_inspect_hint: 'Execute sem --inspect para instalar.',
    install_unverified_hint: '  Dica: Use --inspect para revisar os arquivos antes de instalar, ou --force para ignorar este aviso.'
  },

  system: {
    error_no_manifest: 'system.json nao encontrado em {path}. Crie um system.json no diretorio raiz do sistema.',
    error_invalid_manifest: 'system.json invalido — verifique se e um JSON valido.',
    error_manifest_missing_slug: 'system.json deve conter o campo "slug".',
    error_manifest_missing_version: 'system.json deve conter o campo "version".',
    error_manifest_missing_name: 'system.json deve conter o campo "name".',
    error_missing_package_json: 'package.json nao encontrado. Um sistema deve ser um projeto Node.js valido.',

    package_reading_manifest: 'Lendo system.json...',
    package_manifest_ok: 'Sistema: {name} ({slug} v{version})',
    package_collecting_files: 'Coletando arquivos fonte...',
    package_files_found: '  {count} arquivos ({kb} KB)',
    package_dry_run: '[dry-run] Pacotaria {slug} v{version} — nenhum arquivo gravado.',
    package_saved: 'Pacote salvo em: {path}',

    publish_reading_manifest: 'Lendo system.json...',
    publish_dry_run: '[dry-run] Publicaria sistema "{slug}" v{version} (visibilidade: {visibility}).',
    publish_sending: 'Enviando para aioson.com...',
    publish_done: 'Publicado: aioson.com/store/systems/{slug}\n  Instalar no aioson-play usando o slug: {slug}',
    publish_summary: '  Arquivos: {files} ({kb} KB)',

    list_remote_empty: 'Nenhum sistema publicado ainda.',
    list_remote_header: '{count} sistema(s) publicado(s):',
    list_remote_item: '  {slug}  v{version}  [{visibility}]  {name}',
    list_local_empty: 'Nenhum sistema em cache neste projeto.',
    list_local_header: '{count} sistema(s) em cache:',
    list_local_item: '  {slug}',

    install_fetching: 'Buscando sistema "{ref}" no aioson.com...',
    install_writing: 'Gravando arquivos...',
    install_done: 'Sistema "{slug}" instalado em {path}.'
  }
};
