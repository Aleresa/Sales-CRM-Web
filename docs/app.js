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
let productCompareYear = 2025, categoryCompareYear = 2025;
let page = "overview", search = "", month = now.getMonth()+1, year = now.getFullYear(), saving = false;
let productSort = "loss", categorySort = "loss", productReverse = false, categoryReverse = false;
let clientView = "grouped"; // Default: one line per actual customer, not per legal entity.
let clientSortKey = "delta", clientSortDirection = "asc";
let clientStatusFilter = "", clientPriorityFilter = "";
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
  const isFile = path.startsWith("/contents/data/");
  const fileName = isFile ? path.split("/").pop().split("?")[0] : "";
  const reasons={
   401:"Токен отклонён GitHub: проверь срок действия и правильность копирования.",
   403:"GitHub отклонил запрос (403). Проверь Repository permissions → Contents (Read для просмотра, Read and write для изменений).",
   404:isFile
    ? "GitHub не дал прочитать файл "+fileName+". Репозиторий найден, но проверь права Contents: Read у токена."
    : "GitHub не видит приватный репозиторий Aleresa/Sales-CRM с этим токеном. Укажи Resource owner: Aleresa → Repository access: Only select repositories → Sales-CRM (без -Web).",
   409:"Конфликт обновления. Повтори попытку."
  };
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
function groups(){
 return Array.isArray(data.crm.groups) ? data.crm.groups : [];
}
function groupForClient(id){
 return groups().find(group=>Array.isArray(group.clientIds) && group.clientIds.includes(id))||null;
}
function groupMembers(group){
 const ids=new Set(group.clientIds||[]);
 return customers().filter(c=>ids.has(c.id));
}
function summarizeGroup(group){
 const members=groupMembers(group);
 return {
  id:group.id,name:group.name,members,
  previous_revenue:members.reduce((s,c)=>s+n(c.previous_revenue),0),
  current_revenue:members.reduce((s,c)=>s+n(c.current_revenue),0),
  orders_current:members.reduce((s,c)=>s+n(c.orders_current),0)
 };
}
function portfolio(){
 const used=new Set(groups().flatMap(g=>g.clientIds||[]));
 return [...groups().map(summarizeGroup),...customers().filter(c=>!used.has(c.id))];
}
function sortingChoices(kind){
 return kind==="products"
  ? [["loss","Наибольшее падение"],["growth","Наибольший рост"],["current","Выручка 2026"],["previous","Выручка 2025"],["units","Количество 2026"],["name","По названию"]]
  : [["loss","Наибольшее падение"],["growth","Наибольший рост"],["current","Выручка 2026"],["previous","Выручка 2025"],["name","По названию"]];
}
function sortingControls(kind){
 const sort=kind==="products"?productSort:categorySort;
 const reversed=kind==="products"?productReverse:categoryReverse;
 return '<label class="sort-control">Сортировать: <select aria-label="Сортировка" data-sort="'+kind+'">'+sortingChoices(kind).map(([key,title])=>option(key,sort).replace('>'+key+'</option>','>'+title+'</option>')).join("")+'</select></label>'
 +'<button type="button" class="sort-reverse" data-action="reverse-sort" data-kind="'+kind+'" aria-label="Изменить порядок сортировки" title="Обратный порядок">'+(reversed?"↑":"↓")+'</button>';
}
function applySort(list,kind){
 const key=kind==="products"?productSort:categorySort;
 const reverse=kind==="products"?productReverse:categoryReverse;
 const revenue=(c,y)=>n(kind==="products"?c["revenue_"+y]:y===2026?c.current:c.prev);
 const delta=c=>revenue(c,2026)-revenue(c,2025);
 const cmp=(a,b)=>{
  if(key==="name")return String(kind==="products"?a.name:a.category).localeCompare(String(kind==="products"?b.name:b.category),"ru");
  if(key==="loss")return delta(a)-delta(b);
  if(key==="growth")return delta(b)-delta(a);
  if(key==="current")return revenue(b,2026)-revenue(a,2026);
  if(key==="previous")return revenue(b,2025)-revenue(a,2025);
  if(key==="units")return n(b.units_2026)-n(a.units_2026);
  return 0;
 };
 return list.sort((a,b)=>(reverse?-1:1)*cmp(a,b));
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
 return '<div class="controls"><span>▦</span><select aria-label="Месяц" data-filter="month">'+MONTHS.map((v,i)=>option(i+1,month).replace('>'+h(i+1)+'</option>','>'+v+'</option>')).join("")+'</select><select aria-label="Год" data-filter="year">'+[2029,2028,2027,2026,2025,2024,2023].sort((a,b)=>b-a).map(v=>option(v,year)).join("")+'</select></div>';
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
 const grouped=Array.isArray(c.members);
 return '<button class="item" data-action="'+(grouped?"group":"client")+'" data-id="'+attr(c.id)+'"><span class="initial">'+h(c.name.charAt(0))+'</span><span class="grow"><b>'+h(c.name)+'</b><small>'+(grouped?h(c.members.length+" юрлиц · группа"):h(c.category||c.segment||"Без категории"))+'</small></span><span class="delta '+(diff<0?"negative":"positive")+'">'+(diff<0?"−":"+")+h(compact(Math.abs(diff)))+'</span><span>›</span></button>';
}
function renderOverview(){
 const m=monthRecord(year,month),prev=monthRecord(year-1,month);
 const growth=m&&prev&&n(prev.revenue)?(n(m.revenue)/n(prev.revenue)-1)*100:null;
 const trend=growth===null?"Сравнение недоступно":'<span class="change '+(growth<0?"negative":"positive")+'">'+percent(growth)+'</span> к прошлому году';
 const clients=portfolio().filter(c=>n(c.previous_revenue)>n(c.current_revenue)).sort((a,b)=>(n(a.current_revenue)-n(a.previous_revenue))-(n(b.current_revenue)-n(b.previous_revenue))).slice(0,5);
 const tasks=taskBundles().filter(b=>b.openCount>0).slice(0,5);
 return header("Обзор продаж","Данные из приватного репозитория. Месяц выбирается автоматически.",selectedMonth())
 +'<section class="metric-grid">'+metric("Выручка · нетто",m?money(m.revenue):"—","◈",trend)+metric("Заказы",m?.orders!=null?fmt(m.orders):"—","▤","За выбранный месяц")+metric("Активных клиентов",m?.active_clients!=null?fmt(m.active_clients):"—","♧","Покупатели за месяц")+metric("Средний чек",m?.avg_check!=null?money(m.avg_check):"—","▥","Средняя сумма отгрузки")+'</section>'
 +'<div class="two-col"><section class="panel"><div class="panel-head"><div><h2>Динамика выручки</h2><p>Сравнение '+(year-1)+' и '+year+' годов</p></div><span class="mini-tag">12 месяцев</span></div>'+lineChart()+'</section>'
 +'<section class="panel"><div class="panel-head"><div><h2>Товарные категории</h2><p>Крупнейшие категории · '+year+'</p></div><span class="mini-tag">TOP 7</span></div>'+categoryBars()+'</section></div>'
 +'<div class="lower"><section class="panel"><div class="panel-head"><div><h2>Клиенты, требующие внимания</h2><p>Наибольшее падение отгрузок, янв–сен 2025/2026</p></div><button class="panel-link" data-action="go" data-page="clients">Все клиенты →</button></div><div class="list">'+(clients.length?clients.map(clientButton).join(""):empty("Нет клиентов","Данные не загружены"))+'</div></section>'
 +'<section class="panel"><div class="panel-head"><div><h2>Задачи на контроле</h2><p>Открытые контакты и следующие шаги</p></div><button class="panel-link" data-action="go" data-page="tasks">Все задачи →</button></div><div class="list">'+(tasks.length?tasks.map(t=>'<div class="item"><span class="initial">☷</span><span class="grow"><b>'+h(t.name)+'</b><small>'+h(t.openCount)+' задач · '+h(t.anchor.title)+'</small></span><span class="tiny">'+h(dateOut(t.due_on))+'</span></div>').join(""):empty("Нет задач","Создай первую задачу во вкладке «Задачи»"))+'</div></section></div>'
 +'<p class="note">Показатели из выгрузки на 22.10.2026. Октябрь 2026 неполный и не сопоставим напрямую с полным октябрём 2025. ₽ — условная валюта исходного анализа.</p>';
}
function statusBadge(v){return '<span class="status">'+h(v||"К работе")+'</span>';}
function priorityBadge(v){return '<span class="priority '+(v==="Срочно"?"urgent":v==="Высокий"?"high":"")+'">'+h(v||"Обычный")+'</span>';}
function searchToolbar(placeholder){
 return '<div class="toolbar"><label class="search">⌕ <input id="search" type="search" placeholder="'+attr(placeholder)+'" value="'+attr(search)+'"></label><span class="tiny">Для фильтрации используй поиск</span></div>';
}
function clientRowDetails(c){
 const members=Array.isArray(c.members)?c.members:[c];
 const statuses=[...new Set(members.map(m=>String(m.status||"К работе").trim()).filter(Boolean))].sort((a,b)=>a.localeCompare(b,"ru"));
 const priorities=[...new Set(members.map(m=>String(m.priority||"Обычный").trim()).filter(Boolean))];
 const priorityRank=p=>p==="Срочно"?0:p==="Высокий"?1:p==="Обычный"?2:3;
 priorities.sort((a,b)=>priorityRank(a)-priorityRank(b)||a.localeCompare(b,"ru"));
 const contacts=members.map(m=>String(m.next_contact_on||"")).filter(v=>/^\d{4}-\d{2}-\d{2}$/.test(v)).sort();
 return {members,statuses,priority:priorities[0]||"",contact:contacts[0]||"",
   mixed:statuses.length>1,group:Array.isArray(c.members)};
}
function compareClientRows(a,b){
 const k=clientSortKey, dir=clientSortDirection==="asc"?1:-1;
 const av=a.client,bv=b.client,ai=a.info,bi=b.info;
 const numValue=x=>({
   previous:n(x.previous_revenue),current:n(x.current_revenue),
   delta:n(x.current_revenue)-n(x.previous_revenue),
   orders:n(x.orders_current)
 })[k];
 let result=0;
 if(["previous","current","delta","orders"].includes(k))result=numValue(av)-numValue(bv);
 else if(k==="secondary"){
  if(clientView==="grouped")result=ai.members.length-bi.members.length;
  else result=(groupForClient(av.id)?.name||"").localeCompare(groupForClient(bv.id)?.name||"","ru");
 }else if(k==="priority"){
  const rank=x=>x==="Срочно"?0:x==="Высокий"?1:x==="Обычный"?2:3;
  result=rank(ai.priority)-rank(bi.priority)||ai.priority.localeCompare(bi.priority,"ru");
 }else if(k==="contact"){
  // Blank dates always at the end, regardless of direction.
  if(!ai.contact||!bi.contact) return ai.contact? -1 : bi.contact? 1 : av.name.localeCompare(bv.name,"ru");
  result=ai.contact.localeCompare(bi.contact);
 }else if(k==="status"){
  result=ai.statuses.join(", ").localeCompare(bi.statuses.join(", "),"ru");
 }else result=av.name.localeCompare(bv.name,"ru");
 return result*dir||av.name.localeCompare(bv.name,"ru");
}
function clientSortHeading(title,key){
 const active=clientSortKey===key;
 const arrow=active?(clientSortDirection==="asc"?"↑":"↓"):"↕";
 const aria=active?(clientSortDirection==="asc"?"ascending":"descending"):"none";
 return '<th aria-sort="'+aria+'"><button type="button" class="client-sort-btn'+(active?" active":"")+'" data-client-sort="'+key+'" aria-label="Сортировать по: '+attr(title)+'">'+h(title)
   +'<span class="client-sort-arrow" aria-hidden="true">'+arrow+'</span></button></th>';
}
function clientStatusCell(info){
 if(!info.statuses.length)return '<span class="tiny">—</span>';
 if(info.statuses.length===1)return statusBadge(info.statuses[0]);
 // Display actual statuses so filtering one member of a group is understandable.
 const first=clientStatusFilter&&info.statuses.includes(clientStatusFilter)?clientStatusFilter:info.statuses[0];
 const ordered=[first,...info.statuses.filter(x=>x!==first)];
 return '<div class="client-status-list" title="'+attr(info.statuses.join(" · "))+'">'
   +ordered.slice(0,2).map(statusBadge).join("")
   +(ordered.length>2?'<span class="client-more-status">+'+(ordered.length-2)+'</span>':"")+'</div>';
}
function renderClients(){
 const byGroup=clientView==="grouped";
 const needle=search.trim().toLocaleLowerCase("ru");
 const all=(byGroup?portfolio():customers()).map(client=>({client,info:clientRowDetails(client)}));
 const items=all.filter(({client:c,info})=>{
  const matchesSearch=!needle||[
    c.name,...info.members.flatMap(m=>[m.name,m.category||"",m.status||"",m.priority||""]),
    ...(byGroup?[]:[groupForClient(c.id)?.name||""])
   ].join(" ").toLocaleLowerCase("ru").includes(needle);
  return matchesSearch
    &&(!clientStatusFilter||info.statuses.includes(clientStatusFilter))
    &&(!clientPriorityFilter||info.priority===clientPriorityFilter);
 }).sort(compareClientRows);
 const allStatuses=[...new Set(customers().map(c=>String(c.status||"К работе").trim()).filter(Boolean))]
   .sort((a,b)=>a.localeCompare(b,"ru"));
 const allPriorities=[...new Set(customers().map(c=>String(c.priority||"Обычный").trim()).filter(Boolean))];
 const orderedPriorities=[...PRIORITIES.filter(p=>allPriorities.includes(p)),
   ...allPriorities.filter(p=>!PRIORITIES.includes(p)).sort((a,b)=>a.localeCompare(b,"ru"))];
 const statusOptions='<option value="">Все статусы</option>'+allStatuses.map(value=>option(value,clientStatusFilter)).join("");
 const priorityOptions='<option value="">Все приоритеты</option>'+orderedPriorities.map(value=>option(value,clientPriorityFilter)).join("");
 const count=portfolio().length;
 const controls='<div class="client-view-controls" role="group" aria-label="Вид списка клиентов">'
  +'<button type="button" data-client-view="grouped" class="'+(byGroup?"active":"")+'">По клиентам</button>'
  +'<button type="button" data-client-view="legal" class="'+(!byGroup?"active":"")+'">По юрлицам</button></div>';
 const rows=items.map(({client:c,info})=>{
  const isGroup=info.group;
  const delta=n(c.current_revenue)-n(c.previous_revenue);
  const memberCount=info.members.length;
  const group=(!byGroup&&!isGroup)?groupForClient(c.id):null;
  const details=isGroup
   ? memberCount+' юрлиц: '+info.members.slice(0,3).map(m=>m.name).join(' · ')+(memberCount>3?' · …':'')
   : (c.category||"Без категории");
  const secondary=byGroup
   ? '<span class="'+(isGroup?"status":"tiny")+'">'+(isGroup?memberCount+' юрлиц':'1 юрлицо')+'</span>'
   : (group?'<span class="status">'+h(group.name)+'</span>':'<span class="tiny">—</span>');
  const priority=info.priority?priorityBadge(info.priority):'<span class="tiny">—</span>';
  return '<tr class="clickable" data-action="'+(isGroup?"group":"client")+'" data-id="'+attr(c.id)+'">'
    +'<td class="long"><b>'+h(c.name)+'</b><div class="tiny client-subtitle">'+h(details)+'</div></td>'
    +'<td>'+secondary+'</td>'
    +'<td>'+money(c.previous_revenue)+'</td><td>'+money(c.current_revenue)+'</td>'
    +'<td class="'+(delta<0?"loss":"gain")+'">'+(delta<0?"−":"+")+money(Math.abs(delta))+'</td>'
    +'<td>'+fmt(c.orders_current)+'</td><td>'+clientStatusCell(info)+'</td><td>'+priority+'</td>'
    +'<td>'+h(dateOut(info.contact))+'</td></tr>';
 }).join("");
 const reset=clientStatusFilter||clientPriorityFilter
   ?'<button type="button" class="client-clear-filters" data-client-clear>Сбросить фильтры ×</button>':"";
 return header("Клиенты",byGroup
   ?"Один реальный клиент — одна строка. Отгрузки и заказы всех его юрлиц суммируются."
   :"Все юридические лица по отдельности. В колонке «Группа» видно, кому они принадлежат.")
 +'<div class="client-list-top">'+controls+'<span class="tiny">'+fmt(count)+' клиентов · '+fmt(customers().length)+' юрлицо/контрагент · '+fmt(groups().length)+' групп</span></div>'
 +searchToolbar(byGroup?"Поиск клиента или любого его юрлица…":"Поиск юрлица, группы, категории…")
 +'<div class="client-filter-bar"><label>Статус<select data-client-filter="status" aria-label="Фильтр по статусу">'+statusOptions+'</select></label>'
 +'<label>Приоритет<select data-client-filter="priority" aria-label="Фильтр по приоритету">'+priorityOptions+'</select></label>'
 +reset+'<span class="client-result-count">Показано '+items.length+' из '+all.length+'</span></div>'
 +'<section class="panel"><div class="table-wrap"><table class="data-table client-table">'
 +'<thead><tr>'+clientSortHeading(byGroup?"Реальный клиент":"Контрагент","name")
 +clientSortHeading(byGroup?"Юрлиц":"Группа клиентов","secondary")
 +clientSortHeading("Отгрузки 2025","previous")+clientSortHeading("Отгрузки 2026","current")
 +clientSortHeading("Изменение","delta")+clientSortHeading("Заказов 2026","orders")
 +clientSortHeading("Статус","status")+clientSortHeading("Приоритет","priority")
 +clientSortHeading("Контакт","contact")+'</tr></thead>'
 +'<tbody>'+(items.length?rows:'<tr><td colspan="9">'+empty("Ничего не найдено","Измени фильтры или поисковый запрос")+'</td></tr>')+'</tbody>'
 +'</table></div></section><p class="note">Нажми заголовок колонки для сортировки ↑↓. В группе показываются статусы её участников и самый срочный приоритет. Фильтр «Статус» находит группу, если статус есть хотя бы у одного юрлица; фильтр «Приоритет» — по самому срочному в группе. Дата контакта — ближайшая из запланированных. Групповая выручка и заказы суммируются без двойного учёта контрагентов.</p>';
}
function renderProducts(){
 const list=applySort(data.products.filter(p=>(p.name+" "+p.code+" "+p.category).toLocaleLowerCase("ru").includes(search.toLocaleLowerCase("ru"))),"products");
 return header("Товары и SKU","Потери и рост по каждому товару. Всего "+fmt(data.products.length)+" позиций.")
 +searchToolbar("Поиск названия, артикула или группы…")
 +'<div class="sort-strip">'+sortingControls("products")+'</div>'
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
 const rows=applySort([...map.values()].filter(c=>c.category.toLocaleLowerCase("ru").includes(search.toLocaleLowerCase("ru"))),"categories");
 return header("Категории","Структура продаж, сравнение января–сентября 2025 и 2026.")+searchToolbar("Поиск товарной категории…")+'<div class="sort-strip">'+sortingControls("categories")+'</div>'
 +'<section class="panel"><div class="table-wrap"><table class="data-table"><thead><tr><th>Категория</th><th>2025 · нетто</th><th>2026 · нетто</th><th>Изменение, ₽</th><th>Изменение, %</th></tr></thead><tbody>'
 +rows.map(c=>{const d=c.current-c.prev;return '<tr><td class="long">'+h(c.category)+'</td><td>'+money(c.prev)+'</td><td>'+money(c.current)+'</td><td class="'+(d<0?"loss":"gain")+'">'+(d<0?"−":"+")+money(Math.abs(d))+'</td><td class="'+(d<0?"loss":"gain")+'">'+(c.prev?percent(d/c.prev*100):"—")+'</td></tr>';}).join("")
 +'</tbody></table></div></section>';
}
function taskClient(t){
 const group=groups().find(g=>g.id===t.groupId || g.name.toLocaleLowerCase("ru")===String(t.client_name||"").toLocaleLowerCase("ru"));
 if(group)return {key:"group:"+group.id,name:group.name,groupId:group.id};
 const person=customers().find(c=>c.name.toLocaleLowerCase("ru")===String(t.client_name||"").toLocaleLowerCase("ru"));
 if(person){
  const parent=groupForClient(person.id);
  if(parent)return {key:"group:"+parent.id,name:parent.name,groupId:parent.id};
  return {key:"person:"+person.id,name:person.name};
 }
 return {key:"free:"+String(t.client_name||t.id),name:t.client_name||"Без клиента"};
}
function taskBundles(){
 const result=new Map();
 for(const task of data.crm.tasks){
  const account=taskClient(task);
  const key=account.groupId?"g:"+account.groupId: "task:"+task.id;
  if(!result.has(key))result.set(key,{...account,tasks:[]});
  result.get(key).tasks.push(task);
 }
 return [...result.values()].map(x=>{
  x.tasks.sort((a,b)=>(a.due_on||"9999").localeCompare(b.due_on||"9999"));
  const open=x.tasks.filter(t=>!["Закрыт","Заказ получен"].includes(t.status));
  const anchor=open[0]||x.tasks[0];
  x.anchor=anchor;
  x.stage=open.length?anchor.status:anchor.status;
  x.due_on=anchor.due_on;
  x.priority=open.some(t=>t.priority==="Срочно")?"Срочно":open.some(t=>t.priority==="Высокий")?"Высокий":"Обычный";
  x.openCount=open.length;
  return x;
 });
}
function taskEntityOptions(){
 const groupsAsOptions=groups().slice().sort((a,b)=>a.name.localeCompare(b.name,"ru"))
  .map(g=>'<option value="g:'+attr(g.id)+'">♧ '+h(g.name)+' · '+(g.clientIds||[]).length+' юрлиц</option>');
 const assigned=new Set(groups().flatMap(g=>g.clientIds||[]));
 const independent=customers().filter(c=>!assigned.has(c.id)).sort((a,b)=>a.name.localeCompare(b.name,"ru"))
  .map(c=>'<option value="c:'+attr(c.id)+'">'+h(c.name)+'</option>');
 return '<option value="">Выбрать клиента (необязательно)</option><optgroup label="Группы клиентов">'+groupsAsOptions.join("")+'</optgroup><optgroup label="Отдельные контрагенты">'+independent.join("")+'</optgroup>';
}

