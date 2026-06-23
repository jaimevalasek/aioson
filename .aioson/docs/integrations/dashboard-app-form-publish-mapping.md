---
description: "Mapping between the aioson.com dashboard app edit form and aioson system:publish --build listing fields."
scope: "global"
agents: [dev, architect, product, qa]
triggers: [system publish, marketplace app, dashboard app form, integrations, app listing]
---

# Integração — Formulário "Editar app" (dashboard) × `aioson system:publish --build`

> Objetivo: mapear **cada campo do formulário de edição de app** no dashboard do
> aioson.com aos dados que o `aioson system:publish --build` já captura (ou
> poderia capturar) do app em desenvolvimento, para que a publicação preencha o
> cadastro da loja de forma mais completa e o dev não tenha que digitar à mão.

Doc-irmã: [`apps-publish-marketplace.md`](../../../docs/integrations/apps-publish-marketplace.md)
(fluxo geral do publish). Aqui o foco é o **mapeamento campo-a-campo** do form.

---

## Onde fica cada peça

| Peça | Caminho (repo) |
|------|----------------|
| Rota do form | `aioson-com/app/dashboard/ws/apps/[id]/edit/page.tsx` (ex.: `…/apps/cmqe2pnvw0005koa7ak5mbkge/edit`) |
| Componente do form | `aioson-com/app/admin/services/service-app-form.tsx` (`ServiceAppForm`) |
| Server action | `aioson-com/app/dashboard/ws/apps/actions.ts` → `updateWorkspaceAppAction` |
| Modelo de dados do form | `ServiceApp` em `aioson-com/prisma/schema.prisma` |
| Comando de publish (CLI) | `aioson/src/commands/store-system.js` → `runSystemPublish` |
| Validação do manifest (CLI) | `store-system.js` → `validateListingFields` |
| Recepção no servidor | `aioson-com/lib/store.ts` → `storePublishSystem` |
| Extração de listing → `System` | `lib/store.ts` → `extractListingFields` |
| Sync `System` → `ServiceApp` | `lib/store.ts` → `ensureServiceAppForSystemRecord` |

---

## Arquitetura: dois modelos, duas superfícies

O publish e o formulário **não escrevem no mesmo registro**:

- `aioson system:publish` envia o `system.json` inteiro como `manifest` e grava em
  **`System` / `SystemVersion`**. Os campos de listing da loja
  (`summary`, `category`, `tags`, `screenshots`, `purpose`, `iconUrl`,
  `homepageUrl`, `supportEmail`, `supportUrl`, `privacyUrl`, `permissionsNote`)
  são extraídos do manifest por `extractListingFields` e gravados em **`System`**.
- O **formulário de "Editar app"** edita **`ServiceApp`** — outro modelo, com
  outro conjunto de campos (descrição longa, features, emoji, SEO, vídeo, etc.).
- Na publicação de app **não-privado**, `ensureServiceAppForSystemRecord` cria/atualiza
  um `ServiceApp` espelhando o `System`, **mas só copia 5–7 campos**
  (`name`, `description`, `price`, `visibility`, `ownerId`, `ownerProjectId`,
  `trialDays`, `requiresLicense`). Todo o resto do form fica **manual**.

> Resultado prático: hoje o dev publica via CLI e depois ainda precisa abrir o
> form e preencher descrição longa, features, ícone, SEO e links na mão. É essa
> lacuna que o "preenchimento via harness" fecha.

---

## Mapeamento campo-a-campo do formulário

Legenda da coluna **Auto hoje?**: ✅ já preenchido na publicação · ⚠️ parcial · ❌ manual.

