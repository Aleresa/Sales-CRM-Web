"use strict";

/* All historical and stock data are fetched from the PRIVATE repository.
   This public script contains no client names, inventory rows, or secrets. */
let insights = null, insightsError = "", opportunityKey = "", opportunityYear = 2025;
let opportunityMode = "return", opportunitySearch = "", opportunitySort = "score";
const opportunityDrafts = new Map();
const yearsOfHistory = [2023,2024,2025,2026];

async function loadInsights(){
 insights=null;insightsError="";
 try{
  const file=await github("/contents/data/insights-2023-2026.b64?ref=main");
  if(file.encoding!=="base64")throw Error("Не удалось прочитать формат аналитики");
  const encoded=decode(file.content).trim();
  if(typeof DecompressionStream==="undefined")throw Error("Для анализа нужен браузер с поддержкой gzip (актуальные Chrome, Safari или Firefox).");
  const compressed=Uint8Array.from(atob(encoded),ch=>ch.charCodeAt(0));
  const readable=new Blob([compressed]).stream().pipeThrough(new DecompressionStream("gzip"));
  insights=JSON.parse(await new Response(readable).text());
  if(!Array.isArray(insights.clients)||!Array.isArray(insights.stock)||!Array.isArray(insights.skuJanSep)){
   throw Error("Некорректные данные аналитики");
  }
  // Only 2023 monthly revenue was missing from the previous CRM. No made-up order counts.
  data.monthly=data.monthly.filter(r=>!String(r.period).startsWith("2023-"));
  for(const [period,revenue] of insights.monthly.filter(x=>String(x[0]).startsWith("2023-"))){
   data.monthly.push({id:"m-"+period.slice(0,7),period:period+"-01",revenue,orders:null,active_clients:null,avg_check:null});
  }
 }catch(e){
  insights=null;
  insightsError=e instanceof Error?e.message:"Не удалось загрузить аналитику";
 }
}
function historicMap(){
 return new Map((insights?.clients||[]).map(row=>[row[0],row]));
}
function skuInfo(){
 return new Map((insights?.products||[]).map(row=>[String(row[0]),row]));
}
function stockMap(){
 return new Map((insights?.stock||[]).map(row=>[String(row[0]),row]));
}
function skuCompareMap(){
 return new Map((insights?.skuJanSep||[]).map(row=>[String(row[0]),row]));
}
function allCustomerHistory(){
 if(!insights)return [];
 const historic=historicMap(),result=[],used=new Set();
 const hiddenNames=new Set(crmHiddenClients().map(c=>crmNameKey(c.name)));
 const activeByName=new Map(customers().map(c=>[crmNameKey(c.name),c]));
 for(const group of groups()){
  const members=groupMembers(group);
  const names=members.map(c=>c.name);
  const totals=[0,0,0,0],count=[0,0,0,0];
  for(const name of names){
   const r=historic.get(name);if(!r)continue;
   for(let i=0;i<4;i++){totals[i]+=n(r[1+i]);count[i]+=n(r[9+i]);}
   used.add(name);
  }
  result.push({id:"g:"+group.id,name:group.name,names,amounts:totals,orders:count,memberCount:names.length,linked:true});
 }
 // Treat remaining historic buyers as independent, including buyers lost before 2025.
 for(const row of insights.clients){
  const name=row[0],key=crmNameKey(name);
  if(used.has(name)||hiddenNames.has(key))continue;
  const found=activeByName.get(key);
  // Include all archive-only historical buyers; they now have stable editable cards.
  result.push({id:found?"c:"+found.id:"h:"+name,name,names:[name],
    amounts:row.slice(1,5).map(n),orders:row.slice(9,13).map(n),
    memberCount:1,linked:false,historicalOnly:!found});
 }
 return result;
}
function allStockOppAccounts(){
 const rows=allCustomerHistory();
 rows.sort((a,b)=>Math.max(...b.amounts.slice(0,3))-b.amounts[3]-(Math.max(...a.amounts.slice(0,3))-a.amounts[3]));
 return rows;
}
function currentOpportunity(){
 const accounts=allStockOppAccounts();
 if(!accounts.length)return null;
 let selected=accounts.find(a=>a.id===opportunityKey);
 if(!selected){selected=accounts.find(a=>a.name==="iPixel")||accounts[0];opportunityKey=selected.id;}
 return selected;
}
function customerSkuHistory(account){
 const result=new Map();
 if(!account||!insights)return result;
 for(const name of account.names){
  for(const row of insights.clientItems?.[name]||[]){
   const code=String(row[0]);
   if(!result.has(code))result.set(code,{code,revenues:[0,0,0,0],units:[0,0,0,0]});
   const x=result.get(code);
   for(let i=0;i<4;i++){
    x.revenues[i]+=n(row[1+i]);x.units[i]+=n(row[5+i]);
   }
  }
 }
 return result;
}
function candidateData(account){
 const items=customerSkuHistory(account),stock=stockMap(),products=skuInfo(),overall=skuCompareMap();
 const result=[];
 const preferred=new Map();
 for(const [code,record] of items){
  const prod=products.get(code);
  if(!prod)continue;
  const cat=prod[7]||"";
  if(cat)preferred.set(cat,(preferred.get(cat)||0)+Math.max(...record.revenues.slice(0,3)));
 }
 const preferredCats=[...preferred.entries()].sort((a,b)=>b[1]-a[1]).slice(0,12);
 for(const [code,st] of stock){
  const available=n(st[1]),reserved=n(st[2]),salePrice=n(st[4]);
  if(available<=0)continue;
  const product=products.get(code)||[];
  const name=st[5]||product[6]||"Артикул "+code;
  const category=st[6]||product[7]||"Без группы";
  const previous=items.get(code),overallSku=overall.get(code);
  const baseYearIndex=opportunityYear-2023;
  const pastQty=previous?.units[baseYearIndex]||0, currentQty=previous?.units[3]||0;
  const pastRevenue=previous?.revenues[baseYearIndex]||0;
  const currentRevenue=previous?.revenues[3]||0;
  const groupDemand=preferredCats.find(([cat])=>cat===category || (cat&&category.startsWith(cat.split("/")[0])));
  const otherBuyers=n(overallSku?.[4]),otherQty=n(overallSku?.[8]);
  const returnLoss=Math.max(0,pastRevenue-currentRevenue);
  const lostQty=Math.max(0,pastQty-currentQty);
  const stockCover=Math.min(available,lostQty);
  let mode="";
  if(previous&&pastRevenue>0&&returnLoss>0)mode="return";
  else if(!previous&&groupDemand&&otherBuyers>1500&&otherQty>0)mode="adjacent";
  else if(!previous&&otherBuyers>5000&&otherQty>3)mode="market";
  else if(!previous&&groupDemand&&otherBuyers===0&&available>=10&&salePrice>0)mode="hypothesis";
  if(!mode)continue;
  let score=mode==="return"?returnLoss*2+stockCover*salePrice
   :mode==="adjacent"?(groupDemand?.[1]||0)*0.1+Math.min(available,otherQty)*salePrice
   :mode==="hypothesis"?Math.min(available,100)*salePrice*0.3
   :Math.min(available,otherQty)*salePrice;
  result.push({code,name,category,mode,available,reserved,price:salePrice,pastQty,currentQty,
    pastRevenue,currentRevenue,otherBuyers,otherQty,score,loss:returnLoss,stockCover});
 }
 return result.sort((a,b)=>b.score-a.score);
}
function opportunityDraft(){
 if(!opportunityDrafts.has(opportunityKey+":"+opportunityYear)){
  const key=opportunityKey+":"+opportunityYear;
  opportunityDrafts.set(key,new Set(insights&&data.crm.insightLists?.[key]||[]));
 }
 return opportunityDrafts.get(opportunityKey+":"+opportunityYear);
}
function histInfoUnavailable(pageName){
 return header(pageName,"Добавлен анализ четырёх лет продаж и товарного остатка.")
  +'<section class="panel">'+empty("Анализ недоступен",insightsError||"Нет данных для построения анализа")+'</section>';
}

