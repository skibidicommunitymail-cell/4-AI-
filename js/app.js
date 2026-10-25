(() => {
'use strict';
const $ = selector => document.querySelector(selector);
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const CFG = { rounds: 3, maxAlternatives: 1000, maxFiles: 8, maxFileText: 40000, maxContextText: 150000 };
const STAGES = ['Анализ и план', 'Реализация', 'Проверка и исправление', 'Итоговая сборка'];
const SYS = 'Ты участвуешь в совместной работе четырёх нейросетей: Grok, ChatGPT, Claude и Gemini. Отвечай по-русски, спокойно и деловым тоном, без emoji, капслока и восклицаний.';
const load = key => { try { return JSON.parse(localStorage.getItem(key)) || {}; } catch { return {}; } };
const LEGACY_KEYS = load('4aihub.keys');
const ACCOUNTS_KEY = '4aihub.accounts.v1';
const SESSION_KEY = '4aihub.session.v1';
const accountStore = () => load(ACCOUNTS_KEY);
const userKey = suffix => `4aihub.${suffix}.${encodeURIComponent(S.account?.username || 'guest')}`;
const uid = () => (window.crypto?.randomUUID ? crypto.randomUUID() : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`);
const safeText = value => String(value ?? '').replace(/[<>]/g, '');
const S = {
  keys: {}, on: {}, keyState: {}, modelOptions: {}, log: [], task: '', userPrompt: '', files: [], busy: false,
  taskUnavailable: new Set(), activity: {}, selected: 'gpt', currentStage: '', taskAbort: null, cancelRequested: false, mode: 'build', previewHtml: '',
  account: null, chats: [], currentChatId: '', listMode: 'all', authMode: 'register', keyTimers: {}, settings: { accent: 'ice', motion: true, speak: false },
};
const logo = $('#logo'), stage = $('#stage'), cv = $('#cv'), c2 = cv.getContext('2d'), dlg = $('#dlg'), chat = $('#chat'), app = $('#app');
let activeToastTimer = null;
let nodes = [];
const icon = k => `<img src="${P[k].logo}" alt="" aria-hidden="true">`;
const restore = () => new Date(Date.now() + 864e5).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
const availableProviders = () => ORDER.filter(k => S.on[k] && !S.taskUnavailable.has(k));

function stateLabel(state) {
  return ({ checking: 'Проверяется', ok: 'Ключ принят', limited: 'Есть ограничение', rejected: 'Доступ отклонён', unknown: 'Не удалось проверить', error: 'Ошибка проверки', missing: 'Ключ не введён' })[state] || 'Проверяется';
}

/* ---------- Начальный экран и помощь с ключами ---------- */
function showOnb() {
  app.hidden = true;
  $('#check').hidden = true;
  $('#onb').hidden = false;
  $('#topbar').hidden = true;
  $('#shell').hidden = true;
  $('#cards').innerHTML = ORDER.map((k, i) => `<article class="provider-card" style="--i:${i};--c:${P[k].color}"><div class="ico">${icon(k)}</div><h3>${P[k].name}</h3><p>${P[k].org} · ${P[k].own}</p><button type="button" data-guide="${k}">Где получить ключ ↗</button></article>`).join('');
  $('#inputs').innerHTML = ORDER.map(k => `<div class="key-field" data-key-field="${k}"><label for="key-${k}"><img src="${P[k].logo}" alt=""><strong>${P[k].name}</strong><small>API key · не ID</small></label><div class="input-wrap"><input id="key-${k}" type="password" name="${k}" autocomplete="off" spellcheck="false" placeholder="Вставьте секретный API-ключ" aria-label="API-ключ ${P[k].name}" value=""><button class="key-eye" type="button" data-eye="${k}" aria-label="Показать ключ">◉</button></div><p class="key-help">Нужен секретный ключ из API-консоли. Project ID, Organization ID и имя модели не подходят.</p><p class="key-status" id="key-status-${k}" aria-live="polite"></p></div>`).join('');
  ORDER.forEach(k => { const input = $(`#inputs input[name="${k}"]`); if (input) input.value = S.keys[k] || ''; const status = $(`#key-status-${k}`); if (status && S.keys[k]) status.textContent = 'Сохранённый ключ. Проверка начнётся автоматически при изменении или после отправки формы.'; });
  $('#err').textContent = '';
}

function guide(k) {
  const provider = P[k];
  dlg.innerHTML = `<h3>Ключ для ${provider.name}</h3><p>Нужен именно <strong>секретный API key</strong>. Не вставляйте Project ID, Organization ID, User ID, имя модели или обычный пароль от сайта.</p><ol><li>Откройте <a href="${provider.url}" target="_blank" rel="noopener noreferrer">официальную API-консоль ${provider.name}</a>.</li><li>Найдите раздел «${provider.where}» и создайте новый секретный API-ключ.</li><li>Скопируйте именно значение ключа и вставьте его в поле «${provider.name}» на этой странице.</li><li>Убедитесь, что API включён для вашего аккаунта и у него есть биллинг/квота, если провайдер этого требует.</li></ol><p>Значение ключа обычно показывается полностью только при создании. Не отправляйте его в чаты, скриншоты или репозиторий. Обычная проверка обращается к списку моделей; тестовая генерация дополнительно проверяет ответ и может тратить квоту.</p><div class="acts"><a class="primary" href="${provider.url}" target="_blank" rel="noopener noreferrer" style="text-decoration:none">Открыть консоль ↗</a><button class="secondary" type="button" data-close-guide>Понятно</button></div>`;
  dlg.onclick = e => { if (e.target.closest('[data-close-guide]')) dlg.close(); };
  dlg.showModal();
}

document.addEventListener('click', e => {
  const guideKey = e.target.closest('[data-guide]')?.dataset.guide;
  if (guideKey && P[guideKey]) guide(guideKey);
});
$('#keysBtn').addEventListener('click', showOnb);
$('#welcomeConnect').addEventListener('click', showOnb);
$('#backFromKeys').addEventListener('click', () => { $('#onb').hidden = true; main(); });
$('#checkBack').addEventListener('click', () => { $('#check').hidden = true; main(); });
$('#clearKeysBtn').addEventListener('click', () => {
  S.keys = {};
  S.on = {};
  S.keyState = {};
  S.modelOptions = {};
  try { localStorage.removeItem(userKey('keys')); } catch { /* хранилище может быть запрещено браузером */ }
  ORDER.forEach(k => { const input = $(`#inputs input[name="${k}"]`); if (input) input.value = ''; });
  $('#err').textContent = 'Сохранённые в этом браузере ключи очищены.';
});

$('#inputs').addEventListener('click', e => {
  const eye = e.target.closest('[data-eye]');
  if (!eye) return;
  const input = $(`#inputs input[name="${eye.dataset.eye}"]`);
  if (!input) return;
  input.type = input.type === 'password' ? 'text' : 'password';
  eye.textContent = input.type === 'password' ? '◉' : '◎';
  eye.setAttribute('aria-label', input.type === 'password' ? 'Показать ключ' : 'Скрыть ключ');
});
$('#inputs').addEventListener('input', e => {
  const input = e.target.closest('input[name]');
  const k = input?.name;
  if (!P[k]) return;
  clearTimeout(S.keyTimers[k]);
  const status = $(`#key-status-${k}`);
  const value = input.value.trim();
  if (!value) { status.textContent = ''; return; }
  if (value.length < 12) { status.textContent = 'Похоже, ключ ещё не вставлен целиком.'; return; }
  status.textContent = 'Проверяем ключ…';
  status.style.color = 'var(--blue)';
  const valueAtStart = value;
  S.keyTimers[k] = setTimeout(async () => {
    const result = await check(k, valueAtStart, false);
    if (input.value.trim() !== valueAtStart) return;
    status.textContent = result.state === 'ok' || result.state === 'limited'
      ? `✓ Доступ к API подтверждён${result.model ? ` · ${result.model}` : ''}`
      : result.state === 'rejected' ? `✕ Ключ не принят: ${result.message}`
      : result.state === 'missing' ? 'Введите API-ключ.'
      : `Не удалось подтвердить: ${result.message}`;
    status.style.color = result.state === 'ok' || result.state === 'limited' ? 'var(--good)' : result.state === 'rejected' ? 'var(--bad)' : 'var(--warn)';
  }, 850);
});

/* ---------- Независимая и подробная проверка ключей ---------- */
function checkRow(k, state, detail) {
  let row = $(`#checkResults [data-check="${k}"]`);
  if (!row) {
    row = document.createElement('div');
    row.className = 'check-row';
    row.dataset.check = k;
    const brand = document.createElement('div');
    brand.className = 'ico';
    brand.innerHTML = icon(k);
    const label = document.createElement('div');
    label.innerHTML = `<div class="check-name"></div><div class="check-badge"></div>`;
    const info = document.createElement('div');
    info.className = 'check-detail';
    row.append(brand, label, info);
    $('#checkResults').append(row);
  }
  row.className = `check-row ${state}`;
  row.querySelector('.check-name').textContent = P[k].name;
  row.querySelector('.check-badge').textContent = stateLabel(state);
  row.querySelector('.check-detail').textContent = detail;
}

function openCheck(title) {
  app.hidden = true;
  $('#onb').hidden = true;
  $('#check').hidden = false;
  $('#check').classList.remove('done');
  $('#checkTitle').textContent = title;
  $('#checkSummary').textContent = 'Проверка выполняется отдельно для каждого указанного ключа.';
  $('#checkResults').replaceChildren();
  ORDER.forEach(k => checkRow(k, S.keys[k] ? 'checking' : 'missing', S.keys[k] ? 'Проверяем доступ к списку моделей…' : 'Ключ не введён — этот провайдер пропущен.'));
}

async function validateKeys(keys, deepCheck = false) {
  openCheck('Проверяем API-ключи');
  const results = {};
  await Promise.all(ORDER.map(async k => {
    if (!keys[k]) {
      results[k] = { ok: false, state: 'missing', message: 'Ключ не введён.' };
      checkRow(k, 'missing', results[k].message);
      return;
    }
    const result = await check(k, keys[k], deepCheck);
    results[k] = result;
    checkRow(k, result.state, result.message);
  }));
  $('#check').classList.add('done');
  const passed = ORDER.filter(k => keys[k] && results[k]?.ok).length;
  const uncertain = ORDER.filter(k => keys[k] && !results[k]?.ok && results[k]?.state !== 'rejected').length;
  $('#checkSummary').textContent = `Проверено: ${ORDER.filter(k => keys[k]).length}. Подтверждено: ${passed}. Нужна повторная проверка из-за сети: ${uncertain}.`;
  return results;
}

function saveKeys(keys) {
  try {
    localStorage.setItem(userKey('keys'), JSON.stringify(keys));
    return true;
  } catch {
    note('Браузер не разрешил сохранить ключи. Подключения будут доступны до закрытия вкладки, но настройки могут не сохраниться.');
    return false;
  }
}

async function verifyAndLaunch(keys, deepCheck = false) {
  S.keys = keys;
  saveKeys(keys);
  const results = await validateKeys(keys, deepCheck);
  S.keyState = results;
  S.modelOptions = {};
  ORDER.forEach(k => { if (results[k]?.modelOptions?.length) S.modelOptions[k] = results[k].modelOptions; });
  const runnable = ORDER.some(k => keys[k] && results[k]?.state !== 'rejected' && results[k]?.state !== 'missing');
  await sleep(400);
  if (!runnable) {
    $('#check').hidden = true;
    showOnb();
    $('#err').textContent = ORDER.filter(k => keys[k]).map(k => `${P[k].name}: ${results[k]?.message || 'ключ не подтверждён'}`).join('\n') || 'Введите хотя бы один API-ключ.';
    return;
  }
  $('#check').hidden = true;
  main();
}

$('#keys').addEventListener('submit', async e => {
  e.preventDefault();
  const keys = {};
  ORDER.forEach(k => { const value = $(`#inputs input[name="${k}"]`).value.trim(); if (value) keys[k] = value; });
  if (!Object.keys(keys).length) { $('#err').textContent = 'Введите хотя бы один API-ключ.'; return; }
  await verifyAndLaunch(keys, $('#deepCheck').checked);
});

/* ---------- Главный экран и карта узлов ---------- */
function activityFor(k) {
  return S.activity[k] || { state: S.on[k] ? 'ready' : (S.keys[k] ? 'rejected' : 'missing'), detail: '', output: '' };
}
function nodeStatus(k) {
  const activity = activityFor(k);
  if (!S.keys[k]) return 'Нет ключа';
  if (!S.keyState[k]) return 'Проверяется';
  if (!S.on[k]) return S.keyState[k]?.state === 'rejected' ? 'Нет доступа' : 'Неактивна';
  if (S.taskUnavailable.has(k)) return 'Пропущена';
  if (activity.state === 'working') return 'Работает…';
  if (activity.state === 'error') return 'Повторит позже';
  if (activity.state === 'done') return 'Ответила';
  if (S.keyState[k]?.state === 'unknown' || S.keyState[k]?.state === 'error') return 'Не проверена';
  return 'Готова';
}
function main() {
  $('#topbar').hidden = false;
  $('#shell').hidden = false;
  $('#authScreen').hidden = true;
  $('#onb').hidden = true;
  $('#check').hidden = true;
  S.on = {};
  ORDER.forEach(k => { S.on[k] = !!S.keys[k] && S.keyState[k]?.state !== 'rejected' && S.keyState[k]?.state !== 'missing'; });
  $('#keysBtn').hidden = false;
  app.hidden = false;
  $('#welcomeName').textContent = S.account?.name || S.account?.username || 'создатель';
  $('#profileName').textContent = S.account?.name || S.account?.username || 'Аккаунт';
  $('#profileInitial').textContent = (S.account?.name || S.account?.username || 'A').trim().charAt(0).toUpperCase();
  const keyCount = ORDER.filter(k => !!S.keys[k]).length;
  const confirmedCount = ORDER.filter(k => ['ok', 'limited'].includes(S.keyState[k]?.state)).length;
  $('#connectionSummary').textContent = confirmedCount ? `${confirmedCount} провайдеров подтверждены` : keyCount ? 'Проверяем соединение…' : 'Нейросети пока не подключены';
  $('#homeWelcome').hidden = !!(S.currentChatId && S.chats.some(c => c.id === S.currentChatId && c.messages?.length));
  $('#pageTitle').textContent = currentChat()?.title || 'Новое пространство';
  if (!nodes.length) {
    nodes = ORDER.map((k, i) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'node';
      button.style.cssText = `--i:${i};--c:${P[k].color}`;
      button.dataset.provider = k;
      button.setAttribute('aria-label', `Показать состояние ${P[k].name}`);
      button.innerHTML = `<span class="ico">${icon(k)}</span><span class="node-name">${P[k].name}</span><span class="node-status"></span>`;
      button.addEventListener('click', () => showInspector(k));
      stage.append(button);
      return button;
    });
  }
  paint();
  layout();
  ORDER.filter(k => S.keys[k] && !S.on[k]).forEach(k => toast(`${P[k].name}: ${S.keyState[k]?.message || 'не подключена'}`, 'warn', 6500));
  ORDER.filter(k => S.keys[k] && ['unknown', 'error'].includes(S.keyState[k]?.state)).forEach(k => toast(`${P[k].name}: соединение не подтверждено. Ключ не объявлен неверным; провайдер будет повторно проверен.`, 'warn', 6500));
}

function layout() {
  if (!stage || !nodes.length) return;
  const W = stage.clientWidth, H = stage.clientHeight;
  const R = Math.max(40, Math.min(W * .39, H - 120));
  nodes.forEach((element, i) => {
    const angle = (155 - i * 43.3) * Math.PI / 180;
    element.style.left = (W / 2 + R * Math.cos(angle)) + 'px';
    element.style.top = (H - 20 - R * Math.sin(angle)) + 'px';
  });
  lines();
}

function lines(t = performance.now()) {
  if (!stage || !cv || !c2) return;
  const W = stage.clientWidth, H = stage.clientHeight, d = window.devicePixelRatio || 1;
  if (!W || !H) return;
  if (cv.width !== Math.round(W * d) || cv.height !== Math.round(H * d)) { cv.width = Math.round(W * d); cv.height = Math.round(H * d); }
  c2.setTransform(d, 0, 0, d, 0, 0);
  c2.clearRect(0, 0, W, H);
  const tx = W / 2, ty = H - 5;
  nodes.forEach((element, i) => {
    const k = ORDER[i], connected = !!S.on[k] && !S.taskUnavailable.has(k);
    const sx = parseFloat(element.style.left) || tx;
    const sy = (parseFloat(element.style.top) || 0) + element.offsetHeight * .42;
    const gradient = c2.createLinearGradient(sx, sy, tx, ty);
    gradient.addColorStop(0, connected ? P[k].color : '#d2d4d7');
    gradient.addColorStop(1, connected ? '#111111' : '#d2d4d7');
    c2.strokeStyle = gradient;
    c2.lineWidth = S.selected === k ? 2.3 : 1.6;
    c2.globalAlpha = connected ? (S.busy ? .5 + .35 * Math.abs(Math.sin(t / 850 - i * .7)) : .72) : .25;
    c2.beginPath(); c2.moveTo(sx, sy); c2.bezierCurveTo(sx, sy + (ty - sy) * .65, tx, ty - (ty - sy) * .35, tx, ty); c2.stroke();
  });
  c2.globalAlpha = 1;
  c2.fillStyle = '#111'; c2.beginPath(); c2.arc(tx, ty - 1, 3.3, 0, Math.PI * 2); c2.fill();
}

if ('ResizeObserver' in window) new ResizeObserver(() => { layout(); }).observe(stage);
else window.addEventListener('resize', layout);

function paint() {
  nodes.forEach((element, i) => {
    const k = ORDER[i];
    element.classList.toggle('off', !S.on[k] || S.taskUnavailable.has(k));
    element.classList.toggle('working', activityFor(k).state === 'working' && !S.taskUnavailable.has(k));
    element.classList.toggle('selected', S.selected === k);
    element.querySelector('.node-status').textContent = nodeStatus(k);
  });
  lines();
}

function setBusy(value) {
  S.busy = value;
  app.classList.toggle('busy', value);
  $('#composer button[type="submit"]').disabled = value;
  $('#stopBtn').hidden = !value;
  $('#stopBtn').disabled = false;
  $('#stopBtn').textContent = '■';
  $('#stopBtn').setAttribute('aria-label', 'Остановить задание');
  $('#stopBtn').dataset.tip = 'Остановить задание';
  $('#composer textarea').disabled = value;
  const attachButton = $('#composer .attach-button');
  if (attachButton) { attachButton.style.opacity = value ? '.45' : '1'; attachButton.style.pointerEvents = value ? 'none' : 'auto'; }
  if (value) requestAnimationFrame(function frame(t) { lines(t); if (S.busy) requestAnimationFrame(frame); });
  else lines();
}

/* ---------- Инспектор нейросети справа ---------- */
function showInspector(k) {
  if (!P[k]) return;
  S.selected = k;
  $('#inspector').hidden = false;
  app.classList.add('inspector-open');
  renderInspector();
  paint();
}
function closeInspector() {
  $('#inspector').hidden = true;
  app.classList.remove('inspector-open');
  paint();
}
function renderInspector() {
  const k = S.selected, a = activityFor(k), keyStatus = S.keyState[k];
  $('#inspectorLogo').innerHTML = icon(k);
  $('#inspectorName').textContent = P[k].name;
  $('#inspectorCompany').textContent = P[k].org;
  const pill = $('#inspectorState');
  let title = 'Готова к запросу', cls = 'ok';
  if (!S.keys[k]) { title = 'API-ключ не введён'; cls = 'warning'; }
  else if (!S.on[k]) { title = 'Нет подтверждённого доступа'; cls = 'error'; }
  else if (S.taskUnavailable.has(k)) { title = 'Пропущена в текущем задании'; cls = 'warning'; }
  else if (a.state === 'working') { title = 'Выполняет запрос'; cls = 'working'; }
  else if (a.state === 'done') { title = 'Ответ получен'; cls = 'ok'; }
  else if (a.state === 'error') { title = 'Ошибка — будет повторена в новом задании'; cls = 'warning'; }
  else if (keyStatus?.state === 'unknown' || keyStatus?.state === 'error') { title = 'Ключ не удалось проверить по сети'; cls = 'warning'; }
  pill.textContent = title;
  pill.className = `status-pill ${cls}`;
  $('#inspectDoing').textContent = a.detail || (keyStatus?.message ? keyStatus.message : S.on[k] ? 'Ожидает нового задания. Нажмите «Далее», чтобы посмотреть следующий узел.' : 'Откройте API-ключи и повторите проверку.');
  $('#inspectTask').textContent = S.userPrompt ? S.userPrompt.slice(0, 1000) : 'Задача ещё не отправлена.';
  const output = a.output || keyStatus?.message || 'Когда нейросеть ответит, результат появится здесь.';
  $('#inspectOutput').textContent = output.slice(0, 30000);
  $('#prevProviderBtn').disabled = ORDER.length < 2;
  $('#nextProviderBtn').disabled = ORDER.length < 2;
}
$('#closeInspector').addEventListener('click', closeInspector);
function stepProvider(direction) {
  const candidates = ORDER.filter(k => S.on[k]);
  const list = candidates.length ? candidates : ORDER;
  let index = list.indexOf(S.selected);
  if (index < 0) index = 0;
  showInspector(list[(index + direction + list.length) % list.length]);
}
$('#prevProviderBtn').addEventListener('click', () => stepProvider(-1));
$('#nextProviderBtn').addEventListener('click', () => stepProvider(1));

/* ---------- Локальная история, сохранённые проекты и понятные уведомления ---------- */
function toast(text, kind = 'good', ms = 4400) {
  const region = $('#toastRegion');
  if (!region) return;
  const item = document.createElement('div');
  item.className = `toast ${kind}`;
  item.textContent = text;
  region.append(item);
  setTimeout(() => item.remove(), ms);
}
function currentChat() { return S.chats.find(c => c.id === S.currentChatId) || null; }
function saveChats() {
  if (!S.account) return;
  try {
    S.chats.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
    S.chats = S.chats.slice(0, 70);
    for (const c of S.chats) c.messages = (c.messages || []).slice(-220);
    localStorage.setItem(userKey('chats'), JSON.stringify(S.chats));
    localStorage.setItem(userKey('currentChat'), S.currentChatId || '');
    renderChatList();
    $('#projectCount').textContent = S.chats.filter(c => c.savedProject).length;
  } catch {
    toast('История почти заполнила хранилище браузера. Скачайте важные проекты и удалите старые чаты.', 'warn', 7000);
  }
}
function ensureChat(title = 'Новый проект') {
  let session = currentChat();
  if (!session) {
    session = { id: uid(), title: (title || 'Новый проект').replace(/\s+/g, ' ').trim().slice(0, 54) || 'Новый проект', createdAt: Date.now(), updatedAt: Date.now(), messages: [], savedProject: false, status: 'working' };
    S.chats.unshift(session);
    S.currentChatId = session.id;
    $('#chat').replaceChildren();
  } else if ((!session.title || session.title === 'Новый проект' || session.title === 'Новый чат') && title) {
    session.title = title.replace(/\s+/g, ' ').trim().slice(0, 54);
  }
  session.updatedAt = Date.now();
  session.status = 'working';
  $('#homeWelcome').hidden = true;
  $('#chat').hidden = false;
  $('#pageTitle').textContent = session.title;
  saveChats();
  return session;
}
function persistMessage(cls, head, text, color) {
  const session = currentChat();
  if (!session) return;
  session.messages ||= [];
  session.messages.push({ cls, head: head || '', text: String(text ?? ''), color: color || '', time: Date.now() });
  session.updatedAt = Date.now();
  saveChats();
}
function renderChatMessages(session) {
  chat.replaceChildren();
  $('#livePreview').hidden = true;
  $('#previewFrame').srcdoc = 'about:blank';
  S.previewHtml = '';
  for (const item of session?.messages || []) appendMessage(item.cls, item.head, item.text, item.color, false);
  chat.hidden = !(session?.messages?.length);
  $('#homeWelcome').hidden = !!session?.messages?.length;
  app.classList.toggle('chatting', !!session?.messages?.length);
  $('#pageTitle').textContent = session?.title || 'Новое пространство';
  chat.scrollTop = chat.scrollHeight;
}
function appendMessage(cls, head, text, color, persist = true) {
  chat.hidden = false;
  app.classList.add('chatting');
  $('#homeWelcome').hidden = true;
  const message = document.createElement('div');
  message.className = `m ${cls || ''}`.trim();
  if (head) {
    const heading = document.createElement('b');
    heading.textContent = head;
    if (color) heading.style.setProperty('--c', color);
    message.append(heading);
  }
  message.append(document.createTextNode(String(text ?? '')));
  chat.append(message);
  chat.scrollTop = chat.scrollHeight;
  if (persist) persistMessage(cls, head, text, color);
  if (head && text) maybePreview(String(text));
}
function openChat(id) {
  const session = S.chats.find(c => c.id === id);
  if (!session) return;
  S.currentChatId = id;
  S.userPrompt = session.title;
  S.log = (session.messages || []).filter(m => m.cls !== 'u' && m.cls !== 's').slice(-16).map(m => `${m.head || 'AI'}: ${m.text}`).join('\n\n');
  renderChatMessages(session);
  saveChats();
  if (window.innerWidth <= 700) $('#sidebar').classList.remove('open');
}
function newChat() {
  if (S.busy) { toast('Сначала остановите текущее задание или дождитесь ответа.', 'warn'); return; }
  S.currentChatId = '';
  S.userPrompt = '';
  S.task = '';
  S.log = [];
  chat.replaceChildren();
  $('#livePreview').hidden = true;
  $('#previewFrame').srcdoc = 'about:blank';
  S.previewHtml = '';
  chat.hidden = true;
  app.classList.remove('chatting');
  $('#homeWelcome').hidden = false;
  $('#pageTitle').textContent = 'Новое пространство';
  saveChats();
  renderChatList();
  $('#q').focus();
  if (window.innerWidth <= 700) $('#sidebar').classList.remove('open');
}
function renderChatList() {
  const list = $('#chatList');
  if (!list) return;
  const query = ($('#chatSearch')?.value || '').trim().toLocaleLowerCase('ru');
  const sessions = S.chats.filter(c => (S.listMode !== 'projects' || c.savedProject) && (!query || `${c.title} ${(c.messages || []).map(m => m.text).join(' ')}`.toLocaleLowerCase('ru').includes(query)));
  list.replaceChildren();
  if (!sessions.length) {
    const empty = document.createElement('div');
    empty.className = 'history-empty';
    empty.textContent = query ? 'Ничего не найдено. Попробуйте изменить запрос.' : S.listMode === 'projects' ? 'Завершённые проекты появятся здесь. После успешной работы они сохраняются автоматически.' : 'История пока пуста. Начните новый чат — он появится здесь.';
    list.append(empty);
  }
  for (const session of sessions) {
    const row = document.createElement('div');
    row.className = `history-item${session.id === S.currentChatId ? ' active' : ''}`;
    const open = document.createElement('button');
    open.type = 'button'; open.className = 'history-main'; open.dataset.openChat = session.id;
    const glyph = document.createElement('span'); glyph.textContent = session.savedProject ? '◇' : '◌'; glyph.setAttribute('aria-hidden', 'true');
    const title = document.createElement('span'); title.textContent = session.title || 'Без названия';
    title.title = title.textContent;
    open.append(glyph, title);
    const dl = document.createElement('button'); dl.type = 'button'; dl.className = 'history-action'; dl.dataset.downloadChat = session.id; dl.title = 'Скачать чат'; dl.setAttribute('aria-label','Скачать чат'); dl.textContent = '↓';
    const del = document.createElement('button'); del.type = 'button'; del.className = 'history-action'; del.dataset.deleteChat = session.id; del.title = 'Удалить чат'; del.setAttribute('aria-label','Удалить чат'); del.textContent = '×';
    row.append(open, dl, del); list.append(row);
  }
  $('#projectCount').textContent = S.chats.filter(c => c.savedProject).length;
}
function downloadChat(id = S.currentChatId) {
  const session = S.chats.find(c => c.id === id);
  if (!session) { toast('Сначала создайте чат или выберите сохранённый проект.', 'warn'); return; }
  const body = [`# ${session.title || '4-AI Hub — проект'}`, '', `Дата: ${new Date(session.createdAt || Date.now()).toLocaleString('ru-RU')}`, `Статус: ${session.savedProject ? 'Сохранённый проект' : 'Чат'}`, '', ...(session.messages || []).map(m => `${m.head ? `## ${m.head}` : m.cls === 'u' ? '## Вы' : m.cls === 's' ? '### Статус' : '## Сообщение'}\n\n${m.text}`)].join('\n\n---\n\n');
  const blob = new Blob([body], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url; link.download = `${(session.title || '4-ai-hub-project').toLowerCase().replace(/[^a-zа-яё0-9]+/gi, '-').replace(/^-|-$/g, '').slice(0,48) || '4-ai-hub-project'}.md`;
  document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  toast('История проекта экспортирована в Markdown.');
}
$('#chatList').addEventListener('click', e => {
  const open = e.target.closest('[data-open-chat]'); if (open) { openChat(open.dataset.openChat); return; }
  const dl = e.target.closest('[data-download-chat]'); if (dl) { downloadChat(dl.dataset.downloadChat); return; }
  const del = e.target.closest('[data-delete-chat]');
  if (del) {
    const id = del.dataset.deleteChat;
    const session = S.chats.find(c => c.id === id);
    if (!session) return;
    dlg.innerHTML = `<h3>Удалить «${safeText(session.title)}»?</h3><p>Этот чат будет удалён из локальной истории. Скачанные файлы не затронуты.</p><div class="acts"><button class="secondary" type="button" data-cancel-delete>Отмена</button><button class="primary" type="button" data-confirm-delete="${id}">Удалить чат</button></div>`;
    dlg.onclick = ev => { if (ev.target.closest('[data-cancel-delete]')) dlg.close(); const ok = ev.target.closest('[data-confirm-delete]'); if (ok) { S.chats = S.chats.filter(c => c.id !== ok.dataset.confirmDelete); if (S.currentChatId === id) newChat(); saveChats(); dlg.close(); toast('Чат удалён.'); } };
    dlg.showModal();
  }
});
$('#newChatBtn').addEventListener('click', newChat);
$('#chatSearch').addEventListener('input', renderChatList);
$('#clearSearch').addEventListener('click', () => { $('#chatSearch').value = ''; S.listMode = 'all'; renderChatList(); });
$('#navHome').addEventListener('click', () => { S.listMode = 'all'; $('#navHome').classList.add('active'); $('#navProjects').classList.remove('active'); renderChatList(); newChat(); });
$('#navProjects').addEventListener('click', () => { S.listMode = 'projects'; $('#navProjects').classList.add('active'); $('#navHome').classList.remove('active'); $('#chatSearch').value = ''; renderChatList(); if (window.innerWidth <= 700) $('#sidebar').classList.add('open'); });
$('#mobileMenu').addEventListener('click', () => $('#sidebar').classList.toggle('open'));
document.addEventListener('keydown', e => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); newChat(); } if (e.key === 'Escape') $('#sidebar').classList.remove('open'); });
$('#downloadChatBtn').addEventListener('click', () => downloadChat());

function maybePreview(text) {
  const match = text.match(/```(?:html|htm)\s*([\s\S]*?)```/i);
  if (!match) return;
  const html = match[1].trim();
  if (!/<(?:!doctype|html|head|body|main|div|section|article|nav|header)\b/i.test(html)) return;
  const safeHtml = html.replace(/<meta\s+http-equiv=["']?refresh[^>]*>/ig, '').replace(/<base\b[^>]*>/ig, '');
  S.previewHtml = safeHtml;
  const csp = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data: blob: https:; style-src 'unsafe-inline' https:; font-src data: https:; script-src 'unsafe-inline'; connect-src 'none'; object-src 'none'; form-action 'none'; base-uri 'none'">`;
  $('#previewFrame').srcdoc = `<!doctype html><html><head>${csp}<meta name="viewport" content="width=device-width,initial-scale=1"><style>body{font:14px system-ui,sans-serif;margin:0}</style></head><body>${safeHtml}</body></html>`;
  $('#livePreview').hidden = false;
}
$('#previewBtn').addEventListener('click', () => {
  if (!currentChat()?.messages?.length) { toast('Предпросмотр появится, когда модель вернёт HTML-код в блоке ```html.', 'warn'); return; }
  const texts = currentChat().messages.slice().reverse().map(m => m.text || '');
  const code = texts.find(t => /```(?:html|htm)\s*[\s\S]*?```/i.test(t));
  if (code) maybePreview(code); else toast('В текущем чате пока нет HTML-кода для предпросмотра.', 'warn');
});
$('#closePreview').addEventListener('click', () => { $('#livePreview').hidden = true; $('#previewFrame').srcdoc = 'about:blank'; });
$('#downloadPreviewBtn').addEventListener('click', () => { if (!S.previewHtml) { toast('Сначала создайте HTML-предпросмотр.', 'warn'); return; } const blob = new Blob([S.previewHtml], { type: 'text/html;charset=utf-8' }); const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = `${(currentChat()?.title || '4-ai-hub-project').replace(/[^a-zа-яё0-9]+/gi, '-').slice(0,40) || '4-ai-hub-project'}.html`; document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000); toast('HTML-предпросмотр сохранён в файл.'); });
$('#voiceBtn').addEventListener('click', () => {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) { toast('Голосовой ввод не поддерживается этим браузером. Попробуйте Chrome или используйте клавиатуру.', 'warn', 6500); return; }
  const recognition = new SpeechRecognition(); recognition.lang = 'ru-RU'; recognition.interimResults = false; recognition.maxAlternatives = 1;
  $('#voiceBtn').style.color = 'var(--cyan)';
  recognition.onresult = event => { const result = event.results?.[0]?.[0]?.transcript || ''; if (result) { $('#q').value = `${$('#q').value}${$('#q').value ? ' ' : ''}${result}`; $('#q').focus(); toast('Голосовой ввод распознан. Проверьте текст и отправьте его.'); } };
  recognition.onerror = () => toast('Не получилось распознать речь. Проверьте разрешение на микрофон.', 'warn');
  recognition.onend = () => { $('#voiceBtn').style.color = ''; };
  try { recognition.start(); toast('Слушаю… Говорите после сигнала.', 'good', 2200); } catch { $('#voiceBtn').style.color = ''; toast('Микрофон уже активен или недоступен.', 'warn'); }
});
$('#modeBtn').addEventListener('click', () => choose().then(mode => { if (mode && mode !== 'cancel') { S.mode = mode; $('#modeBtn').querySelector('span').textContent = mode === 'talk' ? 'Обсуждение' : 'Проект'; toast(mode === 'talk' ? 'Выбран режим коллективного обсуждения.' : 'Выбран режим подготовки проекта.'); } }));
$('#planBtn').addEventListener('click', showPlan);
$('#miniUpgrade').addEventListener('click', showPlan);
$('#settingsBtn').addEventListener('click', showSettings);
$('#profileBtn').addEventListener('click', showProfileMenu);
$('#helpBtn').addEventListener('click', showOnb);
$('#homeWelcome').addEventListener('click', e => { const quick = e.target.closest('[data-prompt]'); if (quick) { $('#q').value = quick.dataset.prompt; $('#q').focus(); } });

function showPlan() {
  dlg.innerHTML = `<div class="eyebrow">4-AI HUB PLUS</div><h3 style="font-size:25px;margin-top:8px">Больше пространства для идей.</h3><p><strong style="font-size:22px;color:#e5f1ff">$20</strong> <span class="modal-note">/ месяц · концепт тарифа</span></p><div class="inspect-block"><h3>В планируется включить</h3><p>До 40 подключаемых AI-провайдеров, меньше ручной настройки ключей, параллельные обсуждения, live-предпросмотр создаваемых интерфейсов и расширенная кастомизация.</p></div><div class="inspect-block"><h3>Что доступно сейчас</h3><p>В этой сборке подключены 4 провайдера — Grok, ChatGPT, Claude и Gemini. Для каждого используются собственные API-ключи. Платёжная система, серверное хранение ключей, дополнительные 36 провайдеров и реальное управление лимитами ещё не подключены.</p></div><div class="acts"><button class="primary" type="button" data-plan-close>Понятно</button></div>`;
  dlg.onclick = e => { if (e.target.closest('[data-plan-close]')) dlg.close(); };
  dlg.showModal();
}
function showSettings() {
  dlg.innerHTML = `<h3>Настроить пространство</h3><p>Подберите спокойный акцент и управление анимацией. Настройки сохраняются в этом браузере.</p><div class="option-row"><label>Цвет акцента<select id="accentChoice"><option value="ice">Ледяной синий</option><option value="cyan">Холодная бирюза</option><option value="violet">Сине-фиолетовый</option></select></label><label><input id="motionChoice" type="checkbox"> Анимированный фон</label><label><input id="speakChoice" type="checkbox"> Озвучивать ответы</label></div><div class="acts"><button class="primary" type="button" data-save-settings>Сохранить</button><button class="secondary" type="button" data-close-settings>Отмена</button></div>`;
  dlg.querySelector('#accentChoice').value = S.settings.accent;
  dlg.querySelector('#motionChoice').checked = S.settings.motion;
  dlg.querySelector('#speakChoice').checked = S.settings.speak;
  dlg.onclick = e => {
    if (e.target.closest('[data-close-settings]')) dlg.close();
    if (e.target.closest('[data-save-settings]')) {
      S.settings = { accent: dlg.querySelector('#accentChoice').value, motion: dlg.querySelector('#motionChoice').checked, speak: dlg.querySelector('#speakChoice').checked };
      applySettings(); try { localStorage.setItem(userKey('settings'), JSON.stringify(S.settings)); } catch {}
      dlg.close(); toast('Настройки оформления сохранены.');
    }
  };
  dlg.showModal();
}
function applySettings() {
  document.documentElement.dataset.accent = S.settings.accent || 'ice';
  document.body.classList.toggle('no-motion', !S.settings.motion);
}
function showProfileMenu() {
  dlg.innerHTML = `<h3>${safeText(S.account?.name || S.account?.username || 'Локальный аккаунт')}</h3><p>Ваш профиль существует только в этом браузере. История, локальные ключи и настройки хранятся на этом устройстве.</p><div class="acts"><button class="secondary" type="button" data-close-profile>Закрыть</button><button class="primary" type="button" data-signout>Выйти</button></div>`;
  dlg.onclick = e => { if (e.target.closest('[data-close-profile]')) dlg.close(); if (e.target.closest('[data-signout]')) { dlg.close(); try { localStorage.removeItem(SESSION_KEY); } catch {} S.account = null; S.keys = {}; S.chats = []; S.currentChatId = ''; $('#shell').hidden = true; $('#topbar').hidden = true; S.on = {}; S.keyState = {}; S.modelOptions = {}; S.activity = {}; S.log = []; S.taskUnavailable.clear(); showAuth('Вы вышли из локального аккаунта.'); } };
  dlg.showModal();
}

/* ---------- Лента ответов и диагностика ---------- */
function msg(cls, head, text, color) { appendMessage(cls, head, text, color, true); }
const note = text => msg('s', '', text);
const say = (k, text) => { msg('', P[k].name, text, P[k].color); if (S.settings.speak && 'speechSynthesis' in window) { try { window.speechSynthesis.cancel(); const utterance = new SpeechSynthesisUtterance(String(text).slice(0, 7000)); utterance.lang = 'ru-RU'; utterance.rate = 1; window.speechSynthesis.speak(utterance); } catch { /* speech output is optional */ } } };
const ctxt = () => S.task + (S.log.length ? '\n\n--- Ход работы ---\n' + S.log.join('\n\n').slice(-20000) : '');

function setActivity(k, state, detail, output = '') {
  S.activity[k] = { state, detail, output, updated: Date.now() };
  if (state === 'working') showInspector(k);
  else if (S.selected === k && !$('#inspector').hidden) renderInspector();
  paint();
}

// Ошибка одного узла исключает его только из текущего задания. Новое задание
// снова попробует все ключи, которые не были однозначно отклонены при проверке.
async function ask(system, text, prefer, doing = 'Обрабатывает запрос') {
  const tried = new Set();
  while (true) {
    const live = availableProviders().filter(k => !tried.has(k));
    if (!live.length) {
      note('Не осталось доступных узлов для этого этапа. Откройте панель узла, чтобы увидеть точные причины отказа; следующее задание повторно попробует временно недоступные узлы.');
      return null;
    }
    const k = live.includes(prefer) ? prefer : live[0];
    tried.add(k);
    setActivity(k, 'working', `${doing}. Запрос отправлен; ожидаю ответ API.`);
    try {
      const result = await call(k, S.keys[k], system, text, S.modelOptions[k] || [MODEL[k]], 2000, S.taskAbort?.signal);
      S.modelOptions[k] = [result.model, ...(S.modelOptions[k] || []).filter(m => m !== result.model)];
      setActivity(k, 'done', `Этап выполнен. Использована модель ${result.model}.`, result.text);
      return { k, t: result.text, model: result.model };
    } catch (error) {
      if (error.kind === 'cancel' || S.cancelRequested) {
        setActivity(k, 'error', 'Задание остановлено пользователем.', 'Запрос остановлен.');
        note('Задание остановлено. Новые запросы к нейросетям не отправляются.');
        return null;
      }
      S.taskUnavailable.add(k);
      const isAuth = !!error.auth;
      const isProxyIssue = ['proxy-network', 'proxy-missing'].includes(error.kind);
      if (isAuth) {
        S.on[k] = false;
        S.keyState[k] = { state: 'rejected', ok: false, message: error.message, status: error.status };
      }
      const explanation = isAuth ? 'Провайдер отклонил ключ или доступ. Проверьте секретный API key и разрешения.' : isProxyIssue ? 'Это проблема публикации сайта, а не доказательство неверного ключа. Проверьте Cloudflare Pages Functions.' : 'Узел временно пропущен только в этом задании и будет повторно проверен позже.';
      setActivity(k, 'error', `${explanation} ${error.message}`, error.message);
      note(`${P[k].name}: ${error.message}. ${explanation}`);
    }
  }
}

/* ---------- Работа с файлами ---------- */
$('#file').addEventListener('change', e => {
  const selected = Array.from(e.target.files || []);
  const available = Math.max(0, CFG.maxFiles - S.files.length);
  S.files.push(...selected.slice(0, available));
  if (selected.length > available) note(`Можно прикрепить не более ${CFG.maxFiles} файлов за одно задание.`);
  e.target.value = '';
  files();
});
function files() {
  $('#files').replaceChildren(...S.files.map((file, index) => {
    const item = document.createElement('span');
    item.textContent = `${file.name} ×`;
    item.title = 'Нажмите, чтобы удалить файл';
    item.setAttribute('role', 'button');
    item.tabIndex = 0;
    const remove = () => { S.files.splice(index, 1); files(); };
    item.addEventListener('click', remove);
    item.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); remove(); } });
    return item;
  }));
}
async function attach(fileList) {
  let output = '', total = 0;
  for (const file of fileList) {
    output += `\n\n[Файл: ${file.name}; тип: ${file.type || 'не определён'}; размер: ${file.size} байт]\n`;
    const isText = /^text\//i.test(file.type) || /json|xml|javascript|yaml/i.test(file.type) || /\.(md|csv|txt|log|py|js|ts|jsx|tsx|html|css|yml|yaml|sql|sh|java|c|cpp|go|rs|php|rb|ini|toml|json|xml)$/i.test(file.name);
    if (!isText) {
      output += 'Двоичный файл. В этой статической версии содержимое бинарных файлов не загружается в API; переданы только имя, тип и размер.\n';
      continue;
    }
    const remaining = Math.max(0, Math.min(CFG.maxFileText, CFG.maxContextText - total));
    if (!remaining) { output += 'Текст не добавлен: достигнут лимит контекста прикреплённых файлов.\n'; continue; }
    // Читаем только нужный фрагмент, а не загружаем потенциально гигантский файл целиком в память.
    const snippet = await file.slice(0, remaining).text();
    output += snippet;
    total += snippet.length;
    if (file.size > remaining) output += `\n[Текст обрезан до ${remaining} байт для защиты памяти браузера.]\n`;
  }
  return output;
}

