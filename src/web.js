'use strict';

const dns = require('node:dns/promises');
const net = require('node:net');

const DEFAULT_TIMEOUT_MS = 10000;
const DEFAULT_MAX_HTML_CHARS = 500000;
const DEFAULT_USER_AGENT = 'AIOSON-Web/1.0 (+https://aioson.dev)';

function ensureValidUrl(input) {
  try {
    return new URL(String(input || '').trim());
  } catch {
    throw new Error(`Invalid URL: ${input || ''}`);
  }
}

function isPrivateIpAddress(address) {
  const normalized = String(address || '').toLowerCase();
  const family = net.isIP(normalized);
  if (family === 4) {
    const octets = normalized.split('.').map(Number);
    return octets[0] === 0
      || octets[0] === 10
      || octets[0] === 127
      || (octets[0] === 169 && octets[1] === 254)
      || (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31)
      || (octets[0] === 192 && octets[1] === 168)
      || (octets[0] === 100 && octets[1] >= 64 && octets[1] <= 127)
      || octets[0] >= 224;
  }
  if (family === 6) {
    return normalized === '::'
      || normalized === '::1'
      || normalized.startsWith('fc')
      || normalized.startsWith('fd')
      || normalized.startsWith('fe8')
      || normalized.startsWith('fe9')
      || normalized.startsWith('fea')
      || normalized.startsWith('feb')
      || normalized.startsWith('::ffff:127.')
      || normalized.startsWith('::ffff:10.')
      || normalized.startsWith('::ffff:192.168.');
  }
  return false;
}

async function assertSafeRemoteUrl(input, options = {}) {
  const url = ensureValidUrl(input);
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error(`Unsafe remote URL scheme: ${url.protocol}`);
  }
  if (url.username || url.password) {
    throw new Error('Remote URLs with embedded credentials are not allowed');
  }
  const hostname = url.hostname.toLowerCase().replace(/\.$/, '');
  if (hostname === 'localhost' || hostname.endsWith('.localhost') || hostname.endsWith('.local')) {
    throw new Error(`Private remote host is not allowed: ${hostname}`);
  }
  if (net.isIP(hostname)) {
    if (isPrivateIpAddress(hostname)) throw new Error(`Private remote address is not allowed: ${hostname}`);
    return url;
  }
  const lookup = options.lookup || dns.lookup;
  const addresses = await lookup(hostname, { all: true, verbatim: true });
  if (!Array.isArray(addresses) || addresses.length === 0) {
    throw new Error(`Remote host did not resolve: ${hostname}`);
  }
  if (addresses.some((entry) => isPrivateIpAddress(entry.address))) {
    throw new Error(`Remote host resolves to a private address: ${hostname}`);
  }
  return url;
}

function normalizeUrl(input) {
  const url = input instanceof URL ? new URL(input.toString()) : ensureValidUrl(input);
  url.hash = '';
  if ((url.protocol === 'http:' && url.port === '80') || (url.protocol === 'https:' && url.port === '443')) {
    url.port = '';
  }
  const normalized = url.toString();
  return normalized.endsWith('/') ? normalized.slice(0, -1) : normalized;
}

function decodeHtmlEntities(text) {
  return String(text || '')
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>');
}

function stripTags(html) {
  return decodeHtmlEntities(String(html || '').replace(/<[^>]+>/g, ' '));
}

