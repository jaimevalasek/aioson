'use strict';

/**
 * Step execution: expectations (polling, no @playwright/test), aria
 * snapshots, and the single `executeStep` that turns a script step into a
 * recorded result.
 */

const path = require('node:path');

const { clampLines, expectKind, sanitizeUrl, maskedValue, clip, until, LOGIN_WALL_RE } = require('./script');
const { asMatcher, locatorFor, parseBoundary, boundaryHit } = require('./targets');
const { stripHiddenChars } = require('../llm-content-sanitizer');

// ---------------------------------------------------------------------------
// Step execution
// ---------------------------------------------------------------------------

function resolveUrl(value, base) {
  const text = String(value || '');
  if (/^[a-z][a-z0-9+.-]*:/i.test(text)) return text;
  if (!base) return text;
  try { return new URL(text, base).toString(); } catch { return text; }
}

async function runExpect(page, step, timeout, clock) {
  const kind = expectKind(step);
  const target = step.target ? locatorFor(page, step.target) : null;
  const needle = (v) => (v instanceof RegExp ? v : String(v));
  const matches = (haystack, expected, exact = false) => {
    const h = String(haystack === undefined || haystack === null ? '' : haystack);
    if (expected instanceof RegExp) return expected.test(h);
    return exact ? h.trim() === String(expected) : h.includes(String(expected));
  };
  switch (kind) {
    case 'visible':
    case 'hidden': {
      const locator = locatorFor(page, step[kind]);
      const wantVisible = kind === 'visible';
      const result = await until(async () => {
        const visible = await locator.isVisible().catch(() => false);
        return { ok: visible === wantVisible, detail: `${step[kind]} is ${visible ? 'visible' : 'not visible'}` };
      }, timeout, clock);
      return { ...result, expected: `${kind}: ${step[kind]}` };
    }
    case 'text':
    case 'contains': {
      const expected = asMatcher(step[kind]);
      if (target) {
        // A target may match several elements (every `role=row`); the
        // intent is "one of them carries the text", so read them all —
        // strict mode would throw on `textContent()` and hide the page.
        const result = await until(async () => {
          const texts = typeof target.allTextContents === 'function'
            ? await target.allTextContents().catch(() => [])
            : [await target.textContent().catch(() => null)];
          const hit = texts.find((text) => matches(text, expected, Boolean(step.exact)));
          // Page-controlled text lands in the step record an agent reads:
          // invisible carriers are dropped at capture, like console lines.
          const shown = texts.length === 0 ? '(no match)' : clip(stripHiddenChars(texts.map((t) => String(t || '').trim()).filter(Boolean).join(' | ')), 120);
          return { ok: hit !== undefined, detail: `text of ${step.target} (${texts.length}): "${shown}"` };
        }, timeout, clock);
        return { ...result, expected: `${step.target} contains "${needle(expected)}"` };
      }
      const locator = page.getByText(expected, { exact: Boolean(step.exact) });
      const result = await until(async () => {
        const count = await locator.count().catch(() => 0);
        return { ok: count > 0, detail: count > 0 ? `"${needle(expected)}" found ${count}×` : `"${needle(expected)}" not on page` };
      }, timeout, clock);
      return { ...result, expected: `page shows "${needle(expected)}"` };
    }
    case 'value': {
      if (!target) return { ok: false, detail: 'value needs target', expected: 'value' };
      const expected = asMatcher(step.value);
      const result = await until(async () => {
        const value = await target.inputValue().catch(() => null);
        return { ok: matches(value, expected, true), detail: `value of ${step.target}: "${clip(stripHiddenChars(String(value ?? '')), 120)}"` };
      }, timeout, clock);
      return { ...result, expected: `${step.target} value = "${needle(expected)}"` };
    }
    case 'url': {
      const expected = asMatcher(step.url);
      const result = await until(async () => {
        const current = page.url();
        return { ok: matches(current, expected), detail: `url is ${sanitizeUrl(current)}` };
      }, timeout, clock);
      return { ...result, expected: `url contains "${needle(expected)}"` };
    }
    case 'title': {
      const expected = asMatcher(step.title);
      const result = await until(async () => {
        const current = await page.title().catch(() => '');
        return { ok: matches(current, expected), detail: `title is "${clip(current, 120)}"` };
      }, timeout, clock);
      return { ...result, expected: `title contains "${needle(expected)}"` };
    }
    case 'count':
    case 'min': {
      if (!target) return { ok: false, detail: `${kind} needs target`, expected: kind };
      const expected = Number(step[kind]);
      const result = await until(async () => {
        const count = await target.count().catch(() => 0);
        return { ok: kind === 'count' ? count === expected : count >= expected, detail: `${step.target} count = ${count}` };
      }, timeout, clock);
      return { ...result, expected: `${step.target} ${kind === 'count' ? '=' : '>='} ${expected}` };
    }
    case 'enabled':
    case 'disabled': {
      const locator = locatorFor(page, step[kind]);
      const result = await until(async () => {
        const enabled = await locator.isEnabled().catch(() => false);
        return { ok: enabled === (kind === 'enabled'), detail: `${step[kind]} is ${enabled ? 'enabled' : 'disabled'}` };
      }, timeout, clock);
      return { ...result, expected: `${kind}: ${step[kind]}` };
    }
    case 'checked': {
      const locator = locatorFor(page, step.checked);
      const result = await until(async () => {
        const checked = await locator.isChecked().catch(() => false);
        return { ok: checked === true, detail: `${step.checked} is ${checked ? 'checked' : 'unchecked'}` };
      }, timeout, clock);
      return { ...result, expected: `checked: ${step.checked}` };
    }
    default:
      return { ok: false, detail: 'unsupported expect', expected: kind };
  }
}

