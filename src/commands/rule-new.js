'use strict';

const { scaffoldKnowledge } = require('../lib/rule-scaffold');
const { birthScenarios, proveBirth, recordBirthScenarios } = require('../lib/knowledge-birth');
const { resolveTargetDir } = require('../lib/project-root');

function translated(t, key, values, fallback) {
  if (typeof t !== 'function') return fallback;
  const value = t(key, values);
  return value === key ? fallback : value;
}

// `rule:new` writes law (.aioson/rules/), `doc:new` writes a procedure
// (.aioson/docs/). Same shape, same proof; only the wording differs.
const KIND_TEXT = {
  rule: {
    ns: 'cli.rule_new',
    command: 'rule:new',
    noun: 'Rule',
    next: 'Next: replace the placeholder rule statements with concrete, checkable requirements, then run aioson verify:artifact . --kind=rule --file={path}'
  },
  doc: {
    ns: 'cli.doc_new',
    command: 'doc:new',
    noun: 'Doc',
    next: 'Next: replace the placeholder procedure with the project\'s concrete steps and the evidence that proves them; rerun with --force --examples="..." to re-prove routing.'
  }
};

function errorsFor(text) {
  return {
    name_required: [`${text.ns}.name_required`, `${text.command} requires --name=<kebab-case-name>.`],
    invalid_name: [`${text.ns}.invalid_name`, `${text.noun} name "{name}" must be kebab-case (letters, digits, single hyphens).`],
    invalid_folder: [`${text.ns}.invalid_folder`, 'Folder "{folder}" must be kebab-case segments separated by /.'],
    not_an_aioson_project: [`${text.ns}.not_project`, 'No .aioson/ directory here — run this inside an AIOSON project.'],
    already_exists: [`${text.ns}.exists`, `${text.noun} "{name}" already exists at {path}. Edit it, or pass --force to replace it.`],
    invalid_load_tier: [`${text.ns}.invalid_load_tier`, 'load_tier must be `always` or `trigger`.'],
    invalid_priority: [`${text.ns}.invalid_priority`, 'priority must be a number between 0 and 100.']
  };
}

// Task phrasings the author expects agents to use; `|` separates them because
// a task sentence carries commas.
function examplesOf(options) {
  return String(options.examples || options.example || '')
    .split('|')
    .map((example) => example.trim())
    .filter(Boolean);
}

/** Prove the new file reaches the agents it names — and only them. */
async function proveNewKnowledge(projectDir, result, options) {
  const scenarios = birthScenarios({ relPath: result.path, frontmatter: result.frontmatter, examples: examplesOf(options) });
  const file = await recordBirthScenarios(projectDir, result.name, scenarios);
  return { file, ...(await proveBirth(projectDir, scenarios)) };
}

function logBirth(logger, birth) {
  const total = birth.passed + birth.failed;
  logger.log(`Birth evals (${birth.file}): ${birth.passed}/${total} passed.`);
  for (const scenario of birth.results) {
    if (scenario.passed) {
      logger.log(`  ✓ ${scenario.name}`);
      continue;
    }
    const failure = scenario.failures[0] || {};
    logger.log(`  ✗ ${scenario.name}${failure.cause ? ` — ${failure.cause}` : ''}`);
    if (failure.suggestion) logger.log(`    ${failure.suggestion}`);
  }
  if (birth.failed > 0) {
    logger.log('Adjust agents/modes/triggers/aliases (or --examples with the words agents really use) and rerun with --force; `aioson context:evals .` keeps re-proving these scenarios.');
  }
}

function makeKnowledgeCommand(kind) {
  const text = KIND_TEXT[kind];
  const errors = errorsFor(text);
  return async function runKnowledgeNew({ args, options = {}, logger, t }) {
    const projectDir = resolveTargetDir(args);
    const result = await scaffoldKnowledge(projectDir, options, kind);

    if (!result.ok) {
      const [key, fallback] = errors[result.reason] || [`${text.ns}.error`, `${text.command} failed ({reason}).`];
      logger.error(translated(t, key, result, fallback
        .replace('{name}', result.name || '-')
        .replace('{path}', result.path || '-')
        .replace('{folder}', result.folder || '-')
        .replace('{reason}', result.reason)));
      return result;
    }

    const noEvals = Boolean(options['no-evals'] || options.noEvals);
    if (!noEvals) result.birth_evals = await proveNewKnowledge(projectDir, result, options);
    if (options.json) return result;

    logger.log(translated(
      t,
      result.overwritten ? `${text.ns}.replaced` : `${text.ns}.created`,
      result,
      `${result.overwritten ? 'Replaced' : 'Created'} ${kind} "${result.name}" at ${result.path}.`
    ));
    if (result.warnings.includes('no_routing_dimension')) {
      logger.log(translated(
        t,
        `${text.ns}.no_routing_dimension`,
        result,
        `Warning: no agents, triggers, task-types, aliases, or paths were declared, so context:select will rarely reach this ${kind}. Add at least one, or set --load-tier=always.`
      ));
    }
    if (result.birth_evals) logBirth(logger, result.birth_evals);
    logger.log(translated(t, `${text.ns}.next`, result, text.next.replace('{path}', result.path)));
    return result;
  };
}

const runRuleNew = makeKnowledgeCommand('rule');
const runDocNew = makeKnowledgeCommand('doc');

module.exports = {
  runRuleNew,
  runDocNew
};