let contactSearch = "";
let contactCache = null;
function contactQueue(){
 const key=[insights,insights?.stock,msSync,data.crm.groups,data.crm.clientOverrides,data.crm.hiddenClientIds];
 if(contactCache&&key.every((v,i)=>contactCache.key[i]===v))return contactCache.rows;
 const stock=stockMap(),fresh=new Map();
 for(const c of msSync?.salesByClient||[]){
  const key=String(c.name||"").trim().toLocaleLowerCase("ru");
  fresh.set(key,(fresh.get(key)||0)+n(c.revenue));
 }
 const result=allCustomerHistory().map(account=>{
  const old=account.amounts.slice(0,3),peak=Math.max(...old),year=old.indexOf(peak),current=n(account.amounts[3]);
  if(peak<=0||current>peak*0.8)return null;
  let confirmed=0;const matched=[];
  for(const r of customerSkuHistory(account).values()){
   const st=stock.get(r.code);
   if(!st||n(st[1])<=0||n(r.revenues[year])<=n(r.revenues[3]))continue;
   confirmed++;
   matched.push({code:r.code,name:st[5]||r.code,loss:n(r.revenues[year])-n(r.revenues[3])});
  }
  matched.sort((a,b)=>b.loss-a.loss);
  const recent=account.names.reduce((a,name)=>a+(fresh.get(String(name).trim().toLocaleLowerCase("ru"))||0),0);
  const priority=recent>0?3:confirmed>0?(current===0?0:1):2;
  return {account,peak,year,current,loss:Math.max(0,peak-current),confirmed,recent,priority,matched:matched.slice(0,5)};
 }).filter(Boolean).sort((a,b)=>a.priority-b.priority||b.loss-a.loss||b.confirmed-a.confirmed);
 contactCache={key,rows:result};
 return result;
}
function renderContactQueue(){
 if(!insights)return histInfoUnavailable("План контактов");
 const queue=contactQueue(),active=queue.filter(r=>r.priority<=1),filter=contactSearch.trim().toLocaleLowerCase("ru");
 const rows=queue.filter(r=>(r.account.name+" "+r.account.names.join(" ")).toLocaleLowerCase("ru").includes(filter));
 const body=rows.map(r=>{
  const tag=r.recent>0?"Есть новая отгрузка":r.confirmed===0?"Проверить ассортимент":r.current===0?"Вернуть клиента":"Восстановить объём";
  return '<tr><td class="long"><b>'+h(r.account.name)+'</b><div class="tiny">Лучший год: '+(2023+r.year)
   +(r.account.memberCount>1?" · Юрлиц: "+r.account.memberCount:"")+'</div></td>'
   +'<td><span class="status">'+h(tag)+'</span></td>'
   +'<td>'+money(r.peak)+'</td><td>'+money(r.current)+'</td><td>'+money(r.loss)+'</td>'
   +'<td title="'+attr(r.matched.map(p=>p.name).join("; "))+'"><b>'+fmt(r.confirmed)+'</b></td>'
   +'<td>'+(r.recent>0?money(r.recent):"—")+'</td>'
   +'<td><button type="button" class="small-btn" data-contact-open="'+attr(r.account.id)+'">Подобрать товары →</button></td></tr>';
 }).join("");
 return header("План контактов","Приоритет клиентов по потерянному обороту и товарам, которые есть на складе.")
  +'<div class="group-totals"><span><b>'+queue.length+'</b> клиентов с падением ≥20%</span>'
  +'<span><b>'+active.length+'</b> имеют ранее купленные SKU в наличии и не покупали после 22.10</span>'
  +'<span><b>'+queue.filter(r=>r.recent>0).length+'</b> уже покупали в новом периоде</span></div>'
  +'<div class="toolbar"><label class="search">⌕ <input id="contact-search" placeholder="Поиск клиента или юрлица" value="'+attr(contactSearch)+'"></label></div>'
  +'<section class="panel"><div class="panel-head"><div><h2>Кому звонить в первую очередь</h2>'
  +'<p>Сначала потерянные покупатели со старыми SKU в наличии; затем просевшие и остальные</p></div></div>'
  +'<div class="table-wrap"><table class="data-table"><thead><tr><th>Клиент</th><th>Ситуация</th>'
  +'<th>Лучший янв–сен (2023–25)</th><th>Янв–сен 2026</th><th>Падение</th>'
  +'<th>Старых SKU на складе</th><th>Отгрузки с 23.10</th><th>Действие</th></tr></thead><tbody>'
  +(body||'<tr><td colspan="8">Клиентов по условиям не найдено.</td></tr>')
  +'</tbody></table></div></section>'
  +'<p class="note">Сравниваются одинаковые девять месяцев. Исторические SKU — выборка, а не весь ассортимент закупок; '
  +'отсутствие совпадений не доказывает отсутствие потенциала. Падение оборота не является прогнозом возврата.</p>';
}
function startContactOffer(id){
 const r=contactQueue().find(x=>x.account.id===id);if(!r)return;
 opportunityKey=id;opportunityYear=2023+r.year;opportunitySearch="";
 const direct=candidateData(r.account).filter(x=>x.mode==="return").slice(0,5);
 opportunityMode=direct.length?"return":"adjacent";
 const key=id+":"+opportunityYear;
 if(direct.length&&!opportunityDrafts.has(key)&&!(data.crm.insightLists?.[key]||[]).length)
  opportunityDrafts.set(key,new Set(direct.map(x=>x.code)));
 navigate("opportunities");
 notice(direct.length?"Подобрано "+direct.length+" ранее покупавшихся товаров. Проверь и сохрани подборку.":"Прямых совпадений нет. Показываю смежный ассортимент.");
}

