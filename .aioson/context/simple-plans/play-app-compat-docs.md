---
slug: play-app-compat-docs
status: complete
owner: dev
created_at: 2026-06-23
updated_at: 2026-06-23
classification: MICRO
risk: low
source: direct-user-request
---

# Simple Plan - Play App Compatibility Docs

## Scope
Criar uma camada de documentacao em `.aioson/docs/play/` para orientar agentes do AIOSON quando o usuario pedir apps compativeis com o AIOSON Play.

## Context selected
- context:brief: selecionou `project.context.md`, `project-pulse.md`, `memory-index.md`, `dev-state.md`, `aioson-play-conventions.md`, `disk-first-artifacts.md`, `output-brevity.md` e `source-code-language-convention.md`.
- Existing pattern to follow: docs internas em `.aioson/docs/` com README de entrada e guias especializados.
- Applicable rule/doc: `.aioson/rules/aioson-play-conventions.md` e docs canonicos do Play em `C:\dev\aioson-play\.aioson\docs\integrations\`.

## Implementation intelligence
- Framework leverage: sem codigo runtime; usar Markdown local como contrato de contexto para agentes.
- Structure and data boundary: `.aioson/docs/play/` fica no AIOSON como camada operacional; `C:\dev\aioson-play\.aioson\docs\integrations\` continua sendo fonte tecnica canonica do Play.
- Reuse over custom code: resumir e referenciar os contratos existentes do Play, evitando copiar integralmente documentos que podem ficar desatualizados.

## Done criteria
- `.aioson/docs/play/README.md` explica quando agentes devem carregar essa pasta.
- Guias cobrem manifest/runtime, portas, LLM/ProductBridge, banco operacional, data bindings/global connectors, auth/services e testes locais.
- A documentacao responde explicitamente que harnesses nao devem pressupor acesso aos docs internos de uma instalacao local do Play.
- Os guias apontam para os arquivos canonicos do `aioson-play` que originam cada contrato.

## Useful options considered
- Include now: criar guias curados por topico e mapa de fontes.
- Defer: automatizar sincronizacao com `aioson-play` ou criar comando CLI para instalar esses docs em projetos de apps.
- Escalate: alterar o Play para expor seus docs instalados via UI/API ou embutir isso no runtime.

## Out of scope
- Copiar integralmente a pasta `integrations/` do `aioson-play`.
- Modificar o runtime do AIOSON Play.
- Criar template/scaffold de app Play nesta fatia.

## Expected files
- `.aioson/docs/play/README.md`
- `.aioson/docs/play/agent-usage-guide.md`
- `.aioson/docs/play/app-compatibility-guide.md`
- `.aioson/docs/play/manifest-and-runtime.md`
- `.aioson/docs/play/llm-data-and-bindings.md`
- `.aioson/docs/play/auth-services-and-testing.md`
- `.aioson/docs/play/source-map.md`

## Verification
- `Get-ChildItem .aioson/docs/play`
- `rg -n "AIOSON Play|data_bindings|DATABASE_URL|llm-chain|/api/aioson-play|requires_services|ProductBridge" .aioson/docs/play`
- Passed: 7 curated docs present in `.aioson/docs/play/`.
- Passed: coverage terms found for Play runtime, data bindings, DB, LLM, endpoint discovery, services, and ProductBridge.

## Session state
Done: guias curados criados em `.aioson/docs/play/`; prontos para agentes carregarem quando o usuario pedir app compativel com AIOSON Play.

## Notes
- Decisao: docs no AIOSON sao uma camada de aplicacao para agentes; nao substituem os docs canonicos do Play.
- A pasta instalada do Play nao deve ser tratada como contrato de acesso para harnesses em projetos arbitrarios.
