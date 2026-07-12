---
slug: agent-execution-model-resolution
classification: SMALL
gate_requirements: approved
status: approved
---

# Requisitos — Agent Execution Model Resolution

## Requisitos funcionais
- **REQ-AEMR-01 — Esforço separado:** cada agente pode declarar `reasoning_effort` opcional, distinto de `model`; ausência mantém o default do host.
- **REQ-AEMR-02 — Compatibilidade aditiva:** schema, init e merge aceitam manifestos v1 existentes e nunca sobrescrevem modelo/esforço escolhidos pelo operador.
- **REQ-AEMR-03 — Catálogo verificável:** o core consulta catálogo somente por capability do adapter. O Codex usa seu catálogo local conhecido; nenhum path livre vem do manifesto.
- **REQ-AEMR-04 — Matching determinístico:** a ordem é slug exato → forma/nome normalizado inequívoco → alias/sufixo inequívoco → aproximação conservadora inequívoca. Versões numéricas informadas não podem ser trocadas por fuzzy match.
- **REQ-AEMR-05 — Falha segura:** zero candidatos, empate, baixa confiança, catálogo malformado ou esforço incompatível produzem motivos distintos antes do spawn e candidatos acionáveis quando existirem.
- **REQ-AEMR-06 — Fallback legado:** sem catálogo confiável, `configured-default` e slugs literais seguem como não verificados; entradas que dependem de correção aproximada não são adivinhadas.
- **REQ-AEMR-07 — Execução nativa:** Codex external recebe modelo e `model_reasoning_effort` em argv/config separados, com `shell:false` e prompt em stdin. `configured-default` omite `--model`.
- **REQ-AEMR-08 — Capacidade por candidato:** o esforço é validado novamente para cada fallback autorizado; resolução de nome nunca autoriza troca de host, família, versão ou esforço.
- **REQ-AEMR-09 — Auditabilidade:** show, verification plan, state, report e telemetria preservam solicitado/resolvido, esforço, estratégia e metadados sanitizados da fonte; dispatch não reescreve o manifesto ativo.
- **REQ-AEMR-10 — UX/documentação:** validação e show explicam resolução, ambiguidade e suporte variável por conta/modelo, com exemplo `gpt-5.6-terra` + `high`.

## Regras do resolver
- Normalização altera somente representação: case, Unicode compatível, espaços e separadores. Números permanecem tokens obrigatórios quando informados.
- Alias curto precisa identificar exatamente um item do catálogo; termos genéricos como `gpt` nunca resolvem.
- Aproximação exige um vencedor dentro do limite e margem sobre o segundo candidato; empate bloqueia.
- Idade do catálogo é registrada. O MVP não inventa disponibilidade em tempo real nem promete que catálogo implica entitlement.
- Arquivo de catálogo excedente, JSON inválido ou shape inesperado degrada para `catalog_unavailable`, nunca para crash ou leitura arbitrária.

## Critérios de aceitação
- **AC-AEMR-01:** manifesto antigo sem `reasoning_effort` valida, faz merge e executa sem mudança de argv.
- **AC-AEMR-02:** enum aceita `low|medium|high|xhigh|max|ultra`; qualquer outro valor falha no JSON path do agente antes do spawn.
- **AC-AEMR-03:** `gpt-5.6-terra` em catálogo resolve por `exact_slug` para o mesmo slug.
- **AC-AEMR-04:** `GPT 5.6 Terra` resolve por normalização para `gpt-5.6-terra`.
- **AC-AEMR-05:** alias `terra` resolve somente quando há um único Terra no catálogo; duplicidade bloqueia com `ambiguous_model` e candidatos ordenados.
- **AC-AEMR-06:** typo conservador como `gpt-5.6-tera` resolve quando é vencedor único; empate, termo genérico ou mudança numérica bloqueia.
- **AC-AEMR-07:** zero candidato em catálogo disponível falha `model_not_found` sem chamar adapter/spawn.
- **AC-AEMR-08:** catálogo ausente, grande demais, inválido ou com shape incompatível não vaza conteúdo e preserva somente literal/`configured-default` como `unverified_literal`.
- **AC-AEMR-09:** Codex + Terra + high gera `exec --model gpt-5.6-terra -c model_reasoning_effort="high" -`, com elementos separados, `shell:false` e stdin.
- **AC-AEMR-10:** `configured-default` + xhigh omite `--model` e inclui somente o override do esforço.
- **AC-AEMR-11:** esforço não anunciado pelo modelo retorna `unsupported_reasoning_effort`; nenhum nível alternativo é aplicado.
- **AC-AEMR-12:** host/modo sem capability de esforço retorna erro explícito e não ignora o campo.
- **AC-AEMR-13:** cada fallback autorizado é resolvido/validado separadamente; fallback incompatível não é executado e fallback não autorizado continua proibido.
- **AC-AEMR-14:** show, state, report e telemetria distinguem requested/resolved/strategy/effort sem persistir prompts, credenciais ou o conteúdo bruto do catálogo.
- **AC-AEMR-15:** resume preserva a resolução registrada da attempt e continua bloqueando digest incompatível; não re-resolve silenciosamente uma attempt ativa.
- **AC-AEMR-16:** init/update mantém paridade entre schema distribuído e workspace e documenta modelo/esforço separados.
- **AC-AEMR-17:** testes adversariais provam que valores de modelo/esforço não viram command string e que paths do catálogo não são controlados pelo manifesto.
- **AC-AEMR-18:** a suíte focada e a suíte completa passam sem depender de rede nem de um slug privado fixo; fixtures usam catálogo temporário.

## Fora de escopo
Ranking por preço/desempenho, consulta de entitlement em tempo real, fallback implícito, mutação do config global e suporte especulativo a esforço em outros hosts.
