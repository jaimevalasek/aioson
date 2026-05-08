'use strict';

/**
 * aioson commit:prepare — pre-collect commit context so @committer spends tokens
 * only on creative work (message writing), not on file exploration.
 *
 * Usage:
 *   aioson commit:prepare .
 *   aioson commit:prepare . --staged-only
 *   aioson commit:prepare . --agent-safe --staged-only --mode=headless
 *   aioson commit:prepare . --json
 */

const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const readline = require('node:readline');
const { runGitGuard } = require('./git-guard');
const { promptPicker } = require('../lib/terminal-picker');
const { evaluatePathRules, loadGuardConfig, resolveGuardConfigPath } = require('../lib/git-commit-guard');

function runGit(gitRoot, args, options = {}) {
  return execFileSync('git', args, {
    cwd: gitRoot,
    encoding: options.encoding || 'utf8',
    maxBuffer: options.maxBuffer || 8 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe']
  });
}

function resolveGitRoot(projectDir) {
  return String(runGit(projectDir, ['rev-parse', '--show-toplevel'])).trim();
}

function parseGitStatusShort(gitRoot) {
  const output = runGit(gitRoot, ['status', '--short']);
  const lines = output.split('\n').filter(Boolean);
  const staged = [];
  const unstaged = [];
  const untracked = [];

  for (const line of lines) {
    const status = line.slice(0, 2);
    const rawPath = line.slice(3);
    // Handle "R" rename format: "R  old -> new"
    const filePath = rawPath.includes(' -> ') ? rawPath.split(' -> ').pop() : rawPath;

    const isStaged = status[0] !== ' ' && status[0] !== '?';
    const isUnstaged = status[1] !== ' ' && status[1] !== '?';
    const isUntracked = status === '??';

    if (isUntracked) {
      untracked.push(filePath);
    } else {
      if (isStaged) staged.push(filePath);
      if (isUnstaged) unstaged.push(filePath);
    }
  }

  return { staged, unstaged, untracked };
}

function askQuestion(rl, questionText) {
  return new Promise((resolve) => {
    rl.question(questionText, (answer) => {
      resolve(answer.trim());
    });
  });
}

/**
 * Builds picker items for the rich TUI: groups by git status (Modified vs
 * Untracked), pre-evaluates each path against git-guard rules, and produces
 * the per-item state used by promptPicker:
 *
 *   - locked = true  → file would be blocked by git-guard (e.g. node_modules,
 *                       .idea, build artifacts). Cannot be checked. The reason
 *                       is shown in the row hint and on space press.
 *   - badge   = '⚠'  → file matches a warning rule (backup, *.sqlite, scratch
 *                       names) — checkable but flagged.
 *   - hint    = small grey text describing why a row is locked/warned, or the
 *                       short relative directory.
 *
 * Default checked state: safe and warned files start checked (match existing
 * "press Enter to stage everything" muscle memory). Locked files stay
 * unchecked and locked.
 */
function buildPickerItems(unstaged, untracked, guardConfig) {
  const cfg = guardConfig || {};
  const dirHint = (p) => {
    const dir = p.split('/').slice(0, -1).join('/');
    return dir ? `· ${dir}` : '';
  };

  const make = (filePath, group) => {
    const evalResult = evaluatePathRules(filePath, cfg);
    const isBlocked = evalResult.blocked.length > 0;
    const hasWarning = evalResult.warned.length > 0;
    const reason = isBlocked
      ? evalResult.blocked.map((b) => b.reason).join('; ')
      : hasWarning
        ? evalResult.warned.map((w) => w.reason).join('; ')
        : '';
    return {
      id: filePath,
      label: filePath,
      group,
      checked: !isBlocked,
      locked: isBlocked,
      badge: isBlocked ? 'BLOCK' : hasWarning ? 'WARN' : '',
      hint: reason || dirHint(filePath),
      blockReason: reason
    };
  };

  return [
    ...unstaged.map((p) => make(p, 'Modified')),
    ...untracked.map((p) => make(p, 'Untracked'))
  ];
}

