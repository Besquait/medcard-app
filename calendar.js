// Calendar: the daily home screen. What to take now comes first (the current time of day), taken doses fold
// into one line, the other times of day are collapsed rows. Below, the end of the day: sleep, overall state,
// main complaints at their worst moment, what happened, a note. The side column is for looking, not filling:
// the month, the running check ("one change for two weeks — did it help?"), whether the treatment works,
// the last seven days. "Сейчас плохо" writes an episode with what came before it.
// Medicines come from running treatment schemes, each on the days between its start and end.
// Loaded before app.js: definitions only; initCalendar() wires the UI.
"use strict";

const CL_SLOTS = [["morning", "Утро"], ["day", "День"], ["evening", "Вечер"], ["night", "На ночь"], ["any", "В течение дня"]];
const CL_FOOD = { before: "до еды", with: "во время еды", after: "после еды", any: "" };
const CL_WD = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
const CL_MONTHS = ["Январь", "Февраль", "Март", "Апрель", "Май", "Июнь", "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь"];
const CL_NOW = { morning: "Сейчас утро", day: "Сейчас день", evening: "Сейчас вечер", night: "Пора спать" };
const CL_WHEN = { morning: "утром", day: "днём", evening: "вечером", night: "на ночь", any: "" };
const CL_ORDER = CL_SLOTS.map(([k]) => k);
const clSvg = p => `<svg class="cl-ico" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${p}</svg>`;
const CL_ICON = {
  morning: clSvg('<path d="M3 18h18M7 18a5 5 0 0 1 10 0M12 4v4M9.5 6.5 12 4l2.5 2.5M4.9 11.9l1.4 1M19.1 11.9l-1.4 1"/>'),
  day: clSvg('<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4"/>'),
  evening: clSvg('<path d="M3 18h18M7 18a5 5 0 0 1 10 0M12 8V4M9.5 5.5 12 8l2.5-2.5M4.9 11.9l1.4 1M19.1 11.9l-1.4 1"/>'),
  night: clSvg('<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/>'),
  any: clSvg('<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>'),
  prn: clSvg('<rect x="3.5" y="8" width="17" height="8" rx="4"/><path d="M12 8v8"/>'),
};
// a check: one change for a while, then the main complaints against the three weeks before it
const CL_BASE = 21;
const CL_IDEAS = [
  ["Ужин за 3 часа до сна", "Поздняя еда усиливает ночной заброс кислоты — это видно по замерам pH."],
  ["Изголовье выше на 15–20 см", "Бруски под ножки кровати или клин под матрас. Одно из самых доказанных средств при ночном рефлюксе."],
  ["Не ложиться 2–3 часа после еды", "Лёжа кислоте проще подняться в пищевод."],
  ["Небольшие порции, без переедания", "Переполненный желудок давит на клапан пищевода."],
  ["Без жирного и жареного", "У одних это главный триггер, у других нет — поэтому стоит проверить на себе."],
  ["Без кофе", "Доказательства слабые и у всех по-разному — как раз то, что проверяют лично."],
  ["Промывание носа утром и вечером", "Для слизи, стекающей из носа в горло."],
];
const CL_VERDICT = { better: "помогает", worse: "хуже", same: "без разницы", few: "мало данных" };
const CL_VERDICT_LONG = {
  better: "Похоже, помогает — жалобы стали слабее",
  worse: "Похоже, стало хуже",
  same: "Разницы не видно",
  few: "Пока мало данных: нужно хотя бы 4 записанных дня до начала и 4 дня, когда соблюдал",
};
// what came before an episode; the ones that are also day factors get ticked in the day
const CL_BEFORE = [["fatty", "Жирное или острое"], ["big", "Переел"], ["lay", "Лёг после еды"], ["late", "Поздно ел"], ["acid", "Кислое"], ["coffee", "Кофе"], ["stress", "Стресс, нервы"], ["none", "Ничего особенного"]];

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
// the first day anything was ticked: earlier days are not "missed", tracking had not started yet
const clStart = () => Object.keys(state.days || {}).filter(d => state.days[d].meds || state.days[d].prn).sort()[0] || todayISO();
function clDone(d) { const { sched } = clMeds(d), m = state.days?.[d]?.meds || {}; return { n: sched.length, k: sched.filter(x => m[x.key]).length }; }
// minutes asleep from "went to bed" (the evening before) to "got up"
function clSleepMin(x) {
  if (!x?.bed || !x?.wake) return null;
  const [bh, bm] = x.bed.split(":").map(Number), [wh, wm] = x.wake.split(":").map(Number);
  let m = wh * 60 + wm - (bh * 60 + bm); if (m <= 0) m += 1440;
  return m;
}
// the hours also feed the links: 6 h and less counts as short sleep
function clSleepSet(x) {
  const m = clSleepMin(x);
  if (m) x.sleep = m <= 330 ? 5 : m < 390 ? 6 : m < 450 ? 7 : 8; else if (!x.bed && !x.wake) delete x.sleep;
}
// a drug with a set course: doses ticked from its start up to today against all doses of the course
function clCourse(g, id) {
  const slots = g.slots?.length ? g.slots : [];
  if (g.prn || !g.start || !g.end || !slots.length) return null;
  const n = slots.length * (daysBetween(g.start, g.end) + 1), stop = [g.end, todayISO()].sort()[0];
  let k = 0;
  for (let d = g.start; d <= stop; d = addDaysISO(d, 1)) { const m = state.days?.[d]?.meds; if (m) k += slots.filter(sl => m[`${id}:${sl}`]).length; }
  return { k, n };
}
const clCourseTag = (g, id) => { const c = clCourse(g, id); return c ? `<span class="cl-course" title="Принято за курс: ${c.k} из ${c.n}">${c.k}/${c.n}</span>` : ""; };
const clHours = m => `${Math.floor(m / 60)} ч${m % 60 ? ` ${m % 60} мин` : ""}`;
const clSub = g => [g.dose, CL_FOOD[g.food] || "", g.how].filter(Boolean).join(" · ");
const clNowSlot = () => { const h = new Date().getHours(); return h < 4 || h >= 21 ? "night" : h >= 17 ? "evening" : h >= 12 ? "day" : "morning"; };
const clDayName = d => { const t = todayISO(); return d === t ? "Сегодня" : d === addDaysISO(t, -1) ? "Вчера" : dyCap(DY_WEEKDAY[new Date(d + "T00:00:00").getDay()]); };
const clHM = () => { const n = new Date(); return `${String(n.getHours()).padStart(2, "0")}:${String(n.getMinutes()).padStart(2, "0")}`; };
function clMain() {
  const cur = syList().filter(s => !syPast(s));
  return { main: cur.filter(s => s.main).sort(syByWeight), rest: cur.filter(s => !s.main).sort(syOrder) };
}
const clAvg = a => a.reduce((s, v) => s + v, 0) / a.length;
// an arrow class for "0–3 strength went from a to b"
const clMove = (a, b) => b < a - 0.3 ? "down" : b > a + 0.3 ? "up" : "";

