'use strict';

/**
 * operator-memory — do the user's own words make a signal standing?
 *
 * A standing decision governs future sessions; a one-time answer governs the
 * turn it was given in. Only the verbatim quote can tell them apart — the
 * paraphrase is the agent's. On a real store, 309 of 357 promoted
 * authorizations quoted nothing that reaches past the moment: "sim",
 * "confirmo", "abrir a url (Recommended)", "poderia fazer isso agora?". Each
 * became a permanent decision loaded into every later session.
 *
 * A marker is a phrase that only a rule for the future carries ("sempre",
 * "daqui pra frente", "não precisa perguntar", "eu faço manual", "pare de"),
 * in en / pt-BR / es, matched on folded text (lowercase, no diacritics). A
 * quote naming every project ("em todos os meus projetos") is standing too.
 *
 * A word is not a rule by itself. "nunca vi isso" and "sempre achei estranho"
 * tell what happened, not what to do: an adverb of time counts only when no
 * past or perception verb follows it. And an authorization that bounds itself
 * to the moment ("agora", "essa tarefa", "this once", "hazlo ahora") is a
 * one-time answer whatever else it says — "nunca vi isso, pode fazer agora"
 * waits for its repeat. Phrases that keep the current work going ("keep going", "sem
 * pausa", "feel free", "pode ir fazendo") say nothing about the next session
 * and are no marker. Missing a marker is cheap by design: the signal waits
 * for its repeat, and a repeat is proof enough.
 */

const { foldText, namesCrossProjectScope } = require('./project-scope');

// Adverbs of time: a rule when they govern an instruction, a story when a
// past or perception verb follows ("nunca vi", "always thought", "siempre pensé").
const TIME_ADVERB = /\b(sempre|nunca|jamais|always|never|siempre|jamas)\b/g;
const TOLD_NOT_RULED = new Set([
  // pt-BR
  'vi', 'viu', 'vimos', 'viram', 'vira', 'visto', 'achei', 'achou', 'achamos', 'pensei', 'pensou', 'soube', 'ouvi', 'ouviu',
  'entendi', 'gostei', 'gostou', 'usei', 'usou', 'fiz', 'fez', 'tive', 'teve', 'tinha', 'tinhamos', 'quis', 'precisei',
  'consegui', 'reparei', 'percebi', 'notei', 'imaginei', 'acreditei', 'foi', 'fui', 'esteve', 'estive', 'havia', 'houve',
  'deu', 'funcionou', 'aconteceu', 'existiu', 'gostava', 'usava', 'fazia', 'achava', 'pensava',
  // en
  'saw', 'seen', 'thought', 'knew', 'known', 'heard', 'liked', 'used', 'did', 'had', 'noticed', 'understood', 'been',
  'was', 'were', 'got', 'felt', 'found', 'imagined', 'believed', 'wanted', 'needed', 'happened', 'worked', 'wondered',
  // es
  'pense', 'supe', 'oi', 'entendi', 'crei', 'fue', 'tuve', 'tenia', 'hice', 'quise', 'necesite', 'pensaba', 'vio'
]);
const HAVE_BEFORE = /(?:\bhave|\bhas|\bhad|'ve|'d)\s+$/;

// A rule for the future said with "now" in it is still a rule: these phrases
// leave the quote before the one-time check reads it.
const FUTURE_WITH_NOW = /\bde agora em diante\b|\ba partir de agora\b|\bdaqui (?:pra|para|em) (?:frente|diante)\b|\bfrom now on\b|\bde ahora en adelante\b|\ba partir de ahora\b/g;
// The quote bounds itself to the moment.
const ONE_TIME = [
  // pt-BR
  /\bagora\b/, /\bpor enquanto\b/, /\bpor hoje\b/, /\bhoje\b/, /\b(?:dessa|desta|essa|esta|nessa|nesta) vez\b/,
  /\b(?:essa|esta|nessa|nesta|dessa|desta) (?:tarefa|feature|fase|sessao|entrega|etapa|rodada|task|branch)\b/,
  /\bso (?:uma vez|agora|hoje)\b/,
  // en
  /\bnow\b/, /\bfor now\b/, /\btoday\b/, /\bthis (?:time|once|one|task|feature|session|phase|branch)\b/,
  /\b(?:just|only) once\b/, /\bonce\s*(?:[.!?;,]|$)/,
  // es
  /\bahora\b/, /\bpor ahora\b/, /\bhoy\b/, /\b(?:esta|esa) (?:vez|tarea|sesion|fase)\b/, /\bsolo una vez\b/
];

// Folded text; `\b` is safe here because diacritics are already stripped.
const ANY_SIGNAL = [
  // pt-BR
  /\bdaqui (?:pra|para|em) (?:frente|diante)\b/, /\bde agora em diante\b/, /\bvale (?:pra|para) frente\b/,
  /\ba partir de agora\b/, /\bdora?vante\b/, /\btoda (?:vez|hora)\b/, /\btodas as vezes\b/, /\bpor padrao\b/,
  /\bcomo (?:padrao|regra)\b/, /\bn[oa]s proxim[oa]s\b/, /\bpra sempre\b/, /\bem geral\b/,
  // "toda feature" is every future one; "todas as fases" is the work at hand.
  /\b(?:toda|cada|a cada) (?:feature|entrega|fase|tarefa|sessao)\b/,
  // en
  /\bfrom now on\b/, /\bgoing forward\b/, /\bfrom here on\b/, /\bby default\b/,
  /\bevery time\b/, /\bwhenever\b/, /\beach time\b/, /\bas a rule\b/, /\bin (?:the )?future\b/,
  /\b(?:every|each) (?:feature|task|phase|session|release|delivery)\b/,
  // es
  /\bde ahora en adelante\b/, /\ben adelante\b/, /\ba partir de ahora\b/, /\bpor defecto\b/,
  /\bcada vez\b/, /\btodas las veces\b/, /\bcada (?:tarea|fase|entrega)\b/
];