async function promptFileSelectionPicker(unstaged, untracked, guardConfig) {
  const items = buildPickerItems(unstaged, untracked, guardConfig);
  if (items.length === 0) return [];

  const blockedCount = items.filter((i) => i.locked).length;
  const warnedCount = items.filter((i) => i.badge === 'WARN').length;
  const subtitle = [
    `${unstaged.length} modified, ${untracked.length} untracked`,
    blockedCount > 0 ? `${blockedCount} \x1B[31mblocked by git-guard\x1B[0m` : null,
    warnedCount > 0 ? `${warnedCount} \x1B[33mwarn\x1B[0m` : null
  ].filter(Boolean).join(' · ');

  return promptPicker(items, {
    title: 'commit:prepare — select files to stage',
    subtitle,
    summary: ({ checkedCount, totalCount, lockedCount, filteredCount }) => {
      const filterNote = filteredCount !== totalCount ? ` · ${filteredCount} match filter` : '';
      return `${checkedCount} selected · ${lockedCount} locked · ${totalCount} total${filterNote}`;
    }
  });
}

async function promptYesNo(questionText) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const answer = await askQuestion(rl, `${questionText} (s/N): `);
  rl.close();
  return answer.toLowerCase() === 's' || answer.toLowerCase() === 'sim';
}

async function promptMenu(items, questionText) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  process.stdout.write('\n');
  items.forEach((item, i) => {
    process.stdout.write(`  ${i + 1}. ${item}\n`);
  });
  process.stdout.write('\n');

  const answer = await askQuestion(rl, `${questionText} `);
  rl.close();

  const num = parseInt(answer, 10);
  if (isNaN(num) || num < 1 || num > items.length) return -1;
  return num;
}

async function resolveGuardFindings(gitRoot, guardResult, logger) {
  const findings = [
    ...(guardResult.errors || []).map((f) => ({ ...f, severity: 'error' })),
    ...(guardResult.warnings || []).map((f) => ({ ...f, severity: 'warning' }))
  ];

  if (findings.length === 0) return true;

  const guardPath = path.join(gitRoot, '.aioson', 'git-guard.json');
  let guardConfig = {};
  try {
    guardConfig = JSON.parse(fs.readFileSync(guardPath, 'utf8'));
  } catch {
    guardConfig = { version: 1, allowPaths: [], contentAllowPaths: [], blockPaths: [], allowExtensions: [], blockExtensions: [] };
  }
  if (!Array.isArray(guardConfig.contentAllowPaths)) guardConfig.contentAllowPaths = [];
  if (!Array.isArray(guardConfig.blockPaths)) guardConfig.blockPaths = [];

  const toUnstage = [];
  let guardConfigChanged = false;

  for (const finding of findings) {
    const label = finding.severity === 'error' ? '[ERRO]' : '[AVISO]';
    process.stdout.write(`\n${label} ${finding.path}\n`);
    process.stdout.write(`  Motivo: ${finding.reason} [${finding.id}]\n`);

    const isContent = finding.type === 'content';
    const menuItems = [];
    const actions = [];

    if (isContent) {
      menuItems.push('Marcar como confiável (adicionar a contentAllowPaths — falso positivo)');
      actions.push('content_allow');
    }
    menuItems.push('Bloquear permanentemente (adicionar a blockPaths)');
    actions.push('block');
    menuItems.push('Remover do stage (não comitar agora)');
    actions.push('unstage');
    if (finding.severity === 'warning') {
      menuItems.push('Ignorar este aviso e continuar');
      actions.push('ignore');
    }

    const choice = await promptMenu(menuItems, 'O que fazer com este arquivo?');
    if (choice === -1) {
      logger.log('Entrada inválida — mantendo bloqueio.');
      return false;
    }

    const action = actions[choice - 1];

    if (action === 'content_allow') {
      if (!guardConfig.contentAllowPaths.includes(finding.path)) {
        guardConfig.contentAllowPaths.push(finding.path);
        guardConfigChanged = true;
        logger.log(`  ✔ Adicionado a contentAllowPaths: ${finding.path}`);
      }
    } else if (action === 'block') {
      const pattern = `${finding.path.includes('**') ? finding.path : finding.path}`;
      if (!guardConfig.blockPaths.includes(pattern)) {
        guardConfig.blockPaths.push(pattern);
        guardConfigChanged = true;
        logger.log(`  ✔ Adicionado a blockPaths: ${pattern}`);
      }
    } else if (action === 'unstage') {
      toUnstage.push(finding.path);
      logger.log(`  ✔ Marcado para remover do stage: ${finding.path}`);
    } else if (action === 'ignore') {
      logger.log(`  ✔ Aviso ignorado: ${finding.path}`);
    }
  }

  if (guardConfigChanged) {
    try {
      fs.writeFileSync(guardPath, `${JSON.stringify(guardConfig, null, 2)}\n`, 'utf8');
      logger.log('\n✔ git-guard.json atualizado.');
    } catch (err) {
      logger.error(`Não foi possível salvar git-guard.json: ${err.message}`);
      return false;
    }
  }

  if (toUnstage.length > 0) {
    try {
      runGit(gitRoot, ['restore', '--staged', '--', ...toUnstage]);
      logger.log(`✔ Removidos do stage: ${toUnstage.join(', ')}`);
    } catch (err) {
      logger.error(`Falha ao remover do stage: ${err.message}`);
      return false;
    }
  }

  return true;
}

