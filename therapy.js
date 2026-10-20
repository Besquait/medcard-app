// Treatment tab: schemes of treatment. A scheme is what one doctor prescribed at one time (or what the person
// does on their own): drugs with how to take them and for how long, recommendations on food, routine and
// exercise, and the complaints it is meant to treat. The page is a grid of small tiles (name and drugs only);
// a tile opens the scheme with tabs: drugs, recommendations, what it treats. Dates, doctor and study are kept in
// the data and in the doctor report, but not shown on the page.
// Loaded before app.js: definitions only; initTherapy() wires the UI.
"use strict";

const TP_RECS = [["food", "Питание"], ["life", "Режим"], ["move", "Упражнения"], ["other", "Другое"]];
const TP_REC_NAME = Object.fromEntries(TP_RECS);
const TP_EFF = [["yes", "Помогает"], ["part", "Немного"], ["no", "Не помогает"]];
const TP_EFF_NAME = Object.fromEntries(TP_EFF);
const TP_BEFORE = 14;   // days before the start that count as "before treatment"

const tpList = () => Object.entries(state.plans || {}).map(([id, p]) => ({ id, ...p }));
const tpStart = p => [p.date, ...(p.drugs || []).map(d => d.start)].filter(Boolean).sort()[0] || "";
// running: not closed by hand, and either has no drugs or at least one drug without an end or not over yet
const tpActive = p => !p.done && (!(p.drugs || []).length || p.drugs.some(d => !d.end || d.end >= todayISO()));
const tpDays = (a, b) => daysBetween(a, b) + 1;
function tpDrugWhen(d) {
  const today = todayISO();
  if (!d.start && !d.end) return "постоянно";
  if (!d.end) return `с ${fmtDate(d.start)} · постоянно`;
  const span = `${fmtDate(d.start)}–${fmtDate(d.end)}`, n = d.start ? tpDays(d.start, d.end) : 0;
  if (d.end < today) return `${span} · закончен`;
  if (d.start && d.start > today) return `${span} · начнётся через ${daysBetween(today, d.start)} дн.`;
  const left = daysBetween(today, d.end);
  return `${span}${n ? ` · ${n} дн.` : ""} · ${left ? `осталось ${left} ${plural(left, "день", "дня", "дней")}` : "последний день"}`;
}
// strength of each linked complaint in the days before the start against the days of the course
function tpCompare(p) {
  const start = tpStart(p); if (!start) return [];
  const ends = (p.drugs || []).map(d => d.end).filter(Boolean).sort(), today = todayISO();
  const stop = [ends[ends.length - 1] || today, today].sort()[0];
  const out = [];
  for (const id of p.sy || []) {
    const s = syList().find(x => x.id === id); if (!s) continue;
    const by = syDays(s), before = [], during = [];
    for (let i = TP_BEFORE; i >= 1; i--) { const v = dyVal(s, addDaysISO(start, -i), by); if (v != null) before.push(v); }
    for (let d = start; d <= stop; d = addDaysISO(d, 1)) { const v = dyVal(s, d, by); if (v != null) during.push(v); }
    if (before.length < 3 || during.length < 3) continue;
    const avg = a => a.reduce((x, v) => x + v, 0) / a.length;
    out.push({ s, a: avg(before), b: avg(during), na: before.length, nb: during.length });
  }
  return out;
}

