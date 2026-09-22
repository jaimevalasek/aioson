'use strict';

const root = document.documentElement;
const themeToggle = document.getElementById('theme-toggle');
const printButton = document.getElementById('print-page');
const themeKey = 'aioson-web-theme';

function applyTheme(theme) {
  const light = theme === 'light';
  root.dataset.theme = light ? 'light' : 'dark';
  if (!themeToggle) return;
  themeToggle.hidden = false;
  themeToggle.textContent = light ? 'Tema: Porcelana' : 'Tema: Tinta';
  themeToggle.setAttribute('aria-pressed', String(light));
  themeToggle.setAttribute('aria-label', light ? 'Ativar tema Tinta' : 'Ativar tema Porcelana');
}

try { applyTheme(localStorage.getItem(themeKey) || 'dark'); } catch { applyTheme('dark'); }

if (themeToggle) {
  themeToggle.addEventListener('click', () => {
    applyTheme(root.dataset.theme === 'light' ? 'dark' : 'light');
    try { localStorage.setItem(themeKey, root.dataset.theme); } catch { /* Theme still applies for this visit. */ }
  });
}

if (printButton) {
  printButton.hidden = false;
  printButton.addEventListener('click', () => window.print());
}

document.querySelectorAll('.command-block').forEach((block) => {
  const code = block.querySelector('code');
  if (!code) return;
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'copy-button';
  button.textContent = 'Copiar';
  button.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(code.textContent.trim());
      button.dataset.copied = 'true';
      button.textContent = 'Copiado';
    } catch {
      button.textContent = 'Selecione o texto';
    }
    window.setTimeout(() => {
      button.dataset.copied = 'false';
      button.textContent = 'Copiar';
    }, 1600);
  });
  block.append(button);
});

const navigationLinks = [...document.querySelectorAll('.sidebar a[href^="#"]')];
if ('IntersectionObserver' in window && navigationLinks.length) {
  const byId = new Map(navigationLinks.map((link) => [link.getAttribute('href').slice(1), link]));
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      navigationLinks.forEach((link) => link.removeAttribute('aria-current'));
      const current = byId.get(entry.target.id);
      if (current) current.setAttribute('aria-current', 'location');
    });
  }, { rootMargin: '-20% 0px -70% 0px' });
  navigationLinks.forEach((link) => {
    const section = document.getElementById(link.getAttribute('href').slice(1));
    if (section) observer.observe(section);
  });
}
