---
slug: antigravity-execution-adapter
status: done
owner: dev
created_at: 2026-09-13
source: direct-user-request
---

# Antigravity execution adapter

## Scope
Complete the existing Antigravity CLI registration with the requested `antigravity` execution host using `agy`; preserve the existing interactive `agy` name.

## Context selected
Validated project context; dev context:brief must-load rules; existing qwen/claude adapters, base adapter and central tool registry. Official agy headless/reference documentation and installed CLI help. Local stdin `/model` probe returned Gemini 3.8 Flash High with exit 0.

## Implementation intelligence
Reuse createAdapter, raw stdin transport, central unattended permissions, existing dispatcher/signature registries and host validation. No new transport, dependency, authentication flow or permission policy. Read-only requests remain unsupported until independently verified. Preserve unrelated workflow and dirty edits.

## Expected files
- behavior: src/agent-execution/adapters/antigravity.js
- behavior: src/lib/tool-capabilities.js
- behavior: src/agent-execution/schema.js
- support: src/agent-execution/dispatcher.js
- support: src/agent-execution/execution-run.js
- support: src/lib/host-signature.js
- support: tests/antigravity-adapter.test.js
- support: tests/tool-capabilities.test.js
- support: tests/host-signature.test.js (two exact host-list expectations)
- support: this checkpoint

Scope review: three behavior files, two existing modules; one additional existing regression test file needed its two exact host lists updated after the new registration. One existing host integration pattern and one observable outcome; no independently valuable capability added.

## Done criteria
Host offered and valid in execution roles; adapter invokes agy, preserves exact model, low/medium/high effort, roots and timeout, passes prompt on stdin without shell interpolation; default dispatchers and signature use it. Focused tests pass; linked CLI smoke reports actual outcome.

## Useful options considered
- Include now: stdin (verified locally), unattended flag from existing registry, explicit provider timeout, isolated argv, registration regression tests.
- Defer: automated agy model catalog, read-only researcher support, application lane compilation and execution.
- Escalate: user selection of Gemini 3.8 Flash variant before changing the application's model configuration.

## Verification
node --test tests/antigravity-adapter.test.js tests/tool-capabilities.test.js tests/agent-execution-adapters.test.js tests/execution-unattended.test.js tests/host-signature.test.js
Linked `aioson tool:capabilities` and bounded actual agy adapter smoke.

## Session state
Completed framework adapter and registration. No application workers started, no application roles enabled or edited. The application's `gemini 3.8 flash` is still a human label and must become the selected exact model slug before dispatch; model catalog lookup is intentionally not claimed.

## Evidence
- Red: 3 new tests failed before implementation (host absent and missing adapter).
- Green: 57 adapter/registry/signature/unattended tests plus 45 dispatcher/execution-run tests; 102 passed, zero failures.
- Scoped `git diff --check`: passed (only local CRLF conversion notices).
- Linked `aioson tool:capabilities --tool=antigravity --json`: binary agy, execution enabled.
- `installedExecutionHosts()`: includes antigravity; Creator Studio's existing mixed-host roles now pass structural validation.
- Actual linked CLI: `aioson host:signature --host=antigravity --model=gemini-3.8-flash-medium --effort=medium --timeout=120000 --json` returned valid on agy 1.2.2, authentication accepted, model accepted, stdout OK; unattended write verified with real file, stdout DONE and exit 0 in 49374 ms.
- Earlier 45000 ms probe wrote successfully but exceeded the timeout; correctly rejected, not treated as success. The successful retry replaced that signature with valid evidence. Medium was tested without changing the application's requested model preference.
- Host signature cached by the normal command under the operator's `.aioson/hosts/signatures.json`; temporary probe files managed by that command. No package publication, commits, unrelated workflow changes or global authentication changes.

## References
- https://antigravity.google/docs/cli/headless/
- https://antigravity.google/docs/cli/reference/
- Installed `agy --help`, `agy models`, and bounded stdin `/model` probes.
