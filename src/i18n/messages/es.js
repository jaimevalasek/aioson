'use strict';

module.exports = {
  cli: {
    title: 'AIOSON CLI',
    title_line: '{title}\n',
    usage: 'Uso:',
    help_item_line: '  {text}',
    help_init:
      'aioson init <project-name> [--force] [--dry-run] [--lang=<bcp47-tag>] [--tool=codex|claude|opencode] [--locale=es]',
    help_install:
      'aioson install [path] [--force] [--dry-run] [--lang=<bcp47-tag>] [--tool=codex|claude|opencode] [--locale=es]',
    help_setup:
      'aioson setup [path] [--defaults] [--framework=<nombre>] [--lang=<bcp47-tag>] [--project-name=<nombre>] [--force] [--dry-run] [--tool=codex|claude|opencode] [--locale=es]',
    help_update:
      'aioson update [path] [--dry-run] [--lang=<bcp47-tag>] [--locale=es]',
    help_info: 'aioson info [path] [--json] [--locale=es]',
    help_doctor: 'aioson doctor [path] [--fix] [--dry-run] [--json] [--locale=es]',
    help_hygiene_scan: 'aioson hygiene:scan [path] [--json] [--locale=es]',
    help_i18n_add: 'aioson i18n:add <locale> [--force] [--dry-run] [--locale=es]',
    help_agents: 'aioson agents [path] [--lang=<bcp47-tag>] [--locale=es]',
    help_agent_prompt:
      'aioson agent:prompt <agent> [path] [--tool=codex|claude|opencode] [--lang=<bcp47-tag>] [--locale=es]',
    help_agent_help:
      'aioson agent:help [agent] [--json]',
    help_agent_invoke:
      'aioson agent:invoke <agent> [path] [--tool=codex|claude|opencode] [--mode=framework_target|app_target] [--feature=<slug>] [--scope=<area>] [--lang=<bcp47-tag>] [--locale=es]',
    help_agent_epilogue:
      'aioson agent:epilogue [path] --agent=<agente> --summary=<texto> [--feature=<slug>] [--approve-gate=A|B|C|D] [--json] [--locale=es]',
    help_context_validate: 'aioson context:validate [path] [--json] [--locale=es]',
    help_context_pack:
      'aioson context:pack [path] [--agent=<agente>] [--goal=<texto>] [--module=<modulo-o-carpeta>] [--max-files=8] [--json] [--locale=es]',
    help_context_search:
      'aioson context:search [path] --query=<texto> [--agent=<agente>] [--mode=planning|executing] [--task=<texto>] [--paths=<ruta[,ruta2]>] [--intent=memory|feature|rules] [--limit=10] [--json] [--locale=es]',
    help_context_select:
      'aioson context:select [path] [--agent=<agente>] [--mode=planning|executing] [--task=<texto>] [--paths=<ruta[,ruta2]>] [--feature=<slug>] [--no-semantic] [--json] [--locale=es]',
    help_context_brief:
      'aioson context:brief [path] [--agent=<agente>] [--mode=planning|executing] [--task=<texto>] [--paths=<ruta[,ruta2]>] [--feature=<slug>] [--no-semantic] [--no-recall] [--json] [--locale=es]',
    help_context_guard:
      'aioson context:guard [path] [--tool=claude] [--agent=<agente>] [--event=<json>] [--event-file=<ruta>] [--json] [--locale=es]',
    help_context_load:
      'aioson context:load [path] --target=<rule|brain>:<slug> --agent=<nombre> [--batch="slug1,slug2"] [--feature=<slug>] [--classification=<MICRO|SMALL|MEDIUM>] [--verbose] [--json] [--locale=es]',
    help_chain_audit:
      'aioson chain:audit <archivo> [path] [--limit=N] [--feature=<slug>] [--json] [--locale=es]',
    chain_audit: {
      file_required: 'chain:audit requiere una ruta de archivo. Uso: aioson chain:audit <archivo> [--limit=N] [--feature=<slug>] [--json]',
      runtime_unavailable: 'chain:audit runtime db no disponible: {error}',
      query_failed: 'chain:audit falló al consultar chain_edges: {error}',
      no_impacts: 'chain:audit {file} → ningún impacto detectado ({duration}ms)',
      results_header: 'chain:audit {file} → {count} impacto(s) ({duration}ms):'
    },
    context_load: {
      target_required: 'context:load requiere --target=<rule|brain>:<slug>.',
      agent_required: 'context:load requiere --agent=<nombre>.',
      target_invalid: 'context:load valor inválido para --target: {target}. Se esperaba rule:<slug> o brain:<slug>.',
      success: 'context:load emitió {count} evento(s) para el agente {agent}.'
    },
    help_memory_status: 'aioson memory:status [path] [--json] [--locale=es]',
    help_memory_summary: 'aioson memory:summary [path] [--last=5] [--json] [--locale=es]',
    help_memory_search:
      'aioson memory:search "<consulta>" [path] [--limit=5] [--surface=rules|learnings|all] [--include-archived] [--json] [--locale=es]',
    help_memory_archive:
      'aioson memory:archive [path] --id=<rule|learning|brain>:<slug> --reason="<texto>" [--feature=<slug>] [--dry-run] [--json] [--locale=es]',
    help_memory_restore:
      'aioson memory:restore [path] --id=<rule|learning|brain>:<slug> [--reason="<texto>"] [--feature=<slug>] [--dry-run] [--json] [--locale=es]',
    memory_archive: {
      id_required: 'memory:archive requiere --id=<rule|learning|brain>:<slug>.',
      reason_required: 'memory:archive requiere --reason="<texto>".',
      invalid_id: 'memory:archive valor inválido para --id: "{value}". Se esperaba rule|learning|brain:<slug>.',
      hook_blocked: 'memory:archive no puede ejecutarse desde un hook (BR-ALL-01: tier-2 requiere acción humana).',
      target_not_found: 'memory:archive: {kind} "{slug}" no encontrado en estado activo.',
      already_archived: 'memory:archive: "{path}" ya está archivado. No-op.',
      notify_template: 'archivando {kind} "{slug}": {reason}',
      dry_run_summary: 'memory:archive [dry-run]: movería {source} → {dest} (entrada activa: {has_active}).',
      archived_success: 'memory:archive ✓ {kind} "{slug}" archivado en {dest}.'
    },
    memory_restore: {
      id_required: 'memory:restore requiere --id=<rule|learning|brain>:<slug>.',
      invalid_id: 'memory:restore valor inválido para --id: "{value}". Se esperaba rule|learning|brain:<slug>.',
      hook_blocked: 'memory:restore no puede ejecutarse desde un hook (BR-ALL-01: tier-2 requiere acción humana).',
      target_not_archived: 'memory:restore: {kind} "{slug}" no encontrado en el archivo.',
      target_already_active: 'memory:restore: {kind} "{slug}" ya está activo. No-op.',
      target_not_found: 'memory:restore: {kind} "{slug}" no encontrado.',
      notify_template: 'restaurando {kind} "{slug}": {reason}',
      dry_run_summary: 'memory:restore [dry-run]: movería {source} → {dest}.',
      restored_success: 'memory:restore ✓ {kind} "{slug}" restaurado a {dest}.'
    },
    help_memory_trim:
      'aioson memory:trim [ruta] [--keep=<N>] [--archive=<path>] [--dry-run] [--json] [--locale=es]',
    memory_trim: {
      hook_blocked: 'memory:trim no puede invocarse desde un hook de runtime (tier-2 requiere acción humana).',
      no_current_state: 'memory:trim: {path} no encontrado (nada que recortar).',
      archive_path_escape: 'memory:trim: --archive fuera del proyecto rechazado: {path}',
      section_not_found: 'memory:trim: sección "## What the system already has" no encontrada — nada que hacer.',
      nothing_to_archive: 'memory:trim: {kept} entradas dentro de la ventana keep={keep} — nada que archivar.',
      dry_run_summary: 'memory:trim [dry-run]: archivaría {archived}/{total} entradas (keep={keep}, slug activo exento). {before_kb}KB → {after_kb}KB (ahorra {saved_kb}KB). No se escribió ningún archivo.',
      notify_template: 'recortando current-state.md: archivando {archived} entradas frías',
      trimmed_success: 'memory:trim ✓ {archived} entradas archivadas (conservadas {kept}). {before_kb}KB → {after_kb}KB. Archivo: {archive}'
    },
    memory_search: {
      query_empty: 'memory:search requiere una consulta no vacía.',
      query_too_long: 'memory:search consulta supera {max} caracteres.',
      query_unparseable: 'memory:search consulta "{value}" queda vacía tras sanitización (solo operadores / comillas).',
      invalid_surface: 'memory:search valor inválido para --surface: {value}. Se esperaba rules, learnings o all.',
      no_results: 'Sin resultados para "{query}".',
      results_header: 'Top {count} resultados para "{query}":',
      snippet_truncated: 'Fragmento truncado.'
    },
    help_brain_query:
      'aioson brain:query [path] [--tags=<csv>] [--agent=<agente>] [--min-quality=4] [--format=compact|json|ids] [--json] [--locale=es]',
    help_setup_context:
      'aioson setup:context [path] [--defaults] [--project-type=web_app|api|site|script|dapp|desktop_app] [--framework=<name>] [--backend=<name>] [--frontend=<name>] [--database=<name>] [--auth=<name>] [--uiux=<name>] [--language=<bcp47-tag>] [--web3-enabled=true|false] [--locale=es]',
    help_locale_apply: 'aioson locale:apply [path] [--lang=<bcp47-tag>] [--dry-run] [--locale=es]',
    help_locale_diff: 'aioson locale:diff [agent] [--lang=<bcp47-tag>] [--json] [--locale=en]',
    help_test_agents: 'aioson test:agents [--json] [--locale=en]',
    help_test_smoke:
      'aioson test:smoke [workspace-path] [--lang=<bcp47-tag>] [--web3=ethereum|solana|cardano] [--profile=standard|mixed|parallel] [--keep] [--json] [--locale=es]',
    help_test_package:
      'aioson test:package [source-path] [--keep] [--dry-run] [--json] [--locale=es]',
    help_workflow_plan:
      'aioson workflow:plan [path] [--classification=MICRO|SMALL|MEDIUM] [--json] [--locale=es]',
    help_workflow_execute:
      'aioson workflow:execute [path] [--feature=<slug>] [--agentic] [--max-dev-qa-cycles=<n>] [--max-tester-cycles=<n>] [--max-pentester-cycles=<n>] [--dry-run] [--lane=<n>] [--json] [--locale=es]',
    help_review_cycle:
      'aioson review-cycle:<status|advance|resolve|reset> [path] --feature=<slug> [--plan=<path>] [--source=qa|tester|pentester] [--json] [--locale=es]',
    help_review_feature:
      'aioson review:feature [path] [--feature=<slug>] [--scope=<target>] [--skip-audit] [--out-dir=<dir>] [--tool=<tool>] [--json] [--locale=es]',
    help_parallel_init:
      'aioson parallel:init [path] [--workers=2..6] [--force] [--dry-run] [--json] [--locale=es]',
    help_parallel_doctor:
      'aioson parallel:doctor [path] [--workers=2..6] [--fix] [--force] [--dry-run] [--json] [--locale=es]',
    help_parallel_assign:
      'aioson parallel:assign [path] [--source=auto|prd|architecture|discovery|<file>] [--workers=2..6] [--force] [--dry-run] [--json] [--locale=es]',
    help_parallel_status:
      'aioson parallel:status [path] [--json] [--locale=es]',
    help_parallel_merge:
      'aioson parallel:merge [path] [--apply] [--json] [--locale=es]',
    help_parallel_guard:
      'aioson parallel:guard [path] --lane=<n> --paths=<path[,path2]> [--json] [--locale=es]',
    help_mcp_init:
      'aioson mcp:init [path] [--tool=claude|codex|opencode] [--dry-run] [--json] [--locale=es]',
    help_mcp_doctor:
      'aioson mcp:doctor [path] [--strict-env] [--json] [--locale=es]',
    help_qa_doctor:
      'aioson qa:doctor [path] [--json] [--locale=es]',
    help_qa_init:
      'aioson qa:init [path] [--url=<app-url>] [--dry-run] [--json] [--locale=es]',
    help_qa_run:
      'aioson qa:run [path] [--url=<app-url>] [--persona=naive|hacker|power|mobile] [--headed] [--html] [--json] [--locale=es]',
    help_qa_scan:
      'aioson qa:scan [path] [--url=<app-url>] [--depth=3] [--max-pages=50] [--headed] [--html] [--json] [--locale=es]',
    help_qa_report:
      'aioson qa:report [path] [--html] [--json] [--locale=es]',
    help_harness_check:
      'aioson harness:check [path] --slug=<slug> [--criteria=C1,C2] [--timeout=<ms>] [--json] [--locale=es]',
    help_harness_retro:
      'aioson harness:retro [path] --feature=<slug> | --last=<N> [--json] [--locale=es]',
    help_harness_preview:
      'aioson harness:preview <file> [--max-bytes=8192] [--json] [--locale=es]',
    help_verification_plan:
      'aioson verification:plan [path] [--feature=<slug>] [--trigger=per-phase|end-of-feature|sensitive-surface] [--host=claude|codex|opencode] [--classification=MICRO|SMALL|MEDIUM] [--sensitive] [--json] [--locale=es]',
    harnessRetro: {
      need_target: 'harness:retro requiere --feature=<slug> o --last=<N>.',
      invalid_slug: 'Slug inválido: {slug} (debe cumplir ^[a-z0-9][a-z0-9-]*$).',
      invalid_last: 'Valor inválido para --last: {value} (use un entero >= 1).',
      feature_not_found: 'Feature no encontrada: {slug} (buscado en .aioson/context/, .aioson/plans/{slug}/, .aioson/context/features/{slug}/, .aioson/context/done/{slug}/).',
      no_closed_features: 'No hay features cerradas en .aioson/context/done/ para minar.',
      written: 'Dosier retrospectivo generado: {path} ({candidates} candidatos, {observations} observaciones).',
      empty: 'Dosier generado sin propuestas: {path} (fuentes sin rastro minable).',
      io_error: 'Error de E/S al escribir el dosier: {error}',
      window_truncated: '--last={n} supera las features disponibles ({available}); minando todas.',
      undatable_excluded: '{count} feature(s) sin fecha de PASS resoluble excluida(s) de la ventana: {slugs}'
    },
    harnessPreview: {
      file_required: 'harness:preview requiere una ruta de archivo <file>.',
      not_found: 'Archivo no encontrado: {path}',
      read_error: 'No se pudo leer el archivo: {path} ({error})'
    },
    help_web_map:
      'aioson web:map [path] --url=<url> [--depth=<N>] [--max-pages=<N>] [--include-external] [--json] [--locale=es]',
    help_web_scrape:
      'aioson web:scrape [path] --url=<url> [--format=markdown|text|html|links] [--json] [--locale=es]',
    help_scan_project:
      'aioson scan:project [path] --folder=<ruta[,ruta2]> [--summary-mode=titles|summaries|raw] [--context-mode=merge|rewrite] [--with-llm] [--provider=<name>] [--llm-model=<name>] [--dry-run] [--json] [--locale=es]',
    help_config:
      'aioson config <set KEY=value|show|get KEY> [--json] [--locale=es]',
    help_genome_doctor:
      'aioson genome:doctor <archivo> [--json] [--locale=es]',
    help_genome_migrate:
      'aioson genome:migrate <archivo-o-directorio> [--write] [--no-backup] [--json] [--locale=es]',
    help_squad_status:
      'aioson squad:status [path] [--json] [--locale=es]',
    help_squad_repair_genomes:
      'aioson squad:repair-genomes <manifest.json> [--write] [--no-backup] [--json] [--locale=es]',
    help_squad_validate:
      'aioson squad:validate [path] --squad=<slug> [--locale=es]',
    help_squad_export:
      'aioson squad:export [path] --squad=<slug> [--locale=es]',
    help_squad_pipeline:
      'aioson squad:pipeline [path] [--sub=list|show|status] [--pipeline=<slug>] [--locale=es]',
    help_squad_investigate:
      'aioson squad:investigate [path] [--sub=list|show|score|link|register] [--investigation=<slug>] [--squad=<slug>] [--locale=es]',
    help_squad_learning:
      'aioson squad:learning [path] [--sub=list|stats|archive|promote|export] [--squad=<slug>] [--status=<status>] [--locale=es]',
    help_quality_audit:
      'aioson quality:audit [path] [--feature=<slug>] [--provider-output=<path>] [--baseline=<path>] [--changed=<path[,path]>] [--json] [--locale=es]',
    help_squad_dashboard:
      'aioson squad:dashboard [path] [--port=4180] [--squad=<slug>] [--locale=es]',
    help_squad_worker:
      'aioson squad:worker [path] [--sub=list|run|test|logs|scaffold] [--squad=<slug>] [--worker=<slug>] [--input=<json>] [--locale=es]',
    help_squad_daemon:
      'aioson squad:daemon [path] [--sub=start|status|stop|logs] [--squad=<slug>] [--port=<N>] [--locale=es]',
    help_squad_mcp:
      'aioson squad:mcp [path] [--sub=status|connectors|configure|test] [--squad=<slug>] [--mcp=<slug>] [--connector=<id>]',
    help_squad_roi:
      'aioson squad:roi [path] [--sub=config|metric|report|export] [--squad=<slug>] [--key=<metrica>] [--value=<N>]',
    help_squad_score:
      'aioson squad:score [path] --squad=<slug> [--locale=es]',
    help_commit_prepare:
      'aioson commit:prepare [path] [--staged-only] [--agent-safe] [--mode=guarded|trusted|headless] [--json] [--locale=es]',
    help_learning:
      'aioson learning [path] [--sub=list|stats|promote|import-from-claude] [--status=<status>] [--id=<learning-id>] [--project-hash=<hash>] [--dry-run] [--select=<n[,n]|all>] [--locale=es]',
    dashboard_moved:
      'El flujo `{command}` fue eliminado del CLI. El dashboard de AIOSON ahora se instala por separado. Abre la app del dashboard en tu computadora, crea o agrega un proyecto y selecciona la carpeta que ya contiene `.aioson/`.',
    dashboard_moved_line: '{message}\n',
    unknown_command: 'Comando desconocido: {command}',
    unknown_command_line: '{message}\n',
    error_prefix: 'Error: {message}'
  },
  init: {
    usage_error:
      'Uso: aioson init <project-name> [--force] [--dry-run] [--all] [--lang=<bcp47-tag>] [--tool=codex|claude|opencode] [--locale=es]',
    non_empty_dir: 'El directorio no esta vacio: {targetDir}. Usa --force para continuar.',
    created_at: 'Proyecto creado en: {targetDir}',
    files_copied: 'Archivos copiados: {count}',
    files_skipped: 'Archivos omitidos: {count}',
    next_steps: 'Siguientes pasos:',
    step_cd: '1. cd {projectName}',
    step_setup: '2. Abre en tu AI CLI y ejecuta @setup',
    step_agents: '3. Si no aparece selector visual, ejecuta: aioson agents',
    step_agent_prompt:
      '4. Genera el prompt de setup para tu herramienta: aioson agent:prompt setup --tool={tool}'
  },
  init_all: {
    installing_full: 'Instalacion completa (todas las herramientas + squads) — wizard ignorado via --all'
  },
  install: {
    framework_detected: 'Framework detectado: {framework} ({evidence})',
    framework_not_detected: 'No se detecto framework. Instalando en modo generico.',
    done_at: 'Instalacion completada en: {targetDir}',
    files_copied: 'Archivos copiados: {count}',
    files_skipped: 'Archivos omitidos: {count}',
    dry_run_header: '⚠  DRY RUN — no se escribio ningun archivo. Mostrando lo que haria el install:',
    dry_run_done_at: 'DRY RUN: no se escribio nada en {targetDir}',
    dry_run_files_copied: 'Archivos que se copiarian (would be copied): {count}',
    dry_run_files_skipped: 'Archivos que se omitirian (would be skipped): {count}',
    next_steps: 'Siguientes pasos:',
    step_setup_context:
      '1. Genera/actualiza el contexto del proyecto: aioson setup:context --defaults',
    step_agents: '2. Si no aparece selector visual, ejecuta: aioson agents',
    step_agent_prompt:
      '3. Genera el prompt de setup para tu herramienta: aioson agent:prompt setup --tool={tool}',
    existing_project_detected:
      '⚠ Proyecto existente detectado ({count} archivos). Ejecuta el scanner antes de comenzar:',
    existing_project_scan_hint:
      '  aioson scan:project . --folder=src --with-llm --provider=<provider>   (genera discovery.md + skeleton-system.md; sin --with-llm genera solo mapas locales)',
    using_saved_profile: 'Usando perfil de instalacion guardado en .aioson/install.json.',
    fallback_no_saved_profile: '⚠  Sin perfil guardado y sin asistente interactivo disponible — fallback a install-all (se copiaran todos los archivos del template).',
    reconfigure_needs_tty: '--reconfigure requiere una terminal interactiva (bloqueado por: {reason}). Vuelve a ejecutar en una TTY real sin --no-interactive/--dry-run.',
    opening_wizard: '› Abriendo asistente de instalacion (↑/↓ navega, espacio marca, enter confirma, q/Ctrl+C cancela)...',
    wizard_cancelled_using_saved: '⚠  Asistente cancelado — usando perfil de instalacion guardado.',
    wizard_cancelled_install_all: '⚠  Asistente cancelado y sin perfil guardado — fallback a install-all.'
  },
  install_wizard: {
    ready_to_install: 'Listo para instalar:',
    press_enter_to_install: 'Presiona enter para instalar o q para cancelar.',
    deselected_warning: '⚠  Los elementos deseleccionados NO se eliminaran automaticamente.',
    deselected_hint: '     Eliminalos manualmente si lo necesitas.'
  },
  update: {
    not_installed: 'No se encontro instalacion de AIOSON en {targetDir}.',
    done_at: 'Actualizacion completada en: {targetDir}',
    template_version: 'Version de template aplicada: {version}',
    files_updated: 'Archivos actualizados: {count}',
    backups_created: 'Backups creados: {count}',
    profile_renamed: 'i Perfil `beginner` renombrado a `creator` en project.context.md para describir mejor al usuario. Comportamiento sin cambios. Edita el archivo para cambiar a `developer` si lo prefieres.',
    reconfigure_hint: 'Nuevas opciones pueden estar disponibles. Ejecuta: aioson install --reconfigure'
  },
  info: {
    cli_version: 'AIOSON CLI: v{version}',
    directory: 'Directorio: {targetDir}',
    installed_here: 'Instalado en este directorio: {value}',
    framework_detected: 'Framework detectado: {framework}',
    evidence: 'Evidencia: {evidence}',
    yes: 'si',
    no: 'no',
    none: 'ninguno'
  },
  doctor: {
    ok: 'OK',
    fail: 'FALLO',
    diagnosis_ok: 'Diagnostico: instalacion saludable.',
    diagnosis_fail: 'Diagnostico: {count} problema(s) encontrado(s).',
    hint_prefix: '-> {hint}',
    check_line: '[{icon}] {message}',
    hint_line: '  Sugerencia: {hint}',
    fix_action_line: '- Accion: {action}',
    detail_line: '  Detalle: {text}',
    required_file: 'Archivo requerido: {rel}',
    context_generated: 'Contexto principal generado',
    context_hint: 'Ejecuta @setup para generar .aioson/context/project.context.md',
    context_frontmatter_valid: 'El frontmatter del contexto es valido',
    context_frontmatter_valid_hint:
      'Asegura que project.context.md comience con frontmatter YAML delimitado por ---',
    context_frontmatter_invalid: 'El frontmatter del contexto es invalido ({reason})',
    context_frontmatter_invalid_hint:
      'Reescribe project.context.md usando el formato de salida de @setup.',
    context_required_field: 'Falta campo requerido de contexto: {field}',
    context_required_field_hint:
      'Vuelve a ejecutar @setup y confirma que todos los campos requeridos esten presentes.',
    context_framework_installed_type: '`framework_installed` debe ser booleano (true/false)',
    context_framework_installed_type_hint:
      'Define framework_installed como true o false sin comillas.',
    context_classification_value: '`classification` debe ser uno de {expected}',
    context_classification_value_hint: 'Usa MICRO, SMALL o MEDIUM exactamente.',
    context_project_type_value: '`project_type` debe ser uno de {expected}',
    context_project_type_value_hint: 'Usa web_app, api, site, script, dapp o desktop_app exactamente.',
    context_profile_value: '`profile` debe ser uno de {expected}',
    context_profile_value_hint: 'Usa developer, creator o team exactamente.',
    context_interaction_language_format:
      '`interaction_language` no es una etiqueta BCP-47 valida',
    context_interaction_language_format_hint: 'Usa valores como en, en-US, pt-BR.',
    context_conversation_language_format: '`conversation_language` no es una etiqueta BCP-47 valida',
    context_conversation_language_format_hint: 'Usa valores como en, en-US, pt-BR.',
    node_version: 'Node.js >= 18 (actual: {version})',
    gateway_claude_pointer: 'El gateway de CLAUDE referencia archivos compartidos de AIOSON',
    gateway_claude_pointer_hint:
      'Asegura que CLAUDE.md referencie .aioson/config.md y .aioson/agents/setup.md.',
    gateway_codex_pointer: 'El gateway de Codex referencia archivos compartidos de AIOSON',
    gateway_codex_pointer_hint:
      'Asegura que AGENTS.md referencie .aioson/config.md y .aioson/agents/.',
    gateway_opencode_pointer: 'El gateway de OpenCode referencia archivos compartidos de AIOSON',
    gateway_opencode_pointer_hint:
      'Asegura que OPENCODE.md referencie .aioson/config.md y .aioson/agents/.',
    fix_start: 'Modo de correccion segura habilitado.',
    fix_start_dry_run: 'Modo de correccion segura habilitado (dry-run).',
    fix_action_required_files: 'Restaurar archivos gestionados faltantes desde la plantilla',
    fix_action_gateway_contracts:
      'Restaurar archivos de contrato de gateway rotos desde la plantilla',
    fix_action_locale_sync: 'Sincronizar prompts activos de agentes con el idioma del contexto',
    fix_action_claude_commands: 'Restaurar slashes ausentes en .claude/commands/aioson/agent/* desde la plantilla',
    fix_action_features_dir: 'Crear el directorio .aioson/context/features/',
    fix_action_permissions_in_sync: 'Regenerar archivos nativos de permisos desde autonomy-protocol.json',
    fix_action_bootstrap_coverage: 'Ejecute /discover para poblar los archivos de bootstrap (semantico, no automatico)',
    fix_action_version_drift: 'Actualice el CLI (npm i -g @jaimevalasek/aioson) o ajuste project.context.md aioson_version (manual)',
    fix_not_applicable: 'No aplica para el estado actual.',
    fix_target_count: 'Objetivos identificados: {count}',
    fix_applied_count: 'Cambios aplicados: {count}',
    fix_planned_count: 'Cambios planificados: {count}',
    fix_locale: 'Locale resuelto: {locale}',
    fix_summary: 'Cambios de correccion segura aplicados: {count}',
    fix_summary_dry_run: '[dry-run] Cambios de correccion segura planificados: {count}',
    bootstrap_coverage: 'Cobertura del bootstrap: {present}/{required}',
    bootstrap_coverage_hint: 'Ejecute /discover para refrescar los archivos de bootstrap.',
    bootstrap_coverage_hint_seed: 'Ejecute /discover para sembrar .aioson/context/bootstrap/{what-is,how-it-works,what-it-does,current-state}.md',
    features_dir_present: 'Directorio de features presente (.aioson/context/features/)',
    features_dir_present_hint: 'Cree .aioson/context/features/ para hospedar dossiers por feature (doctor --fix lo crea).',
    auto_handoff_declared: 'Flag de autopilot handoff declarada (auto_handoff en project.context.md)',
    auto_handoff_declared_hint: 'El protocolo autopilot-handoff esta instalado y auto_handoff no esta definido — @product pregunta el modo en pantalla al inicio de cada feature (Autopilot / Paso a paso / Siempre). Defina auto_handoff: true para siempre autopilot y omitir la pregunta, o false para siempre paso a paso.',
    claude_commands_present: 'Slash commands de Claude presentes ({missing} ausentes de {required})',
    claude_commands_present_hint: 'Ausentes: {paths}. Ejecute `aioson doctor . --fix` para restaurarlos.',
    version_drift: 'Version del CLI coincide con project.context.md (contexto: {context}, CLI: {cli})',
    version_drift_hint: 'project.context.md aioson_version ({context}) difiere del CLI ({cli}). Actualice manualmente.',
    permissions_in_sync: 'Permisos nativos sincronizados con autonomy-protocol.json ({drifted} drift, {missing} ausentes)',
    permissions_in_sync_hint: 'Ejecute `aioson doctor . --fix` para regenerar: {paths}.',
    permissions_protocol_missing_hint: 'autonomy-protocol.json no existe — ejecute `aioson update .` para reinstalar.',
    learning_loop: {
      distillation_complete: 'distillation: {promoted} promovidos, {review} para revisión, {merge} candidatos a merge ({duration}ms)',
      distillation_failed_silent: 'distillation falló silenciosamente para feature "{slug}" — fase: {phase}',
      skipped_micro: 'distillation omitida: clasificación de feature MICRO',
      skipped_no_distill: 'distillation omitida: bandera --no-distill activa',
      lock_held: 'distillation omitida: otra instancia en progreso para "{slug}"',
      notify_template: 'distillation: {promoted} promovidos, {review} para revisión, {merge} candidatos a merge'
    },
    living_memory: {
      rule_staleness: 'Rules estancadas: {stale} de {total} sin carga en las últimas {threshold} features cerradas',
      rule_staleness_hint: 'Rules estancadas (primeras 5): {slugs}. Propuesta: {propose}',
      rule_staleness_skipped_micro: 'Verificación de rule_staleness omitida: clasificación del proyecto es MICRO (BR-ALL-11)',
      learning_orphans: 'Learnings huérfanos: {orphans} learnings promovidos a rules nunca cargadas tras la promoción',
      learning_orphans_hint: 'learning_ids huérfanos (primeros 5): {ids}. Use `aioson memory:why --id=<id>` para inspeccionar.',
      learning_orphans_skipped_micro: 'Verificación de learning_orphans omitida: clasificación del proyecto es MICRO (BR-ALL-11)',
      distillation_lag: 'Retraso de distillation: {closed} features cerradas pero solo {distillations} tienen evento auto_distillation (umbral {threshold})',
      distillation_lag_hint: 'Features sin distillation (primeras 5): {missing_slugs}. Verifique el hook de la Phase 5.',
      distillation_lag_skipped_micro: 'Verificación de distillation_lag omitida: clasificación del proyecto es MICRO (BR-ALL-11)'
    },
    jargon_leak_detection: {
      ok: 'Sin fugas de jerga en eventos de agentes user-facing ({events} eventos analizados, profile={profile})',
      fail: 'Fugas de jerga: {count} ocurrencias en {events} eventos de agentes del MVP (profile={profile})',
      hint: 'Eventos afectados (primeros 5): {samples}. Traduce el término vía jargon-map.{en,pt-BR}.yaml o actualiza el diccionario si el término es intencional.',
      skipped_dev: 'Verificación de jargon_leak_detection omitida: profile del proyecto es `{profile}` (jerga permitida en este modo)'
    }
  },
  i18n_add: {
    usage_error: 'Uso: aioson i18n:add <locale> [--force] [--dry-run] [--locale=es]',
    invalid_locale: 'Codigo de locale invalido: {locale}. Formatos esperados como en, fr, pt-br.',
    base_locale: 'El locale "en" es el diccionario base y no puede generarse.',
    locale_exists: 'El archivo de locale ya existe: {path}. Usa --force para sobrescribir.',
    dry_run_created: '[dry-run] Se crearia el scaffold de locale: {locale}',
    dry_run_overwritten: '[dry-run] Se sobrescribiria el scaffold de locale: {locale}',
    created: 'Scaffold de locale creado: {locale}',
    overwritten: 'Scaffold de locale sobrescrito: {locale}',
    file_path: 'Archivo de locale: {path}',
    next_steps: 'Siguientes pasos:',
    step_translate: '1. Reemplaza las cadenas en ingles por texto traducido en ese archivo.',
    step_try: '2. Ejecuta la CLI con --locale={locale} para validar el nuevo diccionario.'
  },
  agents: {
    list_title: 'Agentes disponibles (locale resuelto: {locale}):',
    path: 'Ruta',
    active_path: 'Ruta activa',
    depends: 'Depende de',
    output: 'Salida',
    agent_line: '- Agente: {label} - {command} ({id})',
    path_line: '  Ruta: {path}',
    active_path_line: '  Ruta activa: {path}',
    depends_line: '  Depende de: {value}',
    output_line: '  Salida: {value}',
    none: 'ninguno',
    prompt_usage_error:
      'Uso: aioson agent:prompt <agent> [path] [--tool=codex|claude|opencode] [--lang=en|pt-BR|es|fr] [--locale=es]',
    prompt_unknown_agent: 'Agente desconocido: {agent}',
    prompt_invalid_target_mode:
      'Modo de objetivo de pentester no valido: {mode}. Usa framework_target o app_target.',
    prompt_missing_feature_for_app_target:
      'Pentester app_target requiere --feature=<slug> (o --slug=<slug>).',
    prompt_missing_scope_for_app_target:
      'Pentester app_target requiere --scope=<area>.',
    prompt_title: 'Prompt para el agente "{agent}" en la herramienta "{tool}" (locale: {locale}):',
    help_available: 'Agentes disponibles:',
    help_run_detail: 'Ejecute "aioson agent:help <nombre>" para detalles de un agente específico.',
    help_usage: 'Uso:',
    help_claude_code: '(Claude Code)',
    help_common_options: 'Opciones comunes:',
    help_opt_tool: 'Herramienta destino (codex|claude|opencode)',
    help_opt_language: 'Idioma de interacción (ej: pt-BR, en)',
    help_opt_headless: 'Solo salida del prompt, sin rastreo de runtime',
    help_opt_output: 'Guardar prompt headless en archivo',
    help_opt_json: 'Modo de salida JSON',
    help_agent_options: 'Opciones específicas del agente ({command}):',
    help_requires: 'Requiere:',
    help_produces: 'Produce:',
    help_instruction_file: 'Archivo de instrucción:',
    help_unknown_agent: 'Agente desconocido: {agent}'
  },
  context_validate: {
    missing_file: 'Archivo de contexto no encontrado: {path}',
    hint_setup: 'Ejecuta @setup para generar el archivo primero.',
    invalid_frontmatter: 'El archivo de contexto tiene frontmatter YAML invalido.',
    file_path: 'Archivo de contexto: {path}',
    parse_reason_unknown: 'desconocido',
    parse_reason_missing_frontmatter: 'falta el delimitador inicial del frontmatter',
    parse_reason_unclosed_frontmatter: 'bloque de frontmatter sin cerrar',
    parse_reason_invalid_frontmatter_line: 'sintaxis invalida en linea de frontmatter',
    parse_reason: 'Motivo de parseo: {reason}',
    hint_fix_frontmatter: 'Usa @setup para regenerar un archivo de contexto valido.',
    invalid_fields: 'El archivo de contexto fue parseado pero tiene problemas de validacion:',
    issue_line: '- {issue}',
    valid: 'El archivo de contexto es valido.'
  },
  context_pack: {
    generated: 'Context pack escrito en: {path}',
    no_matches: 'Todavia no se seleccionaron archivos de contexto relevantes. Ejecuta setup/context/scan antes de empaquetar.',
    selected_title: 'Archivos incluidos en el pack:',
    selected_line: '  {index}. {path} — {reason}',
    hint_use: 'Usa {path} como contexto minimo inicial en tu sesion de IA.'
  },
  setup: {
    installing: 'Instalando plantilla AIOSON...',
    installed: 'Plantilla instalada ({count} archivos).',
    no_framework_detected: 'No se detecto ningun framework en este directorio (proyecto nuevo).',
    framework_detected: 'Framework detectado: {framework} (instalado={installed})',
    writing_context: 'Escribiendo contexto del proyecto...',
    done: 'Setup completado.',
    step_agents: '  Siguiente: abre tu cliente de IA y activa @setup para confirmar o ajustar el contexto.',
    step_agent_prompt: '  O ejecuta: aioson agent:prompt setup . --tool={tool}',
    q_project_name: 'Nombre del proyecto',
    q_framework: 'Framework / stack principal (ej: Python, Node, Laravel, Django)',
    q_lang: 'Idioma para respuestas de los agentes (ej: en, pt-BR, es, fr)',
    q_confirm_framework: 'Usar framework detectado? (true/false)',
    q_override_framework: 'Framework',
    q_framework_installed: 'Framework instalado? (true/false)'
  },
  setup_context: {
    detected: 'Framework detectado: {framework} (installed={installed})',
    q_project_name: 'Nombre del proyecto',
    q_project_type: 'Tipo de proyecto (web_app|api|site|script|dapp|desktop_app)',
    q_profile: 'Perfil: [1] developer [2] creator [3] team',
    q_use_detected_framework: 'Usar framework detectado? (true/false)',
    q_framework: 'Framework',
    q_framework_installed: 'Framework instalado? (true/false)',
    q_language: 'Idioma de conversacion (por ejemplo en o pt-BR)',
    q_backend_menu:
      'Backend: [1] Laravel [2] Rails [3] Django [4] Node/Express [5] Next.js [6] Nuxt [7] Hardhat [8] Foundry [9] Truffle [10] Anchor [11] Solana Web3 [12] Cardano [13] Other',
    q_backend_text: 'Backend (texto libre)',
    q_laravel_version: 'Version de Laravel (por ejemplo 11, 10)',
    q_frontend_menu:
      'Frontend: [1] TALL Stack [2] VILT Stack [3] Blade [4] Next.js [5] Nuxt [6] React [7] Vue [8] Other',
    q_frontend_text: 'Frontend (texto libre)',
    q_auth_menu:
      'Auth (Laravel): [1] Breeze [2] Jetstream + Livewire [3] Filament Shield [4] Custom',
    q_web3_enabled: 'Web3 habilitado? (true/false)',
    q_web3_networks: 'Redes Web3 (por ejemplo ethereum, solana, cardano)',
    q_contract_framework: 'Framework de contratos (por ejemplo Hardhat, Foundry, Anchor, Aiken)',
    q_wallet_provider: 'Proveedor de wallet (por ejemplo wagmi, RainbowKit, Phantom, Lace)',
    q_indexer: 'Indexer (por ejemplo The Graph, Helius, Blockfrost)',
    q_rpc_provider: 'Proveedor RPC (por ejemplo Alchemy, Infura, QuickNode)',
    q_jetstream_teams: 'Jetstream teams habilitado? (true/false)',
    q_jetstream_existing_action:
      'Proyecto Laravel existente sin Jetstream detectado. Accion: [1] continuar sin Jetstream [2] recrear con Jetstream (recomendado) [3] instalacion manual (riesgo)',
    q_auth_text: 'Enfoque de autenticacion (texto libre)',
    q_uiux_menu: 'UI/UX: [1] Tailwind [2] Flux UI [3] shadcn/ui [4] Filament',
    q_uiux_text: 'Enfoque de UI/UX (texto libre)',
    q_database_menu:
      'Base de datos: [1] MySQL [2] PostgreSQL [3] SQLite [4] MongoDB [5] Supabase [6] PlanetScale',
    q_database_text: 'Base de datos (texto libre)',
    q_services_list:
      'Servicios adicionales (lista separada por comas): queues, storage, websockets, payments, email, cache, search',
    q_rails_options:
      'Opciones usadas en Rails (lista separada por comas, ej. --database=postgresql,--css=tailwind,--api)',
    q_next_options:
      'Opciones de create-next-app (lista separada por comas, ej. TypeScript,ESLint,Tailwind CSS,App Router,src/ directory)',
    q_beginner_summary: 'Describe tu proyecto en una frase',
    q_beginner_users:
      'Usuarios esperados: [1] personal/pequeno hasta 10 [2] equipo pequeno hasta 100 [3] clientes externos',
    q_beginner_mobile: 'Requisito movil: [1] app movil [2] web responsiva [3] solo desktop',
    q_beginner_hosting: 'Preferencia de hosting: [1] gestionado simple [2] VPS [3] cloud provider',
    q_beginner_accept_recommendation: 'Aceptar recomendacion inicial? (true/false)',
    beginner_recommendation:
      'Recomendacion inicial -> framework: {framework}, frontend: {frontend}, database: {database}, auth: {auth}',
    q_user_types: 'Cuantos tipos de usuario?',
    q_integrations: 'Cuantas integraciones externas?',
    q_rules_complexity: 'Complejidad de reglas (none|some|complex)',
    note_status_enabled: 'habilitado',
    note_status_disabled: 'deshabilitado',
    note_jetstream_teams: 'Jetstream teams: {status}',
    note_selected_services: 'Servicios seleccionados: {services}',
    note_rails_setup_flags: 'Flags de setup de Rails: {flags}',
    note_next_setup_flags: 'Flags de setup de Next.js: {flags}',
    note_next_create_flags: 'Flags de create-next-app: {flags}',
    note_jetstream_existing_action: 'Accion para proyecto existente con Jetstream: {action}',
    note_mobile_first:
      'Se detecto requisito mobile-first; considera React Native/Expo como siguiente paso.',
    note_vps_preference:
      'Se detecto preferencia por VPS; mantén scripts de despliegue simples y reproducibles.',
    note_cloud_profile:
      'Se detecto perfil cloud; usa base de datos gestionada y object storage desde el inicio.',
    note_web3_terms: 'Se detectaron terminos Web3; recomendacion inicial de dApp aplicada.',
    note_starter_profile:
      'Esta recomendacion es un perfil inicial; ajusta cuando los requisitos sean mas claros.',
    note_team_profile:
      'Perfil de equipo seleccionado; conserva convenciones explicitas del equipo y reglas de CI.',
    note_beginner_declined:
      'Recomendacion inicial rechazada; usando stack personalizado del onboarding.',
    note_monorepo:
      'Monorepo detectado: framework Web3 y framework de aplicacion coexisten. Confirmar el framework principal con el usuario y documentar la estructura en Notes.',
    written: 'Archivo de contexto escrito: {path}',
    classification_result: 'Clasificacion: {classification} (score={score}/6)',
    locale_applied: 'Idioma de interaccion sincronizado: {locale} ({count} prompts de agente restaurados)'
  },
  locale_apply: {
    applied: 'Idioma de interaccion sincronizado: {locale}',
    dry_run_applied: '[dry-run] Se sincronizaria el idioma de interaccion: {locale}',
    copied_count: 'Archivos copiados: {count}',
    missing_count: 'Archivos de locale faltantes: {count}',
    copy_line: '  Archivo: {source} -> {target}'
  },
  smoke: {
    start: 'Ejecutando smoke test en: {projectDir}',
    using_web3_profile: 'Usando perfil Web3 de smoke: {target}',
    using_mixed_profile: 'Usando perfil mixto monorepo Web2+Web3 para smoke.',
    using_parallel_profile: 'Usando perfil de smoke de orquestacion paralela.',
    seeded_web3_workspace: 'Workspace inicializado para objetivo Web3: {target}',
    seeded_mixed_workspace: 'Workspace inicializado para perfil mixto Web2+Web3.',
    seeded_parallel_context: 'Contexto discovery/architecture/prd inicializado para perfil paralelo.',
    step_ok: 'OK: {step}',
    web3_detected: 'Framework Web3 detectado: {framework} ({network})',
    web3_context_verified: 'Contexto Web3 verificado para red: {network}',
    mixed_context_verified: 'Contexto de perfil mixto verificado (framework: {framework}).',
    parallel_status_verified: 'Estado paralelo verificado para lanes: {count}',
    invalid_web3_target: 'Objetivo --web3 invalido: {target}. Usa ethereum, solana o cardano.',
    invalid_profile: 'Valor invalido para --profile: {profile}. Usa standard, mixed o parallel.',
    profile_conflict: 'No combines --profile=mixed con --web3. Elige un solo modo de perfil.',
    assert_install_files: 'install copio cero archivos',
    assert_web3_framework: 'deteccion inesperada de framework web3: {framework}',
    assert_setup_written: 'setup:context no escribio el archivo de contexto',
    assert_setup_project_type_dapp: 'setup no infirio project_type=dapp',
    assert_setup_web3_network: 'setup no infirio la red web3 esperada',
    assert_setup_web3_framework: 'setup no mantuvo el framework web3 esperado',
    assert_mixed_project_type_dapp: 'el perfil mixed no infirio project_type=dapp',
    assert_mixed_web3_enabled: 'el perfil mixed no infirio web3_enabled=true',
    assert_mixed_framework: 'el perfil mixed no priorizo el framework web3 esperado',
    assert_locale_apply_files: 'locale:apply copio cero archivos',
    assert_agents_count: 'el comando agents devolvio una cantidad inesperada',
    assert_prompt_path: 'agent:prompt no incluyo la ruta esperada',
    assert_context_validate: 'context:validate fallo',
    assert_web3_context_valid: 'fallo al parsear el contexto web3',
    assert_web3_context_project_type: 'project_type del contexto no es dapp',
    assert_web3_context_enabled: 'web3_enabled del contexto no es true',
    assert_web3_context_network: 'web3_networks del contexto no incluye el objetivo esperado',
    assert_doctor_ok: 'la verificacion doctor fallo',
    assert_parallel_init_ok: 'parallel:init fallo',
    assert_parallel_init_workers: 'los workers de parallel:init no coinciden',
    assert_parallel_assign_ok: 'parallel:assign fallo',
    assert_parallel_assign_scope: 'parallel:assign no produjo alcance',
    assert_parallel_status_ok: 'parallel:status fallo',
    assert_parallel_status_lanes: 'la cantidad de lanes en parallel:status no coincide',
    assert_parallel_doctor_ok: 'parallel:doctor fallo',
    assert_parallel_doctor_summary: 'parallel:doctor reporto fallos',
    completed: 'Smoke test completado con exito.',
    steps_count: 'Pasos validados: {count}',
    workspace_kept: 'Workspace conservado: {path}',
    workspace_removed: 'Workspace eliminado: {path}'
  },
  package_test: {
    start: 'Ejecutando prueba de paquete desde origen: {sourceDir}',
    pack_done: 'Tarball de paquete creado: {tarball}',
    completed: 'Prueba de paquete completada con {count} pasos validados.',
    workspace: 'Workspace de prueba de paquete: {path}',
    error_unknown_detail: 'error desconocido',
    error_npm_pack: 'npm pack fallo: {detail}',
    error_tarball_missing: 'npm pack no devolvio el nombre del tarball',
    error_npx_init: 'npx init fallo: {detail}',
    error_npx_setup_context: 'npx setup:context fallo: {detail}',
    error_npx_doctor: 'npx doctor fallo: {detail}',
    error_doctor_not_ok: 'doctor devolvio ok=false durante la prueba de paquete',
    error_npx_mcp_init: 'npx mcp:init fallo: {detail}',
    error_mcp_not_ok: 'mcp:init devolvio ok=false durante la prueba de paquete'
  },
  workflow_plan: {
    context_missing:
      'Archivo de contexto no encontrado. Usando workflow de respaldo segun la clasificacion indicada/predeterminada.',
    title: 'Workflow recomendado para clasificacion {classification}:',
    notes: 'Notas:',
    command_line: '  Comando: {command}',
    note_line: '  Nota: {note}',
    note_framework_not_installed:
      'El framework aun no esta instalado; completa la instalacion del stack antes de @dev.',
    note_dapp_context:
      'Contexto dApp detectado; incluye skills Web3 durante @architect y @dev.',
    note_micro_scope:
      'Mantén el alcance de implementacion minimo y evita agentes opcionales.',
    note_product_optional:
      '@product es opcional para MICRO — omitelo y ve directo a @dev si la idea ya esta clara.',
    note_feature_flow:
      'Flujo para nueva feature (tras la configuracion inicial): @product → @analyst → @scope-check → @dev → @qa. Sin @setup.'
  },
  parallel_init: {
    context_missing:
      'Archivo de contexto no encontrado: {path}. Ejecuta setup:context primero.',
    context_invalid: 'Archivo de contexto invalido o no parseable: {path}.',
    classification_unknown: 'desconocida',
    requires_medium:
      'La inicializacion paralela solo esta soportada para clasificacion MEDIUM (actual: {classification}). Usa --force para forzar.',
    invalid_workers:
      'Valor invalido para --workers. Usa un entero entre {min} y {max}.',
    already_exists:
      'Los archivos de contexto paralelo ya existen ({count}). Usa --force para sobrescribir.',
    prepared: 'Workspace paralelo inicializado en: {path}',
    dry_run_prepared: '[dry-run] El workspace paralelo se inicializaria en: {path}',
    workers_count: 'Workers: {count}',
    files_count: 'Archivos preparados: {count}',
    missing_prereq_count: 'Archivos de contexto prerequisito faltantes: {count}',
    file_line: '  Archivo: {file}'
  },
  parallel_doctor: {
    prefix_ok: 'OK',
    prefix_warn: 'AVISO',
    prefix_fail: 'FALLO',
    check_line: '[{prefix}] {id} - {message}',
    hint_line: '  Sugerencia: {hint}',
    invalid_workers:
      'Valor invalido para --workers. Usa un entero entre {min} y {max}.',
    classification_unknown: 'desconocida',
    requires_medium:
      'El modo fix de parallel doctor requiere clasificacion MEDIUM (actual: {classification}). Usa --force para forzar.',
    report_title: 'Reporte de parallel doctor: {path}',
    summary: 'Resumen: {passed} correctos, {failed} fallos, {warnings} advertencias.',
    fix_summary: 'Cambios de correccion paralela aplicados: {count}',
    fix_summary_dry_run: '[dry-run] Cambios de correccion paralela planificados: {count}',
    check_context_exists_ok: 'project.context.md existe.',
    check_context_exists_missing: 'project.context.md falta.',
    check_context_exists_hint: 'Ejecuta setup:context antes de parallel doctor.',
    check_context_parsed_ok: 'project.context.md es parseable.',
    check_context_parsed_invalid: 'project.context.md es invalido.',
    check_context_parsed_hint:
      'Corrige el frontmatter del contexto antes de ejecutar parallel doctor.',
    check_context_classification_ok:
      'Modo paralelo permitido para clasificacion {classification}.',
    check_context_classification_invalid:
      'Modo paralelo requiere clasificacion MEDIUM (actual: {classification}).',
    check_context_classification_hint:
      'Usa --force para sobrescribir la regla de clasificacion.',
    check_parallel_dir_ok: 'El directorio .aioson/context/parallel existe.',
    check_parallel_dir_missing: 'El directorio .aioson/context/parallel falta.',
    check_parallel_dir_hint: 'Ejecuta parallel:init o parallel:doctor --fix.',
    check_parallel_shared_ok: 'shared-decisions.md esta presente.',
    check_parallel_shared_missing: 'shared-decisions.md falta.',
    check_parallel_shared_hint:
      'Ejecuta parallel:doctor --fix para restaurar los archivos base.',
    check_parallel_manifest_ok: 'workspace.manifest.json esta presente.',
    check_parallel_manifest_missing: 'workspace.manifest.json falta.',
    check_parallel_manifest_hint:
      'Ejecuta parallel:doctor --fix para restaurar el manifest del workspace.',
    check_parallel_ownership_ok: 'ownership-map.json esta presente.',
    check_parallel_ownership_missing: 'ownership-map.json falta.',
    check_parallel_ownership_hint:
      'Ejecuta parallel:doctor --fix para restaurar el mapa de ownership.',
    check_parallel_merge_ok: 'merge-plan.json esta presente.',
    check_parallel_merge_missing: 'merge-plan.json falta.',
    check_parallel_merge_hint:
      'Ejecuta parallel:doctor --fix para restaurar el plan de merge.',
    check_machine_sync_ok:
      'Los artefactos paralelos machine-readable estan sincronizados con los archivos de lane.',
    check_machine_sync_stale:
      'Los artefactos paralelos machine-readable estan stale: {files}.',
    check_machine_sync_hint:
      'Ejecuta parallel:doctor --fix para reconstruir los artefactos stale.',
    check_ownership_conflicts_ok:
      'No se detectaron conflictos de ownership entre los alcances de las lanes.',
    check_ownership_conflicts_found:
      'Se detectaron {count} conflicto(s) de ownership entre los alcances de las lanes.',
    check_ownership_conflicts_hint:
      'Ajusta el ownership para que cada scope key pertenezca a una sola lane.',
    check_write_scope_present_ok:
      'Todas las lanes con alcance asignado tambien declaran write_paths.',
    check_write_scope_present_missing:
      'Hay {count} lane(s) con alcance asignado que todavia no declaran write_paths.',
    check_write_scope_present_hint:
      'Declara rutas relativas al proyecto o prefijos recursivos (por ejemplo src/auth/**) en el bloque Ownership de cada lane.',
    check_write_scope_valid_ok:
      'Todos los write_paths declarados usan patrones soportados.',
    check_write_scope_valid_invalid:
      'Se detectaron {count} patron(es) invalido(s) de write_paths.',
    check_write_scope_valid_hint:
      'Usa rutas relativas exactas al proyecto o patrones recursivos terminados en /**.',
    check_write_scope_conflicts_ok:
      'No se detectaron superposiciones de write_paths entre lanes.',
    check_write_scope_conflicts_found:
      'Se detectaron {count} superposicion(es) de write_paths entre lanes.',
    check_write_scope_conflicts_hint:
      'Divide el ownership para que cada patron de ruta pertenezca a una sola lane.',
    check_dependencies_valid_ok:
      'Todas las dependencias declaradas entre lanes apuntan a lanes validas.',
    check_dependencies_valid_invalid:
      'Se detectaron {count} referencia(s) invalida(s) de dependencia entre lanes.',
    check_dependencies_valid_hint:
      'Usa referencias lane-N solo para lanes existentes o mueve la coordinacion compartida a shared-decisions.',
    check_dependencies_blocked_ok:
      'Ninguna lane esta bloqueada actualmente por una dependencia incompleta.',
    check_dependencies_blocked_found:
      'Se detectaron {count} bloqueo(s) por dependencia entre lanes segun el estado actual.',
    check_dependencies_blocked_hint:
      'Completa las lanes upstream o devuelve la lane dependiente a pending antes de ejecutar.',
    check_merge_order_ok:
      'El orden de merge respeta las dependencias declaradas entre lanes.',
    check_merge_order_invalid:
      'Se detectaron {count} violacion(es) de orden de merge contra dependencias declaradas.',
    check_merge_order_hint:
      'Ajusta merge ranks o dependencias para que las lanes upstream se fusionen primero.',
    check_lanes_present_ok: 'Se detectaron {count} archivo(s) de lane.',
    check_lanes_present_missing: 'No se encontraron archivos de estado de lane.',
    check_lanes_present_hint: 'Ejecuta parallel:init o parallel:doctor --fix.',
    check_lanes_sequence_ok: 'La secuencia de lanes es continua (1..{workers}).',
    check_lanes_sequence_missing: 'Faltan archivos de lane en la secuencia: {lanes}',
    check_lanes_sequence_hint:
      'Ejecuta parallel:doctor --fix para restaurar las lanes faltantes.',
    check_workers_option: 'Opcion de workers solicitada: {workers}.',
    check_prereq_ok: 'Todos los archivos de contexto prerequisito estan presentes.',
    check_prereq_missing: 'Faltan {count} archivo(s) de contexto prerequisito.',
    check_prereq_hint: 'Crea los archivos discovery/architecture/prd antes de orquestar.'
  },
  parallel_assign: {
    invalid_workers:
      'Valor invalido para --workers. Usa un entero entre {min} y {max}.',
    context_missing: 'Archivo de contexto no encontrado: {path}.',
    context_invalid: 'Archivo de contexto invalido o no parseable: {path}.',
    classification_unknown: 'desconocida',
    requires_medium:
      'La asignacion paralela requiere clasificacion MEDIUM (actual: {classification}). Usa --force para forzar.',
    parallel_missing:
      'Directorio paralelo no encontrado: {path}. Ejecuta parallel:init primero.',
    no_lanes: 'No se encontraron archivos de lanes en .aioson/context/parallel.',
    missing_lanes: 'Faltan archivos de lanes para los workers solicitados: {lanes}.',
    source_missing: 'No se pudo resolver el documento fuente con --source={source}.',
    applied: 'Asignacion de alcance paralelo aplicada ({count} item(s) de alcance).',
    dry_run_applied:
      '[dry-run] Asignacion de alcance paralelo planificada ({count} item(s) de alcance).',
    source_info: 'Documento fuente: {source}',
    workers_count: 'Workers: {count}',
    files_count: 'Archivos actualizados: {count}',
    lane_scope_line: '- lane {lane}: {count} item(s) de alcance'
  },
  parallel_status: {
    parallel_missing:
      'Directorio paralelo no encontrado: {path}. Ejecuta parallel:init primero.',
    no_lanes: 'No se encontraron archivos de lanes en .aioson/context/parallel.',
    title: 'Reporte de estado paralelo: {path}',
    lanes_count: 'Lanes: {count}',
    statuses_title: 'Estados:',
    status_line: '- {status}: {count}',
    status_pending: 'pendiente',
    status_in_progress: 'en_progreso',
    status_completed: 'completado',
    status_merged: 'fusionado',
    status_blocked: 'bloqueado',
    status_other: 'otro',
    scopes_count: 'Total de items de alcance: {count}',
    deliverables_progress: 'Entregables: {completed}/{total} completados',
    blockers_count: 'Bloqueos abiertos: {count}',
    shared_decisions: 'Entradas del log de decisiones compartidas: {count}',
    ownership_conflicts: 'Conflictos de ownership: {count}',
    write_scope_summary:
      'Write scope: lanes_con_paths={lanes}, rutas={paths}, lanes_con_alcance_sin_path={uncovered}, conflictos={conflicts}, invalidos={invalid}',
    dependencies_summary:
      'Dependencias: declaradas={declared}, invalidas={invalid}, bloqueadas={blocked}, violaciones_de_orden={orderViolations}',
    sync_summary: 'Drift de archivos machine-readable: {count}',
    sync_stale_line: '- stale: {file}',
    lane_line: '- lane {lane}: status={status}, alcance={scope}, bloqueos={blockers}'
  },
  parallel_merge: {
    parallel_missing:
      'Directorio paralelo no encontrado: {path}. Ejecuta parallel:init primero.',
    no_lanes: 'No se encontraron archivos de lanes en .aioson/context/parallel.',
    ready: 'El merge determinista esta listo para {count} lane(s).',
    applied: 'El merge determinista se aplico en {count} lane(s).',
    blocked: 'El merge determinista esta bloqueado para {count} lane(s).',
    order: 'Orden de merge: {order}',
    structural_summary:
      'Chequeos estructurales: stale={stale}, conflictos_de_ownership={conflicts}, conflictos_de_write_scope={writeConflicts}, write_paths_invalidos={invalidWritePaths}, dependencias_invalidas={invalid}, dependencias_bloqueadas={blocked}, violaciones_de_orden={orderViolations}',
    lane_line: '- lane {lane}: accion={action}, status={status}'
  },
  parallel_guard: {
    invalid_lane: 'Valor invalido para --lane. Usa un entero positivo.',
    paths_required:
      'Falta el valor de --paths. Informa una o mas rutas relativas al proyecto separadas por comas.',
    parallel_missing:
      'Directorio paralelo no encontrado: {path}. Ejecuta parallel:init primero.',
    no_lanes: 'No se encontraron archivos de lanes en .aioson/context/parallel.',
    lane_missing: 'La lane {lane} no existe en el workspace paralelo actual.',
    allowed: 'El guard de escritura permitio a la lane {lane} escribir {count} ruta(s).',
    blocked: 'El guard de escritura bloqueo a la lane {lane} para {count} ruta(s).',
    write_scope_summary: 'Resumen de write scope: rutas={paths}, conflictos={conflicts}, invalidos={invalid}',
    path_line: '- path {path}: status={status}, owners={owners}'
  },
  mcp_init: {
    context_missing:
      'Archivo de contexto no encontrado. Generando plan MCP base con supuestos genericos.',
    invalid_tool: 'Valor invalido para --tool: {tool}. Usa uno de: {expected}.',
    reason_filesystem: 'Acceso local obligatorio al workspace.',
    reason_context7:
      'Usa documentacion oficial actualizada en el momento de la implementacion.',
    reason_database_none: 'Aun no se detecto una stack de base de datos.',
    reason_database_enabled:
      'El contexto indica capacidades con base de datos (se recomienda endpoint MCP remoto).',
    reason_web_search:
      'Util para evaluar paquetes y verificar notas de lanzamiento.',
    reason_chain_rpc_disabled: 'Web3 esta deshabilitado para este proyecto.',
    reason_chain_rpc_enabled: 'Se detecto contexto dApp; se requiere acceso RPC de chain.',
    note_workspace_local: 'Este es un preset local de workspace generado por AIOSON.',
    note_replace_placeholders:
      'Reemplaza comandos placeholder por los servidores MCP que realmente usas.',
    note_keep_secrets_env:
      'Mantén secretos en variables de entorno, nunca inline tokens.',
    generated: 'Plan MCP escrito: {path}',
    dry_run_generated: '[dry-run] Se escribiria el plan MCP: {path}',
    server_count: 'Servidores MCP en el plan: {count}',
    preset_count: 'Presets de herramientas generados: {count}',
    preset_written: 'Preset escrito ({tool}): {path}',
    preset_dry_run: '[dry-run] Se escribiria el preset ({tool}): {path}'
  },
  mcp_doctor: {
    prefix_ok: 'OK',
    prefix_warn: 'AVISO',
    prefix_fail: 'FALLO',
    check_line: '[{prefix}] {id} - {message}',
    hint_line: '  Sugerencia: {hint}',
    context_missing: 'project.context.md no fue encontrado.',
    context_missing_hint: 'Ejecuta setup primero para validacion MCP basada en contexto.',
    context_parse_invalid: 'project.context.md no pudo parsearse ({reason}).',
    context_parse_invalid_hint:
      'Corrige el formato del contexto para habilitar validacion MCP por stack.',
    context_ok: 'project.context.md esta disponible y parseable.',
    plan_missing: 'No se encontro el archivo de plan MCP (.aioson/mcp/servers.local.json).',
    plan_missing_hint: 'Ejecuta: aioson mcp:init',
    plan_invalid: 'JSON del plan MCP invalido: {error}',
    plan_invalid_hint: 'Regenera el plan con: aioson mcp:init',
    plan_ok: 'El archivo de plan MCP esta presente y con JSON valido.',
    plan_servers_ok: 'El plan MCP declara {count} definicion(es) de servidor.',
    plan_servers_missing: 'El plan MCP no tiene definiciones de servidor.',
    plan_servers_hint: 'Regenera con: aioson mcp:init',
    core_enabled: 'El servidor MCP core "{server}" esta habilitado.',
    core_missing: 'El servidor MCP core "{server}" falta o esta deshabilitado.',
    core_missing_hint: 'Regenera y manten habilitados los servidores core base.',
    presets_any_ok: 'Se encontraron {count} archivo(s) de preset MCP.',
    presets_any_missing: 'No se encontraron archivos de preset MCP.',
    presets_any_hint: 'Ejecuta: aioson mcp:init',
    presets_coverage_partial:
      'Solo {existing}/{total} presets de herramientas estan presentes.',
    presets_coverage_partial_hint:
      'Ejecuta: aioson mcp:init (sin --tool) para generar todos los presets.',
    presets_coverage_full:
      'Todos los presets de herramientas estan presentes (claude, codex, opencode).',
    env_none_required:
      'No hay variables de entorno obligatorias en servidores MCP habilitados.',
    env_missing: 'Faltan {missing}/{total} variable(s) de entorno obligatoria(s): {vars}',
    env_missing_hint_strict: 'Define las variables faltantes antes de la ejecucion.',
    env_missing_hint_relaxed:
      'Define variables para disponibilidad completa en runtime. Usa --strict-env para fallar en esta verificacion.',
    env_all_present: 'Todas las variables obligatorias estan disponibles ({count}).',
    compat_database_ok: 'Database MCP coincide con el engine del contexto ({engine}).',
    compat_database_mismatch:
      'Database MCP no coincide completamente con el stack del contexto ({engine}).',
    compat_database_hint:
      'Regenera con: aioson mcp:init, o ajusta manualmente el servidor database.',
    compat_web3_ok: 'chain-rpc MCP esta habilitado para contexto Web3.',
    compat_web3_missing: 'Se detecto contexto Web3, pero chain-rpc MCP falta o esta deshabilitado.',
    compat_web3_missing_hint: 'Regenera con: aioson mcp:init',
    compat_web3_unneeded: 'chain-rpc MCP esta habilitado, pero el contexto no es Web3.',
    compat_web3_unneeded_hint: 'Deshabilita chain-rpc si no es necesario.',
    report_title: 'Reporte MCP doctor: {path}',
    summary: 'Resumen: {passed} correctos, {failed} fallos, {warnings} advertencias.'
  },
  qa_doctor: {
    prefix_ok: 'OK',
    prefix_warn: 'AVISO',
    prefix_fail: 'FALLO',
    check_line: '[{prefix}] {id} - {message}',
    hint_line: '  Sugerencia: {hint}',
    report_title: 'Reporte QA doctor: {path}',
    summary: 'Resumen: {passed} correctos, {failed} fallos, {warnings} advertencias.',
    playwright_ok: 'Playwright esta instalado.',
    playwright_missing: 'Paquete Playwright no encontrado.',
    playwright_missing_hint: 'Ejecuta: npm install -g playwright && npx playwright install chromium',
    chromium_ok: 'Binario de Chromium encontrado.',
    chromium_missing: 'Binario de Chromium no encontrado.',
    chromium_missing_hint: 'Ejecuta: npx playwright install chromium',
    config_ok: 'aios-qa.config.json encontrado y valido.',
    config_missing: 'aios-qa.config.json no encontrado.',
    config_missing_hint: 'Ejecuta: aioson qa:init --url=<url-de-tu-app>',
    config_invalid: 'aios-qa.config.json no es JSON valido: {error}',
    url_ok: 'URL de destino accesible ({url}).',
    url_missing: 'Ninguna URL configurada en aios-qa.config.json.',
    url_missing_hint: 'Ejecuta: aioson qa:init --url=<url-de-tu-app>',
    url_unreachable: 'URL de destino no accesible ({url}): {error}',
    url_unreachable_hint: 'Inicia tu aplicacion antes de ejecutar qa:run o qa:scan.',
    context_ok: 'project.context.md encontrado — las pruebas se enriqueceran con contexto del proyecto.',
    context_missing: 'project.context.md no encontrado — ejecutando en modo generico.',
    prd_ok: 'prd.md encontrado — {count} criterios de aceptacion mapeados como escenarios de prueba.',
    prd_missing: 'prd.md no encontrado — se omitira el mapeo de cobertura AC.'
  },
  qa_init: {
    context_found: 'Contexto encontrado: proyecto={name}, url={url}',
    prd_found: 'prd.md encontrado — {count} criterios de aceptacion extraidos como escenarios.',
    prd_missing: 'prd.md no encontrado — no se generaron escenarios AC.',
    generated: 'Configuracion QA escrita: {path}',
    dry_run_generated: '[dry-run] La configuracion QA se escribiria en: {path}',
    scenarios_count: 'Escenarios de prueba del prd.md: {count}',
    personas_count: 'Personas habilitadas: {count} (naive, hacker, power, mobile)',
    probes_count: 'Sondas de seguridad habilitadas: {count}',
    next_steps: 'Proximos pasos:',
    step_doctor: '1. Verificar prerequisitos: aioson qa:doctor',
    step_run: '2. Ejecutar pruebas en el navegador: aioson qa:run'
  },
  qa_run: {
    playwright_missing: 'Playwright no esta instalado. Ejecuta: npm install -g playwright && npx playwright install chromium',
    config_missing: 'aios-qa.config.json no encontrado. Ejecuta: aioson qa:init --url=<url-de-tu-app>',
    url_missing: 'Ninguna URL configurada. Agrega url a aios-qa.config.json o usa --url=<app-url>.',
    starting: 'Iniciando sesion QA en el navegador: {url}',
    persona_start: 'Ejecutando persona: {persona}',
    persona_done: 'Persona "{persona}" completada — {count} hallazgo(s)',
    accessibility: 'Ejecutando auditoria de accesibilidad...',
    performance: 'Capturando metricas de rendimiento...',
    ac_scenarios: 'Documentando cobertura de AC...',
    done: 'Sesion QA completada.',
    report_written: 'Reporte escrito: {path}',
    json_written: 'Reporte JSON escrito: {path}',
    screenshots_dir: 'Capturas guardadas en: {path}',
    findings_summary: 'Hallazgos: {critical} criticos, {high} altos, {medium} medios, {low} bajos',
    html_report_written: 'Reporte HTML escrito: {path}'
  },
  qa_scan: {
    playwright_missing: 'Playwright no esta instalado. Ejecuta: npm install -g playwright && npx playwright install chromium',
    config_missing: 'aios-qa.config.json no encontrado. Ejecuta: aioson qa:init --url=<url-de-tu-app>',
    url_missing: 'Ninguna URL configurada. Agrega url a aios-qa.config.json o usa --url=<app-url>.',
    starting: 'Iniciando escaneo autonomo: {url}',
    crawling: 'Rastreando rutas (profundidad max {depth}, max {pages} paginas)...',
    routes_found: 'Rutas descubiertas: {count}',
    scanning_route: 'Escaneando: {route}',
    done: 'Escaneo autonomo completado.',
    report_written: 'Reporte escrito: {path}',
    findings_summary: 'Hallazgos: {critical} criticos, {high} altos, {medium} medios, {low} bajos',
    html_report_written: 'Reporte HTML escrito: {path}'
  },
  qa_report: {
    not_found: 'No se encontro reporte QA. Ejecuta: aioson qa:run o aioson qa:scan',
    html_report_written: 'Reporte HTML escrito: {path}'
  },
  web_map: {
    url_missing: 'Falta la opcion obligatoria: --url=<url>.',
    starting: 'Mapeando sitio: {url}',
    pages_found: 'Paginas descubiertas: {count}',
    page_line: '- {url} | profundidad={depth} | estado={status} | links={links}',
    done: 'Mapa web completado.',
    failed: 'Fallo en mapa web: {error}'
  },
  web_scrape: {
    url_missing: 'Falta la opcion obligatoria: --url=<url>.',
    invalid_format: 'Valor invalido para --format: {format}. Usa markdown, text, html o links.',
    fetching: 'Obteniendo pagina: {url}',
    title_line: 'Titulo: {title}',
    status_line: 'Estado: {status} | Content-Type: {type}',
    done: 'Web scrape completado ({format}).',
    failed: 'Fallo en web scrape: {error}'
  },
  config: {
    usage_error:
      'Uso: aioson config <set KEY=value|show|get KEY> [--json] [--locale=es]',
    set_ok: 'Clave configurada: {key} (guardada en {path})',
    show_header: 'Config global: {path}',
    show_empty: '  (ninguna clave configurada)',
    show_line: '  {key} = {value}',
    get_line: '{key} = {value}',
    key_not_found: 'Clave no encontrada: {key}'
  },
  squad_status: {
    no_squad: 'No se encontro ningun squad.',
    hint: 'Usa @squad en tu sesion de IA para armar un squad.',
    squads_found: '{count} squad(s) encontrados:',
    most_recent: '(mas reciente)',
    squad_item: '  [{file}]{marker}',
    name: '    Squad       : {value}',
    mode: '    Modo        : {value}',
    goal: '    Objetivo    : {value}',
    agents: '    Agentes     : {specialists} especialistas / {total} total ({path})',
    sessions: '    Sesiones    : {count} ({path})',
    latest_html: '    Latest HTML : {value}',
    logs: '    Logs        : {count} ({path})',
    genomes: '    Genomes     : {count} en el squad / {agent_count} vinculos por agente'
  },
  scan_project: {
    scanning: 'aioson scan:project — escaneando {dir}',
    folder_required:
      'Usa --folder=<ruta[,ruta2]> para generar mapas completos de carpetas especificas. Ejemplo: --folder=src o --folder=app.',
    folder_required_examples_title: '\x1b[33mGuia rapido:\x1b[0m',
    folder_required_example_local:
      '  Mapas locales   : aioson scan:project . --folder=src',
    folder_required_example_multi:
      '  Varias carpetas : aioson scan:project . --folder=src,app',
    folder_required_example_llm:
      '  API automatica  : aioson scan:project . --folder=src --with-llm --provider=openai',
    folder_required_example_cli:
      '  Sin API LLM     : aioson scan:project . --folder=src  -> luego ejecuta @analyst en Codex/Claude',
    folder_required_example_prompt:
      '  Prompt listo    : aioson agent:prompt analyst --tool=codex',
    folder_required_example_next:
      '  Flujo tras escaneo completo: @analyst -> @scope-check -> @architect -> @dev',
    folder_not_found: 'La carpeta "{folder}" no existe en este proyecto. Directorios de nivel superior detectados: {available}',
    config_missing: '{file} no encontrado. Para usar el modo con LLM, copia aioson-models.json y completa tus claves de API.',
    config_invalid: 'JSON invalido en aioson-models.json: {error}',
    provider_missing: 'Provider de LLM "{provider}" no encontrado en aioson-models.json. Disponibles: {available}',
    provider_info: '  Provider : {provider}',
    model_info: '  Modelo   : {model}',
    context_found: '  Contexto : project.context.md encontrado',
    context_missing: '  Contexto : project.context.md no encontrado (ejecuta aioson setup:context primero)',
    spec_found: '  Spec     : spec.md encontrado — memoria de desarrollo incluida',
    existing_discovery_found: '  Contexto : discovery.md existente encontrado en {path}',
    existing_skeleton_found: '  Contexto : skeleton-system.md existente encontrado en {path}',
    context_update_mode: '  Modo     : update/merge del contexto existente activado para discovery.md + skeleton-system.md',
    context_mode: '  Contexto : context-mode={mode} (valor recomendado por defecto para brownfield: merge)',
    local_only: '  LLM      : desactivada por defecto — solo escaneo local (usa --with-llm para generar discovery.md + skeleton-system.md)',
    walking: '  Escaneando estructura del proyecto...',
    walk_done: '  Archivos : {files} entradas mapeadas | Archivos clave: {keys} leidos',
    index_written: '  Indice   : scan local escrito en {path} (modo: {mode})',
    folders_written: '  Carpetas : mapa de carpetas escrito en {path}',
    folder_written: '  Carpeta  : mapa completo de {folder} escrito en {path}',
    forge_written: '  AIOS     : mapa util de .aioson escrito en {path}',
    memory_index_written: '  Memoria  : memory-index.md escrito en {path}',
    spec_current_written: '  Memoria  : spec-current.md escrito en {path}',
    spec_history_written: '  Memoria  : spec-history.md escrito en {path}',
    module_memory_written: '  Modulo   : memoria enfocada de {folder} escrita en {path}',
    dry_run_done: '[dry-run] Escanearia {treeCount} entradas y {keyCount} archivos clave — sin llamada LLM.',
    local_done: '  Resultado: escaneo local completado — indice, mapa de carpetas, scans solicitados y .aioson listos.',
    local_missing: '  Falta    : discovery.md + skeleton-system.md todavia no fueron generados en este escaneo local.',
    architecture_note: '  Nota     : architecture.md no lo genera scan:project; ese archivo viene despues con @architect.',
    local_paths_title: '\n\x1b[33m  Como generar discovery ahora:\x1b[0m',
    local_path_api: '  \x1b[32mCamino A — API automatica\x1b[0m',
    calling_llm: '  Llamando {provider} ({model})...',
    llm_missing_api_key:
      'La API key del provider "{provider}" todavia no esta configurada en {file}. Completa providers.{provider}.api_key o elige otro provider con --provider=...',
    llm_error: 'Llamada LLM fallo: {error}',
    gitignore_policy_written:
      '  Gitignore: politica de AIOSON actualizada en {path} para ignorar archivos gestionados del framework',
    gitignore_tracked_note:
      '  Gitignore: si esos archivos ya estaban rastreados por Git antes, todavia hara falta un git rm --cached una vez para que dejen de aparecer en el status',
    invalid_llm_output_discovery_empty:
      'La LLM devolvio un discovery.md vacio. No se sobrescribio ningun archivo existente. Conserva el backup actual e intenta con un modelo mas fuerte o menos carpetas por ejecucion.',
    invalid_llm_output_skeleton_empty:
      'La LLM devolvio un skeleton-system.md vacio despues del delimitador. No se sobrescribio ningun archivo existente. Intenta otra vez con un modelo mas fuerte o un alcance menor.',
    gitignore_backups_written: '  Gitignore: regla de backup local garantizada en {path}',
    backups_written: '  Backup   : {count} archivo(s) guardado(s) en {path}',
    discovery_written: 'discovery.md escrito: {path} ({chars} chars)',
    skeleton_written: 'skeleton-system.md escrito: {path} ({chars} chars)',
    skeleton_missing: 'Delimitador skeleton no encontrado en respuesta LLM — skeleton-system.md no escrito.',
    local_next_steps: '  1. Ejecuta: aioson scan:project {target} --folder={folders} --with-llm --provider=<provider>',
    local_path_cli: '  \x1b[36mCamino B — Tu AI CLI (sin API dentro de aioson)\x1b[0m',
    local_cli_step_analyst: '  2. En Codex, Claude Code u otro cliente, ejecuta @analyst — puede usar scan-index.md + scan-folders.md + scan-<pasta>.md para escribir discovery.md',
    local_cli_step_prompt_codex: '  3. Si el cliente no entiende @analyst, genera un prompt listo: aioson agent:prompt analyst --tool=codex',
    local_cli_step_prompt_claude: '  4. Cambia --tool=codex por --tool=claude cuando haga falta',
    local_cli_step_model_hint: '  5. Si tu cliente permite elegir modelo, usa uno rapido/barato para esta etapa de discovery',
    local_workflow_title: '\n\x1b[33m  Despues del discovery:\x1b[0m',
    local_step_architect: '  3. Ejecuta @architect — genera architecture.md a partir del discovery consolidado',
    local_step_dev: '  4. Ejecuta @dev — empieza a codificar solo despues de tener discovery.md + architecture.md',
    next_steps: '\n  Proximos pasos:',
    step_analyst: '  1. Abre tu sesion de IA y ejecuta @analyst — revisa discovery.md + skeleton-system.md y consolida el alcance actual',
    step_architect: '  2. Ejecuta @architect — genera architecture.md a partir del discovery consolidado',
    step_dev: '  3. Ejecuta @dev — lee skeleton-system.md primero, luego discovery.md + architecture.md + spec.md'
  },
  squad_investigate: {
    no_runtime: 'Runtime store no encontrado. Ejecuta aioson runtime:init primero.',
    no_investigations: 'No se encontraron investigaciones.',
    not_found: 'Investigacion no encontrada: {slug}',
    no_report: 'La investigacion "{slug}" no tiene archivo de reporte.',
    report_missing: 'Archivo de reporte no encontrado: {path}',
    show_usage: 'Uso: aioson squad:investigate [path] --sub=show --investigation=<slug>',
    score_usage: 'Uso: aioson squad:investigate [path] --sub=score --investigation=<slug>',
    link_usage: 'Uso: aioson squad:investigate [path] --sub=link --investigation=<slug> --squad=<slug>',
    register_usage: 'Uso: aioson squad:investigate [path] --sub=register --report=<ruta> [--domain=<nombre>] [--squad=<slug>]',
    linked: 'Investigacion "{investigation}" vinculada al squad "{squad}".',
    registered: 'Investigacion registrada: {slug} ({path})',
    unknown_sub: 'Subcomando desconocido: {sub}. Usa: list, show, score, link, register.'
  },
  squad_daemon: {
    squad_required: 'El slug del squad es obligatorio. Use --squad=<slug>.',
    started: 'Daemon iniciado para squad "{squad}" en puerto {port} ({workers} workers, {cron} cron jobs)',
    webhook_hint: 'Endpoint webhook: POST http://127.0.0.1:{port}/webhook/<worker-slug>',
    stop_hint: 'Presione Ctrl+C para detener.',
    stopping: 'Deteniendo daemon...',
    start_failed: 'Error al iniciar daemon: {error}',
    no_runtime: 'Runtime store no encontrado. Ejecute aioson runtime:init primero.',
    no_daemons: 'No se encontraron registros de daemon.',
    not_found: 'No hay registro de daemon para el squad: {squad}',
    not_running: 'El daemon del squad "{squad}" no esta en ejecucion.',
    signal_sent: 'SIGTERM enviado al daemon de "{squad}" (pid {pid}).',
    process_gone: 'El proceso del daemon de "{squad}" ya no esta en ejecucion.',
    no_logs: 'No se encontraron registros de actividad del daemon.',
    unknown_sub: 'Subcomando desconocido: {sub}. Use: start, status, stop, logs.'
  },

  squad_mcp: {
    squad_required: 'El slug del squad es obligatorio. Use --squad=<slug>.',
    connectors_title: 'Conectores MCP Integrados:',
    actions: 'Acciones',
    required_config: 'Requerido',
    no_integrations: 'No hay integraciones configuradas para el squad "{squad}".',
    missing_config: 'Config faltante',
    calls: 'Llamadas',
    mcp_required: 'El slug del MCP es obligatorio. Use --mcp=<slug>.',
    connector_required: 'El ID del conector es obligatorio. Use --connector=<id>.',
    unknown_connector: 'Conector desconocido: {connector}. Use --sub=connectors para listar.',
    configured: 'Integracion "{mcp}" configurada con conector "{connector}" (estado: {status}).',
    still_missing: 'Aun faltan env/config: {keys}',
    not_configured: 'La integracion "{mcp}" no esta configurada.',
    test_missing: 'La integracion "{mcp}" tiene config faltante: {keys}',
    test_ok: 'Integracion "{mcp}" ({connector}) — config OK.',
    health_url: 'URL de health check: {url}',
    unknown_sub: 'Subcomando desconocido: {sub}. Use: status, connectors, configure, test.'
  },

  squad_roi: {
    squad_required: 'El slug del squad es obligatorio. Use --squad=<slug>.',
    config_saved: 'Config de ROI guardada para el squad "{squad}".',
    pricing_model: 'Modelo de precios',
    setup_fee: 'Tarifa de instalacion',
    monthly_fee: 'Mensualidad',
    percentage: 'Porcentaje',
    contract: 'Contrato',
    metric_required: 'La clave y el valor de la metrica son obligatorios. Use --key=<nombre> --value=<N>.',
    metric_saved: 'Metrica "{key}" = {value} guardada para el squad "{squad}".',
    no_metrics: 'No se encontraron metricas para el squad "{squad}".',
    report_title: 'Reporte de ROI — {squad}',
    baseline: 'Baseline',
    actual: 'Actual',
    target: 'Meta',
    period: 'Periodo',
    cost_section: 'Resumen de Costos:',
    monthly_cost: 'Costo mensual efectivo',
    exported: 'Reporte exportado a {file} ({format}).',
    unknown_sub: 'Subcomando desconocido: {sub}. Use: config, metric, report, export.'
  },

  squad_worker: {
    squad_required: 'El slug del squad es obligatorio. Use --squad=<slug>.',
    no_workers: 'No se encontraron workers para este squad.',
    run_usage: 'Uso: aioson squad:worker --sub=run --squad=<slug> --worker=<slug> [--input=<json>]',
    test_usage: 'Uso: aioson squad:worker --sub=test --squad=<slug> --worker=<slug>',
    scaffold_usage: 'Uso: aioson squad:worker --sub=scaffold --squad=<slug> --worker=<slug> [--trigger=manual|event|scheduled]',
    not_found: 'Worker no encontrado: {worker}',
    invalid_input: 'JSON invalido. Proporcione JSON valido con --input.',
    run_success: 'Worker "{worker}" completado exitosamente.',
    run_failed: 'Worker "{worker}" fallo: {error}',
    test_passed: 'Worker "{worker}" prueba aprobada.',
    test_failed: 'Worker "{worker}" prueba fallo: {error}',
    scaffold_created: 'Worker "{worker}" creado en {path}',
    no_runtime: 'Runtime store no encontrado. Ejecute aioson runtime:init primero.',
    no_logs: 'No se encontraron ejecuciones de worker.',
    unknown_sub: 'Subcomando desconocido: {sub}. Use: list, run, test, logs, scaffold.'
  },

  squad_dashboard: {
    started: 'Squad Dashboard ejecutandose en {url} (puerto {port})',
    filtered: 'Filtrando al squad: {squad}',
    stop_hint: 'Presione Ctrl+C para detener.',
    stopping: 'Deteniendo Squad Dashboard...',
    port_in_use: 'El puerto {port} ya esta en uso. Intente --port=<otro>'
  },
  implementation_plan: {
    not_found: 'Plan de implementacion no encontrado: {file}',
    no_runtime: 'Runtime store no encontrado. Ejecuta aioson runtime:init primero.',
    no_plans: 'No hay planes de implementacion registrados.',
    no_created_date: 'El plan no tiene fecha de creacion en el frontmatter — no se puede verificar obsolescencia.',
    is_stale: 'El plan esta OBSOLETO — los artefactos fuente cambiaron despues de la creacion del plan.',
    is_fresh: 'El plan esta actualizado.',
    checkpoint_usage: 'Uso: aioson plan [path] --sub=checkpoint --feature=<slug> --phase=<N>',
    phase_completed: 'Fase {phase} marcada como completada.',
    phase_not_found: 'Fase {phase} no encontrada en el plan.',
    registered: 'Plan de implementacion registrado: {planId} ({phases} fases)'
  },
  squad_plan: {
    slug_required: 'El slug del squad es obligatorio.',
    not_found: 'Plan de ejecucion no encontrado para el squad: {slug}',
    no_runtime: 'Runtime store no encontrado. Ejecuta aioson runtime:init primero.',
    no_plan: 'No hay plan de ejecucion registrado para el squad: {slug}',
    no_created_date: 'El plan no tiene fecha de creacion en el frontmatter — no se puede verificar obsolescencia.',
    is_stale: 'El plan de ejecucion esta OBSOLETO — los artefactos del squad cambiaron despues de la creacion del plan.',
    is_fresh: 'El plan de ejecucion esta actualizado.',
    checkpoint_usage: 'Uso: aioson squad:plan [path] --sub=checkpoint --squad=<slug> --round=<N>',
    round_completed: 'Round {round} marcado como completado.',
    round_not_found: 'Round {round} no encontrado en el plan.',
    registered: 'Plan de ejecucion registrado: {planSlug} ({rounds} rounds)'
  },

  squad_learning: {
    slug_required: 'El slug del squad es obligatorio.',
    no_runtime: 'Runtime store no encontrado. Ejecuta aioson runtime:init primero.',
    no_learnings: 'No se encontraron learnings para el squad: {slug}',
    not_found: 'Learning no encontrado: {id}',
    archived_count: '{count} learning(s) marcado(s) como obsoleto(s) para el squad: {slug}',
    promote_usage: 'Uso: aioson squad:learning [path] --sub=promote --squad=<slug> --id=<learning-id> [--to=<ruta-regla>]',
    promoted: 'Learning {id} promovido a regla en {path}'
  },

  learning: {
    no_runtime: 'Runtime store no encontrado. Ejecuta aioson runtime:init primero.',
    no_learnings: 'No se encontraron learnings de proyecto.',
    not_found: 'Learning no encontrado: {id}',
    promote_usage: 'Uso: aioson learning [path] --sub=promote --id=<learning-id> [--to=<ruta-regla>]',
    promoted: 'Learning {id} promovido a regla en {path}'
  },

  auth: {
    login_no_token: 'No se proporcion\u00f3 token. Obt\u00e9n el tuyo en: {url}',
    login_hint: 'Ejecuta: aioson auth:login --token=<tu-token>',
    login_verifying: 'Verificando token...',
    login_ok: 'Autenticado como {username}. Token guardado en {path}.',
    login_saved: 'Token guardado en {path}. (No se pudo verificar \u2014 la API puede estar offline.)',
    logout_ok: 'Sesi\u00f3n cerrada. Token eliminado.',
    status_not_authenticated: 'No autenticado.',
    status_checking: 'Verificando token...',
    status_ok: 'Autenticado como {username}.',
    status_token_offline: 'Token guardado (\u00faltimo usuario conocido: {username}). API offline o inaccesible.'
  },

  workspace: {
    registering: 'Registrando workspace en aioson.com...',
    init_ok: 'Workspace "{slug}" vinculado.\n  Local: {path}\n  Online: {url}',
    already_linked: 'Workspace ya vinculado: {slug}\n  Online: {url}',
    not_linked: 'Ning\u00fan workspace vinculado a este proyecto.',
    init_hint: 'Ejecuta: aioson workspace:init',
    status_slug: 'Workspace: {slug}',
    status_id: 'ID: {id}',
    status_url: 'URL: {url}',
    status_created: 'Creado el: {date}',
    open_url: 'Abrir en navegador: {url}'
  },

  store: {
    error_not_authenticated: 'No autenticado. Ejecuta: aioson auth:login --token=<tu-token>',
    error_missing_slug: 'Falta --slug.',
    error_missing_code_or_slug: 'Proporciona un slug (--slug=X) o un c\u00f3digo de instalaci\u00f3n.',
    error_invalid_response: 'Respuesta inv\u00e1lida de aioson.com.',
    error_genome_not_found: 'Genome "{slug}" no encontrado en {path}.',
    error_skill_not_found: 'Skill "{slug}" no encontrada en .aioson/skills/ ni .aioson/installed-skills/.',
    error_skill_missing_skillmd: 'Skill "{slug}" no tiene SKILL.md.',
    error_squad_not_found: 'Squad "{slug}" no encontrado en {path}.',

    publish_dry_run: '[dry-run] Se publicar\u00eda {type} "{slug}" (visibilidad: {visibility}).',
    publish_genome_validating: 'Validando genome...',
    publish_genome_sending: 'Enviando a aioson.com...',
    publish_genome_done: 'Publicado: aioson.com/store/genomes/{slug}\n  Instalar: aioson genome:install --slug={slug}',
    publish_skill_collecting: 'Recolectando archivos de la skill...',
    publish_skill_files: '  Archivos: {count}',
    publish_skill_sending: 'Enviando {count} archivo(s) a aioson.com...',
    publish_skill_done: 'Publicado: aioson.com/store/skills/{slug}\n  Instalar: aioson skill:install --slug={slug}',
    publish_squad_analyzing_agents: 'Analizando agentes...',
    publish_squad_agents_found: '  Agentes: {count}',
    publish_squad_analyzing_deps: 'Analizando dependencias...',
    publish_squad_bundling_skill: '  Empaquetando skill: {slug}',
    publish_squad_skill_missing: '  Skill no encontrada (omitida): {slug}',
    publish_squad_bundling_genome: '  Empaquetando genome: {slug}',
    publish_squad_genome_missing: '  Genome no encontrado (omitido): {slug}',
    publish_squad_sending: 'Enviando a aioson.com...',
    publish_squad_done: 'Publicado: aioson.com/store/squads/{slug}\n  Instalar: aioson squad:install --slug={slug}',
    publish_squad_summary: '  Agentes: {agents} | Skills empaquetadas: {skills} | Genomes empaquetados: {genomes}',

    install_genome_fetching: 'Obteniendo genome "{ref}" de aioson.com...',
    install_genome_done: 'Genome "{slug}" instalado en {path}.',
    install_backing_up: '  Backup guardado: {path}',
    install_squad_fetching: 'Obteniendo squad "{ref}" de aioson.com...',
    install_squad_writing: 'Instalando archivos...',
    install_squad_dep_skip: '  {type} "{slug}" ya instalado \u2014 omitiendo (usa --force para reemplazar).',
    install_squad_done: 'Squad "{slug}" instalado en {path}.',

    list_genome_empty: 'No hay genomes instalados en este proyecto.',
    list_genome_header: '{count} genome(s) instalado(s):',
    list_genome_item: '  {slug}{version}',
    list_genome_item_v2: '  {folderMarker} {advisorMarker} {slug}  {name}  {track}{fidelity}{advisor}',
    list_genome_conflict_warn: '⚠️  {slug}: ambos formatos (carpeta y archivo único) existen; la carpeta tiene precedencia (ejecuta "aioson genome:remove --slug={slug}" para limpiar).',
    publish_genome_folder_collecting: 'Recopilando archivos del genome (Track 4.2/4.3 modular)...',
    publish_genome_folder_files: '  Archivos: {count}',
    publish_genome_folder_track: '  Track: {track} · Fidelity: {fidelity} · Advisor-ready: {advisor}',
    publish_genome_folder_sending: 'Enviando {count} archivo(s) a aioson.com (formato carpeta)...',
    publish_genome_conflict_warn: '⚠️  {slug}: ambos formatos existen localmente; la carpeta tiene precedencia para publish.',
    install_backing_up_legacy: '  Conflicto con formato antiguo detectado; backup en: {path}',
    install_folder_exists: '  La carpeta existente en {path} será sobrescrita (usa --force para suprimir este aviso).',
    install_genome_folder_done: 'Genome "{slug}" instalado en {path} ({count} archivos, formato carpeta).',
    error_genome_missing_skillmd: 'La carpeta del genome "{slug}" no tiene SKILL.md.',
    error_genome_missing_manifest: 'La carpeta del genome "{slug}" no tiene manifest.json.',
    error_genome_invalid_manifest: 'manifest.json del genome "{slug}" es inválido: {detail}',
    remove_genome_done: 'Genome "{slug}" eliminado.',

    grant_error_missing_code: 'C\u00f3digo ausente. Uso: aioson squad:grant <c\u00f3digo> <email>',
    grant_error_missing_email: 'Email ausente. Uso: aioson squad:grant <c\u00f3digo> <email>',
    grant_sending: 'Concediendo acceso a {email} para el c\u00f3digo {code}...',
    grant_ok: '{email} ahora puede instalar usando el c\u00f3digo {code}.',

    publish_scanning: 'Ejecutando an\u00e1lisis de seguridad...',
    publish_scan_ok: 'An\u00e1lisis de seguridad superado. Hash del paquete: {hash}...',
    error_scan_failed: 'Publicaci\u00f3n bloqueada: el an\u00e1lisis de seguridad encontr\u00f3 errores.',
    error_scan_warnings: 'Publicaci\u00f3n bloqueada: {count} patr\u00f3n(es) sospechoso(s) detectado(s). Revise las advertencias. Use --force si est\u00e1 seguro de que el paquete es seguro.',

    install_scanning: 'Verificando integridad del paquete...',
    error_install_scan_failed: 'Instalaci\u00f3n bloqueada: el paquete "{slug}" fall\u00f3 el an\u00e1lisis de seguridad.',
    error_hash_mismatch: 'Instalaci\u00f3n bloqueada: el hash no coincide para "{slug}". El paquete puede haber sido alterado.',

    install_preview_header: 'Paquete: {slug}  v{version}  por {publisher}',
    install_preview_trusted: '  Estado: Editor de confianza',
    install_preview_unverified: '  Estado: Editor no verificado \u2014 revise los archivos antes de usar',
    install_preview_downloads: '  Descargas: {count}',
    install_preview_rating: '  Calificaci\u00f3n: {rating}',
    install_preview_hash: '  Hash: {hash}...',
    install_inspect_files: 'Archivos en este paquete ({count} en total):',
    install_inspect_hint: 'Ejecute sin --inspect para instalar.',
    install_unverified_hint: '  Tip: Use --inspect para revisar los archivos antes de instalar, o --force para omitir esta advertencia.'
  },

  system: {
    error_no_manifest: 'system.json no encontrado en {path}. Cree un system.json en la raiz del proyecto de sistema.',
    error_invalid_manifest: 'system.json invalido — verifique que sea un JSON valido.',
    error_manifest_missing_slug: 'system.json debe incluir el campo "slug".',
    error_manifest_missing_version: 'system.json debe incluir el campo "version".',
    error_manifest_missing_name: 'system.json debe incluir el campo "name".',
    error_missing_package_json: 'package.json no encontrado. Un sistema debe ser un proyecto Node.js valido.',

    package_reading_manifest: 'Leyendo system.json...',
    package_manifest_ok: 'Sistema: {name} ({slug} v{version})',
    package_collecting_files: 'Recopilando archivos fuente...',
    package_files_found: '  {count} archivos ({kb} KB)',
    package_dry_run: '[dry-run] Empaquetaria {slug} v{version} — ningun archivo escrito.',
    package_saved: 'Paquete guardado en: {path}',

    publish_reading_manifest: 'Leyendo system.json...',
    publish_dry_run: '[dry-run] Publicaria el sistema "{slug}" v{version} (visibilidad: {visibility}).',
    publish_sending: 'Enviando a aioson.com...',
    publish_done: 'Publicado: aioson.com/store/systems/{slug}\n  Instalar en aioson-play usando el slug: {slug}',
    publish_summary: '  Archivos: {files} ({kb} KB)',

    list_remote_empty: 'Ningun sistema publicado aun.',
    list_remote_header: '{count} sistema(s) publicado(s):',
    list_remote_item: '  {slug}  v{version}  [{visibility}]  {name}',
    list_local_empty: 'Ningun sistema en cache en este proyecto.',
    list_local_header: '{count} sistema(s) en cache:',
    list_local_item: '  {slug}',

    install_fetching: 'Buscando sistema "{ref}" en aioson.com...',
    install_writing: 'Escribiendo archivos...',
    install_done: 'Sistema "{slug}" instalado en {path}.'
  }
};
