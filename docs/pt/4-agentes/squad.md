# @squad — Criar e gerenciar squads de especialistas customizados

> **Para quem é:** quem precisa de agentes especializados fora do time padrão do AIOSON.
> **Tempo de leitura:** 4 min.
> **O que você vai sair sabendo:**
> - O que é um squad e quando ele vale o esforço
> - Como criar, atualizar e publicar um squad

---

## Para que serve

O time padrão do AIOSON cobre o ciclo completo de desenvolvimento de software — do `@product` ao `@qa`. Mas e quando o seu domínio é jurídico, de saúde, de marketing de conteúdo, ou qualquer área que foge do padrão?

O `@squad` resolve esse problema criando **pacotes de executores especializados** com identidade, voz, e regras próprias. Um squad de "compliance jurídico" pode ter um `@regulator`, um `@attorney`, e um `@auditor` que falam o vocabulário certo, usam os frameworks certos, e entregam no formato certo para aquele domínio.

Um squad é um **pacote real** enraizado em `.aioson/squads/{slug}/`. Não é uma pasta de prompts ad-hoc — o CLI, dashboard, validação e sincronização com o aioson.com esperam a estrutura canônica.

---

## Quando invocar

- Você precisa de especialistas em um domínio que o time padrão não cobre (jurídico, saúde, marketing, finanças, etc.)
- Você quer reutilizar um conjunto de agentes em múltiplos projetos
- Você quer publicar um squad no aioson.com para outros times usarem
- Você tem um squad criado anteriormente e quer atualizar sua definição com `refresh`

---

## Quando NÃO invocar

- O time padrão resolve — `@squad` adiciona overhead de criação desnecessário para projetos MICRO ou SMALL comuns
- Você quer apenas um agente extra pontual — use `@squad agent-create` standalone em vez de montar um squad inteiro
- Você ainda não sabe o domínio — investigue primeiro com `@orache`

---

## Diálogo típico

```
Você > @squad

@squad > Qual operação?
         [1] Criar novo squad
         [2] Refresh de squad existente
         [3] Criar executor avulso
Você > 1

@squad > Domínio do squad?
Você > compliance trabalhista brasileiro

@squad > Investigando domínio com @orache...
         Frameworks identificados: CLT, Súmulas TST, eSocial
         Vocabulário-chave: empregador, CTPS, FGTS, aviso prévio
         Anti-padrões: análise genérica sem citar artigo, omissão de jurisprudência

@squad > Definindo executores:
         - @regulator  (analisa conformidade CLT)
         - @attorney   (interpreta cláusulas e redigir documentos)
         - @auditor    (checa inconsistências e riscos)

@squad > Squad gerado em:
         .aioson/squads/compliance-trabalhista/
         ├── squad.json
         ├── executors/regulator.md
         ├── executors/attorney.md
         ├── executors/auditor.md
         └── genome-binding.json
```

---

## Saídas em disco

```
.aioson/squads/{slug}/
├── squad.manifest.json     ← manifesto canônico (executores, bindings de genome, bloco pilot)
├── executors/*.md          ← um arquivo por executor
├── docs/PILOT.md           ← evidência do pilot (squad de classe entregável)
└── assets/                 ← materiais de referência

output/{slug}/
├── pilot/                  ← o entregável flagship que prova o squad
└── specimen/{genome}/      ← espécime held-out de um genome, para aprovação
```

---

## Como ele lê seu projeto

Antes de criar, o `@squad` lê:
- `.aioson/rules/` — restrições gerais do projeto
- `.aioson/rules/squad/` — overrides específicos de squads
- `.aioson/context/project.context.md` — classificação e idioma

---

## O gate de pilot

Um squad de classe entregável (`mode: software` ou `mixed`) só chega a "pronto" depois de provar que entrega o artefato flagship do domínio dele **no seu padrão de qualidade**. `squad:validate` prova estrutura, `squad:eval` prova aterramento — o pilot prova entrega.

O `@squad` orquestra, mas nunca escreve o entregável no lugar dos executores e **nunca aprova**:

