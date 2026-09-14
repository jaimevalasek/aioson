# Tutorial de orquestração — revisão da entrega

Data: 2026-09-13. Duas passagens manuais pelo implementador: fidelidade ao código e funcionamento no navegador. Não é QA independente do Creator Studio.

## Entrega
13 capítulos em tutorials/orquestration/index.html; layout e tokens Tinta & Ouro reutilizados de tutorials/memories. CSS/JS separados, sem dependências externas. Link no catálogo de tutoriais e rodapé.

Responsabilidades Planner/Dev/executor/dashboard, ciclo SDD, unidades/lanes/ondas, dependências reais, configuração dos modelos, primeiros comandos, monitor por projeto/portas/histórico, estados, Autopilot/rework/retomada, contexto/tempo/cache/custo equivalente, integração e QA final. Exemplos didáticos identificados, gerador de comandos apenas textual e com escape PowerShell.

Documentação execution-lanes do workspace e template alinhada às correções do executor: recuperação técnica limitada e integração atribuível a lane existente. Nenhum pacote publicado nem aplicação do usuário reiniciada.

## Evidência
- Browser real Edge com perfil isolado: links/âncoras, seis cenários de vagas/rework, dependências e limite de concorrência, reset, validação/escape de comandos, clipboard/fallback, 128k/200k/1M/desconhecido, tema persistente, quatro larguras 320/390/768/1440, impressão e conteúdo sem JS; zero erros de página.
- O primeiro teste da simulação exigia que a fase 3 começasse antes da fase 2 em todos os cenários; corrigido para a regra real: ela pode iniciar sem esperar a fase 2 terminar, inclusive simultaneamente. A outra correção do teste foi aguardar a operação assíncrona do clipboard.
- Monitor: 13 testes aprovados, incluindo um novo teste HTTP com dois projetos e o mesmo slug; remover o estado de um não altera o outro. Portas, arquivos arquivados, relatórios e browser mobile também aprovados.
- Context evals shipped: 2 testes aprovados, zero skips. Lint dos arquivos JS/teste tocados: zero achados. git diff --check sem erros.
- Visual advisory: pass, sem issues, com avisos de heurística. O corpus da pasta não inclui o CSS herdado que define tipografia, tokens e layout; a revisão visual usou as páginas renderizadas. Não foram adicionados efeitos, imagens ou dependências somente para satisfazer uma heurística de composição.

Evidências: .aioson/runtime/quality/orchestration-analysis/tutorial-browser-review.json, tutorial-visual-review.json, dashboard-project-review.log, tutorial-context-evals.log, tutorial-orchestration-desktop.png, tutorial-orchestration-mobile.png e tutorial-orchestration-simulation.png.

## Execução observada: confirmação final ainda pendente
Run 7cb36089-9c29-4441-8794-89db7e74d5be do Creator Studio, às 16:16 UTC: phase-1-backend-layer-contract passou DEV e QA; phase-1-backend-layer-store e phase-1-backend-text estão em execução. O motor continua vivo.

phase-6-backend esgotou duas continuações e preservou context_budget_exceeded. Os picos de entrada reportados pelo OpenCode foram próximos de 80k; isso demonstra a proteção reativa, não conclusão das legendas. A recuperação precisa reavaliar o tamanho da unidade e o que foi preservado no checkpoint, sem simplesmente repetir sem limite ou declarar PASS. Não recompile o plano sob trabalhadores ativos.

Catálogo conserva o crash database is locked anterior ao hotfix. Supervisor local PID 37784 aguarda o executor encerrar para retry somente desse erro no mesmo run; não cobre a decisão de contexto de legendas. Isso não deve ser anunciado como recuperação completa ou QA final aprovado. Relatórios finais e integração ainda são necessários.
