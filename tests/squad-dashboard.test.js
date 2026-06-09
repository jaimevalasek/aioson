'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { openRuntimeDb, upsertSquadManifest, upsertSquadMetric, listSquadMetrics } = require('../src/runtime-store');
const { cleanupTmpDir } = require('./helpers/sqlite-cleanup');
const { createDashboardServer } = require('../src/squad-dashboard/server');
const { detectPanels, loadSquadList } = require('../src/squad-dashboard/api');
const { renderHomePage, renderSquadPage, esc } = require('../src/squad-dashboard/renderer');
const { getInlineCSS, getInlineJS } = require('../src/squad-dashboard/styles');

async function makeTempDir() {
  return fs.mkdtemp(path.join(os.tmpdir(), 'aioson-squad-dashboard-'));
}

async function setupSquadDir(tmpDir, slug, manifest) {
  const squadsDir = path.join(tmpDir, '.aioson', 'squads', slug);
  await fs.mkdir(squadsDir, { recursive: true });
  await fs.writeFile(
    path.join(squadsDir, 'squad.manifest.json'),
    JSON.stringify(manifest, null, 2)
  );
  return squadsDir;
}

function fetchUrl(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => resolve({ statusCode: res.statusCode, body: data, headers: res.headers }));
    }).on('error', reject);
  });
}

// --- Unit tests: esc ---

test('esc escapes HTML characters', () => {
  assert.equal(esc('<script>alert("xss")</script>'), '&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;');
  assert.equal(esc('a & b'), 'a &amp; b');
  assert.equal(esc(null), '');
  assert.equal(esc(undefined), '');
});

// --- Unit tests: styles ---

test('getInlineCSS returns CSS string', () => {
  const css = getInlineCSS();
  assert.ok(css.includes(':root'));
  assert.ok(css.includes('--bg'));
  assert.ok(css.includes('.sidebar'));
});

test('getInlineJS returns JS string', () => {
  const js = getInlineJS();
  assert.ok(js.includes('tab'));
  assert.ok(js.includes('fetch'));
});

// --- Unit tests: detectPanels ---

test('detectPanels returns base panels for null manifest', () => {
  const panels = detectPanels(null);
  assert.ok(panels.includes('overview'));
  assert.ok(panels.includes('content'));
  assert.ok(panels.includes('learnings'));
  assert.ok(panels.includes('metrics'));
});

test('detectPanels adds content-preview for content mode', () => {
  const panels = detectPanels({ mode: 'content' });
  assert.ok(panels.includes('content-preview'));
});

test('detectPanels adds tasks for software mode', () => {
  const panels = detectPanels({ mode: 'software' });
  assert.ok(panels.includes('tasks'));
});

test('detectPanels adds integrations when webhooks exist', () => {
  const panels = detectPanels({
    mode: 'mixed',
    outputStrategy: { delivery: { webhooks: [{ slug: 'test', url: 'http://test', trigger: 'on-create' }] } }
  });
  assert.ok(panels.includes('integrations'));
});

test('detectPanels adds channels for whatsapp MCP', () => {
  const panels = detectPanels({
    mode: 'mixed',
    mcps: [{ slug: 'whatsapp-business', title: 'WhatsApp' }]
  });
  assert.ok(panels.includes('channels'));
  assert.ok(panels.includes('integrations'));
});

// --- Unit tests: renderer ---

test('renderHomePage renders HTML with empty squads', () => {
  const html = renderHomePage([]);
  assert.ok(html.includes('<!DOCTYPE html>'));
  assert.ok(html.includes('No squads found'));
});

test('renderHomePage renders HTML with squads', () => {
  const html = renderHomePage([
    { slug: 'test-squad', name: 'Test Squad', mode: 'content', goal: 'Test goal', status: 'active', executorCount: 3 }
  ]);
  assert.ok(html.includes('Test Squad'));
  assert.ok(html.includes('test-squad'));
  assert.ok(html.includes('content'));
});

