---
feature: harness-retrospective-optimization
classification: SMALL
created_at: 2026-06-10
created_by: analyst
prd_source: prd-harness-retrospective-optimization.md
briefing_source: harness-retrospective-optimization
---

# Requirements — Harness Retrospective Optimization (RHO-lite)

## 1. Resumo da feature

Fechar o loop de melhoria do harness: `aioson harness:retro` minera deterministicamente a trilha de falhas já coletada e materializa um dossiê retrospectivo em `.aioson/context/retro/{slug}.md`; @sheldon analisa sob demanda e propõe deltas que aterrissam nos canais existentes (`.aioson/learnings/`, `.aioson/rules/`). Should-have: helper `previewArtifact` (preview + ponteiro) para outputs grandes em 2 pontos de adoção.

## 2. Evidência de discovery (resolve Open Questions do PRD)

### OQ-3 — Inventário de classes de erro recorrentes (mineração manual, 2026-06-10)

Mineradas 19 features (15 em `done/` + 4 ativas): **67 findings, 18 classes de falha, 10 recorrentes (≥2 ocorrências)**. ~65% dos findings pertencem a classes recorrentes — o critério "≥2 ocorrências" do PRD está validado com folga e o Tema 1 tem matéria-prima real.

Classes recorrentes (nome + ocorrências confirmadas):

| Classe | Ocorr. | Exemplos (feature / finding) |
|---|---|---|
| feature-implemented-but-not-wired | 3 | agent-chain-continuity C-01; deyvin-subtask-scout M-01; active-learning-loop ph5 M-01 |
| doc-code-spec-drift | 4 | sdlc-process-upgrade M-01; active-learning-loop ph2/ph5 M-01; feature-dossier M-01 |
| path-containment-fail-open | 3 | living-memory H-01; deyvin-subtask-scout L-01; deyvin-density L-01 |
| exit-code-contract-collapsed-in-json-mode | 2 | secure-by-default C-01; deyvin-subtask-scout O-01 |
| test-mocks-unrealistic-input | 2 | deyvin-subtask-scout C7; active-learning-loop ph2 H-01 |
| toctou-race-in-parallel-execution | 2 | living-memory M-01; active-learning-loop ph5 L-01 |
| silent-failure-cascade-on-edge-case | 1 Critical | deyvin-subtask-scout C-01 |
| security-heuristic-false-positives | 1 Critical | secure-by-default C-02 |
| review-contract-validation-incomplete | 1 Critical | secure-by-default ph4 C-01 |
| unbounded-payload-read | 1 | living-memory L-01/L-02 |

Três dessas classes viram requisitos diretos desta feature (ver §7): exit-code em `--json`, path-containment de slug, wiring do comando no dispatch/help.

### OQ-4 — Distribuição de tamanho de outputs (medição local, 2026-06-10)

| Output | Medição |
|---|---|
| Log completo da suíte (`npm test`, 3105 testes) | **247.526 bytes (~242KB ≈ 62k tokens chars/4)** |
| QA reports (n=19) | avg 7,2KB; max 15,5KB; 7/19 > 8KB |
| Specs (n=23) | avg 16,7KB; max 50,9KB; 17/23 > 8KB |
| Corrections plans (n=11) | avg 5,2KB; max 14,1KB; 2/11 > 8KB |
| Dossiers (n=4) | avg 6,5KB; max 10,1KB |

**Default de 8KB confirmado com evidência local**: captura os outputs-monstro (test log = 30x o threshold; preview = 3,3% do integral) sem afetar artefatos manuais típicos (avg 5–7KB).

### Estado real das fontes de mineração (verificado nesta sessão)

| Fonte | Disponibilidade hoje | Implicação |
|---|---|---|
| QA reports | 19 arquivos (4 ativos + 15 em `done/{slug}/`) | fonte primária |
| Corrections plans | 11 (`.aioson/plans/{slug}/` + `done/{slug}/plans/`) | fonte primária |
| Dossier Agent Trail | 4 dossiês; entradas estruturadas com verdict FAIL/PASS | fonte primária p/ ciclos FAIL→PASS |
| `execution_events` (aios.sqlite) | 987 linhas, 23 event_types; **`token_count` NULL em 100% das linhas** | custo por tokens indisponível hoje — fallback obrigatório (REQ-4) |
| `attempts/{n}/` | **0 instâncias** (estrutura definida em `src/harness/attempt-artifacts.js`, nunca populada) | parser pronto, tolerar ausência |
| `progress.json` failure_signatures | existe (loop-guardrails), array vazio hoje | chave de agrupamento exata quando popular |
| Devlogs `aioson-logs/` | diretório existe, **vazio** | fonte best-effort |

