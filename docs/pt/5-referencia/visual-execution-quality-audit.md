# Auditoria de qualidade visual e execução — 05/09/2026

O trabalho recente melhorou a diversidade visual, a verificabilidade do acabamento e a operação das execuções orquestradas. A implementação tinha, porém, três lacunas entre o que era medido e o que os consumidores dessa evidência aceitavam. As três foram reproduzidas em testes e corrigidas nesta revisão.

## Escopo e evidência

Revisão dos caminhos relacionados nos commits de 28/08 a 03/09/2026, acompanhada de leitura do código atual e testes pelo verificador e pelo motor reais. Os hosts nos testes são adaptadores controlados; esta auditoria não executou uma feature completa com provedores externos nem julgou visualmente um site consumidor. Alterações locais que já existiam, incluindo o ciclo de vida de screenshots e a preservação de evidência runtime, foram mantidas.

| Frente | Commits examinados | Avaliação |
|---|---|---|
| Diversidade visual | `924a915c`, `0ce07ffa`, `a8fc2e8a` | Retirar presets, registrar a origem da paleta e eliminar exemplos que induziam repetição são avanços coerentes. Há testes para doutrina sem âncoras, sorteio, identidade e registro sem fixtures. |
| Acabamento premium | `7ca16d0b`, `2c8fd719` | Distinguir peso visual de marca da precisão de sistemas evita exigir ornamentação em toda interface. A nova nota ainda não era comparada na implementação. |
| Divisão de trabalho | `f9414455`, `3009b099` | Escala, posse de arquivos, dependências e limites de unidades tornaram a escolha de execução mais verificável. O término das unidades deixa integração e findings para o DEV responsável. |
| Recuperação e independência | `eb144771`, `e108f824` | Retomada, lease e orçamento melhoraram. A independência era verificada na configuração inicial e na decisão manual, mas não em cada fallback automático resolvido. |
| Observabilidade | `d2019d7d` | Heartbeat, atividade por unidade e acompanhamento por outro terminal tornam execuções longas investigáveis; os testes cobrem leitura transitória e processo sem heartbeat. |

## Falhas corrigidas

### 1. O acabamento podia regredir sem aparecer na comparação

`compareToPrototype` comparava presença de recursos, materiais, tipografia e outros sinais, mas ignorava `craft.weight.score` e `craft.precision.score`. Uma implementação podia conservar todos os eixos antigos e perder qualidade na nota usada para aprovar o protótipo.

Correção em `src/commands/verify-artifact.js`: os eixos graduados passam a acompanhar a comparação e o relatório persistido. Uma queda gera, por exemplo, `precision 100/100 → 71/100`. Se o protótipo tinha uma nota e a implementação não permite medir aquele eixo, a comparação é parcial e nomeia a ausência. Relatórios antigos sem nota não recebem um piso inventado; troca de modo não compara peso com precisão.

Teste: `tests/implementation-visual-autofire.test.js`, com brand, operate e read; notas isoladas em evidência de teste para provar a queda sem alterar os eixos antigos; casos de nota indisponível, mudança de modo e evidência sem score. A comparação continua advisory conforme o contrato existente.

### 2. O QA podia exceder seu orçamento e continuar aprovado

O motor já media `corrections_cap_exceeded`, mas derivava o status apenas do relatório do modelo. Um QA com `max_fix_files: 0` podia editar a tela, declarar PASS e aparecer como `qa_passed`.

Correção em `src/agent-execution/execution-run.js`: o excesso medido transforma o status efetivo em `failed`, preservando o verdict original para auditoria. Resumo, eventos, ledger e o mecanismo existente de rework consomem o status efetivo. `completed` continua significando que os pipelines terminaram, não que a feature recebeu aprovação final.

Teste: `tests/execution-run.test.js` demonstra o PASS contradito pela medição, o status failed e sua projeção no acompanhamento. As suítes existentes de rework e de correções dentro do limite continuam passando.

