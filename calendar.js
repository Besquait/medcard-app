// Calendar: the daily screen. A week (or the month) on top shows for every day whether the medicines were
// taken and how the day felt; below is the chosen day: medicines by time of day with tick boxes, "as needed"
// ones with a counter, sleep (went to bed / got up, hours counted), overall state, main complaints, what
// happened, a note. Medicines come from running treatment schemes, each on the days between its start and end.
// Loaded before app.js: definitions only; initCalendar() wires the UI.
"use strict";

const CL_SLOTS = [["morning", "Утро"], ["day", "День"], ["evening", "Вечер"], ["night", "На ночь"], ["any", "В течение дня"]];
const CL_FOOD = { before: "до еды", with: "во время еды", after: "после еды", any: "" };
const CL_WD = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
const CL_MONTHS = ["Январь", "Февраль", "Март", "Апрель", "Май", "Июнь", "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь"];

const clSel = () => ui.clDay && ui.clDay <= todayISO() ? ui.clDay : todayISO();
const clMonday = d => { const t = new Date(d + "T00:00:00"); return addDaysISO(d, -((t.getDay() + 6) % 7)); };
// medicines of a day: scheduled ones per time of day, and "as needed" ones
function clMeds(d) {
  const sched = [], prn = [];
  for (const p of tpList()) {
    if (p.done) continue;
    (p.drugs || []).forEach((g, i) => {
      if ((g.start && g.start > d) || (g.end && g.end < d)) return;
      const id = g.id || `${p.id}#${i}`;
      if (g.prn) { prn.push({ p, g, id }); return; }
      for (const slot of g.slots?.length ? g.slots : ["any"]) sched.push({ p, g, id, slot, key: `${id}:${slot}` });
    });
  }
  return { sched, prn };
}
function clDone(d) { const { sched } = clMeds(d), m = state.days?.[d]?.meds || {}; return { n: sched.length, k: sched.filter(x => m[x.key]).length }; }
// minutes asleep from "went to bed" (the evening before) to "got up"
function clSleepMin(x) {
  if (!x?.bed || !x?.wake) return null;
  const [bh, bm] = x.bed.split(":").map(Number), [wh, wm] = x.wake.split(":").map(Number);
  let m = wh * 60 + wm - (bh * 60 + bm); if (m <= 0) m += 1440;
  return m;
}
const clHours = m => `${Math.floor(m / 60)} ч${m % 60 ? ` ${m % 60} мин` : ""}`;
const clSub = g => [g.dose, CL_FOOD[g.food] || "", g.how].filter(Boolean).join(" · ");

