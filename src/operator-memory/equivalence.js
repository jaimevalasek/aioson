'use strict';

/**
 * operator-memory — when a new signal says what an earlier one already said.
 *
 * The agent paraphrases every signal in its own words, so one standing
 * decision comes back worded differently in each session. Keyed on the exact
 * paraphrase, a repeat was never seen: on a real store kept for four months,
 * 665 of 676 decisions were never reinforced, none widened to every project
 * and 120 of 142 confirmations waited for a second detection forever.
 *
 * Two paraphrases of the same signal type are one decision when their content
 * words overlap strongly AND they name the same identifiers — a number, a
 * version, a feature or file slug — so "phase 2" and "phase 3", or the
 * approvals of two features, stay two decisions. Erring toward "different"
 * only costs a missed reinforcement; erring toward "same" would reinforce,
 * promote or widen the wrong decision, so the bar is high.
 *
 * A set of words cannot see what a sentence does with them: "usar Tailwind" and
 * "não usar Tailwind", "preferir Postgres a MySQL" and "preferir MySQL a
 * Postgres" share every content word (similarity 1), and "commit da correção
 * de login" / "commit da migração de pagamentos" keep the frame around a
 * swapped object. Three guards read the sentence: the same polarity (count of
 * negations, folded), the same order of the shared words when either names a
 * preference or a replacement, and no single swapped span inside an
 * otherwise identical frame. What survives is `strong` at STRONG_THRESHOLD and
 * up: only a strong match may carry a signal into a project the entry was not
 * seen in (op:capture), since that is what widens a decision to every project.
 */

const fs = require('node:fs');
const path = require('node:path');
const { getStorageRoot } = require('./storage');
const { foldText } = require('./project-scope');

// Jaccard of the content-word sets, with at least MIN_SHARED_WORDS in common.
// Measured on a real store of 818 entries: with the identifier guard, every
// pair at 0.4 and up was one decision reworded ("criar commits locais após
// cada entrega validada" said two ways); none paired two different ones.
const EQUIVALENCE_THRESHOLD = 0.4;
// Measured on the same store: of the four pairs at 0.4 and up, the two at
// 0.45 and 0.5 were one decision reworded, but at that level a reworded pair
// and two objects in one frame read alike. Widening needs more than that.
const STRONG_THRESHOLD = 0.6;
const MIN_CONTENT_WORDS = 3;
const MIN_SHARED_WORDS = 3;

// A negation, folded. Parity decides: "não usar" and "nunca usar" agree,
// "usar" and "não usar" do not, "não deixe de rodar" reads like "rodar".
// "sem"/"without"/"sin" count: "commit sem perguntar" is not "commit
// perguntando". The bare "no" is the Portuguese "in the" ("no banco"), so only
// a Spanish "no" before a verb of a rule counts.
const NEGATION = new RegExp([
  String.raw`\b(?:nao|nunca|jamais|nem|sem|nenhum|nenhuma|proibid[oa]s?|proibir|evit(?:ar|e|a|em|ando)|par(?:ar|e|em) de)\b`,
  String.raw`\b(?:not|never|nor|without|cannot|(?:do|does|did|is|are|was|were|wo|ca|should|would|could|must|need)n'?t|avoid\w*|forbid\w*|prohibit\w*|no (?:longer|more)|stop(?:s|ped)? \w+ing)\b`,
  String.raw`\b(?:jamas|tampoco|ningun[oa]?|sin|prohibid[oa]s?|deja de|no (?:usar|uses|use|usen|hacer|hagas|haga|hagan|poner|pongas|crear|crees|cambiar|cambies|agregar|agregues|anadir|incluir|incluyas|escribir|escribas|ejecutar|ejecutes|publicar|publiques|enviar|envies|mostrar|muestres|permitir|permitas|tocar|toques|modificar|modifiques|subir|subas|es|hay|debe|deben|se))\b`
].join('|'), 'g');

// A preference or a replacement: the order of its words is its meaning.
const DIRECTED = /\b(?:prefer\w*|prefir\w*|prefier\w*|em vez d[eoa]s?|ao inves d[eoa]s?|no lugar d[eoa]s?|instead of|rather than|than|over|versus|vs|do que|en vez de|en lugar de|antes que|melhor que|better than)\b/;

