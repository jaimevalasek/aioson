# Release Tag Flow

## Preconditions
- Git repository initialized and connected to GitHub.
- `main` branch green in CI.
- npm authentication available only when a human explicitly authorizes the
  separate publish step.

## Steps
1. Update `CHANGELOG.md` and `package.json` version.
2. Commit release changes.
3. Run the gate from a clean checkout of the release commit, never from the
   shared working tree:
   - `git worktree add --detach ../aioson-release <sha>` (a short sibling path;
     Windows `MAX_PATH` breaks deeper ones)
   - `cd ../aioson-release && npm ci && npm run verify:release`
   - During development only, `npm run verify:release:quick` in the working
     tree runs the non-test package, dependency, audit, and Git-boundary checks.
   The worktree exists because `npm pack` and the untracked-files check read
   the working tree, not the commit: uncommitted edits from another session
   would either trip the gate or ship inside the tarball.
4. Create tag:
   - `git tag vX.Y.Z`
5. Push branch and tag:
   - `git push origin main --tags`
6. Watch the validation-only `Release` workflow in GitHub Actions.
7. After it is green, explicitly authorize and run
   `npm publish --access public` from the same clean worktree (the tarball is
   built from the directory you publish from).
8. Publish the GitHub release using `.github/release-notes-template.md`.
9. Remove the worktree once the version is on npm:
   `git worktree remove ../aioson-release`. It holds no exclusive commits, so
   nothing is lost; `git worktree list` shows whether one is still attached.

## Verify publication
- `npm view @jaimevalasek/aioson version`
- `npx @jaimevalasek/aioson@latest info`

## What the release gate proves

`verify:release` (and `:quick`) first reads the repository's own CI verdict for
the branch being released: a red `CI` workflow blocks the gate — the "main green
in CI" precondition above used to be prose, and eight versions shipped on top of
a CI that had failed on every push since 2026-08-19. `--allow-red-ci` is the
conscious override for a failure that is understood and not in the release; an
unreachable GitHub API is recorded as `unknown` and never blocks, and inside
GitHub Actions the read is skipped.

It then rejects whitespace errors and untracked files under shipped
roots, runs the production dependency audit, validates the exact `npm pack`
inventory and local module closure, runs syntax/tests and the pre-publish smoke
chain, then installs the generated tarball in an isolated project and exercises
`init`, `setup:context`, `doctor`, and `mcp:init`.

`--allow-untracked` exists only for validating an in-progress working tree. It
must not be used for a release because an untracked runtime file cannot exist in
the tagged commit.
