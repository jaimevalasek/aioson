'use strict';

const path = require('node:path');
const fs = require('node:fs/promises');
const { ensureDir } = require('../utils');
const { resolveTargetDir } = require('../lib/project-root');

const { SECRET_PATTERNS, browserSecretPatterns, stripPublicStripeConfig } = require('../lib/qa-secret-patterns');
const { recordProbe, summarizeProbes, probeSummaryMarkdown } = require('../lib/qa-probe-results');

const SENSITIVE_FILE_PATHS = [
  '/.env', '/.env.local', '/.env.production', '/.git/config',
  '/config.js', '/api/config', '/application.yml'
];

// Resolved from the project under test first, then from the CLI's own tree.
const { loadPlaywright } = require('../lib/playwright-loader');
const { openBrowser } = require('../lib/browser-session');

async function loadConfig(targetDir) {
  try {
    const raw = await fs.readFile(path.join(targetDir, 'aios-qa.config.json'), 'utf8');
    return JSON.parse(raw);
  } catch { return null; }
}

let _counter = 0;
function makeFinding(severity, category, title, location, risk, fix) {
  _counter++;
  const id = `${severity[0].toUpperCase()}-${String(_counter).padStart(2, '0')}`;
  return { id, severity, category, title, location, risk, fix, screenshot: '', route: location };
}

// --- Crawl all routes from base URL ---
// The base is normalized exactly like every discovered link: with the slash
// Vite prints (http://localhost:5173/) the root never matched its own base,
// zero routes were scanned, and the run still read COMPLETE.
function normalizeUrl(href) {
  try {
    const u = new URL(href);
    u.hash = '';
    return u.toString().replace(/\/$/, '');
  } catch { return ''; }
}

// Scope is the parsed origin plus a path prefix, never a string prefix: from
// 127.0.0.1:4317 the crawler followed :43171 and 127.0.0.1:4317@localhost:43172
// and blamed the target for the secrets it found there.
function inCrawlScope(baseUrl, href) {
  try {
    const scope = new URL(baseUrl);
    const u = new URL(href);
    if (u.protocol !== scope.protocol || u.host !== scope.host) return false;
    // A link may not carry credentials the operator did not configure.
    if (u.username !== scope.username || u.password !== scope.password) return false;
    const prefix = scope.pathname.replace(/\/$/, '');
    return !prefix || u.pathname === prefix || u.pathname.startsWith(`${prefix}/`);
  } catch { return false; }
}

async function crawlRoutes(page, baseUrl, maxDepth, maxPages, results) {
  const visited = new Set();
  const queue = [{ url: baseUrl, depth: 0 }];

  while (queue.length > 0 && visited.size < maxPages) {
    const { url, depth } = queue.shift();
    const normalized = normalizeUrl(url);
    if (!normalized || visited.has(normalized)) continue;
    if (!inCrawlScope(baseUrl, normalized)) continue;
    visited.add(normalized);

    if (depth >= maxDepth) continue;

    await recordProbe(results, [], 'discovery', normalized, async () => {
      const response = await page.goto(normalized, { waitUntil: 'domcontentloaded', timeout: 8000 });
      if (!response || response.status() >= 400 || [204, 205].includes(response.status())) return { status: 'unavailable', reason: response ? `http_${response.status()}` : 'discovery_navigation_failed' };
      const links = await page.$$eval('a[href]', (els) => els.map((el) => el.href));
      for (const link of links) {
        const n = normalizeUrl(link);
        if (n && inCrawlScope(baseUrl, n) && !visited.has(n)) {
          queue.push({ url: n, depth: depth + 1 });
        }
      }
    });
  }

  return Array.from(visited);
}

