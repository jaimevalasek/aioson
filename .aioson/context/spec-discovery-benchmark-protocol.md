# Benchmark de descoberta e especificação

Data: 2026-09-25. Estado: protocolo preparado; comparação semântica com modelos ainda não executada. Os testes automatizados desta correção medem roteamento, contratos e aplicação de decisões, não criatividade nem qualidade de um jogo entregue.

## Pergunta

Briefing e Refiner descobrem oportunidades úteis a partir de um pedido simples, apresentam escolhas compreensíveis e preservam as decisões até Product → Sheldon → Planner? O protótipo demonstra a experiência escolhida melhor do que uma resposta direta sob condições equivalentes?

## Condições

- A: instruções anteriores à correção, congeladas por commit e hash dos arquivos.
- B: instruções corrigidas, congeladas por conteúdo, incluindo módulos, skills e regras efetivamente carregados. Enquanto o diff não estiver commitado, registrar HEAD e o patch; HEAD sozinho não identifica B.
- C: LLM direta, com o mesmo pedido, fatos, restrições, ferramentas e entrega exigida. Usar C na comparação de protótipos; na comparação de specs, pedir também uma especificação e plano, em vez de comparar documentos com código.

Manter host, modelo, esforço e acesso às ferramentas iguais. Isolar diretórios e contexto entre candidatos; candidatos não recebem rubrica, saídas concorrentes nem resultados anteriores. Variar a ordem das condições; começar com três repetições por caso e publicar cada resultado, sem escolher a melhor tentativa. Registrar versão do CLI, pacote de instruções, prompt, decisões, artefatos e logs brutos.

Comparar primeiro Briefing/Refiner antes e depois. Só expandir alterações de instruções aos outros agentes se a evidência localizar neles uma deficiência. Product e Sheldon já consomem o scout e decisões aceitas; Planner já exige a rastreabilidade até a fase de implementação.

## Corpus de desenvolvimento

Os pedidos abaixo são entradas fixas. Expectativas são exclusivas do avaliador, nunca anexadas ao prompt do candidato. São casos de desenvolvimento públicos; nenhum deve ser apresentado como conjunto reservado depois de orientar esta correção.

| ID | Pedido inicial | O avaliador procura |
|---|---|---|
| kart | Quero um joguinho básico de corrida de kart no navegador. | Experiência de pilotar, pista legível, largada, progresso válido, resultado e reinício; alternativas relevantes como tempo ou adversário com consequências. Não exigir itens, multiplayer ou cadastro. |
| driving-toy | Quero só dirigir um carrinho por uma pista, sem corrida, pontuação, adversários ou itens. | Controles e recuperação úteis; exclusões preservadas. Não impor voltas, vitória ou placar pela semelhança com corrida. |
| platform | Quero um jogo simples de plataforma com pulo e obstáculos. | Controle, leitura do obstáculo, consequência, falha/recuperação e objetivo; oportunidades próprias de plataforma, sem copiar a lista de kart. |
| fractions | Quero uma ferramenta simples para uma criança praticar frações. | Exercício, feedback explicativo, nova tentativa e indicação de progresso; melhorias com valor pedagógico declarado como hipótese, sem gestão escolar obrigatória. |
| read-only | Quero visualizar localmente um CSV de vendas e entender os totais. Os dados não podem ser alterados. | Importação, leitura, entendimento dos totais e falhas pertinentes; nenhuma criação/edição de registros inventada. |
| board | Quero um quadro simples para organizar tarefas. | Ações e estados necessários aos objetos que a proposta realmente promete gerenciar; alternativas úteis, sem organização, membros ou administração obrigatórios. |
| settled | Altere somente o texto do botão Reiniciar para Jogar novamente no briefing aprovado. | Respeitar a correção delimitada, sem reabrir descoberta, decisões recusadas ou gerar novas funcionalidades. |
| complete | Quero um cronômetro local com iniciar, pausar e zerar. Sem histórico, contas, exportação ou notificações. | Avaliar coerência, preservar exclusões e poder concluir sem sugerir adições só para preencher uma cota. |

Antes de medir generalização, reservar novos casos de outros gêneros e domínios e congelá-los antes de qualquer rodada de ajuste. Repetir os casos acima apenas prova regressão no conjunto conhecido.

## Dois modos de avaliação

