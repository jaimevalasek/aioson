---
description: "Templates concretos por agente para escrita no dossier via dossier:add-finding, dossier:add-codemap e dossier:link-rule (Phase 2 + Phase 3)"
---

# Agent Dossier Templates

Each agent calls `aioson dossier:add-finding . --slug={slug} --agent={agent} --section="{section}" --content="..."` after completing its analysis. Calls are idempotent (duplicate content is a no-op).

**Phase 3 additions — use when touching real code or applying rules:**
- `aioson dossier:add-codemap . --slug={slug} --file=<path> [--lines=<int-int>] [--role=<role>] [--coupling=<low|medium|high>] [--added-by={agent}]`
- `aioson dossier:link-rule . --slug={slug} --rule=<path> [--reason="..."]`
- `aioson dossier:compact . --slug={slug}` — run after any session if dossier > 15KB

## @product

**Section:** `What`
**When:** After writing the PRD — summarize the MVP scope in 2-3 lines.

```
aioson dossier:add-finding . --slug={slug} --agent=product --section="What" \
  --content="MVP: {one-line scope}. Key constraints: {constraints}."
```

## @analyst

**Section:** `Agent Trail`
**When:** After completing requirements analysis.

```
aioson dossier:add-finding . --slug={slug} --agent=analyst --section="Agent Trail" \
  --content="Requirements mapeados. Edge cases: {n}. Pendências para @architect: {items}."
```

**Link applicable rules:**
```
aioson dossier:link-rule . --slug={slug} --rule=.aioson/rules/{rule-file}.md \
  --reason="{why this rule applies to this feature}"
```

## @architect

**Section:** `Agent Trail`
**When:** After completing architecture.

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

## @dev

**Section:** `Agent Trail`
**When:** After each significant implementation slice.

```
aioson dossier:add-finding . --slug={slug} --agent=dev --section="Agent Trail" \
  --content="Slice concluído: {description}. Próximo: {next-slice}."
```

**Register implemented files in Code Map (use after each file created/modified):**
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

**Section:** `Agent Trail`
**When:** After QA sign-off.

```
aioson dossier:add-finding . --slug={slug} --agent=qa --section="Agent Trail" \
  --content="QA concluído. Verdict: {PASS|FAIL}. Cobertura: {n}%. Issues: {list}."
```

## @sheldon

**Section:** `Why`
**When:** After enrichment — add architectural insights.

```
aioson dossier:add-finding . --slug={slug} --agent=sheldon --section="Why" \
  --content="Enrichment: {insight}. Riscos identificados: {risks}."
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
