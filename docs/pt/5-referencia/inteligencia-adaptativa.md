# Inteligência Adaptativa

O AIOSON aprende com o trabalho dos agentes e evolui com o projeto. Este documento explica os três sistemas que formam a camada de inteligência adaptativa: o **Evolution Pipeline**, o **Tool Registry** e o **Ambient Intelligence Layer**.

---

## Visão Geral

Sem inteligência adaptativa, o AIOSON funciona como uma ferramenta estática: os agentes trabalham, cometem os mesmos erros, repetem os mesmos comandos — e cada sessão começa do zero.

Com inteligência adaptativa:

- Correções que você dá aos agentes viram **regras permanentes no contexto do projeto**
- Ferramentas criadas por um agente ficam disponíveis em **todas as sessões futuras**
- O framework **avisa proativamente** quando há itens que precisam de atenção

---

## 1. Evolution Pipeline

### O que é

Um pipeline que transforma learnings acumulados em arquivos de configuração do projeto. Em vez de depender de você lembrar de promover learnings manualmente, o AIOSON analisa os padrões e propõe — ou aplica — as mudanças automaticamente.

### Como funciona

Durante as sessões, os agentes registram learnings no banco de dados com tipo, título, frequência e evidências. Quando você roda `aioson learning:evolve`, o pipeline:

1. Filtra learnings com frequência ≥ 2 (ocorreram ao menos duas vezes)
2. Agrupa por tipo (preferência, processo, domínio, qualidade)
3. Gera deltas — mudanças propostas para arquivos de contexto e regras
4. Roda dois gates de validação antes de aprovar cada delta
5. Aplica os aprovados ou salva uma proposta para revisão

**Gate 1 — Constitucional:** nenhum delta pode tocar arquivos em `.aioson/agents/`. Esses arquivos são imutáveis — são a identidade dos agentes, não configuração de projeto.

**Gate 2 — Tamanho:** arquivos alvo não podem ultrapassar 300 linhas após o append. Evita que o contexto cresça sem controle.

### Mapeamento de tipos para arquivos

| Tipo de learning | Arquivo alvo |
|---|---|
| `preference` | `.aioson/context/project.context.md` → seção Preferências |
| `domain` | `.aioson/context/project.context.md` → seção Conhecimento de Domínio |
| `quality` | `.aioson/context/project.context.md` → seção Padrões de Qualidade |
| `process` | `.aioson/rules/<squad>-process.md` (ou `project-process.md`) |

### Comandos

```bash
# Ver o que seria evoluído (sem aplicar)
aioson learning:evolve .
aioson learning:evolve . --dry-run

# Aplicar automaticamente sem perguntar
aioson learning:evolve . --auto-apply

# Filtrar por squad específico
aioson learning:evolve . --squad=backend --dry-run

# Aplicar um arquivo de proposta salvo
aioson learning:apply . --file=.aioson/evolution/pending-2026-03-30T12-00-00.json
```

### Exemplos práticos

**Cenário:** durante 3 sessões com o agente `/aioson:agent:dev`, você corrigiu o mesmo erro — o agente tentava criar arquivos `.ts` num projeto que usa apenas `.js`.

O agente registrou um learning `correction` a cada sessão. Com frequência 3:

```bash
aioson learning:evolve . --dry-run
```

Saída:
```
Analisando 3 learnings elegíveis...

Deltas propostos: 1 aprovado, 0 rejeitados

  [1] APPEND → .aioson/context/project.context.md
      Seção: ## Preferências dos Agentes
      Learnings: 3 (preference)
      - Este projeto usa CommonJS (.js). Nunca criar arquivos .ts. (alta confiança)
        > Corrigido 3 vezes em sessões de /dev
```

```bash
aioson learning:evolve . --auto-apply
# ✓ Aplicado: .aioson/context/project.context.md (+3 learnings)
# 1 delta(s) aplicado(s) com sucesso.
```

Na próxima sessão, o agente lê o contexto atualizado e não comete mais o erro.

**Cenário:** equipe tem padrões de processo que emergem das sessões.

```bash
aioson learning:evolve . --squad=backend
# Gera .aioson/rules/backend-process.md com os padrões consolidados
```

---

## 2. Dynamic Tool Registry

### O que é

Um registro persistente de ferramentas criadas pelos próprios agentes durante o trabalho. Uma ferramenta registrada hoje fica disponível em todas as sessões futuras do projeto — sem que você precise configurar nada.

### Como funciona

As tools são armazenadas no banco SQLite do projeto (`dynamic_tools`). Cada tool tem:
- Nome único por projeto
- Descrição
- Tipo: `shell` (comando bash inline) ou `script` (arquivo Node.js)
- Squad opcional (se omitido, disponível para todos os agentes)

A execução acontece via subprocess isolado com ambiente restrito — variáveis como `ANTHROPIC_API_KEY` nunca são passadas para as tools.

### Comandos

```bash
# Registrar uma tool do tipo shell
aioson tool:register . \
  --name=run_tests \
  --description="Roda os testes do projeto" \
  --type=shell \
  --cmd="npm test"

# Registrar com filtro de squad
aioson tool:register . \
  --name=seed_db \
  --description="Popula o banco de desenvolvimento" \
  --type=shell \
  --cmd="npm run db:seed" \
  --squad=backend

# Registrar um script Node.js
aioson tool:register . \
  --name=check_coverage \
  --description="Verifica cobertura de testes" \
  --type=script \
  --path=.aioson/tools/check-coverage.js

# Listar todas as tools
aioson tool:list .

# Listar tools de um squad
aioson tool:list . --squad=backend

# Chamar uma tool
aioson tool:call . --name=run_tests --input='{}'

# Chamar com input
aioson tool:call . --name=run_tests --input='{"filter":"auth"}'

# Ver detalhes de uma tool
aioson tool:show . --name=run_tests

# Remover uma tool
aioson tool:unregister . --name=run_tests
```

