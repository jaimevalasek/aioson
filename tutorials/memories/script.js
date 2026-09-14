'use strict';

const root = document.documentElement;
const themeToggle = document.getElementById('theme-toggle');
const printButton = document.getElementById('print-page');
const themeKey = 'aioson-memories-theme';

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
  try { localStorage.setItem(themeKey, root.dataset.theme); } catch { /* The theme still works without storage. */ }
});

const modelControls = document.querySelector('.model-controls');
modelControls.hidden = false;
modelControls.addEventListener('click', (event) => {
  const button = event.target.closest('[data-model]');
  if (!button) return;
  const nextSession = button.dataset.model === 'b';
  modelControls.querySelectorAll('button').forEach((item) => item.setAttribute('aria-pressed', String(item === button)));
  document.getElementById('model-heading').textContent = nextSession ? 'Amanhã · Modelo B' : 'Hoje · Modelo A';
  document.getElementById('model-description').textContent = nextSession
    ? 'Outro agente consulta o mesmo registro e recupera o próximo passo: verificar a alteração de horário. O conhecimento continua no projeto.'
    : 'O agente lê o registro e identifica o próximo passo: verificar a alteração de horário.';
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

let collapsedBeforePrint = null;
window.addEventListener('beforeprint', () => {
  if (collapsedBeforePrint !== null) return;
  collapsedBeforePrint = [...document.querySelectorAll('details:not([open])')];
  collapsedBeforePrint.forEach((detail) => { detail.open = true; });
});
window.addEventListener('afterprint', () => {
  if (collapsedBeforePrint === null) return;
  collapsedBeforePrint.forEach((detail) => { detail.open = false; });
  collapsedBeforePrint = null;
});
printButton.hidden = false;
printButton.addEventListener('click', () => window.print());
