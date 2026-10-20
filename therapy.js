// Treatment tab: schemes of treatment. A scheme is what one doctor prescribed at one time (or what the person
// does on their own): drugs with how to take them and for how long, recommendations on food, routine and
// exercise, and the complaints it is meant to treat. Running schemes come first; for each linked complaint the
// diary marks before the start and during the course are compared, so it is visible whether it helps.
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
  const sub = [now.length ? `${now.length} ${plural(now.length, "схема идёт", "схемы идут", "схем идут")}` : "сейчас ничего не идёт", past.length ? `${past.length} раньше` : ""].filter(Boolean).join(" · ");
  box.innerHTML = `<div class="st-head"><div><h2>Лечение</h2><p class="st-sub">${sub}</p></div>
      ${ui.readonly ? "" : `<button type="button" class="btn primary" data-tp-new>Добавить схему</button>`}</div>
    ${!all.length ? `<div class="st-empty"><h3>Схем лечения пока нет</h3><p>Записывай сюда, что назначил врач: препараты, как принимать и сколько, советы по питанию и режиму — и какие жалобы это лечит. Потом будет видно, что помогло.</p>${ui.readonly ? "" : `<button type="button" class="btn primary" data-tp-new>Добавить схему</button>`}</div>` : ""}
    ${now.length ? `<h3 class="st-year">Сейчас · ${now.length}</h3>${now.map(tpCard).join("")}` : ""}
    ${past.length ? `<details class="sy-past"${ui.tpPastOpen ? " open" : ""}><summary class="st-year">Раньше · ${past.length}</summary>${past.map(tpCard).join("")}</details>` : ""}`;
}
function tpCard(p) {
  const active = tpActive(p), st = p.study && state.studies?.[p.study];
  const meta = [p.by, p.date ? `назначено ${fmtDate(p.date)}` : "", st ? `по: ${studyTitle(st)} ${fmtDate(st.date)}` : ""].filter(Boolean).join(" · ");
  const drugs = p.drugs || [], recs = p.recs || [], sy = (p.sy || []).map(id => syList().find(s => s.id === id)).filter(Boolean);
  const cmp = tpCompare(p);
  return `<section class="card tp-card${active ? "" : " past"}" id="tp-${esc(p.id)}">
    <div class="tp-head"><div><h3>${esc(p.title || "Схема лечения")}</h3>${meta ? `<div class="tp-meta">${esc(meta)}</div>` : ""}</div>
      <span class="st-status ${active ? "find" : ""}"><i></i>${active ? "Идёт" : "Закончено"}</span></div>
    ${drugs.length ? `<div class="tp-sec"><h4>Препараты</h4>${drugs.map(d => `<div class="tp-drug"><b>${esc(d.name)}</b><span>${esc(d.how || "")}</span><small>${esc(tpDrugWhen(d))}</small></div>`).join("")}</div>` : ""}
    ${recs.length ? `<div class="tp-sec"><h4>Рекомендации</h4>${TP_RECS.map(([k, n]) => { const l = recs.filter(r => (r.cat || "other") === k); return l.length ? `<div class="tp-rec"><span>${n}</span><ul>${l.map(r => `<li>${esc(r.text)}</li>`).join("")}</ul></div>` : ""; }).join("")}</div>` : ""}
    ${sy.length ? `<div class="tp-sec"><h4>Лечит</h4><div class="tchips">${sy.map(s => `<button type="button" class="tchip" data-sy-open="${esc(s.id)}">${esc(s.name)}</button>`).join("")}</div></div>` : ""}
    ${cmp.length ? `<div class="tp-sec"><h4>До и во время лечения</h4>${cmp.map(c => `<div class="tp-cmp${c.b < c.a ? " better" : c.b > c.a ? " worse" : ""}"><b>${esc(c.s.name)}</b><span>${dyNum(c.a)} → ${dyNum(c.b)} из 3</span><small>по дневнику: ${c.na} ${plural(c.na, "день", "дня", "дней")} до начала и ${c.nb} во время</small></div>`).join("")}</div>` : ""}
    ${p.note ? `<p class="tp-note">${esc(p.note)}</p>` : ""}
    <div class="tp-foot"><div class="tp-effs" role="group" aria-label="Как помогает">${TP_EFF.map(([k, n]) => `<button type="button" class="sy-eff e-${k}" data-tp-eff="${esc(p.id)}|${k}" aria-pressed="${p.eff === k}"${ui.readonly ? " disabled" : ""}>${n}</button>`).join("")}</div>
      ${ui.readonly ? "" : `<button type="button" class="btn sm" data-tp-edit="${esc(p.id)}">Изменить</button>`}</div>
  </section>`;
}

