'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { discoverNews } = require('../src/web-news');
const { loadJevConfig } = require('../src/lib/jev-config');
const { readModelsConfig } = require('../src/lib/models-config');

const FEED = `<?xml version="1.0"?>
<rss version="2.0"><channel>
  <item>
    <title>Melhor fone de ouvido: 10 modelos</title>
    <link>https://tecnoblog.net/guias/fone</link>
    <description>Selecionamos os principais fones.</description>
    <pubDate>Fri, 18 Sep 2026 21:28:26 GMT</pubDate>
  </item>
  <item>
    <title>IA da OpenAI tentou ensinar futuras versoes</title>
    <link>https://tecnoblog.net/noticias/openai</link>
    <description>Modelos de linguagem em fase de testes.</description>
    <pubDate>Fri, 18 Sep 2026 19:49:57 GMT</pubDate>
  </item>
  <item>
    <title>Redmi Note 17 chega ao Brasil</title>
    <link>https://tecnoblog.net/noticias/redmi</link>
    <description>Xiaomi apresenta tres novos modelos.</description>
    <pubDate>Mon, 21 Sep 2026 13:00:00 GMT</pubDate>
  </item>
</channel></rss>`;

function feedFetch() {
  return async () => ({
    ok: true,
    url: 'https://tecnoblog.net/feed',
    contentType: 'application/rss+xml',
    html: FEED
  });
}

async function writeProject(files) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'aioson-jev-'));
  for (const [name, body] of Object.entries(files)) {
    const file = path.join(dir, ...name.split('/'));
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, body);
  }
  return dir;
}

function modelsJson(jev, providers = {}) {
  return `${JSON.stringify({
    providers: {
      openrouter: { api_key: 'YOUR_OPENROUTER_API_KEY' },
      typesafe: { api_key: 'YOUR_TYPESAFE_API_KEY' },
      ...providers
    },
    jev
  }, null, 2)}\n`;
}

test('Jev reads the OpenRouter key from root aioson-models.json and drops shared-word headlines', async () => {
  const dir = await writeProject({
    'aioson-models.json': modelsJson(
      { enabled: true, route: 'openrouter', min_noul: 0.6 },
      { openrouter: { api_key: 'from-json' } }
    )
  });
  const calls = [];
  const fetchImpl = async (url, init) => {
    const body = JSON.parse(init.body);
    calls.push({ url, body, authorization: init.headers.authorization });
    if (body.questions.probe) {
      return { ok: true, status: 200, json: async () => ({ answers: { probe: { type: 'noul', noul: 0.4 } } }) };
    }
    const answers = {};
    body.state.passages.forEach((passage, index) => {
      const aboutLlm = /openai|linguagem/i.test(`${passage.title} ${passage.description}`);
      answers[`relevant_${index}`] = { type: 'noul', noul: aboutLlm ? 0.92 : 0.08 };
    });
    return {
      ok: true,
      status: 200,
      json: async () => ({ model: 'typesafe/jev-1.13-20260917', answers })
    };
  };

  const result = await discoverNews({
    urls: ['https://tecnoblog.net/feed'],
    query: 'modelos llm',
    projectDir: dir,
    env: {},
    fetchPage: feedFetch(),
    jevFetch: fetchImpl
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.candidates.map((item) => item.url), [
    'https://tecnoblog.net/noticias/openai'
  ]);
  assert.equal(result.relevance.status, 'used');
  assert.equal(result.relevance.trust_candidates, true);
  assert.equal(result.relevance.route, 'openrouter');
  assert.equal(calls[0].url, 'https://openrouter.ai/api/alpha/decisions');
  assert.equal(calls[0].authorization, 'Bearer from-json');
  assert.equal(JSON.stringify(result).includes('from-json'), false);
  assert.equal((await readModelsConfig(dir)).rel, 'aioson-models.json');
});

test('a Play-injected env key wins over the file, and a failed probe keeps the keyword list', async () => {
  const dir = await writeProject({
    'aioson-models.json': modelsJson(
      { enabled: true, route: 'typesafe' },
      { typesafe: { api_key: 'file-secret' } }
    )
  });
  const calls = [];
  const result = await discoverNews({
    urls: ['https://tecnoblog.net/feed'],
    query: 'modelos llm',
    projectDir: dir,
    env: { TYPESAFE_API_KEY: 'play-secret' },
    fetchPage: feedFetch(),
    jevFetch: async (url, init) => {
      calls.push({ url, authorization: init.headers.authorization });
      return { ok: false, status: 401, json: async () => ({ error: { message: 'Missing Authentication header' } }) };
    }
  });

  assert.equal(calls[0].url, 'https://api.typesafe.ai/v1/systemone');
  assert.equal(calls[0].authorization, 'Bearer play-secret');
  assert.equal(result.candidates.length, 3);
  assert.equal(result.relevance.status, 'unavailable');
  assert.equal(result.relevance.trust_candidates, false);
  assert.equal(result.relevance.fallback, 'keyword');
  assert.equal(JSON.stringify(result).includes('play-secret'), false);
  assert.equal(JSON.stringify(result).includes('file-secret'), false);
});

test('provider keys are accepted, placeholders are not, and route selects between both Jev APIs', async () => {
  const fromProvider = await writeProject({
    'aioson-models.json': modelsJson(
      { enabled: true, route: 'openrouter' },
      {
        openrouter: { api_key: 'openrouter-key' },
        typesafe: { api_key: 'typesafe-key' }
      }
    )
  });
  const ready = loadJevConfig(fromProvider, {});
  assert.equal(ready.status, 'ready');
  assert.equal(ready.apiKey, 'openrouter-key');
  assert.equal(ready.source, 'aioson-models.json');

  const direct = loadJevConfig(fromProvider, { TYPESAFE_API_KEY: 'env-typesafe-key' });
  const config = JSON.parse(await fs.readFile(path.join(fromProvider, 'aioson-models.json'), 'utf8'));
  config.jev.route = 'typesafe';
  await fs.writeFile(path.join(fromProvider, 'aioson-models.json'), `${JSON.stringify(config, null, 2)}\n`);
  const official = loadJevConfig(fromProvider, { TYPESAFE_API_KEY: 'env-typesafe-key' });
  assert.equal(official.route, 'typesafe');
  assert.equal(official.apiKey, 'env-typesafe-key');
  assert.equal(direct.route, 'openrouter');

  const placeholder = await writeProject({
    'aioson-models.json': modelsJson({ enabled: true, route: 'openrouter' })
  });
  let called = false;
  const blocked = await discoverNews({
    urls: ['https://tecnoblog.net/feed'],
    query: 'modelos llm',
    projectDir: placeholder,
    env: {},
    fetchPage: feedFetch(),
    jevFetch: async () => { called = true; throw new Error('should not call'); }
  });
  assert.equal(called, false);
  assert.equal(blocked.relevance.reason, 'missing_api_key');
  assert.equal(blocked.candidates.length, 3);

  const disabledProject = await writeProject({
    'aioson-models.json': modelsJson({ enabled: false, route: 'openrouter' })
  });
  const disabled = loadJevConfig(disabledProject, {});
  assert.equal(disabled.status, 'disabled');
  assert.equal(disabled.source, 'aioson-models.json');
  assert.equal((await readModelsConfig(disabledProject)).rel, 'aioson-models.json');
});
