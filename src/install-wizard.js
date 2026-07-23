'use strict';

const readline = require('node:readline');
const { getCliVersionSync } = require('./version');

const TOOLS = [
  { id: 'claude',    label: 'Claude Code',    desc: 'Slash commands, CLAUDE.md, .claude/' },
  { id: 'codex',    label: 'Codex (OpenAI)', desc: 'AGENTS.md protocol' },
  { id: 'opencode', label: 'OpenCode',       desc: 'OPENCODE.md protocol' }
];

const USES = [
  {
    id: 'development',
    label: 'Development',
    desc: 'Agent workflow: setup → product → planner → dev → qa',
    locked: true
  },
  {
    id: 'squads',
    label: 'Squads',
    desc: 'Create and run AI squads (squad, genome, orache, profiler)',
    locked: false
  }
];

const DESIGNS = [
  { id: 'none',                     label: 'None',                     desc: 'No design system installed' },
  { id: 'clean-saas-ui',            label: 'Clean SaaS UI',            desc: 'Minimal, functional — dashboards & tools' },
  { id: 'aurora-command-ui',        label: 'Aurora Command UI',        desc: 'Dark, glowing — command centers & apps' },
  { id: 'cognitive-core-ui',        label: 'Cognitive Core UI',        desc: 'Information-dense — data & analytics' },
  { id: 'bold-editorial-ui',        label: 'Bold Editorial UI',        desc: 'High contrast typography — content sites' },
  { id: 'warm-craft-ui',            label: 'Warm Craft UI',            desc: 'Warm tones, organic — consumer & lifestyle' },
  { id: 'glassmorphism-ui',         label: 'Glassmorphism UI',         desc: 'Translucent layers — immersive interfaces' },
  { id: 'neo-brutalist-ui',         label: 'Neo-Brutalist UI',         desc: 'Raw, high-contrast — bold statements' },
  { id: 'premium-command-center-ui',label: 'Premium Command Center UI',desc: 'Enterprise-grade — ops & monitoring' },
  { id: 'interface-design',         label: 'Interface Design',         desc: 'Foundational system — general purpose' }
];

const LOCALES = [
  { id: 'en',    label: 'English',            flag: '🇺🇸' },
  { id: 'pt-BR', label: 'Português (Brasil)', flag: '🇧🇷' },
  { id: 'es',    label: 'Español',            flag: '🇪🇸' },
  { id: 'fr',    label: 'Français',           flag: '🇫🇷' }
];

const BANNER_ART = [
  '█████╗ ██╗ ██████╗ ███████╗ ██████╗ ███╗   ██╗',
  '██╔══██╗██║██╔═══██╗██╔════╝██╔═══██╗████╗  ██║',
  '███████║██║██║   ██║███████╗██║   ██║██╔██╗ ██║',
  '██╔══██║██║██║   ██║╚════██║██║   ██║██║╚██╗██║',
  '██║  ██║██║╚██████╔╝███████║╚██████╔╝██║ ╚████║',
  '╚═╝  ╚═╝╚═╝ ╚═════╝ ╚══════╝ ╚═════╝ ╚═╝  ╚═══╝'
];

function getBanner(version, stdout) {
  const cols = (stdout && stdout.columns) || 80;
  const noColor = process.env.NO_COLOR !== undefined;
  const dumb = process.env.TERM === 'dumb';

  if (dumb || cols < 60) {
    return `AIOSON v${version}\n\n`;
  }

  const cyan   = noColor ? '' : '\x1b[1;36m';
  const border = noColor ? '' : '\x1b[36m';
  const dim    = noColor ? '' : '\x1b[90m';
  const reset  = noColor ? '' : '\x1b[0m';

  const artWidth = Math.max(...BANNER_ART.map(r => r.length));
  const sidePad  = 3;
  const inner    = artWidth + sidePad * 2;
  const dashes   = '─'.repeat(inner);

  function centered(content, visibleLen) {
    const left  = Math.floor((inner - visibleLen) / 2);
    const right = inner - left - visibleLen;
    return `  ${border}│${reset}${' '.repeat(left)}${content}${' '.repeat(right)}${border}│${reset}`;
  }

  const emptyRow = `  ${border}│${reset}${' '.repeat(inner)}${border}│${reset}`;
  const tagline  = `AI Operating Framework  v${version}`;

  return [
    `  ${border}╭${dashes}╮${reset}`,
    emptyRow,
    ...BANNER_ART.map(row => {
      const left  = Math.floor((inner - row.length) / 2);
      const right = inner - left - row.length;
      return `  ${border}│${reset}${' '.repeat(left)}${cyan}${row}${reset}${' '.repeat(right)}${border}│${reset}`;
    }),
    emptyRow,
    centered(`${dim}${tagline}${reset}`, tagline.length),
    emptyRow,
    `  ${border}╰${dashes}╯${reset}`,
    ''
  ].join('\n') + '\n';
}

