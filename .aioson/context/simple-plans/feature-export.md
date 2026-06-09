---
slug: feature-export
lane: simple-plan
status: done
agent: dev
created: 2026-06-08
---

# Simple Plan — `feature:export`

## Goal
Add a non-destructive CLI command that copies every artefact belonging to a feature
slug into a clean output directory the user picks, so AIOSON's markdown output becomes
a portable deliverable (read/analyse outside the project, or use AIOSON purely as a
spec generator). Mirror of `feature:archive` but **copy, not move**, to an arbitrary
`--out`, leaving the source tree untouched.

## Scope (in)
- New command `feature:export` / `feature-export`.
- Reuse `feature:archive`'s slug-collision-safe enumeration (root `*-{slug}.{md,yaml,yml,json}`
  excluding global files + the 3 slug dirs: `context/features/{slug}` dossier,
  `.aioson/plans/{slug}`, `.aioson/briefings/{slug}`), plus `context/done/{slug}` when archived.
- Flags: `--out=<dir>` (default `<target>/{slug}-export`), `--flatten`, `--no-index`,
  `--dry-run`, `--json`.
- Default structure: **mirrored** (`dossier/`, `plans/`, `briefings/`, `done/`).
- Generate `INDEX.md` by default (suppress with `--no-index`).

## Scope (out)
- No move/delete of source artefacts (non-destructive by definition).
- No agent — pure deterministic file I/O; an LLM-driven `--digest` summary is a possible
  future layer, not this slice.
- No i18n / help-line (parity with `feature:archive`, which uses plain logger strings).

## Done criteria
- `aioson feature:export . --feature=<slug>` copies all matching artefacts to the out dir,
  source tree unchanged, `INDEX.md` written, `--dry-run`/`--json` honoured.
- `--flatten` collapses subdirs into `label-file.ext`; `--no-index` skips INDEX.
- Slug-collision guard from archive is honoured (no foreign-slug leakage).

## Expected files
- `src/commands/feature-export.js` (new)
- `src/commands/feature-archive.js` (add + export `collectFeatureArtifacts`, additive)
- `src/parser.js` (add `flatten`, `no-index` to boolOnly)
- `src/cli.js` (require + known-commands + dispatch branch)
- `tests/feature-export.test.js` (new)
- `docs/{pt,en,fr}/5-*/feature-export.md` (reference; after core is green)

## Verification
`node --test tests/feature-export.test.js` + `node --test tests/parser*.test.js` +
`node bin/aioson.js feature:export . --feature=<slug> --dry-run` smoke.
