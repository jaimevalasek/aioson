'use strict';

const root = document.documentElement;
const themeToggle = document.getElementById('theme-toggle');
const themeKey = 'aioson-orquestration-jev-theme';

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

const modeButtons = [...document.querySelectorAll('[data-mode]')];
const modePanels = [...document.querySelectorAll('[data-mode-panel]')];
modeButtons.forEach(button => button.addEventListener('click', () => {
  modeButtons.forEach(item => item.setAttribute('aria-pressed', String(item === button)));
  modePanels.forEach(panel => { panel.hidden = panel.dataset.modePanel !== button.dataset.mode; });
}));

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

const printButton = document.getElementById('print-page');
printButton.hidden = false;
printButton.addEventListener('click', () => window.print());
