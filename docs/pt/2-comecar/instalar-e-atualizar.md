# Instalar e atualizar o AIOSON

> **Para quem é:** quem vai instalar pela primeira vez, ou já usa e quer subir de versão sem sustos.
> **Tempo de leitura:** 8 min.

---

## O que você precisa

| Requisito | Versão | Observação |
|---|---|---|
| Node.js | 20 ou maior | Exigido pelo CLI |
| Um cliente AI | — | Claude Code, Codex CLI ou OpenCode |

Só isso. O AIOSON não instala dependências no seu projeto.

Alguns recursos opcionais pedem algo a mais:

| Recurso | O que ele precisa |
|---|---|
| `scan:project --with-llm` — varredura de codebase existente com apoio de LLM | Um `aioson-models.json` na raiz com chave de API de um modelo barato (DeepSeek, OpenAI, Gemini, Groq, Together, Mistral ou Anthropic). Sem chave, o scan roda em modo local. |
| `qa:run` / `qa:scan` — QA de navegador | `npm install -g playwright && npx playwright install chromium` |
| `verify:artifact --kind=visual --runtime` — medição visual em browser | `npm i -D playwright && npx playwright install chromium`. O `aioson doctor` avisa quando falta. |
| `mcp:init` / `mcp:doctor` | Um cliente compatível com MCP |
| Projetos Web3 | Hardhat, Foundry, Anchor ou outro toolchain da cadeia. Veja [Web3](../5-referencia/web3.md). |

---

## Instalar

### Projeto novo

```bash
npx @jaimevalasek/aioson init meu-projeto
cd meu-projeto
```

### Projeto que já existe

```bash
cd meu-projeto
npx @jaimevalasek/aioson install
```

O `install` é aditivo. Ele cria `.aioson/` e os arquivos de instrução na raiz (`CLAUDE.md`, `AGENTS.md`, `OPENCODE.md`), e não toca no seu código, no seu `package.json` nem na sua infra.

### O wizard

Os dois comandos abrem um wizard interativo com três perguntas:

1. **Quais clientes AI ativar** — Claude Code, Codex (OpenAI), OpenCode. Só os arquivos do que você marcar são copiados.
2. **Modo** — Development, ou Development + Squads.
3. **Idioma dos agentes** — English, Português (Brasil), Español, Français.

Não há pergunta de design: o template embarca uma única design skill — o motor `interface-design` — sempre instalada, guiada depois pelo `@setup` com suas imagens de referência.

### Flags úteis

| Flag | Vale para | O que faz |
|---|---|---|
| `--all` | `init` | Pula o wizard e instala tudo: os três clientes, Development + Squads |
| `--no-interactive` | `init`, `install` | Não pergunta nada. Em `install`, usa o perfil salvo; sem perfil salvo, instala tudo e avisa |
| `--reconfigure` | `install` | Reabre o wizard para adicionar clientes ou ativar Squads depois. Precisa de terminal interativo |
| `--lang=pt-BR` | `init`, `install`, `update` | Aplica o pack de idioma nos agentes (`en`, `pt-BR`, `es`, `fr`) |
| `--tool=claude` | `init`, `install` | Define a ferramenta usada nas dicas de prompt (`codex`, `claude`, `opencode`) |
| `--dry-run` | `init`, `install`, `update` | Mostra o que aconteceria sem escrever nada |
| `--force` | `init`, `install` | Continua mesmo com o diretório não vazio / sobrescreve arquivos gerenciados |
| `--no-hooks` | `init`, `install`, `update` | Não instala os hooks do AIOSON |

> Em `install`, `--all` não existe. Para instalar tudo sem wizard num projeto existente, use `--no-interactive` sem perfil salvo.

### Os hooks vêm por padrão

`init`, `install` e `update` instalam os hooks do AIOSON automaticamente. Eles fazem duas coisas:

- **Antes de cada escrita de arquivo**, o `context:guard` injeta as restrições das regras do projeto que valem para aquele arquivo.
- **Depois de cada escrita, comando e fim de sessão**, um evento é gravado — é assim que o dashboard enxerga a sessão.

Falha na instalação dos hooks nunca derruba o comando: ele avisa e segue. Para não instalar, passe `--no-hooks`; para instalar depois, `aioson hooks:install`.

Detalhes em [Hooks e Session Guard](../5-referencia/hooks-session-guard.md).

---

## Onde cada cliente lê as instruções

