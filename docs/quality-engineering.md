# Engenharia de qualidade

O AIOSON tem um especialista opcional, `@quality`, para avaliar tanto projetos consumidores quanto o próprio framework. Ele organiza medições e propõe correções com evidência. Os agentes que implementam continuam responsáveis por verificar seu trabalho, e a QA mantém a aceitação da entrega.

## Uso em projetos

```text
@quality analise a qualidade do checkout e a eficácia dos testes
aioson quality:run . --profile=product --dry-run --json
aioson quality:run . --profile=product --json
```

O perfil `product` identifica os scripts `lint` e `test` do projeto. Outras stacks podem definir comandos como arrays em `.aioson/quality.json`; veja o [contrato distribuído](../template/.aioson/docs/quality/engineering.md). Dependências são instaladas pelo processo normal do projeto. Uma ferramenta ausente aparece como `not_run`; erro de processo aparece como `error`. Nenhum dos dois é sucesso.

## Desenvolvimento do framework

Use Node 24 para as ferramentas de desenvolvimento. Os testes de compatibilidade verificam o runtime em Node 20, 22 e 24, em Linux e Windows, e Node 24 em macOS.

```text
npm ci
npm run lint
npm run test:quality
npm run quality:coverage
npm run quality:static
npm run quality:evals
npm run quality:mutations
npm run quality:benchmark
```

`npm run ci` inclui sintaxe, lint semântico, suíte completa, cobertura dos módulos de qualidade e análise estática. O lint considera dívida registrada e impede novos achados; nomes indefinidos e erros de sintaxe sempre bloqueiam. Os [baselines](../.quality/README.md) permanecem visíveis e exigem revisão para alteração.

A cobertura inicial protege os módulos de qualidade e seus comandos: mínimos de 90% para linhas, statements e funções, e 80% para branches. Esses números não representam cobertura de todo o AIOSON. A medição inclui arquivos não carregados pelos testes. O Fallow mede a árvore de produção e compara achados com a versão anterior registrada; não transforma dívida antiga em código corrigido.

O workflow periódico valida os cenários, executa cinco mutações direcionadas na implementação real e mede o custo do adaptador com aquecimento e 30 amostras. Mutações sobreviventes falham. O benchmark preserva amostras, revisão e ambiente; permanece informativo até haver uma referência estável de desempenho. Esses cinco defeitos não constituem um mutation score do repositório inteiro.

## Avaliação de agentes

O corpus inicial tem 20 exercícios de reparo: oito contratos do framework e doze regressões sintéticas de produtos. A validação confirma que o código inicial falha e as correções de referência passam. O avaliador independente compara comportamento e preservação dos dados de entrada. Sucesso declarado pelo executor não vale como nota.

Para medir um modelo, configure um adaptador externo com `quality:evals --executor=<JSON argv> --label=<modelo-harness-config> --trials=3`. A execução cria diretórios separados e registros sem sobrescrita, com hashes, ambiente e evidências por tentativa. A comparação pareada exige o mesmo corpus e avaliador, agrupa tentativas por tarefa e informa regressões e intervalo descritivo. O comando não escolhe provedor, instala SDK ou dispara chamadas pagas automaticamente.

Os exercícios são pequenos e públicos. Eles apoiam regressão do pipeline; não medem sozinhos a qualidade de um aplicativo completo nem demonstram superioridade de um modelo. Incidentes reais sanitizados e um conjunto separado de avaliação devem complementar o corpus antes desse tipo de conclusão. O piloto consumidor é uma aplicação mínima de cálculo com teste real, usado para comprovar a integração do executor.
