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
├── squad.json              ← manifesto do squad
├── executors/*.md          ← um arquivo por executor
├── genome-binding.json     ← vínculo com genome (se aplicável)
└── assets/                 ← materiais de referência
```

---

## Como ele lê seu projeto

Antes de criar, o `@squad` lê:
- `.aioson/rules/` — restrições gerais do projeto
- `.aioson/rules/squad/` — overrides específicos de squads
- `.aioson/context/project.context.md` — classificação e idioma

---

## Comandos CLI relacionados

```bash
# Criar squad via CLI
aioson squad:assemble <slug>

# Atualizar squad existente (breadth-aware)
aioson squad:refresh <slug>

# Publicar no aioson.com
aioson system:publish --type=squad --slug=<slug>
```

---

## Handoff típico

- **Vem de:** investigação com `@orache` (quando domínio é novo) ou diretamente do usuário
- **Vai para:** os próprios executores do squad, que operam como agentes independentes

---

## Detalhes recentes

- **domain breadth (Mai/2026):** executores que antes recusavam pedidos adjacentes ao seu escopo agora respondem com mais amplitude contextual
- **squad refresh:** `@squad refresh <slug>` atualiza um squad existente com nova investigação sem recriar do zero

---

## Próximo passo

- Antes de criar um squad: [orache.md](./orache.md) — investigação de domínio
- Depois de criar: [genome.md](./genome.md) — para vincular DNA cognitivo aos executores
- Glossário: [squad](../1-entender/glossario.md#squad)
