# `aioson system:publish` — Publicar apps no marketplace

Como devs publicam apps via CLI no aioson.com para que clientes possam
instalar via aioson-play.

---

## Comando

```bash
aioson system:publish [dir] [opções]
```

`[dir]` é o caminho da pasta do app (default: `.`). A pasta precisa ter
`system.json` (manifesto) + `package.json` na raiz.

### Opções

| Flag | Efeito |
|------|--------|
| `--private` | Visibilidade privada (default é `public` → FREE no aioson-com) |
| `--paid` | Marca como pago (requer plano Jedi) |
| `--invite="email1,email2,..."` | Emails autorizados a instalar quando privado |
| `--dry-run` | Valida e mostra o que seria enviado, sem publicar |

### Emails autorizados (privates)

Aceita 2 formas, com flag tendo precedência sobre o manifest:

```bash
aioson system:publish ./meu-app --private \
  --invite="cliente1@empresa.com, cliente2@empresa.com"
```

Ou declarado no `system.json`:

```json
{
  "slug": "meu-app",
  "name": "Meu App",
  "version": "1.0.0",
  "authorized_emails": ["cliente1@empresa.com", "cliente2@empresa.com"]
}
```

A lista é normalizada (lowercase, trim, dedup, validação básica de `@`).

---

## Fluxo no servidor

`POST https://aioson.com/api/store/systems/publish` recebe:

```json
{
  "kind": "aioson.store.system",
  "slug": "meu-app",
  "version": "1.0.0",
  "files": { "system.json": "...", "package.json": "...", "src/...": "..." },
  "manifest": { ... },
  "visibility": "private",
  "paid": false,
  "authorizedEmails": ["cliente1@empresa.com"],
  "workspaceSlug": null
}
```

Server-side (`storePublishSystem` em `aioson-com/lib/store.ts`):
1. Cria/atualiza `System` (visibility mapeada para enum: `private`→PRIVATE,
   `public`→FREE, `paid`→PAID)
2. Cria nova `SystemVersion` com `manifestJson` + `filesJson` + `packageHash`
3. Quando privado: sincroniza tabela `SystemInvitee` (delete-then-insert)
4. Retorna `{ ok, slug, version, packageHash, inviteeCount, quarantined }`

---

## Como o cliente instala

Pelo aioson-play instalado:

1. Login com email autorizado
2. HomePage → Loja
3. App aparece (filtrado por `getMarketplaceForUser`: visibilidade + invitee)
4. Click no card → `POST /api/store/systems/install` → `storeInstallSystem`
   valida visibilidade + invitee → devolve files+manifest
5. Aioson-play extrai em `apps/{slug}/`

---

## Doc relacionada

- `aioson-com/docs/apps-publish-install-spec.md` — spec consolidada do flow
- `aioson-play/docs/aioson-app-developer-guide.md` §9 — visão do dev de app
- `aioson-play/docs/dev-link-install.md` — alternativa pra dev (symlink)
