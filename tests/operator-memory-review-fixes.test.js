'use strict';

/**
 * An independent review of the operator-memory wave reproduced 14 defects; each
 * test here replays one of them:
 * - words alike, meaning opposite: a negation, a reversed preference or a
 *   swapped object was one decision and widened to every project (MEM-01);
 * - a one-time "pode fazer agora" carrying "nunca" promoted at once (MEM-02);
 * - read-modify-write cycles across processes lost repeats, projects and a
 *   freshly renewed proposal (MEM-03, MEM-04, MEM-05);
 * - a repeat's "em todos os meus projetos" was dropped, and a reinforcement
 *   outside any project closed adoption for good (MEM-06, MEM-07);
 * - an older CLI's promotion read as pre-scope and was archived (MEM-10);
 * - the digest past its budget, `more` counting habits it showed, the cache
 *   rate divided by memory events, help text and docs promising what the code
 *   does not, ESC sequences printed from another project's name (MEM-08,
 *   MEM-09, MEM-11..MEM-14).
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');

const TEST_HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'aioson-om-review-'));
process.env.HOME = TEST_HOME;
process.env.USERPROFILE = TEST_HOME;
process.env.AIOSON_OPERATOR_ID = 'review-fixes-bot';
delete process.env.AIOSON_OPERATOR_MEMORY;
delete process.env.AIOSON_PROJECT_REGISTRY;

const REPO = path.join(__dirname, '..');
const CLI = path.join(REPO, 'bin', 'aioson.js');
const { similarity, signature } = require('../src/operator-memory/equivalence');
const { standingMarker } = require('../src/operator-memory/standing');
const { archiveReason, isUnprovenLegacy, SCOPE_ALWAYS_WRITTEN_SINCE } = require('../src/operator-memory/archive');
const { expireProposals } = require('../src/operator-memory/housekeeping');
const { readDecision, serializeDecision, decisionPath } = require('../src/operator-memory/decision');
const { readProposal, writeProposal } = require('../src/operator-memory/proposal');
const { ensureStorageTree, getStorageRoot } = require('../src/operator-memory/storage');
const { regenerateIndex } = require('../src/operator-memory/index-md');
const { loadHabits } = require('../src/lib/operator-portfolio');
const { fitBudget, DIGEST_BUDGET_BYTES } = require('../src/lib/session-digest');
const { runOpCapture, promotionThresholdFor } = require('../src/commands/op-capture');
const { runOpList } = require('../src/commands/op-list');

const DAY_MS = 24 * 60 * 60 * 1000;
const silent = () => ({ log: () => {}, error: () => {}, warn: () => {} });

function useIdentity(identity) {
  process.env.AIOSON_OPERATOR_ID = identity;
  ensureStorageTree(identity);
  return identity;
}

function makeCheckout(name) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `aioson-review-${name}-`));
  fs.mkdirSync(path.join(dir, '.git'));
  fs.writeFileSync(path.join(dir, '.git', 'config'), `[core]\n\tbare = false\n[remote "origin"]\n\turl = https://github.com/acme/${name}.git\n`);
  return dir;
}

function makeProject(parent, name, fields = {}) {
  const dir = path.join(parent, name);
  fs.mkdirSync(path.join(dir, '.aioson', 'context'), { recursive: true });
  const data = { project_name: name, project_type: 'web_app', profile: 'developer', framework: 'Node', framework_installed: true, classification: 'MICRO', interaction_language: 'pt-BR', conversation_language: 'pt-BR', ...fields };
  fs.writeFileSync(path.join(dir, '.aioson', 'context', 'project.context.md'), ['---', ...Object.entries(data).map(([k, v]) => `${k}: ${JSON.stringify(v)}`), '---', ''].join('\n'));
  return dir;
}

const capture = (dir, options) => runOpCapture({ args: [dir], options: { json: true, 'source-agent': 'dev', ...options }, logger: silent() });
const list = (dir, options = {}) => runOpList({ args: [dir], options: { json: true, 'titles-only': true, ...options }, logger: silent() });

function seedDecision(identity, slug, fields) {
  const at = new Date().toISOString();
  fs.writeFileSync(decisionPath(identity, slug), serializeDecision({
    slug, signal_type: 'authorization', promoted_at: at, last_reinforced: at, reinforcement_count: 0,
    category: 'default', source_agent: 'dev', quotes: ['sim'], body: slug, title: slug, ...fields
  }));
}

// Child processes released together at `startAt`, each with the sandbox home.
// Their modules load before the release, so the cycles under test overlap.
function runTogether(scripts, env) {
  const startAt = Date.now() + 2500;
  return Promise.all(scripts.map((body) => new Promise((resolve, reject) => {
    const lines = body.split('\n');
    const load = lines.filter((line) => line.includes('require(')).join('\n');
    const act = lines.filter((line) => !line.includes('require(')).join('\n');
    const script = `${load}\nconst wait = ${startAt} - Date.now(); setTimeout(async () => { ${act} }, wait < 0 ? 0 : wait);`;
    const child = spawn(process.execPath, ['-e', script], { cwd: REPO, env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
    let err = '';
    child.stderr.on('data', (chunk) => { err += chunk; });
    child.on('error', reject);
    child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`child exited ${code}: ${err}`))));
  })));
}

// ─── MEM-01 ───

test('MEM-01: a negation, a reversed preference or a swapped object is never the same decision', () => {
  const zero = [
    ['Preferir Postgres a MySQL no banco de dados', 'Preferir MySQL a Postgres no banco de dados'],
    ['Usar Tailwind nos componentes da interface web', 'Não usar Tailwind nos componentes da interface web'],
    ['Always run deployment tests before release', 'Never run deployment tests before release'],
    ['Autoriza criar commit local da correção de login', 'Autoriza criar commit local da migração de pagamentos'],
    ['Autoriza deploy automático do servidor de staging', 'Autoriza deploy automático do servidor de produção'],
    ['No usar Tailwind en los componentes de la interfaz', 'Usar Tailwind en los componentes de la interfaz']
  ];
  for (const [a, b] of zero) assert.equal(similarity(signature(a), signature(b)), 0, `${a} | ${b}`);

  const same = [
    ['Não usar emojis nas mensagens de commit do repositório', 'Mensagens de commit do repositório sem emojis'],
    ['Evitar emojis nas mensagens de commit do repositório', 'Não usar emojis nas mensagens de commit do repositório'],
    ['Autoriza implementar em etapas e criar commits locais na main entre alterações validadas.', 'Autoriza implementar fatias concretas e criar commits locais após cada entrega validada.']
  ];
  for (const [a, b] of same) assert.ok(similarity(signature(a), signature(b)) >= 0.4, `${a} | ${b}`);
});

test('MEM-01: opposite preferences in two projects stay two decisions; a third project gets neither', async () => {
  const identity = useIdentity('mem01-opposite-bot');
  const a = makeCheckout('mem01-a');
  const b = makeCheckout('mem01-b');
  const c = makeCheckout('mem01-c');
  const first = await capture(a, { signal: 'correction', quote: 'Prefiro Postgres a MySQL neste projeto', proposal: 'Preferir Postgres a MySQL no banco de dados' });
  const second = await capture(b, { signal: 'correction', quote: 'Neste projeto prefiro MySQL a Postgres', proposal: 'Preferir MySQL a Postgres no banco de dados' });
  assert.notEqual(second.slug, first.slug);
  assert.equal(second.matched_by, undefined);
  assert.equal(readDecision(identity, first.slug).scope, 'project', 'never widened by the opposite preference');
  assert.equal(second.scope, 'project');
  const third = await list(c, { limit: '0' });
  assert.ok(!(first.slug in third.items) && !(second.slug in third.items), 'neither reaches a third project');
});

const ETAPAS = 'Autoriza implementar em etapas e criar commits locais na main entre alterações validadas.';
const FATIAS = 'Autoriza implementar fatias concretas e criar commits locais após cada entrega validada.';

test('MEM-01: a loose match from another project never joins; in the same project it still does', async () => {
  const identity = useIdentity('mem01-loose-bot');
  const one = makeCheckout('mem01-loose-one');
  const two = makeCheckout('mem01-loose-two');
  const said = await capture(one, { signal: 'correction', quote: 'faça assim', proposal: ETAPAS });
  const elsewhere = await capture(two, { signal: 'correction', quote: 'faça assim', proposal: FATIAS });
  assert.notEqual(elsewhere.slug, said.slug, 'similar words (0.45) are no proof in another project');
  assert.equal(elsewhere.matched_by, undefined);
  assert.equal(readDecision(identity, said.slug).scope, 'project');

  useIdentity('mem01-loose-here-bot');
  const here = makeCheckout('mem01-loose-here');
  const first = await capture(here, { signal: 'correction', quote: 'faça assim', proposal: ETAPAS });
  const again = await capture(here, { signal: 'correction', quote: 'como antes', proposal: FATIAS });
  assert.equal(again.slug, first.slug, 'where it was said, the loose match reinforces');
  assert.equal(again.matched_by, 'meaning');
  assert.equal(again.reinforced, true);
});

test('MEM-01: another sentence that shares a slug prefix is never an exact repeat', async () => {
  const identity = useIdentity('mem01-prefix-bot');
  const one = makeCheckout('mem01-prefix-one');
  const two = makeCheckout('mem01-prefix-two');
  const first = await capture(one, { signal: 'correction', quote: 'faça assim', proposal: 'Autoriza implementar fatias concretas e criar commits locais após cada entrega validada' });
  const other = await capture(two, { signal: 'correction', quote: 'faça assim', proposal: 'Autoriza implementar fatias concretas e rodar a suíte inteira no CI noturno' });
  assert.notEqual(other.slug, first.slug, 'the 40-character slug prefix is shared, the sentence is not');
  assert.equal(other.reinforced, undefined);
  assert.equal(readDecision(identity, first.slug).scope, 'project', 'never widened by a different sentence');
});

// ─── MEM-02 ───

test('MEM-02: a quote bound to the moment never proves an authorization standing', async () => {
  for (const quote of ['nunca vi isso, pode fazer agora', 'sempre achei estranho, mas faz agora', 'pode seguir fazendo isso agora',
    'sem pausa, termina essa tarefa', 'I never saw this; do it now', 'feel free to run this once', 'siempre pensé eso; hazlo ahora',
    'nunca vi isso, pode fazer', 'keep going']) {
    assert.equal(standingMarker([quote], 'authorization'), null, quote);
    assert.equal(promotionThresholdFor('authorization', [quote]), 2, quote);
  }
  for (const quote of ['a partir de agora pode commitar', 'from now on, no need to ask', 'isso vale pra frente', 'toda feature, roda os testes antes']) {
    assert.notEqual(standingMarker([quote], 'authorization'), null, quote);
  }
  useIdentity('mem02-bot');
  const dir = makeCheckout('mem02');
  const result = await capture(dir, { signal: 'authorization', quote: 'nunca vi isso, pode fazer agora', proposal: 'Publicar o pacote e criar release no registro' });
  assert.equal(result.promoted, false);
  assert.equal(result.held, 'awaiting_repeat');
});

// ─── MEM-03 ───

test('MEM-03: the sweep leaves a proposal renewed after it was judged old', () => {
  const identity = useIdentity('mem03-bot');
  const old = new Date(Date.now() - 100 * DAY_MS).toISOString();
  const record = (at, quotes) => ({ slug: 'renewed-proposal', signal_type: 'confirmation', detected_count: quotes.length, first_detected: old, last_detected: at, quotes, proposal: 'renewed proposal', source_agent: 'dev', proposal_fingerprint: 'f' });
  writeProposal(identity, record(old, ['primeira']));
  const file = path.join(getStorageRoot(identity), 'proposals', 'renewed-proposal.md');
  const original = fs.readFileSync;
  let renewed = false;
  // A capture renews the file between the sweep's judgment and its removal.
  fs.readFileSync = function patched(target, ...rest) {
    const content = original.call(fs, target, ...rest);
    if (!renewed && path.resolve(String(target)) === path.resolve(file)) {
      renewed = true;
      writeProposal(identity, record(new Date().toISOString(), ['primeira', 'segunda']));
    }
    return content;
  };
  try {
    assert.deepEqual(expireProposals(identity), []);
  } finally {
    fs.readFileSync = original;
  }
  const kept = readProposal(identity, 'renewed-proposal');
  assert.ok(kept, 'the renewed proposal stays');
  assert.deepEqual(kept.quotes, ['primeira', 'segunda']);
  const history = path.join(getStorageRoot(identity), 'history');
  assert.ok(!fs.existsSync(history) || !fs.readdirSync(history).some((f) => f.endsWith('-renewed-proposal.md')), 'nothing archived');
});

// ─── MEM-04 ───

test('MEM-04: six sessions recording six projects at once keep all six', async () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'aioson-review-registry-home-'));
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'aioson-review-registry-work-'));
  const dirs = [1, 2, 3, 4, 5, 6].map((i) => makeProject(work, `race-${i}`));
  await runTogether(dirs.map((dir) => `
    const { recordProjects } = require(${JSON.stringify(path.join(REPO, 'src', 'lib', 'project-registry.js'))});
    await recordProjects([${JSON.stringify(dir)}], { home: ${JSON.stringify(home)}, force: true });
  `), { HOME: home, USERPROFILE: home });
  const saved = JSON.parse(fs.readFileSync(path.join(home, '.aioson', 'projects.json'), 'utf8'));
  assert.equal(saved.projects.length, 6, saved.projects.map((p) => p.name).join(', '));
});

// ─── MEM-05 ───

test('MEM-05: four identical confirmations at once count four detections: promoted once, reinforced twice', async () => {
  const identity = 'mem05-exact-bot';
  const dir = makeCheckout('mem05');
  const proposal = 'Rodar node --test com a flag de concorrência antes de cada commit';
  const body = `
    const { runOpCapture } = require(${JSON.stringify(path.join(REPO, 'src', 'commands', 'op-capture.js'))});
    const result = await runOpCapture({ args: [${JSON.stringify(dir)}], options: { json: true, signal: 'confirmation', quote: 'isso', proposal: ${JSON.stringify(proposal)}, 'source-agent': 'dev' }, logger: { log() {}, error() {}, warn() {} } });
    if (!result.ok) { console.error(JSON.stringify(result)); process.exit(1); }
  `;
  await runTogether([body, body, body, body], { HOME: TEST_HOME, USERPROFILE: TEST_HOME, AIOSON_OPERATOR_ID: identity });
  const root = getStorageRoot(identity);
  const decisions = fs.readdirSync(path.join(root, 'decisions')).filter((f) => f.endsWith('.md'));
  assert.equal(decisions.length, 1, 'the second detection promoted it');
  assert.equal(fs.readdirSync(path.join(root, 'proposals')).filter((f) => f.endsWith('.md')).length, 0);
  assert.equal(Number(readDecision(identity, decisions[0].slice(0, -3)).reinforcement_count), 2, 'the third and fourth reinforced it');
});

test('MEM-05: two equivalent corrections in two projects at once are one decision', async () => {
  const identity = 'mem05-meaning-bot';
  const one = makeCheckout('mem05-one');
  const two = makeCheckout('mem05-two');
  const script = (dir, proposal) => `
    const { runOpCapture } = require(${JSON.stringify(path.join(REPO, 'src', 'commands', 'op-capture.js'))});
    const result = await runOpCapture({ args: [${JSON.stringify(dir)}], options: { json: true, signal: 'correction', quote: 'não use emojis', proposal: ${JSON.stringify(proposal)}, 'source-agent': 'dev' }, logger: { log() {}, error() {}, warn() {} } });
    if (!result.ok) { console.error(JSON.stringify(result)); process.exit(1); }
  `;
  await runTogether([
    script(one, 'Não usar emojis nas mensagens de commit do repositório'),
    script(two, 'Mensagens de commit do repositório sem emojis')
  ], { HOME: TEST_HOME, USERPROFILE: TEST_HOME, AIOSON_OPERATOR_ID: identity });
  const decisions = fs.readdirSync(path.join(getStorageRoot(identity), 'decisions')).filter((f) => f.endsWith('.md'));
  assert.equal(decisions.length, 1, decisions.join(', '));
  const decision = readDecision(identity, decisions[0].slice(0, -3));
  assert.equal(decision.scope, 'operator', 'seen in two projects');
  assert.equal(Number(decision.reinforcement_count), 1);
});

// ─── MEM-06 ───

test('MEM-06: "em todos os meus projetos" said on a repeat is kept and makes the habit', async () => {
  const identity = useIdentity('mem06-bot');
  const dir = makeCheckout('mem06');
  const rule = 'Mensagens de commit devem ficar sem emojis';
  const local = await capture(dir, { signal: 'correction', quote: 'não use emojis no commit', proposal: rule });
  assert.equal(local.scope, 'project');
  const global = await capture(dir, { signal: 'correction', quote: 'não use emojis no commit em todos os meus projetos', proposal: rule });
  assert.equal(global.scope, 'operator');
  const decision = readDecision(identity, local.slug);
  assert.deepEqual(decision.quotes, ['não use emojis no commit', 'não use emojis no commit em todos os meus projetos']);
  assert.match(fs.readFileSync(decisionPath(identity, local.slug), 'utf8'), /## Trigger quotes\n- "não use emojis no commit"\n- "não use emojis no commit em todos os meus projetos"\n$/);
  assert.deepEqual(loadHabits(identity).map((habit) => habit.slug), [local.slug]);
});

test('MEM-06: a decision keeps five quotes — the first, the one naming every project, the newest', async () => {
  const identity = useIdentity('mem06-cap-bot');
  const dir = makeCheckout('mem06-cap');
  const rule = 'Rodar lint antes de cada commit do repositório';
  const said = await capture(dir, { signal: 'correction', quote: 'q0 roda o lint', proposal: rule });
  await capture(dir, { signal: 'correction', quote: 'q1 vale em todos os meus projetos', proposal: rule });
  for (const n of [2, 3, 4, 5, 6]) await capture(dir, { signal: 'correction', quote: `q${n} de novo`, proposal: rule });
  assert.deepEqual(readDecision(identity, said.slug).quotes, ['q0 roda o lint', 'q1 vale em todos os meus projetos', 'q4 de novo', 'q5 de novo', 'q6 de novo']);
});

// ─── MEM-07 ───

test('MEM-07: a pre-scope decision reinforced outside any project is still adopted by the next project', async () => {
  const identity = useIdentity('mem07-bot');
  // A month before this CLI always wrote a scope (archive.js).
  const before = '2026-10-17T00:00:00.000Z';
  seedDecision(identity, 'legacy-prohibition', { signal_type: 'exclusion', promoted_at: before, last_reinforced: before, quotes: ['eu reviso o push'], body: 'Push depende da aprovação do dono', title: 'Push depende da aprovação do dono' });
  regenerateIndex(identity);
  const bare = fs.mkdtempSync(path.join(os.tmpdir(), 'aioson-review-bare-'));
  const outside = await capture(bare, { signal: 'exclusion', quote: 'eu reviso o push', proposal: 'Push depende da aprovação do dono' });
  assert.equal(outside.reinforced, true);
  assert.equal(outside.adopted, undefined, 'no project to adopt it into');
  const project = makeCheckout('mem07');
  const later = await capture(project, { signal: 'exclusion', quote: 'eu reviso o push', proposal: 'Push depende da aprovação do dono' });
  assert.equal(later.adopted, true);
  assert.equal(readDecision(identity, 'legacy-prohibition').scope, 'project');
  assert.ok('legacy-prohibition' in (await list(project)).items, 'in the unasked head where it was said');
});

// ─── MEM-10 ───

test('MEM-10: a decision an older CLI promoted without a scope is operator-wide, not pre-scope', async () => {
  const identity = useIdentity('mem10-bot');
  const dir = makeCheckout('mem10');
  // What `op:promote` of 1.81.0 wrote: no scope field, promoted now.
  seedDecision(identity, 'old-writer-promotion', { quotes: ['sim'], body: 'Publicar a documentação no site', title: 'Publicar a documentação no site' });
  const fresh = readDecision(identity, 'old-writer-promotion');
  assert.equal(isUnprovenLegacy(fresh), false);
  assert.equal(archiveReason(fresh), null);
  regenerateIndex(identity);
  assert.ok('old-writer-promotion' in (await list(dir)).items, 'in the unasked head, as that CLI answered');

  const before = new Date(SCOPE_ALWAYS_WRITTEN_SINCE - DAY_MS).toISOString();
  assert.equal(archiveReason({ ...fresh, promoted_at: before }), 'unproven', 'the same file saved before scopes is pre-scope');
  assert.equal(archiveReason({ ...fresh, promoted_at: undefined }), 'unproven', 'no date reads as old');
});

// ─── MEM-08 / MEM-14 ───

test('MEM-08: a full digest is cut to its budget from the least ranked titles, every cut counted', () => {
  const title = (n) => `Rotina recente para revisão local ${'a'.repeat(65)} ${n}`;
  const items = Object.fromEntries(Array.from({ length: 16 }, (_, i) => [`rule-${i}`, title(i)]));
  const habits = Object.fromEntries(Array.from({ length: 5 }, (_, i) => [`habit-${i}`, `Preferência confirmada para operações ${'a'.repeat(65)} ${i}`]));
  const matched = Array.from({ length: 6 }, (_, i) => `- [Database lição ${i} ${'a'.repeat(65)}](gotchas/database-${i}.md)`);
  const digest = fitBudget({
    ok: true, valid: true, project: { project_name: 'x' },
    learnings: { total: 10, matched: [...matched], rest: 'read .aioson/learnings/INDEX.md when the task or files change (4 line(s) not shown)' },
    memory: { total: 21, habits: { ...habits }, items: { ...items }, body: 'aioson op:show <slug>' },
    routing: 'r'
  });
  const bytes = Buffer.byteLength(JSON.stringify(digest));
  assert.ok(bytes <= DIGEST_BUDGET_BYTES, `${bytes} B`);
  const shown = Object.keys(digest.memory.items).length + Object.keys(digest.memory.habits || {}).length;
  assert.ok(shown < 21);
  assert.match(digest.memory.more, new RegExp(`^${21 - shown} more: `));
  assert.deepEqual(Object.keys(digest.memory.habits), Object.keys(habits), 'habits are cut last');
  assert.ok(Object.keys(digest.memory.items).every((slug, i) => slug === `rule-${i}`), 'the head keeps its highest ranked');
});

test('MEM-08 + MEM-14: the digest of a full store stays in budget and `more` never counts a habit it showed', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'aioson-review-digest-home-'));
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'aioson-review-digest-work-'));
  const identity = 'mem08-digest-bot';
  const previous = [process.env.HOME, process.env.USERPROFILE];
  process.env.HOME = home;
  process.env.USERPROFILE = home;
  try {
    ensureStorageTree(identity);
    const ago = (days) => new Date(Date.now() - days * DAY_MS).toISOString();
    const seed = (slug, fields) => seedDecision(identity, slug, { scope: 'operator', signal_type: 'correction', ...fields });
    for (let i = 0; i < 8; i++) seed(`recent-rule-${i}`, { title: `Rotina recente para revisão local ${'a'.repeat(65)}`, body: `Rotina recente para revisão local ${'a'.repeat(65)}` });
    for (let i = 0; i < 8; i++) seed(`matched-rule-${i}`, { title: `Database regra de configuração ${'a'.repeat(65)}`, body: `Database regra de configuração ${'a'.repeat(65)}`, last_reinforced: ago(30) });
    for (let i = 0; i < 5; i++) seed(`habit-${i}`, { title: `Preferência confirmada para operações ${'a'.repeat(65)}`, body: `Preferência confirmada para operações ${'a'.repeat(65)}`, project_sets: [['pa'], ['pb']], last_reinforced: ago(60) });
    regenerateIndex(identity);
  } finally {
    [process.env.HOME, process.env.USERPROFILE] = previous;
  }
  const dir = makeProject(work, `budget-project-${'x'.repeat(50)}`);
  fs.mkdirSync(path.join(dir, '.aioson', 'learnings'), { recursive: true });
  fs.writeFileSync(path.join(dir, '.aioson', 'learnings', 'INDEX.md'), Array.from({ length: 6 }, (_, i) => `- [Database lição ${i} ${'a'.repeat(65)}](gotchas/database-${i}.md)`).join('\n'));
  const env = { ...process.env, HOME: home, USERPROFILE: home, AIOSON_OPERATOR_ID: identity };
  const res = spawnSync(process.execPath, [CLI, 'context:digest', dir, '--task=database', '--json'], { encoding: 'utf8', env });
  assert.equal(res.status, 0, res.stderr);
  const bytes = Buffer.byteLength(res.stdout.trim());
  assert.ok(bytes <= DIGEST_BUDGET_BYTES, `digest is ${bytes} B (budget ${DIGEST_BUDGET_BYTES})`);
  const { memory } = JSON.parse(res.stdout);
  assert.equal(memory.total, 21);
  const shown = Object.keys(memory.items).length + Object.keys(memory.habits || {}).length;
  if (shown === 21) assert.equal(memory.more, undefined);
  else assert.match(memory.more, new RegExp(`^${21 - shown} more: `));
});

test('MEM-14: every decision shown between items and habits leaves nothing "more"', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'aioson-review-more-home-'));
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'aioson-review-more-work-'));
  const identity = 'mem14-more-bot';
  const previous = [process.env.HOME, process.env.USERPROFILE];
  process.env.HOME = home;
  process.env.USERPROFILE = home;
  try {
    ensureStorageTree(identity);
    seedDecision(identity, 'plain-one', { scope: 'operator', signal_type: 'correction', title: 'Regra um', body: 'Regra um' });
    seedDecision(identity, 'plain-two', { scope: 'operator', signal_type: 'correction', title: 'Regra dois', body: 'Regra dois' });
    seedDecision(identity, 'habit-one', { scope: 'operator', signal_type: 'correction', title: 'Hábito', body: 'Hábito', project_sets: [['pa'], ['pb']] });
    regenerateIndex(identity);
  } finally {
    [process.env.HOME, process.env.USERPROFILE] = previous;
  }
  const dir = makeProject(work, 'more-app');
  const env = { ...process.env, HOME: home, USERPROFILE: home, AIOSON_OPERATOR_ID: identity };
  const res = spawnSync(process.execPath, [CLI, 'context:digest', dir, '--json'], { encoding: 'utf8', env });
  assert.equal(res.status, 0, res.stderr);
  const { memory } = JSON.parse(res.stdout);
  assert.deepEqual(Object.keys(memory.habits), ['habit-one']);
  assert.deepEqual(Object.keys(memory.items).sort(), ['plain-one', 'plain-two']);
  assert.equal(memory.total, 3);
  assert.equal(memory.more, undefined, 'all three are shown');
});

// ─── MEM-09 ───

test('MEM-09: memory events never move the cache hit rate', async () => {
  const { emitDossierEvent } = require('../src/lib/dossier-telemetry');
  const { runContextHealth } = require('../src/commands/context-health');
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'aioson-review-cache-'));
  const dir = makeProject(work, 'cache-project');
  await emitDossierEvent(dir, { agent: 'audit', type: 'cache_hit', summary: 'one cache hit' });
  const before = await runContextHealth({ args: [dir], options: { json: true }, logger: silent() });
  for (let i = 0; i < 4; i++) await emitDossierEvent(dir, { agent: 'op-capture', type: 'op_capture', summary: 'memory event' });
  const after = await runContextHealth({ args: [dir], options: { json: true }, logger: silent() });
  assert.equal(before.cacheHitRate, 100);
  assert.equal(after.cacheHitRate, 100);
  await emitDossierEvent(dir, { agent: 'audit', type: 'cache_miss', summary: 'one cache miss' });
  assert.equal((await runContextHealth({ args: [dir], options: { json: true }, logger: silent() })).cacheHitRate, 50);
});

// ─── MEM-11 / MEM-12 ───

test('MEM-12: op:capture --help says what promotes an authorization', async () => {
  const lines = [];
  await runOpCapture({ args: ['--help'], options: {}, logger: { log: (line) => lines.push(line) } });
  const text = lines.join('\n');
  assert.doesNotMatch(text, /Authorization, exclusion, and correction promote immediately/);
  assert.match(text, /held: awaiting_repeat/);
});

test('MEM-11: the reference docs name the command that lists an archived pre-scope decision', () => {
  for (const file of ['docs/pt/5-referencia/operator-memory.md', 'docs/en/5-reference/operator-memory.md']) {
    const text = fs.readFileSync(path.join(REPO, file), 'utf8');
    assert.match(text, /`unproven`/, file);
    assert.match(text, /op:list \. --include-archived --match=/, file);
  }
});

// ─── MEM-13 ───

test('MEM-13: printable drops CSI, OSC and lone control characters, keeping the text', () => {
  const { printable } = require('../src/lib/terminal-text');
  const esc = String.fromCharCode(0x1b);
  assert.equal(printable(`${esc}[2J${esc}[31mFORGED${esc}[0m`), 'FORGED');
  assert.equal(printable(`${esc}]0;title${String.fromCharCode(0x07)}app`), 'app');
  assert.equal(printable(`a${String.fromCharCode(0x9b)}b${String.fromCharCode(0x00)}c\nd`), 'abcd');
  assert.equal(printable('Node.js · pt-BR'), 'Node.js · pt-BR');
  assert.equal(printable(null), '');
});

test('MEM-13: a project name carrying an ESC sequence prints without it', async () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'aioson-review-ansi-home-'));
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'aioson-review-ansi-work-'));
  const { recordProjects } = require('../src/lib/project-registry');
  const { runOpProfile } = require('../src/commands/op-profile');
  const forged = makeProject(work, 'forged-app', { project_name: 'ESC-HERE[2JFORGED' });
  // The real ESC byte in the file (JSON would escape it), as a cloned repository could carry it.
  const contextFile = path.join(forged, '.aioson', 'context', 'project.context.md');
  fs.writeFileSync(contextFile, fs.readFileSync(contextFile, 'utf8').replace('ESC-HERE', '\u001b'));
  assert.ok(fs.readFileSync(contextFile, 'utf8').includes('\u001b[2JFORGED'));
  await recordProjects([forged], { home, force: true });
  const previous = [process.env.HOME, process.env.USERPROFILE];
  process.env.HOME = home;
  process.env.USERPROFILE = home;
  const lines = [];
  try {
    await runOpProfile({ args: [forged], options: {}, logger: { log: (line) => lines.push(line), error() {}, warn() {} } });
  } finally {
    [process.env.HOME, process.env.USERPROFILE] = previous;
  }
  assert.ok(lines.length > 0);
  const control = (ch) => { const code = ch.charCodeAt(0); return code < 0x20 || (code >= 0x7f && code <= 0x9f); };
  assert.ok(!lines.some((line) => [...line].some(control)), JSON.stringify(lines));
  assert.ok(lines.some((line) => line.includes('FORGED')), 'the readable part stays');
});
