/* AIOSON Design System — Theme toggle
 * Persiste tema escolhido em localStorage.
 * Requer: botão com [data-theme-toggle] contendo .cmd-theme-moon e .cmd-theme-sun.
 */

(function () {
  var root = document.documentElement;
  var saved = null;
  try { saved = localStorage.getItem('aioson-theme'); } catch (e) {}
  if (saved === 'light' || saved === 'dark') {
    root.setAttribute('data-theme', saved);
  } else if (!root.getAttribute('data-theme')) {
    root.setAttribute('data-theme', 'dark');
  }

  function syncIcons() {
    var theme = root.getAttribute('data-theme') || 'dark';
    document.querySelectorAll('[data-theme-toggle]').forEach(function (btn) {
      var moon = btn.querySelector('.cmd-theme-moon');
      var sun = btn.querySelector('.cmd-theme-sun');
      if (!moon || !sun) return;
      if (theme === 'light') {
        moon.style.display = 'none';
        sun.style.display = '';
      } else {
        moon.style.display = '';
        sun.style.display = 'none';
      }
    });
  }
  syncIcons();

  document.addEventListener('click', function (e) {
    var btn = e.target.closest('[data-theme-toggle]');
    if (!btn) return;
    var current = root.getAttribute('data-theme') || 'dark';
    var next = current === 'light' ? 'dark' : 'light';
    root.setAttribute('data-theme', next);
    try { localStorage.setItem('aioson-theme', next); } catch (e) {}
    syncIcons();
  });
})();
