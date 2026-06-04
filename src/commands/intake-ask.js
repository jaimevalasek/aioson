'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const readline = require('node:readline/promises');
const { promptPicker } = require('../lib/terminal-picker');

const SUPPORTED_TYPES = new Set(['input', 'radio', 'checkbox']);

function resolveProjectPath(projectDir, value) {
  if (!value) return null;
  return path.isAbsolute(value) ? value : path.join(projectDir, value);
}

function defaultAnswersPath(schemaPath) {
  if (/\.json$/i.test(schemaPath)) {
    return schemaPath.replace(/\.json$/i, '.answers.json');
  }
  return `${schemaPath}.answers.json`;
}

async function readJson(filePath) {
  const raw = await fs.readFile(filePath, 'utf8');
  return JSON.parse(raw);
}

function asArray(value) {
  if (Array.isArray(value)) return value;
  if (value === undefined || value === null || value === '') return [];
  return [value];
}

function normalizeOption(option, index, questionId) {
  if (typeof option === 'string') {
    return { value: option, label: option, description: '' };
  }
  if (!option || typeof option !== 'object') {
    throw new Error(`question "${questionId}" option ${index + 1} must be a string or object`);
  }
  const value = String(option.value || '').trim();
  if (!value) throw new Error(`question "${questionId}" option ${index + 1} is missing value`);
  return {
    value,
    label: String(option.label || value).trim(),
    description: String(option.description || option.desc || '').trim()
  };
}

function normalizeQuestion(question, index) {
  if (!question || typeof question !== 'object') {
    throw new Error(`question ${index + 1} must be an object`);
  }

  const id = String(question.id || '').trim();
  if (!/^[a-zA-Z][a-zA-Z0-9_-]*$/.test(id)) {
    throw new Error(`question ${index + 1} has invalid id`);
  }

  const type = String(question.type || '').trim();
  if (!SUPPORTED_TYPES.has(type)) {
    throw new Error(`question "${id}" type must be input, radio, or checkbox`);
  }

  const prompt = String(question.question || question.prompt || '').trim();
  if (!prompt) throw new Error(`question "${id}" is missing question text`);

  const normalized = {
    id,
    type,
    question: prompt,
    description: String(question.description || question.help || '').trim(),
    required: question.required !== false,
    default: question.default,
    allowOther: Boolean(question.allow_other || question.allowOther),
    options: []
  };

  if (type === 'radio' || type === 'checkbox') {
    if (!Array.isArray(question.options) || question.options.length === 0) {
      throw new Error(`question "${id}" requires at least one option`);
    }
    normalized.options = question.options.map((option, optionIndex) => (
      normalizeOption(option, optionIndex, id)
    ));
  }

  return normalized;
}

function normalizeSchema(schema) {
  if (!schema || typeof schema !== 'object') {
    throw new Error('schema must be a JSON object');
  }
  if (!Array.isArray(schema.questions) || schema.questions.length === 0) {
    throw new Error('schema.questions must contain at least one question');
  }

  const questions = schema.questions.map(normalizeQuestion);
  const ids = new Set();
  for (const question of questions) {
    if (ids.has(question.id)) throw new Error(`duplicate question id "${question.id}"`);
    ids.add(question.id);
  }

  return {
    version: schema.version || 1,
    agent: schema.agent || null,
    slug: schema.slug || null,
    title: String(schema.title || 'Structured intake').trim(),
    description: String(schema.description || '').trim(),
    questions
  };
}

function optionMap(question) {
  return new Map(question.options.map((option) => [option.value, option]));
}

function normalizeInputAnswer(question, raw) {
  const value = raw === undefined || raw === null || raw === ''
    ? question.default
    : raw;
  const text = value === undefined || value === null ? '' : String(value).trim();
  if (question.required && !text) throw new Error(`answer "${question.id}" is required`);
  return {
    id: question.id,
    type: question.type,
    question: question.question,
    value: text
  };
}

