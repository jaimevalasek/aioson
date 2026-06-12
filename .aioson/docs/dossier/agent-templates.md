---
description: "Templates concretos por agente da cadeia (9 chain agents) para escrita no dossier via dossier:add-finding, dossier:add-codemap, dossier:link-rule e dossier:add-research. Bumped Phase 4 (agent-chain-continuity): @sheldon override (Why → Agent Trail + Research Index); novos templates para @ux-ui, @pm, @orchestrator; convenção DRIFT: para @dev."
agents: [product, analyst, sheldon, architect, pm, dev, qa, tester, briefing]
task_types: [dossier]
triggers: [dossier, agent trail, add finding]
---

# Agent Dossier Templates

Each chain agent calls one or more `dossier:*` commands after completing its work. All commands are idempotent — duplicate calls are no-ops.

**Available commands:**
- `aioson dossier:add-finding . --slug={slug} --agent={agent} --section={section} --content="..."` — append a finding to a section
- `aioson dossier:add-codemap . --slug={slug} --file=<path> [--lines=<int-int>] [--role=<role>] [--coupling=<low|medium|high>] [--added-by={agent}]` — register a file in Code Map
- `aioson dossier:link-rule . --slug={slug} --rule=<path> [--reason="..."]` — link an applicable rule or design-doc
- `aioson dossier:add-research . --slug={slug} --research-slug={research-slug} --agent={agent} --verdict={confirmed|has-alternatives|outdated|deprecated} --why-relevant="..." [--summary-path=<path>]` — register a research consulted or produced
- `aioson dossier:compact . --slug={slug}` — run after any session if dossier > 15KB

## @product

**Sections:** `What` (one-time, MVP summary) + `Agent Trail` (PRD creation entry).

```
aioson dossier:add-finding . --slug={slug} --agent=product --section="What" \
  --content="MVP: {one-line scope}. Key constraints: {constraints}."
```

```
aioson dossier:add-finding . --slug={slug} --agent=product --section="Agent Trail" \
  --content="PRD escrito. Classification: {MICRO|SMALL|MEDIUM}. Stakeholders: {list}."
```

`@product` is the dossier owner of `Why` and `What` — these belong only to `@product`.

## @sheldon

**Override (Phase 4):** `@sheldon` no longer writes to `Why` — that ownership belongs to `@product`. `@sheldon` writes to `Agent Trail` (enrichment summary) and `Research Index` (each research consulted or produced).

**Sections:** `Agent Trail` + `Research Index`.

```
aioson dossier:add-finding . --slug={slug} --agent=sheldon --section="Agent Trail" \
  --content="Sizing: {n}. Decision: {in-place|phased-plan}. Plan: {link}. Code findings: {list}."
```

**For each research** in `researchs/{research-slug}/summary.md`:
```
aioson dossier:add-research . --slug={slug} \
  --research-slug={research-slug} --agent=sheldon \
  --verdict={confirmed|has-alternatives|outdated|deprecated} \
  --why-relevant="{≤200 chars: how this research connects to the feature}"
```

## @analyst

**Sections:** `Agent Trail` + `Rules & Design-Docs aplicáveis` + `Research Index` (when consulted).

```
aioson dossier:add-finding . --slug={slug} --agent=analyst --section="Agent Trail" \
  --content="Requirements mapeados. Edge cases: {n}. Pendências para @architect: {items}."
```

**Link applicable rules:**
```
aioson dossier:link-rule . --slug={slug} --rule=.aioson/rules/{rule-file}.md \
  --reason="{why this rule applies to this feature}"
```

**Register any research consulted during analysis:**
```
aioson dossier:add-research . --slug={slug} --research-slug={research-slug} \
  --agent=analyst --verdict=confirmed --why-relevant="..."
```

## @architect

**Sections:** `Agent Trail` + `Code Map` + `Rules & Design-Docs aplicáveis` + `Research Index`.

```
aioson dossier:add-finding . --slug={slug} --agent=architect --section="Agent Trail" \
  --content="Arquitetura definida. Decisões chave: {decisions}. Gate B: pendente aprovação."
```

**Register architecture files in Code Map:**
```
aioson dossier:add-codemap . --slug={slug} \
  --file=src/{module}/{file}.js --lines={start}-{end} \
  --role=core-module --coupling=high --added-by=architect
```

**Link design-docs:**
```
aioson dossier:link-rule . --slug={slug} --rule=.aioson/design-docs/{doc}.md \
  --reason="{why this design-doc governs this feature}"
```

**Register research consulted during architecture work:**
```
aioson dossier:add-research . --slug={slug} --research-slug={research-slug} \
  --agent=architect --verdict={confirmed|has-alternatives|outdated|deprecated} --why-relevant="..."
```

## @ux-ui

**Sections:** `Agent Trail` + (optional) `Code Map` if mockups reference specific components.

```
aioson dossier:add-finding . --slug={slug} --agent=ux-ui --section="Agent Trail" \
  --content="UI spec concluída. Telas: {n}. Design skill: {skill}."
```

**Link design skill or rules:**
```
aioson dossier:link-rule . --slug={slug} --rule=.aioson/skills/design/{skill}.md \
  --reason="UI built against this design system"
```

## @pm

**Section:** `Agent Trail` (post task breakdown).

```
aioson dossier:add-finding . --slug={slug} --agent=pm --section="Agent Trail" \
  --content="Plano refinado. Stories: {n}. Lanes: {n}. Prioridade: {priority}."
```

## @orchestrator

**Section:** `Agent Trail` (post orchestration setup).

```
aioson dossier:add-finding . --slug={slug} --agent=orchestrator --section="Agent Trail" \
  --content="Orquestração iniciada. Lanes: {n}. Gate C: {status}."
```

## @dev

**Sections:** `Agent Trail` (per slice, with `DRIFT:` convention when applicable) + `Code Map` (per file created or modified).

**Per slice (normal):**
```
aioson dossier:add-finding . --slug={slug} --agent=dev --section="Agent Trail" \
  --content="Slice concluído: {description}. Próximo: {next-slice}."
```

**When detecting drift between plan and reality, prefix with `DRIFT:`** (parser-agnostic convention):
```
aioson dossier:add-finding . --slug={slug} --agent=dev --section="Agent Trail" \
  --content="DRIFT: {what diverged}. Decision: {chosen path}. Reason: {rationale}."
```

**Per file created or modified:**
```
aioson dossier:add-codemap . --slug={slug} \
  --file=src/{path}/{file}.js --lines={start}-{end} \
  --role={role} --coupling={low|medium|high} --added-by=dev
```

**Compact if dossier grows > 15KB:**
```
aioson dossier:compact . --slug={slug}
```

## @qa

**Section:** `Agent Trail` (post QA sign-off, with verdict).

```
aioson dossier:add-finding . --slug={slug} --agent=qa --section="Agent Trail" \
  --content="QA concluído. Verdict: {PASS|FAIL}. Cobertura: {n}%. Issues: {list}."
```

## Opening a revision request

If an agent finds a gap in an upstream artifact:

```
aioson revision:open . --slug={slug} \
  --requested-by={agent} \
  --target={upstream-agent} \
  --target-artifact={path-to-artifact} \
  --reason="Specific gap: {description}" \
  --severity=blocking|advisory
```

Example:
```
aioson revision:open . --slug=feature-x \
  --requested-by=analyst \
  --target=product \
  --target-artifact=.aioson/context/prd-feature-x.md \
  --reason="PRD assumes synchronous integration but the existing order module uses Redis pub/sub. The integration pattern must be clarified before entities can be mapped." \
  --severity=blocking
```
