---
slug: squad-verified-completion
status: done
owner: dev
created_at: 2026-09-24
classification: MICRO
risk: medium
source: direct-user-request
---

# Squad — conclusão verificada

## Scope
Corrigir falsos sucessos no caminho worker → reflexão/revisão → estado final (item 1.3 do plano de confiabilidade).

## Context selected
Projeto validado; context:brief dev/executing; regras disk-first, output-brevity, source-code-language e squad-driver-pattern; revisão técnica e plano de confiabilidade; primeiro incremento já concluído. Workflow de onboarding preservado.

## Implementation intelligence
Reusar verify-gate para must_haves, limites de iteração existentes e runner real. Manifest canônico pode ter executores em array, legado em objeto; fallback só para ausência, nunca erro de leitura. A função de decomposição mistura descoberta e ignora erros, portanto não serve como leitor estrito de avaliação. Sem novo provider ou dependência: critério sem avaliador permanece não verificado. Avaliação semântica futura pode usar eval-engine; heurística textual não a substitui.

## Expected files
- behavior: src/squad/reflection.js
- behavior: src/commands/squad-autorun.js
- behavior: src/worker-runner.js
- support: tests/squad-autorun.test.js (integração e reflexão)
- support: tests/squad-worker.test.js
- support: este plano e dev-state.md

## Done criteria
NEEDS_ITERATION não conclui; correção limitada recebe feedback; critério crítico desconhecido/erro de avaliação não aprova; contratos canônicos são lidos; must_haves são exigidos também sem --reflect; scaffold não executa como entrega. Votação por status não aprova conteúdos divergentes; avaliação separada recebe artefato e precisa aprovar explicitamente sem perder evidências do gerador. Nenhum completed_at antes da avaliação final.

## Useful options considered
- Include now: vereditos explícitos, distinção entre lint e mérito, validação de contrato, limites existentes, evidências preservadas, scaffold não implementado, regressões no CLI real.
- Defer: novo avaliador semântico, memória aprovada, budgets, daemon e mudanças de CLI (outros incrementos).
- Escalate: nenhuma escolha de produto necessária para corrigir os falsos sucessos demonstrados.

## Verification
node --require ./tests/setup/windows-fs-retries.js --test --test-concurrency=4 tests/squad-autorun.test.js tests/squad-worker.test.js tests/squad-review-loops.test.js tests/verify-gate.test.js
Sintaxe, lint e consumidores relacionados conforme impacto. Fixtures com workers reais, sem APIs pagas.

## Session state
Concluído. Pacotes sem contrato adicional mantêm a prova mínima de execução; checklist crítica configurada exige avaliação mesmo sem --reflect. Critérios não verificáveis permanecem pendentes, sem disparar tentativas automáticas inúteis.

## Evidências e compatibilidade
- Manifest canônico com executores em array e legado em objeto suportados; arquivo canônico inválido não cai silenciosamente no legado. Checklist canônica prevalece sobre quality.md legado.
- NEEDS_ITERATION persiste needs_iteration; correção limitada recebe resumo da falha. UNVERIFIED e vereditos desconhecidos não aprovam. Erros de avaliação são visíveis e não geram completed_at.
- Comprimento e contagem de palavras estão identificados como lint. Os antigos IDs semânticos on_topic/actionable não fingem julgamento por tamanho. Score é restrito aos checks determinísticos; sem check avaliado, null.
- Must_haves são verificados sem depender de --reflect. Artefato ausente impede conclusão; truths com simples coincidência de palavras e wiring não verificável ficam pendentes. Não foi implementado novo avaliador semântico: essas obrigações exigem avaliação real antes de aceitar a entrega.
- Scaffold novo lança not_implemented; runtime recusa o marcador específico dos scaffolds novos/legados antes do spawn, sem retry. Implementador deve substituir o corpo e remover o marcador conforme README gerado.
- Votação compara saída exata e registra agreement_kind=exact_output; status igual não comprova conteúdo igual. Divergências/empates/resultado não aceito escalam sem completed_at. Evidência das instâncias é preservada. Isto não é julgamento semântico nem garantia de correção de respostas idênticas.
- Review loop envia artefato ao revisor e feedback ao gerador; exige PASS explícito de execução e avaliação bem-sucedidas, com revisor diferente. Candidatos ficam awaiting_review até decisão. Histórico do gerador e evidência do revisor são preservados; falha do revisor encerra sem repetição cega. Limites de iteração são finitos.
- Resumo textual e JSON expõem evaluation_pending com motivo. CLI real com checklist crítica não avaliável retorna exit 1 e zero tarefas concluídas.
- Suíte ampliada: 584 testes, zero falhas/skips em `.aioson/runtime/squad-verdict-suite.log`. Após ajustes finais e mais uma regressão de falha do revisor: 48 testes focados, zero falhas em `.aioson/runtime/squad-verdict-final-focused.log`.
- Sintaxe: 659 arquivos; lint: 1196 arquivos, zero novos apontamentos. git diff --check sem erros. Ambiente Windows; nenhum provider pago ou efeito externo utilizado.

Próximo incremento: item 1.4, pausa por orçamento e retomada honesta. Nenhuma publicação nem alteração do workflow de onboarding.
