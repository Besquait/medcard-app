// Diary: one record per day — how it was overall, what happened (sleep, food, stress, screen, movement)
// and how each complaint felt. A complaint's mark is also written to its own log, so its card and the
// diary always agree. The links tab compares days with a factor and days without it: the average state or
// complaint strength on the same day and on the next one (food and stress often act later).
// Loaded before app.js: definitions only; initDiary() wires the UI.
"use strict";

const DY_MOOD = [[1, "Очень плохо"], [2, "Плохо"], [3, "Так себе"], [4, "Хорошо"], [5, "Отлично"]];
const DY_MOOD_NAME = Object.fromEntries(DY_MOOD);
// hours slept the night before; the edge chips mean "or less" and "or more"
const DY_SLEEP = [[5, "5 ч и меньше"], [6, "6 ч"], [7, "7 ч"], [8, "8 ч и больше"]];
// [id, chip, phrase in findings, may act on the next day]
const DY_FACTORS = [
  ["acid", "Кислое", "кислая еда", 1],
  ["late", "Поздний ужин", "поздний ужин", 1],
  ["fatty", "Жирное, острое", "жирное или острое", 1],
  ["coffee", "Кофе", "кофе", 1],
  ["stress", "Стресс", "стресс или тревога", 1],
  ["screen", "Много за компьютером", "много времени за компьютером", 0],
  ["move", "Двигался", "прогулка или движение", 0],
  ["flax", "Лён утром", "лён утром", 0],
  ["sick", "Болел", "простуда или болезнь", 1],
];
// days needed in each group before a comparison is shown; days before the links tab starts talking
const DY_MIN = 3, DY_FIRST = 7, DY_GOAL = 14, DY_GRID = 28;
const DY_WEEKDAY = ["воскресенье", "понедельник", "вторник", "среда", "четверг", "пятница", "суббота"];

const dyFactors = () => [...DY_FACTORS, ...(state.prefs?.dayFactors || []).map(f => [f.id, f.name, f.name.toLowerCase(), 1])];
const dyHas = x => !!x && !!(x.mood || x.sleep || x.note || x.f || (x.sy && Object.keys(x.sy).length));
const dyCount = () => Object.values(state.days || {}).filter(dyHas).length;
function dyDay(d) { state.days ||= {}; return (state.days[d] ||= {}); }
// an emptied day does not count as recorded
function dyTidy(d) { if (state.days?.[d] && !dyHas(state.days[d])) delete state.days[d]; }
const dyNum = v => String(Math.round(v * 10) / 10).replace(".", ",");
const dyCap = t => t ? t[0].toUpperCase() + t.slice(1) : t;

// a complaint on a day: the diary's answer (0 means "not bothering"), else a mark or an episode from its log
function dyVal(s, d, by) {
  const a = state.days?.[d]?.sy?.[s.id];
  if (a != null) return a;
  const e = (s.log || []).filter(x => x.d === d).pop();
  if (e) return e.sev || 1;
  const v = by?.[d];
  return v ? Math.max(1, Math.round(v)) : null;
}
// mark a complaint for a day: 1–3 strength, 0 "not bothering", null clears the answer.
// A plain mark in the complaint's log follows along; an entry with a note or a duration is kept.
function dyMark(id, d, v) {
  const s = state.symptoms[id]; if (!s) return;
  const log = s.log || [], e = log.filter(x => x.d === d).pop(), plain = e && !e.note && !e.trig && !e.help && !((e.dur || 0) > 1);
  if (v > 0) {
    if (e) e.sev = v; else s.log = [...log, { d, sev: v, t: Date.now() }];
    if (s.end && d >= s.end) s.end = "";
    if (s.pattern !== "const" && (!s.start || d < syStartISO(s.start))) s.start = d;
    if (s.pattern === "once" && new Set(s.log.map(l => l.d)).size > 1) s.pattern = "recur";
  } else if (plain) s.log = log.filter(x => x !== e);
  if (v == null) { const x = state.days?.[d]; if (x?.sy) delete x.sy[id]; dyTidy(d); }
  else (dyDay(d).sy ||= {})[id] = v;
}