function renderTasks(){
 const bundles=taskBundles();
 const total=bundles.filter(b=>b.openCount>0).length;
 return header("Задачи и контакты","Одна карточка на реального клиента. Внутри — задачи всех его юридических лиц.",'<span class="mini-tag">Клиентов с открытыми задачами: '+total+'</span>')
 +'<section class="panel create-task"><h2>＋ Новая задача</h2><form id="task-form" class="create-grid">'
 +'<input name="title" required maxlength="300" placeholder="Например: обсудить закупку" aria-label="Задача">'
 +'<select name="client" aria-label="Реальный клиент">'+taskEntityOptions()+'</select>'
 +'<input name="due" type="date" aria-label="Срок">'
 +'<select name="priority" aria-label="Приоритет">'+PRIORITIES.map(v=>option(v,"Обычный")).join("")+'</select>'
 +'<button class="primary" type="submit">Добавить</button></form></section>'
 +'<div class="board">'+STAGES.map(stage=>{
  const cards=bundles.filter(b=>b.stage===stage);
  return '<section class="column"><h2>● '+h(stage)+' · '+cards.length+' клиентов</h2>'
   +cards.map(bundle=>{
     const isGroup=!!bundle.groupId;
     const head=(isGroup?'<button type="button" class="task-group-link" data-action="group" data-id="'+attr(bundle.groupId)+'">'+h(bundle.name)+' ↗</button>':'<strong>'+h(bundle.name)+'</strong>');
     const rows=bundle.tasks.map(t=>'<div class="task-subitem"><div class="task-subtitle">'+h(t.title)+'</div>'
      +'<div class="task-submeta"><span class="tiny">'+(isGroup?h(t.client_name||bundle.name)+" · ":"")+h(dateOut(t.due_on))+'</span>'
      +'<select aria-label="Статус задачи" data-task-id="'+attr(t.id)+'">'+STAGES.map(v=>option(v,t.status)).join("")+'</select></div></div>').join("");
     return '<article class="task group-task"><div class="task-top">'+priorityBadge(bundle.priority)+'<span class="date '+(bundle.due_on&&bundle.due_on<new Date().toISOString().slice(0,10)?"late":"")+'">'+h(dateOut(bundle.due_on))+'</span></div>'
      +'<div class="task-account">'+head+'</div>'
      +(bundle.tasks.length>1?'<div class="tiny">'+bundle.tasks.length+' задачи внутри группы</div>':'')
      +'<div class="task-sublist">'+rows+'</div></article>';
   }).join("")+'</section>';
 }).join("")+'</div><p class="note">Исходные задачи юрлиц не удалены: они собраны под общим клиентом. Каждая задача сохраняет собственный срок и статус.</p>';
}
function render(){
 clearNotice();document.getElementById("breadcrumb").textContent=({overview:"Обзор",clients:"Клиенты",groups:"Группы клиентов",products:"Товары",categories:"Категории",tasks:"Задачи",recovery:"Возврат продаж",contact:"План контактов",opportunities:"Остатки и рост",lost:"Потерянные клиенты",integration:"МойСклад · обновление"})[page];
 document.querySelectorAll("#nav button").forEach(el=>el.classList.toggle("active",el.dataset.page===page));
 root.innerHTML=({overview:renderOverview,clients:renderClients,groups:renderGroups,products:renderProducts,categories:renderCategories,tasks:renderTasks,recovery:renderRecovery,contact:renderContactQueue,opportunities:displayStockOpportunities,lost:displayLostClients,integration:renderIntegration})[page]();
}
function navigate(v){page=v;search="";document.getElementById("sidebar").classList.remove("open");render();window.scrollTo({top:0,behavior:"instant"});}
function openClient(id){
 const c=customers().find(x=>x.id===id);if(!c)return;
 modal.hidden=false;delete modal.dataset.groupId;
 const group=groupForClient(id);
 const delta=n(c.current_revenue)-n(c.previous_revenue);
 document.getElementById("drawer-body").innerHTML=
 '<div class="drawer-top"><div class="eyebrow">КАРТОЧКА КЛИЕНТА</div><button class="icon-btn" id="close-modal" aria-label="Закрыть">×</button></div><h2>'+h(c.name)+'</h2><p>'+h(c.category||c.segment||"Клиент")+'</p>'
 +(group?'<button type="button" class="small-btn" data-open-group="'+attr(group.id)+'">♧ Группа '+h(group.name)+' →</button>':'<p class="tiny">Контрагент пока не привязан к группе</p>')
 +'<button type="button" class="recovery-client-label" data-recovery-open="'+(group?"g:"+attr(group.id):"c:"+attr(id))+'">↗ Разбор закупок и товары для возврата</button>'
 +'<button type="button" class="recovery-client-label" data-insight-open="'+(group?"g:"+attr(group.id):"c:"+attr(id))+'">◈ Остатки и точки роста 2023–2026</button>'
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
 const entity=String(raw.get("client")||"");
 let groupId=null,clientName="";
 if(entity.startsWith("g:")){
  const group=groups().find(g=>g.id===entity.slice(2));
  if(!group){notice("Выбранная группа не найдена",true);return;}
  groupId=group.id;clientName=group.name;
 }else if(entity.startsWith("c:")){
  const c=customers().find(c=>c.id===entity.slice(2));
  if(!c){notice("Клиент не найден",true);return;}
  const group=groupForClient(c.id);
  groupId=group?.id||null;clientName=group?.name||c.name;
 }
 const id="t-"+crypto.randomUUID();
 const task={id,title,client_name:clientName,groupId,due_on:String(raw.get("due"))||null,status:"К работе",priority:String(raw.get("priority")||"Обычный"),created_at:new Date().toISOString()};
 saving=true;form.querySelector("button").disabled=true;
 try{
  data.crm=await writeJson("crm-state",state=>({...state,tasks:[...(state.tasks||[]),task]}),"create group-linked task");
  render();notice("Задача сохранена под реальным клиентом.");
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
  await loadRecoveryData();
  await loadInsights();
  await loadIntegration();
  input.value="";auth.hidden=true;shell.hidden=false;render();
 }catch(e){token="";error.textContent=e.message;error.hidden=false;}
 finally{button.disabled=false;button.innerHTML="Открыть мою CRM <span>→</span>";}
});
document.getElementById("disconnect").addEventListener("click",()=>{token="";data={monthly:[],clients:[],categories:[],products:[],crm:{tasks:[],clientOverrides:{}}};shell.hidden=true;auth.hidden=false;document.getElementById("token").value="";modal.hidden=true;msSync=null;});
document.getElementById("nav").addEventListener("click",event=>{const b=event.target.closest("[data-page]");if(b)navigate(b.dataset.page);});
document.getElementById("mobile-menu").addEventListener("click",()=>document.getElementById("sidebar").classList.toggle("open"));
document.getElementById("modal").addEventListener("click",event=>{if(event.target===modal)modal.hidden=true;});
document.addEventListener("keydown",event=>{if(event.key==="Escape"){modal.hidden=true;document.getElementById("sidebar").classList.remove("open");}});
root.addEventListener("click",event=>{
 const sortButton=event.target.closest("[data-client-sort]");
 if(sortButton){
  const key=sortButton.dataset.clientSort;
  if(key===clientSortKey)clientSortDirection=clientSortDirection==="asc"?"desc":"asc";
  else {clientSortKey=key;clientSortDirection=["name","status","priority","contact","delta"].includes(key)?"asc":"desc";}
  render();return;
 }
 const clearButton=event.target.closest("[data-client-clear]");
 if(clearButton){clientStatusFilter="";clientPriorityFilter="";render();return;}
 const view=event.target.closest("[data-client-view]");
 if(view){clientView=view.dataset.clientView;search="";render();return;}
 const el=event.target.closest("[data-action]");
 if(!el)return;
 if(el.dataset.action==="go")navigate(el.dataset.page);
 if(el.dataset.action==="client")openClient(el.dataset.id);
 if(el.dataset.action==="group")openGroup(el.dataset.id);
 if(el.dataset.action==="recovery"){recoveryEntity=el.dataset.id;navigate("recovery");}
 if(el.dataset.action==="reverse-sort"){
  if(el.dataset.kind==="products")productReverse=!productReverse;
  else categoryReverse=!categoryReverse;
  render();
 }
});
root.addEventListener("change",event=>{
 const el=event.target;
 if(el.dataset.clientFilter==="status"){clientStatusFilter=el.value;render();return;}
 if(el.dataset.clientFilter==="priority"){clientPriorityFilter=el.value;render();return;}
 if(el.dataset.filter==="month"){month=Number(el.value);render();}
 if(el.dataset.filter==="year"){year=Number(el.value);render();}
 if(el.dataset.taskId)updateTask(el.dataset.taskId,el.value);
 if(el.dataset.sort==="products"){productSort=el.value;productReverse=false;render();}
 if(el.dataset.sort==="categories"){categorySort=el.value;categoryReverse=false;render();}
 if(el.dataset.compareYear==="products"){productCompareYear=Number(el.value);render();}
 if(el.dataset.compareYear==="categories"){categoryCompareYear=Number(el.value);render();}
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
