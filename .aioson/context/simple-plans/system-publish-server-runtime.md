---
slug: system-publish-server-runtime
status: done
---

# Simple Plan — Preserve TypeScript Server Runtime in Build Publishes

## Goal

Make `aioson system:publish --build` retain TypeScript backend files under `server/` while continuing to exclude `node_modules` and frontend source.

## Context selected

- `src/commands/store-system.js` collects build packages and currently allows no `.ts` files.
- Published split-stack apps can legitimately use `tsx server/server.ts` as their production start command.

## Implementation intelligence

- Reuse the collector's existing path-aware filtering instead of adding a second packaging flow.
- Treat `server/**/*.ts` as runtime source only in build mode; leave `src/` and `node_modules` excluded.
- Add a focused regression test against the collector behavior.

## Useful options considered

- **Include now:** preserve TypeScript files only beneath `server/` in `--build` packages.
- **Defer:** compiling arbitrary backend projects in the CLI; that belongs to each app's build contract.
- **Defer:** change installed-app migration/onboarding behavior; unrelated to file collection.

## Expected paths

- `src/commands/store-system.js` — behavior
- `tests/store-system.test.js` — support

## Done criteria

- A build-mode collection contains `server/server.ts`.
- It still excludes `src/` and `node_modules/`.
- The focused test passes.

## Verification

- `node --test tests/store-system.test.js`
