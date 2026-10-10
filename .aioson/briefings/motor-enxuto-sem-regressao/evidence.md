# Evidências da auditoria externa — 06/10/2026

Base: `404fd259` e working tree local da sessão. Estes resultados não certificam a suíte completa, uma release ou qualidade preservada após mudanças futuras. Nenhum arquivo de produção foi alterado pela auditoria.

## Verificações executadas

- `aioson context:validate . --json`: válido.
- `compress:agents` com `--dry-run`, restrito aos sete prompts centrais: sete pulados pelo limiar arredondado de 2%; `totalSaved: 0`. Nenhum arquivo foi comprimido.
- Contagem direta de arquivos/caracteres com Node. A estimativa caracteres/4 não é tokenização nem custo faturado.
- `op:list --json --titles-only`: 478 entradas; JSON reserializado com indentação de dois espaços, 176.563 caracteres. Somente agregados são registrados aqui, sem conteúdo privado de memórias.
- Testes abaixo: 177 passaram, zero falhas, zero skips, cerca de 66,5 segundos.

```powershell
node --require ./tests/setup/windows-fs-retries.js --test --test-concurrency=2 --test-reporter=spec tests/agent-retirement.test.js tests/feature-registry.test.js tests/workflow-binding-registry.test.js tests/dependency-inference.test.js tests/schedule-projection.test.js tests/execution-jev.test.js tests/execution-contract-repair.test.js tests/execution-run.test.js tests/context-evals-shipped.test.js tests/agent-contracts.test.js
```

Os casos de Jev/execução usam fixtures e injeções controladas. Não houve execução de trabalhadores LLM reais para comparar prompts, medição de acurácia do Jev externo, avaliação de interface em browser ou teste completo de instalação nesta auditoria.

## F1 — Atualizações concorrentes perdem uma linha

Prioridade sugerida: alta para uso com sessões simultâneas. `writeFeatureRow` faz read → parse → upsert → write sem exclusão mútua da transação. Escrever por arquivo temporário/rename ajuda contra gravação parcial, mas sozinho não evita perda por concorrência.

Sonda executada no processo Node com o módulo real e filesystem substituído apenas em memória:

```javascript
const path = require('node:path');
const fs = require('node:fs/promises');
const { writeFeatureRow, parseFeatureRegistry } = require('./src/lib/feature-registry');
const seed = '# Features\n\n| slug | status | started | completed |\n|---|---|---|---|\n| base | planning | 2026-10-06 | - |\n';
(async () => {
  const original = { readFile: fs.readFile, writeFile: fs.writeFile, mkdir: fs.mkdir };
  const root = path.resolve('C:/virtual-aioson-audit-fixture');
  const file = path.join(root, '.aioson/context/features.md');
  let content = seed, reads = 0, release;
  const bothRead = new Promise(resolve => { release = resolve; });
  fs.readFile = async p => {
    if (p !== file) throw new Error('unexpected path');
    const snapshot = content;
    if (++reads === 2) release();
    await bothRead;
    return snapshot;
  };
  fs.mkdir = async () => undefined;
  fs.writeFile = async (p, text) => {
    if (p !== file) throw new Error('unexpected path');
    content = text;
  };
  try {
    const results = await Promise.all([
      writeFeatureRow(root, { slug: 'alpha', status: 'planning' }),
      writeFeatureRow(root, { slug: 'beta', status: 'planning' })
    ]);
    console.log(results.map(r => r.written), parseFeatureRegistry(content).rows.map(r => r.slug));
  } finally { Object.assign(fs, original); }
})();
```

Esperado: ambas as linhas novas preservadas. Observado: ambos os retornos `written: true`; linhas finais `base, beta`; `alpha` perdida. Zero escritas em disco. Prova um interleaving possível; não mede frequência em produção. Recomendação: serializar a transação de todos os escritores do índice e testar concorrência entre processos.

## F2 — Título de nota desaparece

Prioridade sugerida: média. Depois da tabela de `seed`, acrescentar:

```markdown
# Decisao de compatibilidade
Preservar o formato antigo.
```

Executar `parseFeatureRegistry` e `serializeFeatureRegistry(parsed, { keepNotes: parsed.notes })`. Observado: `headingPreserved: false`, `bodyPreserved: true`. A regex de linhas geradas reconhece qualquer H1 como descartável. Recomendação: distinguir cabeçalhos produzidos pelo serializer de conteúdo legado. Um backup em `feature:tidy` reduz dano, mas não torna a migração semanticamente sem perdas; `writeFeatureRow` também usa esse parser.

## F3 — Projeção por lanes ignora dependência explícita

Prioridade sugerida: média. Afeta diagnóstico e decisão de paralelismo; não foi demonstrado que o scheduler real execute fora da dependência.