/* ---------- form ---------- */
const tpDrugRow = (d = {}) => `<div class="tp-frow" data-tp-drug>
    <input class="input" name="dname" placeholder="Препарат и доза, например Омез 40" value="${esc(d.name || "")}" autocomplete="off">
    <input class="input" name="dhow" placeholder="Как: 1 капсула утром за 30 мин до еды" value="${esc(d.how || "")}" autocomplete="off">
    <input class="input tp-days" name="ddays" inputmode="numeric" placeholder="Дней" value="${d.start && d.end ? tpDays(d.start, d.end) : ""}" aria-label="Сколько дней, пусто — постоянно">
    <input type="hidden" name="dstart" value="${esc(d.start || "")}">
    <button type="button" class="icon-btn sm" data-tp-drm aria-label="Убрать препарат">×</button></div>`;
function openPlanForm(id) {
  const p = id ? state.plans[id] : { date: todayISO(), drugs: [{}], recs: [], sy: [] };
  ui.tpEdit = { id };
  const studies = typeof studyList === "function" ? studyList() : [];
  const cur = syList().filter(s => !syPast(s) || (p.sy || []).includes(s.id)).sort(syOrder);
  const recText = k => (p.recs || []).filter(r => (r.cat || "other") === k).map(r => r.text).join("\n");
  openX(`<div class="dlg-head"><h3>${id ? "Изменить схему" : "Новая схема лечения"}</h3><button type="button" class="icon-btn" data-xclose aria-label="Закрыть">×</button></div>
    <form class="st-form tp-form" data-tp-form novalidate>
      <label class="fld"><span>Название</span><input class="input" name="title" value="${esc(p.title || "")}" placeholder="Например: желудок и рефлюкс" autocomplete="off"></label>
      <div class="tp-row2"><label class="fld"><span>Кто назначил</span><input class="input" name="by" value="${esc(p.by || "")}" placeholder="Врач или «сам»" autocomplete="off"></label>
        <div class="fld"><span>Когда назначено</span>${dfield('name="date"', p.date || "", { empty: "Без даты", clear: true })}</div></div>
      ${studies.length ? `<div class="fld"><span>По обследованию</span>${csel('name="study"', [["", "Не связано"], ...studies.map(s => [s.id, `${studyTitle(s)} · ${fmtDate(s.date)}`])], p.study || "")}</div>` : ""}
      <div class="fld"><span>Препараты</span><div class="tp-drugs-f" data-tp-drugs>${(p.drugs?.length ? p.drugs : [{}]).map(tpDrugRow).join("")}</div>
        <button type="button" class="btn sm ghost" data-tp-dradd>+ Препарат</button>
        <p class="muted sy-hint">«Дней» пусто — принимать постоянно. Отсчёт идёт от даты назначения.</p></div>
      ${TP_RECS.map(([k, n]) => `<label class="fld"><span>${n} — каждый совет с новой строки</span><textarea class="input sy-grow" name="rec_${k}" rows="2">${esc(recText(k))}</textarea></label>`).join("")}
      <div class="fld"><span>Что лечит</span><div class="tchips tp-syf">${cur.map(s => `<button type="button" class="tchip" data-tp-sy="${esc(s.id)}" aria-pressed="${(p.sy || []).includes(s.id)}">${esc(s.name)}</button>`).join("")}</div></div>
      <label class="fld"><span>Заметка</span><textarea class="input sy-grow" name="note" rows="2" placeholder="Что сказал врач, когда прийти снова">${esc(p.note || "")}</textarea></label>
      ${id ? `<label class="sy-mainf"><input type="checkbox" name="done"${p.done ? " checked" : ""}><span><b>Закончено</b><small>Отметь, если бросил раньше срока или схема больше не нужна</small></span></label>` : ""}
      <div class="dlg-foot">${id ? `<button type="button" class="btn ghost danger" data-tp-del="${esc(id)}">${ui.confirmTp === id ? "Точно удалить?" : "Удалить"}</button>` : ""}<span style="flex:1"></span><button type="button" class="btn ghost" data-xclose>Отмена</button><button type="submit" class="btn primary">Сохранить</button></div>
    </form>`, "st-dlg tp-dlg");
  syGrowAll();
}
function savePlan() {
  const f = $("[data-tp-form]"), v = Object.fromEntries(new FormData(f)), ed = ui.tpEdit;
  const date = v.date || "", prev = ed.id ? state.plans[ed.id] : {};
  const drugs = $$("[data-tp-drug]", f).map(r => {
    const g = n => $(`[name=${n}]`, r).value.trim();
    const name = g("dname"); if (!name) return null;
    const days = parseInt(g("ddays"), 10), start = g("dstart") || date;
    return { name, how: g("dhow"), start, end: start && days > 0 ? addDaysISO(start, days - 1) : "" };
  }).filter(Boolean);
  const recs = TP_RECS.flatMap(([k]) => String(v["rec_" + k] || "").split("\n").map(t => t.trim()).filter(Boolean).map(text => ({ cat: k, text })));
  const sy = $$("[data-tp-sy][aria-pressed=true]", f).map(b => b.dataset.tpSy);
  const title = (v.title || "").trim() || drugs.map(d => d.name).slice(0, 3).join(", ") || "Схема лечения";
  const id = ed.id || newId("tp");
  state.plans ||= {};
  state.plans[id] = { ...prev, title, by: (v.by || "").trim(), date, study: v.study || "", drugs, recs, sy, note: (v.note || "").trim(), done: !!v.done };
  save(); renderAll(); closeX(); toast(ed.id ? "Схема сохранена" : "Схема добавлена");
  $(`#tp-${CSS.escape(id)}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
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
  page.addEventListener("click", e => {
    const t = e.target;
    if (t.closest("[data-tp-new]")) { ui.confirmTp = null; openPlanForm(); return; }
    const ed = t.closest("[data-tp-edit]"); if (ed) { ui.confirmTp = null; openPlanForm(ed.dataset.tpEdit); return; }
    const so = t.closest("[data-sy-open]"); if (so) { ui.syTab = "over"; ui.syAddOpen = null; openSymptom(so.dataset.syOpen); return; }
    const ef = t.closest("[data-tp-eff]");
    if (ef) { const [id, k] = ef.dataset.tpEff.split("|"), p = state.plans[id]; p.eff = p.eff === k ? "" : k; save(); renderTherapy(); return; }
    if (t.closest(".sy-past > summary")) { ui.tpPastOpen = !t.closest("details").open; return; }
  });
  xd.addEventListener("click", e => {
    if (!xd.classList.contains("tp-dlg")) return;
    const t = e.target;
    if (t.closest("[data-tp-dradd]")) { $("[data-tp-drugs]").insertAdjacentHTML("beforeend", tpDrugRow()); $("[data-tp-drug]:last-child [name=dname]").focus(); return; }
    const rm = t.closest("[data-tp-drm]"); if (rm) { rm.closest("[data-tp-drug]").remove(); return; }
    const sy = t.closest("[data-tp-sy]"); if (sy) { sy.setAttribute("aria-pressed", sy.getAttribute("aria-pressed") !== "true"); return; }
    const del = t.closest("[data-tp-del]");
    if (del) { const id = del.dataset.tpDel; if (ui.confirmTp !== id) { ui.confirmTp = id; del.textContent = "Точно удалить?"; return; } ui.confirmTp = null; delete state.plans[id]; save(); renderAll(); closeX(); toast("Схема удалена"); }
  });
  xd.addEventListener("submit", e => { if (e.target.matches("[data-tp-form]")) { e.preventDefault(); savePlan(); } });
  // Enter in a one-line field must not save a half-filled scheme
  xd.addEventListener("keydown", e => { if (e.key === "Enter" && e.target.matches("[data-tp-form] input")) e.preventDefault(); });
  xd.addEventListener("input", e => { if (xd.classList.contains("tp-dlg") && e.target.matches(".sy-grow")) syGrow(e.target); });
}
