# Receita: Refatoração grande com segurança

> **Para quem é:** desenvolvedor com um módulo crítico que precisa ser reescrito sem quebrar o que funciona.
> **Tempo de execução:** 1–3 horas dependendo do tamanho do módulo.
> **O que você vai ter no fim:** módulo refatorado, testes verdes, decisões documentadas, e rastreio completo do que mudou e por quê.

---

## Cenário

Você herdou um módulo de pagamentos com 800 linhas, zero separação de responsabilidades, e a classe `PaymentService` fazendo desde validação de cartão até envio de email de confirmação. Qualquer mudança é arriscada porque não há testes, e a lógica está toda entrelaçada.

A tentação é refatorar "no escuro" e ver o que quebra. A abordagem AIOSON é diferente:
1. **`@sheldon`** analisa o módulo e documenta a lógica existente antes de qualquer mudança.
2. **`@tester`** escreve testes que capturam o comportamento atual (testes como especificação do legado).
3. **`@dev`** refatora com segurança, guiado pela spec e pelos testes.
4. **`@qa`** com ciclo autônomo garante que nada quebrou.

O princípio: **nunca refatore sem testes que provem que o comportamento anterior ainda funciona.**

---

## Pré-requisitos

- AIOSON instalado no projeto (se não, siga [Em projeto existente](../2-comecar/projeto-existente.md))
- O módulo-alvo identificado (ex: `src/services/PaymentService.js`)
- Claude Code aberto no projeto

---

## Passo 1 — Criar a spec de refatoração com `@product`

Sim, refatoração também começa com spec. Não porque seja burocracia — mas porque você precisa declarar o que o comportamento externo do módulo DEVE continuar sendo, mesmo que o interno mude.

```
Você > @product

@product > Qual feature/tarefa vamos especificar?
Você > Refatoração do PaymentService — slug: refactor-payment-service

@product > O problema (por que refatorar)?
Você > Uma classe de 800 linhas com 12 responsabilidades diferentes.
       Impossível testar unitariamente. 3 bugs nos últimos 2 meses nela.

@product > O que deve continuar funcionando igual (comportamento externo que não muda)?
Você > 1. Processar pagamento via Stripe e retornar { success, transactionId }
       2. Enviar email de confirmação após sucesso
       3. Registrar tentativa (sucesso ou falha) no banco
       4. Lançar PaymentError com código se cartão recusado

@product > O que muda internamente?
Você > Separar em: PaymentGateway, EmailNotifier, PaymentLogger, PaymentOrchestrator

@product > Fora de escopo?
Você > Não mudar a interface pública (assinatura das funções)
       Não migrar banco de dados
       Não trocar de gateway de pagamento

@product > Spec gravada em features/refactor-payment-service/spec.md.
           Próximo: @sheldon para análise técnica profunda antes de qualquer mudança.
```

---

## Passo 2 — `@sheldon` analisa o módulo antes de tocar nele

O `@sheldon` é o agente de análise técnica profunda. Aqui ele age como um "arqueólogo" do código — documentando o que a classe faz, quais são seus acoplamentos, e onde estão as armadilhas.

```
Você > @sheldon

@sheldon > Ativando análise de PRD: refactor-payment-service.
            [Lê spec.md, examina src/services/PaymentService.js]

@sheldon > Análise completa:

            RESPONSABILIDADES IDENTIFICADAS (12):
            1. Validar dados do cartão (duplicado com frontend — risco de divergência)
            2. Criar customer no Stripe se não existe
            3. Criar charge no Stripe
            4. Lidar com retry em caso de timeout (lógica inline, sem exponential backoff)
            5. Enviar email via SendGrid (chamada direta, sem queue)
            6. Registrar em payment_logs
            7. Registrar em audit_logs (separado, motivo desconhecido)
            8. Atualizar order.status
            9. Disparar evento para analytics (Google Analytics via HTTP direto)
            10. Verificar fraude (campo fraud_score — parece unused, ver migration 87)
            11. Formatar erro para o cliente
            12. Enviar Slack notification em produção

            RISCOS NA REFATORAÇÃO:
            - Item 10 (fraud_score): código comentado com `// TODO: ativar` — não mexer por ora
            - Item 9 (analytics): chamada síncrona, se GA cair o pagamento falha — BUG LATENTE
            - Items 6+7 (dois logs): motivo desconhecido; separar os dois na refatoração pode quebrar relatório legado

            RECOMENDAÇÃO:
            Refatorar items 1–8 + 11 em 4 classes. Items 9+10+12 extrair como "legado isolado"
            sem modificar comportamento por enquanto.

@sheldon > Análise gravada em sheldon-enrichment.md.
            Próximo: @tester para criar testes do comportamento atual antes de qualquer mudança.
```

---

## Passo 3 — `@tester` escreve testes do comportamento atual

Estes testes não são sobre "o que deveria ser" — são sobre "o que é agora". Se o comportamento atual tem um bug, você testa o bug (e corrige depois, intencionalmente).

```
Você > @tester

@tester > Analisando PaymentService para engenharia de testes...

@tester > Coverage atual: 0% (sem testes).
           Quality tier: CRÍTICO — zero cobertura em módulo de pagamento.

