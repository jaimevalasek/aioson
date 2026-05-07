# [Arquivado] Guia do Engenheiro: Pair Programming com IA

> **Doc histórica — sem substituto direto.**
> Para o fluxo atual de pair programming e continuidade, veja [`../4-agentes/deyvin.md`](../4-agentes/deyvin.md) e [`../2-comecar/projeto-existente.md`](../2-comecar/projeto-existente.md).
> Conteúdo abaixo preservado para referência histórica.

---

# Guia do Engenheiro: Pair Programming com IA

> Baseado na metodologia de Fabio Akita — ["Do Zero à Pós-Produção em 1 Semana"](https://akitaonrails.com/2026/02/20/do-zero-a-pos-producao-em-1-semana-como-usar-ia-em-projetos-de-verdade-bastidores-do-the-m-akita-chronicles/)

Este guia não é sobre agentes — é sobre **como você trabalha com eles**. A diferença entre um desenvolvedor que usa IA com eficiência e um que perde tempo é quase sempre a qualidade das instruções e a disciplina do processo, não a IA em si.

---

## O mito do one-shot prompt

Você não vai resolver um problema real de software com um único prompt bem construído. Isso é mito.

A IA é como um programador extremamente esforçado que:
- Executa ordens explícitas e sem ambiguidade com alta precisão
- Comete erros frequentes quando as instruções são vagas
- Não conhece o seu negócio, seu cliente, sua história de decisões
- Toma decisões arquiteturais ruins sem contexto suficiente
- Perde o fio da meada em sessões longas sem documentação

**A sua spec é a sua proteção.** Quando algo der errado — e vai dar — a primeira pergunta não é "a IA errou?", mas: "minha instrução estava clara o suficiente?"

---

## Squad mode vs Engineer mode

O AIOSON oferece dois modos de trabalho. Escolha o que se encaixa no momento:

| | Squad mode | Engineer mode |
|---|---|---|
| **O que é** | Pipeline sequencial de agentes | Pair programming iterativo |
| **Quando usar** | Greenfield, times, iniciantes, feature grande | Dev experiente com visão clara do que fazer |
| **Documento central** | `discovery.md` → `architecture.md` → `prd.md` | `spec.md` (vivo, evolui com o projeto) |
| **Cadência** | Feature completa por ciclo de agentes | Passos atômicos, commit por passo |
| **Ideal para** | "Não sei exatamente o que o projeto precisa" | "Sei o que preciso, quero executar rápido" |

Os dois modos **coexistem**. Você pode usar o squad para descobrir e arquitetar, depois usar o engineer mode para implementar rapidamente.

---

## O spec.md: a spec viva

O `spec.md` é o documento mais importante para projetos que duram mais de uma sessão. É o único que evolui — os outros são estáticos.

### Por que não o project.context.md?

`project.context.md` captura o **início** do projeto: stack, classificação, framework. Não muda.

`spec.md` captura o **presente**: o que está feito, o que está em andamento, as decisões tomadas hoje, os bloqueios atuais. Muda toda sessão.

### Quando usar

- Projetos SMALL e MEDIUM que duram mais de um dia
- Quando você para e retoma o projeto dias depois
- Quando há decisões técnicas que precisam ser preservadas entre sessões

### Como manter

1. Crie via `/setup` (o agente vai perguntar) ou manualmente
2. Atualize ao final de cada sessão com `*update-spec`
3. Releia no início de cada sessão antes de qualquer prompt

O `spec.md` fica em `.aioson/context/spec.md` e **não é obrigatório** — para projetos MICRO e sessões curtas, não precisa.

---

## O ritual de sessão

A diferença entre sessões produtivas e sessões onde você "ficou dando voltas" quase sempre está no início.

### Início (2 minutos)

```
1. Ler project.context.md
2. Ler spec.md (se existir)
3. Definir UMA coisa a fazer nessa sessão
4. Escrever em texto simples o que espera ao final
```

Não comece sem saber onde quer chegar. "Vou trabalhar no projeto" não é um objetivo.

### Durante

- Um passo de cada vez
- Valide antes de avançar
- Commite cada passo que funciona
- Documente decisões no spec.md enquanto estão frescas

### Fim (3 minutos)

```
1. Resumir o que foi feito
2. Listar o que ficou pendente
3. Digitar *update-spec para o @orchestrator atualizar o spec.md
4. Fazer o commit final se necessário
```

---

## Anatomia de uma instrução eficaz

### Prompt ruim

```
Crie o sistema de notificações
```

Por que é ruim: deixa tudo em aberto — onde fica o código, que tipo de notificação, qual padrão seguir, o que não criar. A IA vai inventar.

### Prompt bom

```
Preciso criar um Job chamado SendNotificationJob em app/Jobs/ que usa a
interface NotificationChannel (já existe em app/Contracts/). O job deve
receber $userId e $message, buscar o usuário via User::find(), e chamar
$channel->send($user, $message). Deve implementar ShouldBeUnique com
uniqueId() baseado em $userId. Não crie nenhuma migration nem modifique
o model User.
```

Por que é bom: localização exata, dependências nomeadas, comportamento esperado, e o que **não** fazer.

### Template para qualquer instrução

```
Preciso [ação] chamado [nome] em [localização].
Deve [comportamento esperado].
Depende de: [dependências existentes].
Não crie/modifique: [o que está fora do escopo].
```

---

## A checklist de clarificação (antes de codar)

Use isso antes de pedir implementação de qualquer feature:

```
[ ] O que exatamente precisa ser feito? (comportamento esperado)
[ ] Quem usa isso? (contexto de usuário/ator)
[ ] Qual o critério de "pronto"? (definição de done)
[ ] Isso quebra algo existente? (impacto)
[ ] Existe uma forma mais simples? (YAGNI check)
[ ] Quais arquivos/classes serão criados ou modificados?
[ ] Precisa de migration? Job? Event?
[ ] O padrão está alinhado com o architecture.md?
```

Se você não consegue responder todas, pergunte ao @analyst antes de ir para @dev.

---

## Execução atômica

A instrução ao @dev foi incorporada ao agente, mas o conceito vale para qualquer interação:

**Regra:** Um passo de cada vez. Valide antes de avançar.

```
Sessão típica com @dev:

[você] Próximo passo: criar a migration da tabela appointments.
[dev]  Migration criada. [mostra código]
[você] OK. Próximo: criar o model Appointment com os relacionamentos.
[dev]  Model criado. [mostra código]
[você] OK. Próximo: criar o CreateAppointmentAction.
```

Nunca: "Crie a migration, o model, a action, o controller e os testes."

Por quê? Porque se a action estiver errada, você vai ter que refazer o controller e os testes junto. E a IA vai misturar decisões entre os arquivos de formas que você não pediu.

---

## Quando a IA diverge do esperado

1. **Não discuta** — corrija com precisão
2. Errado: "Isso não está certo, tente de novo"
3. Certo: "Você criou a classe em `app/Services/` mas o padrão deste projeto é `app/Domain/{Modulo}/Services/`. Mova para lá."
4. Se acontecer duas vezes, adicione uma regra explícita ao `spec.md` ou `architecture.md`

---

## Vigilância permanente

Estas áreas exigem revisão sua — não delegue cegamente:

| Área | Por quê revisar |
|---|---|
| Segurança | Auth, autorização, sanitização: a IA não conhece seu modelo de ameaças |
| Performance | N+1 queries, falta de índices, cache ausente |
| Concorrência | Race conditions em Jobs, falta de locks |
| Arquitetura global | A IA vê o arquivo, não o sistema. Você vê o todo |
| Regras de negócio edge cases | Ela não conhece seu cliente como você |

Estas áreas são confiáveis para delegação:

| Área | Por quê confiar |
|---|---|
| Boilerplate com padrão definido | Sem ambiguidade, resultado previsível |
| Transformações de dados com spec clara | Input/output bem definidos |
| Testes unitários para lógica delimitada | Escopo fechado |
| Refactoring com instrução precisa | "Mova X para Y seguindo o padrão Z" |
| Documentação de código existente | Não há o que inventar |

---

## Métricas que importam

Ao final de um projeto ou sprint:

| Métrica | O que revela |
|---|---|
| Features em produção estáveis | Qualidade real do processo |
| Retrabalho por sessão | Clareza das instruções |
| Decisões documentadas no spec.md | Maturidade do processo |
| Commits por sessão | Cadência de entrega |

Uma feature bem feita vale mais que dez features quebradas.

---

## Veja também

- [Cenários práticos](./cenarios.md) — exemplos por stack com todos os agentes
- [Guia de agentes](./agentes.md) — o que cada agente faz
- [Início rápido](./inicio-rapido.md) — primeiros passos