/* ---------- checks ---------- */
const clExps = () => state.prefs?.exps || [];
const clExpEnd = e => e.stop || addDaysISO(e.start, e.days - 1);
const clExpOn = d => clExps().find(e => e.start <= d && d <= clExpEnd(e));
const clExpSy = e => (e.sy?.length ? e.sy : clMain().main.map(s => s.id)).map(id => state.symptoms?.[id]).filter(Boolean);
// days the change was kept against the three weeks before the start, per complaint
function clExpResult(e) {
  const today = todayISO(), end = [clExpEnd(e), today].sort()[0], days = state.days || {};
  let kept = 0, missed = 0;
  for (let d = e.start; d <= end; d = addDaysISO(d, 1)) { const v = days[d]?.x?.[e.id]; if (v === 1) kept++; else if (v === 0) missed++; }
  const rows = clExpSy(e).map(s => {
    const by = syDays(s), before = [], during = [];
    for (let i = CL_BASE; i >= 1; i--) { const v = dyVal(s, addDaysISO(e.start, -i), by); if (v != null) before.push(v); }
    for (let d = e.start; d <= end; d = addDaysISO(d, 1)) if (days[d]?.x?.[e.id] === 1) { const v = dyVal(s, d, by); if (v != null) during.push(v); }
    const ok = before.length >= 4 && during.length >= 4, a = ok ? clAvg(before) : 0, b = ok ? clAvg(during) : 0;
    return { s, ok, a, b, v: !ok ? "few" : b - a <= -0.4 ? "better" : b - a >= 0.4 ? "worse" : "same" };
  });
  // a scheme started in the same window muddles the answer
  const from = addDaysISO(e.start, -CL_BASE);
  const mixed = tpList().filter(p => { const st = tpStart(p); return st && st > from && st <= end; });
  const sure = rows.filter(r => r.ok), up = sure.filter(r => r.v === "better").length, down = sure.filter(r => r.v === "worse").length;
  return { rows, kept, missed, end, mixed, live: today <= clExpEnd(e), verdict: !sure.length ? "few" : up > down ? "better" : down > up ? "worse" : "same" };
}