```javascript
const { projectSchedule } = require('./src/agent-execution/schedule-projection');
const plan = { parallel: { max_concurrent_lanes: 2 }, units: [
  { id: 'producer', owner: 'lane', lane: 'backend', wave: 1,
    files: ['src/producer.js'], depends_on: [] },
  { id: 'consumer', owner: 'lane', lane: 'frontend', wave: 2,
    files: ['src/consumer.js'], depends_on: [{ unit: 'producer', gate: 'after_qa' }] }
] };
console.log(projectSchedule(plan, { devMinutes: 2, qaMinutes: 3 }));
```

Observado: `waves: 10`, `lanes_after_qa: 5`, `lanes_after_dev: 5`, `file_ceiling: 5`. A dependência entre lanes exige 10 minutos para as políticas executáveis sob as mesmas durações, mesmo com arquivos distintos. O `file_ceiling` é deliberadamente um limite ideal. O runtime lê `depends_on` em `execution-run.js:2624`; a projeção lê ondas/predecessores de lane e não lê essa lista. Recomendação: compartilhar a semântica pura de dependências e manter explícitas as aproximações de duração, fila e integração.

## Revisão externa das conclusões

Passagem 1: separar fatos observados, propostas e hipóteses; conferir que a aposentadoria já existe; não atribuir os 177 testes à eficácia de prompts novos; atualizar a pesquisa a partir das páginas primárias, pois o resumo de busca do primeiro estudo estava desatualizado em relação à versão 3.

Passagem 2: considerar uso com duas sessões, retomada, falha do seletor, mudança de arquivos após aprovação e reversão do candidato. Manter controles de integridade, explicitar invalidação de evidência e separar correções da baseline do experimento de redução. A comparação comportamental permanece não executada.

## Correções autorizadas e skill externa — 2026-10-06

Após o pedido de criar uma skill de manutenção e aplicar as correções, F1–F3 foram corrigidos no código, sem ativar agentes do AIOSON ou avançar o workflow da feature `execution-roles-onboarding`.

- **F1:** `src/lib/feature-registry-storage.js` serializa a transação entre processos e substitui arquivos atomicamente. Registro e limpeza usam o mesmo lock; um dono vivo não perde o lock por tempo, e um processo encerrado pode ser recuperado. A data inicial e os metadados de criação/status anterior são resolvidos dentro da transação. Erros de leitura deixam de parecer arquivos ausentes; backups da limpeza recebem nomes distintos mesmo no mesmo segundo.
- **F2:** o parser descarta apenas o H1 canônico `# Features`, preservando títulos personalizados das notas. Testes cobrem reescritas sucessivas e a realocação para o arquivo de notas.
- **F3:** a projeção aplica as dependências explícitas e seus gates antes das barreiras implícitas. O caso reproduzido passa a estimar 10 minutos nas três políticas executáveis; o limite ideal por arquivos continua em 5. Ciclos inválidos falham com diagnóstico em vez de causar loop infinito. As aproximações de duração uniforme, filas e integração continuam existindo.
- **Documentação:** `template/.aioson/config.md` e seu espelho local distinguem metas internas de tamanho de limites do provedor. Removida a alegação de truncamento silencioso universal em 4.000 caracteres; a documentação primária permanece ligada no texto.

Skill instalada em `C:/Users/jaime/.codex/skills/aioson-audit/`: entrada de 68 linhas, referência carregada conforme a auditoria e um inventário somente de leitura. Abrange motor, CLI, instalação, compatibilidade, contexto, prompts, especialistas, dependências e comparação de qualidade. A instalação é pessoal, externa ao template entregue aos usuários do framework. Execução por chamada, sem agendamento criado.

Validação realizada no Windows:

- Rodada ampliada: **176 testes aprovados**, cobrindo registro, roteamento por feature, projeção, inferência de dependências, compilação, runtime e reparo de contratos.
- Após mover também a leitura de data/status para a transação, rodada final de registro, fechamento, arquivamento, distilação e vínculo de workflow: **95 testes aprovados**. Há sobreposição entre as rodadas; os números não representam testes únicos somados.
- `npm run lint`: 1.227 arquivos, zero achados novos; lint adicional dos cinco arquivos alterados depois dessa rodada também aprovado.
- `npm run check:syntax`: 674 arquivos aprovados; as alterações posteriores nos comandos e no registro foram carregadas pelos testes finais e verificadas pelo lint.
- Skill: `quick_validate.py` aprovado; metadados e quatro arquivos conferidos como UTF-8. Dois testes do inventário passaram: repositório real sem alteração de `git status`; fixture com espaços no caminho, detecção de espelho diferente e rejeição de um projeto consumidor. Nenhum código do projeto foi executado pelo inventário.

Esses resultados verificam as correções determinísticas. Não houve execução de um experimento de redução de prompts, atualização indiscriminada de dependências ou avaliação comparativa com LLMs. As hipóteses de simplificação continuam candidatas até essa comparação; não se declara garantia absoluta de ausência de regressões.
