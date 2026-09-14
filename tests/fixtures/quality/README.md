# Quality fixtures

- `fallow-3.23.0.json`: captured combined/v11 output from installed Fallow 3.23.0, against a small ESM project with an imported export, an unused export and an orphan file. It is the wire-format regression fixture.
- `fallow-health-dupes-3.23.0.json`: selected real health, function-size and clone records from the historical AIOSON scan. The health finding/group counters were reduced to match the selected arrays; unrelated descriptive statistics still refer to the original scan. It tests actual record shapes, clone-rank instability and truncation handling, not native aggregate statistics.
- `eval-solutions.json`: reference repairs used only to validate the development corpus and its graders. They are fixtures, not outputs from a model. The broken seeds and outcome vectors are shipped in `template/.aioson/quality/evals/core.json`.

Synthetic projects created by tests use disposable temporary directories. Native provider subprocess tests use explicit fake package entrypoints to exercise process failures without relying on a globally installed executable.
