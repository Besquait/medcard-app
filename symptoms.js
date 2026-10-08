// Symptoms tab: what the person feels — headaches, ringing ears, sore eyes, a clicking knee.
// One record per complaint. How it behaves decides how it is tracked:
//   once  — happened once (a toothache); counts as past two weeks after the last entry
//   recur — comes and goes (headaches); every episode is a dated entry with how long it lasted
//   const — there all the time (ringing ears); entries are optional check-ins of how strong it is that day
// Around each complaint: when it started (a year is enough), how it shows, what was tried and whether it
// helped, what sets it off. The page opens with a one-tap check-in across all current complaints and a
// four-week diary, so frequency and overlaps are visible at a glance and go into the doctor report.
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
// episode length in days; 0 — a few hours
const SY_DUR = [[0, "Несколько часов"], [1, "День"], [2, "2 дня"], [3, "3 дня и дольше"]];
const SY_EFF = [["yes", "Помогает"], ["part", "Немного"], ["no", "Не помогает"]];
const SY_EFF_NAME = Object.fromEntries(SY_EFF);
// [zone id, zone name, presets: [name, usual pattern, situation with a lab plan]]
const SY_ZONES = [
  ["head", "Голова", [["Головная боль", "recur", "Головные боли"], ["Мигрень", "recur", "Головные боли"], ["Головокружение", "recur", "Головные боли"], ["Туман в голове", "const", "Усталость и слабость"], ["Тяжесть в голове", "recur", "Давление и отёки"]]],
  ["ent", "Уши, нос и горло", [["Шум в ушах", "const", ""], ["Боль от звуков", "const", ""], ["Заложен нос", "const", "Аллергия"], ["Боль в горле", "once", "Воспаление и инфекции"], ["Насморк", "once", "Аллергия"], ["Кашель", "once", "Воспаление и инфекции"], ["Храп", "const", "Стресс и сон"]]],
  ["eyes", "Глаза", [["Боль в глазах", "recur", ""], ["Сухость глаз", "const", ""], ["Мушки перед глазами", "const", ""], ["Светочувствительность", "const", ""], ["Покраснение глаз", "once", "Аллергия"], ["Ухудшение зрения", "const", ""]]],
  ["teeth", "Зубы и рот", [["Зубная боль", "once", ""], ["Сжимаю зубы во сне", "const", "Стресс и сон"], ["Кровоточат дёсны", "recur", "Кровоточивость и тромбы"], ["Чувствительность зубов", "const", ""], ["Сухость во рту", "const", "Сахар и диабет"], ["Язвочки во рту", "recur", "Анемия"]]],
  ["heart", "Сердце и дыхание", [["Сердцебиение", "recur", "Сердце и сосуды"], ["Ощущаю пульс", "const", "Сердце и сосуды"], ["Боль в груди", "recur", "Сердце и сосуды"], ["Одышка", "recur", "Сердце и сосуды"], ["Скачет давление", "recur", "Давление и отёки"], ["Отёки ног", "recur", "Давление и отёки"]]],
  ["gut", "Живот", [["Изжога", "recur", "Изжога и гастрит"], ["Вздутие", "recur", "ЖКТ и живот"], ["Боль в животе", "recur", "ЖКТ и живот"], ["Тошнота", "recur", "ЖКТ и живот"], ["Запор", "recur", "ЖКТ и живот"], ["Диарея", "once", "ЖКТ и живот"]]],
  ["mind", "Психика и сон", [["Тревога", "recur", "Тревога и настроение"], ["Паническая атака", "recur", "Тревога и настроение"], ["Нет сил и мотивации", "const", "Тревога и настроение"], ["Усталость", "const", "Усталость и слабость"], ["Плохо сплю", "recur", "Стресс и сон"], ["Сонливость днём", "const", "Усталость и слабость"]]],
  ["joints", "Спина и суставы", [["Боль в спине", "recur", "Суставы"], ["Боль в шее", "recur", "Суставы"], ["Хруст в шее", "const", "Суставы"], ["Хруст в колене", "const", "Суставы"], ["Боль в колене", "recur", "Суставы"], ["Судороги в ногах", "recur", "Онемение и нервы"], ["Немеют руки или ноги", "recur", "Онемение и нервы"]]],
  ["skin", "Кожа и волосы", [["Сыпь", "once", "Аллергия"], ["Зуд", "recur", "Аллергия"], ["Акне", "const", "Кожа и акне"], ["Выпадают волосы", "const", "Выпадение волос"], ["Сухая кожа", "const", "Кожа и акне"], ["Ломкие ногти", "const", "Анемия"]]],
  ["uro", "Мочеполовая система", [["Частое мочеиспускание", "const", "Сахар и диабет"], ["Боль при мочеиспускании", "once", "Почки"], ["Снижено либидо", "const", "Либидо и потенция"]]],
  ["other", "Общее", [["Тремор рук", "const", "Щитовидка"], ["Постоянно мёрзну", "const", "Щитовидка"], ["Потливость", "recur", "Щитовидка"], ["Слабость", "const", "Усталость и слабость"]]],
];
const SY_ZONE = Object.fromEntries(SY_ZONES.map(([id, name]) => [id, name]));
const SY_ZONE_ORDER = Object.fromEntries(SY_ZONES.map(([id], i) => [id, i]));
const SY_PRESETS = SY_ZONES.flatMap(([zone, , list]) => list.map(([name, pattern, sit]) => ({ name, pattern, sit, zone })));
const SY_POPULAR = ["Головная боль", "Боль в спине", "Шум в ушах", "Боль в глазах", "Зубная боль", "Изжога", "Усталость", "Плохо сплю", "Тревога", "Хруст в колене"];
const SY_ONCE_DAYS = 14, SY_QUIET_DAYS = 90, SY_DIARY_DAYS = 28;
// history that belongs to the person, not to one complaint; kept in prefs and printed in the doctor report
const SY_ANAM = [
  ["hist", "Как всё начиналось", "Когда появились первые жалобы, чем болел, что выяснили врачи"],
  ["hyp", "Свои догадки", "Что, по-твоему, может быть причиной"],
  ["plan", "Что хочу проверить", "Обследования и врачи, которых ещё не было"],
  ["allergy", "Аллергии и непереносимость", "Лекарства, продукты — или «нет»"],
];

