'use strict';

/**
 * Deterministic detection of non-English SOURCE IDENTIFIERS.
 *
 * `.aioson/rules/source-code-language-convention.md` has always said technical
 * identifiers are English while user-facing copy follows the project language.
 * Nothing ever MEASURED it, so a feature-scoped acceptance criterion could
 * translate a whole tree ("servidor/", "rotas/", "nucleo/", "estado.ts") and
 * every gate still went green. This module is that missing measurement.
 *
 * What it looks at — and, just as importantly, what it never looks at:
 *
 *   scanned   path segments, file basenames, and DECLARED identifiers
 *             (class/function/const/type/def/fn/func/struct names).
 *   ignored   string literals, comments, and any user-facing copy. Product
 *             language belongs there by contract; flagging it would be wrong.
 *
 * Two evidence classes keep false positives near zero:
 *
 *   role       a closed lexicon of TECHNICAL scaffolding words that carry an
 *              unambiguous English equivalent (servidor→server, rotas→routes,
 *              criar→create). Domain nouns a product legitimately owns are NOT
 *              in it, so a canonical product vocabulary stays untouched.
 *   morphology suffixes that exist in pt/es and not in English (-cao, -agem,
 *              -dade, -mento, -ador, -encia), plus accented identifiers.
 *
 * Words that are spelled the same in English (data, total, local, media, item,
 * converter, valor, vista) are deliberately absent: an exact-token match on an
 * accent-folded lexicon is the whole false-positive defence.
 *
 * Language-neutral by construction: the scanner asserts nothing about which
 * human language a project speaks — it asserts that technical scaffolding is
 * named in English, which is what the rule says.
 */

// ─── lexicon: translated technical scaffolding (HIGH confidence) ──────────────
// Accent-folded, lowercase, singular AND plural where both occur in real code.
// Every entry must fail this test to be admitted: "is this also an English
// word, or a word a product could legitimately own as domain vocabulary?"

const ROLE_TOKENS = new Set([
  // layers, structure, artifacts
  'servidor', 'servidores', 'servico', 'servicos', 'servicio', 'servicios',
  'rota', 'rotas', 'ruta', 'rutas', 'nucleo', 'dominio', 'dominios',
  'controlador', 'controladores', 'repositorio', 'repositorios',
  'modelo', 'modelos', 'fabrica', 'fabricas', 'biblioteca', 'bibliotecas',
  'pacote', 'pacotes', 'modulo', 'modulos', 'componente', 'componentes',
  'utilitario', 'utilitarios', 'ajudante', 'auxiliar', 'apoio', 'ajuda',
  'arquivo', 'arquivos', 'archivo', 'archivos', 'ficheiro', 'ficheiros',
  // `pasta` is deliberately absent: it is an ordinary English noun, and one
  // recipe app named `pasta.ts` would be enough to teach a team that this check
  // lies. `diretorio`/`carpeta`/`arquivo` already cover the same vocabulary.
  'diretorio', 'diretorios', 'carpeta',
  'tipos', 'estado', 'estados', 'consulta', 'consultas',
  'requisicao', 'requisicoes', 'resposta', 'respostas', 'respuesta',
  'usuario', 'usuarios', 'senha', 'senhas', 'contrasena',
  'erro', 'erros', 'falha', 'falhas', 'teste', 'testes', 'prueba', 'pruebas',
  'formulario', 'formularios', 'botao', 'botoes', 'boton', 'botones',
  'mensagem', 'mensagens', 'mensaje', 'mensajes',
  'pagina', 'paginas', 'pantalla', 'tela', 'telas',
  'midia', 'midias', 'controle', 'controles', 'envio', 'envios',
  'nome', 'nomes', 'numero', 'numeros', 'texto', 'textos',
  'titulo', 'titulos', 'chave', 'chaves',

  // verbs — the strongest signal in a function name
  'criar', 'crear', 'adicionar', 'agregar', 'atualizar', 'actualizar',
  'excluir', 'apagar', 'remover', 'eliminar', 'borrar',
  'buscar', 'pesquisar', 'procurar', 'encontrar',
  'salvar', 'guardar', 'gravar', 'enviar', 'receber', 'listar',
  'obter', 'definir', 'calcular', 'carregar', 'mostrar', 'exibir',
  'ocultar', 'esconder', 'abrir', 'fechar', 'cerrar',
  'iniciar', 'comecar', 'parar', 'copiar', 'colar', 'mover',
  'ordenar', 'filtrar', 'contar', 'somar', 'formatar',
  'validar', 'verificar', 'checar', 'marcar', 'selecionar', 'limpar',
  'editar', 'visualizar', 'gerar', 'processar', 'executar', 'tratar',
  'montar', 'aplicar', 'renderizar', 'atribuir', 'alterar', 'trocar'
]);

