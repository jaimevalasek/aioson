# Task: Squad Output Configuration

> Loaded on-demand by `@squad` when configuring output strategy.
> Trigger: `@squad --config=output --squad={slug}` or auto-detected during creation.

## Purpose

Guide the user through configuring how the squad writes, routes, and delivers its outputs.
Write the result into `outputStrategy` in `squad.manifest.json`.

## Non-negotiable storage boundary

- Every canonical squad output is a file under `output/{slug}/` or the explicit `rules.outputsDir`.
- `.aioson/runtime/aios.sqlite` is a local, rebuildable index for the current clone only.
- Never offer database-only storage and never make SQLite the only copy of content.
- Never write `dataOutput` in a new manifest. Runtime indexing is framework behavior, not an output destination.
- `mode: "sqlite"`, `mode: "hybrid"`, and `storagePolicy.primary: "sqlite"` are legacy inputs to migrate, not choices to present.

## Domain heuristics — suggest formats, not storage engines

Before asking questions, infer the best file package from the squad domain:

| Domain pattern | Suggested file package | Reasoning |
|---------------|------------------------|-----------|
| Landing page, site, presentation | HTML + assets | Directly reviewable deliverable |
| Copy, social media, product descriptions | JSON + Markdown preview | Structured, diffable and webhook-ready |
| YouTube/editorial package | JSON + HTML + media references | Keeps structured data and human review together |
| Report/PDF generator | Markdown/HTML + PDF worker | Source stays versionable; PDF is an export |
| Blog/newsletter | Markdown + JSON metadata + HTML preview | Portable across CMS and delivery targets |
| Research/analysis/strategy | Markdown + optional JSON evidence | Human-readable, searchable evidence |
| Data pipeline/structured extraction | JSON/CSV + schema | Machine-readable without a shared local database |
| Image/video/media generation | JSON manifest + media files | References and binaries remain explicit |

## Configuration wizard

Present the inferred suggestion and ask for confirmation:

> "Based on the domain **{domain}**, I suggest:
>
> **Output package: {formats}**
> - Files will be written under `{outputsDir}`.
> - The local runtime may index them for dashboard/search, but the files remain the source of truth.
>
> Does this fit your workflow, or do you want to adjust?"

If the user wants to adjust, walk through these questions:

### Q1 — File package
> "Which reviewable formats should this squad generate?"
> - **Markdown/HTML** — human review and presentation
> - **JSON/CSV** — structured consumption
> - **Both** — structured source plus human preview
> - **Media package** — JSON manifest plus files under `media/{slug}/`

### Q2 — Delivery
> "Should finished content be delivered somewhere automatically?"
> - **No** — keep the generated files in the project
> - **Cloud** — publish to aioson.com when I click publish
> - **Webhook** — POST to an external URL (website, CMS, API)
> - **Both** — cloud + webhook

### Q3 — Webhook config (only if webhook selected)
> "Configure the webhook:"
> - **URL**: the endpoint to POST to (or use `{{ENV:WEBHOOK_URL}}` for env variable)
> - **Auth**: Bearer token? (or use `{{ENV:WEBHOOK_TOKEN}}`)
> - **Trigger**: on-publish (manual) or on-create (automatic)?

### Q4 — Auto-publish (only if webhook or cloud selected)
> "Should content be published automatically after creation?"
> - **No** — I'll review and publish manually from dashboard
> - **Yes** — publish automatically when the agent finishes

## Output — write to manifest

After collecting answers, write `outputStrategy` to `squad.manifest.json`:

```json
{
  "outputStrategy": {
    "mode": "files",
    "fileOutput": {
      "enabled": true,
      "dir": "output/{squad-slug}/",
      "formats": ["html", "md", "json"]
    },
    "delivery": {
      "webhooks": [
        {
          "slug": "{webhook-slug}",
          "url": "{{ENV:WEBHOOK_URL}}",
          "trigger": "on-publish",
          "format": "json",
          "headers": {
            "Authorization": "Bearer {{ENV:WEBHOOK_TOKEN}}"
          },
          "worker": ".aioson/squads/{squad-slug}/workers/webhook-post.py"
        }
      ],
      "cloudPublish": false,
      "autoPublish": false
    }
  }
}
```

Also normalize the storage policy:

```json
{
  "storagePolicy": {
    "primary": "file",
    "artifacts": "output/{squad-slug}/",
    "exports": { "html": true, "markdown": true, "json": true }
  }
}
```

## Delivery worker generation

If webhook is configured, generate a delivery worker at `.aioson/squads/{squad-slug}/workers/webhook-post.py`:

```python
#!/usr/bin/env python3
"""Delivery worker: POST content items to configured webhook."""
import json, sys, os, urllib.request, urllib.error

def main():
    # Framework worker input contract: AIOSON_WORKER_INPUT_FILE when set,
    # else argv. A large payload never fits in argv on Windows.
    input_file = os.environ.get('AIOSON_WORKER_INPUT_FILE') or (sys.argv[1] if len(sys.argv) > 1 else None)
    if input_file:
        with open(input_file, 'r', encoding='utf-8') as f:
            payload = json.load(f)
    else:
        payload = json.load(sys.stdin)

    url = os.environ.get('WEBHOOK_URL')
    token = os.environ.get('WEBHOOK_TOKEN', '')

    if not url:
        print('ERROR: WEBHOOK_URL not set', file=sys.stderr)
        sys.exit(1)

    headers = {'Content-Type': 'application/json'}
    if token:
        headers['Authorization'] = f'Bearer {token}'

    data = json.dumps(payload).encode('utf-8')
    req = urllib.request.Request(url, data=data, headers=headers, method='POST')

    try:
        with urllib.request.urlopen(req) as resp:
            print(f'OK: {resp.status} {resp.reason}')
    except urllib.error.HTTPError as e:
        print(f'ERROR: {e.code} {e.reason}', file=sys.stderr)
        sys.exit(1)

if __name__ == '__main__':
    main()
```

Register the worker in the manifest:
```json
{
  "slug": "webhook-post",
  "title": "Webhook Delivery",
  "type": "worker",
  "role": "POST content to configured webhook endpoint",
  "entrypoint": ".aioson/squads/{squad-slug}/workers/webhook-post.py",
  "runtime": "python",
  "deterministic": true,
  "usesLLM": false
}
```

## Compatibility with storagePolicy

For a legacy squad with `mode: "sqlite"`, `mode: "hybrid"`, `dataOutput`, or
`storagePolicy.primary: "sqlite"`:

1. Locate or recreate the canonical files under `rules.outputsDir` before changing the manifest.
2. Set `outputStrategy.mode` to `"files"` and `fileOutput.enabled` to `true`.
3. Remove `dataOutput`; local indexing does not belong in a shareable squad contract.
4. Set `storagePolicy.primary` to `"file"` and `storagePolicy.artifacts` to the output directory.
5. Preserve delivery/webhook settings because they operate on the generated file payload.

Never delete a database-only legacy payload until a file export has been verified. The validator may read legacy
values and warn, but every newly written or imported strategy must use the file-first contract.

## After configuration

Show summary:
```
Output strategy configured for **{squad-name}**:
- Mode: files
- Canonical files: enabled → {dir}
- Local runtime index: optional/rebuildable per clone (not shared)
- Delivery: {none | cloud | webhook | cloud+webhook}
- Auto-publish: {yes/no}

{if webhook: Delivery worker created at `.aioson/squads/{slug}/workers/webhook-post.py`}
{Reminder: Set WEBHOOK_URL and WEBHOOK_TOKEN in your environment if using {{ENV:}} placeholders.}
```
