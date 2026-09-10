'use strict';

/**
 * `briefing:feedback` — the lean read of a pending review round.
 *
 * Measured: the refiner folded notes by reading the whole exported JSON,
 * 100–148 KB per round on a mid-sized briefing, 85% of it the briefing text
 * copied twice (`original_text` + `current_text` for every section, commented
 * or not). The view carries every finding, comment, decision and blocking
 * item, and the text of only the sections a note or a status change touches.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const { runBriefingFeedback } = require('../src/commands/briefing');
const { writeBriefingRegistry } = require('../src/lib/refiner/briefing-registry');
const { buildReviewHtml } = require('../src/lib/refiner/review-html');
const { buildInitialFeedback } = require('../src/lib/refiner/feedback-schema');

// The only producer of comments and blocking items is the review page's
// `collect()`. The fixture used a made-up `{ text }` comment the view happened
// to read, while the page writes `{ ..., note, severity, resolved }` — so the
// refiner read `comment on temas: ` with every owner note blank. The records
// below are built by the object literals the generated runtime pushes, so a
// producer rename fails here instead of in a consumer's refinement round.
function producerRecords() {
  const html = buildReviewHtml({
    feedback: buildInitialFeedback({ slug: 'painel', sourcePath: '.aioson/briefings/painel/briefings.md', sourceHash: 'x', sections: [] }),
    sourceMarkdown: '# Painel\n',
    locale: 'pt-BR'
  });
  const literals = (list) => [...html.matchAll(new RegExp(`feedback\\.${list}\\.push\\((\\{[^}]*\\})\\)`, 'g'))]
    .map((match) => new Function('section', 'finding', 'note', 'severity', 'L', `return (${match[1]});`));
  const [comment] = literals('comments');
  const [sectionBlock, findingBlock] = literals('blocking_items');
  assert.ok(comment && sectionBlock && findingBlock, 'the review runtime no longer pushes comments/blocking items as object literals — rebuild this fixture from the producer');
  return { comment, sectionBlock, findingBlock };
}

function makeLogger() {
  const lines = [];
  return { log: (m = '') => lines.push(String(m)), error: (m = '') => lines.push(String(m)), warn: () => {}, lines };
}

async function write(dir, rel, body) {
  const file = path.join(dir, rel);
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, body, 'utf8');
}

const LONG = (label) => `${label}. ${'Uma frase longa que ocupa espaço no arquivo exportado e não muda entre rodadas. '.repeat(40)}`;

async function makeRound(dir, slug) {
  await write(dir, '.aioson/context/project.context.md', '---\nclassification: MICRO\ninteraction_language: pt-BR\n---\n');
  await write(dir, `.aioson/briefings/${slug}/briefings.md`, '# Painel\n\n## Problema\n\ntexto\n');
  await writeBriefingRegistry(dir, {
    updated_at: '2026-09-01',
    briefings: [{ slug, status: 'draft', source_plans: [], created_at: '2026-09-01', approved_at: null, prd_generated: null }]
  });
  const sections = [
    { id: 'problem', title: 'Problema', source_path: 'briefings.md#problema', original_text: LONG('Problema'), original_hash: 'h1', current_text: LONG('Problema'), status: 'unchanged', comments_count: 0 },
    { id: 'themes', title: 'Temas', source_path: 'briefings.md#temas', original_text: LONG('Temas'), original_hash: 'h2', current_text: LONG('Temas'), status: 'unchanged', comments_count: 1 },
    { id: 'scope', title: 'Escopo', source_path: 'briefings.md#escopo', original_text: LONG('Escopo'), original_hash: 'h3', current_text: `${LONG('Escopo')} Ajustado pelo dono.`, status: 'change_requested', comments_count: 0 },
    { id: 'risks', title: 'Riscos', source_path: 'briefings.md#riscos', original_text: LONG('Riscos'), original_hash: 'h4', current_text: LONG('Riscos'), status: 'unchanged', comments_count: 0 }
  ];
  const feedback = {
    schema_version: '1.1',
    briefing_slug: slug,
    source_briefing_path: `.aioson/briefings/${slug}/briefings.md`,
    source_hash: 'abc',
    review_generated_at: '2026-09-01T00:00:00.000Z',
    last_modified_at: '2026-09-01T00:10:00.000Z',
    export_method: 'download',
    round: 2,
    sections,
    findings: [
      { id: 'F1', section_id: 'risks', category: 'gap', severity: 'high', blocking: true, text: 'A promessa PROM-09 não tem tela.', status: 'accepted', note: 'Entra na menor fatia.' },
      { id: 'F2', section_id: 'problem', category: 'ambiguity', severity: 'low', blocking: false, text: 'Termo ambíguo.', status: 'pending' }
    ],
    comments: [producerRecords().comment(sections[1], null, 'Falta o tema de exportação.', 'note')],
    decisions: [],
    blocking_items: []
  };
  await write(dir, `.aioson/briefings/${slug}/refinement-feedback.json`, JSON.stringify(feedback, null, 2));
  return feedback;
}

test('the view carries every finding and comment but the text of only the touched sections, at a fraction of the file', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'aioson-feedback-view-'));
  const slug = 'painel';
  try {
    await makeRound(dir, slug);
    const view = await runBriefingFeedback({ args: [dir], options: { slug, json: true }, logger: makeLogger() });
    assert.equal(view.ok, true);
    assert.equal(view.round, 2);
    assert.equal(view.findings.length, 2);
    assert.equal(view.comments.length, 1);
    const byId = Object.fromEntries(view.sections.map((s) => [s.id, s]));
    assert.equal(byId.problem.current_text, undefined, 'a pending finding does not force the section text into the view');
    assert.ok(byId.themes.current_text, 'a commented section carries its text');
    assert.ok(byId.scope.current_text && byId.scope.text_changed, 'a changed section carries its text');
    assert.ok(byId.risks.current_text, 'an accepted finding targets its section');
    assert.ok(view.bytes.view * 2 < view.bytes.file, `view ${view.bytes.view} vs file ${view.bytes.file}`);

    const logger = makeLogger();
    await runBriefingFeedback({ args: [dir], options: { slug }, logger });
    const out = logger.lines.join('\n');
    assert.match(out, /round 2/);
    assert.match(out, /\[F1\] risks · gap\/high · BLOCKING · accepted/);
    assert.match(out, /note: Entra na menor fatia\./);
    assert.match(out, /comment on themes: Falta o tema de exportação\./);
    assert.match(out, /## problem — Problema \[unchanged\]\n  \(untouched — text omitted/);
    assert.match(out, /## scope — Escopo \[change_requested, text changed\]/);
    assert.match(out, /briefing:apply-feedback \. --slug=painel --json/);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test('the text view prints the notes the review page writes — comments and blocking items — and marks a cut note', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'aioson-feedback-view-'));
  const slug = 'painel';
  try {
    await makeRound(dir, slug);
    const file = path.join(dir, '.aioson', 'briefings', slug, 'refinement-feedback.json');
    const feedback = JSON.parse(await fs.readFile(file, 'utf8'));
    const { comment, sectionBlock, findingBlock } = producerRecords();
    // What collect() writes for a section the owner blocked with a note, a
    // long note on another section, and a pending blocking finding.
    const risks = feedback.sections.find((s) => s.id === 'risks');
    risks.status = 'blocked';
    const blockedNote = 'O dono quer o filtro por período antes do MVP.';
    const longNote = `Detalhe do dono sobre o escopo. ${'Mais um motivo concreto para mudar a seção. '.repeat(12)}FIM-DA-NOTA`;
    feedback.comments.push(comment(risks, null, blockedNote, 'blocking'));
    feedback.comments.push(comment({ id: 'scope' }, null, longNote, 'note'));
    feedback.blocking_items.push(sectionBlock(risks, null, blockedNote, 'blocking', { section_blocked: 'Seção marcada como bloqueada' }));
    const pending = { id: 'F3', section_id: 'scope', category: 'gap', severity: 'high', blocking: true, text: 'Falta o fluxo de exportação para CSV.', status: 'pending' };
    feedback.findings.push(pending);
    feedback.blocking_items.push(findingBlock(null, pending));
    await fs.writeFile(file, JSON.stringify(feedback, null, 2));

    const logger = makeLogger();
    await runBriefingFeedback({ args: [dir], options: { slug }, logger });
    const out = logger.lines.join('\n');
    assert.match(out, /comment on themes: Falta o tema de exportação\./);
    assert.match(out, /comment on risks: O dono quer o filtro por período antes do MVP\./);
    assert.doesNotMatch(out, /comment on [\w-]+: *$/m, 'no owner note prints blank');
    assert.match(out, /blocking on risks: O dono quer o filtro por período antes do MVP\./);
    assert.match(out, /blocking on scope: Falta o fluxo de exportação para CSV\./);
    assert.doesNotMatch(out, /blocking[^\n]*\{"id"/, 'a blocking item prints its note, not raw JSON');

    const cut = logger.lines.find((line) => line.startsWith('  comment on scope: '));
    assert.ok(cut, out);
    assert.doesNotMatch(cut, /FIM-DA-NOTA/, 'the fixture note is longer than one view line');
    assert.match(cut, /… \(cut — see --json\)$/, 'a cut note says it was cut and where the rest lives');
    const json = await runBriefingFeedback({ args: [dir], options: { slug, json: true }, logger: makeLogger() });
    assert.ok(json.comments.some((c) => c.note === longNote), 'the --json view carries the whole note');
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test('a missing round is reported, not invented', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'aioson-feedback-view-'));
  const slug = 'painel';
  try {
    await makeRound(dir, slug);
    await fs.rm(path.join(dir, '.aioson', 'briefings', slug, 'refinement-feedback.json'));
    const logger = makeLogger();
    const result = await runBriefingFeedback({ args: [dir], options: { slug }, logger });
    assert.equal(result.ok, false);
    assert.equal(result.error, 'feedback_not_found');
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});
