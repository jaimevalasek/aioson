# @discovery-design-doc — Discovery, readiness e design doc

> **Para quem é:** quem precisa transformar uma ideia vaga em clareza inicial ou consolidar PRD, requisitos e arquitetura num contrato técnico antes do `@dev`.
> **Tempo de leitura:** 3 min.
> **O que você vai sair sabendo:**
> - Os dois modos corretos de uso: exploratório e pré-dev
> - Por que ele pode aparecer depois de `@analyst` e `@architect` no workflow
> - O que o design doc e o readiness entregam para os próximos agentes

---

## Para que serve

O `@discovery-design-doc` tem dois usos válidos:

- **Modo exploratório:** quando um request chega vago, como ticket, ideia de feature ou anotação de reunião. Ele normaliza o problema, identifica ambiguidades e recomenda o próximo agente.
- **Modo pré-dev no workflow:** quando o projeto SMALL/MEDIUM já passou por `@analyst` e `@architect`. Nesse caso, ele consolida PRD, requisitos, spec e arquitetura num `design-doc` vivo e num `readiness` com plano técnico concreto para o `@dev`.

Ou seja: ele pode ser um atalho antes do ciclo completo **ou** uma etapa de segurança entre arquitetura e implementação. No workflow atual, esse segundo uso é esperado para SMALL/MEDIUM.

---

## Quando invocar

- Você tem um ticket, briefing ou ideia e quer transformar em documento estruturado rapidamente
- Você quer saber o que está bem definido vs o que ainda é ambíguo antes de acionar `@product` ou `@dev`
- Você está em modo exploratório e quer um checkpoint de clareza sem comprometer o workflow completo
- Você está no workflow SMALL/MEDIUM após `@architect` e precisa gerar o contrato técnico pré-dev
- O `@dev` precisa de caminhos, módulos, decisões de reuso e riscos de tamanho de arquivo antes de editar código

---

## Quando NÃO invocar

- Para refazer discovery amplo quando PRD, requirements, spec e architecture já estão claros
- Você precisa de discovery profundo com mapeamento de domínio — use `@analyst` dentro do workflow SMALL/MEDIUM
- Você quer um briefing pré-PRD com frameworks de framing — use `@briefing`
- A tarefa é MICRO e já possui um plano simples suficiente para `@dev`

> Ter PRD/spec definidos **não impede** o uso deste agente. No workflow SMALL/MEDIUM, eles são justamente entradas para o `design-doc` e o `readiness` pré-dev.

---

## Onde entra no workflow

**Fluxo exploratório manual (qualquer tamanho):**

```
@setup -> @discovery-design-doc -> próximo agente recomendado
```

**Detour opt-in no SMALL** (quando você quer consolidar artefatos de spec antes do `@dev`):

```
@product -> @sheldon -> @discovery-design-doc (opt-in) -> @dev -> @qa
```

**Sub-agente ou detour no MEDIUM** (absorvido pelo `@architect` em merged mode, ou invocável como detour entre `@orchestrator` e `@dev`):

```
@product -> @orchestrator -> @discovery-design-doc (opt-in) -> @dev -> @pentester -> @qa
```

> **Nota (v1.35.0):** nas lanes padrão, `@discovery-design-doc` não é um hop obrigatório. No SMALL, `@sheldon` já produz design-doc e readiness. No MEDIUM, `@architect` em modo merged também os produz. `@discovery-design-doc` continua disponível como detour quando você quer consolidação explícita pré-dev ou quando o request chegou vago e precisa de normalização antes de entrar no workflow.

O papel dele no meio da feature não é substituir `@sheldon` nem `@orchestrator`. Ele transforma artefatos existentes em um pacote executável para implementação, ou normaliza um request vago antes de chamar o próximo agente.

---

## Diálogo típico — modo exploratório

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

## Diálogo típico — modo pré-dev

```
Você > @discovery-design-doc
       Consolidar a feature checkout depois da arquitetura.

@discovery-design-doc > Lendo PRD, requirements, spec e architecture...
                        Escopo: checkout com pagamento único
                        Readiness: ready_with_warnings

                        Plano técnico:
                        - Reusar módulo de pedidos existente
                        - Criar service de pagamento em src/lib/payments/
                        - Evitar alterar fluxo de carrinho fora do checkout
                        - Risco: controller pode passar de 500 linhas; dividir em service + validator

@discovery-design-doc > Design doc criado em: .aioson/context/design-doc-checkout.md
                        Readiness criado em: .aioson/context/readiness-checkout.md
                        Recomendação: seguir para @dev quando Gate B estiver aprovado.
```

---

## Saídas em disco

```
.aioson/context/design-doc.md              ← design doc do projeto
.aioson/context/readiness.md               ← readiness do projeto
.aioson/context/design-doc-{slug}.md       ← design doc da feature
.aioson/context/readiness-{slug}.md        ← readiness da feature
```

---

## Como ele lê seu projeto

- `.aioson/context/project.context.md`
- Artefatos existentes: `prd.md`, `prd-{slug}.md`, `requirements-{slug}.md`, `spec.md`, `spec-{slug}.md`, `discovery.md`, `architecture.md` (quando relevantes)
- Design docs existentes: `design-doc.md`, `design-doc-{slug}.md`, `readiness.md`, `readiness-{slug}.md`
- `.aioson/context/project-map.md` quando existir, para resolver caminhos canônicos
- Input direto: briefing, ticket, screenshots, arquivos que você fornecer

---

## Handoff típico

- **Vem de:** pedido direto com um request vago ou ticket
- **Também vem de:** `@architect` no workflow SMALL/MEDIUM, como consolidação pré-dev
- **Vai para:** o agente recomendado no `readiness.md` — tipicamente `@product` quando o escopo ainda está aberto, ou `@dev` quando o readiness está pronto

---

## Próximo passo

- Para framing pré-PRD com discovery frameworks: ficha `briefing.md` (em construção)
- Para ciclo completo: [Primeiro projeto do zero](../2-comecar/primeiro-projeto.md)