test('renderSquadPage renders tabs for panels', () => {
  const squad = { slug: 'demo', name: 'Demo', mode: 'content', manifest: null };
  const panels = ['overview', 'content'];
  const data = {
    overview: { contentItems: 5, sessions: 2, learnings: 1, deliveryRate: 95, learningStats: { active: 1, stale: 0, archived: 0, promoted: 0 }, executionPlan: null, pipelineInfo: null, customMetrics: [] },
    content: [],
    learnings: [],
    deliveries: [],
    events: [],
    customMetrics: []
  };
  const html = renderSquadPage(squad, panels, data, [squad]);
  assert.ok(html.includes('Overview'));
  assert.ok(html.includes('Content'));
  assert.ok(html.includes('panel-overview'));
});

// --- Integration tests: loadSquadList ---

test('loadSquadList returns empty array when no squads dir', async () => {
  const tmpDir = await makeTempDir();
  try {
    const squads = await loadSquadList(tmpDir);
    assert.deepEqual(squads, []);
  } finally {
    await fs.rm(tmpDir, { recursive: true, maxRetries: 5, retryDelay: 50 });
  }
});

test('loadSquadList reads squad manifest', async () => {
  const tmpDir = await makeTempDir();
  try {
    await setupSquadDir(tmpDir, 'marketing-odonto', {
      name: 'Marketing Odonto',
      mode: 'content',
      goal: 'Increase appointments',
      executors: [{ slug: 'copywriter' }, { slug: 'strategist' }]
    });
    const squads = await loadSquadList(tmpDir);
    assert.equal(squads.length, 1);
    assert.equal(squads[0].slug, 'marketing-odonto');
    assert.equal(squads[0].name, 'Marketing Odonto');
    assert.equal(squads[0].mode, 'content');
    assert.equal(squads[0].executorCount, 2);
  } finally {
    await fs.rm(tmpDir, { recursive: true, maxRetries: 5, retryDelay: 50 });
  }
});

// --- Integration tests: squad_metrics table ---

test('upsertSquadMetric inserts and retrieves metrics', async () => {
  const tmpDir = await makeTempDir();
  let handle = null;
  try {
    handle = await openRuntimeDb(tmpDir);
    upsertSquadMetric(handle.db, {
      squadSlug: 'odonto',
      metricKey: 'no_show_rate',
      value: 8,
      unit: '%',
      period: '2026-03',
      baseline: 20,
      target: 5,
      source: 'manual'
    });
    const metrics = listSquadMetrics(handle.db, 'odonto');
    assert.equal(metrics.length, 1);
    assert.equal(metrics[0].metric_key, 'no_show_rate');
    assert.equal(metrics[0].metric_value, 8);
    assert.equal(metrics[0].baseline, 20);
    assert.equal(metrics[0].target, 5);
  } finally {
    await cleanupTmpDir(tmpDir, { handles: [handle] });
  }
});

test('upsertSquadMetric updates on conflict', async () => {
  const tmpDir = await makeTempDir();
  let handle = null;
  try {
    handle = await openRuntimeDb(tmpDir);
    upsertSquadMetric(handle.db, { squadSlug: 'odonto', metricKey: 'no_show_rate', value: 20, unit: '%', period: '2026-03', baseline: 25 });
    upsertSquadMetric(handle.db, { squadSlug: 'odonto', metricKey: 'no_show_rate', value: 8, unit: '%', period: '2026-03' });
    const metrics = listSquadMetrics(handle.db, 'odonto');
    assert.equal(metrics.length, 1);
    assert.equal(metrics[0].metric_value, 8);
    assert.equal(metrics[0].baseline, 25); // preserved from first insert
  } finally {
    await cleanupTmpDir(tmpDir, { handles: [handle] });
  }
});

test('listSquadMetrics filters by period', async () => {
  const tmpDir = await makeTempDir();
  let handle = null;
  try {
    handle = await openRuntimeDb(tmpDir);
    upsertSquadMetric(handle.db, { squadSlug: 'odonto', metricKey: 'rate', value: 10, period: '2026-02' });
    upsertSquadMetric(handle.db, { squadSlug: 'odonto', metricKey: 'rate', value: 8, period: '2026-03' });
    const march = listSquadMetrics(handle.db, 'odonto', '2026-03');
    assert.equal(march.length, 1);
    assert.equal(march[0].metric_value, 8);
    const all = listSquadMetrics(handle.db, 'odonto');
    assert.equal(all.length, 2);
  } finally {
    await cleanupTmpDir(tmpDir, { handles: [handle] });
  }
});

