'use strict';

const root = document.documentElement;
const themeToggle = document.getElementById('theme-toggle');
const themeKey = 'aioson-orchestration-theme';
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
  try { localStorage.setItem(themeKey, root.dataset.theme); } catch { /* Theme works without storage. */ }
});

// A deterministic teaching model. It never calls the execution API or a host.
const definitions = [
  { id: 'api', name: 'API', needs: [] },
  { id: 'screen', name: 'Tela', needs: [] },
  { id: 'notify', name: 'Notificações', needs: [] },
  { id: 'connect', name: 'Integração', needs: ['api', 'screen'] },
  { id: 'verify', name: 'Integração / DEV + QA final', needs: ['connect', 'notify'] }
];
const capacityInput = document.getElementById('sim-capacity');
const reworkInput = document.getElementById('sim-rework');
const nextButton = document.getElementById('sim-next');
let units = [];
let tick = 0;
function resetSimulation() {
  units = definitions.map(unit => ({ ...unit, stage: 'pending', remaining: 0, repaired: false }));
  tick = 0;
  nextButton.disabled = false;
  nextButton.textContent = 'Iniciar exemplo';
  renderSimulation('Mude as vagas e avance. API, tela e notificações não dependem umas das outras neste plano.');
}
function renderSimulation(message) {
  const labels = { dev: 'DEV trabalhando', qa: 'QA revisando', repair: 'DEV corrigindo', done: 'DEV + QA aprovados' };
  for (const unit of units) {
    const row = document.querySelector(`[data-unit="${unit.id}"]`);
    row.dataset.stage = unit.stage;
    row.querySelector('output').textContent = labels[unit.stage] || (unit.needs.some(id => units.find(item => item.id === id).stage !== 'done') ? 'Aguardando dependências' : 'Pronta para uma vaga');
  }
  const active = units.filter(unit => ['dev', 'qa', 'repair'].includes(unit.stage)).length;
  document.getElementById('sim-step').textContent = `Passo ${tick} · ${active}/${capacityInput.value} vagas`;
  document.getElementById('sim-summary').textContent = message;
}
function advanceSimulation() {
  tick += 1;
  const events = [];
  for (const unit of units) {
    if (!['dev', 'qa', 'repair'].includes(unit.stage)) continue;
    unit.remaining -= 1;
    if (unit.remaining > 0) continue;
    if (unit.stage === 'qa') {
      if (unit.id === 'screen' && reworkInput.checked && !unit.repaired) {
        unit.stage = 'repair';
        unit.repaired = true;
        unit.remaining = 2;
        events.push('QA reprovou a tela. O DEV recebeu os achados e vai corrigir antes de um novo QA.');
      } else {
        unit.stage = 'done';
        events.push(`${unit.name}: DEV + QA aprovados.`);
      }
    } else {
      unit.stage = 'qa';
      unit.remaining = 1;
      events.push(`${unit.name}: implementação enviada ao QA.`);
    }
  }
  let available = Number(capacityInput.value) - units.filter(unit => ['dev', 'qa', 'repair'].includes(unit.stage)).length;
  for (const unit of units) {
    if (available <= 0) break;
    if (unit.stage !== 'pending' || unit.needs.some(id => units.find(item => item.id === id).stage !== 'done')) continue;
    unit.stage = 'dev';
    unit.remaining = 2;
    available -= 1;
    events.push(`${unit.name} começou${unit.id === 'notify' ? ': a fase 3 já pode trabalhar sem esperar a integração da fase 2' : ''}.`);
  }
  const complete = units.every(unit => unit.stage === 'done');
  nextButton.disabled = complete;
  nextButton.textContent = complete ? 'Exemplo concluído' : 'Avançar um passo';
  renderSimulation(complete ? 'Todas as unidades do exemplo passaram. Em um projeto real, confira também o QA final e a política de fechamento da feature.' : events.join(' ') || 'Os agentes continuam trabalhando dentro das vagas disponíveis.');
}
document.getElementById('sim-controls').hidden = false;
nextButton.addEventListener('click', advanceSimulation);
document.getElementById('sim-reset').addEventListener('click', resetSimulation);
capacityInput.addEventListener('change', resetSimulation);
reworkInput.addEventListener('change', resetSimulation);
resetSimulation();

const projectInput = document.getElementById('project-path');
const featureInput = document.getElementById('feature-slug');
const validation = document.getElementById('command-validation');
const copyButtons = [...document.querySelectorAll('[data-copy]')];
const commandIds = ['prepare-command', 'run-command', 'dashboard-command', 'watch-command'];
function updateCommands() {
  const project = projectInput.value.trim();
  const feature = featureInput.value.trim();
  const valid = project.length > 0 && !/[\r\n\0]/.test(project) && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(feature) && feature.length <= 80;
  validation.dataset.invalid = String(!valid);
  featureInput.setAttribute('aria-invalid', String(!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(feature) || feature.length > 80));
  projectInput.setAttribute('aria-invalid', String(!project || /[\r\n\0]/.test(project)));
  copyButtons.forEach(button => { button.disabled = !valid; });
  if (!valid) {
    validation.textContent = 'Informe uma pasta em uma linha e uma feature com letras minúsculas, números e hífens (até 80 caracteres).';
    commandIds.forEach(id => { document.getElementById(id).textContent = 'Preencha os campos acima para preparar este comando.'; });
    return;
  }
  // Single-quoted PowerShell literals prevent interpolation of paths as code.
  const quoted = project === '.' ? '.' : `'${project.replace(/'/g, "''")}'`;
  const command = (verb, suffix = '') => `aioson execution:${verb} ${quoted} --feature=${feature}${suffix}`;
  document.getElementById('prepare-command').textContent = [`aioson context:validate ${quoted} --json`, command('offer'), command('compile'), command('run', ' --preflight')].join('\n');
  document.getElementById('run-command').textContent = command('run', ' --until-complete');
  document.getElementById('dashboard-command').textContent = command('dashboard');
  document.getElementById('watch-command').textContent = command('status', ' --watch');
  validation.textContent = 'Comandos para PowerShell. Copiar não executa nem altera o projeto.';
}
projectInput.addEventListener('input', updateCommands);
featureInput.addEventListener('input', updateCommands);
copyButtons.forEach(button => {
  button.hidden = false;
  button.addEventListener('click', async () => {
    const code = document.getElementById(button.dataset.copy);
    const status = document.getElementById('copy-status');
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable');
      await navigator.clipboard.writeText(code.textContent);
      status.textContent = 'Comando copiado. Cole no terminal do projeto quando estiver pronto.';
    } catch {
      const range = document.createRange();
      range.selectNodeContents(code);
      const selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
      status.textContent = 'Texto selecionado. Use Ctrl+C (ou Cmd+C) para copiar.';
    }
  });
});
updateCommands();

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
  if (closedDetails !== null) return;
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
