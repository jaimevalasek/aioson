'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const {
  normalizeSchema,
  normalizeAnswers,
  runIntakeAsk,
  defaultAnswersPath
} = require('../src/commands/intake-ask');

async function makeTempDir() {
  return fs.mkdtemp(path.join(os.tmpdir(), 'aioson-intake-'));
}

function createLogger() {
  const lines = [];
  return {
    lines,
    log(line) {
      lines.push(String(line));
    },
    error(line) {
      lines.push(String(line));
    }
  };
}

const SCHEMA = {
  version: 1,
  agent: 'briefing',
  slug: 'structured-intake',
  title: 'Briefing intake',
  questions: [
    {
      id: 'primary_risk',
      type: 'radio',
      question: 'Which risk matters most?',
      options: [
        { value: 'value', label: 'User value' },
        { value: 'feasibility', label: 'Feasibility' }
      ],
      allow_other: true
    },
    {
      id: 'constraints',
      type: 'checkbox',
      question: 'Which constraints apply?',
      options: [
        { value: 'privacy', label: 'Privacy' },
        { value: 'migration', label: 'Migration' }
      ],
      allow_other: true
    },
    {
      id: 'trigger',
      type: 'input',
      question: 'What changed now?'
    }
  ]
};

test('normalizeSchema accepts input, radio, and checkbox questions', () => {
  const schema = normalizeSchema(SCHEMA);

  assert.equal(schema.agent, 'briefing');
  assert.equal(schema.questions.length, 3);
  assert.equal(schema.questions[0].options[0].label, 'User value');
});

test('normalizeSchema rejects duplicate ids', () => {
  assert.throws(
    () => normalizeSchema({
      questions: [
        { id: 'x', type: 'input', question: 'First?' },
        { id: 'x', type: 'input', question: 'Second?' }
      ]
    }),
    /duplicate question id/
  );
});

test('normalizeAnswers preserves known options and free-form other values', () => {
  const schema = normalizeSchema(SCHEMA);
  const normalized = normalizeAnswers(schema, {
    primary_risk: 'support burden',
    constraints: ['privacy', 'enterprise rollout'],
    trigger: 'The current briefing loop asks too much upfront.'
  });

  assert.equal(normalized.values.primary_risk, 'support burden');
  assert.deepEqual(normalized.values.constraints, ['privacy', 'enterprise rollout']);
  assert.equal(normalized.answers[0].value, 'other');
  assert.equal(normalized.answers[0].other, 'support burden');
  assert.deepEqual(normalized.answers[1].values, ['privacy']);
  assert.deepEqual(normalized.answers[1].other, ['enterprise rollout']);
});

test('normalizeAnswers rejects unknown option when other is disabled', () => {
  const schema = normalizeSchema({
    questions: [
      {
        id: 'choice',
        type: 'radio',
        question: 'Pick one',
        options: [{ value: 'a', label: 'A' }]
      }
    ]
  });

  assert.throws(
    () => normalizeAnswers(schema, { choice: 'b' }),
    /unknown option/
  );
});

test('defaultAnswersPath never points to the schema path', () => {
  assert.equal(defaultAnswersPath('/tmp/questions.json'), '/tmp/questions.answers.json');
  assert.equal(defaultAnswersPath('/tmp/questions'), '/tmp/questions.answers.json');
});

test('runIntakeAsk writes normalized answers from --answers file', async () => {
  const dir = await makeTempDir();
  const logger = createLogger();

  try {
    await fs.mkdir(path.join(dir, '.aioson/context/intake'), { recursive: true });
    await fs.writeFile(
      path.join(dir, '.aioson/context/intake/questions.json'),
      `${JSON.stringify(SCHEMA, null, 2)}\n`,
      'utf8'
    );
    await fs.writeFile(
      path.join(dir, '.aioson/context/intake/provided.json'),
      `${JSON.stringify({
        values: {
          primary_risk: 'value',
          constraints: ['privacy', 'migration'],
          trigger: 'A new feature needs sharper intake.'
        }
      }, null, 2)}\n`,
      'utf8'
    );

    const result = await runIntakeAsk({
      args: [dir],
      options: {
        schema: '.aioson/context/intake/questions.json',
        answers: '.aioson/context/intake/provided.json',
        out: '.aioson/context/intake/answers.json',
        agent: 'briefing'
      },
      logger
    });

    assert.equal(result.ok, true);
    assert.equal(result.output_path, '.aioson/context/intake/answers.json');
    assert.equal(result.values.primary_risk, 'value');

    const written = JSON.parse(
      await fs.readFile(path.join(dir, '.aioson/context/intake/answers.json'), 'utf8')
    );
    assert.equal(written.kind, 'aioson.structured-intake.answers');
    assert.equal(written.agent, 'briefing');
    assert.equal(written.values.trigger, 'A new feature needs sharper intake.');
    assert.equal(logger.lines.some((line) => line.includes('Structured intake saved')), true);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});