/* ---------- page ---------- */
function renderCalendar() {
  const box = $("#calendarView"); if (!box || box.hidden) return;
  const today = todayISO(), sel = clSel(), x = state.days?.[sel] || {};
  // in the morning an empty night comes first: it is the one thing to fill right after waking up
  const sleepFirst = sel === today && new Date().getHours() < 12 && !(x.bed && x.wake);
  morph(box, `${clTop(sel)}
    <div class="cl-layout">
      <div class="cl-main">
        <div class="cl-mob">${clStrip(sel, today, false)}</div>
        ${clBanner(sel)}
        ${sleepFirst ? clSleepCard(sel, true) : ""}
        ${clMedsBlock(sel)}
        ${clDayCard(sel, !sleepFirst)}
      </div>
      <aside class="cl-side">
        <div class="cl-desk">${clStrip(sel, today, true)}</div>
        ${clExpCard()}
        ${clCureCard()}
        ${clWeekCard()}
        <button type="button" class="cl-remind" data-cl-remind>${CL_ICON.any}<span>Напоминать каждый вечер в 21:30</span></button>
      </aside>
    </div>`);
  $$("#calendarView .sy-grow").forEach(syGrow);
}
function clRing(k, n) {
  const C = 188.5, p = n ? k / n : 0;
  return `<span class="cl-ring${k === n ? " ok" : ""}"><svg width="72" height="72" viewBox="0 0 72 72" aria-hidden="true"><circle cx="36" cy="36" r="30" class="tr"/><circle cx="36" cy="36" r="30" class="fg" style="stroke-dasharray: ${(C * p).toFixed(1)} ${C}; opacity: ${p ? 1 : 0}"/></svg><b>${k}/${n}</b></span>`;
}
function clTop(sel) {
  const today = todayISO(), isT = sel === today, c = clDone(sel), name = clDayName(sel);
  const date = isT || sel === addDaysISO(today, -1) ? `${dyCap(DY_WEEKDAY[new Date(sel + "T00:00:00").getDay()])}, ${longDate(sel).replace(/ \d{4}$/, "")}` : longDate(sel);
  let now = "";
  if (c.n) {
    const { sched } = clMeds(sel), m = state.days?.[sel]?.meds || {}, slot = clNowSlot();
    const left = c.n - c.k, leftNow = sched.filter(it => it.slot === slot && !m[it.key]).length;
    const title = !isT ? `Принято ${c.k} из ${c.n}` : left ? CL_NOW[slot] : "Всё принято";
    const sub = !isT ? (left ? `не отмечено ${left}` : "все лекарства отмечены")
      : !left ? "на сегодня с лекарствами всё"
      : leftNow ? `Осталось ${leftNow} ${plural(leftNow, "лекарство", "лекарства", "лекарств")} ${CL_WHEN[slot]} · ${left} за день` : `Осталось ${left} за день`;
    now = `<div class="cl-now">${clRing(c.k, c.n)}<div class="cl-now-t"><b>${title}</b><span>${sub}</span></div></div>`;
  }
  return `<div class="cl-top"><div><p class="cl-date">${esc(date)}</p><h2 class="cl-big">${esc(name)}</h2>
      ${isT ? "" : `<button type="button" class="cl-back" data-cl-day="${today}">← к сегодняшнему дню</button>`}</div>
    <div class="cl-topr">${now}${isT ? `<button type="button" class="btn cl-badbtn" data-cl-bad>Сейчас плохо</button>` : ""}</div></div>`;
}
// yesterday is still remembered well; older days are better left empty than filled from memory
function clBanner(sel) {
  const today = todayISO(); if (sel !== today) return "";
  const y = addDaysISO(today, -1), x = state.days?.[y];
  if (x?.mood || (x?.sy && Object.keys(x.sy).length)) return "";
  if (!Object.keys(state.days || {}).some(d => d < y && dyHas(state.days[d]))) return "";
  return `<div class="cl-banner"><span>Вчерашний день не записан. Пока помнишь — это полминуты.</span><button type="button" class="btn sm" data-cl-day="${y}">Заполнить вчера</button></div>`;
}
// a week on phones, the month on wide screens; each day: the medicine bar and the colour of the day
function clStrip(sel, today, wide) {
  const month = ui.clMonth ?? wide;
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
  const start = clStart();
  const cell = d => {
    const fut = d > today, other = month && d.slice(5, 7) !== sel.slice(5, 7), x = state.days?.[d], c = clDone(d);
    const pill = !c.n || fut || d < start ? "" : c.k === c.n ? "ok" : c.k ? "part" : d < today ? "miss" : "todo";
    return `<button type="button" class="cl-day${d === sel ? " on" : ""}${d === today ? " now" : ""}${other ? " other" : ""}" data-cl-day="${d}"${fut ? " disabled" : ""}>
      <b>${+d.slice(8)}</b><span class="cl-marks">${pill ? `<i class="cl-pill ${pill}" title="Лекарства: ${c.k} из ${c.n}"></i>` : ""}${x?.mood ? `<i class="dy-dot m${x.mood}"></i>` : ""}</span></button>`;
  };
  return `<section class="card cl-strip">
    <div class="cl-nav"><b>${title}</b>
      <button type="button" class="icon-btn" data-cl-go="-1" aria-label="Назад">‹</button>
      <button type="button" class="icon-btn" data-cl-go="1" aria-label="Вперёд">›</button>
      <button type="button" class="btn sm ghost" data-cl-mode="${month ? 1 : 0}">${month ? "Неделя" : "Месяц"}</button></div>
    <div class="cl-grid">${CL_WD.map(w => `<span class="cl-wd">${w}</span>`).join("")}${days.map(cell).join("")}</div>
    <div class="cl-legend"><span><i class="cl-pill ok"></i>всё принято</span><span><i class="cl-pill part"></i>не всё</span><span><i class="dy-dot m4"></i>самочувствие</span></div>
  </section>`;
}
function clMedsBlock(d) {
  const { sched, prn } = clMeds(d), x = state.days?.[d] || {}, m = x.meds || {};
  if (!sched.length && !prn.length) return `<section class="card cl-card"><h3 class="cl-h3">Лекарства</h3><p class="cl-muted">На этот день нет препаратов из схем. Добавь схему в «Лечение» — и здесь появится, что принять.</p></section>`;
  const isT = d === todayISO(), now = clNowSlot();
  const groups = CL_SLOTS.map(([k, n]) => ({ k, n, l: sched.filter(it => it.slot === k) })).filter(g => g.l.length);
  const leftOf = g => g.l.filter(it => !m[it.key]);
  // today: the current time of day first; when it is done, the next one that still has something left
  let focus = null;
  if (isT) {
    const ahead = groups.filter(g => g.k === "any" || CL_ORDER.indexOf(g.k) >= CL_ORDER.indexOf(now));
    focus = ahead.find(g => g.k === now && leftOf(g).length) || ahead.find(g => g.k !== "any" && leftOf(g).length) || groups.find(g => g.k === now) || null;
  }
  const tile = it => `<button type="button" class="cl-tile" data-cl-med="${esc(it.key)}" aria-pressed="false"><span class="cl-mn"><b>${esc(it.g.name)}${clCourseTag(it.g, it.id)}</b>${clSub(it.g) ? `<small>${esc(clSub(it.g))}</small>` : ""}</span><i class="cl-tick" aria-hidden="true"></i></button>`;
  const body = g => {
    const left = leftOf(g), done = g.l.filter(it => m[it.key]);
    return `${left.length ? `<div class="cl-tiles">${left.map(tile).join("")}</div>` : ""}
      <div class="cl-foot">${done.length ? `<div class="cl-taken"><span class="cl-chk">✓</span><span>${left.length ? "Принято:" : "Всё принято:"}</span>${done.map(it => `<button type="button" class="cl-tk" data-cl-med="${esc(it.key)}" title="Снять отметку">${esc(it.g.name)}${clCourseTag(it.g, it.id)}</button>`).join("")}</div>` : "<span></span>"}
      ${left.length > 1 ? `<button type="button" class="btn primary cl-allbtn" data-cl-all="${g.k}">✓ Принял всё</button>` : ""}</div>`;
  };
  const rest = groups.filter(g => g !== focus);
  const open = k => !isT || !!ui.clOpen?.[k];
  const late = g => isT && g.k !== "any" && CL_ORDER.indexOf(g.k) < CL_ORDER.indexOf(now);
  const row = g => {
    const left = leftOf(g).length, o = open(g.k);
    return `<div class="cl-rowwrap${o ? " open" : ""}"><button type="button" class="cl-row" data-cl-open="${g.k}" aria-expanded="${o}">${CL_ICON[g.k]}
      <span class="cl-rn"><b>${g.n}</b><small>${left ? `${g.l.length - left} из ${g.l.length}${late(g) ? `<i class="cl-warn" title="Не отмечено"></i>` : ""}` : "всё принято ✓"}</small></span>
      <span class="cl-names">${esc(g.l.map(it => it.g.name).join(", "))}</span>
      <svg class="chev" width="18" height="18" viewBox="0 0 20 20" aria-hidden="true"><path d="M5 8l5 5 5-5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
      ${o ? `<div class="cl-rowbody">${body(g)}</div>` : ""}</div>`;
  };
  const prnRow = prn.length ? `<div class="cl-rowwrap"><div class="cl-row cl-prnrow">${CL_ICON.prn}<span class="cl-rn"><b>По необходимости</b><small>когда нужно</small></span>
      <div class="cl-prns">${prn.map(it => { const k = x.prn?.[it.id] || 0; return `<span class="cl-prn1"><span>${esc(it.g.name)}</span>${k ? `<button type="button" class="icon-btn sm" data-cl-prn="${esc(it.id)}|-1" aria-label="Убрать приём">−</button><b class="cl-n">${k}</b>` : ""}<button type="button" class="btn sm" data-cl-prn="${esc(it.id)}|1">${k ? "+1" : "Принял"}</button></span>`; }).join("")}</div></div></div>` : "";
  const left = focus ? leftOf(focus).length : 0;
  return `<h3 class="cl-sec">Лекарства</h3>
    ${focus ? `<section class="card cl-card cl-focus"><div class="cl-slothead">${CL_ICON[focus.k]}<h4>${focus.n}</h4>${focus.k === now ? `<span class="cl-pnow">сейчас</span>` : ""}
      <span class="cl-left">${left ? `осталось ${left} из ${focus.l.length}` : "всё принято"}</span></div>${body(focus)}</section>` : ""}
    ${rest.length || prnRow ? `<section class="card cl-rows">${rest.map(row).join("")}${prnRow}</section>` : ""}`;
}
// the night: the core of the Consensus Sleep Diary (bed and rise time, how long to fall asleep, awakenings,
// quality) plus how rested in the morning and what woke you — reflux, cough and mucus wake people with GERD
const CL_LAT = [[1, "до 15 мин", "g0"], [2, "15–30 мин", "g1"], [3, "30–60 мин", "g2"], [4, "больше часа", "g3"]];
const CL_WK = [[0, "ни разу", "g0"], [1, "1 раз", "g1"], [2, "2 раза", "g2"], [3, "3 и больше", "g3"]];
const CL_SQ = [[1, "Очень плохо"], [2, "Плохо"], [3, "Средне"], [4, "Хорошо"], [5, "Отлично"]];
const CL_REST = [[1, "Разбитый", "g3"], [2, "Так себе", "g2"], [3, "Отдохнувший", "g0"]];
// on waking: together with a morning headache these are worth showing a doctor (sleep breathing, bruxism, reflux)
const CL_AM = [["dry", "Сухость во рту"], ["bitter", "Горечь, кислый вкус"], ["jaw", "Челюсть сжата, устала"]];
const CL_WHY = [["reflux", "Изжога, кислота"], ["cough", "Кашель, слизь"], ["dry", "Сухость во рту"], ["toilet", "Туалет"], ["ears", "Шум в ушах"], ["other", "Без причины"]];
// day factors in groups, so the chips do not pile up
const CL_FGROUPS = [["Еда", ["fatty", "acid", "big", "late", "lay", "coffee", "flax"]], ["Режим", ["stress", "screen", "move", "sick"]]];
const clSeg = (attr, list, val, cls = "") => `<div class="seg2 ${cls}" role="group">${list.map(([k, n, c]) => `<button type="button" class="${c || ""}" ${attr}="${k}" aria-pressed="${val === k}">${n}</button>`).join("")}</div>`;
const clHead = (tone, icon, title, sub, right) => `<div class="cl-bh"><span class="cl-bi ${tone}">${icon}</span><div class="cl-bt"><h4>${title}</h4>${sub ? `<small>${sub}</small>` : ""}</div>${right ? `<div class="cl-br">${right}</div>` : ""}</div>`;
const CL_I = {
  mood: clSvg('<circle cx="12" cy="12" r="8.5"/><path d="M8.5 14c.9 1.2 2.1 1.8 3.5 1.8s2.6-.6 3.5-1.8M9 9.5h.01M15 9.5h.01"/>'),
  sy: clSvg('<path d="M3 12h4l2-5 4 10 2-5h6"/>'),
  fac: clSvg('<path d="M4 7h10M4 12h16M4 17h7"/><circle cx="17" cy="7" r="2"/><circle cx="14" cy="17" r="2"/>'),
  note: clSvg('<path d="M5 4h10l4 4v12H5z"/><path d="M9 12h6M9 16h4"/>'),
  exp: clSvg('<path d="M9 3h6M10 3v6l-5 9a2 2 0 0 0 1.7 3h10.6a2 2 0 0 0 1.7-3l-5-9V3"/>'),
};
// minutes between the last meal and going to bed
function clMealGap(d) {
  const x = state.days?.[d]; if (!x?.meal) return null;
  let bed = state.days?.[addDaysISO(d, 1)]?.bed;
  if (!bed) {
    // the usual bedtime of the last two weeks
    const bs = Array.from({ length: 14 }, (_, i) => state.days?.[addDaysISO(d, -i)]?.bed).filter(Boolean)
      .map(t => { const [h, m] = t.split(":").map(Number); return (h < 12 ? h + 24 : h) * 60 + m; }).sort((p, q) => p - q);
    if (!bs.length) return null;
    const v = bs[bs.length >> 1]; bed = `${String(Math.floor(v / 60) % 24).padStart(2, "0")}:${String(v % 60).padStart(2, "0")}`;
  }
  const [bh, bm] = bed.split(":").map(Number), [mh, mm] = x.meal.split(":").map(Number);
  return ((bh * 60 + bm) - (mh * 60 + mm) + 1440) % 1440;
}
function clSleepCard(d, first) {
  const x = state.days?.[d] || {}, m = clSleepMin(x), y = state.days?.[addDaysISO(d, -1)];
  const same = !x.bed && !x.wake && y?.bed && y?.wake;
  const night = `ночь на ${longDate(d).replace(/ \d{4}$/, "")}`;
  const right = m ? `<b class="cl-big2">${clHours(m)}</b>${x.sq ? `<span class="cl-q${x.sq}">${CL_SQ[x.sq - 1][1].toLowerCase()}</span>` : ""}` : "";
  const row = (label, ctl, hint) => `<div class="cl-f"><div class="cl-fl">${label}${hint ? `<small>${hint}</small>` : ""}</div>${ctl}</div>`;
  return `<section class="card cl-box t-sleep">${clHead("t-sleep", CL_ICON.night, first ? "Как спал?" : "Сон", night, right)}
    ${row("Лёг и встал", `<div class="cl-sl"><input class="input" type="time" data-cl-bed value="${esc(x.bed || "")}" aria-label="Лёг"><span class="cl-arrow" aria-hidden="true">→</span><input class="input" type="time" data-cl-wake value="${esc(x.wake || "")}" aria-label="Встал">
      ${same ? `<button type="button" class="tchip cl-same" data-cl-same>как вчера · ${esc(y.bed)} → ${esc(y.wake)}</button>` : ""}</div>`)}
    ${row("Заснул за", clSeg("data-cl-lat", CL_LAT, x.lat))}
    ${row("Просыпался", clSeg("data-cl-wk", CL_WK, x.wk))}
    ${x.wk > 0 ? row("Что будило", `<div class="tchips cl-why">${CL_WHY.map(([k, n]) => `<button type="button" class="tchip" data-cl-why="${k}" aria-pressed="${!!x.why?.[k]}">${n}</button>`).join("")}</div>`, "можно несколько") : ""}
    ${row("Как спалось", clSeg("data-cl-sq", CL_SQ.map(([k, n]) => [k, n, "m" + k]), x.sq, "dots"))}
    ${row("Утром", clSeg("data-cl-rest", CL_REST, x.rest))}
    ${row("Голова утром", clSeg("data-cl-amh", [[0, "Нет", "s0"], ...SY_SEV.map(([k, n]) => [k, n, "s" + k])], x.amh))}
    ${row("При пробуждении", `<div class="tchips cl-why">${CL_AM.map(([k, n]) => `<button type="button" class="tchip" data-cl-am="${k}" aria-pressed="${!!x.am?.[k]}">${n}</button>`).join("")}</div>`, "если было")}
  </section>`;
}
function clDayCard(d, withSleep) {
  const x = state.days?.[d] || {}, { main, rest } = clMain(), e = clExpOn(d);
  const syRow = s => { const v = dyVal(s, d); return `<div class="cl-syr"><span class="cl-syn"><i class="cl-sdot${v != null ? " s" + v : ""}"></i>${esc(s.name)}</span>
    ${clSeg("data-dy-sy", [[0, "Нет", "s0"], ...SY_SEV.map(([k, n]) => [k, n, "s" + k])].map(([k, n, c]) => [`${s.id}|${k}`, n, c]), v == null ? null : `${s.id}|${v}`, "sev")}</div>`; };
  const marked = main.filter(s => dyVal(s, d) != null).length, restMarked = rest.filter(s => dyVal(s, d) != null).length;
  const filled = !!x.mood && (main.length ? main.every(s => dyVal(s, d) != null) : true);
  const facs = dyFactors(), name = Object.fromEntries(facs.map(([k, n]) => [k, n]));
  const grouped = new Set(CL_FGROUPS.flatMap(([, l]) => l)), own = facs.filter(([k]) => !grouped.has(k));
  const chip = k => `<button type="button" class="tchip" data-dy-f="${esc(k)}" aria-pressed="${!!x.f?.[k]}">${esc(name[k])}</button>`;
  const fCount = Object.values(x.f || {}).filter(Boolean).length;
  const gap = clMealGap(d);
  return `<h3 class="cl-sec">Итог дня${filled ? `<span class="cl-okline">✓ записан</span>` : ""}</h3>
    <p class="cl-hint">Отмечай вечером, как было <b>в худший момент</b> дня. Всё сохраняется само.</p>
    ${e ? `<section class="card cl-box t-acc">${clHead("t-acc", CL_I.exp, `Проверяю: ${esc(e.title)}`, `день ${daysBetween(e.start, d) + 1} из ${e.days}`)}
      ${clSeg("data-cl-x", [[`${e.id}|1`, "Соблюдал", "g0"], [`${e.id}|0`, "Не вышло", "g2"]], x.x?.[e.id] == null ? null : `${e.id}|${x.x[e.id]}`, "yn")}</section>` : ""}
    ${withSleep ? clSleepCard(d) : ""}
    <section class="card cl-box t-ok">${clHead("t-ok", CL_I.mood, "Самочувствие", "в целом за день", x.mood ? `<span class="cl-pillv m${x.mood}">${esc(DY_MOOD_NAME[x.mood])}</span>` : "")}
      ${clSeg("data-dy-mood", DY_MOOD.map(([k, n]) => [k, n, "m" + k]), x.mood, "dots big")}</section>
    ${main.length || rest.length ? `<section class="card cl-box t-edge">${clHead("t-edge", CL_I.sy, main.length ? "Главные жалобы" : "Жалобы", "как было в худший момент", main.length ? `<span class="cl-cnt">${marked} из ${main.length}</span>` : "")}
      <p class="cl-scale"><b>Слабо</b> — заметно, но не мешает · <b>Заметно</b> — мешает делам или сну · <b>Сильно</b> — пришлось что-то делать или принять средство</p>
      <div class="cl-sys">${main.map(syRow).join("")}</div>
      ${rest.length ? `<details class="dy-more cl-more2"${ui.dyMore || !main.length ? " open" : ""}><summary>${main.length ? "Остальные жалобы" : "Все жалобы"} · ${rest.length}${restMarked ? `, отмечено ${restMarked}` : ""}</summary><div class="cl-sys">${rest.map(syRow).join("")}</div></details>` : ""}</section>` : ""}
    ${typeof fdDayCard === "function" ? fdDayCard(d) : ""}
    <section class="card cl-box t-low">${clHead("t-low", CL_I.fac, "Что было", "только то, что могло повлиять", fCount ? `<span class="cl-cnt">${fCount}</span>` : "")}
      ${CL_FGROUPS.map(([g, l]) => `<div class="cl-fg"><span class="cl-fgn">${g}</span><div class="tchips">${l.filter(k => name[k]).map(chip).join("")}
        ${g === "Еда" ? `<label class="cl-meal${gap != null && gap < 180 ? " late" : ""}"><span>Последняя еда</span><input class="input" type="time" data-cl-meal value="${esc(x.meal || "")}">${gap != null ? `<em>за ${clHours(gap)} до сна</em>` : ""}</label>` : ""}</div></div>`).join("")}
      <div class="cl-fg"><span class="cl-fgn">Своё</span><div class="tchips">${own.map(([k]) => chip(k)).join("")}
        <button type="button" class="tchip dy-add" data-dy-fadd>+ Добавить</button>
        <button type="button" class="tchip dy-none" data-dy-none aria-pressed="${!!x.f && !Object.values(x.f).some(Boolean)}">Ничего из этого</button></div></div>
      <form class="sy-addf" data-dy-faddf hidden><input class="input" name="name" placeholder="Например: энергетик, тренировка" autocomplete="off"><button type="submit" class="btn">Добавить</button></form></section>
    <section class="card cl-box t-mute">${clHead("t-mute", CL_I.note, "Заметка", "по желанию")}
      <textarea class="input sy-grow dy-note" data-dy-note rows="2" placeholder="Почему так, что ещё было">${esc(x.note || "")}</textarea></section>`;
}

