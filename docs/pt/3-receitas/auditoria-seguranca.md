# Receita: Auditoria de segurança com `@pentester`

> **Para quem é:** desenvolvedor ou tech lead que quer revisar vulnerabilidades antes de lançar uma feature ou ir para produção.
> **Tempo de execução:** 30–90 min dependendo do escopo.
> **O que você vai ter no fim:** relatório estruturado de findings com severidade, evidências e recomendações — salvo em arquivo consultável por outros agentes.

---

## Cenário

Você acabou de implementar um sistema de autenticação com convites por email para um app SaaS. Antes de ir para produção, você quer saber: tem algum buraco de segurança evidente? Alguém poderia se passar por outro usuário? Os tokens de convite expiram?

O `@pentester` é o agente adversarial do AIOSON. Ele não escreve código — ele tenta quebrá-lo. Mapeia superfícies de ataque com base em metodologias conhecidas (OWASP Top 10, LLM Top 10, integridade de supply chain) e gera findings estruturados com IDs rastreáveis.

> **Importante:** o `@pentester` trabalha apenas no workspace local. Ele não faz requisições para sistemas externos, não acessa URLs de produção, não roda ferramentas destrutivas. O escopo é sempre: código e artefatos do seu projeto.

---

## Pré-requisitos

- AIOSON instalado no projeto
- A feature que será auditada já implementada (ou em andamento — pode auditar parcialmente)
- Claude Code aberto no projeto

---

## Passo 1 — Invocar `@pentester` com o slug da feature

```
Você > @pentester

@pentester > Qual feature está sob revisão? (slug)
Você > auth-convites

@pentester > Modo de revisão:
             [1] framework_target — auditar o AIOSON/framework (prompts, handoffs, agentes)
             [2] app_target — auditar código da sua aplicação
Você > 2 — app_target

@pentester > Confirme o escopo da feature:
             Arquivos principais? Fluxos cobertos?
Você > src/auth/invite.js, src/routes/auth.js, src/middleware/auth.js
       Fluxo: admin gera convite → email enviado → usuário aceita via link → conta criada

@pentester > Lendo spec-auth-convites.md...
             Gerando pentester-review-contract...
             Contrato salvo. Iniciando mapeamento de superfícies.
```

---

## Passo 2 — Mapeamento de superfícies

O `@pentester` verifica cada superfície de ataque aplicável. Para `app_target` em sistema de auth com convites:

```
@pentester > Superfícies mapeadas para auth-convites:

TS-auth-convites-A01: ownership_idor
  → Um usuário pode aceitar o convite de outro?
  → Token de convite é UUID v4 aleatório? Ou sequencial/previsível?

TS-auth-convites-A02: secrets_crypto
  → Token armazenado em hash ou plaintext no banco?
  → Transmitido apenas via HTTPS?
  → Expira? Em quanto tempo?

TS-auth-convites-A03: injection_xss
  → O email do convidado é sanitizado antes de ir para o banco?
  → O nome do convidado aparece em alguma view? Sanitizado?

TS-auth-convites-A04: insecure_design_race
  → O convite pode ser aceito duas vezes (race condition)?
  → O convite é invalidado imediatamente após uso?

TS-auth-convites-A07: auth_rate_limit
  → A rota /auth/accept-invite tem rate limit?
  → Quantas tentativas de token errado antes de bloquear?

@pentester > Analisando cada superfície...
```

---

## Passo 3 — Findings gerados

```
@pentester > Análise concluída. Findings:

──────────────────────────────────────────────────────
FINDING SEC-AC-01
Superfície: TS-auth-convites-A02 (secrets_crypto)
Severidade: HIGH
Título: Token de convite armazenado em plaintext

Evidência:
  src/auth/invite.js linha 34:
  await db.invites.create({ token: rawToken, ... })
  O token gerado é salvo diretamente, sem hash.
  Se o banco for comprometido, todos os convites pendentes ficam expostos.

Recomendação:
  Salvar SHA-256 do token no banco. Comparar hash na aceitação.
  Invalidar imediatamente após uso (marcar como used=true).
──────────────────────────────────────────────────────

FINDING SEC-AC-02
Superfície: TS-auth-convites-A04 (insecure_design_race)
Severidade: MEDIUM
Título: Convite pode ser aceito duas vezes (race condition)

Evidência:
  src/routes/auth.js linha 89-104:
  const invite = await db.invites.findOne({ token })  // leitura
  if (invite.used) return error
  await createUser(...)
  await db.invites.update({ used: true })             // escrita separada
  Janela de race condition entre leitura e atualização.

Recomendação:
  Usar UPDATE WHERE used=false com verificação do rows_affected.
  Ou transação atômica com SELECT FOR UPDATE.
──────────────────────────────────────────────────────

FINDING SEC-AC-03
Superfície: TS-auth-convites-A07 (auth_rate_limit)
Severidade: MEDIUM
Título: Sem rate limit na rota de aceitação de convite

Evidência:
  src/routes/auth.js — nenhum middleware de rate limit em POST /auth/accept-invite.
  Permite brute-force de tokens.

Recomendação:
  Aplicar rate limit: 10 tentativas por IP por hora.
  Ou: expiração curta de token (24h) + bloqueio após 3 tentativas inválidas.
──────────────────────────────────────────────────────

FINDING SEC-AC-04
Superfície: TS-auth-convites-A01 (ownership_idor)
Severidade: LOW
Título: Token previsível se gerado com Math.random()

Evidência:
  src/auth/invite.js linha 12:
  const token = Math.random().toString(36)
  Math.random() não é criptograficamente seguro.

Recomendação:
  Usar crypto.randomBytes(32).toString('hex') (Node.js built-in).
──────────────────────────────────────────────────────

@pentester > Superfícies sem finding:
  TS-auth-convites-A03 (injection_xss): email sanitizado via validator.js ✓
  TS-auth-convites-A05 (logging): eventos de auth logados corretamente ✓

@pentester > Relatório salvo em .aioson/context/security-findings-auth-convites.json.
             4 findings: 1 HIGH, 2 MEDIUM, 1 LOW.
```

