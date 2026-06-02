# Usando AIOSON com diferentes CLIs de IA

O AIOSON funciona com **Claude Code**, **Codex CLI** e **OpenCode**. Cada um tem uma forma diferente de ativar agentes — este guia explica como usar cada um sem confusão.

Também funciona em qualquer IDE com terminal: VS Code, Google Antigravity, Cursor, Windsurf, JetBrains IDEs e Zed — basta abrir um dos clientes acima no terminal integrado.

---

## Comparativo rápido

| | Claude Code | Codex CLI | OpenCode |
|---|---|---|---|
| Arquivo de config | `CLAUDE.md` | `AGENTS.md` | `OPENCODE.md` |
| Comandos personalizados | `.claude/commands/` | Nao suporta | Nao suporta |
| Autocomplete de agentes | `/aioson/` + Tab | Nao suporta | Nao suporta |
| Como ativar agente | `/aioson/setup` | linguagem natural | linguagem natural |
| Lê contexto automático | Sim (CLAUDE.md injeta) | Sim (AGENTS.md injeta) | Sim (OPENCODE.md injeta) |

---

## Claude Code

### Como funciona

O Claude Code lê `CLAUDE.md` automaticamente ao iniciar. Os agentes do AIOSON ficam em `.claude/commands/aioson/` — isso cria o namespace `/aioson/*` no autocomplete.

O nome humano do agente é **UI/UX**, mas o comando continua sendo `/aioson/ux-ui`.

### Ativando agentes

Digite `/` para abrir o autocomplete e depois `aioson/`:

```
/aioson/setup
/aioson/analyst
/aioson/architect
/aioson/deyvin
/aioson/ux-ui
/aioson/pm
/aioson/dev
/aioson/qa
/aioson/orchestrator
```

### Exemplos de uso

```
/aioson/setup
```
> O agente @setup detecta o framework, faz as perguntas de onboarding e gera o `project.context.md`.

```
/aioson/dev implementar autenticação JWT com refresh token
```
> O agente @dev recebe o argumento como contexto extra e começa a implementação em steps atômicos.

```
/aioson/deyvin veja o que fizemos ontem e vamos continuar
```
> O agente @deyvin prioriza memoria + runtime + rules/docs antes de olhar Git e segue em modo companheiro tecnico.

Alias compativel:
```text
/aioson/pair
```

```
/aioson/qa
```
> O agente @qa lê o contexto e sugere um plano de testes para as features implementadas.

### Primeira vez no projeto

Se `project.context.md` não existir, o CLAUDE.md instrui o Claude a rodar `/aioson/setup` automaticamente antes de qualquer outra ação.

---

## Codex CLI (OpenAI)

### Como funciona

O Codex não suporta slash commands personalizados nem autocomplete de comandos. Em vez disso, o AIOSON usa o `AGENTS.md` para injetar contexto — o Codex lê esse arquivo automaticamente e entende quais agentes existem.

**Não espere `/` para aparecer agentes AIOS no Codex** — isso não acontece. Os agentes são invocados via linguagem natural.

### Ativando agentes

Descreva o que você quer e mencione o agente. O Codex lê o `AGENTS.md`, localiza o arquivo do agente correspondente e segue as instruções:

```
use o agente @setup para iniciar o projeto
```

```
ative o @dev para implementar o módulo de autenticação
```

```
use @architect para desenhar a estrutura de pastas do projeto
```

```
activate the @qa agent to write tests for the auth module
```

### Sessao rastreada no dashboard

Se voce quer que a ativacao apareca em `tasks`, `agent_runs` e no dashboard do runtime, nao dependa so da mencao natural ao agente na conversa.

Use um gateway oficial antes de continuar no Codex:

```bash
aioson workflow:next . --tool=codex
```

ou, para handoff direto rastreado:

```bash
aioson agent:prompt deyvin . --tool=codex
```

Se quiser que o proprio AIOSON abra e supervisione uma sessao viva do cliente externo, use:

```bash
aioson live:start . --tool=codex --agent=deyvin --no-launch
```

Dentro dessa sessao viva, o agente passa a usar `runtime:emit`, `live:handoff`, `live:status` e `live:close` para manter o dashboard e os arquivos de sessao sincronizados.

Depois cole o prompt gerado no Codex e continue a sessao.

A ativacao por linguagem natural via `AGENTS.md` pode executar o contrato do agente, mas nao garante registros no dashboard porque esse caminho nao passa pelo gateway oficial.

### Exemplos completos

**Iniciar projeto novo:**
```
use the @setup agent to onboard this project
```

**Implementar feature:**
```
use @dev to implement user registration with email verification, atomic steps
```

**Continuar sessao anterior:**
```
use @deyvin to review the latest runtime/tasks, tell me where we stopped, and continue with me
```

**Revisar plano:**
```
use @analyst to analyze the requirements in prd.md and identify gaps
```

**Orquestrar sessão:**
```
activate @orchestrator to plan this session — I want to implement the checkout flow
```

### Como o Codex encontra os agentes

O `AGENTS.md` na raiz do projeto mapeia cada `@agente` para o caminho do arquivo:

```markdown
- @setup → `.aioson/agents/setup.md`
- @dev → `.aioson/agents/dev.md`
...
```

Quando você menciona `@setup`, o Codex lê o arquivo correspondente e segue todas as instruções do agente.

### Dicas para Codex

- **Seja explícito**: `use @dev` funciona melhor que apenas "implemente"
- **Para continuidade**: `use @deyvin` funciona melhor que "ve o que fizemos ontem"
- **Para rastreamento no dashboard**: prefira `aioson workflow:next . --tool=codex` ou `aioson agent:prompt <agente> . --tool=codex` antes de colar o prompt no Codex
- **Passe contexto**: `use @dev to implement X — read spec.md first`
- **Comece sempre com @setup** se `project.context.md` não existir
- O Codex também lê o contexto do agente selecionado automaticamente via `AGENTS.md`

---

## Qual CLI usar?

Não há uma resposta única — depende do seu fluxo de trabalho. Algumas considerações:

| Cenário | Recomendação |
|---|---|
| Quer autocomplete preciso com namespace isolado | Claude Code — `/aioson/*` |
| Prefere conversa natural sem memória de comandos | Codex — `use @dev to...` |
| Projeto em equipe com múltiplos CLIs | Claude, Codex e OpenCode compartilham o contexto em `.aioson/` |

### O contexto é o mesmo independente do CLI

Independente de qual CLI você usa, todos leem os mesmos arquivos:

```
.aioson/
  config.md              ← configuração global
  agents/                ← agentes (lidos por qualquer CLI)
  context/
    project.context.md   ← gerado pelo @setup, lido por todos
    spec.md              ← documento vivo, atualizado pelo @orchestrator
    runtime/aios.sqlite  ← tasks, runs e logs consultados pelo @deyvin e pelo dashboard
```

Você pode começar um projeto com Claude Code, continuar com Codex no dia seguinte, e o contexto persiste — todos os agentes leem o mesmo `project.context.md`.

---

## Atualizar para nova versão

Após `npx @jaimevalasek/aioson@latest update` no projeto, os arquivos de configuração de todos os CLIs são atualizados:

```bash
npx @jaimevalasek/aioson@latest update
```

Isso atualiza:
- `CLAUDE.md` e `.claude/commands/aioson/`
- `AGENTS.md`
- `OPENCODE.md`
- Todos os agentes em `.aioson/agents/`

---

## Veja também

- [Decisões iniciais](../2-comecar/decisoes-iniciais.md) — como escolher e combinar clientes AI
- [Comandos CLI](./comandos-cli.md) — referência de todos os comandos do `aioson`
