"use strict";

/* Product and category year selector uses like-for-like Jan-Sep sales.
   All source values come from the PRIVATE repo's insights payload. */
function historicalSort(list,referenceYear,mode,reverse){
 const idx=referenceYear-2023;
 const diff=row=>n(row.sums[3])-n(row.sums[idx]);
 list.sort((a,b)=>{
  let result=0;
  if(mode==="loss")result=diff(a)-diff(b);
  else if(mode==="growth")result=diff(b)-diff(a);
  else if(mode==="previous")result=n(b.sums[idx])-n(a.sums[idx]);
  else if(mode==="current")result=n(b.sums[3])-n(a.sums[3]);
  else if(mode==="units")result=n(b.units[3])-n(a.units[3]);
  else if(mode==="stock")result=n(b.available)-n(a.available);
  else if(mode==="name")result=(a.name||a.category).localeCompare(b.name||b.category,"ru");
  return (reverse?-1:1)*(result||String(a.code||a.category).localeCompare(String(b.code||b.category),"ru"));
 });
 return list;
}
function yearCompareControls(kind){
 const y=kind==="products"?productCompareYear:categoryCompareYear;
 const mode=kind==="products"?productSort:categorySort;
 const reverse=kind==="products"?productReverse:categoryReverse;
 const choices=[["loss","Наибольшее падение"],["growth","Наибольший рост"],["previous","Выручка выбранного года"],["current","Выручка 2026"],["name","По названию"]];
 if(kind==="products")choices.push(["units","Количество 2026"],["stock","Свободный остаток"]);
 return '<div class="sort-strip"><label class="sort-control">Сравнить с 2026: <select data-compare-year="'+kind+'">'
 +[2023,2024,2025].map(v=>option(v,y)).join("")+'</select></label>'
 +'<label class="sort-control">Сортировка: <select data-sort="'+kind+'">'
 +choices.map(([value,label])=>option(value,mode).replace('>'+value+'</option>','>'+label+'</option>')).join("")+'</select></label>'
 +'<button type="button" class="sort-reverse" data-action="reverse-sort" data-kind="'+kind+'" title="Изменить порядок">'+(reverse?"↑":"↓")+'</button></div>';
}
function renderProducts(){
 if(!insights)return histInfoUnavailable("Товары и SKU");
 const names=skuInfo(),stock=stockMap();
 const needle=search.toLocaleLowerCase("ru");
 const all=insights.skuJanSep.map(r=>{
  const code=String(r[0]),p=names.get(code)||[],s=stock.get(code)||[];
  return {code,name:p[6]||s[5]||"Артикул "+code,category:p[7]||s[6]||"",
   sums:r.slice(1,5),units:r.slice(5,9),available:n(s[1]),reserved:n(s[2]),price:n(s[4])};
 });
 const list=historicalSort(all.filter(p=>(p.code+" "+p.name+" "+p.category).toLowerCase().includes(needle)),
  productCompareYear,productSort,productReverse);
 const y=productCompareYear,idx=y-2023;
 return header("Товары и SKU","Сравнение январь–сентябрь 2023–2026 и склад на 23.10.2026.")
 +searchToolbar("Название, код или категория…")+yearCompareControls("products")
 +'<section class="panel"><div class="table-wrap"><table class="data-table"><thead><tr><th>Код</th><th>Наименование</th><th>Категория</th>'
 +'<th>'+y+'</th><th>2026</th><th>Разница</th><th>Шт. '+y+' → 2026</th><th>Доступно</th><th>Цена из остатков</th></tr></thead><tbody>'
 +list.slice(0,170).map(p=>{
  const delta=n(p.sums[3])-n(p.sums[idx]);
  return '<tr><td>'+h(p.code)+'</td><td class="long">'+h(p.name)+'</td><td>'+h(p.category)+'</td>'
  +'<td>'+money(p.sums[idx])+'</td><td>'+money(p.sums[3])+'</td>'
  +'<td class="'+(delta<0?"loss":"gain")+'">'+(delta<0?"−":"+")+money(Math.abs(delta))+'</td>'
  +'<td>'+fmt(p.units[idx])+' → '+fmt(p.units[3])+'</td><td>'+fmt(p.available)+'</td><td>'+(p.price?money(p.price):"—")+'</td></tr>';
 }).join("")+'</tbody></table></div></section>'
 +'<p class="note">Показаны первые 170 из '+list.length+' позиций. Суммы по отгрузкам, без распределения возвратов. Доступно — без резерва, на дату файла остатков.</p>';
}
function renderCategories(){
 if(!insights)return histInfoUnavailable("Категории");
 const y=categoryCompareYear,idx=y-2023,needle=search.toLowerCase();
 const rows=historicalSort(insights.categoriesJanSep
  .map(r=>({category:r[0],sums:r.slice(1,5)}))
  .filter(r=>r.category.toLowerCase().includes(needle)),
  y,categorySort,categoryReverse);
 return header("Категории","Сопоставимые периоды январь–сентябрь 2023–2026.")
 +searchToolbar("Поиск категории…")+yearCompareControls("categories")
 +'<section class="panel"><div class="table-wrap"><table class="data-table"><thead><tr>'
 +'<th>Категория</th><th>'+y+'</th><th>2026</th><th>Изменение</th><th>Изменение, %</th></tr></thead><tbody>'
 +rows.map(r=>{
  const delta=n(r.sums[3])-n(r.sums[idx]);
  return '<tr><td class="long">'+h(r.category)+'</td><td>'+money(r.sums[idx])+'</td>'
  +'<td>'+money(r.sums[3])+'</td><td class="'+(delta<0?"loss":"gain")+'">'+(delta<0?"−":"+")+money(Math.abs(delta))+'</td>'
  +'<td class="'+(delta<0?"loss":"gain")+'">'+(r.sums[idx]?percent(delta/r.sums[idx]*100):"—")+'</td></tr>';
 }).join("")+'</tbody></table></div></section><p class="note">Сравнение товарных групп по отгрузкам. Возвраты не распределены по группам.</p>';
}
