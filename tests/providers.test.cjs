const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'js', 'providers.js'), 'utf8');
const modelLists = {
  grok: { data: [{ id: 'grok-4.7' }, { id: 'grok-embed-v2' }] },
  gpt: { data: [{ id: 'gpt-5-mini' }, { id: 'text-embedding-3-small' }] },
  claude: { data: [{ id: 'claude-sonnet-4-5' }, { id: 'claude-3-5-haiku-latest' }] },
  gemini: { models: [
    { name: 'models/gemini-2.5-flash', supportedGenerationMethods: ['generateContent'] },
    { name: 'models/text-embedding-004', supportedGenerationMethods: ['embedContent'] }
  ] }
};
function response(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });
}
function harness(fetchImpl, location = { protocol: 'file:', hostname: '' }) {
  const context = {
    fetch: fetchImpl,
    location,
    setTimeout, clearTimeout, AbortController, DOMException, URL, Headers, Response,
    console
  };
  vm.createContext(context);
  vm.runInContext(`${source}\nglobalThis.__test = { check, call, chooseModels, buildBody, MODEL, P, ORDER };`, context, { filename: 'providers.js' });
  return context.__test;
}
function successText(provider) {
  if (provider === 'claude') return { content: [{ type: 'text', text: 'Claude OK' }] };
  if (provider === 'gemini') return { candidates: [{ content: { parts: [{ text: 'Gemini OK' }] } }] };
  return { choices: [{ message: { content: `${provider} OK` } }] };
}

test('each provider independently validates its key and selects a model returned by the API', async () => {
  const api = harness(async url => {
    const provider = url.includes('api.x.ai') ? 'grok'
      : url.includes('api.openai.com') ? 'gpt'
      : url.includes('api.anthropic.com') ? 'claude' : 'gemini';
    return response(modelLists[provider]);
  });
  const expected = { grok: 'grok-4.7', gpt: 'gpt-5-mini', claude: 'claude-sonnet-4-5', gemini: 'gemini-2.5-flash' };
  for (const provider of ['grok', 'gpt', 'claude', 'gemini']) {
    const result = await api.check(provider, 'test-key');
    assert.equal(result.state, 'ok', `${provider} should pass the mock model check`);
    assert.equal(result.model, expected[provider]);
    assert.ok(result.modelOptions.includes(expected[provider]));
  }
});

test('generation parsers understand all four provider response shapes', async () => {
  const api = harness(async (url, init) => {
    if (init?.method === 'GET') {
      const provider = url.includes('api.x.ai') ? 'grok'
        : url.includes('api.openai.com') ? 'gpt'
        : url.includes('api.anthropic.com') ? 'claude' : 'gemini';
      return response(modelLists[provider]);
    }
    const provider = url.includes('api.x.ai') ? 'grok'
      : url.includes('api.openai.com') ? 'gpt'
      : url.includes('api.anthropic.com') ? 'claude' : 'gemini';
    return response(successText(provider));
  });
  const opts = { grok: ['grok-4.7'], gpt: ['gpt-5-mini'], claude: ['claude-sonnet-4-5'], gemini: ['gemini-2.5-flash'] };
  for (const provider of ['grok', 'gpt', 'claude', 'gemini']) {
    const result = await api.call(provider, 'test-key', 'system', 'hello', opts[provider], 16);
    assert.match(result.text, /OK$/);
    assert.equal(result.model, opts[provider][0]);
  }
});

test('a rejected key and a network failure are reported as different states', async () => {
  const rejectedApi = harness(async () => response({ error: { message: 'Invalid API key' } }, 401));
  const rejected = await rejectedApi.check('gpt', 'bad-key');
  assert.equal(rejected.state, 'rejected');
  assert.equal(rejected.auth, true);

  const offlineApi = harness(async () => { throw new TypeError('Failed to fetch'); });
  const offline = await offlineApi.check('gpt', 'possibly-valid-key');
  assert.equal(offline.state, 'unknown');
  assert.notEqual(offline.state, 'rejected');
});

