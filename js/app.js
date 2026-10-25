(()=>{
const $=s=>document.querySelector(s),sleep=ms=>new Promise(r=>setTimeout(r,ms));
const CFG={rounds:3,maxAlternatives:1000};
const STAGES=['Анализ и план','Реализация','Проверка и исправление','Итоговая сборка'];
const SYS='Ты участвуешь в совместной работе четырёх нейросетей: Grok, ChatGPT, Claude и Gemini. Отвечай по-русски, спокойным деловым тоном, без emoji, капслока и восклицаний.';
const load=()=>{try{return JSON.parse(localStorage.getItem('4aihub.keys'))||{}}catch{return{}}};
const S={keys:load(),on:{},log:[],task:'',files:[],busy:false,lim:false};
const logo=$('#logo'),stage=$('#stage'),cv=$('#cv'),c2=cv.getContext('2d'),dlg=$('#dlg'),chat=$('#chat'),app=$('#app');
let nodes=[];
const icon=k=>`<svg viewBox="0 0 48 48" aria-hidden="true">${P[k].svg}</svg>`;
const restore=()=>new Date(Date.now()+864e5).toLocaleDateString('ru-RU',{day:'numeric',month:'long',timeZone:'UTC'});

/* ---------- Онбординг ---------- */
function showOnb(){
  app.hidden=true;$('#keysBtn').hidden=true;
  $('#cards').innerHTML=ORDER.map((k,i)=>`<div class="card" style="--i:${i};--c:${P[k].color}"><div class="ico">${icon(k)}</div><h3>${P[k].name}</h3><p>${P[k].org}<br>${P[k].own}</p><button type="button" data-g="${k}">Инструкция по получению API ключа</button></div>`).join('');
  $('#inputs').innerHTML=ORDER.map(k=>`<input type="password" name="${k}" autocomplete="off" spellcheck="false" placeholder="Ключ ${P[k].name}" aria-label="API ключ ${P[k].name}">`).join('');
  ORDER.forEach(k=>{$(`input[name=${k}]`).value=S.keys[k]||''});
  $('#onb').hidden=false;
}
function guide(k){
  dlg.oncancel=null;
  dlg.innerHTML=`<h3>Ключ ${P[k].name}</h3><ol><li>Откройте консоль <a href="${P[k].url}" target="_blank" rel="noopener noreferrer">${P[k].url.replace('https://','')}</a> и войдите в аккаунт.</li><li>Найдите: ${P[k].where}.</li><li>Создайте новый ключ и скопируйте его. Обычно он показывается один раз.</li><li>Вставьте ключ в поле на этой странице. При необходимости подключите оплату в консоли.</li></ol><div class="acts"><button class="btn" data-x>Закрыть</button></div>`;
  dlg.onclick=e=>{if(e.target.dataset.x!==undefined)dlg.close()};
  dlg.showModal();
}
document.addEventListener('click',e=>{const g=e.target.dataset&&e.target.dataset.g;if(g)guide(g)});
$('#keysBtn').onclick=showOnb;

$('#keys').onsubmit=async e=>{
  e.preventDefault();
  const keys={};ORDER.forEach(k=>{const v=$(`input[name=${k}]`).value.trim();if(v)keys[k]=v});
  if(!Object.keys(keys).length){$('#err').textContent='Введите хотя бы один API ключ.';return}
  const c=$('#check'),p=c.querySelector('p');
  $('#err').textContent='';$('#onb').hidden=true;c.classList.remove('done');p.textContent='Проверка состояния узлов...';c.hidden=false;
  const [ok]=await Promise.all([Promise.all(ORDER.map(k=>keys[k]?check(k,keys[k]):false)),sleep(1200)]);
  if(!ok.some(Boolean)){c.hidden=true;$('#onb').hidden=false;$('#err').textContent='Ни один ключ не подтверждён. Проверьте данные и повторите попытку.';return}
  S.keys=keys;localStorage.setItem('4aihub.keys',JSON.stringify(keys));
  c.classList.add('done');p.textContent='Узлы готовы';await sleep(1100);
  c.hidden=true;main(ORDER.filter((k,i)=>keys[k]&&!ok[i]));
};

/* ---------- Главный экран ---------- */
function main(bad=[]){
  ORDER.forEach(k=>S.on[k]=!!S.keys[k]&&!bad.includes(k));
  $('#onb').hidden=true;$('#keysBtn').hidden=false;app.hidden=false;
  if(!nodes.length)nodes=ORDER.map((k,i)=>{const e=document.createElement('div');e.className='node';e.style.cssText=`--i:${i};--c:${P[k].color}`;e.innerHTML=`<div class="ico">${icon(k)}</div>${P[k].name}`;stage.append(e);return e});
  paint();layout();
  bad.forEach(k=>note(`Узел ${P[k].name} недоступен: ключ не подтверждён.`));
}
function paint(){nodes.forEach((e,i)=>e.classList.toggle('off',!S.on[ORDER[i]]));lines()}
function layout(){
  const W=stage.clientWidth,H=stage.clientHeight,R=Math.min(W*.4,(H-70)/.93);
  nodes.forEach((e,i)=>{const a=(155-i*43.3)*Math.PI/180;e.style.left=W/2+R*Math.cos(a)+'px';e.style.top=H-8-R*Math.sin(a)+'px'});
  lines();
}
function lines(t=performance.now()){
  const W=stage.clientWidth,H=stage.clientHeight,d=devicePixelRatio||1;
  if(cv.width!==Math.round(W*d)||cv.height!==Math.round(H*d)){cv.width=W*d;cv.height=H*d}
  c2.setTransform(d,0,0,d,0,0);c2.clearRect(0,0,W,H);
  const tx=W/2,ty=H-2;
  nodes.forEach((e,i)=>{
    const k=ORDER[i],on=S.on[k],sx=parseFloat(e.style.left),sy=parseFloat(e.style.top)-e.offsetHeight/2+56;
    const g=c2.createLinearGradient(sx,sy,tx,ty);
    g.addColorStop(0,on?P[k].color:'#c8c8c8');g.addColorStop(1,on?'#111111':'#c8c8c8');
    c2.strokeStyle=g;c2.lineWidth=1.6;
    c2.globalAlpha=on?(S.busy?.45+.4*Math.abs(Math.sin(t/900-i*.7)):.85):.35;
    c2.beginPath();c2.moveTo(sx,sy);c2.bezierCurveTo(sx,sy+(ty-sy)*.75,tx,ty-(ty-sy)*.4,tx,ty);c2.stroke();
  });
  c2.globalAlpha=1;c2.fillStyle='#111';c2.beginPath();c2.arc(tx,ty-1,3,0,7);c2.fill();
}
new ResizeObserver(layout).observe(stage);

function setBusy(v){
  S.busy=v;app.classList.toggle('busy',v);$('#composer button').disabled=v;
  if(v)requestAnimationFrame(function f(t){lines(t);if(S.busy)requestAnimationFrame(f)});else lines();
}

/* ---------- Чат ---------- */
function msg(cls,head,text,color){
  chat.hidden=false;app.classList.add('chatting');
  const m=document.createElement('div');m.className='m '+cls;
  if(head){const b=document.createElement('b');b.textContent=head;if(color)b.style.setProperty('--c',color);m.append(b)}
  m.append(document.createTextNode(text));chat.append(m);chat.scrollTop=chat.scrollHeight;
}
const note=t=>msg('s','',t),say=(k,t)=>msg('',P[k].name,t,P[k].color);
const ctxt=()=>S.task+(S.log.length?'\n\n--- Ход работы ---\n'+S.log.join('\n\n').slice(-20000):'');

// Каскад: при отказе узла он отключается, контекст (S.task + S.log) уходит следующему активному.
async function ask(sys,text,prefer){
  for(;;){
    const live=ORDER.filter(k=>S.on[k]);
    if(!live.length){note(S.lim?`Общий лимит сети исчерпан. Доступ будет восстановлен ${restore()} в 00:00 UTC`:'Нет доступных узлов. Проверьте API ключи в настройках.');return null}
    const k=live.includes(prefer)?prefer:live[0];
    try{return {k,t:await call(k,S.keys[k],sys,text)}}
    catch(e){S.on[k]=false;S.lim=e.limit;paint();note(e.limit?`Лимит токенов модели ${P[k].name} исчерпан. Переключение на следующий узел.`:`Узел ${P[k].name} недоступен: ${e.message}. Переключение на следующий узел.`)}
  }
}

/* ---------- Файлы ---------- */
$('#file').onchange=e=>{S.files.push(...e.target.files);e.target.value='';files()};
function files(){$('#files').replaceChildren(...S.files.map((f,i)=>{const s=document.createElement('span');s.textContent=f.name+' ×';s.onclick=()=>{S.files.splice(i,1);files()};return s}))}
async function attach(fs){
  let s='';
  for(const f of fs){
    s+=`\n\n[Файл: ${f.name}; тип: ${f.type||'не определён'}; ${f.size} байт]\n`;
    s+=/^text\/|json|xml|javascript/.test(f.type)||/\.(md|csv|txt|log|py|js|ts|jsx|tsx|html|css|yml|yaml|sql|sh|java|c|cpp|go|rs|php|rb|ini|toml)$/i.test(f.name)?(await f.text()).slice(0,60000):'Двоичный формат: содержимое не разобрано, передан только состав метаданных.';
  }
  return s;
}

/* ---------- Отправка и режимы ---------- */
function choose(){return new Promise(res=>{
  dlg.innerHTML='<h3>Режим работы</h3><p>Выберите, как модели будут работать над задачей.</p><div class="acts"><button class="btn" data-m="talk">Обсуждать сейчас</button><button class="btn" data-m="build">Готовить проект</button></div>';
  dlg.oncancel=e=>e.preventDefault();
  dlg.onclick=e=>{const m=e.target.dataset.m;if(m){dlg.onclick=null;dlg.oncancel=null;dlg.close();res(m)}};
  dlg.showModal();
})}

async function discuss(){
  const sys=SYS+` Идёт коллективное обсуждение. Дополняй идеи коллег и предлагай новые альтернативные решения, не повторяя названные ранее (общий предел — ${CFG.maxAlternatives}). Пиши кратко.`;
  for(let r=0;r<CFG.rounds;r++)for(const k of ORDER.filter(x=>S.on[x])){
    const a=await ask(sys,ctxt()+`\n\nТвоя очередь: ${P[k].name}. Раунд ${r+1} из ${CFG.rounds}.`,k);
    if(!a)return;say(a.k,a.t);S.log.push(`${P[a.k].name}: ${a.t}`);
  }
  note('Обсуждение завершено.');
}
async function project(){
  for(let i=0;i<STAGES.length;i++){
    const live=ORDER.filter(x=>S.on[x]);
    const a=await ask(SYS+' Идёт поэтапная реализация проекта. Выполни только свой этап и передай результат дальше.',ctxt()+`\n\nЭтап ${i+1} из ${STAGES.length}: ${STAGES[i]}.`,live[i%live.length]);
    if(!a)return;say(a.k,STAGES[i]+'\n\n'+a.t);S.log.push(`Этап «${STAGES[i]}», ${P[a.k].name}: ${a.t}`);
  }
  note('Подготовка проекта завершена.');
}

$('#q').onkeydown=e=>{if(e.key==='Enter'&&(e.ctrlKey||e.metaKey))$('#composer').requestSubmit()};
$('#composer').onsubmit=async e=>{
  e.preventDefault();if(S.busy)return;
  const text=$('#q').value.trim();if(!text&&!S.files.length)return;
  S.task='Задача пользователя:\n'+text+await attach(S.files);S.log=[];
  msg('u','Запрос',text+(S.files.length?'\n\nФайлы: '+S.files.map(f=>f.name).join(', '):''));
  $('#q').value='';S.files=[];files();
  setBusy(true);
  const r=await ask(SYS,ctxt()+'\n\nКратко (2–3 предложения) сформулируй, как ты понимаешь задачу, и назови главные неопределённости.');
  if(r){say(r.k,r.t);S.log.push(`Первичный анализ, ${P[r.k].name}: ${r.t}`)}
  setBusy(false);if(!r)return;
  const mode=await choose();
  setBusy(true);await(mode==='talk'?discuss():project());setBusy(false);
};

/* ---------- Запуск ---------- */
(async()=>{
  if(Object.keys(S.keys).length){await sleep(200);logo.dataset.d='4';await sleep(900);logo.classList.add('dock');await sleep(900);main();return}
  await sleep(400);logo.dataset.d='3';await sleep(2200);logo.dataset.d='4';await sleep(1800);
  logo.classList.add('dock');await sleep(1000);showOnb();
})();
})();
