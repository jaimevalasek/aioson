---
slug: review-intelligence
classification: MEDIUM
gate_requirements: approved
status: approved
created_at: 2026-07-15
---

# Requisitos — Review Intelligence

## Objetivo e atores

Adicionar uma camada compartilhada e verificável de challenge/review aos agentes de especificação e assurance, apoiada por três comandos CLI estritamente aditivos. O operador continua decidindo somente trade-offs que lhe pertencem; o agente deve primeiro explorar evidência local, pesquisa recente e consequências da solução proposta.

Atores:

- operador/desenvolvedor: owner de decisões de produto que não são inferíveis;
- agente autor: executa self-review sem declarar independência;
- agente downstream: executa review independente dentro do seu ownership;
- CLI AIOSON: resolve contexto mecânico, valida contratos e expõe staleness, sem produzir julgamento semântico nem alterar gates existentes.

## Attack Surface Map

| Surface | Aplicabilidade nesta feature |
|---|---|
| Authenticated endpoints | N/A — não há endpoint, sessão ou autenticação. |
| Owned resources | N/A — não há usuário, tenant, recurso compartilhado ou decisão de ownership. |
| Financial state changes | N/A — não há pagamento, crédito ou alteração financeira. |
| Uploads | N/A — não há upload ou arquivo recebido de usuário; os caminhos aceitos já devem existir dentro do projeto. |
| External URLs | N/A — o CLI não busca URL nem faz requisição de rede. |
| Secrets or credentials | N/A — a feature não recebe, persiste ou transmite credenciais. |
| Storage boundaries | N/A — somente artefatos locais sob `.aioson/`, sem dado de usuário/tenant; contenção, `realpath` e revalidação de handle protegem contra escape por path swap. |
| Pentester trigger | Aplicável — conteúdo de review e paths locais são tratados como superfícies de injeção indireta e troca de caminho. |

## Contratos de linha de comando

```text
aioson review:prepare [path] --agent=<agent> --feature=<slug> [--artifact=<path>] [--json]
aioson review:check   [path] --agent=<agent> --feature=<slug> --report=<path> [--json]
aioson review:status  [path] --feature=<slug> [--json]
```

Agentes aceitos: `briefing`, `briefing-refiner`, `product`, `sheldon`, `analyst`, `architect`, `scope-check`, `qa`.

Perfis e modo padrão:

| Agente | Perfil | Modo padrão | Artefato padrão quando `--artifact` é omitido |
|---|---|---|---|
| briefing | framing | self_review | `.aioson/briefings/{slug}/briefings.md` |
| briefing-refiner | framing | independent_review | `.aioson/briefings/{slug}/briefings.md` |
| product | framing | self_review | `.aioson/context/prd-{slug}.md` |
| sheldon | specification | independent_review | `.aioson/context/prd-{slug}.md` |
| analyst | specification | self_review | `.aioson/context/requirements-{slug}.md` |
| architect | architecture | self_review | `.aioson/context/design-doc-{slug}.md` |
| scope-check | delivery-assurance | independent_review | `.aioson/context/scope-check-{slug}.md`, com fallback para `implementation-plan-{slug}.md` |
| qa | delivery-assurance | independent_review | `.aioson/context/qa-report-{slug}.md` |

Ausência ou ambiguidade do artefato padrão retorna erro acionável; o CLI nunca escolhe silenciosamente um artefato fora da lista do agente.

## Estados e códigos de saída

Estados de review: `pass`, `blocked`, `decision_required`, `unverified`.

- exit `0`: operação bem-sucedida e review atual em `pass`; `review:status` vazio também retorna `0` com `overall_status: empty`, pois o MVP não cria gate obrigatório;
- exit `1`: relatório válido e atual, persistido, mas com `blocked`, `decision_required` ou `unverified`; no status agregado significa `attention_required`;
- exit `2`: invocação inválida, schema/path inseguro, arquivo ausente/excedente, packet incompatível, JSON malformado ou staleness; relatório inválido não é promovido.

Os códigos pertencem somente aos três comandos novos. Nenhum código de saída existente pode mudar.

## Requisitos funcionais

### REQ-RI-001 — Skill compartilhada e progressiva

Criar `review-intelligence` como process skill curta, com workflow central e quatro referências carregadas sob demanda: `framing`, `specification`, `architecture` e `delivery-assurance`. A skill deve exigir autoridade explícita, evidência antes de perguntas, conclusão auditável e stop condition.

### REQ-RI-002 — Challenge limitado e sem raciocínio privado

