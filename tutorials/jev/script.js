'use strict';

const root = document.documentElement;
const themeToggle = document.getElementById('theme-toggle');
const themeKey = 'aioson-jev-theme';

function applyTheme(value) {
  const light = value === 'light';
  root.dataset.theme = light ? 'light' : 'dark';
  themeToggle.textContent = light ? 'Tema: Porcelana' : 'Tema: Tinta';
  themeToggle.setAttribute('aria-pressed', String(light));
}

try { applyTheme(localStorage.getItem(themeKey)); } catch { applyTheme('dark'); }
themeToggle.hidden = false;
themeToggle.addEventListener('click', () => {
  applyTheme(root.dataset.theme === 'light' ? 'dark' : 'light');
  try { localStorage.setItem(themeKey, root.dataset.theme); } catch { /* Theme remains functional without storage. */ }
});

const routeButtons = [...document.querySelectorAll('[data-route]')];
const routePanels = [...document.querySelectorAll('[data-route-panel]')];
routeButtons.forEach(button => button.addEventListener('click', () => {
  routeButtons.forEach(item => item.setAttribute('aria-pressed', String(item === button)));
  routePanels.forEach(panel => { panel.hidden = panel.dataset.routePanel !== button.dataset.route; });
}));

const templates = {
  raw: id => ({
    version: 1,
    id,
    state: { ticket: 'Checkout becomes blank after clicking Pay.' },
    questions: {
      is_bug: { type: 'noul', instructions: 'Is `ticket` reporting broken software behavior?' },
      urgency: { type: 'score', instructions: 'How urgent is `ticket`?', criteria: ['Can wait', 'Fix soon', 'Revenue blocking'] }
    },
    decision: { type: 'raw' }
  }),
  gate: id => ({
    version: 1,
    id,
    state: { intent: 'Premium editorial landing page', measured: { craft_precision: 78 }, review: 'Strong hierarchy; generic hero image.' },
    questions: {
      premium_fit: { type: 'noul', instructions: 'Does the execution meet `intent` without reading like a generic template?' },
      craft: { type: 'score', instructions: 'Rate craft from `measured` and `review`.', criteria: ['Broken', 'Ordinary', 'Polished', 'Distinctive premium'] }
    },
    decision: {
      type: 'gate', mode: 'all',
      rules: [
        { question: 'premium_fit', metric: 'noul', op: 'gte', value: 0.75 },
        { question: 'craft', metric: 'score', op: 'gte', value: 2.25 },
        { question: 'craft', metric: 'confidence', op: 'gte', value: 0.5 }
      ],
      on_pass: 'accept', on_fail: 'refine'
    }
  }),
  select: id => ({
    version: 1,
    id,
    state: { request: 'Create three genuinely different visual directions.' },
    questions: {
      route: {
        type: 'choice', instructions: 'Which route best matches `request`?',
        criteria: { dev: 'Specified implementation', ux_ui: 'One bounded visual decision', exploration: 'Compare multiple directions' }
      }
    },
    decision: { type: 'select', question: 'route', min_confidence: 0.55, min_probability: 0.55, on_uncertain: 'human_review' }
  }),
  rank: id => ({
    version: 1,
    id,
    state: { brief: 'Quiet premium editorial commerce', candidates: { a: 'Asymmetric typographic grid', b: 'Generic blue SaaS hero', c: 'Warm photographic ritual' } },
    questions: {
      candidate_a: { type: 'score', instructions: 'How well does `candidates.a` satisfy `brief`?', criteria: ['Contradicts', 'Weak', 'Good', 'Exceptional'] },
      candidate_b: { type: 'score', instructions: 'How well does `candidates.b` satisfy `brief`?', criteria: ['Contradicts', 'Weak', 'Good', 'Exceptional'] },
      candidate_c: { type: 'score', instructions: 'How well does `candidates.c` satisfy `brief`?', criteria: ['Contradicts', 'Weak', 'Good', 'Exceptional'] }
    },
    decision: { type: 'rank', questions: ['candidate_a', 'candidate_b', 'candidate_c'], metric: 'score', direction: 'desc' }
  })
};

const modeSelect = document.getElementById('mode-select');
const idInput = document.getElementById('judgment-id');
const jsonOutput = document.getElementById('builder-json');
const commandOutput = document.getElementById('builder-command');
const validation = document.getElementById('builder-validation');
const copyJson = document.getElementById('copy-json');
const copyCommand = document.getElementById('copy-command');
const copyStatus = document.getElementById('copy-status');

function validId(value) {
  return /^[a-z0-9][a-z0-9_.-]{0,79}$/.test(value);
}

function updateBuilder() {
  const id = idInput.value.trim();
  const valid = validId(id);
  validation.dataset.invalid = String(!valid);
  idInput.setAttribute('aria-invalid', String(!valid));
  copyJson.disabled = !valid;
  copyCommand.disabled = !valid;
  if (!valid) {
    validation.textContent = 'Use 1–80 caracteres: letras minúsculas, números, ponto, hífen ou sublinhado.';
    jsonOutput.textContent = '{}';
    commandOutput.textContent = 'Corrija o nome para gerar o comando.';
    return;
  }
  const spec = templates[modeSelect.value](id);
  jsonOutput.textContent = JSON.stringify(spec, null, 2);
  commandOutput.textContent = `aioson jev:judge . --file=${id}.json --dry-run --json\naioson jev:judge . --file=${id}.json --out=${id}.result.json --json`;
  validation.textContent = 'Arquivo pronto para copiar. Salve-o na raiz ou em uma pasta do projeto.';
}

async function copyText(text, success) {
  try {
    if (!navigator.clipboard?.writeText) throw new Error('clipboard unavailable');
    await navigator.clipboard.writeText(text);
    copyStatus.textContent = success;
  } catch {
    copyStatus.textContent = 'A cópia automática não está disponível. Selecione o bloco e use Ctrl+C.';
  }
}

copyJson.hidden = false;
copyCommand.hidden = false;
copyJson.addEventListener('click', () => copyText(jsonOutput.textContent, 'JSON copiado. Salve com o nome mostrado no comando.'));
copyCommand.addEventListener('click', () => copyText(commandOutput.textContent, 'Comandos copiados. Cole no terminal do projeto.'));
modeSelect.addEventListener('change', updateBuilder);
idInput.addEventListener('input', updateBuilder);
updateBuilder();

const links = [...document.querySelectorAll('.sidebar a[href^="#"]')];
if ('IntersectionObserver' in window) {
  const observer = new IntersectionObserver(entries => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      links.forEach(link => {
        if (link.hash === `#${entry.target.id}`) link.setAttribute('aria-current', 'location');
        else link.removeAttribute('aria-current');
      });
    }
  }, { rootMargin: '-15% 0px -65% 0px' });
  document.querySelectorAll('.article > section').forEach(section => observer.observe(section));
}

let closedDetails = null;
window.addEventListener('beforeprint', () => {
  closedDetails = [...document.querySelectorAll('details:not([open])')];
  closedDetails.forEach(detail => { detail.open = true; });
});
window.addEventListener('afterprint', () => {
  closedDetails?.forEach(detail => { detail.open = false; });
  closedDetails = null;
});
const printButton = document.getElementById('print-page');
printButton.hidden = false;
printButton.addEventListener('click', () => window.print());