```bash
# 1. Barato antes de caro
aioson squad:validate . --squad=<slug> --strict
aioson squad:eval . --squad=<slug>

# 2. Os executores do próprio squad constroem em output/{slug}/pilot/
#    e registram a evidência em .aioson/squads/{slug}/docs/PILOT.md

# 3. Lint determinístico — corrija cada problema
aioson verify:artifact . --kind=squad-pilot --slug=<slug> --advisory

# 4. Você inspeciona o entrypoint e congela
aioson squad:pilot-approve . --squad=<slug>
```

Squad de conteúdo ou pesquisa registra `pilot.status: not_applicable` — o `@squad` nunca fabrica um entregável só para satisfazer o gate. A lane `quick` pode adiar com um `pilot.deferReason` concreto; `regulated` e `premium` nunca adiam.

Contrato completo (bloco `pilot`, seções do `PILOT.md`, o que o pilot vincula e o que não, drift de `builders`): [Squads → Pilot](../5-referencia/squads.md#pilot--o-entregável-que-prova-o-squad).

---

## Comandos CLI relacionados

```bash
# Criar squad via CLI
aioson squad:scaffold . --slug=<slug> --name="Meu Squad" --mode=mixed

# Diagnosticar squad existente
aioson squad:doctor . --squad=<slug>

# Validar estrutura, manifesto e o corpo dos executores (stub/placeholder = erro no --strict)
aioson squad:validate . --squad=<slug> --strict

# Medir a qualidade (rubrica com fontes + held-out) sem gravar nada no squad
aioson squad:eval . --squad=<slug> --json --no-persist

# Ver o que uma ativação do @squad carrega e quanto custa em tokens
aioson squad:preflight . --operation=create --lane=standard --mode=<content|software|research|mixed> --json

# O portão do pacote (roda sozinho no agent:done do @squad)
aioson verify:artifact . --kind=squad-package --slug=<slug> --advisory

# Congelar o pilot (só você roda isto)
aioson squad:pilot-approve . --squad=<slug>

# Publicar no aioson.com
aioson squad:publish . --slug=<slug>
```

---

## Handoff típico

- **Vem de:** investigação com `@orache` (quando domínio é novo) ou diretamente do usuário
- **Vai para:** os próprios executores do squad, que operam como agentes independentes

---

## Detalhes recentes

- **domain breadth (Mai/2026):** executores que antes recusavam pedidos adjacentes ao seu escopo agora respondem com mais amplitude contextual
- **squad refresh:** `@squad refresh <slug>` atualiza um squad existente com nova investigação sem recriar do zero
- **investigação opt-out (v1.29.0):** a investigação de domínio com `@orache` agora roda **por padrão** — completa para domínios regulados/especializados, Quick Scan (1–2 rodadas) para domínios comuns sem fontes. É o que aterra os executores em frameworks/vocabulário reais em vez de priors do modelo (a causa nº1 de executor raso). O `@squad` anuncia o scan em vez de perguntar; diga "pula" para dispensar.
- **genome pass na criação (v1.29.0):** os genomes planejados por executor são gerados e vinculados **durante** a criação do squad — não mais como passo manual depois. Um squad de domínio especializado nunca sai com `## Active genomes` vazio: ou vincula o genome, ou entrega o comando `@genome` exato pendente no resumo da criação. Para re-aterrar executores rasos de squads antigos, rode `@squad refresh <slug>`.
- **contrato de pilot:** squads de classe entregável provam-se com um pilot congelado por você (`aioson squad:pilot-approve`). O bloco `pilot` no manifesto passa a ser estado canônico, e um pilot aprovado vira a régua de qualidade de toda sessão futura do squad. Veja [o gate de pilot](#o-gate-de-pilot).
- **destilação de domínio:** depois de um pilot aprovado, o `@squad` pode oferecer destilar a assinatura transferível para `.aioson/skills/squad/domains/{domain}.md` — nunca automaticamente, uma passada por aprovação. O segundo squad de um domínio nasce sabendo o que o primeiro aprendeu.

---

## Próximo passo

- Antes de criar um squad: [orache.md](./orache.md) — investigação de domínio
- Depois de criar: [genome.md](./genome.md) — para vincular DNA cognitivo aos executores
- Glossário: [squad](../1-entender/glossario.md#squad)
