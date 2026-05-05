---
name: aioson-play-draft-conventions
description: Convenções obrigatórias quando o agente está rodando dentro de um draft do AIOSON Play (cwd em ~/.local/share/com.aioson.play/drafts/). pnpm exclusivo, manifest leve, caches via env.
priority: 10
version: 1.0.0
agents: [product, dev, architect, deyvin]
---

# AIOSON Play — Convenções pra Drafts

Aplicável quando o `cwd` da sessão é `~/.local/share/com.aioson.play/drafts/<uuid>/` (drafts) **OU** quando `manifest.json` no projeto contém um `runtime` reconhecido pelo Play (apps instalados que rodarão dentro dele).

## Princípio fundador

O AIOSON Play é o **ambiente de runtime** de apps criados aqui. Drafts são experimentos vivos; quando promovidos, viram apps instalados que rodam **dentro** do Play. Por isso, criar um app no Play é diferente de criar um projeto Node qualquer:

- O app **deve rodar** dentro do Play durante o desenvolvimento (botão "Rodar" no draft).
- O app **deve continuar rodando** dentro do Play após instalado.
- Se o usuário quer um projeto Node "standalone" (que vai rodar fora do Play), ele usa `aioson` + Claude Code direto, sem o Play.

## Stacks suportados pelo Play

Stacks Node atualmente reconhecidos (autodetectados via `package.json`):

| Detecção | Runtime |
|---|---|
| `next` em `dependencies` | Next.js |
| `vite` em `dependencies`/`devDependencies` | Vite (qualquer template) |
| Apenas `scripts.dev` | Node genérico (Express/Fastify/etc) |

Outras stacks (PHP, Python) entram como runtimes adicionais em fases futuras.

## Package manager: pnpm exclusivo

- **Nunca** `npm install`, `npm ci`, `yarn install`, `bun install`. **Sempre** `pnpm install`.
- **Adicionar dep:** `pnpm add <pkg>`.
- **Adicionar devDep:** `pnpm add -D <pkg>`.
- **Lockfile canônico:** `pnpm-lock.yaml` (commitar; apagar `package-lock.json` e `yarn.lock` residuais).
- pnpm tem store global em `~/.local/share/pnpm/store/`: cada draft fica com `node_modules/` em hardlinks (custo real ~5MB em vez de 200-400MB). Sem isso, o disco enche em poucos drafts.

## Scripts em `package.json`

- `dev` deve respeitar `process.env.PORT` ou aceitar `--port $PORT` no CLI.
- **Não declare** `npm run build`, `next build`, `vite build` em scripts de desenvolvimento. Build é responsabilidade do Play no momento da promoção (draft → app instalado).

## Caches centralizados

O Play injeta envs no spawn que redirecionam caches pra `~/.local/share/com.aioson.play/runtime/cache/<framework>/<uuid>/`:

- Next.js: `NEXT_DIST_DIR`
- Vite: `VITE_CACHE_DIR`
- SWC: `SWC_CACHE_PATH`

**Não sobrescreva** essas envs em `next.config.ts`/`vite.config.ts` com paths locais (`.next/`, `.vite/`). Se precisar de output customizado, use path absoluto fora do diretório do draft.

## Diretórios proibidos no draft

`dist/`, `build/`, `.next/`, `.vite/`, `coverage/`, `node_modules/.cache/`. Se aparecerem, é sintoma de regra violada — agente deve apagar e reconfigurar.

## Configuração obrigatória por framework

### Next.js — `next.config.ts`/`.js`/`.mjs`

**Sempre** declarar `allowedDevOrigins` com a lista explícita de loopback. Next 16+ **não aceita `["*"]`** — exige hosts nominais. Sem isso, o HMR WebSocket é recusado dentro do iframe do Play e hot reload fica desativado.

```ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["127.0.0.1", "localhost", "::1", "0.0.0.0"],
  // demais opções...
};

export default nextConfig;
```

Os 4 apelidos cobrem todas as combinações de resolução loopback (WebKit pode resolver `localhost` pra qualquer um deles; em WSL2 a inconsistência é frequente). Sintoma quando falta: o `next dev` cospe no stderr "Blocked cross-origin request to Next.js dev resource /_next/webpack-hmr".

### Vite — `vite.config.ts`

`server.host` e `server.hmr` ficam no default. **Não declarar `server.port`** — o Play injeta via CLI flag.

### Express/Fastify/Hono — código do servidor

Use `process.env.PORT` pra escutar (Play injeta a porta dinâmica). Bind em `0.0.0.0` pra cobrir todas as interfaces:

```js
app.listen(Number(process.env.PORT) || 3000, "0.0.0.0");
```

## Manifest do draft

`manifest.json` mínimo (na raiz do draft):

```json
{
  "name": "Notas",
  "version": "0.1.0"
}
```

Campos opcionais (apenas quando autodetect não cobre o caso):

- `runtime`: `"nextjs"` | `"vite"` | `"node"` — sobrescreve a detecção automática.
- `scripts.dev`: comando customizado pra `dev`. Se ausente, Play usa `pnpm exec next dev -p $PORT` / `pnpm exec vite --port $PORT` / `pnpm run dev` conforme runtime.
- `port`: porta fixa pra forçar (default: porta dinâmica 3500+ alocada pelo Play).

## Quando pnpm não está instalado

A UI do Play oferece instalação assistida (botão "Instalar pnpm" no preflight). **Não rode** `npm install -g pnpm` manualmente da sessão do agente — o Play tem comando dedicado (`install_pnpm`) que cuida disso de forma rastreável.