## 3. Novas entidades (contratos de dados — não há DB de aplicação)

### 3.1 Dossiê retrospectivo — `.aioson/context/retro/{slug}.md` (resolve OQ-1 do PRD)

Markdown com frontmatter YAML:

```yaml
---
feature: {slug}            # ou window: last-{N} no modo janela
generated_at: {ISO 8601}
generated_by: harness-retro
schema_version: "1.0"
features_mined: [{slug}, ...]
sources:                   # contagem por fonte (0 é válido)
  qa_reports: N
  corrections: N
  dossier_trail: N
  execution_events: N
  attempts: N
  failure_signatures: N
  devlogs: N
candidates: N
observations: N
---
```

Seções (ordem fixa, todas sempre presentes — vazias com placeholder):

1. `## Propostas candidatas` — somente itens que atendem o critério anti-opinião (REQ-2). Por candidato: chave determinística (assinatura sha1 OU finding High/Critical OU ciclo FAIL→PASS repetido), lista de ocorrências `(feature, finding-ID, severidade, data, fonte com path, status)`, correções aplicadas (link ao corrections plan), custo de retrabalho (REQ-4).
2. `## Observações` — ocorrências únicas Medium/Low, uma linha cada (apêndice; nunca promovidas pela CLI).
3. `## Trilha minerada` — inventário por fonte: paths lidos, contagens, fontes ausentes/ilegíveis com aviso explícito (ex.: `attempts/: 0 diretórios`).
4. `## Próximo passo` — texto fixo orientando a ativação de @sheldon sob demanda com o path do dossiê e o critério de promoção (REQ-5).

Agrupamento: **por chave determinística exata, nunca por classe semântica** — classificação semântica (ex.: "feature-implemented-but-not-wired") é trabalho do @sheldon na análise, citando as ocorrências do dossiê. Ocorrências são ordenadas por severidade (critical→low) e depois data. Finding-ID NUNCA agrupa entre features (C-01 existe em quase toda feature) — a chave inclui sempre o slug.

### 3.2 Registro de finding normalizado (estrutura interna do miner, não persistida)

| Campo | Tipo | Nullable | Regras |
|---|---|---|---|
| source_type | enum | não | qa_report, corrections, dossier_trail, execution_events, attempts, progress, devlog |
| feature_slug | string | não | sanitizado `[a-z0-9-]` |
| finding_id | string | sim | regex `[A-Z]{1,2}-\d{1,2}` (H-01, C-01, M-01, L-01, O-01, SF-01) |
| severity | enum | não | critical, high, medium, low, info, **unknown** (casing normalizado; severidade não reconhecida = unknown e nunca promove) |
| title | string | não | primeira linha do finding, truncada em 200 chars |
| file_ref | string | sim | path+linha quando o finding cita `File:`/`Location:` |
| date | string | sim | ISO da fonte (frontmatter `date:`/`created:` ou timestamp do trail) |
| status | enum | não | open, fixed, residual, unknown (de corrections `status:`/`resolved_at` e verdicts do trail) |
| source_path | string | não | path relativo do arquivo minerado |
| signature | string | sim | sha1 quando vier de failure_signatures/attempts |

### 3.3 `previewArtifact` — contrato do helper (Tema 2, should-have)

`src/harness/preview-artifact.js`:

```
previewArtifact(content, { maxBytes = 8192, artifactPath, label })
  → { preview, truncated, fullPath, totalBytes }
```

- Persist-first: quando `artifactPath` é dado, grava o conteúdo INTEGRAL em disco antes de gerar o preview.
- `content` ≤ maxBytes → `preview` = conteúdo integral, `truncated: false`.
- `content` > maxBytes → `preview` = primeiros maxBytes cortados em boundary UTF-8 seguro + linha-ponteiro padrão: `[preview: primeiros {maxBytes} de {totalBytes} bytes — completo em {fullPath}]`.
- Falha de escrita → não lança: retorna preview truncado + `fullPath: null` + aviso (best-effort, mesmo padrão de `attempt-artifacts.js`).
- Threshold configurável pelo caller; default 8192 (evidência §2 OQ-4).

