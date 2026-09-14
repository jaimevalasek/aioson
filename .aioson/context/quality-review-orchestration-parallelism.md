# Análise da orquestração: paralelismo, contexto e qualidade

Data: 2026-09-13. Perfil: framework. Avaliação limitada ao motor de execução e ao plano/ledger de `biblioteca-criativa-e-camadas`, em `C:/dev/playapps/creator-studio`.

Conclusão: o paralelismo e a escolha de host/modelo por papel funcionam, mas a execução observada não realiza integralmente a intenção de concorrência por dependências reais, contexto abaixo de 50% e correção automática antes de propagar defeitos.

## Evidência e limites

- Fonte: checkout AIOSON `0fb9e69e4b2719203410f03380ea7f0c1677762e`, versão 1.66.0, Node v24.19.0, Windows. Workspace já continha alterações rastreadas e arquivos novos, inclusive motor e painel; achados se referem à árvore de trabalho, não somente ao commit publicado.
- Painel consultado: `http://127.0.0.1:4181/api/features/biblioteca-criativa-e-camadas/status` e relatórios vinculados pelo endpoint `/report`.
- Snapshot: [snapshot.json](../runtime/quality/orchestration-analysis/snapshot.json), observado às 06:39:17 UTC / 03:39:17 de Brasília. Run `cf1acfca-17bf-4485-a91b-d36f15418a26`.
- Relatórios consultados: [reports.json](../runtime/quality/orchestration-analysis/reports.json). Achados do produto são evidência dos revisores, não reproduções independentes desta análise.
- Código de execução e plano do consumidor foram apenas lidos. Nenhum processo ativo foi interrompido, nenhuma decisão da run foi aplicada e nenhum plano foi recompilado.
- `review-intelligence` + somente `delivery-assurance.md`: duas passagens manuais. `review:prepare --agent=quality` retornou `invalid_agent` (exitCode 2); infraestrutura indisponível para este papel. Este documento não é um relatório promovido nem aprovação de gate.

## O que a execução comprova

O plano contém 19 unidades: 18 DEV→QA e uma integração da sessão DEV, distribuídas em oito ondas. A primeira tem cinco unidades; as ondas 2–6 têm duas cada; a sétima tem três. As 18 unidades não têm dependências explícitas (`edges: 0`, `depends_on: []`).

`parallel.max_concurrent_lanes = 2` limita pipelines de unidades, incluindo QA. Não significa dois backend + dois frontend + dois QA. O motor admite várias unidades da mesma lane quando houver vagas; lane identifica configuração de papel/modelo, não um processo fixo.

Na onda 2, backend iniciou às 06:11:26.993 UTC e frontend às 06:11:27.523 UTC: diferença de 530 ms. O frontend encerrou BLOCKED às 06:18:08.867 UTC; o backend permaneceu ativo e escrevendo arquivos no snapshot. A vaga livre não tem outro trabalho liberado por este plano.

Configuração compilada atual: backend em OpenCode / `openrouter/meta/muse-spark-1.3-contributor`; frontend em Codex / `gpt-5.6-sol`; revisões em Codex / `gpt-6-astra`. Tentativas anteriores de backend usaram Antigravity / `Gemini 3.8 Flash (High)`. Isso demonstra roteamento real por papel e histórico de hosts; não mede superioridade ou velocidade intrínseca de qualquer modelo.

## Achados em ordem de impacto

### 1. Revisão reprovada libera trabalho dependente

Classificação: confirmado; comportamento intencional do motor atual, incompatível com a expectativa declarada de qualidade antes de avançar.

`src/agent-execution/execution-run.js:1561` considera o pipeline terminado quando DEV passou e QA está `passed`, `failed` ou `skipped`. Arestas `after_qa` também usam essa condição: significam revisão encerrada, não aprovação. `max_rework_rounds` assume zero quando omitido (`:1511`); foi compilado como zero nas duas lanes do consumidor.

A onda 1 terminou com cinco DEV PASS, cinco QA FAIL e zero rodadas de retrabalho. O plano, por sua vez, exige na fase 2 “fase 1 verificada; não pular regressões”. Alguns FAIL são dependências prematuras, mas outros relatam defeitos concretos: perda de `presetId`/`trackIndex` ao reabrir, substituição de camada bloqueada e inspector fora da área visível. O registro atual não comprova que esses defeitos foram corrigidos.

Reprodução: consultar snapshot e relatórios; executar o teste existente `a failed review never blocks the run` em `tests/execution-run.test.js:482`.

Recomendação / dono: DEV do motor deve distinguir revisão encerrada de aceite, enviar falhas locais ao implementador com retrabalho limitado e bloquear dependentes que exigem aceite. Trabalho independente pode continuar. Esgotamento precisa de estado acionável, com achados preservados, sem fingir aprovação. Aceitação: fixture com QA FAIL impede seu dependente, deixa unidade independente avançar e retoma somente após correção e nova revisão.