/* ---------- page ---------- */
function renderTherapy() {
  const box = $("#therapyView"); if (!box || box.hidden) return;
  const all = tpList().sort((a, b) => tpStart(b).localeCompare(tpStart(a)));
  const now = all.filter(tpActive), past = all.filter(p => !tpActive(p));
  const page = ui.tpPage === "drugs" ? "drugs" : "plans";
  const head = `<div class="st-head"><div><h2>Лечение</h2></div>
      ${ui.readonly || page === "drugs" ? "" : `<button type="button" class="btn primary" data-tp-new>Добавить</button>`}</div>
    <div class="seg sy-ptabs" role="tablist" aria-label="Раздел">${[["plans", "Схемы"], ["drugs", "Препараты"]].map(([k, n]) => `<button type="button" role="tab" data-tp-page="${k}" aria-pressed="${page === k}">${n}</button>`).join("")}</div>`;
  if (page === "drugs") { box.innerHTML = head + tpDrugsPage(); return; }
  box.innerHTML = `${head}
    ${!all.length ? `<div class="st-empty"><h3>Схем лечения пока нет</h3><p>Записывай сюда, что назначил врач: препараты, советы по питанию и режиму — и какие жалобы это лечит.</p>${ui.readonly ? "" : `<button type="button" class="btn primary" data-tp-new>Добавить</button>`}</div>` : ""}
    ${now.length ? `<div class="tp-grid">${now.map(tpTile).join("")}</div>` : ""}
    ${past.length ? `<details class="sy-past"${ui.tpPastOpen ? " open" : ""}><summary class="st-year">Раньше · ${past.length}</summary><div class="tp-grid">${past.map(tpTile).join("")}</div></details>` : ""}`;
}
// a tile: the name, the drugs in one line and how it works if marked
function tpTile(p) {
  const drugs = (p.drugs || []).map(d => d.name.replace(/\s*\(.*\)$/, "")).join(" · ");
  const n = (p.sy || []).filter(id => state.symptoms?.[id]).length;
  return `<button type="button" class="card tp-tile${tpActive(p) ? "" : " past"}" data-tp="${esc(p.id)}">
    <b>${esc(p.title || "Схема лечения")}</b>
    ${drugs ? `<span class="tp-tdrugs">${esc(drugs)}</span>` : ""}
    <span class="tp-tfoot">${n ? `<span>лечит ${n} ${plural(n, "жалобу", "жалобы", "жалоб")}</span>` : "<span></span>"}${p.eff ? `<span class="tp-teff e-${p.eff}">${esc(TP_EFF_NAME[p.eff])}</span>` : ""}</span>
  </button>`;
}
// one scheme in a window: tabs instead of everything at once, and everything is edited right there:
// a tap on a drug opens it for editing, "+" rows add drugs, advice and complaints, × removes them
function openPlan(id) {
  const p = state.plans?.[id]; if (!p) return;
  if (ui.tpOpen !== id) { ui.tpDrug = null; ui.tpAdd = null; }
  ui.tpOpen = id;
  const ro = !!ui.readonly, drugs = p.drugs || [], recs = p.recs || [];
  const sy = (p.sy || []).map(x => syList().find(s => s.id === x)).filter(Boolean);
  const cmp = Object.fromEntries(tpCompare({ ...p, id }).map(c => [c.s.id, c]));
  const tabs = [["drugs", "Препараты", drugs.length], ["recs", "Рекомендации", recs.length], ["sy", "Лечит", sy.length]];
  const tab = tabs.some(([k]) => k === ui.tpTab) ? ui.tpTab : "drugs";
  const drugEdit = (d, i) => `<form class="tp-ed" data-tp-dsave="${i}">
      <input class="input" name="name" value="${esc(d.name || "")}" placeholder="Препарат и доза, например Омез 40" autocomplete="off">
      <input class="input" name="how" value="${esc(d.how || "")}" placeholder="Как принимать" autocomplete="off">
      <div class="tp-edb">${i !== "new" ? `<button type="button" class="btn sm ghost danger" data-tp-ddel="${i}">Удалить</button>` : ""}<span style="flex:1"></span>
        <button type="button" class="btn sm ghost" data-tp-cancel>Отмена</button><button type="submit" class="btn sm primary">Сохранить</button></div></form>`;
  const add = (k, label) => ro ? "" : `<button type="button" class="tp-add" data-tp-addopen="${k}">+ ${label}</button>`;
  const body = {
    drugs: () => `<div class="tp-list">${drugs.map((d, i) => ui.tpDrug === i ? drugEdit(d, i)
        : `<div class="tp-drugrow"><button type="button" class="tp-drug" data-tp-dedit="${i}"${ro ? " disabled" : ""}><b>${esc(d.name)}</b>${d.how ? `<span>${esc(d.how)}</span>` : ""}</button>${drugFor(d.name) ? `<button type="button" class="btn sm ghost tp-about" data-dr="${esc(drugFor(d.name).id)}">О препарате</button>` : ""}</div>`).join("")}
      ${ui.tpDrug === "new" ? drugEdit({}, "new") : add("drug", "Препарат")}</div>`,
    recs: () => `${TP_RECS.map(([k, n]) => { const l = recs.map((r, i) => ({ ...r, i })).filter(r => (r.cat || "other") === k); return l.length ? `<section class="tp-recg"><h4>${n}</h4><ul>${l.map(r => `<li><span>${esc(r.text)}</span>${ro ? "" : `<button type="button" class="icon-btn sm" data-tp-rdel="${r.i}" aria-label="Убрать совет">×</button>`}</li>`).join("")}</ul></section>` : ""; }).join("")}
      ${ui.tpAdd === "rec" ? `<form class="tp-ed" data-tp-radd><div class="seg tp-cats" role="group" aria-label="Раздел">${TP_RECS.slice(0, 3).map(([k, n], i) => `<button type="button" data-tp-cat="${k}" aria-pressed="${(ui.tpCat || "food") === k}">${n}</button>`).join("")}</div>
          <input class="input" name="text" placeholder="Совет, например: не есть за 3 часа до сна" autocomplete="off">
          <div class="tp-edb"><span style="flex:1"></span><button type="button" class="btn sm ghost" data-tp-cancel>Отмена</button><button type="submit" class="btn sm primary">Добавить</button></div></form>`
        : add("rec", "Совет")}`,
    sy: () => `<div class="tp-list"${ui.tpAdd === "sy" ? " hidden" : ""}>${sy.map(s => { const c = cmp[s.id]; return `<div class="tp-syrow"><button type="button" class="tp-syr" data-sy-open="${esc(s.id)}"><span>${esc(s.name)}</span>${c ? `<small class="${c.b < c.a ? "better" : c.b > c.a ? "worse" : ""}">${dyNum(c.a)} → ${dyNum(c.b)}</small>` : ""}</button>${ro ? "" : `<button type="button" class="icon-btn sm" data-tp-sydel="${esc(s.id)}" aria-label="Убрать: ${esc(s.name)}">×</button>`}</div>`; }).join("")}</div>
      ${ui.tpAdd === "sy" ? `<div class="tp-ed">${tpSyPicker(p.sy || [])}
          <div class="tp-edb"><span style="flex:1"></span><button type="button" class="btn sm ghost" data-tp-cancel>Отмена</button><button type="button" class="btn sm primary" data-tp-sydone>Готово</button></div></div>`
        : add("sy", "Выбрать жалобы")}`,
  };
  openX(`<div class="dlg-head"><h3>${esc(p.title || "Схема лечения")}</h3><button type="button" class="icon-btn" data-xclose aria-label="Закрыть">×</button></div>
    <div class="sy-tabs" role="tablist">${tabs.map(([k, n, c]) => `<button type="button" role="tab" data-tp-tab="${k}" aria-selected="${tab === k}">${n}${c ? `<span class="num">${c}</span>` : ""}</button>`).join("")}</div>
    <div class="tp-body">${body[tab]()}</div>
    <div class="dlg-foot"><div class="tp-effs" role="group" aria-label="Как помогает">${TP_EFF.map(([k, n]) => `<button type="button" class="sy-eff e-${k}" data-tp-eff="${esc(id)}|${k}" aria-pressed="${p.eff === k}"${ro ? " disabled" : ""}>${n}</button>`).join("")}</div>
      <span style="flex:1"></span>${ro ? "" : `<button type="button" class="btn ghost" data-tp-edit="${esc(id)}">Название и прочее</button>`}</div>`, "st-dlg tp-dlg tp-view");
  $("#xDlg .tp-ed input")?.focus();
}
// redraw the open scheme after an edit, keeping the scroll
function tpRedraw() { const d = $("#xDlg"), y = d.scrollTop; save(); renderTherapy(); openPlan(ui.tpOpen); d.scrollTop = y; }

