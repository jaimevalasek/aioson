# PRD — Secure by Default

## Vision
Transformar o AIOSON de "framework que entrega rápido" em "framework que entrega rápido **e seguro por padrão**", embutindo postura adversarial (Zero Trust) no DNA dos agentes — não como agente extra opcional, mas como camada transversal aplicada ao output gerado.

## Problem
Hoje o AIOSON gera apps em alta velocidade, mas a governança de segurança é fina: `@qa` tem checklist curto (SQLi, XSS, secrets, rate limiting), `@pentester` existe mas suas surfaces protegem o **framework** (memory_context, tool_invocation, handoff), **não os apps gerados**. O resultado: features MEDIUM podem chegar à produção com IDOR, race conditions em transações financeiras, secrets hardcoded em commits de deploy quebrado, validação só no frontend, e enumeração de usuários — exatamente os padrões de falha catalogados pelo blueprint adversarial e observados no experimento Yuri Dev (4 vibe coders × 1 hacker).

Quem sente: o usuário final do AIOSON (dev/founder em vibe coding) que confia no output e descobre vulnerabilidades em produção. E o time AIOSON, que perde credibilidade quando apps gerados são facilmente comprometidos.

## Users
- **Vibe coder MEDIUM (founder/dev solo)**: precisa que apps com auth, transações financeiras ou conteúdo do usuário saiam do AIOSON com proteção contra OWASP onda 1 sem ter que pedir explicitamente — a postura adversarial deve ser default.
- **Dev experiente usando AIOSON em projeto crítico**: precisa de gates auditáveis (`security:audit`, findings em `security-findings-{slug}.json`) que bloqueiem Gate D quando houver Critical/High em aberto, com evidência reproduzível.
- **Time AIOSON (mantenedores)**: precisa de uma camada de segurança versionada e barata em tokens — que carregue só onde agrega valor (sessões técnicas), e use shell para trabalho estático em vez de queimar LLM.

## MVP scope

### Must-have 🔴
- **Constituição Artigo VII — Zero Trust by Default**: uma linha apontando para `.aioson/rules/security-baseline.md`. Sinal sempre ligado a custo trivial (~30 tokens permanentes).
- **Rule universal `.aioson/rules/security-baseline.md`**: frontmatter `agents: [analyst, architect, dev, qa]`. Contém os 7 princípios do blueprint adversarial (Magic Bytes, atomicidade financeira, ownership/IDOR check, secrets fora do código, sanitização de URL externa, RLS default-deny, limite de input).
- **Skill `.aioson/skills/process/secure-tdd/SKILL.md`**: carregada por `@dev` em features MEDIUM. Define o ciclo TDD adversarial — `@dev` gera testes que tentam bypass de auth, IDOR, race conditions e fuzzing **antes** de escrever código de produção. Inclui templates de prompts adversariais por stack.
- **Extensão do `@pentester` com modo `app_target`**: novo conjunto de surfaces (separadas das de framework existentes) cobrindo OWASP onda 1: A01 (IDOR/ownership), A02 (Argon2 + secrets), A03 (SQLi/XSS), A04 (race conditions, atomicidade, enumeração), A07 (rate limiting por endpoint, lockouts). Reusa schema de findings, contrato de review e integração `@qa` Gate D já existentes.
- **Comandos CLI shell-only (zero LLM tokens)**:
  - `aioson security:scan . [--stage=<analyst|dev>]` — varre secrets em commits (regex), `npm audit`/equivalentes, `.env` em histórico, configs públicas. Invocado automaticamente após `@analyst` salvar requirements e após `@dev` concluir fase.
  - `aioson security:audit . --slug={slug}` — roda checklist de 7 itens contra os artefatos do feature, gera relatório estruturado. Invocado automaticamente no início de `@qa`.
- **Reforço do `@qa` para invocar `@pentester`**: quando `security:audit` detectar padrão suspeito em auth/financeiro/owned-resource, ou quando `@qa` identificar via heurística, executa `aioson agent:invoke pentester --slug={slug} --scope={área} --mode=app_target`. Findings retornam para `@qa` decidir Gate D.
- **Reforço do `@analyst`**: lente de superfície de ataque durante modelagem de entidades — mapear endpoints autenticados, papéis/ownership, fluxos de dinheiro, integrações externas. Esse mapa alimenta o `app_target` do pentester.
- **Reforço do `@architect`**: aplicar lente "secure-by-design" via security-baseline rule — RLS default-deny ativo, atomicidade em transações de estado financeiro, secrets via env vars, sanitização de URLs externas.
- **Diferenciação por classificação**:
  - **MICRO**: advisory only (rule não bloqueia, scan estático opcional via flag)
  - **SMALL**: advisory + `security:scan` automático após `@dev`
  - **MEDIUM**: bloqueante completo — checklist de auditoria, pentester invocado em features com auth/dinheiro/ownership, findings high/critical bloqueiam Gate D

### Should-have 🟡
- **Modelo de invocação `@qa` → `@pentester` versão (a)**: `@qa` decide via heurística e roda `aioson agent:invoke pentester --scope=<área>`, gera relatório, escreve issues para `@dev`. Mais econômico em tokens que rodar pentester automático em todo MEDIUM.
- **Templates adversariais por stack** dentro da skill `secure-tdd` (Laravel/Pest, Next.js/Vitest, Node/Express, Django, Rails, FastAPI) — reaproveita patterns de `@tester`/`@qa`.
- **Métrica de adoção** via runtime SQLite: contagem de features MEDIUM que rodaram `security:audit` antes de fechar Gate D.