const BY_SIGNAL = {
  authorization: [
    /\bnao (?:precisa|precisas|tem que|e preciso) (?:me )?(?:perguntar|pedir|confirmar|consultar|avisar)\b/,
    /\bsem (?:me )?(?:perguntar|pedir|consultar|confirmar)\b/, /\bnao (?:me )?pergunte\b/,
    /\bconfio\b/, /\bautonom\w*/,
    /\bdon'?t (?:need to )?ask\b/, /\bno need to (?:ask|check|confirm)\b/, /\bwithout asking\b/,
    /\bi trust you\b/,
    /\bno (?:hace falta|necesitas|tienes que) preguntar\b/, /\bsin preguntar\b/
  ],
  exclusion: [
    /\bmanual(?:mente|ly)?\b/, /\beu (?:mesm[oa] )?(?:que )?(?:faco|dou|rodo|publico|subo|executo|aprovo)\b/,
    /\bdeixa (?:que eu|comigo|pra mim|para mim)\b/, /\bcomigo\b/, /\bso eu\b/,
    /\bsem (?:a )?minha (?:autorizacao|aprovacao|permissao|revisao)\b/, /\bautomaticamente\b/, /\bsozinh[oa]\b/,
    /\bmyself\b/, /\bleave (?:it|that|this) to me\b/, /\bonly i\b/, /\bwithout my (?:approval|permission|ok|review)\b/,
    /\bautomatically\b/, /\byo mism[oa]\b/, /\bsin mi (?:aprobacion|permiso|revision)\b/
  ],
  correction: [
    /\bnao (?:faca|faz|facam|use|usa|usem|coloque|coloca|crie|cria|mude|muda|mexa|mexe|altere|adicione|inclua|gere|escreva|ponha|repita|invente|mostre|deixe)\b/,
    /\bpar[ae]m? de\b/, /\bchega de\b/, /\bnada de\b/, /\bevit(?:e|a|em|ar)\b/, /\bprefiro\b/,
    /\b(?:em vez|ao inves|no lugar) de\b/, /\bnao quero\b/, /\bnao gosto\b/, /\bde novo\b/, /\bnovamente\b/, /\boutra vez\b/,
    /\bdon'?t\b/, /\bdo not\b/, /\bstop\b/, /\bavoid\b/, /\bprefer\b/, /\binstead of\b/, /\brather than\b/, /\bagain\b/,
    /\bno (?:hagas|uses|pongas|cambies|agregues|escribas)\b/, /\bdeja de\b/, /\bevita\b/, /\bprefiero\b/,
    /\ben (?:lugar|vez) de\b/, /\bde nuevo\b/
  ]
};

/** The first adverb of time in `folded` that governs an instruction, or null. */
function ruleAdverb(folded) {
  const re = new RegExp(TIME_ADVERB.source, 'g');
  let match;
  while ((match = re.exec(folded)) !== null) {
    const next = (folded.slice(match.index + match[0].length).match(/^\s+(?:(?:mais|ever|more)\s+)?([a-z']+)/) || [])[1];
    if (next && TOLD_NOT_RULED.has(next)) continue;
    if (HAVE_BEFORE.test(folded.slice(0, match.index))) continue;
    return match[0];
  }
  return null;
}

/** True when the quote bounds itself to the moment ("agora", "this once", "esta vez"). */
function boundToTheMoment(folded) {
  const rest = folded.replace(FUTURE_WITH_NOW, ' ');
  return ONE_TIME.some((pattern) => pattern.test(rest));
}

// Only a permission is promoted on its marker, so only there does a quote
// bound to the moment wait: "pode fazer agora" is a one-time yes. A correction
// holds at once whatever it says, and its "agora" is often the story around a
// rule ("no exemplo que você fez agora…", "agora o sistema vai ser sempre
// online"), not a limit on it.
const BOUNDED_BY_THE_MOMENT = new Set(['authorization']);

/**
 * The first marker the quotes carry for `signalType`, or null. A quote that
 * names every project counts, and so does any marker of the shared list; an
 * authorization quote bound to the moment proves nothing, whatever it holds.
 */
function standingMarker(quotes, signalType) {
  const list = (Array.isArray(quotes) ? quotes : [quotes]).filter(Boolean).map(String);
  if (list.length === 0) return null;
  const patterns = [...ANY_SIGNAL, ...(BY_SIGNAL[signalType] || [])];
  for (const quote of list) {
    const folded = foldText(quote);
    if (BOUNDED_BY_THE_MOMENT.has(signalType) && boundToTheMoment(folded)) continue;
    const adverb = ruleAdverb(folded);
    if (adverb) return adverb;
    for (const pattern of patterns) {
      const hit = folded.match(pattern);
      if (hit) return hit[0];
    }
    if (namesCrossProjectScope([quote])) return 'cross-project';
  }
  return null;
}

function hasStandingProof(quotes, signalType) {
  return standingMarker(quotes, signalType) !== null;
}

module.exports = { standingMarker, hasStandingProof, boundToTheMoment };
