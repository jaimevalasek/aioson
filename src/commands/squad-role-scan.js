'use strict';

// squad:role-scan — deterministic, dependency-free retrieval of role signals from
// a squad's source documents. Feeds the role pool in @squad design (Passo 2.5):
// entities (what the squad reasons about) + work-modes (-> candidate roles) + terms.
// No embeddings / vector DB — pure term/entity/action extraction over the corpus.

const fs = require('node:fs/promises');
const path = require('node:path');

const STOPWORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with',
  'by', 'from', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has',
  'had', 'do', 'does', 'did', 'will', 'would', 'should', 'could', 'may', 'might',
  'can', 'this', 'that', 'these', 'those', 'it', 'its', 'as', 'not', 'no', 'than',
  'then', 'also', 'via', 'per', 'etc', 'you', 'your', 'they', 'their', 'our', 'we',
  'uma', 'umas', 'uns', 'com', 'sem', 'por', 'para', 'das', 'dos', 'que', 'seu',
  'sua', 'seus', 'suas', 'isso', 'isto', 'essa', 'esse', 'estas', 'estes', 'como',
  'mais', 'menos', 'tambem', 'entre', 'sobre', 'cada', 'quando', 'onde', 'qual',
]);

// Action verbs grouped by work-mode — mirrors the domain-decomposition lens in
// creation-flow.md (originate / transform / judge), so the output maps to roles.
const ACTION_MODES = {
  originate: ['create', 'research', 'draft', 'design', 'build', 'write', 'generate', 'produce', 'plan', 'define', 'discover', 'collect', 'gather', 'criar', 'pesquisar', 'redigir', 'projetar', 'construir', 'escrever', 'gerar', 'produzir', 'planejar', 'definir', 'descobrir', 'coletar'],
  transform: ['transform', 'edit', 'refactor', 'synthesize', 'reconcile', 'process', 'convert', 'migrate', 'sync', 'translate', 'format', 'optimize', 'update', 'merge', 'transformar', 'editar', 'refatorar', 'sintetizar', 'reconciliar', 'processar', 'converter', 'migrar', 'sincronizar', 'traduzir', 'formatar', 'otimizar', 'atualizar', 'mesclar'],
  judge: ['review', 'validate', 'verify', 'check', 'approve', 'audit', 'test', 'assess', 'evaluate', 'grade', 'moderate', 'revisar', 'validar', 'verificar', 'conferir', 'aprovar', 'auditar', 'testar', 'avaliar', 'moderar'],
};

function tokenize(text) {
  return String(text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .split(/[^a-z0-9]+/)
    .filter((w) => w && w.length >= 3 && !STOPWORDS.has(w));
}

function rankTerms(text, limit = 30) {
  const freq = new Map();
  for (const tok of tokenize(text)) freq.set(tok, (freq.get(tok) || 0) + 1);
  return [...freq.entries()]
    .filter(([, c]) => c >= 2)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([term, count]) => ({ term, count }));
}

// Sentence-starters / articles / pronouns that are not domain entities.
const NON_ENTITY = new Set([
  'The', 'A', 'An', 'This', 'That', 'These', 'Those', 'We', 'Our', 'You', 'Your',
  'They', 'Their', 'It', 'Its', 'He', 'She', 'If', 'When', 'Then', 'Before', 'After',
  'Run', 'Use', 'For', 'And', 'But', 'Or', 'To', 'In', 'On', 'At', 'Of', 'Each',
  'Uma', 'Umas', 'Uns', 'Esta', 'Este', 'Essas', 'Esses', 'Nos', 'Nossa', 'Voce',
  'Seu', 'Sua', 'Eles', 'Elas', 'Se', 'Quando', 'Antes', 'Depois', 'Use', 'Cada',
]);

function extractEntities(text, limit = 20) {
  // Unicode Title-Case phrases of 1-3 words, never crossing a line.
  const re = /(?<![\p{L}\p{N}])(\p{Lu}\p{Ll}+(?:[ \t]+\p{Lu}\p{Ll}+){0,2})(?![\p{L}\p{N}])/gu;
  const freq = new Map();
  let m;
  while ((m = re.exec(text)) !== null) {
    const words = m[1].trim().split(/[ \t]+/);
    while (words.length > 1 && NON_ENTITY.has(words[0])) words.shift(); // drop leading article/pronoun
    const phrase = words.join(' ');
    if (phrase.length < 3) continue;
    if (words.length === 1 && NON_ENTITY.has(words[0])) continue; // bare "The" / "We" / ...
    freq.set(phrase, (freq.get(phrase) || 0) + 1);
  }
  return [...freq.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([entity, count]) => ({ entity, count }));
}

