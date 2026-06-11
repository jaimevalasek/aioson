'use strict';

/**
 * Payload de revisão fresh-context para o prompt do @validator (Fase 2 do
 * plano de verificação executável).
 *
 * `harness:validate` gera o prompt do @validator headless; este módulo anexa
 * a ele tudo que um contexto ISOLADO precisa para validar sem herdar o
 * histórico da sessão que implementou: diff vs base, lista de arquivos
 * alterados (incluindo untracked), resultado dos checks determinísticos
 * (last-check-output.json) e a instrução de onde gravar o veredito JSON.
 *
 * Nunca lança: fora de um repo git (ou em falha de I/O) retorna um payload
 * degradado com a nota correspondente — os testes do router rodam em tmpdir
 * sem git e devem continuar passando.
 */

const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const { parsePorcelain } = require('./git-baseline');
const { matchGlob } = require('./glob-match');

/** Estado do framework não é superfície de revisão (mesmo precedente do git-baseline). */
const FRAMEWORK_STATE_GLOB = '.aioson/**';

const DEFAULT_MAX_DIFF_BYTES = 200000;

function git(targetDir, gitArgs) {
  return execFileSync('git', gitArgs, {
    cwd: targetDir,
    encoding: 'utf8',
    maxBuffer: 1024 * 1024 * 20,
    stdio: ['ignore', 'pipe', 'pipe']
  });
}

/**
 * Resolve a ref base do diff, na ordem:
 * 1. `baseRef` explícito (--base)
 * 2. `baseline.json` do plan dir (HEAD capturado no preflight do self:loop)
 * 3. merge-base de HEAD com main/master (local)
 * 4. 'HEAD' (apenas mudanças não commitadas)
 *
 * @returns {{ base: string, source: string }}
 */
function resolveBase(targetDir, planDir, baseRef) {
  if (baseRef) return { base: String(baseRef), source: 'explicit --base' };

  try {
    const baselinePath = path.join(planDir, 'baseline.json');
    if (fs.existsSync(baselinePath)) {
      const baseline = JSON.parse(fs.readFileSync(baselinePath, 'utf8'));
      if (baseline && baseline.head) return { base: baseline.head, source: 'baseline.json (loop preflight)' };
    }
  } catch { /* baseline ilegível — segue o fallback */ }

  for (const branch of ['main', 'master']) {
    try {
      const mergeBase = git(targetDir, ['merge-base', 'HEAD', branch]).trim();
      const head = git(targetDir, ['rev-parse', 'HEAD']).trim();
      // merge-base === HEAD significa que estamos NO branch (ou atrás dele):
      // o diff vs base seria vazio; cai para HEAD (mudanças não commitadas).
      if (mergeBase && mergeBase !== head) return { base: mergeBase, source: `merge-base with ${branch}` };
    } catch { /* branch ausente — tenta o próximo */ }
  }

  return { base: 'HEAD', source: 'fallback (uncommitted changes only)' };
}

/** Trunca em fronteira de linha com marcador; bytes UTF-8. */
function truncateDiff(diff, maxBytes) {
  const bytes = Buffer.byteLength(diff, 'utf8');
  if (bytes <= maxBytes) return { diff, truncated: false, bytes };
  let slice = Buffer.from(diff, 'utf8').subarray(0, maxBytes).toString('utf8');
  // remove eventual caractere multibyte cortado e fecha na última linha completa
  slice = slice.replace(/�+$/g, '');
  const lastNewline = slice.lastIndexOf('\n');
  if (lastNewline > 0) slice = slice.slice(0, lastNewline);
  return {
    diff: `${slice}\n... [diff truncated at ${maxBytes} bytes of ${bytes} — read the changed files directly for the rest]`,
    truncated: true,
    bytes
  };
}

/** Sumariza last-check-output.json em linhas de texto; null quando ausente. */
function summarizeCheckOutput(planDir) {
  const checkPath = path.join(planDir, 'last-check-output.json');
  if (!fs.existsSync(checkPath)) return null;
  try {
    const report = JSON.parse(fs.readFileSync(checkPath, 'utf8'));
    const lines = [
      `Ran at: ${report.checked_at} — ${report.passed}/${report.executable_total} executable checks passed, ${report.skipped_no_verification} criteria without verification.`
    ];
    for (const check of report.checks || []) {
      lines.push(`- ${check.ok ? 'PASS' : 'FAIL'} ${check.id} — \`${check.command}\` (exit ${check.exitCode}${check.timedOut ? ', timeout' : ''})`);
    }
    lines.push('Copy these exit-code verdicts verbatim into `results[].passed` for their criteria — do not re-judge them.');
    return lines.join('\n');
  } catch {
    return null;
  }
}

