'use strict';

const MANAGED_FILES = [
  'CLAUDE.md',
  'AGENTS.md',
  'OPENCODE.md',
  '.gemini/GEMINI.md',
  '.gemini/commands/aios-setup.toml',
  '.gemini/commands/aios-discovery-design-doc.toml',
  '.gemini/commands/aios-discover.toml',
  '.gemini/commands/aios-analyst.toml',
  '.gemini/commands/aios-architect.toml',
  '.gemini/commands/aios-ux-ui.toml',
  '.gemini/commands/aios-product.toml',
  '.gemini/commands/aios-deyvin.toml',
  '.gemini/commands/aios-pair.toml',
  '.gemini/commands/aios-pm.toml',
  '.gemini/commands/aios-dev.toml',
  '.gemini/commands/aios-qa.toml',
  '.gemini/commands/aios-orchestrator.toml',
  '.aioson/config.md',
  '.aioson/agents/setup.md',
  '.aioson/agents/discovery-design-doc.md',
  '.aioson/agents/discover.md',
  '.aioson/agents/analyst.md',
  '.aioson/agents/architect.md',
  '.aioson/agents/ux-ui.md',
  '.aioson/agents/product.md',
  '.aioson/agents/deyvin.md',
  '.aioson/agents/pair.md',
  '.aioson/agents/pm.md',
  '.aioson/agents/dev.md',
  '.aioson/agents/qa.md',
  '.aioson/agents/validator.md',
  '.aioson/agents/tester.md',
  '.aioson/agents/orchestrator.md',
  '.aioson/agents/pentester.md',
  '.aioson/agents/squad.md',
  '.aioson/agents/orache.md',
  '.aioson/agents/genome.md',
  '.aioson/agents/design-hybrid-forge.md',
  '.aioson/agents/site-forge.md',
  '.aioson/agents/profiler-researcher.md',
  '.aioson/agents/profiler-enricher.md',
  '.aioson/agents/profiler-forge.md',
  '.aioson/agents/copywriter.md',
  '.aioson/docs/squad/package-contract.md',
  '.aioson/docs/squad/creation-flow.md',
  '.aioson/docs/squad/research-loop.md',
  '.aioson/docs/squad/quality-lens.md',
  '.aioson/docs/squad/workflow-quality.md',
  '.aioson/docs/squad/content-output.md',
  '.aioson/docs/squad/session-operations.md',
  '.aioson/docs/squad/genome-bindings.md',
  '.aioson/docs/product/conversation-playbook.md',
  '.aioson/docs/product/research-loop.md',
  '.aioson/docs/product/quality-lens.md',
  '.aioson/docs/product/prd-contract.md',
  '.aioson/docs/deyvin/continuity-recovery.md',
  '.aioson/docs/deyvin/pair-execution.md',
  '.aioson/docs/deyvin/runtime-handoffs.md',
  '.aioson/docs/deyvin/debugging-escalation.md',
  '.aioson/docs/handoff-persistence.md',
  '.aioson/docs/sheldon/research-loop.md',
  '.aioson/docs/sheldon/web-intelligence.md',
  '.aioson/docs/sheldon/quality-lens.md',
  '.aioson/docs/sheldon/enrichment-paths.md',
  '.aioson/docs/sheldon/harness-contract.md',
  '.aioson/docs/dev/stack-conventions.md',
  '.aioson/docs/dev/execution-discipline.md',
  '.aioson/skills/process/decision-presentation/SKILL.md',
  '.aioson/skills/process/decision-presentation/references/jargon-map.en.yaml',
  '.aioson/skills/process/decision-presentation/references/jargon-map.pt-BR.yaml',
  '.aioson/skills/static/laravel-conventions.md',
  '.aioson/skills/static/tall-stack-patterns.md',
  '.aioson/skills/static/jetstream-setup.md',
  '.aioson/skills/static/rails-conventions.md',
  '.aioson/skills/static/node-express-patterns.md',
  '.aioson/skills/static/node-typescript-patterns.md',
  '.aioson/skills/static/nextjs-patterns.md',
  '.aioson/skills/static/ui-ux-modern.md',
  '.aioson/skills/static/landing-page-forge.md',
  '.aioson/skills/static/landing-page-deploy.md',
  '.aioson/skills/marketing/vsl-craft.md',
  '.aioson/skills/marketing/references/one-belief.md',
  '.aioson/skills/marketing/references/five-acts.md',
  '.aioson/skills/marketing/references/fascinations.md',
  '.aioson/skills/marketing/references/offer-structure.md',
  '.aioson/skills/marketing/references/pms-research.md',
  '.aioson/skills/marketing/references/patterns.md',
  '.aioson/skills/marketing/references/anti-patterns.md',
  '.aioson/skills/marketing/references/market-intelligence.md',
  '.aioson/genomes/copywriting.md',
  '.aioson/skills/static/web3-ethereum-patterns.md',
  '.aioson/skills/static/web3-solana-patterns.md',
  '.aioson/skills/static/web3-cardano-patterns.md',
  '.aioson/skills/static/web3-security-checklist.md',
  '.aioson/skills/static/git-conventions.md',
  '.aioson/skills/design/cognitive-core-ui/SKILL.md',
  '.aioson/skills/design/cognitive-core-ui/references/design-tokens.md',
  '.aioson/skills/design/cognitive-core-ui/references/components.md',
  '.aioson/skills/design/cognitive-core-ui/references/patterns.md',
  '.aioson/skills/design/cognitive-core-ui/references/motion.md',
  '.aioson/skills/design/cognitive-core-ui/references/dashboards.md',
  '.aioson/skills/design/cognitive-core-ui/references/websites.md',
  '.aioson/skills/design/premium-command-center-ui/SKILL.md',
  '.aioson/skills/design/premium-command-center-ui/references/visual-system.md',
  '.aioson/skills/design/premium-command-center-ui/references/patterns.md',
  '.aioson/skills/design/premium-command-center-ui/references/operations.md',
  '.aioson/skills/design/premium-command-center-ui/references/validation.md',
  '.aioson/skills/design/interface-design/SKILL.md',
  '.aioson/skills/design/interface-design/references/intent-and-domain.md',
  '.aioson/skills/design/interface-design/references/design-directions.md',
  '.aioson/skills/design/interface-design/references/tokens-and-depth.md',
  '.aioson/skills/design/interface-design/references/components-and-states.md',
  '.aioson/skills/design/interface-design/references/handoff-and-quality.md',
  '.aioson/skills/dynamic/laravel-docs.md',
  '.aioson/skills/dynamic/flux-ui-docs.md',
  '.aioson/skills/dynamic/npm-packages.md',
  '.aioson/skills/dynamic/ethereum-docs.md',
  '.aioson/skills/dynamic/solana-docs.md',
  '.aioson/skills/dynamic/cardano-docs.md',
  '.aioson/mcp/servers.md',
  '.aioson/schemas/genome.schema.json',
  '.aioson/schemas/genome-meta.schema.json',
  '.aioson/schemas/squad-manifest.schema.json',
  '.aioson/schemas/squad-blueprint.schema.json',
  '.aioson/schemas/readiness.schema.json',
  '.aioson/schemas/content-blueprint.schema.json',
  '.aioson/schemas/genome.schema.json',
  '.aioson/schemas/genome-meta.schema.json',
  '.aioson/tasks/squad-design.md',
  '.aioson/tasks/squad-create.md',
  '.aioson/tasks/squad-validate.md',
  '.aioson/tasks/squad-analyze.md',
  '.aioson/tasks/squad-extend.md',
  '.aioson/tasks/squad-export.md',
  '.aioson/tasks/squad-repair.md',
  '.aioson/tasks/squad-pipeline.md',
  '.aioson/tasks/squad-learning-review.md',
  '.aioson/profiler-reports/.gitkeep',
  '.aioson/advisors/.gitkeep'
];