function displayLostClients(){
 if(!insights)return histInfoUnavailable("Потерянные клиенты");
 const rows=allCustomerHistory().filter(c=>c.amounts[3]===0&&c.amounts.slice(0,3).some(v=>v>0))
  .sort((a,b)=>Math.max(...b.amounts.slice(0,3))-Math.max(...a.amounts.slice(0,3)));
 const filter=opportunitySearch.toLocaleLowerCase("ru");
 const items=rows.filter(c=>(c.name+" "+c.names.join(" ")).toLocaleLowerCase("ru").includes(filter));
 const since2023=rows.filter(r=>r.amounts[0]>0&&r.amounts[1]===0&&r.amounts[2]===0).length;
 return header("Потерянные клиенты","Кто покупал в 2023–2025, но не закупал в январе–сентябре 2026.")
  +'<div class="group-totals"><span><b>'+rows.length+'</b> клиентов без отгрузок в 2026</span>'
  +'<span><b>'+since2023+'</b> не покупали с 2023</span><span><b>2023–2026</b> история</span></div>'
  +'<div class="toolbar"><label class="search">⌕ <input id="lost-search" placeholder="Поиск клиента / юрлица" value="'+attr(opportunitySearch)+'"></label></div>'
  +'<section class="panel"><div class="table-wrap"><table class="data-table"><thead><tr>'
  +'<th>Реальный клиент</th><th>2023, янв–сен</th><th>2024, янв–сен</th><th>2025, янв–сен</th>'
  +'<th>2026, янв–сен</th><th>Юрлиц</th><th>Следующий шаг</th></tr></thead><tbody>'
  +items.map(c=>'<tr class="clickable" data-open-opportunity="'+attr(c.id)+'"><td class="long"><b>'+h(c.name)+'</b>'
    +(c.historicalOnly?'<div class="tiny">Исторический клиент — проверь возможную смену юрлица</div>':"")+'</td>'
    +c.amounts.map(val=>'<td>'+money(val)+'</td>').join("")
    +'<td>'+c.memberCount+'</td><td><span class="status">Найти товары в наличии →</span></td></tr>').join("")
  +'</tbody></table></div></section><p class="note">Отсутствие отгрузок на старое юридическое лицо не доказывает потерю клиента. Для связанных юрлиц учитывается вся группа.</p>';
}
function stockMetric(label,value,sub){
 return '<div class="recovery-metric"><span>'+h(label)+'</span><b>'+h(value)+'</b><small>'+h(sub||"")+'</small></div>';
}

