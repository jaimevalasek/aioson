# Squad Dashboard

O Squad Dashboard é um painel web embutido no próprio CLI do aioson. Ele roda localmente no computador do desenvolvedor e permite acompanhar todos os squads de um projeto em tempo real — agentes, processos ativos, uso de contexto, tokens, logs de execução e métricas.

Não requer instalação adicional. Vem incluso quando você instala o aioson.

---

## Pré-requisitos

- aioson instalado globalmente (`npm install -g @jaimevalasek/aioson`)
- Pelo menos um squad criado no projeto (`aioson squad:create`)
- Node.js ≥ 18 (já exigido pelo aioson)
- Browser moderno (Chrome, Firefox, Safari, Edge)

---

## Iniciando

Na raiz do projeto (onde fica a pasta `.aioson/`):

```bash
aioson squad:dashboard
```

Saída esperada:
```
Squad Dashboard rodando em http://localhost:4180 (porta 4180)
Pressione Ctrl+C para parar.
```

Abra `http://localhost:4180` no browser. Para encerrar, pressione `Ctrl+C` no terminal.

---

## Opções

```bash
aioson squad:dashboard [path] [--port=4180] [--squad=<slug>] [--locale=pt-BR]
```

| Opção | Padrão | Descrição |
|-------|--------|-----------|
| `path` | `.` (diretório atual) | Raiz do projeto aioson |
| `--port` | `4180` | Porta HTTP do dashboard |
| `--squad` | — | Abre diretamente na página de um squad específico |
| `--locale` | `pt-BR` | Idioma da interface |

---

## Exemplos

### Iniciar na raiz do projeto atual
```bash
cd ~/meus-projetos/clinica-odonto
aioson squad:dashboard
```

### Iniciar em outra porta
```bash
aioson squad:dashboard --port=4200
```

### Apontar para projeto em outro diretório
```bash
aioson squad:dashboard /home/usuario/projetos/marketing-digital
```

### Abrir diretamente em um squad específico
```bash
aioson squad:dashboard --squad=marketing-odonto
# → Redireciona automaticamente para http://localhost:4180/squad/marketing-odonto
```

### Múltiplos projetos ao mesmo tempo (portas diferentes)
```bash
# Terminal 1
aioson squad:dashboard ~/projetos/clinica --port=4180

# Terminal 2
aioson squad:dashboard ~/projetos/ecommerce --port=4181
```

---

## Navegando pelo Dashboard

### Página inicial — Lista de squads

Ao acessar `http://localhost:4180`, você vê todos os squads do projeto com:

- Nome e modo do squad (`content`, `software`, `mixed`)
- Número de executores (agentes)
- Status atual
- Link para entrar na página do squad

Se nenhum squad aparecer, verifique se existe `.aioson/squads/*/squad.manifest.json` no projeto.

---

### Página do squad — Painéis

Cada squad tem sua própria URL: `http://localhost:4180/squad/{slug}`

Os painéis disponíveis variam conforme a configuração do squad:

#### Painel: Overview

Visão resumida do squad:
- Total de itens de conteúdo produzidos
- Número de sessões registradas
- Learnings acumulados
- Taxa de entrega
- Plano de execução (se definido)
- Informações de pipeline

#### Painel: Agentes (Processos)

Lista os agentes Claude/AI ativos no momento:

| Coluna | O que mostra |
|--------|-------------|
| Agente | Slug do executor |
| PID | ID do processo no sistema operacional |
| Tempo | Duração da sessão atual (`HH:MM:SS`) |
| Contexto | Porcentagem do context window usado |
| URL | Link para abrir a sessão do AI (se disponível) |
| Ação | Botão para encerrar o processo via SIGTERM |

> Os dados de processos atualizam automaticamente a cada 5 segundos via SSE (Server-Sent Events).

#### Painel: Contexto

Monitor do context window de cada agente em execução:

- **Gauge visual** mostrando % de uso do contexto
- **Nível de alerta**:
  - Verde: 0–84% → Normal
  - Amarelo: 85–94% → Warning
  - Vermelho: 95–99% → Critical
  - Roxo: 100%+ → Overflow
- Detecção automática de compact (queda > 30% indica que o contexto foi compactado)
- Breakdown por categoria (system prompt, conversation history, tool outputs, etc.)

#### Painel: Tokens

Uso e custo estimado por agente:

- Total de tokens consumidos na sessão
- Custo estimado em USD (baseado em modelo Sonnet-class)
- **Flag de desperdício**: aparece quando `tool_outputs > 60%` do total
- Breakdown por categoria (input, output, tool_use_input, tool_outputs, cache_write, cache_read)

#### Painel: Logs de Execução

Histórico detalhado das execuções de tasks:

- Entradas filtráveis por tipo:
  - `tool_call` — chamadas de ferramentas com input/output
  - `reasoning` — raciocínio do agente
  - `milestone` — marcos importantes
  - `error` — erros com stack trace (quando disponível)
- Timeline ordenada por timestamp
- Filtro por sessão

#### Painel: Hunk Review

Revisão de código em hunks (para squads de software):

- Lista de hunks pendentes de revisão
- Ações disponíveis: **Aprovar**, **Rejeitar** (com comentário obrigatório), **Comentar**
- Progresso: `aprovados / rejeitados / pendentes / revisados`
- Re-submit: hunks aprovados mantêm status; só rejeitados voltam para pendente

#### Painel: Content

Itens de conteúdo produzidos pelo squad (para squads de conteúdo):