async function ariaSnapshot(page, target) {
  const locator = target ? locatorFor(page, target) : page.locator('body');
  if (typeof locator.ariaSnapshot === 'function') {
    return locator.ariaSnapshot();
  }
  if (page.accessibility && typeof page.accessibility.snapshot === 'function') {
    const tree = await page.accessibility.snapshot();
    const lines = [];
    const walk = (node, depth) => {
      if (!node) return;
      lines.push(`${'  '.repeat(depth)}- ${node.role}${node.name ? ` "${node.name}"` : ''}`);
      for (const child of node.children || []) walk(child, depth + 1);
    };
    walk(tree, 0);
    return lines.join('\n');
  }
  return '';
}

// The preview is what an agent reads: the page's text minus the invisible
// carriers (zero-width, bidi) a hostile page hides instructions behind. The
// artifact file beside the report keeps the verbatim tree.
function previewSnapshot(text, maxLines) {
  const lines = stripHiddenChars(String(text || '')).split(/\r?\n/).filter((line) => line.trim() !== '');
  const preview = lines.slice(0, maxLines);
  return { lines: lines.length, preview: preview.join('\n'), truncated: lines.length > maxLines };
}

async function executeStep({ page, step, script, baseUrl, artifactDir, artifactPrefix, network, clock, writeFile }) {
  const timeout = Number(step.timeout) > 0 ? Number(step.timeout) : script.timeout;
  const record = {
    index: step.index,
    do: step.do,
    ids: step.ids,
    note: step.note ? clip(step.note, 200) : undefined,
    target: step.target ? String(step.target) : undefined,
    ok: false,
    ms: 0,
    detail: '',
    url: '',
    artifacts: []
  };
  const boundary = parseBoundary(step.boundary);
  const networkMark = network.rows.length;
  const boundaryCapture = boundary && network.supportsBoundaryCapture ? { boundary, rows: [] } : null;
  if (boundaryCapture) network.activeBoundary = boundaryCapture;
  const started = clock.now();
  try {
    switch (step.do) {
      case 'goto': {
        const url = resolveUrl(step.url, baseUrl);
        await page.goto(url, { waitUntil: step.wait_until || 'load', timeout });
        record.detail = `navigated to ${sanitizeUrl(url)}`;
        break;
      }
      case 'reload':
        await page.reload({ waitUntil: step.wait_until || 'load', timeout });
        record.detail = 'reloaded';
        break;
      case 'back':
        await page.goBack({ waitUntil: step.wait_until || 'load', timeout });
        record.detail = 'went back';
        break;
      case 'click':
      case 'dblclick':
      case 'hover':
      case 'check':
      case 'uncheck': {
        const locator = locatorFor(page, step.target);
        await locator[step.do]({ timeout, ...(step.force ? { force: true } : {}) });
        record.detail = `${step.do} ${step.target}`;
        break;
      }
      case 'fill': {
        const locator = locatorFor(page, step.target);
        await locator.fill(String(step.value), { timeout });
        record.detail = `filled ${step.target} with ${maskedValue(step) ? '(masked)' : `"${clip(step.value, 80)}"`}`;
        break;
      }
      case 'type': {
        const locator = locatorFor(page, step.target);
        await locator.pressSequentially(String(step.value), { timeout, delay: Number(step.delay) || 0 });
        record.detail = `typed into ${step.target} ${maskedValue(step) ? '(masked)' : `"${clip(step.value, 80)}"`}`;
        break;
      }
      case 'press': {
        if (step.target) await locatorFor(page, step.target).press(String(step.key), { timeout });
        else await page.keyboard.press(String(step.key));
        record.detail = `pressed ${step.key}${step.target ? ` on ${step.target}` : ''}`;
        break;
      }
      case 'select': {
        const locator = locatorFor(page, step.target);
        await locator.selectOption(step.value, { timeout });
        record.detail = `selected "${clip(step.value, 80)}" in ${step.target}`;
        break;
      }
      case 'wait': {
        if (step.ms) {
          await clock.wait(Math.min(Number(step.ms), 60000));
          record.detail = `waited ${step.ms}ms`;
        } else if (step.target) {
          await locatorFor(page, step.target).waitFor({ state: step.state || 'visible', timeout });
          record.detail = `${step.target} is ${step.state || 'visible'}`;
        } else if (step.url) {
          const expected = asMatcher(step.url);
          const result = await until(async () => {
            const current = page.url();
            const ok = expected instanceof RegExp ? expected.test(current) : current.includes(String(expected));
            return { ok, detail: `url is ${sanitizeUrl(current)}` };
          }, timeout, clock);
          if (!result.ok) throw new Error(`url never matched "${step.url}" (${result.detail})`);
          record.detail = result.detail;
        } else if (step.text) {
          await page.getByText(asMatcher(step.text), { exact: Boolean(step.exact) }).first().waitFor({ state: 'visible', timeout });
          record.detail = `"${clip(step.text, 80)}" appeared`;
        } else if (step.idle) {
          await page.waitForLoadState('networkidle', { timeout });
          record.detail = 'network idle';
        }
        break;
      }
      case 'expect': {
        const result = await runExpect(page, step, timeout, clock);
        record.expected = result.expected;
        record.detail = result.detail;
        if (!result.ok) throw new Error(`expected ${result.expected}; ${result.detail}`);
        break;
      }
      case 'snapshot': {
        const text = await ariaSnapshot(page, step.target);
        const preview = previewSnapshot(text, clampLines(step.max_lines || script.snapshot_lines));
        record.snapshot = preview;
        record.detail = `aria snapshot: ${preview.lines} lines${preview.truncated ? ` (preview ${clampLines(step.max_lines || script.snapshot_lines)})` : ''}`;
        if (artifactDir) {
          const file = path.join(artifactDir, `${artifactPrefix}-step-${pad(step.index)}-snapshot.aria.txt`);
          await writeFile(file, `${text}\n`);
          record.artifacts.push(file);
        }
        break;
      }
      case 'screenshot': {
        if (artifactDir) {
          const label = step.name ? `-${String(step.name).replace(/[^\w.-]+/g, '-')}` : '';
          const file = path.join(artifactDir, `${artifactPrefix}-step-${pad(step.index)}${label}.png`);
          await page.screenshot({ path: file, fullPage: Boolean(step.full_page) });
          record.artifacts.push(file);
          record.detail = `screenshot ${path.basename(file)}`;
        } else {
          record.detail = 'screenshot skipped (no artifact dir)';
        }
        break;
      }
      case 'eval': {
        const value = await page.evaluate(String(step.expression));
        // eval output is page-controlled text headed for the report.
        const text = stripHiddenChars(typeof value === 'string' ? value : String(JSON.stringify(value)));
        record.value = clip(text, 400);
        if (step.equals !== undefined && String(value) !== String(step.equals) && text !== JSON.stringify(step.equals)) {
          throw new Error(`eval returned ${clip(text, 120)}, expected ${JSON.stringify(step.equals)}`);
        }
        if (step.contains !== undefined && !String(text).includes(String(step.contains))) {
          throw new Error(`eval returned ${clip(text, 120)}, expected it to contain ${JSON.stringify(step.contains)}`);
        }
        record.detail = `eval → ${clip(text, 120)}`;
        break;
      }
      default:
        throw new Error(`unsupported action ${step.do}`);
    }

    if (boundary) {
      const settle = Number(step.boundary_wait) > 0 ? Number(step.boundary_wait) : script.boundary_wait;
      const result = await until(async () => {
        const hits = (boundaryCapture ? boundaryCapture.rows : network.rows.slice(networkMark))
          .filter((row) => boundaryHit(boundary, row));
        const answered = hits.filter((row) => row.status !== null);
        if (answered.length === 0) return { ok: false, detail: hits.length > 0 ? `${boundary.raw} requested, no response yet` : `${boundary.raw} not requested` };
        const last = answered[answered.length - 1];
        if (boundary.status !== null) {
          return { ok: last.status === boundary.status, detail: `${boundary.raw}: answered ${last.status}`, status: last.status };
        }
        return { ok: last.status < 400, detail: `${last.method} ${sanitizeUrl(last.url)} → ${last.status}`, status: last.status };
      }, settle, clock);
      record.boundary = { expected: boundary.raw, hit: result.ok, detail: result.detail, status: result.status === undefined ? null : result.status };
      if (!result.ok) throw new Error(`boundary not proven: ${result.detail}`);
    }

    record.ok = true;
  } catch (error) {
    record.ok = false;
    record.error = clip(String(error && error.message || error), 600).replace(/\s*Call log:[\s\S]*$/, '');
  }
  if (boundaryCapture && network.activeBoundary === boundaryCapture) network.activeBoundary = null;
  record.ms = Math.max(0, clock.now() - started);
  try { record.url = sanitizeUrl(page.url()); } catch { record.url = ''; }
  if (step.do === 'goto' && record.ok && LOGIN_WALL_RE.test(record.url) && !LOGIN_WALL_RE.test(String(step.url))) {
    record.warning = 'login_wall';
  }
  return record;
}

function pad(n) {
  return String(n).padStart(2, '0');
}

module.exports = {
  resolveUrl,
  runExpect,
  ariaSnapshot,
  previewSnapshot,
  executeStep,
  pad
};
