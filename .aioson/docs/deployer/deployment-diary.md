---
description: "Deployment diary format and operator communication rules for @deployer — status table, decisions, non-secret inventory, timeline, problems with symptom/cause/solution/status, next-steps checklist, and the step-by-step message format for non-developer operators."
agents: [deployer]
task_types: [deployment-diary, operator-guidance]
triggers: [deployment diary, deploy diary, diario do deploy, diario da instalacao]
---

# Deployer — Deployment Diary and Operator Communication

## 1. Why a diary

A deployment runs over several sessions, and the conversation is compacted on the
way. The diary is the state of record: a new session reads it first and resumes
from its checklist. Update it after **every** proven stage or solved problem, with
the local date and time.

Location: the project's existing deployment diary when there is one (e.g.
`docs/<area>/deploy-diary.md`); otherwise `.aioson/context/deploy-{environment}.md`.
A generic fix (true for any install) also goes to the project's setup guide
"common problems" section.

## 2. Format

```markdown
# <Project> — Deployment diary (<environment>)

> What was done on this server, in order, with the problems found and how they were solved.
> **No secrets in this file** — passwords and keys live in the panel and the password manager.

## 1. Status now
_Updated <date>, <time> (<timezone>)._

| Item | Status |
|---|---|
| Panel (domain, HTTPS, port 3000 closed, 2FA) | ✅ / ⏳ + evidence |
| Database service | … |
| Cache service | … |
| Git access | … |
| Application (last deploy, health) | … |
| Domain and certificate (issuer, expiry) | … |
| Provider firewall | … |
| Access gate / backup / data migration | … |

## 2. Decisions
- <decision> — <why> (<date>)

## 3. Inventory (no secrets)
| Item | Value |
|---|---|
| Provider plan / server name / IP | … |
| Dokploy version | … |
| Services: name · internal App Name · image · volume path · external port | … |
| Application: provider, branch, build type, volumes, swarm order, replicas, domain, container port | … |
| Variable NAMES only | … |
| Deploy key name and SHA256 fingerprint | … |
| DNS records (type, name, target, proxy on/off) | … |
| Firewall rules | … |

## 4. Timeline
| Time | What happened |
|---|---|

## 5. Problems and solutions
### 5.N <short title>
- **Symptom:** exact message or screen.
- **Cause:** proven, with the log line.
- **Solution:** steps or command.
- **Status:** ✅ solved (when) / ⏳ pending (what is missing).

## 6. Next steps
- [x] done item
- [ ] open item — **blocking** when it must happen before another stage
```

Rules: names, versions and fingerprints are fine; passwords, tokens, private keys,
connection strings with credentials, and personal data never are. When a secret
leaked in a screenshot, record the rotation as a problem with its status.

## 3. Talking to the operator

Many operators are not developers, and some have low vision. Every message:

- One stage, one action at a time; numbered steps with the exact menu path and the
  exact value per field ("leave as default" is a valid instruction).
- Headings (`##`/`###`) for what matters and `---` between blocks; short lines;
  tables for field-by-field checks of a screenshot.
- Commands in fenced blocks, one per line, ready to paste; say where to run them
  (VPS terminal vs app terminal vs local machine).
- Warn before irreversible or lock-out risks (closing the panel port, enabling the
  firewall, deleting a service) and say the safe order.
- End with "what this means for you now" (one or two sentences on impact) and a
  short plain-language glossary of the technical terms used in that message.
- Ask for a screenshot at the end of each stage — and remind them to mask secret
  values (the eye icon) before taking it.