/* ---------- drugs ---------- */
// my drugs (from schemes) first, then the rest of the reference; search hides rows in place
function tpDrugsPage() {
  const mine = new Map();
  for (const p of tpList()) for (const d of p.drugs || []) {
    const ref = drugFor(d.name), key = ref ? ref.id : "n:" + norm(d.name);
    if (!mine.has(key)) mine.set(key, { ref, name: ref ? ref.name : d.name, plans: [] });
    if (!mine.get(key).plans.includes(p.title)) mine.get(key).plans.push(p.title);
  }
  const others = Object.values(DRUG).filter(d => !mine.has(d.id));
  const row = (ref, name, sub) => `<button type="button" class="tp-drow" data-dr="${ref ? esc(ref.id) : ""}" data-q="${esc(norm(name + " " + (ref?.group || "")))}"${ref ? "" : " disabled"}>
      <span><b>${esc(name)}</b><small>${esc(sub)}</small></span>${ref ? `<svg class="chev" width="18" height="18" viewBox="0 0 20 20" aria-hidden="true"><path d="M7 4l6 6-6 6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>` : ""}</button>`;
  return `<input class="input tp-dq" data-dr-q placeholder="Найти препарат" autocomplete="off" aria-label="Найти препарат">
    ${mine.size ? `<h3 class="st-year">Мои · ${mine.size}</h3><div class="card st-list tp-dlist">${[...mine.values()].map(m => row(m.ref, m.name, [m.ref?.group, m.ref ? "" : "нет в справочнике", "в схеме: " + m.plans.join(", ")].filter(Boolean).join(" · "))).join("")}</div>` : ""}
    ${others.length ? `<h3 class="st-year">Справочник · ${others.length}</h3><div class="card st-list tp-dlist">${others.map(d => row(d, d.name, d.group)).join("")}</div>` : ""}
    <p class="muted tp-dnone" hidden>Ничего не нашлось</p>
    <p class="muted tp-dnote">Кратко для пациента, по инструкциям и исследованиям. Дозу и курс решает врач.</p>`;
}
function openDrug(id) {
  const d = DRUG[id]; if (!d) return;
  ui.drOpen = id;
  const tab = ["how", "care", "ev"].includes(ui.drTab) ? ui.drTab : "how";
  const li = l => l?.length ? `<ul>${l.map(x => `<li>${esc(x)}</li>`).join("")}</ul>` : "";
  const sec = (t, l, cls = "") => l?.length ? `<section class="tp-recg ${cls}"><h4>${t}</h4>${li(l)}</section>` : "";
  const mine = tpList().flatMap(p => (p.drugs || []).filter(x => drugFor(x.name)?.id === id).map(x => `${p.title}: ${x.how || "как назначено"}`));
  const body = {
    how: () => `<p class="tp-what">${esc(d.what)}</p>${mine.length ? sec("У тебя", mine, "tp-mine") : ""}${sec("Как принимать", d.how)}${sec("Как лучше", d.best)}`,
    care: () => `${sec("Нельзя, если", d.contra)}${sec("Побочные", d.side)}${sec("С чем осторожно", d.mix)}`,
    ev: () => `${sec("Что показывают исследования", d.evidence)}${d.src?.length ? `<section class="tp-recg"><h4>Источники</h4><ul>${d.src.map(([t, u]) => `<li><a href="${esc(u)}" target="_blank" rel="noopener">${esc(t)}</a></li>`).join("")}</ul></section>` : ""}`,
  };
  openX(`<div class="dlg-head"><div><div class="info-group">${esc(d.group)}</div><h3>${esc(d.name)}</h3></div><button type="button" class="icon-btn" data-xclose aria-label="Закрыть">×</button></div>
    <div class="sy-tabs" role="tablist">${[["how", "Как принимать"], ["care", "Осторожно"], ["ev", "Исследования"]].map(([k, n]) => `<button type="button" role="tab" data-dr-tab="${k}" aria-selected="${tab === k}">${n}</button>`).join("")}</div>
    <div class="tp-body">${body[tab]()}</div>
    <p class="muted tp-dnote">Кратко, по инструкции и исследованиям. Дозу и курс решает врач.</p>`, "st-dlg tp-dlg dr-dlg");
}

