'use strict';

module.exports = {
  cli: {
    title: 'AIOSON CLI',
    title_line: '{title}\n',
    usage: 'Utilisation :',
    help_item_line: '  {text}',
    help_init:
      'aioson init <project-name> [--force] [--dry-run] [--lang=<bcp47-tag>] [--tool=codex|claude|gemini|opencode] [--locale=fr]',
    help_install:
      'aioson install [path] [--force] [--dry-run] [--lang=<bcp47-tag>] [--tool=codex|claude|gemini|opencode] [--locale=fr]',
    help_setup:
      'aioson setup [path] [--defaults] [--framework=<nom>] [--lang=<bcp47-tag>] [--project-name=<nom>] [--force] [--dry-run] [--tool=codex|claude|gemini|opencode] [--locale=fr]',
    help_update:
      'aioson update [path] [--dry-run] [--lang=<bcp47-tag>] [--locale=fr]',
    help_info: 'aioson info [path] [--json] [--locale=fr]',
    help_doctor: 'aioson doctor [path] [--fix] [--dry-run] [--json] [--locale=fr]',
    help_i18n_add: 'aioson i18n:add <locale> [--force] [--dry-run] [--locale=fr]',
    help_agents: 'aioson agents [path] [--lang=<bcp47-tag>] [--locale=fr]',
    help_agent_prompt:
      'aioson agent:prompt <agent> [path] [--tool=codex|claude|gemini|opencode] [--lang=<bcp47-tag>] [--locale=fr]',
    help_agent_invoke:
      'aioson agent:invoke <agent> [path] [--tool=codex|claude|gemini|opencode] [--mode=framework_target|app_target] [--feature=<slug>] [--scope=<area>] [--lang=<bcp47-tag>] [--locale=fr]',
    help_context_validate: 'aioson context:validate [path] [--json] [--locale=fr]',
    help_context_pack:
      'aioson context:pack [path] [--agent=<agent>] [--goal=<texte>] [--module=<module-ou-dossier>] [--max-files=8] [--json] [--locale=fr]',
    help_memory_status: 'aioson memory:status [path] [--json] [--locale=fr]',
    help_memory_summary: 'aioson memory:summary [path] [--last=5] [--json] [--locale=fr]',
    help_brain_query:
      'aioson brain:query [path] [--tags=<csv>] [--agent=<agent>] [--min-quality=4] [--format=compact|json|ids] [--json] [--locale=fr]',
    help_setup_context:
      'aioson setup:context [path] [--defaults] [--project-type=web_app|api|site|script|dapp|desktop_app] [--framework=<name>] [--backend=<name>] [--frontend=<name>] [--database=<name>] [--auth=<name>] [--uiux=<name>] [--language=<bcp47-tag>] [--web3-enabled=true|false] [--locale=fr]',
    help_locale_apply: 'aioson locale:apply [path] [--lang=<bcp47-tag>] [--dry-run] [--locale=fr]',
    help_locale_diff: 'aioson locale:diff [agent] [--lang=<bcp47-tag>] [--json] [--locale=en]',
    help_test_agents: 'aioson test:agents [--json] [--locale=en]',
    help_test_smoke:
      'aioson test:smoke [workspace-path] [--lang=<bcp47-tag>] [--web3=ethereum|solana|cardano] [--profile=standard|mixed|parallel] [--keep] [--json] [--locale=fr]',
    help_test_package:
      'aioson test:package [source-path] [--keep] [--dry-run] [--json] [--locale=fr]',
    help_workflow_plan:
      'aioson workflow:plan [path] [--classification=MICRO|SMALL|MEDIUM] [--json] [--locale=fr]',
    help_workflow_execute:
      'aioson workflow:execute [path] [--steps=<n>] [--dry-run] [--lane=<n>] [--json] [--locale=fr]',
    help_parallel_init:
      'aioson parallel:init [path] [--workers=2..6] [--force] [--dry-run] [--json] [--locale=fr]',
    help_parallel_doctor:
      'aioson parallel:doctor [path] [--workers=2..6] [--fix] [--force] [--dry-run] [--json] [--locale=fr]',
    help_parallel_assign:
      'aioson parallel:assign [path] [--source=auto|prd|architecture|discovery|<file>] [--workers=2..6] [--force] [--dry-run] [--json] [--locale=fr]',
    help_parallel_status:
      'aioson parallel:status [path] [--json] [--locale=fr]',
    help_parallel_merge:
      'aioson parallel:merge [path] [--apply] [--json] [--locale=fr]',
    help_parallel_guard:
      'aioson parallel:guard [path] --lane=<n> --paths=<path[,path2]> [--json] [--locale=fr]',
    help_mcp_init:
      'aioson mcp:init [path] [--tool=claude|codex|gemini|opencode] [--dry-run] [--json] [--locale=fr]',
    help_mcp_doctor:
      'aioson mcp:doctor [path] [--strict-env] [--json] [--locale=fr]',
    help_qa_doctor:
      'aioson qa:doctor [path] [--json] [--locale=fr]',
    help_qa_init:
      'aioson qa:init [path] [--url=<app-url>] [--dry-run] [--json] [--locale=fr]',
    help_qa_run:
      'aioson qa:run [path] [--url=<app-url>] [--persona=naive|hacker|power|mobile] [--headed] [--html] [--json] [--locale=fr]',
    help_qa_scan:
      'aioson qa:scan [path] [--url=<app-url>] [--depth=3] [--max-pages=50] [--headed] [--html] [--json] [--locale=fr]',
    help_qa_report:
      'aioson qa:report [path] [--html] [--json] [--locale=fr]',
    help_web_map:
      'aioson web:map [path] --url=<url> [--depth=<N>] [--max-pages=<N>] [--include-external] [--json] [--locale=fr]',
    help_web_scrape:
      'aioson web:scrape [path] --url=<url> [--format=markdown|text|html|links] [--json] [--locale=fr]',
    help_scan_project:
      'aioson scan:project [path] --folder=<chemin[,chemin2]> [--summary-mode=titles|summaries|raw] [--context-mode=merge|rewrite] [--with-llm] [--provider=<name>] [--llm-model=<name>] [--dry-run] [--json] [--locale=fr]',
    help_config:
      'aioson config <set KEY=value|show|get KEY> [--json] [--locale=fr]',
    help_genome_doctor:
      'aioson genome:doctor <fichier> [--json] [--locale=fr]',
    help_genome_migrate:
      'aioson genome:migrate <fichier-ou-dossier> [--write] [--no-backup] [--json] [--locale=fr]',
    help_squad_status:
      'aioson squad:status [path] [--json] [--locale=fr]',
    help_squad_repair_genomes:
      'aioson squad:repair-genomes <manifest.json> [--write] [--no-backup] [--json] [--locale=fr]',
    help_squad_validate:
      'aioson squad:validate [path] --squad=<slug> [--locale=fr]',
    help_squad_export:
      'aioson squad:export [path] --squad=<slug> [--locale=fr]',
    help_squad_pipeline:
      'aioson squad:pipeline [path] [--sub=list|show|status] [--pipeline=<slug>] [--locale=fr]',
    help_squad_investigate:
      'aioson squad:investigate [path] [--sub=list|show|score|link|register] [--investigation=<slug>] [--squad=<slug>] [--locale=fr]',
    help_squad_learning:
      'aioson squad:learning [path] [--sub=list|stats|archive|promote|export] [--squad=<slug>] [--status=<status>] [--locale=fr]',
    help_squad_dashboard:
      'aioson squad:dashboard [path] [--port=4180] [--squad=<slug>] [--locale=fr]',
    help_squad_worker:
      'aioson squad:worker [path] [--sub=list|run|test|logs|scaffold] [--squad=<slug>] [--worker=<slug>] [--input=<json>] [--locale=fr]',
    help_squad_daemon:
      'aioson squad:daemon [path] [--sub=start|status|stop|logs] [--squad=<slug>] [--port=<N>] [--locale=fr]',
    help_squad_mcp:
      'aioson squad:mcp [path] [--sub=status|connectors|configure|test] [--squad=<slug>] [--mcp=<slug>] [--connector=<id>]',
    help_squad_roi:
      'aioson squad:roi [path] [--sub=config|metric|report|export] [--squad=<slug>] [--key=<metrique>] [--value=<N>]',
    help_squad_score:
      'aioson squad:score [path] --squad=<slug> [--locale=fr]',
    help_commit_prepare:
      'aioson commit:prepare [path] [--staged-only] [--agent-safe] [--mode=guarded|trusted|headless] [--json] [--locale=fr]',
    help_learning:
      'aioson learning [path] [--sub=list|stats|promote] [--status=<status>] [--id=<learning-id>] [--locale=fr]',
    dashboard_moved:
      'Le flux `{command}` a été supprimé du CLI. Le dashboard AIOSON est désormais installé séparément. Ouvrez l application dashboard sur votre ordinateur, créez ou ajoutez un projet, puis sélectionnez le dossier qui contient déjà `.aioson/`.',
    dashboard_moved_line: '{message}\n',
    unknown_command: 'Commande inconnue : {command}',
    unknown_command_line: '{message}\n',
    error_prefix: 'Erreur : {message}'
  },
  init: {
    usage_error:
      'Utilisation : aioson init <project-name> [--force] [--dry-run] [--all] [--lang=<bcp47-tag>] [--tool=codex|claude|gemini|opencode] [--locale=fr]',
    non_empty_dir: 'Le repertoire n est pas vide : {targetDir}. Utilisez --force pour continuer.',
    created_at: 'Projet cree dans : {targetDir}',
    files_copied: 'Fichiers copies : {count}',
    files_skipped: 'Fichiers ignores : {count}',
    next_steps: 'Etapes suivantes :',
    step_cd: '1. cd {projectName}',
    step_setup: '2. Ouvrez dans votre AI CLI et executez @setup',
    step_agents: '3. Si aucun selecteur visuel n apparait, lancez : aioson agents',
    step_agent_prompt:
      '4. Generez le prompt setup pour votre outil : aioson agent:prompt setup --tool={tool}'
  },
  init_all: {
    installing_full: 'Installation complete (tous les outils + squads) — wizard ignore via --all'
  },
  install: {
    framework_detected: 'Framework detecte : {framework} ({evidence})',
    framework_not_detected: 'Aucun framework detecte. Installation en mode generique.',
    done_at: 'Installation terminee dans : {targetDir}',
    files_copied: 'Fichiers copies : {count}',
    files_skipped: 'Fichiers ignores : {count}',
    next_steps: 'Etapes suivantes :',
    step_setup_context: '1. Generez/mettez a jour le contexte projet : aioson setup:context --defaults',
    step_agents: '2. Si aucun selecteur visuel n apparait, lancez : aioson agents',
    step_agent_prompt:
      '3. Generez le prompt setup pour votre outil : aioson agent:prompt setup --tool={tool}',
    existing_project_detected:
      '⚠ Projet existant detecte ({count} fichiers). Lancez le scanner avant de commencer :',
    existing_project_scan_hint:
      '  aioson scan:project . --folder=src --with-llm --provider=<provider>   (genere discovery.md + skeleton-system.md ; sans --with-llm, seulement les cartes locales)',
    using_saved_profile: 'Utilisation du profil d installation enregistre dans .aioson/install.json.',
    fallback_no_saved_profile: '⚠  Aucun profil enregistre et aucun assistant interactif disponible — repli sur install-all (tous les fichiers du template seront copies).',
    reconfigure_needs_tty: '--reconfigure necessite un terminal interactif (bloque par : {reason}). Relancez dans un vrai TTY sans --no-interactive/--dry-run.',
    opening_wizard: '› Ouverture de l assistant d installation (↑/↓ naviguer, espace marquer, entree confirmer, q/Ctrl+C annuler)...',
    wizard_cancelled_using_saved: '⚠  Assistant annule — repli sur le profil d installation enregistre.',
    wizard_cancelled_install_all: '⚠  Assistant annule et aucun profil enregistre — repli sur install-all.'
  },
  install_wizard: {
    ready_to_install: 'Pret a installer :',
    press_enter_to_install: 'Appuyez sur entree pour installer ou q pour annuler.',
    deselected_warning: '⚠  Les elements deselectionnes ne seront PAS supprimes automatiquement.',
    deselected_hint: '     Supprimez-les manuellement si necessaire.'
  },
  update: {
    not_installed: 'Aucune installation AIOSON trouvee dans {targetDir}.',
    done_at: 'Mise a jour terminee dans : {targetDir}',
    files_updated: 'Fichiers mis a jour : {count}',
    backups_created: 'Sauvegardes creees : {count}',
    reconfigure_hint: 'De nouvelles options peuvent etre disponibles. Lancez : aioson install --reconfigure'
  },
  info: {
    cli_version: 'AIOSON CLI : v{version}',
    directory: 'Repertoire : {targetDir}',
    installed_here: 'Installe dans ce repertoire : {value}',
    framework_detected: 'Framework detecte : {framework}',
    evidence: 'Preuve : {evidence}',
    yes: 'oui',
    no: 'non',
    none: 'aucun'
  },
  doctor: {
    ok: 'OK',
    fail: 'ECHEC',
    diagnosis_ok: 'Diagnostic : installation saine.',
    diagnosis_fail: 'Diagnostic : {count} probleme(s) detecte(s).',
    hint_prefix: '-> {hint}',
    check_line: '[{icon}] {message}',
    hint_line: '  Astuce : {hint}',
    fix_action_line: '- Action : {action}',
    detail_line: '  Detail : {text}',
    required_file: 'Fichier requis : {rel}',
    context_generated: 'Contexte principal genere',
    context_hint: 'Executez @setup pour generer .aioson/context/project.context.md',
    context_frontmatter_valid: 'Le frontmatter du contexte est valide',
    context_frontmatter_valid_hint:
      'Assurez-vous que project.context.md commence par un frontmatter YAML delimite par ---',
    context_frontmatter_invalid: 'Le frontmatter du contexte est invalide ({reason})',
    context_frontmatter_invalid_hint:
      'Reecrivez project.context.md avec le format de sortie de @setup.',
    context_required_field: 'Champ de contexte requis manquant : {field}',
    context_required_field_hint:
      'Relancez @setup et confirmez que tous les champs requis sont presents.',
    context_framework_installed_type: '`framework_installed` doit etre booleen (true/false)',
    context_framework_installed_type_hint:
      'Definissez framework_installed a true ou false sans guillemets.',
    context_classification_value: '`classification` doit etre une des valeurs {expected}',
    context_classification_value_hint: 'Utilisez MICRO, SMALL ou MEDIUM exactement.',
    context_project_type_value: '`project_type` doit etre une des valeurs {expected}',
    context_project_type_value_hint: 'Utilisez web_app, api, site, script, dapp ou desktop_app exactement.',
    context_profile_value: '`profile` doit etre une des valeurs {expected}',
    context_profile_value_hint: 'Utilisez developer, beginner ou team exactement.',
    context_interaction_language_format:
      '`interaction_language` n est pas une balise BCP-47 valide',
    context_interaction_language_format_hint: 'Utilisez des valeurs comme en, en-US, pt-BR.',
    context_conversation_language_format: '`conversation_language` n est pas une balise BCP-47 valide',
    context_conversation_language_format_hint: 'Utilisez des valeurs comme en, en-US, pt-BR.',
    node_version: 'Node.js >= 18 (actuel : {version})',
    gateway_claude_pointer: 'La passerelle CLAUDE reference les fichiers partages AIOSON',
    gateway_claude_pointer_hint:
      'Assurez-vous que CLAUDE.md reference .aioson/config.md et .aioson/agents/setup.md.',
    gateway_codex_pointer: 'La passerelle Codex reference les fichiers partages AIOSON',
    gateway_codex_pointer_hint:
      'Assurez-vous que AGENTS.md reference .aioson/config.md et .aioson/agents/.',
    gateway_gemini_pointer: 'La passerelle Gemini reference les chemins partages commandes et agents',
    gateway_gemini_pointer_hint:
      'Assurez-vous que .gemini/GEMINI.md reference .gemini/commands/ et .aioson/agents/.',
    gateway_gemini_command_pointer:
      'Le fichier de commande Gemini pointe vers l agent partage : {file}',
    gateway_gemini_command_pointer_hint:
      'Assurez-vous que {file} inclut @{ .aioson/agents/{agent}.md } dans le champ prompt.',
    gateway_opencode_pointer: 'La passerelle OpenCode reference les fichiers partages AIOSON',
    gateway_opencode_pointer_hint:
      'Assurez-vous que OPENCODE.md reference .aioson/config.md et .aioson/agents/.',
    fix_start: 'Mode de correction sure active.',
    fix_start_dry_run: 'Mode de correction sure active (dry-run).',
    fix_action_required_files: 'Restaurer les fichiers geres manquants depuis le template',
    fix_action_gateway_contracts:
      'Restaurer les fichiers de contrat de passerelle casses depuis le template',
    fix_action_locale_sync: 'Synchroniser les prompts actifs des agents avec la langue du contexte',
    fix_not_applicable: 'Non applicable pour l etat actuel.',
    fix_target_count: 'Cibles identifiees : {count}',
    fix_applied_count: 'Modifications appliquees : {count}',
    fix_planned_count: 'Modifications planifiees : {count}',
    fix_locale: 'Locale resolu : {locale}',
    fix_summary: 'Modifications de correction sure appliquees : {count}',
    fix_summary_dry_run: '[dry-run] Modifications de correction sure planifiees : {count}'
  },
  i18n_add: {
    usage_error: 'Utilisation : aioson i18n:add <locale> [--force] [--dry-run] [--locale=fr]',
    invalid_locale: 'Code locale invalide : {locale}. Formats attendus comme en, fr, pt-br.',
    base_locale: 'Le locale "en" est le dictionnaire de base et ne peut pas etre genere.',
    locale_exists: 'Le fichier locale existe deja : {path}. Utilisez --force pour ecraser.',
    dry_run_created: '[dry-run] Le scaffold locale serait cree : {locale}',
    dry_run_overwritten: '[dry-run] Le scaffold locale serait ecrase : {locale}',
    created: 'Scaffold locale cree : {locale}',
    overwritten: 'Scaffold locale ecrase : {locale}',
    file_path: 'Fichier locale : {path}',
    next_steps: 'Etapes suivantes :',
    step_translate: '1. Remplacez les chaines anglaises par du texte traduit dans ce fichier.',
    step_try: '2. Lancez la CLI avec --locale={locale} pour valider le nouveau dictionnaire.'
  },
  agents: {
    list_title: 'Agents disponibles (locale resolu : {locale}) :',
    path: 'Chemin',
    active_path: 'Chemin actif',
    depends: 'Depend de',
    output: 'Sortie',
    agent_line: '- Agent : {label} - {command} ({id})',
    path_line: '  Chemin : {path}',
    active_path_line: '  Chemin actif : {path}',
    depends_line: '  Depend de : {value}',
    output_line: '  Sortie : {value}',
    none: 'aucun',
    prompt_usage_error:
      'Utilisation : aioson agent:prompt <agent> [path] [--tool=codex|claude|gemini|opencode] [--lang=en|pt-BR|es|fr] [--locale=fr]',
    prompt_unknown_agent: 'Agent inconnu : {agent}',
    prompt_invalid_target_mode:
      'Mode cible pentester invalide : {mode}. Utilisez framework_target ou app_target.',
    prompt_missing_feature_for_app_target:
      'Pentester app_target exige --feature=<slug> (ou --slug=<slug>).',
    prompt_missing_scope_for_app_target:
      'Pentester app_target exige --scope=<area>.',
    prompt_title: 'Prompt pour l agent "{agent}" sur l outil "{tool}" (locale : {locale}) :'
  },
  context_validate: {
    missing_file: 'Fichier de contexte introuvable : {path}',
    hint_setup: 'Executez @setup pour generer le fichier.',
    invalid_frontmatter: 'Le fichier de contexte contient un frontmatter YAML invalide.',
    file_path: 'Fichier de contexte : {path}',
    parse_reason_unknown: 'inconnu',
    parse_reason_missing_frontmatter: 'delimiteur de frontmatter initial manquant',
    parse_reason_unclosed_frontmatter: 'bloc de frontmatter non ferme',
    parse_reason_invalid_frontmatter_line: 'syntaxe invalide sur une ligne de frontmatter',
    parse_reason: 'Raison du parse : {reason}',
    hint_fix_frontmatter: 'Utilisez @setup pour regenerer un fichier de contexte valide.',
    invalid_fields: 'Le fichier de contexte est parse mais comporte des problemes de validation :',
    issue_line: '- {issue}',
    valid: 'Le fichier de contexte est valide.'
  },
  context_pack: {
    generated: 'Context pack ecrit dans : {path}',
    no_matches: 'Aucun fichier de contexte pertinent n a encore ete selectionne. Lancez setup/context/scan avant de packer.',
    selected_title: 'Fichiers inclus dans le pack :',
    selected_line: '  {index}. {path} — {reason}',
    hint_use: 'Utilisez {path} comme contexte minimal de depart dans votre session IA.'
  },
  setup: {
    installing: 'Installation du template AIOSON...',
    installed: 'Template installe ({count} fichiers).',
    no_framework_detected: 'Aucun framework detecte dans ce repertoire (projet vierge).',
    framework_detected: 'Framework detecte : {framework} (installe={installed})',
    writing_context: 'Ecriture du contexte du projet...',
    done: 'Setup termine.',
    step_agents: '  Etape suivante : ouvrez votre client IA et activez @setup pour confirmer ou ajuster le contexte.',
    step_agent_prompt: '  Ou executez : aioson agent:prompt setup . --tool={tool}',
    q_project_name: 'Nom du projet',
    q_framework: 'Framework / stack principal (ex : Python, Node, Laravel, Django)',
    q_lang: 'Langue pour les reponses des agents (ex : en, pt-BR, es, fr)',
    q_confirm_framework: 'Utiliser le framework detecte ? (true/false)',
    q_override_framework: 'Framework',
    q_framework_installed: 'Framework installe ? (true/false)'
  },
  setup_context: {
    detected: 'Framework detecte : {framework} (installed={installed})',
    q_project_name: 'Nom du projet',
    q_project_type: 'Type de projet (web_app|api|site|script|dapp|desktop_app)',
    q_profile: 'Profil : [1] developer [2] beginner [3] team',
    q_use_detected_framework: 'Utiliser le framework detecte ? (true/false)',
    q_framework: 'Framework',
    q_framework_installed: 'Framework installe ? (true/false)',
    q_language: 'Langue de conversation (par exemple en ou pt-BR)',
    q_backend_menu:
      'Backend: [1] Laravel [2] Rails [3] Django [4] Node/Express [5] Next.js [6] Nuxt [7] Hardhat [8] Foundry [9] Truffle [10] Anchor [11] Solana Web3 [12] Cardano [13] Other',
    q_backend_text: 'Backend (texte libre)',
    q_laravel_version: 'Version Laravel (par exemple 11, 10)',
    q_frontend_menu:
      'Frontend: [1] TALL Stack [2] VILT Stack [3] Blade [4] Next.js [5] Nuxt [6] React [7] Vue [8] Other',
    q_frontend_text: 'Frontend (texte libre)',
    q_auth_menu:
      'Auth (Laravel): [1] Breeze [2] Jetstream + Livewire [3] Filament Shield [4] Custom',
    q_web3_enabled: 'Web3 active ? (true/false)',
    q_web3_networks: 'Reseaux Web3 (par exemple ethereum, solana, cardano)',
    q_contract_framework: 'Framework de contrats (par exemple Hardhat, Foundry, Anchor, Aiken)',
    q_wallet_provider: 'Fournisseur wallet (par exemple wagmi, RainbowKit, Phantom, Lace)',
    q_indexer: 'Indexer (par exemple The Graph, Helius, Blockfrost)',
    q_rpc_provider: 'Fournisseur RPC (par exemple Alchemy, Infura, QuickNode)',
    q_jetstream_teams: 'Jetstream teams active ? (true/false)',
    q_jetstream_existing_action:
      'Projet Laravel existant sans Jetstream detecte. Action : [1] continuer sans Jetstream [2] recreer avec Jetstream (recommande) [3] installation manuelle (risque)',
    q_auth_text: 'Approche d authentification (texte libre)',
    q_uiux_menu: 'UI/UX: [1] Tailwind [2] Flux UI [3] shadcn/ui [4] Filament',
    q_uiux_text: 'Approche UI/UX (texte libre)',
    q_database_menu:
      'Base de donnees: [1] MySQL [2] PostgreSQL [3] SQLite [4] MongoDB [5] Supabase [6] PlanetScale',
    q_database_text: 'Base de donnees (texte libre)',
    q_services_list:
      'Services additionnels (liste separee par virgules) : queues, storage, websockets, payments, email, cache, search',
    q_rails_options:
      'Options utilisees dans Rails (liste separee par virgules, ex. --database=postgresql,--css=tailwind,--api)',
    q_next_options:
      'Options create-next-app (liste separee par virgules, ex. TypeScript,ESLint,Tailwind CSS,App Router,src/ directory)',
    q_beginner_summary: 'Decrivez votre projet en une phrase',
    q_beginner_users:
      'Utilisateurs attendus : [1] personnel/petit jusqu a 10 [2] petite equipe jusqu a 100 [3] clients externes',
    q_beginner_mobile: 'Besoin mobile : [1] app mobile [2] web responsive [3] desktop uniquement',
    q_beginner_hosting: 'Preference d hebergement : [1] gere simple [2] VPS [3] cloud provider',
    q_beginner_accept_recommendation: 'Accepter la recommandation initiale ? (true/false)',
    beginner_recommendation:
      'Recommandation initiale -> framework: {framework}, frontend: {frontend}, database: {database}, auth: {auth}',
    q_user_types: 'Combien de types d utilisateurs ?',
    q_integrations: 'Combien d integrations externes ?',
    q_rules_complexity: 'Complexite des regles (none|some|complex)',
    note_status_enabled: 'active',
    note_status_disabled: 'desactive',
    note_jetstream_teams: 'Jetstream teams : {status}',
    note_selected_services: 'Services selectionnes : {services}',
    note_rails_setup_flags: 'Flags de setup Rails : {flags}',
    note_next_setup_flags: 'Flags de setup Next.js : {flags}',
    note_next_create_flags: 'Flags create-next-app : {flags}',
    note_jetstream_existing_action:
      'Action pour projet existant avec Jetstream : {action}',
    note_mobile_first:
      'Besoin mobile-first detecte ; envisagez React Native/Expo en etape suivante.',
    note_vps_preference:
      'Preference VPS detectee ; gardez des scripts de deploiement simples et reproductibles.',
    note_cloud_profile:
      'Profil cloud detecte ; utilisez base geree et object storage des le depart.',
    note_web3_terms:
      'Termes Web3 detectes ; recommandation initiale dApp appliquee.',
    note_starter_profile:
      'Cette recommandation est un profil de depart ; ajustez-la quand les besoins seront plus clairs.',
    note_team_profile:
      'Profil equipe selectionne ; preservez des conventions d equipe explicites et des regles CI.',
    note_beginner_declined:
      'Recommandation initiale refusee ; utilisation d une stack personnalisee issue de l onboarding.',
    note_monorepo:
      'Monorepo detecte : framework Web3 et framework applicatif coexistent. Confirmer le framework principal avec l utilisateur et documenter la structure dans Notes.',
    written: 'Fichier contexte ecrit : {path}',
    classification_result: 'Classification : {classification} (score={score}/6)',
    locale_applied: 'Langue d interaction synchronisee : {locale} ({count} prompts d agent restaures)'
  },
  locale_apply: {
    applied: 'Langue d interaction synchronisee : {locale}',
    dry_run_applied: '[dry-run] La langue d interaction serait synchronisee : {locale}',
    copied_count: 'Fichiers copies : {count}',
    missing_count: 'Fichiers locale manquants : {count}',
    copy_line: '  Fichier : {source} -> {target}'
  },
  smoke: {
    start: 'Execution du smoke test dans : {projectDir}',
    using_web3_profile: 'Utilisation du profil smoke Web3 : {target}',
    using_mixed_profile: 'Utilisation du profil monorepo mixte Web2+Web3.',
    using_parallel_profile: 'Utilisation du profil smoke d orchestration parallele.',
    seeded_web3_workspace: 'Workspace initialise pour la cible Web3 : {target}',
    seeded_mixed_workspace: 'Workspace initialise pour le profil mixte Web2+Web3.',
    seeded_parallel_context: 'Contexte discovery/architecture/prd initialise pour le profil parallele.',
    step_ok: 'OK : {step}',
    web3_detected: 'Framework Web3 detecte : {framework} ({network})',
    web3_context_verified: 'Contexte Web3 verifie pour le reseau : {network}',
    mixed_context_verified: 'Contexte du profil mixte verifie (framework : {framework}).',
    parallel_status_verified: 'Statut parallele verifie pour les lanes : {count}',
    invalid_web3_target: 'Valeur --web3 invalide : {target}. Utilisez ethereum, solana ou cardano.',
    invalid_profile:
      'Valeur --profile invalide : {profile}. Utilisez standard, mixed ou parallel.',
    profile_conflict: 'Ne combinez pas --profile=mixed avec --web3. Choisissez un seul mode.',
    assert_install_files: 'install a copie zero fichier',
    assert_web3_framework: 'detection inattendue du framework web3 : {framework}',
    assert_setup_written: 'setup:context n a pas ecrit le fichier de contexte',
    assert_setup_project_type_dapp: 'setup n a pas infere project_type=dapp',
    assert_setup_web3_network: 'setup n a pas infere le reseau web3 attendu',
    assert_setup_web3_framework: 'setup n a pas conserve le framework web3 attendu',
    assert_mixed_project_type_dapp: 'le profil mixed n a pas infere project_type=dapp',
    assert_mixed_web3_enabled: 'le profil mixed n a pas infere web3_enabled=true',
    assert_mixed_framework: 'le profil mixed n a pas privilegie le framework web3 attendu',
    assert_locale_apply_files: 'locale:apply a copie zero fichier',
    assert_agents_count: 'la commande agents a retourne un nombre inattendu',
    assert_prompt_path: 'agent:prompt n a pas inclus le chemin attendu',
    assert_context_validate: 'context:validate a echoue',
    assert_web3_context_valid: 'echec du parse du contexte web3',
    assert_web3_context_project_type: 'project_type du contexte n est pas dapp',
    assert_web3_context_enabled: 'web3_enabled du contexte n est pas true',
    assert_web3_context_network:
      'web3_networks du contexte n inclut pas la cible attendue',
    assert_doctor_ok: 'la verification doctor a echoue',
    assert_parallel_init_ok: 'parallel:init a echoue',
    assert_parallel_init_workers: 'les workers de parallel:init ne correspondent pas',
    assert_parallel_assign_ok: 'parallel:assign a echoue',
    assert_parallel_assign_scope: 'parallel:assign n a produit aucun scope',
    assert_parallel_status_ok: 'parallel:status a echoue',
    assert_parallel_status_lanes: 'le nombre de lanes dans parallel:status ne correspond pas',
    assert_parallel_doctor_ok: 'parallel:doctor a echoue',
    assert_parallel_doctor_summary: 'parallel:doctor a signale des echecs',
    completed: 'Smoke test termine avec succes.',
    steps_count: 'Etapes validees : {count}',
    workspace_kept: 'Workspace conserve : {path}',
    workspace_removed: 'Workspace supprime : {path}'
  },
  package_test: {
    start: 'Execution du test package depuis la source : {sourceDir}',
    pack_done: 'Tarball package cree : {tarball}',
    completed: 'Test package termine avec {count} etapes validees.',
    workspace: 'Workspace du test package : {path}',
    error_unknown_detail: 'erreur inconnue',
    error_npm_pack: 'npm pack a echoue : {detail}',
    error_tarball_missing: 'npm pack n a pas retourne le nom du tarball',
    error_npx_init: 'npx init a echoue : {detail}',
    error_npx_setup_context: 'npx setup:context a echoue : {detail}',
    error_npx_doctor: 'npx doctor a echoue : {detail}',
    error_doctor_not_ok: 'doctor a retourne ok=false pendant le test package',
    error_npx_mcp_init: 'npx mcp:init a echoue : {detail}',
    error_mcp_not_ok: 'mcp:init a retourne ok=false pendant le test package'
  },
  workflow_plan: {
    context_missing:
      'Fichier contexte introuvable. Utilisation du workflow de secours selon la classification fournie/par defaut.',
    title: 'Workflow recommande pour la classification {classification} :',
    notes: 'Notes :',
    command_line: '  Commande : {command}',
    note_line: '  Note : {note}',
    note_framework_not_installed:
      'Le framework n est pas encore installe ; terminez l installation du stack avant @dev.',
    note_dapp_context:
      'Contexte dApp detecte ; incluez les skills Web3 pendant @architect et @dev.',
    note_micro_scope:
      'Gardez un scope d implementation minimal et evitez les agents optionnels.',
    note_product_optional:
      '@product est optionnel pour MICRO — passez directement a @dev si l idee est deja claire.',
    note_feature_flow:
      'Flux nouvelle feature (apres configuration initiale) : @product → @analyst → @dev → @qa. Pas de @setup.'
  },
  parallel_init: {
    context_missing:
      'Fichier de contexte introuvable : {path}. Executez setup:context avant.',
    context_invalid: 'Fichier de contexte invalide ou non parseable : {path}.',
    classification_unknown: 'inconnue',
    requires_medium:
      'L initialisation parallele est prise en charge uniquement pour la classification MEDIUM (actuelle : {classification}). Utilisez --force pour forcer.',
    invalid_workers:
      'Valeur --workers invalide. Utilisez un entier entre {min} et {max}.',
    already_exists:
      'Les fichiers de contexte parallele existent deja ({count}). Utilisez --force pour ecraser.',
    prepared: 'Workspace parallele initialise dans : {path}',
    dry_run_prepared: '[dry-run] Le workspace parallele serait initialise dans : {path}',
    workers_count: 'Workers : {count}',
    files_count: 'Fichiers prepares : {count}',
    missing_prereq_count: 'Fichiers de contexte prerequis manquants : {count}',
    file_line: '  Fichier : {file}'
  },
  parallel_doctor: {
    prefix_ok: 'OK',
    prefix_warn: 'AVERT',
    prefix_fail: 'ECHEC',
    check_line: '[{prefix}] {id} - {message}',
    hint_line: '  Astuce : {hint}',
    invalid_workers:
      'Valeur --workers invalide. Utilisez un entier entre {min} et {max}.',
    classification_unknown: 'inconnue',
    requires_medium:
      'Le mode fix de parallel doctor exige la classification MEDIUM (actuelle : {classification}). Utilisez --force pour forcer.',
    report_title: 'Rapport parallel doctor : {path}',
    summary: 'Resume : {passed} valides, {failed} echecs, {warnings} avertissements.',
    fix_summary: 'Corrections paralleles appliquees : {count}',
    fix_summary_dry_run: '[dry-run] Corrections paralleles planifiees : {count}',
    check_context_exists_ok: 'project.context.md existe.',
    check_context_exists_missing: 'project.context.md est manquant.',
    check_context_exists_hint: 'Executez setup:context avant parallel doctor.',
    check_context_parsed_ok: 'project.context.md est parseable.',
    check_context_parsed_invalid: 'project.context.md est invalide.',
    check_context_parsed_hint:
      'Corrigez le frontmatter du contexte avant d executer parallel doctor.',
    check_context_classification_ok:
      'Mode parallele autorise pour la classification {classification}.',
    check_context_classification_invalid:
      'Mode parallele exige la classification MEDIUM (actuelle : {classification}).',
    check_context_classification_hint:
      'Utilisez --force pour outrepasser la regle de classification.',
    check_parallel_dir_ok: 'Le repertoire .aioson/context/parallel existe.',
    check_parallel_dir_missing: 'Le repertoire .aioson/context/parallel est manquant.',
    check_parallel_dir_hint: 'Executez parallel:init ou parallel:doctor --fix.',
    check_parallel_shared_ok: 'shared-decisions.md est present.',
    check_parallel_shared_missing: 'shared-decisions.md est manquant.',
    check_parallel_shared_hint:
      'Executez parallel:doctor --fix pour restaurer les fichiers de base.',
    check_parallel_manifest_ok: 'workspace.manifest.json est present.',
    check_parallel_manifest_missing: 'workspace.manifest.json est manquant.',
    check_parallel_manifest_hint:
      'Executez parallel:doctor --fix pour restaurer le manifest du workspace.',
    check_parallel_ownership_ok: 'ownership-map.json est present.',
    check_parallel_ownership_missing: 'ownership-map.json est manquant.',
    check_parallel_ownership_hint:
      'Executez parallel:doctor --fix pour restaurer la carte d ownership.',
    check_parallel_merge_ok: 'merge-plan.json est present.',
    check_parallel_merge_missing: 'merge-plan.json est manquant.',
    check_parallel_merge_hint:
      'Executez parallel:doctor --fix pour restaurer le plan de merge.',
    check_machine_sync_ok:
      'Les artefacts paralleles machine-readable sont synchronises avec les fichiers de lane.',
    check_machine_sync_stale:
      'Les artefacts paralleles machine-readable sont stale : {files}.',
    check_machine_sync_hint:
      'Executez parallel:doctor --fix pour reconstruire les artefacts stale.',
    check_ownership_conflicts_ok:
      'Aucun conflit d ownership n a ete detecte entre les scopes des lanes.',
    check_ownership_conflicts_found:
      '{count} conflit(s) d ownership a/ont ete detecte(s) entre les scopes des lanes.',
    check_ownership_conflicts_hint:
      'Ajustez l ownership pour que chaque scope key appartienne a une seule lane.',
    check_write_scope_present_ok:
      'Toutes les lanes avec un scope attribue declarent aussi des write_paths.',
    check_write_scope_present_missing:
      '{count} lane(s) avec un scope attribue ne declarent toujours pas de write_paths.',
    check_write_scope_present_hint:
      'Declarez des chemins relatifs au projet ou des prefixes recursifs (par exemple src/auth/**) dans le bloc Ownership de chaque lane.',
    check_write_scope_valid_ok:
      'Tous les write_paths declares utilisent des patterns supportes.',
    check_write_scope_valid_invalid:
      '{count} pattern(s) invalide(s) de write_paths a/ont ete detecte(s).',
    check_write_scope_valid_hint:
      'Utilisez des chemins relatifs exacts au projet ou des patterns recursifs se terminant par /**.',
    check_write_scope_conflicts_ok:
      'Aucun chevauchement de write_paths n a ete detecte entre les lanes.',
    check_write_scope_conflicts_found:
      '{count} chevauchement(s) de write_paths a/ont ete detecte(s) entre les lanes.',
    check_write_scope_conflicts_hint:
      'Decoupez l ownership pour que chaque pattern de chemin appartienne a une seule lane.',
    check_dependencies_valid_ok:
      'Toutes les dependances declarees entre lanes pointent vers des lanes valides.',
    check_dependencies_valid_invalid:
      '{count} reference(s) invalide(s) de dependance entre lanes a/ont ete detectee(s).',
    check_dependencies_valid_hint:
      'Utilisez des references lane-N uniquement pour des lanes existantes ou deplacez la coordination partagee vers shared-decisions.',
    check_dependencies_blocked_ok:
      'Aucune lane n est actuellement bloquee par une dependance incomplete.',
    check_dependencies_blocked_found:
      '{count} blocage(s) de dependance entre lanes a/ont ete detecte(s) selon le statut actuel.',
    check_dependencies_blocked_hint:
      'Terminez les lanes upstream ou remettez la lane dependante a pending avant l execution.',
    check_merge_order_ok:
      'L ordre de merge respecte les dependances declarees entre lanes.',
    check_merge_order_invalid:
      '{count} violation(s) d ordre de merge contre les dependances declarees a/ont ete detectee(s).',
    check_merge_order_hint:
      'Ajustez les merge ranks ou les dependances pour que les lanes upstream soient fusionnees en premier.',
    check_lanes_present_ok: '{count} fichier(s) de lane detecte(s).',
    check_lanes_present_missing: 'Aucun fichier de statut de lane n a ete trouve.',
    check_lanes_present_hint: 'Executez parallel:init ou parallel:doctor --fix.',
    check_lanes_sequence_ok: 'La sequence de lanes est continue (1..{workers}).',
    check_lanes_sequence_missing: 'Fichiers de lane manquants dans la sequence : {lanes}',
    check_lanes_sequence_hint:
      'Executez parallel:doctor --fix pour restaurer les lanes manquantes.',
    check_workers_option: 'Option workers demandee : {workers}.',
    check_prereq_ok: 'Tous les fichiers de contexte prerequis sont presents.',
    check_prereq_missing: '{count} fichier(s) de contexte prerequis manquant(s).',
    check_prereq_hint:
      'Creez les fichiers discovery/architecture/prd avant l orchestration.'
  },
  parallel_assign: {
    invalid_workers:
      'Valeur --workers invalide. Utilisez un entier entre {min} et {max}.',
    context_missing: 'Fichier de contexte introuvable : {path}.',
    context_invalid: 'Fichier de contexte invalide ou non parseable : {path}.',
    classification_unknown: 'inconnue',
    requires_medium:
      'L attribution parallele exige la classification MEDIUM (actuelle : {classification}). Utilisez --force pour forcer.',
    parallel_missing:
      'Repertoire parallele introuvable : {path}. Executez parallel:init avant.',
    no_lanes: 'Aucun fichier de lane trouve dans .aioson/context/parallel.',
    missing_lanes: 'Fichiers de lane manquants pour les workers demandes : {lanes}.',
    source_missing: 'Impossible de resoudre le document source avec --source={source}.',
    applied: 'Attribution de scope parallele appliquee ({count} element(s) de scope).',
    dry_run_applied:
      '[dry-run] Attribution de scope parallele planifiee ({count} element(s) de scope).',
    source_info: 'Document source : {source}',
    workers_count: 'Workers : {count}',
    files_count: 'Fichiers mis a jour : {count}',
    lane_scope_line: '- lane {lane} : {count} element(s) de scope'
  },
  parallel_status: {
    parallel_missing:
      'Repertoire parallele introuvable : {path}. Executez parallel:init avant.',
    no_lanes: 'Aucun fichier de lane trouve dans .aioson/context/parallel.',
    title: 'Rapport de statut parallele : {path}',
    lanes_count: 'Lanes : {count}',
    statuses_title: 'Statuts :',
    status_line: '- {status} : {count}',
    status_pending: 'en_attente',
    status_in_progress: 'en_cours',
    status_completed: 'termine',
    status_merged: 'fusionne',
    status_blocked: 'bloque',
    status_other: 'autre',
    scopes_count: 'Total des elements de scope : {count}',
    deliverables_progress: 'Livrables : {completed}/{total} termines',
    blockers_count: 'Blocages ouverts : {count}',
    shared_decisions: 'Entrees du journal de decisions partagees : {count}',
    ownership_conflicts: 'Conflits d ownership : {count}',
    write_scope_summary:
      'Write scope : lanes_avec_paths={lanes}, chemins={paths}, lanes_avec_scope_sans_path={uncovered}, conflits={conflicts}, invalides={invalid}',
    dependencies_summary:
      'Dependances : declarees={declared}, invalides={invalid}, bloquees={blocked}, violations_d_ordre={orderViolations}',
    sync_summary: 'Drift des fichiers machine-readable : {count}',
    sync_stale_line: '- stale : {file}',
    lane_line: '- lane {lane} : status={status}, scope={scope}, blocages={blockers}'
  },
  parallel_merge: {
    parallel_missing:
      'Repertoire parallele introuvable : {path}. Executez parallel:init avant.',
    no_lanes: 'Aucun fichier de lane trouve dans .aioson/context/parallel.',
    ready: 'Le merge deterministe est pret pour {count} lane(s).',
    applied: 'Le merge deterministe a ete applique sur {count} lane(s).',
    blocked: 'Le merge deterministe est bloque pour {count} lane(s).',
    order: 'Ordre de merge : {order}',
    structural_summary:
      'Verifications structurelles : stale={stale}, conflits_d_ownership={conflicts}, conflits_de_write_scope={writeConflicts}, write_paths_invalides={invalidWritePaths}, dependances_invalides={invalid}, dependances_bloquees={blocked}, violations_d_ordre={orderViolations}',
    lane_line: '- lane {lane} : action={action}, status={status}'
  },
  parallel_guard: {
    invalid_lane: 'Valeur --lane invalide. Utilisez un entier positif.',
    paths_required:
      'Valeur --paths manquante. Fournissez un ou plusieurs chemins relatifs au projet separes par des virgules.',
    parallel_missing:
      'Repertoire parallele introuvable : {path}. Executez parallel:init avant.',
    no_lanes: 'Aucun fichier de lane trouve dans .aioson/context/parallel.',
    lane_missing: 'La lane {lane} n existe pas dans le workspace parallele actuel.',
    allowed: 'Le guard d ecriture a autorise la lane {lane} pour {count} chemin(s).',
    blocked: 'Le guard d ecriture a bloque la lane {lane} pour {count} chemin(s).',
    write_scope_summary:
      'Resume write scope : chemins={paths}, conflits={conflicts}, invalides={invalid}',
    path_line: '- path {path} : status={status}, owners={owners}'
  },
  mcp_init: {
    context_missing:
      'Fichier contexte introuvable. Generation d un plan MCP de base avec hypotheses generiques.',
    invalid_tool: 'Valeur --tool invalide : {tool}. Utilisez une de ces valeurs : {expected}.',
    reason_filesystem: 'Acces local obligatoire au workspace.',
    reason_context7:
      'Utilisez une documentation officielle a jour au moment de l implementation.',
    reason_database_none: 'Aucun stack de base de donnees detecte pour le moment.',
    reason_database_enabled:
      'Le contexte indique des fonctionnalites avec base de donnees (endpoint MCP distant recommande).',
    reason_web_search:
      'Utile pour evaluer les packages et verifier les notes de version.',
    reason_chain_rpc_disabled: 'Web3 est desactive pour ce projet.',
    reason_chain_rpc_enabled: 'Contexte dApp detecte ; acces RPC de chain requis.',
    note_workspace_local: 'Ceci est un preset local de workspace genere par AIOSON.',
    note_replace_placeholders:
      'Remplacez les commandes placeholder par les serveurs MCP que vous utilisez.',
    note_keep_secrets_env:
      'Gardez les secrets dans des variables d environnement, jamais inline tokens.',
    generated: 'Plan MCP ecrit : {path}',
    dry_run_generated: '[dry-run] Le plan MCP serait ecrit : {path}',
    server_count: 'Serveurs MCP dans le plan : {count}',
    preset_count: 'Presets outils generes : {count}',
    preset_written: 'Preset ecrit ({tool}) : {path}',
    preset_dry_run: '[dry-run] Le preset serait ecrit ({tool}) : {path}'
  },
  mcp_doctor: {
    prefix_ok: 'OK',
    prefix_warn: 'AVERT',
    prefix_fail: 'ECHEC',
    check_line: '[{prefix}] {id} - {message}',
    hint_line: '  Astuce : {hint}',
    context_missing: 'project.context.md introuvable.',
    context_missing_hint: 'Executez setup d abord pour une validation MCP basee sur le contexte.',
    context_parse_invalid: 'project.context.md n a pas pu etre parse ({reason}).',
    context_parse_invalid_hint:
      'Corrigez le format du contexte pour activer la validation MCP selon le stack.',
    context_ok: 'project.context.md est disponible et parseable.',
    plan_missing: 'Fichier de plan MCP introuvable (.aioson/mcp/servers.local.json).',
    plan_missing_hint: 'Executez : aioson mcp:init',
    plan_invalid: 'JSON du plan MCP invalide : {error}',
    plan_invalid_hint: 'Regenerez le plan avec : aioson mcp:init',
    plan_ok: 'Le fichier de plan MCP est present et JSON valide.',
    plan_servers_ok: 'Le plan MCP declare {count} definition(s) de serveur.',
    plan_servers_missing: 'Le plan MCP ne contient aucune definition de serveur.',
    plan_servers_hint: 'Regenerez avec : aioson mcp:init',
    core_enabled: 'Le serveur MCP core "{server}" est active.',
    core_missing: 'Le serveur MCP core "{server}" est absent ou desactive.',
    core_missing_hint: 'Regenerez et gardez les serveurs core de base actives.',
    presets_any_ok: '{count} fichier(s) de preset MCP trouve(s).',
    presets_any_missing: 'Aucun fichier de preset MCP trouve.',
    presets_any_hint: 'Executez : aioson mcp:init',
    presets_coverage_partial:
      'Seulement {existing}/{total} presets outils sont presents.',
    presets_coverage_partial_hint:
      'Executez : aioson mcp:init (sans --tool) pour generer tous les presets.',
    presets_coverage_full:
      'Tous les presets outils sont presents (claude, codex, gemini, opencode).',
    env_none_required:
      'Aucune variable d environnement requise dans les serveurs MCP actives.',
    env_missing:
      '{missing}/{total} variable(s) d environnement requise(s) manquante(s) : {vars}',
    env_missing_hint_strict: 'Definissez les variables manquantes avant execution.',
    env_missing_hint_relaxed:
      'Definissez les variables pour une disponibilite runtime complete. Utilisez --strict-env pour echouer sur ce controle.',
    env_all_present: 'Toutes les variables requises sont disponibles ({count}).',
    compat_database_ok:
      'Database MCP correspond au moteur de stack du contexte ({engine}).',
    compat_database_mismatch:
      'Database MCP ne correspond pas completement au stack du contexte ({engine}).',
    compat_database_hint:
      'Regenerez avec : aioson mcp:init, ou ajustez manuellement le serveur database.',
    compat_web3_ok: 'MCP chain-rpc est active pour le contexte Web3.',
    compat_web3_missing:
      'Contexte Web3 detecte, mais chain-rpc MCP est absent ou desactive.',
    compat_web3_missing_hint: 'Regenerez avec : aioson mcp:init',
    compat_web3_unneeded: 'chain-rpc MCP est active, mais le contexte n est pas Web3.',
    compat_web3_unneeded_hint: 'Desactivez chain-rpc si non necessaire.',
    report_title: 'Rapport MCP doctor : {path}',
    summary: 'Resume : {passed} valides, {failed} echecs, {warnings} avertissements.'
  },
  qa_doctor: {
    prefix_ok: 'OK',
    prefix_warn: 'AVERT',
    prefix_fail: 'ECHEC',
    check_line: '[{prefix}] {id} - {message}',
    hint_line: '  Conseil : {hint}',
    report_title: 'Rapport QA doctor : {path}',
    summary: 'Resume : {passed} valides, {failed} echecs, {warnings} avertissements.',
    playwright_ok: 'Playwright est installe.',
    playwright_missing: 'Package Playwright introuvable.',
    playwright_missing_hint: 'Executez : npm install -g playwright && npx playwright install chromium',
    chromium_ok: 'Binaire Chromium trouve.',
    chromium_missing: 'Binaire Chromium introuvable.',
    chromium_missing_hint: 'Executez : npx playwright install chromium',
    config_ok: 'aios-qa.config.json trouve et valide.',
    config_missing: 'aios-qa.config.json introuvable.',
    config_missing_hint: 'Executez : aioson qa:init --url=<url-de-votre-app>',
    config_invalid: 'aios-qa.config.json n est pas un JSON valide : {error}',
    url_ok: 'URL cible accessible ({url}).',
    url_missing: 'Aucune URL configuree dans aios-qa.config.json.',
    url_missing_hint: 'Executez : aioson qa:init --url=<url-de-votre-app>',
    url_unreachable: 'URL cible inaccessible ({url}) : {error}',
    url_unreachable_hint: 'Demarrez votre application avant d executer qa:run ou qa:scan.',
    context_ok: 'project.context.md trouve — les tests seront enrichis avec le contexte du projet.',
    context_missing: 'project.context.md introuvable — execution en mode generique.',
    prd_ok: 'prd.md trouve — {count} criteres d acceptance mappes en scenarios de test.',
    prd_missing: 'prd.md introuvable — le mappage de couverture AC sera ignore.'
  },
  qa_init: {
    context_found: 'Contexte trouve : projet={name}, url={url}',
    prd_found: 'prd.md trouve — {count} criteres d acceptance extraits en scenarios de test.',
    prd_missing: 'prd.md introuvable — aucun scenario AC genere.',
    generated: 'Configuration QA ecrite : {path}',
    dry_run_generated: '[dry-run] La configuration QA serait ecrite : {path}',
    scenarios_count: 'Scenarios de test issus du prd.md : {count}',
    personas_count: 'Personas activees : {count} (naive, hacker, power, mobile)',
    probes_count: 'Sondes de securite activees : {count}',
    next_steps: 'Prochaines etapes :',
    step_doctor: '1. Verifier les prerequis : aioson qa:doctor',
    step_run: '2. Lancer les tests navigateur : aioson qa:run'
  },
  qa_run: {
    playwright_missing: 'Playwright non installe. Executez : npm install -g playwright && npx playwright install chromium',
    config_missing: 'aios-qa.config.json introuvable. Executez : aioson qa:init --url=<url-de-votre-app>',
    url_missing: 'Aucune URL configuree. Ajoutez url dans aios-qa.config.json ou utilisez --url=<app-url>.',
    starting: 'Demarrage de la session QA navigateur : {url}',
    persona_start: 'Execution de la persona : {persona}',
    persona_done: 'Persona "{persona}" terminee — {count} finding(s)',
    accessibility: 'Audit d accessibilite en cours...',
    performance: 'Capture des metriques de performance...',
    ac_scenarios: 'Documentation de la couverture AC...',
    done: 'Session QA terminee.',
    report_written: 'Rapport ecrit : {path}',
    json_written: 'Rapport JSON ecrit : {path}',
    screenshots_dir: 'Captures sauvegardees dans : {path}',
    findings_summary: 'Findings : {critical} critique(s), {high} eleve(s), {medium} moyen(s), {low} faible(s)',
    html_report_written: 'Rapport HTML ecrit : {path}'
  },
  qa_scan: {
    playwright_missing: 'Playwright non installe. Executez : npm install -g playwright && npx playwright install chromium',
    config_missing: 'aios-qa.config.json introuvable. Executez : aioson qa:init --url=<url-de-votre-app>',
    url_missing: 'Aucune URL configuree. Ajoutez url dans aios-qa.config.json ou utilisez --url=<app-url>.',
    starting: 'Demarrage du scan autonome : {url}',
    crawling: 'Exploration des routes (profondeur max {depth}, max {pages} pages)...',
    routes_found: 'Routes decouvertes : {count}',
    scanning_route: 'Scan en cours : {route}',
    done: 'Scan autonome termine.',
    report_written: 'Rapport ecrit : {path}',
    findings_summary: 'Findings : {critical} critique(s), {high} eleve(s), {medium} moyen(s), {low} faible(s)',
    html_report_written: 'Rapport HTML ecrit : {path}'
  },
  qa_report: {
    not_found: 'Aucun rapport QA trouve. Executez : aioson qa:run ou aioson qa:scan',
    html_report_written: 'Rapport HTML ecrit : {path}'
  },
  web_map: {
    url_missing: 'Option obligatoire manquante : --url=<url>.',
    starting: 'Cartographie du site : {url}',
    pages_found: 'Pages decouvertes : {count}',
    page_line: '- {url} | profondeur={depth} | statut={status} | liens={links}',
    done: 'Cartographie web terminee.',
    failed: 'Echec de la cartographie web : {error}'
  },
  web_scrape: {
    url_missing: 'Option obligatoire manquante : --url=<url>.',
    invalid_format: 'Valeur invalide pour --format : {format}. Utilisez markdown, text, html ou links.',
    fetching: 'Recuperation de la page : {url}',
    title_line: 'Titre : {title}',
    status_line: 'Statut : {status} | Content-Type : {type}',
    done: 'Web scrape termine ({format}).',
    failed: 'Echec du web scrape : {error}'
  },
  config: {
    usage_error:
      'Utilisation : aioson config <set KEY=value|show|get KEY> [--json] [--locale=fr]',
    set_ok: 'Cle configuree : {key} (sauvegardee dans {path})',
    show_header: 'Config globale : {path}',
    show_empty: '  (aucune cle configuree)',
    show_line: '  {key} = {value}',
    get_line: '{key} = {value}',
    key_not_found: 'Cle introuvable : {key}'
  },
  squad_status: {
    no_squad: 'Aucun squad trouve.',
    hint: 'Utilisez @squad dans votre session IA pour constituer un squad.',
    squads_found: '{count} squad(s) trouves :',
    most_recent: '(plus recent)',
    squad_item: '  [{file}]{marker}',
    name: '    Squad        : {value}',
    mode: '    Mode         : {value}',
    goal: '    Objectif     : {value}',
    agents: '    Agents       : {specialists} specialistes / {total} total ({path})',
    sessions: '    Sessions     : {count} ({path})',
    latest_html: '    Latest HTML  : {value}',
    logs: '    Logs         : {count} ({path})',
    genomes: '    Genomes      : {count} niveau squad / {agent_count} liens agent'
  },
  scan_project: {
    scanning: 'aioson scan:project — analyse de {dir}',
    folder_required:
      'Passez --folder=<chemin[,chemin2]> pour generer des scans complets de dossiers precis. Exemple : --folder=src ou --folder=app.',
    folder_required_examples_title: '\x1b[33mGuide rapide :\x1b[0m',
    folder_required_example_local:
      '  Cartes locales  : aioson scan:project . --folder=src',
    folder_required_example_multi:
      '  Plusieurs dossiers : aioson scan:project . --folder=src,app',
    folder_required_example_llm:
      '  API automatique : aioson scan:project . --folder=src --with-llm --provider=openai',
    folder_required_example_cli:
      '  Sans API LLM    : aioson scan:project . --folder=src  -> puis lancez @analyst dans Codex/Claude/Gemini',
    folder_required_example_prompt:
      '  Prompt pret     : aioson agent:prompt analyst --tool=codex',
    folder_required_example_next:
      '  Workflow apres scan complet : @analyst -> @architect -> @dev',
    folder_not_found: 'Le dossier "{folder}" est introuvable dans ce projet. Dossiers de premier niveau detectes : {available}',
    config_missing: '{file} introuvable. Pour utiliser le mode LLM, copiez aioson-models.json et renseignez vos cles API.',
    config_invalid: 'JSON invalide dans aioson-models.json : {error}',
    provider_missing: 'Provider LLM "{provider}" introuvable dans aioson-models.json. Disponibles : {available}',
    provider_info: '  Provider : {provider}',
    model_info: '  Modele   : {model}',
    context_found: '  Contexte : project.context.md trouve',
    context_missing: '  Contexte : project.context.md introuvable (executez aioson setup:context d\'abord)',
    spec_found: '  Spec     : spec.md trouve — memoire de developpement incluse',
    existing_discovery_found: '  Contexte : discovery.md existant trouve dans {path}',
    existing_skeleton_found: '  Contexte : skeleton-system.md existant trouve dans {path}',
    context_update_mode: '  Mode     : update/merge du contexte existant active pour discovery.md + skeleton-system.md',
    context_mode: '  Contexte : context-mode={mode} (valeur recommandee par defaut pour brownfield : merge)',
    local_only: '  LLM      : desactivee par defaut — scan local uniquement (utilisez --with-llm pour generer discovery.md + skeleton-system.md)',
    walking: '  Analyse de la structure du projet...',
    walk_done: '  Fichiers : {files} entrees cartographiees | Fichiers cles : {keys} lus',
    index_written: '  Index    : scan local ecrit dans {path} (mode: {mode})',
    folders_written: '  Dossiers : carte des dossiers ecrite dans {path}',
    folder_written: '  Dossier  : carte complete de {folder} ecrite dans {path}',
    forge_written: '  AIOS     : carte utile de .aioson ecrite dans {path}',
    memory_index_written: '  Memoire  : memory-index.md ecrit dans {path}',
    spec_current_written: '  Memoire  : spec-current.md ecrit dans {path}',
    spec_history_written: '  Memoire  : spec-history.md ecrit dans {path}',
    module_memory_written: '  Module   : memoire ciblee pour {folder} ecrite dans {path}',
    dry_run_done: '[dry-run] Analyserait {treeCount} entrees et {keyCount} fichiers cles — aucun appel LLM.',
    local_done: '  Resultat : scan local termine — index, carte des dossiers, scans demandes et .aioson prets.',
    local_missing: '  Manque   : discovery.md + skeleton-system.md n ont pas encore ete generes dans ce scan local.',
    architecture_note: '  Note     : architecture.md n est pas genere par scan:project ; ce fichier vient ensuite avec @architect.',
    local_paths_title: '\n\x1b[33m  Comment generer discovery maintenant :\x1b[0m',
    local_path_api: '  \x1b[32mChemin A — API automatique\x1b[0m',
    calling_llm: '  Appel de {provider} ({model})...',
    llm_missing_api_key:
      'La cle API du provider "{provider}" n est pas encore configuree dans {file}. Renseignez providers.{provider}.api_key ou choisissez un autre provider avec --provider=...',
    llm_error: 'Appel LLM echoue : {error}',
    gitignore_policy_written:
      '  Gitignore: politique AIOSON mise a jour dans {path} pour ignorer les fichiers geres par le framework',
    gitignore_tracked_note:
      '  Gitignore: si ces fichiers etaient deja suivis par Git avant, il faudra encore un git rm --cached une fois pour qu ils disparaissent du status',
    invalid_llm_output_discovery_empty:
      'La LLM a renvoye un discovery.md vide. Aucun fichier existant n a ete ecrase. Conservez le backup actuel et reessayez avec un modele plus solide ou moins de dossiers par execution.',
    invalid_llm_output_skeleton_empty:
      'La LLM a renvoye un skeleton-system.md vide apres le delimiteur. Aucun fichier existant n a ete ecrase. Reessayez avec un modele plus solide ou un scope plus petit.',
    gitignore_backups_written: '  Gitignore: regle de backup local assuree dans {path}',
    backups_written: '  Backup   : {count} fichier(s) sauvegarde(s) dans {path}',
    discovery_written: 'discovery.md ecrit : {path} ({chars} chars)',
    skeleton_written: 'skeleton-system.md ecrit : {path} ({chars} chars)',
    skeleton_missing: 'Delimiteur skeleton absent de la reponse LLM — skeleton-system.md non ecrit.',
    local_next_steps: '  1. Lancez : aioson scan:project {target} --folder={folders} --with-llm --provider=<provider>',
    local_path_cli: '  \x1b[36mChemin B — Votre AI CLI (sans API dans aioson)\x1b[0m',
    local_cli_step_analyst: '  2. Dans Codex, Claude Code ou un autre client, lancez @analyst — il peut utiliser scan-index.md + scan-folders.md + scan-<dossier>.md pour ecrire discovery.md',
    local_cli_step_prompt_codex: '  3. Si le client ne comprend pas @analyst, generez un prompt pret : aioson agent:prompt analyst --tool=codex',
    local_cli_step_prompt_claude: '  4. Remplacez --tool=codex par --tool=claude ou --tool=gemini si besoin',
    local_cli_step_model_hint: '  5. Si votre client permet de choisir un modele, preferez un modele rapide/moins cher pour cette etape',
    local_workflow_title: '\n\x1b[33m  Apres discovery :\x1b[0m',
    local_step_architect: '  3. Lancez @architect — genere architecture.md a partir du discovery consolide',
    local_step_dev: '  4. Lancez @dev — commencez a coder seulement apres discovery.md + architecture.md',
    next_steps: '\n  Etapes suivantes :',
    step_analyst: '  1. Ouvrez votre session IA et lancez @analyst — revoit discovery.md + skeleton-system.md et consolide le scope courant',
    step_architect: '  2. Lancez @architect — genere architecture.md a partir du discovery consolide',
    step_dev: '  3. Lancez @dev — lit skeleton-system.md d\'abord, puis discovery.md + architecture.md + spec.md'
  },
  squad_investigate: {
    no_runtime: 'Runtime store introuvable. Lancez aioson runtime:init d\'abord.',
    no_investigations: 'Aucune investigation trouvee.',
    not_found: 'Investigation introuvable : {slug}',
    no_report: 'L\'investigation "{slug}" n\'a pas de fichier de rapport.',
    report_missing: 'Fichier de rapport introuvable : {path}',
    show_usage: 'Usage : aioson squad:investigate [path] --sub=show --investigation=<slug>',
    score_usage: 'Usage : aioson squad:investigate [path] --sub=score --investigation=<slug>',
    link_usage: 'Usage : aioson squad:investigate [path] --sub=link --investigation=<slug> --squad=<slug>',
    register_usage: 'Usage : aioson squad:investigate [path] --sub=register --report=<chemin> [--domain=<nom>] [--squad=<slug>]',
    linked: 'Investigation "{investigation}" liee au squad "{squad}".',
    registered: 'Investigation enregistree : {slug} ({path})',
    unknown_sub: 'Sous-commande inconnue : {sub}. Utilisez : list, show, score, link, register.'
  },
  squad_daemon: {
    squad_required: 'Le slug du squad est obligatoire. Utilisez --squad=<slug>.',
    started: 'Daemon demarre pour le squad "{squad}" sur le port {port} ({workers} workers, {cron} cron jobs)',
    webhook_hint: 'Endpoint webhook : POST http://127.0.0.1:{port}/webhook/<worker-slug>',
    stop_hint: 'Appuyez sur Ctrl+C pour arreter.',
    stopping: 'Arret du daemon...',
    start_failed: 'Echec du demarrage du daemon : {error}',
    no_runtime: 'Runtime store non trouve. Executez aioson runtime:init d\'abord.',
    no_daemons: 'Aucun enregistrement de daemon trouve.',
    not_found: 'Aucun enregistrement de daemon pour le squad : {squad}',
    not_running: 'Le daemon du squad "{squad}" n\'est pas en cours d\'execution.',
    signal_sent: 'SIGTERM envoye au daemon de "{squad}" (pid {pid}).',
    process_gone: 'Le processus du daemon de "{squad}" n\'est plus en cours d\'execution.',
    no_logs: 'Aucun journal d\'activite du daemon trouve.',
    unknown_sub: 'Sous-commande inconnue : {sub}. Utilisez : start, status, stop, logs.'
  },

  squad_mcp: {
    squad_required: 'Le slug du squad est obligatoire. Utilisez --squad=<slug>.',
    connectors_title: 'Connecteurs MCP Integres :',
    actions: 'Actions',
    required_config: 'Requis',
    no_integrations: 'Aucune integration configuree pour le squad "{squad}".',
    missing_config: 'Config manquante',
    calls: 'Appels',
    mcp_required: 'Le slug du MCP est obligatoire. Utilisez --mcp=<slug>.',
    connector_required: 'L\'ID du connecteur est obligatoire. Utilisez --connector=<id>.',
    unknown_connector: 'Connecteur inconnu : {connector}. Utilisez --sub=connectors pour lister.',
    configured: 'Integration "{mcp}" configuree avec le connecteur "{connector}" (statut : {status}).',
    still_missing: 'Config env encore manquante : {keys}',
    not_configured: 'L\'integration "{mcp}" n\'est pas configuree.',
    test_missing: 'L\'integration "{mcp}" a une config manquante : {keys}',
    test_ok: 'Integration "{mcp}" ({connector}) — config OK.',
    health_url: 'URL de verification : {url}',
    unknown_sub: 'Sous-commande inconnue : {sub}. Utilisez : status, connectors, configure, test.'
  },

  squad_roi: {
    squad_required: 'Le slug du squad est obligatoire. Utilisez --squad=<slug>.',
    config_saved: 'Config ROI enregistree pour le squad "{squad}".',
    pricing_model: 'Modele tarifaire',
    setup_fee: 'Frais d\'installation',
    monthly_fee: 'Mensualite',
    percentage: 'Pourcentage',
    contract: 'Contrat',
    metric_required: 'La cle et la valeur de la metrique sont obligatoires. Utilisez --key=<nom> --value=<N>.',
    metric_saved: 'Metrique "{key}" = {value} enregistree pour le squad "{squad}".',
    no_metrics: 'Aucune metrique trouvee pour le squad "{squad}".',
    report_title: 'Rapport ROI — {squad}',
    baseline: 'Baseline',
    actual: 'Actuel',
    target: 'Objectif',
    period: 'Periode',
    cost_section: 'Resume des Couts :',
    monthly_cost: 'Cout mensuel effectif',
    exported: 'Rapport exporte vers {file} ({format}).',
    unknown_sub: 'Sous-commande inconnue : {sub}. Utilisez : config, metric, report, export.'
  },

  squad_worker: {
    squad_required: 'Le slug du squad est obligatoire. Utilisez --squad=<slug>.',
    no_workers: 'Aucun worker trouve pour ce squad.',
    run_usage: 'Usage : aioson squad:worker --sub=run --squad=<slug> --worker=<slug> [--input=<json>]',
    test_usage: 'Usage : aioson squad:worker --sub=test --squad=<slug> --worker=<slug>',
    scaffold_usage: 'Usage : aioson squad:worker --sub=scaffold --squad=<slug> --worker=<slug> [--trigger=manual|event|scheduled]',
    not_found: 'Worker non trouve : {worker}',
    invalid_input: 'JSON invalide. Fournissez un JSON valide avec --input.',
    run_success: 'Worker "{worker}" termine avec succes.',
    run_failed: 'Worker "{worker}" echoue : {error}',
    test_passed: 'Worker "{worker}" test reussi.',
    test_failed: 'Worker "{worker}" test echoue : {error}',
    scaffold_created: 'Worker "{worker}" cree dans {path}',
    no_runtime: 'Runtime store non trouve. Executez aioson runtime:init d\'abord.',
    no_logs: 'Aucune execution de worker trouvee.',
    unknown_sub: 'Sous-commande inconnue : {sub}. Utilisez : list, run, test, logs, scaffold.'
  },

  squad_dashboard: {
    started: 'Squad Dashboard en cours sur {url} (port {port})',
    filtered: 'Filtrage sur le squad : {squad}',
    stop_hint: 'Appuyez sur Ctrl+C pour arreter.',
    stopping: 'Arret du Squad Dashboard...',
    port_in_use: 'Le port {port} est deja utilise. Essayez --port=<autre>'
  },
  implementation_plan: {
    not_found: 'Plan d\'implementation introuvable : {file}',
    no_runtime: 'Runtime store introuvable. Lancez aioson runtime:init d\'abord.',
    no_plans: 'Aucun plan d\'implementation enregistre.',
    no_created_date: 'Le plan n\'a pas de date de creation dans le frontmatter — impossible de verifier l\'obsolescence.',
    is_stale: 'Le plan est OBSOLETE — les artefacts source ont change apres la creation du plan.',
    is_fresh: 'Le plan est a jour.',
    checkpoint_usage: 'Usage : aioson plan [path] --sub=checkpoint --feature=<slug> --phase=<N>',
    phase_completed: 'Phase {phase} marquee comme terminee.',
    phase_not_found: 'Phase {phase} introuvable dans le plan.',
    registered: 'Plan d\'implementation enregistre : {planId} ({phases} phases)'
  },
  squad_plan: {
    slug_required: 'Le slug du squad est obligatoire.',
    not_found: 'Plan d\'execution introuvable pour le squad : {slug}',
    no_runtime: 'Runtime store introuvable. Lancez aioson runtime:init d\'abord.',
    no_plan: 'Aucun plan d\'execution enregistre pour le squad : {slug}',
    no_created_date: 'Le plan n\'a pas de date de creation dans le frontmatter — impossible de verifier l\'obsolescence.',
    is_stale: 'Le plan d\'execution est OBSOLETE — les artefacts du squad ont change apres la creation du plan.',
    is_fresh: 'Le plan d\'execution est a jour.',
    checkpoint_usage: 'Usage : aioson squad:plan [path] --sub=checkpoint --squad=<slug> --round=<N>',
    round_completed: 'Round {round} marque comme termine.',
    round_not_found: 'Round {round} introuvable dans le plan.',
    registered: 'Plan d\'execution enregistre : {planSlug} ({rounds} rounds)'
  },

  squad_learning: {
    slug_required: 'Le slug du squad est obligatoire.',
    no_runtime: 'Runtime store introuvable. Lancez aioson runtime:init d\'abord.',
    no_learnings: 'Aucun learning trouve pour le squad : {slug}',
    not_found: 'Learning introuvable : {id}',
    archived_count: '{count} learning(s) marque(s) comme obsolete(s) pour le squad : {slug}',
    promote_usage: 'Usage : aioson squad:learning [path] --sub=promote --squad=<slug> --id=<learning-id> [--to=<chemin-regle>]',
    promoted: 'Learning {id} promu en regle dans {path}'
  },

  learning: {
    no_runtime: 'Runtime store introuvable. Lancez aioson runtime:init d\'abord.',
    no_learnings: 'Aucun learning de projet trouve.',
    not_found: 'Learning introuvable : {id}',
    promote_usage: 'Usage : aioson learning [path] --sub=promote --id=<learning-id> [--to=<chemin-regle>]',
    promoted: 'Learning {id} promu en regle dans {path}'
  },

  auth: {
    login_no_token: 'Aucun token fourni. Obtenez le v\u00f4tre sur : {url}',
    login_hint: 'Lancez : aioson auth:login --token=<votre-token>',
    login_verifying: 'V\u00e9rification du token...',
    login_ok: 'Connect\u00e9 en tant que {username}. Token enregistr\u00e9 dans {path}.',
    login_saved: 'Token enregistr\u00e9 dans {path}. (Impossible de v\u00e9rifier \u2014 l\'API est peut-\u00eatre hors ligne.)',
    logout_ok: 'D\u00e9connect\u00e9. Token supprim\u00e9.',
    status_not_authenticated: 'Non authentifi\u00e9.',
    status_checking: 'V\u00e9rification du token...',
    status_ok: 'Authentifi\u00e9 en tant que {username}.',
    status_token_offline: 'Token enregistr\u00e9 (dernier utilisateur connu : {username}). API hors ligne ou inaccessible.'
  },

  workspace: {
    registering: 'Enregistrement du workspace sur aioson.com...',
    init_ok: 'Workspace "{slug}" li\u00e9.\n  Local : {path}\n  En ligne : {url}',
    already_linked: 'Workspace d\u00e9j\u00e0 li\u00e9 : {slug}\n  En ligne : {url}',
    not_linked: 'Aucun workspace li\u00e9 \u00e0 ce projet.',
    init_hint: 'Lancez : aioson workspace:init',
    status_slug: 'Workspace : {slug}',
    status_id: 'ID : {id}',
    status_url: 'URL : {url}',
    status_created: 'Cr\u00e9\u00e9 le : {date}',
    open_url: 'Ouvrir dans le navigateur : {url}'
  },

  store: {
    error_not_authenticated: 'Non authentifi\u00e9. Lancez : aioson auth:login --token=<votre-token>',
    error_missing_slug: '--slug manquant.',
    error_missing_code_or_slug: 'Fournissez un slug (--slug=X) ou un code d\'installation.',
    error_invalid_response: 'R\u00e9ponse invalide de aioson.com.',
    error_genome_not_found: 'Genome "{slug}" introuvable dans {path}.',
    error_skill_not_found: 'Skill "{slug}" introuvable dans .aioson/skills/ ou .aioson/installed-skills/.',
    error_skill_missing_skillmd: 'La skill "{slug}" n\'a pas de SKILL.md.',
    error_squad_not_found: 'Squad "{slug}" introuvable dans {path}.',

    publish_dry_run: '[dry-run] Publierait {type} "{slug}" (visibilit\u00e9 : {visibility}).',
    publish_genome_validating: 'Validation du genome...',
    publish_genome_sending: 'Envoi vers aioson.com...',
    publish_genome_done: 'Publi\u00e9 : aioson.com/store/genomes/{slug}\n  Installer : aioson genome:install --slug={slug}',
    publish_skill_collecting: 'Collecte des fichiers de la skill...',
    publish_skill_files: '  Fichiers : {count}',
    publish_skill_sending: 'Envoi de {count} fichier(s) vers aioson.com...',
    publish_skill_done: 'Publi\u00e9 : aioson.com/store/skills/{slug}\n  Installer : aioson skill:install --slug={slug}',
    publish_squad_analyzing_agents: 'Analyse des agents...',
    publish_squad_agents_found: '  Agents : {count}',
    publish_squad_analyzing_deps: 'Analyse des d\u00e9pendances...',
    publish_squad_bundling_skill: '  Empaquetage de la skill : {slug}',
    publish_squad_skill_missing: '  Skill introuvable (ignor\u00e9e) : {slug}',
    publish_squad_bundling_genome: '  Empaquetage du genome : {slug}',
    publish_squad_genome_missing: '  Genome introuvable (ignor\u00e9) : {slug}',
    publish_squad_sending: 'Envoi vers aioson.com...',
    publish_squad_done: 'Publi\u00e9 : aioson.com/store/squads/{slug}\n  Installer : aioson squad:install --slug={slug}',
    publish_squad_summary: '  Agents : {agents} | Skills empaquetées : {skills} | Genomes empaquetés : {genomes}',

    install_genome_fetching: 'R\u00e9cup\u00e9ration du genome "{ref}" depuis aioson.com...',
    install_genome_done: 'Genome "{slug}" install\u00e9 dans {path}.',
    install_backing_up: '  Sauvegarde : {path}',
    install_squad_fetching: 'R\u00e9cup\u00e9ration du squad "{ref}" depuis aioson.com...',
    install_squad_writing: 'Installation des fichiers...',
    install_squad_dep_skip: '  {type} "{slug}" d\u00e9j\u00e0 install\u00e9 \u2014 ignor\u00e9 (utilisez --force pour remplacer).',
    install_squad_done: 'Squad "{slug}" install\u00e9 dans {path}.',

    list_genome_empty: 'Aucun genome install\u00e9 dans ce projet.',
    list_genome_header: '{count} genome(s) install\u00e9(s) :',
    list_genome_item: '  {slug}{version}',
    list_genome_item_v2: '  {folderMarker} {advisorMarker} {slug}  {name}  {track}{fidelity}{advisor}',
    list_genome_conflict_warn: '\u26a0\ufe0f  {slug}: les deux formats (dossier et fichier unique) existent ; le dossier a la priorit\u00e9 (lancez "aioson genome:remove --slug={slug}" pour nettoyer).',
    publish_genome_folder_collecting: 'Collecte des fichiers du genome (Track 4.2/4.3 modulaire)...',
    publish_genome_folder_files: '  Fichiers : {count}',
    publish_genome_folder_track: '  Track : {track} \u00b7 Fidelity : {fidelity} \u00b7 Advisor-ready : {advisor}',
    publish_genome_folder_sending: 'Envoi de {count} fichier(s) \u00e0 aioson.com (format dossier)...',
    publish_genome_conflict_warn: '\u26a0\ufe0f  {slug} : les deux formats existent localement ; le dossier a la priorit\u00e9 pour publish.',
    install_backing_up_legacy: '  Conflit avec l\'ancien format d\u00e9tect\u00e9 ; sauvegarde vers : {path}',
    install_folder_exists: '  Dossier existant \u00e0 {path} sera \u00e9cras\u00e9 (utilisez --force pour supprimer cet avis).',
    install_genome_folder_done: 'Genome \u00ab\u00a0{slug}\u00a0\u00bb install\u00e9 \u00e0 {path} ({count} fichiers, format dossier).',
    error_genome_missing_skillmd: 'Le dossier du genome \u00ab\u00a0{slug}\u00a0\u00bb n\'a pas de SKILL.md.',
    error_genome_missing_manifest: 'Le dossier du genome \u00ab\u00a0{slug}\u00a0\u00bb n\'a pas de manifest.json.',
    error_genome_invalid_manifest: 'Le manifest.json du genome \u00ab\u00a0{slug}\u00a0\u00bb est invalide : {detail}',
    remove_genome_done: 'Genome \u00ab\u00a0{slug}\u00a0\u00bb supprim\u00e9.',

    grant_error_missing_code: 'Code manquant. Usage : aioson squad:grant <code> <email>',
    grant_error_missing_email: 'Email manquant. Usage : aioson squad:grant <code> <email>',
    grant_sending: 'Octroi d\'acc\u00e8s \u00e0 {email} pour le code {code}...',
    grant_ok: '{email} peut maintenant installer avec le code {code}.',

    publish_scanning: 'Analyse de s\u00e9curit\u00e9 en cours...',
    publish_scan_ok: 'Analyse de s\u00e9curit\u00e9 r\u00e9ussie. Hash du paquet : {hash}...',
    error_scan_failed: 'Publication bloqu\u00e9e : l\'analyse de s\u00e9curit\u00e9 a d\u00e9tect\u00e9 des erreurs.',
    error_scan_warnings: 'Publication bloqu\u00e9e : {count} motif(s) suspect(s) d\u00e9tect\u00e9(s). V\u00e9rifiez les avertissements. Utilisez --force si vous \u00eates s\u00fbr que le paquet est s\u00fbr.',

    install_scanning: 'V\u00e9rification de l\'int\u00e9grit\u00e9 du paquet...',
    error_install_scan_failed: 'Installation bloqu\u00e9e : le paquet "{slug}" a \u00e9chou\u00e9 \u00e0 l\'analyse de s\u00e9curit\u00e9.',
    error_hash_mismatch: 'Installation bloqu\u00e9e : d\u00e9salignement de hash pour "{slug}". Le paquet a peut-\u00eatre \u00e9t\u00e9 modifi\u00e9.',

    install_preview_header: 'Paquet : {slug}  v{version}  par {publisher}',
    install_preview_trusted: '  Statut : \u00c9diteur de confiance',
    install_preview_unverified: '  Statut : \u00c9diteur non v\u00e9rifi\u00e9 \u2014 examinez les fichiers avant utilisation',
    install_preview_downloads: '  T\u00e9l\u00e9chargements : {count}',
    install_preview_rating: '  Note : {rating}',
    install_preview_hash: '  Hash : {hash}...',
    install_inspect_files: 'Fichiers dans ce paquet ({count} au total) :',
    install_inspect_hint: 'Ex\u00e9cutez sans --inspect pour installer.',
    install_unverified_hint: '  Astuce : Utilisez --inspect pour examiner les fichiers avant l\'installation, ou --force pour ignorer cet avertissement.'
  },

  system: {
    error_no_manifest: 'system.json introuvable dans {path}. Creez un system.json a la racine du projet systeme.',
    error_invalid_manifest: 'system.json invalide — verifiez que c\'est un JSON valide.',
    error_manifest_missing_slug: 'system.json doit contenir le champ "slug".',
    error_manifest_missing_version: 'system.json doit contenir le champ "version".',
    error_manifest_missing_name: 'system.json doit contenir le champ "name".',
    error_missing_package_json: 'package.json introuvable. Un systeme doit etre un projet Node.js valide.',

    package_reading_manifest: 'Lecture de system.json...',
    package_manifest_ok: 'Systeme : {name} ({slug} v{version})',
    package_collecting_files: 'Collecte des fichiers sources...',
    package_files_found: '  {count} fichiers ({kb} Ko)',
    package_dry_run: '[dry-run] Emballerait {slug} v{version} — aucun fichier ecrit.',
    package_saved: 'Paquet sauvegarde dans : {path}',

    publish_reading_manifest: 'Lecture de system.json...',
    publish_dry_run: '[dry-run] Publierait le systeme "{slug}" v{version} (visibilite : {visibility}).',
    publish_sending: 'Envoi vers aioson.com...',
    publish_done: 'Publie : aioson.com/store/systems/{slug}\n  Installer dans aioson-play avec le slug : {slug}',
    publish_summary: '  Fichiers : {files} ({kb} Ko)',

    list_remote_empty: 'Aucun systeme publie pour l\'instant.',
    list_remote_header: '{count} systeme(s) publie(s) :',
    list_remote_item: '  {slug}  v{version}  [{visibility}]  {name}',
    list_local_empty: 'Aucun systeme en cache dans ce projet.',
    list_local_header: '{count} systeme(s) en cache :',
    list_local_item: '  {slug}',

    install_fetching: 'Recuperation du systeme "{ref}" depuis aioson.com...',
    install_writing: 'Ecriture des fichiers...',
    install_done: 'Systeme "{slug}" installe dans {path}.'
  }
};