| Cliente AI | Arquivo de configuração |
|---|---|
| Claude Code | `CLAUDE.md` + `.claude/` |
| Codex CLI | `AGENTS.md` + `.codex/` |
| OpenCode | `OPENCODE.md` |

Os arquivos em `.aioson/` são agnósticos: os três clientes leem os mesmos agentes, regras e contexto. Comparativo completo em [Clientes AI](../5-referencia/clientes-ai.md).

---

## Atualizar

Aqui mora a pegadinha mais comum do AIOSON. **Duas coisas** têm versão, e elas podem divergir:

1. **O CLI que você executa** (`aioson`).
2. **Os arquivos do AIOSON dentro do projeto** (`.aioson/`).

> ⚠ **O motivo número 1 de "rodei `aioson update` e não veio a versão nova":** o `update` copia os templates que vieram embutidos **no CLI que está no seu disco**. Se o seu CLI global está numa release antiga, o `update` vai copiar os arquivos daquela release antiga, quantas vezes você rodar. Primeiro é preciso atualizar o CLI.
>
> Desde a 1.50 o pior caso é bloqueado automaticamente: se o CLI for **mais antigo** que a versão registrada no projeto (`.aioson/install.json`), o `update` (e o `install --force`) recusa com uma mensagem explicando a ordem certa, em vez de fazer downgrade dos arquivos gerenciados. Para forçar mesmo assim, use `--allow-downgrade`.

### Passo 1 — atualizar o CLI

Se você instalou global:

```bash
npm install -g @jaimevalasek/aioson@latest
aioson --version
```

Se o `aioson --version` continua mostrando a versão antiga, o binário está sendo sombreado (Node antigo no PATH, troca de nvm, instalação global sobrando). Reinstale limpo:

```bash
npm uninstall -g @jaimevalasek/aioson
npm install -g @jaimevalasek/aioson@latest
aioson --version
```

Prefere não instalar global? Use `npx` fixado em `@latest`. Ele sempre busca a última versão publicada e ignora o que estiver instalado globalmente:

```bash
npx @jaimevalasek/aioson@latest <comando>
```

### Passo 2 — atualizar os arquivos do projeto

De dentro da pasta do projeto:

```bash
aioson update
aioson doctor --fix
```

O `update` mexe só nos arquivos gerenciados pelo framework, respeitando o perfil salvo, e preserva o que é seu: contexto, docs do projeto, regras autorais, pacotes de squad e o banco local de runtime. Ao terminar ele imprime `Template version applied: <versão>` — é assim que você confere qual template realmente chegou.

Repita em cada projeto que você quer atualizar.

| Flag do `update` | O que faz |
|---|---|
| `--selective` | Modo conservador legado: atualiza menos arquivos |
| `--all` | Aceito por compatibilidade; "tudo" já é o padrão |
| `--dry-run` | Mostra o que mudaria sem escrever |
| `--allow-downgrade` | Libera um update com CLI mais antigo que o projeto (bloqueado por padrão) |
| `--lang=pt-BR` | Reaplica o pack de idioma junto |
| `--no-hooks` | Não reinstala os hooks |

---

## Conferir se está tudo certo

```bash
aioson doctor          # diagnóstico da instalação; --fix recoloca o que faltar
aioson info            # versão, diretório-alvo, framework detectado
aioson workflow:next . # em que ponto do fluxo o projeto está
```

Um dos checks, `visual:runtime_telemetry`, diz se o Playwright está disponível para a medição visual em browser:

```
[FAIL] Visual runtime telemetry (Playwright present)
  Hint: Visual gates are static-only. Enable browser measurement with: npm i -D playwright && npx playwright install chromium
```

Ele tem severidade `warning`: aparece na lista, mas não derruba o resultado geral do `doctor`.

---

## Sair do AIOSON

Apague `.aioson/` e os arquivos `CLAUDE.md` / `AGENTS.md` / `OPENCODE.md`. Nada mais foi tocado.

Para remover os hooks das configurações do seu cliente AI:

```bash
aioson hooks:uninstall . --tool=claude
```

---

## Próximo passo

- Primeira feature do zero → [Primeiro projeto](./primeiro-projeto.md)
- Trazer AIOSON para um codebase existente → [Projeto existente](./projeto-existente.md)
- MICRO, SMALL ou MEDIUM? → [Decisões iniciais](./decisoes-iniciais.md)
