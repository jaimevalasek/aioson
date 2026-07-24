---
description: "Genome evidence quality, fidelity limits, operational readiness, and held-out outcome proof."
agents: [genome, squad]
task_types: [research, validation, enrichment, eval]
triggers: [genome evidence, genome quality, fidelity, held-out genome]
---

# Genome Evidence and Quality

Use this module for validation, enrichment, Track 4.2/4.3 generation, and any claim that a genome improves output.

## Evidence posture

Treat source quality, operational completeness, and outcome improvement as different questions:

- source quality: is each important method or persona claim grounded?
- operational completeness: can the genome compile into procedure, restrictions, checklist, style, or output contract?
- outcome improvement: does held-out A/B evidence show a non-regression or gain in the declared dimension?

Passing one never fabricates the others.

## Source contract

- Primary material is preferred for the subject's own method, voice, or normative claim.
- Secondary material may corroborate, challenge, or contextualize.
- Inferred content is labeled and cannot support high-fidelity claims by itself.
- Search snippets route discovery; opened/extracted sources support claims.
- Track 4.2 references use structured manifest objects and contained paths.
- Track 4.3 sources carry stable IDs used by claims and quality reports.

Facts that can age are researched at execution time and live in an Evidence Pack. A genome stores stable methods and explicitly marks historical examples.

## Quality gate

Do not advance while:

- required dependencies are absent;
- relations declare an active contradiction without precedence;
- doctor reports missing structured sources;
- compilation produces no operational effect;
- a binding is `pending`, `stale`, or `conflicted`;
- persona fidelity exceeds what source coverage supports.

For squad use, compare the same held-out task with and without the genome. Report dimensions separately: source fidelity, procedure adherence, constraint adherence, output structure, style fit, and task outcome. A critical regression remains visible even if other dimensions improve; never collapse it into a flattering single score.

## Repair ownership

- missing or weak source → genome author / Profiler pipeline;
- dependency or relation conflict → genome author plus squad owner;
- materialization drift → squad DEV/runtime owner;
- held-out regression → genome author repairs, squad eval reruns;
- security or policy conflict → preserve the stricter rule and surface the blocked binding.
