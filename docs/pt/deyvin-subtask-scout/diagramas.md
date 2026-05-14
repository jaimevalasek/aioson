# Diagramas — Sub-task Scout

---

## Fluxo completo de despacho

```
Usuário pergunta ao @deyvin algo que dispara rubrica linha 111
(survey de >5 arquivos ou rastreamento de fluxo de runtime)
         │
         ▼
┌─────────────────────────────────────────────────────────────┐
│  aioson scout:prep                                          │
│  ─────────────────                                          │
│  1. Valida inputs (question, scope, excerpt obrigatório)   │
│  2. Resolve scope_paths → paths absolutos                   │
│  3. Checa caps: scouts_in_session < max (3) ?              │
│                 scope_size < max_files (20) ?               │
│  4. Incrementa scouts_in_session no state file             │
│  5. Gera prompt com tool whitelist [Read, Grep]            │
│  6. Retorna { id, prompt, output_path, cap_remaining }     │
└──────────────────────────────┬──────────────────────────────┘
                               │ exit 0
                               ▼
┌─────────────────────────────────────────────────────────────┐
│  harness.sub-agent(prompt)    ← CONTEXTO ISOLADO            │
│  ────────────────────────                                   │
│  ferramentas: [Read, Grep] APENAS                           │
│  proibido: [Bash, Edit, Write]  ← Nautilus pattern         │
│                                                             │
│  sub-agente inspeciona scope_paths                          │
│  escreve JSON em output_path                                │
└──────────────────────────────┬──────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────┐
│  aioson scout:validate --input=<output_path>                │
│  ───────────────────────────────────────────                │
│  valida contra OUTPUT_SCHEMA                                │
│  atualiza retries_by_id no state                            │
└──────────┬───────────────────────────────┬──────────────────┘
           │ PASS (exit 0)                 │ FAIL (exit 2)
           ▼                               ▼
┌──────────────────────────┐   ┌───────────────────────────────┐
│ aioson scout:commit      │   │ retry_remaining > 0?          │
│ ────────────────────     │   │  sim → @deyvin re-prompta     │
│ persiste scout JSON      │   │  não → retry_exhausted        │
│ decrementa cap           │   │         status: "error"       │
│ emite telemetria         │   │         @deyvin informa user  │
└──────────┬───────────────┘   └───────────────────────────────┘
           │
           ▼
┌──────────────────────────────────────────────────────────────┐
│ @deyvin lê findings, confidence, recommendation              │
│ dobra na resposta ao usuário                                 │
│                                                              │
│ contexto pai cresceu: ~500 tokens (relatório)               │
│ vs inline survey:     ~10k+ tokens (arquivos brutos)        │
└──────────────────────────────────────────────────────────────┘
```

---

## Archivamento no feature:close

```
aioson feature:close --slug=<s> --verdict=PASS
         │
         ▼
 (hook na Phase 5 do feature:close)
         │
         ├─ procura .aioson/runtime/scouts/ por files com feature_slug=<s>
         │
         ├─ para cada scout encontrado:
         │    ├─ copia para .aioson/context/features/<s>/scouts/{id}.json
         │    └─ appenda bullet em dossier.md > ## Sub-task scouts (idempotente)
         │
         └─ emite telemetria type=sub_task action=archived_on_close
         
 (runtime copies permanecem em .aioson/runtime/scouts/ — poda pelo doctor)
```

---

## Poda pelo doctor

```
aioson doctor . [--fix]
         │
         ├─ check: scouts_directory_pruning
         │    ├─ lê .aioson/config/scout-engine.json → prune_unattached_after_days (default: 90)
         │    ├─ lista .aioson/runtime/scouts/*.json
         │    │    ├─ tem feature_slug? → NUNCA poda (cold-load memory)
         │    │    └─ sem feature_slug + idade > threshold? → candidato
         │    └─ sem --fix: reporta count como advisory WARN
         │       com --fix: apaga candidatos
```

---

## State file e file-lock

```
.aioson/runtime/scouts/.state.json
{
  "sessions": {
    "sess-abc123": {
      "scouts_in_session": 2,      ← incrementado em prep, decrementado em commit
      "retries_by_id": {
        "scout-2026-05-14-a3b7c1": 0
      },
      "committed_ids": {
        "scout-2026-05-14-a3b7c1": true
      }
    }
  }
}

Lock: .aioson/runtime/scouts/.state.json.lock
  ├─ conteúdo: { pid, lockedAt (ISO) }
  ├─ stale se age > 30s
  ├─ retry a cada 100ms, deadline 30s
  └─ criado em prep/commit/validate; removido após a operação
```