## Out of scope
- **OWASP onda 2 (v2)**: A05 (Security Misconfiguration além de RLS), A06 (Vulnerable Components além de `npm audit`), A09 (Logging completo), A10 (SSRF). Ficam como `## Open questions` para iteração futura.
- **Agente novo de segurança**: o `@pentester` é absorvido nessa camada, não criamos `@security-officer` ou similar.
- **Métrica de "vulnerabilidades encontradas"**: explicitamente recusada — confunde descoberta com prevenção, gera incentivo perverso.
- **Cobertura de MICRO em modo bloqueante**: MICRO permanece advisory para preservar velocidade.
- **Auto-correção de findings**: `@pentester` detecta, `@dev` corrige (humano supervisiona). Sem auto-fix.
- **Gates em projetos brownfield já existentes**: a camada se aplica a features novas; legado fica fora do MVP.
- **Substituição da skill `aioson-spec-driven`**: `secure-tdd` é skill **adicional**, não substitui o ciclo SDD.

## User flows

### Fluxo 1 — Feature MEDIUM com auth (golden path)
1. User ativa `/product` para feature `user-payments` → PRD identifica auth + dinheiro.
2. `@analyst` lê security-baseline rule (auto via frontmatter), produz `requirements-user-payments.md` com seção "Attack Surface" mapeando endpoints autenticados e fluxos financeiros.
3. CLI dispara `aioson security:scan . --stage=analyst` automaticamente → 0 findings, libera próximo agente.
4. `@architect` lê security-baseline, aplica RLS default-deny + atomicidade nas decisões → `spec-user-payments.md`.
5. `@dev` carrega skill `secure-tdd` (MEDIUM), gera testes adversariais primeiro (race condition em refund, IDOR em ownership de carteira), depois implementa.
6. CLI dispara `aioson security:scan . --stage=dev` → detecta `.env.local` em commit recente → bloqueia handoff até `@dev` remover.
7. `@qa` inicia, dispara `aioson security:audit . --slug=user-payments` → checklist passa em 5 de 7 itens, falha em "atomicidade financeira" (heurística suspeita).
8. `@qa` invoca `aioson agent:invoke pentester --slug=user-payments --scope=refund-flow --mode=app_target`.
9. `@pentester` gera 1 finding High em `security-findings-user-payments.json` (race condition reembolso simultâneo) com reprodução.
10. `@dev` corrige (transaction atômica + before_action), `@qa` reconfirma, Gate D libera.

### Fluxo 2 — Feature MICRO (advisory)
1. User ativa `/product` para feature `add-tooltip-help`.
2. PRD micro → `@dev` direto.
3. Security-baseline rule não carrega (frontmatter exclui MICRO via classification check no rule loader, ou rule carrega mas atua só como reminder).
4. `@dev` implementa, `@qa` roda checklist em modo advisory — reporta sem bloquear.

### Fluxo 3 — Skip pentester quando não aplicável
1. Feature MEDIUM sem auth/dinheiro/ownership (ex: `add-export-csv` puramente local).
2. `@qa` roda `security:audit` → todos os 7 itens cobertos, nenhuma heurística suspeita.
3. `@qa` **não** invoca pentester (economia de tokens). Gate D libera.

## Success metrics
- **Adoção (mensurável via runtime SQLite)**: 100% das features MEDIUM completam `aioson security:audit` antes de `@qa` fechar Gate D — meta a partir do release v1, medido nas próximas 10 features MEDIUM.
- **Higiene de secrets (binário)**: 0 secrets detectados pelo `security:scan` em commits após implementação — medido em todo PR/commit gerado pelo `@dev` após v1.
- **Detecção ativa em features de risco**: features MEDIUM com auth ou transação financeira têm `security-findings-{slug}.json` no modo `app_target` em ≥80% dos casos — medido nos primeiros 90 dias após release.
- **Custo de tokens controlado**: overhead médio por sessão técnica (analyst/architect/dev/qa) ≤ 1.5k tokens com rules carregadas — medido via amostragem nas primeiras 20 sessões pós-release.

## Open questions
- **OWASP onda 2 — quando promover para v2?**: A05 (RLS além do baseline), A06 (npm audit estendido), A09 (logging), A10 (SSRF). Reavaliar após primeiras 5 features MEDIUM rodando v1.
- **Stacks suportadas no `secure-tdd` no v1**: começar só com Node/Express + Next.js (foco AIOSON atual) e expandir? Ou cobrir Laravel/Django/Rails desde o lançamento? **TBD — decisão técnica do `@architect`.**
- **`security:scan` em projetos brownfield (legado já com secrets em commits antigos)**: reportar findings históricos ou ignorar pré-instalação? **TBD — definir política antes do v1.**
- **Web3/dapp scope**: feature menciona `web3_enabled: false` no projeto atual, mas o AIOSON suporta dapps. Surfaces de smart contract (reentrancy, integer overflow) entram no `app_target` v1 ou ficam para v2? **TBD — decisão técnica.**
- **Hook automático de invocação**: deve ser shell hook (`PostToolUse` em `.claude/settings.json`) ou comando explícito injetado no prompt do agente? Trade-off de robustez vs. portabilidade entre clientes (Claude Code, Cursor, Codex). **TBD — `@architect`.**
- **Comportamento quando `aioson` CLI ausente** (modo direct LLM): como agentes invocam scan/audit sem o CLI? Fallback graceful via prompt-only checklist? **TBD.**

---

**Briefing source:** plans/desenvolvimento-seguro.txt (blueprint adversarial), plans/desenvolvimento-seguro-fonte.txt (transcrição Yuri Dev — 4 vibe coders vs 1 hacker)
**Classification (proposta):** MEDIUM — afeta múltiplos agentes, constituição, governança, CLI novo e skill nova
