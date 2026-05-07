# Squad Dashboard

The Squad Dashboard is a web panel built into the aioson CLI itself. It runs locally on the developer's machine and lets you monitor all squads in a project in real time — agents, active processes, context usage, tokens, execution logs, and metrics.

No additional installation required. It ships with aioson.

---

## Prerequisites

- aioson installed globally (`npm install -g @jaimevalasek/aioson`)
- At least one squad created in the project (`aioson squad:create`)
- Node.js ≥ 18 (already required by aioson)
- A modern browser (Chrome, Firefox, Safari, Edge)

---

## Starting the Dashboard

From the project root (where `.aioson/` lives):

```bash
aioson squad:dashboard
```

Expected output:
```
Squad Dashboard running at http://localhost:4180 (port 4180)
Press Ctrl+C to stop.
```

Open `http://localhost:4180` in your browser. Press `Ctrl+C` in the terminal to shut it down.

---

## Options

```bash
aioson squad:dashboard [path] [--port=4180] [--squad=<slug>] [--locale=en]
```

| Option | Default | Description |
|--------|---------|-------------|
| `path` | `.` (current directory) | Project root |
| `--port` | `4180` | HTTP port for the dashboard |
| `--squad` | — | Open directly on a specific squad page |
| `--locale` | `en` | Interface language |

---

## Examples

### Start in the current project
```bash
cd ~/projects/dental-clinic
aioson squad:dashboard
```

### Custom port
```bash
aioson squad:dashboard --port=4200
```

### Point to another directory
```bash
aioson squad:dashboard /home/user/projects/marketing
```

### Open directly on a specific squad
```bash
aioson squad:dashboard --squad=marketing-odonto
# → Redirects automatically to http://localhost:4180/squad/marketing-odonto
```

### Multiple projects at the same time (different ports)
```bash
# Terminal 1
aioson squad:dashboard ~/projects/clinic --port=4180

# Terminal 2
aioson squad:dashboard ~/projects/ecommerce --port=4181
```

---

## Navigating the Dashboard

### Home — Squad List

At `http://localhost:4180` you see all squads in the project with:

- Name and mode (`content`, `software`, `mixed`)
- Number of executors (agents)
- Current status
- Link to the squad detail page

If no squads appear, check that `.aioson/squads/*/squad.manifest.json` exists.

---

### Squad Page — Panels

Each squad has its own URL: `http://localhost:4180/squad/{slug}`

Available panels depend on squad configuration:

#### Panel: Overview

Summary of the squad:
- Total content items produced
- Number of registered sessions
- Accumulated learnings
- Delivery rate
- Execution plan (if defined)
- Pipeline information

#### Panel: Agents (Processes)

Lists active Claude/AI agents:

| Column | What it shows |
|--------|---------------|
| Agent | Executor slug |
| PID | OS process ID |
| Elapsed | Session duration (`HH:MM:SS`) |
| Context | Context window usage % |
| URL | Link to open the AI session (if available) |
| Action | Button to stop the process via SIGTERM |

> Process data auto-refreshes every 5 seconds via SSE (Server-Sent Events).

#### Panel: Context

Context window monitor per agent:

- **Visual gauge** showing % usage
- **Alert level**:
  - Green: 0–84% → Normal
  - Yellow: 85–94% → Warning
  - Red: 95–99% → Critical
  - Purple: 100%+ → Overflow
- Automatic compact detection (a drop > 30% indicates context was compacted)
- Breakdown by category (system prompt, conversation history, tool outputs, etc.)

#### Panel: Tokens

Token usage and estimated cost per agent:

- Total tokens consumed in the session
- Estimated cost in USD (based on Sonnet-class model pricing)
- **Waste flag**: appears when `tool_outputs > 60%` of total
- Breakdown by category (input, output, tool_use_input, tool_outputs, cache_write, cache_read)

#### Panel: Execution Logs

Detailed history of task executions:

- Entries filterable by type:
  - `tool_call` — tool calls with input/output
  - `reasoning` — agent reasoning
  - `milestone` — important checkpoints
  - `error` — errors with optional stack trace
- Timeline ordered by timestamp
- Filter by session

#### Panel: Hunk Review

Code review in hunks (for software squads):

- List of hunks pending review
- Available actions: **Approve**, **Reject** (comment required), **Comment**
- Progress: `approved / rejected / pending / revised`
- Re-submit: approved hunks keep their status; only rejected ones return to pending

#### Panel: Content

Content items produced by the squad (for content squads):

- List of indexed outputs
- Type and layout of each item
- Responsible agent

#### Panel: Learnings

Learnings accumulated by the squad:

- Active, stale, and archived learnings
- Type: preference, process, domain, quality
- Confidence: high, medium, low

#### Panel: Metrics

Custom metrics configured via `aioson squad:roi`:

- Current value vs. baseline vs. target
- Period
- Visual progress bar
- Calculated ROI (when configured)

#### Panel: Integrations

Status of MCPs configured in the squad:

- Active connectors (WhatsApp, Telegram, Webhook, etc.)
- Status: connected / unconfigured / error
- Total calls and failures

#### Panel: Recovery Context

Recovery context generated for each agent (post-compact injection):

- Content of `recovery-context.md`
- Token estimate
- Generation timestamp

---

## Use Cases by Squad Type

### Content Squad (e.g. Dental Clinic Marketing)

```bash
# The squad is generating Instagram posts and blog content
aioson squad:dashboard --squad=marketing-odonto

# Most relevant panels:
# → Content: see generated posts
# → Agents: see copywriter and strategist running
# → Learnings: accumulated tone and format preferences
```

### Software Squad (e.g. Scheduling Feature)

```bash
aioson squad:dashboard --squad=scheduling-v2

# Most relevant panels:
# → Hunk Review: review code before merging
# → Logs: follow agent tool_calls
# → Context: monitor if the agent is near the limit
```

### Squad with Workers and Daemon

```bash
# First start the daemon (automated workers)
aioson squad:daemon start --squad=clinic

# In another terminal, start the dashboard
aioson squad:dashboard --squad=clinic

# Most relevant panels:
# → Metrics: no-show rate, ROI
# → Integrations: WhatsApp Business status
# → Agents: see live processes
```

---

## Integration with Other Commands

The dashboard reads data generated by other aioson commands. For panels to show rich data:

| To see in the dashboard | Command that generates the data |
|-------------------------|---------------------------------|
| Metrics and ROI | `aioson squad:roi metric --squad=X` |
| MCP status | `aioson squad:mcp configure --squad=X` |
| Active processes | Agents running that write to `.aioson/squads/{slug}/processes/` |
| Context window | Agents that write to `.aioson/squads/{slug}/context-monitor.json` |
| Token usage | Agents that write to `.aioson/squads/{slug}/token-usage.json` |
| Learnings | `aioson squad:learning` and auto-registered sessions |
| Recovery context | `aioson squad:recovery --squad=X --agent=Y` |

---

## Data Requirements

The dashboard works even without all data present. What each panel needs:

```
.aioson/
  squads/
    {slug}/
      squad.manifest.json          ← required (squad appears in the list)
      context-monitor.json         ← Context panel
      token-usage.json             ← Tokens panel
      processes/
        {agent}.json               ← Agents panel
      recovery-context.md          ← Recovery panel
  runtime/
    aios.sqlite                    ← Content, Learnings, Metrics, Integrations panels
```

If the SQLite database doesn't exist, dependent panels appear empty but the dashboard does not crash.

---

## Squad Dashboard vs. aioson-dashboard

| | Squad Dashboard | aioson-dashboard |
|---|---|---|
| **What it is** | HTTP server embedded in the CLI | Installable Next.js app (premium) |
| **How to access** | `aioson squad:dashboard` | Install and run separately |
| **Focus** | Project squads in real time | General management — projects, genomes, pipelines, cloud |
| **Port** | `localhost:4180` (configurable) | Defined by the app |
| **Extra install** | No — ships with aioson | Yes |
| **Cost** | Free | Premium |

When both are running, aioson-dashboard shows an **"Open Squad Dashboard"** button on each squad page, linking directly to the correct URL.

---

## Troubleshooting

### Dashboard won't start — port in use

```
Port 4180 is already in use. Try --port=<other>
```

Use a different port:
```bash
aioson squad:dashboard --port=4200
```

### No squads on the home page

Check that the manifest exists:
```bash
ls .aioson/squads/*/squad.manifest.json
```

If not, create the squad first:
```bash
aioson squad:create . --squad=my-squad
```

### Panels appear empty

Normal for new projects or squads without runtime data. Panels populate as agents run and write their data files.

### Process panel stops updating

The agents panel uses SSE with a 5-second interval. If it stops updating, refresh the page.

### Command not found after updating aioson in a project

The global binary may be outdated:
```bash
npm update -g @jaimevalasek/aioson
```

---

## Quick Reference

```bash
# Start
aioson squad:dashboard

# Custom port
aioson squad:dashboard --port=4200

# Specific squad
aioson squad:dashboard --squad=my-squad

# Project in another directory
aioson squad:dashboard /path/to/project

# Help
aioson squad:dashboard --help
```