// Connective particles: an English identifier never carries one as a token.
const PARTICLE_TOKENS = new Set(['da', 'das', 'dos', 'pelo', 'pela', 'nao', 'dele', 'dela']);

// ─── prose: the language of a sentence, read from its function words ─────────
//
// A test title is a sentence, and so is a test function named like one
// (`novo_filtro_passa_tudo_por_padrao_sem_reset`). The scaffolding lexicon above
// is the wrong instrument for both: "um banco que recusa não deixa os outros
// abertos" holds no technical noun at all, and it was exactly this shape — 37%
// of the test titles one feature added — that passed every gate while the rule
// said tests are English. What gives a sentence away is its closed-class words
// (articles, prepositions, conjunctions, auxiliaries): a short, stable list per
// language that needs no dictionary of product words. Counted against the
// English ones in the same sentence, they decide the language, so a title that
// mentions UI copy ("opens Consultas from the rail") stays English.
//
// Every spelling English also uses is left out (a, as, do, no, die, per, pour,
// non, es, et, se, so, la, el, di, y, est): one shared spelling is one false
// positive per title, and a check that cries wolf gets switched off.
const FOREIGN_FUNCTION_WORDS = new Set([
  // Portuguese
  'e', 'o', 'é', 'um', 'uma', 'os', 'ao', 'aos', 'na', 'nas', 'nos', 'da', 'das', 'dos', 'de', 'em',
  'num', 'numa', 'pelo', 'pela', 'pelos', 'pelas', 'com', 'sem', 'para', 'que', 'quando', 'não', 'nao',
  'deve', 'devem', 'pode', 'podem', 'fica', 'ficam', 'tem', 'têm', 'foi', 'ser', 'estar', 'está', 'estão',
  'são', 'há', 'vai', 'já', 'só', 'também', 'ainda', 'então', 'depois', 'antes', 'sempre', 'nunca', 'mais',
  'menos', 'nenhum', 'nenhuma', 'nada', 'tudo', 'todos', 'todas', 'cada', 'quem', 'onde', 'qual', 'quais',
  'porque', 'seu', 'sua', 'seus', 'suas', 'ele', 'ela', 'eles', 'elas', 'mas', 'ou', 'como', 'sobre', 'até',
  'entre', 'outro', 'outra', 'outros', 'outras', 'mesmo', 'mesma', 'agora', 'isso', 'isto', 'esse', 'essa',
  'este', 'esta',
  // Spanish
  'los', 'las', 'del', 'con', 'sin', 'cuando', 'debe', 'pero', 'muy', 'por', 'uno', 'están', 'ningún',
  'ninguna', 'donde', 'cual',
  // French
  'les', 'des', 'une', 'pas', 'quand', 'avec', 'sans', 'dans', 'sur', 'qui', 'du', 'aux',
  // Italian
  'il', 'che', 'della', 'gli', 'nel', 'alla', 'sono', 'questo',
  // German
  'der', 'das', 'und', 'nicht', 'wenn', 'mit', 'ohne', 'ist', 'ein', 'eine', 'wird', 'auf', 'für', 'bei',
  'nach', 'oder', 'sich', 'den', 'dem', 'zu',
  // A test title's verb is third person, and in Portuguese and Spanish that
  // form has no English homograph — except the ones left out on purpose:
  // remove, serve, some, usa, junta, volta.
  'fora', 'dentro', 'apenas', 'enquanto', 'nem', 'pra', 'pro', 'após', 'à', 'às',
  'mostra', 'mostram', 'exibe', 'abre', 'abrem', 'fecha', 'fecham', 'retorna', 'retornam', 'devolve',
  'chama', 'cria', 'salva', 'grava', 'mantém', 'deixa', 'faz', 'vira', 'passa', 'aparece', 'aparecem',
  'renderiza', 'carrega', 'envia', 'recebe', 'pede', 'diz', 'lê', 'limpa', 'oferece', 'aceita', 'recusa',
  'bloqueia', 'libera', 'marca', 'troca', 'muda', 'segue', 'continua', 'começa', 'termina', 'acende',
  'apaga', 'guarda', 'ignora', 'traz', 'leva', 'gera', 'valida', 'verifica', 'confere', 'acha', 'encontra',
  'filtra', 'ordena', 'agrupa', 'mapeia', 'converte', 'calcula', 'atualiza', 'adiciona', 'inclui', 'exclui',
  'habilita', 'desabilita', 'ativa', 'desativa', 'inicia', 'reinicia', 'encerra', 'espera', 'tenta',
  'funciona', 'esconde', 'respeita', 'preserva', 'pula', 'avisa', 'emite', 'dispara', 'cancela', 'confirma',
  'persiste', 'detecta', 'usam', 'cai', 'sai', 'entra', 'liga', 'desliga', 'roda', 'sobe', 'desce', 'vem',
  'muestra', 'cierra', 'devuelve', 'llama', 'carga', 'crea', 'borra', 'envía'
]);

