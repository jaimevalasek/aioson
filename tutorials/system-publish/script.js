'use strict';

const root = document.documentElement;
const themeToggle = document.getElementById('theme-toggle');
const printButton = document.getElementById('print-page');
const copyStatus = document.getElementById('copy-status');
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
  try { localStorage.setItem(themeKey, root.dataset.theme); } catch { /* Theme works without storage. */ }
});

printButton.hidden = false;
printButton.addEventListener('click', () => window.print());

if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
  document.querySelectorAll('[data-copy-block]').forEach((block) => {
    const button = block.querySelector('.copy-button');
    const code = block.querySelector('pre code');
    button.hidden = false;
    button.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(code.textContent.trim());
        button.textContent = 'Copiado!';
        copyStatus.textContent = 'Comando copiado para a área de transferência.';
        window.setTimeout(() => { button.textContent = 'Copiar'; }, 1800);
      } catch {
        copyStatus.textContent = 'Não foi possível copiar automaticamente. Selecione o comando e copie manualmente.';
      }
    });
  });
}

const navigationLinks = [...document.querySelectorAll('.sidebar a[href^="#"]')];
if ('IntersectionObserver' in window) {
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      navigationLinks.forEach((link) => {
        if (link.hash === '#' + entry.target.id) link.setAttribute('aria-current', 'location');
        else link.removeAttribute('aria-current');
      });
    });
  }, { rootMargin: '-15% 0px -65% 0px', threshold: 0 });
  document.querySelectorAll('.article > section').forEach((section) => observer.observe(section));
}