function cleanWhitespace(text) {
  return String(text || '')
    .replace(/\r/g, '')
    .replace(/\t/g, ' ')
    .replace(/[ \u00A0]+\n/g, '\n')
    .replace(/\n[ \u00A0]+/g, '\n')
    .replace(/[ \u00A0]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function extractTagContent(html, tagName) {
  const match = String(html || '').match(new RegExp(`<${tagName}[^>]*>([\\s\\S]*?)<\\/${tagName}>`, 'i'));
  return match ? match[1] : '';
}

function extractTitle(html) {
  return cleanWhitespace(stripTags(extractTagContent(html, 'title')));
}

function extractMetaContent(html, name) {
  const match = String(html || '').match(new RegExp(`<meta[^>]+(?:name|property)=['\"]${name}['\"][^>]+content=['\"]([^'\"]+)['\"][^>]*>`, 'i'));
  return match ? decodeHtmlEntities(match[1]).trim() : '';
}

function extractCanonical(html) {
  const match = String(html || '').match(/<link[^>]+rel=['\"]canonical['\"][^>]+href=['\"]([^'\"]+)['\"][^>]*>/i);
  return match ? match[1].trim() : '';
}

function extractMainHtml(html) {
  const source = String(html || '');
  const patterns = [
    /<main\b[^>]*>([\s\S]*?)<\/main>/i,
    /<article\b[^>]*>([\s\S]*?)<\/article>/i,
    /<div\b[^>]*role=['\"]main['\"][^>]*>([\s\S]*?)<\/div>/i,
    /<body\b[^>]*>([\s\S]*?)<\/body>/i
  ];

  for (const pattern of patterns) {
    const match = source.match(pattern);
    if (match && match[1]) return match[1];
  }
  return source;
}

function htmlToMarkdown(html) {
  let output = String(html || '');
  output = output.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ');
  output = output.replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ');
  output = output.replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, ' ');
  output = output.replace(/<svg\b[^>]*>[\s\S]*?<\/svg>/gi, ' ');
  output = output.replace(/<h1\b[^>]*>([\s\S]*?)<\/h1>/gi, '\n# $1\n\n');
  output = output.replace(/<h2\b[^>]*>([\s\S]*?)<\/h2>/gi, '\n## $1\n\n');
  output = output.replace(/<h3\b[^>]*>([\s\S]*?)<\/h3>/gi, '\n### $1\n\n');
  output = output.replace(/<h4\b[^>]*>([\s\S]*?)<\/h4>/gi, '\n#### $1\n\n');
  output = output.replace(/<h5\b[^>]*>([\s\S]*?)<\/h5>/gi, '\n##### $1\n\n');
  output = output.replace(/<h6\b[^>]*>([\s\S]*?)<\/h6>/gi, '\n###### $1\n\n');
  output = output.replace(/<li\b[^>]*>([\s\S]*?)<\/li>/gi, '\n- $1');
  output = output.replace(/<(p|div|section|article|main|header|footer|aside|blockquote)\b[^>]*>/gi, '\n');
  output = output.replace(/<\/(p|div|section|article|main|header|footer|aside|blockquote)>/gi, '\n');
  output = output.replace(/<br\s*\/?>/gi, '\n');
  output = output.replace(/<a\b[^>]*href=['\"]([^'\"]+)['\"][^>]*>([\s\S]*?)<\/a>/gi, '$2 ($1)');
  output = stripTags(output);
  return cleanWhitespace(output);
}

function htmlToText(html) {
  return cleanWhitespace(stripTags(String(html || '')
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|section|article|main|header|footer|aside|li|ul|ol|h1|h2|h3|h4|h5|h6)>/gi, '\n')));
}

function resolveHref(href, pageUrl) {
  const value = String(href || '').trim();
  if (!value || value.startsWith('#') || value.startsWith('mailto:') || value.startsWith('tel:') || value.startsWith('javascript:')) {
    return '';
  }

  try {
    return normalizeUrl(new URL(value, pageUrl));
  } catch {
    return '';
  }
}

function extractLinks(html, pageUrl, options = {}) {
  const sameOriginOnly = options.sameOriginOnly !== false;
  const base = ensureValidUrl(pageUrl);
  const links = new Set();
  const pattern = /<a\b[^>]*href=['\"]([^'\"]+)['\"][^>]*>/gi;
  let match;

  while ((match = pattern.exec(String(html || ''))) !== null) {
    const normalized = resolveHref(match[1], base);
    if (!normalized) continue;
    if (sameOriginOnly) {
      try {
        if (new URL(normalized).origin !== base.origin) continue;
      } catch {
        continue;
      }
    }
    links.add(normalized);
  }

  return Array.from(links).sort();
}

async function fetchPage(url, options = {}) {
  const timeoutMs = Number(options.timeoutMs) > 0 ? Number(options.timeoutMs) : DEFAULT_TIMEOUT_MS;
  const maxHtmlChars = Number(options.maxHtmlChars) > 0 ? Number(options.maxHtmlChars) : DEFAULT_MAX_HTML_CHARS;
  const headers = {
    'user-agent': options.userAgent || DEFAULT_USER_AGENT,
    'accept': 'text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.8',
    ...(options.headers || {})
  };

  const fetchImpl = options.fetch || globalThis.fetch;
  const safeRemote = options.safeRemote === true;
  const maxRedirects = Math.min(Math.max(Number(options.maxRedirects || 5), 0), 10);
  let currentUrl = String(url);
  let response;
  for (let redirectCount = 0; redirectCount <= maxRedirects; redirectCount++) {
    if (safeRemote) {
      await assertSafeRemoteUrl(currentUrl, { lookup: options.lookup });
    }
    response = await fetchImpl(currentUrl, {
      method: 'GET',
      headers,
      redirect: safeRemote ? 'manual' : 'follow',
      signal: AbortSignal.timeout(timeoutMs)
    });
    if (!safeRemote || response.status < 300 || response.status >= 400) break;
    const location = response.headers.get('location');
    if (!location) break;
    if (redirectCount === maxRedirects) throw new Error(`Too many redirects for ${url}`);
    currentUrl = new URL(location, currentUrl).toString();
  }

  const finalUrl = normalizeUrl(response.url || url);
  const contentType = response.headers.get('content-type') || '';
  const rawText = await response.text();
  const html = rawText.length > maxHtmlChars ? rawText.slice(0, maxHtmlChars) : rawText;

  return {
    ok: response.ok,
    url: finalUrl,
    statusCode: response.status,
    contentType,
    html,
    truncated: rawText.length > html.length
  };
}

async function scrapePage(url, options = {}) {
  const page = await fetchPage(url, options);
  const mainHtml = extractMainHtml(page.html);
  const title = extractTitle(page.html);
  const description = extractMetaContent(page.html, 'description') || extractMetaContent(page.html, 'og:description');
  const canonical = extractCanonical(page.html);
  const links = extractLinks(page.html, page.url, { sameOriginOnly: options.sameOriginOnly !== false });
  const text = htmlToText(mainHtml);
  const markdown = htmlToMarkdown(mainHtml);

  return {
    ok: page.ok,
    url: page.url,
    statusCode: page.statusCode,
    contentType: page.contentType,
    title,
    description,
    canonical,
    html: mainHtml,
    text,
    markdown,
    links,
    truncated: page.truncated
  };
}

async function mapWebsite(url, options = {}) {
  const startUrl = normalizeUrl(url);
  const start = ensureValidUrl(startUrl);
  const maxDepth = Number(options.maxDepth) >= 0 ? Number(options.maxDepth) : 2;
  const maxPages = Number(options.maxPages) > 0 ? Number(options.maxPages) : 25;
  const sameOriginOnly = options.sameOriginOnly !== false;

  const queue = [{ url: startUrl, depth: 0 }];
  const visited = new Set();
  const pages = [];

  while (queue.length > 0 && visited.size < maxPages) {
    const current = queue.shift();
    if (!current || visited.has(current.url)) continue;
    visited.add(current.url);

    try {
      const page = await scrapePage(current.url, options);
      const sameOriginLinks = extractLinks(page.html || '', page.url, { sameOriginOnly });
      pages.push({
        url: page.url,
        depth: current.depth,
        statusCode: page.statusCode,
        title: page.title,
        description: page.description,
        linkCount: sameOriginLinks.length
      });

      if (current.depth >= maxDepth) continue;
      for (const link of sameOriginLinks) {
        if (visited.has(link)) continue;
        if (sameOriginOnly) {
          try {
            if (new URL(link).origin != start.origin) continue;
          } catch {
            continue;
          }
        }
        queue.push({ url: link, depth: current.depth + 1 });
      }
    } catch (error) {
      pages.push({
        url: current.url,
        depth: current.depth,
        statusCode: 0,
        title: '',
        description: '',
        linkCount: 0,
        error: error.message
      });
    }
  }

  return {
    startUrl,
    maxDepth,
    maxPages,
    pageCount: pages.length,
    urls: pages.map((item) => item.url),
    pages
  };
}

module.exports = {
  DEFAULT_TIMEOUT_MS,
  DEFAULT_MAX_HTML_CHARS,
  DEFAULT_USER_AGENT,
  normalizeUrl,
  extractLinks,
  htmlToMarkdown,
  htmlToText,
  fetchPage,
  scrapePage,
  mapWebsite,
  isPrivateIpAddress,
  assertSafeRemoteUrl
};
