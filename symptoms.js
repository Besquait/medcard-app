// Symptoms tab: what the person feels — headaches, ringing ears, sore eyes, a clicking knee.
// One record per complaint. How it behaves decides how it is tracked:
//   once  — happened once (a toothache); counts as past two weeks after the last entry
//   recur — comes and goes (headaches); every episode is a dated entry with how long it lasted
//   const — there all the time (ringing ears); entries are optional check-ins of how strong it is that day
// Around each complaint: when it started (a year is enough), how it shows, what was tried and whether it
// helped, what sets it off. A complaint can be marked as main. The page shows the main ones first, then every
// complaint under its organ; the doctor report keeps that order: main complaints, then the rest by organ system.
// One complaint opens as a card with tabs: overview, marks, what affects it, related tests and studies.
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
// complaints written in own words get their organ from the words: stems matched at the start of a word,
// the zone with most hits wins. "other" set by hand (zoneHand) is kept as is.
const SY_ZONE_WORDS = {
  head: ["голов", "мигрен", "виск", "затыл", "темечк", "темя"],
  ent: ["уш", "ухо", "уха", "ухе", "нос", "насморк", "сопл", "слиз", "горл", "глота", "гланд", "миндал", "кашл", "кашел", "звук", "храп", "чиха", "пазух", "гаймор", "заложен", "звон", "сморк", "высморк"],
  eyes: ["глаз", "зрени", "мушк", "век", "слез", "светочувств"],
  teeth: ["зуб", "десн", "челюст", "рот", "рту", "язык", "слюн"],
  heart: ["сердц", "сердеч", "пульс", "давлен", "одышк", "груд", "задыха", "дыха", "отек"],
  gut: ["живот", "желуд", "изжог", "тошн", "вздут", "стул", "запор", "понос", "диаре", "кишеч", "отрыж", "рвот", "печен", "газ"],
  mind: ["тревог", "паник", "панич", "сон", "сплю", "спать", "бессон", "настроен", "депресс", "апати", "мотивац", "сонлив", "устал", "раздраж"],
  joints: ["спин", "поясниц", "шея", "шеи", "шее", "шею", "шейн", "сустав", "колен", "плеч", "локт", "хруст", "мышц", "судорог", "онеме", "немеют", "лопат", "позвон", "кисть", "пальц"],
  skin: ["кож", "сып", "зуд", "чеш", "акне", "прыщ", "волос", "ногт", "перхот", "пятн"],
  uro: ["моч", "писа", "туалет", "либид", "потенц", "почк", "эрекц"],
};
const SY_ZONE_RE = Object.fromEntries(Object.entries(SY_ZONE_WORDS).map(([z, w]) => [z, new RegExp(`(?:^|[^а-я])(?:${w.join("|")})`, "g")]));
function syGuessZone(text) {
  const t = String(text || "").toLowerCase().replace(/ё/g, "е");
  let best = "other", top = 0;
  for (const [z, re] of Object.entries(SY_ZONE_RE)) { const n = (t.match(re) || []).length; if (n > top) { top = n; best = z; } }
  return best;
}
const syZoneOf = s => SY_ZONE[s.zone] && (s.zone !== "other" || s.zoneHand) ? s.zone : syGuessZone(s.name) !== "other" ? syGuessZone(s.name) : syGuessZone(s.note);
const syAnam = () => state.prefs?.anamnesis || {};
const syAnamHas = () => SY_ANAM.some(([k]) => (syAnam()[k] || "").trim());