## 4. Mudanças em entidades/arquivos existentes

| Alvo | Mudança | Paridade template |
|---|---|---|
| `src/cli.js` | registrar `harness:retro` no dispatch + bloco de usage/help (classe "not-wired" — verificação explícita em AC) | n/a (source) |
| `template/.aioson/agents/sheldon.md` → sync `.aioson/agents/` | nova seção on-demand "Retro dossier analysis": ler `retro/{slug}.md`, propor deltas SOMENTE com evidência citada do dossiê; promoção de Observação a proposta exige nomear ≥2 ocorrências; aterrissagem exclusiva em `.aioson/learnings/` / `.aioson/rules/`; aprovação humana sempre | template-first + `npm run sync:agents` |
| `template/.aioson/rules/aioson-context-boundary.md` (+ workspace) | adicionar `retro/{slug}.md ← harness:retro` à lista de artefatos válidos | template-first |
| `.aioson/context/project-map.md` | registrar `.aioson/context/retro/` | workspace |
| `src/commands/self-implement-loop.js` (Tema 2) | reporte de checks falhos passa por `previewArtifact` apontando para `attempts/{n}/checks/{id}.log` | n/a |
| `template/.aioson/agents/qa.md`, `tester.md` (Tema 2) | instrução: capturar log de teste em arquivo e consumir via verbo de preview (§5.2) | template-first |
| i18n `src/i18n/{en,pt-BR,es,fr}.json` | novas chaves com prefixo `cli.` (gotcha conhecido: sem o prefixo, `t()` loga a chave crua) | n/a |

**Sem mudanças em**: schema SQLite (nenhuma tabela/coluna nova), fluxos existentes de workflow/gates, stores de memória (constraint "zero store novo").

## 5. Especificação CLI

### 5.1 `aioson harness:retro [path] --feature=<slug> | --last=<N> [--json] [--locale=<l>]`

- `--feature=<slug>`: minera 1 feature → `.aioson/context/retro/{slug}.md`.
- `--last=<N>`: minera as N features fechadas mais recentes → `.aioson/context/retro/window-last-{N}.md`. Ordenação determinística por data de PASS (frontmatter dos QA reports / verdict do trail); feature sem data ordenável é excluída com aviso na Trilha minerada. `N` > features disponíveis → minera todas + aviso.
- `--feature` + `--last=N` combinados: janela = slug + (N−1) features fechadas anteriores.
- Fontes mineradas por feature, em locais ativos E arquivados: `.aioson/context/` + `.aioson/context/done/{slug}/` (+ `done/{slug}/plans/`), `.aioson/plans/{slug}/`, `.aioson/context/features/{slug}/dossier.md`, `aios.sqlite` (readonly), `aioson-logs/`.
- Re-execução sobrescreve o dossiê (idempotente; versionamento via git).
- Exit codes: `0` sucesso (inclusive dossiê vazio); `1` erro de I/O inesperado; `12` erro de input (slug inválido, flags conflitantes). **`--json` preserva o exit code** (classe recorrente exit-code-collapsed — guard explícito).
- Sem LLM, sem rede, leitura-apenas sobre as fontes; única escrita: `.aioson/context/retro/`.

### 5.2 Verbo de preview para @qa/@tester (Tema 2)

`aioson harness:preview <file> [--max-bytes=8192] [--json]` — lê arquivo já persistido (ex.: log de `npm test > arquivo`), devolve preview + ponteiro via `previewArtifact`. Os prompts de @qa/@tester passam a instruir: redirecionar output de teste para arquivo e consumir via este verbo. (Forma final do verbo confirmável por @architect; a necessidade comportamental — preview+ponteiro acessível aos agentes de teste por entrada CLI determinística — é requisito.)

## 6. Relacionamentos e migrações

- Sem entidades de banco; sem migrações. (Contrato feature-mode: N/A — projeto é CLI sobre filesystem/SQLite read-only.)
- Relação com features existentes: consome artefatos produzidos por loop-guardrails (attempts, failure_signatures, progress.json), cross-tool-project-knowledge (learnings/INDEX.md como canal de aterrissagem) e feature-dossier (Agent Trail como fonte).

## 7. Regras de negócio

