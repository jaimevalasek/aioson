'use strict';

const path = require('node:path');
const fs = require('node:fs/promises');
const { ensureDir } = require('../utils');
const { resolveTargetDir } = require('../lib/project-root');

// --- Secret patterns for exposure detection ---
const { SECRET_PATTERNS, browserSecretPatterns, stripPublicStripeConfig } = require('../lib/qa-secret-patterns');

const SENSITIVE_FILE_PATHS = [
  '/.env', '/.env.local', '/.env.production', '/.env.development',
  '/.git/config', '/config.js', '/api/config', '/wp-config.php',
  '/application.yml', '/application.properties'
];

const DEBUG_ROUTES = [
  '/admin', '/debug', '/phpinfo.php', '/_debug',
  '/api/health', '/api/debug', '/__nextjs_original-stack-frame',
  '/api/env', '/server-status'
];

// --- Playwright gate ---
// Resolved from the project under test first, then from the CLI's own tree —
// a global or linked CLI shares no node_modules with the project.
const { loadPlaywright } = require('../lib/playwright-loader');
const { openBrowser } = require('../lib/browser-session');
const { collectQaAcEvidence } = require('../lib/qa-ac-evidence');
const { clearDir } = require('../lib/evidence-artifacts');
const { recordObservedProbe, unavailable, summarizeProbes, probeSummaryMarkdown } = require('../lib/qa-probe-results');

// --- Config ---
async function loadConfig(targetDir) {
  try {
    const raw = await fs.readFile(path.join(targetDir, 'aios-qa.config.json'), 'utf8');
    return JSON.parse(raw);
  } catch { return null; }
}

// --- Finding factory ---
let _counter = 0;
function makeFinding(severity, category, title, location, risk, fix) {
  _counter++;
  const prefix = severity[0].toUpperCase();
  const id = `${prefix}-${String(_counter).padStart(2, '0')}`;
  return { id, severity, category, title, location, risk, fix, screenshot: '' };
}

// --- Screenshot helper ---
// A page with a secret never becomes a PNG, whichever finding asks. Only the
// secret finding itself used to skip its shot: the mobile overflow finding on
// the same page captured the key, and --html embedded it as base64 under
// reports/, which is not gitignored.
let _secretRoutes = new Set();
function routeKey(value) {
  try { const u = new URL(value); return u.origin + u.pathname.replace(/\/$/, ''); } catch { return String(value); }
}

async function takeScreenshot(page, screenshotsDir, id) {
  try {
    if (_secretRoutes.has(routeKey(page.url()))) return '';
    // The asking finding may come before the hacker persona looked (naive runs
    // first; --persona=mobile never runs it), so read the page itself too.
    const html = await page.content();
    if (SECRET_PATTERNS.some(({ regex }) => regex.test(html))) {
      _secretRoutes.add(routeKey(page.url()));
      return '';
    }
    const file = path.join(screenshotsDir, `${id}.png`);
    await page.screenshot({ path: file, fullPage: false });
    return file;
  } catch { return ''; }
}

async function navigate(page, url, options) {
  const response = await page.goto(url, options);
  const status = response && response.status();
  if (!response || status >= 500 || [204, 205].includes(status)
    || (options.waitUntil !== 'commit' && status >= 400)) {
    throw new Error('navigation_unavailable');
  }
  return response;
}

// ============================================================
// SECURITY PROBES
// ============================================================

async function probeExposedSecrets(page, findings, screenshotsDir) {
  const before = findings.length;
  // Check window globals: Next.js __NEXT_DATA__, window.ENV, etc.
  const exposed = await page.evaluate((patterns) => {
    const sources = {
      '__NEXT_DATA__': window.__NEXT_DATA__,
      '__env__': window.__env__,
      'ENV': window.ENV,
      '_env': window._env,
      'CONFIG': window.CONFIG,
      'APP_CONFIG': window.APP_CONFIG
    };
    const found = [];
    for (const [src, val] of Object.entries(sources)) {
      if (!val) continue;
      const str = JSON.stringify(val);
      for (const { name, regex, flags } of patterns) {
        if (new RegExp(regex, flags).test(str)) found.push({ source: src, keyType: name });
      }
    }
    return found;
  }, browserSecretPatterns()).catch(unavailable([]));

  for (const item of exposed) {
    const f = makeFinding(
      'critical', 'security',
      `${item.keyType} exposed in window.${item.source}`,
      `window.${item.source}`,
      `${item.keyType} is visible to any browser user via the global object. Direct financial or account compromise exposure.`,
      `Move to server-side only. Never use NEXT_PUBLIC_ or client-side globals for secrets.`
    );
    // Secret-bearing pages must not be copied into screenshot artifacts.
    findings.push(f);
  }

  // Also scan the rendered HTML source
  const html = await page.content().catch(unavailable(''));
  for (const { name, regex } of SECRET_PATTERNS) {
    if (regex.test(html)) {
      findings.push(makeFinding(
        'critical', 'security',
        `${name} found in rendered HTML source`,
        'Page HTML source',
        `${name} is embedded in the HTML sent to the browser. Visible to anyone using DevTools.`,
        'Remove from client-side rendering. Serve secrets only from server-side APIs.'
      ));
    }
  }
  // Every later screenshot of this route is refused, not only this probe's.
  if (findings.length > before) _secretRoutes.add(routeKey(page.url()));
}

