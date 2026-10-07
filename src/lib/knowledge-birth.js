'use strict';

// Knowledge is born tested. A rule or doc scaffolded by the CLI gets scenarios
// that prove its promise through the real brief builder — the same call every
// agent makes: it reaches each agent it names, and it stays out of an agent it
// does not name and of an unrelated task. Without them, a scope typo, a mode
// nobody runs or a trigger nobody says stays silent until an agent fails for
// lack of the knowledge.
//
// The scenarios are written to `.aioson/evals/project-knowledge.evals.json`
// (project-owned: `aioson update` copies template files only), so
// `context:evals` keeps re-proving them as the catalog grows.

const fs = require('node:fs/promises');
const path = require('node:path');
const { normalizeScenario, runScenario } = require('./context-evals');
const { pathMatchesPattern } = require('../context-selector');

const BIRTH_FILE = '.aioson/evals/project-knowledge.evals.json';
// The neighbor that must NOT receive an agent-scoped artifact: the closest
// main-cycle agent that was not named.
const NEIGHBOR_AGENTS = ['qa', 'planner', 'dev', 'product', 'sheldon', 'tester', 'briefing'];
// The modes each main-cycle kernel consults its context in
// (template/.aioson/agents/*.md, pinned by a test). A scenario runs the agent
// in a mode it really uses: a rule limited to `executing` never reaches a
// planner that only plans, and birth must say so. Other agents may use either.
const AGENT_MODES = {
  briefing: ['planning', 'executing'],
  refiner: ['planning'],
  product: ['planning'],
  sheldon: ['planning'],
  planner: ['planning'],
  dev: ['executing', 'planning'],
  qa: ['executing'],
  tester: ['planning', 'executing'],
  pentester: ['planning'],
  squad: ['planning']
};
const UNRELATED_TASK = 'rotate the TLS certificate of the staging load balancer';

function examplePath(pattern) {
  const segments = String(pattern || '').replace(/\\/g, '/').split('/').filter(Boolean);
  if (segments.length === 0) return '';
  const concrete = segments.map((segment) => (segment === '**' ? 'example' : segment.replace(/\*+/g, 'example')));
  const last = concrete[concrete.length - 1];
  if (!/\.[A-Za-z0-9]+$/.test(last)) concrete.push('example.js');
  const candidate = concrete.join('/');
  return pathMatchesPattern(candidate, pattern) ? candidate : '';
}

function modeFor(agent, modes) {
  const real = AGENT_MODES[agent] || ['planning', 'executing'];
  return real.find((mode) => modes.includes(mode)) || real[0];
}

// A task an agent would plausibly write: the artifact's own first trigger (or
// task type) followed by what it is about.
function synthesizedTask(frontmatter) {
  const lead = frontmatter.triggers[0] || frontmatter.task_types[0] || frontmatter.name.replace(/-/g, ' ');
  return `${lead}: ${frontmatter.description}`.slice(0, 240);
}

/**
 * @param {{ relPath: string, frontmatter: object, examples?: string[] }} input
 *   frontmatter: { name, description, agents, modes, triggers, task_types, paths, load_tier }
 */
function birthScenarios({ relPath, frontmatter, examples = [] }) {
  const agents = frontmatter.agents.length > 0 ? frontmatter.agents : ['dev'];
  const modes = frontmatter.modes.length > 0 ? frontmatter.modes : ['planning', 'executing'];
  const tasks = examples.length > 0 ? examples : [synthesizedTask(frontmatter)];
  const samplePath = frontmatter.paths.map(examplePath).find(Boolean);
  const paths = samplePath ? [samplePath] : [];
  const name = frontmatter.name;
  const scenarios = [];

  agents.forEach((agent, index) => {
    // Every example is proven for the first agent; the others prove reach.
    const agentTasks = index === 0 ? tasks : tasks.slice(0, 1);
    agentTasks.forEach((task, taskIndex) => {
      scenarios.push({
        name: `${name} :: reaches ${agent}${taskIndex > 0 ? ` (example ${taskIndex + 1})` : ''}`,
        agent,
        mode: modeFor(agent, modes),
        task,
        paths,
        expect: [{ path: relPath, in: 'selected' }]
      });
    });
  });

  if (frontmatter.agents.length > 0) {
    const neighbor = NEIGHBOR_AGENTS.find((agent) => !frontmatter.agents.includes(agent));
    if (neighbor) {
      scenarios.push({
        name: `${name} :: stays out of ${neighbor}`,
        agent: neighbor,
        mode: modeFor(neighbor, ['planning', 'executing']),
        task: tasks[0],
        paths,
        absent: [{ path: relPath, in: 'selected' }]
      });
    }
  }
  // An always-loaded artifact is meant to appear on every task.
  if (frontmatter.load_tier !== 'always') {
    scenarios.push({
      name: `${name} :: stays out of an unrelated task`,
      agent: agents[0],
      mode: modeFor(agents[0], modes),
      task: UNRELATED_TASK,
      paths: [],
      absent: [{ path: relPath, in: 'selected' }]
    });
  }
  return scenarios;
}

async function readBirthFile(filePath) {
  try {
    const parsed = JSON.parse(await fs.readFile(filePath, 'utf8'));
    return { version: 1, scenarios: Array.isArray(parsed.scenarios) ? parsed.scenarios : [] };
  } catch {
    return { version: 1, scenarios: [] };
  }
}

/** Replace this artifact's scenarios in the project corpus, keeping every other one. */
async function recordBirthScenarios(projectDir, name, scenarios) {
  const filePath = path.join(projectDir, BIRTH_FILE);
  const corpus = await readBirthFile(filePath);
  const prefix = `${name} :: `;
  corpus.scenarios = [...corpus.scenarios.filter((scenario) => !String(scenario.name || '').startsWith(prefix)), ...scenarios];
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(corpus, null, 2)}\n`, 'utf8');
  return BIRTH_FILE;
}

/** Run the scenarios through the real brief builder and keep what a human needs. */
async function proveBirth(projectDir, scenarios) {
  const results = [];
  for (const [index, raw] of scenarios.entries()) {
    const { scenario } = normalizeScenario(raw, BIRTH_FILE, index);
    if (!scenario) continue;
    const result = await runScenario(projectDir, scenario);
    results.push({
      name: result.name,
      passed: result.passed,
      failures: result.checks
        .filter((check) => !check.passed)
        .map((check) => ({ type: check.type, cause: check.diagnosis && check.diagnosis.cause, suggestion: check.diagnosis && check.diagnosis.suggestion }))
    });
  }
  return {
    passed: results.filter((result) => result.passed).length,
    failed: results.filter((result) => !result.passed).length,
    results
  };
}

module.exports = {
  AGENT_MODES,
  BIRTH_FILE,
  birthScenarios,
  examplePath,
  proveBirth,
  recordBirthScenarios
};
