// Клиенты AI-провайдеров. Секреты не записываются в код и не отправляются в логи.
const ORDER = ['grok', 'gpt', 'claude', 'gemini'];
const MODEL = {
  grok: 'grok-4',
  gpt: 'gpt-5-mini',
  claude: 'claude-sonnet-4-5',
  gemini: 'gemini-2.5-flash'
};
const MODEL_PREFERENCE = {
  grok: ['grok-4.7', 'grok-4', 'grok-3', 'grok-2'],
  gpt: ['gpt-5-mini', 'gpt-5', 'gpt-4.1-mini', 'gpt-4.1', 'gpt-4o-mini', 'gpt-4o'],
  claude: ['claude-sonnet-4-5', 'claude-sonnet-4-0', 'claude-opus-4-1', 'claude-opus-4-0', 'claude-3-7-sonnet', 'claude-3-5-sonnet'],
  gemini: ['gemini-3.8-flash', 'gemini-3.5-flash', 'gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-1.5-flash', 'gemini-3.8-pro', 'gemini-2.5-pro']
};
const P = {
  grok: { name: 'Grok', color: '#111111', org: 'Разработчик: xAI', own: 'Компания: xAI', url: 'https://console.x.ai', where: 'раздел API Keys', logo: 'assets/providers/grok.png' },
  gpt: { name: 'ChatGPT', color: '#10a37f', org: 'Разработчик: OpenAI', own: 'Продукт: ChatGPT API', url: 'https://platform.openai.com/api-keys', where: 'раздел API keys', logo: 'assets/providers/chatgpt.png' },
  claude: { name: 'Claude', color: '#d97757', org: 'Разработчик: Anthropic', own: 'Продукт: Claude API', url: 'https://console.anthropic.com/settings/keys', where: 'раздел API Keys', logo: 'assets/providers/claude.png' },
  gemini: { name: 'Gemini', color: '#4285f4', org: 'Разработчик: Google', own: 'Продукт: Gemini API', url: 'https://aistudio.google.com/apikey', where: 'кнопка Get API key', logo: 'assets/providers/gemini.png' }
};

const fail = (message, extra = {}) => Object.assign(new Error(message), extra);
const JSON_HEADERS = { 'content-type': 'application/json' };
const API_BASE = {
  grok: 'https://api.x.ai/v1',
  gpt: 'https://api.openai.com/v1',
  claude: 'https://api.anthropic.com/v1',
  gemini: 'https://generativelanguage.googleapis.com/v1beta'
};

function authHeaders(provider, key) {
  if (provider === 'claude') return {
    'x-api-key': key,
    'anthropic-version': '2023-06-01',
    // Нужен только при прямом вызове из браузера; функция Pages его удаляет.
    'anthropic-dangerous-direct-browser-access': 'true'
  };
  if (provider === 'gemini') return { 'x-goog-api-key': key };
  return { authorization: `Bearer ${key}` };
}

async function timedFetch(url, options = {}, timeoutMs = 15000) {
  const externalSignal = options.signal;
  if (externalSignal?.aborted) throw fail('задание остановлено пользователем', { kind: 'cancel' });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new DOMException('Превышено время ожидания', 'TimeoutError')), timeoutMs);
  const forwardAbort = () => controller.abort(new DOMException('Задание остановлено', 'AbortError'));
  externalSignal?.addEventListener('abort', forwardAbort, { once: true });
  try {
    return await fetch(url, { ...options, signal: controller.signal, cache: 'no-store' });
  } catch (e) {
    if (externalSignal?.aborted) throw fail('задание остановлено пользователем', { kind: 'cancel' });
    if (e.name === 'AbortError' || e.name === 'TimeoutError') {
      throw fail(`превышено время ожидания (${Math.round(timeoutMs / 1000)} с)`, { kind: 'timeout' });
    }
    throw fail('не удалось связаться с API: возможны проблемы сети, VPN, CORS или временная недоступность сервиса', { kind: 'network' });
  } finally {
    clearTimeout(timer);
    externalSignal?.removeEventListener('abort', forwardAbort);
  }
}
function isHtml404(response) {
  return response.status === 404 && (response.headers.get('content-type') || '').toLowerCase().includes('text/html');
}

