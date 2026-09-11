'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
  analyzeSquadExecutors,
  EXECUTOR_FLOOR_BYTES,
  EXECUTOR_THIN_BYTES,
  EXECUTOR_CEILING_BYTES
} = require('../src/lib/squad-executor-lint');
const { runSquadValidate } = require('../src/commands/squad-validate');

const quiet = { log() {}, error() {} };

function tmpProject() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'aioson-executor-lint-'));
}

function realExecutor(name, extra = '') {
  return [
    `# Agent @${name}`,
    '',
    '## Mission',
    `Run the ${name} responsibilities for the squad end to end, from intake to a reviewed deliverable.`,
    'Own the decisions in this lane and hand evidence to the reviewer before anything ships.',
    '',
    '## Quick context',
    'The squad serves a small operator team that needs every deliverable traceable to a source.',
    'Sources live under researchs/ and the manifest names the executor responsible for each phase.',
    'You inherit the decision log from the previous phase and append to it, never rewrite it.',
    'When a source contradicts the brief, the source wins and the contradiction is logged for the owner.',
    '',
    '## Hard constraints',
    '- Never invent a fact the sources do not carry.',
    '- Never close a phase without the reviewer verdict on record.',
    '',
    '## Output contract',
    'A deliverable with every claim mapped to a source id and the open questions listed.',
    extra
  ].join('\n');
}

function writeSquad(root, slug, executors, { manifest = true, workers = {} } = {}) {
  const squadDir = path.join(root, '.aioson', 'squads', slug);
  fs.mkdirSync(path.join(squadDir, 'agents'), { recursive: true });
  const declared = [];
  for (const [name, body] of Object.entries(executors)) {
    fs.writeFileSync(path.join(squadDir, 'agents', `${name}.md`), body);
    declared.push({ slug: name, role: name, type: 'agent', file: `.aioson/squads/${slug}/agents/${name}.md`, skills: [] });
  }
  for (const [name, body] of Object.entries(workers)) {
    fs.mkdirSync(path.join(squadDir, 'workers', name), { recursive: true });
    fs.writeFileSync(path.join(squadDir, 'workers', name, 'run.js'), body);
  }
  if (manifest) {
    fs.writeFileSync(path.join(squadDir, 'squad.manifest.json'), JSON.stringify({
      schemaVersion: '1.0.0', packageVersion: '1.0.0', slug, name: slug, mode: 'content',
      mission: 'm', goal: 'g', executors: declared
    }, null, 2));
  }
  return squadDir;
}

test('a well-formed executor set measures clean with token numbers', () => {
  const root = tmpProject();
  const reviewer = [
    '# Agent @reviewer', '', '## Mission',
    'Independently verify every claim the writer ships, reading the cited source before judging the inference.',
    'Record a verdict the orchestrator can act on without re-reading the deliverable.',
    '', '## Quick context',
    'Verdicts land in the phase log; the writer never edits them. Sources are under researchs/ and are read-only for you.',
    'A veto blocks the phase; a needs-source verdict sends the claim back with the gap named.',
    '', '## Hard constraints', '- Veto unsupported claims.', '- Never approve a claim whose source you did not open.',
    '', '## Output contract', 'One verdict per claim (pass, veto, needs-source) with the exact source span that decided it.'
  ].join('\n');
  writeSquad(root, 'clean', { writer: realExecutor('writer'), reviewer });
  const res = analyzeSquadExecutors({ targetDir: root, slug: 'clean' });
  assert.deepEqual(res.issues, []);
  assert.deepEqual(res.warnings, []);
  assert.equal(res.metrics.measured, 2);
  assert.ok(res.metrics.estimatedTokens > 0);
  assert.equal(res.metrics.floorBytes, EXECUTOR_FLOOR_BYTES);
});

test('a role stub and placeholder text are provable issues; thin, bloat and missing sections are advisories', () => {
  const root = tmpProject();
  writeSquad(root, 'weak', {
    fechador: '# Fechador\n\nVocê encerra o atendimento e agradece o cliente.\n',
    atendente: '# Atendente\n\n## Role: greeting\n' + 'Cumprimente o cliente pelo nome e pergunte qual serviço deseja agendar. '.repeat(7),
    drafter: realExecutor('drafter', '\nTODO: fill in the real constraints later.'),
    encyclopedia: realExecutor('encyclopedia', '\n' + 'reference depth line that belongs in a skill file. '.repeat(400)),
    legacy: '# Legacy\n\n' + 'Operates the legacy flow with the fields the CRM exposes and answers the customer in order. '.repeat(12)
  });
  const res = analyzeSquadExecutors({ targetDir: root, slug: 'weak' });
  assert.ok(res.issues.some((i) => /"fechador" is a stub/.test(i)), res.issues.join('\n'));
  assert.ok(res.issues.some((i) => /"drafter" still carries placeholder text/.test(i)));
  assert.ok(res.warnings.some((w) => /"atendente" is thin: \d+ bytes/.test(w)), res.warnings.join('\n'));
  assert.ok(res.warnings.some((w) => /"encyclopedia" is \d+ bytes .*> 16000/.test(w)));
  assert.ok(res.warnings.some((w) => /"legacy" has no "mission", "hard constraints", "output contract" section/.test(w)));
  assert.equal(res.metrics.stubs, 1);
  assert.equal(res.metrics.thin, 1);
  assert.equal(res.metrics.thinBytes, EXECUTOR_THIN_BYTES);
  assert.equal(res.metrics.withPlaceholders, 1);
  assert.equal(res.metrics.bloated, 1);
  assert.equal(res.metrics.ceilingBytes, EXECUTOR_CEILING_BYTES);
});