### Exemplos práticos

**Cenário:** agente `/aioson:agent:qa` precisa checar se o servidor local está no ar antes de rodar testes. Em vez de escrever o curl toda vez:

```bash
aioson tool:register . \
  --name=check_health \
  --description="Verifica se o servidor local está respondendo" \
  --type=shell \
  --cmd='curl -sf http://localhost:3000/health && echo "OK" || echo "DOWN"'
```

Agora qualquer agente pode usar:
```bash
aioson tool:call . --name=check_health --input='{}'
# OK
```

**Cenário:** agente `/aioson:agent:dev` cria um script mais complexo para validar migrações:

```bash
# Agente cria o arquivo
# .aioson/tools/validate-migrations.js

# Depois registra
aioson tool:register . \
  --name=validate_migrations \
  --description="Verifica se há migrações pendentes no banco" \
  --type=script \
  --path=.aioson/tools/validate-migrations.js \
  --squad=backend \
  --by=dev
```

**Segurança:** o subprocess recebe apenas `PATH`, `HOME`, `LANG`, `TERM`, `USER` e `TOOL_INPUT` (o JSON de input). Nenhuma variável de ambiente com credenciais é passada.

**Listar tudo:**
```bash
aioson tool:list .
# Tools registradas (3):
#
#   run_tests
#     Roda os testes do projeto
#     tipo: shell | registrada: 2026-03-30
#
#   check_health
#     Verifica se o servidor local está respondendo
#     tipo: shell | registrada: 2026-03-30
#
#   validate_migrations [squad:backend]
#     Verifica se há migrações pendentes no banco
#     tipo: script | registrada: 2026-03-30
```

---

## 3. Ambient Intelligence Layer

### O que é

Um sistema que monitora o estado do projeto e avisa proativamente quando há itens que precisam de atenção — sem que você precise lembrar de rodar comandos.

### Como funciona

O AIOSON injeta verificações automáticas em pontos-chave do fluxo:

- **Ao iniciar uma sessão** (`live:start`): exibe um digest se há itens pendentes
- **Ao fechar uma sessão** (`live:close`): mostra o que foi acumulado durante o trabalho
- **Sob demanda** (`aioson health`): relatório completo do estado do projeto

### Comando health

```bash
aioson health .
```

Saída de exemplo:
```
AIOSON Health — itens que precisam de atenção:

  ● 8 learning(s) prontos para evoluir
    → aioson learning:evolve .
  ○ Squad "frontend" inativo há 14 dia(s)
  ✗ 1 tool(s) com handler inválido: validate_migrations
    → aioson tool:unregister . --name=validate_migrations

```

### Digest automático no live:start

Ao iniciar qualquer sessão com um agente:

```bash
aioson live:start . --agent=dev --tool=claude
# Sessão iniciada: @dev | claude | session-dev-...
#
# AIOSON Health — itens pendentes:
#   ● 5 learning(s) prontos para evoluir
#   → aioson health . para detalhes
```

### Digest automático no live:close

```bash
aioson live:close . --agent=dev --summary="Implementou feature de auth"
# Sessão encerrada: @dev | session-dev-... | .aioson/runtime/aios.sqlite
#
# AIOSON Health — itens após sessão:
#   ● 3 learning(s) prontos para evoluir
#   → aioson health . para detalhes e ações
```

Para suprimir o digest (modo CI ou scripts):
```bash
aioson live:start . --agent=dev --tool=claude --no-health
aioson live:close . --agent=dev --no-health
```

### O que o health verifica

| Item | Nível | Ação sugerida |
|---|---|---|
| Learnings com freq ≥ 2 prontos para evoluir | info | `aioson learning:evolve .` |
| Squads sem atividade há 14+ dias | warn | Revisar contexto do squad |
| Tools com handler de script inexistente | error | `aioson tool:unregister . --name=<nome>` |
| Propostas de evolução pendentes em `.aioson/evolution/` | info | `aioson learning:apply . --file=...` |

---

## Fluxo completo integrado

```
Sessão de trabalho com /dev
  │
  ├─ live:start
  │    └─ Health digest: "5 learnings prontos para evoluir"
  │
  ├─ Agente trabalha...
  │    ├─ Você corrige erros → agente registra learnings
  │    └─ Agente cria tools via tool:register
  │
  └─ live:close
       ├─ Health digest: "8 learnings prontos para evoluir"
       └─ Sugestão: aioson learning:evolve .
            │
            └─ learning:evolve --auto-apply
                 ├─ Gate constitucional: ✓
                 ├─ Gate de tamanho: ✓
                 └─ Aplica → .aioson/context/project.context.md atualizado

Próxima sessão: agente já sabe o que não fazer.
```

---

## Referências

- [Comandos CLI](./comandos-cli.md) — referência completa de todos os comandos
- [Memória e Contexto](./memoria-e-contexto.md) — como o contexto do projeto é gerenciado
- [Squads](./automacao-squads.md) — squads e seus learnings