---

## Passo 4 — Revisar e corrigir com `@dev`

O relatório de findings está em disco. Você pode passar para `@dev` diretamente:

```
Você > @dev
       Corrija os findings HIGH e MEDIUM do relatório security-findings-auth-convites.json.
       Comece pelo SEC-AC-01 (token em plaintext).

@dev > [lê security-findings-auth-convites.json]
       Corrigindo SEC-AC-01: hash SHA-256 no save, compare no accept.
       Corrigindo SEC-AC-02: UPDATE atômico com rows_affected.
       Corrigindo SEC-AC-03: rate limit middleware em /auth/accept-invite.
       dev-state.md atualizado.
```

```
Você > @pentester
       Re-audite os findings SEC-AC-01, SEC-AC-02, SEC-AC-03 após as correções.

@pentester > Re-auditando...
             SEC-AC-01: token agora salvo com SHA-256 ✓ — RESOLVED
             SEC-AC-02: UPDATE atômico implementado ✓ — RESOLVED
             SEC-AC-03: rate limit em /auth/accept-invite ✓ — RESOLVED
             SEC-AC-04 (LOW, crypto.randomBytes): ainda aberto.

@pentester > security-findings-auth-convites.json atualizado.
             3/4 findings resolvidos. 1 LOW aberto (aceitável para produção com atenção).
```

---

## O que ficou em disco (rastreio)

```
.aioson/context/
└── security-findings-auth-convites.json
    ├── pentester-review-contract       ← escopo, modo, agente
    ├── threat-surface-matrix           ← quais superfícies foram cobertas
    └── findings[]
        ├── SEC-AC-01  HIGH   RESOLVED
        ├── SEC-AC-02  MEDIUM RESOLVED
        ├── SEC-AC-03  MEDIUM RESOLVED
        └── SEC-AC-04  LOW    OPEN
```

O JSON tem IDs estáveis. Outros agentes (`@qa`, `@validator`) podem referenciar `SEC-AC-01` sem depender do texto do relatório.

---

## Quando ativar o `@pentester`

| Momento | Por quê |
|---|---|
| Antes de mergear feature de auth, billing ou dados pessoais | Alto impacto se comprometido |
| Antes de ir para produção em qualquer projeto SMALL+ | Gate de segurança padrão |
| Após refatoração grande (ver [Refatoração grande](./refatoracao-grande.md)) | Mudanças podem introduzir regressões de segurança |
| Ao herdar codebase legado | Muitos legados têm vulnerabilidades esquecidas |

## Quando NÃO usar

- Para testar sistemas externos (produção de terceiros, APIs públicas) — fora do escopo.
- Para substituir um pentest profissional antes de uma auditoria de compliance real.
- Em projetos MICRO muito simples onde o risco de segurança é negligenciável.

---

## Variações

| Situação | Ajuste |
|---|---|
| Quero auditar o próprio framework AIOSON | Use modo `framework_target` — superfícies diferentes (memória, handoffs, tool invocation). |
| Quero auditar supply chain | O `@pentester` cobre `supply_chain_integrity` (TS-09) quando você menciona mudanças em `package.json` ou CI. |
| Quero relatório em formato diferente | O `.json` é a fonte. Você pode pedir ao `@copywriter` para formatar em Markdown legível para o cliente. |

---

## Solução de problemas

| Problema | Solução |
|---|---|
| `@pentester` pediu URL de produção para testar | Recuse. Dê o código-fonte e ele analisa estaticamente. |
| Finding marcado como falso positivo | Abra o JSON, adicione `"status": "wont-fix"` com `"rationale"`. O `@validator` respeita. |
| `@dev` não achou o finding no JSON | Passe o finding ID explicitamente: "corrija o SEC-AC-01 do security-findings-auth-convites.json". |

---

## Próximo passo

- Antes de mergear: rode `@validator` para validar os ACs da spec original.
- Quer publicar com tranquilidade? → [Publicar no aioson.com](./publicar-no-aioson-com.md)
- Veja a Constitution Artigo VII (Zero Trust) em [Por que ele existe](../1-entender/por-que-existe.md).
