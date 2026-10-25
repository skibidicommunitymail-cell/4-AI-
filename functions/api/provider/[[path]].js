// Same-origin allow-listed proxy for Cloudflare Pages.
// API keys are forwarded only to the chosen provider and are never saved or logged here.
const PROVIDERS = {
  grok: 'https://api.x.ai/v1',
  gpt: 'https://api.openai.com/v1',
  claude: 'https://api.anthropic.com/v1',
  gemini: 'https://generativelanguage.googleapis.com/v1beta'
};

async function readLimitedBody(request, maxBytes) {
  if (!request.body) return new ArrayBuffer(0);
  const reader = request.body.getReader();
  const chunks = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        const error = new Error('body-too-large');
        error.code = 'BODY_TOO_LARGE';
        throw error;
      }
      chunks.push(value);
    }
  } finally {
    try { reader.releaseLock(); } catch { /* already cancelled */ }
  }
  const output = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { output.set(chunk, offset); offset += chunk.byteLength; }
  return output.buffer;
}

function jsonError(status, message) {
  return new Response(JSON.stringify({ error: { message } }), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' }
  });
}

export async function onRequest({ request }) {
  const url = new URL(request.url);
  const origin = request.headers.get('Origin');
  const referer = request.headers.get('Referer');
  // Same-origin only. This prevents the public endpoint from becoming an open proxy.
  let callerOrigin = origin;
  if (!callerOrigin && referer) {
    try { callerOrigin = new URL(referer).origin; } catch { /* invalid referer */ }
  }
  if (!callerOrigin || callerOrigin !== url.origin) return jsonError(403, 'Разрешены только запросы с этого сайта.');

  if (!['GET', 'POST'].includes(request.method)) return jsonError(405, 'Метод не поддерживается.');
  const prefix = '/api/provider/';
  if (!url.pathname.startsWith(prefix)) return jsonError(404, 'Маршрут не найден.');
  const tail = url.pathname.slice(prefix.length);
  const slash = tail.indexOf('/');
  if (slash < 1) return jsonError(404, 'Не указан провайдер или маршрут.');
  const provider = tail.slice(0, slash);
  const path = tail.slice(slash + 1);
  if (!Object.hasOwn(PROVIDERS, provider)) return jsonError(404, 'Неизвестный провайдер.');

  let allowed = false;
  if (request.method === 'GET' && path === 'models') allowed = true;
  if (request.method === 'POST' && ((['grok', 'gpt'].includes(provider) && path === 'chat/completions') || (provider === 'claude' && path === 'messages'))) allowed = true;
  if (provider === 'gemini' && request.method === 'POST' && /^models\/[A-Za-z0-9._-]+:generateContent$/.test(path)) allowed = true;
  if (!allowed) return jsonError(404, 'Этот маршрут API не разрешён.');

  const keyHeader = provider === 'claude' ? 'x-api-key' : provider === 'gemini' ? 'x-goog-api-key' : 'authorization';
  const secret = request.headers.get(keyHeader);
  if (!secret || (provider !== 'claude' && provider !== 'gemini' && !/^Bearer\s+\S+/i.test(secret))) {
    return jsonError(401, 'В запросе отсутствует API-ключ.');
  }

  const headers = new Headers({ accept: 'application/json' });
  if (provider === 'claude') {
    headers.set('x-api-key', secret);
    headers.set('anthropic-version', request.headers.get('anthropic-version') || '2023-06-01');
  } else if (provider === 'gemini') {
    headers.set('x-goog-api-key', secret);
  } else {
    headers.set('authorization', secret);
  }
  let body;
  if (request.method === 'POST') {
    const type = request.headers.get('content-type') || '';
    if (!type.toLowerCase().includes('application/json')) return jsonError(415, 'Ожидалось тело запроса в формате JSON.');
    const length = Number(request.headers.get('content-length') || 0);
    if (length > 2_000_000) return jsonError(413, 'Запрос слишком большой (максимум 2 МБ).');
    try { body = await readLimitedBody(request, 2_000_000); }
    catch (error) {
      if (error?.code === 'BODY_TOO_LARGE') return jsonError(413, 'Запрос слишком большой (максимум 2 МБ).');
      return jsonError(400, 'Не удалось прочитать тело запроса.');
    }
    headers.set('content-type', 'application/json');
  }

  const target = `${PROVIDERS[provider]}/${path}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 95000);
  try {
    const init = { method: request.method, headers, signal: controller.signal, redirect: 'manual' };
    if (request.method === 'POST') init.body = body;
    const upstream = await fetch(target, init);
    const responseHeaders = new Headers({
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
      'content-type': upstream.headers.get('content-type') || 'application/json; charset=utf-8'
    });
    // Do not expose cookies, internal upstream headers, or secrets to the browser.
    return new Response(upstream.body, { status: upstream.status, headers: responseHeaders });
  } catch (error) {
    return jsonError(502, error?.name === 'AbortError' ? 'Провайдер не ответил вовремя. Повторите запрос.' : 'Не удалось связаться с провайдером. Проверьте соединение и повторите запрос.');
  } finally {
    clearTimeout(timer);
  }
}
