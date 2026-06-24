---
slug: design-skills-quality
status: done
owner: dev
created_at: 2026-06-24
updated_at: 2026-06-24
classification: MICRO
risk: medium
source: direct-user-request
---

# Simple Plan - Design Skills Quality

## Scope
Improve `.aioson/skills/design` and `template/.aioson/skills/design` so packaged design skills are discoverable, valid, and operationally force higher-quality UI output instead of generic CSS/template visuals.

## Context selected
- context:brief / fallback evidence: `context:brief` planning and executing returned high confidence and selected design skill paths, `src/constants.js`, `tests/agent-contracts.test.js`, simple-plan lane, output brevity, disk-first artifacts, code reuse, naming, data format, and source-code language rules.
- Existing pattern to follow: packaged skill trees live in both workspace and `template/`; `src/constants.js` `MANAGED_FILES` is the installer/update managed-file contract; `tests/agent-contracts.test.js` has a packaged design skills contract.
- Applicable rule/doc: `.aioson/docs/dev/stack-conventions.md`, `.aioson/docs/dev/simple-plan-lane.md`, `prompt-sharpener`, `skill-creator`.

## Implementation intelligence
- Framework leverage: use existing template/workspace parity, existing Node test runner, existing managed-file contract tests, and skill validation script with `PYTHONUTF8=1`.
- Structure and data boundary: prompt/skill markdown changes stay inside design skill folders; installer contract updates stay in `src/constants.js`; regression coverage stays in `tests/agent-contracts.test.js`.
- Reuse over custom code: do not create a new generator; harden the current skill package and add shared quality gates where each skill already routes references.

## Done criteria
- All design `SKILL.md` files have parseable YAML frontmatter with actionable descriptions.
- `pt.squarespace.com` has valid frontmatter while preserving its extracted-site identity.
- All shipped design skill files are covered by `MANAGED_FILES` and the contract test.
- Skills include stronger execution gates for fonts, assets, layout, motion, responsive behavior, visual QA, and anti-generic output.
- Workspace and template design skill trees remain in sync.

## Useful options considered
- Include now: quote/fix frontmatter, add missing frontmatter, add/strengthen common quality gates, remove or constrain conflicts with current frontend standards, extend managed-file coverage and tests.
- Defer: forward-test by generating full sample sites with each skill; this is useful but too large for the current repair slice.
- Escalate: redesigning the taxonomy of design skills or choosing a new default `design_skill` for projects.

## Out of scope
- Renaming existing skill folders.
- Changing product workflow stages.
- Building a new website/app as a visual demo.
- Altering unrelated agent prompts.

## Expected files
- `.aioson/skills/design/**/SKILL.md`
- `.aioson/skills/design/**/references/*.md`
- `template/.aioson/skills/design/**/SKILL.md`
- `template/.aioson/skills/design/**/references/*.md`
- `src/constants.js`
- `tests/agent-contracts.test.js`

## Verification
- `PYTHONUTF8=1 python C:\Users\jaime\.codex\skills\.system\skill-creator\scripts\quick_validate.py <skill-dir>` for each design skill
- `node --test tests/agent-contracts.test.js`
- `node scripts/check-js.js`

## Session state
Completed: frontmatter repaired, design quality gates strengthened, template/workspace parity preserved, managed-file coverage expanded, and validations passed.

## Notes
- Initial validation found invalid YAML in every quoted `design_skill:` description and missing frontmatter in `pt.squarespace.com`.
- `feature:sweep --dry-run` found `briefing-refiner` and `loop-guardrails` pending archive; archiving was skipped because interactive question tooling is unavailable in Default mode.
- Added common execution gates across all design skills for reference loading, token-first CSS, real font delivery, assets, icons, responsive constraints, motion, reduced-motion, browser/static inspection, and anti-generic output.
- Replaced positive guidance for isolated blurred-circle backgrounds in `aurora-command-ui` and `glassmorphism-ui` with full-bleed ambient field guidance.
- Verification passed: 20 design skills validated, `node --test tests/agent-contracts.test.js`, `node scripts/check-js.js`, workspace/template hash parity, and `git diff --check`.
- Follow-up after user reported a broken `cognitive-core-ui` app output: hardened Cognitive Core with app stability gates, grid-based shells, `minmax(0, ...)` regions, scroll-pane `min-width/min-height: 0`, responsive auto-fit stat/card grids, non-fixed list/detail rails, zero tracking, and ambient auth backgrounds.
- Follow-up visual pass: rewrote `docs/design-previews/cognitive-core-ui.html` and `cognitive-core-ui-website.html`, added shared `cognitive-core-ui-preview.css`, created `list-detail`, `settings`, and `auth` examples, updated gallery links, reviewed Playwright screenshots for desktop/mobile, and verified 12/12 pages/viewports without horizontal overflow.
- Kanban follow-up: added `cognitive-core-ui-kanban.html` plus shared CSS primitives for responsive board columns, compact cards, owner avatars, WIP/progress states, and updated gallery/topbar links; screenshots desktop/mobile and overflow checks passed.
