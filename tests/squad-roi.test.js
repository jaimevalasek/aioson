'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { openRuntimeDb, upsertSquadMetric, listSquadMetrics, upsertROIConfig, getROIConfig, deleteROIConfig } = require('../src/runtime-store');
const { calculateROI, renderReportHtml, esc } = require('../src/commands/squad-roi');

async function makeTempDir() {
  return fs.mkdtemp(path.join(os.tmpdir(), 'aioson-roi-'));
}

// --- esc ---

test('esc escapes HTML characters', () => {
  assert.equal(esc('<script>alert("xss")</script>'), '&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;');
  assert.equal(esc('hello & world'), 'hello &amp; world');
  assert.equal(esc(null), '');
  assert.equal(esc(''), '');
});

// --- squad_roi_config table ---

test('squad_roi_config table is created by openRuntimeDb', async () => {
  const tmpDir = await makeTempDir();
  try {
    const { db } = await openRuntimeDb(tmpDir);
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='squad_roi_config'").all();
    assert.equal(tables.length, 1);
    db.close();
  } finally {
    await fs.rm(tmpDir, { recursive: true, maxRetries: 5, retryDelay: 50 });
  }
});

test('upsertROIConfig and getROIConfig roundtrip', async () => {
  const tmpDir = await makeTempDir();
  try {
    const { db } = await openRuntimeDb(tmpDir);
    upsertROIConfig(db, {
      squadSlug: 'odonto',
      pricingModel: 'hybrid',
      setupFee: 15000,
      monthlyFee: 2000,
      percentageFee: 10,
      percentageBase: 'revenue_saved',
      currency: 'BRL',
      contractMonths: 12
    });
    const config = getROIConfig(db, 'odonto');
    assert.ok(config);
    assert.equal(config.pricing_model, 'hybrid');
    assert.equal(config.setup_fee, 15000);
    assert.equal(config.monthly_fee, 2000);
    assert.equal(config.percentage_fee, 10);
    assert.equal(config.percentage_base, 'revenue_saved');
    assert.equal(config.currency, 'BRL');
    assert.equal(config.contract_months, 12);
    db.close();
  } finally {
    await fs.rm(tmpDir, { recursive: true, maxRetries: 5, retryDelay: 50 });
  }
});

test('upsertROIConfig updates existing config', async () => {
  const tmpDir = await makeTempDir();
  try {
    const { db } = await openRuntimeDb(tmpDir);
    upsertROIConfig(db, { squadSlug: 'x', pricingModel: 'fixed', monthlyFee: 1000 });
    upsertROIConfig(db, { squadSlug: 'x', pricingModel: 'percentage', monthlyFee: 500, percentageFee: 15 });
    const config = getROIConfig(db, 'x');
    assert.equal(config.pricing_model, 'percentage');
    assert.equal(config.monthly_fee, 500);
    assert.equal(config.percentage_fee, 15);
    db.close();
  } finally {
    await fs.rm(tmpDir, { recursive: true, maxRetries: 5, retryDelay: 50 });
  }
});

test('deleteROIConfig removes config', async () => {
  const tmpDir = await makeTempDir();
  try {
    const { db } = await openRuntimeDb(tmpDir);
    upsertROIConfig(db, { squadSlug: 'del', pricingModel: 'fixed' });
    assert.ok(getROIConfig(db, 'del'));
    deleteROIConfig(db, 'del');
    assert.equal(getROIConfig(db, 'del'), undefined);
    db.close();
  } finally {
    await fs.rm(tmpDir, { recursive: true, maxRetries: 5, retryDelay: 50 });
  }
});

test('getROIConfig returns undefined for missing', async () => {
  const tmpDir = await makeTempDir();
  try {
    const { db } = await openRuntimeDb(tmpDir);
    assert.equal(getROIConfig(db, 'nonexistent'), undefined);
    db.close();
  } finally {
    await fs.rm(tmpDir, { recursive: true, maxRetries: 5, retryDelay: 50 });
  }
});

// --- calculateROI ---

test('calculateROI returns null without config', () => {
  assert.equal(calculateROI([], null), null);
});

test('calculateROI computes improvements from metrics', () => {
  const metrics = [
    { metric_key: 'no_show_rate', metric_value: 8, baseline: 20, target: 5, metric_unit: '%', period: '2026-03' },
    { metric_key: 'revenue', metric_value: 50000, baseline: 40000, target: 60000, metric_unit: 'BRL', period: '2026-03' }
  ];
  const config = {
    pricing_model: 'hybrid',
    setup_fee: 12000,
    monthly_fee: 2000,
    contract_months: 12,
    currency: 'BRL'
  };
  const roi = calculateROI(metrics, config);
  assert.ok(roi);
  assert.equal(roi.improvements.length, 2);
  assert.equal(roi.improvements[0].key, 'no_show_rate');
  assert.equal(roi.improvements[0].improvement, 12); // 20 - 8
  assert.equal(roi.improvements[1].improvement, -10000); // 40000 - 50000 (higher is better)
  assert.equal(roi.monthly_cost, 3000); // 2000 + 12000/12
});

test('calculateROI skips metrics without baseline', () => {
  const metrics = [
    { metric_key: 'clicks', metric_value: 100, baseline: null, target: null }
  ];
  const config = { monthly_fee: 500, setup_fee: 0, contract_months: 12 };
  const roi = calculateROI(metrics, config);
  assert.equal(roi.improvements.length, 0);
});

// --- renderReportHtml ---

test('renderReportHtml generates valid HTML', () => {
  const metrics = [
    { metric_key: 'no_show_rate', metric_value: 8, baseline: 20, target: 5, metric_unit: '%', period: '2026-03' }
  ];
  const config = {
    pricing_model: 'hybrid',
    setup_fee: 12000,
    monthly_fee: 2000,
    contract_months: 12,
    currency: 'BRL'
  };
  const html = renderReportHtml('odonto', metrics, config);
  assert.ok(html.includes('<!DOCTYPE html>'));
  assert.ok(html.includes('ROI Report'));
  assert.ok(html.includes('odonto'));
  assert.ok(html.includes('no_show_rate'));
  assert.ok(html.includes('BRL'));
});

test('renderReportHtml works without config', () => {
  const metrics = [
    { metric_key: 'test', metric_value: 42, baseline: null, target: null, metric_unit: null, period: null }
  ];
  const html = renderReportHtml('test-squad', metrics, null);
  assert.ok(html.includes('test'));
  assert.ok(!html.includes('Cost Summary'));
});

// --- Integration with squad_metrics table ---

test('squad_metrics CRUD works for ROI tracking', async () => {
  const tmpDir = await makeTempDir();
  try {
    const { db } = await openRuntimeDb(tmpDir);
    upsertSquadMetric(db, {
      squadSlug: 'roi-test',
      metricKey: 'no_show_rate',
      value: 8,
      unit: '%',
      period: '2026-03',
      baseline: 20,
      target: 5,
      source: 'manual',
      notes: 'First measurement'
    });
    upsertSquadMetric(db, {
      squadSlug: 'roi-test',
      metricKey: 'revenue',
      value: 50000,
      unit: 'BRL',
      period: '2026-03',
      baseline: 40000,
      target: 60000,
      source: 'worker'
    });
    const metrics = listSquadMetrics(db, 'roi-test');
    assert.equal(metrics.length, 2);
    assert.ok(metrics.some(m => m.metric_key === 'no_show_rate'));
    assert.ok(metrics.some(m => m.metric_key === 'revenue'));
    db.close();
  } finally {
    await fs.rm(tmpDir, { recursive: true, maxRetries: 5, retryDelay: 50 });
  }
});
