---
project_name: "aioson"
project_type: "script"
profile: "developer"
framework: "Node.js"
framework_installed: true
classification: "MEDIUM"
conversation_language: "pt-BR"
design_skill: ""
test_runner: "node:test"
web3_enabled: false
web3_networks: ""
contract_framework: ""
wallet_provider: ""
indexer: ""
rpc_provider: ""
aioson_version: "1.10.0"
generated_at: "2026-04-10T14:35:29.863Z"
---

# Project Context

## Description
AIOSON — AI operating framework for hyper-personalized software development. CLI Node.js publicado no npm que orquestra agentes especializados (product, analyst, architect, dev, qa, sheldon, etc.) via workflow spec-driven. **Inception mode:** o próprio framework é construído usando seus agentes, metodologia e governança.

## Stack
- Backend: Node.js (CLI — bin/aioson.js)
- Frontend: — (CLI only, sem UI no core)
- Database: SQLite via better-sqlite3 (runtime telemetry em .aioson/runtime/aios.sqlite)
- Auth: —
- UI/UX: — (dashboard é app separada)

## Services
- Queues: —
- Storage: —
- WebSockets: —
- Email: —
- Payments: —
- Cache: —
- Search: —

## Key modules
- `src/commands/` — comandos CLI (setup, scan, workflow, runtime, agent, live, genome, squad, etc.)
- `src/i18n/` — internacionalização (en, pt-BR, es, fr)
- `template/` — template AIOSON instalado nos projetos via `aioson setup .`
- `.aioson/agents/` — prompts dos agentes (sincronizados do template)
- `.aioson/skills/` — design skills, static skills, dynamic skills
- `.aioson/locales/` — agentes localizados por idioma
- `.aioson/runtime/` — telemetria SQLite (dashboard bridge)

## Classification rationale (MEDIUM)
- User types: developers usando o CLI (1 tipo → 0 pts)
- External integrations: LLM APIs, npm registry, SQLite, filesystem (1-2 → 1 pt)
- Business rules: roteamento de agentes, state machine de workflow, SDD governance, genome system, squad intelligence, runtime telemetry → complex (2 pts)
- Complexidade adicional: inception — o framework construindo a si mesmo, template sincronizado com source
- **Score: 3+ → MEDIUM**

## Web3
- Enabled: no

## Installation commands
[already installed]

## Notes
- Este é o source do aioson CLI — "inception mode": o framework construindo a si mesmo
- `npm run sync:agents` sincroniza os agentes do template para o workspace ativo
- Os planos em `plans/` e `prds/` são fontes de pesquisa pré-produção (não PRDs reais)
- O dashboard é uma app separada — não faz parte deste repositório
- `aioson_version` deve ser mantido em sincronia com `package.json version`

## Conventions
- Language: pt-BR
- Code comments language: en ou pt-BR (ambos aceitos)
- DB naming: snake_case
- JS/TS naming: camelCase
- CLI commands: kebab-case (ex: `aioson workflow:next`)
