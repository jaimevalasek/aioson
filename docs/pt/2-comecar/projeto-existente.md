# Adicionar AIOSON num projeto existente

> **Para quem é:** você já tem um codebase e quer trazer AIOSON para ele.
> **Tempo de execução:** 20–60 min, depende do tamanho do projeto.
> **O que você vai ter no fim:** AIOSON instalado, contexto inicial mapeado, e a primeira feature da nova era pronta para rodar.

---

## A primeira regra: nada será sobrescrito

`aioson install` é **aditivo**. Ele cria os diretórios `.aioson/`, `.claude/` etc., e adiciona arquivos `CLAUDE.md`, `AGENTS.md`, `OPENCODE.md` no root. Ele **não toca**:

- Seu código (`src/`, `app/`, etc.)
- Seu `package.json` / `pyproject.toml` / `Gemfile`
- Seu `.gitignore` (em updates)
- Sua infra (`Dockerfile`, CI configs)

Se algum dia você quiser sair, é só apagar `.aioson/` e os arquivos `CLAUDE.md`/`AGENTS.md`/`OPENCODE.md`.

---

## Passo 1 — Instalar

```bash
cd meu-projeto-existente
npx @jaimevalasek/aioson install
```

O wizard interativo aparece:

```
? Quais ferramentas AI? ›
   ◉ Claude Code
   ◉ Codex CLI
   ◯ Gemini CLI
   ◯ OpenCode

? Modo? ›
   ◉ Development
   ◯ Development + Squads

? Design system? ›
   ◯ Clean SaaS UI
   ◯ Aurora Command UI
   ◯ (mais opções...)
   ◉ Pular

? Idioma dos agentes? ›
   ◯ English
   ◉ Português
   ◯ Español
   ◯ Français
```

> **Dica:** o `--all` instala tudo sem wizard (todas as ferramentas, modo Development+Squads). `--no-interactive` para CI.

---

## Passo 2 — Escanear o projeto

```bash
npx @jaimevalasek/aioson scan:project
```

O scan vai:
- Detectar linguagem, framework, gerenciador de pacotes
- Mapear estrutura de pastas
- Listar dependências
- Salvar em `.aioson/context/scan-*.md`

> Não confunda `scan:project` com `@discover` — o **scan** é estático (análise de arquivos). O **`@discover`** vai além: cria um cache semântico, com índice de busca.

---

## Passo 3 — Rodar `@setup`

```bash
claude .   # ou: codex . / gemini . / opencode .
```

Dentro do cliente AI:

```
Você > @setup

@setup > Detectei: Node.js + Next.js + Postgres + Prisma. Confirma?
Você > Sim

@setup > Quantos tipos de usuário existem hoje no projeto?
Você > Admin, customer, supplier (3)

@setup > Integrações externas?
Você > Stripe, SendGrid, S3 (3)

@setup > Regras de negócio complexas (cálculos, fluxos condicionais)?
Você > Sim — política de descontos por tier de cliente, regras de comissão

@setup > Score: 2 + 2 + 2 = 6 → MEDIUM.
@setup > Idioma de interação? › pt-BR

@setup > project.context.md criado com classificação MEDIUM.
@setup > Como você já tem código rodando, recomendo:
        - Rodar @discover para criar o cache semântico
        - Depois @analyst para mapear o domínio existente
        - Só então começar a próxima feature via @product
```

---

## Passo 4 — `@discover` indexa o conhecimento

```
Você > @discover

@discover > Indexando .aioson/context/bootstrap...
        - 1.247 arquivos analisados
        - 84 entidades semânticas extraídas
        - 23 fluxos identificados
        - Cache pronto em .aioson/brains/discover/
@discover > Quando algum agente precisar de algo do codebase, ele consulta esse cache em vez de varrer tudo. Economiza muito contexto.
```

Esse passo é **opcional para projetos pequenos**, mas crítico em codebases médios e grandes (>5k arquivos).

