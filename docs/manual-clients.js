"use strict";
/* Manually created CRM prospects are private records in data/crm-state.json.
   New prospects are not automatically written to MoySklad. */

function manualClientFields(c){
 if(c.source!=="manual")return "";
 return '<div class="client-manual-note">'+
   (c.moysklad_id?'✓ Название найдено среди контрагентов «МойСклад».':'◷ Ожидает контрагента с таким же названием в «МойСклад».')+
  '</div>'+
  '<label class="field">Название (точно как в МойСклад)<input name="name" required maxlength="180" value="'+attr(c.name)+'"></label>'+
  '<label class="field">Контактное лицо<input name="contact_person" maxlength="160" value="'+attr(c.contact_person||"")+'"></label>'+
  '<label class="field">Телефон<input name="phone" type="tel" maxlength="100" value="'+attr(c.phone||"")+'"></label>'+
  '<label class="field">Email<input name="email" type="email" maxlength="200" value="'+attr(c.email||"")+'"></label>'+
  '<label class="field">Город<input name="city" maxlength="150" value="'+attr(c.city||"")+'"></label>'+
  '<label class="field">Адрес<input name="address" maxlength="250" value="'+attr(c.address||"")+'"></label>'+
  '<label class="field">Сайт<input name="website" maxlength="300" value="'+attr(c.website||"")+'"></label>';
}

function manualFields(values){
 return {
  contact_person:String(values.get("contact_person")||"").trim(),
  phone:String(values.get("phone")||"").trim(),
  email:String(values.get("email")||"").trim(),
  city:String(values.get("city")||"").trim(),
  address:String(values.get("address")||"").trim(),
  website:String(values.get("website")||"").trim()
 };
}

function patchManualClientState(state,client,id,overrides,values){
 const next={...state,clientOverrides:{...(state.clientOverrides||{}),[id]:overrides}};
 if(client.source!=="manual")return next;
 const newName=String(values.get("name")||"").trim();
 if(!newName||newName.length>180)throw Error("Укажи название клиента от 1 до 180 символов.");
 const duplicate=crmAllClients().some(c=>c.id!==id&&crmNameKey(c.name)===crmNameKey(newName))||
  (state.manualClients||[]).some(c=>c.id!==id&&crmNameKey(c.name)===crmNameKey(newName));
 if(duplicate)throw Error("Клиент с таким названием уже есть в CRM.");
 const updates={name:newName,...manualFields(values),...overrides};
 next.manualClients=(state.manualClients||[]).map(c=>c.id===id?{...c,...updates}:c);
 if(!next.manualClients.some(c=>c.id===id))throw Error("Карточка клиента не найдена в базе.");
 return next;
}

function openNewClient(){
 modal.hidden=false;delete modal.dataset.groupId;
 const groupOptions=groups().slice().sort((a,b)=>a.name.localeCompare(b.name,"ru"))
  .map(g=>'<option value="'+attr(g.id)+'">'+h(g.name)+'</option>').join("");
 document.getElementById("drawer-body").innerHTML=
  '<div class="drawer-top"><span class="eyebrow">НОВЫЙ КЛИЕНТ</span><button class="icon-btn" id="close-modal" type="button">×</button></div>'+
  '<h2>Добавить клиента</h2>'+
  '<p>Введи название точно так, как создашь его в «МойСклад». Здесь контрагент в «МойСклад» не создаётся.</p>'+
  '<form id="client-create-form">'+
  '<label class="field">Название клиента *<input name="name" required maxlength="180" placeholder="Точно как в МойСклад" autocomplete="organization"></label>'+
  '<label class="field">Группа клиентов (необязательно)<select name="group"><option value="">Без группы — отдельный клиент</option>'+groupOptions+'</select></label>'+
  '<label class="field">Контактное лицо<input name="contact_person" maxlength="160" placeholder="Имя и должность"></label>'+
  '<label class="field">Телефон<input name="phone" maxlength="100" type="tel" placeholder="+7 ..."></label>'+
  '<label class="field">Email<input name="email" maxlength="200" type="email" placeholder="mail@example.ru"></label>'+
  '<label class="field">Город<input name="city" maxlength="150"></label>'+
  '<label class="field">Адрес<input name="address" maxlength="250"></label>'+
  '<label class="field">Сайт<input name="website" maxlength="300" placeholder="https://..."></label>'+
  '<label class="field">Статус<select name="status">'+STATUS.map(v=>option(v,"К работе")).join("")+'</select></label>'+
  '<label class="field">Приоритет<select name="priority">'+PRIORITIES.map(v=>option(v,"Обычный")).join("")+'</select></label>'+
  '<label class="field">Заметки<textarea name="notes" rows="4" maxlength="4000" placeholder="Что предложить, история диалога"></textarea></label>'+
  '<button class="primary save" type="submit">Сохранить клиента</button></form>';
 document.getElementById("close-modal").addEventListener("click",()=>modal.hidden=true);
 document.querySelector('#client-create-form [name="name"]').focus();
}

