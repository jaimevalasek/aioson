# Secure by Default

> **Para quem é:** desenvolvedores que querem entender como o AIOSON trata segurança — e como configurar o baseline.
> **Tempo de leitura:** 7 min
> **O que você vai sair sabendo:**
> - Os 8 controles do baseline e como cada um funciona
> - O que muda por classificação (MICRO/SMALL/MEDIUM)
> - Como o git:guard protege seus commits

## Para que serve

Segurança costuma ser tratada como etapa opcional — "a gente adiciona autenticação depois". O AIOSON inverte isso: o baseline de segurança é o estado padrão. Cada agente técnico (`@analyst`, `@architect`, `@dev`, `@qa`) carrega as regras automaticamente. Você não precisa pedir.

Isso é o **Artigo VII da Constitution: Zero Trust by Default**. Controles de segurança têm IDs estáveis (`SEC-SBD-01..08`) para que specs, QA reports e security-findings possam referenciá-los sem ambiguidade.

## Os 8 controles

O baseline vive em `.aioson/rules/security-baseline.md` (carregado automaticamente por agentes técnicos).

| Controle | O que protege | Mapeamento OWASP |
|---|---|---|
| **SEC-SBD-01** | Limites de input server-side (campo, tipo, range) | A03 / A04 |
| **SEC-SBD-02** | Autenticação e autorização (toda rota protegida explicitamente) | A01 / A07 |
| **SEC-SBD-03** | Tratamento seguro de uploads (validação de tipo, tamanho, armazenamento) | A04 / A05 |
| **SEC-SBD-04** | Redação de secrets em logs (nunca logar tokens, senhas, chaves) | A09 |
| **SEC-SBD-05** | Rate limiting em endpoints sensíveis (auth, pagamento, busca pública) | A04 |
| **SEC-SBD-06** | Validação de URLs externas (SSRF — não seguir redirects de forma cega) | A10 |
| **SEC-SBD-07** | Política de dependências (sem deps com CVEs conhecidos no publish path) | A06 |
| **SEC-SBD-08** | Headers de segurança (CORS, CSP, HSTS, X-Frame conforme contexto) | A05 |

Cada controle define: owner agent, evidence obrigatória, e se pode ser marcado N/A (com rationale na spec).

## O que muda por classificação

| Classificação | Comportamento |
|---|---|
| **MICRO** | Advisory. Os controles são surfaçados como recomendações. Nenhum bloqueio automático. |
| **SMALL** | Scan-oriented. Checks estáticos rodam automaticamente. Findings Medium+ são reportados mas não bloqueiam. |
| **MEDIUM** | Audit-blocking. **Gate D bloqueia o ship** se houver findings High ou Critical abertos. Precisam ser resolvidos ou waived com rationale na `spec-<slug>.md`. |

Em qualquer classificação, `@pentester` pode ser invocado manualmente quando a feature envolve auth, dinheiro, upload, URLs externas ou ownership.

## git:guard — proteção no commit

O `git:guard` inspeciona os arquivos em staging antes do commit. Detecta:

- Secrets em texto plano (tokens, senhas, chaves API em assignments)
- Arquivos que não deveriam ir para o repositório (node_modules, logs, etc.)
- Extensões ou paths bloqueados pela política do projeto

```bash
# Inspeção manual
aioson git:guard .

# Com saída JSON (para scripts)
aioson git:guard . --json

# Instalar como pre-commit hook (bloqueia automático antes de todo commit)
aioson git:guard . --install-hook

# Remover o hook
aioson git:guard . --uninstall-hook

# Inspecionar mas não bloquear em warnings
aioson git:guard . --allow-warnings
```

A política do projeto fica em `.aioson/git-guard.json`. Para um stage, o guard usa a versão presente no Git index; uma regra unstaged ou untracked nunca pode liberar conteúdo já staged:

```json
{
  "version": 1,
  "allowPaths": [],
  "contentAllowPaths": [],
  "contentAllowRules": [
    {
      "path": "tests/provider.fixture.js",
      "rules": ["github_token"],
      "reason": "fixture sintética revisada para testar o redactor"
    }
  ],
  "blockPaths": ["node_modules/**", "aioson-logs/**"],
  "allowExtensions": [],
  "blockExtensions": []
}
```

Arquivos de teste, mocks e fixtures continuam sendo inspecionados. O detector ignora mensagens naturais — por exemplo, uma tradução como `login_no_token: "No token provided"` — e suprime valores claramente sintéticos quando o nome (`FAKE_TOKEN`, `MOCK_API_KEY`) ou o marcador `aioson-secret: fixture` deixa a intenção explícita. Um segredo com aparência real dentro de `tests/` continua bloqueando o commit.

Use `contentAllowRules` somente depois de revisar a linha: a exceção vale para o par caminho + regra e exige justificativa. `contentAllowPaths` permanece por compatibilidade, mas desliga toda a inspeção de conteúdo do arquivo e não deve receber novas entradas.

No `commit:prepare`, `--agent-safe` exige `--mode=headless`. Os modos `guarded` e `trusted` são opções interativas/humanas e são rejeitados nesse modo automatizado.

## Como os agentes consomem o baseline

Quando `@dev` vai implementar uma rota de pagamento:

```
@dev > Carregando security-baseline.md...
       SEC-SBD-01: input limits — adicionando validação de amount > 0 e <= 999999.
       SEC-SBD-02: auth — rota protegida com middleware verifyJWT.
       SEC-SBD-05: rate limit — 10 req/min em POST /checkout.
       SEC-SBD-04: logs — payment ID logado, mas não o número do cartão.
```

O agente não precisa de instrução sua. Ele lê as regras e aplica. Se um controle não se aplica à feature, ele registra `N/A` com rationale na spec.

## Saídas em disco

```
.aioson/
├── rules/
│   └── security-baseline.md          ← baseline (carregado por agentes técnicos)
└── git-guard.json (na raiz do template) ← política de commit

.aioson/context/
└── security-findings-<slug>.json     ← findings gerados por @pentester ou @qa
```

## Quando NÃO usar

- `git:guard --install-hook` em projetos com pipeline CI que já faz análise similar. Pode gerar conflito de gatekeeping.
- Marcar controles como N/A sem rationale. A spec deve registrar explicitamente por que um controle não se aplica.
- Invocar `@pentester` em todo commit de MICRO. Ele é para features com superfície de ataque real.

## Próximo passo

- [Ficha do @pentester](../4-agentes/pentester.md) — revisão adversarial completa
- [SDD Framework](./sdd-framework.md) — como os gates bloqueiam em findings de segurança
- [Por que ele existe](../1-entender/por-que-existe.md) — Artigo VII da Constitution