- Lista de outputs indexados
- Tipo e layout de cada item
- Agente responsável

#### Painel: Learnings

Aprendizados acumulados pelo squad:

- Learnings ativos, stale e archived
- Tipo: preference, process, domain, quality
- Confiança: high, medium, low

#### Painel: Métricas

Métricas customizadas configuradas via `aioson squad:roi`:

- Valor atual vs. baseline vs. target
- Período
- Barra de progresso visual
- ROI calculado (quando configurado)

#### Painel: Integrações

Status dos MCPs configurados no squad:

- Connectors ativos (WhatsApp, Telegram, Webhook, etc.)
- Status: connected / unconfigured / error
- Calls totais e falhas

#### Painel: Recovery Context

Contexto de recovery gerado para cada agente (injeção pós-compact):

- Conteúdo do `recovery-context.md`
- Estimativa de tokens
- Quando foi gerado

---

## Casos de Uso por Tipo de Squad

### Squad de Conteúdo (ex: Clínica Odontológica)

```bash
# A squad está gerando conteúdo para Instagram e blog
aioson squad:dashboard --squad=marketing-odonto

# Painéis mais relevantes:
# → Content: ver posts gerados
# → Agentes: ver compositor e estrategista rodando
# → Learnings: preferências de tom e formato acumuladas
```

### Squad de Software (ex: Feature de Agendamento)

```bash
aioson squad:dashboard --squad=agendamento-v2

# Painéis mais relevantes:
# → Hunk Review: revisar código antes de merge
# → Logs: acompanhar tool_calls do agente de código
# → Contexto: monitorar se o agente está perto do limite
```

### Squad com Workers e Daemon

```bash
# Primeiro inicie o daemon (workers automáticos)
aioson squad:daemon start --squad=clinica

# Em outro terminal, levante o dashboard
aioson squad:dashboard --squad=clinica

# Painéis mais relevantes:
# → Métricas: taxa de no-show, ROI
# → Integrações: status do WhatsApp Business
# → Agentes: ver processos em tempo real
```

---

## Integração com outros comandos

O dashboard lê dados gerados por outros comandos do aioson. Para que os painéis mostrem dados ricos:

| Para ver no dashboard | Comando que gera os dados |
|-----------------------|--------------------------|
| Métricas e ROI | `aioson squad:roi metric --squad=X` |
| Status de MCPs | `aioson squad:mcp configure --squad=X` |
| Processos ativos | Agentes rodando que gravam em `.aioson/squads/{slug}/processes/` |
| Context window | Agentes que gravam em `.aioson/squads/{slug}/context-monitor.json` |
| Token usage | Agentes que gravam em `.aioson/squads/{slug}/token-usage.json` |
| Learnings | `aioson squad:learning` e sessões registradas automaticamente |
| Recovery context | `aioson squad:recovery --squad=X --agent=Y` |

---

## Requisitos de Dados no Projeto

O dashboard funciona mesmo sem todos os dados. O que cada painel precisa:

```
.aioson/
  squads/
    {slug}/
      squad.manifest.json          ← obrigatório (o squad aparece na lista)
      context-monitor.json         ← painel Contexto
      token-usage.json             ← painel Tokens
      processes/
        {agent}.json               ← painel Agentes
      recovery-context.md          ← painel Recovery
      attachments/                 ← painel Attachments
  runtime/
    aios.sqlite                    ← painéis Content, Learnings, Métricas, Integrações
```

Se o SQLite não existir, os painéis que dependem dele aparecem vazios mas o dashboard não quebra.

---

## Diferença entre Squad Dashboard e aioson-dashboard

| | Squad Dashboard | aioson-dashboard |
|---|---|---|
| **O que é** | Servidor HTTP embutido no CLI | App Next.js installável (premium) |
| **Como acessa** | `aioson squad:dashboard` | Instala e roda separado |
| **Foco** | Squads do projeto em tempo real | Gestão geral — projetos, genomas, pipelines, cloud |
| **Porta** | `localhost:4180` (configurável) | Definida pelo app |
| **Requer instalação extra** | Não — vem com o aioson | Sim |
| **Custo** | Gratuito | Premium |

Quando ambos estão rodando, o aioson-dashboard exibe um botão **"Abrir Squad Dashboard"** na página de cada squad, abrindo diretamente a URL correta.

---

## Solução de Problemas

### O dashboard não inicia — porta em uso

```
Porta 4180 ja esta em uso. Tente --port=<outra>
```

Use outra porta:
```bash
aioson squad:dashboard --port=4200
```

### Nenhum squad aparece na home

Verifique se o manifest existe:
```bash
ls .aioson/squads/*/squad.manifest.json
```

Se não existir, crie o squad primeiro:
```bash
aioson squad:create . --squad=meu-squad
```

### Painéis aparecem vazios

Normal para projetos novos ou squads sem dados de runtime. Os painéis populam conforme os agentes rodam e gravam dados.

### Processo aparece mas não atualiza

O painel de agentes usa SSE com intervalo de 5 segundos. Se parar de atualizar, recarregue a página.

### Comando não encontrado após atualizar o aioson no projeto

O binário global pode estar desatualizado:
```bash
npm update -g @jaimevalasek/aioson
```

---

## Referência rápida

```bash
# Iniciar
aioson squad:dashboard

# Porta customizada
aioson squad:dashboard --port=4200

# Squad específico
aioson squad:dashboard --squad=meu-squad

# Projeto em outro diretório
aioson squad:dashboard /path/do/projeto

# Ver ajuda
aioson squad:dashboard --help
```
