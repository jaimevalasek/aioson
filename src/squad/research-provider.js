'use strict';

const { fetchPage } = require('../web');

function normalizeCandidate(candidate) {
  if (typeof candidate === 'string') return { url: candidate };
  if (!candidate || typeof candidate !== 'object' || !candidate.url) return null;
  return {
    url: String(candidate.url),
    title: candidate.title ? String(candidate.title) : null,
    published_at: candidate.published_at || candidate.publishedAt || null,
    primary: candidate.primary,
    independent: candidate.independent
  };
}

function normalizeCandidates(candidates, limit) {
  const seen = new Set();
  const normalized = [];
  for (const value of candidates || []) {
    const candidate = normalizeCandidate(value);
    if (!candidate || seen.has(candidate.url)) continue;
    seen.add(candidate.url);
    normalized.push(candidate);
    if (normalized.length >= limit) break;
  }
  return normalized;
}

function createResearchProvider(options = {}) {
  const searchImpl = options.search;
  const fetchPageImpl = options.fetchPage || fetchPage;
  const providerEndpoint = options.providerEndpoint || process.env.AIOSON_RESEARCH_PROVIDER_URL || null;
  const fetchImpl = options.fetch || globalThis.fetch;

  return {
    async discover(query, discoverOptions = {}) {
      const limit = Math.min(Math.max(Number(discoverOptions.limit || 5), 1), 10);
      if (typeof searchImpl === 'function') {
        const result = await searchImpl(query, { limit });
        return {
          available: true,
          source: 'injected-provider',
          candidates: normalizeCandidates(result?.results || result, limit)
        };
      }

      if (providerEndpoint) {
        try {
          const endpoint = new URL(providerEndpoint);
          endpoint.searchParams.set('q', query);
          endpoint.searchParams.set('limit', String(limit));
          const response = await fetchImpl(endpoint, {
            headers: { accept: 'application/json' },
            signal: AbortSignal.timeout(Number(discoverOptions.timeoutMs || 10000))
          });
          if (!response.ok) {
            return { available: false, source: 'provider-endpoint', reason: `provider_http_${response.status}`, candidates: [] };
          }
          const payload = await response.json();
          return {
            available: true,
            source: 'provider-endpoint',
            candidates: normalizeCandidates(payload.results || payload.sources || [], limit)
          };
        } catch (error) {
          return { available: false, source: 'provider-endpoint', reason: error.message, candidates: [] };
        }
      }

      const configured = normalizeCandidates(discoverOptions.urls || [], limit);
      if (configured.length > 0) {
        return {
          available: true,
          source: 'declared-sources',
          candidates: configured
        };
      }

      return {
        available: false,
        source: 'none',
        reason: 'research_provider_unavailable',
        candidates: []
      };
    },

    async fetch(candidate, fetchOptions = {}) {
      const normalized = normalizeCandidate(candidate);
      if (!normalized) return { ok: false, error: 'invalid_source_candidate' };
      try {
        const page = await fetchPageImpl(normalized.url, {
          timeoutMs: fetchOptions.timeoutMs || 15000,
          maxHtmlChars: fetchOptions.maxHtmlChars || 100000,
          extractLinks: false,
          safeRemote: true
        });
        return {
          ...normalized,
          ...page,
          ok: Boolean(page?.ok)
        };
      } catch (error) {
        return {
          ...normalized,
          ok: false,
          error: error.message
        };
      }
    }
  };
}

module.exports = {
  normalizeCandidate,
  normalizeCandidates,
  createResearchProvider
};
