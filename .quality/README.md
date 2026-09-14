# Quality adoption baselines

These files describe debt, not exemptions for future implementation.

- `eslint-baseline.json`: 537 semantic findings present during adoption. Fingerprints use path, rule and message, with occurrence counts; line movement is neutral. Undefined names and parser failures always block, even if inserted into a baseline.
- `fallow-baseline.json`: measured from committed source `f92e6e126fa0c8f150fc27025fdb09d617e7c6c2` in an isolated snapshot with installed dependencies, using Fallow 3.23.0 and the adopted configuration. No new quality implementation was included. Provider version and canonical JSON configuration hash are checked before comparison.

The Fallow configuration includes tests in the dependency graph so intentional test-facing exports are reachable. Health and duplication use production source. The separate child-process evaluator entrypoint is declared explicitly. CRAP enforcement is disabled because its current coverage model is `static_estimated`; cyclomatic complexity, cognitive complexity, function size, duplication and dependency checks remain active. Measured quality-module coverage is collected separately.

Review baseline changes as source changes: reproduce the finding, identify the owner and reason, and preserve the source revision and tool/configuration versions. Never regenerate a baseline from the proposed implementation just to make CI green. Remove resolved occurrences when maintaining debt; new severity/metric increases and additional occurrences remain blocking. A provider upgrade needs a captured real fixture and a reviewed migration of baseline identity.

The baseline is a triage inventory. Static findings require call-path review before deleting dynamic exports, changing architecture or claiming a security defect. There is no claim that all historical candidates are confirmed bugs.