// Foreign function words that are also everyday technical abbreviations — the
// OS, an `em` unit, a COM port, `aux`, `del`, `sin`, DES, DER, sans-serif, the
// MIT licence. They still count, but two of them alone never make a sentence
// foreign, and one alone is never even a weak signal.
const AMBIGUOUS_FUNCTION_WORDS = new Set([
  'os', 'em', 'de', 'com', 'del', 'sin', 'des', 'sans', 'mit', 'il', 'du', 'pas', 'den', 'uno',
  'ser', 'das', 'aux', 'dem', 'der', 'ist', 'con'
]);

// `a`, `as`, `do`, `no` and `se` are function words in both languages ("a
// recusa", "as abas", "do servidor", "no menu"), so they count for neither:
// scored as English, they hid one Portuguese title in four.
const ENGLISH_FUNCTION_WORDS = new Set([
  'the', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'it', 'its', 'to', 'of', 'in', 'on', 'at',
  'by', 'for', 'from', 'with', 'without', 'and', 'or', 'not', 'nor', 'does', 'did', 'doesn',
  'don', 'isn', 'aren', 'won', 'can', 'cannot', 'when', 'while', 'if', 'then', 'than', 'only', 'after',
  'before', 'into', 'onto', 'over', 'under', 'that', 'this', 'these', 'those', 'which', 'who', 'what',
  'has', 'have', 'had', 'should', 'must', 'will', 'would', 'could', 'may', 'all', 'any', 'each', 'every',
  'again', 'still', 'also', 'as', 'but', 'so', 'there', 'their', 'they', 'them', 'his', 'her', 'our',
  'your', 'you', 'we', 'out', 'up', 'once', 'until', 'unless', 'even', 'just', 'both', 'either', 'other',
  'another', 'such', 'through', 'between', 'about', 'via', 'how', 'why', 'where', 'whether', 'nothing',
  'never', 'always', 'already', 'more', 'less', 'instead', 'one', 'own', 'same'
]);

// A lowercase word carrying a Latin-1 accent (não, só, versão, botão) is
// foreign prose; a capitalised one (Serviços, Configurações) is far more often
// the name of a screen the title is talking about, so it is left alone.
const LOWER_ACCENTED_WORD = /^[a-zß-ÿ][a-zß-ÿ]*$/;
const HAS_ACCENT = /[ß-ÿ]/;