function visibleOpportunityCandidates(account){
 const query=opportunitySearch.trim().toLocaleLowerCase("ru");
 const matched=candidateData(account).filter(c=>c.mode===opportunityMode&&
  (c.code+" "+c.name+" "+c.category).toLocaleLowerCase("ru").includes(query));
 const sort={stock:(a,b)=>b.available-a.available,
  price:(a,b)=>b.price-a.price,
  loss:(a,b)=>b.loss-a.loss};
 return matched.sort((a,b)=>(sort[opportunitySort]?.(a,b)||0)||b.score-a.score);
}
function opportunityBasketMarkup(candidates){
 const draft=opportunityDraft(),items=candidates.filter(c=>draft.has(c.code));
 const past=items.filter(c=>c.mode==="return").length;
 const knownPrice=items.filter(c=>c.price>0),unitTotal=knownPrice.reduce((sum,c)=>sum+c.price,0);
 return '<div class="opp-basket-head"><div><div class="opp-step-label">ШАГ 3 · РЕЗУЛЬТАТ</div><h2>Предложение клиенту</h2></div>'
  +'<span class="opp-basket-counter">'+fmt(items.length)+'</span></div>'
  +(items.length
   ?'<div class="opp-basket-summary"><div><small>Выбрано позиций</small><b>'+fmt(items.length)+'</b></div>'
    +'<div><small>Покупал ранее</small><b>'+fmt(past)+'</b></div></div>'
    +'<div class="opp-basket-list">'+items.slice(0,20).map(c=>
      '<div class="opp-basket-item"><div><b>'+h(c.name)+'</b><small>Код '+h(c.code)+' · '+fmt(c.available)+' шт. свободно</small></div>'
      +'<button type="button" class="opp-basket-remove" data-opp-remove="'+attr(c.code)+'" aria-label="Убрать товар '+attr(c.name)+'" title="Убрать из предложения">×</button></div>'
     ).join("")
    +(items.length>20?'<p class="tiny">Ещё '+fmt(items.length-20)+' выбранных товаров</p>':'')+'</div>'
    +'<div class="opp-basket-subtotal"><small>Сумма по 1 шт. каждого товара</small><b>'+money(unitTotal)+'</b>'
    +'<small>Только '+fmt(knownPrice.length)+' SKU с ценой. Это ориентир, не стоимость заказа.</small></div>'
   :'<div class="opp-basket-empty"><strong>Подборка пуста</strong><p>Поставь галочки у товаров слева или нажми «Взять 5 лучших».</p></div>')
  +'<div class="opp-basket-actions">'
  +'<button type="button" class="primary" data-opp-action="copy">↗ Скопировать предложение</button>'
  +'<button type="button" class="small-btn" data-opp-action="task">＋ Создать задачу</button>'
  +'<button type="button" class="opp-save-btn" data-opp-action="save">Сохранить подборку</button></div>'
  +'<div id="opp-action-feedback" class="opp-action-feedback" role="status" aria-live="polite">'
  +(items.length?'Можно подготовить сообщение или задачу для '+fmt(items.length)+' товаров.':'Сначала отметь хотя бы одну позицию.')+'</div>'
  +'<div id="opp-message-wrap" class="opp-message-wrap" hidden><label for="opp-message-preview">Готовое сообщение клиенту</label>'
  +'<textarea id="opp-message-preview" rows="7" readonly></textarea></div>';
}
function refreshOpportunityBasket(message){
 const el=document.getElementById("opp-basket");
 const account=currentOpportunity();
 if(el&&account)el.innerHTML=opportunityBasketMarkup(candidateData(account));
 if(message)opportunityFeedback(message);
}
function displayStockOpportunities(){
 if(!insights)return histInfoUnavailable("Остатки и точки роста");
 const account=currentOpportunity();if(!account)return histInfoUnavailable("Остатки и точки роста");
 const accounts=allStockOppAccounts();
 const stock=insights.stock.filter(row=>n(row[1])>0);
 const candidates=candidateData(account);
 const draft=opportunityDraft(),matched=visibleOpportunityCandidates(account);
 const peak=Math.max(...account.amounts.slice(0,3)),current=n(account.amounts[3]);
 const options=accounts.map(c=>option(c.id,opportunityKey).replace('>'+h(c.id)+'</option>','>'+h(c.name)+(c.memberCount>1?" · "+c.memberCount+" юрлиц":"")+'</option>')).join("");
 const steps='<div class="opp-steps" aria-label="Шаги подготовки предложения">'
  +'<div><span>01</span><b>Клиент</b><small>История закупок</small></div>'
  +'<div><span>02</span><b>Товары</b><small>Остатки сейчас</small></div>'
  +'<div><span>03</span><b>Предложение</b><small>Сообщение или задача</small></div></div>';
 const groupsInfo='<div class="opp-controls"><label class="field">Клиент / группа юрлиц<select data-opp-select>'+options+'</select></label>'
  +'<label class="field">Сравнить с 2026<select data-opp-year>'+[2023,2024,2025].map(y=>option(y,opportunityYear)).join("")+'</select></label></div>';
 const metrics='<div class="recovery-metrics">'
  +stockMetric("Максимум, янв–сен 2023–2025",money(peak),"лучший прошлый период")
  +stockMetric("Отгрузки 2026, янв–сен",money(current),"по всем связанным юрлицам")
  +stockMetric("Товаров в наличии",fmt(stock.length)+" SKU",msSync?msDate(msSync.stock_as_of||msSync.as_of):"снимок 23.10.2026")
  +'</div>';
 const modeNames=[["return","↩ Вернуть старые позиции"],["adjacent","Смежный ассортимент"],["market","Спрос других"],["hypothesis","Гипотезы"]];
 const pills='<div class="opp-tabs" role="group" aria-label="Тип предложения">'
  +modeNames.map(([key,title])=>
   '<button type="button" data-opp-mode="'+key+'" aria-pressed="'+(opportunityMode===key)+'" class="'+(opportunityMode===key?"active":"")+'">'+title+'</button>').join("")+'</div>';
 const notes=opportunityMode==="return"
  ?"Подтверждённые SKU из истории покупателя, где объём снизился. Показываем только товары со свободным остатком."
  :opportunityMode==="adjacent"
  ?"Товары из близких категорий со спросом у других клиентов. Это гипотезы, а не ранее подтверждённые закупки."
  :opportunityMode==="hypothesis"
  ?"Новые позиции на складе, близкие клиенту по категориям. Спрос следует проверить звонком."
  :"Товары со спросом у других покупателей, не обязательно подходящие этому клиенту.";
 const sortOptions=[["score","По потенциалу"],["loss","По потере выручки"],["stock","По наличию"],["price","По цене"]]
  .map(([v,title])=>'<option value="'+v+'"'+(v===opportunitySort?' selected':'')+'>'+title+'</option>').join("");
 const searchRow='<div class="opp-topline"><p class="recovery-description">'+h(notes)+'</p>'
  +'<label class="search">⌕ <input id="opportunity-search" value="'+attr(opportunitySearch)+'" placeholder="Поиск по названию, коду, группе"></label></div>';
 const actionBar='<div class="opp-list-actions"><div><strong>Товары для обсуждения</strong><small>'+fmt(matched.length)+' вариантов · '+fmt(draft.size)+' выбрано</small></div>'
  +'<div class="opp-list-tools"><label>Сортировать<select data-opp-sort>'+sortOptions+'</select></label>'
  +'<button class="small-btn" type="button" data-opp-quick="top"'+(!matched.length?' disabled':'')+'>＋ Взять 5 лучших</button>'
  +'<button class="opp-clear-btn" type="button" data-opp-quick="clear"'+(!draft.size?' disabled':'')+'>Очистить</button></div></div>';
 const body=matched.slice(0,150).map(r=>'<tr'+(draft.has(r.code)?' class="opp-row-selected"':'')+'><td>'
  +'<input type="checkbox" class="recovery-check" aria-label="Выбрать '+attr(r.name)+'" data-opp-code="'+attr(r.code)+'"'
  +(draft.has(r.code)?" checked":"")+'></td>'
  +'<td class="long"><b>'+h(r.name)+'</b><div class="tiny">'+h(r.category)+'</div></td>'
  +'<td>'+h(r.code)+'</td>'
  +'<td>'+money(r.pastRevenue)+'</td><td>'+money(r.currentRevenue)+'</td>'
  +'<td><b class="gain">'+fmt(r.available)+' шт.</b><div class="tiny">резерв: '+fmt(r.reserved)+'</div></td>'
  +'<td>'+money(r.price)+'</td>'
  +'<td>'+(r.mode==="return"?money(r.stockCover*r.price):r.mode==="hypothesis"?"Проверить спрос":'Спрос других: '+fmt(r.otherQty)+' шт.')+'</td></tr>').join("");
 const table='<section class="panel opp-product-panel">'+actionBar
  +'<div class="table-wrap"><table class="data-table"><thead><tr><th>✓</th><th>Товар</th><th>Код</th><th>'+opportunityYear+'</th>'
  +'<th>2026</th><th>Доступно</th><th>Цена</th><th>Основание</th></tr></thead><tbody>'
  +(body||'<tr><td colspan="8">'+empty("Нет подходящих позиций","Измени год или способ подбора")+'</td></tr>')
  +'</tbody></table></div>'
  +(matched.length>150?'<p class="note">Показаны первые 150 результатов из '+fmt(matched.length)+'. Уточни поиск, чтобы увидеть остальные.</p>':'')
  +'</section>';
 const basket='<aside id="opp-basket" class="opp-basket">'+opportunityBasketMarkup(candidates)+'</aside>';
 return header("Остатки и рост","Подбери товары клиенту, собери сообщение и создай задачу в одной рабочей области.")
  +steps+groupsInfo+metrics
  +'<div class="opp-section-label">ШАГ 2 · ПОДБОР ТОВАРОВ</div>'+pills+searchRow
  +'<div class="opp-layout">'+table+basket+'</div>'
  +'<p class="recovery-note">История SKU охватывает выбранные позиции, а не всю корзину. «Основание» — ориентир для разговора, не прогноз продаж. Цена не учитывает согласованные скидки. Сравнение годов выполнено за январь–сентябрь. '
  +'Наличие: '+(msSync?"МойСклад, "+msDate(msSync.stock_as_of||msSync.as_of):"снимок 23.10.2026")+'.</p>';
}
function opportunityFeedback(message,bad=false){
 const el=document.getElementById("opp-action-feedback");
 if(el){el.textContent=message;el.classList.toggle("bad",bad);}
 // A top-level alert remains for accessibility if a page-specific feedback box is missing.
 else notice(message,bad);
}
function opportunityActionBusy(busy){
 document.querySelectorAll("[data-opp-action]").forEach(el=>el.disabled=busy);
}
async function processOpportunityAction(action){
 const account=currentOpportunity();
 if(!account){opportunityFeedback("Не удалось определить клиента — выбери его повторно.",true);return;}
 const selected=candidateData(account).filter(c=>opportunityDraft().has(c.code));
 if(!selected.length){
  opportunityFeedback("Не выбрано ни одного доступного товара. Отметь галочкой нужные позиции в таблице выше.",true);
  return;
 }
 const txt="Здравствуйте! Посмотрел ваши прошлые закупки и подготовил несколько вариантов, которые сейчас доступны к обсуждению:\n\n"
  +selected.map((c,i)=>(i+1)+". "+c.name+" (арт. "+c.code+", есть "+fmt(c.available)+" шт.)").join("\n")
  +"\n\nПодскажите, что из этого актуально? Можем согласовать ассортимент, цены и объём.";
 if(action==="copy"){
  const wrap=document.getElementById("opp-message-wrap"),input=document.getElementById("opp-message-preview");
  if(wrap&&input){input.value=txt;wrap.hidden=false;}
  try{
   if(!navigator.clipboard?.writeText)throw Error("Clipboard API недоступен");
   await navigator.clipboard.writeText(txt);
   opportunityFeedback("Предложение из "+selected.length+" позиций скопировано. Вставь текст в WhatsApp или Telegram.");
  }catch(err){
   let copied=false;
   if(input){input.focus();input.select();try{copied=!!document.execCommand("copy");}catch(e){}}
   opportunityFeedback(copied?"Предложение скопировано.":"Автоматическое копирование недоступно. Текст предложения открыт и выделен ниже: нажми Ctrl+C.",!copied);
  }
  return;
 }
 if(action!=="save"&&action!=="task")return;
 if(saving){opportunityFeedback("Предыдущая операция сохранения ещё выполняется.");return;}
 saving=true;opportunityActionBusy(true);
 opportunityFeedback(action==="task"?"Создаём задачу в приватной CRM…":"Сохраняем список товаров в приватной CRM…");
 const key=account.id+":"+opportunityYear;
 try{
  data.crm=await writeJson("crm-state",state=>{
   const next={...state,insightLists:{...(state.insightLists||{}),[key]:selected.map(x=>x.code)}};
   if(action==="task")next.tasks=[...(state.tasks||[]),{
    id:"t-"+crypto.randomUUID(),title:"Предложить товары из наличия: "+selected.length+" поз.",
    client_name:account.name,groupId:account.id.startsWith("g:")?account.id.slice(2):null,
    priority:"Высокий",status:"К работе",due_on:null,created_at:new Date().toISOString(),
    notes:selected.slice(0,20).map(x=>x.code+" — "+x.name).join("\n")
   }];
   return next;
  },action==="save"?"save stock-based shortlist":"create stock-based recovery task");
  opportunityFeedback(action==="task"?
   "Задача для «"+account.name+"» создана в разделе «Задачи» ("+selected.length+" поз.).":
   "Подборка из "+selected.length+" товаров сохранена для «"+account.name+"».");
 }catch(e){
  opportunityFeedback("Не удалось сохранить: "+(e instanceof Error?e.message:String(e)),true);
 }finally{
  saving=false;opportunityActionBusy(false);
 }
}
root.addEventListener("change",e=>{
 const el=e.target;
 if(el.dataset.oppSelect!==undefined){opportunityKey=el.value;opportunitySearch="";render();}
 if(el.dataset.oppYear!==undefined){opportunityYear=Number(el.value);render();}
 if(el.dataset.oppSort!==undefined){opportunitySort=el.value;render();}
 if(el.dataset.oppCode!==undefined){
  const draft=opportunityDraft();if(el.checked)draft.add(el.dataset.oppCode);else draft.delete(el.dataset.oppCode);
  const row=el.closest("tr");if(row)row.classList.toggle("opp-row-selected",el.checked);
  refreshOpportunityBasket();
 }
});
root.addEventListener("click",e=>{
 const button=e.target.closest("[data-opp-mode],[data-opp-action],[data-open-opportunity],[data-contact-open],[data-opp-quick],[data-opp-remove]");
 if(!button)return;
 if(button.dataset.contactOpen!==undefined){startContactOffer(button.dataset.contactOpen);return;}
 if(button.dataset.oppQuick!==undefined){
  const account=currentOpportunity(),draft=opportunityDraft();
  if(button.dataset.oppQuick==="clear")draft.clear();
  else if(account)visibleOpportunityCandidates(account).slice(0,5).forEach(c=>draft.add(c.code));
  render();opportunityFeedback(button.dataset.oppQuick==="clear"?"Подборка очищена.":"В подборку добавлены первые подходящие товары.");
  return;
 }
 if(button.dataset.oppRemove!==undefined){
  opportunityDraft().delete(button.dataset.oppRemove);
  const checkbox=[...document.querySelectorAll("[data-opp-code]")].find(c=>c.dataset.oppCode===button.dataset.oppRemove);
  if(checkbox){checkbox.checked=false;checkbox.closest("tr")?.classList.remove("opp-row-selected");}
  refreshOpportunityBasket("Товар удалён из подборки.");return;
 }
 if(button.dataset.oppMode!==undefined){opportunityMode=button.dataset.oppMode;opportunitySearch="";render();}
 if(button.dataset.oppAction!==undefined)processOpportunityAction(button.dataset.oppAction);
 if(button.dataset.openOpportunity!==undefined){opportunityKey=button.dataset.openOpportunity;opportunitySearch="";navigate("opportunities");}
});
root.addEventListener("input",e=>{
 const el=e.target;
 if(el.id==="contact-search"){contactSearch=el.value;const at=el.selectionStart;render();const found=document.getElementById("contact-search");if(found){found.focus();try{found.setSelectionRange(at,at)}catch{}}return;}
 if(el.id!=="opportunity-search"&&el.id!=="lost-search")return;
 opportunitySearch=el.value;const at=el.selectionStart;render();
 const input=document.getElementById(el.id);
 if(input){input.focus();try{input.setSelectionRange(at,at)}catch{}}
});
document.getElementById("modal").addEventListener("click",e=>{
 const el=e.target.closest("[data-insight-open]");if(!el)return;
 opportunityKey=el.dataset.insightOpen;modal.hidden=true;opportunitySearch="";navigate("opportunities");
});
