---
feature_slug: review-intelligence
schema_version: "1.2"
created_by: dossier-init
created_at: 2026-07-16T00:38:49.292Z
status: closed
classification: MEDIUM
last_updated_by: dossier-init
last_updated_at: 2026-07-16T00:38:49.292Z
bootstrap_hash: daa465783875
---
## Why

Desenvolvimento assistido por LLM sem governança produz bases de código caóticas: arquivos monolíticos com milhares de linhas, pastas planas sem hierarquia semântica, código duplicado e nenhuma fase de design antes da implementação. O agente sabe *o que* fazer mas não tem contrato claro de *como organizar* — o resultado é um sistema que funciona mas não escala e não é mantível. O `@dev` e o `@deyvin` hoje implementam sem ler qualquer regra de estrutura de código, e o `@discovery-design-doc` existe mas está órfão — nunca é chamado em nenhum workflow.

## What

### Obrigatório 🔴
- **CLI AIOSON**: orquestração de agentes especializados via comandos `aioson workflow:next`, `aioson agent:done`, `aioson live:*`, `aioson runtime:emit`, etc.
- **SDD workflow com gates obrigatórios**: pipeline Spec-Driven com classificação MICRO/SMALL/MEDIUM determinando quais agentes são obrigatórios
- **Design-doc base permanente por projeto**: arquivo `.aioson/context/design-doc.md` fixo que define as regras de organização de código para o projeto — estrutura de pastas e subpastas, nomeclatura semântica (singular/plural, kebab-case), padrões de componentização, política de reuso, guideline de tamanho de arquivo (300–500 linhas recomendado; acima de 500 → agente deve emitir alerta explícito e propor alternativas concretas de split ou extração sem quebrar o sistema)
- **`@discovery-design-doc` como gate obrigatório em SMALL e MEDIUM**: integrado antes de `@dev` — lê o design-doc base + PRD + artefatos do `@architect` e gera um plano técnico concreto por feature (quais arquivos criar, onde exatamente, quais componentes existentes reusar, quais novos componentes pequenos criar)
- **`@dev` e `@deyvin` carregam design-doc como contexto obrigatório**: ambos os agentes de implementação leem o design-doc base antes de qualquer escrita de código — sem leitura do design-doc, não implementam
- **Runtime telemetry**: SQLite via better-sqlite3 para observabilidade de sessões no dashboard externo
- **Template AIOSON instalável**: estrutura distribuída via `aioson setup .` contendo agentes, skills, rules e locales

### Desejável 🟡
- **Task breakdown com paths exatos**: `@pm` inclui o path exato do arquivo em cada task gerada (ex: `src/components/auth/LoginForm.tsx`) em vez de descrições genéricas como "criar tela de login"
- **`@architect` gera scaffold inicial de pastas**: estrutura de diretórios sugerida como artefato explícito do `@architect` para projetos novos, alinhada com o design-doc base

## Code Map

```yaml
files: []
modules: []
patterns: []
```

## Rules & Design-Docs aplicáveis

_(populado via dossier:link-rule)_

## Agent Trail

- **2026-07-16T00:38:49.292Z** | @product | _prdGlobal_

## Revision Requests

_(vazio)_