Cada ativação executa no máximo duas passagens: cobertura/fatos e pressão future-state/adversarial. O sistema persiste apenas findings, evidência, impacto, recomendação, alternativas relevantes, confiança, owner e risco residual; campos de chain-of-thought, pensamentos privados, scratchpad ou raciocínio passo a passo são proibidos.

### REQ-RI-003 — Ownership e independência

O autor pode corrigir omissões inferíveis em self-review, mas não declarar aprovação independente. Decisões não inferíveis viram `decision_required` com owner, recomendação e consequências. `briefing-refiner`, `sheldon`, `scope-check` e `qa` operam por padrão como reviewers independentes dos artefatos/sistemas upstream.

### REQ-RI-004 — Perfis por fase

O perfil selecionado deve fornecer lentes identificáveis e específicas da fase. Hooks pequenos nos oito agentes carregam somente a referência correspondente depois de existir uma tarefa/slug concreto, preservando ativação rápida, language boundary, ownership, output contract, observabilidade e handoff existentes.

### REQ-RI-005 — Evidência e pesquisa proporcionais

Antes de perguntar ao usuário, o agente inspeciona autoridade, dossier, código, testes e cache de pesquisa selecionados. Pesquisa web só ocorre para lacuna externa, material e potencialmente decisiva; usa cache com menos de sete dias e fontes primárias. Snippet de busca não é prova e inferência deve ser marcada como tal.

### REQ-RI-006 — `review:prepare`

O comando valida feature/agente/artefato, resolve o perfil e o modo, seleciona apenas fontes de autoridade existentes e conhecidas, calcula SHA-256 e gera packet imutável. A saída inclui packet, path persistido, referência da skill, lentes, limite de duas passagens, contrato/exemplo de relatório e próximo comando exato.

### REQ-RI-007 — Packet versionado e idempotente

O packet usa `schema_version: review-packet/v1` e contém `packet_id`, `feature_slug`, `agent`, `profile`, `review_mode`, `artifact {path, sha256, bytes}`, `authorities[]`, `reference_path`, `challenge_lenses[]`, `max_passes: 2` e `prepared_at`. `packet_id` deriva deterministicamente do contrato e hash do artefato; reprepare sem mudança é idempotente.

### REQ-RI-008 — Relatório versionado

O candidato a relatório usa `schema_version: review-report/v1` e contém feature/agente/perfil/modo/packet/artifact correspondentes, `passes_completed` entre 1 e 2, `review_status`, resumo e `findings[]`. Cada finding possui ID, lente, estado, severidade, descrição, evidência, impacto, recomendação, alternativas, confiança, owner e risco residual.

Estados de finding: `open`, `resolved`, `decision_required`, `deferred`. Severidades: `info`, `warning`, `blocking`. Confiança: `high`, `medium`, `low`.

### REQ-RI-009 — Assurance multidimensional

Relatórios do perfil `delivery-assurance` incluem os eixos `specification_fidelity`, `acceptance_coverage`, `code_health`, `runtime_truth` e `residual_risk`, cada um com `pass`, `fail`, `unverified` ou `not_applicable`, evidência e risco residual. Eixo `pass` não pode conter evidência com status `failed`, `not_run` ou `unverified`. É proibido score, média, percentual ou verdict único que masque um eixo.

### REQ-RI-010 — `review:check`

O comando lê o candidato somente após contenção, valida schema/limites/semântica, localiza o packet pelo ID, confirma feature/agente/perfil/modo, recalcula o hash do artefato e valida paths de evidência. Campos textuais rejeitam controles bidi, caracteres invisíveis e comentários HTML usados como carriers de injeção indireta. Relatório atual e estruturalmente válido é promovido para storage canônico imutável, inclusive quando requer ação; inválido ou stale nunca é promovido.

### REQ-RI-011 — Coerência semântica determinística

`pass` é recusado se houver finding `open`, `decision_required`, severidade `blocking` ou eixo `fail/unverified` sem justificativa aplicável. `blocked` exige ao menos um blocker aberto; `decision_required` exige finding correspondente com owner; todo finding não resolvido exige evidência e recomendação.

### REQ-RI-012 — `review:status`

O comando varre somente packets/reports canônicos da feature, revalida vínculo e staleness, escolhe o registro atual mais recente por agente pela ordem confiável de promoção/metadado do arquivo — nunca por `completed_at` fornecido no report — e agrega estados/eixos separadamente. Retorna `empty`, `clear`, `attention_required` ou `invalid_or_stale`, sem reranquear, gerar score ou substituir QA/validator.

### REQ-RI-013 — Persistência segura e atômica