### 3. Um fallback automático podia fazer o implementador revisar a si mesmo

Com `require_independent_qa: true`, o revisor principal podia ser diferente do implementador, mas o fallback por capacidade trocar para o mesmo host/model do DEV. A checagem anterior ao dispatch não enxergava essa troca interna.

Correção em `src/agent-execution/dispatcher.js` e `execution-run.js`: a execução orquestrada fornece uma checagem aplicada à identidade resolvida de cada tentativa. Uma tentativa de autorrevisão é recusada antes de chamar o adaptador, registrada no histórico como `self_review_blocked` e encaminhada como decisão pendente. A opção de independência permanece opt-in.

Teste: `tests/execution-run.test.js` reproduziu o lançamento indevido; depois da correção, demonstra zero chamadas ao implementador como revisor quando a opção está ligada e preserva o comportamento permitido quando está desligada.

## Validação

- Primeiro ciclo focado: 32/32 testes aprovados após as correções visual e de orçamento QA.
- Ampliação visual/design/compilação/roteamento: 240/241 passaram na execução paralela. O único erro foi `execution-unattended.test.js`, que usa 300 ms para um subprocesso: a sonda inicial retornou timeout antes da sonda de escrita. A suíte completa desse arquivo passou isoladamente, 13/13, sem alterações. Isso indica sensibilidade ao tempo sob carga; não foi tratado como regressão corrigida.
- Após a correção de fallback: 53/53 testes de execução, rework, dispatcher, capacidade e retomada passaram.
- `npm run check:syntax`: 577 arquivos JavaScript verificados.
- `rules:check`: regras obrigatórias aprovadas; permanecem avisos de tamanho e acoplamento em módulos grandes. `git diff --check` global também aponta whitespace em alterações preexistentes de `src/cli.js`; esta revisão não as alterou.
- A suíte integral do repositório não foi executada. Os checks escolhidos cobrem os caminhos alterados e seus consumidores próximos.

## Melhorias seguintes que valem investimento

1. Avaliar entregas reais por domínio, com screenshots de desktop/mobile e tarefas completas. Usar comparação visual sem mostrar a nota ao avaliador ajuda a descobrir quando o score está premiando um resultado ainda genérico. As métricas comprovam sinais específicos, não beleza ou originalidade por si sós.
2. Calibrar o motor com exemplos aceitos e rejeitados pelo dono, reservando exemplos fora da calibração. Comparar composição, hierarquia, imagens, adequação ao domínio e usabilidade; diversidade de paleta sozinha não resolve repetição de layout.
3. Medir execuções reais até a integração e a aceitação final: regressões encontradas, retrabalho, decisões pendentes, tempo e custo. Independência por host/model é uma garantia operacional limitada, não prova de independência de julgamento.
4. Reduzir gradualmente a concentração de responsabilidades em `verify-artifact.js`, `execution-run.js` e `dispatcher.js`, preservando os contratos agora cobertos. Os avisos de tamanho/acoplamento justificam essa manutenção, mas uma reestruturação ampla não era necessária para corrigir as falhas demonstradas.


## Atualização de 07/10/2026 — diversidade das skills de design

Auditoria focada em `template/.aioson/skills/design/interface-design`, suas receitas estáticas/React alcançáveis, `design:seed` e os consumidores da telemetria visual. As correções foram autorizadas pelo dono depois da análise. Alterações locais de execução, dashboard e features sem relação com este pedido foram preservadas.

