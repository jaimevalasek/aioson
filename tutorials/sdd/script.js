'use strict';

const root = document.documentElement;
const themeToggle = document.getElementById('theme-toggle');
const printButton = document.getElementById('print-page');
const themeKey = 'aioson-sdd-theme';

function applyTheme(theme) {
  const light = theme === 'light';
  root.dataset.theme = light ? 'light' : 'dark';
  themeToggle.textContent = light ? 'Tema: Porcelana' : 'Tema: Tinta';
  themeToggle.setAttribute('aria-pressed', String(light));
  themeToggle.setAttribute('aria-label', light ? 'Ativar tema Tinta' : 'Ativar tema Porcelana');
}

try { applyTheme(localStorage.getItem(themeKey)); } catch { applyTheme('dark'); }
themeToggle.hidden = false;
themeToggle.addEventListener('click', () => {
  applyTheme(root.dataset.theme === 'light' ? 'dark' : 'light');
  try { localStorage.setItem(themeKey, root.dataset.theme); } catch { /* Theme remains usable without storage. */ }
});

const journey = document.querySelector('.journey');
const controls = document.querySelector('.journey-controls');
const panels = [...document.querySelectorAll('[data-panel]')];

function selectStage(stage) {
  if (!panels.some((panel) => panel.dataset.panel === stage)) return;
  panels.forEach((panel) => { panel.hidden = panel.dataset.panel !== stage; });
  controls.querySelectorAll('[data-stage]').forEach((button) => {
    button.setAttribute('aria-pressed', String(button.dataset.stage === stage));
  });
}

selectStage('briefing');
controls.hidden = false;
journey.dataset.enhanced = 'true';
controls.addEventListener('click', (event) => {
  const button = event.target.closest('[data-stage]');
  if (button && controls.contains(button)) selectStage(button.dataset.stage);
});

const navigationLinks = [...document.querySelectorAll('.sidebar a[href^="#"]')];
if ('IntersectionObserver' in window) {
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      navigationLinks.forEach((link) => {
        if (link.hash === `#${entry.target.id}`) link.setAttribute('aria-current', 'location');
        else link.removeAttribute('aria-current');
      });
    });
  }, { rootMargin: '-15% 0px -65% 0px', threshold: 0 });
  document.querySelectorAll('.article > section').forEach((section) => observer.observe(section));
}

let printState = null;
window.addEventListener('beforeprint', () => {
  if (printState !== null) return;
  printState = {
    collapsed: [...document.querySelectorAll('details:not([open])')],
    hiddenPanels: panels.filter((panel) => panel.hidden)
  };
  printState.collapsed.forEach((detail) => { detail.open = true; });
  panels.forEach((panel) => { panel.hidden = false; });
});
window.addEventListener('afterprint', () => {
  if (printState === null) return;
  printState.collapsed.forEach((detail) => { detail.open = false; });
  printState.hiddenPanels.forEach((panel) => { panel.hidden = true; });
  printState = null;
});
printButton.hidden = false;
printButton.addEventListener('click', () => window.print());
