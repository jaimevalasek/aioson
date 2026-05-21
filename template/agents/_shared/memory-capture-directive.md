---
name: memory-capture-directive
schema_version: "1.0"
ships_with: operator-memory v1.13.0+
purpose: "Versioned prompt template defining the 4 signal types that agents observe and emit aioson op:capture for. Source-of-truth for signal detection heuristics; wired into agent preflight by Phase 3 universal loading directive."
---

# Memory Capture Directive (operator-memory v1.13.0)

> **Loaded by:** the universal loading directive in `template/CLAUDE.md` / `template/AGENTS.md` (Phase 3, v1.14.0). Phase 2 ships this file dormant — Phase 3 wires it in.
>
> **Versioned:** if signal taxonomy changes in V2, bump `schema_version` and update the loading directive's reference. PMD-02 commitment: divergence from AIOSON's deterministic principle is documented and bounded.

## What to watch for

While conversing with the user, watch their messages for **standing decisions** — preferences they want applied to *future* sessions, not just the current turn. There are exactly 4 signal types in V1.

### 1. Authorization

User grants ongoing permission for an action. Look for: `pode X sempre`, `from now on X`, `não precisa me perguntar X`, `vai fazendo X`, `confio em você pra X`, `daqui pra frente X`.

**Examples that ARE authorization:**

- "pode commitar autonomamente sempre que aprovar a fatia"
- "from now on, use TypeScript by default in new files"
- "não precisa me perguntar antes de rodar npm test, pode rodar direto"

**Examples that are NOT (do not capture):**

- "agora pode commitar" → context-bound to current task, not standing
- "ok faz isso" → simple agreement, not authorization

### 2. Exclusion

User explicitly carves out an action that they keep manual / restricted. Look for: `X eu faço manual`, `X nunca autonomamente`, `não X automaticamente`, `X sempre comigo`, `me deixa fazer X`.

**Examples that ARE exclusion:**

- "npm publish eu sempre faço manualmente"
- "git push para main nunca autonomamente"
- "deploy de produção é sempre comigo"

**Examples that are NOT:**

- "agora não publica" → context-bound
- "espera eu testar" → temporal, not standing

### 3. Correction

User explicitly tells you to stop doing something or change behavior going forward. Look for: `não faça X`, `pare de X`, `stop doing X`, `evita X`, `nunca X`, `prefiro X em vez de Y`.

**Examples that ARE correction:**

- "stop adding emojis to commit messages"
- "não faça mais resumos no fim de cada resposta"
- "prefiro respostas curtas em vez de longas"

**Examples that are NOT (likely one-shot):**

- "neste arquivo prefiro brevidade" → file-scoped
- "agora vai com cuidado" → session-scoped

### 4. Confirmation (2x+ threshold)

User accepts the same non-obvious approach twice without pushback. The 2x threshold is enforced by the storage layer — the prompt directive only needs to emit `op:capture` whenever the pattern repeats; the 2nd-detection promotion is automatic.

**Examples that ARE confirmation worth capturing:**

- User accepts the same unusual architectural choice across 2 PRs without questioning it
- User repeatedly says "perfect, keep doing X" for an approach that wasn't obvious

**Examples that are NOT:**

- Single acceptance ("ok") — wait for repetition
- Acceptance of trivially-correct approaches — no signal value

## How to emit

When you detect any of the 4 signals, emit this exact CLI call (best-effort — if it fails, do NOT crash the session):

```bash
aioson op:capture \
  --signal=<authorization|exclusion|correction|confirmation> \
  --quote="<verbatim user message>" \
  --proposal="<your paraphrase of the standing decision>" \
  --source-agent=<your-agent-name>
```

**Field guidance:**

- `--quote` — the EXACT user words (verbatim) that triggered detection. Used for audit; trimmed automatically.
- `--proposal` — your one-sentence paraphrase in user-facing language. This becomes the slug seed + the decision body. Be concrete: "commit autônomo após approval explícito de slice" beats "user authorized commits".
- `--source-agent` — your own agent name (`dev`, `deyvin`, `pm`, etc.) so the audit trail knows which agent observed the signal.

## When NOT to capture (anti-patterns)

Suppress capture in these cases — they create noise that drowns real signal:

1. **Context-bound preferences** — "neste PR prefiro brevidade" (PR-scoped, not standing).
2. **Negotiations / questions** — "será que dá pra commitar autonomo?" (asking, not deciding).
3. **Routine agreements** — "ok", "sim", "vai" without specific scope (no signal).
4. **Apologies / corrections of immediate output** — "isso ficou errado, refaz" (immediate, not standing).
5. **Test sessions** — if `AIOSON_OPERATOR_ID=test-*` or `_anonymous`, the capture happens but no decisions promote to global memory (storage layer handles isolation).
6. **Conflict with project rules** — if a decision would conflict with `.aioson/rules/*.md`, the storage layer will surface a warning at preflight; you still capture (the conflict is logged, not silently dropped).

## Capture is best-effort

If `aioson op:capture` exits non-zero (CLI unavailable, storage failure, etc.), DO NOT crash the session, retry, or surface the failure to the user. The capture is informational — failure here is non-critical. Continue with the conversation normally.

The storage layer (Phase 2 v1.13.0 onwards) handles:

- Deterministic slug derivation (same paraphrase → same slug)
- Idempotent capture (re-detection updates `last_detected`, increments `detected_count`)
- 2x threshold promotion (proposal → decision atomic transition)
- Silent operation on first detection; 1-line audit on promotion