// Grammar of en / pt-BR / es, plus the words every memory paraphrase opens
// with ("o dono autoriza…", "the owner approved…"): they say a decision was
// made, not what it is about, and would pull unrelated decisions together.
const NOISE_WORDS = new Set([
  // en
  'the', 'and', 'for', 'with', 'from', 'into', 'that', 'this', 'these', 'those', 'are', 'was', 'were', 'been',
  'being', 'have', 'has', 'had', 'not', 'but', 'its', 'their', 'than', 'then', 'when', 'what', 'which', 'who',
  'will', 'would', 'should', 'must', 'can', 'could', 'may', 'might', 'also', 'only', 'just', 'all', 'any',
  'each', 'every', 'some', 'such', 'own', 'other', 'more', 'most', 'very', 'about', 'over', 'under', 'after',
  'before', 'without', 'within', 'via', 'per', 'use', 'uses', 'using',
  'owner', 'user', 'operator', 'authorizes', 'authorized', 'authorize', 'approves', 'approved', 'approve',
  'allows', 'allowed', 'allow', 'asks', 'asked', 'wants', 'wanted',
  // pt-BR
  'que', 'dos', 'das', 'nos', 'nas', 'aos', 'pelo', 'pela', 'pelos', 'pelas', 'para', 'por', 'com', 'sem',
  'uma', 'uns', 'umas', 'ele', 'ela', 'eles', 'elas', 'seu', 'sua', 'seus', 'suas', 'esse', 'essa', 'esses',
  'essas', 'este', 'esta', 'estes', 'estas', 'isso', 'isto', 'aquele', 'aquela', 'nao', 'mais', 'menos',
  'muito', 'muita', 'como', 'quando', 'onde', 'qual', 'quais', 'tambem', 'apenas', 'somente', 'ja', 'ainda',
  'entre', 'sobre', 'sob', 'apos', 'antes', 'depois', 'ate', 'cada', 'todo', 'toda', 'todos', 'todas', 'outro',
  'outra', 'outros', 'outras', 'mesmo', 'mesma', 'ser', 'sao', 'foi', 'esta', 'estao', 'deve', 'devem',
  'pode', 'podem', 'usar', 'usa', 'usam', 'neste', 'nesta', 'nesse', 'nessa', 'deste', 'desta', 'desse', 'dessa',
  'dono', 'usuario', 'operador', 'autoriza', 'autorizou', 'autorizado', 'autorizada', 'aprova', 'aprovou',
  'aprovado', 'aprovada', 'permite', 'permitiu', 'pede', 'pediu', 'quer', 'quis',
  // es
  'los', 'las', 'del', 'con', 'sin', 'una', 'unos', 'unas', 'pero', 'como', 'cuando', 'donde', 'cual', 'este',
  'esta', 'estos', 'estas', 'ese', 'esa', 'tambien', 'solo', 'debe', 'deben', 'puede', 'pueden', 'usuario',
  'dueno', 'autoriza', 'autorizo', 'aprueba', 'aprobo'
]);

// An identifier names one thing: digits anywhere ("fase 2", "v1.37.2", "p1",
// "gpt-6"), or words joined by `-`, `_`, `.`, `:` or `/` ("git:guard",
// "origin/main", "briefing-review-decision-room").
const IDENTIFIER = /[a-z0-9]+(?:[-_.:/][a-z0-9]+)+|[a-z]*\d[a-z0-9]*/g;
// Slashed conjunctions read as one word, not as the name of a thing.
const NOT_IDENTIFIERS = new Set(['e/ou', 'and/or', 'y/o']);

function stem(word) {
  return word.length > 4 && word.endsWith('s') ? word.slice(0, -1) : word;
}

/** The identifiers a paraphrase names, folded. */
function identifiersOf(text) {
  return new Set((foldText(text).match(IDENTIFIER) || []).filter((id) => !NOT_IDENTIFIERS.has(id)));
}

/** The content words in the order the paraphrase says them, first occurrence each. */
function contentSequenceOf(text) {
  const plain = foldText(text).replace(IDENTIFIER, ' ');
  return [...new Set(plain.split(/[^a-z]+/).filter((word) => word.length >= 3 && !NOISE_WORDS.has(word)).map(stem))];
}

/** The words that say what a paraphrase is about: folded, stemmed, noise out. */
function contentWordsOf(text) {
  return new Set(contentSequenceOf(text));
}

/** How many negations the paraphrase holds (only its parity is compared). */
function negationsOf(text) {
  return (foldText(text).match(NEGATION) || []).length;
}

function jaccard(a, b) {
  let shared = 0;
  for (const word of a) if (b.has(word)) shared += 1;
  const union = a.size + b.size - shared;
  if (union === 0 || shared < MIN_SHARED_WORDS) return 0;
  return shared / union;
}

function sameSet(a, b) {
  if (a.size !== b.size) return false;
  for (const item of a) if (!b.has(item)) return false;
  return true;
}

/** A paraphrase reduced to what the comparison reads. */
function signature(text) {
  const sequence = contentSequenceOf(text);
  return {
    words: new Set(sequence),
    ids: identifiersOf(text),
    sequence,
    negations: negationsOf(text),
    directed: DIRECTED.test(foldText(text))
  };
}

function sharedOrder(sig, other) {
  return (sig.sequence || [...sig.words]).filter((word) => other.words.has(word));
}

function sameOrder(a, b) {
  const left = sharedOrder(a, b);
  const right = sharedOrder(b, a);
  return left.length === right.length && left.every((word, i) => word === right[i]);
}