/* ---------- complaints picker ---------- */
function tpSyPicker(sel) {
  const l = syList().filter(s => !syPast(s) || sel.includes(s.id)).sort((a, b) => sel.includes(b.id) - sel.includes(a.id) || syOrder(a, b));
  return `<div class="tp-pick"><input class="input" data-tp-pq placeholder="Найти жалобу" autocomplete="off" aria-label="Найти жалобу">
    <div class="tp-plist">${l.map(s => `<label class="tp-prow" data-q="${esc(norm(s.name + " " + SY_ZONE[syZoneOf(s)]))}"><input type="checkbox" data-tp-sy="${esc(s.id)}"${sel.includes(s.id) ? " checked" : ""}>
      <span>${esc(s.name)}</span><small>${esc(SY_ZONE[syZoneOf(s)])}</small></label>`).join("")}
      <p class="muted tp-pnone" hidden>Ничего не нашлось</p></div></div>`;
}

/* ---------- form ---------- */
const tpDrugRow = (d = {}) => `<div class="tp-frow" data-tp-drug data-start="${esc(d.start || "")}" data-end="${esc(d.end || "")}">
    <input class="input" name="dname" placeholder="Препарат и доза, например Омез 40" value="${esc(d.name || "")}" autocomplete="off">
    <input class="input" name="dhow" placeholder="Как принимать" value="${esc(d.how || "")}" autocomplete="off">
    <button type="button" class="icon-btn sm" data-tp-drm aria-label="Убрать препарат">×</button></div>`;