/* ---------- page ---------- */
function renderCalendar() {
  const box = $("#calendarView"); if (!box || box.hidden) return;
  const today = todayISO(), sel = clSel(), x = state.days?.[sel] || {};
  const label = sel === today ? "Сегодня" : sel === addDaysISO(today, -1) ? "Вчера" : dyCap(DY_WEEKDAY[new Date(sel + "T00:00:00").getDay()]);
  box.innerHTML = `<div class="st-head"><div><h2>Календарь</h2><p class="st-sub">Отмечай каждый день: что принял, как спал и как себя чувствуешь.</p></div></div>
    ${clStrip(sel, today)}
    <h3 class="cl-title">${label}<span>${esc(longDate(sel))}</span></h3>
    ${clMedsCard(sel)}
    ${clSleepCard(x)}
    <section class="card cl-card"><h4>Как в целом</h4>
      <div class="dy-moods">${DY_MOOD.map(([k, n]) => `<button type="button" class="dy-mood m${k}" data-dy-mood="${k}" aria-pressed="${x.mood === k}">${n}</button>`).join("")}</div></section>
    ${clSymptomsCard(sel)}
    <section class="card cl-card"><h4>Что было</h4>
      <div class="tchips dy-facs">${dyFactors().map(([k, n]) => `<button type="button" class="tchip" data-dy-f="${esc(k)}" aria-pressed="${!!x.f?.[k]}">${esc(n)}</button>`).join("")}
        <button type="button" class="tchip dy-none" data-dy-none aria-pressed="${!!x.f && !Object.values(x.f).some(Boolean)}">Ничего из этого</button>
        <button type="button" class="tchip dy-add" data-dy-fadd>+ Своё</button></div>
      <form class="sy-addf" data-dy-faddf hidden><input class="input" name="name" placeholder="Например: энергетик, тренировка" autocomplete="off"><button type="submit" class="btn">Добавить</button></form></section>
    <section class="card cl-card"><h4>Заметка</h4>
      <textarea class="input sy-grow dy-note" data-dy-note rows="2" placeholder="Почему так, что ещё было">${esc(x.note || "")}</textarea></section>`;
  $$("#calendarView .sy-grow").forEach(syGrow);
}
// a week by default, the whole month on demand; each day: tick of medicines and the colour of the day
function clStrip(sel, today) {
  const month = !!ui.clMonth;
  let days, title;
  if (month) {
    const first = sel.slice(0, 8) + "01", start = clMonday(first);
    const t = new Date(first + "T00:00:00"), next = new Date(t.getFullYear(), t.getMonth() + 1, 1);
    const last = addDaysISO(`${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}-01`, -1);
    const n = Math.ceil((daysBetween(start, last) + 1) / 7) * 7;
    days = Array.from({ length: n }, (_, i) => addDaysISO(start, i));
    title = `${CL_MONTHS[t.getMonth()]} ${t.getFullYear()}`;
  } else {
    const start = clMonday(sel);
    days = Array.from({ length: 7 }, (_, i) => addDaysISO(start, i));
    title = `${fmtDate(days[0]).slice(0, 5)} — ${fmtDate(days[6]).slice(0, 5)}`;
  }
  const cell = d => {
    const fut = d > today, other = month && d.slice(5, 7) !== sel.slice(5, 7), x = state.days?.[d], c = clDone(d);
    const pill = !c.n || fut ? "" : c.k === c.n ? "ok" : c.k ? "part" : d < today ? "miss" : "todo";
    return `<button type="button" class="cl-day${d === sel ? " on" : ""}${d === today ? " now" : ""}${other ? " other" : ""}" data-cl-day="${d}"${fut ? " disabled" : ""}>
      <b>${+d.slice(8)}</b><span class="cl-marks">${pill ? `<i class="cl-pill ${pill}" title="Лекарства: ${c.k} из ${c.n}"></i>` : ""}${x?.mood ? `<i class="dy-dot m${x.mood}"></i>` : ""}</span></button>`;
  };
  return `<section class="card cl-strip">
    <div class="cl-nav"><button type="button" class="icon-btn" data-cl-go="-1" aria-label="Назад">‹</button><b>${title}</b>
      <button type="button" class="icon-btn" data-cl-go="1" aria-label="Вперёд">›</button>
      <button type="button" class="btn sm ghost" data-cl-mode>${month ? "Неделя" : "Месяц"}</button></div>
    <div class="cl-grid">${CL_WD.map(w => `<span class="cl-wd">${w}</span>`).join("")}${days.map(cell).join("")}</div>
    <div class="cl-legend"><span><i class="cl-pill ok"></i>всё принято</span><span><i class="cl-pill part"></i>не всё</span><span><i class="cl-pill miss"></i>пропущено</span><span><i class="dy-dot m4"></i>самочувствие</span></div>
  </section>`;
}
function clMedsCard(d) {
  const { sched, prn } = clMeds(d), x = state.days?.[d] || {}, m = x.meds || {}, c = clDone(d);
  if (!sched.length && !prn.length) return `<section class="card cl-card"><h4>Лекарства</h4><p class="muted">На этот день нет препаратов из схем. Добавь схему в «Лечение» — и здесь появится, что принять.</p></section>`;
  const row = it => `<button type="button" class="cl-med${m[it.key] ? " on" : ""}" data-cl-med="${esc(it.key)}" aria-pressed="${!!m[it.key]}"><i class="cl-box" aria-hidden="true"></i>
      <span class="cl-mn"><b>${esc(it.g.name)}</b>${clSub(it.g) ? `<small>${esc(clSub(it.g))}</small>` : ""}</span></button>`;
  const groups = CL_SLOTS.map(([k, n]) => [n, sched.filter(it => it.slot === k)]).filter(([, l]) => l.length);
  return `<section class="card cl-card"><div class="cl-h"><h4>Лекарства</h4>${c.n ? `<span class="cl-count${c.k === c.n ? " ok" : ""}">${c.k} из ${c.n}</span>` : ""}</div>
    ${groups.map(([n, l]) => `<div class="cl-slot"><span class="cl-slotn">${n}</span>${l.map(row).join("")}</div>`).join("")}
    ${prn.length ? `<div class="cl-slot"><span class="cl-slotn">По необходимости</span>${prn.map(it => { const k = x.prn?.[it.id] || 0; return `<div class="cl-prn"><span class="cl-mn"><b>${esc(it.g.name)}</b>${clSub(it.g) ? `<small>${esc(clSub(it.g))}</small>` : ""}</span>
      ${k ? `<button type="button" class="icon-btn sm" data-cl-prn="${esc(it.id)}|-1" aria-label="Убрать приём">−</button><span class="cl-n">${k}</span>` : ""}<button type="button" class="btn sm" data-cl-prn="${esc(it.id)}|1">${k ? "Ещё" : "Принял"}</button></div>`; }).join("")}</div>` : ""}
  </section>`;
}
function clSleepCard(x) {
  const m = clSleepMin(x);
  return `<section class="card cl-card"><div class="cl-h"><h4>Сон</h4>${m ? `<span class="cl-count${m >= 420 ? " ok" : ""}">${clHours(m)}</span>` : ""}</div>
    <div class="cl-sleep"><label><span>Лёг вечером</span><input class="input" type="time" data-cl-bed value="${esc(x.bed || "")}"></label>
      <label><span>Встал утром</span><input class="input" type="time" data-cl-wake value="${esc(x.wake || "")}"></label></div></section>`;
}
function clSymptomsCard(d) {
  const cur = syList().filter(s => !syPast(s)), main = cur.filter(s => s.main).sort(syByWeight), rest = cur.filter(s => !s.main).sort(syOrder);
  const row = s => `<div class="dy-sy"><span class="dy-syn">${esc(s.name)}</span>
    <div class="dy-sev" role="group" aria-label="${esc(s.name)}">${[[0, "Нет"], ...SY_SEV].map(([k, n]) => `<button type="button" class="dy-b s${k}" data-dy-sy="${esc(s.id)}|${k}" aria-pressed="${dyVal(s, d) === k}">${n}</button>`).join("")}</div></div>`;
  const marked = rest.filter(s => dyVal(s, d) != null).length;
  return `<section class="card cl-card"><h4>${main.length ? "Главные жалобы" : "Жалобы"}</h4>
    ${main.length ? `<div class="dy-sys">${main.map(row).join("")}</div>` : ""}
    ${rest.length ? `<details class="dy-more"${ui.dyMore || !main.length ? " open" : ""}><summary>${main.length ? "Остальные жалобы" : "Все жалобы"}${marked ? ` · отмечено ${marked}` : ""}</summary><div class="dy-sys">${rest.map(row).join("")}</div></details>` : ""}</section>`;
}

