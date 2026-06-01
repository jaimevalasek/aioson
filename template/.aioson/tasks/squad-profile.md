# Task: Squad Profiler Integration

> Orchestrates profiling inside the squad creation flow.

## When To Use
- Automatically by `@squad` when it detects a persona-based squad
- `@squad design --profile` — triggers profiling before design

## Persona Detection

Offer profiling when:
- The user mentions a specific person by name.
- The goal includes "in the style of", "as {person}", or "based on {person}'s approach".
- The domain is personal branding or content creation for a specific creator.

## Process

### Step 1 - Check Existing Profile
Check whether `.aioson/profiler-reports/{person-slug}/` already exists.
If it exists, read the enriched profile and skip to genome application.

### Step 2 - Run Profiling Pipeline
If no profile exists:
1. `@profiler-researcher` — evidence collection
2. `@profiler-enricher` — cognitive pattern analysis
3. `@profiler-forge` — genome generation

### Step 3 - Apply Genome To Executors
Apply the resulting genome only to relevant executors:
- Creative executors (copywriter, scriptwriter) → yes
- Research and orchestration executors → no; they do not need the persona voice

### Step 4 - Register In Blueprint
```json
"profiling": {
  "person": "{name}",
  "genomePath": "{path}",
  "genomeSlug": "{slug}",
  "evidenceMode": "verified | inferred | mixed",
  "profiledAt": "{ISO-8601}"
}
```

## Rules
- Do not run profiling without user consent.
- Do not apply the genome to every executor; only apply it where persona voice is needed.
- Profiling is a suggestion, not a requirement.
- Record the profiling → squad association in the blueprint.