test('pt-BR section headings satisfy the core-section check', () => {
  const root = tmpProject();
  const body = [
    '# Atendente', '', '## Missão', 'Recepcionar o cliente pelo WhatsApp, apresentar os serviços e encaminhar para o agendamento com o contexto completo.',
    '', '## Restrições', '- Nunca prometa horário sem confirmar a agenda.', '- Nunca peça dados além do necessário.',
    '', '## Contexto rápido', 'O salão atende por WhatsApp das 9h às 20h, com três profissionais e agenda compartilhada. Serviços: corte, coloração, escova, manicure. O cliente costuma chegar sem saber o preço e com pressa de fechar horário.',
    '', '## Contrato de saída', 'Uma mensagem por turno, com a próxima ação explícita e os campos preenchidos no CRM. Sempre confirme serviço, profissional e horário antes de encerrar o turno.'
  ].join('\n');
  writeSquad(root, 'ptbr', { atendente: body });
  const res = analyzeSquadExecutors({ targetDir: root, slug: 'ptbr' });
  assert.deepEqual(res.issues, []);
  assert.deepEqual(res.warnings, []);
});

test('two executors that read alike are flagged as near-duplicates', () => {
  const root = tmpProject();
  const base = realExecutor('closer', 'Thanks the customer, asks for feedback and invites them back with the next available slot.');
  writeSquad(root, 'dup', { closer: base, 'closer-2': base.replace('@closer', '@closer-2') });
  const res = analyzeSquadExecutors({ targetDir: root, slug: 'dup' });
  assert.equal(res.duplicates.length, 1);
  assert.ok(res.warnings.some((w) => /near-duplicates/.test(w)));
});

test('a worker that reads only argv is flagged with the file-transport hint', () => {
  const root = tmpProject();
  writeSquad(root, 'wk', { writer: realExecutor('writer') }, {
    workers: {
      legacy: "const input = JSON.parse(process.argv[2] || '{}');\nprocess.stdout.write(JSON.stringify(input));\n",
      modern: "const file = process.env.AIOSON_WORKER_INPUT_FILE;\nconst input = file ? JSON.parse(require('node:fs').readFileSync(file, 'utf8')) : JSON.parse(process.argv[2] || '{}');\n"
    }
  });
  const res = analyzeSquadExecutors({ targetDir: root, slug: 'wk' });
  assert.equal(res.metrics.workers, 2);
  assert.equal(res.metrics.workersArgvOnly, 1);
  assert.ok(res.warnings.some((w) => /Worker "legacy" reads its input only from argv/.test(w)));
});

test('a worker entrypoint declared as an executor is not linted as a prompt', () => {
  const root = tmpProject();
  const squadDir = writeSquad(root, 'mixed', { writer: realExecutor('writer') }, { workers: { scan: "console.log('{}')" } });
  const manifest = JSON.parse(fs.readFileSync(path.join(squadDir, 'squad.manifest.json'), 'utf8'));
  manifest.executors.push({ slug: 'scan', type: 'worker', file: `.aioson/squads/mixed/workers/scan/run.js` });
  const res = analyzeSquadExecutors({ targetDir: root, slug: 'mixed', manifest });
  assert.equal(res.metrics.measured, 1);
  assert.ok(!res.warnings.some((w) => /"scan" has no/.test(w)));
});

test('squad:validate surfaces the lint: strict promotes stubs to errors, non-strict keeps them advisory', async () => {
  const root = tmpProject();
  const slug = 'gate';
  const squadDir = writeSquad(root, slug, { orquestrador: realExecutor('orquestrador'), fechador: '# Fechador\n\nEncerra.\n' });
  fs.writeFileSync(path.join(squadDir, 'agents', 'agents.md'), '# Gate\n');
  const loose = await runSquadValidate({ args: [root], options: { squad: slug, json: true }, logger: quiet });
  assert.ok(loose.warnings.some((w) => /"fechador" is a stub/.test(w)));
  assert.ok(!loose.errors.some((e) => /is a stub/.test(e)));
  assert.equal(loose.executors.stubs, 1);
  const strict = await runSquadValidate({ args: [root], options: { squad: slug, strict: true, json: true }, logger: quiet });
  assert.ok(strict.errors.some((e) => /"fechador" is a stub/.test(e)));
});