// --- Integration test: HTTP server ---

test('dashboard server serves home page', async () => {
  const tmpDir = await makeTempDir();
  let handle = null;
  try {
    await setupSquadDir(tmpDir, 'test-squad', {
      name: 'Test Squad',
      mode: 'content',
      goal: 'Testing',
      executors: [{ slug: 'agent1' }]
    });
    // Init runtime DB
    handle = await openRuntimeDb(tmpDir);

    const dashboard = createDashboardServer(tmpDir, { port: 0 });
    const { port } = await dashboard.start();

    try {
      const res = await fetchUrl(`http://127.0.0.1:${port}/`);
      assert.equal(res.statusCode, 200);
      assert.ok(res.body.includes('Test Squad'));
      assert.ok(res.body.includes('Squad Dashboard'));
    } finally {
      await dashboard.stop();
    }
  } finally {
    await cleanupTmpDir(tmpDir, { handles: [handle] });
  }
});

test('dashboard server serves squad detail page', async () => {
  const tmpDir = await makeTempDir();
  let handle = null;
  try {
    await setupSquadDir(tmpDir, 'marketing', {
      name: 'Marketing',
      mode: 'content',
      goal: 'Grow revenue',
      executors: [{ slug: 'writer' }, { slug: 'designer' }]
    });
    handle = await openRuntimeDb(tmpDir);

    const dashboard = createDashboardServer(tmpDir, { port: 0 });
    const { port } = await dashboard.start();

    try {
      const res = await fetchUrl(`http://127.0.0.1:${port}/squad/marketing`);
      assert.equal(res.statusCode, 200);
      assert.ok(res.body.includes('Marketing'));
      assert.ok(res.body.includes('Overview'));
      assert.ok(res.body.includes('Content'));
    } finally {
      await dashboard.stop();
    }
  } finally {
    await cleanupTmpDir(tmpDir, { handles: [handle] });
  }
});

test('dashboard server serves JSON API', async () => {
  const tmpDir = await makeTempDir();
  let handle = null;
  try {
    await setupSquadDir(tmpDir, 'api-test', { name: 'API Test', mode: 'software', executors: [] });
    handle = await openRuntimeDb(tmpDir);

    const dashboard = createDashboardServer(tmpDir, { port: 0 });
    const { port } = await dashboard.start();

    try {
      const res = await fetchUrl(`http://127.0.0.1:${port}/api/squad/api-test/data.json`);
      assert.equal(res.statusCode, 200);
      const data = JSON.parse(res.body);
      assert.ok('overview' in data);
      assert.ok('metrics' in data);
    } finally {
      await dashboard.stop();
    }
  } finally {
    await cleanupTmpDir(tmpDir, { handles: [handle] });
  }
});

test('dashboard server returns 404 for unknown squad', async () => {
  const tmpDir = await makeTempDir();
  let handle = null;
  try {
    handle = await openRuntimeDb(tmpDir);
    const dashboard = createDashboardServer(tmpDir, { port: 0 });
    const { port } = await dashboard.start();
    try {
      const res = await fetchUrl(`http://127.0.0.1:${port}/squad/nonexistent`);
      assert.equal(res.statusCode, 404);
    } finally {
      await dashboard.stop();
    }
  } finally {
    await cleanupTmpDir(tmpDir, { handles: [handle] });
  }
});

test('dashboard server returns squads list via API', async () => {
  const tmpDir = await makeTempDir();
  let handle = null;
  try {
    await setupSquadDir(tmpDir, 'squad-a', { name: 'A', mode: 'content', executors: [] });
    await setupSquadDir(tmpDir, 'squad-b', { name: 'B', mode: 'software', executors: [] });
    handle = await openRuntimeDb(tmpDir);

    const dashboard = createDashboardServer(tmpDir, { port: 0 });
    const { port } = await dashboard.start();

    try {
      const res = await fetchUrl(`http://127.0.0.1:${port}/api/squads`);
      assert.equal(res.statusCode, 200);
      const data = JSON.parse(res.body);
      assert.equal(data.squads.length, 2);
    } finally {
      await dashboard.stop();
    }
  } finally {
    await cleanupTmpDir(tmpDir, { handles: [handle] });
  }
});
