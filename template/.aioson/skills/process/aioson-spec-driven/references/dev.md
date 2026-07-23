# Streamlined Reference — Dev

## Authority

PRD + implementation plan + repository. The prototype is binding only when the strict ownership check verifies `prototype_status: current`, the active feature owner, canonical paths, and matching manifest. Another feature's or a closed feature's prototype is historical. With `none`, inspect and fix against the active PRD plus current production code/tests.

## Phase loop

1. Load the phase's CAP/AC, exact paths, existing implementation pattern, and applicable engineering controls.
2. Implement a working vertical slice.
3. Add stack-native focused tests citing AC IDs.
4. Run the focused check and prove triggered engineering controls.
5. Exercise the default application entry point and observe the promised result.
6. Record evidence, update Dev state, advance.

Do not self-certify with compile success, mocks, static UI, an alternate binary, or a test-only route. Stop for product contradiction; resolve ordinary technical choices from evidence.

## Handoff

All required phases implemented with production-path evidence → `@qa`.
