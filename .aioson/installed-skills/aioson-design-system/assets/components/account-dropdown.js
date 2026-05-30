/* AIOSON Design System — Account dropdown
 * Open/close do dropdown da conta logada.
 * Requer:
 *   - Wrapper com position:relative envolvendo [data-account-toggle] + [data-account-menu]
 *   - [data-account-toggle] no botão (cmd-account)
 *   - [data-account-menu] no painel (cmd-menu)
 *   - CSS .cmd-menu.is-open { display: block; }
 */

(function () {
  document.addEventListener('click', function (e) {
    var toggle = e.target.closest('[data-account-toggle]');
    var allToggles = document.querySelectorAll('[data-account-toggle]');
    var allMenus = document.querySelectorAll('[data-account-menu]');

    if (toggle) {
      var open = toggle.getAttribute('aria-expanded') === 'true';
      allToggles.forEach(function (t) { t.setAttribute('aria-expanded', 'false'); });
      allMenus.forEach(function (m) { m.classList.remove('is-open'); });
      if (!open) {
        toggle.setAttribute('aria-expanded', 'true');
        var wrapper = toggle.parentElement;
        var menu = wrapper && wrapper.querySelector('[data-account-menu]');
        if (menu) menu.classList.add('is-open');
      }
      e.preventDefault();
      return;
    }

    if (!e.target.closest('[data-account-menu]')) {
      allToggles.forEach(function (t) { t.setAttribute('aria-expanded', 'false'); });
      allMenus.forEach(function (m) { m.classList.remove('is-open'); });
    }
  });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
      document.querySelectorAll('[data-account-toggle]').forEach(function (t) {
        t.setAttribute('aria-expanded', 'false');
      });
      document.querySelectorAll('[data-account-menu]').forEach(function (m) {
        m.classList.remove('is-open');
      });
    }
  });
})();