async function createManualClient(form){
 if(saving)return;
 const values=new FormData(form);
 const name=String(values.get("name")||"").trim(),key=crmNameKey(name);
 if(!name||name.length>180){notice("Укажи название клиента (до 180 символов).",true);return;}
 if(crmAllClients().some(c=>crmNameKey(c.name)===key)){
  notice("Такое название уже есть в CRM, возможно среди исключённых. Найди клиента через поиск или восстанови.",true);return;
 }
 const groupId=String(values.get("group")||"");
 const id="manual:"+crypto.randomUUID();
 const record={
  id,name,...manualFields(values),
  status:String(values.get("status")||"К работе"),
  priority:String(values.get("priority")||"Обычный"),
  notes:String(values.get("notes")||"").trim(),
  created_at:new Date().toISOString(),source:"manual"
 };
 const button=form.querySelector('button[type="submit"]');saving=true;button.disabled=true;
 try{
  data.crm=await writeJson("crm-state",state=>{
   if((state.manualClients||[]).some(c=>crmNameKey(c.name)===key))
    throw Error("Клиент с таким названием уже есть в CRM.");
   const activeGroups=Array.isArray(state.groups)?state.groups:[];
   if(groupId&&!activeGroups.some(g=>g.id===groupId))
    throw Error("Выбранная группа клиентов больше не найдена.");
   return {...state,manualClients:[...(state.manualClients||[]),record],
    groups:groupId?activeGroups.map(g=>g.id===groupId?
     {...g,clientIds:[...(g.clientIds||[]),id]}:g):activeGroups};
  },"create manual client");
  modal.hidden=true;clientView="grouped";search=name;page="clients";render();
  notice("Клиент «"+name+"» добавлен в CRM. При появлении совпадающего названия в «МойСклад» дубль не создастся.");
 }catch(err){notice("Не удалось добавить клиента: "+err.message,true);}
 finally{saving=false;if(button.isConnected)button.disabled=false;}
}

// The client section is an expandable submenu in the main navigation.
function setClientsMenuExpanded(expanded){
 const panel=document.getElementById("clients-nav-submenu"),button=document.getElementById("clients-menu-toggle");
 if(!panel||!button)return;
 panel.hidden=!expanded;
 button.setAttribute("aria-expanded",String(expanded));
 button.classList.toggle("expanded",expanded);
}
document.getElementById("clients-menu-toggle").addEventListener("click",event=>{
 event.preventDefault();
 const panel=document.getElementById("clients-nav-submenu");
 setClientsMenuExpanded(panel.hidden);
});
document.getElementById("nav").addEventListener("click",event=>{
 const section=event.target.closest("button[data-page]");
 if(section&&["clients","groups"].includes(section.dataset.page))setClientsMenuExpanded(true);
});
root.addEventListener("click",event=>{
 if(event.target.closest("[data-new-client]"))openNewClient();
});
modal.addEventListener("submit",event=>{
 if(event.target.id!=="client-create-form")return;
 event.preventDefault();createManualClient(event.target);
});