/* ---------- side column ---------- */
function clExpCard() {
  const today = todayISO(), all = clExps(), cur = all.find(e => e.start <= today && today <= clExpEnd(e)), past = all.filter(e => clExpEnd(e) < today);
  let body;
  if (cur) {
    const n = daysBetween(cur.start, today) + 1, r = clExpResult(cur);
    body = `<b class="cl-exp-t">${esc(cur.title)}</b><span class="cl-muted">день ${n} из ${cur.days} · соблюдал ${r.kept} ${plural(r.kept, "день", "дня", "дней")}</span>
      <span class="cl-bar"><i style="width:${Math.round(n / cur.days * 100)}%"></i></span>
      <button type="button" class="cl-link" data-cl-exp="${esc(cur.id)}">Промежуточный итог →</button>`;
  } else {
    body = `<p class="cl-muted">Меняешь одно на 2 недели — и сайт покажет, стало ли легче. Так находится то, что помогает именно тебе.</p>
      <button type="button" class="btn primary" data-cl-expnew>Начать проверку</button>`;
  }
  const list = past.length ? `<div class="cl-exp-past"><span class="cl-small cl-muted">Проверено</span>${past.slice().reverse().map(e => { const r = clExpResult(e); return `<button type="button" class="cl-exprow" data-cl-exp="${esc(e.id)}"><span>${esc(e.title)}</span><em class="v-${r.verdict}">${CL_VERDICT[r.verdict]}</em></button>`; }).join("")}</div>` : "";
  return `<section class="card cl-side-card"><h4>Проверка</h4>${body}${list}</section>`;
}
function clCureCard() {
  const today = todayISO(), act = tpList().filter(tpActive).filter(p => (p.sy || []).length && tpStart(p) && tpStart(p) <= today);
  if (!act.length) return "";
  return `<section class="card cl-side-card"><h4>Работает ли лечение</h4>${act.map(p => {
    const n = daysBetween(tpStart(p), today) + 1, rows = tpCompare(p);
    return `<button type="button" class="cl-cure" data-cl-plan="${esc(p.id)}"><b>${esc(p.title || "Схема лечения")}</b><span class="cl-muted">день ${n} · до и во время</span>
      ${rows.length ? rows.map(r => `<span class="cl-stat"><span>${esc(r.s.name)}</span><b class="${clMove(r.a, r.b)}">${dyNum(r.a)} → ${dyNum(r.b)}</b></span>`).join("")
        : `<span class="cl-muted cl-small">Сравнение появится, когда наберётся по 3 записанных дня до начала и во время.</span>`}</button>`;
  }).join("")}</section>`;
}
function clWeekCard() {
  const today = todayISO(), days = Array.from({ length: 7 }, (_, i) => addDaysISO(today, i - 6)), prev = days.map(d => addDaysISO(d, -7));
  const rec = days.filter(d => { const x = state.days?.[d]; return x?.mood || (x?.sy && Object.keys(x.sy).length); }).length;
  const st = clStart(); let n = 0, k = 0;
  days.filter(d => d >= st).forEach(d => { const c = clDone(d); n += c.n; k += c.k; });
  const rows = clMain().main.map(s => {
    const by = syDays(s), a = prev.map(d => dyVal(s, d, by)).filter(v => v != null), b = days.map(d => dyVal(s, d, by)).filter(v => v != null);
    return a.length >= 3 && b.length >= 3 ? { s, a: clAvg(a), b: clAvg(b) } : null;
  }).filter(Boolean);
  return `<section class="card cl-side-card"><h4>Последние 7 дней</h4>
    <div class="cl-stat"><span>Записано дней</span><b>${rec} из 7</b></div>
    ${n ? `<div class="cl-stat"><span>Лекарства приняты</span><b>${Math.round(k / n * 100)}%</b></div>` : ""}
    ${(() => { const ms = days.map(d => clSleepMin(state.days?.[d])).filter(Boolean), qs = days.map(d => state.days?.[d]?.sq).filter(Boolean);
      return (ms.length >= 3 ? `<div class="cl-stat"><span>Сон в среднем</span><b>${clHours(Math.round(clAvg(ms) / 10) * 10)}</b></div>` : "")
        + (qs.length >= 3 ? `<div class="cl-stat"><span>Качество сна</span><b>${dyNum(clAvg(qs))} из 5</b></div>` : ""); })()}
    ${rows.map(r => `<div class="cl-stat"><span>${esc(r.s.name)}</span><b class="${clMove(r.a, r.b)}">${dyNum(r.a)} → ${dyNum(r.b)}</b></div>`).join("")}
    ${rows.length ? `<p class="cl-muted cl-small">Средняя сила жалобы, прошлая неделя → эта. Шкала 0–3.</p>` : ""}
  </section>`;
}