// На Cloudflare Pages используем одноимённую Function: она устраняет CORS.
// При локальном запуске без Function автоматически пробуем официальный API напрямую.
async function providerFetch(provider, path, options = {}, timeoutMs = 90000) {
  const headers = { ...(options.headers || {}) };
  const canUseSameOrigin = typeof location !== 'undefined' && (location.protocol === 'https:' || location.protocol === 'http:');
  if (canUseSameOrigin) {
    const proxyUrl = `/api/provider/${provider}/${path}`;
    try {
      const response = await timedFetch(proxyUrl, { ...options, headers }, timeoutMs);
      if (!isHtml404(response)) return response;
    } catch (e) {
      // Тайм-аут не стоит маскировать вторым запросом, но сетевой отказ может
      // означать, что проект открыт на локальном сервере без функции-прокси.
      if (e.kind === 'timeout' || e.kind === 'cancel') throw e;
    }
  }
  return timedFetch(`${API_BASE[provider]}/${path}`, { ...options, headers }, timeoutMs);
}

function parseResponse(raw) {
  try { return JSON.parse(raw); } catch { return {}; }
}

function apiMessage(json, raw, status) {
  const m = json?.error?.message || json?.error?.type || json?.message || json?.detail;
  if (m) return String(m).replace(/\s+/g, ' ').slice(0, 260);
  if (status === 401) return 'ключ не принят (401 Unauthorized)';
  if (status === 403) return 'доступ запрещён (403). Проверьте права ключа и доступ к API';
  if (status === 404) return 'адрес API или модель не найдены (404)';
  if (status === 429) return 'лимит запросов или квоты исчерпан (429)';
  if (status >= 500) return `сторона провайдера вернула ошибку ${status}`;
  return (raw || `HTTP ${status}`).replace(/\s+/g, ' ').slice(0, 220);
}

function classifyHttp(status, message = '') {
  const msg = message.toLowerCase();
  const limit = status === 429 || status === 402 || /quota|credit|billing|rate.?limit|resource exhausted|insufficient.*fund/i.test(msg);
  const auth = status === 401 || (status === 403 && /api.?key|authentication|unauthori[sz]ed|permission|access denied|forbidden/i.test(msg));
  return { limit, auth, status };
}

