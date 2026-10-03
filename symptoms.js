// Symptoms tab: what the person feels — headaches, a clicking knee, sore eyes, teeth.
// One record per complaint. How it behaves decides how it is tracked:
//   once  — happened once (a toothache); one dated entry, counts as past after two weeks
//   recur — comes and goes (headaches); every episode is a dated entry, one tap logs today
//   const — there all the time (clicking knee); a start date, entries are optional check-ins
// A once-complaint that happens again turns into recur by itself.
// Loaded before app.js: definitions only; initSymptoms() wires the UI.
"use strict";

const SY_PATTERNS = [
  ["once", "Разово", "было один раз"],
  ["recur", "Приступами", "то есть, то нет"],
  ["const", "Постоянно", "беспокоит всё время"],
];
const SY_PATTERN = Object.fromEntries(SY_PATTERNS.map(([k, n]) => [k, n]));
const SY_SEV = [[1, "Слабо"], [2, "Заметно"], [3, "Сильно"]];
const SY_SEV_NAME = Object.fromEntries(SY_SEV);
// [zone id, zone name, presets: [name, usual pattern, situation with a lab plan]]
const SY_ZONES = [
  ["head", "Голова", [["Головная боль", "recur", "Головные боли"], ["Мигрень", "recur", "Головные боли"], ["Головокружение", "recur", "Головные боли"], ["Шум в ушах", "const", "Головные боли"], ["Тяжесть в голове", "recur", "Давление и отёки"]]],
  ["eyes", "Глаза", [["Боль в глазах", "recur", ""], ["Сухость глаз", "const", ""], ["Покраснение глаз", "once", "Аллергия"], ["Ухудшение зрения", "const", ""], ["Мушки перед глазами", "recur", ""]]],
  ["teeth", "Зубы и рот", [["Зубная боль", "once", ""], ["Кровоточат дёсны", "recur", "Кровоточивость и тромбы"], ["Чувствительность зубов", "const", ""], ["Сухость во рту", "const", "Сахар и диабет"], ["Язвочки во рту", "recur", "Анемия"]]],
  ["ent", "Нос и горло", [["Заложен нос", "const", "Аллергия"], ["Боль в горле", "once", "Воспаление и инфекции"], ["Насморк", "once", "Аллергия"], ["Кашель", "once", "Воспаление и инфекции"], ["Храп", "const", "Стресс и сон"]]],
  ["heart", "Сердце и дыхание", [["Сердцебиение", "recur", "Сердце и сосуды"], ["Боль в груди", "recur", "Сердце и сосуды"], ["Одышка", "recur", "Сердце и сосуды"], ["Скачет давление", "recur", "Давление и отёки"], ["Отёки ног", "recur", "Давление и отёки"]]],
  ["gut", "Живот", [["Изжога", "recur", "Изжога и гастрит"], ["Вздутие", "recur", "ЖКТ и живот"], ["Боль в животе", "recur", "ЖКТ и живот"], ["Тошнота", "recur", "ЖКТ и живот"], ["Запор", "recur", "ЖКТ и живот"], ["Диарея", "once", "ЖКТ и живот"]]],
  ["joints", "Спина и суставы", [["Хруст в колене", "const", "Суставы"], ["Боль в колене", "recur", "Суставы"], ["Боль в спине", "recur", "Суставы"], ["Боль в шее", "recur", "Суставы"], ["Судороги в ногах", "recur", "Онемение и нервы"], ["Немеют руки или ноги", "recur", "Онемение и нервы"]]],
  ["skin", "Кожа и волосы", [["Сыпь", "once", "Аллергия"], ["Зуд", "recur", "Аллергия"], ["Акне", "const", "Кожа и акне"], ["Выпадают волосы", "const", "Выпадение волос"], ["Сухая кожа", "const", "Кожа и акне"], ["Ломкие ногти", "const", "Анемия"]]],
  ["mind", "Сон и самочувствие", [["Усталость", "const", "Усталость и слабость"], ["Плохо сплю", "recur", "Стресс и сон"], ["Тревога", "recur", "Тревога и настроение"], ["Сонливость днём", "const", "Усталость и слабость"], ["Постоянно мёрзну", "const", "Щитовидка"], ["Потливость", "recur", "Щитовидка"]]],
  ["uro", "Мочеполовая система", [["Частое мочеиспускание", "const", "Сахар и диабет"], ["Боль при мочеиспускании", "once", "Почки"], ["Снижено либидо", "const", "Либидо и потенция"]]],
  ["other", "Другое", []],
];
const SY_ZONE = Object.fromEntries(SY_ZONES.map(([id, name]) => [id, name]));
const SY_PRESETS = SY_ZONES.flatMap(([zone, , list]) => list.map(([name, pattern, sit]) => ({ name, pattern, sit, zone })));
const SY_POPULAR = ["Головная боль", "Боль в спине", "Хруст в колене", "Боль в глазах", "Зубная боль", "Изжога", "Усталость", "Плохо сплю", "Заложен нос", "Сердцебиение"];
const SY_ONCE_DAYS = 14, SY_QUIET_DAYS = 90;