/* ---------- Режимы работы ---------- */
function choose() {
  return new Promise(resolve => {
    dlg.innerHTML = '<h3>Режим работы</h3><p>Выберите, как подключённые модели будут работать над заданием.</p><div class="acts"><button class="btn" type="button" data-mode="talk">Обсуждать сейчас</button><button class="btn" type="button" data-mode="build">Готовить проект</button><button class="btn ghost" type="button" data-mode="cancel">Закрыть</button></div>';
    dlg.oncancel = e => e.preventDefault();
    dlg.onclick = e => {
      const mode = e.target.dataset.mode;
      if (mode) { dlg.onclick = null; dlg.oncancel = null; dlg.close(); resolve(mode); }
    };
    dlg.showModal();
  });
}

async function discuss() {
  const system = SYS + ` Идёт коллективное обсуждение. Дополняй идеи коллег и предлагай новые альтернативные решения, не повторяя ранее названные (общий предел — ${CFG.maxAlternatives}). Пиши содержательно и кратко.`;
  for (let round = 0; round < CFG.rounds; round++) {
    for (const k of ORDER.filter(provider => S.on[provider])) {
      if (S.taskUnavailable.has(k)) continue;
      const doing = `Коллективное обсуждение, раунд ${round + 1} из ${CFG.rounds}`;
      const result = await ask(system, ctxt() + `\n\nТвоя очередь: ${P[k].name}. Раунд ${round + 1} из ${CFG.rounds}.`, k, doing);
      if (!result) return;
      say(result.k, result.t);
      S.log.push(`${P[result.k].name}: ${result.t}`);
    }
  }
  note('Обсуждение завершено.');
}

