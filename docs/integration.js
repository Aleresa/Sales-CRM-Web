"use strict";
/* MoySklad results come ONLY from private Sales-CRM/data/moysklad-sync.json.
   No token or API requests to MoySklad from this public GitHub Pages shell. */
let msSync = null;
let msSyncError = "";

function msDate(value) {
  if (!value) return "—";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? h(value) : d.toLocaleString("ru-RU", {
    day:"numeric",month:"long",year:"numeric",hour:"2-digit",minute:"2-digit"
  });
}

async function loadIntegration() {
  msSync = null; msSyncError = "";
  try {
    const file = await fileRead("moysklad-sync");
    const sync = file.value;
    if (!sync || sync.schema_version !== 1 || !sync.complete ||
        !Array.isArray(sync.stock) || !Array.isArray(sync.salesByClient) ||
        !sync.salesByMonth || !Array.isArray(sync.salesBySku)) {
      throw new Error("Неполный снимок синхронизации");
    }
    msSync = sync;
    // Stock replaces the old October 2026 inventory snapshot. Historic
    // Jan-Sep client/SKU comparisons are deliberately not overwritten.
    if (insights) insights.stock = sync.stock;
  } catch (err) {
    msSyncError = err instanceof Error ? err.message : "Снимок не найден";
  }
}

function renderIntegration() {
  const title = header("Синхронизация · МойСклад",
    "Склад и новые отгрузки загружаются в приватный GitHub. Исходная история и заметки сохраняются.");
  if (!msSync) return title +
    '<section class="panel"><div class="panel-head"><div><h2>Ожидается первая синхронизация</h2>' +
    '<p>Данные 2023–22.10.2026 и прежний складской снимок остаются доступны.</p></div></div>' +
    '<p>Добавь новый API-токен в <b>Settings → Secrets and variables → Actions</b> приватного репозитория ' +
    '<b>Sales-CRM</b> под именем <code>MOYSKLAD_TOKEN</code>. Запусти workflow <b>CRM / MoySklad sync</b>.' +
    ' После первого успешного запуска здесь появится отметка обновления.</p>' +
    '<p class="note">Токен «МойСклад» нельзя вводить на этой публичной странице. '+
    'Если он уже был отправлен в чат, отзови его и создай новый. ' +
    'Подключение не выполнено, пока GitHub Actions не завершится успешно.</p></section>';
  const records = Object.entries(msSync.salesByMonth).sort((a,b)=>b[0].localeCompare(a[0]));
  const moneySince = records.reduce((v,[,r])=>v+n(r.revenue),0);
  const knownNames = new Set((insights?.clients||[]).map(x=>String(x[0]).toLocaleLowerCase("ru")));
  const unmatched = msSync.salesByClient.filter(c=>!knownNames.has(String(c.name).toLocaleLowerCase("ru")));
  return title +
    '<section class="metric-grid">' +
    metric("Последнее обновление",msDate(msSync.as_of),"↻","Не потоковые данные, а снимок") +
    metric("Свободных SKU",fmt(msSync.stock.filter(x=>n(x[1])>0).length),"▤","По всем складам") +
    metric("Отгрузки после 22.10.2026",money(moneySince),"◈","С вычетом возвратов за новый период") +
    metric("Новых контрагентов на сверку",fmt(unmatched.length),"♧","Не сопоставлены по точному имени") +
    '</section>' +
    '<div class="two-col"><section class="panel"><div class="panel-head"><div><h2>Новые продажи по месяцам</h2>' +
    '<p>Отдельно от старой истории до 22 октября 2026</p></div></div>' +
    '<div class="table-wrap"><table class="data-table"><thead><tr><th>Месяц</th><th>Выручка</th><th>Штук</th><th>Документов</th></tr></thead><tbody>' +
    (records.map(([m,r])=>'<tr><td>'+h(m)+'</td><td>'+money(r.revenue)+'</td><td>'+fmt(r.units)+'</td><td>'+fmt(r.documents)+'</td></tr>').join("") ||
     '<tr><td colspan="4">Новых отгрузок пока нет</td></tr>') +
    '</tbody></table></div></section>' +
    '<section class="panel"><div class="panel-head"><div><h2>Контроль сопоставления</h2>' +
    '<p>Контрагентов необходимо привязать к существующим клиентам или группам</p></div></div>' +
    (unmatched.length ? '<div class="list">' + unmatched.slice(0,30).map(c=>
      '<div class="item"><span class="grow"><b>'+h(c.name)+'</b><small>Отгрузки: '+money(c.revenue)+'</small></span></div>').join("") +
      '</div>' : '<p class="muted">Все имена новых покупателей найдены в архивной истории.</p>') +
    '</section></div>' +
    '<p class="note">Остатки из «МойСклад» заменяют снимок склада от 23.10.2026 при следующем входе в CRM. ' +
    'Старые сравнения январь–сентябрь за 2023–2026 годы остаются неизменными. ' +
    'Сумма за новый период учитывается отдельно, пока не сверены методики отчётов и API. ' +
    'При ошибке синхронизации старые данные сохраняются; причины проверяются в GitHub Actions.</p>';
}