/* ---------- one day ---------- */
function dyTab() {
  const today = todayISO(), d = ui.dayDate && ui.dayDate <= today ? ui.dayDate : today, day = state.days?.[d] || {};
  const cur = syList().filter(s => !syPast(s));
  const main = cur.filter(s => s.main).sort(syByWeight), rest = cur.filter(s => !s.main).sort(syOrder);
  const val = s => dyVal(s, d);
  const syRowD = s => `<div class="dy-sy"><span class="dy-syn">${esc(s.name)}</span>
    <div class="dy-sev" role="group" aria-label="${esc(s.name)}">${[[0, "Нет"], ...SY_SEV].map(([k, n]) => `<button type="button" class="dy-b s${k}" data-dy-sy="${esc(s.id)}|${k}" aria-pressed="${val(s) === k}">${n}</button>`).join("")}</div></div>`;
  const marked = rest.filter(s => val(s) != null).length;
  const label = d === today ? "Сегодня" : d === addDaysISO(today, -1) ? "Вчера" : dyCap(DY_WEEKDAY[new Date(d + "T00:00:00").getDay()]);
  return `<div class="dy-nav"><button type="button" class="icon-btn" data-dy-go="-1" aria-label="Предыдущий день">‹</button>
      <b>${label} · ${esc(longDate(d))}</b>
      <button type="button" class="icon-btn" data-dy-go="1"${d >= today ? " disabled" : ""} aria-label="Следующий день">›</button></div>
    <p class="dy-hint">Полминуты вечером. Сохраняется само, пропуски не страшны.</p>
    <section class="card dy-card" aria-label="Запись за день">
      <h3>Как в целом</h3>
      <div class="dy-moods">${DY_MOOD.map(([k, n]) => `<button type="button" class="dy-mood m${k}" data-dy-mood="${k}" aria-pressed="${day.mood === k}">${n}</button>`).join("")}</div>
      ${main.length ? `<h3>Главные жалобы</h3><div class="dy-sys">${main.map(syRowD).join("")}</div>`
        : `<p class="muted dy-tip">Отметь главные жалобы звёздочкой в их карточках — они встанут сюда, остальные спрятаны ниже.</p>`}
      ${rest.length ? `<details class="dy-more"${ui.dyMore || !main.length ? " open" : ""}><summary>${main.length ? "Остальные жалобы" : "Жалобы"}${marked ? ` · отмечено ${marked}` : ""}</summary><div class="dy-sys">${rest.map(syRowD).join("")}</div></details>` : ""}
      <h3>Что было</h3>
      <div class="dy-sleep"><span>Сон</span>${DY_SLEEP.map(([k, n]) => `<button type="button" class="tchip" data-dy-sleep="${k}" aria-pressed="${day.sleep === k}">${n}</button>`).join("")}</div>
      <div class="tchips dy-facs">${dyFactors().map(([k, n]) => `<button type="button" class="tchip" data-dy-f="${esc(k)}" aria-pressed="${!!day.f?.[k]}">${esc(n)}</button>`).join("")}
        <button type="button" class="tchip dy-none" data-dy-none aria-pressed="${!!day.f && !Object.values(day.f).some(Boolean)}">Ничего из этого</button>
        <button type="button" class="tchip dy-add" data-dy-fadd>+ Своё</button></div>
      <form class="sy-addf" data-dy-faddf hidden><input class="input" name="name" placeholder="Например: энергетик, тренировка" autocomplete="off"><button type="submit" class="btn">Добавить</button></form>
      <h3>Заметка</h3>
      <textarea class="input sy-grow dy-note" data-dy-note rows="2" placeholder="Почему так, что ещё было">${esc(day.note || "")}</textarea>
    </section>
    ${dyRecent()}`;
}
// the latest recorded days; a tap opens one in the form above
function dyRecent() {
  const days = state.days || {}, all = Object.keys(days).filter(d => dyHas(days[d])).sort().reverse();
  if (!all.length) return "";
  const row = d => {
    const x = days[d];
    const facs = [x.sleep ? `сон ${DY_SLEEP.find(([k]) => k === x.sleep)?.[1] || x.sleep + " ч"}` : "", ...dyFactors().filter(([k]) => x.f?.[k]).map(([, n]) => n.toLowerCase())].filter(Boolean).join(", ");
    const hard = Object.entries(x.sy || {}).filter(([, v]) => v >= 2).map(([id]) => state.symptoms[id]?.name).filter(Boolean);
    const sub = [facs, hard.length ? `сильнее: ${hard.join(", ")}` : "", x.note ? x.note.split("\n")[0] : ""].filter(Boolean).join(" · ");
    return `<button type="button" class="dy-row" data-dy-day="${d}"><i class="dy-dot${x.mood ? " m" + x.mood : ""}"></i>
      <span class="dy-rmain"><b>${fmtDate(d)}${x.mood ? ` · ${esc(DY_MOOD_NAME[x.mood])}` : ""}</b>${sub ? `<small>${esc(sub)}</small>` : ""}</span></button>`;
  };
  return `<h3 class="st-year">Записанные дни · ${all.length}</h3><div class="card st-list dy-list">${all.slice(0, 14).map(row).join("")}</div>`;
}