@tester > Estratégia: characterization tests — capturar comportamento atual como especificação.

@tester > Criando tests/payment-service.characterization.test.js:

           Cenário 1: pagamento bem-sucedido
             → mock Stripe: charge criado com sucesso
             → espera: { success: true, transactionId: 'ch_xxx' }
             → espera: payment_log inserido
             → espera: email enviado (SendGrid mock)

           Cenário 2: cartão recusado
             → mock Stripe: card_declined
             → espera: PaymentError com código 'card_declined'
             → espera: payment_log inserido com status 'failed'

           Cenário 3: timeout do Stripe
             → mock Stripe: timeout na 1ª chamada, sucesso na 2ª (retry)
             → espera: { success: true } após retry

           [...mais 8 cenários...]

@tester > Executando... 11/11 passando (comportamento atual documentado).
           Agora você pode refatorar sem medo — se algum destes quebrar, você sabe.
           test-plan.md atualizado.
```

---

## Passo 4 — `@dev` refatora com segurança

```
Você > @dev

@dev > [lê spec, sheldon-enrichment, test-plan, architecture.md]

@dev > Plano de refatoração (baseado na recomendação do @sheldon):

       Criar:
       src/services/payment/
         ├── PaymentGateway.js       (items 1, 2, 3, 4, 11)
         ├── EmailNotifier.js        (item 5)
         ├── PaymentLogger.js        (items 6 + 7 — mantendo os dois, só encapsulando)
         ├── OrderUpdater.js         (item 8)
         └── PaymentOrchestrator.js  (coordena os 4 acima)

       Manter intocado (legado isolado):
         src/services/payment/legacy/
           ├── AnalyticsNotifier.js  (item 9 — bug latente isolado)
           ├── FraudChecker.js       (item 10 — TODO preservado)
           └── SlackNotifier.js      (item 12)

       Manter interface pública:
         src/services/PaymentService.js → re-exporta PaymentOrchestrator

@dev > Implementando...
       Rodando tests/payment-service.characterization.test.js após cada passo...
       PaymentGateway: 11/11 ainda passando ✓
       EmailNotifier: 11/11 ✓
       PaymentLogger: 11/11 ✓
       [...]
       Refatoração concluída. 11/11 ✓
       dev-state.md atualizado.
```

---

## Passo 5 — `@qa` valida com ciclo autônomo

```
Você > @qa

@qa > Rodando suite completa (characterization + novos testes de integração)...
       Characterization: 11/11 ✓
       Integração: PaymentOrchestrator chamando os 4 sub-serviços — ok
       Edge cases: Stripe timeout com retry — ok

       Encontrei 1 problema:
       PaymentLogger está logando em payment_logs mas não em audit_logs quando status=failed.
       Era assim no original? Verificando...

       [compara com sheldon-enrichment.md]
       Sim, o original logava nos dois. Regressão.

@qa > Ciclo autônomo QA→Dev (iteração 1/2):
       Reportando para @dev...
@dev > Corrigindo PaymentLogger.js: ambos os logs no failure.
@qa > Re-rodando... 11/11 characterization + integração OK. Nenhuma regressão.
      qa-report-test-coverage.md salvo.
```

---

## O que ficou em disco (rastreio)

```
.aioson/context/
├── features/
│   └── refactor-payment-service/
│       └── spec.md                  ← o que muda, o que não muda, fora-de-escopo
├── sheldon-enrichment.md            ← análise das 12 responsabilidades + riscos
├── test-plan.md                     ← 11 characterization tests
├── dev-state.md                     ← estrutura nova (4 classes + legado isolado)
└── qa-report-test-coverage.md       ← 11/11 passando, 1 regressão detectada e corrigida
```

---

## Variações

| Situação | Ajuste |
|---|---|
| Já tenho testes existentes | `@tester` analisa os existentes antes de criar novos. Quality tier indica gaps. |
| Módulo de 3.000+ linhas | `@orchestrator` divide em lanes paralelas. Cada lane refatora um grupo de responsabilidades. |
| Posso introduzir breaking changes na interface | Declare isso no `@product` como AC. O `@dev` atualizará todos os chamadores. |
| Quero refatorar banco de dados também | Escopo separado — crie outra feature slug para o migration. Não misture na mesma spec. |

---

## Solução de problemas

| Problema | Solução |
|---|---|
| Characterization tests falhando antes de refatorar | Sinal de que o ambiente de teste não está configurado. Verifique mocks de Stripe/SendGrid. |
| `@sheldon` não achou riscos | Diga explicitamente: "Analise acoplamentos e dependências ocultas". Ele vai mais fundo. |
| `@dev` mudou a interface pública por engano | O spec.md diz explicitamente "não mudar interface". Mostre para `@dev`. |
| QA→Dev ciclo não convergiu em 2 iterações | Ative `@deyvin` para debug manual em pair. |

---

## Próximo passo

- Antes de ir para produção, faça uma auditoria: → [Auditoria de segurança](./auditoria-seguranca.md)
- Sessão longa e complexa? Use dossier para rastreio: → [Continuidade entre sessões](./continuidade-entre-sessoes.md)
- Quer entender melhor o `@sheldon`? Veja [Mapa do ecossistema](../1-entender/mapa-do-ecossistema.md).