### 2. Verificação da capacidade inteira vira obrigação de cada unidade

Classificação: confirmado.

`src/agent-execution/execution-plan.js:728` atribui verificações por CAP compartilhada, sem dependência de disponibilidade do teste. A unidade `phase-2-frontend` tem `Done when: npm run typecheck`, mas recebe também `tests/integration/creative-elements-render.test.ts` como verificação obrigatória. Esse arquivo pertence ao backend concorrente. O frontend passou no typecheck e retornou BLOCKED por ausência do teste.

Os relatórios da onda 1 mostram o mesmo padrão: revisão do catálogo cobrou UI e testes de camadas/render ainda não entregues por outras unidades. Não é suficiente renomear FAIL para PASS: falta representar quando a evidência conjunta pode ser cobrada.

Recomendação / dono: Planner e compilador devem preservar checks locais por unidade e criar checks de integração com produtor, consumidor e condição de liberação explícitos. Dependência ainda não entregue deve gerar espera automática identificada, mantendo o resultado local. Aceitação: frontend pode concluir implementação independente; a verificação conjunta só inicia após seu teste e seus produtores estarem prontos, sem decisão manual por ordem de chegada.

### 3. O plano usa barreiras globais e não explora o grafo disponível

Classificação: confirmado quanto ao agendamento; ganho de desempenho de um novo plano não medido.

`src/agent-execution/execution-run.js:1571` permite início por arestas explícitas, mas unidades sem arestas aguardam todos os pipelines de ondas anteriores. O plano do consumidor, linha 139, não possui coluna `Depends on`. As fases textuais também encadeiam “fase anterior verificada”. Portanto, a serialização entre ondas vem do plano e da regra de fallback, não da ausência de suporte a execução concorrente no motor.

Há conflitos reais entre arquivos: fases de elementos, áudio, efeitos e transições repetem `creativeCatalog.ts`, `renderPlan.ts` ou `PreviewPanel.tsx`. Colocar todas essas unidades atuais na mesma onda violaria a posse exclusiva validada pelo compilador. As partes novas e independentes podem ser candidatas a extração; conexões com arquivos compartilhados precisam de unidades próprias ou ordenação explícita.

Recomendação / dono: Planner deve derivar ondas do grafo de dependências e conflitos, não copiar números de fases. Preservar contrato de interface e unidade de integração para cada conjunto que precisa funcionar junto. Antes de ampliar uso de arestas, validar também conflitos de escrita entre ondas que poderão se sobrepor, inclusive QA que corrige arquivos. Aceitação: plano com fases independentes inicia juntas; unidades que compartilham escrita ou consomem contrato instável aguardam a dependência correspondente.

### 4. Teto de 50% do contexto não é uma garantia implementada

Classificação: lacuna confirmada no caminho inspecionado; uso real dos contextos não medido.

`execution-plan.js:733` mede arquivos/ACs como aviso e `:392` registra bytes do prompt inicial. O plano tem teto heurístico de dez arquivos/seis ACs e maior prompt de 15.005 bytes. Não há nesse mecanismo um orçamento de tokens da janela do modelo, medição cumulativa de leituras/saídas de ferramentas, nem checkpoint automático ao atingir metade da janela.

Uma unidade por processo, trechos de PRD/plano e carregamento seletivo de regras reduzem contexto. Isso não prova que uma execução longa permaneceu abaixo de 50%. Bytes do prompt inicial não incluem todo o histórico que o harness acumula.

Recomendação / dono: DEV do contrato de execução/adaptadores deve representar limite por host/modelo, orçamento por unidade, fonte da medição e política de checkpoint/continuação. Onde o harness não expõe uso confiável, exibir explicitamente “não medido”, com estimativa conservadora identificada. Aceitação: execução sintética ao limiar salva continuidade e libera contexto novo sem repetir entregas; harness sem medição nunca declara cumprimento do teto.

### 5. A largura do plano não representa concorrência efetiva

Classificação: confirmado.

`execution-plan.js:862` calcula `max_concurrent_units` pela maior quantidade de unidades numa onda: cinco neste plano. O pool real é dois (`execution-run.js:1652`) e a unidade ocupa a vaga durante DEV→QA. A projeção do painel já expõe limite real e contagem DEV+QA aprovados (`execution-observation.js:63`), portanto esses dados úteis existem.

Recomendação / dono: DEV do planejamento/monitor deve separar largura potencial, vagas configuradas, trabalho pronto, bloqueios por dependência e aprovação. Para estudar pools distintos DEV/QA, medir demanda e manter proteção de escrita quando revisores corrigem arquivos. Aceitação: resumo do plano com cinco unidades e limite dois nunca promete cinco execuções simultâneas; unidade esperando teste de outra mostra essa causa.

