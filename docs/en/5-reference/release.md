# Release Guide

## CI
- Workflow: `.github/workflows/ci.yml`
- Triggers: push to `main`, pull requests
- Steps: install, lint, test, `npm pack --dry-run`

## npm publish
- Workflow: `.github/workflows/release.yml`
- Triggers: `v*` git tags or manual dispatch
- Required GitHub Actions secret name: `NPM_TOKEN`

## npm package name
The published package name is `@jaimevalasek/aioson`.

The unscoped name `aioson` was rejected by npm because it is considered too similar to an existing package, so releases should use the scoped package.

## Recommended release flow
1. Update `CHANGELOG.md`.
2. Bump version in `package.json`.
3. Commit and push to `main`.
4. Create and push a tag like `v0.1.1`.
5. Verify publish logs in GitHub Actions or in the local npm publish output.

## Templates
- Release notes template: `.github/release-notes-template.md`
- Extended release notes guide: `docs/en/release-notes-template.md`
- Tag flow checklist: `docs/en/release-flow.md`