/**
 * Monta o payload de revisão. Nunca lança.
 *
 * @param {string} targetDir — raiz do projeto
 * @param {string} planDir — .aioson/plans/{slug}
 * @param {object} opts
 * @param {string} [opts.slug]
 * @param {string} [opts.baseRef] — ref explícita (--base)
 * @param {number} [opts.maxDiffBytes]
 * @param {string} [opts.outputPath] — onde o validator grava o JSON
 * @returns {{ ok, base, baseSource, changedFiles, untracked, truncated, diffBytes, hasChecks, text }}
 */
function buildReviewPayload(targetDir, planDir, opts = {}) {
  const maxDiffBytes = Number.isInteger(Number(opts.maxDiffBytes)) && Number(opts.maxDiffBytes) > 0
    ? Number(opts.maxDiffBytes)
    : DEFAULT_MAX_DIFF_BYTES;
  const checkSummary = summarizeCheckOutput(planDir);

  const header = [
    '',
    '---',
    '',
    '## Review payload (generated by `aioson harness:validate`)',
    '',
    '> Run this prompt in a **fresh, isolated context** (subagent/Task tool or a separate session). Never validate inline in the session that implemented the feature — the implementation history biases the verdict.',
    ''
  ];

  const outputBlock = [
    '### Verdict output',
    '',
    `Write **only** the validator JSON verdict${opts.outputPath ? ` to: \`${opts.outputPath}\`` : ''}.`,
    opts.slug ? `The orchestrating session then consumes it with: \`aioson harness:validate . --slug=${opts.slug}\`` : '',
    ''
  ].filter((line) => line !== '');

  const checksBlock = [
    '### Deterministic check results (`aioson harness:check`)',
    '',
    checkSummary || 'No `last-check-output.json` found — run `aioson harness:check` first (criteria with `verification` must be decided by exit code, not judgment).',
    ''
  ];

  let gitFailed = false;
  let base = null;
  let baseSource = null;
  let changedFiles = [];
  let untracked = [];
  let diffResult = { diff: '', truncated: false, bytes: 0 };

  try {
    const resolved = resolveBase(targetDir, planDir, opts.baseRef);
    base = resolved.base;
    baseSource = resolved.source;

    const nameStatus = git(targetDir, ['diff', '--name-status', base]);
    changedFiles = nameStatus
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const [status, ...rest] = line.split('\t');
        return { status, path: rest.join('\t') };
      });

    untracked = parsePorcelain(git(targetDir, ['status', '--porcelain', '-uall']))
      .filter((entry) => entry.status === 'added' && !matchGlob(FRAMEWORK_STATE_GLOB, entry.path))
      .map((entry) => entry.path);

    diffResult = truncateDiff(git(targetDir, ['diff', base]), maxDiffBytes);
  } catch {
    gitFailed = true;
  }

  let diffBlock;
  if (gitFailed) {
    diffBlock = [
      '### Diff under review',
      '',
      'Diff unavailable (not a git repository or git failed). Review the files listed in `progress.json.completed_steps` directly.',
      ''
    ];
  } else {
    const fileLines = [
      ...changedFiles.map((f) => `- ${f.status} ${f.path}`),
      ...untracked.map((p) => `- ?? ${p} (untracked)`)
    ];
    diffBlock = [
      `### Changed files vs base \`${base}\` (${baseSource})`,
      '',
      fileLines.length ? fileLines.join('\n') : '(no changes detected)',
      '',
      '### Unified diff',
      '',
      'Untracked files do not appear in the diff below — read them directly.',
      '',
      '```diff',
      diffResult.diff || '(empty diff)',
      '```',
      ''
    ];
  }

  const text = [...header, ...checksBlock, ...diffBlock, ...outputBlock].join('\n');

  return {
    ok: !gitFailed,
    base,
    baseSource,
    changedFiles,
    untracked,
    truncated: diffResult.truncated,
    diffBytes: diffResult.bytes,
    hasChecks: Boolean(checkSummary),
    text
  };
}

module.exports = {
  DEFAULT_MAX_DIFF_BYTES,
  resolveBase,
  truncateDiff,
  buildReviewPayload
};