async function probeSensitiveFiles(page, baseUrl, findings) {
  for (const filePath of SENSITIVE_FILE_PATHS) {
    try {
      const response = await navigate(page, `${baseUrl}${filePath}`, {
        waitUntil: 'commit', timeout: 5000
      });
      if (response && response.status() === 200) {
        const body = stripPublicStripeConfig(await response.text().catch(unavailable('')));
        // `{3}` matches whatever `{3,}` did without its quadratic backtracking
        // on an uppercase body (100K characters held the loop ~10 s).
        const looksLikeSensitive =
          SECRET_PATTERNS.some(({ regex }) => regex.test(body)) ||
          /[A-Z_]{3}=/.test(body) ||
          /<\?php/.test(body) ||
          /(SECRET|PASSWORD|TOKEN|KEY|PRIVATE)/i.test(body);
        if (looksLikeSensitive) {
          findings.push(makeFinding(
            'critical', 'security',
            `Sensitive file publicly accessible: ${filePath}`,
            `${baseUrl}${filePath}`,
            `Configuration file is reachable by any internet user. May expose credentials, connection strings, or infrastructure details.`,
            `Block ${filePath} in your web server (nginx/vercel/apache). Never deploy .env files to public directories.`
          ));
        }
      }
    } catch { unavailable()(); }
  }
}

async function probeXss(page, baseUrl, findings, screenshotsDir) {
  await navigate(page, baseUrl, { waitUntil: 'domcontentloaded', timeout: 15000 }).catch(unavailable());

  let xssFired = false;
  page.on('dialog', async (dialog) => {
    xssFired = true;
    await dialog.dismiss().catch(unavailable());
  });

  const inputs = await page.$$('input[type="text"],input[type="search"],input[type="email"],input[type="url"],textarea').catch(unavailable([]));
  for (const input of inputs.slice(0, 10)) {
    await input.fill('<img src=x onerror="window.__xss=1">').catch(unavailable());
  }
  await page.keyboard.press('Tab').catch(unavailable());
  await page.waitForTimeout(500).catch(unavailable());

  const xssEval = await page.evaluate(() => window.__xss === 1).catch(unavailable(false));
  if (xssFired || xssEval) {
    const f = makeFinding(
      'critical', 'security',
      'XSS (Cross-Site Scripting) — injected script executed',
      'Form text inputs',
      'User input is rendered as HTML without sanitization. Attacker can steal sessions, redirect users, or deface the page.',
      'Sanitize all user input before rendering. Use textContent instead of innerHTML. Apply a strict Content-Security-Policy header.'
    );
    f.screenshot = await takeScreenshot(page, screenshotsDir, f.id);
    findings.push(f);
  }
}

async function probeOpenRedirect(page, baseUrl, findings) {
  const params = ['redirect', 'next', 'return', 'returnUrl', 'return_url', 'goto', 'url', 'dest'];
  const evil = 'https://evil-phishing-example.com';
  for (const param of params) {
    try {
      // Read the app's own answer without following it. Navigating went to the
      // external host (unresolvable, so `unavailable`), could never see the 30x
      // goto had already followed, and left the page mid-navigation for the
      // next probe ("execution context was destroyed").
      const target = `${baseUrl}?${param}=${encodeURIComponent(evil)}`;
      const response = await page.request.get(target, { maxRedirects: 0, timeout: 5000 });
      if (response.status() >= 500) throw new Error('redirect_probe_unavailable');
      const location = String(response.headers()['location'] || '');
      let redirected = false;
      if ([301, 302, 303, 307, 308].includes(response.status()) && location) {
        // Judged by the host it leads to, so `//evil…` counts and `/next` does not.
        try { redirected = new URL(location, target).host === new URL(evil).host; } catch { redirected = false; }
      }
      if (redirected) {
        findings.push(makeFinding(
          'high', 'security',
          `Open redirect via ?${param}= parameter`,
          `${baseUrl}?${param}=`,
          'Attacker can use your trusted domain to redirect users to phishing sites. Bypasses browser warnings.',
          'Validate redirect targets against an allowlist of trusted paths. Reject external URLs unconditionally.'
        ));
        break;
      }
    } catch { unavailable()(); }
  }
}

async function probeInjectionInputs(page, baseUrl, findings) {
  await navigate(page, baseUrl, { waitUntil: 'domcontentloaded', timeout: 15000 }).catch(unavailable());
  const inputs = await page.$$('input[type="text"],input[type="search"],textarea').catch(unavailable([]));
  const sqlPayload = `' OR '1'='1' -- `;
  for (const input of inputs.slice(0, 5)) {
    await input.fill(sqlPayload).catch(unavailable());
  }
  await page.waitForTimeout(500).catch(unavailable());
  const html = await page.content().catch(unavailable(''));
  if (/(SQL syntax|mysql_fetch|ORA-|pg_query|sqlite_|SQLSTATE)/i.test(html)) {
    findings.push(makeFinding(
      'critical', 'security',
      'SQL error message exposed after injection probe',
      'Form inputs',
      'A SQL error was returned when input contained single quotes. Indicates raw string interpolation in queries.',
      'Use parameterized queries or ORM exclusively. Never build SQL strings with user input. Disable detailed DB error messages in production.'
    ));
  }
}