function openPlanForm(id) {
  const p = id ? state.plans[id] : { drugs: [{}], recs: [], sy: [] };
  ui.tpEdit = { id };
  const recText = k => (p.recs || []).filter(r => (r.cat || "other") === k).map(r => r.text).join("\n");
  openX(`<div class="dlg-head"><h3>${id ? "Изменить схему" : "Новая схема лечения"}</h3><button type="button" class="icon-btn" data-xclose aria-label="Закрыть">×</button></div>
    <form class="st-form tp-form" data-tp-form novalidate>
      <label class="fld"><span>Название</span><input class="input" name="title" value="${esc(p.title || "")}" placeholder="Например: желудок" autocomplete="off"></label>
      <div class="fld"><span>Препараты</span><div class="tp-drugs-f" data-tp-drugs>${(p.drugs?.length ? p.drugs : [{}]).map(tpDrugRow).join("")}</div>
        <button type="button" class="btn sm ghost" data-tp-dradd>+ Препарат</button></div>
      ${TP_RECS.slice(0, 3).map(([k, n]) => `<label class="fld"><span>${n} — каждый совет с новой строки</span><textarea class="input sy-grow" name="rec_${k}" rows="2">${esc(recText(k))}</textarea></label>`).join("")}
      <div class="fld"><span>Что лечит</span>${tpSyPicker(p.sy || [])}</div>
      ${id ? `<label class="sy-mainf"><input type="checkbox" name="done"${p.done ? " checked" : ""}><span><b>Закончил</b><small>Схема уйдёт в «Раньше»</small></span></label>` : ""}
      <div class="dlg-foot">${id ? `<button type="button" class="btn ghost danger" data-tp-del="${esc(id)}">${ui.confirmTp === id ? "Точно удалить?" : "Удалить"}</button>` : ""}<span style="flex:1"></span><button type="button" class="btn ghost" data-xclose>Отмена</button><button type="submit" class="btn primary">Сохранить</button></div>
    </form>`, "st-dlg tp-dlg");
  syGrowAll();
}
function savePlan() {
  const f = $("[data-tp-form]"), v = Object.fromEntries(new FormData(f)), ed = ui.tpEdit;
  const prev = ed.id ? state.plans[ed.id] : {};
  const drugs = $$("[data-tp-drug]", f).map(r => {
    const name = $("[name=dname]", r).value.trim(); if (!name) return null;
    return { name, how: $("[name=dhow]", r).value.trim(), start: r.dataset.start || "", end: r.dataset.end || "" };
  }).filter(Boolean);
  // the "other" advice is not in the form any more: keep what was there
  const recs = [...TP_RECS.slice(0, 3).flatMap(([k]) => String(v["rec_" + k] || "").split("\n").map(t => t.trim()).filter(Boolean).map(text => ({ cat: k, text }))),
    ...(prev.recs || []).filter(r => r.cat === "other")];
  const sy = $$("[data-tp-sy]:checked", f).map(b => b.dataset.tpSy);
  const title = (v.title || "").trim() || drugs.map(d => d.name).slice(0, 3).join(", ") || "Схема лечения";
  const id = ed.id || newId("tp");
  state.plans ||= {};
  state.plans[id] = { ...prev, title, drugs, recs, sy, done: !!v.done, date: prev.date || todayISO() };
  save(); renderAll(); openPlan(id); toast(ed.id ? "Схема сохранена" : "Схема добавлена");
}
// the doctor report: running schemes and those that ended within the period
function therapyReport(from) {
  const l = tpList().filter(p => tpActive(p) || [...(p.drugs || []).map(d => d.end), tpStart(p)].filter(Boolean).sort().pop() >= from)
    .sort((a, b) => tpActive(b) - tpActive(a) || tpStart(b).localeCompare(tpStart(a)));
  if (!l.length) return "";
  return `<table class="rep-t rep-tp"><thead><tr><th>Схема</th><th>Препараты</th><th>Лечит</th><th>Результат</th></tr></thead><tbody>${l.map(p => `<tr>
    <td><b>${esc(p.title)}</b><br><small>${esc([tpActive(p) ? "идёт" : "закончено", p.by, p.date ? fmtDate(p.date) : ""].filter(Boolean).join(" · "))}</small></td>
    <td>${(p.drugs || []).map(d => `${esc(d.name)}${d.how ? ` — ${esc(d.how)}` : ""} <small>${esc(tpDrugWhen(d))}</small>`).join("<br>") || "—"}${(p.recs || []).length ? `<br><small>Советы: ${esc(p.recs.map(r => r.text).join("; "))}</small>` : ""}</td>
    <td>${esc((p.sy || []).map(id => state.symptoms?.[id]?.name).filter(Boolean).join(", ")) || "—"}</td>
    <td>${p.eff ? esc(TP_EFF_NAME[p.eff]) : "—"}${tpCompare(p).map(c => `<br><small>${esc(c.s.name)}: ${dyNum(c.a)} → ${dyNum(c.b)}</small>`).join("")}</td></tr>`).join("")}</tbody></table>`;
}
// schemes that treat one complaint, for its card
function tpForSymptom(id) {
  return tpList().filter(p => (p.sy || []).includes(id)).sort((a, b) => tpActive(b) - tpActive(a) || tpStart(b).localeCompare(tpStart(a)));
}

