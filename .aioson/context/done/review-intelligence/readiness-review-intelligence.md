---
slug: review-intelligence
classification: MEDIUM
verdict: ready
readiness: ready
status: approved
created_at: 2026-07-15
---

# Readiness — Review Intelligence

**Verdict: ready.** Escopo, assinaturas, estados, ownership, paths, segurança, compatibilidade e critérios binários estão definidos. Não há decisão humana bloqueante; a autorização do usuário cobre a solução recomendada e exige evolução estritamente aditiva.

## Fontes de autoridade

- `.aioson/context/prd-review-intelligence.md`
- `.aioson/context/requirements-review-intelligence.md`
- `.aioson/context/design-doc-review-intelligence.md`
- `.aioson/context/conformance-review-intelligence.yaml`
- `.aioson/plans/review-intelligence/harness-contract.json`
- `researchs/mattpocock-grill-me-with-docs-2026/summary.md`

## Reuso obrigatório

- `src/verification/path-policy.js` somente para slug/root/posix helpers; contenção real fica no domínio novo.
- parser/logger/i18n e dispatcher de `src/cli.js` sem alterar tratamento genérico.
- `MANAGED_FILES`, installer/update e `npm run sync:agents` para distribuição.
- `context:brief`, research cache, dossier, gates, QA, pentester, validator e `verify:implementation` sem mudança semântica.

## Criar

- `src/review-intelligence/{profiles,contracts,storage,engine}.js`
- `src/commands/review-intelligence.js`
- `template/.aioson/skills/process/review-intelligence/` com SKILL, metadata e quatro referências
- `template/.aioson/schemas/review-intelligence.schema.json`
- `tests/review-intelligence.test.js`
- `tests/review-intelligence-skill.test.js`

## Modificar aditivamente

- import/JSON support/help/dispatch em `src/cli.js`
- três chaves de help nos quatro locales
- `src/constants.js`
- managed block de `template/AGENTS.md` e `AGENTS.md`
- hooks pequenos nos oito agentes canônicos; sincronizar cópias workspace
- referências CLI en/pt-BR e testes de i18n/contratos

## Não modificar

- semântica de qualquer comando/alias/flag/output/exit code atual
- workflow sequence, gates, `CHAIN_AGENTS`, handoff contracts, runtime DB ou telemetria
- verification/briefing schemas e stores existentes
- `architecture.md` global
- package version/lockfile

## Dependências e ordem

1. contratos/perfis/storage e seus testes;
2. engine/commands/dispatcher/help e E2E;
3. skill/schema/distribuição/hooks/paridade;
4. documentação e hardening integral.

As fases são sequenciais; compartilhar `src/cli.js`, agents ou `src/constants.js` entre lanes paralelas criaria risco de merge/regressão sem benefício.

## Restrições de execução

- Usar apply_patch em edições manuais; usar scaffold/validator da `skill-creator` para a nova skill.
- Editar agentes no template primeiro e executar sync somente após preflight; preservar mudanças existentes no worktree.
- Nenhum report stale/invalid entra no store canônico.
- Ausência da skill/CLI mantém fallback manual e nunca vira gate no MVP.
- Rodar testes focados após cada fase e suite integral antes do Gate D.

## Primeiro slice

Implementar `profiles.js`, `contracts.js` e `storage.js` com fixtures temporárias. Só integrar o CLI quando validação, bounds, realpath/symlink, hashing e atomicidade estiverem verdes.

## Riscos residuais aceitos

- Self-review não elimina viés; reviewers downstream continuam independentes.
- Storage content-addressed pode acumular; retenção fica adiada e limite de varredura falha de forma segura.
- O classificador sugeriu protótipo por heurística textual de ownership/workspace, mas o projeto é CLI-only e não há superfície visual; nenhum protótipo é necessário.

## Blockers

Nenhum.