/* ---------- links ---------- */
// days with the factor against days without it. A difference is shown only when it is unlikely to be chance:
// Welch's t of 2.5 and more (hundreds of pairs are compared, so the bar is above the usual 2); per pair the surer of "same day" and "next day" is kept.
function dyLinks() {
  const days = state.days || {}, dates = Object.keys(days).filter(d => dyHas(days[d])).sort();
  const outs = [{ name: "Самочувствие", mood: true, scale: 4, get: d => days[d]?.mood || null }];
  syList().filter(s => !syPast(s)).forEach(s => { const by = syDays(s); outs.push({ name: s.name, id: s.id, scale: 3, get: d => dyVal(s, d, by) }); });
  const facs = [["sleep", "", "сон 6 часов и меньше", 0], ...dyFactors()];
  const fv = (d, id) => { const x = days[d]; if (!x) return null; if (id === "sleep") return x.sleep ? x.sleep <= 6 : null; return x.f ? !!x.f[id] : null; };
  const avg = a => a.reduce((s, v) => s + v, 0) / a.length;
  const vari = (a, m) => a.length > 1 ? a.reduce((s, v) => s + (v - m) ** 2, 0) / (a.length - 1) : 0;
  const best = new Map();
  for (const o of outs) for (const [fid, , phrase, later] of facs) for (const lag of later && !o.mood ? [0, 1] : [0]) {
    const on = [], off = [];
    for (const d of dates) {
      const f = fv(d, fid); if (f == null) continue;
      const y = o.get(lag ? addDaysISO(d, 1) : d); if (y == null) continue;
      (f ? on : off).push(y);
    }
    if (on.length < DY_MIN || off.length < DY_MIN) continue;
    const a = avg(on), b = avg(off), se = Math.sqrt(vari(on, a) / on.length + vari(off, b) / off.length);
    const r = { o, phrase, lag, a, b, na: on.length, nb: off.length, diff: a - b, w: Math.abs(a - b) / o.scale, t: se ? Math.abs(a - b) / se : a !== b ? 9 : 0 };
    const key = (o.id || "mood") + "|" + fid, prev = best.get(key);
    if (!prev || r.t > prev.t) best.set(key, r);
  }
  return [...best.values()].filter(r => r.w >= 0.12 && r.t >= 2.5).sort((x, y) => y.t - x.t).slice(0, 12);
}
// four weeks side by side: the overall state on top, complaints below
function dyGrid() {
  const today = todayISO(), from = addDaysISO(today, -(DY_GRID - 1)), days = Array.from({ length: DY_GRID }, (_, i) => addDaysISO(from, i));
  const cell = (cls, d, txt) => `<i class="${cls}${d === today ? " now" : ""}" title="${fmtDate(d)}${txt ? " · " + txt : ""}"></i>`;
  const rows = [];
  const moods = days.map(d => state.days?.[d]?.mood || 0);
  if (moods.some(Boolean)) rows.push({ name: "Самочувствие", cells: moods.map((m, i) => cell(m ? "m" + m : "", days[i], m ? DY_MOOD_NAME[m].toLowerCase() : "")) });
  for (const s of syList().filter(x => !syPast(x)).sort(syOrder)) {
    const by = syDays(s), vals = days.map(d => dyVal(s, d, by));
    if (!vals.some(v => v != null)) continue;
    rows.push({ id: s.id, name: s.name, cells: vals.map((v, i) => cell(v == null ? "" : v ? "s" + v : "s0", days[i], v == null ? "" : v ? SY_SEV_NAME[v].toLowerCase() : "нет")) });
  }
  if (!rows.length) return "";
  return `<section class="card sy-diary" aria-label="Четыре недели">
    <div class="sy-thead"><div><h3>Четыре недели</h3><p>Клетка — день. Сверху самочувствие, ниже жалобы: видно, что приходит вместе.</p></div></div>
    <div class="sy-grid">${rows.map(r => `${r.id ? `<button type="button" class="sy-gname" data-sy="${esc(r.id)}">${esc(r.name)}</button>` : `<span class="sy-gname">${esc(r.name)}</span>`}<div class="sy-gcells">${r.cells.join("")}</div>`).join("")}
      <span class="sy-gpad"></span><div class="sy-gaxis"><span>${fmtDate(from)}</span><span>сегодня</span></div></div>
  </section>`;
}
function dyLinksTab() {
  const n = dyCount(), grid = dyGrid();
  if (n < DY_FIRST) {
    return `<section class="card dy-links"><h3>Связи появятся после недели записей</h3>
      <p>Записано ${n} ${plural(n, "день", "дня", "дней")} из ${DY_GOAL}. Сравнивать можно, когда есть дни и с каждым фактором, и без него, — поэтому отмечай день, даже если «ничего из этого».</p>
      <div class="g-bar dy-prog"><i style="width:${Math.round(n / DY_GOAL * 100)}%"></i></div></section>${grid}`;
  }
  const list = dyLinks();
  const item = r => {
    const worse = r.o.mood ? r.diff < 0 : r.diff > 0;
    const what = r.o.mood ? `самочувствие ${r.diff > 0 ? "лучше" : "хуже"}` : `«${esc(r.o.name)}» ${r.diff > 0 ? "сильнее" : "слабее"}`;
    return `<div class="dy-link${worse ? " worse" : ""}"><div class="dy-lt"><b>${esc(dyCap(r.phrase))}</b> → ${what}${r.lag ? " на следующий день" : ""}</div>
      <div class="dy-lbar"><i style="width:${Math.min(100, Math.round(r.w * 250))}%"></i></div>
      <small>${r.t >= 3.5 ? "Чёткая связь" : "Есть связь"} · в среднем ${dyNum(r.a)} против ${dyNum(r.b)} ${r.o.mood ? "из 5" : "по шкале 0–3"} · дней с этим ${r.na}, без — ${r.nb}</small></div>`;
  };
  return `<section class="card dy-links"><h3>Что связано с самочувствием</h3>
      <p>По ${n} ${plural(n, "записанному дню", "записанным дням", "записанным дням")}${n < DY_GOAL ? " — пока предварительно" : ""}: в какие дни становится лучше или хуже.</p>
      ${list.length ? list.map(item).join("") : `<p>Явных связей пока не видно. Продолжай записывать — чем больше дней, тем точнее.</p>`}
      <p class="dy-caveat">Это совпадения в твоих записях, а не доказанная причина. Покажи их врачу — вместе с ним проще понять, что за ними стоит.</p>
    </section>${grid}`;
}

