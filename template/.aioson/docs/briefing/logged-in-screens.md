---
description: How @briefing and @refiner see a logged-in screen of the current product, with no credential source opened and no session minted
agents: [briefing, refiner]
task_types: [briefing-enrichment, briefing-review, current-system-fit]
triggers: [logged-in screen, screen behind a login, tela logada, current product screen, dashboard screenshot, test account]
---

# Logged-in screens of the current product

To see a screen behind a login, take one of the routes below. Reading `.env`, a secret or a session store, or building a cookie or token by hand, is never a route, even for a screenshot. `agent:done` reports the read, and it stays on record for the owner.

## The routes, in order

1. **A seeded test account on a local app.** Run a walkthrough with a `screenshot` step: `value_env` for the password, `--save-state` to keep the session, and `--state` for the next screens. The CLI reads the value, so you never see it. See `.aioson/docs/qa/browser-walkthrough.md` § A test account and a reused session.
2. **The owner's signed-in browser.** Ask for one gesture: the browser open with its debugging port (`.aioson/docs/qa/browser-walkthrough.md` § Which browser), signed in to the account you need. Attach with `--cdp`, and the session stays theirs.
3. **Prints from the owner.** Ask once, naming each screen and the account it needs.

## What to record

- **Who saw it.** Name the account or role behind each screen. A screen seen as admin says nothing about what a member or a free account gets.
- **What nobody saw.** List the screens modeled from the code under `## Identified gaps` in the briefing and in the prototype manifest, with the account each one still needs. A print the owner promised and did not send stays on that list. Do not hold the work for it.
