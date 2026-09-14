# Monitoramento local de execuções

O monitor acompanha as features orquestradas de um projeto e permite solicitar
uma recuperação explícita quando a execução está parada. Usa o estado oficial de
`execution:status`, não a tabela de tentativas de processo: uma tentativa antiga
pode continuar marcada como `running` na telemetria depois de uma interrupção.

```powershell
aioson execution:dashboard C:\dev\playapps\creator-studio --port=4181
aioson execution:dashboard . --feature=biblioteca-criativa-e-camadas
aioson execution:status . --feature=biblioteca-criativa-e-camadas --watch
```

O painel tenta `http://127.0.0.1:4181`; sem `--port`, se a porta estiver ocupada,
o sistema escolhe uma porta livre. Com `--port` explícito, uma colisão é um erro.
A URL efetiva é impressa no terminal. Cada servidor mostra somente o projeto
passado no comando, incluindo features com plano/estado de execução arquivados
em `.aioson/context/done/<slug>`. Não existe agregação automática de outros projetos.
Features antigas sem esses registros estruturados não são convertidas em execuções.
A página atualiza a cada cinco segundos e permanece aberta durante pausas,
decisões, retomadas e conclusões. Encerrar o painel não encerra os agentes.
`--json` imprime uma linha com a URL ao iniciar e o resultado ao encerrar.

O `--watch` usa uma tabela adaptada à largura do terminal, com a onda atual,
unidades ativas, falhas de QA e decisões. `--format=full` lista todas as ondas,
com uma unidade por linha; `--format=line` mantém o formato compacto existente.
Sem `--watch`, o formato padrão continua `full`. O watch de terminal encerra
quando a execução sai de `running`; o painel web acompanha também as retomadas.

## Como ler os estados

- **DEV + QA aprovados** exige aprovação nas duas etapas. DEV aprovado e QA
  reprovado não contam como unidade aceita.
- **Unidades simultâneas** corresponde a `parallel.max_concurrent_lanes`.
  Apesar do nome histórico, esse limite é compartilhado por fluxos de unidade
  `DEV → QA`. Não reserva uma vaga para backend e outra para frontend.
- **Aguardando vaga** significa que a unidade pode entrar na ordem do plano.
  Dependências e ondas anteriores aparecem como motivos próprios de espera.
- **Motor sem sinal** usa a idade do heartbeat. A interface preserva o último
  registro e deixa explícita a falta de confirmação; não declara o processo vivo.
- **Sem atividade recente** é um aviso medido, não uma prova de travamento.
  Nos motores novos, `stalled` e `unproductive` são recalculados depois de novas
  escritas. A leitura também corrige flags antigas quando há evidência recente
  de recuperação. Sem medição de disco não se afirma ausência de atividade.
- Nas execuções novas, o histórico conserva tentativas, falhas, fallbacks,
  retrabalho e continuações. Registros antigos mostram somente as etapas
  preservadas e sinalizam histórico incompleto.
- A integração e o QA final da feature continuam sob seus donos; as aprovações
  das unidades não substituem a aceitação final.

Clique numa unidade para comparar o host/modelo planejado com o registrado,
ver dependências, mensagens e ler os relatórios DEV e QA disponíveis.
Os modelos apresentados vêm do plano compilado e do registro de execução;
o monitor não consulta provedores nem certifica qual modelo um provedor usou
internamente.

O painel relê `.aioson/config/execution-roles.json` e mostra o perfil ativo.
O executor também relê esse arquivo imediatamente antes de iniciar cada novo
DEV ou QA. Uma troca não interrompe agentes em andamento: ela vale para os
próximos estágios. O estado registra `routing_profile` em cada etapa e tentativa,
preservando quais modelos realmente foram usados ao longo da execução.

Um perfil pode autorizar uma cadeia com `fallback_use: true` e
`fallback_profiles: ["roles02", "roles03"]`. Em falhas de infraestrutura —
capacidade, rate limit, créditos/cota, autenticação, conexão, indisponibilidade
do serviço ou falha do processo do harness — o executor tenta o mesmo
papel no próximo perfil habilitado e assinado. Reprovação do QA, teste falhando,
relatório inválido e defeito de implementação continuam no ciclo DEV → QA; não
trocam de modelo. O fallback é local à etapa e não altera `active_profile`.
O painel identifica o perfil alternativo enquanto ele estiver em uso.

## Corrigir e continuar execução

No Autopilot, o motor continua automaticamente após reprovações de código e
falhas técnicas recuperáveis: o limite local de retrabalho não encerra a execução.
Cada correção retorna ao DEV da área; o QA independente verifica a nova entrega
e as reproduções das falhas anteriores. `execution:run --until-complete` também
ativa e persiste esse comportamento em um run existente, inclusive com uma
decisão técnica pendente. `--bounded-recovery` restaura a recuperação limitada;
`--step` suspende a recuperação contínua naquela ativação. Autenticação ausente,
configuração inválida e decisões fora do escopo continuam sendo impedimentos
reais, nunca aprovações fabricadas.