### 6. Regressão reproduzida no teste de recuperação de inatividade

Classificação: falha de teste confirmada; causa e impacto em produção não determinados.

`tests/execution-monitor.test.js:110` recebeu três eventos de inatividade quando esperava dois. Falhou na seleção completa e novamente isolado. Não explica a serialização da run; é uma pendência específica de confiabilidade do monitor.

Recomendação / dono: DEV do monitor deve investigar contagem de episódios e interação entre relógio do teste, escrita e amostragem. Aceitação: teste passa com explicação da causa e prova de que novo episódio é emitido uma vez.

## Validação

- PASS: `aioson context:validate . --json`.
- PASS: consulta de status/relatórios e comparação com plano/compilador/scheduler.
- PASS: `aioson quality:run . --profile=framework --dry-run --json` identificou os checks disponíveis.
- FAIL: `node --require ./tests/setup/windows-fs-retries.js --test --test-concurrency=1 tests/execution-run.test.js tests/execution-rework.test.js tests/execution-graph.test.js tests/execution-unit-budget.test.js tests/execution-monitor.test.js`: 47 testes, 45 aprovados, um reprovado, um ignorado. [Log](../runtime/quality/orchestration-analysis/tests.log).
- FAIL reproduzido: `node --require ./tests/setup/windows-fs-retries.js --test --test-name-pattern='engine stall and unproductive' tests/execution-monitor.test.js`. [Log](../runtime/quality/orchestration-analysis/monitor-recheck.log).
- PASS nos cenários existentes de concorrência, readiness por arestas, isolamento de dependentes bloqueados e retrabalho configurado. Esses testes usam fixtures/adaptadores de teste; não são benchmark dos modelos configurados.
- NOT_RUN: suíte global, Fallow, cobertura global, nova execução de modelos e testes do aplicativo consumidor; fora da pergunta delimitada. Teste de browser do monitor foi ignorado pela própria suíte.

## Duas passagens de revisão

Na passagem de evidência, a especificação de concorrência/qualidade foi confrontada com plano, run e implementação. A cobertura de aceitação revela checks conjuntos cobrados cedo; a organização do código tem fronteiras já existentes para correção; a verdade do runtime confirma concorrência inicial e bloqueio posterior. O uso real de tokens e a qualidade final do produto permanecem não verificados.

Na passagem de evolução, foram considerados atraso do produtor de teste, QA FAIL, retrabalho esgotado, retomada e concorrência de escrita entre ondas. A proposta precisa preservar decisões/histórico e não modificar uma run em andamento sob seu plano compilado. A integração da última onda continua pertencendo à sessão DEV; conclusão das lanes não é aprovação final ou publicação.

## Complemento: outras features, projetos e portas do painel

Pergunta adicional do dono: features anteriores ausentes e descoberta automática por projeto/porta.

Estado confirmado em `src/execution-dashboard/server.js:38`: a lista usa somente arquivos imediatos `.aioson/context/execution-plan-{slug}.json` ou `execution-state-{slug}.json` do projeto informado. Não consulta todos os projetos, telemetria histórica, planos Markdown, nem o diretório `context/done/`. `--feature` determina seleção inicial, não filtro exclusivo. A página consulta novamente a lista a cada cinco segundos (`public/app.js:254`).

Na consulta, `/api/features` retornou somente biblioteca-criativa-e-camadas. A busca recursiva em toda a `.aioson` do Creator Studio encontrou somente o par de JSONs dessa feature. Planos anteriores consultados, como fluxo-de-cortes-e-publicacao e movimento-da-legenda, declaram `execution: single`; o plano arquivado de efeitos-nos-clipes registra oferta/recomendação de orquestração, sem comprovar ativação. Esses dados explicam a lista atual, mas não permitem negar que o dono tenha usado agentes paralelos por outro mecanismo ou perdido registros históricos.

Há uma lacuna real de histórico: `feature:archive` move arquivos por slug para `context/done/{slug}`; o painel não descobre nem resolve estados nesse local. Uma feature do motor atual pode sair da lista ao ser arquivada. O monitor também representa o estado da run atual, não um catálogo completo de tentativas antigas.

`src/commands/execution-dashboard.js:6` usa porta fixa 4181 por padrão e retorna `port_in_use` em colisão. Não aloca outra automaticamente. Hoje é possível iniciar uma instância por projeto, escolhendo portas diferentes com `--port`. O código do painel precisa estar disponível no CLI executado; esta análise não publicou nem distribuiu a implementação nova.

