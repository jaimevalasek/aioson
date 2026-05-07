# Release Tag Flow

## Preconditions
- Git repository initialized and connected to GitHub.
- `NPM_TOKEN` configured in repository secrets.
- `main` branch green in CI.

## Steps
1. Update `CHANGELOG.md` and `package.json` version.
2. Run local validation:
   - `npm run ci`
3. Commit release changes.
4. Create tag:
   - `git tag vX.Y.Z`
5. Push branch and tag:
   - `git push origin main --tags`
6. Watch `Release` workflow in GitHub Actions.
7. Publish GitHub release using `.github/release-notes-template.md`.

## Verify publication
- `npm view @jaimevalasek/aioson version`
- `npx @jaimevalasek/aioson@latest info`
