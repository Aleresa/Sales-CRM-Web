"use strict";

/* Private customer-specific recovery candidates. The payload was derived from
 * the six 2024–2026 source XLS exports (shipment rows only). Shortlist:
 * 9 largest decreases + 3 active SKUs per legal entity for Jan–Sep 2025 vs 2026.
 * No inventory, current prices, or profit information is available. */
let recoverySamples = {};
let recoveryReady = false;
let recoveryError = "";
let recoveryEntity = "";
let recoveryFilter = "decline";
let recoverySearch = "";
const recoveryDrafts = new Map();

async function loadRecoveryData() {
 recoverySamples = {};
 recoveryReady = false;
 recoveryError = "";
 try {
  const info = await github("/contents/data/recovery-picks.b64?ref=main");
  if(info.encoding!=="base64")throw new Error("Некорректный формат файла");
  if(typeof DecompressionStream==="undefined")throw new Error("Браузер не поддерживает распаковку gzip; нужен свежий Chrome, Firefox или Safari.");
  const compressed = decode(info.content).trim();
  const binary=atob(compressed);
  const bytes=Uint8Array.from(binary,c=>c.charCodeAt(0));
  const stream=new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"));
  recoverySamples=JSON.parse(await new Response(stream).text());
  recoveryReady=true;
 } catch(err) {
  recoveryError=err instanceof Error?err.message:"Невозможно загрузить историю товарных закупок";
 }
}

function recoveryAccounts() {
 return portfolio().sort((a,b)=>{
  const lossA=n(a.previous_revenue)-n(a.current_revenue);
  const lossB=n(b.previous_revenue)-n(b.current_revenue);
  return lossB-lossA || a.name.localeCompare(b.name,"ru");
 });
}
function recoveryKey(account) {
 return Array.isArray(account.members)?"g:"+account.id:"c:"+account.id;
}
function currentRecoveryAccount() {
 const all=recoveryAccounts();
 if(!recoveryEntity || !all.some(a=>recoveryKey(a)===recoveryEntity)){
  const first=all.find(x=>x.name==="iPixel")||all[0];
  recoveryEntity=first?recoveryKey(first):"";
 }
 return all.find(a=>recoveryKey(a)===recoveryEntity);
}
function recoveryRows(account) {
 if(!account||!recoveryReady)return [];
 const persons=Array.isArray(account.members)?account.members:[account];
 const aggregated=new Map();
 for(const c of persons){
  const index=Number(String(c.id).replace(/^c-/,""));
  const rows=recoverySamples[String(index)]||[];
  for(const entry of rows) {
   const code=String(entry[0]);
   if(!aggregated.has(code))aggregated.set(code,{code,r25:0,q25:0,r26:0,q26:0});
   const result=aggregated.get(code);
   result.r25+=n(entry[1]);result.q25+=n(entry[2]);
   result.r26+=n(entry[3]);result.q26+=n(entry[4]);
  }
 }
 const products=new Map(data.products.map(p=>[String(p.code),p]));
 return [...aggregated.values()].map(item=>{
  const source=products.get(item.code)||{};
  item.name=source.name||"Артикул "+item.code;
  item.category=source.category||"Без категории";
  item.loss=Math.max(0,item.r25-item.r26);
  item.gone=item.r25>0 && item.r26<=0;
  return item;
 }).sort((a,b)=>b.loss-a.loss||b.r25-a.r25);
}
function recoveryDraft(key) {
 if(!recoveryDrafts.has(key))recoveryDrafts.set(key,new Set((data.crm.recoveryLists||{})[key]||[]));
 return recoveryDrafts.get(key);
}
function recoverySelected(account,rows) {
 const selected=recoveryDraft(recoveryKey(account));
 return rows.filter(r=>selected.has(r.code));
}
function recoveryMessage(account,rows) {
 const title="Здравствуйте! Посмотрел наши прошлые поставки и хотел обсудить, актуальны ли для вас позиции, которые вы раньше закупали:";
 return [title,"",...rows.map(r=>"• "+r.name+" (арт. "+r.code+")"),"",
  "Подскажите, какие из этих позиций сейчас интересны? Можем согласовать ассортимент, объёмы и условия поставки."].join("\n");
}