function buildRoleCandidates(actions, entities) {
  const entity = entities[0]?.entity || 'Domain';
  const labels = {
    originate: 'originator',
    transform: 'transformer',
    judge: 'reviewer'
  };
  return Object.entries(actions)
    .filter(([, verbs]) => verbs.length > 0)
    .map(([workMode, verbs]) => ({
      slug: `${entity.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${labels[workMode]}`.replace(/^-+|-+$/g, ''),
      work_mode: workMode,
      contribution: `${labels[workMode]} for ${entity}`,
      evidence: verbs,
      persistent: false
    }));
}

function inflections(v) {
  // Match common inflected forms so "validates"/"reviewing"/"created" still count.
  const f = new Set([v, v + 's', v + 'es', v + 'ed', v + 'ing', v + 'd']);
  if (v.endsWith('e')) {
    const b = v.slice(0, -1);
    f.add(b + 'ed');
    f.add(b + 'ing');
    f.add(b + 'es');
  }
  return f;
}

function extractActions(text) {
  const tokens = new Set(tokenize(text));
  const out = {};
  for (const [mode, verbs] of Object.entries(ACTION_MODES)) {
    out[mode] = verbs.filter((v) => {
      for (const form of inflections(v)) {
        if (tokens.has(form)) return true;
      }
      return false;
    });
  }
  return out;
}

async function resolveDocPaths({ projectDir, docsOpt, slug }) {
  if (docsOpt) {
    return String(docsOpt).split(',').map((p) => p.trim()).filter(Boolean);
  }
  if (slug) {
    const manifestPath = path.join(projectDir, '.aioson', 'squads', slug, 'squad.manifest.json');
    try {
      const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
      return Array.isArray(manifest.sourceDocs) ? manifest.sourceDocs : [];
    } catch {
      return null; // manifest unreadable
    }
  }
  return [];
}

async function runSquadRoleScan({ args = [], options = {}, logger = console } = {}) {
  const projectDir = path.resolve(process.cwd(), args[0] || '.');
  const slug = options.squad || args[1];
  const docsOpt = options.docs;

  if (!docsOpt && !slug) {
    logger.error('Usage: aioson squad:role-scan [path] (--docs=a.md,b.md | --squad=<slug>) [--json]');
    return { ok: false, error: 'missing_input', signals: null };
  }

  const docPaths = await resolveDocPaths({ projectDir, docsOpt, slug });
  if (docPaths === null) {
    logger.error(`Squad "${slug}" not found (no manifest).`);
    return { ok: false, error: 'manifest_not_found', signals: null };
  }

  const texts = [];
  const read = [];
  const missing = [];
  const rejected = [];
  const projectRoot = path.resolve(projectDir);
  for (const rel of docPaths) {
    // Containment: resolve and refuse anything outside the project root — a `..` escape or an
    // absolute path (via --docs or a shared manifest's sourceDocs) must not read arbitrary
    // files. SF-squad-self-improving-01 (path traversal / arbitrary file read).
    const abs = path.resolve(projectDir, String(rel).replace(/\\/g, '/'));
    if (abs !== projectRoot && !abs.startsWith(projectRoot + path.sep)) {
      rejected.push(rel);
      continue;
    }
    try {
      texts.push(await fs.readFile(abs, 'utf8'));
      read.push(rel);
    } catch {
      missing.push(rel);
    }
  }

  if (texts.length === 0) {
    logger.error('No readable source documents found in scope. Provide --docs (inside the project) or a squad with sourceDocs.');
    return { ok: false, error: 'no_docs', signals: null, missing, rejected };
  }

  const corpus = texts.join('\n\n');
  const signals = {
    terms: rankTerms(corpus),
    entities: extractEntities(corpus),
    actions: extractActions(corpus),
  };
  signals.roleCandidates = buildRoleCandidates(signals.actions, signals.entities);
  const result = { ok: true, slug: slug || null, docCount: read.length, missing, rejected, signals };

  if (options.json) return result;

  logger.log('');
  logger.log(`== Squad Role Scan ${slug ? `: ${slug}` : ''} ==`);
  logger.log(`Scanned ${read.length} document(s)${missing.length ? ` (${missing.length} missing)` : ''}${rejected.length ? ` (${rejected.length} rejected: outside project)` : ''}`);
  logger.log('');
  logger.log('Entities (what the squad reasons about):');
  for (const e of signals.entities.slice(0, 12)) logger.log(`  ${String(e.entity).padEnd(28)} ${e.count}`);
  logger.log('');
  logger.log('Work-modes detected (-> candidate roles):');
  for (const [mode, verbs] of Object.entries(signals.actions)) {
    logger.log(`  ${mode.padEnd(10)} ${verbs.length ? verbs.join(', ') : '(none)'}`);
  }
  logger.log('');
  logger.log('Top terms:');
  logger.log('  ' + signals.terms.slice(0, 15).map((t) => t.term).join(', '));
  logger.log('');
  logger.log('Seed @squad design (Passo 2.5): cluster work-modes into executors; name them after the entities.');

  return result;
}

module.exports = { runSquadRoleScan };
