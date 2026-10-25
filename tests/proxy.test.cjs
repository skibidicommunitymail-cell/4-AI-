const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

let proxyModulePromise;
async function loadProxy() {
  if (!proxyModulePromise) {
    const sourcePath = path.join(__dirname, '..', 'functions', 'api', 'provider', '[[path]].js');
    const tempPath = path.join(os.tmpdir(), `4-ai-hub-proxy-${process.pid}.mjs`);
    fs.copyFileSync(sourcePath, tempPath);
    proxyModulePromise = import(pathToFileURL(tempPath).href);
  }
  return proxyModulePromise;
}

test('Cloudflare proxy blocks foreign origins and routes only allow-listed requests', async () => {
  const { onRequest } = await loadProxy();
  const originalFetch = global.fetch;
  const forwarded = [];
  global.fetch = async (url, init) => {
    forwarded.push({ url: String(url), init });
    return new Response(JSON.stringify({ data: [] }), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  try {
    const foreign = await onRequest({ request: new Request('https://hub.example/api/provider/gpt/models', {
      headers: { Origin: 'https://attacker.example', Authorization: 'Bearer test-secret' }
    }) });
    assert.equal(foreign.status, 403);
    assert.equal(forwarded.length, 0);

    const disallowed = await onRequest({ request: new Request('https://hub.example/api/provider/gpt/admin', {
      headers: { Origin: 'https://hub.example', Authorization: 'Bearer test-secret' }
    }) });
    assert.equal(disallowed.status, 404);
    assert.equal(forwarded.length, 0);

    const allowed = await onRequest({ request: new Request('https://hub.example/api/provider/gpt/models', {
      headers: { Origin: 'https://hub.example', Authorization: 'Bearer test-secret' }
    }) });
    assert.equal(allowed.status, 200);
    assert.equal(forwarded.length, 1);
    assert.equal(forwarded[0].url, 'https://api.openai.com/v1/models');
    assert.equal(new Headers(forwarded[0].init.headers).get('authorization'), 'Bearer test-secret');
    assert.equal(allowed.headers.get('set-cookie'), null);

    const gemini = await onRequest({ request: new Request('https://hub.example/api/provider/gemini/models/gemini-2.5-flash:generateContent', {
      method: 'POST', headers: { Origin: 'https://hub.example', 'Content-Type': 'application/json', 'x-goog-api-key': 'gemini-test-key' }, body: JSON.stringify({ contents: [{ parts: [{ text: 'hi' }] }] })
    }) });
    assert.equal(gemini.status, 200);
    assert.equal(forwarded[1].url, 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent');
    assert.equal(new Headers(forwarded[1].init.headers).get('x-goog-api-key'), 'gemini-test-key');

    const oversizedBody = JSON.stringify({ prompt: 'x'.repeat(2_000_100) });
    const tooLarge = await onRequest({ request: new Request('https://hub.example/api/provider/gpt/chat/completions', {
      method: 'POST', headers: { Origin: 'https://hub.example', Authorization: 'Bearer test-secret', 'Content-Type': 'application/json' }, body: oversizedBody
    }) });
    assert.equal(tooLarge.status, 413);
    assert.equal(forwarded.length, 2);
  } finally {
    global.fetch = originalFetch;
  }
});
