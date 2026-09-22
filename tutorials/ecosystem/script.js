/* ============================================================
   AIOSON Ecosystem Tutorial — Interactive Scripts
   ============================================================ */
(function () {
  'use strict';

  // 1. Theme Management
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

  // 3. Interactive Checklist
  const STORAGE_KEY = 'aioson-ecosystem-checklist-v167';
  const groups = Array.from(document.querySelectorAll('.check-group'));
  const fill = document.getElementById('progress-fill');
  const label = document.getElementById('progress-label');
  const reset = document.getElementById('progress-reset');

  if (groups.length) {
    let state = {};
    try {
      state = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') || {};
    } catch (e) {
      state = {};
    }

    const entries = [];
    groups.forEach((group) => {
      const name = group.dataset.group || 'grupo';
      const items = Array.from(group.querySelectorAll('.check-item'));
      items.forEach((item, index) => {
        entries.push({ key: name + ':' + index, item: item, group: group });
      });
    });

    const persist = () => {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      } catch (e) {}
    };

    const render = () => {
      let done = 0;
      entries.forEach((entry) => {
        const checked = state[entry.key] === true;
        entry.item.setAttribute('aria-pressed', checked ? 'true' : 'false');
        if (checked) done += 1;
      });

      groups.forEach((group) => {
        const items = Array.from(group.querySelectorAll('.check-item'));
        const marked = items.filter((item) => item.getAttribute('aria-pressed') === 'true').length;
        const counter = group.querySelector('[data-count]');
        if (counter) counter.textContent = marked + '/' + items.length;
      });

      const total = entries.length;
      if (fill) fill.style.width = total ? Math.round((done / total) * 100) + '%' : '0%';
      if (label) label.textContent = done + ' de ' + total + ' itens conferidos';
    };

    entries.forEach((entry) => {
      entry.item.addEventListener('click', () => {
        state[entry.key] = !(state[entry.key] === true);
        persist();
        render();
      });
    });

    if (reset) {
      reset.addEventListener('click', () => {
        state = {};
        persist();
        render();
      });
    }

    render();
  }
})();
