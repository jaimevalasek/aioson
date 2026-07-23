# Aioson Atendimento — Integração com aioson-play

> Documento de referência para novas sessões de desenvolvimento.
> Atualizado: 2026-04-28

---

## Arquitetura correta (leia antes de qualquer mudança)

O **aioson-play** é um runtime genérico. Ele não conhece nenhum app antes da instalação e não tem acesso ao código interno de nenhum app. Toda lógica de negócio, configuração e onboarding específico do app pertence ao próprio app.

```
┌──────────────────────────────────────────────────────────────────────┐
│                        aioson-play                                    │
│                                                                      │
│  Apps instalados:          Play Services (background):               │
│  ┌──────────────────┐      ┌──────────────────────────────────────┐  │
│  │  atendimento     │      │  aioson-auth                         │  │
│  │  (porta 3301)    │      │  (porta 3091, autostart)             │  │
│  │  has_api: true   │  →   │  Serviço de auth para todos os apps  │  │
│  └──────────────────┘      └──────────────────────────────────────┘  │
│          │                                                            │
│          │  webview                                                   │
│  ┌───────▼──────────────────────┐                                    │
│  │  Dashboard atendimento       │  ← porta 5173                     │
│  │  (sistema Vite React)        │                                    │
│  │  Onboarding próprio          │                                    │
│  │  Seleção de nicho própria    │                                    │
│  └──────────────────────────────┘                                    │
└──────────────────────────────────────────────────────────────────────┘
```

**Regra fundamental:** O aioson-play NÃO implementa onboarding específico de nenhum app. O `AppOnboarding.tsx` do play verifica apenas se os **Play Services requeridos** (`requires_services`) estão instalados e rodando — nada de lógica de negócio do app.

---

## Seleção de nicho (squad) — onde está implementada

A seleção de nicho **já existe** e está **100% no app atendimento**, não no aioson-play.

**Fluxo:**
1. Usuário abre o dashboard do atendimento (`http://localhost:5173`)
2. `useSquadState.ts` polsa `GET /api/squad` a cada 2s
3. Se `state === 'SELECTION_PENDING'` → `OnboardingPage.tsx` é exibido
4. Usuário seleciona o tipo de negócio (ex: 💊 Farmácia)
5. Dashboard chama `POST /api/squad/select` com `{ slug: "atendimento-farmacia" }`
6. Backend escreve `atendimento-config.json` com `active_squad` e `locked: true`
7. Dashboard polsa até `state === 'READY'` → abre o painel principal

**Arquivos envolvidos:**
- `dashboard/src/OnboardingPage.tsx` — UI de seleção (12 tipos de negócio, busca, filtros por categoria)
- `dashboard/src/useSquadState.ts` — polling de estado
- `src/api/routes/squadRoutes.ts` — rotas `GET /api/squad` e `POST /api/squad/select`
- `src/api/controllers/SquadController.ts` — lógica do controller
- `src/services/squad_runtime/SquadRuntime.ts` — máquina de estados do squad
- `manifest.json` → campo `squads[]` — lista de squads disponíveis

---

## API de squad (referência rápida)

### GET /api/squad
```json
// SELECTION_PENDING — aguardando seleção
{ "state": "SELECTION_PENDING", "active_squad": null, "available_squads": [...] }

// READY — squad ativo
{ "state": "READY", "active_squad": "atendimento-farmacia", "label": "Atendimento Farmácia",
  "capabilities": { "hasAgenda": false, "hasKanban": true, "hasOCR": true, ... } }
```

### POST /api/squad/select
```json
// Request
{ "slug": "atendimento-farmacia", "custom_label": "Farmácia São João" }

// 201 Created
{ "active_squad": "atendimento-farmacia", "label": "Atendimento Farmácia", "selected_at": "..." }

// 409 Conflict — squad já selecionado (tratar como sucesso se re-executando)
{ "error": "Squad já selecionado. Para trocar, reinstale o app no aioson-play." }
```

