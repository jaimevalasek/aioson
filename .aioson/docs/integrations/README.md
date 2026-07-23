# `.aioson/docs/integrations/` — Docs de integração de services e apps

> Este diretório é a **fonte canônica** dos contratos de integração entre o
> AIOSON Play, seus Play Services e os Apps instalados. Sempre que uma
> correção ou implementação tocar services/apps/portas/marketplace, consulte
> aqui antes de inferir contratos a partir do código.

## 🎯 Comece por aqui (entry points AI-first)

| Você está... | Leia primeiro |
|---|---|
| **Criando um app pro Play** (dev/IA) | [`ai-app-integration.md`](./ai-app-integration.md) — guia AI-first, 4 perguntas-decisão, snippet pro CLAUDE.md do app, checklist verificável |
| **Fazendo correção cross-cutting** (harness/IA) | [`platform-architecture.md`](./platform-architecture.md) — mapa de componentes, contratos, fluxos, tabela "onde mexer" por categoria de bug |
| **Atacando um slice da fila auth** | [`auth-integration-gaps.md`](./auth-integration-gaps.md) — Slices A-F com status, decisões e plano |

Os demais docs abaixo são **detalhados** — consulte conforme indicado pelos
entry points acima.

## Índice

### Portas e runtime

| Doc | Cobertura |
|-----|-----------|
| [`port-management.md`](./port-management.md) | Faixas reservadas (3001–3099 services, 3300+ apps, 5173 vite-dev, 5180 ProductBridge), PortAllocator, registry, env-vars `VITE_AIOSON_*_URL`, split-stack |
| [`software-update-compatibility.md`](./software-update-compatibility.md) | Versionamento e compatibilidade Play ↔ app ↔ runtime ↔ schema; build desktop por plataforma, sidecars e updater |

### Play Services

| Doc | Cobertura |
|-----|-----------|
| [`play-service-protocol.md`](./play-service-protocol.md) | Como criar/publicar/instalar Play Service. `service.json`, `autostart`, `dev_command`, `health_check`, contrato `process.env.PORT` |

### Apps

| Doc | Cobertura |
|-----|-----------|
| [`aioson-app-developer-guide.md`](./aioson-app-developer-guide.md) | Guia geral para desenvolvedores de apps |
| [`aioson-endpoint-protocol.md`](./aioson-endpoint-protocol.md) | Protocolo `/api/aioson-play` para apps declararem capacidades (Bridge + LLM orquestrador) |
| [`app-cloud-auth.md`](./app-cloud-auth.md) | App recebe token aioson.com automaticamente no startup |
| [`app-data-bindings.md`](./app-data-bindings.md) | Apps declaram fontes de dados; vínculo com Global Connectors |
| [`app-database-choice.md`](./app-database-choice.md) | Escolha do **banco operacional do app**: SQLite default + WAL, quando subir pra Postgres (embedded, local externo ou remoto), padrão `DATABASE_URL`, critérios objetivos |
| [`local-tts-integration.md`](./local-tts-integration.md) | Como um app gera áudio falado (voz local Kokoro, `en-US`) via `POST /api/tts/synthesize` + `GET /api/tts/audio/{id}` no ProductBridge — sem SDK, sem baixar modelo próprio |
| [`integration-manual.md`](./integration-manual.md) | Manual de integração de sistemas externos (Global Connectors) |

### Auth (operadores e RBAC)

| Doc | Cobertura |
|-----|-----------|
| [`auth-integration-gaps.md`](./auth-integration-gaps.md) | Análise estrutural do aioson-auth: prontidão para apps dentro/fora do Play, compatibilidade do RBAC, gaps por gravidade, plano de slices A–F |

### Entry points AI-first

| Doc | Cobertura |
|-----|-----------|
| [`ai-app-integration.md`](./ai-app-integration.md) | Guia para devs/IAs construírem apps prontos pro Play. TL;DR, perguntas-decisão, manifest mínimo, snippet pro `CLAUDE.md`/`AGENTS.md` do app, checklist verificável, mapa "consulte X quando Y" |
| [`platform-architecture.md`](./platform-architecture.md) | Vista de helicóptero do sistema (Play + Auth + Apps + aioson.com). Componentes, contratos, fluxos críticos, tabela "onde mexer pra cada categoria de bug", ADRs ativos |

### Dev e testes

| Doc | Cobertura |
|-----|-----------|
| [`dev-link-install.md`](./dev-link-install.md) | Os 3 modos de instalação (marketplace / dev-link / local) |
| [`local-dev-testing.md`](./local-dev-testing.md) | Instalar apps e services sem passar por aioson.com |

### Implementações de referência (case studies)

| Doc | Cobertura |
|-----|-----------|
| [`atendimento-squad-integration.md`](./atendimento-squad-integration.md) | Caso: integração do squad "Atendimento" com aioson-play |
| [`farmacia-implementation-review.md`](./farmacia-implementation-review.md) | Caso: review da implementação do app Farmácia |

---

## Regra para AI/agentes

Quando o trabalho envolver **services** (`service_manager.rs`, `services/`, `service.json`, autostart, dev-link) **ou apps** (`app_process_manager.rs`, `process_manager.rs`, `draft_process.rs`, `manifest.json`, marketplace, runtime, split-stack), **leia os docs aplicáveis antes** de propor mudanças. Não tente reverse-engineer um contrato que já está documentado aqui.

Se você adicionar um novo doc nesta pasta, atualize este índice.
