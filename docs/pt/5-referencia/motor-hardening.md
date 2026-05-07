# Hardening do Motor AIOSON

> Documentação das melhorias de robustez introduzidas no motor de orquestração do AIOSON a partir da v1.7.3+

## Índice

1. [O que mudou?](#o-que-mudou)
2. [Gates técnicos obrigatórios](#gates-técnicos-obrigatórios)
3. [Guardrails de Git no @committer](#guardrails-de-git-no-committer)
4. [Test briefing automático para @qa](#test-briefing-automático-para-qa)
5. [Contratos de handoff verificados por máquina](#contratos-de-handoff-verificados-por-máquina)
6. [Resolução canônica de caminhos](#resolução-canônica-de-caminhos)
7. [Auto-cura (self-healing)](#auto-cura-self-healing)
8. [Hardening autônomo de fricção](#hardening-autônomo-de-fricção)
9. [Comandos novos e atualizados](#comandos-novos-e-atualizados)
10. [Exemplos práticos](#exemplos-práticos)

---

## O que mudou?

O motor do AIOSON agora endurece o pipeline de agentes com **7 camadas de proteção** que reduzem os problemas mais comuns encontrados em sessões intensivas:

1. **Código quebrado passando adiante** → gate de compilação/teste após `@dev`
2. **Acidentes de git** → verificação obrigatória antes de `@committer`
3. **Testes falhando por textos de UI errados** → briefing de teste injetado no `@qa`
4. **Handoffs incompletos** → validação de contrato por máquina entre estágios
5. **Arquivos no lugar errado** → mapa de caminhos canônicos (`project-map.md`)
6. **Loops manuais de debug** → auto-cura com retry e prompt corretivo
7. **Mesmos erros se repetindo** → scanner de fricção e fixes preventivos

---

## Gates técnicos obrigatórios

### Quando são ativados

Sempre que você executa `aioson workflow:next . --complete` para finalizar o estágio `@dev` ou antes de ativar `@qa`.

### O que o motor verifica

O motor detecta a stack do projeto e roda os verificadores mínimos:

| Stack | Comando executado |
|---|---|
| TypeScript | `npx tsc --noEmit` |
| Rust | `cargo check` (e `cargo test` quando disponível) |
| Node.js | `npm test` (ou `npm run test:unit` / `npm run test:ci`) |
| Python | `pytest` |

### Comportamento

- Se **todos os checks passarem**: o workflow avança normalmente.
- Se **algum check falhar**: o workflow é **bloqueado** com a mensagem `[Technical Gate BLOCKED]` e o stderr completo do erro.

### Exemplo

```bash
# Dev terminou de implementar
$ aioson workflow:next . --complete=dev

[Technical Gate BLOCKED]
Stage: @dev
Reasons:
  - TypeScript compilation failed

=== Command output ===

[TypeScript compilation] npx tsc --noEmit
src/components/Button.tsx:12:15 - error TS2322: Type 'string' is not assignable to type 'number'.

Fix the errors above before completing this stage.
Use --force to override (not recommended).
```

### Forçar passagem (não recomendado)

Se você tiver certeza de que o erro é falso-positivo:

```bash
aioson workflow:next . --complete=dev --force
```

---

## Guardrails de Git no @committer

### Quando são ativados

Antes de ativar `@committer`, o motor inspeciona o stage do git.

### Regras

1. **Se não houver arquivos no stage**: bloqueio imediato.
2. **Se houver arquivos proibidos** (`node_modules/`, `dist/`, `.next/`, `*.db`, secrets): bloqueio imediato.

### O que fazer quando bloqueia

```bash
# Caso 1: nada no stage
$ aioson commit:prepare .
# (seleciona os arquivos na UI de checkbox)

# Caso 2: arquivos proibidos no stage
$ aioson git:guard .
# (mostra o que está errado)
$ git restore --staged -- node_modules/
$ aioson commit:prepare .
```

### Exemplo de fluxo correto

```bash
# Sempre rode commit:prepare antes de ativar @committer
aioson commit:prepare .
# -> guard passa, diff é coletado, commit-prep.json gerado
# -> agora sim ative @committer
```

---

## Test briefing automático para @qa

### O que é

Toda vez que `@qa` ou `@tester` são ativados via `workflow:next`, o motor injeta automaticamente no prompt um **test briefing** construído a partir do projeto atual.

### Conteúdo do briefing

- **Mock helpers compartilhados** encontrados (`tests/helpers/mocks.ts`, `__mocks__/`, etc.)
- **Arquivos de teste recentes** para usar como template de padrões
- **Padrões comuns de mock** (ex: `vi.mock(...)`, `vi.fn(...)`)
- **Strings de UI extraídas** dos componentes recentemente modificados
- **Convenções de teste** do projeto

### Por que isso importa

Reduz os erros clássicos:
- `"Confirmar"` vs `"Vincular"` em assertions
- Mock ordering bugs
- `getByText` quando deveria ser `getByRole`

### Exemplo de como aparece para o agente

```markdown
## Auto-generated Test Context (motor do AIOSON)

### Shared mock helpers found
- tests/helpers/mocks.ts

### UI text strings from recent components
**src/components/LoginButton.tsx:**
- "Entrar"
- "Esqueci minha senha"

### Testing conventions
- Verify exact UI text strings against component source before using them in assertions.
- Use `getByRole` over `getByText` when possible.
```

---

## Contratos de handoff verificados por máquina

### O que é

Cada agente tem um **contrato de saída** que define:
1. Quais artefatos ele deve produzir
2. Quais gates devem estar aprovados
3. Quais arquivos de contexto devem ser atualizados

Antes de qualquer transição de estágio, o motor valida esse contrato.

### Exemplo: @analyst → @architect

Para `@analyst` finalizar, o motor verifica:
- `requirements-{slug}.md` existe?
- `spec-{slug}.md` existe?
- Gate A (requirements) está `approved`?

Se faltar algo, o erro é:

```
[Handoff Contract BLOCKED]
Stage: @analyst
Missing deliverables:
  - gate A not approved (gate_requirements_not_approved)

Complete these items before finishing the stage.
```

### Tabela de contratos por agente

| Agente | Artefatos obrigatórios | Gates |
|---|---|---|
| `@setup` | `project.context.md` | — |
| `@product` | `prd.md` ou `prd-{slug}.md` | — |
| `@analyst` | `requirements-{slug}.md`, `spec-{slug}.md` | A |
| `@architect` | `architecture.md` | B |
| `@ux-ui` | `ui-spec.md` | B |
| `@pm` | `implementation-plan-{slug}.md` | — |
| `@dev` | — (código) | C |
| `@qa` | — (testes/relatório) | D |

---

## Resolução canônica de caminhos

### O problema

Agentes frequentemente criavam arquivos no lugar errado:
- `docs/` sendo interpretado como `.aioson/docs/`
- Bootstrap files indo para a raiz em vez de `.aioson/context/bootstrap/`

### A solução

O arquivo `.aioson/context/project-map.md` define os **caminhos canônicos** do projeto.

Ele é carregado automaticamente nos prompts de agentes de implementação (`@dev`, `@architect`, `@ux-ui`, `@qa`, `@tester`, `@committer`).

### Exemplo de project-map.md

```markdown
---
agents: [dev, architect, ux-ui, qa, tester, committer]
---

# Canonical Project Map

| Intent | Canonical path | Notes |
|---|---|---|
| `docs/` (root) | `docs/` | NOT `.aioson/docs/` |
| `.aioson/context/` | `.aioson/context/` | Framework artifacts only |
```

### Regras que o motor impõe

- `docs/` = raiz `docs/`, nunca `.aioson/docs/`
- Confirmar path ambíguo com o usuário antes de criar
- Nunca sobrescrever `.gitignore` ou logs existentes sem pedido explícito

---

## Auto-cura (self-healing)

### Conceito

Quando um gate técnico ou contrato falha, em vez de apenas bloquear e esperar você reescrever o prompt, o motor pode **reativar o próprio agente com o erro como contexto corretivo**.

### Modo manual: `workflow:heal`

```bash
# Reativa @dev com o último erro injetado no prompt
aioson workflow:heal . --stage=dev
```

O que acontece:
1. Motor lê o último erro gravado
2. Verifica se ainda há retry disponível (máx 3)
3. Reconstrói o prompt do `@dev` com uma seção `Self-Healing Context`
4. O agente recebe instruções explícitas: "corrija apenas este erro, rode o verificador, depois finalize"

### Modo automático: `--auto-heal`

```bash
# Ao completar dev, se houver erro técnico, o motor reativa @dev sozinho
aioson workflow:next . --complete=dev --auto-heal
```

Comportamento:
- Falha detectada → loga erro → incrementa retry counter
- Prompt de healing gerado → agente reativado automaticamente
- Se o agente corrigir e o próximo `--complete` passar → contador é resetado
- Se esgotar 3 tentativas → escala para você

### Exemplo de prompt de healing

```markdown
## 🩹 Self-Healing Context (auto-injected by AIOSON motor)

> This is retry attempt 1 of 3 for stage @dev.

### Error that caused the previous failure
```
[Technical Gate BLOCKED] TypeScript compilation failed
src/index.ts:3:10 - error TS2345...
```

### Your task now
1. Read the error above carefully.
2. Identify the root cause in the codebase.
3. Apply the minimal fix needed.
4. Re-run the verification command to confirm the fix.
5. Only then finish the stage.
```

---

## Hardening autônomo de fricção

### Comando

```bash
# Analisa erros recorrentes e propõe/aplica fixes preventivos
aioson workflow:harden .

# Apenas preview, sem aplicar nada
aioson workflow:harden . --dry-run
```

### O que ele faz

1. Lê `.aioson/context/workflow.errors.jsonl`
2. Classifica os erros em padrões recorrentes
3. Gera recomendações com prioridade
4. Aplica **auto-fixes** quando seguro:
   - Atualiza `.gitignore` com `node_modules/`, `dist/`, `.next/`, `*.db`
   - Instala pre-commit hook do `git:guard`
   - Cria stub de `tests/helpers/mocks.ts`

### Exemplo de saída

```
Codebase Hardening — ACTIVE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Errors scanned: 12
Patterns found: 3
Auto-fixes applied: 2

Top patterns:
  - Git staging accidents: 4
  - TypeScript compilation errors: 3
  - Mock ordering / test helper issues: 2

Report: .aioson/context/hardening-report.md
```

### Padrões detectados

| Padrão | Ação sugerida |
|---|---|
| TypeScript compile | Adicionar `tsc --noEmit` aos checks pré-commit |
| Rust compile | Adicionar `cargo check` ao pipeline |
| JSX structure | Adicionar ESLint plugin react/jsx |
| Mock ordering | Criar mock factory compartilhada |
| UI text mismatch | Reforçar test briefing e `getByRole` |
| Git staging | `.gitignore` + pre-commit hook |
| Path misunderstanding | Manter `project-map.md` atualizado |
| Handoff contract | Revisar prompts de gate-setting |

---

## Live sessions com tmux

A partir da v1.7.3+, `live:start` suporta **tmux** para sessões persistentes no terminal:

```bash
# Iniciar sessão viva com tmux (padrão quando tmux está disponível)
aioson live:start . --tool=codex --agent=dev --plan=plan.md

# O launcher detecta tmux automaticamente e cria uma sessão nomeada
# Use --no-tmux para forçar modo inline
aioson live:start . --tool=codex --agent=dev --no-tmux
```

O tmux launcher (`src/lib/tmux-launcher.js`) gerencia:
- Verificação de disponibilidade do tmux
- Criação de sessão com nome baseado no projeto e agente
- Anexação automática ou em pane separada
- Status compacto em ANSI colorido para painéis pequenos

**Por que tmux?**
- Sessão persiste mesmo se o terminal original fechar
- Permite acompanhar `live:status` em pane paralelo
- Facilita handoffs sem perder o contexto do terminal

## Comandos novos e atualizados

### Novos comandos

| Comando | Descrição |
|---|---|
| `aioson workflow:heal . --stage=dev` | Reativa um agente com contexto corretivo |
| `aioson workflow:harden .` | Analisa fricções e aplica hardening |

### Flags novas

| Flag | Comando | Efeito |
|---|---|---|
| `--auto-heal` | `workflow:next` | Ativa auto-cura automática em gate failures |
| `--force` | `workflow:next --complete` | Ignora gates técnicos (não recomendado) |

### Comandos existentes que ganharam comportamento

| Comando | Novo comportamento |
|---|---|
| `workflow:next . --complete` | Agora roda gates técnicos e contratos antes de liberar |
| `workflow:next . --agent=committer` | Agora verifica git stage antes de ativar |
| `workflow:next . --agent=qa` | Agora injeta test briefing no prompt |

---

## Exemplos práticos

### Exemplo 1: Fluxo normal com gate técnico

```bash
# 1. Dev está implementando
aioson workflow:next . --agent=dev

# 2. Dev diz que terminou
aioson workflow:next . --complete=dev
# -> Motor roda tsc --noEmit
# -> Se passar, avança para @qa
# -> Se falhar, exibe o erro completo
```

### Exemplo 2: Auto-cura em ação

```bash
# Dev terminou, mas código quebrou
aioson workflow:next . --complete=dev --auto-heal

# -> Motor detecta erro de TS
# -> Reativa @dev automaticamente com erro no prompt
# -> Você (ou o agente) corrige
# -> Roda de novo:
aioson workflow:next . --complete=dev
# -> Agora passa e vai para @qa
```

### Exemplo 3: Preparando commit seguro

```bash
# Sempre rode antes de @committer
aioson commit:prepare .

# Verifica stage, roda git:guard, coleta diff
# Se passar:
aioson workflow:next . --agent=committer
# -> committer recebe commit-prep.json pronto
```

### Exemplo 4: QA com briefing injetado

```bash
# Motor detecta que @qa será ativado
aioson workflow:next . --agent=qa

# -> Prompt do qa inclui automaticamente:
#    - mock helpers do projeto
#    - strings de UI dos componentes recentes
#    - padrões de teste encontrados
```

### Exemplo 5: Hardening semanal preventivo

```bash
# Rode uma vez por semana
aioson workflow:harden .

# Verifica se há padrões de erro recorrentes
# Aplica fixes automáticos quando seguro
```

### Exemplo 6: Reativando dev após falha manual

```bash
# Se você corrigiu o erro fora do agente:
aioson workflow:heal . --stage=dev

# Reativa @dev com o último erro logado
# O agente verifica se está green e finaliza
```

---

## Dicas de produtividade

1. **Use `--auto-heal` em sessões longas** — ele economiza re-prompts mecânicos
2. **Não use `--force` no gate técnico** — a menos que o erro seja realmente um falso-positivo do ambiente
3. **Mantenha `project-map.md` atualizado** — especialmente se sua estrutura de pastas for não-padrão
4. **Rode `workflow:harden` periodicamente** — mesmo sem erros, ele valida a saúde preventiva
5. **Sempre use `commit:prepare`** — antes de `@committer` para aproveitar o guard e o diff coletado

---

## Referências

- [Comandos CLI](./comandos-cli.md) — referência completa de comandos
- [Agent Chain Continuity](./agent-chain-continuity.md) — continuidade de sessão que complementa o hardening
- [SDD Automation Scripts](./sdd-automation-scripts.md) — scripts determinísticos que reforçam os gates
- [Fichas dos agentes](../4-agentes/README.md) — quando usar cada agente