async function project() {
  for (let i = 0; i < STAGES.length; i++) {
    const live = availableProviders();
    if (!live.length) { note(`Работа остановлена перед этапом «${STAGES[i]}»: временно не осталось доступных узлов.`); return; }
    const preferred = live[i % live.length];
    S.currentStage = STAGES[i];
    note(`Этап ${i + 1} из ${STAGES.length}: ${STAGES[i]}.`);
    const result = await ask(SYS + ' Идёт поэтапная реализация проекта. Выполни только свой этап и передай результат дальше. Не утверждай, что запускал код или тесты, если ты этого не делал.', ctxt() + `\n\nЭтап ${i + 1} из ${STAGES.length}: ${STAGES[i]}.`, preferred, `Этап ${i + 1} из ${STAGES.length}: ${STAGES[i]}`);
    if (!result) return;
    say(result.k, `${STAGES[i]}\n\n${result.t}`);
    S.log.push(`Этап «${STAGES[i]}», ${P[result.k].name}: ${result.t}`);
  }
  note('Подготовка проекта завершена.');
}

$('#q').addEventListener('keydown', e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) $('#composer').requestSubmit(); });
$('#stopBtn').addEventListener('click', () => {
  if (!S.busy || !S.taskAbort) return;
  S.cancelRequested = true;
  $('#stopBtn').disabled = true;
  $('#stopBtn').textContent = '…';
  $('#stopBtn').dataset.tip = 'Останавливаем…';
  S.taskAbort.abort();
});
$('#composer').addEventListener('submit', async e => {
  e.preventDefault();
  if (S.busy) return;
  const text = $('#q').value.trim();
  if (!text && !S.files.length) return;
  if (!availableProviders().length) {
    toast('Пока нет доступной нейросети. Нажмите значок ключа вверху и подключите хотя бы один API-ключ.', 'warn', 6500);
    return;
  }
  S.taskAbort = new AbortController();
  S.cancelRequested = false;
  setBusy(true);
  const attachedFiles = [...S.files];
  let attachmentText = '';
  try { attachmentText = await attach(attachedFiles); }
  catch (error) { attachmentText = `\n[Не удалось прочитать вложение: ${error.message}]`; }
  S.userPrompt = text || 'Проанализируй прикреплённые файлы.';
  ensureChat(S.userPrompt);
  S.task = 'Задача пользователя:\n' + S.userPrompt + attachmentText;
  S.log = [];
  S.currentStage = '';
  S.taskUnavailable.clear();
  msg('u', 'Запрос', S.userPrompt + (attachedFiles.length ? '\n\nФайлы: ' + attachedFiles.map(file => file.name).join(', ') : ''));
  $('#q').value = '';
  S.files = [];
  files();
  paint();

  const first = await ask(SYS, ctxt() + '\n\nКратко (2–3 предложения) сформулируй, как ты понимаешь задачу, и назови главные неопределённости.', undefined, 'Анализирует задачу и формулирует план');
  if (first) {
    say(first.k, first.t);
    S.log.push(`Первичный анализ, ${P[first.k].name}: ${first.t}`);
  }
  if (!first) { setBusy(false); S.taskAbort = null; return; }
  $('#stopBtn').hidden = true;
  const mode = S.mode || 'build';
  if (mode === 'cancel') {
    note('Задание отменено перед запуском этапов.');
    setBusy(false);
    S.taskAbort = null;
    paint();
    return;
  }
  $('#stopBtn').hidden = false;
  await (mode === 'talk' ? discuss() : project());
  setBusy(false);
  S.taskAbort = null;
  const completed = currentChat();
  if (completed) {
    completed.status = completed.messages?.some(m => m.text?.includes('Подготовка проекта завершена.')) ? 'complete' : (S.cancelRequested ? 'stopped' : 'partial');
    if (mode === 'build' && completed.status === 'complete') { completed.savedProject = true; toast('Проект сохранён в истории. Его можно открыть или скачать в любой момент.'); }
    completed.updatedAt = Date.now(); saveChats();
  }
  paint();
});