function normalizeRadioAnswer(question, raw) {
  const rawValue = raw && typeof raw === 'object' && !Array.isArray(raw) && 'value' in raw
    ? raw.value
    : raw;
  const value = rawValue === undefined || rawValue === null || rawValue === ''
    ? question.default
    : rawValue;
  const selected = value === undefined || value === null ? '' : String(value).trim();
  if (question.required && !selected) throw new Error(`answer "${question.id}" is required`);
  if (!selected) {
    return { id: question.id, type: question.type, question: question.question, value: '' };
  }

  const options = optionMap(question);
  if (options.has(selected)) {
    const option = options.get(selected);
    return {
      id: question.id,
      type: question.type,
      question: question.question,
      value: option.value,
      label: option.label
    };
  }

  if (!question.allowOther) {
    throw new Error(`answer "${question.id}" has unknown option "${selected}"`);
  }

  return {
    id: question.id,
    type: question.type,
    question: question.question,
    value: 'other',
    label: 'Other',
    other: selected
  };
}

function normalizeCheckboxAnswer(question, raw) {
  const provided = raw === undefined || raw === null || raw === ''
    ? asArray(question.default)
    : asArray(raw);
  const options = optionMap(question);
  const values = [];
  const labels = [];
  const other = [];

  for (const item of provided) {
    const value = String(item || '').trim();
    if (!value) continue;
    if (options.has(value)) {
      const option = options.get(value);
      values.push(option.value);
      labels.push(option.label);
    } else if (question.allowOther) {
      other.push(value);
    } else {
      throw new Error(`answer "${question.id}" has unknown option "${value}"`);
    }
  }

  if (question.required && values.length === 0 && other.length === 0) {
    throw new Error(`answer "${question.id}" requires at least one selection`);
  }

  return {
    id: question.id,
    type: question.type,
    question: question.question,
    values,
    labels,
    other
  };
}

function pickAnswerSource(providedAnswers) {
  if (!providedAnswers || typeof providedAnswers !== 'object') return {};
  if (providedAnswers.values && typeof providedAnswers.values === 'object') return providedAnswers.values;
  if (providedAnswers.answers && !Array.isArray(providedAnswers.answers) && typeof providedAnswers.answers === 'object') {
    return providedAnswers.answers;
  }
  return providedAnswers;
}

function normalizeAnswers(schema, providedAnswers) {
  const source = pickAnswerSource(providedAnswers);
  const answers = [];
  const values = {};

  for (const question of schema.questions) {
    const raw = source[question.id];
    const answer = question.type === 'input'
      ? normalizeInputAnswer(question, raw)
      : question.type === 'radio'
        ? normalizeRadioAnswer(question, raw)
        : normalizeCheckboxAnswer(question, raw);
    answers.push(answer);
    values[question.id] = question.type === 'checkbox'
      ? [...answer.values, ...answer.other]
      : (answer.other || answer.value);
  }

  return { answers, values };
}

async function askInput(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  try {
    const suffix = question.default ? ` (${question.default})` : '';
    const answer = await rl.question(`${question.question}${suffix}: `);
    return answer.trim() || question.default || '';
  } finally {
    rl.close();
  }
}

async function askRadio(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  try {
    process.stdout.write(`\n${question.question}\n`);
    if (question.description) process.stdout.write(`${question.description}\n`);
    question.options.forEach((option, index) => {
      const desc = option.description ? ` — ${option.description}` : '';
      process.stdout.write(`  ${index + 1}. ${option.label}${desc}\n`);
    });
    const otherIndex = question.allowOther ? question.options.length + 1 : null;
    if (question.allowOther) process.stdout.write(`  ${otherIndex}. Other\n`);

    const fallbackIndex = question.default
      ? question.options.findIndex((option) => option.value === question.default) + 1
      : 0;
    const suffix = fallbackIndex > 0 ? ` (${fallbackIndex})` : '';
    const answer = await rl.question(`Select one${suffix}: `);
    const selected = answer.trim() || (fallbackIndex > 0 ? String(fallbackIndex) : '');
    const number = Number(selected);
    if (Number.isInteger(number) && number >= 1 && number <= question.options.length) {
      return question.options[number - 1].value;
    }
    if (question.allowOther && number === otherIndex) {
      return (await rl.question('Other: ')).trim();
    }
    return selected;
  } finally {
    rl.close();
  }
}