---

## Passo 5 — `@analyst` mapeia o domínio que já existe

```
Você > @analyst

@analyst > [lê scan + cache do @discover]
        Identifiquei:
        - Customer, Supplier, Order, OrderItem, Payment, Discount, Commission
        - Auth via NextAuth
        - Webhook Stripe ativo
        - Tabela de tiers em customer.tier (free|pro|enterprise)
@analyst > Domain map gravado em architecture.md.
@analyst > Pronto para a próxima feature.
```

> **Por que isso importa:** quando você criar a próxima feature com `@product`, ela já vai nascer com **contexto**. O agente sabe que já existe Customer, não vai sugerir criar de novo.

---

## Passo 6 — Primeira feature da nova era

```
Você > @product

@product > Já temos a base mapeada. Qual feature?
Você > "cancelamento-pedido" — permitir cancelar pedido em até 1h

@product > Critérios de aceitação?
Você > [...]

@product > Spec gravada. Próximo: @analyst.
```

A partir daí o fluxo é o mesmo do [primeiro-projeto.md](./primeiro-projeto.md).

---

## Casos especiais

### Tenho legacy sem testes

Use **`@tester`** (não só `@qa`) — ele faz engenharia sistemática de testes para apps já implementados. Recentemente ganhou *coverage quality tier* e *test smell audit*.

```
Você > @tester

@tester > Coverage atual: 12%. Quality tier: BAIXO.
@tester > Estratégia: cobrir os 5 módulos mais críticos primeiro
        (auth, payments, orders, discounts, webhook handler).
```

### Quero auditar segurança antes de tocar em qualquer coisa

```
Você > @pentester

@pentester > Mapeando superfícies de ataque (OWASP Top 10 + LLM Top 10 + supply chain).
        ...
        Findings:
        - HIGH: rota /admin/* sem rate-limit
        - MEDIUM: dependência X com CVE conhecido
        - LOW: log de erros vaza email
        Salvo em context/security-findings-project.json
```

### Quero migrar entendimento entre clientes AI

Os arquivos `.aioson/` são **agnósticos**. Hoje você usa Claude Code, amanhã pode usar Codex no mesmo projeto:

```bash
npx @jaimevalasek/aioson install --reconfigure
# Marque também Codex CLI no wizard
```

Os `.codex/` e `AGENTS.md` aparecem. Os agentes lêem os mesmos arquivos.

### Tenho regras de código que preciso impor

Crie `.aioson/rules/<nome>.md`. Exemplo:

```markdown
# .aioson/rules/no-direct-db-from-controllers.md

Controllers nunca acessam o ORM diretamente. Sempre via service layer.
```

Todo agente técnico (`@dev`, `@qa`, etc.) carrega essas regras automaticamente. Veja [Governança de Design Docs](../design-docs-governance.md) (atualizado).

### Equipe inteira no mesmo projeto

Comite o `.aioson/`. Cada dev terá o mesmo time de agentes, as mesmas regras, a mesma constitution. Mantenha apenas `.aioson/runtime/` no `.gitignore` (telemetria local).

---

## Verificação rápida

Depois do install, esses comandos devem funcionar:

```bash
# 1. Diagnóstico geral
npx @jaimevalasek/aioson doctor

# 2. Estado do projeto
npx @jaimevalasek/aioson workflow:next .

# 3. Confirmar que o contexto está OK
cat .aioson/context/project.context.md

# 4. Dentro do cliente AI
> @neo
```

---

## Próximo passo

- Quer entender qual classificação faz sentido? → [Decisões iniciais](./decisoes-iniciais.md)
- Como funciona a continuidade entre sessões? → *(em construção, Fase B — `3-receitas/continuidade-entre-sessoes.md`)*
- Visão geral do time → [Mapa do ecossistema](../1-entender/mapa-do-ecossistema.md)