function header(screen, total, stdout) {
  stdout.write('\x1Bc');
  stdout.write(getBanner(getCliVersionSync(), stdout));
  stdout.write(`  AIOSON — Installation Wizard  (${screen}/${total})\n\n`);
}

function renderScreen1(cursor, selected, warn, stdout) {
  header(1, 4, stdout);
  stdout.write('  Which AI tools will you use in this project?\n');
  stdout.write('  (↑/↓ to move, space to select, enter to continue)\n\n');
  for (let i = 0; i < TOOLS.length; i++) {
    const tool    = TOOLS[i];
    const pointer = i === cursor ? '►' : ' ';
    const check   = selected.has(tool.id) ? '✓' : ' ';
    stdout.write(`  ${pointer} [${check}] ${tool.label.padEnd(20)} ${tool.desc}\n`);
  }
  if (warn) stdout.write('\n  ⚠  Select at least one tool to continue.\n');
  stdout.write('\n');
}

function renderScreen2(cursor, selected, warn, stdout) {
  header(2, 4, stdout);
  stdout.write('  What will you do with AIOSON?\n');
  stdout.write('  (space to select, enter to continue)\n\n');
  for (let i = 0; i < USES.length; i++) {
    const use     = USES[i];
    const pointer = i === cursor ? '►' : ' ';
    const check   = selected.has(use.id) ? '✓' : ' ';
    const lock    = use.locked ? ' (always on)' : '';
    stdout.write(`  ${pointer} [${check}] ${use.label}${lock}\n`);
    stdout.write(`         ${use.desc}\n`);
  }
  if (warn) stdout.write('\n  ⚠  Select at least one use to continue.\n');
  stdout.write('\n');
}

function renderScreen3(cursor, selected, warn, stdout) {
  header(3, 4, stdout);
  stdout.write('  Which design system? (optional — select multiple)\n');
  stdout.write('  (↑/↓ to move, space to toggle, enter to continue)\n\n');
  for (let i = 0; i < DESIGNS.length; i++) {
    const d       = DESIGNS[i];
    const pointer = i === cursor ? '►' : ' ';
    const check   = selected.has(d.id) ? '✓' : ' ';
    stdout.write(`  ${pointer} [${check}] ${d.label.padEnd(28)} ${d.desc}\n`);
  }
  if (warn) stdout.write('\n  ⚠  Select "None" or at least one design skill.\n');
  stdout.write('\n');
}

function renderScreen4(cursor, stdout) {
  header(4, 4, stdout);
  stdout.write('  Which language for agents?\n');
  stdout.write('  (↑/↓ to move, enter to select)\n\n');
  for (let i = 0; i < LOCALES.length; i++) {
    const loc     = LOCALES[i];
    const pointer = i === cursor ? '►' : ' ';
    const bullet  = i === cursor ? '◉' : '○';
    stdout.write(`  ${pointer} ${bullet}  ${loc.flag}  ${loc.label}\n`);
  }
  stdout.write('\n');
}