function modelEntries(provider, json) {
  const items = Array.isArray(json?.data) ? json.data : Array.isArray(json?.models) ? json.models : [];
  return items.map(item => ({
    id: String(item?.id || item?.name || item?.baseModelId || '').replace(/^models\//, ''),
    supportsText: provider !== 'gemini' || !Array.isArray(item?.supportedGenerationMethods) || item.supportedGenerationMethods.includes('generateContent')
  })).filter(m => m.id && m.supportsText);
}

function isSuitable(provider, id) {
  const lower = id.toLowerCase();
  if (provider === 'grok') return lower.startsWith('grok-') && !/(image|embedding|moderation|tts|transcri|audio|video|search)/i.test(lower);
  if (provider === 'gpt') return /^(gpt-|chatgpt-)/i.test(id) && !/(embedding|moderation|tts|transcri|audio|realtime|image|search|computer-use)/i.test(lower);
  if (provider === 'claude') return lower.startsWith('claude-') && /(sonnet|opus|haiku)/i.test(lower);
  return lower.startsWith('gemini-') && !/(embedding|aqa|tts|image|audio|robotics|computer-use)/i.test(lower);
}

function chooseModels(provider, models) {
  const available = models.filter(m => isSuitable(provider, m.id));
  if (!available.length) return [];
  const getMatch = preferred => available.find(m => m.id.toLowerCase() === preferred.toLowerCase())
    || available.find(m => m.id.toLowerCase().startsWith(preferred.toLowerCase() + '-'))
    || available.find(m => m.id.toLowerCase().includes(preferred.toLowerCase()));
  const ordered = [];
  for (const pref of MODEL_PREFERENCE[provider] || []) {
    const found = getMatch(pref);
    if (found && !ordered.some(m => m.id === found.id)) ordered.push(found);
  }
  // Если провайдер опубликовал новые модели, используем актуальный доступный
  // вариант вместо отказа только из-за устаревшего имени в конфигурации.
  for (const m of available) if (!ordered.some(x => x.id === m.id)) ordered.push(m);
  return ordered.map(m => m.id).slice(0, 8);
}

async function check(provider, key, deepCheck = false) {
  if (!key) return { ok: false, state: 'missing', message: 'Ключ не введён.' };
  try {
    const response = await providerFetch(provider, 'models', {
      method: 'GET', headers: authHeaders(provider, key)
    }, 15000);
    const raw = await response.text();
    const json = parseResponse(raw);
    if (!response.ok) {
      const message = apiMessage(json, raw, response.status);
      const status = classifyHttp(response.status, message);
      if (status.limit) return { ok: true, state: 'limited', message: `API ответил, но есть ограничение: ${message}`, ...status };
      return { ok: false, state: status.auth ? 'rejected' : 'error', message, ...status };
    }
    const models = modelEntries(provider, json);
    const options = chooseModels(provider, models);
    const model = options[0] || MODEL[provider];
    const result = {
      ok: true,
      state: 'ok',
      message: options.length ? `Ключ принят; найдено моделей: ${models.length}. Выбрана ${model}.` : 'Ключ принят. Список моделей получен без распознанного текстового варианта; проверю модель при первом запросе.',
      model,
      modelOptions: options.length ? options : [MODEL[provider]],
      modelsCount: models.length,
      status: 200
    };
    if (deepCheck) {
      try {
        const probe = await call(provider, key, 'Отвечай строго одним словом: OK.', 'Это проверочный запрос соединения. Ответь только: OK.', result.modelOptions, 12);
        result.testPassed = true;
        result.message += ` Тестовый запрос выполнен (${probe.model}).`;
      } catch (probeError) {
        result.testPassed = false;
        result.testError = probeError.message;
        result.message += ` Ключ распознан, но тест генерации не прошёл: ${probeError.message}`;
        if (probeError.auth) {
          result.ok = false;
          result.state = 'rejected';
          result.message = `API отклонил запрос генерации: ${probeError.message}`;
        } else {
          result.state = 'error';
        }
      }
    }
    return result;
  } catch (e) {
    return { ok: false, state: 'unknown', message: e.message || 'Не удалось выполнить проверку.', kind: e.kind || 'network' };
  }
}

function getText(provider, json) {
  if (provider === 'claude') return json?.content?.map(part => part.text || '').join('').trim();
  if (provider === 'gemini') return json?.candidates?.[0]?.content?.parts?.map(part => part.text || '').join('').trim();
  const content = json?.choices?.[0]?.message?.content;
  if (typeof content === 'string') return content.trim();
  if (Array.isArray(content)) return content.map(part => part?.text || '').join('').trim();
  return '';
}

function buildBody(provider, model, system, text, maxOutputTokens = 2000) {
  if (provider === 'claude') return {
    model, max_tokens: maxOutputTokens, system,
    messages: [{ role: 'user', content: text }]
  };
  if (provider === 'gemini') return {
    systemInstruction: { parts: [{ text: system }] },
    contents: [{ role: 'user', parts: [{ text }] }],
    generationConfig: { maxOutputTokens }
  };
  if (provider === 'gpt') return { model, max_completion_tokens: maxOutputTokens, messages: [{ role: 'system', content: system }, { role: 'user', content: text }] };
  return { model, max_tokens: maxOutputTokens, messages: [{ role: 'system', content: system }, { role: 'user', content: text }] };
}

async function call(provider, key, system, text, options = [], maxOutputTokens = 2000, signal = undefined) {
  const models = [...new Set([...(options || []), ...(MODEL_PREFERENCE[provider] || []), MODEL[provider]])].slice(0, 12);
  let lastError;
  for (const model of models) {
    const path = provider === 'claude' ? 'messages'
      : provider === 'gemini' ? `models/${model}:generateContent`
      : 'chat/completions';
    const response = await providerFetch(provider, path, {
      method: 'POST',
      signal,
      headers: { ...JSON_HEADERS, ...authHeaders(provider, key) },
      body: JSON.stringify(buildBody(provider, model, system, text, maxOutputTokens))
    }, 100000);
    const raw = await response.text();
    const json = parseResponse(raw);
    if (!response.ok) {
      const message = apiMessage(json, raw, response.status);
      const details = classifyHttp(response.status, message);
      lastError = fail(message, { ...details, model, provider });
      const isMissingModel = (response.status === 400 || response.status === 404)
        && /model|not found|does not exist|unsupported|unavailable|not available/i.test(message);
      if (isMissingModel && model !== models[models.length - 1]) continue;
      throw lastError;
    }
    const answer = getText(provider, json);
    if (!answer) {
      const reason = json?.promptFeedback?.blockReason || json?.candidates?.[0]?.finishReason;
      throw fail(reason ? `провайдер не выдал текст (${reason})` : 'провайдер вернул пустой ответ', { provider, model, status: 200 });
    }
    return { text: answer, model };
  }
  throw lastError || fail('не удалось найти доступную модель', { provider });
}
