'use strict';

// Official Standard API snapshot, verified against the model and pricing pages.
// This is an equivalent token estimate, never a Codex subscription invoice.
const VERIFIED_AT = '2026-09-13T00:00:00.000Z';
const prices = {
  'gpt-5.6-sol': [4, 0.4, 5, 20],
  'gpt-6-astra': [10, 1, 12.5, 50]
};

function officialOpenAiTariff(host, model) {
  if (host !== 'codex' || !Object.hasOwn(prices, model)) return null;
  const [input, read, write, output] = prices[model];
  return {
    id: model, provider: 'openai', source: `https://developers.openai.com/api/docs/models/${model}`,
    fetched_at: VERIFIED_AT, verification: 'bundled_official_snapshot', currency: 'USD', unit: 'token',
    service_tier: 'standard',
    rates: { input: input / 1e6, cache_read: read / 1e6, cache_write: write / 1e6, output: output / 1e6 },
    long_context: { threshold: 272000, input_multiplier: 2, output_multiplier: 1.5 },
    excluded: ['tools', 'regional_uplift', 'other_service_tiers', 'subscription_charges']
  };
}

module.exports = { officialOpenAiTariff };