Quando o motor está parado, o botão **Corrigir e continuar execução** prepara as
decisões pendentes e inicia `execution:run --resume` para a mesma execução.
**Tentar corrigir esta unidade** prepara somente aquela pendência; havendo outras,
o painel informa que elas ainda precisam ser resolvidas antes de iniciar o motor.
Uma execução interrompida sem decisões também pode ser retomada pelo botão.

O modelo recebe o erro anterior, achados, evidências, mensagens e notas de progresso.
Na recuperação limitada, se o QA reprovou o código após esgotar o retrabalho, o
clique autoriza mais **um ciclo DEV → QA**, preservando os relatórios anteriores.
Uma falha de processo no QA repete a revisão. O botão não troca modelos, pula QA,
aprova trabalho nem altera o plano ou o limite de contexto persistido.

O painel distingue preparação, executor iniciado e atividade confirmada. Cliques
duplicados e pedidos para uma execução antiga são recusados. Falhas de configuração,
credenciais, capacidade ou escopo podem exigir correção externa; o botão não promete
resolvê-las sozinho. Os logs ficam em `.aioson/runtime/dashboard-recovery/<id>/`.

No Autopilot, relatórios DEV ausentes, inválidos ou com identidade incorreta têm
tentativas próprias de reparo de relatório (duas no modo limitado), sem consumir o orçamento de
correções de código. Um contrato quebrado pode retornar ao produtor de outra área
quando ele é dependência direta e dono inequívoco dos arquivos: o produtor corrige,
passa novamente pelo QA e só então libera o consumidor. Dependências ambíguas ou
outros consumidores já entregues exigem análise; não se invalidam entregas silenciosamente.

## Tempo, tokens e custo

A tabela por onda separa tempo decorrido da soma do tempo dos agentes: duas
execuções simultâneas de 10 minutos somam 20 minutos de agentes, mas transcorrem
em 10 minutos. O detalhe da unidade mostra cada tentativa, host/modelo, tokens,
janela informada e orçamento de contexto. Entrada, leitura/criação de cache e
saída são separados; valores ausentes aparecem como não informados. **Entrada inclui
o cache lido**: não some novamente essa coluna. Os totais acumulam todas as chamadas
e tentativas; milhões de tokens numa onda não significam milhões numa única janela.

Clique em **Onda 1**, **Onda 2**, etc. na tabela para expandir o consumo por área,
etapa e modelo realmente usado: Backend / DEV, Backend / QA, Frontend / DEV e
Frontend / QA. Cada grupo mostra tentativas, entrada, cache, saída, total de tokens,
tempo dos agentes e custo estimado. O destaque compara modelos somando entrada e
saída, sem somar cache novamente; histórico incompleto é marcado como parcial.
O detalhamento permanece aberto durante a atualização automática.

Para carregar os preços oficiais do OpenRouter no projeto:

```powershell
aioson execution:prices . --refresh --json
```

A execução guarda a tarifa e sua data junto de cada estimativa. Para Codex com
`gpt-5.6-sol` e `gpt-6-astra`, o AIOSON usa uma tabela incorporada de preços oficiais
OpenAI Standard, verificada em 13/09/2026. Ela tem precedência sobre o catálogo
OpenRouter e não é atualizada por `execution:prices --refresh`. A composição por
modelo mostra valores, fonte e data. O painel recalcula a visualização desses
modelos, preservando o custo originalmente registrado no histórico.

São estimativas equivalentes de tokens de texto em API, não a cobrança da assinatura.
Quando falta a divisão por chamada para determinar a tarifa de contexto longo,
o painel mostra uma faixa entre tarifa base e tarifa longa. Não usa o total de
uma onda como tamanho de contexto. Taxas de ferramentas e outras modalidades de
serviço ficam fora dessa estimativa. Demais modelos continuam usando o catálogo
do provedor quando disponível; uso ou preços incompletos permanecem parciais.
Veja [política e limitações](execution-reliability.md).

## Limites do servidor

O servidor escuta em loopback. Sua única operação de escrita é a recuperação
por clique, com origem local, token da página, corpo limitado e vínculo à execução
exibida. Não aceita comandos arbitrários, cancelamento, troca de modelo ou skip.
Relatórios ficam restritos aos caminhos
registrados da feature, com verificação de caminhos reais e limite de 2 MB.
As requisições de outros sites são recusadas e a página não usa recursos externos.

## Identidade visual

O painel usa o Design-DNA **Tinta & Ouro**, variant-d da exploração
`aioson-ecosystem-identity`, fornecido pelo dono em
`C:\dev\aioson-com\.aioson\explorations\aioson-ecosystem-identity\runs\variant-d\design-dna`.
Os tokens foram incorporados ao pacote para funcionar sem esse diretório.
Pátina comunica atividade e sucesso; ouro, marca e decisões; perigo, falhas.
Os temas Tinta e Porcelana usam fontes do sistema e não dependem de rede.


O aviso de recuperação usa borda e botão amarelos destacados. Quando há duas ou mais rodadas de correção, o painel também avisa que a entrega ainda não foi aprovada, mesmo com o motor ativo. Esse aviso não é uma solicitação de confirmação: o ciclo DEV → QA continua automaticamente. Registros de workers interrompidos são preservados para retomada, mas não ocupam vagas na contagem quando o motor está parado.