- **REQ-harness-retrospective-optimization-1** — Mineração 100% determinística: nenhuma chamada LLM, nenhuma classificação semântica na CLI; agrupamento apenas por chaves exatas (assinatura sha1, severidade, slug+finding-ID, ciclos FAIL→PASS do trail).
- **REQ-harness-retrospective-optimization-2** — Critério anti-opinião: item entra em "Propostas candidatas" SOMENTE com (a) ≥2 ocorrências da mesma chave determinística, OU (b) ≥1 finding de severidade High/Critical, OU (c) ≥2 ciclos FAIL→PASS na mesma feature. Todo o resto vai para "Observações". Severidade `unknown` nunca promove.
- **REQ-harness-retrospective-optimization-3** — Degradação graciosa: fonte ausente, vazia, ilegível ou DB lockado nunca é erro fatal — vira linha de aviso em "Trilha minerada"; dossiê vazio com exit 0 é saída válida.
- **REQ-harness-retrospective-optimization-4** — Custo de retrabalho: sempre por contagens (eventos, correções, ciclos FAIL→PASS, bytes de corrections); estimativa em tokens SOMENTE quando `execution_events.token_count` não-nulo existir na janela (hoje: 0 linhas — nunca inventar tokens).
- **REQ-harness-retrospective-optimization-5** — Fronteira CLI/agente: a CLI minera e materializa; análise e proposta de deltas são exclusivas do @sheldon sob demanda; propostas aceitas aterrissam apenas em `.aioson/learnings/` e `.aioson/rules/`; auto-aplicação proibida; aprovação humana obrigatória.
- **REQ-harness-retrospective-optimization-6** — Zero store novo: nenhum banco, tabela, coluna ou store JSON novo; dossiês são Markdown em `.aioson/context/retro/` (boundary Markdown-first respeitado, regra atualizada).
- **REQ-harness-retrospective-optimization-7** — Retrocompatibilidade total: comando e diretório novos; nenhum comportamento existente muda sem opt-in; Tema 2 pode ser cortado sem afetar Tema 1.
- **REQ-harness-retrospective-optimization-8** — Sanitização de path: slug validado contra `^[a-z0-9][a-z0-9-]*$` antes de qualquer join; traversal rejeitado com exit 12 sem tocar o filesystem (classe recorrente path-containment — fail-closed).
- **REQ-harness-retrospective-optimization-9** — i18n: toda string de usuário via `t()` com chaves prefixadas `cli.`, nos 4 locales (en, pt-BR, es, fr).
- **REQ-harness-retrospective-optimization-10** — previewArtifact persist-first: conteúdo integral em disco ANTES do preview; falha de escrita degrada (best-effort) sem quebrar o caller; corte em boundary UTF-8 seguro.
- **REQ-harness-retrospective-optimization-11** — Paridade inception: mudanças em agentes e regras nascem em `template/` e sincronizam para o workspace (`npm run sync:agents`); drift é bug.

## 8. Critérios de aceite