**Regra de negócio:** Squad é imutável após seleção. Para trocar de nicho: reinstalar o app (nova instalação limpa o `atendimento-config.json`).

---

## Squads disponíveis

| slug | Tipo de negócio | Icon | Flow |
|------|----------------|------|------|
| `atendimento-farmacia` | Farmácia | 💊 | kanban |
| `atendimento-restaurante` | Restaurante / Delivery | 🍽️ | kanban |
| `atendimento-suporte` | Loja / Atendimento | 🛍️ | kanban |
| `atendimento-cabeleireiro` | Salão de Beleza | 💇 | agenda |
| `atendimento-barbearia` | Barbearia | 💈 | agenda |
| `atendimento-academia` | Academia / Personal | 💪 | agenda |
| `atendimento-clinica` | Clínica Médica | 🏥 | agenda |
| `atendimento-odontologia` | Odontologia | 🦷 | agenda |
| `atendimento-veterinaria` | Veterinária / Pet | 🐾 | agenda |
| `atendimento-estetica` | Clínica de Estética | ✨ | agenda |
| `atendimento-psicologia` | Psicologia | 🧠 | agenda |
| `atendimento-advocacia` | Advocacia | ⚖️ | kanban |

---

## Integração com aioson-auth (Play Service)

O `aioson-auth` é um Play Service que pode ser instalado no aioson-play e provê autenticação para apps.

**Dois níveis de auth — não confundir:**

| Nível | O que é | Para quê |
|-------|---------|---------|
| **Conta aioson-com** | Login no próprio aioson-play | Usar o play, acessar marketplace |
| **aioson-auth (Play Service)** | Serviço de auth para apps | Login nos apps instalados (dashboard, etc.) |

**Status atual da integração atendimento ↔ aioson-auth: pendente**

Para ativar:
1. `aioson-auth` precisa estar pronto como Play Service (falta `service.json` — ver doc do protocolo)
2. `manifest.json` do atendimento precisa declarar `requires_services: ["aioson-auth"]`
3. Dashboard do atendimento precisa implementar gate de login via aioson-auth

Quando `aioson-auth` estiver instalado e rodando:
```typescript
// O atendimento verificaria via aioson-auth:
GET http://localhost:3091/api/auth/{bindingId}/me?token=<jwt>
// → 200: usuário autenticado → libera dashboard
// → 401: token inválido → redireciona para login
```

---

## Compatibilidade com aioson-play (checklist atual)

| Item | Status | Arquivo |
|------|--------|---------|
| `manifest.json` com `has_api: true` e `api_base_url` | ✅ | `manifest.json` |
| Porta dinâmica (`process.env.PORT`) | ✅ | `src/server.ts` |
| `GET /api/aioson-play` — declaração de capacidades | ✅ | `src/server.ts` |
| `POST /api/aioson-test` — validação sem efeito colateral | ✅ | `src/server.ts` |
| Onboarding de nicho (squad selection) | ✅ | `dashboard/src/OnboardingPage.tsx` |
| `requires_services: ["aioson-auth"]` | ✅ Pronto (2026-04-29) | `manifest.json` |
| Gate de login no dashboard via aioson-auth | ✅ Pronto (2026-04-29) | `dashboard/src/App.tsx` + `useAuth.ts` + `LoginPage.tsx` |

---

## Links de referência

- **Seleção de nicho:** `dashboard/src/OnboardingPage.tsx` + `src/api/controllers/SquadController.ts`
- **Squad runtime:** `src/services/squad_runtime/SquadRuntime.ts`
- **Protocolo aioson-play → app:** `docs/aioson-endpoint-protocol.md`
- **Cloud auth (conta aioson-com):** `docs/app-cloud-auth.md` no aioson-play
- **Protocolo de Play Services:** `docs/play-service-protocol.md` no aioson-play
- **Manual de integração aioson-auth:** `docs/integration-manual.md` no aioson-auth