| Campo do form | `name=` | Coluna `ServiceApp` | Limite | Obrig. | Auto hoje? | Origem de captura sugerida (harness / manifest) |
|---|---|---|---|---|---|---|
| Nome | `name` | `name` | 120 | sim | ✅ | `manifest.name` (já obrigatório) |
| Slug | `slug` | `slug` | 140 (`[a-z0-9-]+`) | sim | ✅ | `manifest.slug` (já obrigatório) |
| Descrição curta | `description` | `description` | 280 | sim | ✅ | `manifest.description` (ou `manifest.summary`) |
| Descrição longa | `longDescription` | `longDescription` (Text) | — | não | ❌ | corpo do `README.md` (sem o 1º heading) · `manifest.long_description` · bootstrap `what-it-does.md` |
| Features | `features` | `features` (Text) | — | não | ❌ | `manifest.features[]` (lista) · seção `## Features`/`## Funcionalidades` do README |
| Preço | `price` | `price` (Decimal) | ≥ 0 | sim | ✅ | `System.priceInCents/100` ← `manifest.priceInCents`/`price` |
| Ordem | `sortOrder` | `sortOrder` (Int) | — | não (0) | ❌ | manual (sem sinal confiável no app) — manter default 0 |
| Ícone (emoji) | `icon` | `icon` VarChar(**8**) | 8 | não | ❌ | `manifest.icon_emoji` — **emoji**, NÃO a URL de ícone (essa é `System.iconUrl` ← `manifest.icon`) |
| Status | `status` | `status` (enum) | active/coming_soon/inactive | não | ⚠️ | derivado da `visibility`; geralmente manual — default `active` |
| Caminho do dashboard | `dashboardPath` | `dashboardPath` VarChar(255) | 255 | não | ❌ | `manifest.dashboard_path` · detectar rota admin do app (presença de `dashboard/`) |
| Vídeo demo | `urlVideoDemo` | `urlVideoDemo` VarChar(512) | 512 | não | ❌ | `manifest.url_video_demo` (manual — não dá pra inferir do código) |
| Storefront | `storefrontUrl` | `storefrontUrl` VarChar(**512**) | form aceita 1024 ⚠️ | não | ❌ | `manifest.storefront_url` (manual) |
| SEO título | `seoTitle` | `seoTitle` VarChar(70) | 70 | não | ❌ | `manifest.seo_title` · derivar `${name} — ${summary}` truncado em 70 |
| SEO descrição | `seoDescription` | `seoDescription` VarChar(160) | 160 | não | ❌ | `manifest.seo_description` · `manifest.summary` truncado em 160 |

**Lacunas reais (❌) a fechar:** `longDescription`, `features`, `icon` (emoji),
`dashboardPath`, `urlVideoDemo`, `storefrontUrl`, `seoTitle`, `seoDescription`.
(`sortOrder` e `status` ficam manuais por design.)

**Já capturado, mas em `System` (não neste form):** `summary`, `category`, `tags`,
`screenshots`, `purpose`, `iconUrl`, `homepageUrl`, `supportEmail`, `supportUrl`,
`privacyUrl`, `permissionsNote` — via `extractListingFields`. Reaproveitáveis:
`summary`→`seoDescription`, `iconUrl` já existe (o form usa emoji separado).

⚠️ **Inconsistência a anotar:** o input `storefrontUrl` no form aceita
`maxLength=1024`, mas a coluna é `VarChar(512)`. Truncar/alinhar ao gravar.

---

## Chaves de `system.json` propostas (fonte única)

O publish já envia o `manifest` inteiro, então **basta o harness escrever estas
chaves no `system.json`** e o servidor mapeá-las no `ServiceApp`. Todas opcionais
(apps antigos seguem publicando):

```jsonc
{
  "slug": "meu-app",
  "name": "Meu App",
  "version": "1.0.0",
  // — listing já suportado (vai pra System) —
  "summary": "Resumo até 160 chars",
  "category": "atendimento",
  "tags": ["whatsapp", "crm"],
  "icon": "https://.../icon.png",          // URL → System.iconUrl
  "screenshots": ["https://.../1.png"],
  // — novas chaves p/ preencher o form ServiceApp —
  "long_description": "Texto longo (markdown ok).",
  "features": ["Recurso A", "Recurso B"],   // → join em ServiceApp.features
  "icon_emoji": "💬",                        // → ServiceApp.icon (≤8)
  "dashboard_path": "/dashboard/atendimento",
  "url_video_demo": "https://youtube.com/watch?v=...",
  "storefront_url": "https://minha-loja.com",
  "seo_title": "Meu App — atendimento no WhatsApp",
  "seo_description": "Descrição SEO até 160 chars"
}
```

