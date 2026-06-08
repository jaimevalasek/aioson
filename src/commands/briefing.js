'use strict';

/**
 * aioson briefing:approve  — Mark a draft briefing as approved
 * aioson briefing:unapprove — Return approved briefing(s) to draft
 *
 * Usage:
 *   aioson briefing:approve .
 *   aioson briefing:approve . --slug=briefing-agent
 *   aioson briefing:unapprove .
 *   aioson briefing:unapprove . --slug=briefing-agent
 *
 * Config file: .aioson/briefings/config.md
 * Format: YAML frontmatter (briefings: array) + Markdown table
 */

const path = require('node:path');
const readline = require('node:readline');
const {
  configPath: registryConfigPath,
  readBriefingRegistry,
  writeBriefingRegistry
} = require('../lib/briefing-refiner/briefing-registry');

// ─── Interactive prompt helpers ───────────────────────────────────────────────

/**
 * Show a numbered list and ask user to pick one by number.
 * Returns the 0-based index of the selected item, or -1 on cancel.
 */
function promptSelect(items, promptText) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

    process.stdout.write('\n');
    items.forEach((item, i) => {
      process.stdout.write(`  ${i + 1}. ${item}\n`);
    });
    process.stdout.write('\n');

    rl.question(`${promptText} `, (answer) => {
      rl.close();
      const num = parseInt(answer.trim(), 10);
      if (!answer.trim() || isNaN(num) || num < 1 || num > items.length) {
        resolve(-1);
      } else {
        resolve(num - 1);
      }
    });
  });
}

/**
 * Show a numbered list (all selected by default) and ask user to type
 * comma-separated numbers to DESELECT. Returns indices to deselect.
 */
function promptCheckboxDeselect(items, promptText) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

    process.stdout.write('\n');
    items.forEach((item, i) => {
      process.stdout.write(`  [${i + 1}] ${item}\n`);
    });
    process.stdout.write('\n');

    rl.question(`${promptText} `, (answer) => {
      rl.close();
      if (!answer.trim()) {
        resolve([]);
        return;
      }
      const indices = answer
        .split(',')
        .map((s) => parseInt(s.trim(), 10) - 1)
        .filter((n) => !isNaN(n) && n >= 0 && n < items.length);
      resolve(indices);
    });
  });
}

// ─── briefing:approve ─────────────────────────────────────────────────────────

async function runBriefingApprove({ args, options = {}, logger }) {
  const projectDir = path.resolve(process.cwd(), args[0] || '.');
  const slugOpt = String(options.slug || '').trim() || null;
  const configFile = registryConfigPath(projectDir);

  // ── Read config ────────────────────────────────────────────────────────────
  let data;
  try {
    data = await readBriefingRegistry(projectDir);
  } catch (error) {
    if (error && error.code === 'invalid_frontmatter') {
      logger.error('config.md com frontmatter inválido. Verifique o arquivo manualmente.');
      return { ok: false, error: 'invalid_frontmatter' };
    }
    logger.error('Nenhum briefing encontrado. Ative @briefing para criar o primeiro briefing.');
    return { ok: false, error: 'no_config' };
  }

  const drafts = data.briefings.filter((b) => b.status === 'draft');

  if (drafts.length === 0) {
    logger.log('Nenhum briefing aguardando aprovação.');
    return { ok: true, approved: null };
  }

  // ── Select briefing ────────────────────────────────────────────────────────
  let target;

  if (slugOpt) {
    target = drafts.find((b) => b.slug === slugOpt);
    if (!target) {
      logger.error(`Briefing "${slugOpt}" não encontrado ou não está em status draft.`);
      logger.log(`Briefings draft disponíveis: ${drafts.map((b) => b.slug).join(', ')}`);
      return { ok: false, error: 'slug_not_found' };
    }
  } else {
    const labels = drafts.map((b) => `${b.slug} — criado em ${b.created_at || '?'}`);
    logger.log('Briefings aguardando aprovação:');
    const idx = await promptSelect(labels, 'Digite o número do briefing para aprovar (Enter = cancelar):');

    if (idx === -1) {
      logger.log('Operação cancelada.');
      return { ok: true, approved: null };
    }
    target = drafts[idx];
  }

  // ── Approve ────────────────────────────────────────────────────────────────
  const today = new Date().toISOString().slice(0, 10);

  const briefingEntry = data.briefings.find((b) => b.slug === target.slug);
  briefingEntry.status = 'approved';
  briefingEntry.approved_at = today;
  data.updated_at = today;

  await writeBriefingRegistry(projectDir, data);

  logger.log(`✓ Briefing "${target.slug}" aprovado.`);
  logger.log('  Ative @product para gerar o PRD — ele detectará o briefing aprovado automaticamente.');

  return { ok: true, approved: target.slug };
}

// ─── briefing:unapprove ───────────────────────────────────────────────────────

async function runBriefingUnapprove({ args, options = {}, logger }) {
  const projectDir = path.resolve(process.cwd(), args[0] || '.');
  const slugOpt = String(options.slug || '').trim() || null;
  const configFile = registryConfigPath(projectDir);

  // ── Read config ────────────────────────────────────────────────────────────
  let data;
  try {
    data = await readBriefingRegistry(projectDir);
  } catch (error) {
    if (error && error.code === 'invalid_frontmatter') {
      logger.error('config.md com frontmatter inválido. Verifique o arquivo manualmente.');
      return { ok: false, error: 'invalid_frontmatter' };
    }
    logger.error('Nenhum briefing encontrado. Ative @briefing para criar o primeiro briefing.');
    return { ok: false, error: 'no_config' };
  }

  // Only approved and non-implemented briefings can be unapproved
  const approveds = data.briefings.filter((b) => b.status === 'approved');

  if (approveds.length === 0) {
    logger.log('Nenhum briefing aprovado disponível para retornar a draft.');
    return { ok: true, unapproved: [] };
  }

  // ── Select briefings to unapprove ──────────────────────────────────────────
  let targets;

  if (slugOpt) {
    const found = approveds.find((b) => b.slug === slugOpt);
    if (!found) {
      logger.error(`Briefing "${slugOpt}" não encontrado ou não está em status approved.`);
      logger.log(`Briefings approved disponíveis: ${approveds.map((b) => b.slug).join(', ')}`);
      return { ok: false, error: 'slug_not_found' };
    }
    targets = [found];
  } else {
    const labels = approveds.map((b) => `${b.slug} — aprovado em ${b.approved_at || '?'}`);
    logger.log('Briefings aprovados (todos marcados). Digite os números para DESMARCAR:');
    const toDeselect = await promptCheckboxDeselect(
      labels,
      'Números para retornar a draft (vírgula-separados, Enter = sem mudanças):'
    );

    if (toDeselect.length === 0) {
      logger.log('Nenhuma mudança aplicada.');
      return { ok: true, unapproved: [] };
    }
    targets = toDeselect.map((i) => approveds[i]);
  }

  // ── Unapprove ──────────────────────────────────────────────────────────────
  const today = new Date().toISOString().slice(0, 10);

  for (const target of targets) {
    const entry = data.briefings.find((b) => b.slug === target.slug);
    entry.status = 'draft';
    entry.approved_at = null;
  }
  data.updated_at = today;

  await writeBriefingRegistry(projectDir, data);

  const names = targets.map((b) => b.slug);
  logger.log(`✓ ${names.length === 1 ? `Briefing "${names[0]}" retornado` : `Briefings retornados`} para draft: ${names.join(', ')}`);

  return { ok: true, unapproved: names };
}

module.exports = { runBriefingApprove, runBriefingUnapprove };