/* ---------- wiring ---------- */
function initDiary() {
  const page = $("#symptomsView");
  const day = () => ui.dayDate && ui.dayDate <= todayISO() ? ui.dayDate : todayISO();
  const redraw = d => { if (d) dyTidy(d); save(); renderSymptoms(); };
  page.addEventListener("click", e => {
    const t = e.target;
    const pg = t.closest("[data-sy-page]"); if (pg) { ui.syPage = pg.dataset.syPage; renderSymptoms(); return; }
    const go = t.closest("[data-dy-go]");
    if (go) { const d = addDaysISO(day(), +go.dataset.dyGo); if (d <= todayISO()) { ui.dayDate = d; renderSymptoms(); } return; }
    const dd = t.closest("[data-dy-day]");
    if (dd) { ui.dayDate = dd.dataset.dyDay; ui.syPage = "diary"; renderSymptoms(); $(".dy-nav")?.scrollIntoView({ behavior: "smooth", block: "start" }); return; }
    const d = day();
    const mo = t.closest("[data-dy-mood]");
    if (mo) { const x = dyDay(d), k = +mo.dataset.dyMood; if (x.mood === k) delete x.mood; else x.mood = k; redraw(d); return; }
    const sl = t.closest("[data-dy-sleep]");
    if (sl) { const x = dyDay(d), k = +sl.dataset.dySleep; if (x.sleep === k) delete x.sleep; else x.sleep = k; redraw(d); return; }
    const f = t.closest("[data-dy-f]");
    if (f) { const x = dyDay(d), k = f.dataset.dyF; x.f = { ...(x.f || {}), [k]: !x.f?.[k] }; redraw(d); return; }
    // "nothing of this": the day still counts as a day without every factor
    if (t.closest("[data-dy-none]")) { const x = dyDay(d), none = !!x.f && !Object.values(x.f).some(Boolean); if (none) delete x.f; else x.f = {}; redraw(d); return; }
    const sy = t.closest("[data-dy-sy]");
    if (sy) {
      const [id, k] = sy.dataset.dySy.split("|"), s = syList().find(x => x.id === id); if (!s) return;
      dyMark(id, d, dyVal(s, d) === +k ? null : +k); redraw(d); return;
    }
    if (t.closest("[data-dy-fadd]")) { const fm = $("[data-dy-faddf]"); fm.hidden = !fm.hidden; if (!fm.hidden) $("input", fm).focus(); return; }
    if (t.closest(".dy-more > summary")) { ui.dyMore = !t.closest("details").open; return; }
  });
  page.addEventListener("submit", e => {
    if (!e.target.matches("[data-dy-faddf]")) return;
    e.preventDefault();
    const name = String(new FormData(e.target).get("name") || "").trim(); if (!name) return;
    state.prefs ||= {};
    if (!dyFactors().some(([, n]) => norm(n) === norm(name))) state.prefs.dayFactors = [...(state.prefs.dayFactors || []), { id: newId("f"), name }];
    redraw(); toast(`Добавлено: ${name}`);
  });
  page.addEventListener("input", e => {
    if (!e.target.matches("[data-dy-note]")) return;
    const d = day(), v = e.target.value;
    if (v.trim()) dyDay(d).note = v; else if (state.days?.[d]) { delete state.days[d].note; dyTidy(d); }
    syGrow(e.target); save();
  });
}