/**
 * True when the two say the same frame around one swapped span: identical
 * words before and after it, and nothing in common inside it ("commit local
 * da correção de login" / "commit local da migração de pagamentos").
 */
function swapsOneSpan(a, b) {
  const x = a.sequence || [...a.words];
  const y = b.sequence || [...b.words];
  let head = 0;
  while (head < x.length && head < y.length && x[head] === y[head]) head += 1;
  let tail = 0;
  while (tail < x.length - head && tail < y.length - head && x[x.length - 1 - tail] === y[y.length - 1 - tail]) tail += 1;
  const left = x.slice(head, x.length - tail);
  const right = new Set(y.slice(head, y.length - tail));
  if (left.length === 0 || right.size === 0 || head + tail === 0) return false;
  return left.every((word) => !right.has(word));
}

/**
 * How alike two signatures are: 0 when they name different identifiers,
 * either says too little to compare, one negates what the other affirms, a
 * preference runs the other way, or one object was swapped in the same frame;
 * else the Jaccard of their content words.
 */
function similarity(a, b) {
  if (a.words.size < MIN_CONTENT_WORDS || b.words.size < MIN_CONTENT_WORDS) return 0;
  if (!sameSet(a.ids, b.ids)) return 0;
  const score = jaccard(a.words, b.words);
  if (score === 0) return 0;
  if ((Number(a.negations) || 0) % 2 !== (Number(b.negations) || 0) % 2) return 0;
  if ((a.directed || b.directed) && !sameOrder(a, b)) return 0;
  if (swapsOneSpan(a, b)) return 0;
  return score;
}

function frontmatterField(content, key) {
  const match = content.match(new RegExp(`^${key}:[ \\t]*(.*)$`, 'm'));
  if (!match) return '';
  return match[1].trim().replace(/^'([\s\S]*)'$/, (_, inner) => inner.replace(/''/g, "'")).replace(/^"([\s\S]*)"$/, '$1');
}

// The decision's own words: its paragraph (the heading when it has none),
// never its trigger quotes (the user's raw words, compared nowhere here).
// Both say the proposal once: read together, "não" counted twice and an even
// count read as an affirmation.
function decisionText(content) {
  const close = content.indexOf('\n---', 3);
  const body = close === -1 ? content : content.slice(close + 4);
  const quotesAt = body.indexOf('\n## Trigger quotes');
  const own = quotesAt === -1 ? body : body.slice(0, quotesAt);
  const heading = (own.match(/^#\s+(.*)$/m) || [])[1] || '';
  const paragraph = own.replace(/^#\s+.*$/m, '').trim();
  return paragraph || heading;
}

function readEntries(dir, kind, signalType, textOf) {
  if (!fs.existsSync(dir)) return [];
  const entries = [];
  for (const file of fs.readdirSync(dir)) {
    if (!file.endsWith('.md')) continue;
    let content;
    try { content = fs.readFileSync(path.join(dir, file), 'utf8').replace(/\r\n/g, '\n'); } catch { continue; }
    if (frontmatterField(content, 'signal_type') !== signalType) continue;
    entries.push({ slug: file.slice(0, -3), kind, text: textOf(content) });
  }
  return entries;
}

/**
 * The stored decision or pending proposal of `signalType` that says what
 * `proposal` says, or null. A decision wins over a proposal (it is the
 * standing one); within a kind, the closest wins and the slug breaks ties.
 * `exclude` skips the slug the caller already resolved by exact text.
 * `strong` says the match is close enough to carry the signal into a project
 * the entry was never seen in.
 */
function findEquivalent(identity, { signalType, proposal, exclude = null }) {
  const wanted = signature(proposal);
  if (wanted.words.size < MIN_CONTENT_WORDS) return null;
  const root = getStorageRoot(identity);
  const candidates = [
    ...readEntries(path.join(root, 'decisions'), 'decision', signalType, decisionText),
    ...readEntries(path.join(root, 'proposals'), 'proposal', signalType, (content) => frontmatterField(content, 'proposal'))
  ];
  let best = null;
  for (const entry of candidates) {
    if (entry.slug === exclude) continue;
    const score = similarity(wanted, signature(entry.text));
    if (score < EQUIVALENCE_THRESHOLD) continue;
    const rank = entry.kind === 'decision' ? 1 : 0;
    if (!best || rank > best.rank || (rank === best.rank && (score > best.score || (score === best.score && entry.slug < best.slug)))) {
      best = { slug: entry.slug, kind: entry.kind, score, rank };
    }
  }
  return best ? { slug: best.slug, kind: best.kind, score: Math.round(best.score * 100) / 100, strong: best.score >= STRONG_THRESHOLD } : null;
}

module.exports = {
  findEquivalent,
  similarity,
  signature,
  identifiersOf,
  contentWordsOf,
  negationsOf,
  EQUIVALENCE_THRESHOLD,
  STRONG_THRESHOLD,
  MIN_CONTENT_WORDS,
  MIN_SHARED_WORDS
};