const REQUIRED_FILES = [
  'CLAUDE.md',
  'AGENTS.md',
  'OPENCODE.md',
  '.gemini/GEMINI.md',
  '.gemini/commands/aios-setup.toml',
  '.gemini/commands/aios-discovery-design-doc.toml',
  '.gemini/commands/aios-discover.toml',
  '.gemini/commands/aios-analyst.toml',
  '.gemini/commands/aios-architect.toml',
  '.gemini/commands/aios-ux-ui.toml',
  '.gemini/commands/aios-pm.toml',
  '.gemini/commands/aios-dev.toml',
  '.gemini/commands/aios-qa.toml',
  '.gemini/commands/aios-orchestrator.toml',
  '.claude/commands/aioson/agent/setup.md',
  '.claude/commands/aioson/agent/discover.md',
  '.claude/commands/aioson/agent/dev.md',
  '.claude/commands/aioson/agent/qa.md',
  '.aioson/config.md',
  '.aioson/agents/setup.md',
  '.aioson/agents/discovery-design-doc.md',
  '.aioson/agents/discover.md',
  '.aioson/agents/analyst.md',
  '.aioson/agents/ux-ui.md',
  '.aioson/agents/dev.md',
  '.aioson/context/.gitkeep'
];

const CONTEXT_REQUIRED_FIELDS = [
  'project_name',
  'project_type',
  'profile',
  'framework',
  'framework_installed',
  'classification',
  'conversation_language',
  'aioson_version'
];

