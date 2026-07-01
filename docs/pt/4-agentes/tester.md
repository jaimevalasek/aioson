# @tester — Engenharia de testes para apps que já existem

> **Para quem é:** quem tem um app rodando sem testes adequados, ou com testes que parecem cobrir mas não cobrem o que importa.
> **Tempo de leitura:** 4 min.
> **O que você vai sair sabendo:**
> - A diferença entre `@tester` e `@qa`
> - O que é coverage quality tier e test smell audit

---

## Para que serve

`@qa` valida se uma feature específica passou nos critérios de aceitação. `@tester` é diferente: ele entra quando o **app como um todo** precisa de engenharia de testes — seja porque foi construído sem testes, porque é um projeto legado, ou porque o `@qa` identificou lacunas em três ou mais módulos.

Ele não implementa features. Não revisa produto. Testa o que existe.

Duas capacidades recentes que o diferenciam:

**Coverage quality tier:** não apenas mede "quantos % de linhas são cobertas", mas classifica a *qualidade* da cobertura. Um teste que chama a função mas não faz nenhuma assertion é cobertura sem qualidade. O tier vai de BAIXO a ALTO.

**Test smell audit:** detecta padrões que fazem os testes serem enganosos — testes que sempre passam, assertions muito genéricas, dependências ocultas entre testes, testes que testam implementação em vez de comportamento.

---

## Quando invocar

- App foi construído sem testes adequados e você quer cobri-lo agora.
- `@qa` identificou lacunas de cobertura em 3+ módulos.
- Você está entrando num projeto legado e quer saber o que tem e o que falta.
- Você suspeita que os testes existentes são de baixa qualidade (smell audit).

---

## Quando NÃO invocar

- Você está fazendo uma feature nova → use o ciclo normal com `@qa` no final.
- Você quer revisão adversarial de segurança → use `@pentester`.
- Os testes existentes são bons e você só quer validar a última feature → use `@qa`.

---

## Diálogo típico

```
Você > @tester

@tester > Lendo project.context.md... Node.js, test_runner: node:test.
          Lendo arquivos de teste existentes...
          
          Coverage quality tier atual: BAIXO (23% de linhas, mas 60% das assertions são genéricas)
          
          Test smell detectado:
          - tests/payment.test.js linha 34: assert(result) — não verifica valor específico
          - tests/order.test.js: 3 testes dependem de estado compartilhado (ordem importa)
          
          Módulos críticos sem cobertura (ordem de prioridade):
          1. src/services/payment-service.js — lógica de cobrança, zero testes
          2. src/middleware/auth.js — autenticação, zero testes
          3. src/routes/checkout.js — 1 teste superficial
          
          Estratégia proposta: cobrir payment-service e auth primeiro.
          Estimativa: 12 testes novos → tier MÉDIO.
          
          test-inventory.md criado em .aioson/context/test-inventory.md
          Prosseguir?
Você > Sim

@tester > [implementa testes]
          12 testes criados. 11 passaram. 1 revelou bug real em payment-service linha 87.
          Registrado em test-inventory.md para roteamento ao @qa.
```

---

## Saídas em disco

| Arquivo | Conteúdo |
|---|---|
| `.aioson/context/test-inventory.md` | Inventário de testes: o que existe, qualidade, gaps |
| Arquivos de teste | onde o projeto já os tem |

---

## Como ele lê seu projeto

- `.aioson/context/project.context.md` — stack, `test_runner`, `classification`
- `.aioson/context/requirements-{slug}.md` — ACs para nomear testes (`AC-{slug}-{N}`)
- `.aioson/context/conformance-{slug}.yaml` — contrato de conformidade (MEDIUM)
- `.aioson/installed-skills/aioson-spec-driven/SKILL.md` — se existir
- `.aioson/rules/` — regras com `agents: tester`
- `security-findings-{slug}.json` — como input de risco para priorizar (não cria findings)

---

## Opção `--help`

Uma ativação com `--help` (`/tester --help`) imprime um resumo rápido — o que faz, quando usar, opções, chamada típica, o que produz, próximo agente — localizado no seu idioma, e para sem executar nada. Fonte: `.aioson/docs/agent-help.md`.

---

## Handoff típico

- **Vem de:** `@qa` (que identificou gaps) ou você diretamente
- **Vai para:** `@qa` (para validar os novos testes) ou `@pentester` (se encontrou indícios de segurança)

---

## Próximo passo

- [Ficha do @qa](./qa.md) — complementar ao `@tester`
- [Ficha do @pentester](./pentester.md) — se a auditoria revelar indícios de segurança
