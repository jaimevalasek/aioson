# Dev Link Install — testar apps sem reinstalar

3 modos de instalação suportados pelo aioson-play:

| Modo | Como instala | Quando usar | Iteração |
|---|---|---|---|
| **Da loja** | Download via `installApp` (zip do aioson.com) | Cliente final em produção | Reinstalar a cada update |
| **Dev link** ⭐ | `install_app_dev_link` cria symlink `apps/{slug} → /caminho/source` | Loop de desenvolvimento | **Mudanças instantâneas** — reinício pelo `npm run dev` do app |

## Como usar (dev link)

1. Abrir aioson-play, clicar em **Instalar App**
2. Selecionar a aba **Linkar pasta (dev)**
3. Colar o caminho absoluto da pasta do seu app (que contém `manifest.json`)
4. Clicar **Linkar pasta**

O app aparece na home com badge **DEV** indicando origem por symlink. O badge é tooltip-aware: hover mostra o `source_path` para confirmar para onde o link aponta.

## Loop de desenvolvimento (recomendado)

O aioson-play spawna cada app como `npm run dev` (`process_manager.rs:128`). Para iteração instantânea do código, o `dev` script do app deve usar um runner com watch mode.

**Exemplo (Node + TypeScript):**

```json
{
  "scripts": {
    "start": "ts-node src/server.ts",
    "dev": "ts-node-dev --respawn --transpile-only --ignore-watch node_modules --ignore-watch dist src/server.ts"
  }
}
```

**Exemplo (Vite frontend):**

```json
{
  "scripts": {
    "dev": "vite"
  }
}
```

Mudanças no código → ts-node-dev/vite detecta → reinicia processo. Sem precisar reinstalar no aioson-play.

## Caveats

### Windows

Symlinks de pastas exigem **Developer Mode** habilitado:

1. Configurações → Atualização e Segurança → Para desenvolvedores
2. Ativar "Modo de desenvolvedor"

Alternativa: executar o aioson-play como **Administrador** (não recomendado para uso diário).

Em **Linux / macOS / WSL** symlinks funcionam nativamente sem privilégios extras.

### Persistência de metadata

Como a pasta do app é um symlink, escrever `.install-mode.json` dentro poluiria o repositório de origem. O metadata é gravado em **`{appLocalDataDir}/apps/.install-modes/{app_slug}.json`** — sibling do app dir, fora do symlink.

Schema:
```json
{
  "mode": "dev_link",
  "source_path": "/home/user/MyProjects/atendimento",
  "installed_at": "2026-05-03T22:00:00Z"
}
```

### Apps com porta dinâmica

Para apps com `has_api: true` no manifest, o aioson-play aloca uma porta em runtime via `allocate_app_port`. No modo dev-link, a porta é alocada e mantida em memória (não persiste no manifest do source — evita poluir o repo). Se o aioson-play reiniciar, nova porta pode ser alocada.

### Atualização de manifest

Mudanças no `manifest.json` da pasta source aparecem imediatamente, mas o aioson-play já pode ter cacheado o manifest na memória. Para forçar releitura: parar o processo do app no aioson-play e abrir de novo.

## Quando NÃO usar dev-link

- **Distribuição para clientes finais** — use store install
- **CI/teste isolado** — mudanças no source contaminam testes
- **Validação pré-publish** — para validar que o zip da store funcionará, prefira install-de-disco copy ou publish via `system:publish` em workspace de teste

## Comandos Tauri envolvidos

| Comando | Origem | O que faz |
|---|---|---|
| `install_app_dev_link(apps_dir, app_slug, source_path)` | `systems.rs` | Cria symlink + escreve install metadata |
| `mark_install_mode_store(apps_dir, app_slug)` | `systems.rs` | Marca app como instalado da store após `installApp` |
| `get_install_mode(apps_dir, app_slug)` | `systems.rs` | Retorna `{ mode, source_path?, installed_at }` ou `null` |
| `clear_install_mode(apps_dir, app_slug)` | `systems.rs` | Remove o metadata em uninstall |

## Fluxo completo de teste (atendimento)

```bash
# 1. Garantir dev script no atendimento
cd ~/aioson-squads/atendimento
cat package.json | grep '"dev":'   # confirmar ts-node-dev presente

# 2. Habilitar Developer Mode no Windows (se aplicável), ou seguir para o passo 3 em Linux/Mac/WSL

# 3. Abrir aioson-play em dev mode
cd ~/MyProjects/aioson-play
npm run tauri dev

# 4. Na UI: Instalar App → "Linkar pasta (dev)" → colar /home/user/aioson-squads/atendimento → "Linkar pasta"

# 5. Abrir o app: aioson-play spawna `npm run dev` → ts-node-dev sobe o server com watch

# 6. Editar src/lib/llm.ts no atendimento → ts-node-dev reinicia o processo automaticamente
```