---

## O que faltaria implementar (3 pontos) — NÃO feito ainda

Isto é o plano de fechamento da lacuna; **este doc só mapeia, não altera código**.

1. **CLI — `validateListingFields`** (`store-system.js`): aceitar/validar as novas
   chaves opcionais (`long_description`, `features[]`, `icon_emoji` ≤8,
   `dashboard_path`, `url_video_demo`, `storefront_url`, `seo_title` ≤70,
   `seo_description` ≤160). O envio em si já acontece (manifest viaja inteiro).
2. **Servidor — `ensureServiceAppForSystemRecord`** (`lib/store.ts`): estender o
   objeto `data` para mapear essas chaves do manifest nas colunas do `ServiceApp`
   (respeitando "não sobrescrever edição manual" se desejado — ex.: só preencher
   quando o campo no `ServiceApp` estiver vazio).
3. **Harness — montagem do `system.json` antes do publish**: popular as chaves a
   partir das fontes da tabela (README, rotas, living-memory). Candidato natural:
   um passo de "enriquecer manifest" dentro de `runSystemPublish` (modo `--build`)
   ou um agente/skill que rode antes do publish.

### Estratégia de captura pelo harness (resumo)

- `long_description` ← corpo do `README.md` (remover 1º heading) ou bootstrap `what-it-does.md`.
- `features` ← bullets da seção `## Features`/`## Funcionalidades` do README.
- `dashboard_path` ← detecção de rota admin (presença de `dashboard/`, `app/admin`, etc.).
- `seo_title`/`seo_description` ← derivar de `name` + `summary` com truncamento.
- `icon_emoji`, `url_video_demo`, `storefront_url` ← declarados pelo dev (manual no manifest).

### ⚠️ Pré-condições e pegadinhas (descobertas na investigação)

Antes de implementar, dois fatos do código atual que mudam o "quando" e o "onde":

1. **`ServiceApp` só nasce em `status=PUBLISHED` + `FREE/PAID`.**
   `ensureServiceAppForSystemRecord` retorna `null` se `status !== "PUBLISHED"` ou
   `visibility === "PRIVATE"` (e também ignora `DEV/PRO/BUSINESS` — só FREE/PAID).
   Para **publisher novo**, a 1ª publicação é quarentenada (`createStatus = "DRAFT"`),
   então o `ServiceApp` **não é criado na primeira vez** — só quando o app sai da
   quarentena e vira `PUBLISHED`. ⇒ O preenchimento precisa acontecer **no momento
   da criação do `ServiceApp`** (que pode ser uma publicação posterior), não
   necessariamente na 1ª chamada de `system:publish`.

2. **`ownerProjectId` está `null` hardcoded no publish (linha ~1037 de `store.ts`).**
   O CLI manda `workspaceSlug` (lido de `.aioson/workspace.json`), mas
   `storePublishSystem` **não** o usa para vincular o app a um workspace: tanto o
   `System` quanto o `ServiceApp` são criados com `ownerProjectId: null`.
   ⇒ App publicado via CLI **não aparece** no form WS-scoped
   (`/dashboard/ws/apps/[id]/edit` filtra por `app.ownerProjectId === ws.id`).
   Apps que aparecem lá foram criados pelo form "novo app" (`createWorkspaceAppAction`),
   que seta `ownerProjectId = ws.id`. **Não existe "workspace default" no publish hoje.**

   Para o publish alimentar esse form, falta um **4º ponto de implementação**:
   resolver `workspaceSlug → project.id` no servidor e setar `ownerProjectId`
   (no `System` e no `ServiceApp`) em vez de `null`.

---

## Como verificar (quando implementado)

1. `aioson system:publish ./app --dry-run` deve listar o manifest com as novas chaves.
2. Após publish de app **não-privado**, abrir `…/apps/<id>/edit` e conferir que
   `longDescription`, `features`, `icon`, SEO e links vieram preenchidos.
3. App **privado** não gera `ServiceApp` (`ensureServiceAppForSystemRecord` só roda
   para `visibility !== PRIVATE`) — não esperar preenchimento nesse caso.
