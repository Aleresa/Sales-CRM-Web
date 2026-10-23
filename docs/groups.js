"use strict";
function renderGroups() {
 const all=groups().map(summarizeGroup).filter(g=>g.members.length>0||!(groups().find(source=>source.id===g.id)?.clientIds||[]).length);
 const needle=search.toLocaleLowerCase("ru");
 const list=all.filter(g=>(g.name+" "+g.members.map(c=>c.name).join(" ")).toLocaleLowerCase("ru").includes(needle))
  .sort((a,b)=>n(b.current_revenue)-n(a.current_revenue));
 const activeIds=new Set(customers().map(c=>c.id));
 const linked=new Set(groups().flatMap(g=>g.clientIds||[]).filter(id=>activeIds.has(id)));
 return header("Группы клиентов","Объедини несколько юрлиц в одного реального покупателя.")
 +'<section class="panel group-create"><h2>＋ Создать группу</h2><form id="group-create-form"><input name="name" maxlength="90" required placeholder="Например, iPixel" aria-label="Название группы"><button type="submit" class="primary">Создать</button></form></section>'
 +'<div class="group-totals"><span><b>'+all.length+'</b> групп</span><span><b>'+linked.size+'</b> связанных юрлиц</span><span><b>'+(customers().length-linked.size)+'</b> без группы</span></div>'
 +searchToolbar("Поиск группы или контрагента…")
 +(list.length?'<div class="group-grid">'+list.map(g=>{
  const d=g.current_revenue-g.previous_revenue;
  const revenueKnown2026=n(g.current_revenue)+recentSalesForMembers(g.members);
  return '<button class="group-card" data-action="group" data-id="'+attr(g.id)+'">'
   +'<div class="group-card-top"><span class="initial">♧</span><div><strong>'+h(g.name)+'</strong><small>'+g.members.length+' юрлиц</small></div><span>→</span></div>'
   +'<div class="group-card-revenues"><span>2025, янв–сен <b>'+money(g.previous_revenue)+'</b></span><span>2026, учтено <b>'+money(revenueKnown2026)+'</b></span></div>'
   +'<div class="'+(d<0?"loss":"gain")+'">'+(d<0?"−":"+")+money(Math.abs(d))+' · '+fmt(g.orders_current)+' заказов в 2026</div>'
   +'<p class="tiny">'+h(g.members.map(c=>c.name).join(" · "))+'</p></button>';
 }).join("")+'</div>':empty("Не найдено групп","Создай новую группу или измени запрос."))
 +'<p class="note">2026: архивная история плюс новые продажи с 23 октября. Продажи с 1 по 22 октября ещё не распределены по карточкам клиентов; изменение в процентах и рублях сравнивается только за одинаковые месяцы январь–сентябрь.</p>';
}
function openGroup(id) {
 const group=groups().find(g=>g.id===id); if(!group)return;
 const summary=summarizeGroup(group), delta=summary.current_revenue-summary.previous_revenue;
 const revenueKnown2026=n(summary.current_revenue)+recentSalesForMembers(summary.members);
 const linked=new Set(groups().flatMap(g=>g.clientIds||[]));
 const available=customers().filter(c=>!linked.has(c.id)).sort((a,b)=>a.name.localeCompare(b.name,"ru"));
 modal.hidden=false;modal.dataset.groupId=id;
 document.getElementById("drawer-body").innerHTML=
 '<div class="drawer-top"><span class="eyebrow">РЕАЛЬНЫЙ КЛИЕНТ · ГРУППА</span><button class="icon-btn" id="close-modal" type="button">×</button></div>'
 +'<h2>'+h(group.name)+'</h2><p>'+summary.members.length+' юридических лиц · '+fmt(summary.orders_current)+' заказов за 2026</p>'
 +'<button type="button" class="recovery-client-label" data-recovery-open="g:'+attr(group.id)+'">↗ Разбор закупок и список товаров для диалога</button>'
 +'<button class="recovery-client-label" type="button" data-insight-open="g:'+attr(group.id)+'">◈ Остатки и точки роста · 2023–2026</button>'
 +'<div class="stat"><span>Отгрузки 2025</span><b>'+money(summary.previous_revenue)+'</b></div>'
 +'<div class="stat"><span>Учтено в 2026</span><b>'+money(revenueKnown2026)+'</b></div>'
 +'<div class="stat"><span>Изменение</span><b class="'+(delta<0?"loss":"gain")+'">'+(delta<0?"−":"+")+money(Math.abs(delta))+'</b></div>'
 +'<h3 class="group-drawer-title">Юридические лица</h3>'
 +(summary.members.length?summary.members.map(c=>
  '<div class="group-member"><button type="button" data-open-legal="'+attr(c.id)+'"><b>'+h(c.name)+'</b><small>'+money(c.current_revenue)+' · '+fmt(c.orders_current)+' заказов</small></button>'
  +'<button type="button" class="group-remove" data-remove-member="'+attr(c.id)+'" aria-label="Убрать из группы">×</button></div>'
 ).join(""):empty("Пока нет юрлиц","Добавь контрагента ниже."))
 +'<h3 class="group-drawer-title">Добавить контрагента</h3>'
 +'<input id="group-member-search" class="group-search" type="search" placeholder="Поиск по фамилии или названию">'
 +'<select id="group-member-select" class="group-select" size="5" aria-label="Свободные контрагенты">'
 +available.map(c=>'<option value="'+attr(c.id)+'">'+h(c.name)+'</option>').join("")+'</select>'
 +'<button type="button" class="small-btn group-add" id="group-add-member"'+(available.length?"":" disabled")+'>＋ Добавить</button>'
 +'<form id="group-rename-form" data-id="'+attr(group.id)+'" class="group-rename"><label class="field">Название группы<input name="name" maxlength="90" required value="'+attr(group.name)+'"></label><button class="small-btn" type="submit">Переименовать</button></form>'
 +'<button type="button" class="group-delete" id="group-exclude">Убрать закрывшегося клиента из CRM (все юрлица)</button>'
 +'<button class="group-delete" id="group-delete" type="button">Удалить объединение (без удаления юрлиц)</button>';
 document.getElementById("close-modal").addEventListener("click",()=>modal.hidden=true);
}
async function saveGroups(label,edit,keepId) {
 if(saving)return;
 saving=true;
 try {
  data.crm=await writeJson("crm-state",state=>({...state,groups:edit((state.groups||[]).map(g=>({...g,clientIds:[...(g.clientIds||[])]})))}),label);
  modal.hidden=true;render();
  if(keepId&&groups().some(g=>g.id===keepId))openGroup(keepId);
  notice("Группа обновлена в приватном GitHub.");
 } catch(error){alert(error.message);}
 finally{saving=false;}
}
async function createGroup(form){
 const name=String(new FormData(form).get("name")||"").trim();
 if(!name||name.length>90)return;
 const id="g-"+crypto.randomUUID();
 await saveGroups("create client group",items=>{
  if(items.some(g=>g.name.toLowerCase()===name.toLowerCase()))throw Error("Такая группа уже существует.");
  return [...items,{id,name,clientIds:[]}];
 },id);
}
async function updateMember(groupId,clientId,add){
 if(!customers().some(c=>c.id===clientId))return;
 await saveGroups("update group members",items=>{
  if(!items.some(g=>g.id===groupId))throw Error("Группа не найдена.");
  if(add&&items.some(g=>g.clientIds.includes(clientId)))throw Error("Контрагент уже связан с другой группой.");
  return items.map(g=>g.id===groupId?{...g,clientIds:add?[...g.clientIds,clientId]:g.clientIds.filter(id=>id!==clientId)}:g);
 },groupId);
}
function awaitAssignClientGroup(groupId,clientId){
 // Use the same concurrency-safe write and single-group invariant as the group editor.
 updateMember(groupId,clientId,true);
}
document.getElementById("app").addEventListener("submit",event=>{
 if(event.target.id==="group-create-form"){event.preventDefault();createGroup(event.target);}
});
document.getElementById("modal").addEventListener("submit",event=>{
 if(event.target.id!=="group-rename-form")return;
 event.preventDefault();const id=event.target.dataset.id;
 const name=String(new FormData(event.target).get("name")||"").trim();
 if(!name||name.length>90)return;
 saveGroups("rename client group",items=>{
  if(items.some(g=>g.id!==id&&g.name.toLowerCase()===name.toLowerCase()))throw Error("Такое название уже существует.");
  return items.map(g=>g.id===id?{...g,name}:g);
 },id);
});
document.getElementById("modal").addEventListener("click",event=>{
 const button=event.target.closest("button");if(!button)return;
 if(button.id==="assign-client-to-group"){
  const picker=document.getElementById("client-group-picker");
  const clientId=button.dataset.clientId;
  if(picker?.value&&clientId){
   awaitAssignClientGroup(picker.value,clientId);
  }else notice("Сначала выбери группу клиентов.",true);
  return;
 }
 if(button.dataset.openLegal){openClient(button.dataset.openLegal);return;}
 if(button.dataset.openGroup){openGroup(button.dataset.openGroup);return;}
 const id=modal.dataset.groupId;if(!id)return;
 if(button.id==="group-exclude"){crmExcludeGroup(id);return;}
 if(button.dataset.removeMember){updateMember(id,button.dataset.removeMember,false);return;}
 if(button.id==="group-add-member"){
  const sel=document.getElementById("group-member-select");
  if(sel?.value)updateMember(id,sel.value,true);
 }
 if(button.id==="group-delete"){
  if(!confirm("Удалить группу? Отдельные юрлица и продажи сохранятся."))return;
  saveGroups("delete client group",items=>items.filter(g=>g.id!==id));
 }
});
document.getElementById("modal").addEventListener("input",event=>{
 if(event.target.id!=="group-member-search")return;
 const needle=event.target.value.toLowerCase();
 const select=document.getElementById("group-member-select");
 if(!select)return;select.replaceChildren();
 const linked=new Set(groups().flatMap(g=>g.clientIds||[]));
 customers().filter(c=>!linked.has(c.id)&&c.name.toLowerCase().includes(needle))
  .sort((a,b)=>a.name.localeCompare(b.name,"ru"))
  .forEach(c=>select.add(new Option(c.name,c.id)));
});