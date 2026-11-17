'use strict';

/**
 * Operator memory learns from repetition, not from one-time answers:
 * - a repeat worded differently is still a repeat (equivalence.js);
 * - an authorization is standing only when the user's words say so, or when
 *   it comes back (standing.js + op:capture);
 * - a decision saved before scopes existed must show it is standing to stay in
 *   the session-start recall, and permissions age out (archive.js);
 * - proposals that never came back expire into history (housekeeping.js).
 * Measured on a real four-month store first: 665 of 676 decisions never
 * reinforced, 0 widened since scoping, 309 of 357 authorizations quoting
 * nothing beyond the moment, 15 recall titles shown in a project of which 1
 * was that project's.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const TEST_HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'aioson-om-recur-'));
process.env.HOME = TEST_HOME;
process.env.USERPROFILE = TEST_HOME;
process.env.AIOSON_OPERATOR_ID = 'recurrence-bot';

const { standingMarker, hasStandingProof } = require('../src/operator-memory/standing');
const { similarity, signature, findEquivalent } = require('../src/operator-memory/equivalence');
const { archiveReason, isUnprovenLegacy } = require('../src/operator-memory/archive');
const { sweepStore, expireProposals, PROPOSAL_TTL_DAYS } = require('../src/operator-memory/housekeeping');
const { readDecision, serializeDecision, decisionPath } = require('../src/operator-memory/decision');
const { readProposal, writeProposal } = require('../src/operator-memory/proposal');
const { ensureStorageTree, getStorageRoot } = require('../src/operator-memory/storage');
const { regenerateIndex, loadMemoryIndex } = require('../src/operator-memory/index-md');
const { runOpCapture } = require('../src/commands/op-capture');
const { runOpList } = require('../src/commands/op-list');

const DAY_MS = 24 * 60 * 60 * 1000;
const silent = () => ({ log: () => {}, error: () => {}, warn: () => {} });

function useIdentity(identity) {
  process.env.AIOSON_OPERATOR_ID = identity;
  ensureStorageTree(identity);
  return identity;
}

function makeCheckout(name) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `aioson-recur-${name}-`));
  fs.mkdirSync(path.join(dir, '.git'));
  fs.writeFileSync(path.join(dir, '.git', 'config'), `[core]\n\tbare = false\n[remote "origin"]\n\turl = https://github.com/acme/${name}.git\n`);
  return dir;
}

async function inDir(dir, fn) {
  const previous = process.cwd();
  process.chdir(dir);
  try { return await fn(); } finally { process.chdir(previous); }
}

const capture = (dir, options) => inDir(dir, () => runOpCapture({ args: [], options: { json: true, 'source-agent': 'dev', ...options }, logger: silent() }));
const list = (dir, options = {}) => inDir(dir, () => runOpList({ args: [], options: { json: true, 'titles-only': true, ...options }, logger: silent() }));

function seedLegacy(identity, slug, { signal = 'authorization', quote = 'sim', body = `legacy ${slug}`, daysAgo = 0, category = 'default', reinforced = 0 } = {}) {
  const at = new Date(Date.now() - daysAgo * DAY_MS).toISOString();
  // No `scope` field: the shape every decision had before scopes existed.
  fs.writeFileSync(decisionPath(identity, slug), serializeDecision({
    slug, signal_type: signal, promoted_at: at, last_reinforced: at, reinforcement_count: reinforced,
    category, source_agent: 'dev', quotes: [quote], body, title: body
  }));
}

// ─── standing.js ───

test('standing markers: words for the future in pt-BR, en and es, per signal', () => {
  const standing = [
    ['authorization', 'pode commitar sempre que aprovar a fatia'],
    ['authorization', 'daqui pra frente não precisa me perguntar antes de rodar os testes'],
    ['authorization', 'from now on, no need to ask before running npm test'],
    ['authorization', 'de ahora en adelante puedes hacer commit sin preguntar'],
    ['authorization', 'em todos os meus projetos pode usar pnpm'],
    ['exclusion', 'npm publish eu faço manualmente'],
    ['exclusion', 'deixa que eu dou o push'],
    ['exclusion', 'deploy to production I do myself'],
    ['correction', 'pare de colocar emojis nos commits'],
    ['correction', 'não use Tailwind, prefiro CSS modules'],
    ['correction', 'stop adding summaries at the end']
  ];
  for (const [signal, quote] of standing) assert.ok(hasStandingProof([quote], signal), `${signal}: ${quote}`);

  const oneTime = [
    ['authorization', 'sim'],
    ['authorization', 'confirmo'],
    ['authorization', 'abrir a url (Recommended)'],
    ['authorization', 'poderia fazer isso agora?'],
    ['authorization', '@validador'],
    ['authorization', 'ok com o protótipo aprovado'],
    ['authorization', 'yes, go ahead']
  ];
  for (const [signal, quote] of oneTime) assert.equal(standingMarker([quote], signal), null, `${signal}: ${quote}`);
  assert.equal(hasStandingProof([], 'authorization'), false, 'no quote, no proof');
  // A marker of another signal does not prove this one.
  assert.equal(hasStandingProof(['manualmente'], 'authorization'), false);
});

// ─── equivalence.js ───

test('equivalence: a decision reworded is the same one; different identifiers keep two decisions apart', () => {
  const a = signature('Autoriza implementar em etapas e criar commits locais na main entre alterações validadas.');
  const b = signature('Autoriza implementar fatias concretas e criar commits locais após cada entrega validada.');
  assert.ok(similarity(a, b) >= 0.4, `reworded: ${similarity(a, b)}`);

  const phase2 = signature('Continuar a implementação da fase 2 de project-capabilities com um DEV, preservando as exclusões');
  const phase3 = signature('Continuar a implementação da fase 3 de project-capabilities com um DEV, preservando as exclusões');
  assert.equal(similarity(phase2, phase3), 0, 'phase 2 and phase 3 are two decisions');

  const close1 = signature('Autoriza fechar a feature briefing-review-decision-room e criar o commit local correspondente');
  const close2 = signature('Autoriza fechar a feature reliable-agentic-delivery e criar o commit local correspondente');
  assert.equal(similarity(close1, close2), 0, 'two features\' approvals are two decisions');

  const unrelated = signature('Usar pnpm como gerenciador de pacotes do monorepo');
  assert.ok(similarity(a, unrelated) < 0.4);
  assert.equal(similarity(signature('sim'), signature('sim')), 0, 'too little to compare');
});

test('equivalence: the store answers with the decision before a proposal, same signal type only', () => {
  const identity = useIdentity('equivalence-store-bot');
  seedLegacy(identity, 'commit-after-each-validated-slice', {
    signal: 'authorization', quote: 'pode commitar sempre', body: 'Autoriza implementar fatias concretas e criar commits locais após cada entrega validada.'
  });
  writeProposal(identity, {
    slug: 'commit-proposal-twin', signal_type: 'authorization', detected_count: 1, first_detected: new Date().toISOString(), last_detected: new Date().toISOString(),
    quotes: ['sim'], proposal: 'Autoriza implementar fatias concretas e criar commits locais após cada entrega validada', source_agent: 'dev', proposal_fingerprint: 'f'
  });
  const found = findEquivalent(identity, { signalType: 'authorization', proposal: 'Autoriza implementar em etapas e criar commits locais na main entre alterações validadas.' });
  assert.equal(found.slug, 'commit-after-each-validated-slice');
  assert.equal(found.kind, 'decision');
  assert.equal(findEquivalent(identity, { signalType: 'correction', proposal: 'Autoriza implementar em etapas e criar commits locais na main entre alterações validadas.' }), null);
});

// ─── op:capture end to end ───

test('op:capture: a one-time authorization waits; its repeat in other words promotes it', async () => {
  useIdentity('capture-repeat-bot');
  const api = makeCheckout('repeat-api');
  const first = await capture(api, { signal: 'authorization', quote: 'sim, pode', proposal: 'Rodar a suíte de testes completa antes de cada commit local do projeto' });
  assert.equal(first.promoted, false);
  assert.equal(first.held, 'awaiting_repeat');
  const again = await capture(api, { signal: 'authorization', quote: 'ok, roda', proposal: 'Antes de cada commit local, rodar a suíte completa de testes do projeto' });
  assert.equal(again.promoted, true, 'the repeat, worded differently, is the proof');
  assert.equal(again.slug, first.slug, 'one decision, under the first slug');
  assert.equal(again.matched_by, 'meaning');
  assert.equal(again.scope, 'project');
});

test('op:capture: a correction reworded in a second project reinforces it and widens it to every project', async () => {
  const identity = useIdentity('capture-widen-bot');
  const one = makeCheckout('widen-one');
  const two = makeCheckout('widen-two');
  const said = await capture(one, { signal: 'correction', quote: 'não use emojis nos commits', proposal: 'Não usar emojis nas mensagens de commit do repositório' });
  assert.equal(said.promoted, true);
  assert.equal(said.scope, 'project');
  const elsewhere = await capture(two, { signal: 'correction', quote: 'de novo emoji no commit, não', proposal: 'Mensagens de commit do repositório sem emojis' });
  assert.equal(elsewhere.reinforced, true);
  assert.equal(elsewhere.slug, said.slug);
  assert.equal(elsewhere.matched_by, 'meaning');
  assert.equal(elsewhere.scope, 'operator', 'a second project widens it');
  assert.equal(Number(readDecision(identity, said.slug).reinforcement_count), 1);
});

test('op:capture: an unproven pre-scope decision said again is adopted by the project it was said in', async () => {
  const identity = useIdentity('capture-adopt-bot');
  const here = makeCheckout('adopt-here');
  const there = makeCheckout('adopt-there');
  seedLegacy(identity, 'legacy-pnpm-workspaces', { signal: 'correction', quote: 'aqui tá errado', body: 'Usar pnpm workspaces para os pacotes internos do monorepo' });
  regenerateIndex(identity);
  assert.equal(isUnprovenLegacy(readDecision(identity, 'legacy-pnpm-workspaces')), true);
  assert.ok(!Object.keys((await list(here)).items).includes('legacy-pnpm-workspaces'), 'archived before the repeat');

  const repeated = await capture(here, { signal: 'correction', quote: 'usa pnpm workspaces', proposal: 'Os pacotes internos do monorepo usam pnpm workspaces' });
  assert.equal(repeated.reinforced, true);
  assert.equal(repeated.adopted, true);
  assert.equal(repeated.scope, 'project');
  assert.ok(Object.keys((await list(here)).items).includes('legacy-pnpm-workspaces'), 'back in the recall where it was said');
  assert.ok(!Object.keys((await list(there)).items).includes('legacy-pnpm-workspaces'), 'and only there');
});

// ─── archive.js + index + op:list ───

test('archive: unproven pre-scope decisions and aged permissions leave the recall; prohibitions and identity never age out', () => {
  const now = Date.now();
  const at = (days) => new Date(now - days * DAY_MS).toISOString();
  const base = { category: 'default', reinforcement_count: 0, quotes: ['q'] };
  assert.equal(archiveReason({ ...base, signal_type: 'authorization', last_reinforced: at(1) }, now), 'unproven');
  assert.equal(archiveReason({ ...base, signal_type: 'authorization', quotes: ['sempre'], last_reinforced: at(1) }, now), null);
  assert.equal(archiveReason({ ...base, signal_type: 'authorization', reinforcement_count: 1, last_reinforced: at(1) }, now), null, 'reinforced is proven');
  assert.equal(archiveReason({ ...base, signal_type: 'confirmation', last_reinforced: at(1) }, now), null, 'a confirmation was repeated to exist');
  assert.equal(archiveReason({ ...base, signal_type: 'correction', category: 'identity', last_reinforced: at(1) }, now), null);

  const scoped = { ...base, scope: 'operator' };
  assert.equal(archiveReason({ ...scoped, signal_type: 'authorization', last_reinforced: at(179) }, now), null);
  assert.equal(archiveReason({ ...scoped, signal_type: 'authorization', last_reinforced: at(180) }, now), 'stale', 'two 90-day half-lives');
  assert.equal(archiveReason({ ...scoped, signal_type: 'authorization', category: 'autonomy', last_reinforced: at(300) }, now), null, 'autonomy half-life is 180 days');
  assert.equal(archiveReason({ ...scoped, signal_type: 'exclusion', last_reinforced: at(900) }, now), null, 'an obeyed prohibition is never said again');
  assert.equal(archiveReason({ ...scoped, signal_type: 'correction', last_reinforced: at(900) }, now), null);
  assert.equal(archiveReason({ ...scoped, signal_type: 'authorization', category: 'identity', last_reinforced: at(900) }, now), null);
});

test('archive: the index splits into MEMORY.md and MEMORY-archive.md with the reason; op:list counts and lists on request', async () => {
  const identity = useIdentity('archive-index-bot');
  const dir = makeCheckout('archive-index');
  seedLegacy(identity, 'legacy-proven', { quote: 'pode commitar sempre' });
  seedLegacy(identity, 'legacy-one-time', { quote: 'sim' });
  seedLegacy(identity, 'legacy-old-prohibition', { signal: 'exclusion', quote: 'nunca dê push', daysAgo: 400 });
  fs.writeFileSync(decisionPath(identity, 'aged-permission'), serializeDecision({
    slug: 'aged-permission', signal_type: 'authorization', promoted_at: new Date(Date.now() - 200 * DAY_MS).toISOString(),
    last_reinforced: new Date(Date.now() - 200 * DAY_MS).toISOString(), reinforcement_count: 0, category: 'default',
    source_agent: 'dev', quotes: ['pode sempre'], body: 'aged permission', title: 'aged permission', scope: 'operator'
  }));
  regenerateIndex(identity);

  const active = loadMemoryIndex(identity, 'active');
  const archived = loadMemoryIndex(identity, 'archive');
  assert.deepEqual(active.entries.map((e) => e.slug).sort(), ['legacy-old-prohibition', 'legacy-proven']);
  assert.deepEqual(archived.entries.map((e) => e.slug).sort(), ['aged-permission', 'legacy-one-time']);
  assert.equal(active.frontmatter.archived_count, 2);
  assert.match(archived.raw, /legacy-one-time\.md\) — authorization, reinforced \S+ — archived: unproven/);
  assert.match(archived.raw, /aged-permission\.md\) — authorization, reinforced \S+ — archived: stale/);

  const recall = await list(dir, { limit: '0' });
  assert.deepEqual(Object.keys(recall.items).sort(), ['legacy-old-prohibition', 'legacy-proven']);
  assert.equal(recall.archived, 2);
  const everything = await list(dir, { 'include-archived': true, limit: '0' });
  assert.equal(Object.keys(everything.items).length, 4);
  assert.match(everything.items['legacy-one-time'], /\[archive\]/);
  for (const slug of ['legacy-one-time', 'aged-permission']) assert.ok(readDecision(identity, slug), `${slug} file untouched`);
});

test('archive: an index written before a decision aged is read by the decision, not by the file', async () => {
  const identity = useIdentity('archive-read-time-bot');
  const dir = makeCheckout('archive-read-time');
  seedLegacy(identity, 'fresh-then-old', { quote: 'pode sempre', body: 'fresh then old' });
  regenerateIndex(identity);
  // Months pass without any write: the index still lists it as active.
  const old = new Date(Date.now() - 200 * DAY_MS).toISOString();
  const content = fs.readFileSync(decisionPath(identity, 'fresh-then-old'), 'utf8').replace(/^last_reinforced: .*$/m, `last_reinforced: ${old}`);
  fs.writeFileSync(decisionPath(identity, 'fresh-then-old'), content);
  const recall = await list(dir, { limit: '0' });
  assert.ok(!('fresh-then-old' in recall.items));
  assert.equal(recall.archived, 1);
});

test('the unasked head holds what is known to apply here; a pre-scope decision needs the task to name it twice', async () => {
  const identity = useIdentity('head-scope-bot');
  const here = makeCheckout('head-here');
  seedLegacy(identity, 'legacy-zoom-steps', { signal: 'correction', quote: 'nunca use passos grandes', body: 'Na tela de Terminais, usar pequenos passos de zoom de 3 a 5 pontos' });
  seedLegacy(identity, 'legacy-real-tests', { signal: 'correction', quote: 'nunca OpenCode', body: 'Testes reais usam só Codex ou Claude Code Haiku; nunca OpenCode' });
  const said = await capture(here, { signal: 'correction', quote: 'não mude o layout do login', proposal: 'Preservar a composição visual da tela de login deste app' });
  regenerateIndex(identity);

  const head = await list(here);
  assert.deepEqual(Object.keys(head.items), [said.slug], 'only what is known to apply here, unasked');
  assert.equal(head.total, 3);
  assert.equal(head.omitted, 2, 'the pre-scope ones are counted, reachable by --match');

  const login = await list(here, { match: 'ajustar a tela de login' });
  assert.deepEqual(Object.keys(login.items), [said.slug], 'one shared word ("tela") pulls in no screen rule of another project');
  const realTests = await list(here, { match: 'configurar testes reais com codex' });
  assert.ok('legacy-real-tests' in realTests.items, 'named by the task, a standing rule of unknown project answers');
  const everywhere = await list(here, { all: true });
  assert.ok('legacy-zoom-steps' in everywhere.items, '--all keeps those of every project');
});

// ─── housekeeping.js ───

test('housekeeping: a proposal never repeated within the TTL moves to history, once a day, decisions untouched', () => {
  const identity = useIdentity('housekeeping-bot');
  const now = Date.now();
  const at = (days) => new Date(now - days * DAY_MS).toISOString();
  const proposal = (slug, days) => writeProposal(identity, {
    slug, signal_type: 'confirmation', detected_count: 1, first_detected: at(days), last_detected: at(days),
    quotes: ['q'], proposal: slug, source_agent: 'dev', proposal_fingerprint: 'f'
  });
  proposal('stale-proposal', PROPOSAL_TTL_DAYS + 1);
  proposal('live-proposal', PROPOSAL_TTL_DAYS - 1);
  seedLegacy(identity, 'kept-decision', { quote: 'sim', daysAgo: 400 });

  const swept = sweepStore(identity, { now });
  assert.deepEqual(swept.expired, ['stale-proposal']);
  assert.equal(readProposal(identity, 'stale-proposal'), null);
  assert.ok(readProposal(identity, 'live-proposal'));
  assert.ok(fs.readdirSync(path.join(getStorageRoot(identity), 'history')).some((f) => f.endsWith('-stale-proposal.md')), 'recoverable in history/');
  assert.ok(readDecision(identity, 'kept-decision'), 'decisions are never deleted by the sweep');
  assert.ok(fs.existsSync(path.join(getStorageRoot(identity), 'MEMORY-archive.md')), 'the index is rewritten with its archive tier');

  proposal('another-stale', PROPOSAL_TTL_DAYS + 5);
  assert.equal(sweepStore(identity, { now: now + 60 * 1000 }), null, 'at most once a day');
  assert.ok(readProposal(identity, 'another-stale'));
  assert.deepEqual(expireProposals(identity, now), ['another-stale']);
});