/* ---------- wiring ---------- */
function initCalendar() {
  const page = $("#calendarView");
  page.addEventListener("click", e => {
    const t = e.target, d = clSel();
    const dd = t.closest("[data-cl-day]"); if (dd && !dd.disabled) { ui.clDay = dd.dataset.clDay; renderCalendar(); return; }
    const go = t.closest("[data-cl-go]");
    if (go) {
      const k = +go.dataset.clGo;
      if (ui.clMonth) { const x = new Date(d + "T00:00:00"); x.setDate(1); x.setMonth(x.getMonth() + k); const n = `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-01`; ui.clDay = k > 0 ? [n, todayISO()].sort()[0] : n; }
      else ui.clDay = [addDaysISO(d, 7 * k), todayISO()].sort()[0];
      renderCalendar(); return;
    }
    if (t.closest("[data-cl-mode]")) { ui.clMonth = !ui.clMonth; renderCalendar(); return; }
    const md = t.closest("[data-cl-med]");
    if (md) { const x = dyDay(d), k = md.dataset.clMed; x.meds = { ...(x.meds || {}) }; if (x.meds[k]) delete x.meds[k]; else x.meds[k] = true; if (!Object.keys(x.meds).length) delete x.meds; dyTidy(d); save(); renderCalendar(); return; }
    const pr = t.closest("[data-cl-prn]");
    if (pr) { const [id, k] = pr.dataset.clPrn.split("|"), x = dyDay(d); x.prn = { ...(x.prn || {}) }; x.prn[id] = Math.max(0, (x.prn[id] || 0) + +k); if (!x.prn[id]) delete x.prn[id]; if (!Object.keys(x.prn).length) delete x.prn; dyTidy(d); save(); renderCalendar(); }
  });
  // sleep: both times give the hours; the hours also feed the links (6 h and less counts as short sleep)
  page.addEventListener("change", e => {
    if (!e.target.matches("[data-cl-bed],[data-cl-wake]")) return;
    const d = clSel(), x = dyDay(d), k = e.target.matches("[data-cl-bed]") ? "bed" : "wake";
    if (e.target.value) x[k] = e.target.value; else delete x[k];
    const m = clSleepMin(x);
    if (m) x.sleep = m <= 330 ? 5 : m < 390 ? 6 : m < 450 ? 7 : 8; else if (!x.bed && !x.wake) delete x.sleep;
    dyTidy(d); save(); renderCalendar();
  });
  dyBind(page, clSel, renderCalendar);
}
