'use strict';

/**
 * Task vocabulary — does a `context:brief` task carry any domain words?
 *
 * The selector's keyword routing (task_types, triggers, aliases, entities)
 * reads the TASK only, on purpose (feature slugs and paths as vocabulary
 * wrecked precision). A kernel template like "implement {slug} from the
 * approved PRD and plan" therefore routes nothing domain-specific: the form,
 * listing and status-flow rules a feature needs never reach must_load, and the
 * brief still looks healthy. This module makes that shape measurable: a task
 * whose words are all workflow vocabulary, stop words, or the feature pointer
 * itself is `generic`.
 *
 * Bilingual (en + pt-BR, accents folded) and stack-agnostic: the list names
 * process words only, never a domain noun — a word here is erased from every
 * task that uses it, so "form", "status", "table", "app" must never enter.
 */

const STOP_WORDS = new Set([
  'a', 'an', 'and', 'as', 'at', 'by', 'for', 'from', 'in', 'into', 'of', 'on',
  'or', 'the', 'to', 'with', 'its', 'it', 'this', 'that', 'all', 'any', 'per',
  'against', 'via', 'using', 'according', 'over', 'between', 'within', 'without',
  'como', 'sem', 'entre', 'sobre',
  'o', 'os', 'as', 'um', 'uma', 'e', 'ou', 'de', 'da', 'das', 'do', 'dos',
  'em', 'na', 'nas', 'no', 'nos', 'com', 'para', 'por', 'pelo', 'pela', 'que',
  'contra', 'conforme', 'segundo'
]);

const WORKFLOW_WORDS = new Set([
  // verbs of the workflow itself
  'implement', 'implementing', 'implementation', 'implementar', 'implementacao',
  'build', 'develop', 'desenvolver', 'execute', 'executar', 'continue', 'continuar',
  'resume', 'retomar', 'finish', 'finalizar', 'complete', 'concluir',
  'verify', 'verificar', 'validate', 'validar', 'review', 'revisar', 'revisao',
  'approve', 'aprovar', 'define', 'definir', 'create', 'criar', 'write', 'escrever',
  'plan', 'planejar', 'refine', 'refinar', 'check', 'checar', 'test', 'testar',
  // workflow artifacts and states
  'prd', 'plano', 'spec', 'specs', 'requirements', 'requisitos', 'design-doc',
  'executable', 'executavel', 'approved', 'aprovado', 'aprovada', 'active',
  'ativo', 'ativa', 'current', 'atual', 'real', 'feature', 'features',
  'funcionalidade', 'slice', 'fatia', 'phase', 'fase', 'stage', 'etapa', 'step',
  'passo', 'next', 'proximo', 'proxima', 'task', 'tarefa', 'work', 'trabalho',
  'harness', 'contract', 'contrato', 'handoff', 'dossier', 'checkpoint',
  'application', 'aplicacao', 'project', 'projeto', 'repository', 'repositorio',
  'code', 'codigo', 'changes', 'mudancas', 'delivery', 'entrega', 'slug'
]);

function foldTokens(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\{[^}]*\}/g, ' ')
    .replace(/[^a-z0-9-]+/g, ' ')
    .split(/\s+/)
    .map((token) => token.replace(/^-+|-+$/g, ''))
    .filter(Boolean);
}

/**
 * @param {string} task
 * @param {{ featureSlugs?: Iterable<string> }} [options] slugs that are
 *   pointers, not vocabulary (the active feature, known PRD slugs)
 * @returns {{ generic: boolean, content_terms: string[] }}
 */
function analyzeTaskVocabulary(task, options = {}) {
  const pointers = new Set(
    [...(options.featureSlugs || [])].map((slug) => String(slug || '').trim().toLowerCase()).filter(Boolean)
  );
  const content = [];
  for (const token of foldTokens(task)) {
    if (pointers.has(token)) continue;
    if (STOP_WORDS.has(token) || WORKFLOW_WORDS.has(token)) continue;
    if (/^\d+$/.test(token) || token.length < 2) continue;
    content.push(token);
  }
  const trimmed = String(task || '').trim();
  return { generic: trimmed.length > 0 && content.length === 0, content_terms: [...new Set(content)] };
}

module.exports = { analyzeTaskVocabulary, WORKFLOW_WORDS };