function renderConfirm(tools, uses, design, locale, existingProfile, t, stdout) {
  const TOOL_NAMES = { claude: 'Claude Code', codex: 'Codex', opencode: 'OpenCode' };
  const toolNames  = tools.map(id => TOOL_NAMES[id] || id).join(', ');
  const modeLabel  = uses.includes('squads') ? 'Development + Squads' : 'Development';
  // design can be string (single/id/all) or string[] (multiple)
  const designList = Array.isArray(design)
    ? design.map(id => DESIGNS.find(d => d.id === id)?.label || id)
    : [DESIGNS.find(d => d.id === design)?.label || design];
  const designLabel = designList.join(', ');
  const localeName = LOCALES.find(l => l.id === locale)?.label || locale;

  stdout.write('\x1Bc');
  stdout.write(`  ${t('install_wizard.ready_to_install')}\n\n`);
  stdout.write(`    Tools   →  ${toolNames}\n`);
  stdout.write(`    Mode    →  ${modeLabel}\n`);
  stdout.write(`    Design  →  ${designLabel}\n`);
  stdout.write(`    Locale  →  ${localeName}\n\n`);

  // Warn if reconfigure has deselected items (we don't auto-remove files)
  if (existingProfile) {
    const prevTools = new Set(Array.isArray(existingProfile.tools) ? existingProfile.tools : [existingProfile.tools]);
    const prevDesign = new Set(Array.isArray(existingProfile.design) ? existingProfile.design : [existingProfile.design]);
    const currTools = new Set(tools);
    const currDesign = new Set(Array.isArray(design) ? design : [design]);

    const removedTools = [...prevTools].filter(t => !currTools.has(t) && t !== 'none');
    const removedDesign = [...prevDesign].filter(d => !currDesign.has(d) && d !== 'none' && d !== 'all');

    if (removedTools.length > 0 || removedDesign.length > 0) {
      stdout.write(`  ${t('install_wizard.deselected_warning')}\n`);
      stdout.write(`${t('install_wizard.deselected_hint')}\n\n`);
    }
  }

  stdout.write(`  ${t('install_wizard.press_enter_to_install')}\n\n`);
}

function makeRawSession(io) {
  const stdin    = io.stdin || process.stdin;
  const wasRaw   = Boolean(stdin.isRaw);
  const wasPaused = typeof stdin.isPaused === 'function' ? stdin.isPaused() : true;

  readline.emitKeypressEvents(stdin);
  if (typeof stdin.setRawMode === 'function') stdin.setRawMode(true);
  if (typeof stdin.resume === 'function') stdin.resume();

  function cleanupListeners(onKeypress) {
    stdin.removeListener('keypress', onKeypress);
    if (stdin.listenerCount('keypress') === 0 && stdin.listenerCount('data') > 0) {
      stdin.emit('data', Buffer.alloc(0));
    }
    if (typeof stdin.setRawMode === 'function') stdin.setRawMode(wasRaw);
    if (wasPaused && typeof stdin.pause === 'function') stdin.pause();
  }

  return { stdin, cleanupListeners };
}

// Generic multi-select prompt (checkbox)
async function promptCheckbox({ items, defaultSelected, lockFirst, render, io = {} }) {
  const stdout   = io.stdout || process.stdout;
  const { stdin, cleanupListeners } = makeRawSession(io);
  let cursor     = 0;
  const selected = new Set(defaultSelected);
  let warn       = false;

  render(cursor, selected, warn, stdout);

  return new Promise((resolve) => {
    let cleanedUp = false;
    function cleanup() {
      if (cleanedUp) return;
      cleanedUp = true;
      cleanupListeners(onKeypress);
    }
    function onKeypress(_str, key) {
      if (!key) return;
      if ((key.ctrl && key.name === 'c') || key.name === 'q') { cleanup(); resolve(null); return; }
      if (key.name === 'up')   { cursor = cursor === 0 ? items.length - 1 : cursor - 1; render(cursor, selected, warn, stdout); return; }
      if (key.name === 'down') { cursor = cursor === items.length - 1 ? 0 : cursor + 1; render(cursor, selected, warn, stdout); return; }
      if (key.name === 'space') {
        const item = items[cursor];
        if (lockFirst && item.locked) return;
        if (selected.has(item.id)) selected.delete(item.id);
        else selected.add(item.id);
        warn = false;
        render(cursor, selected, warn, stdout);
        return;
      }
      if (key.name === 'return') {
        if (selected.size === 0) { warn = true; render(cursor, selected, warn, stdout); return; }
        cleanup();
        resolve([...selected]);
      }
    }
    stdin.on('keypress', onKeypress);
  });
}

