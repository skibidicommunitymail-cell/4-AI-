// Узлы сети и вызовы API. Ключи вводит пользователь; в репозитории их нет.
const ORDER=['grok','gpt','claude','gemini'];
// Идентификаторы моделей: сверьте с актуальными списками в консолях провайдеров.
const MODEL={grok:'grok-4',gpt:'gpt-5-mini',claude:'claude-sonnet-5-5',gemini:'gemini-flash-latest'};
// Значки упрощённые: замените содержимое svg на официальные логотипы.
const P={
 grok:{name:'Grok',color:'#111111',org:'Разработчик: xAI',own:'Основатель: Илон Маск',url:'https://console.x.ai',where:'раздел API Keys',
  svg:'<circle cx="24" cy="25" r="13" fill="none" stroke="currentColor" stroke-width="4"/><path d="M9 41L39 9" stroke="currentColor" stroke-width="4" stroke-linecap="round"/>'},
 gpt:{name:'ChatGPT',color:'#10a37f',org:'Разработчик: OpenAI',own:'Основатель: Сэм Альтман',url:'https://platform.openai.com/api-keys',where:'раздел API keys',
  svg:'<path d="M24 5l16 9v20l-16 9-16-9V14z" fill="none" stroke="currentColor" stroke-width="4" stroke-linejoin="round"/><circle cx="24" cy="24" r="6" fill="currentColor"/>'},
 claude:{name:'Claude',color:'#d97757',org:'Разработчик: Anthropic',own:'Основатель: Дарио Амодеи',url:'https://console.anthropic.com/settings/keys',where:'раздел API Keys',
  svg:'<g stroke="currentColor" stroke-width="4.5" stroke-linecap="round"><path d="M24 6v36M6 24h36M11 11l26 26M37 11L11 37"/></g>'},
 gemini:{name:'Gemini',color:'#4285f4',org:'Разработчик: Google',own:'Руководитель: Сундар Пичаи',url:'https://aistudio.google.com/apikey',where:'кнопка Get API key',
  svg:'<path d="M24 4c1.5 12 8 18.5 20 20-12 1.5-18.5 8-20 20-1.5-12-8-18.5-20-20 12-1.5 18.5-8 20-20z" fill="currentColor"/>'}
};
const fail=m=>Object.assign(new Error(m),{limit:false});
const J={'content-type':'application/json'};

async function call(k,key,sys,text){
  let r;
  try{
    if(k==='claude')r=await fetch('https://api.anthropic.com/v1/messages',{method:'POST',headers:{...J,'x-api-key':key,'anthropic-version':'2023-06-01','anthropic-dangerous-direct-browser-access':'true'},body:JSON.stringify({model:MODEL[k],max_tokens:2000,system:sys,messages:[{role:'user',content:text}]})});
    else if(k==='gemini')r=await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL[k]}:generateContent?key=${encodeURIComponent(key)}`,{method:'POST',headers:J,body:JSON.stringify({systemInstruction:{parts:[{text:sys}]},contents:[{role:'user',parts:[{text}]}]})});
    else r=await fetch((k==='gpt'?'https://api.openai.com/v1':'https://api.x.ai/v1')+'/chat/completions',{method:'POST',headers:{...J,authorization:'Bearer '+key},body:JSON.stringify({model:MODEL[k],messages:[{role:'system',content:sys},{role:'user',content:text}]})});
  }catch(e){throw fail('сеть недоступна или запрос заблокирован')}
  const raw=await r.text();let j={};try{j=JSON.parse(raw)}catch{}
  if(!r.ok){const e=fail('ошибка '+r.status);e.limit=r.status===429||r.status===402||/quota|credit|exhaust|billing/i.test(raw);throw e}
  const t=k==='claude'?j.content?.map(c=>c.text||'').join(''):k==='gemini'?j.candidates?.[0]?.content?.parts?.map(p=>p.text||'').join(''):j.choices?.[0]?.message?.content;
  if(!t)throw fail('пустой ответ');
  return t;
}

// Проверка ключа запросом списка моделей (токены не расходуются).
async function check(k,key){
  const u={grok:'https://api.x.ai/v1/models',gpt:'https://api.openai.com/v1/models',claude:'https://api.anthropic.com/v1/models',gemini:'https://generativelanguage.googleapis.com/v1beta/models?key='+encodeURIComponent(key)}[k];
  const h=k==='claude'?{'x-api-key':key,'anthropic-version':'2023-06-01','anthropic-dangerous-direct-browser-access':'true'}:k==='gemini'?{}:{authorization:'Bearer '+key};
  try{return (await fetch(u,{headers:h})).ok}catch{return false}
}