const addDaysISO = (iso, n) => { const d = new Date(iso + "T00:00:00"); d.setDate(d.getDate() + n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
const syList = () => Object.entries(state.symptoms || {}).map(([id, s]) => ({ id, ...s }));
const syLog = s => [...(s.log || [])].sort((a, b) => (a.d || "").localeCompare(b.d || "") || (a.t || 0) - (b.t || 0));
const syLast = s => { const l = syLog(s); return l.length ? l[l.length - 1].d : ""; };
const syAgoDays = s => { const d = syLast(s); return d ? daysBetween(d, todayISO()) : null; };
const syPreset = name => SY_PRESETS.find(p => norm(p.name) === norm(name));
const syZoneOf = s => SY_ZONE[s.zone] ? s.zone : "other";
const syAnam = () => state.prefs?.anamnesis || {};
const syAnamHas = () => SY_ANAM.some(([k]) => (syAnam()[k] || "").trim());

// past: closed by hand, or a one-off complaint two weeks after its last entry.
// A recurring one is never hidden by itself: a forgotten diary must not drop a real complaint from the list.
const syPast = s => !!s.end || (s.pattern === "once" && (syAgoDays(s) ?? 0) > SY_ONCE_DAYS);
const syQuiet = s => !s.end && s.pattern === "recur" && (syAgoDays(s) ?? 0) > SY_QUIET_DAYS;
// severity: the latest rated entry wins, otherwise the one set in the form
const sySev = s => { const l = syLog(s).filter(e => e.sev); return l.length ? l[l.length - 1].sev : s.sev || 0; };
const syOrder = (a, b) => SY_ZONE_ORDER[syZoneOf(a)] - SY_ZONE_ORDER[syZoneOf(b)] || sySev(b) - sySev(a) || a.name.localeCompare(b.name, "ru");

/* ---------- dates ---------- */
// start is a year ("2020"), a month ("2024-03") or a day; arithmetic uses its first day
const syStartISO = st => !st ? "" : st.length === 4 ? st + "-01-01" : st.length === 7 ? st + "-01" : st;
function syOnset(s) {
  const st = s.start || "", [y, m, d] = st.split("-").map(Number);
  if (!st) return s.since || "";
  return st.length === 4 ? `с ${y}` : st.length === 7 ? `с ${MONTHS[m - 1]} ${y}` : `с ${d} ${MONTHS[m - 1]} ${y}`;
}
// how long it has been there; a bare year gives whole years only
function syAge(s) {
  if (!s.start) return "";
  if (s.start.length === 4) { const n = new Date().getFullYear() - +s.start; return n < 1 ? "" : `${n} ${plural(n, "год", "года", "лет")}`; }
  const n = daysBetween(syStartISO(s.start), todayISO());
  return n < 1 ? "" : spanText(n);
}
// "с 2020 · через несколько недель после COVID · 6 лет"
const syOnsetFull = s => [syOnset(s), s.start && s.since ? s.since : "", syAge(s)].filter(Boolean);
function syAgo(d) {
  const n = daysBetween(d, todayISO());
  return n <= 0 ? "сегодня" : n === 1 ? "вчера" : `${spanText(n)} назад`;
}
const syDurText = d => d === 0 ? "несколько часов" : d === 2 ? "2 дня" : d >= 3 ? "3 дня и дольше" : "";

/* ---------- episodes ---------- */
// day → strength; a multi-day episode covers every day it lasted; an unrated entry is 0.5
function syDays(s) {
  const by = {};
  (s.log || []).forEach(e => {
    if (!e.d) return;
    for (let i = 0; i < Math.max(1, e.dur || 0); i++) { const d = addDaysISO(e.d, i); by[d] = Math.max(by[d] || 0, e.sev || 0.5); }
  });
  return by;
}
const syCls = v => !v ? "" : v < 1 ? "su" : "s" + v;
const sySevWord = v => SY_SEV_NAME[v] || "отмечено";
const syCount = (s, days) => (s.log || []).filter(e => e.d && e.d <= todayISO() && daysBetween(e.d, todayISO()) < days).length;
const syDaysIn = (s, days) => Object.keys(syDays(s)).filter(d => d <= todayISO() && daysBetween(d, todayISO()) < days).length;
const syDot = sev => `<i class="sy-dot ${syCls(sev)}" aria-hidden="true"></i>`;
// one line under the name: how it behaves right now
function syWhen(s) {
  if (s.end) return `прошло ${fmtDate(s.end)}`;
  if (s.pattern === "const") return syOnsetFull(s).join(" · ") || "постоянно";
  const last = syLast(s);
  if (s.pattern === "once") return last ? longDate(last) : syOnset(s);
  if (!last) return syOnset(s) || "приступы ещё не отмечены";
  const n = syCount(s, 30);
  return `${n ? `${n} ${plural(n, "раз", "раза", "раз")} за 30 дней` : "за 30 дней не было"} · последний ${syAgo(last)}`;
}
function syAddEntry(id, e) {
  const s = state.symptoms[id]; if (!s) return;
  const x = { d: e.d, sev: +e.sev || 0, t: Date.now() };
  if (e.dur !== undefined && e.dur !== "") x.dur = +e.dur;
  ["trig", "help", "note"].forEach(k => { if (e[k]) x[k] = e[k]; });
  s.log = [...(s.log || []), x];
  if (s.pattern === "once" && new Set(s.log.map(l => l.d)).size > 1) s.pattern = "recur";
  if (s.end && x.d >= s.end) s.end = "";
  if (s.pattern !== "const" && (!s.start || x.d < syStartISO(s.start))) s.start = x.d;
  if (x.trig && !(s.trig || []).some(t => norm(t) === norm(x.trig))) s.trig = [...(s.trig || []), x.trig];
  save(); renderAll();
}
// check-in tap: none → слабо → заметно → сильно → none. An entry with details is never dropped, it wraps to слабо.
function syTap(id, d) {
  const s = state.symptoms[id]; if (!s) return;
  const e = (s.log || []).filter(x => x.d === d).pop();
  if (!e) { syAddEntry(id, { d, sev: 1 }); return; }
  if ((e.sev || 0) < 3) e.sev = (e.sev || 0) + 1;
  else if (e.note || e.trig || e.help || (e.dur || 0) > 1) e.sev = 1;
  else s.log.splice(s.log.indexOf(e), 1);
  save(); renderAll();
}

// complaints carried over from notes (seed.js; the public build ships an empty seed).
// Added once per seed version, so a complaint deleted on the site does not come back.
function sySeedMerge() {
  const seed = window.SEED_SYMPTOMS; if (!seed?.list?.length) return false;
  state.prefs ||= {}; state.symptoms ||= {};
  if ((state.prefs.sySeed || 0) >= seed.version) return false;
  const have = new Set(syList().map(s => norm(s.name)));
  seed.list.forEach(({ id, ...s }) => { if (!state.symptoms[id] && !have.has(norm(s.name))) state.symptoms[id] = JSON.parse(JSON.stringify(s)); });
  if (seed.anamnesis && !syAnamHas()) state.prefs.anamnesis = { ...seed.anamnesis };
  state.prefs.sySeed = seed.version;
  return true;
}

/* ---------- page ---------- */
function renderSymptoms() {
  const box = $("#symptomsView"); if (!box || box.hidden) return;
  const all = syList();
  if (!all.length) {
    box.innerHTML = `<div class="st-head"><div><h2>Симптомы</h2></div></div>
      <div class="st-empty">
        <h3>Что беспокоит?</h3>
        <p>Записывай всё, что чувствуешь: головные боли, шум в ушах, боль в глазах, хруст в колене. Отмечай дни, когда было, и что пробовал — помогло или нет. Перед приёмом всё соберётся в сводку для врача.</p>
        <div class="tchips sy-quick">${SY_POPULAR.map(n => `<button type="button" class="tchip" data-sy-new="${esc(n)}">${esc(n)}</button>`).join("")}</div>
        <button type="button" class="btn primary" data-sy-new>Добавить симптом</button>
      </div>
      ${syAnamCard()}`;
    return;
  }
  const now = all.filter(s => !syPast(s)).sort(syOrder);
  const past = all.filter(syPast).sort((a, b) => (b.end || syLast(b) || "").localeCompare(a.end || syLast(a) || ""));
  const eps = now.reduce((n, s) => n + (s.pattern === "const" ? 0 : syCount(s, 30)), 0);
  const sub = [`${now.length} ${plural(now.length, "беспокоит", "беспокоят", "беспокоят")} сейчас`, eps ? `${eps} ${plural(eps, "эпизод", "эпизода", "эпизодов")} за 30 дней` : "", past.length ? `${past.length} прошло` : ""].filter(Boolean).join(" · ");
  const focus = document.activeElement?.dataset?.syTap;
  box.innerHTML = `
    <div class="st-head">
      <div><h2>Симптомы</h2><p class="st-sub">${sub}</p></div>
      <button type="button" class="btn primary" data-sy-new>Добавить</button>
    </div>
    ${syToday(now)}
    ${syDiary(all)}
    ${now.length ? syListHtml(now) : `<div class="empty">Сейчас ничего не беспокоит.</div>`}
    ${syAnamCard()}
    ${past.length ? `<details class="sy-past"${ui.syPastOpen ? " open" : ""}><summary class="st-year">Прошло · ${past.length}</summary><div class="card st-list">${past.map(syRow).join("")}</div></details>` : ""}`;
  if (focus) $(`[data-sy-tap="${CSS.escape(focus)}"]`)?.focus();
}
const syDayISO = () => addDaysISO(todayISO(), -(ui.syDay || 0));
// strength of an entry made on that very day; an episode carried over from earlier days is not a check-in
const syOn = (s, d) => { const e = (s.log || []).filter(x => x.d === d).pop(); return e ? e.sev || 0.5 : 0; };
function syToday(list) {
  if (!list.length) return "";
  const d = syDayISO();
  return `<section class="card sy-today" aria-label="Отметка за день">
    <div class="sy-thead"><div><h3>${ui.syDay ? "Что беспокоило вчера?" : "Что беспокоит сегодня?"}</h3>
      <p>Нажми — слабо, ещё раз — заметно, третий — сильно, четвёртый снимет отметку.</p></div>
      <div class="seg" role="group" aria-label="День">${[[0, "Сегодня"], [1, "Вчера"]].map(([k, n]) => `<button type="button" data-sy-day="${k}" aria-pressed="${(ui.syDay || 0) === k}">${n}</button>`).join("")}</div></div>
    <div class="sy-chips">${list.map(s => { const v = syOn(s, d); return `<button type="button" class="sy-chip ${syCls(v)}" data-sy-tap="${esc(s.id)}" aria-pressed="${!!v}"><i aria-hidden="true"></i><span>${esc(s.name)}</span>${v ? `<small>${esc(sySevWord(v))}</small>` : ""}</button>`; }).join("")}</div>
  </section>`;
}
// rows: complaints with any marked day in the window; columns: days, today on the right
function syDiary(list) {
  const today = todayISO(), from = addDaysISO(today, -(SY_DIARY_DAYS - 1));
  const rows = list.map(s => ({ s, by: syDays(s) })).filter(({ by }) => Object.keys(by).some(d => d >= from && d <= today)).sort((a, b) => syOrder(a.s, b.s));
  if (!rows.length) return "";
  const days = Array.from({ length: SY_DIARY_DAYS }, (_, i) => addDaysISO(from, i));
  return `<section class="card sy-diary" aria-label="Дневник за 4 недели">
    <div class="sy-thead"><div><h3>Дневник за 4 недели</h3><p>Клетка — день, цвет — сила. Видно, что приходит вместе.</p></div></div>
    <div class="sy-grid">${rows.map(({ s, by }) => `<button type="button" class="sy-gname" data-sy="${esc(s.id)}">${esc(s.name)}</button>
      <div class="sy-gcells">${days.map(d => `<i class="${syCls(by[d])}${d === today ? " now" : ""}" title="${fmtDate(d)}${by[d] ? " · " + sySevWord(by[d]).toLowerCase() : ""}"></i>`).join("")}</div>`).join("")}
      <span class="sy-gpad"></span><div class="sy-gaxis"><span>${fmtDate(from)}</span><span>сегодня</span></div></div>
  </section>`;
}
// five and more complaints are grouped by body area inside one card
function syListHtml(now) {
  const grouped = now.length >= 5;
  let out = "", zone = null;
  now.forEach(s => {
    if (grouped && syZoneOf(s) !== zone) { zone = syZoneOf(s); out += `<div class="sy-ghead">${esc(SY_ZONE[zone])}</div>`; }
    out += syRow(s);
  });
  return `<h3 class="st-year">Беспокоит сейчас · ${now.length}</h3><div class="card st-list sy-list">${out}</div>`;
}
// last 14 days as small ticks, filled on days with an episode
function syTicks(s) {
  const by = syDays(s); let out = "";
  for (let i = 13; i >= 0; i--) { const d = addDaysISO(todayISO(), -i); out += `<i class="${syCls(by[d])}" title="${fmtDate(d)}"></i>`; }
  return `<span class="sy-ticks" aria-hidden="true">${out}</span>`;
}
function syRow(s) {
  const past = syPast(s), sev = past ? 0 : sySev(s), lead = (s.note || "").split("\n")[0];
  const side = syQuiet(s) ? `<span class="sy-quiet">давно не отмечал</span>` : s.pattern === "recur" && !past && syDaysIn(s, 14) ? syTicks(s) : "";
  return `<div class="sy-row${past ? " past" : ""}" role="button" tabindex="0" data-sy="${esc(s.id)}">
    ${syDot(sev)}
    <span class="st-main">
      <b class="st-title">${esc(s.name)}</b>
      <span class="sy-when">${esc(SY_PATTERN[s.pattern] || "")}${syWhen(s) ? " · " + esc(syWhen(s)) : ""}</span>
      ${lead ? `<span class="st-concl">${esc(lead)}</span>` : ""}
    </span>
    <span class="sy-side">${side}${sev ? `<span class="sy-sev s${sev}">${esc(SY_SEV_NAME[sev])}</span>` : ""}</span>
    <svg class="chev" width="18" height="18" viewBox="0 0 20 20" aria-hidden="true"><path d="M7 4l6 6-6 6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>
  </div>`;
}

/* ---------- history of illness ---------- */
function syAnamCard() {
  const a = syAnam(), l = SY_ANAM.filter(([k]) => (a[k] || "").trim());
  if (!l.length) return `<button type="button" class="sy-anam-empty" data-sy-anam><b>+ История болезни</b><span>С чего всё началось, что уже проверял, свои догадки. Врачу это нужно не меньше, чем анализы.</span></button>`;
  return `<section class="card sy-anam${ui.syAnamFull ? " full" : ""}" aria-label="История болезни">
    <div class="sy-thead"><div><h3>История болезни</h3><p>Попадёт в сводку для врача перед жалобами.</p></div><button type="button" class="btn sm" data-sy-anam>Изменить</button></div>
    <dl>${l.map(([k, t]) => `<div><dt>${esc(t)}</dt><dd>${esc(a[k].trim())}</dd></div>`).join("")}</dl>
    <button type="button" class="btn sm ghost sy-anam-more" data-sy-anamfull>${ui.syAnamFull ? "Свернуть" : "Читать полностью"}</button>
  </section>`;
}
function openAnamnesis() {
  const a = syAnam();
  openX(`<div class="dlg-head"><h3>История болезни</h3><button type="button" class="icon-btn" data-xclose aria-label="Закрыть">×</button></div>
    <p class="x-lead">Всё, что не про одну жалобу: как начиналось, что уже выяснили, свои догадки. Попадёт в сводку для врача.</p>
    <form class="st-form" data-sy-anamf>
      ${SY_ANAM.map(([k, t, h]) => `<label class="fld"><span>${esc(t)}</span><textarea class="input sy-grow" name="${k}" rows="${k === "hist" ? 8 : 3}" placeholder="${esc(h)}">${esc(a[k] || "")}</textarea></label>`).join("")}
      <div class="dlg-foot"><span style="flex:1"></span><button type="button" class="btn ghost" data-xclose>Отмена</button><button type="submit" class="btn primary">Сохранить</button></div>
    </form>`, "st-dlg sy-dlg");
  syGrowAll();
}
function anamnesisReport() {
  const a = syAnam();
  return SY_ANAM.filter(([k]) => (a[k] || "").trim()).map(([k, t]) => `<p class="rep-anam"><b>${esc(t)}.</b> ${esc(a[k].trim()).replace(/\n/g, "<br>")}</p>`).join("");
}

/* ---------- one complaint ---------- */
// last 16 weeks, Monday-first columns, one cell per day
function syHeat(s) {
  const by = syDays(s), today = todayISO(), t = new Date(today + "T00:00:00"), shift = (t.getDay() + 6) % 7;
  const start = addDaysISO(today, -(15 * 7 + shift));
  let cells = "";
  for (let i = 0; i < 16 * 7; i++) {
    const d = addDaysISO(start, i);
    cells += d > today ? `<i class="fut"></i>` : `<i class="${syCls(by[d])}" title="${fmtDate(d)}${by[d] ? " · " + sySevWord(by[d]).toLowerCase() : ""}"></i>`;
  }
  return `<div class="sy-heat" aria-label="Эпизоды за 16 недель">${cells}</div>`;
}
function openSymptom(id) {
  const s = state.symptoms?.[id]; if (!s) return;
  const past = syPast(s), quiet = syQuiet(s), log = syLog(s).reverse(), sev = sySev(s), last = syLast(s);
  const g = s.sit && window.GUIDES?.[s.sit];
  const shown = ui.syAllLog ? log : log.slice(0, 6);
  const tried = s.tried || [], trig = s.trig || [];
  const onset = syOnsetFull(s).join(" · ");
  ui.syOpen = id;
  const status = past ? `<span class="st-status"><i></i>Прошло</span>` : quiet ? `<span class="st-status watch"><i></i>Давно не было</span>` : `<span class="st-status find"><i></i>Беспокоит</span>`;
  const logTitle = s.pattern === "const" ? "Как сейчас" : s.pattern === "once" ? "Было ещё раз?" : "Отметить приступ";
  const entry = e => [syDurText(e.dur), e.note, e.trig && `спровоцировало: ${e.trig}`, e.help && `помогло: ${e.help}`].filter(Boolean).join(" · ");
  openX(`<div class="dlg-head"><div><div class="info-group">${esc(SY_ZONE[syZoneOf(s)])}</div><h3>${esc(s.name)}</h3>
      <div class="st-meta">${esc([SY_PATTERN[s.pattern], onset].filter(Boolean).join(" · "))}</div></div>
      <button type="button" class="icon-btn" data-xclose aria-label="Закрыть">×</button></div>
    <div class="st-tags">${status}${sev ? `<span class="sy-sev s${sev}">${esc(SY_SEV_NAME[sev])}</span>` : ""}</div>
    ${quiet ? `<div class="sy-ask"><span>Последний раз отмечено ${esc(longDate(last))}. Прошло?</span><button type="button" class="btn sm" data-sy-end="${esc(id)}">Да, прошло</button></div>` : ""}
    ${s.note ? `<section class="st-sec"><h4>Как проявляется</h4><p class="st-text">${esc(s.note)}</p></section>` : ""}
    ${s.pattern === "recur" && log.length ? `<section class="st-sec"><h4>Как часто</h4>
      <div class="sy-stats"><div><b class="num">${syCount(s, 30)}</b><span>приступов за 30 дней</span></div><div><b class="num">${syDaysIn(s, 30)}</b><span>дней с симптомом за 30</span></div><div><b>${esc(syAgo(last))}</b><span>последний раз</span></div></div>
      ${syHeat(s)}<p class="muted sy-heatcap">16 недель: столбец — неделя, сверху понедельник. Цвет — сила, серый — сила не указана.</p></section>` : ""}
    <section class="st-sec"><h4>${logTitle}</h4>
      <form class="sy-logf" data-sy-logf>
        <div class="sy-logrow">${dfield('name="d"', todayISO())}
          <div class="sy-sevs">${SY_SEV.map(([k, n]) => `<button type="button" class="sy-sevb s${k}" data-sy-lsev="${k}" aria-pressed="${k === (sev || 2)}">${n}</button>`).join("")}</div>
          <input type="hidden" name="sev" value="${sev || 2}"></div>
        ${s.pattern !== "const" ? `<div class="tchips sy-durs" role="group" aria-label="Сколько длилось">${SY_DUR.map(([k, n]) => `<button type="button" class="tchip" data-sy-dur="${k}" aria-pressed="${k === 1}">${n}</button>`).join("")}</div><input type="hidden" name="dur" value="1">` : ""}
        <details class="sy-moref"><summary>Подробности: что спровоцировало, что помогло</summary>
          <input class="input" name="trig" placeholder="Что спровоцировало" list="syTrigList" autocomplete="off">
          <input class="input" name="help" placeholder="Что помогло" autocomplete="off">
          <textarea class="input sy-grow" name="note" rows="2" placeholder="Заметка: как было, что ещё заметил"></textarea>
          <datalist id="syTrigList">${trig.map(t => `<option value="${esc(t)}">`).join("")}</datalist>
        </details>
        <div><button type="submit" class="btn primary">Записать</button></div>
        ${s.pattern === "once" ? `<p class="muted sy-hint">После записи в другой день симптом станет «приступами» — будет видно, как часто повторяется.</p>` : ""}
      </form></section>
    ${log.length ? `<section class="st-sec"><h4>${s.pattern === "const" ? "Отметки" : "Когда было"} · ${log.length}</h4><div class="sy-log">${shown.map(e => `<div class="sy-lrow">${syDot(e.sev)}<span class="num">${fmtDate(e.d)}</span><span class="sy-lnote">${e.sev ? `<b class="sy-sev s${e.sev}">${esc(SY_SEV_NAME[e.sev])}</b>${entry(e) ? " · " : ""}` : ""}${esc(entry(e))}</span><button type="button" class="icon-btn sm" data-sy-ldel="${esc(e.d)}|${esc(e.t || "")}" aria-label="Удалить запись">×</button></div>`).join("")}</div>
      ${log.length > shown.length ? `<button type="button" class="btn sm ghost" data-sy-alllog>Показать все ${log.length}</button>` : ""}</section>` : ""}
    <section class="st-sec"><h4>Что пробовал${tried.length ? ` · ${tried.length}` : ""}</h4>
      ${tried.length ? `<div class="sy-tried">${tried.map((x, i) => `<div class="sy-trow"><span class="sy-tname"><b>${esc(x.name)}</b>${x.note ? `<small>${esc(x.note)}</small>` : ""}</span>
        <div class="sy-effs" role="group" aria-label="Как подействовало: ${esc(x.name)}">${SY_EFF.map(([k, n]) => `<button type="button" class="sy-eff e-${k}" data-sy-eff="${i}|${k}" aria-pressed="${x.eff === k}">${n}</button>`).join("")}</div>
        <button type="button" class="icon-btn sm" data-sy-tdel="${i}" aria-label="Убрать: ${esc(x.name)}">×</button></div>`).join("")}</div>`
        : `<p class="muted sy-hint">Лекарства, капли, упражнения, процедуры — и помогло ли. Врачу важно и то, что не помогло.</p>`}
      <form class="sy-addf" data-sy-tadd><input class="input" name="name" placeholder="Например: парацетамол 500 мг" autocomplete="off"><input class="input" name="note" placeholder="как принимал — необязательно" autocomplete="off"><button type="submit" class="btn">Добавить</button></form>
    </section>
    <section class="st-sec"><h4>Что провоцирует</h4>
      ${trig.length ? `<div class="tchips sy-trigs">${trig.map((t, i) => `<span class="tchip">${esc(t)}<button type="button" data-sy-trdel="${i}" aria-label="Убрать: ${esc(t)}">×</button></span>`).join("")}</div>`
        : `<p class="muted sy-hint">Запахи, еда, недосып, погода, стресс — что замечаешь перед ухудшением.</p>`}
      <form class="sy-addf" data-sy-tradd><input class="input" name="t" placeholder="Например: недосып" autocomplete="off"><button type="submit" class="btn">Добавить</button></form>
    </section>
    ${g ? `<section class="st-sec"><h4>Анализы</h4><p class="sy-guide">${esc(g.lead)}</p>
      <button type="button" class="btn" data-sy-sit="${esc(s.sit)}">Открыть план анализов: ${esc(s.sit.toLowerCase())}</button>
      ${g.flags ? `<div class="g-flags"><b>Сразу к врачу, если:</b> ${esc(g.flags)}</div>` : ""}</section>` : ""}
    <div class="dlg-foot"><button type="button" class="btn ghost danger" data-sy-del="${esc(id)}">${ui.confirmSy === id ? "Точно удалить?" : "Удалить"}</button><span style="flex:1"></span>
      <button type="button" class="btn ghost" data-sy-end="${esc(id)}">${past ? "Снова беспокоит" : "Прошло"}</button>
      <button type="button" class="btn primary" data-sy-edit="${esc(id)}">Изменить</button></div>`, "st-dlg sy-dlg");
}

/* ---------- doctor report ---------- */
// current complaints first, then those that passed within the report period
function symptomsReport(from) {
  const l = syList().filter(s => !syPast(s) || (s.end || syLast(s) || "") >= from);
  if (!l.length) return "";
  l.sort((a, b) => syPast(a) - syPast(b) || syOrder(a, b));
  const freq = s => s.pattern === "const" ? "постоянно" : s.pattern === "once" ? "разово" : syLast(s) ? `приступами: ${syCount(s, 30)} за 30 дней, ${syCount(s, 90)} за 90; последний ${fmtDate(syLast(s))}` : "приступами";
  const tried = s => (s.tried || []).map(x => `${esc(x.name)}${x.eff ? ` — ${esc(SY_EFF_NAME[x.eff].toLowerCase())}` : ""}`).join("<br>");
  return `<table class="rep-t rep-sy"><thead><tr><th>Жалоба</th><th>С какого времени</th><th>Как часто</th><th>Что пробовал</th><th>Подробно</th></tr></thead><tbody>${l.map(s => `<tr>
    <td><b>${esc(s.name)}</b>${sySev(s) ? ` <small>${esc(SY_SEV_NAME[sySev(s)].toLowerCase())}</small>` : ""}${syPast(s) ? ` <small>прошло${s.end ? " " + fmtDate(s.end) : ""}</small>` : ""}</td>
    <td>${esc(syOnsetFull(s).join(", ")) || "—"}</td><td>${esc(freq(s))}</td><td>${tried(s) || "—"}</td>
    <td>${esc(s.note || "")}${(s.trig || []).length ? `<br><small>Провоцирует: ${esc(s.trig.join(", "))}</small>` : ""}</td></tr>`).join("")}</tbody></table>`;
}

/* ---------- form ---------- */
const syF = n => $(`[data-sy-form] [name=${n}]`);
function openSymptomForm(id, presetName) {
  const p = presetName ? syPreset(presetName) : null, today = todayISO();
  const s = id ? state.symptoms[id] : { name: presetName || "", zone: p?.zone || "", pattern: p?.pattern || "recur", sev: 2, start: today.slice(0, 7), since: "", note: "", sit: p?.sit || "" };
  ui.syEdit = { id };
  const [sy, sm] = (s.start || "").split("-"), y0 = +today.slice(0, 4);
  const years = [["", "Год — не помню"], ...Array.from({ length: 61 }, (_, i) => [String(y0 - i), String(y0 - i)])];
  const months = [["", "Месяц — не важно"], ...MONTHS_NOM.map((n, i) => [String(i + 1).padStart(2, "0"), n])];
  openX(`<div class="dlg-head"><h3>${id ? "Изменить симптом" : "Что беспокоит"}</h3><button type="button" class="icon-btn" data-xclose aria-label="Закрыть">×</button></div>
    <form class="st-form sy-form" data-sy-form novalidate>
      <input type="hidden" name="zone" value="${esc(s.zone || "")}"><input type="hidden" name="sit" value="${esc(s.sit || "")}">
      <div class="fld"><textarea class="input sy-name sy-grow" name="name" rows="1" placeholder="Например: болит голова" autocomplete="off" enterkeyhint="done" aria-label="Что беспокоит">${esc(s.name)}</textarea></div>
      <div class="fld"><span>Как часто</span><input type="hidden" name="pattern" value="${esc(s.pattern)}">
        <div class="wz-status sy-pats">${SY_PATTERNS.map(([k, n, h]) => `<button type="button" class="wz-st sy-pat" data-sy-pat="${k}" aria-pressed="${s.pattern === k}"><b>${n}</b><small>${h}</small></button>`).join("")}</div></div>
      <div class="fld"><span>Насколько сильно</span><input type="hidden" name="sev" value="${s.sev || ""}">
        <div class="sy-sevs">${SY_SEV.map(([k, n]) => `<button type="button" class="sy-sevb s${k}" data-sy-sev="${k}" aria-pressed="${s.sev === k}">${n}</button>`).join("")}</div></div>
      <div class="fld"><span>С какого времени</span>
        <div class="sy-since">${csel('name="sy"', years, sy || "")}${csel('name="sm"', months, sm || "")}</div>
        <textarea class="input sy-grow sy-line" name="since" rows="1" placeholder="Уточнение, если есть: после COVID, с детства" autocomplete="off" enterkeyhint="done">${esc(s.since || "")}</textarea></div>
      ${id ? "" : `<div class="fld" data-sy-firstf${s.pattern === "const" ? " hidden" : ""}><span>Когда было последний раз</span>${dfield('name="first"', today, { empty: "Не отмечать", clear: true })}</div>`}
      <label class="fld"><span>Как проявляется</span><textarea class="input sy-grow" name="note" rows="3" placeholder="Где именно, какая боль, когда начинается и проходит">${esc(s.note || "")}</textarea></label>
      <div class="fld"><span>Область</span>${csel('name="zonePick"', [["", "Определится сама"], ...SY_ZONES.map(([k, n]) => [k, n])], s.zone || "")}</div>
      <div class="dlg-foot"><span style="flex:1"></span><button type="button" class="btn ghost" data-xclose>Отмена</button><button type="submit" class="btn primary">Сохранить</button></div>
    </form>`, "st-dlg sy-dlg");
  syGrowAll();
  if (!presetName && !id) setTimeout(() => syF("name")?.focus(), 40);
}
// text fields grow with what is typed instead of scrolling inside a few lines
function syGrow(el) { el.style.height = "auto"; el.style.height = el.scrollHeight + el.offsetHeight - el.clientHeight + "px"; }
const syGrowAll = () => requestAnimationFrame(() => $$("#xDlg .sy-grow").forEach(syGrow));
function sySetPattern(k) {
  syF("pattern").value = k;
  $$("[data-sy-pat]").forEach(b => b.setAttribute("aria-pressed", b.dataset.syPat === k));
  const first = $("[data-sy-firstf]"); if (first) first.hidden = k === "const";
}
function sySetCsel(name, value, label) {
  const c = syF(name)?.closest(".csel"); if (!c) return;
  $("input", c).value = value; $("[data-csel-open] span", c).textContent = label;
  $$("[data-csel-v]", c).forEach(b => b.setAttribute("aria-selected", b.dataset.cselV === value));
}
function saveSymptom() {
  const f = $("[data-sy-form]"), v = Object.fromEntries(new FormData(f)), ed = ui.syEdit;
  const name = v.name.trim(); if (!name) { toast("Напиши, что беспокоит"); syF("name").focus(); return; }
  const p = syPreset(name), zone = v.zonePick || v.zone || p?.zone || "other", prev = ed.id ? state.symptoms[ed.id] : {};
  // month precision keeps an exact day that was already known
  let start = v.sy ? (v.sm ? `${v.sy}-${v.sm}` : v.sy) : "";
  if (start.length === 7 && (prev.start || "").length === 10 && prev.start.startsWith(start)) start = prev.start;
  // the same complaint again (not closed) is a new episode, not a second card
  const same = !ed.id && syList().find(s => norm(s.name) === norm(name) && !s.end);
  if (same) { syAddEntry(same.id, { d: v.first || todayISO(), sev: v.sev, note: v.note.trim() }); openSymptom(same.id); toast(`Записано в «${same.name}»`); return; }
  const id = ed.id || newId("sy");
  const sym = { ...prev, name, zone, pattern: v.pattern, sev: +v.sev || 0, start, since: v.since.trim(), note: v.note.trim(), sit: v.sit || p?.sit || prev.sit || "", end: prev.end || "" };
  if (!ed.id) { sym.log = v.pattern !== "const" && v.first ? [{ d: v.first, sev: +v.sev || 0, t: Date.now() }] : []; sym.tried = []; sym.trig = []; }
  state.symptoms ||= {}; state.symptoms[id] = sym;
  save(); renderAll(); openSymptom(id);
  toast(ed.id ? "Симптом сохранён" : `Записано: ${name}`);
}

/* ---------- wiring ---------- */
function initSymptoms() {
  const page = $("#symptomsView");
  const rowAct = e => { const r = e.target.closest("[data-sy]"); if (r) { ui.confirmSy = null; ui.syAllLog = false; openSymptom(r.dataset.sy); } };
  page.addEventListener("click", e => {
    const t = e.target;
    const n = t.closest("[data-sy-new]"); if (n) { openSymptomForm(null, n.dataset.syNew || undefined); return; }
    const tap = t.closest("[data-sy-tap]"); if (tap) { syTap(tap.dataset.syTap, syDayISO()); return; }
    const day = t.closest("[data-sy-day]"); if (day) { ui.syDay = +day.dataset.syDay; renderSymptoms(); return; }
    if (t.closest("[data-sy-anam]")) { openAnamnesis(); return; }
    if (t.closest("[data-sy-anamfull]")) { ui.syAnamFull = !ui.syAnamFull; renderSymptoms(); return; }
    if (t.closest(".sy-past summary")) { ui.syPastOpen = !t.closest("details").open; return; }
    rowAct(e);
  });
  page.addEventListener("keydown", e => { if ((e.key === "Enter" || e.key === " ") && e.target.matches(".sy-row")) { e.preventDefault(); rowAct(e); } });

  const xd = $("#xDlg");
  const cur = () => state.symptoms[ui.syOpen];
  const reopen = () => { save(); renderAll(); openSymptom(ui.syOpen); };
  xd.addEventListener("click", e => {
    const t = e.target;
    if (!xd.classList.contains("sy-dlg")) return;
    const ed = t.closest("[data-sy-edit]"); if (ed) { openSymptomForm(ed.dataset.syEdit); return; }
    const del = t.closest("[data-sy-del]");
    if (del) { const id = del.dataset.syDel; if (ui.confirmSy !== id) { ui.confirmSy = id; del.textContent = "Точно удалить?"; return; } ui.confirmSy = null; delete state.symptoms[id]; save(); renderAll(); closeX(); toast("Симптом удалён"); return; }
    const en = t.closest("[data-sy-end]");
    if (en) { const s = state.symptoms[en.dataset.syEnd], was = syPast(s); s.end = was ? "" : todayISO(); save(); renderAll(); openSymptom(en.dataset.syEnd); toast(was ? "Снова в списке «Беспокоит сейчас»" : "Отмечено, что прошло"); return; }
    const sit = t.closest("[data-sy-sit]"); if (sit) { closeX(); setView("labs"); setSit(sit.dataset.sySit); $(".toolbar")?.scrollIntoView({ behavior: "smooth", block: "start" }); return; }
    if (t.closest("[data-sy-alllog]")) { ui.syAllLog = true; openSymptom(ui.syOpen); return; }
    const ld = t.closest("[data-sy-ldel]");
    if (ld) { const [d, tt] = ld.dataset.syLdel.split("|"), s = cur(); const i = s.log.findIndex(x => x.d === d && String(x.t || "") === tt); if (i >= 0) s.log.splice(i, 1); reopen(); return; }
    const ls = t.closest("[data-sy-lsev]");
    if (ls) { $("[data-sy-logf] [name=sev]").value = ls.dataset.syLsev; $$("[data-sy-lsev]").forEach(b => b.setAttribute("aria-pressed", b === ls)); return; }
    const du = t.closest("[data-sy-dur]");
    if (du) { $("[data-sy-logf] [name=dur]").value = du.dataset.syDur; $$("[data-sy-dur]").forEach(b => b.setAttribute("aria-pressed", b === du)); return; }
    const ef = t.closest("[data-sy-eff]");
    if (ef) {
      // pressing the chosen effect again clears it; updated in place so the sheet does not jump
      const [i, k] = ef.dataset.syEff.split("|"), x = cur().tried[+i]; x.eff = x.eff === k ? "" : k;
      $$("[data-sy-eff]", ef.parentElement).forEach(b => b.setAttribute("aria-pressed", b.dataset.syEff === `${i}|${x.eff}`));
      save(); renderSymptoms(); return;
    }
    const td = t.closest("[data-sy-tdel]"); if (td) { cur().tried.splice(+td.dataset.syTdel, 1); reopen(); return; }
    const tr = t.closest("[data-sy-trdel]"); if (tr) { cur().trig.splice(+tr.dataset.syTrdel, 1); reopen(); return; }
    if (!$("[data-sy-form]")) return;
    const pt = t.closest("[data-sy-pat]"); if (pt) { sySetPattern(pt.dataset.syPat); return; }
    const sv = t.closest("[data-sy-sev]");
    if (sv) { const on = syF("sev").value !== sv.dataset.sySev; syF("sev").value = on ? sv.dataset.sySev : ""; $$("[data-sy-sev]").forEach(b => b.setAttribute("aria-pressed", on && b === sv)); return; }
  });
  xd.addEventListener("input", e => {
    if (e.target.matches(".sy-grow")) {
      // name and the onset note are one line of meaning: wrap on screen, but no line breaks (pasted ones too)
      if (e.target.matches(".sy-name, .sy-line") && e.target.value.includes("\n")) e.target.value = e.target.value.replace(/\s*\n+\s*/g, " ");
      syGrow(e.target);
    }
    if (!e.target.closest("[data-sy-form]") || e.target.name !== "name") return;
    const p = syPreset(e.target.value);
    if (p) { syF("zone").value = p.zone; syF("sit").value = p.sit; } else if (!ui.syEdit.id) syF("sit").value = "";
  });
  xd.addEventListener("keydown", e => {
    if (e.key !== "Enter" || !e.target.matches("input, .sy-name, .sy-line") || e.target.matches(".cal-type")) return;
    if (e.target.closest("[data-sy-form]")) { e.preventDefault(); saveSymptom(); }
    else if (e.target.closest("[data-sy-logf]")) { e.preventDefault(); $("[data-sy-logf]").requestSubmit(); }
  });
  xd.addEventListener("submit", e => {
    const f = e.target, v = Object.fromEntries(new FormData(f));
    if (f.matches("[data-sy-form]")) { e.preventDefault(); saveSymptom(); return; }
    if (f.matches("[data-sy-anamf]")) {
      e.preventDefault();
      state.prefs ||= {}; state.prefs.anamnesis = Object.fromEntries(SY_ANAM.map(([k]) => [k, (v[k] || "").trim()]));
      save(); renderAll(); closeX(); toast("История болезни сохранена"); return;
    }
    if (!f.closest(".sy-dlg") || !ui.syOpen) return;
    const s = cur(); if (!s) return;
    if (f.matches("[data-sy-logf]")) {
      e.preventDefault();
      if (!v.d) { toast("Выбери дату"); return; }
      syAddEntry(ui.syOpen, { d: v.d, sev: v.sev, dur: v.dur, trig: v.trig?.trim(), help: v.help?.trim(), note: v.note?.trim() });
      openSymptom(ui.syOpen); toast(`${s.name}: записано за ${fmtDate(v.d)}`);
      return;
    }
    if (f.matches("[data-sy-tadd]")) {
      e.preventDefault();
      const name = (v.name || "").trim(); if (!name) return;
      const had = (s.tried || []).find(x => norm(x.name) === norm(name));
      if (had) { if (v.note.trim()) had.note = v.note.trim(); } else s.tried = [...(s.tried || []), { name, eff: "", note: (v.note || "").trim() }];
      reopen(); $("[data-sy-tadd] [name=name]")?.focus(); return;
    }
    if (f.matches("[data-sy-tradd]")) {
      e.preventDefault();
      const tx = (v.t || "").trim(); if (!tx) return;
      if (!(s.trig || []).some(x => norm(x) === norm(tx))) s.trig = [...(s.trig || []), tx];
      reopen(); $("[data-sy-tradd] [name=t]")?.focus();
    }
  });
}