/* ---------- dialogs ---------- */
const clChips = (list, attr, on) => list.map(s => `<button type="button" class="tchip" ${attr}="${esc(s.id)}" aria-pressed="${on(s)}">${esc(s.name)}</button>`).join("");
// main complaints in sight, the rest folded
const clSyPick = (attr, on) => { const { main, rest } = clMain(); return `<div class="tchips">${clChips(main.length ? main : rest, attr, on)}</div>
  ${main.length && rest.length ? `<details class="cl-more"${rest.some(on) ? " open" : ""}><summary>Другие жалобы</summary><div class="tchips">${clChips(rest, attr, on)}</div></details>` : ""}`; };
function openBad() {
  const { main, rest } = clMain(), first = (main[0] || rest[0])?.id;
  if (!first) { toast("Сначала добавь жалобу в «Симптомах»"); return; }
  openX(`<div class="dlg-head"><h3>Сейчас плохо · ${clHM()}</h3><button type="button" class="icon-btn" data-xclose aria-label="Закрыть">×</button></div>
    <p class="cl-muted">Запишется в жалобу и в сегодняшний день. Потом видно, что было перед приступом.</p>
    <h4 class="cl-dh4">Что беспокоит</h4>${clSyPick("data-clb-s", s => s.id === first)}
    <h4 class="cl-dh4">Насколько</h4><div class="dy-sev">${SY_SEV.map(([k, n]) => `<button type="button" class="dy-b s${k}" data-clb-v="${k}" aria-pressed="${k === 2}">${n}</button>`).join("")}</div>
    <h4 class="cl-dh4">Что было за 1–3 часа до этого</h4><div class="tchips">${CL_BEFORE.map(([k, n]) => `<button type="button" class="tchip" data-clb-w="${k}" aria-pressed="false">${n}</button>`).join("")}</div>
    <div class="dlg-foot"><span style="flex:1"></span><button type="button" class="btn primary" data-clb-save>Записать</button></div>`, "st-dlg tp-dlg cl-dlg");
}
function openExpNew() {
  const today = todayISO();
  const recent = tpList().map(tpStart).filter(s => s && s > addDaysISO(today, -CL_BASE) && s <= today).sort().pop();
  openX(`<div class="dlg-head"><h3>Новая проверка</h3><button type="button" class="icon-btn" data-xclose aria-label="Закрыть">×</button></div>
    <p class="cl-lead">Меняешь <b>одно</b> на время проверки и каждый вечер отмечаешь, получилось ли. Сайт сравнит жалобы с тремя неделями до начала и скажет, стало ли легче.</p>
    ${recent ? `<p class="cl-note">Лечение сменилось ${fmtDate(recent)}. Если начать сейчас, будет непонятно, что сработало — лекарства или это изменение. Надёжнее начать с ${fmtDate(addDaysISO(recent, CL_BASE))}.</p>` : ""}
    <h4 class="cl-dh4">Что проверить</h4>
    <div class="cl-ideas">${CL_IDEAS.map(([t, w], i) => `<button type="button" class="cl-idea" data-cle-i="${i}" aria-pressed="${i === 0}"><b>${esc(t)}</b><small>${esc(w)}</small></button>`).join("")}
      <input class="input" data-cle-own placeholder="Или своё: например, без молочного" autocomplete="off"></div>
    <h4 class="cl-dh4">Сколько дней</h4><div class="seg cl-seg">${[7, 14, 21].map(n => `<button type="button" data-cle-n="${n}" aria-pressed="${n === 14}">${n} ${plural(n, "день", "дня", "дней")}</button>`).join("")}</div>
    <h4 class="cl-dh4">На какие жалобы смотреть</h4>${clSyPick("data-cle-s", s => !!s.main)}
    <div class="dlg-foot"><span style="flex:1"></span><button type="button" class="btn primary" data-cle-go>Начать с сегодня</button></div>`, "st-dlg tp-dlg cl-dlg");
}
function openExp(id) {
  const e = clExps().find(x => x.id === id); if (!e) return;
  const r = clExpResult(e);
  openX(`<div class="dlg-head"><h3>${esc(e.title)}</h3><button type="button" class="icon-btn" data-xclose aria-label="Закрыть">×</button></div>
    <p class="cl-muted">${fmtDate(e.start)} — ${fmtDate(clExpEnd(e))} · соблюдал ${r.kept} из ${daysBetween(e.start, r.end) + 1} ${plural(daysBetween(e.start, r.end) + 1, "дня", "дней", "дней")}</p>
    <div class="cl-verdict v-${r.verdict}"><b>${CL_VERDICT_LONG[r.verdict]}</b>${r.live ? "<span>Проверка ещё идёт — это промежуточный итог.</span>" : ""}</div>
    <div class="cl-res">${r.rows.map(x => `<div class="cl-stat"><span>${esc(x.s.name)}</span>${x.ok ? `<b class="${clMove(x.a, x.b)}">${dyNum(x.a)} → ${dyNum(x.b)}</b>` : `<b class="cl-muted">мало записей</b>`}</div>`).join("")}</div>
    <p class="cl-small cl-muted">Слева — средняя сила за 3 недели до начала, справа — в дни, когда соблюдал. Шкала 0–3: нет, слабо, заметно, сильно.</p>
    ${r.mixed.length ? `<p class="cl-note">В это же время менялось лечение (${r.mixed.map(p => esc(p.title || "схема")).join(", ")}) — разница может быть и от него.</p>` : ""}
    <div class="dlg-foot"><button type="button" class="btn ghost" data-cle-del="${esc(e.id)}">Удалить</button><span style="flex:1"></span>
      ${r.live ? `<button type="button" class="btn" data-cle-stop="${esc(e.id)}">Закончить сейчас</button>` : ""}<button type="button" class="btn primary" data-xclose>Готово</button></div>`, "st-dlg tp-dlg cl-dlg");
}
// a daily calendar event in the evening: the same time every day makes it a habit
function clRemind() {
  const day = todayISO().replace(/-/g, ""), url = location.href.split("#")[0];
  const ics = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Medcard//RU", "BEGIN:VEVENT",
    `UID:medcard-evening-${Date.now()}@medcard`, `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, "").slice(0, 15)}Z`,
    `DTSTART:${day}T213000`, `DTEND:${day}T214000`, "RRULE:FREQ=DAILY", "SUMMARY:Медкарта: итог дня",
    `DESCRIPTION:${("Минута: самочувствие и главные жалобы в худший момент дня. " + url).replace(/[,;]/g, m => "\\" + m)}`,
    "BEGIN:VALARM", "TRIGGER:PT0M", "ACTION:DISPLAY", "DESCRIPTION:Медкарта: итог дня", "END:VALARM", "END:VEVENT", "END:VCALENDAR"].join("\r\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([ics], { type: "text/calendar" })); a.download = "medcard-evening.ics";
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  toast("Каждый день в 21:30 — открой файл, чтобы добавить в календарь телефона или компьютера");
}