const CONTEXT_ALLOWED_CLASSIFICATIONS = ['MICRO', 'SMALL', 'MEDIUM'];
const CONTEXT_ALLOWED_PROJECT_TYPES = ['web_app', 'api', 'site', 'script', 'dapp', 'desktop_app'];
const CONTEXT_ALLOWED_PROFILES = ['developer', 'creator', 'team'];

const AGENT_DEFINITIONS = [
  {
    id: 'setup',
    displayName: 'Setup',
    command: '@setup',
    path: '.aioson/agents/setup.md',
    dependsOn: [],
    output: '.aioson/context/project.context.md'
  },
  {
    id: 'discovery-design-doc',
    displayName: 'Discovery/Design Doc',
    command: '@discovery-design-doc',
    path: '.aioson/agents/discovery-design-doc.md',
    dependsOn: ['.aioson/context/project.context.md'],
    output: '.aioson/context/design-doc.md + .aioson/context/readiness.md'
  },
  {
    id: 'discover',
    displayName: 'Discover',
    command: '@discover',
    path: '.aioson/agents/discover.md',
    dependsOn: ['.aioson/context/project.context.md'],
    output: '.aioson/context/bootstrap/what-is.md + .aioson/context/bootstrap/how-it-works.md + .aioson/context/bootstrap/what-it-does.md + .aioson/context/bootstrap/current-state.md'
  },
  {
    id: 'product',
    displayName: 'Product',
    command: '@product',
    path: '.aioson/agents/product.md',
    dependsOn: ['.aioson/context/project.context.md'],
    output: '.aioson/context/prd.md or .aioson/context/prd-{slug}.md (PRD base)'
  },
  {
    id: 'deyvin',
    displayName: 'Deyvin',
    command: '@deyvin',
    path: '.aioson/agents/deyvin.md',
    aliases: ['pair'],
    dependsOn: ['.aioson/context/project.context.md'],
    output: 'small code changes + continuity notes in spec.md + runtime logs/tasks'
  },
  {
    id: 'analyst',
    displayName: 'Analyst',
    command: '@analyst',
    path: '.aioson/agents/analyst.md',
    dependsOn: ['.aioson/context/project.context.md'],
    output: '.aioson/context/discovery.md'
  },
  {
    id: 'architect',
    displayName: 'Architect',
    command: '@architect',
    path: '.aioson/agents/architect.md',
    dependsOn: [
      '.aioson/context/project.context.md',
      '.aioson/context/discovery.md'
    ],
    output: '.aioson/context/architecture.md'
  },
  {
    id: 'ux-ui',
    displayName: 'UI/UX',
    command: '@ux-ui',
    path: '.aioson/agents/ux-ui.md',
    dependsOn: [
      '.aioson/context/project.context.md',
      '.aioson/context/prd.md or .aioson/context/prd-{slug}.md',
      '.aioson/context/discovery.md',
      '.aioson/context/architecture.md'
    ],
    output: '.aioson/context/ui-spec.md + Visual identity enrichment in prd.md or prd-{slug}.md'
  },
  {
    id: 'pm',
    displayName: 'PM',
    command: '@pm',
    path: '.aioson/agents/pm.md',
    dependsOn: [
      '.aioson/context/project.context.md',
      '.aioson/context/prd.md or .aioson/context/prd-{slug}.md',
      '.aioson/context/discovery.md',
      '.aioson/context/architecture.md',
      '.aioson/context/ui-spec.md (when present)'
    ],
    output: '.aioson/context/prd.md or prd-{slug}.md (enriched with delivery plan and acceptance criteria)'
  },
  {
    id: 'dev',
    displayName: 'Dev',
    command: '@dev',
    path: '.aioson/agents/dev.md',
    dependsOn: [
      '.aioson/context/project.context.md',
      '.aioson/context/discovery.md',
      '.aioson/context/architecture.md'
    ],
    output: 'code changes'
  },
  {
    id: 'pentester',
    displayName: 'Pentester',
    command: '@pentester',
    path: '.aioson/agents/pentester.md',
    dependsOn: [
      '.aioson/context/project.context.md',
      '.aioson/context/spec-{slug}.md (active feature)'
    ],
    output: '.aioson/context/security-findings-{slug}.json'
  },
  {
    id: 'qa',
    displayName: 'QA',
    command: '@qa',
    path: '.aioson/agents/qa.md',
    dependsOn: ['.aioson/context/discovery.md'],
    output: 'QA report'
  },
  {
    id: 'validator',
    displayName: 'Validator',
    command: '@validator',
    path: '.aioson/agents/validator.md',
    dependsOn: [
      '.aioson/plans/{slug}/harness-contract.json',
      '.aioson/plans/{slug}/progress.json'
    ],
    output: '.aioson/plans/{slug}/last-validator-output.json'
  },
  {
    id: 'tester',
    displayName: 'Tester',
    command: '@tester',
    path: '.aioson/agents/tester.md',
    dependsOn: ['.aioson/context/project.context.md'],
    output: '.aioson/context/test-inventory.md + .aioson/context/test-plan.md'
  },
  {
    id: 'orchestrator',
    displayName: 'Orchestrator',
    command: '@orchestrator',
    path: '.aioson/agents/orchestrator.md',
    dependsOn: [
      '.aioson/context/project.context.md',
      '.aioson/context/discovery.md',
      '.aioson/context/architecture.md',
      '.aioson/context/prd.md or .aioson/context/prd-{slug}.md',
      '.aioson/context/ui-spec.md (when present)',
      '.aioson/context/implementation-plan.md or implementation-plan-{slug}.md (when present)'
    ],
    output: '.aioson/context/parallel/*.status.md'
  },
  {
    id: 'squad',
    displayName: 'Squad',
    command: '@squad',
    path: '.aioson/agents/squad.md',
    dependsOn: [],
    output:
      '.aioson/squads/{slug}/squad.manifest.json + .aioson/squads/{slug}/squad.md + .aioson/squads/{slug}/agents/ + .aioson/squads/{slug}/workers/ + .aioson/squads/{slug}/workflows/ + .aioson/squads/{slug}/checklists/ + .aioson/squads/{slug}/skills/ + .aioson/squads/{slug}/templates/ + .aioson/squads/{slug}/docs/ + output/{slug}/{session-id}.html + output/{slug}/{content-key}/content.json + output/{slug}/{content-key}/index.html + output/{slug}/latest.html + aioson-logs/{slug}/ + media/{slug}/'
  },
  {
    id: 'orache',
    displayName: 'Orache',
    command: '@orache',
    path: '.aioson/agents/orache.md',
    dependsOn: [],
    output: 'squad-searches/{squad-slug}/investigation-{date}.md or squad-searches/standalone/{domain-slug}-{date}.md'
  },
  {
    id: 'genome',
    displayName: 'Genome',
    command: '@genome',
    path: '.aioson/agents/genome.md',
    dependsOn: [],
    output: '.aioson/genomes/[slug].md + .aioson/genomes/[slug].meta.json + optional binding in .aioson/squads/{slug}/squad.md or .aioson/squads/{slug}/squad.manifest.json'
  },
  {
    id: 'design-hybrid-forge',
    displayName: 'Design Hybrid Forge',
    command: '@design-hybrid-forge',
    path: '.aioson/agents/design-hybrid-forge.md',
    dependsOn: ['.aioson/context/project.context.md'],
    output: '.aioson/installed-skills/{hybrid-slug}/SKILL.md + .aioson/installed-skills/{hybrid-slug}/references/ + .aioson/installed-skills/{hybrid-slug}/previews/ + .aioson/installed-skills/{hybrid-slug}/.skill-meta.json'
  },
  {
    id: 'site-forge',
    displayName: 'Site Forge',
    command: '@site-forge',
    path: '.aioson/agents/site-forge.md',
    dependsOn: ['.aioson/context/project.context.md'],
    output: 'src/components/*.tsx + src/app/page.tsx + docs/research/{hostname}/ + public/images/{hostname}/'
  },
  {
    id: 'profiler-researcher',
    displayName: 'Profiler Researcher',
    command: '@profiler-researcher',
    path: '.aioson/agents/profiler-researcher.md',
    dependsOn: [],
    output: '.aioson/profiler-reports/{person-slug}/research-report.md'
  },
  {
    id: 'profiler-enricher',
    displayName: 'Profiler Enricher',
    command: '@profiler-enricher',
    path: '.aioson/agents/profiler-enricher.md',
    dependsOn: ['.aioson/profiler-reports/{person-slug}/research-report.md'],
    output: '.aioson/profiler-reports/{person-slug}/enriched-profile.md'
  },
  {
    id: 'profiler-forge',
    displayName: 'Profiler Forge',
    command: '@profiler-forge',
    path: '.aioson/agents/profiler-forge.md',
    dependsOn: ['.aioson/profiler-reports/{person-slug}/enriched-profile.md'],
    output: '.aioson/genomes/{person-slug}-{domain-slug}.md + .aioson/genomes/{person-slug}-{domain-slug}.meta.json + .aioson/advisors/{person-slug}-advisor.md'
  }
];

module.exports = {
  MANAGED_FILES,
  REQUIRED_FILES,
  CONTEXT_REQUIRED_FIELDS,
  CONTEXT_ALLOWED_CLASSIFICATIONS,
  CONTEXT_ALLOWED_PROJECT_TYPES,
  CONTEXT_ALLOWED_PROFILES,
  AGENT_DEFINITIONS
};