- **Direção antes da receita:** a abertura, a sequência de conteúdo e os efeitos deixam de obedecer ao mesmo hero e ao trio mesh/gradiente/tilt. Para uma página nova com liberdade estética, a skill compara brevemente alternativas em pelo menos dois aspectos estruturais e registra por que uma serve melhor ao conteúdo. Refinamentos pequenos e protótipos aprovados reaproveitam a direção existente.
- **Tokens e componentes contextuais:** exemplos auxiliares usam a identidade ou o candidato escolhido. Foram retiradas paletas literais recorrentes, prova social fictícia e regras universais de modal/grid/densidade. Técnicas de animação, semântica, acessibilidade, entrega de fontes e assets continuam disponíveis.
- **Diversidade persistida:** o sorteio considera famílias recentes de composição, material e movimento. O manifesto registra decisões declaradas separadamente da assinatura estrutural medida. A repetição pode aparecer mesmo após trocar cor e fonte; páginas acromáticas também entram no histórico. O repertório passou a 15 composições e 5 pares tipográficos compatíveis com Material, incluindo aberturas compactas, índices e acabamento por imagem.
- **Medição contextual:** seletores sem suporte no HTML deixam de comprar pontos de tipografia/material/movimento. Classes literais de estado permanecem reconhecidas. Quiet, Editorial e Technical usam critérios de hierarquia, composição, acabamento e evidência; movimento não integra a nota desses registros. Ocupação da primeira dobra continua registrada, com espaço negativo sujeito a inspeção visual. Defeitos objetivos, comportamento prometido e a nota mínima de acabamento continuam verificados.
- **Compatibilidade:** relatórios antigos continuam legíveis. A comparação com o protótipo nomeia critérios incompatíveis em vez de comparar notas de conjuntos diferentes. Projetos temporários e `--no-persist` preservam o contrato de não poluir o histórico do operador. As 16 cópias locais alteradas foram comparadas com a baseline e sincronizadas individualmente.

A reprodução inicial falhou nos quatro casos: CSS ausente aumentava o score, registros discretos não tinham critérios próprios, o histórico de composição/material/movimento não mudava o próximo sorteio e a troca de cor/fonte ocultava repetição estrutural. Os testes agora cobrem também o caminho manifesto → verificação → registro → próximo sorteio, a comparação com o protótipo e a manutenção do piso de qualidade na aprovação.

Experimento em Chromium 151, em 1280×800 e 360×740: uma fixture técnica com fonte local e imagem SVG embutida manteve pixels idênticos e score 100 antes/depois de receber uma classe de efeito ausente. A primeira dobra ocupava 23%; em Quiet essa observação ficou registrada sem exigir preenchimento artificial. Não houve findings de runtime nesses dois viewports. As capturas foram inspecionadas. Essa fixture isola o defeito de medição: sua nota não é uma avaliação de beleza.

**Limites da evidência:** o escopo CSS é lexical, não um motor de cascata/visibilidade. Seletores funcionais, nomes calculados, CSS-in-JS e a similaridade estrutural exigem confirmação no navegador. O histórico antigo sem famílias declaradas conserva suas informações, mas não ganha escolhas inventadas retroativamente. Ainda não houve comparação A/B de sites gerados por modelos com as versões antiga e nova das skills; a correção de defeitos é demonstrada, e o aumento de qualidade estética permanece uma hipótese a avaliar em entregas reais.

Para essa comparação posterior, manter brief, conteúdo/assets, modelo, configuração, ferramentas e orçamento iguais. Usar ao menos uma publicação editorial, uma página de produto físico, uma operação com dados densos e uma experiência cinematográfica com movimento explicitamente pedido. Avaliar sem revelar a versão: adequação ao domínio, hierarquia, composição, tratamento de imagens, diversidade entre projetos, leitura mobile e tarefas completas. Não usar a nota de telemetria como juiz estético.

Validação final desta atualização: **229/229 testes focados** de design, telemetria, runtime, protótipo, aprovação e conformance; **6/6 testes** de roteamento e limites de contexto/skills; sintaxe de 675 arquivos JavaScript; ESLint sem findings novos (529 na baseline); regras obrigatórias aprovadas, com 18 avisos consultivos de tamanho/acoplamento nos módulos examinados; `git diff --check` sem erros. A suíte integral do repositório não foi executada.
