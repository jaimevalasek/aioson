# Streamlined Reference — Dev

## Authority

PRD + implementation plan + repository. The prototype is binding when referenced. Legacy artifacts may be consulted, but their absence never blocks the canonical lane.

## Phase loop

1. Load the phase's CAP/AC, exact paths, and existing implementation pattern.
2. Implement a working vertical slice.
3. Add stack-native focused tests citing AC IDs.
4. Run the focused check.
5. Exercise the default application entry point and observe the promised result.
6. Record evidence, update Dev state, advance.

Do not self-certify with compile success, mocks, static UI, an alternate binary, or a test-only route. Stop for product contradiction; resolve ordinary technical choices from evidence.

## Handoff

All required phases implemented with production-path evidence → `@qa`.