test('model-not-found response falls through to the next model without hiding the reason', async () => {
  const attempts = [];
  const api = harness(async (url, init) => {
    const body = JSON.parse(init.body);
    attempts.push(body.model);
    if (body.model === 'gpt-5-mini') return response({ error: { message: 'The model gpt-5-mini does not exist' } }, 404);
    return response({ choices: [{ message: { content: 'Fallback model worked' } }] });
  });
  const result = await api.call('gpt', 'test-key', 'system', 'hello', ['gpt-5-mini', 'gpt-4.1-mini'], 20);
  assert.equal(result.model, 'gpt-4.1-mini');
  assert.equal(result.text, 'Fallback model worked');
  assert.deepEqual(attempts, ['gpt-5-mini', 'gpt-4.1-mini']);
});

test('deep check runs one additional test generation only when explicitly enabled', async () => {
  let requests = 0;
  const api = harness(async (url, init = {}) => {
    requests++;
    return response(init.method === 'POST'
      ? { choices: [{ message: { content: 'OK' } }] }
      : modelLists.gpt);
  });
  const basic = await api.check('gpt', 'test-key');
  assert.equal(basic.state, 'ok');
  assert.equal(requests, 1);
  requests = 0;
  const deep = await api.check('gpt', 'test-key', true);
  assert.equal(deep.testPassed, true);
  assert.equal(requests, 2);
});


test('an aborted request is surfaced as an intentional cancellation, not an invalid key', async () => {
  const api = harness((url, init) => new Promise((resolve, reject) => {
    if (init.signal.aborted) return reject(new DOMException('aborted', 'AbortError'));
    init.signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')), { once: true });
  }));
  const controller = new AbortController();
  const request = api.call('gpt', 'test-key', 'system', 'hello', ['gpt-5-mini'], 16, controller.signal);
  setTimeout(() => controller.abort(), 15);
  await assert.rejects(request, error => error.kind === 'cancel' && /остановлено/.test(error.message));
});


test('hosted deployments report a missing Pages Function instead of silently treating it as a bad key', async () => {
  const attempted = [];
  const api = harness(async url => {
    attempted.push(String(url));
    return new Response('<html><body>Not found</body></html>', { status: 404, headers: { 'content-type': 'text/html' } });
  }, { protocol: 'https:', hostname: 'hub.example.com' });
  const result = await api.check('gpt', 'possibly-valid-key');
  assert.equal(result.state, 'unknown');
  assert.match(result.message, /папку functions/i);
  assert.equal(attempted.length, 1);
  assert.match(attempted[0], /^\/api\/provider\/gpt\/models$/);
});

test('hosted SPA index fallback with HTTP 200 is not falsely accepted as a valid key', async () => {
  const api = harness(async () => new Response('<!doctype html><html><body>4-AI Hub</body></html>', {
    status: 200, headers: { 'content-type': 'text/html; charset=utf-8' }
  }), { protocol: 'https:', hostname: 'hub.example.com' });
  const result = await api.check('gpt', 'possibly-valid-key');
  assert.equal(result.state, 'unknown');
  assert.match(result.message, /папку functions/i);
});

test('local static development falls back to direct API when its proxy route is missing', async () => {
  const attempted = [];
  const api = harness(async url => {
    attempted.push(String(url));
    if (String(url).startsWith('/api/provider/')) return new Response('<html><body>Not found</body></html>', { status: 404, headers: { 'content-type': 'text/html' } });
    return response(modelLists.gpt);
  }, { protocol: 'http:', hostname: 'localhost' });
  const result = await api.check('gpt', 'test-key');
  assert.equal(result.state, 'ok');
  assert.equal(attempted.length, 2);
  assert.match(attempted[1], /^https:\/\/api\.openai\.com\/v1\/models$/);
});
