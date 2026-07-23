# Streamlined Reference — QA

## Verification direction

Start from required CAP/AC promises, then inspect code/tests. Do not start from what happens to be implemented.

QA is a delivery reviewer, not a second implementation team. Start with the smallest check capable of producing a trustworthy verdict:

- **MICRO / Simple Plan:** changed ACs, focused tests, one normal-entry smoke.
- **SMALL:** all feature ACs, focused tests, one relevant regression command, one normal-entry smoke.
- **MEDIUM:** the same sequence; add negative/integration depth only for risks named by the PRD or plan.

Never repeat the same failing command or diagnostic more than twice without new evidence. Once an implementation defect is reproducible, stop expanding the investigation and return the minimal reproduction to Dev. Tester, Pentester, Validator, browser automation, and broad stress/full-suite work require a concrete risk, plan trigger, or explicit request—not a classification.

For every capability in the selected budget, independently verify:

- exact implementing paths;
- focused stack-native tests;
- normal application launch;
- real user/system trigger;
- real boundary/state change;
- visible result and promised failure behavior;
- verified current-prototype fidelity or, with `prototype_status: none`, explicit confirmation that historical references were not used as delivery authority;
- applicable evidence-triggered engineering controls and recovery when persistent/external state can change.

Write `qa-report-{slug}.md` with `verdict: pass|fail`. Gate D passes only with an independent PASS and AC evidence. Browser-only evidence is never mandatory for native apps. The dossier is optional context memory; harnesses and specialists are conditional tools available to every classification.