- **AC-harness-retrospective-optimization-1** — `aioson harness:retro . --feature=loop-guardrails` gera `retro/loop-guardrails.md` contendo: C-01 (High) como candidato; C-02/C-03/O-01..O-04 como observações ou candidatos conforme critério; 1 ciclo FAIL→PASS do trail com datas; custo por contagens; frontmatter conforme §3.1. (= piloto do PRD)
- **AC-harness-retrospective-optimization-2** — Em projeto/fixture sem trilha: dossiê com todas as seções presentes e vazias, "Trilha minerada" com contagens 0, exit 0, sem stack trace.
- **AC-harness-retrospective-optimization-3** — `--json` com erro de input retorna exit 12 (não 1 genérico); verificado por teste binário.
- **AC-harness-retrospective-optimization-4** — Duas execuções consecutivas sem mudança nas fontes produzem dossiês idênticos exceto `generated_at`.
- **AC-harness-retrospective-optimization-5** — Finding Medium com 1 ocorrência aparece em Observações e NUNCA em Propostas candidatas (teste com fixture).
- **AC-harness-retrospective-optimization-6** — Assinatura sha1 presente ≥2x em `progress.json`/attempts da janela vira candidato com lista de ocorrências (fixture).
- **AC-harness-retrospective-optimization-7** — Feature arquivada em `done/{slug}/` é minerada igual a ativa (QA reports + corrections em `done/{slug}/plans/`).
- **AC-harness-retrospective-optimization-8** — Slug com traversal (`../x`) → exit 12, mensagem clara, nenhum arquivo criado.
- **AC-harness-retrospective-optimization-9** — `harness:retro` listado no usage do CLI e despachado (guard da classe not-wired); chaves i18n `cli.*` presentes nos 4 locales.
- **AC-harness-retrospective-optimization-10** — `--last=2` produz `window-last-2.md` com as 2 features fechadas mais recentes por data de PASS; N acima do disponível minera todas com aviso.
- **AC-harness-retrospective-optimization-11** — sheldon.md (template + workspace, em paridade) contém o modo "Retro dossier analysis" com critério de promoção e canais de aterrissagem.
- **AC-harness-retrospective-optimization-12** (T2) — `previewArtifact` com conteúdo > maxBytes grava integral e retorna preview de maxBytes + ponteiro padrão; ≤ maxBytes retorna integral com `truncated: false` (testes unitários).
- **AC-harness-retrospective-optimization-13** (T2) — Checks falhos do `self:loop` reportam preview + path de `attempts/{n}/checks/{id}.log` em vez de dump integral.
- **AC-harness-retrospective-optimization-14** (T2) — `aioson harness:preview <file>` funciona sobre arquivo de log real; prompts de @qa/@tester atualizados em template + workspace.
- **AC-harness-retrospective-optimization-15** — Suíte completa permanece verde (baseline desta sessão: 3104/3105 pass, 1 skipped, 0 fail).
- **AC-harness-retrospective-optimization-16** — Nenhum arquivo não-Markdown novo em `.aioson/context/`; `aioson-context-boundary.md` atualizado listando `retro/{slug}.md`.

## 9. Edge cases

1. `aios.sqlite` ausente/corrompido/lockado → fonte pulada com aviso na Trilha minerada (REQ-3); abrir sempre readonly.
2. QA report sem frontmatter ou em formato livre → findings extraídos por regex de IDs; sem IDs reconhecíveis, conta como documento minerado sem findings.
3. Idiomas mistos (pt-BR/en) e severidade com casing variado (`High`/`high`/`critical: 0`) → normalização case-insensitive; não reconhecida → `unknown` (nunca promove).
4. Feature com QA multi-phase (active-learning-loop: 5 reports) → todas as phases mineradas; finding-ID duplicado entre phases desambiguado com sufixo de phase.
5. Mesmo finding-ID em features diferentes → nunca agrupado (chave inclui slug).
6. `--feature` de feature inexistente → exit 12 com mensagem listando onde procurou.
7. `.aioson/context/retro/` inexistente → criado on-demand.
8. Dossiê pré-existente → sobrescrito sem prompt (idempotência; histórico via git).
9. Trail do dossiê com entradas corrompidas (sem timestamp/sha marker) → entrada ignorada com contagem de "entradas ilegíveis" na Trilha minerada.
10. previewArtifact: `content` não-string → coerção segura ou retorno vazio com aviso; `maxBytes` inválido → default 8192; corte nunca quebra caractere multi-byte.
11. Window `--last=N` com features sem data de PASS determinável → excluídas com aviso nominal.
12. Tema 2 cortado por orçamento → Tema 1 inteiro permanece entregável (nenhuma dependência mecânica; AC-12..14 caem juntos).

## 10. Fora de escopo desta feature

- RHO completo (re-rollouts, DPP coreset, self-preference) — LLM no loop da CLI.
- Auto-aplicação de deltas sem aprovação humana.
- Agente novo dedicado a retrospectivas.
- Trigger automático em `feature:close` (evolução futura condicionada ao piloto).
- Store de memória novo; tiering de `context:pack`/handoff injection.
- Backfill de `execution_events.token_count` (a coluna segue como está; o retro apenas a consome quando houver dado).
- Classificação semântica de classes de falha na CLI (pertence ao @sheldon).

## 11. Ambiguidades documentadas (não silenciadas)

- Forma final do verbo de preview p/ @qa/@tester (`harness:preview` é a recomendação; @architect pode renomear mantendo o requisito comportamental de §5.2).
- Desambiguação de data de PASS quando QA report e trail divergem → recomendação: trail vence (mais granular); @architect confirma.
- Estimativa de custo em bytes de corrections como proxy adicional → opcional, decidir em design se agrega sinal sem ruído.
