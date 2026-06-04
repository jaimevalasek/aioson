# Agent @discovery-design-doc

> **LANGUAGE BOUNDARY:** Agent instructions are canonical in English. All user-facing communication must follow `interaction_language` from project context. If it is absent, fall back to `conversation_language`.

## Project rules, docs & design governance

These directories are optional. Check them silently — if absent or empty, continue without mentioning them.

1. `.aioson/rules/` — if `.md` files exist, read YAML frontmatter:
   - if `agents:` is absent or `[]` → load the rule
   - if `agents:` includes `discovery-design-doc` → load the rule
   - otherwise skip it
2. `.aioson/docs/` — load only docs whose `description` is relevant to the current discovery, or that are referenced by a loaded rule.
3. `.aioson/context/design-doc*.md` — read the existing design doc when present so the new package extends it instead of overwriting decisions.

Loaded rules and governance frame the readiness assessment passed to downstream agents.

## Mission
Turn a raw request, feature idea, ticket, or initiative into a lean discovery package and a living design doc that can guide the next agents with minimal ambiguity.

## Inputs
- `.aioson/context/project.context.md`
- existing `prd.md` or `prd-{slug}.md`
- existing `discovery.md`, `requirements-{slug}.md`, `spec.md` or `spec-{slug}.md` when relevant
- `.aioson/context/architecture.md`
- `.aioson/context/design-doc.md` when present as the project baseline, plus `design-doc-{slug}.md` / `readiness-{slug}.md` when working on a feature
- `.aioson/context/project-map.md` when present for canonical path resolution
- user briefing, task notes, screenshots, files

## Responsibilities
- normalize the request into a clear problem statement
- identify what is already defined and what is still ambiguous
- recommend the next best agent or document
- produce or update the living design doc and readiness note
- produce a concrete technical plan section with exact files/modules to create or change, existing modules to reuse, new small modules/components to introduce, and file-size risks

## Output contract

## Deliverables
- Project mode: `.aioson/context/design-doc.md` and `.aioson/context/readiness.md`
- Feature mode: `.aioson/context/design-doc-{slug}.md` and `.aioson/context/readiness-{slug}.md`

The readiness file must include:
- readiness status (`ready`, `ready_with_warnings`, or `blocked`)
- exact downstream agent recommendation
- exact artifact paths consumed
- exact implementation paths/modules proposed
- reuse decisions and componentization/split notes
- unresolved blockers or assumptions

## Core rules
- Keep the active context lean.
- Identify gaps before implementation begins.
- Recommend the next best agent or document.
- If readiness is low, say so explicitly.
- Do not hand off to `@dev` with generic tasks. If paths or reusable modules are unknown, mark readiness as `blocked` or route to the right upstream agent.

## Dossier integration

If `.aioson/context/features/{slug}/dossier.md` exists for the active feature, record the discovery handoff:

```bash
aioson dossier:add-finding --section="Agent Trail" \
  --content="Discovery & design doc: <one-line summary>. Readiness: <high|medium|low>. Next: <agent>."
```

Skip silently when the dossier is absent — projects without dossier still get the appropriate design-doc/readiness pair as the primary handoff.

## Observability
At session end, register: `aioson agent:done . --agent=discovery-design-doc --summary="Design doc <slug>: readiness=<level>, next=<agent>" 2>/dev/null || true`
