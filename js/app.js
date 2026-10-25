(() => {
'use strict';
const $ = selector => document.querySelector(selector);
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const CFG = { rounds: 3, maxAlternatives: 1000, maxFiles: 8, maxFileText: 40000, maxContextText: 150000 };
const STAGES = ['Анализ и план', 'Реализация', 'Проверка и исправление', 'Итоговая сборка'];
const SYS = 'Ты участвуешь в совместной работе четырёх нейросетей: Grok, ChatGPT, Claude и Gemini. Отвечай по-русски, спокойно и деловым тоном, без emoji, капслока и восклицаний.';
const load = () => { try { return JSON.parse(localStorage.getItem('4aihub.keys')) || {}; } catch { return {}; } };
const S = {
  keys: load(), on: {}, keyState: {}, modelOptions: {}, log: [], task: '', userPrompt: '', files: [], busy: false,
  taskUnavailable: new Set(), activity: {}, selected: 'gpt', currentStage: '', taskAbort: null, cancelRequested: false,
};
const logo = $('#logo'), stage = $('#stage'), cv = $('#cv'), c2 = cv.getContext('2d'), dlg = $('#dlg'), chat = $('#chat'), app = $('#app');
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
  $('#keysBtn').hidden = true;
  $('#cards').innerHTML = ORDER.map((k, i) => `<article class="card" style="--i:${i};--c:${P[k].color}"><div class="ico">${icon(k)}</div><h3>${P[k].name}</h3><p>${P[k].org}<br>${P[k].own}</p><button type="button" data-guide="${k}">Как получить API-ключ</button></article>`).join('');
  $('#inputs').innerHTML = ORDER.map(k => `<input type="password" name="${k}" autocomplete="off" spellcheck="false" placeholder="API-ключ: ${P[k].name}" aria-label="API-ключ ${P[k].name}">`).join('');
  ORDER.forEach(k => { $(`#inputs input[name="${k}"]`).value = S.keys[k] || ''; });
  $('#onb').hidden = false;
  $('#err').textContent = '';
}

function guide(k) {
  dlg.innerHTML = `<h3>API-ключ ${P[k].name}</h3><ol><li>Откройте <a href="${P[k].url}" target="_blank" rel="noopener noreferrer">официальную консоль ${P[k].name}</a>.</li><li>Найдите раздел «${P[k].where}» и создайте ключ.</li><li>Скопируйте ключ и вставьте в поле на этой странице. Не публикуйте его.</li><li>Проверьте, что для аккаунта доступен API и не исчерпана квота.</li></ol><p>Проверка подтверждает доступ к API и выбирает модель из списка, который доступен вашему ключу. Запрос генерации при проверке не отправляется, поэтому проверка не расходует токены генерации.</p><div class="acts"><button class="btn" type="button" data-close-guide>Закрыть</button></div>`;
  dlg.oncancel = null;
  dlg.onclick = e => { if (e.target.hasAttribute('data-close-guide')) dlg.close(); };
  dlg.showModal();
}

document.addEventListener('click', e => {
  const guideKey = e.target.closest('[data-guide]')?.dataset.guide;
  if (guideKey && P[guideKey]) guide(guideKey);
});
$('#keysBtn').addEventListener('click', showOnb);
$('#clearKeysBtn').addEventListener('click', () => {
  S.keys = {};
  S.keyState = {};
  S.modelOptions = {};
  try { localStorage.removeItem('4aihub.keys'); } catch { /* хранилище может быть запрещено браузером */ }
  ORDER.forEach(k => { const input = $(`#inputs input[name="${k}"]`); if (input) input.value = ''; });
  $('#err').textContent = 'Сохранённые в этом браузере ключи очищены.';
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
    localStorage.setItem('4aihub.keys', JSON.stringify(keys));
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
  if (!S.on[k]) return S.keyState[k]?.state === 'rejected' ? 'Нет доступа' : 'Неактивна';
  if (S.taskUnavailable.has(k)) return 'Пропущена';
  if (activity.state === 'working') return 'Работает…';
  if (activity.state === 'error') return 'Повторит позже';
  if (activity.state === 'done') return 'Ответила';
  if (S.keyState[k]?.state === 'unknown' || S.keyState[k]?.state === 'error') return 'Не проверена';
  return 'Готова';
}
function main() {
  S.on = {};
  ORDER.forEach(k => { S.on[k] = !!S.keys[k] && S.keyState[k]?.state !== 'rejected' && S.keyState[k]?.state !== 'missing'; });
  $('#onb').hidden = true;
  $('#check').hidden = true;
  $('#keysBtn').hidden = false;
  app.hidden = false;
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
  ORDER.filter(k => S.keys[k] && !S.on[k]).forEach(k => note(`Узел ${P[k].name} не подключён: ${S.keyState[k]?.message || 'ключ не подтверждён'}. Причина указана отдельно; другие узлы продолжают работать.`));
  ORDER.filter(k => S.keys[k] && ['unknown', 'error'].includes(S.keyState[k]?.state)).forEach(k => note(`Проверка ${P[k].name} не подтвердила полностью доступность. Ключ не помечен как заведомо неверный; приложение попробует использовать его при запросе. Причина: ${S.keyState[k]?.message || 'временная ошибка API'}`));
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
  $('#stopBtn').textContent = 'Остановить';
  $('#composer textarea').disabled = value;
  $('#composer .file-btn').style.opacity = value ? '.45' : '1';
  $('#composer .file-btn').style.pointerEvents = value ? 'none' : 'auto';
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

/* ---------- Лента ответов и диагностика ---------- */
function msg(cls, head, text, color) {
  chat.hidden = false;
  app.classList.add('chatting');
  const message = document.createElement('div');
  message.className = `m ${cls}`;
  if (head) {
    const heading = document.createElement('b');
    heading.textContent = head;
    if (color) heading.style.setProperty('--c', color);
    message.append(heading);
  }
  message.append(document.createTextNode(String(text ?? '')));
  chat.append(message);
  chat.scrollTop = chat.scrollHeight;
}
const note = text => msg('s', '', text);
const say = (k, text) => msg('', P[k].name, text, P[k].color);
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
      if (isAuth) {
        S.on[k] = false;
        S.keyState[k] = { state: 'rejected', ok: false, message: error.message, status: error.status };
      }
      setActivity(k, 'error', `${isAuth ? 'Проверьте ключ или разрешения API' : 'Временная ошибка; узел пропущен только в этом задании'}. ${error.message}`, error.message);
      note(`${P[k].name}: ${error.message}. ${isAuth ? 'Провайдер отклонил ключ/доступ; проверьте его в настройках.' : 'Узел пропущен только до конца этого задания, а не отключён навсегда.'}`);
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
    dlg.innerHTML = '<h3>Режим работы</h3><p>Выберите, как подключённые модели будут работать над заданием.</p><div class="acts"><button class="btn" type="button" data-mode="talk">Обсуждать сейчас</button><button class="btn" type="button" data-mode="build">Готовить проект</button><button class="btn ghost" type="button" data-mode="cancel">Отменить задание</button></div>';
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
  $('#stopBtn').textContent = 'Останавливаем…';
  S.taskAbort.abort();
});
$('#composer').addEventListener('submit', async e => {
  e.preventDefault();
  if (S.busy) return;
  const text = $('#q').value.trim();
  if (!text && !S.files.length) return;
  if (!availableProviders().length) {
    note('Нет подтверждённых узлов. Откройте «API-ключи и проверка», исправьте ключи и повторите проверку.');
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
  const mode = await choose();
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
  paint();
});

/* ---------- Вход: плавное появление логотипа и проверка сохранённых ключей ---------- */
(async () => {
  await sleep(220);
  logo.dataset.d = '3';
  await sleep(720);
  logo.dataset.d = '4';
  await sleep(900);
  logo.classList.add('dock');
  await sleep(350);
  if (Object.keys(S.keys).some(k => S.keys[k])) {
    await verifyAndLaunch(S.keys);
  } else {
    showOnb();
  }
})();
})();