/* ---------- wiring ---------- */
function initTherapy() {
  const page = $("#therapyView"), xd = $("#xDlg");
  page.addEventListener("input", e => {
    if (!e.target.matches("[data-dr-q]")) return;
    const q = norm(e.target.value); let n = 0;
    $$(".tp-drow", page).forEach(r => { const on = !q || r.dataset.q.includes(q); r.hidden = !on; n += on; });
    $$(".tp-dlist", page).forEach(l => { const any = $$(".tp-drow", l).some(r => !r.hidden); l.hidden = !any; l.previousElementSibling.hidden = !any; });
    $(".tp-dnone", page).hidden = !!n;
  });
  page.addEventListener("click", e => {
    const t = e.target;
    const pg = t.closest("[data-tp-page]"); if (pg) { ui.tpPage = pg.dataset.tpPage; renderTherapy(); return; }
    const dr = t.closest("[data-dr]"); if (dr && dr.dataset.dr) { ui.drTab = null; openDrug(dr.dataset.dr); return; }
    if (t.closest("[data-tp-new]")) { ui.confirmTp = null; openPlanForm(); return; }
    const tile = t.closest("[data-tp]"); if (tile) { ui.tpTab = null; openPlan(tile.dataset.tp); return; }
    if (t.closest(".sy-past > summary")) { ui.tpPastOpen = !t.closest("details").open; return; }
  });
  xd.addEventListener("click", e => {
    if (!xd.classList.contains("tp-dlg")) return;
    const t = e.target;
    const drt = t.closest("[data-dr-tab]"); if (drt) { ui.drTab = drt.dataset.drTab; openDrug(ui.drOpen); return; }
    const dra = t.closest("[data-dr]"); if (dra) { ui.drTab = null; openDrug(dra.dataset.dr); return; }
    const tb = t.closest("[data-tp-tab]"); if (tb) { ui.tpTab = tb.dataset.tpTab; ui.tpDrug = null; ui.tpAdd = null; openPlan(ui.tpOpen); return; }
    const p = state.plans?.[ui.tpOpen];
    if (p && xd.classList.contains("tp-view")) {
      const de = t.closest("[data-tp-dedit]"); if (de) { ui.tpDrug = +de.dataset.tpDedit; ui.tpAdd = null; openPlan(ui.tpOpen); return; }
      const ao = t.closest("[data-tp-addopen]");
      if (ao) { const k = ao.dataset.tpAddopen; if (k === "drug") { ui.tpDrug = "new"; ui.tpAdd = null; } else { ui.tpAdd = k; ui.tpDrug = null; } openPlan(ui.tpOpen); return; }
      if (t.closest("[data-tp-cancel]")) { ui.tpDrug = null; ui.tpAdd = null; openPlan(ui.tpOpen); return; }
      const dd = t.closest("[data-tp-ddel]"); if (dd) { p.drugs.splice(+dd.dataset.tpDdel, 1); ui.tpDrug = null; tpRedraw(); return; }
      const rd = t.closest("[data-tp-rdel]"); if (rd) { p.recs.splice(+rd.dataset.tpRdel, 1); tpRedraw(); return; }
      const ct = t.closest("[data-tp-cat]"); if (ct) { ui.tpCat = ct.dataset.tpCat; $$("[data-tp-cat]").forEach(b => b.setAttribute("aria-pressed", b === ct)); $("#xDlg .tp-ed input")?.focus(); return; }
      const sd = t.closest("[data-tp-sydel]"); if (sd) { p.sy = (p.sy || []).filter(x => x !== sd.dataset.tpSydel); tpRedraw(); return; }
      if (t.closest("[data-tp-sydone]")) { p.sy = $$("#xDlg [data-tp-sy]:checked").map(b => b.dataset.tpSy); ui.tpAdd = null; tpRedraw(); return; }
    }
    const ed = t.closest("[data-tp-edit]"); if (ed) { ui.confirmTp = null; openPlanForm(ed.dataset.tpEdit); return; }
    const ef = t.closest("[data-tp-eff]");
    if (ef) { const [id, k] = ef.dataset.tpEff.split("|"), p = state.plans[id]; p.eff = p.eff === k ? "" : k; save(); renderTherapy(); openPlan(id); return; }
    const so = t.closest("[data-sy-open]"); if (so) { ui.syTab = "over"; ui.syAddOpen = null; openSymptom(so.dataset.syOpen); return; }
    if (t.closest("[data-tp-dradd]")) { $("[data-tp-drugs]").insertAdjacentHTML("beforeend", tpDrugRow()); $("[data-tp-drug]:last-child [name=dname]").focus(); return; }
    const rm = t.closest("[data-tp-drm]"); if (rm) { rm.closest("[data-tp-drug]").remove(); return; }
    const del = t.closest("[data-tp-del]");
    if (del) { const id = del.dataset.tpDel; if (ui.confirmTp !== id) { ui.confirmTp = id; del.textContent = "Точно удалить?"; return; } ui.confirmTp = null; delete state.plans[id]; save(); renderAll(); closeX(); toast("Схема удалена"); }
  });
  xd.addEventListener("submit", e => {
    const f = e.target;
    if (f.matches("[data-tp-form]")) { e.preventDefault(); savePlan(); return; }
    const p = state.plans?.[ui.tpOpen]; if (!p) return;
    if (f.matches("[data-tp-dsave]")) {
      e.preventDefault();
      const name = f.elements.name.value.trim(), how = f.elements.how.value.trim(), i = f.dataset.tpDsave;
      if (!name) { f.elements.name.focus(); return; }
      p.drugs ||= [];
      if (i === "new") p.drugs.push({ name, how, start: todayISO(), end: "" }); else Object.assign(p.drugs[+i], { name, how });
      ui.tpDrug = null; tpRedraw(); return;
    }
    if (f.matches("[data-tp-radd]")) {
      e.preventDefault();
      const text = f.elements.text.value.trim(); if (!text) return;
      p.recs = [...(p.recs || []), { cat: ui.tpCat || "food", text }];
      tpRedraw(); $("#xDlg [data-tp-radd] input")?.focus(); return;
    }
  });
  // Enter in a one-line field must not save a half-filled scheme
  xd.addEventListener("keydown", e => { if (e.key === "Enter" && e.target.matches("[data-tp-form] input")) e.preventDefault(); });
  xd.addEventListener("input", e => {
    if (!xd.classList.contains("tp-dlg")) return;
    if (e.target.matches(".sy-grow")) syGrow(e.target);
    if (e.target.matches("[data-tp-pq]")) {
      const q = norm(e.target.value), box = e.target.closest(".tp-pick");
      let n = 0;
      $$(".tp-prow", box).forEach(r => { const on = !q || r.dataset.q.includes(q); r.hidden = !on; n += on; });
      $(".tp-pnone", box).hidden = !!n;
    }
  });
}
