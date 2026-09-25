---
slug: squad-proportional-instructions
status: done
owner: dev
created_at: 2026-09-25
---

# Instruções proporcionais

## Scope
Remover cotas sem evidência e biografias fictícias das instruções de criação, preservando contratos verificáveis.

## Context selected
Prompt-sharpener e prompt-diagnostics lidos. Creation-flow, package-contract e quality-lens são autoridades causais; gerador CLI já deixa behavioralProfile opcional. Sem novo serviço de IA.

## Implementation intelligence
Reusar roster adaptativo já existente; começar pelo responsável pela entrega e adicionar executor só por responsabilidade independente. Manter chaves/contratos do pacote para leitores legados, reduzir prosa sem remover limites, fontes ou qualidade.

## Expected paths
- behavior: template/.aioson/docs/squad/creation-flow.md
- behavior: template/.aioson/docs/squad/package-contract.md
- behavior: template/.aioson/docs/squad/quality-lens.md
- support: espelhos dos três docs em .aioson/docs/squad/
- support: este plano e bootstrap/current-state.md

## Useful options considered
- Include now: contagem causal, DISC opt-in, métodos suficientes para a tarefa, proibição de experiência profissional inventada.
- Defer: concluir ganho de qualidade/custo exige corpus e execuções comparáveis de modelos; não deduzir ganho sem medição.
- Escalate: nenhuma remoção de schema, agente ou comando.

## Verification
Revisão manual do prompt em duas passagens (contratos e decisões sob pressão); testes existentes de preflight, pacote e alcançabilidade. Cenários: um worker determinístico; uma peça com uma pessoa responsável; entrega crítica com revisão independente. Sem alegar benchmark de modelo.

## Evidências
29 testes existentes passaram. Revisão manual: worker determinístico dispensa persona; peça simples mantém um responsável; independência crítica adiciona revisor. Chaves, fontes, limites e quality_bar preservados. Ganho de qualidade/custo não medido; nenhuma alegação de superioridade de modelo.