/**
 * Remove what a sentence QUOTES rather than says: UI copy in quotes, template
 * interpolation, printf placeholders, dotted names (files, domains), `e.g.`.
 * A title that cites "Tentar de novo" is still an English title.
 */
function stripQuotedProse(text) {
  return String(text)
    .replace(/\$\{[^}]*\}/g, ' ')
    .replace(/%[sdifjoO%]/g, ' ')
    .replace(/(^|[\s([{:,;>])(['"“‘«`])(.+?)(['"”’»`])(?=$|[\s)\]},.:;!?<])/g, '$1 ')
    .replace(/\b(?:e\.g|i\.e|etc)\./gi, ' ')
    .replace(/\b[\w-]+(?:\.[\w-]+)+\b/g, ' ')
    .replace(/\bO\([^)]*\)/g, ' ')
    // Hyphenated compounds and flags are names — ids, `opt-in`, `read-only`,
    // `node -e` — and lend a sentence words it never said.
    .replace(/\S*[\p{L}\p{N}]-[\p{L}\p{N}]\S*/gu, ' ')
    .replace(/(^|\s)-{1,2}[\p{L}\p{N}]\S*/gu, '$1 ');
}

/**
 * Read the language of a sentence. Returns null for English (or undecidable)
 * prose, otherwise the foreign function words that decided it.
 *
 * `strong`: at least two distinct foreign words, not only the ambiguous short
 * ones, and more than twice as many as English ones — the shape no English
 * sentence makes. `weak`: an English sentence that carries unquoted UI copy
 * ("Agora não skips without saving"), or a short one with a single foreign
 * word and no English one; worth a look, never a block.
 *
 * @param {string} text
 * @returns {{ strength: 'strong'|'weak', words: string[] }|null}
 */
function classifyProse(text) {
  const tokens = stripQuotedProse(text).split(/[^\p{L}\p{N}]+/u).filter((t) => /\p{L}/u.test(t));
  if (tokens.length === 0) return null;
  const foreign = new Set();
  const english = new Set();
  for (const token of tokens) {
    const lower = token.toLowerCase();
    if (FOREIGN_FUNCTION_WORDS.has(lower)) foreign.add(lower);
    else if (ENGLISH_FUNCTION_WORDS.has(lower)) english.add(lower);
    else if (HAS_ACCENT.test(token) && LOWER_ACCENTED_WORD.test(token)) foreign.add(lower);
  }
  const words = [...foreign];
  const unambiguous = words.filter((word) => !AMBIGUOUS_FUNCTION_WORDS.has(word)).length;
  if (foreign.size >= 2 && foreign.size > english.size && (unambiguous >= 1 || foreign.size >= 3)) {
    const mixed = english.size >= 1 && foreign.size <= 2 * english.size;
    return { strength: mixed ? 'weak' : 'strong', words };
  }
  if (foreign.size === 1 && english.size === 0 && unambiguous === 1 && tokens.length >= 3) {
    return { strength: 'weak', words };
  }
  return null;
}

// ─── morphology: pt/es-only shapes (MED confidence) ───────────────────────────

const MORPHOLOGY = [
  { suffix: 'cao', min: 6 }, { suffix: 'coes', min: 7 },
  { suffix: 'agem', min: 6 }, { suffix: 'agens', min: 7 },
  { suffix: 'dade', min: 7 }, { suffix: 'dades', min: 8 },
  { suffix: 'mento', min: 7 }, { suffix: 'mentos', min: 8 },
  { suffix: 'ador', min: 7 }, { suffix: 'adores', min: 8 },
  { suffix: 'encia', min: 7 }, { suffix: 'ancia', min: 7 },
  { suffix: 'avel', min: 8 }, { suffix: 'aveis', min: 8 },
  { suffix: 'eiro', min: 7 }, { suffix: 'eira', min: 7 }
];

// English tokens that happen to end in one of the shapes above.
const MORPHOLOGY_EXCEPTIONS = new Set([
  'memento', 'pimento', 'cacao', 'travel', 'gravel', 'marvel', 'unravel',
  'matador', 'labrador', 'ambassador', 'cascade', 'facade', 'upgrade',
  'increment', 'implement', 'compliment', 'supplement', 'department'
]);

const ACCENTED = /[À-ſ]/;

// ─── tokenizing ───────────────────────────────────────────────────────────────

function fold(text) {
  return String(text).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

/** Split an identifier into its words: camelCase, snake_case, kebab-case, digits. */
function tokenize(identifier) {
  return fold(identifier)
    .replace(/([a-z])([0-9])/g, '$1 $2')
    .replace(/[^a-z0-9]+/g, ' ')
    .split(' ')
    .filter((t) => t.length > 1);
}

function splitWords(identifier) {
  // camelCase / PascalCase boundaries survive folding, so split before folding.
  return String(identifier)
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .split(/[\s._\-/\\]+/)
    .flatMap((part) => tokenize(part))
    .filter(Boolean);
}

function lexiconHit(words, lexicon, kind) {
  const word = words.find((candidate) => lexicon.has(candidate));
  return word ? { kind, token: word } : null;
}

// A name long enough to be a sentence is read as one: test functions in Rust,
// Python, Go and PHPUnit are named like their titles, and none of
// `backup_preserva_tudo_por_padrao_sem_reset` is scaffolding vocabulary.
function proseHit(words) {
  if (words.length < 3) return null;
  const prose = classifyProse(words.join(' '));
  return prose && prose.strength === 'strong' ? { kind: 'prose', token: prose.words.join(',') } : null;
}

function morphologyHit(words) {
  const word = words.find((candidate) => !MORPHOLOGY_EXCEPTIONS.has(candidate) &&
    MORPHOLOGY.some((shape) => candidate.length >= shape.min && candidate.endsWith(shape.suffix)));
  return word ? { kind: 'morphology', token: word } : null;
}

/**
 * Classify one identifier (or path segment).
 * @returns {{ kind: 'role'|'prose'|'morphology'|'particle', token: string }|null}
 */
function classifyIdentifier(identifier) {
  if (!identifier) return null;
  const words = splitWords(identifier);
  if (words.length === 0) return null;

  return lexiconHit(words, ROLE_TOKENS, 'role') ||
    proseHit(words) ||
    (words.length >= 2 ? lexiconHit(words, PARTICLE_TOKENS, 'particle') : null) ||
    morphologyHit(words) ||
    (ACCENTED.test(identifier) ? { kind: 'morphology', token: fold(identifier) } : null);
}

// ─── declaration extraction (never strings, never comments) ───────────────────

const DECLARATION_PATTERNS = [
  /\b(?:function|class|interface|enum|trait|struct|module)\s+([A-Za-z_$À-ſ][\w$À-ſ]*)/g,
  /\b(?:const|let|var|type)\s+([A-Za-z_$À-ſ][\w$À-ſ]*)/g,
  /\b(?:def|fn|func|sub)\s+(?:\([^)]*\)\s*)?([A-Za-z_$À-ſ][\w$À-ſ]*)/g,
  /\$([A-Za-z_À-ſ][\wÀ-ſ]*)\s*=[^=]/g
];

function stripLiterals(line) {
  return line
    .replace(/'(?:[^'\\]|\\.)*'/g, "''")
    .replace(/"(?:[^"\\]|\\.)*"/g, '""')
    .replace(/`(?:[^`\\]|\\.)*`/g, '``');
}

function isCommentLine(stripped) {
  return stripped.startsWith('//') || stripped.startsWith('*') ||
    stripped.startsWith('#') || stripped.startsWith('/*') || stripped.startsWith('--');
}

// ─── test titles (the one string a test file names its code with) ─────────────
//
// A test title is a string, so the literal-stripping above made every one of
// them invisible — and a title is the test's name: the runner prints it, the
// AC audit indexes it, the next engineer greps for it. Only the TITLE argument
// of a test-shaped call opening a line is read; a string anywhere else stays
// product copy, as the rule says.

const QUOTED = String.raw`(['"\x60])((?:\\.|(?!\1)[^\\])*)\1`;
// `it(`, `test.each(cases)(`, `describe.skipIf(x)(`, Pest, Dart, Deno, Go subtests.
const TITLE_CALL_HEAD = String.raw`^\s*(?:await\s+)?(?:it|test|describe|context|suite|specify|bench|scenario|feature|group|testWidgets|Deno\.test|[a-z]\w*\.Run)(?:\.\w+(?:\((?:[^()]|\([^()]*\))*\))?)*\(\s*`;
const TITLE_PATTERNS = [
  new RegExp(TITLE_CALL_HEAD + QUOTED),
  // RSpec, ExUnit, Minitest spec: `it "..." do`, `test "...", %{conn: c} do`.
  new RegExp(String.raw`^\s*(?:it|test|describe|context|specify|scenario|feature)\s+(['"])((?:\\.|(?!\1)[^\\])*)\1[^#]*\bdo\b`),
  // JUnit / xUnit / Swift Testing display names.
  new RegExp(String.raw`^\s*(?:@DisplayName\(|@Test\(|\[\s*\w+\s*\(\s*DisplayName\s*=\s*)\s*(")((?:\\.|(?!\1)[^\\])*)\1`),
  // Kotlin backtick names and Spock string names: fun \`...\`(), def "..."().
  new RegExp(String.raw`^\s*(?:fun\s+(\x60)([^\x60]+)\x60|def\s+(["'])((?:\\.|(?!\3)[^\\])*)\3\s*\()`)
];
// A call whose title sits on the next line, the way formatters wrap long ones.
const TITLE_CALL_OPEN = new RegExp(TITLE_CALL_HEAD + '$');
const TITLE_NEXT_LINE = new RegExp('^\\s*' + QUOTED);

function titleOf(match) {
  if (!match) return null;
  const title = match[2] !== undefined ? match[2] : match[4];
  return typeof title === 'string' && title.trim() ? title.trim() : null;
}

/** @returns {Array<{ line: number, title: string }>} 1-based lines */
function extractTestTitles(lines) {
  const titles = [];
  for (let i = 0; i < lines.length; i += 1) {
    const raw = lines[i];
    const stripped = raw.trim();
    if (!stripped || isCommentLine(stripped)) continue;
    let title = null;
    for (const pattern of TITLE_PATTERNS) {
      title = titleOf(pattern.exec(raw));
      if (title) break;
    }
    if (!title && TITLE_CALL_OPEN.test(raw) && i + 1 < lines.length) {
      title = titleOf(TITLE_NEXT_LINE.exec(lines[i + 1]));
    }
    if (title) titles.push({ line: i + 1, title });
  }
  return titles;
}

// ─── path segments ────────────────────────────────────────────────────────────

const PATH_SKIP = new Set(['src', 'lib', 'app', 'test', 'tests', 'e2e', 'public', 'assets', 'index']);

function scanPathSegments(rel) {
  const hits = [];
  const segments = rel.split('/');
  segments.forEach((segment, i) => {
    const isFile = i === segments.length - 1;
    const bare = isFile ? segment.replace(/\.[^.]+$/, '').replace(/\.(test|spec|stories|d)$/, '') : segment;
    if (!bare || PATH_SKIP.has(fold(bare))) return;
    const hit = classifyIdentifier(bare);
    if (hit) hits.push({ segment: bare, ...hit, where: isFile ? 'filename' : 'directory' });
  });
  return hits;
}

// ─── public scan ──────────────────────────────────────────────────────────────

// A report is read by a human, so one file does not get to fill it. But the cap
// is a DISPLAY concern, and letting it leak into the baseline made partial
// cleanup punishable: a baseline built from the first six violations of a
// twelve-violation file goes quiet, and fixing three of them exposes three the
// baseline never saw — blocking the slice that improved the code. Callers
// recording debt lift the cap; callers reporting keep it.
const MAX_PER_FILE = 6;

function pathCandidates(rel) {
  return scanPathSegments(rel).map((hit) => ({
    kind: hit.kind,
    token: hit.token,
    // A directory violation belongs to the directory, not to each file under
    // it: `servidor/` is one decision, not one per file inside.
    scope: hit.where === 'directory' ? `dir:${hit.segment}` : 'file',
    line: 1,
    message: `non-English ${hit.where} "${hit.segment}" (technical paths and filenames are English — see .aioson/rules/source-code-language-convention.md)`,
    snippet: rel
  }));
}

function declarationCandidates(lines) {
  const candidates = [];
  lines.forEach((raw, i) => {
    const stripped = raw.trim();
    if (!stripped || isCommentLine(stripped)) return;
    const code = stripLiterals(stripped);
    for (const pattern of DECLARATION_PATTERNS) {
      pattern.lastIndex = 0;
      let match;
      while ((match = pattern.exec(code)) !== null) {
        const name = match[1];
        const hit = classifyIdentifier(name);
        if (!hit) continue;
        candidates.push({
          kind: hit.kind,
          token: name,
          line: i + 1,
          message: `non-English identifier "${name}" (declared name translated from the project language — see .aioson/rules/source-code-language-convention.md)`,
          snippet: stripped
        });
      }
    }
  });
  return candidates;
}

function titleCandidates(lines) {
  const candidates = [];
  for (const { line, title } of extractTestTitles(lines)) {
    const prose = classifyProse(title);
    if (!prose) continue;
    const evidence = prose.words.slice(0, 4).map((word) => `"${word}"`).join(', ');
    candidates.push({
      kind: prose.strength === 'strong' ? 'prose' : 'prose-weak',
      // The title itself is the identity: two tests never share one, and it
      // survives the line moving.
      token: title.slice(0, 160),
      line,
      message: `non-English test title "${title.slice(0, 90)}" (reads as ${evidence}) — a test's title is its name: keep the AC id, state the behavior in English, quote UI copy as it ships — see .aioson/rules/source-code-language-convention.md`,
      snippet: lines[line - 1].trim()
    });
  }
  return candidates;
}

/**
 * @param {{ rel: string, lines: string[] }} file
 * @param {(finding: object) => void} push
 * @param {{ maxPerFile?: number }} [options]
 */
function scanNamingLanguage(file, push, options = {}) {
  const { rel, lines } = file;
  const limit = typeof options.maxPerFile === 'number' ? options.maxPerFile : MAX_PER_FILE;
  const seen = new Set();
  const findings = [];

  for (const candidate of [...pathCandidates(rel), ...declarationCandidates(lines), ...titleCandidates(lines)]) {
    const key = `${candidate.kind}:${candidate.token}`;
    if (seen.has(key)) continue;
    seen.add(key);
    findings.push({
      category: 'NAMING_LANGUAGE',
      severity: candidate.kind === 'role' || candidate.kind === 'prose' ? 'HIGH' : 'MED',
      message: candidate.message,
      file: rel,
      line: candidate.line,
      // `token` + `scope` are what make a finding identifiable across edits, so
      // a baseline can tell pre-existing debt from a new violation without
      // depending on line numbers that shift on every touch.
      token: candidate.token,
      scope: candidate.scope || 'file',
      snippet: candidate.snippet.slice(0, 120)
    });
  }

  // The cap trims what a human reads, never what blocks: six advisory MEDs
  // emitted first must not push a blocking HIGH out of the report.
  const high = findings.filter((finding) => finding.severity === 'HIGH');
  const rest = findings.filter((finding) => finding.severity !== 'HIGH');
  for (const finding of [...high, ...rest].slice(0, limit)) push(finding);
}

module.exports = {
  scanNamingLanguage,
  classifyIdentifier,
  classifyProse,
  extractTestTitles,
  splitWords,
  ROLE_TOKENS
};