1. **Agente isolado:** fornecer a cada agente uma entrada anterior fixa, revisada e idêntica entre condições. Para Refiner, incluir um briefing com lacunas e sugestões opcionais; para Sheldon, inserir uma omissão rastreável; para Planner, usar o mesmo PRD aprovado. Esse modo localiza onde o erro nasce.
2. **Cadeia:** a saída real alimenta o próximo agente. Registrar cada transferência, escolha, perda, contradição e correção. Esse modo mede a propagação de erros e o ganho efetivo do fluxo.

No fluxo natural com review, usar um roteiro de respostas do operador previamente congelado por caso: aceitar o necessário ao objetivo, preferir a menor alternativa coerente, respeitar exclusões e adiar extensões fora delas. Registrar a escolha concreta; quando as opções não permitirem aplicar esse roteiro, registrar intervenção necessária em vez de inventar aprovação. Em teste isolado do Refiner, comparar também a escolha de uma alternativa não recomendada.

O modo autônomo de `@benchmark` é outro tratamento: pula protótipo do Refiner, resolve decisões por recomendação e pode usar a rota estática. Não misturar essas medições com o fluxo natural nem chamar decisões automáticas de aprovação humana.

## Rubrica por etapa

| Etapa | Evidência de qualidade | Falha relevante |
|---|---|---|
| Briefing | Resultado compreendido, jornada concreta, oportunidades com mecanismo/valor/custo, hipóteses separadas das fontes | Parafrasear o pedido sem descoberta, inventar pesquisa ou transformar ideia própria em promessa do usuário |
| Refiner | Revisão independente, lacunas reais e sugestões úteis convertidas em escolhas acionáveis | Só revisar forma, enterrar ideias no scout, pré-selecionar sugestão como aprovada, reabrir decisões sem motivo |
| Product | Decisões aceitas convertidas em comportamento e CAP/AC verificáveis | Importar ideias pendentes/recusadas ou omitir escolhas confirmadas |
| Sheldon | Detectar omissões e contradições, contestar valor e escopo dentro do orçamento de revisão | Aprovar incoerência ou bloquear por melhoria opcional |
| Planner | Fases viáveis, dependências, caminhos existentes quando aplicável e checagens dos comportamentos aprovados | Inventar decisão de produto, depender de arquivo inexistente ou limitar verificação à presença de documentos |

Cada dimensão recebe `atende`, `parcial`, `falha` ou `não verificável`, com trecho/caminho de evidência e justificativa. O candidato não se pontua. Avaliar às cegas quanto à condição; uma segunda pessoa revisa divergências e falhas críticas. Desrespeitar uma exclusão ou inventar aprovação é falha crítica, não compensável por mais ideias ou uma boa média.

## Protótipos e execução

Comparar a mesma entrega: protótipo local jogável versus protótipo local jogável; software final versus software final. Dar a todos o mesmo objetivo e limites, sem exigir da LLM direta obrigações ocultas nem dispensar a cadeia delas.

Para jogos, observar controles, objetivo, desafio, feedback, falha/recuperação e reinício; conforme o gênero, verificar colisões, contagem de progresso, comportamento com variação de quadros e perda de foco. Capturar console e sessões curtas de jogo. Imagens provam aparência, não dirigibilidade ou diversão. Registrar avaliações humanas de clareza, resposta e vontade de repetir separadamente dos checks funcionais.

Entregar uma amostra dos planos a uma implementação em contexto novo. Medir decisões essenciais ausentes, intervenções do operador, retrabalho e critérios de aceite efetivamente demonstrados. Esse é o teste de utilidade da spec.

## Medições e conclusão

Registrar por caso, condição e repetição: resultado por dimensão, falhas críticas, sugestões úteis/aceitas/recusadas, intervenção humana, erros herdados/corrigidos, execução observada, tempo e tokens reais. Custo não exposto permanece null. Falha de ambiente/tooling e falha de conteúdo são categorias distintas; publicar ambas sem apagar tentativas malsucedidas.

Não premiar número de ideias, documentos, telas ou linhas. O ganho procurado é benefício observável com escopo coerente. Publicar pares por caso e dispersão; uma pequena vantagem de uma única tentativa não comprova superioridade. Preservar logs e artefatos necessários para reavaliar o resultado.
