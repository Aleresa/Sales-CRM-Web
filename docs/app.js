"use strict";
/* Sales CRM GitHub Pages edition.
   The public static shell contains NO customer data and NO GitHub credentials.
   A fine-grained repo-scoped token stays in RAM until the browser tab closes. */
const REPO = "Aleresa/Sales-CRM";
const API = "https://api.github.com/repos/" + REPO;
const MONTHS = ["Январь","Февраль","Март","Апрель","Май","Июнь","Июль","Август","Сентябрь","Октябрь","Ноябрь","Декабрь"];
const SHORT = ["Янв","Фев","Мар","Апр","Май","Июн","Июл","Авг","Сен","Окт","Ноя","Дек"];
const STATUS = ["К работе","Связаться","В работе","Ждём ответ","Заказ получен","Закрыт","Наблюдение","Сделка","Неактуально"];
const STAGES = ["К работе","В работе","Ждём ответ","Заказ получен","Закрыт"];
const PRIORITIES = ["Срочно","Высокий","Обычный"];
const root = document.getElementById("app");
const auth = document.getElementById("auth");
const shell = document.getElementById("shell");
const modal = document.getElementById("modal");
let token = "";
let data = { monthly:[],clients:[],categories:[],products:[],crm:{schema_version:1,tasks:[],clientOverrides:{}} };
const now = new Date();
let page = "overview", search = "", month = now.getMonth()+1, year = now.getFullYear(), saving = false;
const h = value => String(value ?? "").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const fmt = v => new Intl.NumberFormat("ru-RU",{maximumFractionDigits:0}).format(Number(v)||0);
const money = v => fmt(v)+" ₽";
const compact = v => new Intl.NumberFormat("ru-RU",{notation:"compact",maximumFractionDigits:1}).format(Number(v)||0);
const percent = v => (v>=0?"+":"")+v.toFixed(1).replace(".",",")+"%";
const n = v => Number(v)||0;
const dateOut = v => v ? new Date(v+"T12:00:00").toLocaleDateString("ru-RU",{day:"numeric",month:"short",year:"numeric"}) : "—";
const attr = h;
const option = (value,selected) => '<option value="'+attr(value)+'"'+(String(value)===String(selected)?" selected":"")+'>'+h(value)+'</option>';
const notice = (message,bad=false) => {
 const el=document.getElementById("notice");
 el.hidden=false;el.textContent=message;
 el.classList.toggle("bad",bad);
};
const clearNotice = ()=>document.getElementById("notice").hidden=true;
const requireToken = () => {if(!token)throw new Error("Не выполнен вход в приватный репозиторий.");};
function apiHeaders(){requireToken();return {"Authorization":"Bearer "+token,"Accept":"application/vnd.github+json","X-GitHub-Api-Version":"2022-11-28"};}
async function github(path,options={}){
 const response=await fetch(API+path,{...options,headers:{...apiHeaders(),...(options.headers||{})},cache:"no-store",referrerPolicy:"no-referrer"});
 if(!response.ok){
  const reasons={401:"Токен неверный или просрочен.",403:"Недостаточно прав токена (для редактирования нужен Contents: Read and write).",404:"Репозиторий или файл не найден. Проверь доступ токена.",409:"Конфликт обновления. Повтори попытку."};
  throw new Error(reasons[response.status]||"Ошибка GitHub API: "+response.status);
 }
 return response.json();
}
const decode = base64 => {
 const binary=atob(base64.replace(/\s/g,""));
 const bytes=Uint8Array.from(binary,c=>c.charCodeAt(0));
 return new TextDecoder().decode(bytes);
};
const encode = string => {
 const bytes=new TextEncoder().encode(string);
 let bin="";
 for(let i=0;i<bytes.length;i+=8192) bin+=String.fromCharCode(...bytes.slice(i,i+8192));
 return btoa(bin);
};
async function fileRead(name){
 const info=await github("/contents/data/"+name+".json?ref=main");
 if(info.encoding!=="base64")throw new Error("Необычный формат файла: "+name);
 return {sha:info.sha,value:JSON.parse(decode(info.content))};
}
async function writeJson(name,change,label){
 requireToken();
 for(let i=0;i<3;i++){
  const current=await fileRead(name);
  const next=change(current.value);
  const response=await fetch(API+"/contents/data/"+name+".json",{
   method:"PUT",referrerPolicy:"no-referrer",cache:"no-store",
   headers:{...apiHeaders(),"Content-Type":"application/json"},
   body:JSON.stringify({message:"crm: "+label,sha:current.sha,branch:"main",content:encode(JSON.stringify(next)+"\n")})
  });
  if(response.ok)return next;
  if(response.status===409)continue;
  if(response.status===403)throw new Error("Не хватает прав Contents: Read and write.");
  throw new Error("Не удалось сохранить в GitHub ("+response.status+").");
 }
 throw new Error("Конфликт одновременного изменения, повтори сохранение.");
}
async function loadData(){
 const names=["monthly","clients","categories","products","crm-state"];
 const files=await Promise.all(names.map(name=>fileRead(name)));
 data.monthly=files[0].value;data.clients=files[1].value;
 data.categories=files[2].value;data.products=files[3].value;data.crm=files[4].value;
}
function customers(){
 return data.clients.map(c=>({...c,...(data.crm.clientOverrides?.[c.id]||{})}));
}
function monthRecord(y,m){
 return data.monthly.find(r=>String(r.period).startsWith(y+"-"+String(m).padStart(2,"0")));
}
function header(title,description,controls=""){
 return '<div class="heading"><div><div class="eyebrow">SALES / CRM · PERSONAL WORKSPACE</div><h1>'+title+' <span class="spark">✦</span></h1><p>'+description+'</p></div>'+controls+'</div>';
}
function metric(label,value,icon,footer){
 return '<div class="metric"><div class="metric-head"><span>'+h(label)+'</span><div class="metric-icon">'+icon+'</div></div><strong>'+h(value)+'</strong><div class="metric-footer">'+footer+'</div></div>';
}
function empty(label,text){return '<div class="empty"><strong>'+h(label)+'</strong><p>'+h(text)+'</p></div>';}
function selectedMonth(){
 return '<div class="controls"><span>▦</span><select aria-label="Месяц" data-filter="month">'+MONTHS.map((v,i)=>option(i+1,month).replace('>'+h(i+1)+'</option>','>'+v+'</option>')).join("")+'</select><select aria-label="Год" data-filter="year">'+[2026,2025,2024,2027,2028,2029].sort((a,b)=>b-a).map(v=>option(v,year)).join("")+'</select></div>';
}
function lineChart(){
 const current=MONTHS.map((_,i)=>monthRecord(year,i+1)?.revenue??null);
 const prev=MONTHS.map((_,i)=>monthRecord(year-1,i+1)?.revenue??null);
 const all=[...current,...prev].filter(v=>v!=null).map(n);
 if(!all.length)return empty("Нет данных","Для выбранных лет выручка не загружена.");
 const max=Math.max(...all,1)*1.12;
 const w=760,height=270,left=50,right=17,top=14,bottom=38;
 const x=i=>left+i*(w-left-right)/11, y=v=>top+(max-n(v))/max*(height-top-bottom);
 const lines=[prev,current].map((arr,idx)=>{
  const pts=arr.map((v,i)=>v==null?null:[x(i),y(v)]).filter(Boolean);
  return '<polyline points="'+pts.map(p=>p.map(v=>v.toFixed(1)).join(",")).join(" ")+'" fill="none" stroke="'+(idx?"#c7b3f0":"#776a8b")+'" stroke-width="'+(idx?3:2)+'" stroke-linejoin="round" stroke-linecap="round"/>';
 }).join("");
 const grid=[0,1,2,3].map(i=>{
  const val=max*(1-i/3), yy=y(val);
  return '<line x1="'+left+'" y1="'+yy+'" x2="'+(w-right)+'" y2="'+yy+'" stroke="#443751" stroke-dasharray="4,7" stroke-width=".7"/><text x="0" y="'+(yy+4)+'" fill="#9286a5" font-size="11">'+h(compact(val))+'</text>';
 }).join("");
 const labels=SHORT.map((label,i)=>'<text x="'+x(i)+'" y="'+(height-10)+'" font-size="11" fill="#9286a5" text-anchor="middle">'+label+'</text>').join("");
 return '<div class="chart"><svg viewBox="0 0 '+w+' '+height+'" role="img" aria-label="График помесячной выручки">'+grid+lines+labels+'</svg><div class="legend"><span><i class="dot"></i>'+(year-1)+'</span><span><i class="dot purple"></i>'+year+'</span></div></div>';
}
function categoryBars(){
 const rows=data.categories.filter(c=>c.year===year).sort((a,b)=>n(b.revenue)-n(a.revenue)).slice(0,7);
 if(!rows.length)return empty("Нет категорий","За выбранный год категории не загружены.");
 const mx=Math.max(...rows.map(c=>n(c.revenue)),1);
 return '<div class="bar-list">'+rows.map(c=>'<div class="bar-row"><div><label title="'+attr(c.category)+'">'+h(c.category)+'</label><b>'+h(compact(c.revenue))+'</b></div><div class="track"><div class="fill" style="width:'+Math.max(1,n(c.revenue)/mx*100)+'%"></div></div></div>').join("")+'</div>';
}
function clientButton(c){
 const diff=n(c.current_revenue)-n(c.previous_revenue);
 return '<button class="item" data-action="client" data-id="'+attr(c.id)+'"><span class="initial">'+h(c.name.charAt(0))+'</span><span class="grow"><b>'+h(c.name)+'</b><small>'+h(c.category||c.segment||"Без категории")+'</small></span><span class="delta '+(diff<0?"negative":"positive")+'">'+(diff<0?"−":"+")+h(compact(Math.abs(diff)))+'</span><span>›</span></button>';
}
function renderOverview(){
 const m=monthRecord(year,month),prev=monthRecord(year-1,month);
 const growth=m&&prev&&n(prev.revenue)?(n(m.revenue)/n(prev.revenue)-1)*100:null;
 const trend=growth===null?"Сравнение недоступно":'<span class="change '+(growth<0?"negative":"positive")+'">'+percent(growth)+'</span> к прошлому году';
 const clients=customers().filter(c=>n(c.previous_revenue)>n(c.current_revenue)).sort((a,b)=>(n(a.current_revenue)-n(a.previous_revenue))-(n(b.current_revenue)-n(b.previous_revenue))).slice(0,5);
 const tasks=data.crm.tasks.filter(t=>!["Закрыт","Заказ получен"].includes(t.status)).slice(0,5);
 return header("Обзор продаж","Данные из приватного репозитория. Месяц выбирается автоматически.",selectedMonth())
 +'<section class="metric-grid">'+metric("Выручка · нетто",m?money(m.revenue):"—","◈",trend)+metric("Заказы",m?fmt(m.orders):"—","▤","За выбранный месяц")+metric("Активных клиентов",m?fmt(m.active_clients):"—","♧","Покупатели за месяц")+metric("Средний чек",m?money(m.avg_check):"—","▥","Средняя сумма отгрузки")+'</section>'
 +'<div class="two-col"><section class="panel"><div class="panel-head"><div><h2>Динамика выручки</h2><p>Сравнение '+(year-1)+' и '+year+' годов</p></div><span class="mini-tag">12 месяцев</span></div>'+lineChart()+'</section>'
 +'<section class="panel"><div class="panel-head"><div><h2>Товарные категории</h2><p>Крупнейшие категории · '+year+'</p></div><span class="mini-tag">TOP 7</span></div>'+categoryBars()+'</section></div>'
 +'<div class="lower"><section class="panel"><div class="panel-head"><div><h2>Клиенты, требующие внимания</h2><p>Наибольшее падение отгрузок, янв–сен 2025/2026</p></div><button class="panel-link" data-action="go" data-page="clients">Все клиенты →</button></div><div class="list">'+(clients.length?clients.map(clientButton).join(""):empty("Нет клиентов","Данные не загружены"))+'</div></section>'
 +'<section class="panel"><div class="panel-head"><div><h2>Задачи на контроле</h2><p>Открытые контакты и следующие шаги</p></div><button class="panel-link" data-action="go" data-page="tasks">Все задачи →</button></div><div class="list">'+(tasks.length?tasks.map(t=>'<div class="item"><span class="initial">☷</span><span class="grow"><b>'+h(t.title)+'</b><small>'+h(t.client_name||"Без клиента")+'</small></span><span class="tiny">'+h(dateOut(t.due_on))+'</span></div>').join(""):empty("Нет задач","Создай первую задачу во вкладке «Задачи»"))+'</div></section></div>'
 +'<p class="note">Показатели из выгрузки на 22.10.2026. Октябрь 2026 неполный и не сопоставим напрямую с полным октябрём 2025. ₽ — условная валюта исходного анализа.</p>';
}
function statusBadge(v){return '<span class="status">'+h(v||"К работе")+'</span>';}
function priorityBadge(v){return '<span class="priority '+(v==="Срочно"?"urgent":v==="Высокий"?"high":"")+'">'+h(v||"Обычный")+'</span>';}
function searchToolbar(placeholder){
 return '<div class="toolbar"><label class="search">⌕ <input id="search" type="search" placeholder="'+attr(placeholder)+'" value="'+attr(search)+'"></label><span class="tiny">Для фильтрации используй поиск</span></div>';
}
function renderClients(){
 const list=customers().filter(c=>(c.name+" "+c.category+" "+c.status).toLocaleLowerCase("ru").includes(search.toLocaleLowerCase("ru")));
 return header("Клиенты","История закупок, изменение выручки, контакты и CRM-статусы.")
 +searchToolbar("Поиск клиента, категории, статуса…")
 +'<section class="panel"><div class="table-wrap"><table class="data-table"><thead><tr><th>Контрагент</th><th>Отгрузки 2025</th><th>Отгрузки 2026</th><th>Изменение</th><th>Заказов 2026</th><th>Статус</th><th>Приоритет</th><th>Контакт</th></tr></thead><tbody>'
 +(list.length?list.map(c=>{
  const delta=n(c.current_revenue)-n(c.previous_revenue);
  return '<tr class="clickable" data-action="client" data-id="'+attr(c.id)+'"><td class="long"><b>'+h(c.name)+'</b><div class="tiny">'+h(c.category||"")+'</div></td><td>'+money(c.previous_revenue)+'</td><td>'+money(c.current_revenue)+'</td><td class="'+(delta<0?"loss":"gain")+'">'+(delta<0?"−":"+")+money(Math.abs(delta))+'</td><td>'+fmt(c.orders_current)+'</td><td>'+statusBadge(c.status)+'</td><td>'+priorityBadge(c.priority)+'</td><td>'+h(dateOut(c.next_contact_on))+'</td></tr>';
 }).join(""):'<tr><td colspan="8">'+empty("Ничего не найдено","Измени поисковый запрос")+'</td></tr>')
 +'</tbody></table></div></section><p class="note">Суммы клиентов — отгрузки без распределения возвратов. Сравнение — январь–сентябрь.</p>';
}
function renderProducts(){
 const list=data.products.filter(p=>(p.name+" "+p.code+" "+p.category).toLocaleLowerCase("ru").includes(search.toLocaleLowerCase("ru"))).sort((a,b)=>Math.abs(n(b.revenue_2026)-n(b.revenue_2025))-Math.abs(n(a.revenue_2026)-n(a.revenue_2025)));
 return header("Товары и SKU","Потери и рост по каждому товару. Всего "+fmt(data.products.length)+" позиций.")
 +searchToolbar("Поиск названия, артикула или группы…")
 +'<section class="panel"><div class="table-wrap"><table class="data-table"><thead><tr><th>Код</th><th>Наименование</th><th>Группа</th><th>2025</th><th>2026</th><th>Разница</th><th>Шт. 2026</th></tr></thead><tbody>'
 +list.slice(0,150).map(p=>{const diff=n(p.revenue_2026)-n(p.revenue_2025);return '<tr><td>'+h(p.code)+'</td><td class="long">'+h(p.name)+'</td><td>'+h(p.category)+'</td><td>'+money(p.revenue_2025)+'</td><td>'+money(p.revenue_2026)+'</td><td class="'+(diff<0?"loss":"gain")+'">'+(diff<0?"−":"+")+money(Math.abs(diff))+'</td><td>'+fmt(p.units_2026)+'</td></tr>';}).join("")
 +'</tbody></table></div></section><p class="note">Показаны первые 150 из '+list.length+' результатов; используйте поиск для конкретного товара.</p>';
}
function renderCategories(){
 const map=new Map();
 data.categories.forEach(c=>{
  const key=c.category;
  if(!map.has(key))map.set(key,{category:key,prev:0,current:0});
  const x=map.get(key);if(c.year===2025)x.prev=n(c.revenue);if(c.year===2026)x.current=n(c.revenue);
 });
 const rows=[...map.values()].filter(c=>c.category.toLocaleLowerCase("ru").includes(search.toLocaleLowerCase("ru"))).sort((a,b)=>Math.abs(b.current-b.prev)-Math.abs(a.current-a.prev));
 return header("Категории","Структура продаж, сравнение января–сентября 2025 и 2026.")+searchToolbar("Поиск товарной категории…")
 +'<section class="panel"><div class="table-wrap"><table class="data-table"><thead><tr><th>Категория</th><th>2025 · нетто</th><th>2026 · нетто</th><th>Изменение, ₽</th><th>Изменение, %</th></tr></thead><tbody>'
 +rows.map(c=>{const d=c.current-c.prev;return '<tr><td class="long">'+h(c.category)+'</td><td>'+money(c.prev)+'</td><td>'+money(c.current)+'</td><td class="'+(d<0?"loss":"gain")+'">'+(d<0?"−":"+")+money(Math.abs(d))+'</td><td class="'+(d<0?"loss":"gain")+'">'+(c.prev?percent(d/c.prev*100):"—")+'</td></tr>';}).join("")
 +'</tbody></table></div></section>';
}
function renderTasks(){
 const tasks=data.crm.tasks;
 const headings=STAGES;
 const total=tasks.filter(t=>!["Закрыт","Заказ получен"].includes(t.status)).length;
 return header("Задачи и контакты","Канбан-доска и следующие шаги для клиентов.",'<span class="mini-tag">Открыто: '+total+'</span>')
 +'<section class="panel create-task"><h2>＋ Создать задачу</h2><form id="task-form" class="create-grid"><input name="title" required maxlength="300" placeholder="Например: позвонить клиенту" aria-label="Задача"><input name="client" maxlength="220" placeholder="Клиент" aria-label="Клиент"><input name="due" type="date" aria-label="Срок"><select name="priority" aria-label="Приоритет">'+PRIORITIES.map(v=>option(v,"Обычный")).join("")+'</select><button class="primary" type="submit">Добавить</button></form></section>'
 +'<div class="board">'+headings.map(stage=>{
  const cards=tasks.filter(t=>t.status===stage);
  return '<section class="column"><h2>● '+h(stage)+' · '+cards.length+'</h2>'
  +cards.map(t=>'<article class="task"><div class="task-top">'+priorityBadge(t.priority)+'<span class="date '+(t.due_on&&t.due_on<new Date().toISOString().slice(0,10)?"late":"")+'">'+h(dateOut(t.due_on))+'</span></div><h3>'+h(t.title)+'</h3><small>'+h(t.client_name||"Без клиента")+'</small><select aria-label="Изменить статус" data-task-id="'+attr(t.id)+'">'+STAGES.map(v=>option(v,t.status)).join("")+'</select></article>').join("")
  +'</section>';
 }).join("")+'</div>';
}
function render(){
 clearNotice();document.getElementById("breadcrumb").textContent=({overview:"Обзор",clients:"Клиенты",products:"Товары",categories:"Категории",tasks:"Задачи"})[page];
 document.querySelectorAll("#nav button").forEach(el=>el.classList.toggle("active",el.dataset.page===page));
 root.innerHTML=({overview:renderOverview,clients:renderClients,products:renderProducts,categories:renderCategories,tasks:renderTasks})[page]();
}
function navigate(v){page=v;search="";document.getElementById("sidebar").classList.remove("open");render();window.scrollTo({top:0,behavior:"instant"});}
function openClient(id){
 const c=customers().find(x=>x.id===id);if(!c)return;
 modal.hidden=false;
 const delta=n(c.current_revenue)-n(c.previous_revenue);
 document.getElementById("drawer-body").innerHTML=
 '<div class="drawer-top"><div class="eyebrow">КАРТОЧКА КЛИЕНТА</div><button class="icon-btn" id="close-modal" aria-label="Закрыть">×</button></div><h2>'+h(c.name)+'</h2><p>'+h(c.category||c.segment||"Клиент")+'</p>'
 +'<div class="stat"><span>Отгрузки 2025</span><b>'+money(c.previous_revenue)+'</b></div><div class="stat"><span>Отгрузки 2026</span><b>'+money(c.current_revenue)+'</b></div><div class="stat"><span>Изменение</span><b class="'+(delta<0?"loss":"gain")+'">'+money(delta)+'</b></div>'
 +'<div class="stat"><span>Последний заказ</span><b>'+h(dateOut(c.last_order_on))+'</b></div>'
 +'<form id="client-form" data-id="'+attr(id)+'">'
 +'<label class="field">Статус<select name="status">'+STATUS.map(v=>option(v,c.status)).join("")+'</select></label>'
 +'<label class="field">Приоритет<select name="priority">'+PRIORITIES.map(v=>option(v,c.priority)).join("")+'</select></label>'
 +'<label class="field">Следующий контакт<input name="contact" type="date" value="'+attr(c.next_contact_on||"")+'"></label>'
 +'<label class="field">Заметки<textarea name="notes" rows="6" maxlength="4000">'+h(c.notes||"")+'</textarea></label>'
 +'<button type="submit" class="primary save">Сохранить изменения в GitHub</button></form>';
 document.getElementById("close-modal").addEventListener("click",()=>modal.hidden=true);
}
async function updateClient(form){
 if(saving)return;
 const id=form.dataset.id;
 const client=data.clients.find(c=>c.id===id);
 if(!client)return;
 const values=new FormData(form);
 const overrides={status:String(values.get("status")),priority:String(values.get("priority")),next_contact_on:String(values.get("contact"))||null,notes:String(values.get("notes")||"")};
 saving=true;form.querySelector("button").disabled=true;
 try{
  data.crm=await writeJson("crm-state",s=>({...s,clientOverrides:{...(s.clientOverrides||{}),[id]:overrides}}),"update client "+id);
  modal.hidden=true;render();notice("Карточка сохранена в приватном репозитории.");
 }catch(e){alert(e.message);}
 finally{saving=false;form.querySelector("button").disabled=false;}
}
async function updateTask(id,status){
 if(saving)return;saving=true;
 try{
  data.crm=await writeJson("crm-state",s=>({...s,tasks:s.tasks.map(t=>t.id===id?{...t,status}:t)}),"update task "+id);
  render();notice("Статус задачи обновлён.");
 }catch(e){render();notice(e.message,true);}
 finally{saving=false;}
}
async function addTask(form){
 if(saving)return;
 const raw=new FormData(form);const title=String(raw.get("title")||"").trim();
 if(!title)return;
 const id="t-"+crypto.randomUUID();
 const task={id,title,client_name:String(raw.get("client")||"").trim(),due_on:String(raw.get("due"))||null,status:"К работе",priority:String(raw.get("priority")||"Обычный"),created_at:new Date().toISOString()};
 saving=true;form.querySelector("button").disabled=true;
 try{
  data.crm=await writeJson("crm-state",s=>({...s,tasks:[...(s.tasks||[]),task]}),"create task");
  render();notice("Задача создана и сохранена.");
 }catch(e){notice(e.message,true);}
 finally{saving=false;if(form.isConnected)form.querySelector("button").disabled=false;}
}
document.getElementById("auth-form").addEventListener("submit",async event=>{
 event.preventDefault();
 const input=document.getElementById("token"),error=document.getElementById("auth-error"),button=event.target.querySelector("button");
 token=input.value.trim();button.disabled=true;button.textContent="Проверяем доступ…";error.hidden=true;
 try{
  const repo=await github("");
  if(repo.full_name!==REPO || !repo.private)throw new Error("Не удалось подтвердить приватный репозиторий.");
  await loadData();
  input.value="";auth.hidden=true;shell.hidden=false;render();
 }catch(e){token="";error.textContent=e.message;error.hidden=false;}
 finally{button.disabled=false;button.innerHTML="Открыть мою CRM <span>→</span>";}
});
document.getElementById("disconnect").addEventListener("click",()=>{token="";data={monthly:[],clients:[],categories:[],products:[],crm:{tasks:[],clientOverrides:{}}};shell.hidden=true;auth.hidden=false;document.getElementById("token").value="";modal.hidden=true;});
document.getElementById("nav").addEventListener("click",event=>{const b=event.target.closest("[data-page]");if(b)navigate(b.dataset.page);});
document.getElementById("mobile-menu").addEventListener("click",()=>document.getElementById("sidebar").classList.toggle("open"));
document.getElementById("modal").addEventListener("click",event=>{if(event.target===modal)modal.hidden=true;});
document.addEventListener("keydown",event=>{if(event.key==="Escape"){modal.hidden=true;document.getElementById("sidebar").classList.remove("open");}});
root.addEventListener("click",event=>{
 const el=event.target.closest("[data-action]");
 if(!el)return;
 if(el.dataset.action==="go")navigate(el.dataset.page);
 if(el.dataset.action==="client")openClient(el.dataset.id);
});
root.addEventListener("change",event=>{
 const el=event.target;
 if(el.dataset.filter==="month"){month=Number(el.value);render();}
 if(el.dataset.filter==="year"){year=Number(el.value);render();}
 if(el.dataset.taskId)updateTask(el.dataset.taskId,el.value);
});
root.addEventListener("input",event=>{
 if(event.target.id!=="search")return;
 search=event.target.value;
 const selection=event.target.selectionStart;
 render();
 const field=document.getElementById("search");if(field){field.focus();try{field.setSelectionRange(selection,selection);}catch{}}
});
root.addEventListener("submit",event=>{
 if(event.target.id!=="task-form")return;event.preventDefault();addTask(event.target);
});
document.getElementById("modal").addEventListener("submit",event=>{
 if(event.target.id!=="client-form")return;event.preventDefault();updateClient(event.target);
});