const syList = () => Object.entries(state.symptoms || {}).map(([id, s]) => ({ id, ...s }));
const syLog = s => [...(s.log || [])].sort((a, b) => (a.d || "").localeCompare(b.d || ""));
const syLast = s => { const l = syLog(s); return l.length ? l[l.length - 1].d : s.start; };
const syPreset = name => SY_PRESETS.find(p => norm(p.name) === norm(name));
// past: closed by hand, a single episode two weeks ago, or no episode for three months
function syPast(s) {
  if (s.end) return true;
  if (s.pattern === "const") return false;
  const ago = daysBetween(syLast(s) || todayISO(), todayISO());
  return ago > (s.pattern === "once" ? SY_ONCE_DAYS : SY_QUIET_DAYS);
}
const syCount = (s, days) => (s.log || []).filter(e => e.d && daysBetween(e.d, todayISO()) < days && e.d <= todayISO()).length;
const syFor = d => { const n = daysBetween(d, todayISO()); return n < 1 ? "с сегодня" : spanText(n); };
function syAgo(d) {
  const n = daysBetween(d, todayISO());
  return n <= 0 ? "сегодня" : n === 1 ? "вчера" : `${spanText(n)} назад`;
}
// one line under the name: how it behaves right now
function syWhen(s) {
  if (s.end) return `прошло ${fmtDate(s.end)}`;
  if (s.pattern === "const") return s.start ? `с ${longDate(s.start)} · ${syFor(s.start)}` : "постоянно";
  if (s.pattern === "once") return longDate(syLast(s));
  const n = syCount(s, 30);
  return `${n ? `${n} ${plural(n, "раз", "раза", "раз")} за 30 дней` : "за 30 дней не было"} · последний ${syAgo(syLast(s))}`;
}
// severity: the latest entry wins, otherwise the one set in the form
const sySev = s => { const l = syLog(s); return l.length && l[l.length - 1].sev ? l[l.length - 1].sev : s.sev || 0; };
const syDot = sev => `<i class="sy-dot s${sev || 0}" aria-hidden="true"></i>`;
// last 14 days as small ticks, filled on days with an episode
function syTicks(s) {
  const by = {}; (s.log || []).forEach(e => { by[e.d] = Math.max(by[e.d] || 0, e.sev || 1); });
  let out = "";
  for (let i = 13; i >= 0; i--) { const d = addDaysISO(todayISO(), -i); out += `<i class="${by[d] ? "s" + by[d] : ""}" title="${fmtDate(d)}"></i>`; }
  return `<span class="sy-ticks" aria-hidden="true">${out}</span>`;
}
const addDaysISO = (iso, n) => { const d = new Date(iso + "T00:00:00"); d.setDate(d.getDate() + n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };

/* ---------- page ---------- */
function renderSymptoms() {
  const box = $("#symptomsView"); if (!box || box.hidden) return;
  const all = syList();
  if (!all.length) {
    box.innerHTML = `<div class="st-head"><div><h2>Симптомы</h2></div></div>
      <div class="st-empty">
        <h3>Что беспокоит?</h3>
        <p>Записывай всё, что чувствуешь: головные боли, хруст в колене, боль в глазах, зубы. Разовое — одной записью, приступы — отметкой в один тап, постоянное — с какого времени. Перед приёмом всё попадёт в сводку для врача.</p>
        <div class="tchips sy-quick">${SY_POPULAR.map(n => `<button type="button" class="tchip" data-sy-new="${esc(n)}">${esc(n)}</button>`).join("")}</div>
        <button type="button" class="btn primary" data-sy-new>Добавить симптом</button>
      </div>`;
    return;
  }
  const now = all.filter(s => !syPast(s)), past = all.filter(syPast);
  // most recent first; constant complaints by severity
  now.sort((a, b) => (syLast(b) || "").localeCompare(syLast(a) || "") || sySev(b) - sySev(a));
  past.sort((a, b) => (b.end || syLast(b) || "").localeCompare(a.end || syLast(a) || ""));
  const sub = [`${now.length} ${plural(now.length, "беспокоит", "беспокоят", "беспокоят")} сейчас`, past.length ? `${past.length} прошло` : ""].filter(Boolean).join(" · ");
  box.innerHTML = `
    <div class="st-head">
      <div><h2>Симптомы</h2><p class="st-sub">${sub}</p></div>
      <button type="button" class="btn primary" data-sy-new>Добавить</button>
    </div>
    ${now.length ? `<h3 class="st-year">Беспокоит сейчас</h3><div class="card st-list">${now.map(syRow).join("")}</div>` : `<div class="empty">Сейчас ничего не беспокоит.</div>`}
    ${past.length ? `<details class="sy-past"${ui.syPastOpen ? " open" : ""}><summary class="st-year">Прошло · ${past.length}</summary><div class="card st-list">${past.map(syRow).join("")}</div></details>` : ""}`;
}
function syRow(s) {
  const past = syPast(s), sev = sySev(s);
  // constant complaints get check-ins with a chosen severity inside the card, not a blind one-tap mark
  const plus = s.pattern !== "const";
  return `<div class="sy-row${past ? " past" : ""}" role="button" tabindex="0" data-sy="${esc(s.id)}">
    ${syDot(past ? 0 : sev)}
    <span class="st-main">
      <b class="st-title">${esc(s.name)}</b>
      <span class="sy-when">${esc(SY_PATTERN[s.pattern] || "")} · ${esc(syWhen(s))}</span>
      ${s.note ? `<span class="st-concl">${esc(s.note)}</span>` : ""}
    </span>
    <span class="sy-side">${s.pattern === "recur" && !past ? syTicks(s) : ""}${sev && !past ? `<span class="sy-sev s${sev}">${esc(SY_SEV_NAME[sev])}</span>` : ""}</span>
    ${plus ? `<button type="button" class="sy-plus" data-sy-log="${esc(s.id)}" title="Было сегодня" aria-label="Было сегодня: ${esc(s.name)}"><svg width="16" height="16" viewBox="0 0 20 20" aria-hidden="true"><path d="M10 4v12M4 10h12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg><span>Сегодня</span></button>` : `<span></span>`}
  </div>`;
}

/* ---------- one complaint ---------- */
// last 16 weeks, Monday-first columns, one cell per day
function syHeat(s) {
  const by = {}; (s.log || []).forEach(e => { by[e.d] = Math.max(by[e.d] || 0, e.sev || 1); });
  const today = todayISO(), t = new Date(today + "T00:00:00"), shift = (t.getDay() + 6) % 7;
  const start = addDaysISO(today, -(15 * 7 + shift));
  let cells = "";
  for (let i = 0; i < 16 * 7; i++) {
    const d = addDaysISO(start, i);
    cells += d > today ? `<i class="fut"></i>` : `<i class="${by[d] ? "s" + by[d] : ""}" title="${fmtDate(d)}${by[d] ? " · " + SY_SEV_NAME[by[d]].toLowerCase() : ""}"></i>`;
  }
  return `<div class="sy-heat" aria-label="Эпизоды за 16 недель">${cells}</div>`;
}
function openSymptom(id) {
  const s = state.symptoms?.[id]; if (!s) return;
  const past = syPast(s), log = syLog(s).reverse(), sev = sySev(s);
  const g = s.sit && window.GUIDES?.[s.sit];
  const shown = ui.syAllLog ? log : log.slice(0, 8);
  const logLabel = s.pattern === "const" ? "Отметки" : "Когда было";
  ui.syOpen = id;
  openX(`<div class="dlg-head"><div><div class="info-group">${esc(SY_ZONE[s.zone] || "Симптом")}</div><h3>${esc(s.name)}</h3>
      <div class="st-meta">${esc(SY_PATTERN[s.pattern] || "")} · ${esc(syWhen(s))}</div></div>
      <button type="button" class="icon-btn" data-xclose aria-label="Закрыть">×</button></div>
    <div class="st-tags">${past ? `<span class="st-status"><i></i>Прошло</span>` : `<span class="st-status find"><i></i>Беспокоит</span>`}${sev ? `<span class="sy-sev s${sev}">${esc(SY_SEV_NAME[sev])}</span>` : ""}</div>
    ${s.pattern === "recur" ? `<section class="st-sec"><h4>Как часто</h4>
      <div class="sy-stats"><div><b class="num">${syCount(s, 30)}</b><span>за 30 дней</span></div><div><b class="num">${syCount(s, 90)}</b><span>за 90 дней</span></div><div><b>${esc(syAgo(syLast(s)))}</b><span>последний раз</span></div></div>
      ${syHeat(s)}<p class="muted sy-heatcap">16 недель: столбец — неделя, сверху понедельник. Цвет — сила.</p></section>` : ""}
    <section class="st-sec"><h4>${s.pattern === "const" ? "Отметить, как сейчас" : s.pattern === "once" ? "Было ещё раз?" : "Отметить приступ"}</h4>
      <form class="sy-logf" data-sy-logf>
        <div class="sy-logrow">${dfield('name="d"', todayISO())}
          <div class="sy-sevs">${SY_SEV.map(([k, n]) => `<button type="button" class="sy-sevb s${k}" data-sy-lsev="${k}" aria-pressed="${k === (sev || 2)}">${n}</button>`).join("")}</div>
          <input type="hidden" name="sev" value="${sev || 2}"></div>
        <div class="sy-logrow"><input class="input" name="note" placeholder="заметка: что было перед этим, что помогло — необязательно" autocomplete="off"><button type="submit" class="btn primary">Записать</button></div>
        ${s.pattern === "once" ? `<p class="muted st-note">После второй записи симптом станет «приступами» — будет видно, как часто повторяется.</p>` : ""}
      </form></section>
    ${log.length ? `<section class="st-sec"><h4>${logLabel} · ${log.length}</h4><div class="sy-log">${shown.map(e => `<div class="sy-lrow">${syDot(e.sev)}<span class="num">${fmtDate(e.d)}</span><span class="muted">${esc(SY_SEV_NAME[e.sev] || "")}</span><span class="sy-lnote">${esc(e.note || "")}</span><button type="button" class="icon-btn sm" data-sy-ldel="${esc(e.d)}|${esc(e.t || "")}" aria-label="Удалить запись">×</button></div>`).join("")}</div>
      ${log.length > shown.length ? `<button type="button" class="btn sm ghost" data-sy-alllog>Показать все ${log.length}</button>` : ""}</section>` : ""}
    ${s.note ? `<section class="st-sec"><h4>Заметка</h4><p class="st-text">${esc(s.note)}</p></section>` : ""}
    ${g ? `<section class="st-sec"><h4>Анализы</h4><p class="sy-guide">${esc(g.lead)}</p>
      <button type="button" class="btn" data-sy-sit="${esc(s.sit)}">Открыть план анализов: ${esc(s.sit.toLowerCase())}</button>
      ${g.flags ? `<div class="g-flags"><b>Сразу к врачу, если:</b> ${esc(g.flags)}</div>` : ""}</section>` : ""}
    <div class="dlg-foot"><button type="button" class="btn ghost danger" data-sy-del="${esc(id)}">${ui.confirmSy === id ? "Точно удалить?" : "Удалить"}</button><span style="flex:1"></span>
      <button type="button" class="btn ghost" data-sy-end="${esc(id)}">${past ? "Снова беспокоит" : "Прошло"}</button>
      <button type="button" class="btn primary" data-sy-edit="${esc(id)}">Изменить</button></div>`, "st-dlg sy-dlg");
}
function syAddEntry(id, d, sev, note) {
  const s = state.symptoms[id]; if (!s) return;
  s.log = [...(s.log || []), { d, sev: +sev || 0, note: note || "", t: Date.now() }];
  if (s.pattern === "once" && s.log.length > 1) s.pattern = "recur";
  if (s.end && d >= s.end) s.end = "";
  if (s.pattern !== "const" && (!s.start || d < s.start)) s.start = d;
  save(); renderAll();
}

/* ---------- doctor report ---------- */
// current complaints first, then those that passed within the report period
function symptomsReport(from) {
  const l = syList().filter(s => !syPast(s) || (s.end || syLast(s) || "") >= from);
  if (!l.length) return "";
  l.sort((a, b) => syPast(a) - syPast(b) || sySev(b) - sySev(a));
  const freq = s => s.pattern === "recur" ? `приступами: ${syCount(s, 30)} за 30 дней, ${syCount(s, 90)} за 90` : s.pattern === "const" ? "постоянно" : "разово";
  return `<table class="rep-t"><thead><tr><th>Жалоба</th><th>Как часто</th><th>Впервые</th><th>Сила</th><th>Заметка</th></tr></thead><tbody>${l.map(s => `<tr>
    <td><b>${esc(s.name)}</b>${syPast(s) ? ` <small>прошло${s.end ? " " + fmtDate(s.end) : ""}</small>` : ""}</td><td>${esc(freq(s))}</td>
    <td class="num">${s.start ? `${fmtDate(s.start)}<br><small>${esc(syFor(s.start))}</small>` : "—"}</td>
    <td>${esc(SY_SEV_NAME[sySev(s)] || "—")}</td><td>${esc(s.note || "")}</td></tr>`).join("")}</tbody></table>`;
}

/* ---------- form ---------- */
const syF = n => $(`[data-sy-form] [name=${n}]`);
function openSymptomForm(id, presetName) {
  const p = presetName ? syPreset(presetName) : null;
  const s = id ? state.symptoms[id] : { name: presetName || "", zone: p?.zone || "", pattern: p?.pattern || "recur", sev: 2, start: todayISO(), note: "", sit: p?.sit || "" };
  ui.syEdit = { id, zone: "pop" };
  const zones = [["pop", "Часто"], ...SY_ZONES.filter(z => z[2].length).map(([k, n]) => [k, n])];
  openX(`<div class="dlg-head"><h3>${id ? "Изменить симптом" : "Что беспокоит"}</h3><button type="button" class="icon-btn" data-xclose aria-label="Закрыть">×</button></div>
    <form class="st-form sy-form" data-sy-form novalidate>
      <input type="hidden" name="zone" value="${esc(s.zone || "")}"><input type="hidden" name="sit" value="${esc(s.sit || "")}">
      <div class="fld"><input class="input sy-name" name="name" value="${esc(s.name)}" placeholder="Например: болит голова, хрустит колено" autocomplete="off" aria-label="Что беспокоит">
        ${id ? "" : `<div class="sy-zones" role="group" aria-label="Области">${zones.map(([k, n]) => `<button type="button" data-sy-zone="${k}" aria-pressed="${ui.syEdit.zone === k}">${esc(n)}</button>`).join("")}</div>
        <div class="tchips sy-presets" data-sy-presets></div>`}</div>
      <div class="fld"><span>Как часто</span><input type="hidden" name="pattern" value="${esc(s.pattern)}">
        <div class="wz-status sy-pats">${SY_PATTERNS.map(([k, n, h]) => `<button type="button" class="wz-st sy-pat" data-sy-pat="${k}" aria-pressed="${s.pattern === k}"><b>${n}</b><small>${h}</small></button>`).join("")}</div></div>
      <div class="fld"><span>Насколько сильно</span><input type="hidden" name="sev" value="${s.sev || 2}">
        <div class="sy-sevs">${SY_SEV.map(([k, n]) => `<button type="button" class="sy-sevb s${k}" data-sy-sev="${k}" aria-pressed="${(s.sev || 2) === k}">${n}</button>`).join("")}</div></div>
      <div class="st-row2">
        <div class="fld"><span data-sy-datek>${s.pattern === "const" ? "Беспокоит с" : id ? "Впервые" : "Когда было"}</span>${dfield('name="start"', s.start || todayISO())}</div>
        <div class="fld st-grow"><span>Область</span>${csel('name="zonePick"', [["", "Определится сама"], ...SY_ZONES.map(([k, n]) => [k, n])], s.zone || "")}</div>
      </div>
      <label class="fld"><span>Заметка</span><input class="input" name="note" value="${esc(s.note || "")}" placeholder="где именно, после чего, что помогает — необязательно" autocomplete="off"></label>
      <div class="dlg-foot"><span style="flex:1"></span><button type="button" class="btn ghost" data-xclose>Отмена</button><button type="submit" class="btn primary">Сохранить</button></div>
    </form>`, "st-dlg sy-dlg");
  syPresets();
  if (!presetName && !id) setTimeout(() => $("[data-sy-form] [name=name]")?.focus(), 40);
}
// preset chips: typed text filters across all zones, otherwise the chosen zone (or your own + popular)
function syPresets() {
  const box = $("[data-sy-presets]"); if (!box) return;
  const q = norm(syF("name").value), zone = ui.syEdit.zone;
  const own = [...new Set(syList().map(s => s.name))];
  let names;
  if (q) names = [...new Set([...own, ...SY_PRESETS.map(p => p.name)])].filter(n => norm(n).includes(q) && norm(n) !== q).slice(0, 10);
  else if (zone === "pop") names = [...new Set([...own.filter(n => !syList().some(s => s.name === n && !syPast(s))), ...SY_POPULAR])].slice(0, 12);
  else names = SY_PRESETS.filter(p => p.zone === zone).map(p => p.name);
  box.innerHTML = names.map(n => `<button type="button" class="tchip" data-sy-pick="${esc(n)}" aria-pressed="${norm(n) === q}">${esc(n)}</button>`).join("");
}
function sySetPattern(k) {
  syF("pattern").value = k;
  $$("[data-sy-pat]").forEach(b => b.setAttribute("aria-pressed", b.dataset.syPat === k));
  $("[data-sy-datek]").textContent = k === "const" ? "Беспокоит с" : ui.syEdit.id ? "Впервые" : "Когда было";
}
function syPick(name) {
  const p = syPreset(name), own = syList().find(s => norm(s.name) === norm(name));
  syF("name").value = name;
  const src = own || p;
  if (src) {
    sySetPattern(src.pattern === "once" && own ? "recur" : src.pattern);
    syF("zone").value = src.zone || ""; syF("sit").value = src.sit || "";
    const zp = $("[data-sy-form] .csel"); if (zp) { $("input", zp).value = src.zone || ""; $("[data-csel-open] span", zp).textContent = SY_ZONE[src.zone] || "Определится сама"; }
  }
  syPresets();
}
function saveSymptom() {
  const f = $("[data-sy-form]"), v = Object.fromEntries(new FormData(f)), ed = ui.syEdit;
  const name = v.name.trim(); if (!name) { toast("Напиши, что беспокоит"); syF("name").focus(); return; }
  const p = syPreset(name), zone = v.zonePick || v.zone || p?.zone || "other";
  // the same complaint again (not closed) is a new episode, not a second card
  const same = !ed.id && syList().find(s => norm(s.name) === norm(name) && !s.end);
  if (same) { syAddEntry(same.id, v.start, v.sev, v.note.trim()); openSymptom(same.id); toast(`Записано в «${same.name}»`); return; }
  const id = ed.id || newId("sy"), prev = state.symptoms[id] || {};
  const sym = { ...prev, name, zone, pattern: v.pattern, sev: +v.sev || 2, start: v.start, note: v.note.trim(), sit: v.sit || p?.sit || prev.sit || "", end: prev.end || "" };
  if (!ed.id) sym.log = v.pattern === "const" ? [] : [{ d: v.start, sev: +v.sev || 2, note: "", t: Date.now() }];
  state.symptoms ||= {}; state.symptoms[id] = sym;
  save(); renderAll();
  if (ed.id) openSymptom(id); else closeX();
  toast(ed.id ? "Симптом сохранён" : `Записано: ${name}`);
}

/* ---------- wiring ---------- */
function initSymptoms() {
  const page = $("#symptomsView");
  const rowAct = e => {
    const lg = e.target.closest("[data-sy-log]");
    if (lg) {
      const s = state.symptoms[lg.dataset.syLog];
      syAddEntry(lg.dataset.syLog, todayISO(), sySev(s) || 2, "");
      const n = (s.log || []).filter(x => x.d === todayISO()).length;
      toast(`${s.name}: записано сегодня${n > 1 ? ` (${n}-й раз)` : ""}`);
      return;
    }
    const r = e.target.closest("[data-sy]"); if (r) { ui.confirmSy = null; ui.syAllLog = false; openSymptom(r.dataset.sy); }
  };
  page.addEventListener("click", e => {
    const n = e.target.closest("[data-sy-new]"); if (n) { openSymptomForm(null, n.dataset.syNew || undefined); return; }
    if (e.target.closest(".sy-past summary")) { ui.syPastOpen = !e.target.closest("details").open; return; }
    rowAct(e);
  });
  page.addEventListener("keydown", e => { if ((e.key === "Enter" || e.key === " ") && e.target.matches(".sy-row")) { e.preventDefault(); rowAct(e); } });

  const xd = $("#xDlg");
  xd.addEventListener("click", e => {
    const t = e.target;
    if (!xd.classList.contains("sy-dlg")) return;
    const ed = t.closest("[data-sy-edit]"); if (ed) { openSymptomForm(ed.dataset.syEdit); return; }
    const del = t.closest("[data-sy-del]");
    if (del) { const id = del.dataset.syDel; if (ui.confirmSy !== id) { ui.confirmSy = id; del.textContent = "Точно удалить?"; return; } ui.confirmSy = null; delete state.symptoms[id]; save(); renderAll(); closeX(); toast("Симптом удалён"); return; }
    const en = t.closest("[data-sy-end]");
    if (en) { const s = state.symptoms[en.dataset.syEnd], was = syPast(s); s.end = was ? "" : todayISO(); if (was && s.pattern !== "const" && syPast(s)) s.log = [...(s.log || []), { d: todayISO(), sev: sySev(s) || 2, note: "", t: Date.now() }]; save(); renderAll(); openSymptom(en.dataset.syEnd); toast(was ? "Снова в списке «Беспокоит сейчас»" : "Отмечено, что прошло"); return; }
    const sit = t.closest("[data-sy-sit]"); if (sit) { closeX(); setView("labs"); setSit(sit.dataset.sySit); $(".toolbar")?.scrollIntoView({ behavior: "smooth", block: "start" }); return; }
    if (t.closest("[data-sy-alllog]")) { ui.syAllLog = true; openSymptom(ui.syOpen); return; }
    const ld = t.closest("[data-sy-ldel]");
    if (ld) { const [d, tt] = ld.dataset.syLdel.split("|"), s = state.symptoms[ui.syOpen]; const i = s.log.findIndex(x => x.d === d && String(x.t || "") === tt); if (i >= 0) s.log.splice(i, 1); save(); renderAll(); openSymptom(ui.syOpen); return; }
    const ls = t.closest("[data-sy-lsev]");
    if (ls) { $("[data-sy-logf] [name=sev]").value = ls.dataset.syLsev; $$("[data-sy-lsev]").forEach(b => b.setAttribute("aria-pressed", b === ls)); return; }
    if (!$("[data-sy-form]")) return;
    const z = t.closest("[data-sy-zone]"); if (z) { ui.syEdit.zone = z.dataset.syZone; $$("[data-sy-zone]").forEach(b => b.setAttribute("aria-pressed", b === z)); syPresets(); return; }
    const pk = t.closest("[data-sy-pick]"); if (pk) { syPick(pk.dataset.syPick); return; }
    const pt = t.closest("[data-sy-pat]"); if (pt) { sySetPattern(pt.dataset.syPat); return; }
    const sv = t.closest("[data-sy-sev]"); if (sv) { syF("sev").value = sv.dataset.sySev; $$("[data-sy-sev]").forEach(b => b.setAttribute("aria-pressed", b === sv)); return; }
  });
  xd.addEventListener("input", e => {
    if (!e.target.closest("[data-sy-form]") || e.target.name !== "name") return;
    const p = syPreset(e.target.value);
    if (p) { syF("zone").value = p.zone; syF("sit").value = p.sit; } else if (!ui.syEdit.id) syF("sit").value = "";
    syPresets();
  });
  xd.addEventListener("keydown", e => {
    if (e.key !== "Enter" || e.target.tagName !== "INPUT" || e.target.matches(".cal-type")) return;
    if (e.target.closest("[data-sy-form]")) { e.preventDefault(); saveSymptom(); }
    else if (e.target.closest("[data-sy-logf]")) { e.preventDefault(); $("[data-sy-logf]").requestSubmit(); }
  });
  xd.addEventListener("submit", e => {
    if (e.target.matches("[data-sy-form]")) { e.preventDefault(); saveSymptom(); return; }
    if (e.target.matches("[data-sy-logf]")) {
      e.preventDefault();
      const v = Object.fromEntries(new FormData(e.target)), s = state.symptoms[ui.syOpen];
      if (!v.d) { toast("Выбери дату"); return; }
      syAddEntry(ui.syOpen, v.d, v.sev, v.note.trim());
      openSymptom(ui.syOpen); toast(`${s.name}: записано за ${fmtDate(v.d)}`);
    }
  });
}