// Generic single-select prompt (radio)
async function promptRadio({ items, defaultIndex, render, io = {} }) {
  const stdout = io.stdout || process.stdout;
  const { stdin, cleanupListeners } = makeRawSession(io);
  let cursor = defaultIndex || 0;

  render(cursor, stdout);

  return new Promise((resolve) => {
    let cleanedUp = false;
    function cleanup() {
      if (cleanedUp) return;
      cleanedUp = true;
      cleanupListeners(onKeypress);
    }
    function onKeypress(_str, key) {
      if (!key) return;
      if ((key.ctrl && key.name === 'c') || key.name === 'q') { cleanup(); resolve(null); return; }
      if (key.name === 'up')   { cursor = cursor === 0 ? items.length - 1 : cursor - 1; render(cursor, stdout); return; }
      if (key.name === 'down') { cursor = cursor === items.length - 1 ? 0 : cursor + 1; render(cursor, stdout); return; }
      if (key.name === 'return') { cleanup(); resolve(items[cursor].id); }
    }
    stdin.on('keypress', onKeypress);
  });
}

// Multi-select with exclusive option: when 'noneId' is selected it clears all others;
// when any other is selected it clears 'noneId'.
async function promptDesignCheckbox({ items, noneId, defaultSelected, render, io = {} }) {
  const stdout   = io.stdout || process.stdout;
  const { stdin, cleanupListeners } = makeRawSession(io);
  let cursor     = 0;
  const selected = new Set(defaultSelected);
  let warn       = false;

  render(cursor, selected, warn, stdout);

  return new Promise((resolve) => {
    let cleanedUp = false;
    function cleanup() {
      if (cleanedUp) return;
      cleanedUp = true;
      cleanupListeners(onKeypress);
    }
    function onKeypress(_str, key) {
      if (!key) return;
      if ((key.ctrl && key.name === 'c') || key.name === 'q') { cleanup(); resolve(null); return; }
      if (key.name === 'up')   { cursor = cursor === 0 ? items.length - 1 : cursor - 1; render(cursor, selected, warn, stdout); return; }
      if (key.name === 'down') { cursor = cursor === items.length - 1 ? 0 : cursor + 1; render(cursor, selected, warn, stdout); return; }
      if (key.name === 'space') {
        const item = items[cursor];
        if (item.id === noneId) {
          // Exclusive: selecting 'none' clears everything else
          selected.clear();
          selected.add(noneId);
        } else {
          // Selecting any other clears 'none'
          selected.delete(noneId);
          if (selected.has(item.id)) selected.delete(item.id);
          else selected.add(item.id);
        }
        warn = false;
        render(cursor, selected, warn, stdout);
        return;
      }
      if (key.name === 'return') {
        if (selected.size === 0) { warn = true; render(cursor, selected, warn, stdout); return; }
        cleanup();
        resolve([...selected]);
      }
    }
    stdin.on('keypress', onKeypress);
  });
}

async function promptConfirmScreen(tools, uses, design, locale, existingProfile, t, io = {}) {
  const stdout = io.stdout || process.stdout;
  const { stdin, cleanupListeners } = makeRawSession(io);

  renderConfirm(tools, uses, design, locale, existingProfile, t, stdout);

  return new Promise((resolve) => {
    let cleanedUp = false;
    function cleanup() {
      if (cleanedUp) return;
      cleanedUp = true;
      cleanupListeners(onKeypress);
    }
    function onKeypress(_str, key) {
      if (!key) return;
      if ((key.ctrl && key.name === 'c') || key.name === 'q') { cleanup(); resolve(false); return; }
      if (key.name === 'return') { cleanup(); resolve(true); }
    }
    stdin.on('keypress', onKeypress);
  });
}