function renderRecovery() {
 const all=recoveryAccounts();
 const account=currentRecoveryAccount();
 if(!account)return header("Возврат продаж","Сначала загрузите клиентскую базу.")+empty("Нет клиентов","Невозможно построить анализ.");
 const delta=n(account.current_revenue)-n(account.previous_revenue);
 const options=all.map(a=>option(recoveryKey(a),recoveryEntity).replace('>'+h(recoveryKey(a))+'</option>',
   '>'+h(a.name)+(Array.isArray(a.members)?" · "+a.members.length+" юрлиц":"")+'</option>')).join("");
 const top='<div class="recovery-toolbar"><label class="field" style="min-width:min(100%,430px);margin-top:0">Реальный клиент<select data-recovery-account aria-label="Выбрать клиента">'+options+'</select></label></div>';
 const metrics='<div class="recovery-metrics">'
  +'<div class="recovery-metric"><span>Отгрузки янв–сен 2025</span><b>'+money(account.previous_revenue)+'</b></div>'
  +'<div class="recovery-metric"><span>Отгрузки янв–сен 2026</span><b>'+money(account.current_revenue)+'</b></div>'
  +'<div class="recovery-metric"><span>Разница</span><b class="'+(delta<0?"loss":"gain")+'">'+(delta<0?"−":"+")+money(Math.abs(delta))+'</b><small>Не прогноз продаж</small></div></div>';
 if(!recoveryReady){
  return header("Разбор клиента","Анализ прошлых закупок и подготовка списка позиций.")
   +top+metrics+'<section class="panel recovery-empty"><h2>Товарная история не загружена</h2><p>'+h(recoveryError||"Войдите в CRM заново, чтобы загрузить историю.")+'</p></section>';
 }
 const rows=recoveryRows(account);
 const subset=rows.filter(r=>{
  const needle=recoverySearch.toLocaleLowerCase("ru");
  if(needle&&!(r.code+" "+r.name+" "+r.category).toLocaleLowerCase("ru").includes(needle))return false;
  if(recoveryFilter==="gone")return r.gone;
  if(recoveryFilter==="decline")return r.loss>0;
  return r.r25>0||r.r26>0;
 });
 const byCategory=new Map();
 for(const p of rows.filter(x=>x.loss>0)){
  byCategory.set(p.category,(byCategory.get(p.category)||0)+p.loss);
 }
 const topCategories=[...byCategory.entries()].sort((a,b)=>b[1]-a[1]).slice(0,5);
 const maxCategory=topCategories.length?topCategories[0][1]:1;
 const categorySignals='<section class="panel recovery-categories"><div class="panel-head"><div><h2>Где сильнее сократили покупки</h2><p>Категории по сумме сокращений в отобранных SKU, не полный анализ всех товаров</p></div></div>'
  +'<div class="bar-list">'+(topCategories.length?topCategories.map(([name,value])=>
    '<div class="bar-row"><div><label>'+h(name)+'</label><b>−'+money(value)+'</b></div>'
    +'<div class="track"><div class="fill" style="width:'+Math.max(1,value/maxCategory*100)+'%"></div></div></div>'
   ).join(""):'<p class="tiny">Нет подтверждённого снижения по позициям.</p>')+'</div></section>';
 const selection=recoveryDraft(recoveryKey(account));
 const picked=recoverySelected(account,rows);
 const selectedLoss=picked.reduce((s,r)=>s+r.loss,0);
 const filterbar='<div class="recovery-filters"><input type="search" id="recovery-search" value="'+attr(recoverySearch)+'" placeholder="Поиск товара, кода или категории…">'
  +'<select data-recovery-filter aria-label="Фильтр товаров">'
  +option("decline",recoveryFilter).replace('>decline</option>','>Сократили закупки</option>')
  +option("gone",recoveryFilter).replace('>gone</option>','>Перестали закупать</option>')
  +option("all",recoveryFilter).replace('>all</option>','>Все из подборки</option>')
  +'</select></div>';
 const table='<section class="panel"><div class="panel-head"><div><h2>Товары для возвращения в ассортимент</h2>'
  +'<p>Конкретные SKU из прошлых отгрузок клиента, отсортированные по снижению</p></div>'
  +'<span class="mini-tag">'+subset.length+' позиций</span></div>'
  +'<div class="table-wrap"><table class="data-table"><thead><tr><th>В список</th><th>Товар</th><th>Артикул</th>'
  +'<th>2025, ₽</th><th>2026, ₽</th><th>Падение, ₽</th><th>Шт. 2025 → 2026</th></tr></thead><tbody>'
  +(subset.length?subset.map(r=>'<tr><td><input type="checkbox" class="recovery-check" data-recovery-sku="'+attr(r.code)+'"'+(selection.has(r.code)?" checked":"")+' aria-label="Выбрать '+attr(r.name)+'"></td>'
    +'<td class="long"><b>'+h(r.name)+'</b><div class="tiny">'+h(r.category)+' '
    +(r.gone?'<span class="recovery-flag">Не закупают</span>':r.loss>0?'<span class="recovery-flag continues">Сократили</span>':r.r25<=0?'<span class="recovery-flag continues">Новая позиция</span>':'<span class="recovery-flag continues">Покупают</span>')+'</div></td>'
    +'<td>'+h(r.code)+'</td><td>'+money(r.r25)+'</td><td>'+money(r.r26)+'</td>'
    +'<td class="loss">'+(r.loss>0?"−"+money(r.loss):"—")+'</td><td>'+fmt(r.q25)+' → '+fmt(r.q26)+'</td></tr>').join("")
    :'<tr><td colspan="7">'+empty("Нет позиций по фильтру","Измените фильтр или поисковый запрос.")+'</td></tr>')
  +'</tbody></table></div></section>';
 const actions='<div class="recovery-actions"><button type="button" class="primary" data-recovery-action="save">Сохранить список</button>'
  +'<button type="button" class="small-btn" data-recovery-action="copy">Скопировать сообщение клиенту</button>'
  +'<button type="button" class="small-btn" data-recovery-action="task">Создать задачу по списку</button>'
  +'<span id="recovery-selection-count" class="recovery-saved">'+picked.length+' выбрано · историческое снижение '+money(selectedLoss)+'</span></div>';
 const disclaimer='<div class="recovery-note"><b>Основа анализа:</b> шесть исходных XLS-отчётов, строки фактических отгрузок, январь–сентябрь 2025 против января–сентября 2026. '
  +'Для быстрого диалога отобраны крупнейшие снижения (до 9 SKU) и несколько действующих позиций по каждому юрлицу. '
  +'Суммы по отдельным SKU в объединённой группе могут быть неполными, поскольку это shortlist. '
  +'Общие показатели клиента выше — полные. Возвраты, остатки, актуальная цена, наличие и маржа по SKU не подтверждены. '
  +'Снижение закупок не равно гарантированному потенциалу возврата.</div>';
 return header("Возврат продаж","Какие товары клиент раньше покупал и с чего начать разговор?")+
   top+metrics+disclaimer+categorySignals+filterbar+table+actions;
}