// --- Per-route security scan ---
async function scanRoute(page, route, findings, results) {
  const checks = ['html_secrets', 'global_secrets', 'console_leaks', 'accessibility', 'overflow'];
  const consoleLogs = [];
  const onConsole = (msg) => consoleLogs.push({ type: msg.type(), text: msg.text() });
  page.on('console', onConsole);
  try {
    const navigation = await recordProbe(results, findings, 'navigation', route, async () => {
      const response = await page.goto(route, { waitUntil: 'domcontentloaded', timeout: 10000 });
      if (!response || response.status() >= 400 || [204, 205].includes(response.status())) return { status: 'unavailable', reason: response ? `http_${response.status()}` : 'route_navigation_failed' };
    });
    if (navigation.status === 'unavailable') {
      for (const probe of checks) results.push({ probe, target: route, status: 'unavailable', reason: 'navigation_prerequisite_failed' });
      return;
    }

    await recordProbe(results, findings, 'html_secrets', route, async () => {
      const html = await page.content();
      for (const { name, regex } of SECRET_PATTERNS) {
        if (regex.test(html)) findings.push(makeFinding('critical', 'security', `${name} found in HTML source`, route,
          `${name} is embedded in the HTML and visible to any browser user.`,
          'Remove from client-side rendering. Serve secrets only from server-side APIs.'));
      }
    });

    await recordProbe(results, findings, 'global_secrets', route, async () => {
      const exposed = await page.evaluate((patterns) => {
        const sources = { '__NEXT_DATA__': window.__NEXT_DATA__, '__env__': window.__env__, 'ENV': window.ENV };
        const found = [];
        let inspected = 0;
        for (const [src, val] of Object.entries(sources)) {
          if (val === undefined || val === null) continue;
          inspected++;
          const str = JSON.stringify(val);
          for (const { name, regex, flags } of patterns) {
            if (new RegExp(regex, flags).test(str)) found.push({ source: src, keyType: name });
          }
        }
        return { found, inspected };
      }, browserSecretPatterns());
      for (const item of exposed.found) {
        // Do not capture secret-bearing pages as screenshots.
        findings.push(makeFinding('critical', 'security', `${item.keyType} exposed in window.${item.source}`, route,
          `${item.keyType} visible to any user via the global object on this route.`,
          'Move to server-side only. Never expose via NEXT_PUBLIC_ or client-side globals.'));
      }
      if (!exposed.inspected) return { status: 'not_applicable', reason: 'no_known_configuration_globals' };
    });

    await recordProbe(results, findings, 'console_leaks', route, async () => {
      await page.waitForTimeout(300);
      const stackLeaks = consoleLogs.filter((row) => row.type === 'error' && /at\s+\w+\s+\(/.test(row.text));
      if (stackLeaks.length) findings.push(makeFinding('medium', 'security', `Console exposes ${stackLeaks.length} stack trace(s)`, route,
        'Stack traces reveal application internals and library versions.',
        'Disable verbose error logging in production. Use a centralized error service.'));
    });

    await recordProbe(results, findings, 'accessibility', route, async () => {
      const issues = await page.evaluate(() => {
        const found = [];
        const imgs = document.querySelectorAll('img:not([alt])');
        if (imgs.length) found.push(`${imgs.length} image(s) missing alt`);
        if (!document.querySelector('html[lang]')) found.push('html missing lang attribute');
        return found;
      });
      if (issues.length) findings.push(makeFinding('medium', 'accessibility', `Accessibility issues: ${issues.join('; ')}`, route,
        'WCAG violations affect screen reader users.', 'Add alt attributes to images and lang attribute to <html> element.'));
    });

    await recordProbe(results, findings, 'overflow', route, async () => {
      const overflow = await page.evaluate(() => document.body.scrollWidth > window.innerWidth + 5);
      if (overflow) findings.push(makeFinding('medium', 'ux', 'Horizontal overflow detected', route,
        'Content overflows horizontally. Breaks mobile layout.', 'Audit for fixed-width elements. Use responsive CSS.'));
    });
  } finally {
    page.off('console', onConsole);
  }
}

// --- Check sensitive files (once per domain) ---
async function scanSensitiveFiles(page, baseUrl, findings, results) {
  for (const filePath of SENSITIVE_FILE_PATHS) {
    const target = `${baseUrl}${filePath}`;
    await recordProbe(results, findings, 'sensitive_file', target, async () => {
      const response = await page.goto(target, { waitUntil: 'commit', timeout: 5000 });
      if (!response) return { status: 'unavailable', reason: 'sensitive_file_request_failed' };
      if (response.status() === 404 || response.status() === 410) return { status: 'not_applicable', reason: 'resource_absent' };
      if (response.status() >= 400 && ![401, 403].includes(response.status())) return { status: 'unavailable', reason: `http_${response.status()}` };
      if (response.status() === 200) {
        const body = stripPublicStripeConfig(await response.text());
        // Three is enough (a longer run ends in three); `{3,}` backtracked
        // quadratically on an uppercase body, 100K characters for ~10 s.
        if (SECRET_PATTERNS.some(({ regex }) => regex.test(body)) || /[A-Z_]{3}=/.test(body) || /(SECRET|PASSWORD|TOKEN|KEY)/i.test(body)) {
          findings.push(makeFinding('critical', 'security', `Sensitive file publicly accessible: ${filePath}`, target,
            'Configuration file exposes credentials, connection strings, or infrastructure details.',
            `Block ${filePath} in your web server. Never deploy .env files to public directories.`));
        }
      }
    });
  }
}

// --- Report ---
function buildScanReport(projectName, baseUrl, routes, findings, execution, routesScanned) {
  const sorted = [...findings].sort((a, b) => {
    const o = { critical: 0, high: 1, medium: 2, low: 3 };
    return (o[a.severity] ?? 4) - (o[b.severity] ?? 4);
  });
  const bySev = (s) => sorted.filter((f) => f.severity === s);
  const date = new Date().toISOString().split('T')[0];

  let md = `## QA Scan Report — ${projectName} — ${date}\n\n`;
  md += `> Generated by: \`aioson qa:scan\`  \n`;
  md += `> Mode: autonomous crawl  \n`;
  md += `> Browser: Chromium | URL: ${baseUrl}  \n`;
  md += `> Routes scanned: ${routesScanned}/${routes.length} discovered\n\n`;
  md += probeSummaryMarkdown(execution);

  md += `### Routes discovered\n`;
  for (const r of routes.slice(0, 30)) md += `- ${r}\n`;
  if (routes.length > 30) md += `- ... and ${routes.length - 30} more\n`;
  md += '\n';

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

  md += `### Residual risks\n`;
  md += `- Scan does not test authenticated routes (no credentials provided).\n`;
  md += `- Dynamic routes with user-specific IDs were not enumerated.\n`;
  md += `- Full security audit requires manual penetration testing.\n\n`;

  const c = bySev('critical').length, h = bySev('high').length, m = bySev('medium').length, l = bySev('low').length;
  md += `### Summary\n- Routes scanned: ${routesScanned}/${routes.length} | Critical: ${c} | High: ${h} | Medium: ${m} | Low: ${l}\n`;

  return md;
}

async function runQaScan({ args, options = {}, logger, t }) {
  const targetDir = resolveTargetDir(args);

  const pw = loadPlaywright([targetDir]);
  if (!pw) {
    logger.error(t('qa_scan.playwright_missing'));
    process.exitCode = 1;
    return { ok: false, error: 'playwright_not_installed' };
  }

  const config = await loadConfig(targetDir);
  if (!config) {
    logger.error(t('qa_scan.config_missing'));
    process.exitCode = 1;
    return { ok: false, error: 'config_not_found' };
  }

  const url = String(options.url || config.url || '');
  if (!url) {
    logger.error(t('qa_scan.url_missing'));
    process.exitCode = 1;
    return { ok: false, error: 'url_not_configured' };
  }

  const projectName = config.project_name || path.basename(targetDir) || 'Project';
  const maxDepth = parseInt(String(options.depth || '3'), 10) || 3;
  const maxPages = parseInt(String(options['max-pages'] || '50'), 10) || 50;
  const headed = Boolean(options.headed);
  const screenshotsDir = path.join(targetDir, 'aios-qa-screenshots');

  _counter = 0;
  const findings = [];
  const probeResults = [];

  logger.log(t('qa_scan.starting', { url }));
  logger.log(t('qa_scan.crawling', { depth: maxDepth, pages: maxPages }));
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
    logger.error(t('qa_scan.browser_unavailable', { error: session.error, hint: session.hint || '' }));
    process.exitCode = 1;
    return { ok: false, error: session.error, hint: session.hint || '' };
  }
  const browser = session.browser;
  const page = await session.newPage();

  try {
    const base = normalizeUrl(url) || url;

    // Phase 1: crawl all routes
    const routes = await crawlRoutes(page, base, maxDepth, maxPages, probeResults);
    logger.log(t('qa_scan.routes_found', { count: routes.length }));

    // Phase 2: scan sensitive files (once), at /.env — never //.env
    await scanSensitiveFiles(page, base, findings, probeResults);

    // Phase 3: scan each route
    for (const route of routes) {
      logger.log(t('qa_scan.scanning_route', { route }));
      await scanRoute(page, route, findings, probeResults);
    }

    // Write reports
    const routesScanned = routes.filter((route) => {
      const checks = probeResults.filter((row) => row.target === route && row.probe !== 'discovery');
      return checks.some((row) => row.probe === 'navigation') && checks.every((row) => row.status !== 'unavailable');
    }).length;
    // Clean file probes around zero scanned routes say nothing about the app:
    // the run is INCOMPLETE by name, never a COMPLETE with no findings.
    if (routesScanned === 0) probeResults.push({ probe: 'route_scan', target: base, status: 'unavailable', reason: 'no_route_scanned', finding_ids: [] });
    const execution = summarizeProbes(probeResults);
    const mdContent = buildScanReport(projectName, url, routes, findings, execution, routesScanned);
    const mdPath = path.join(targetDir, 'aios-qa-report.md');
    const jsonPath = path.join(targetDir, 'aios-qa-report.json');

    const bySev = (s) => findings.filter((f) => f.severity === s).length;
    const jsonReport = {
      generated_at: new Date().toISOString(),
      project: projectName, url, mode: 'scan',
      routes_scanned: routesScanned,
      routes_discovered: routes.length,
      ...execution,
      summary: { critical: bySev('critical'), high: bySev('high'), medium: bySev('medium'), low: bySev('low') },
      findings
    };

    await fs.writeFile(mdPath, mdContent, 'utf8');
    await fs.writeFile(jsonPath, `${JSON.stringify(jsonReport, null, 2)}\n`, 'utf8');

    logger.log(t('qa_scan.done'));
    logger.log(t('qa_scan.report_written', { path: mdPath }));

    const summary = jsonReport.summary;
    logger.log(t('qa_scan.findings_summary', summary));
    logger.log(`qa:scan execution: ${execution.execution_complete ? 'COMPLETE' : 'INCOMPLETE'} — ${routesScanned}/${routes.length} routes; ${execution.limitations.length} unavailable checks`);

    // HTML report (optional, additive — does not replace MD/JSON)
    let htmlPath;
    if (options.html) {
      const { writeHtmlReport } = require('../qa-html-report');
      const result = await writeHtmlReport(targetDir, projectName, url, findings, [], null, 'scan', screenshotsDir, { routes, execution });
      htmlPath = result.htmlPath;
      logger.log(t('qa_scan.html_report_written', { path: htmlPath }));
    }

    const output = { ok: true, targetDir, url, routesScanned, routesDiscovered: routes.length, ...execution, summary, mdPath, jsonPath, findings, ...(htmlPath ? { htmlPath } : {}) };
    if (options.json) return output;
    return output;
  } finally {
    await session.close().catch(() => {});
  }
}

module.exports = { runQaScan };