Packets ficam em `.aioson/context/features/{slug}/reviews/packets/` e reports promovidos em `reviews/reports/`. Nomes incluem agente e prefixos de hash; arquivos são imutáveis. Escrita usa temporário exclusivo no mesmo diretório + rename e remove temporários em falha. Conteúdo já existente com o mesmo hash é no-op, nunca overwrite destrutivo.

### REQ-RI-014 — Contenção, symlinks e limites

Slug aceita apenas kebab-case; agentes vêm da allowlist. Artefato, report e evidências devem resolver lexicalmente e por `realpath` dentro da raiz do projeto; traversal, caminho absoluto externo e symlink/junction que escape são rejeitados antes da leitura. Depois de abrir um arquivo ou temporário de escrita, a implementação revalida contenção e identidade antes de consumir/escrever conteúdo, falhando fechada se o path mudou. Limites: artefato/autoridade até 5 MiB cada, candidato a report até 1 MiB, no máximo 100 findings, 20 evidências por finding e 1.000 arquivos canônicos por varredura.

### REQ-RI-015 — Fallback compatível

Se a skill ou o novo CLI não existir numa instalação antiga, o agente aplica manualmente o loop bounded e segue o contrato preexistente. Ausência de packet/report não bloqueia workflow ou done-gate no MVP. Resultado de review não altera automaticamente `phase_gates`, `workflow.state.json`, `last-handoff.json` ou semântica de comandos legados.

### REQ-RI-016 — Distribuição e paridade inception

Skill, referências, metadata e schema entram primeiro em `template/.aioson/`, são listados em `MANAGED_FILES` e sincronizados para `.aioson/`. Agentes são editados no template canônico e sincronizados. Update/setup de instalações futuras inclui os novos arquivos sem remover arquivos do usuário fora do contrato gerenciado.

### REQ-RI-017 — Help, JSON e documentação

As três assinaturas aparecem no help em en, pt-BR, es e fr. `--json` emite um único JSON sem logs concorrentes. Referências CLI en/pt-BR documentam propósito, estados e exit codes. Erros têm `reason`/`error` estáveis e dados acionáveis sem vazar conteúdo de artefatos.

### REQ-RI-018 — Compatibilidade e regressão

A implementação é exclusivamente aditiva: não altera comando, alias, flag, output, exit code, routing, gate ou schema existente. Testes cobrem engine/CLI/schema/security/staleness/atomicidade/i18n/skills/hooks/paridade, e lint + suíte integral devem passar. Falha preexistente deve ser isolada e comprovada antes de qualquer conclusão.

## Critérios de aceitação

