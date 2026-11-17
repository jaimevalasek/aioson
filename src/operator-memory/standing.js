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
 * Missing a marker is cheap by design: the signal waits for its repeat, and a
 * repeat is proof enough.
 */

const { foldText, namesCrossProjectScope } = require('./project-scope');

// Folded text; `\b` is safe here because diacritics are already stripped.
const ANY_SIGNAL = [
  // pt-BR
  /\bsempre\b/, /\bnunca\b/, /\bjamais\b/, /\bdaqui (?:pra|para|em) (?:frente|diante)\b/, /\bde agora em diante\b/,
  /\ba partir de agora\b/, /\bdora?vante\b/, /\btoda (?:vez|hora)\b/, /\btodas as vezes\b/, /\bpor padrao\b/,
  /\bcomo (?:padrao|regra)\b/, /\bn[oa]s proxim[oa]s\b/, /\bpra sempre\b/, /\bem geral\b/,
  // en
  /\balways\b/, /\bnever\b/, /\bfrom now on\b/, /\bgoing forward\b/, /\bfrom here on\b/, /\bby default\b/,
  /\bevery time\b/, /\bwhenever\b/, /\beach time\b/, /\bas a rule\b/, /\bin (?:the )?future\b/,
  // es
  /\bsiempre\b/, /\bjamas\b/, /\bde ahora en adelante\b/, /\ba partir de ahora\b/, /\bpor defecto\b/,
  /\bcada vez\b/, /\btodas las veces\b/
];

const BY_SIGNAL = {
  authorization: [
    /\bnao (?:precisa|precisas|tem que|e preciso) (?:me )?(?:perguntar|pedir|confirmar|consultar|avisar)\b/,
    /\bsem (?:me )?(?:perguntar|pedir|consultar|confirmar)\b/, /\bnao (?:me )?pergunte\b/,
    /\b(?:pode|podem|vai|va) (?:ir |seguir |continuar )?fazendo\b/, /\bsem pausas?\b/, /\bconfio\b/, /\bautonom\w*/,
    /\bdon'?t (?:need to )?ask\b/, /\bno need to (?:ask|check|confirm)\b/, /\bwithout asking\b/, /\bkeep going\b/,
    /\bi trust you\b/, /\bfeel free\b/,
    /\bno (?:hace falta|necesitas|tienes que) preguntar\b/, /\bsin preguntar\b/, /\bsigue (?:adelante|haciendo)\b/
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

/**
 * The first marker the quotes carry for `signalType`, or null. A quote that
 * names every project counts, and so does any marker of the shared list.
 */
function standingMarker(quotes, signalType) {
  const list = (Array.isArray(quotes) ? quotes : [quotes]).filter(Boolean).map(String);
  if (list.length === 0) return null;
  const patterns = [...ANY_SIGNAL, ...(BY_SIGNAL[signalType] || [])];
  for (const quote of list) {
    const folded = foldText(quote);
    for (const pattern of patterns) {
      const hit = folded.match(pattern);
      if (hit) return hit[0];
    }
  }
  return namesCrossProjectScope(list) ? 'cross-project' : null;
}

function hasStandingProof(quotes, signalType) {
  return standingMarker(quotes, signalType) !== null;
}

module.exports = { standingMarker, hasStandingProof };
