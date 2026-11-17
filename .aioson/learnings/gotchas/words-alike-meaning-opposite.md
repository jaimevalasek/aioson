---
title: "Palavras iguais, sentido oposto — e o arquivo atômico que não protegia o ciclo"
scope: [operator-memory, op-capture, project-registry, session-digest, context-health]
paths:
  - src/operator-memory/equivalence.js
  - src/operator-memory/standing.js
  - src/operator-memory/archive.js
  - src/operator-memory/decision.js
  - src/operator-memory/housekeeping.js
  - src/operator-memory/store-lock.js
  - src/operator-memory/storage.js
  - src/commands/op-capture.js
  - src/lib/project-registry.js
  - src/lib/session-digest.js
  - src/lib/terminal-text.js
  - src/commands/context-health.js
discovered_at: 2026-11-17
src: "AIOSON supervised session: revisão independente (outro modelo) da onda de memória do operador e portfólio — 14 achados reproduzidos com scripts e processos concorrentes"
status: corrigido no framework
---

# Palavras iguais, sentido oposto — e o arquivo atômico que não protegia o ciclo

## O que se sentia

"Preferir Postgres a MySQL" dito num projeto e "preferir MySQL a Postgres" dito em outro viravam **uma** decisão, ampliada para todos os projetos: o terceiro projeto recebia a preferência que o segundo usuário tinha negado. "nunca vi isso, pode fazer agora" promovia na hora uma autorização permanente de publicar. Seis sessões abrindo juntas deixavam um projeto no registro. A citação "em todos os meus projetos", dita numa repetição, sumia — e o hábito nunca aparecia.

## Medido

- Similaridade 1 entre "usar Tailwind" e "não usar Tailwind" e entre as duas preferências invertidas; 0,43 entre "commit da correção de login" e "commit da migração de pagamentos". No store real, 1 dos 4 pares ≥ 0,4 era falso (mesma moldura, "não usará" no outro).
- Uma palavra de marca em qualquer função gramatical: "nunca vi", "sempre achei", "faz agora", "this once" contavam como permanência.
- Corridas reproduzidas com processos reais: 6 → 1 projeto; 4 confirmações idênticas → 0 reforços; 2 correções equivalentes → 2 decisões; limpeza arquivando a proposta recém-renovada; `UNIQUE constraint failed: operators.identity` no primeiro uso.
- Digest com 5 hábitos: 3.625 B para orçamento de 3.072; `more` contava os hábitos já mostrados; quatro eventos de memória derrubavam a taxa de cache de 100 para 20.

## Por que passou

- **Heurística errada:** conjunto de palavras não vê polaridade, direção nem objeto. Os testes só tinham pares "iguais reescritos" e pares com identificadores diferentes — nenhum par adversarial.
- **Superfície descoberta:** escrita atômica (tmp + rename) foi tomada como proteção; ela protege o arquivo, nunca o ciclo leitura–alteração–gravação. Nenhum teste rodava dois processos.
- **Autoavaliação:** o orçamento do digest foi alegado no CHANGELOG com um teste de títulos curtos; nenhum limite final de bytes existia.

## O que impede agora

- `equivalence.js`: paridade de negação, ordem das palavras compartilhadas quando há preferência/troca, e "um só trecho trocado na mesma moldura" zeram a similaridade. Só um casamento forte (≥ 0,6) leva um sinal a um projeto onde a entrada não foi vista; abaixo disso, junta só onde a entrada já está. Outro texto que só compartilha o prefixo de 40 caracteres do slug de uma decisão ganha slug próprio (`-2`) e passa pelas guardas.
- `standing.js`: em autorização, citação limitada ao momento ("agora", "essa tarefa", "this once") nunca é prova; "sempre/nunca" seguidos de verbo de relato ("vi", "achei", "saw") não contam; frases de continuar o trabalho atual saíram das marcas. Correções não recebem o veto: o "agora" delas costuma ser a história em volta da regra (medido no store real).
- `store-lock.js`: um lock entre processos por armazenamento envolve captura, varredura, promoção, reforço e esquecimento; o registro de projetos tem o seu e relê dentro dele; a varredura relê a proposta antes de movê-la; `busy_timeout` no índice; upsert do operador.
- Reforço guarda a citação (até 5: a primeira, as que nomeiam todos os projetos, as mais novas). Decisão sem escopo é "antiga" só se promovida antes de `SCOPE_ALWAYS_WRITTEN_SINCE`; depois disso veio de um CLI mais velho e vale para todos. Adoção depende das palavras, não do contador de reforço.
- `fitBudget` aplica 3.072 B à composição final; `terminal-text.js` limpa nomes e valores de outros projetos na saída humana; taxa de cache só sobre eventos de cache.

## Regra para a próxima vez

1. Todo comparador de "mesmo sentido" precisa de pares adversariais no teste: negação, direção invertida, objeto trocado na mesma frase — além de "reescrito igual".
2. "Gravação atômica" não é "atualização segura": qualquer leitura-alteração-gravação compartilhada entre processos leva lock e relê dentro dele; o teste solta processos reais juntos, com os módulos carregados antes da barreira.
3. Orçamento declarado é medido na composição cheia, não em fixture curta.
4. Mudança de heurística sobre falas reais: medir antes/depois no store real (somente leitura) e ler cada decisão que mudou de lado.

## Diagnóstico

`node -e` com `similarity(signature(a), signature(b))` para o par suspeito; `ls ~/.aioson/operators/<id>/.store.lock` durante uma captura travada; `Buffer.byteLength` da saída de `context:digest --json`.