As próximas features aparecerão automaticamente na instância daquele projeto quando seus JSONs de execução forem criados e permanecerem no local consultado. Outros projetos não aparecem nessa instância. Recomendação / dono: DEV do monitor deve acrescentar porta disponível automática quando não especificada, descoberta de arquivos históricos com resolução de relatórios correspondente e identificação clara do projeto. Um painel agregado de projetos exigiria registro/descoberta de raízes explícito. Aceitação: duas instâncias sem porta explícita não colidem; feature ativa e arquivada aparecem com origem correta; nenhum histórico é inventado na ausência de evidência.

## Complemento: tempo e tokens por onda

Pedido adicional: registrar duração, tokens de entrada, cache e saída por onda/rodada.

Os registros de DEV/QA já contêm `started_at`, `finished_at` e duração. No snapshot, as dez etapas preservadas da onda 1 vão de 05:00:31.990 a 06:11:25.345 UTC: 4.253.355 ms (1h10min53s) de intervalo observado e 5.049.966 ms (1h24min10s) somando durações DEV/QA. São medidas diferentes devido à sobreposição e às esperas. Este cálculo não reconstrói tentativas anteriores eventualmente substituídas no ledger.

O caminho de execução inspecionado não normaliza nem persiste uso estruturado de tokens. Adaptadores Codex/OpenCode usam invocações textuais e Antigravity declara saída `text`; `telemetry-bridge.js` guarda trechos de saída com limites e retenção, sem contadores de uso. Portanto não se pode prometer recuperação retroativa completa a partir desse histórico, nem atribuir zero a uma métrica ausente.

Contrato proposto: eventos de uso por `feature/run/wave/unit/stage/attempt/round`, com host, modelo solicitado/resolvido, início/fim, entrada total, entrada sem cache, cache lido, cache criado, saída e raciocínio quando distinguível. Preservar semântica original e fonte do provedor; cache pode já estar incluído no total de entrada, e raciocínio pode já estar incluído na saída. Normalizar evitando dupla contagem, distinguir eventos incrementais de acumulados, identificar ausência de medição com null e cobertura parcial do agregado.

Agregação: somar consumo de todas as tentativas, inclusive falhas, fallbacks e retrabalho, sem reaplicar eventos na retomada; mostrar intervalo de parede da onda, tempo ativo, espera e soma do trabalho dos agentes separadamente. Persistir eventos estruturados fora da retenção curta/truncamento dos logs textuais e manter histórico após arquivamento.

Consumo acumulado de entrada não mede ocupação atual da janela: o mesmo contexto pode entrar em diversas chamadas. O requisito de metade da janela precisa de medição própria por chamada/sessão, separada do total gasto na onda.

Dono: DEV do contrato de execução/telemetria, adaptadores e monitor. Aceitação: fixtures com cache incluído/separado, eventos repetidos e acumulados, fallback, falha parcial, retomada e duas unidades simultâneas produzem totais corretos; harness sem dados apresenta “não informado”, e duração de parede não é soma de execuções paralelas. Captura histórica real depende da evidência disponibilizada por cada harness; suporte específico ainda requer inspeção de seus formatos estruturados.

O dono também solicitou estimativa equivalente de custo via API usando preços oficiais. Acrescentar catálogo de tarifas por provedor/modelo/modalidade, moeda, unidade, origem oficial e data de vigência/consulta. Vincular cada cálculo à versão da tarifa; atualização não deve reescrever custos históricos silenciosamente. Nenhum preço atual foi consultado nesta análise e não há orçamento monetário calculado.

Para tarifas lineares por milhão de tokens, estimar somando categorias faturáveis disjuntas multiplicadas pelas respectivas tarifas e divididas por 1.000.000. Entrada sem cache, leitura de cache, criação de cache e saída podem ter preços diferentes; regras de faixa de contexto, modalidade e eventuais ferramentas devem ser aplicadas conforme o provedor. Campos ausentes tornam a estimativa parcial/indisponível, nunca custo zero. Modelo não mapeado exatamente não herda preço de um modelo parecido.

Exibir separadamente “custo equivalente estimado via API” e custo real informado pelo provedor, quando disponível. Uso por assinatura/CLI não comprova cobrança por token. Somar por etapa, unidade, rodada, onda, modelo e feature, incluindo tentativas malsucedidas e retrabalho. Comparação com outro modelo representa somente o preço aplicado ao mesmo volume observado: não prevê quantos tokens esse outro modelo consumiria nem a qualidade que entregaria. Aceitação adicional: cálculo reprodutível pela tarifa persistida, sem duplicar cache/raciocínio e sem converter medição parcial em total completo.

Próximo responsável: DEV, para implementar contratos de aceite e dependência de verificação; em seguida ajustar a geração do plano e o orçamento de contexto. Aumentar somente `max_concurrent_lanes` não resolve os achados.
