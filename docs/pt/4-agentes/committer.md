# @committer — Mensagens de commit profissionais e commit seguro

> **Para quem é:** quem quer commitar sem escrever mensagem de commit na mão e sem risco de enviar arquivos errados.
> **Tempo de leitura:** 4 min.
> **O que você vai sair sabendo:**
> - O que o @committer faz além de gerar mensagem.
> - Por que ele existe como agente separado.

## Para que serve

Escrever uma boa mensagem de commit leva tempo e exige disciplina. Na prática, acabam virando "fix", "update", "wip" — inúteis para quem lê depois. E pior: o commit pode incluir arquivos que não deveriam estar lá (`.env`, `node_modules`, logs, artefatos de build).

O `@committer` resolve os dois problemas. Ele é um **portão de segurança** antes do commit: lê o diff, verifica o que está staged, bloqueia arquivos proibidos (via `git:guard`), e só então gera a mensagem no padrão Conventional Commits. Você aprova, ele commita.

A mensagem de commit é sempre em inglês (padrão técnico universal). A comunicação com você é em pt-BR.

## Quando invocar

- Depois de implementar qualquer fatia e querer commitar.
- Quando você quer garantir que só os arquivos certos estão no commit.
- Antes de um PR — a mensagem vai aparecer no histórico público.

## Quando NÃO invocar

- Você ainda não terminou a implementação — commite só quando a fatia está pronta.
- Quer incluir arquivos que o guard classificou como secretos ou artefatos locais sem revisar a exclusão.

## Diálogo típico

```
Você > @committer

@committer > Rodando git status...
             Rodando commit:prepare...

             Arquivos modificados detectados:
             ✓ src/webhooks/stripe.js
             ✓ src/routes/checkout.js
             ✗ .env (BLOQUEADO — contém secrets)
             ✗ .aioson/runtime/ (BLOQUEADO — telemetria local)

             Staged proposto (excluindo bloqueados):
             [✓] src/webhooks/stripe.js
             [✓] src/routes/checkout.js
             [ ] Selecione outros se quiser

             Mensagem de commit proposta:
             ┌──────────────────────────────────────────────────┐
             │ feat(checkout): add Stripe webhook handler       │
             │                                                  │
             │ Handle checkout.session.completed event,         │
             │ confirm order and queue confirmation email.      │
             │ Idempotency key added to prevent duplicate runs. │
             └──────────────────────────────────────────────────┘

             [Enter] Aceitar   [E] Editar   [C] Cancelar
Você > [Enter]

@committer > Commitado: abc1234
```

## Saídas em disco

| Arquivo | O que contém |
|---|---|
| `.aioson/context/commit-prep.json` | Metadados do commit preparado (diff, staged, guard result) — válido por 30 min |

## Como ele lê seu projeto

1. `.aioson/context/commit-prep.json` — se existir e for recente, pula a etapa de preparação.
2. `git status --short` — arquivos modificados.
3. `aioson commit:prepare` — prepara stage, roda guard, coleta diff.
4. `.aioson/git-guard.json` — política de arquivos bloqueados do projeto.
5. `.aioson/context/project-pulse.md` e plano relevante — para enriquecer a mensagem com contexto.

Se você disser “adicione/commite tudo”, o agente usa a lista atual do `git status` como escopo explícito, remove somente os paths realmente bloqueados e executa `git add --` com a lista concreta. Ele nunca converte esse pedido em `git add .` ou `git add -A`, e não rejeita um teste apenas por conter palavras como `token` ou `key`.

## Comandos CLI relacionados

```bash
# Preparar commit interativamente (terminal UI)
npx @jaimevalasek/aioson commit:prepare .

# Preparar em modo headless (automação/agent)
npx @jaimevalasek/aioson commit:prepare . --agent-safe --staged-only --mode=headless

# Aceitar warnings já revisados, sem liberar erros de secrets
npx @jaimevalasek/aioson commit:prepare . --staged-only --mode=trusted

# Verificar arquivos staged
npx @jaimevalasek/aioson git:guard . --json

# Instalar pre-commit hook (bloqueia commits manuais inseguros)
npx @jaimevalasek/aioson git:guard . --install-hook
```

Os modos `guarded` e `headless` tratam warnings como bloqueio. `trusted` aceita apenas warnings e os registra em `commit-prep.json`; erros de alta confiança continuam bloqueando. Um preparo `trusted` não é reutilizado automaticamente por uma execução posterior em `headless`.

## Handoff típico

- **Vem de:** `@dev`, `@deyvin`, ou qualquer momento pós-implementação.
- **Vai para:** nenhum — é terminal no fluxo de commit. Próximo passo é você: `git push` ou PR.

## Sobre o formato da mensagem

Segue **Conventional Commits**: `tipo(escopo): descrição`.

Tipos comuns: `feat`, `fix`, `docs`, `refactor`, `test`, `chore`.

O @committer gera corpo da mensagem quando há contexto suficiente (mudanças não-triviais, breaking changes, ou múltiplos arquivos com lógica diferente).

## Próximo passo

- Ver todo o ciclo de uma feature → [Primeiro projeto do zero](../2-comecar/primeiro-projeto.md)
- Commit bloqueado? Verifique `.aioson/git-guard.json`