async function probeDebugRoutes(page, baseUrl, findings) {
  for (const route of DEBUG_ROUTES) {
    try {
      const response = await navigate(page, `${baseUrl}${route}`, { waitUntil: 'commit', timeout: 4000 });
      if (response && response.status() === 200) {
        const title = await page.title().catch(unavailable(''));
        if (!/404|not found/i.test(title)) {
          findings.push(makeFinding(
            'medium', 'security',
            `Debug/admin route accessible without authentication: ${route}`,
            `${baseUrl}${route}`,
            'Unauthenticated access to debug/admin endpoints may expose metrics, logs, internal state, or admin controls.',
            `Require authentication for ${route}. Restrict to internal network or remove in production.`
          ));
        }
      }
    } catch { unavailable()(); }
  }
}

async function probeInjectionInjection(page, findings, consoleLog, networkRequests) {
  // Console error leakage
  const stackTraceRx = /at\s+\w+\s+\(/;
  const sensitiveRx = /(token|secret|password|key|authorization)/i;
  const leaks = consoleLog.filter((l) =>
    l.type === 'error' && (stackTraceRx.test(l.text) || sensitiveRx.test(l.text))
  );
  if (leaks.length > 0) {
    findings.push(makeFinding(
      'medium', 'security',
      `Browser console exposes ${leaks.length} error(s) with stack traces or sensitive keywords`,
      'Browser DevTools console',
      'Stack traces reveal file paths, library versions, and logic. Sensitive keywords may expose credentials or tokens.',
      'Disable verbose error logging in production. Use a centralized error service (Sentry, Datadog) instead of console.error.'
    ));
  }

  // Sensitive data in GET params
  const sensitiveParamRx = /(token|secret|password|api_key|apikey|auth)/i;
  for (const req of networkRequests) {
    try {
      const url = new URL(req.url);
      for (const [key] of url.searchParams) {
        if (sensitiveParamRx.test(key)) {
          findings.push(makeFinding(
            'high', 'security',
            `Sensitive parameter "${key}" transmitted in GET URL`,
            req.url.substring(0, 120),
            'Sensitive data in URLs is logged by web servers, proxies, CDNs, and browser history. Leaks through Referer headers.',
            'Move sensitive parameters to POST body or Authorization header. Never pass secrets in query strings.'
          ));
          break;
        }
      }
    } catch { /* invalid URL */ }
  }

  // HTTP requests from HTTPS page (mixed content)
  const mixed = networkRequests.filter((r) =>
    r.url.startsWith('http://') && !r.url.startsWith('http://localhost') && !r.url.startsWith('http://127.')
  );
  if (mixed.length > 0) {
    findings.push(makeFinding(
      'medium', 'security',
      `${mixed.length} mixed content request(s) — HTTP resources on page`,
      mixed[0].url.substring(0, 120),
      'HTTP requests from an HTTPS page expose data in transit. Modern browsers block or warn on mixed content.',
      'Upgrade all resource references to HTTPS. Use protocol-relative URLs (//) or absolute HTTPS URLs.'
    ));
  }
}

// ============================================================
// PERSONA — NAIVE USER
// ============================================================
async function runNaivePersona(page, baseUrl, findings, screenshotsDir) {
  await navigate(page, baseUrl, { waitUntil: 'domcontentloaded', timeout: 15000 }).catch(unavailable());

  // Submit all empty forms
  const forms = await page.$$('form').catch(unavailable([]));
  for (const form of forms.slice(0, 5)) {
    const beforeUrl = page.url();
    // `<input type="submit" name="submit">` shadows form.submit on ordinary
    // pages; the prototype method still submits, and a form that refuses in
    // the page is not a browser failure.
    await page.evaluate((f) => { try { HTMLFormElement.prototype.submit.call(f); } catch (_) { /* not submittable */ } }, form).catch(unavailable());
    await page.waitForTimeout(800).catch(unavailable());
    const title = await page.title().catch(unavailable(''));
    const html = await page.content().catch(unavailable(''));
    if (/error|exception|stacktrace|500/i.test(title) || /Internal Server Error|Uncaught Exception/i.test(html)) {
      const f = makeFinding(
        'high', 'reliability',
        'Empty form submission causes server error (5xx)',
        `Form on ${beforeUrl}`,
        'Server returns 5xx when form is submitted empty. Missing or bypassed server-side validation.',
        'Add server-side validation before processing. Return 422 with field-specific errors instead of throwing 500.'
      );
      f.screenshot = await takeScreenshot(page, screenshotsDir, f.id);
      findings.push(f);
      await navigate(page, baseUrl, { waitUntil: 'domcontentloaded', timeout: 10000 }).catch(unavailable());
    }
  }

  // Type very long strings (buffer overflow / DoS potential)
  await navigate(page, baseUrl, { waitUntil: 'domcontentloaded', timeout: 10000 }).catch(unavailable());
  const inputs = await page.$$('input[type="text"],input[type="email"],input[type="search"],textarea').catch(unavailable([]));
  const longStr = 'A'.repeat(10000);
  for (const input of inputs.slice(0, 5)) {
    await input.fill(longStr).catch(unavailable());
  }
  await page.waitForTimeout(500).catch(unavailable());
  const srcAfterLong = await page.content().catch(unavailable(''));
  if (/maximum call stack|out of memory|RangeError|Cannot read/i.test(srcAfterLong)) {
    findings.push(makeFinding(
      'high', 'reliability',
      'Application crashes on very long input (10,000 chars)',
      'Text input fields',
      'No length validation at the UI boundary causes a client-side crash on extreme input.',
      'Add maxlength attribute to inputs and validate length server-side before any processing.'
    ));
  }

  // Detect ghost clickables: cursor:pointer with no handler
  const deadClicks = await page.evaluate(() => {
    const els = document.querySelectorAll('[style*="cursor: pointer"],[class*="cursor-pointer"],[class*="cursor_pointer"]');
    const dead = [];
    for (const el of els) {
      const tag = el.tagName.toLowerCase();
      const isInteractive = ['a', 'button', 'input', 'select', 'textarea'].includes(tag);
      const hasRole = el.getAttribute('role');
      const hasClick = el.onclick !== null || el.getAttribute('data-action');
      if (!isInteractive && !hasRole && !hasClick) {
        dead.push((el.className || el.id || tag).toString().substring(0, 60));
      }
    }
    return dead.slice(0, 10);
  }).catch(unavailable([]));

  if (deadClicks.length > 0) {
    findings.push(makeFinding(
      'low', 'ux',
      `${deadClicks.length} element(s) appear clickable (cursor:pointer) but have no action`,
      `Elements: ${deadClicks.slice(0, 3).join(' | ')}`,
      'Cursor changes to pointer but clicking does nothing. Confuses users and erodes trust.',
      'Remove cursor:pointer from non-interactive elements, or add the appropriate click handler or ARIA role.'
    ));
  }
}

// ============================================================
// PERSONA — HACKER
// ============================================================
async function runHackerPersona(page, baseUrl, findings, screenshotsDir, results) {
  await navigate(page, baseUrl, { waitUntil: 'domcontentloaded', timeout: 15000 }).catch(unavailable());

  const probes = {
    exposed_secrets: () => probeExposedSecrets(page, findings, screenshotsDir),
    sensitive_files: () => probeSensitiveFiles(page, baseUrl, findings),
    xss: () => probeXss(page, baseUrl, findings, screenshotsDir),
    open_redirect: () => probeOpenRedirect(page, baseUrl, findings),
    injection_inputs: () => probeInjectionInputs(page, baseUrl, findings),
    debug_routes: () => probeDebugRoutes(page, baseUrl, findings)
  };
  for (const [probe, action] of Object.entries(probes)) {
    await recordObservedProbe(results, findings, probe, baseUrl, action);
  }

  // IDOR probe: detect numeric IDs in current URL, try ±1
  await navigate(page, baseUrl, { waitUntil: 'domcontentloaded', timeout: 10000 }).catch(unavailable());
  const currentUrl = page.url();
  const idMatch = currentUrl.match(/\/(\d{1,9})(\/|$|\?)/);
  if (idMatch) {
    const id = parseInt(idMatch[1], 10);
    for (const delta of [-1, 1, 9999]) {
      try {
        const probe = currentUrl.replace(`/${id}`, `/${id + delta}`);
        const response = await navigate(page, probe, { waitUntil: 'commit', timeout: 5000 });
        if (response && response.status() === 200) {
          findings.push(makeFinding(
            'high', 'security',
            `Potential IDOR: resource /${id} → /${id + delta} returns 200`,
            probe,
            'Incrementing the resource ID in the URL returns a valid response with no authorization rejection. May expose other users\' data.',
            'Implement per-resource authorization: verify the authenticated user owns or is permitted to access the requested ID.'
          ));
          break;
        }
      } catch { unavailable()(); }
    }
  }
}

// ============================================================
// PERSONA — POWER USER
// ============================================================
async function runPowerPersona(page, baseUrl, findings) {
  await navigate(page, baseUrl, { waitUntil: 'domcontentloaded', timeout: 15000 }).catch(unavailable());

  // Keyboard navigation — visible focus indicator
  let missingFocus = 0;
  for (let i = 0; i < 25; i++) {
    await page.keyboard.press('Tab').catch(unavailable());
    const focusOk = await page.evaluate(() => {
      const el = document.activeElement;
      if (!el || el === document.body) return true;
      const style = window.getComputedStyle(el);
      const outline = style.outline || '';
      return outline !== 'none' && !outline.startsWith('0px');
    }).catch(unavailable(true));
    if (!focusOk) missingFocus++;
  }

  if (missingFocus > 2) {
    findings.push(makeFinding(
      'medium', 'accessibility',
      `Keyboard focus indicator missing on ${missingFocus} interactive element(s)`,
      'Tab key navigation',
      'Users relying on keyboard cannot see which element is focused. WCAG 2.1 SC 2.4.7 (Level AA) violation.',
      'Never use outline: none without an equivalent visible :focus-visible alternative. Ensure contrast ratio ≥ 3:1.'
    ));
  }

  // Boundary values on number inputs
  const numberInputs = await page.$$('input[type="number"],input[type="range"]').catch(unavailable([]));
  for (const input of numberInputs.slice(0, 5)) {
    for (const value of ['-999999999', '0', '999999999999999', '9007199254740992']) {
      await input.fill(value).catch(unavailable());
      await page.keyboard.press('Tab').catch(unavailable());
      await page.waitForTimeout(200).catch(unavailable());
    }
  }

  // Date boundary values
  const dateInputs = await page.$$('input[type="date"]').catch(unavailable([]));
  for (const input of dateInputs.slice(0, 3)) {
    for (const value of ['1900-01-01', '9999-12-31', '2000-02-29']) {
      await input.fill(value).catch(unavailable());
      await page.keyboard.press('Tab').catch(unavailable());
    }
  }
}

// ============================================================
// PERSONA — MOBILE
// ============================================================
async function runMobilePersona(browser, baseUrl, findings, screenshotsDir) {
  const context = await browser.newContext({
    viewport: { width: 375, height: 667 },
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1',
    hasTouch: true,
    isMobile: true
  }).catch(unavailable(null));
  if (!context) return unavailable(undefined, 'mobile_context_unavailable')();

  const page = await context.newPage().catch(unavailable(null));
  if (!page) { await context.close().catch(() => {}); return unavailable(undefined, 'mobile_page_unavailable')(); }

  try {
    await navigate(page, baseUrl, { waitUntil: 'domcontentloaded', timeout: 15000 }).catch(unavailable());

    // Horizontal overflow
    const overflow = await page.evaluate(() => document.body.scrollWidth > window.innerWidth + 5).catch(unavailable(false));
    if (overflow) {
      const f = makeFinding(
        'medium', 'ux',
        'Horizontal overflow on mobile viewport (375px)',
        `${baseUrl} — iPhone SE viewport`,
        'Content overflows horizontally on small screens. Forces unwanted horizontal scrolling. Breaks layout.',
        'Audit for fixed-width elements wider than 375px. Use max-width: 100%, flexbox, or CSS grid for responsive layouts.'
      );
      f.screenshot = await takeScreenshot(page, screenshotsDir, f.id);
      findings.push(f);
    }

    // Touch target size (< 44px = WCAG 2.5.5 violation)
    const smallTargets = await page.evaluate(() => {
      const els = document.querySelectorAll('a, button, [role="button"], input[type="submit"], input[type="checkbox"], input[type="radio"]');
      const small = [];
      for (const el of els) {
        const r = el.getBoundingClientRect();
        if (r.width > 0 && r.height > 0 && (r.width < 44 || r.height < 44)) {
          small.push({ tag: el.tagName, text: (el.textContent || '').trim().substring(0, 30), w: Math.round(r.width), h: Math.round(r.height) });
        }
      }
      return small.slice(0, 8);
    }).catch(unavailable([]));

    if (smallTargets.length > 0) {
      findings.push(makeFinding(
        'low', 'accessibility',
        `${smallTargets.length} touch target(s) smaller than 44×44px (WCAG 2.5.5)`,
        smallTargets.map((t) => `${t.tag} "${t.text}" ${t.w}×${t.h}px`).slice(0, 3).join(', '),
        'Small touch targets cause mis-taps, frustrate mobile users, and fail WCAG 2.5.5 (AAA) and Apple HIG guidelines.',
        'Set min-height: 44px; min-width: 44px on all interactive elements. Increase padding rather than element size if needed.'
      ));
    }

    // Tiny fonts
    const tinyFonts = await page.evaluate(() => {
      const tiny = [];
      for (const el of document.querySelectorAll('p, span, li, td, label, a')) {
        if (!el.textContent.trim()) continue;
        const size = parseFloat(window.getComputedStyle(el).fontSize);
        if (size > 0 && size < 12) tiny.push({ tag: el.tagName, size, text: el.textContent.trim().substring(0, 40) });
      }
      return tiny.slice(0, 5);
    }).catch(unavailable([]));

    if (tinyFonts.length > 0) {
      findings.push(makeFinding(
        'low', 'accessibility',
        `${tinyFonts.length} text element(s) with font size below 12px`,
        tinyFonts.map((t) => `${t.tag} (${t.size}px)`).slice(0, 3).join(', '),
        'Text smaller than 12px triggers automatic zoom on iOS, breaking layout. Very hard to read without zooming.',
        'Set a minimum font size of 12px. Use rem/em units for scalable typography across screen sizes.'
      ));
    }
  } finally {
    await page.close().catch(() => {});
    await context.close().catch(() => {});
  }
}

// ============================================================
// ACCESSIBILITY AUDIT
// ============================================================
async function checkAccessibility(page, findings) {
  const issues = await page.evaluate(() => {
    const result = [];

    const imgs = document.querySelectorAll('img:not([alt])');
    if (imgs.length) result.push({ type: 'img_no_alt', count: imgs.length });

    let unlabeled = 0;
    for (const input of document.querySelectorAll('input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="reset"])')) {
      const hasLabel = input.id && document.querySelector(`label[for="${input.id}"]`);
      const hasAria = input.getAttribute('aria-label') || input.getAttribute('aria-labelledby');
      if (!hasLabel && !hasAria) unlabeled++;
    }
    if (unlabeled) result.push({ type: 'input_no_label', count: unlabeled });

    let unnamed = 0;
    for (const btn of document.querySelectorAll('button,[role="button"]')) {
      const hasText = (btn.textContent || '').trim().length > 0;
      const hasAria = btn.getAttribute('aria-label') || btn.getAttribute('aria-labelledby') || btn.getAttribute('title');
      if (!hasText && !hasAria) unnamed++;
    }
    if (unnamed) result.push({ type: 'button_no_name', count: unnamed });

    const headings = [...document.querySelectorAll('h1,h2,h3,h4,h5,h6')];
    for (let i = 1; i < headings.length; i++) {
      if (parseInt(headings[i].tagName[1]) - parseInt(headings[i - 1].tagName[1]) > 1) {
        result.push({ type: 'heading_skip' });
        break;
      }
    }

    if (!document.querySelector('html[lang]')) result.push({ type: 'no_lang' });

    return result;
  }).catch(unavailable([]));

  const defs = {
    img_no_alt:     { sev: 'medium', title: '{count} image(s) missing alt attribute', location: '<img> elements', risk: 'Screen readers cannot describe images to visually impaired users. WCAG 1.1.1 (Level A) violation.', fix: 'Add descriptive alt text to all informative images. Use alt="" for decorative images.' },
    input_no_label: { sev: 'medium', title: '{count} form input(s) with no accessible label', location: '<input> elements', risk: 'Screen readers announce only the input type with no context. WCAG 1.3.1 (Level A) violation.', fix: 'Add <label for="..."> or aria-label to every form input.' },
    button_no_name: { sev: 'medium', title: '{count} button(s) with no accessible name', location: '<button> elements', risk: 'Screen readers say "button" with no indication of what action it triggers. WCAG 4.1.2 violation.', fix: 'Add visible text or aria-label to every button.' },
    heading_skip:   { sev: 'low',    title: 'Heading level skipped (e.g. h1 → h3)', location: 'Document heading structure', risk: 'Screen reader users rely on heading hierarchy for page navigation. Skipped levels break their mental model.', fix: 'Use sequential heading levels. Never choose heading levels for visual size — use CSS instead.' },
    no_lang:        { sev: 'low',    title: '<html> element missing lang attribute', location: '<html> tag', risk: 'Screen readers guess language for pronunciation. Wrong language causes incorrect speech. WCAG 3.1.1 (Level A).', fix: 'Add lang="en" (or appropriate BCP-47 code) to the <html> element.' }
  };

  for (const issue of issues) {
    const d = defs[issue.type];
    if (!d) continue;
    findings.push(makeFinding(d.sev, 'accessibility', d.title.replace('{count}', issue.count || ''), d.location, d.risk, d.fix));
  }
}

// ============================================================
// PERFORMANCE
// ============================================================
async function capturePerformance(page, thresholds, findings) {
  const perf = await page.evaluate(() => {
    const nav = performance.getEntriesByType('navigation')[0];
    if (!nav) return null;
    const resources = performance.getEntriesByType('resource');
    return {
      domContentLoaded: Math.round(nav.domContentLoadedEventEnd),
      loadComplete: Math.round(nav.loadEventEnd),
      ttfb: Math.round(nav.responseStart - nav.requestStart),
      resourceCount: resources.length,
      resourceSizeKb: Math.round(resources.reduce((acc, r) => acc + (r.transferSize || 0), 0) / 1024)
    };
  }).catch(unavailable(null));

  if (!perf) return unavailable(null, 'performance_measurement_unavailable')();

  if (perf.loadComplete > (thresholds.page_load_ms || 3000)) {
    findings.push(makeFinding(
      'medium', 'performance',
      `Page load time exceeds threshold (${perf.loadComplete}ms > ${thresholds.page_load_ms || 3000}ms)`,
      'Page load',
      'Slow page load degrades UX and Core Web Vitals score. Google Search penalizes pages with poor LCP.',
      'Analyze network waterfall. Defer non-critical JS. Enable Gzip/Brotli compression. Use a CDN for static assets.'
    ));
  }

  if (perf.ttfb > (thresholds.ttfb_ms || 800)) {
    findings.push(makeFinding(
      'medium', 'performance',
      `High Time to First Byte — TTFB ${perf.ttfb}ms`,
      'Server response time',
      'TTFB > 800ms means the server is slow to respond. Users see a blank page for too long.',
      'Optimize database queries, add server-side caching, or review server infrastructure capacity.'
    ));
  }

  if (perf.resourceCount > (thresholds.requests_max || 80)) {
    findings.push(makeFinding(
      'low', 'performance',
      `High request count: ${perf.resourceCount} network requests on load`,
      'Network requests',
      `${perf.resourceCount} requests slow down page load and increases server load.`,
      'Bundle JavaScript and CSS files. Use HTTP/2 multiplexing. Lazy-load images and below-the-fold content.'
    ));
  }

  if (perf.resourceSizeKb > (thresholds.transfer_max_kb || 2048)) {
    findings.push(makeFinding(
      'low', 'performance',
      `Total transfer size ${perf.resourceSizeKb}KB exceeds threshold`,
      'Network transfer',
      `Large payload increases load time on slow connections and mobile data.`,
      'Enable compression. Audit and tree-shake large JS bundles. Optimize images (WebP, lazy loading).'
    ));
  }

  return perf;
}

// ============================================================
// AC COVERAGE
// ============================================================
// ============================================================
// REPORT GENERATION
// ============================================================
function buildMarkdownReport(projectName, url, findings, acCoverage, perf, mode, execution, coverage) {
  const sorted = [...findings].sort((a, b) => {
    const o = { critical: 0, high: 1, medium: 2, low: 3 };
    return (o[a.severity] ?? 4) - (o[b.severity] ?? 4);
  });
  const bySev = (s) => sorted.filter((f) => f.severity === s);
  const date = new Date().toISOString().split('T')[0];

  let md = `## QA Browser Report — ${projectName} — ${date}\n\n`;
  md += `> Generated by: \`aioson qa:${mode}\`  \n`;
  md += `> Browser: Chromium | Viewport: 1280×720  \n`;
  md += `> URL: ${url}\n\n`;

  md += probeSummaryMarkdown(execution);
  if (coverage.gaps.length) md += '### Coverage limitations\n' + coverage.gaps.map((gap) => `- ${gap.check}: ${gap.message}`).join('\n') + '\n\n';

  if (acCoverage.length > 0) {
    md += `### Acceptance criteria coverage\n| AC | Description | Status |\n|---|---|---|\n`;
    for (const ac of acCoverage) md += `| ${ac.id} | ${ac.description} | ${ac.status} |\n`;
    md += '\n';
  }

  md += `### Findings\n\n`;
  for (const [label, group] of [['Critical', bySev('critical')], ['High', bySev('high')], ['Medium', bySev('medium')], ['Low', bySev('low')]]) {
    if (group.length === 0) continue;
    md += `#### ${label}\n`;
    for (const f of group) {
      md += `**[${f.id}] ${f.title}**  \n`;
      md += `Location: \`${f.location}\`  \n`;
      md += `Risk: ${f.risk}  \n`;
      md += `Fix: ${f.fix}  \n`;
      if (f.screenshot) md += `Screenshot: ${f.screenshot}  \n`;
      md += '\n';
    }
  }

  if (perf) {
    md += `### Performance\n| Metric | Value |\n|---|---|\n`;
    md += `| DOM Content Loaded | ${perf.domContentLoaded}ms |\n`;
    md += `| Page Load Complete | ${perf.loadComplete}ms |\n`;
    md += `| Time to First Byte | ${perf.ttfb}ms |\n`;
    md += `| Network requests | ${perf.resourceCount} |\n`;
    md += `| Total transfer | ${perf.resourceSizeKb}KB |\n\n`;
  }

  md += `### Residual risks\n`;
  md += `- Tests run against a running instance; production environment may differ (headers, CSP, CDN).\n`;
  md += `- Content behind authentication was not tested — no credentials were provided.\n`;
  md += `- JavaScript-heavy interactions may need additional manual verification.\n\n`;

  const c = bySev('critical').length, h = bySev('high').length, m = bySev('medium').length, l = bySev('low').length;
  md += `### Summary\n`;
  md += `- Critical: ${c} | High: ${h} | Medium: ${m} | Low: ${l}\n`;
  if (acCoverage.length > 0) {
    const exercised = acCoverage.filter((ac) => ac.status !== 'Not exercised').length;
    md += `- AC exercised by walkthroughs: ${exercised}/${acCoverage.length}${exercised < acCoverage.length ? ' (bind the rest with aioson browser:run --slug=<feature>)' : ''}\n`;
  }

  return md;
}

async function writeReports(targetDir, projectName, url, findings, acCoverage, perf, mode, execution, coverage) {
  const mdPath = path.join(targetDir, 'aios-qa-report.md');
  const jsonPath = path.join(targetDir, 'aios-qa-report.json');
  const md = buildMarkdownReport(projectName, url, findings, acCoverage, perf, mode, execution, coverage);
  const bySev = (s) => findings.filter((f) => f.severity === s).length;
  const json = {
    generated_at: new Date().toISOString(),
    project: projectName, url, mode,
    summary: { critical: bySev('critical'), high: bySev('high'), medium: bySev('medium'), low: bySev('low') },
    ...execution,
    feature: coverage.feature,
    ac_coverage_gaps: coverage.gaps,
    ac_coverage: acCoverage,
    performance: perf,
    findings
  };
  await fs.writeFile(mdPath, md, 'utf8');
  await fs.writeFile(jsonPath, `${JSON.stringify(json, null, 2)}\n`, 'utf8');
  return { mdPath, jsonPath };
}

// ============================================================
// MAIN
// ============================================================
async function runQaRun({ args, options = {}, logger, t }) {
  const targetDir = resolveTargetDir(args);

  const pw = loadPlaywright([targetDir]);
  if (!pw) {
    logger.error(t('qa_run.playwright_missing'));
    process.exitCode = 1;
    return { ok: false, error: 'playwright_not_installed' };
  }

  const config = await loadConfig(targetDir);
  if (!config) {
    logger.error(t('qa_run.config_missing'));
    process.exitCode = 1;
    return { ok: false, error: 'config_not_found' };
  }

  const url = String(options.url || config.url || '');
  if (!url) {
    logger.error(t('qa_run.url_missing'));
    process.exitCode = 1;
    return { ok: false, error: 'url_not_configured' };
  }

  const projectName = config.project_name || path.basename(targetDir) || 'Project';
  const selectedPersona = String(options.persona || '').toLowerCase() || null;
  const headed = Boolean(options.headed);
  const screenshotsDir = path.join(targetDir, 'aios-qa-screenshots');
  const feature = String(options.feature || config.feature || '').trim() || null;
  const coverage = await collectQaAcEvidence(targetDir, feature, url);
  const probeResults = [];
  const thresholds = config.performance_thresholds || {};

  _counter = 0;
  _secretRoutes = new Set();
  const findings = [];
  const consoleLogs = [];
  const networkRequests = [];

  logger.log(t('qa_run.starting', { url }));
  // The folder mirrors this run: a leftover C-01.png from an earlier run
  // attached itself to an unrelated new C-01 in the HTML report.
  clearDir(screenshotsDir);
  await ensureDir(screenshotsDir);

  // One resolver for every browser surface: --cdp attaches to the operator's
  // running Chrome, --browser=chrome|msedge launches the installed one, and
  // the bundled Chromium stays the default when present.
  const session = await openBrowser({
    projectDir: targetDir,
    playwright: pw,
    config,
    cdp: String(options.cdp || ''),
    channel: String(options.browser || ''),
    headless: !headed,
    viewport: { width: 1280, height: 720 }
  });
  if (!session.ok) {
    logger.error(t('qa_run.browser_unavailable', { error: session.error, hint: session.hint || '' }));
    process.exitCode = 1;
    return { ok: false, error: session.error, hint: session.hint || '' };
  }
  const browser = session.browser;
  const page = await session.newPage();

  page.on('console', (msg) => consoleLogs.push({ type: msg.type(), text: msg.text() }));
  page.on('request', (req) => networkRequests.push({ url: req.url(), method: req.method() }));

  try {
    const personas = selectedPersona ? [selectedPersona] : (config.personas || ['naive', 'hacker', 'power', 'mobile']);
    const actions = {
      naive: () => runNaivePersona(page, url, findings, screenshotsDir),
      hacker: () => runHackerPersona(page, url, findings, screenshotsDir, probeResults),
      power: () => runPowerPersona(page, url, findings),
      mobile: () => runMobilePersona(browser, url, findings, screenshotsDir)
    };
    const observe = (probe, action) => recordObservedProbe(probeResults, findings, probe, url, action);
    for (const persona of personas) {
      logger.log(t('qa_run.persona_start', { persona }));
      const before = findings.length;
      await observe(`persona_${persona}`, actions[persona] || (() => ({ status: 'unavailable', reason: 'unknown_persona' })));
      logger.log(t('qa_run.persona_done', { persona, count: findings.length - before }));
    }

    await observe('network_console', () => probeInjectionInjection(page, findings, consoleLogs, networkRequests));
    logger.log(t('qa_run.accessibility'));
    await observe('accessibility', async () => {
      await navigate(page, url, { waitUntil: 'domcontentloaded', timeout: 15000 });
      await checkAccessibility(page, findings);
    });
    logger.log(t('qa_run.performance'));
    let perf = null;
    await observe('performance', async () => {
      await navigate(page, url, { waitUntil: 'load', timeout: 20000 });
      perf = await capturePerformance(page, thresholds, findings);
    });
    const acCoverage = coverage.items;
    const execution = summarizeProbes(probeResults);
    logger.log(`qa:run execution: ${execution.execution_complete ? 'COMPLETE' : 'INCOMPLETE'} — ${execution.limitations.length} unavailable checks; ${coverage.gaps.length} AC inventory limitations`);

    // Write reports
    const { mdPath, jsonPath } = await writeReports(targetDir, projectName, url, findings, acCoverage, perf, 'run', execution, coverage);

    logger.log(t('qa_run.done'));
    logger.log(t('qa_run.report_written', { path: mdPath }));
    logger.log(t('qa_run.json_written', { path: jsonPath }));
    logger.log(t('qa_run.screenshots_dir', { path: screenshotsDir }));

    const bySev = (s) => findings.filter((f) => f.severity === s).length;
    const summary = { critical: bySev('critical'), high: bySev('high'), medium: bySev('medium'), low: bySev('low') };
    logger.log(t('qa_run.findings_summary', summary));

    // HTML report (optional, additive — does not replace MD/JSON)
    let htmlPath, htmlDir;
    if (options.html) {
      const { writeHtmlReport } = require('../qa-html-report');
      const result = await writeHtmlReport(targetDir, projectName, url, findings, acCoverage, perf, 'run', screenshotsDir, { thresholds, execution });
      htmlPath = result.htmlPath;
      htmlDir = result.runDir;
      logger.log(t('qa_run.html_report_written', { path: htmlPath }));
    }

    const output = { ok: true, targetDir, url, feature, ...execution, ac_coverage_gaps: coverage.gaps, summary, mdPath, jsonPath, screenshotsDir, findings, acCoverage, ...(htmlPath ? { htmlPath, htmlDir } : {}) };
    if (options.json) return output;
    return output;
  } finally {
    await session.close().catch(() => {});
  }
}

module.exports = { runQaRun };