// past: closed by hand, or a one-off complaint two weeks after its last entry.
// A recurring one is never hidden by itself: a forgotten diary must not drop a real complaint from the list.
const syPast = s => !!s.end || (s.pattern === "once" && (syAgoDays(s) ?? 0) > SY_ONCE_DAYS);
const syQuiet = s => !s.end && s.pattern === "recur" && (syAgoDays(s) ?? 0) > SY_QUIET_DAYS;
// severity: the latest rated entry wins, otherwise the one set in the form
const sySev = s => { const l = syLog(s).filter(e => e.sev); return l.length ? l[l.length - 1].sev : s.sev || 0; };
const syOrder = (a, b) => SY_ZONE_ORDER[syZoneOf(a)] - SY_ZONE_ORDER[syZoneOf(b)] || !!b.main - !!a.main || sySev(b) - sySev(a) || a.name.localeCompare(b.name, "ru");
const syByWeight = (a, b) => sySev(b) - sySev(a) || syOrder(a, b);

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
// one short line under the name: how it behaves, without the long onset notes (those stay in the card)
function syShort(s) {
  if (s.end) return `прошло ${fmtDate(s.end)}`;
  const last = syLast(s), shortSince = s.since && s.since.length <= 24 ? s.since : "";
  if (s.pattern === "once") return last ? `разово · ${longDate(last)}` : "разово";
  if (s.pattern === "recur") {
    if (!last) return ["приступами", syAge(s) || (s.start ? syOnset(s) : shortSince)].filter(Boolean).join(" · ");
    const n = syCount(s, 30);
    return `приступами · ${n ? `${n} ${plural(n, "раз", "раза", "раз")} за 30 дней` : `последний ${syAgo(last)}`}`;
  }
  return ["постоянно", syAge(s) || shortSince].filter(Boolean).join(" · ");
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
        <button type="button" class="btn primary" data-sy-new>Добавить симптом</button>
      </div>
      ${syAnamCard()}`;
    return;
  }
  const now = all.filter(s => !syPast(s)).sort(syOrder);
  const past = all.filter(syPast).sort((a, b) => (b.end || syLast(b) || "").localeCompare(a.end || syLast(a) || ""));
  const main = now.filter(s => s.main).sort(syByWeight);
  const strong = now.filter(s => sySev(s) === 3).length;
  const eps = now.reduce((n, s) => n + (s.pattern === "const" ? 0 : syCount(s, 30)), 0);
  const sub = [`${now.length} ${plural(now.length, "жалоба", "жалобы", "жалоб")} сейчас`, strong ? `${strong} ${plural(strong, "сильная", "сильные", "сильных")}` : "",
    eps ? `${eps} ${plural(eps, "приступ", "приступа", "приступов")} за 30 дней` : "", past.length ? `${past.length} прошло` : ""].filter(Boolean).join(" · ");
  box.innerHTML = `
    <div class="st-head">
      <div><h2>Симптомы</h2><p class="st-sub">${sub}</p></div>
      <div class="sy-hbtns"><button type="button" class="btn" data-sy-report>Сводка для врача</button><button type="button" class="btn primary" data-sy-new>Добавить</button></div>
    </div>
    ${"" /* daily check-in (syToday) and the four-week diary (syDiary) are hidden for now: they got in the way */}
    ${main.length ? syGroup("Главное", main, true) : now.length > 3 ? `<p class="sy-tip">Открой жалобу и нажми «☆ Главное» — главные встанут сюда и первыми пойдут в сводку для врача.</p>` : ""}
    ${now.length ? `<div class="sy-organs">${SY_ZONES.map(([z, n]) => { const l = now.filter(s => syZoneOf(s) === z); return l.length ? syGroup(n, l) : ""; }).join("")}</div>`
      : `<div class="empty">Сейчас ничего не беспокоит.</div>`}
    ${syAnamCard()}
    ${past.length ? `<details class="sy-past"${ui.syPastOpen ? " open" : ""}><summary class="st-year">Прошло · ${past.length}</summary><div class="card st-list">${past.map(s => syRow(s)).join("")}</div></details>` : ""}`;
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
// one card per organ; in the "main" card each row also names its organ
const syGroup = (title, list, main) => `<section class="card sy-group${main ? " sy-maing" : ""}" aria-label="${esc(title)}">
  <h3 class="sy-ghd">${main ? "★ " : ""}${esc(title)}<span class="num">${list.length}</span></h3>
  <div class="st-list">${list.map(s => syRow(s, main)).join("")}</div></section>`;
// last 14 days as small ticks, filled on days with an episode
function syTicks(s) {
  const by = syDays(s); let out = "";
  for (let i = 13; i >= 0; i--) { const d = addDaysISO(todayISO(), -i); out += `<i class="${syCls(by[d])}" title="${fmtDate(d)}"></i>`; }
  return `<span class="sy-ticks" aria-hidden="true">${out}</span>`;
}
function syRow(s, inMain) {
  const past = syPast(s), sev = past ? 0 : sySev(s);
  const meta = [inMain ? SY_ZONE[syZoneOf(s)] : "", syShort(s)].filter(Boolean).join(" · ");
  const side = syQuiet(s) ? `<span class="sy-quiet">давно не отмечал</span>` : s.pattern === "recur" && !past && syDaysIn(s, 14) ? syTicks(s) : "";
  return `<div class="sy-row${past ? " past" : ""}" role="button" tabindex="0" data-sy="${esc(s.id)}">
    ${syDot(sev)}
    <span class="st-main">
      <b class="st-title">${esc(s.name)}${s.main && !inMain && !past ? `<span class="sy-star" aria-label="главное">★</span>` : ""}</b>
      <span class="sy-when">${esc(meta)}</span>
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
/* ---------- one complaint: related tests and studies ---------- */
// the usual test plan for an organ when the complaint has none of its own; "-" means "no plan" chosen by hand
const SY_ZONE_SIT = { head: "Головные боли", heart: "Сердце и сосуды", gut: "ЖКТ и живот", mind: "Тревога и настроение", joints: "Суставы", skin: "Кожа и акне", uro: "Почки", other: "Усталость и слабость" };
const sySit = s => s.sit === "-" ? "" : s.sit && window.GUIDES?.[s.sit] ? s.sit : SY_ZONE_SIT[syZoneOf(s)] || "";
// studies of the same organ, matched against the type, the area and the conclusion
const SY_ZONE_STUDY = {
  head: /мрт|кт|головн|невролог|сосуды шеи/i, ent: /лор|пазух|нос|ух[оа]|горл|аудиом|сурдолог/i, eyes: /офтальм|глаз|окулист/i,
  teeth: /стомат|зуб|челюст|ортодонт/i, heart: /экг|эхокг|холтер|сердц|кардиол/i,
  gut: /гастроскоп|колоноскоп|брюшн|печен|желч|желуд|пищевод|гастроэнт/i, mind: /психиатр|психотерап|невролог/i,
  joints: /позвоноч|сустав|ревмат|ортопед|шея/i, skin: /дерматол|кож/i, uro: /почк|мочев|простат|уролог/i, other: /эндокрин|щитов/i,
};
// tests from the plan (first and second step) plus the ones attached by hand; taken ones with worse results first
function syTests(s) {
  const sit = sySit(s), g = sit && window.GUIDES?.[sit], own = s.labs || [];
  const plan = g ? ["core", "then"].flatMap(k => (g[k] || []).flatMap(it => it[0])) : [];
  const bm = byMarker(), ids = [...new Set([...own, ...plan])];
  const rank = id => { const l = bm[id], st = status(l[l.length - 1]); return st === "high" || st === "low" ? 0 : st === "edge" ? 1 : st === "ok" ? 2 : 3; };
  const taken = ids.filter(id => bm[id]).sort((a, b) => rank(a) - rank(b));
  // a first-step item lists alternatives (breath test or stool antigen): one taken covers the item
  const missing = [...new Set([...own.filter(id => !bm[id]), ...(g?.core || []).map(it => it[0]).filter(gr => !gr.some(id => bm[id])).flat()])];
  const re = SY_ZONE_STUDY[syZoneOf(s)];
  const studies = typeof studyList === "function" ? studyList().filter(st => (re && re.test([ST[st.type]?.name, st.area, st.conclusion].join(" "))) || (st.links || []).some(id => ids.includes(id))) : [];
  return { sit, own, bm, taken, missing, studies };
}
function syTestsTab(s, t) {
  const plan = csel('name="sySit"', [["-", "Без плана"], ...Object.keys(window.GUIDES || {}).map(k => [k, k])], t.sit || "-");
  const row = id => {
    const l = t.bm[id], x = l[l.length - 1], st = status(x) || "none", m = info(id);
    return `<div class="sy-mkr"><button type="button" class="sy-mk ${st}" data-sy-mk="${esc(id)}"><span class="sy-mkn">${esc(m.ru)}</span>
      <span class="sy-mkv num">${fmt(x.v)} <small>${esc(x.unit || "")}</small></span><span class="sy-mks">${esc([STATUS_TXT[st], fmtDate(x.date)].filter(Boolean).join(" · "))}</span></button>
      ${t.own.includes(id) ? `<button type="button" class="icon-btn sm" data-sy-mkdel="${esc(id)}" aria-label="Открепить: ${esc(m.ru)}">×</button>` : ""}</div>`;
  };
  return `<section class="st-sec"><div class="sy-plan"><span>План анализов</span>${plan}</div>
      ${t.taken.length ? `<div class="sy-mks-list">${t.taken.map(row).join("")}</div>`
        : `<p class="muted sy-hint">${t.sit ? "Анализов из этого плана ещё нет." : "Для этой жалобы нет готового плана. Выбери план выше или прикрепи анализ."}</p>`}
      ${t.missing.length ? `<div class="sy-miss"><span>Не сдавал:</span>${t.missing.map(id => `<button type="button" class="tchip" data-sy-mkinfo="${esc(id)}">${esc(info(id).ru)}</button>`).join("")}</div>` : ""}
      <div class="sy-tbtns">${t.sit ? `<button type="button" class="btn sm" data-sy-sit="${esc(t.sit)}">Весь план: ${esc(t.sit.toLowerCase())}</button>` : ""}
        <button type="button" class="btn sm ghost" data-sy-addopen="labs" aria-expanded="${ui.syAddOpen === "labs"}">+ Прикрепить анализ</button></div>
      <form class="sy-addf" data-sy-mkadd${ui.syAddOpen === "labs" ? "" : " hidden"}><input class="input" name="q" list="syMkAll" placeholder="Название, например ферритин" autocomplete="off"><button type="submit" class="btn">Прикрепить</button>
        <datalist id="syMkAll">${(window.CATALOG || []).map(m => `<option value="${esc(m.ru)}">`).join("")}</datalist></form>
    </section>
    ${t.studies.length ? `<section class="st-sec"><h4>Обследования · ${t.studies.length}</h4><div class="sy-mks-list">${t.studies.map(st => `<div class="sy-mkr"><button type="button" class="sy-mk ${st.status === "find" ? "high" : st.status === "watch" ? "edge" : ""}" data-sy-study="${esc(st.id)}">
      <span class="sy-mkn">${esc(studyTitle(st))}</span><span class="sy-mkv num">${fmtDate(st.date)}</span>
      <span class="sy-mks">${esc([STATUS_NAME[st.status], (st.conclusion || "").split("\n")[0]].filter(Boolean).join(" · "))}</span></button></div>`).join("")}</div></section>` : ""}`;
}

function openSymptom(id) {
  const s = state.symptoms?.[id]; if (!s) return;
  const past = syPast(s), quiet = syQuiet(s), log = syLog(s).reverse(), sev = sySev(s), last = syLast(s);
  const shown = ui.syAllLog ? log : log.slice(0, 8);
  const tried = s.tried || [], trig = s.trig || [];
  const onset = syOnsetFull(s).join(" · ");
  const today = todayISO(), todayE = (s.log || []).filter(e => e.d === today).pop();
  const tests = syTests(s);
  ui.syOpen = id;
  const tab = ["over", "log", "care", "labs"].includes(ui.syTab) ? ui.syTab : "over";
  const status = past ? `<span class="st-status"><i></i>Прошло</span>` : quiet ? `<span class="st-status watch"><i></i>Давно не было</span>` : `<span class="st-status find"><i></i>Беспокоит</span>`;
  const entry = e => [syDurText(e.dur), e.note, e.trig && `спровоцировало: ${e.trig}`, e.help && `помогло: ${e.help}`].filter(Boolean).join(" · ");
  const heatCap = s.pattern === "const" ? "16 недель: столбец — неделя, сверху понедельник. Цвет — как было в этот день." : "16 недель: столбец — неделя, сверху понедельник. Цвет — сила, серый — сила не указана.";
  const fields = `<input class="input" name="trig" placeholder="Что спровоцировало" list="syTrigList" autocomplete="off">
      <input class="input" name="help" placeholder="Что помогло" autocomplete="off">
      <textarea class="input sy-grow" name="note" rows="2" placeholder="Заметка: как было, что ещё заметил"></textarea>
      <datalist id="syTrigList">${trig.map(t => `<option value="${esc(t)}">`).join("")}</datalist>`;
  const logForm = open => `<form class="sy-logf" data-sy-logf>
      <div class="sy-logrow">${dfield('name="d"', today)}
        <div class="sy-sevs">${SY_SEV.map(([k, n]) => `<button type="button" class="sy-sevb s${k}" data-sy-lsev="${k}" aria-pressed="${k === (sev || 2)}">${n}</button>`).join("")}</div>
        <input type="hidden" name="sev" value="${sev || 2}"></div>
      ${s.pattern !== "const" ? `<div class="tchips sy-durs" role="group" aria-label="Сколько длилось">${SY_DUR.map(([k, n]) => `<button type="button" class="tchip" data-sy-dur="${k}" aria-pressed="${k === 1}">${n}</button>`).join("")}</div><input type="hidden" name="dur" value="1">` : ""}
      ${open ? fields : `<details class="sy-moref"><summary>Подробности: что спровоцировало, что помогло</summary>${fields}</details>`}
      <div><button type="submit" class="btn primary">Записать</button></div>
      ${s.pattern === "once" ? `<p class="muted sy-hint">После записи в другой день симптом станет «приступами» — будет видно, как часто повторяется.</p>` : ""}
    </form>`;
  const addBtn = k => `<button type="button" class="btn sm ghost" data-sy-addopen="${k}" aria-expanded="${ui.syAddOpen === k}">+ Добавить</button>`;
  const body = {
    // what it is and the one thing done most often: today's mark or a new episode
    over: () => `${s.note ? `<section class="st-sec"><h4>Как проявляется</h4><p class="st-text">${esc(s.note)}</p></section>` : ""}
      ${s.pattern === "const" ? `<section class="st-sec"><h4>Как сегодня</h4>
        <div class="sy-sevs sy-now" role="group" aria-label="Как сегодня">${SY_SEV.map(([k, n]) => `<button type="button" class="sy-sevb s${k}" data-sy-today="${k}" aria-pressed="${todayE?.sev === k}">${n}</button>`).join("")}</div>
        <p class="muted sy-hint">${todayE ? "Сегодня отмечено. Нажми ту же кнопку ещё раз, чтобы снять." : "Одно нажатие — и день отмечен. По таким отметкам видно, лучше становится или хуже."}</p></section>`
        : `<section class="st-sec"><h4>${s.pattern === "once" ? "Было ещё раз?" : "Отметить приступ"}</h4>${logForm(false)}</section>`}`,
    log: () => `${s.pattern === "recur" && log.length ? `<section class="st-sec"><h4>Как часто</h4>
        <div class="sy-stats"><div><b class="num">${syCount(s, 30)}</b><span>приступов за 30 дней</span></div><div><b class="num">${syDaysIn(s, 30)}</b><span>дней с симптомом за 30</span></div><div><b>${esc(syAgo(last))}</b><span>последний раз</span></div></div></section>` : ""}
      ${log.length ? `<section class="st-sec">${syHeat(s)}<p class="muted sy-heatcap">${heatCap}</p></section>` : ""}
      ${s.pattern === "const" ? `<details class="sy-moref sy-other"><summary>Отметить другой день или с заметкой</summary>${logForm(true)}</details>` : ""}
      ${log.length ? `<section class="st-sec"><h4>${s.pattern === "const" ? "Отметки" : "Когда было"} · ${log.length}</h4><div class="sy-log">${shown.map(e => `<div class="sy-lrow">${syDot(e.sev)}<span class="num">${fmtDate(e.d)}</span><span class="sy-lnote">${e.sev ? `<b class="sy-sev s${e.sev}">${esc(SY_SEV_NAME[e.sev])}</b>${entry(e) ? " · " : ""}` : ""}${esc(entry(e))}</span><button type="button" class="icon-btn sm" data-sy-ldel="${esc(e.d)}|${esc(e.t || "")}" aria-label="Удалить запись">×</button></div>`).join("")}</div>
        ${log.length > shown.length ? `<button type="button" class="btn sm ghost" data-sy-alllog>Показать все ${log.length}</button>` : ""}</section>`
        : `<p class="muted sy-hint">${s.pattern === "const" ? "Отметок пока нет. Отмечай на вкладке «Обзор», как сегодня, — здесь появится картина по дням." : "Приступов пока не отмечено."}</p>`}`,
    care: () => `<section class="st-sec"><div class="sy-sech"><h4>Что пробовал${tried.length ? ` · ${tried.length}` : ""}</h4>${addBtn("tried")}</div>
      ${tried.length ? `<div class="sy-tried">${tried.map((x, i) => `<div class="sy-trow"><span class="sy-tname"><b>${esc(x.name)}</b>${x.note ? `<small>${esc(x.note)}</small>` : ""}</span>
        <div class="sy-effs" role="group" aria-label="Как подействовало: ${esc(x.name)}">${SY_EFF.map(([k, n]) => `<button type="button" class="sy-eff e-${k}" data-sy-eff="${i}|${k}" aria-pressed="${x.eff === k}">${n}</button>`).join("")}</div>
        <button type="button" class="icon-btn sm" data-sy-tdel="${i}" aria-label="Убрать: ${esc(x.name)}">×</button></div>`).join("")}</div>`
        : `<p class="muted sy-hint">Лекарства, капли, упражнения, процедуры — и помогло ли. Врачу важно и то, что не помогло.</p>`}
      <form class="sy-addf" data-sy-tadd${ui.syAddOpen === "tried" ? "" : " hidden"}><input class="input" name="name" placeholder="Например: парацетамол 500 мг" autocomplete="off"><input class="input" name="note" placeholder="как принимал — необязательно" autocomplete="off"><button type="submit" class="btn">Добавить</button></form>
    </section>
    <section class="st-sec"><div class="sy-sech"><h4>Что провоцирует${trig.length ? ` · ${trig.length}` : ""}</h4>${addBtn("trig")}</div>
      ${trig.length ? `<div class="tchips sy-trigs">${trig.map((t, i) => `<span class="tchip">${esc(t)}<button type="button" data-sy-trdel="${i}" aria-label="Убрать: ${esc(t)}">×</button></span>`).join("")}</div>`
        : `<p class="muted sy-hint">Запахи, еда, недосып, погода, стресс — что замечаешь перед ухудшением.</p>`}
      <form class="sy-addf" data-sy-tradd${ui.syAddOpen === "trig" ? "" : " hidden"}><input class="input" name="t" placeholder="Например: недосып" autocomplete="off"><button type="submit" class="btn">Добавить</button></form>
    </section>`,
    labs: () => syTestsTab(s, tests),
  };
  const tabs = [["over", "Обзор", 0], ["log", "Отметки", log.length], ["care", "Что влияет", tried.length + trig.length], ["labs", "Анализы", tests.taken.length + tests.studies.length]];
  openX(`<div class="dlg-head"><div><div class="info-group">${esc(SY_ZONE[syZoneOf(s)])}</div><h3>${esc(s.name)}</h3>
      <div class="st-meta">${esc([SY_PATTERN[s.pattern], onset].filter(Boolean).join(" · "))}</div></div>
      <button type="button" class="icon-btn" data-xclose aria-label="Закрыть">×</button></div>
    <div class="st-tags">${status}${sev ? `<span class="sy-sev s${sev}">${esc(SY_SEV_NAME[sev])}</span>` : ""}
      <button type="button" class="sy-mainb" data-sy-main aria-pressed="${!!s.main}">${s.main ? "★ Главное" : "☆ Главное"}</button></div>
    ${quiet ? `<div class="sy-ask"><span>Последний раз отмечено ${esc(longDate(last))}. Прошло?</span><button type="button" class="btn sm" data-sy-end="${esc(id)}">Да, прошло</button></div>` : ""}
    <div class="sy-tabs" role="tablist">${tabs.map(([k, n, c]) => `<button type="button" role="tab" data-sy-tab="${k}" aria-selected="${tab === k}">${n}${c ? `<span class="num">${c}</span>` : ""}</button>`).join("")}</div>
    <div class="sy-tabc" role="tabpanel">${body[tab]()}</div>
    <div class="dlg-foot"><span style="flex:1"></span>
      <button type="button" class="btn ghost" data-sy-end="${esc(id)}">${past ? "Снова беспокоит" : "Прошло"}</button>
      <button type="button" class="btn primary" data-sy-edit="${esc(id)}">Изменить</button></div>`, "st-dlg sy-dlg");
}
// redraw the open card after a change without jumping back to its top
function syReopen() {
  const d = $("#xDlg"), y = d.scrollTop;
  openSymptom(ui.syOpen);
  d.scrollTop = y;
}

/* ---------- doctor report ---------- */
// current complaints first, then those that passed within the report period
function symptomsReport(from) {
  const l = syList().filter(s => !syPast(s) || (s.end || syLast(s) || "") >= from);
  if (!l.length) return "";
  const freq = s => s.pattern === "const" ? "постоянно" : s.pattern === "once" ? "разово" : syLast(s) ? `приступами: ${syCount(s, 30)} за 30 дней, ${syCount(s, 90)} за 90; последний ${fmtDate(syLast(s))}` : "приступами";
  const tried = s => (s.tried || []).map(x => `${esc(x.name)}${x.eff ? ` — ${esc(SY_EFF_NAME[x.eff].toLowerCase())}` : ""}`).join("<br>");
  const row = (s, zone) => `<tr>
    <td><b>${esc(s.name)}</b>${sySev(s) ? ` <small>${esc(SY_SEV_NAME[sySev(s)].toLowerCase())}</small>` : ""}${syPast(s) ? ` <small>прошло${s.end ? " " + fmtDate(s.end) : ""}</small>` : ""}${zone ? `<br><small>${esc(SY_ZONE[syZoneOf(s)])}</small>` : ""}</td>
    <td>${esc(syOnsetFull(s).join(", ")) || "—"}</td><td>${esc(freq(s))}</td><td>${tried(s) || "—"}</td>
    <td>${esc(s.note || "")}${(s.trig || []).length ? `<br><small>Провоцирует: ${esc(s.trig.join(", "))}</small>` : ""}</td></tr>`;
  const table = body => `<table class="rep-t rep-sy"><thead><tr><th>Жалоба</th><th>С какого времени</th><th>Как часто</th><th>Что пробовал</th><th>Подробно</th></tr></thead><tbody>${body}</tbody></table>`;
  const main = l.filter(s => s.main && !syPast(s)).sort(syByWeight);
  const rest = l.filter(s => !main.includes(s));
  const groups = SY_ZONES.map(([z, n]) => [n, rest.filter(s => syZoneOf(s) === z).sort((a, b) => syPast(a) - syPast(b) || syOrder(a, b))]).filter(([, x]) => x.length);
  const restHtml = groups.length ? table(groups.map(([n, x]) => `<tr class="rep-grp"><td colspan="5">${esc(n)}</td></tr>${x.map(s => row(s)).join("")}`).join("")) : "";
  return main.length
    ? `<h5 class="rep-sub">Основные жалобы</h5>${table(main.map(s => row(s, true)).join(""))}${restHtml ? `<h5 class="rep-sub">Остальные — по системам</h5>${restHtml}` : ""}`
    : restHtml;
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
      <label class="sy-mainf"><input type="checkbox" name="main"${s.main ? " checked" : ""}><span><b>Главное</b><small>Беспокоит сильнее всего: будет наверху и первым в сводке для врача</small></span></label>
      <div class="fld"><span>С какого времени</span>
        <div class="sy-since">${csel('name="sy"', years, sy || "")}${csel('name="sm"', months, sm || "")}</div>
        <textarea class="input sy-grow sy-line" name="since" rows="1" placeholder="Уточнение, если есть: после COVID, с детства" autocomplete="off" enterkeyhint="done">${esc(s.since || "")}</textarea></div>
      ${id ? "" : `<div class="fld" data-sy-firstf${s.pattern === "const" ? " hidden" : ""}><span>Когда было последний раз</span>${dfield('name="first"', today, { empty: "Не отмечать", clear: true })}</div>`}
      <label class="fld"><span>Как проявляется</span><textarea class="input sy-grow" name="note" rows="3" placeholder="Где именно, какая боль, когда начинается и проходит">${esc(s.note || "")}</textarea></label>
      <div class="fld"><span>Область</span>${csel('name="zonePick"', [["", "Определится сама"], ...SY_ZONES.map(([k, n]) => [k, n])], s.zone && (s.zone !== "other" || s.zoneHand) ? s.zone : "")}</div>
      <div class="dlg-foot">${id ? `<button type="button" class="btn ghost danger" data-sy-del="${esc(id)}">${ui.confirmSy === id ? "Точно удалить?" : "Удалить"}</button>` : ""}<span style="flex:1"></span><button type="button" class="btn ghost" data-xclose>Отмена</button><button type="submit" class="btn primary">Сохранить</button></div>
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
  const p = syPreset(name), zone = v.zonePick || v.zone || p?.zone || syGuessZone(name) !== "other" && syGuessZone(name) || syGuessZone(v.note), prev = ed.id ? state.symptoms[ed.id] : {};
  // month precision keeps an exact day that was already known
  let start = v.sy ? (v.sm ? `${v.sy}-${v.sm}` : v.sy) : "";
  if (start.length === 7 && (prev.start || "").length === 10 && prev.start.startsWith(start)) start = prev.start;
  // the same complaint again (not closed) is a new episode, not a second card
  const same = !ed.id && syList().find(s => norm(s.name) === norm(name) && !s.end);
  if (same) { syAddEntry(same.id, { d: v.first || todayISO(), sev: v.sev, note: v.note.trim() }); openSymptom(same.id); toast(`Записано в «${same.name}»`); return; }
  const id = ed.id || newId("sy");
  const sym = { ...prev, name, zone, zoneHand: v.zonePick === "other", main: !!v.main, pattern: v.pattern, sev: +v.sev || 0, start, since: v.since.trim(), note: v.note.trim(), sit: v.sit || p?.sit || prev.sit || "", end: prev.end || "" };
  if (!ed.id) { sym.log = v.pattern !== "const" && v.first ? [{ d: v.first, sev: +v.sev || 0, t: Date.now() }] : []; sym.tried = []; sym.trig = []; }
  state.symptoms ||= {}; state.symptoms[id] = sym;
  save(); renderAll(); openSymptom(id);
  toast(ed.id ? "Симптом сохранён" : `Записано: ${name}`);
}

/* ---------- wiring ---------- */
function initSymptoms() {
  const page = $("#symptomsView");
  const rowAct = e => { const r = e.target.closest("[data-sy]"); if (r) { ui.confirmSy = null; ui.syAllLog = false; ui.syAddOpen = null; ui.syTab = "over"; openSymptom(r.dataset.sy); } };
  page.addEventListener("click", e => {
    const t = e.target;
    const n = t.closest("[data-sy-new]"); if (n) { openSymptomForm(null, n.dataset.syNew || undefined); return; }
    if (t.closest("[data-sy-report]")) { openReport(); return; }
    const tap = t.closest("[data-sy-tap]"); if (tap) { syTap(tap.dataset.syTap, syDayISO()); return; }
    const day = t.closest("[data-sy-day]"); if (day) { ui.syDay = +day.dataset.syDay; renderSymptoms(); return; }
    const zj = t.closest("[data-sy-zjump]"); if (zj) { $(`#syz-${zj.dataset.syZjump}`)?.scrollIntoView({ behavior: "smooth", block: "start" }); return; }
    if (t.closest("[data-sy-anam]")) { openAnamnesis(); return; }
    if (t.closest("[data-sy-anamfull]")) { ui.syAnamFull = !ui.syAnamFull; renderSymptoms(); return; }
    if (t.closest(".sy-past summary")) { ui.syPastOpen = !t.closest("details").open; return; }
    rowAct(e);
  });
  page.addEventListener("keydown", e => { if ((e.key === "Enter" || e.key === " ") && e.target.matches(".sy-row")) { e.preventDefault(); rowAct(e); } });

  const xd = $("#xDlg");
  const cur = () => state.symptoms[ui.syOpen];
  const reopen = () => { save(); renderAll(); syReopen(); };
  xd.addEventListener("click", e => {
    const t = e.target;
    if (!xd.classList.contains("sy-dlg")) return;
    const ed = t.closest("[data-sy-edit]"); if (ed) { openSymptomForm(ed.dataset.syEdit); return; }
    const del = t.closest("[data-sy-del]");
    if (del) { const id = del.dataset.syDel; if (ui.confirmSy !== id) { ui.confirmSy = id; del.textContent = "Точно удалить?"; return; } ui.confirmSy = null; delete state.symptoms[id]; save(); renderAll(); closeX(); toast("Симптом удалён"); return; }
    const en = t.closest("[data-sy-end]");
    if (en) { const s = state.symptoms[en.dataset.syEnd], was = syPast(s); s.end = was ? "" : todayISO(); save(); renderAll(); openSymptom(en.dataset.syEnd); toast(was ? "Снова в списке «Беспокоит сейчас»" : "Отмечено, что прошло"); return; }
    const sit = t.closest("[data-sy-sit]"); if (sit) { closeX(); setView("labs"); setSit(sit.dataset.sySit); $(".toolbar")?.scrollIntoView({ behavior: "smooth", block: "start" }); return; }
    if (t.closest("[data-sy-alllog]")) { ui.syAllLog = true; syReopen(); return; }
    const tb = t.closest("[data-sy-tab]");
    if (tb) {
      // keep the tab bar where it was; a long tab scrolled down does not drop the next one in its middle
      const d = $("#xDlg"), y = d.scrollTop; ui.syTab = tb.dataset.syTab; ui.syAddOpen = null;
      openSymptom(ui.syOpen); const bar = $(".sy-tabs"); d.scrollTop = Math.min(y, bar ? bar.offsetTop - 12 : 0);
      return;
    }
    const mk = t.closest("[data-sy-mk]"); if (mk) { closeX(); focusRow(mk.dataset.syMk); return; }
    const mi = t.closest("[data-sy-mkinfo]"); if (mi) { openInfo(mi.dataset.syMkinfo); return; }
    const md = t.closest("[data-sy-mkdel]"); if (md) { const s = cur(); s.labs = (s.labs || []).filter(x => x !== md.dataset.syMkdel); reopen(); return; }
    const sd = t.closest("[data-sy-study]"); if (sd) { openStudy(sd.dataset.syStudy); return; }
    if (t.closest("[data-sy-main]")) { const s = cur(); s.main = !s.main; reopen(); toast(s.main ? "Добавлено в главное" : "Убрано из главного"); return; }
    const tdy = t.closest("[data-sy-today]");
    if (tdy) {
      // the same button again clears today's mark, unless it carries a note
      const s = cur(), k = +tdy.dataset.syToday, d = todayISO(), e = (s.log || []).filter(x => x.d === d).pop();
      if (!e) { syAddEntry(ui.syOpen, { d, sev: k }); syReopen(); return; }
      if (e.sev === k && !e.note && !e.trig && !e.help) s.log.splice(s.log.indexOf(e), 1); else e.sev = k;
      reopen(); return;
    }
    const ao = t.closest("[data-sy-addopen]");
    if (ao) {
      const k = ao.dataset.syAddopen, f = $(k === "tried" ? "[data-sy-tadd]" : k === "labs" ? "[data-sy-mkadd]" : "[data-sy-tradd]"), open = f.hidden;
      f.hidden = !open; ui.syAddOpen = open ? k : null; ao.setAttribute("aria-expanded", open);
      if (open) $("input", f).focus();
      return;
    }
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
  // the test plan of the open complaint, picked from the list on the tests tab
  xd.addEventListener("change", e => {
    if (e.target.name !== "sySit" || !ui.syOpen || !xd.classList.contains("sy-dlg")) return;
    const s = cur(); if (!s) return;
    s.sit = e.target.value; reopen();
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
      syReopen(); toast(`${s.name}: записано за ${fmtDate(v.d)}`);
      return;
    }
    if (f.matches("[data-sy-tadd]")) {
      e.preventDefault();
      const name = (v.name || "").trim(); if (!name) return;
      const had = (s.tried || []).find(x => norm(x.name) === norm(name));
      if (had) { if (v.note.trim()) had.note = v.note.trim(); } else s.tried = [...(s.tried || []), { name, eff: "", note: (v.note || "").trim() }];
      reopen(); $("[data-sy-tadd] [name=name]")?.focus(); return;
    }
    if (f.matches("[data-sy-mkadd]")) {
      e.preventDefault();
      const q = (v.q || "").trim(); if (!q) return;
      const m = (window.CATALOG || []).find(x => norm(x.ru) === norm(q)) || (window.CATALOG || []).find(x => matches(info(x.id), q));
      if (!m) { toast("Такого анализа нет в справочнике"); return; }
      if (!(s.labs || []).includes(m.id)) s.labs = [...(s.labs || []), m.id];
      reopen(); toast(`Прикреплено: ${info(m.id).ru}`); return;
    }
    if (f.matches("[data-sy-tradd]")) {
      e.preventDefault();
      const tx = (v.t || "").trim(); if (!tx) return;
      if (!(s.trig || []).some(x => norm(x) === norm(tx))) s.trig = [...(s.trig || []), tx];
      reopen(); $("[data-sy-tradd] [name=t]")?.focus();
    }
  });
}