/**
 * Runs the interactive install wizard.
 * Returns { tools, uses, design, locale } or null (cancelled / non-TTY / --no-interactive).
 * @param {object} options
 * @param {object} [options.existingProfile] - Pre-existing profile to pre-select in wizard
 * @param {function} [options.t] - Translator function for i18n strings
 */
async function runInstallWizard(options = {}, io = {}) {
  const stdin  = io.stdin || process.stdin;
  const stdout = io.stdout || process.stdout;
  const existingProfile = options.existingProfile || null;
  const t = options.t || ((key) => key);

  if (!stdin.isTTY || !stdout.isTTY) return null;
  if (options.noInteractive) return null;

  function finalCleanup() {
    if (stdin === process.stdin) {
      if (typeof stdin.setRawMode === 'function') stdin.setRawMode(false);
      stdin.pause();
      if (typeof stdin.unref === 'function') stdin.unref();
    }
  }

  // Derive defaults from existing profile (supports both string and array design)
  const defaultTools = existingProfile
    ? (Array.isArray(existingProfile.tools) ? existingProfile.tools : [existingProfile.tools])
    : ['claude'];
  const defaultUses = existingProfile
    ? (Array.isArray(existingProfile.uses) ? existingProfile.uses : [existingProfile.uses])
    : ['development'];
  const defaultDesign = existingProfile
    ? (Array.isArray(existingProfile.design)
        ? existingProfile.design
        : (existingProfile.design === 'none' || existingProfile.design === 'all'
            ? [existingProfile.design]
            : [existingProfile.design]))  // single design skill
    : ['none'];
  const defaultLocale = existingProfile
    ? (LOCALES.findIndex(l => l.id === existingProfile.locale) || 0)
    : 0;

  // Screen 1 — Tools (multi-select)
  const tools = await promptCheckbox({
    items: TOOLS,
    defaultSelected: defaultTools,
    lockFirst: false,
    render: (cursor, selected, warn, out) => renderScreen1(cursor, selected, warn, out),
    io
  });
  if (!tools) { finalCleanup(); return null; }

  // Screen 2 — Uses (multi-select, development locked)
  const uses = await promptCheckbox({
    items: USES,
    defaultSelected: defaultUses,
    lockFirst: true,
    render: (cursor, selected, warn, out) => renderScreen2(cursor, selected, warn, out),
    io
  });
  if (!uses) { finalCleanup(); return null; }

  // Screen 3 — Design (multi-select with exclusive 'none')
  const design = await promptDesignCheckbox({
    items: DESIGNS,
    noneId: 'none',
    defaultSelected: defaultDesign,
    render: (cursor, selected, warn, out) => renderScreen3(cursor, selected, warn, out),
    io
  });
  if (design === null) { finalCleanup(); return null; }

  // Screen 4 — Locale (single-select / radio)
  const locale = await promptRadio({
    items: LOCALES,
    defaultIndex: defaultLocale,
    render: (cursor, out) => renderScreen4(cursor, out),
    io
  });
  if (locale === null) { finalCleanup(); return null; }

  // Confirm screen
  const confirmed = await promptConfirmScreen(tools, uses, design, locale, existingProfile, t, io);
  if (!confirmed) { finalCleanup(); return null; }

  stdout.write('\x1Bc');
  finalCleanup();

  // Normalize design: empty array → 'none', single 'none' → 'none'
  const normalizedDesign = (design.length === 0 || (design.length === 1 && design[0] === 'none'))
    ? 'none'
    : (design.length === 1 && design[0] === 'all')
      ? 'all'
      : design;

  return { tools, uses, design: normalizedDesign, locale };
}

module.exports = {
  runInstallWizard,
  __test__: {
    renderScreen1,
    renderScreen2,
    renderScreen3,
    renderScreen4,
    renderConfirm,
    getBanner,
    TOOLS,
    USES,
    DESIGNS,
    LOCALES,
    promptCheckbox,
    promptRadio,
    promptDesignCheckbox
  }
};