async function updateRecoveryList(action) {
 const account=currentRecoveryAccount();if(!account)return;
 const rows=recoveryRows(account),selected=recoverySelected(account,rows);
 if(action==="copy"){
  if(!selected.length){notice("Отметь хотя бы одну позицию для сообщения.",true);return;}
  const message=recoveryMessage(account,selected);
  try{await navigator.clipboard.writeText(message);notice("Текст с позициями скопирован. Можно вставить в переписку с клиентом.");}
  catch(e){window.prompt("Скопируй текст для клиента:",message);}
  return;
 }
 if(saving)return;
 if(!selected.length){notice("Выбери хотя бы одну позицию.",true);return;}
 const key=recoveryKey(account),codes=selected.map(r=>r.code);
 saving=true;
 try{
  if(action==="save"){
   data.crm=await writeJson("crm-state",state=>({
    ...state,recoveryLists:{...(state.recoveryLists||{}),[key]:codes}
   }),"save recovery shortlist for "+account.name);
   notice("Список позиций сохранён для "+account.name+".");
  }
  if(action==="task"){
   const group=Array.isArray(account.members)?account:null;
   const task={
    id:"t-"+crypto.randomUUID(),title:"Обсудить повторную закупку: "+selected.length+" позиций",
    client_name:account.name,groupId:group?.id||null,
    priority:"Высокий",status:"К работе",due_on:null,created_at:new Date().toISOString(),
    notes:selected.slice(0,30).map(r=>r.code+" — "+r.name).join("\n")
   };
   data.crm=await writeJson("crm-state",state=>({
    ...state,recoveryLists:{...(state.recoveryLists||{}),[key]:codes},
    tasks:[...(state.tasks||[]),task]
   }),"create recovery discussion task for "+account.name);
   notice("Создана задача для "+account.name+". Список позиций сохранён.");
  }
 } catch(err){notice(err.message,true);}
 finally{saving=false;}
}
document.getElementById("app").addEventListener("change",event=>{
 const el=event.target;
 if(el.dataset.recoveryAccount!==undefined){recoveryEntity=el.value;recoverySearch="";render();return;}
 if(el.dataset.recoveryFilter!==undefined){recoveryFilter=el.value;render();return;}
 if(el.dataset.recoverySku!==undefined){
  const account=currentRecoveryAccount();if(!account)return;
  const draft=recoveryDraft(recoveryKey(account));
  if(el.checked)draft.add(el.dataset.recoverySku);else draft.delete(el.dataset.recoverySku);
  const chosen=recoverySelected(account,recoveryRows(account));
  const display=document.getElementById("recovery-selection-count");
  if(display)display.textContent=chosen.length+" выбрано · историческое снижение "+money(chosen.reduce((s,r)=>s+r.loss,0));
 }
});
document.getElementById("app").addEventListener("input",event=>{
 if(event.target.id!=="recovery-search")return;
 recoverySearch=event.target.value;
 const at=event.target.selectionStart;render();
 const input=document.getElementById("recovery-search");
 if(input){input.focus();input.setSelectionRange(at,at);}
});
document.getElementById("app").addEventListener("click",event=>{
 const button=event.target.closest("[data-recovery-action]");
 if(button)updateRecoveryList(button.dataset.recoveryAction);
});
document.getElementById("modal").addEventListener("click",event=>{
 const button=event.target.closest("[data-recovery-open]");
 if(!button)return;
 recoveryEntity=button.dataset.recoveryOpen;
 recoverySearch="";recoveryFilter="decline";modal.hidden=true;
 navigate("recovery");
});