/* ---------- wiring ---------- */
function initCalendar() {
  const page = $("#calendarView");
  const touch = (d, fn) => { const x = dyDay(d); fn(x); dyTidy(d); save(); renderCalendar(); };
  page.addEventListener("click", e => {
    const t = e.target, d = clSel();
    const dd = t.closest("[data-cl-day]"); if (dd && !dd.disabled) { ui.clDay = dd.dataset.clDay; renderCalendar(); if (dd.closest(".cl-banner, .cl-top")) window.scrollTo({ top: 0 }); return; }
    const go = t.closest("[data-cl-go]");
    if (go) {
      const k = +go.dataset.clGo, month = !!+$("[data-cl-mode]", go.closest(".cl-strip")).dataset.clMode;
      if (month) { const x = new Date(d + "T00:00:00"); x.setDate(1); x.setMonth(x.getMonth() + k); const n = `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-01`; ui.clDay = k > 0 ? [n, todayISO()].sort()[0] : n; }
      else ui.clDay = [addDaysISO(d, 7 * k), todayISO()].sort()[0];
      renderCalendar(); return;
    }
    const mo = t.closest("[data-cl-mode]"); if (mo) { ui.clMonth = !+mo.dataset.clMode; renderCalendar(); return; }
    const op = t.closest("[data-cl-open]"); if (op) { ui.clOpen = { ...(ui.clOpen || {}), [op.dataset.clOpen]: !ui.clOpen?.[op.dataset.clOpen] }; renderCalendar(); return; }
    const md = t.closest("[data-cl-med]");
    if (md && md.classList.contains("cl-tile") && motionOK() && !md.classList.contains("taking")) { md.classList.add("taking"); setTimeout(() => md.click(), 300); return; }
    if (md) { const k = md.dataset.clMed; touch(d, x => { x.meds = { ...(x.meds || {}) }; if (x.meds[k]) delete x.meds[k]; else x.meds[k] = true; if (!Object.keys(x.meds).length) delete x.meds; }); return; }
    const al = t.closest("[data-cl-all]");
    if (al && motionOK() && !al.dataset.going) {
      const tiles = $$(".cl-tile", al.closest(".cl-card, .cl-rowbody"));
      if (tiles.length) { al.dataset.going = 1; tiles.forEach((x, i) => setTimeout(() => x.classList.add("taking"), i * 60)); setTimeout(() => al.click(), 300 + tiles.length * 60); return; }
    }
    if (al) {
      // all of this time of day taken → untick them, otherwise tick every one
      const keys = clMeds(d).sched.filter(it => it.slot === al.dataset.clAll).map(it => it.key);
      touch(d, x => { x.meds = { ...(x.meds || {}) }; const all = keys.every(k => x.meds[k]); keys.forEach(k => { if (all) delete x.meds[k]; else x.meds[k] = true; }); if (!Object.keys(x.meds).length) delete x.meds; });
      return;
    }
    const pr = t.closest("[data-cl-prn]");
    if (pr) { const [id, k] = pr.dataset.clPrn.split("|"); touch(d, x => { x.prn = { ...(x.prn || {}) }; x.prn[id] = Math.max(0, (x.prn[id] || 0) + +k); if (!x.prn[id]) delete x.prn[id]; if (!Object.keys(x.prn).length) delete x.prn; }); return; }
    const xx = t.closest("[data-cl-x]");
    if (xx) { const [id, k] = xx.dataset.clX.split("|"); touch(d, x => { x.x = { ...(x.x || {}) }; if (x.x[id] === +k) delete x.x[id]; else x.x[id] = +k; if (!Object.keys(x.x).length) delete x.x; }); return; }
    const nk = t.closest("[data-cl-lat],[data-cl-wk],[data-cl-sq],[data-cl-rest],[data-cl-amh]");
    if (nk) {
      const f = ["lat", "wk", "sq", "rest", "amh"].find(k => nk.hasAttribute("data-cl-" + k)), v = +nk.getAttribute("data-cl-" + f);
      touch(d, x => { if (x[f] === v) delete x[f]; else x[f] = v; if (!(x.wk > 0)) delete x.why; });
      return;
    }
    const am = t.closest("[data-cl-am]");
    if (am) { const k = am.dataset.clAm; touch(d, x => { x.am = { ...(x.am || {}) }; if (x.am[k]) delete x.am[k]; else x.am[k] = true; if (!Object.keys(x.am).length) delete x.am; }); return; }
    const wy = t.closest("[data-cl-why]");
    if (wy) { const k = wy.dataset.clWhy; touch(d, x => { x.why = { ...(x.why || {}) }; if (x.why[k]) delete x.why[k]; else x.why[k] = true; if (!Object.keys(x.why).length) delete x.why; }); return; }
    if (t.closest("[data-cl-same]")) { const y = state.days?.[addDaysISO(d, -1)]; if (y) touch(d, x => { x.bed = y.bed; x.wake = y.wake; clSleepSet(x); }); return; }
    if (t.closest("[data-cl-bad]")) { openBad(); return; }
    if (t.closest("[data-cl-expnew]")) { openExpNew(); return; }
    const ex = t.closest("[data-cl-exp]"); if (ex) { openExp(ex.dataset.clExp); return; }
    const pl = t.closest("[data-cl-plan]"); if (pl) { openPlan(pl.dataset.clPlan); return; }
    if (t.closest("[data-cl-remind]")) clRemind();
  });
  page.addEventListener("change", e => {
    // the last meal: under 3 hours before bed ticks "late dinner" by itself
    if (e.target.matches("[data-cl-meal]")) {
      const d = clSel(), v = e.target.value;
      touch(d, x => { if (v) x.meal = v; else delete x.meal; delete x.mealFd; });
      const gap = clMealGap(d);
      if (gap != null) touch(d, x => { x.f = { ...(x.f || {}), late: gap < 180 }; });
      return;
    }
    if (!e.target.matches("[data-cl-bed],[data-cl-wake]")) return;
    const k = e.target.matches("[data-cl-bed]") ? "bed" : "wake", v = e.target.value;
    touch(clSel(), x => { if (v) x[k] = v; else delete x[k]; clSleepSet(x); });
  });
  dyBind(page, clSel, renderCalendar);

  // the dialogs of this screen live in the shared sheet
  const xd = $("#xDlg");
  xd.addEventListener("click", e => {
    if (!xd.classList.contains("cl-dlg")) return;
    const t = e.target;
    const one = (b, sel) => { $$(sel, xd).forEach(x => x.setAttribute("aria-pressed", x === b)); };
    const s = t.closest("[data-clb-s]"); if (s) { one(s, "[data-clb-s]"); return; }
    const v = t.closest("[data-clb-v]"); if (v) { one(v, "[data-clb-v]"); return; }
    const w = t.closest("[data-clb-w]");
    if (w) {
      const on = w.getAttribute("aria-pressed") !== "true"; w.setAttribute("aria-pressed", on);
      if (on && w.dataset.clbW === "none") $$("[data-clb-w]:not([data-clb-w=none])", xd).forEach(x => x.setAttribute("aria-pressed", false));
      if (on && w.dataset.clbW !== "none") $("[data-clb-w=none]", xd).setAttribute("aria-pressed", false);
      return;
    }
    if (t.closest("[data-clb-save]")) {
      const id = $("[data-clb-s][aria-pressed=true]", xd)?.dataset.clbS, sev = +($("[data-clb-v][aria-pressed=true]", xd)?.dataset.clbV || 2);
      if (!id) return;
      const why = $$("[data-clb-w][aria-pressed=true]", xd).map(b => b.dataset.clbW).filter(k => k !== "none");
      const words = why.map(k => CL_BEFORE.find(([x]) => x === k)[1].toLowerCase());
      const d = todayISO(), x = dyDay(d);
      (x.sy ||= {})[id] = Math.max(x.sy[id] || 0, sev);
      const facs = why.filter(k => DY_FACTORS.some(([f]) => f === k));
      if (facs.length) x.f = { ...(x.f || {}), ...Object.fromEntries(facs.map(k => [k, true])) };
      closeX();
      syAddEntry(id, { d, sev, note: `в ${clHM()}${words.length ? ` · перед этим: ${words.join(", ")}` : ""}` });
      toast("Записано");
      return;
    }
    const i = t.closest("[data-cle-i]"); if (i) { one(i, "[data-cle-i]"); $("[data-cle-own]", xd).value = ""; return; }
    const n = t.closest("[data-cle-n]"); if (n) { one(n, "[data-cle-n]"); return; }
    const sy = t.closest("[data-cle-s]"); if (sy) { sy.setAttribute("aria-pressed", sy.getAttribute("aria-pressed") !== "true"); return; }
    if (t.closest("[data-cle-go]")) {
      const own = $("[data-cle-own]", xd).value.trim(), idea = CL_IDEAS[+($("[data-cle-i][aria-pressed=true]", xd)?.dataset.cleI ?? -1)];
      const title = own || idea?.[0]; if (!title) { $("[data-cle-own]", xd).focus(); return; }
      const sys = $$("[data-cle-s][aria-pressed=true]", xd).map(b => b.dataset.cleS);
      if (!sys.length) { toast("Выбери хотя бы одну жалобу, по которой смотреть"); return; }
      state.prefs ||= {};
      state.prefs.exps = [...clExps(), { id: newId("e"), title, why: own ? "" : idea[1], start: todayISO(), days: +($("[data-cle-n][aria-pressed=true]", xd)?.dataset.cleN || 14), sy: sys }];
      save(); closeX(); renderCalendar(); toast(`Проверка началась: ${title}`);
      return;
    }
    const st = t.closest("[data-cle-stop]");
    if (st) { const e2 = clExps().find(x => x.id === st.dataset.cleStop); if (e2) { e2.stop = [todayISO(), clExpEnd(e2)].sort()[0]; save(); renderCalendar(); openExp(e2.id); } return; }
    const del = t.closest("[data-cle-del]");
    if (del && confirm("Удалить эту проверку? Отметки «соблюдал» в днях тоже перестанут учитываться.")) {
      state.prefs.exps = clExps().filter(x => x.id !== del.dataset.cleDel); save(); closeX(); renderCalendar();
    }
  });
  xd.addEventListener("input", e => { if (e.target.matches(".cl-dlg [data-cle-own]") && e.target.value.trim()) $$("[data-cle-i]", xd).forEach(b => b.setAttribute("aria-pressed", false)); });
}