async function askCheckbox(question) {
  const defaults = new Set(asArray(question.default).map(String));
  const selected = await promptPicker(
    question.options.map((option) => ({
      id: option.value,
      label: option.label,
      hint: option.description,
      checked: defaults.size > 0 ? defaults.has(option.value) : false
    })),
    {
      title: question.question,
      subtitle: question.description,
      summary: ({ checkedCount, totalCount }) => `${checkedCount} selected · ${totalCount} options`
    }
  );
  const values = selected || [];
  if (!question.allowOther) return values;

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  try {
    const other = await rl.question('Other selections (comma-separated, Enter to skip): ');
    return values.concat(other.split(',').map((item) => item.trim()).filter(Boolean));
  } finally {
    rl.close();
  }
}

async function promptForAnswers(schema) {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    throw new Error('interactive intake requires a TTY; use --answers=<file> for non-interactive mode');
  }

  const rawAnswers = {};
  process.stdout.write(`\n${schema.title}\n`);
  if (schema.description) process.stdout.write(`${schema.description}\n`);

  for (const question of schema.questions) {
    rawAnswers[question.id] = question.type === 'input'
      ? await askInput(question)
      : question.type === 'radio'
        ? await askRadio(question)
        : await askCheckbox(question);
  }

  return rawAnswers;
}

async function runIntakeAsk({ args, options = {}, logger }) {
  const projectDir = path.resolve(process.cwd(), args[0] || '.');
  const schemaPath = resolveProjectPath(projectDir, options.schema || args[1]);
  if (!schemaPath) {
    logger.error('Usage: aioson intake:ask [path] --schema=<questions.json> [--out=<answers.json>]');
    return { ok: false, error: 'missing_schema' };
  }

  let schema;
  try {
    schema = normalizeSchema(await readJson(schemaPath));
  } catch (error) {
    logger.error(`Invalid intake schema: ${error.message}`);
    return { ok: false, error: 'invalid_schema', message: error.message };
  }

  if (options['dry-run']) {
    return { ok: true, dryRun: true, schemaPath, schema };
  }

  let providedAnswers;
  try {
    providedAnswers = options.answers
      ? await readJson(resolveProjectPath(projectDir, options.answers))
      : await promptForAnswers(schema);
  } catch (error) {
    logger.error(`Intake cancelled: ${error.message}`);
    return { ok: false, error: 'intake_cancelled', message: error.message };
  }

  let normalized;
  try {
    normalized = normalizeAnswers(schema, providedAnswers);
  } catch (error) {
    logger.error(`Invalid intake answers: ${error.message}`);
    return { ok: false, error: 'invalid_answers', message: error.message };
  }

  const outPath = resolveProjectPath(
    projectDir,
    options.out || defaultAnswersPath(schemaPath)
  );

  const result = {
    ok: true,
    kind: 'aioson.structured-intake.answers',
    version: 1,
    agent: options.agent || schema.agent || null,
    slug: options.slug || schema.slug || null,
    schema_path: path.relative(projectDir, schemaPath).replace(/\\/g, '/'),
    answered_at: new Date().toISOString(),
    title: schema.title,
    answers: normalized.answers,
    values: normalized.values
  };

  await fs.mkdir(path.dirname(outPath), { recursive: true });
  await fs.writeFile(outPath, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
  logger.log(`Structured intake saved: ${path.relative(projectDir, outPath).replace(/\\/g, '/')}`);

  return {
    ...result,
    output_path: path.relative(projectDir, outPath).replace(/\\/g, '/')
  };
}

module.exports = {
  runIntakeAsk,
  normalizeSchema,
  normalizeAnswers,
  defaultAnswersPath
};