- **AC-RI-001:** cada um dos oito agentes carrega somente sua referência de perfil após slug/tarefa concreta; contratos estruturais e paridade template/workspace continuam verdes.
- **AC-RI-002:** a skill fixa autoridade, evidência antes de pergunta, duas passagens máximas, stop condition e owner routing; nenhum arquivo solicita ou persiste chain-of-thought.
- **AC-RI-003:** a matriz agente→perfil/modo/artefato acima é reproduzida pelo engine e rejeita agente desconhecido.
- **AC-RI-004:** `review:prepare` com flags explícitas gera `review-packet/v1`, hashes corretos, `max_passes: 2`, referência/lentes corretas e próximo comando acionável.
- **AC-RI-005:** omitir `--artifact` resolve exatamente o default existente; nenhum default ou múltiplos candidatos válidos retorna erro claro sem criar packet.
- **AC-RI-006:** reprepare do mesmo agente/artefato inalterado devolve o mesmo `packet_id`/path e não sobrescreve conteúdo; mudança gera novo ID e torna o anterior stale.
- **AC-RI-007:** report `pass` válido, vinculado e atual é promovido atomicamente, retorna exit 0 e aparece em `review:status` como current.
- **AC-RI-008:** reports válidos `blocked`, `decision_required` e `unverified` são promovidos, retornam exit 1 e preservam findings/owners sem bloquear qualquer gate existente.
- **AC-RI-009:** JSON malformado, schema/version inválido, packet ausente ou mismatch de feature/agente/perfil/modo retorna exit 2 e não cria report canônico.
- **AC-RI-010:** alterar o artefato depois do prepare faz `review:check` e `review:status` detectarem SHA stale e retornarem exit 2 até reprepare.
- **AC-RI-011:** traversal por slug/report/evidência, path absoluto externo, symlink/junction externo e troca de path após a validação são rejeitados antes de consumir/escrever conteúdo; nenhuma saída vaza o arquivo externo.
- **AC-RI-012:** limites de bytes, findings, evidências e arquivos de varredura falham de modo bounded e acionável, sem crash ou arquivo parcial.
- **AC-RI-013:** falha simulada de escrita/rename deixa o canônico anterior intacto e nenhum temporário órfão; reexecução segura conclui ou retorna no-op.
- **AC-RI-014:** `pass` com blocker/open/decision, delivery axis `fail/unverified` ou evidência `failed`/`not_run`/`unverified` sob eixo `pass` é recusado; estados de ação exigem seus findings correspondentes.
- **AC-RI-015:** report com chaves `chain_of_thought`, `reasoning`, `thoughts`, `scratchpad` ou equivalentes, ou com carrier oculto de injeção (bidi, invisível ou comentário HTML), é rejeitado; conclusões auditáveis continuam aceitas.
- **AC-RI-016:** delivery assurance expõe os cinco eixos separadamente; output/schema/skill não contêm `overall_score`, média, percentual ou ranking agregado.
- **AC-RI-017:** `review:status` sem diretório/reports retorna exit 0 + `overall_status: empty`; com reports atuais agrega por agente/eixo; inválido/stale prevalece como exit 2.
- **AC-RI-018:** todos os paths persistidos usam `/` relativo ao projeto e os nomes canônicos são derivados de allowlist + hash, nunca de path livre do usuário.
- **AC-RI-019:** help contém `review:prepare`, `review:check` e `review:status` nos quatro locales; cada comando com `--json` produz exatamente um documento JSON parseável.
- **AC-RI-020:** setup/update distribui skill/referências/metadata/schema por `MANAGED_FILES`; `npm run sync:agents` preserva paridade e não apaga conteúdo fora do template gerenciado.
- **AC-RI-021:** com CLI/skill ausente, hooks instruem fallback manual bounded e mantêm o comportamento/handoff anterior; nenhuma ausência vira novo gate.
- **AC-RI-022:** pesquisa só é acionada após cache/local context e apenas para lacuna externa material; finding registra cache/fonte e distingue fato de inferência.
- **AC-RI-023:** testes de cenário com lacunas semeadas comprovam future-state, falha/retry, empty state, ownership, integração indisponível, rollback/operação e evolução sem inflar escopo automaticamente.
- **AC-RI-024:** testes focados, contratos de agentes, paridade/schema, lint e suíte integral passam; snapshots/asserções de comandos legados permanecem inalterados.

## Rastreabilidade REQ → AC

| Requisito | Critérios |
|---|---|
| REQ-RI-001 | AC-RI-001, AC-RI-002 |
| REQ-RI-002 | AC-RI-002, AC-RI-015 |
| REQ-RI-003 | AC-RI-003, AC-RI-008, AC-RI-014 |
| REQ-RI-004 | AC-RI-001, AC-RI-003, AC-RI-023 |
| REQ-RI-005 | AC-RI-002, AC-RI-022, AC-RI-023 |
| REQ-RI-006 | AC-RI-004, AC-RI-005 |
| REQ-RI-007 | AC-RI-004, AC-RI-006 |
| REQ-RI-008 | AC-RI-007, AC-RI-008, AC-RI-009 |
| REQ-RI-009 | AC-RI-014, AC-RI-016 |
| REQ-RI-010 | AC-RI-007, AC-RI-009, AC-RI-010, AC-RI-011 |
| REQ-RI-011 | AC-RI-014, AC-RI-015 |
| REQ-RI-012 | AC-RI-010, AC-RI-016, AC-RI-017 |
| REQ-RI-013 | AC-RI-006, AC-RI-007, AC-RI-013, AC-RI-018 |
| REQ-RI-014 | AC-RI-011, AC-RI-012, AC-RI-018 |
| REQ-RI-015 | AC-RI-008, AC-RI-017, AC-RI-021 |
| REQ-RI-016 | AC-RI-001, AC-RI-020 |
| REQ-RI-017 | AC-RI-009, AC-RI-019 |
| REQ-RI-018 | AC-RI-020, AC-RI-021, AC-RI-024 |

## Fora de escopo

- jury multi-modelo, runner externo automático ou pesquisa web obrigatória;
- novo agente, novo motor, novo gate ou integração automática com done-gates;
- telemetria/tabela nova, autoaprendizado ou autoedição de prompts;
- score único, exposição de raciocínio privado ou substituição de QA, tester, pentester e validator;
- mudança semântica em CLIs existentes.

## Decisões abertas

Nenhuma decisão de produto bloqueante. O pacote técnico deve respeitar as assinaturas, schemas, limites, estados e política de compatibilidade acima.