function findLatestRelevantPlan(gitRoot) {
  const candidates = [
    path.join(gitRoot, '.aioson', 'plans'),
    path.join(gitRoot, 'plans')
  ];

  for (const dir of candidates) {
    if (!fs.existsSync(dir)) continue;
    const entries = fs.readdirSync(dir)
      .map((name) => {
        const full = path.join(dir, name);
        try {
          const stat = fs.statSync(full);
          return { name, full, mtime: stat.mtime };
        } catch {
          return null;
        }
      })
      .filter(Boolean)
      .sort((a, b) => b.mtime - a.mtime);

    for (const entry of entries) {
      const manifest = path.join(entry.full, 'manifest.md');
      if (fs.existsSync(manifest)) {
        try {
          return fs.readFileSync(manifest, 'utf8');
        } catch {
          // ignore read errors
        }
      }
    }
  }

  return null;
}

function isPrepStale(prep) {
  if (!prep || !prep.generatedAt) return true;
  const generated = new Date(prep.generatedAt).getTime();
  const now = Date.now();
  return Number.isNaN(generated) || now - generated > 30 * 60 * 1000;
}

function wasPrepCommitted(prep) {
  return Boolean(prep && prep.committedAt);
}

async function runCommitPrepare({ args, options, logger }) {
  const projectDir = path.resolve(process.cwd(), args[0] || '.');
  const jsonMode = Boolean(options.json);
  const stagedOnly = Boolean(options['staged-only'] || options.stagedOnly);
  const agentSafe = Boolean(options['agent-safe'] || options.agentSafe);
  const requestedMode = String(options.mode || '').trim().toLowerCase();
  const headlessMode = requestedMode === 'headless' || agentSafe;
  const nonInteractive = jsonMode || Boolean(options['non-interactive'] || options.nonInteractive) || agentSafe;
  const hasTty = Boolean(process.stdin && process.stdin.isTTY && process.stdout && process.stdout.isTTY);
  const interactiveSelectionAllowed = !nonInteractive && hasTty && !headlessMode;

  let gitRoot;
  try {
    gitRoot = resolveGitRoot(projectDir);
  } catch (error) {
    const failure = {
      ok: false,
      error: 'not_a_git_repository',
      message: `Unable to find git root in ${projectDir}: ${error.message}`
    };
    if (jsonMode) return failure;
    logger.error(failure.message);
    process.exitCode = 1;
    return failure;
  }

  const prepDir = path.join(gitRoot, '.aioson', 'context');
  const prepPath = path.join(prepDir, 'commit-prep.json');

  const { staged, unstaged, untracked } = parseGitStatusShort(gitRoot);

  let existingPrep = null;
  try {
    existingPrep = JSON.parse(fs.readFileSync(prepPath, 'utf8'));
  } catch {
    existingPrep = null;
  }

  const currentStagedSet = new Set(staged);
  const prepStagedSet = new Set(Array.isArray(existingPrep?.stagedFiles) ? existingPrep.stagedFiles : []);
  const stagedFilesChanged = currentStagedSet.size !== prepStagedSet.size || [...currentStagedSet].some((f) => !prepStagedSet.has(f));

  const shouldReuse = existingPrep && existingPrep.ready && !isPrepStale(existingPrep) && !wasPrepCommitted(existingPrep) && !stagedFilesChanged;

  if (shouldReuse && stagedOnly) {
    if (!jsonMode) {
      logger.log('Reutilizando commit-prep.json existente e válido.');
    }
    return {
      ok: true,
      gitRoot,
      prepPath,
      reused: true,
      stagedCount: Array.isArray(existingPrep.stagedFiles) ? existingPrep.stagedFiles.length : 0,
      guardOk: Boolean(existingPrep.guard && existingPrep.guard.ok),
      ready: true
    };
  }
  const allModified = [...new Set([...unstaged, ...untracked])];

  let filesToStage = [];

  if (stagedOnly) {
    filesToStage = [];
    if (!jsonMode) {
      logger.log('Modo --staged-only: usando apenas arquivos já no stage.');
    }
  } else if (allModified.length > 0) {
    if (!jsonMode) {
      logger.log('Arquivos modificados ou não rastreados encontrados:');
    }

    if (!interactiveSelectionAllowed) {
      const failure = {
        ok: false,
        error: headlessMode ? 'explicit_staging_required_in_headless' : 'explicit_staging_required',
        message: headlessMode
          ? 'Modo agent-safe/headless não pode abrir seleção interativa de arquivos. Faça stage explícito antes de continuar ou rode com --staged-only se quiser usar somente o stage atual.'
          : 'Modo não interativo sem TTY não pode abrir seleção de arquivos. Faça stage explícito antes de continuar ou rode com --staged-only.',
        gitRoot,
        stagedFiles: staged,
        unstagedFiles: unstaged,
        untrackedFiles: untracked,
        modifiedFiles: allModified,
        suggestedCommands: headlessMode
          ? [
              'git add -- <explicit-paths>',
              'aioson commit:prepare . --agent-safe --staged-only --mode=headless'
            ]
          : [
              'git add -- <explicit-paths>',
              'aioson commit:prepare . --staged-only'
            ],
        ready: false,
        nonInteractive: true,
        agentSafe,
        mode: requestedMode || null
      };
      if (jsonMode) return failure;
      logger.error(failure.message);
      logger.error('Comandos sugeridos:');
      failure.suggestedCommands.forEach((command) => logger.error(`  ${command}`));
      process.exitCode = 1;
      return failure;
    }

    // Pre-load git-guard config so the picker can pre-evaluate each candidate
    // path. This catches IDE configs (.idea, .vscode), build artifacts
    // (node_modules, dist, target, __pycache__), and other commonly-leaked
    // dirs BEFORE staging — they show up locked in the picker with the reason
    // attached, instead of slipping through git add . and getting caught at
    // commit time.
    let guardConfigState = { config: {} };
    try {
      guardConfigState = await loadGuardConfig(gitRoot);
    } catch (err) {
      // Bad config: warn but proceed with no extra rules. Default rules still apply.
      logger.error(`Aviso: git-guard.json inválido (${err.message}). Usando regras padrão.`);
    }

    const selected = await promptFileSelectionPicker(unstaged, untracked, guardConfigState.config);
    if (selected === null) {
      const cancelResult = { ok: false, error: 'cancelled_by_user', message: 'Operação cancelada pelo usuário.' };
      if (jsonMode) return cancelResult;
      logger.log('Cancelado.');
      return cancelResult;
    }
    filesToStage = selected;
  }

  if (filesToStage.length > 0) {
    try {
      runGit(gitRoot, ['add', '--', ...filesToStage]);
      if (!jsonMode) {
        logger.log(`Adicionados ao stage: ${filesToStage.join(', ')}`);
      }
    } catch (error) {
      const failure = {
        ok: false,
        error: 'git_add_failed',
        message: `git add failed: ${error.message}`
      };
      if (jsonMode) return failure;
      logger.error(failure.message);
      process.exitCode = 1;
      return failure;
    }
  }

  // Re-read staged files after add
  const afterAddStatus = parseGitStatusShort(gitRoot);
  const stagedFiles = afterAddStatus.staged;

  if (stagedFiles.length === 0) {
    const emptyResult = {
      ok: false,
      error: 'no_staged_files',
      message: 'Nenhum arquivo no stage para commit.',
      gitRoot,
      stagedFiles: [],
      ready: false
    };
    if (jsonMode) return emptyResult;
    logger.error(emptyResult.message);
    process.exitCode = 1;
    return emptyResult;
  }

  // Run git guard
  let guardResult = await runGitGuard({
    args: [projectDir],
    options: { json: true },
    logger: { log: () => {}, error: () => {} }
  });

  if (!guardResult.ok) {
    if (jsonMode) {
      return {
        ok: false,
        error: 'guard_failed',
        message: 'aioson git:guard bloqueou o commit. Corrija os problemas antes de continuar.',
        gitRoot,
        guard: guardResult,
        stagedFiles,
        ready: false
      };
    }

    if (!interactiveSelectionAllowed) {
      logger.error('aioson git:guard bloqueou o commit. Corrija os problemas antes de continuar.');
      if (guardResult.errors && guardResult.errors.length > 0) {
        logger.error('Erros:');
        guardResult.errors.forEach((e) => logger.error(`  - ${e.path}: ${e.reason} [${e.id}]`));
      }
      if (guardResult.warnings && guardResult.warnings.length > 0) {
        logger.error('Avisos:');
        guardResult.warnings.forEach((w) => logger.error(`  - ${w.path}: ${w.reason} [${w.id}]`));
      }
      process.exitCode = 1;
      return { ok: false, error: 'guard_failed', message: 'guard bloqueou', gitRoot, guard: guardResult, stagedFiles, ready: false };
    }

    // Interactive resolution
    logger.log('\n⚠ git:guard encontrou problemas. Você pode resolver cada um agora:');
    const resolved = await resolveGuardFindings(gitRoot, guardResult, logger);
    if (!resolved) {
      process.exitCode = 1;
      return { ok: false, error: 'guard_resolution_cancelled', message: 'Resolução cancelada pelo usuário.', gitRoot, stagedFiles, ready: false };
    }

    // Re-run guard after resolution
    guardResult = await runGitGuard({
      args: [projectDir],
      options: { json: true },
      logger: { log: () => {}, error: () => {} }
    });

    if (!guardResult.ok) {
      logger.error('\n✖ git:guard ainda bloqueado após resolução:');
      (guardResult.errors || []).forEach((e) => logger.error(`  [ERRO] ${e.path}: ${e.reason}`));
      (guardResult.warnings || []).forEach((w) => logger.error(`  [AVISO] ${w.path}: ${w.reason}`));
      process.exitCode = 1;
      return { ok: false, error: 'guard_failed', message: 'guard ainda bloqueado após resolução', gitRoot, guard: guardResult, stagedFiles, ready: false };
    }
  }

  // Re-read staged files — resolution may have unstaged some
  const finalStagedFiles = parseGitStatusShort(gitRoot).staged;

  // Collect diff
  let diff = '';
  try {
    diff = runGit(gitRoot, ['diff', '--staged']);
  } catch (error) {
    diff = `// error reading diff: ${error.message}`;
  }

  // Collect recent log
  let recentLog = [];
  try {
    const logOutput = runGit(gitRoot, ['log', '-n', '3', '--oneline']);
    recentLog = logOutput.split('\n').filter(Boolean);
  } catch {
    recentLog = [];
  }

  // Collect project pulse
  let projectPulse = null;
  const pulsePath = path.join(gitRoot, '.aioson', 'context', 'project-pulse.md');
  if (fs.existsSync(pulsePath)) {
    try {
      projectPulse = fs.readFileSync(pulsePath, 'utf8');
    } catch {
      projectPulse = null;
    }
  }

  // Collect relevant plan
  const relevantPlan = findLatestRelevantPlan(gitRoot);

  const prep = {
    generatedAt: new Date().toISOString(),
    gitRoot,
    preparationMode: agentSafe ? 'agent_safe' : stagedOnly ? 'staged_only' : interactiveSelectionAllowed ? 'interactive' : 'non_interactive',
    status: {
      staged,
      unstaged,
      untracked,
      filesToStage
    },
    stagedFiles: finalStagedFiles,
    guard: guardResult,
    diff,
    recentLog,
    projectPulse,
    relevantPlan,
    ready: true
  };

  fs.mkdirSync(prepDir, { recursive: true });
  fs.writeFileSync(prepPath, JSON.stringify(prep, null, 2), 'utf8');

  if (!jsonMode) {
    logger.log(`\n✔ Commit prep pronto. Dados salvos em: ${prepPath}`);
    logger.log(`  Arquivos no stage: ${finalStagedFiles.length}`);
    logger.log(`  Guard: passou`);
    logger.log(`  Diff: ${diff.split('\n').length} linhas`);
    logger.log(`\nAgora ative @committer — ele usará esses dados sem gastar tokens em exploração.`);
  }

  return {
    ok: true,
    gitRoot,
    prepPath,
    stagedCount: finalStagedFiles.length,
    guardOk: true,
    ready: true
  };
}

module.exports = { runCommitPrepare };
