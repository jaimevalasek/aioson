# aioson.com Store — Publicar e Instalar

> **Para quem é:** quem quer compartilhar squads, genomes ou skills entre projetos, ou publicar para outros times.
> **Tempo de leitura:** 6 min
> **O que você vai sair sabendo:**
> - Como empacotar e publicar um sistema no aioson.com
> - Como instalar de outro projeto
> - Diferença entre público, privado e invite-only

## Para que serve

Você criou um squad de agentes especializados em compliance jurídico. Funciona no projeto A. Quer usar no projeto B, ou compartilhar com um colega. Sem o store, você copia arquivos manualmente e perde sincronia.

Com o store do aioson.com, você empacota o sistema (`system:package`), publica (`system:publish`), e qualquer outro projeto autorizado instala com um comando (`system:install`). O backup local é criado automaticamente antes de qualquer instalação.

O que pode ser publicado: **squads**, **genomes**, **skills** — qualquer coisa que viva em `.aioson/`.

## Autenticação

```bash
# Login (abre browser para OAuth)
aioson auth login

# Verificar autenticação atual
aioson auth status
```

Depois do login, o token fica salvo localmente. Todos os comandos de store usam automaticamente.

## Empacotar

```bash
# Empacotar o sistema atual (gera um .zip em .aioson/system-packages/)
aioson system:package .
```

O `system:package` coleta os arquivos do projeto respeitando uma allowlist de extensões (`.ts`, `.tsx`, `.js`, `.jsx`, `.json`, `.css`, `.md`, `.yaml`, etc.) e excluindo `node_modules`, `.git`, `dist`, `.aioson`, etc. Limite: 512 KB por arquivo, 20 MB total.

## Publicar

```bash
# Publicar (público por padrão)
aioson system:publish .

# Publicar como privado (só você acessa)
aioson system:publish . --private

# Publicar com invite — só os emails listados podem instalar
aioson system:publish . --invite="joao@empresa.com,maria@empresa.com"
```

O `--invite` aceita emails separados por vírgula, ponto-e-vírgula ou espaço. Emails precisam conter `@`. A lista é deduplicada automaticamente.

Após publicar, você recebe um `slug` — o identificador do seu sistema no store.

## Instalar de outro projeto

```bash
# Instalar pelo slug
aioson system:install <slug>

# Ver o que seria instalado antes de confirmar
aioson system:install <slug> --dry-run
```

Antes de instalar, o AIOSON cria um backup do seu `.aioson/` em `.aioson/.backups/`. Se algo der errado, você pode restaurar.

## Privacidade

| Modo | Quem acessa |
|---|---|
| Público (padrão) | Qualquer pessoa com o slug |
| Privado | Só você (conta autenticada) |
| Invite-only (`--invite`) | Só os emails listados |

Para mudar a privacidade de um sistema já publicado, publique novamente com as novas configurações — o slug é reutilizado.

## Exemplo prático

```
# Projeto A — criar e publicar squad de compliance
$ aioson system:package .
> Empacotando .aioson/squads/compliance/ ...
> Pacote criado: .aioson/system-packages/compliance-2026-05-07.zip

$ aioson system:publish . --invite="joao@empresa.com"
> Publicado: aioson.com/store/compliance-v1
> Slug: compliance-v1
> Acesso: invite-only (1 email)

# Projeto B — instalar o squad
$ aioson system:install compliance-v1
> Backup criado: .aioson/.backups/pre-install-2026-05-07/
> Instalando compliance-v1...
> Squad @regulator, @attorney, @auditor instalados em .aioson/squads/compliance/
> Pronto. Teste com @squad ou @regulator.
```

## Saídas em disco

```
.aioson/
├── system-packages/          ← pacotes gerados (não commitados)
│   └── <sistema>-<data>.zip
└── .backups/                 ← backups pré-instalação
    └── pre-install-<data>/
```

## Quando NÃO usar

- Para sincronizar agentes entre dois projetos do mesmo repositório. Use `aioson sync:agents .` — é direto e não precisa de publicação.
- Para compartilhar context files (specs, PRDs, dossiers). Esses são específicos do projeto e não fazem sentido no store.
- Publicar código de aplicação (`.aioson/` não deve conter código da sua app — só config de agentes).

## Próximo passo

- [Ficha do @squad](../4-agentes/squad.md) — criar squads para publicar
- [Receita: Publicar no aioson.com](../3-receitas/publicar-no-aioson-com.md) — passo a passo end-to-end
- [Genome Distribution](./genome-distribution.md) — publicar genomes especificamente
