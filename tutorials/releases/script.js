/* ============================================================
   AIOSON Releases Hub — Script
   ============================================================ */
(function () {
  'use strict';

  // 1. Theme Toggle
  const themeToggle = document.getElementById('theme-toggle');
  const root = document.documentElement;

  const getSavedTheme = () => {
    try {
      return localStorage.getItem('aioson-theme') || 'dark';
    } catch (e) {
      return 'dark';
    }
  };

  const applyTheme = (theme) => {
    root.setAttribute('data-theme', theme);
    if (themeToggle) {
      themeToggle.hidden = false;
      themeToggle.setAttribute('aria-pressed', theme === 'light' ? 'true' : 'false');
      themeToggle.textContent = theme === 'light' ? 'Tema: Porcelana' : 'Tema: Tinta';
    }
  };

  applyTheme(getSavedTheme());

  if (themeToggle) {
    themeToggle.addEventListener('click', () => {
      const current = root.getAttribute('data-theme') || 'dark';
      const next = current === 'dark' ? 'light' : 'dark';
      try {
        localStorage.setItem('aioson-theme', next);
      } catch (e) {}
      applyTheme(next);
    });
  }

  // 2. Print / PDF Button
  const printBtn = document.getElementById('print-page');
  if (printBtn) {
    printBtn.hidden = false;
    printBtn.addEventListener('click', () => window.print());
  }

  // 3. Terminal Copy Buttons
  if (navigator.clipboard) {
    document.querySelectorAll('[data-copy]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const text = (btn.dataset.copy || '').replace(/&#10;/g, '\n');
        navigator.clipboard.writeText(text).then(() => {
          const original = btn.textContent;
          btn.textContent = 'Copiado ✓';
          setTimeout(() => {
            btn.textContent = original;
          }, 1600);
        });
      });
    });
  }
})();
