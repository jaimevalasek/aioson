# @discovery-design-doc — Discovery e design doc em uma sessão combinada

> **Para quem é:** quem tem uma ideia ou request e quer clareza completa — problema, ambiguidades, próximos passos — antes de qualquer implementação.
> **Tempo de leitura:** 3 min.
> **O que você vai sair sabendo:**
> - Quando usar este agente vs usar `@analyst` e `@architect` separados
> - O que o design doc entrega e como ele guia os próximos agentes

---

## Para que serve

Às vezes um request chega vago: um ticket, uma ideia de feature, uma anotação de reunião. Antes de abrir `@product` e percorrer o ciclo completo, você quer **normalizar o problema, identificar o que já está definido, e saber o que ainda está aberto** — tudo em uma sessão.

O `@discovery-design-doc` faz exatamente isso: transforma um request bruto num design doc enxuto e num documento de readiness que diz ao próximo agente "aqui está o que você precisa, e aqui está o que ainda falta".

É um atalho para quando o ciclo completo seria pesado demais — ou para quando você quer um checkpoint antes de decidir qual agente acionar.

---

## Quando invocar

- Você tem um ticket, briefing ou ideia e quer transformar em documento estruturado rapidamente
- Você quer saber o que está bem definido vs o que ainda é ambíguo antes de acionar `@product` ou `@dev`
- Você está em modo exploratório e quer um checkpoint de clareza sem comprometer o workflow completo

---

## Quando NÃO invocar

- A feature já tem spec e PRD definidos — acione diretamente `@dev` ou `@qa`
- Você precisa de discovery profundo com mapeamento de domínio — use `@analyst` dentro do workflow SMALL/MEDIUM
- Você quer um briefing pré-PRD com frameworks de framing — use `@briefing`

---

## Diálogo típico

```
Você > @discovery-design-doc
       Quero adicionar modo offline ao app mobile para que usuários possam
       ver conteúdos sem internet.

@discovery-design-doc > Normalizando request...
                        Problema: usuários perdem acesso ao conteúdo sem conexão
                        Escopo: modo leitura offline (não criação)

                        Ambiguidades identificadas:
                        - Quanto conteúdo cabe offline? (sem limite definido)
                        - Sincronização automática ou manual?
                        - Conflitos de versão se offline e online divergirem?

                        Já definido:
                        - Stack: React Native + SQLite local disponível
                        - Auth: token pode sobreviver offline (não expira em 24h)

@discovery-design-doc > Design doc criado em: .aioson/context/design-doc.md
                        Readiness: MÉDIO — 3 ambiguidades precisam de decisão.
                        Recomendação: @product para fechar escopo antes de @dev.
```

---

## Saídas em disco

```
.aioson/context/design-doc.md      ← design doc enxuto (vivo, atualizado por agentes futuros)
.aioson/context/readiness.md       ← status de clareza + ambiguidades abertas
```

---

## Como ele lê seu projeto

- `.aioson/context/project.context.md`
- Artefatos existentes: `discovery.md`, `architecture.md`, `prd.md`, `spec.md` (quando relevantes)
- Input direto: briefing, ticket, screenshots, arquivos que você fornecer

---

## Handoff típico

- **Vem de:** pedido direto com um request vago ou ticket
- **Vai para:** o agente recomendado no `readiness.md` — tipicamente `@product` (para fechar escopo) ou `@dev` (quando readiness é ALTO)

---

## Próximo passo

- Para framing pré-PRD com discovery frameworks: ficha `briefing.md` (em construção)
- Para ciclo completo: [Primeiro projeto do zero](../2-comecar/primeiro-projeto.md)
