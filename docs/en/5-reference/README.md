# Technical reference — AIOSON (EN)

> This folder contains technical reference documentation for CLI commands, features, and integrations.
> **Starting from scratch?** Go to [`2-start/`](../2-start/first-project.md) (in progress — translated from PT).
> **Want a worked recipe?** Go to [`3-recipes/`](../3-recipes/README.md).

This layer currently holds the original EN feature guides. Additional reference docs (feature-dossier, agent-chain-continuity, sdd-framework, live-sessions, secure-by-default, aioson-com-store, and the full set from `docs/pt/5-referencia/`) will be progressively added as the PT documentation is translated.

---

## CLI & automation

| Document | Description |
|---|---|
| [cli-reference.md](./cli-reference.md) | Full reference for every CLI command |
| [json-schemas.md](./json-schemas.md) | `--json` output contracts for all commands |
| [executable-verification.md](./executable-verification.md) | The executable-verification theme: `verification` + `harness:check`, fresh-context validator, `spec:analyze`, Wave markers, Lane B (`forge:compile` + `@forge-run`) |
| [autopilot-handoff.md](./autopilot-handoff.md) | Full-feature autopilot: `@product` → `@sheldon`/`@orchestrator` → `@dev` → `@qa` (hub) → `@tester`/`@pentester`/`@validator` up to the `feature:close` recommendation; inline `--auto`/`--step` tokens, `--help` on the 13 most-used agents |

---

## Features

| Document | Description |
|---|---|
| [mcp.md](./mcp.md) | MCP setup: `mcp:init`, `mcp:doctor`, Context7 and Database connectors |
| [parallel.md](./parallel.md) | Parallel orchestration: `parallel:init`, `parallel:assign`, lanes, merge |
| [qa-browser.md](./qa-browser.md) | Browser QA with Playwright: `qa:run`, `qa:scan`, personas |
| [squad-dashboard.md](./squad-dashboard.md) | Real-time squad monitoring panel |

---

## Internationalization

| Document | Description |
|---|---|
| [i18n.md](./i18n.md) | Adding locales, `i18n:add`, `locale:apply`, built-in locales |

---

## Web3

| Document | Description |
|---|---|
| [web3.md](./web3.md) | Web3 support: Ethereum (Hardhat/Foundry), Solana (Anchor), Cardano (Aiken) |

---

## Release engineering

| Document | Description |
|---|---|
| [release.md](./release.md) | Release process and versioning |
| [release-flow.md](./release-flow.md) | CI/CD release flow |
| [release-notes-template.md](./release-notes-template.md) | Template for writing release notes |

---

## Coming from docs/pt/5-referencia/

The following docs exist in PT and will be translated progressively:
`feature-dossier` · `agent-chain-continuity` · `sdd-framework` · `live-sessions` · `secure-by-default` · `aioson-com-store` · `memoria-e-contexto` · `runtime-observability` · `hooks-session-guard` · `fluxo-artefatos` · `feature-archive` · `design-docs-governance` · `sandbox` · `agent-sharding` · `output-strategy-delivery` · `genome-distribution` · `clientes-ai` · `sdd-planos-e-estrutura`