/* ---------- Локальные аккаунты и восстановление рабочего пространства ---------- */
let authBusy = false;
function setAuthMode(mode) {
  S.authMode = mode;
  const registering = mode === 'register';
  $('#authTitle').textContent = registering ? 'Создать аккаунт' : 'С возвращением';
  $('#authSubtitle').textContent = registering ? 'Сохраняйте чаты и возвращайтесь к проектам в любой момент.' : 'Войдите в локальный профиль, чтобы открыть свои чаты.';
  $('#nameField').hidden = !registering;
  $('#authPass').autocomplete = registering ? 'new-password' : 'current-password';
  $('#authSubmit').innerHTML = registering ? 'Создать локальный аккаунт <span>↗</span>' : 'Войти в пространство <span>↗</span>';
  $('#authSwitchText').textContent = registering ? 'Уже есть локальный аккаунт?' : 'Впервые здесь?';
  $('#authSwitch').textContent = registering ? 'Войти' : 'Создать аккаунт';
  $('#authMessage').textContent = '';
}
$('#authSwitch').addEventListener('click', () => setAuthMode(S.authMode === 'register' ? 'login' : 'register'));
function encodeB64(bytes) { let str = ''; for (const b of new Uint8Array(bytes)) str += String.fromCharCode(b); return btoa(str); }
function decodeB64(value) { const str = atob(value); return Uint8Array.from(str, c => c.charCodeAt(0)); }
async function passwordDigest(password, saltText) {
  if (!window.crypto?.subtle) throw new Error('Для локальной регистрации нужен современный браузер с Web Crypto. Откройте сайт через HTTPS или localhost.');
  const salt = decodeB64(saltText);
  const material = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations: 120000, hash: 'SHA-256' }, material, 256);
  return encodeB64(bits);
}
function showAuth(message = '') {
  $('#authScreen').hidden = false;
  $('#topbar').hidden = true;
  $('#shell').hidden = true;
  $('#onb').hidden = true;
  $('#check').hidden = true;
  logo.hidden = true;
  setAuthMode(S.authMode || 'register');
  $('#authMessage').textContent = message;
  $('#authUser').focus();
}
function loadAccountData(account) {
  // Never leak one local profile's live node states/logs into another profile.
  S.on = {}; S.keyState = {}; S.modelOptions = {}; S.activity = {}; S.log = [];
  S.task = ''; S.userPrompt = ''; S.files = []; S.busy = false; S.taskAbort = null; S.cancelRequested = false;
  S.taskUnavailable.clear();
  S.selected = 'gpt'; S.currentStage = ''; S.previewHtml = '';
  S.listMode = 'all'; S.settings = { accent: 'ice', motion: true, speak: false };
  $('#chatSearch').value = ''; $('#inspector').hidden = true;
  $('#chat').replaceChildren(); $('#livePreview').hidden = true; $('#previewFrame').srcdoc = 'about:blank';
  S.account = { username: account.username, name: account.name || account.username };
  S.keys = load(userKey('keys'));
  if (!Object.keys(S.keys).length && Object.keys(LEGACY_KEYS).length && !localStorage.getItem('4aihub.legacy-migrated')) {
    S.keys = { ...LEGACY_KEYS };
    try { localStorage.setItem(userKey('keys'), JSON.stringify(S.keys)); localStorage.setItem('4aihub.legacy-migrated', '1'); } catch { /* key migration is best-effort */ }
  }
  const storedChats = load(userKey('chats'));
  S.chats = Array.isArray(storedChats) ? storedChats : [];
  try { S.currentChatId = localStorage.getItem(userKey('currentChat')) || ''; } catch { S.currentChatId = ''; }
  S.settings = { ...S.settings, ...load(userKey('settings')) };
  const previous = currentChat();
  if (previous?.status === 'working') {
    previous.status = 'interrupted';
    previous.messages ||= [];
    previous.messages.push({ cls: 's', head: '', text: 'Страница обновилась во время выполнения. Уже полученные ответы сохранены; незавершённый запрос не продолжился автоматически. Отправьте сообщение ещё раз, чтобы продолжить работу.', color: '', time: Date.now() });
    previous.updatedAt = Date.now();
  }
  S.keyState = {};
  S.modelOptions = {};
  S.taskUnavailable.clear();
  applySettings();
  try { localStorage.setItem(SESSION_KEY, S.account.username); } catch { /* local session is optional */ }
  logo.hidden = false;
  logo.classList.add('dock');
  main();
  renderChatList();
  if (previous) {
    S.currentChatId = previous.id;
    renderChatMessages(previous);
    saveChats();
  } else {
    chat.hidden = true;
    $('#homeWelcome').hidden = false;
  }
  if (Object.keys(S.keys).length) backgroundProviderChecks();
}
async function backgroundProviderChecks() {
  const keys = { ...S.keys };
  const results = await Promise.all(ORDER.map(async k => [k, keys[k] ? await check(k, keys[k], false) : { ok: false, state: 'missing', message: 'Ключ не введён.' }]));
  if (!S.account || S.account.username !== localStorage.getItem(SESSION_KEY)) return;
  for (const [k, result] of results) {
    S.keyState[k] = result;
    if (result.modelOptions?.length) S.modelOptions[k] = result.modelOptions;
    if (keys[k] && result.state === 'rejected') S.on[k] = false;
    else if (keys[k]) S.on[k] = true;
  }
  paint();
  const confirmed = ORDER.filter(k => ['ok', 'limited'].includes(S.keyState[k]?.state)).length;
  const rejected = ORDER.filter(k => keys[k] && S.keyState[k]?.state === 'rejected').length;
  $('#connectionSummary').textContent = confirmed ? `${confirmed} из ${ORDER.length} подтверждены` : rejected === Object.keys(keys).length ? 'Провайдеры отклонили ключи' : 'Не удалось подтвердить соединение';
  if (Object.keys(keys).length && confirmed === 0) toast('Пока ни один API не подтвердил подключение. Откройте ключи: приложение показывает отдельную причину для каждого провайдера. На Cloudflare Pages проверьте, что папка functions опубликована рядом с index.html.', 'warn', 8500);
  if (!$('#inspector').hidden) renderInspector();
}
$('#authForm').addEventListener('submit', async event => {
  event.preventDefault();
  if (authBusy) return;
  const username = $('#authUser').value.trim();
  const password = $('#authPass').value;
  const name = $('#authName').value.trim() || username;
  const key = username.toLocaleLowerCase('ru');
  if (!/^[\p{L}\p{N}._-]{3,32}$/u.test(username)) { $('#authMessage').textContent = 'Логин: от 3 до 32 символов, используйте буквы, цифры, точку, дефис или подчёркивание.'; return; }
  if (password.length < 6) { $('#authMessage').textContent = 'Пароль должен содержать не менее 6 символов.'; return; }
  authBusy = true; $('#authSubmit').disabled = true; $('#authSubmit').textContent = 'Проверяем…'; $('#authMessage').textContent = '';
  try {
    const records = accountStore();
    if (S.authMode === 'register') {
      if (records[key]) throw new Error('Этот логин уже занят в локальном хранилище. Войдите или выберите другой логин.');
      const salt = encodeB64(crypto.getRandomValues(new Uint8Array(16)));
      const hash = await passwordDigest(password, salt);
      records[key] = { username, name: name.slice(0, 48), salt, hash, createdAt: Date.now() };
      localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(records));
      loadAccountData(records[key]);
      toast('Добро пожаловать. Локальный профиль создан.');
    } else {
      const account = records[key];
      if (!account) throw new Error('Такого локального аккаунта в этом браузере нет. Создайте профиль или проверьте логин.');
      const hash = await passwordDigest(password, account.salt);
      if (hash !== account.hash) throw new Error('Пароль не совпадает. Проверьте раскладку и попробуйте снова.');
      loadAccountData(account);
      toast('Вы вошли. Восстанавливаем сохранённое пространство.');
    }
  } catch (error) {
    $('#authMessage').textContent = error.message || 'Не удалось открыть локальный профиль.';
  } finally {
    authBusy = false; $('#authSubmit').disabled = false;
    $('#authSubmit').innerHTML = S.authMode === 'register' ? 'Создать локальный аккаунт <span>↗</span>' : 'Войти в пространство <span>↗</span>';
  }
});

/* ---------- Вход: анимированный фирменный знак и восстановление сессии ---------- */
(async () => {
  await sleep(180);
  logo.dataset.d = '3';
  await sleep(580);
  logo.dataset.d = '4';
  await sleep(800);
  logo.classList.add('dock');
  await sleep(230);
  const savedUser = (() => { try { return localStorage.getItem(SESSION_KEY); } catch { return ''; } })();
  const accounts = accountStore();
  const account = savedUser ? Object.values(accounts).find(a => a.username.toLocaleLowerCase('ru') === savedUser.toLocaleLowerCase('ru')) : null;
  if (account) {
    loadAccountData(account);
  } else {
    showAuth();
  }
})();
})();
