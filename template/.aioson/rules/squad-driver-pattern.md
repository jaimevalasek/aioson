---
name: squad-driver-pattern
description: Territory boundaries and integration pattern for AIOSON squads — separates squad definitions (owned by @squad) from application driver code (owned by @dev)
priority: 9
version: 1.0.0
agents: [dev, sheldon, pm, qa, architect]
modes: [planning, executing]
task_types: [squad-integration, driver]
load_tier: trigger
triggers: [squad, driver, embedding prompts, squad runner, llm call]
paths: [.aioson/squads/**, src/services/**]
---

# Squad Driver Pattern

Two distinct layers — never mixed:

```
Layer 1 — Definition (owned by @squad)
  .aioson/squads/{squad-slug}/
    agents/greeting-agent.md     ← prompt and personality
    agents/orquestrador.md       ← orchestration logic
    squad.manifest.json          ← configuration
    workflows/main.md            ← execution pipeline

Layer 2 — Driver (owned by @dev)
  src/services/squadRunner.js    ← loads and executes definitions
  src/services/greetingService.js ← driver consuming greeting-agent.md
```

## Territory rules — absolute for all agents

| Agent | Can create/modify | Must never touch |
|---|---|---|
| `@squad` | `.aioson/squads/` | Application code (`src/`, `app/`, etc.) |
| `@dev` | Application code | `.aioson/squads/` |
| `@pm` | Implementation plan | Either layer |
| `@architect` | `architecture.md` | Squad files or agent code |

## Correct integration pattern

The application service is a **driver** — loads the squad definition and sends it to the LLM. Never embeds prompts in code.

```javascript
// CORRECT — driver consuming @squad definition
class GreetingService {
  async respond(message) {
    const agentDef = fs.readFileSync(
      '.aioson/squads/squad-greeting/agents/greeting-agent.md', 'utf-8'
    )
    return await llm.call({ system: agentDef, user: message })
  }
}

// WRONG — prompt embedded in code (@dev must not do this)
class GreetingService {
  async respond(message) {
    const prompt = "Voce e um atendente de farmacia..." // ← @squad territory
    return await llm.call({ system: prompt, user: message })
  }
}
```

## Per-agent responsibilities

**`@product` / `@sheldon`:** describe squad behavior and objective in PRDs — never literal prompts. Prompts are `@squad` territory.

**Optional `@analyst` / `@architect`:** when asked one concrete squad-driver question, return this boundary to Product, Planner, Dev, or the dossier; do not create `architecture.md`:
```
SquadRunner — loads definitions from .aioson/squads/ and executes via LLM API
  dependencies: fs (read .md), llm-client (model call)
  no domain logic — only orchestrates loading and execution
```

**Optional `@pm`:** advise Planner on priority or release sequencing without creating a second implementation plan:
- Squad phases → `executor: @squad`
- Driver phases → `executor: @dev` with task "create SquadRunner that loads `.aioson/squads/{slug}/`"

**`@dev`:** never write inline prompts. If a task requires creating/modifying files in `.aioson/squads/` — stop and redirect to `@squad`.

**`@squad`:** read `implementation-plan` and `prd` before asking anything — context is already in artifacts.

**`@qa`:** verify:
- [ ] Squad services are drivers (load `.md`, never embed prompts)
- [ ] No agent prompt is hardcoded in application code
- [ ] `.aioson/squads/` was not modified by `@dev`
