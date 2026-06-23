---
slug: framework-integrations-docs-update
status: done
owner: dev
created_at: 2026-06-23
updated_at: 2026-06-23
classification: MICRO
risk: low
source: direct-user-request
---

# Simple Plan - Framework Integrations Docs Update

## Scope
Garantir que arquivos oficiais do AIOSON em `.aioson/docs/integrations/` sejam instalados e atualizados pelo CLI sem apagar arquivos de integracao criados pelos projetos.

## Context selected
- context:brief planning selecionou `project.context.md`, `dev-state.md`, `memory-index.md`, `project-pulse.md`, `simple-plan-lane.md`, regras de estrutura/codigo e governanca de pastas.
- Existing pattern to follow: `installTemplate()` percorre arquivos do `template/` e copia por caminho relativo; `updateInstallation()` delega para `installTemplate()` com `mode: update`.
- Applicable rule/doc: Simple Plan lane; `.aioson/docs/README.md` define docs como conhecimento carregado por agentes; `src/constants.js` usa `MANAGED_FILES` para arquivos gerenciados/backups.

## Implementation intelligence
- Framework leverage: usar o mecanismo existente de template, backup e update; nao criar rotina separada para integrations.
- Structure and data boundary: manter a regra em `src/installer.js` e `src/constants.js`; teste em `tests/update.test.js`; arquivo oficial no `template/.aioson/docs/integrations/`.
- Reuse over custom code: o update atual ja preserva arquivos extras porque nao deleta o diretorio de destino; o teste deve travar esse comportamento.

## Done criteria
- Arquivos oficiais em `template/.aioson/docs/integrations/` entram em install/update.
- Arquivos oficiais listados em `MANAGED_FILES` recebem backup quando sobrescritos no update.
- Update substitui arquivo oficial desatualizado com mesmo caminho.
- Update preserva arquivo proprio do projeto no mesmo diretorio com outro nome.
- `--selective` continua conservador para novos arquivos ausentes.

## Useful options considered
- Include now: copiar o doc atual de `.aioson/docs/integrations/` para o template, registrar como managed e adicionar teste de merge preservativo.
- Defer: criar manifest explicito para distinguir docs framework/custom quando houver muitos arquivos ou conflito de nomes.
- Escalate: desenhar uma politica de namespace obrigatoria para integracoes de terceiros/projetos.

## Out of scope
- Apagar arquivos existentes em projetos.
- Criar comando novo para sincronizar docs.
- Alterar o comportamento geral de update fora de `.aioson/docs/integrations/`.

## Expected files
- `template/.aioson/docs/integrations/dashboard-app-form-publish-mapping.md`
- `src/constants.js`
- `tests/update.test.js`
- `.aioson/context/simple-plans/framework-integrations-docs-update.md`
- `.aioson/context/dev-state.md`
- `.aioson/context/project-pulse.md`

## Verification
- Passed: `node --test tests/update.test.js`
- Passed: `node --test tests/agent-contracts.test.js`
- Passed: `node --test tests/rules-lint.test.js`
- Passed: `npm run lint`

## Session state
Done: doc oficial de integrations foi adicionado ao template, marcado como managed e coberto por teste de update preservativo.

## Notes
- Decisao: `.aioson/docs/integrations/` e uma superficie mista. Arquivos com caminho vindo do template sao framework-managed; arquivos extras do projeto devem permanecer.
- O comportamento de `installTemplate()` ja era merge por arquivo; a mudanca reforcou distribuicao, backup e regressao, sem introduzir exclusao de arquivos extras.
