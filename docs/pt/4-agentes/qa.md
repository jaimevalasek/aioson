# @qa — Teste, valide e feche a feature com segurança

> **Para quem é:** quem quer garantir que o que foi implementado realmente atende ao que foi especificado.
> **Tempo de leitura:** 4 min.
> **O que você vai sair sabendo:**
> - Como `@qa` valida os critérios de aceitação
> - O ciclo autônomo de correção QA→Dev

---

## Para que serve

"Funciona" é uma afirmação subjetiva. "O endpoint POST /checkout retorna 201 com order_id quando dados válidos são enviados" é verificável.

`@qa` lê os ACs definidos em `prd-{slug}.md` e `requirements-{slug}.md`, verifica se o código implementado os atende, escreve os testes que comprovam isso, e gera um relatório. Se algo falhar e a falha for pequena, ele pode iterar diretamente com `@dev` sem você precisar intervir.

Seu lema interno: nenhum finding inventado para parecer rigoroso. Nenhum risco ignorado para evitar atrito.

---

## Quando invocar

- Após `@dev` terminar a implementação.
- Para revisar cobertura de testes em features antigas (junto com `@tester`).
- Quando você quer saber se uma feature pode ir para produção com segurança.

---

## Quando NÃO invocar

- A implementação ainda não está feita → `@qa` não tem o que testar.
- Você precisa de engenharia de testes para um app grande sem testes → use `@tester`.
- Você quer revisão adversarial de segurança → use `@pentester`.

---

## Diálogo típico

```
Você > @qa

@qa > Lendo prd-checkout-stripe.md, requirements-checkout-stripe.md e spec-checkout-stripe.md...
      
      ACs identificados (4):
      AC-01: POST /checkout com dados válidos → 201 + order_id
      AC-02: POST /checkout com cartão inválido → 422 + mensagem clara
      AC-03: Order.status = 'paid' após confirmação Stripe
      AC-04: Dados de pagamento não persistem em texto plano (PCI-lite)
      
      Verificando código...
      
      [roda testes]
      
      AC-01: PASS
      AC-02: PASS
      AC-03: FAIL — Order.status não é atualizado no webhook handler
      AC-04: PASS
      
      Ciclo autônomo: enviando AC-03 para @dev (iteração 1/2)...
      [@dev corrige webhook handler]
      Re-rodando... AC-03: PASS
      
      4/4 ACs cobertos.
      test-plan.md e qa-report-test-coverage.md gravados.
      Dossier atualizado: QA PASS.
      Próximo: @validator (se feature usa harness-contract) ou feature:close.
```

---

## Saídas em disco

| Arquivo | Conteúdo |
|---|---|
| `.aioson/context/test-plan.md` | Plano de teste com ACs mapeados |
| `.aioson/context/qa-report-test-coverage.md` | Resultado: cobertura, findings, verdict |
| `.aioson/plans/{slug}/corrections-{date}.md` | Plano de correções quando há findings |

---

## Como ele lê seu projeto

- `.aioson/context/prd-{slug}.md` — ACs que serão validados
- `.aioson/context/requirements-{slug}.md` — regras de negócio e edge cases
- `.aioson/context/spec-{slug}.md` — o que foi implementado
- `.aioson/context/features/{slug}/dossier.md` — code map e agent trail
- `.aioson/rules/` — regras com `agents: qa`

---

## Detalhes recentes

**Ciclo autônomo QA→Dev (Mai 2026):** em falhas pequenas e localizadas, `@qa` itera com `@dev` automaticamente, com cap de 2 rodadas. Na terceira falha, para e pede sua intervenção. Isso evita loops infinitos sem perder a agilidade de correções óbvias.

**Suporte a Sheldon phased plans:** quando a feature usa um plano por fases, `@qa` valida fase a fase, marcando `qa_approved` só quando todos os Criticals/Highs da fase estão resolvidos.

---

## Comandos CLI relacionados

```bash
# Registrar finding no dossier
aioson dossier:add-finding . --slug=checkout-stripe \
  --agent=qa --section="Agent Trail" \
  --content="QA concluído. Verdict: PASS. Cobertura: 87%."

# Ver estado do dossier
aioson dossier:show . --slug=checkout-stripe
```

---

## Handoff típico

- **Vem de:** `@dev`
- **Vai para:** `@validator` (quando há harness-contract) ou encerramento da feature

> Desde a v1.24.0, o `@validator` roda `aioson harness:check` **primeiro** (verificação determinística, exit 0 = pass) e julga por LLM só os critérios sem `verification`. Ele é ativado a partir do `validator-prompt.txt` autocontido (critérios + resultados do check + diff vs. base) em **contexto fresco e isolado** — não na sessão que implementou. Ver [Ficha do @validator](./validator.md).

---

## Próximo passo

- [Ficha do @validator](./validator.md) — gate final técnico
- [Ficha do @tester](./tester.md) — quando há gaps grandes de cobertura
- [Ficha do @pentester](./pentester.md) — revisão adversarial de segurança
