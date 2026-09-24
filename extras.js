// Features on top of the core tracker: calculated markers, research-based targets, action thresholds,
// retest reminders, events on charts, change digest, date comparison, heatmap, doctor report, share links.
// Loaded before app.js: only definitions run at load time; initExtras() wires the UI once app.js is ready.
"use strict";

/* ============ calculated markers ============ */
// Built from same-day results already converted to the main unit. A real result of the same marker wins.
const CALCS = [
  { m: "homa", need: ["glu", "ins"], f: v => v.glu * v.ins / 22.5, max: 2.7, how: "глюкоза × инсулин / 22,5" },
  { m: "tg_hdl", need: ["tg", "hdl"], f: v => v.tg / v.hdl, max: 1.3, how: "триглицериды / ЛПВП" },
  { m: "nonhdl", need: ["chol", "hdl"], f: v => v.chol - v.hdl, max: 3.8, how: "общий холестерин − ЛПВП" },
  { m: "nlr", need: ["neut_abs", "lymph_abs"], f: v => v.neut_abs / v.lymph_abs, min: 0.78, max: 3.53, how: "нейтрофилы / лимфоциты" },
  { m: "deritis", need: ["ast", "alt"], f: v => v.ast / v.alt, min: 0.8, max: 2, how: "АСТ / АЛТ" },
  { m: "tsat", need: ["fe", "tibc"], f: v => v.fe / v.tibc * 100, min: 20, max: 45, how: "железо / ОЖСС × 100" },
  { m: "egfr", need: ["crea"], f: (v, date) => egfrCkdEpi(v.crea, date), min: 60, how: "CKD-EPI 2021: креатинин, пол, возраст" },
];
const profile = () => state.prefs?.profile || {};
function egfrCkdEpi(creaUmol, date) {
  const p = profile(); if (!p.sex || !p.born) return null;
  const age = new Date(date).getFullYear() - p.born; if (age < 18 || age > 110) return null;
  const f = p.sex === "f", k = f ? 0.7 : 0.9, a = f ? -0.241 : -0.302, scr = creaUmol / 88.42 / k;
  return 142 * Math.min(scr, 1) ** a * Math.max(scr, 1) ** -1.2 * 0.9938 ** age * (f ? 1.012 : 1);
}
function inMainUnit(r) { const mu = mainUnit(r.m); return !mu.tok || unitKey(r.unit) === unitKey(mu.label); }
function addCalculated(map) {
  const byDate = {};
  for (const [m, list] of Object.entries(map)) for (const r of list) if (isNum(r.v) && r.date && inMainUnit(r)) (byDate[r.date] ||= {})[m] = r.v;
  for (const c of CALCS) for (const [date, v] of Object.entries(byDate)) {
    if (!c.need.every(k => isNum(v[k]) && v[k] !== 0)) continue;
    if ((map[c.m] || []).some(r => r.date === date)) continue;
    const x = c.f(v, date); if (!isNum(x) || x <= 0) continue;
    const r = view(`calc:${c.m}:${date}`, { m: c.m, date, v: +x.toPrecision(3), unit: info(c.m).unit, min: c.min ?? null, max: c.max ?? null, lab: "", note: "рассчитано: " + c.how, t: 0 });
    r.calc = true;
    (map[c.m] ||= []).push(r);
  }
}

/* ============ research-based targets ============ */
// Replace the lab range when a guideline gives a tighter or clearer target (showing one goal range reads better
// than two, JMIR 2018). Values are in the marker's main unit; sex-specific ones need the profile.
const TARGETS = {
  ldl: [{ max: 3.0, t: "низкий риск", src: "ESC/EAS 2019" }, { max: 2.6, t: "умеренный риск", src: "ESC/EAS 2019" }, { max: 1.8, t: "высокий риск", src: "ESC/EAS 2019" }, { max: 1.4, t: "очень высокий риск", src: "ESC/EAS 2019" }],
  nonhdl: [{ max: 3.8, t: "низкий риск", src: "ESC/EAS 2019" }, { max: 3.4, t: "умеренный риск", src: "ESC/EAS 2019" }, { max: 2.6, t: "высокий риск", src: "ESC/EAS 2019" }],
  chol: [{ max: 5.0, t: "желательный уровень", src: "ESC/EAS 2019" }],
  tg: [{ max: 1.7, t: "ниже — меньше риск", src: "ESC/EAS 2019" }],
  hdl: [{ min: 1.0, sex: "m", t: "ниже — выше риск", src: "ESC/EAS 2019" }, { min: 1.2, sex: "f", t: "ниже — выше риск", src: "ESC/EAS 2019" }],
  apob: [{ max: 1.0, t: "умеренный риск", src: "ESC/EAS 2019" }, { max: 0.8, t: "высокий риск", src: "ESC/EAS 2019" }],
  lpa: [{ max: 50, t: "выше — наследственный риск", src: "EAS 2022" }],
  hscrp: [{ max: 1.0, t: "низкий сосудистый риск", src: "AHA/CDC" }, { max: 3.0, t: "средний риск", src: "AHA/CDC" }],
  glu: [{ min: 3.9, max: 5.5, t: "натощак без преддиабета", src: "ADA 2024" }],
  hba1c: [{ max: 5.6, t: "без преддиабета", src: "ADA 2024" }, { max: 7.0, t: "цель при диабете", src: "ADA 2024" }],
  ua: [{ max: 360, t: "цель при подагре", src: "EULAR 2016, ACR 2020" }, { max: 300, t: "при тофусах", src: "EULAR 2016" }],
  alt: [{ max: 33, sex: "m", t: "«здоровая» норма", src: "ACG 2017" }, { max: 25, sex: "f", t: "«здоровая» норма", src: "ACG 2017" }],
  ferritin: [{ min: 30, max: 300, sex: "m", t: "ниже 30 — дефицит железа вероятен", src: "BSG 2021, AGA 2020" }, { min: 30, max: 200, sex: "f", t: "ниже 30 — дефицит железа вероятен", src: "BSG 2021, AGA 2020" }],
  b12: [{ min: 300, t: "ниже — дефицит не исключён", src: "BSH 2014" }],
  vitd: [{ min: 20, max: 50, t: "достаточно для костей", src: "NAM (IOM) 2011" }, { min: 30, max: 60, t: "более строгая цель", src: "Endocrine Society 2011" }],
  testo: [{ min: 12, sex: "m", t: "ниже 12 — пограничный, ниже 8 — дефицит", src: "EAU 2023, ISSAM" }],
  tsh: [{ min: 0.1, max: 2.5, t: "при планировании беременности", src: "ATA 2017", opt: true }],
};
const tgtOf = (m, i) => TARGETS[m]?.[i];
// the preset used when the user has not chosen: first one that fits the profile (sex-specific need the sex)
function defaultTarget(m) {
  const list = TARGETS[m]; if (!list) return null;
  const sex = profile().sex;
  const i = list.findIndex(t => !t.opt && (!t.sex || t.sex === sex));
  return i < 0 ? null : i;
}
// what applies to a marker: {mode: "lab"} | {mode: "preset", i} | {mode: "custom", min, max}
function targetChoice(m) {
  const c = state.prefs?.targets?.[m];
  if (c) return c;
  if (state.prefs?.research === false) return { mode: "lab" };
  const i = defaultTarget(m);
  return i == null ? { mode: "lab" } : { mode: "preset", i, auto: true };
}
function applyTarget(r) {
  const c = targetChoice(r.m);
  if (c.mode === "lab") return r;
  let min, max, label;
  if (c.mode === "custom") { min = c.min ?? null; max = c.max ?? null; label = "своя норма"; }
  else { const t = tgtOf(r.m, c.i); if (!t) return r; min = t.min ?? null; max = t.max ?? null; label = `${t.t} · ${t.src}`; }
  if (!inMainUnit(r)) return r;
  r.labMin = r.min; r.labMax = r.max; r.min = min; r.max = max; r.tgt = label;
  return r;
}

/* ============ action thresholds ("harm anchors") ============ */
// Beyond these a value needs action soon, not just "outside the range" (Zikmund-Fisher, JMIR 2018).
// [low, high, text]; "3x" = three upper limits of the lab range.
const HARM = {
  glu: [3.0, 11.1, "ниже 3,0 — гипогликемия; от 11,1 — уровень диабета"],
  hba1c: [null, 6.5, "от 6,5% — критерий диабета"],
  ldl: [null, 4.9, "от 4,9 — лечение нужно при любом риске (ESC)"],
  chol: [null, 7.5, "от 7,5 — подозрение на наследственную гиперхолестеринемию"],
  tg: [null, 5.6, "от 5,6 — риск панкреатита, нужно лечение"],
  hgb: [80, null, "ниже 80 — срочно к врачу"],
  plt: [50, 1000, "ниже 50 или выше 1000 — срочно к врачу"],
  wbc: [2, 30, "ниже 2 или выше 30 — срочно к врачу"],
  neut_abs: [0.5, null, "ниже 0,5 — высокий риск инфекций"],
  k: [3.0, 6.0, "вне 3,0–6,0 — опасно для сердца"],
  na: [125, 155, "вне 125–155 — срочно к врачу"],
  ca: [1.9, 2.9, "вне 1,9–2,9 — срочно к врачу"],
  alt: [null, "3x", "выше трёх норм — значимое повреждение печени"],
  ast: [null, "3x", "выше трёх норм — значимое повреждение печени"],
  ggt: [null, "3x", "выше трёх норм — нужен врач"],
  tsh: [0.1, 10, "ниже 0,1 или от 10 — обычно нужно лечение"],
  ferritin: [15, 1000, "ниже 15 — дефицит железа точно; выше 1000 — искать причину"],
  vitd: [10, 150, "ниже 10 — выраженный дефицит; выше 150 — риск передозировки"],
  crp: [null, 100, "от 100 — чаще бактериальная инфекция"],
  ua: [null, 480, "от 480 (8 мг/дл) риск подагры и камней резко выше"],
  egfr: [30, null, "ниже 30 — тяжёлое снижение функции почек"],
  prl: [null, 100, "выше 100 — искать аденому гипофиза"],
  testo: [8, null, "ниже 8 — дефицит тестостерона (EAU)"],
  b12: [200, null, "ниже 200 — дефицит B12"],
};
function harmOf(r) {
  const h = HARM[r.m]; if (!h || !inMainUnit(r)) return null;
  const lab = r.tgt ? r.labMax : r.max;
  const hi = typeof h[1] === "string" ? (isNum(lab) ? parseFloat(h[1]) * lab : null) : h[1];
  return { lo: h[0], hi, text: h[2] };
}
function harmHit(r) {
  const h = harmOf(r); if (!h || !isNum(r.v)) return null;
  if (isNum(h.hi) && r.v >= h.hi) return "hi";
  if (isNum(h.lo) && r.v <= h.lo) return "lo";
  return null;
}
const harmBadge = r => harmHit(r) ? `<span class="badge harm" title="${esc(harmOf(r).text)}">⚠ порог действия</span>` : "";

/* ============ dates ============ */
const addMonths = (iso, n) => { const d = new Date(iso + "T00:00:00"); d.setMonth(d.getMonth() + n); return d.toISOString().slice(0, 10); };
const daysBetween = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 864e5);
function spanText(days) {
  const d = Math.abs(days);
  if (d < 31) return `${d} ${plural(d, "день", "дня", "дней")}`;
  const m = Math.round(d / 30.4);
  if (m < 12) return `${m} мес.`;
  const y = Math.floor(m / 12), mm = m % 12;
  return `${y} ${plural(y, "год", "года", "лет")}${mm ? ` ${mm} мес.` : ""}`;
}

/* ============ retest reminders ============ */
// auto: out of range → 3 months to confirm; key markers → once a year; the rest → no reminder
function autoMonths(m, x) { return outside(x) ? 3 : KEY_MARKERS.includes(m) ? 12 : 0; }
function retestPlan() {
  const bm = byMarker(), today = todayISO(), out = [];
  for (const [m, l] of Object.entries(bm)) {
    if (m === "dbp") continue;
    const x = [...l].reverse().find(r => !r.calc); if (!x?.date) continue;
    const custom = state.prefs?.remind?.[m];
    const months = custom ?? autoMonths(m, x); if (!months) continue;
    const due = addMonths(x.date, months);
    out.push({ m, x, months, due, left: daysBetween(today, due), auto: custom == null });
  }
  return out.sort((a, b) => (!!outside(b.x) - !!outside(a.x)) || a.left - b.left);
}
function renderDue() {
  const box = $("#due"); if (!box) return;
  const today = todayISO();
  const st = studyList().filter(s => s.repeat).map(s => ({ s, due: addMonths(s.date, s.repeat) })).map(x => ({ ...x, left: daysBetween(today, x.due) })).filter(x => x.left <= 30);
  const all = [...retestPlan().filter(p => p.left <= 30), ...st].sort((a, b) => a.left - b.left);
  if (!all.length) { box.hidden = true; return; }
  const open = ui.dueOpen, shown = open ? all : all.slice(0, 6);
  box.hidden = false;
  box.innerHTML = `<div class="due-head"><h3>Пора пересдать <span class="cnt num">${all.length}</span></h3>
      <button type="button" class="btn sm ghost" data-ics>Напомнить в календаре</button></div>
    <div class="due-list">${shown.map(p => {
      if (p.s) return `<button type="button" class="due-item st" data-st-open="${esc(p.s.id)}" title="${esc(studyTitle(p.s))} · ${fmtDate(p.s.date)}">${icon(p.s.type)}<span class="due-name">${esc(studyTitle(p.s))}</span><span class="due-when">${p.left < 0 ? `просрочено на ${spanText(p.left)}` : `через ${spanText(p.left)}`}</span></button>`;
      const s = status(p.x) || "none";
      return `<button type="button" class="due-item ${s}" data-goto="${esc(p.m)}" title="Сдавал ${fmtDate(p.x.date)} · интервал ${p.months} мес.${p.auto ? " (авто)" : ""}">
        <i class="gc-dot"></i><span class="due-name">${esc(info(p.m).ru)}</span>
        <span class="due-when">${p.left < 0 ? `просрочено на ${spanText(p.left)}` : p.left === 0 ? "сегодня" : `через ${spanText(p.left)}`}</span></button>`;
    }).join("")}</div>
    ${all.length > 6 ? `<button type="button" class="due-more" data-due-more>${open ? "Свернуть" : `Показать все · ${all.length}`}</button>` : ""}`;
}
function downloadIcs() {
  const due = retestPlan().filter(p => p.left <= 30);
  if (!due.length) return;
  const d = new Date(); d.setDate(d.getDate() + 1);
  const day = d.toISOString().slice(0, 10).replace(/-/g, "");
  const names = due.map(p => info(p.m).ru).join(", ");
  const ics = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Medcard//RU", "BEGIN:VEVENT",
    `UID:medcard-${Date.now()}@medcard`, `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, "").slice(0, 15)}Z`,
    `DTSTART:${day}T080000`, `DTEND:${day}T083000`, "SUMMARY:Сдать анализы",
    `DESCRIPTION:${("Пора пересдать: " + names + ". Большинство анализов — утром натощак.").replace(/[,;]/g, m => "\\" + m)}`,
    "BEGIN:VALARM", "TRIGGER:-PT30M", "ACTION:DISPLAY", "DESCRIPTION:Сдать анализы", "END:VALARM", "END:VEVENT", "END:VCALENDAR"].join("\r\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([ics], { type: "text/calendar" })); a.download = "medcard-retest.ics";
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  toast("Событие на завтра, 8:00 — открой файл, чтобы добавить в календарь");
}

/* ============ per-marker settings under the chart ============ */
function markerSettings(id, list) {
  const x = [...list].reverse().find(r => !r.calc) || list[list.length - 1];
  const c = targetChoice(id), presets = TARGETS[id] || [];
  const sex = profile().sex;
  const lab = x.tgt ? rangeText(x.labMin, x.labMax) : rangeText(x.min, x.max);
  const chip = (on, attrs, label, title = "") => `<button type="button" class="tchip" aria-pressed="${on}" ${attrs} title="${esc(title)}">${label}</button>`;
  const tchips = [
    chip(c.mode === "lab", 'data-tgt="lab"', `Лаборатории${lab ? ` <b>${esc(lab)}</b>` : ""}`, "Норма с бланка"),
    ...presets.map((t, i) => (t.sex && sex && t.sex !== sex) ? "" :
      chip(c.mode === "preset" && c.i === i, `data-tgt="p${i}"`, `${esc(t.t)} <b>${esc(rangeText(t.min ?? null, t.max ?? null))}</b>${t.sex && !sex ? ` <small>${t.sex === "m" ? "муж." : "жен."}</small>` : ""}`, t.src)),
    chip(c.mode === "custom", 'data-tgt="custom"', c.mode === "custom" ? `Своя <b>${esc(rangeText(c.min ?? null, c.max ?? null))}</b>` : "Своя…"),
  ].join("");
  const cur = presets[c.i];
  const months = state.prefs?.remind?.[id], auto = autoMonths(id, x);
  const opt = (v, t) => `<option value="${v}"${String(months ?? "auto") === String(v) ? " selected" : ""}>${t}</option>`;
  return `<div class="dset" data-mid="${esc(id)}">
    <div class="dset-row"><span class="dset-k">Норма</span><div class="tchips">${tchips}</div></div>
    ${c.mode === "preset" && cur ? `<div class="dset-src">Цель из рекомендаций: ${esc(cur.src)}${c.auto ? " · выбрана автоматически" : ""}${cur.sex && !sex ? " · укажи пол в профиле для точной цели" : ""}</div>` : ""}
    ${ui.tgtEdit === id ? `<div class="dset-row"><span class="dset-k"></span><div class="tcustom">
      <input class="input num" data-tmin value="${esc(c.mode === "custom" ? c.min ?? "" : "")}" placeholder="от" inputmode="decimal">
      <span>–</span><input class="input num" data-tmax value="${esc(c.mode === "custom" ? c.max ?? "" : "")}" placeholder="до" inputmode="decimal">
      <span class="muted">${esc(x.unit || "")}</span><button type="button" class="btn sm primary" data-tsave>Применить</button></div></div>` : ""}
    <div class="dset-row"><span class="dset-k">Пересдать</span>
      <select class="input dset-sel" data-remind>${opt("auto", auto ? `авто: через ${auto} мес.` : "авто: не напоминать")}${[1, 3, 6, 12, 24].map(n => opt(n, `через ${n} мес.`)).join("")}${opt(0, "не напоминать")}</select>
      ${(() => { const p = retestPlan().find(q => q.m === id); return p ? `<span class="dset-due ${p.left < 0 ? "late" : ""}">${p.left < 0 ? `просрочено на ${spanText(p.left)}` : `до ${fmtDate(p.due)}`}</span>` : ""; })()}
    </div>
    ${eventsFor(list).length ? `<div class="dset-row"><span class="dset-k">События</span><div class="evchips">${eventsFor(list).map(e => `<button type="button" class="evchip k-${e.kind}" data-ev="${esc(e.id)}">${esc(e.title)} <small>${fmtDate(e.start)}${e.end ? "–" + fmtDate(e.end) : e.end === null ? " → сейчас" : ""}</small></button>`).join("")}</div></div>` : ""}
    ${studiesFor(id).length ? `<div class="dset-row"><span class="dset-k">Обследования</span><div class="evchips">${studiesFor(id).map(s => `<button type="button" class="evchip st-chip" data-st-open="${esc(s.id)}" style="--ev:${ST[s.type]?.color}">${esc(studyTitle(s))} <small>${fmtDate(s.date)}${s.status ? " · " + esc(STATUS_NAME[s.status]) : ""}</small></button>`).join("")}</div></div>` : ""}
    <div class="dset-row"><span class="dset-k"></span><button type="button" class="linkbtn" data-ev-new>+ Отметить событие: лечение, добавка, болезнь</button></div>
  </div>`;
}
function setPref(path, value) {
  state.prefs ||= {};
  const [a, b] = path;
  if (b === undefined) { if (value === undefined) delete state.prefs[a]; else state.prefs[a] = value; }
  else { state.prefs[a] ||= {}; if (value === undefined) delete state.prefs[a][b]; else state.prefs[a][b] = value; }
  save();
}

/* ============ events: treatment, supplements, illness ============ */
const EVENT_KINDS = [["med", "Лекарство"], ["supp", "Добавка"], ["diet", "Питание"], ["ill", "Болезнь"], ["life", "Образ жизни"], ["other", "Другое"]];
const EVENT_KIND = Object.fromEntries(EVENT_KINDS);
const eventList = () => Object.entries(state.events || {}).map(([id, e]) => ({ id, ...e })).sort((a, b) => (b.start || "").localeCompare(a.start || ""));
// events overlapping the period of a marker's history
function eventsFor(list) {
  const ds = list.map(r => r.date).filter(Boolean).sort(); if (!ds.length) return [];
  const from = addMonths(ds[0], -3), to = todayISO();
  return eventList().filter(e => e.start <= to && (e.end ? e.end >= from : true));
}
function chartEvents(t0, t1, xOf, top, bottom) {
  const out = [];
  eventList().forEach((e, i) => {
    const s = Date.parse(e.start), en = e.end ? Date.parse(e.end) : Date.now();
    if (!isFinite(s) || en < t0 || s > t1) return;
    const x0 = xOf(Math.max(s, t0)), x1 = xOf(Math.min(en, t1)), w = Math.max(3, x1 - x0);
    const y = top + 10 + (out.length % 3) * 13;
    out.push(`<g class="ev k-${e.kind}"><title>${esc(`${EVENT_KIND[e.kind] || ""}: ${e.title} · ${fmtDate(e.start)}${e.end ? "–" + fmtDate(e.end) : " → сейчас"}`)}</title>
      <rect x="${x0}" y="${top - 6}" width="${w}" height="${bottom - top + 6}" rx="3" class="ev-band"/>
      <line x1="${x0}" x2="${x0}" y1="${top - 6}" y2="${bottom}" class="ev-edge"/>
      <text x="${x0 + 4}" y="${y}" font-size="10.5" class="ev-t">${esc(e.title.length > 22 ? e.title.slice(0, 21) + "…" : e.title)}</text></g>`);
  });
  return out.join("");
}
function openEvents(editId, focusNew) {
  const e = editId ? { id: editId, ...state.events[editId] } : null;
  const titles = [...new Set(eventList().map(x => x.title))].slice(0, 8);
  const form = (focusNew || e) ? `
    <form class="ev-form" data-ev-form="${esc(e?.id || "")}">
      <label class="fld"><span>Что</span><input class="input" name="title" required value="${esc(e?.title || "")}" placeholder="Например: Железо 100 мг, лечение хеликобактера" autocomplete="off"></label>
      ${!e && titles.length ? `<div class="ev-sugg">${titles.map(t => `<button type="button" class="tchip" data-ev-title="${esc(t)}">${esc(t)}</button>`).join("")}</div>` : ""}
      <div class="fld"><span>Тип</span><div class="tchips">${EVENT_KINDS.map(([k, n]) => `<label class="tchip radio"><input type="radio" name="kind" value="${k}"${(e?.kind || "med") === k ? " checked" : ""}>${n}</label>`).join("")}</div></div>
      <div class="ev-dates">
        <label class="fld"><span>Начало</span><input class="input num" type="date" name="start" required value="${esc(e?.start || todayISO())}"></label>
        <label class="fld"><span>Конец</span><input class="input num" type="date" name="end" value="${esc(e?.end || "")}"></label>
        <label class="ev-now"><input type="checkbox" name="ongoing"${!e || !e.end ? " checked" : ""}> продолжается</label>
      </div>
      <label class="fld"><span>Заметка</span><input class="input" name="note" value="${esc(e?.note || "")}" placeholder="доза, схема, кто назначил"></label>
      <div class="dlg-foot">${e ? `<button type="button" class="btn ghost danger" data-ev-del="${esc(e.id)}">${ui.confirmEv === e.id ? "Точно удалить?" : "Удалить"}</button>` : ""}<span style="flex:1"></span>
        <button type="button" class="btn ghost" data-ev-list>Отмена</button><button type="submit" class="btn primary">Сохранить</button></div>
    </form>` : "";
  const list = eventList();
  openX(`<div class="dlg-head"><h3>События и лечение</h3><button type="button" class="icon-btn" data-xclose aria-label="Закрыть">×</button></div>
    <p class="x-lead">Отмечай, когда начал лекарство или добавку, болел, менял питание. Отметки появятся полосами на графиках — видно, повлияло ли.</p>
    ${form || `<button type="button" class="btn primary" data-ev-new>+ Новое событие</button>`}
    ${!form ? (list.length ? `<div class="ev-list">${list.map(x => `<button type="button" class="ev-row k-${x.kind}" data-ev="${esc(x.id)}">
        <i></i><span class="ev-main"><b>${esc(x.title)}</b><span>${esc(EVENT_KIND[x.kind] || "")}${x.note ? " · " + esc(x.note) : ""}</span></span>
        <span class="ev-when num">${fmtDate(x.start)}${x.end ? " – " + fmtDate(x.end) : " → сейчас"}</span></button>`).join("")}</div>`
      : `<div class="empty">Пока нет событий.</div>`) : ""}`);
  if (form) setTimeout(() => $(".ev-form [name=title]")?.focus(), 50);
}

/* ============ what changed ============ */
function changesFor(date) {
  const bm = byMarker(), items = [];
  for (const [m, l] of Object.entries(bm)) {
    const cur = [...l].reverse().find(r => r.date === date); if (!cur || !isNum(cur.v)) continue;
    const prev = [...l].reverse().find(r => r.date && r.date < date && isNum(r.v) && unitKey(r.unit) === unitKey(cur.unit));
    const s1 = status(cur), bad1 = s1 === "high" || s1 === "low";
    if (!prev) { items.push({ m, cur, kind: "new" }); continue; }
    const s0 = status(prev), bad0 = s0 === "high" || s0 === "low";
    const pct = prev.v ? (cur.v - prev.v) / Math.abs(prev.v) * 100 : 0;
    const d0 = dev(prev), d1 = dev(cur);
    let kind = "same";
    if (!bad0 && bad1) kind = "out";
    else if (bad0 && !bad1) kind = "back";
    else if (bad0 && bad1) kind = d1 > d0 + 1e-9 ? "worse" : d1 < d0 - 1e-9 ? "better" : "same";
    else if (Math.abs(pct) >= 15) kind = "moved";
    items.push({ m, cur, prev, pct, kind });
  }
  return items;
}
const CHG = [["out", "Вышли за норму", "high"], ["worse", "Стало хуже", "high"], ["back", "Вернулись в норму", "ok"], ["better", "Стало лучше", "ok"], ["moved", "Заметно сдвинулись, но в норме", "edge"], ["same", "Почти без изменений", "none"], ["new", "Сданы впервые", "none"]];
function openDigest(date) {
  const items = changesFor(date);
  const rowOf = it => {
    const arrow = it.prev ? (it.cur.v > it.prev.v ? "↑" : it.cur.v < it.prev.v ? "↓" : "→") : "";
    return `<button type="button" class="chg-row" data-goto="${esc(it.m)}">
      <span class="chg-name">${esc(info(it.m).ru)}${it.cur.calc ? ` <small>расчёт</small>` : ""}</span>
      <span class="chg-vals num">${it.prev ? `<span class="muted">${fmt(it.prev.v)}</span> <span class="chg-ar">${arrow}</span> ` : ""}<b class="${status(it.cur) || ""}">${fmt(it.cur.v)}</b> <small>${esc(it.cur.unit || "")}</small></span>
      <span class="chg-pct num">${it.prev ? `${it.pct > 0 ? "+" : ""}${Math.round(it.pct)}%` : ""}</span>
      <span class="chg-when">${it.prev ? `было ${fmtDate(it.prev.date)}` : ""}</span></button>`;
  };
  const sections = CHG.map(([k, title, cls]) => {
    const l = items.filter(i => i.kind === k); if (!l.length) return "";
    const fold = k === "same" || k === "new";
    return `<details class="chg-sec ${cls}" ${fold ? "" : "open"}><summary><i></i>${title} <span class="cnt num">${l.length}</span></summary>${l.map(rowOf).join("")}</details>`;
  }).join("");
  const n = k => items.filter(i => i.kind === k).length;
  openX(`<div class="dlg-head"><div><div class="info-group">Что изменилось</div><h3>Сдача ${fmtDate(date)}</h3></div><button type="button" class="icon-btn" data-xclose aria-label="Закрыть">×</button></div>
    <div class="chg-sum">${[["out", "вышли за норму"], ["back", "вернулись в норму"], ["worse", "хуже"], ["better", "лучше"]].map(([k, t]) => `<span class="chg-pill ${k}"><b>${n(k)}</b> ${t}</span>`).join("")}</div>
    ${items.length ? sections : `<div class="empty">За эту дату нет результатов.</div>`}
    <div class="dlg-foot"><button type="button" class="btn ghost" data-cmp-from="${esc(date)}">Сравнить с другой датой</button></div>`);
}

/* ============ compare two dates ============ */
function allDates() {
  const bm = byMarker(), cnt = {};
  for (const l of Object.values(bm)) for (const r of l) if (r.date) cnt[r.date] = (cnt[r.date] || 0) + 1;
  return Object.keys(cnt).sort().reverse().map(d => ({ d, n: cnt[d] }));
}
function openCompare(a, b) {
  const ds = allDates(); if (ds.length < 2) { toast("Нужно хотя бы две даты сдачи"); return; }
  b ||= ds[0].d; a ||= (ds.find(x => x.d < b) || ds[1]).d;
  ui.cmp = { a, b };
  renderCompare();
}
function renderCompare() {
  const { a, b } = ui.cmp, bm = byMarker(), ds = allDates();
  // "state on the date": the latest value up to that date, unless exact dates only are asked for
  const at = (l, d) => [...l].reverse().find(r => ui.cmpExact ? r.date === d : r.date && r.date <= d);
  const rows = Object.entries(bm).map(([m, l]) => ({ m, A: at(l, a), B: at(l, b) }))
    .filter(x => ui.cmpAll ? (x.A || x.B) : (x.A && x.B && (ui.cmpExact || x.A !== x.B)));
  rows.sort((x, y) => (GROUP_ORDER[info(x.m).group] - GROUP_ORDER[info(y.m).group]) || ((CAT_ORDER[x.m] ?? 999) - (CAT_ORDER[y.m] ?? 999)));
  const cell = (r, d) => r ? `<b class="${status(r) || ""}">${fmt(r.v)}</b>${r.date !== d ? ` <small class="muted">${fmtDate(r.date)}</small>` : ""}` : `<span class="muted">—</span>`;
  const delta = (A, B) => {
    if (!A || !B || !isNum(A.v) || !isNum(B.v) || unitKey(A.unit) !== unitKey(B.unit)) return "";
    const pct = A.v ? (B.v - A.v) / Math.abs(A.v) * 100 : 0, d0 = dev(A), d1 = dev(B);
    const cls = d1 < d0 - 1e-9 ? "good" : d1 > d0 + 1e-9 ? "bad" : "";
    const flip = (status(A) === "high" || status(A) === "low") !== (status(B) === "high" || status(B) === "low");
    return `<span class="cmp-d ${cls}">${B.v > A.v ? "↑" : B.v < A.v ? "↓" : "→"} ${pct > 0 ? "+" : ""}${Math.round(pct)}%</span>${flip ? `<span class="cmp-flip ${status(B) === "high" || status(B) === "low" ? "bad" : "good"}">${status(B) === "high" || status(B) === "low" ? "вышел за норму" : "вернулся в норму"}</span>` : ""}`;
  };
  let lastG = null;
  const body = rows.map(({ m, A, B }) => {
    const g = info(m).group, head = g !== lastG ? `<tr class="cmp-g"><td colspan="4">${esc(GROUP_NAME[g] || g)}</td></tr>` : ""; lastG = g;
    return head + `<tr data-goto="${esc(m)}"><td>${esc(info(m).ru)} <small class="muted">${esc((A || B).unit || "")}</small></td><td class="num">${cell(A, a)}</td><td class="num">${cell(B, b)}</td><td>${delta(A, B)}</td></tr>`;
  }).join("");
  const sel = (k, v) => `<select class="input" data-cmp="${k}">${ds.map(x => `<option value="${x.d}"${x.d === v ? " selected" : ""}>${fmtDate(x.d)} · ${x.n}</option>`).join("")}</select>`;
  openX(`<div class="dlg-head"><h3>Сравнение дат</h3><button type="button" class="icon-btn" data-xclose aria-label="Закрыть">×</button></div>
    <div class="cmp-ctl">${sel("a", a)}<span class="muted">→</span>${sel("b", b)}
      <label class="ev-now"><input type="checkbox" data-cmp-exact${ui.cmpExact ? " checked" : ""}> только сданные в эти дни</label>
      <label class="ev-now"><input type="checkbox" data-cmp-all${ui.cmpAll ? " checked" : ""}> все показатели</label></div>
    <p class="x-lead">${ui.cmpExact ? "Сравниваются только анализы, сданные ровно в эти даты." : "Для каждой даты берётся последнее значение до неё — видно, как изменилось состояние. Серой датой отмечены значения из более ранних сдач."}</p>
    ${rows.length ? `<div class="tbl-scroll"><table class="mtable cmp"><thead><tr><th>Показатель</th><th>${fmtDate(a)}</th><th>${fmtDate(b)}</th><th>Изменение</th></tr></thead><tbody>${body}</tbody></table></div>`
      : `<div class="empty">Между этими датами ничего не менялось. Выбери другие даты или включи «все показатели».</div>`}`);
}

/* ============ heatmap ============ */
function heatmapHtml() {
  const bm = byMarker(), ds = allDates().map(x => x.d).reverse();
  const ids = Object.keys(bm).sort((x, y) => (GROUP_ORDER[info(x).group] - GROUP_ORDER[info(y).group]) || ((CAT_ORDER[x] ?? 999) - (CAT_ORDER[y] ?? 999)));
  let lastG = null;
  const rows = ids.map(m => {
    const g = info(m).group, head = g !== lastG ? `<tr class="hm-g"><th colspan="${ds.length + 1}">${esc(GROUP_NAME[g] || g)}</th></tr>` : ""; lastG = g;
    return head + `<tr><th class="hm-name" data-goto="${esc(m)}">${esc(info(m).ru)}</th>${ds.map(d => {
      const r = [...bm[m]].reverse().find(x => x.date === d);
      return r ? `<td class="hm-c ${status(r) || "none"}" title="${esc(`${info(m).ru} · ${fmtDate(d)}: ${fmt(r.v)} ${r.unit || ""}${STATUS_TXT[status(r)] ? " · " + STATUS_TXT[status(r)] : ""}`)}" data-goto="${esc(m)}">${fmt(r.v)}</td>` : `<td class="hm-c empty"></td>`;
    }).join("")}</tr>`;
  }).join("");
  return `<div class="hm-legend"><span><i class="ok"></i>норма</span><span><i class="edge"></i>у границы</span><span><i class="high"></i>выше</span><span><i class="low"></i>ниже</span><span><i class="none"></i>без нормы</span></div>
    <div class="hm-wrap"><table class="hm"><thead><tr><th class="hm-name"></th>${ds.map(d => `<th class="num"><span>${d.slice(8, 10)}.${d.slice(5, 7)}</span><span>${d.slice(0, 4)}</span></th>`).join("")}</tr></thead><tbody>${rows}</tbody></table></div>`;
}

/* ============ doctor report ============ */
function spark(list) {
  const pts = list.filter(r => isNum(r.v)).slice(-6); if (pts.length < 2) return "";
  const W = 90, H = 26, vs = pts.map(r => r.v), lo = Math.min(...vs), hi = Math.max(...vs), sp = hi - lo || 1;
  const P = (r, i) => `${(i / (pts.length - 1) * (W - 6) + 3).toFixed(1)},${(H - 4 - (r.v - lo) / sp * (H - 8)).toFixed(1)}`;
  const last = pts[pts.length - 1];
  return `<svg class="spark" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" aria-hidden="true"><polyline points="${pts.map(P).join(" ")}" fill="none" stroke="currentColor" stroke-width="1.6"/><circle cx="${P(last, pts.length - 1).split(",")[0]}" cy="${P(last, pts.length - 1).split(",")[1]}" r="2.6" class="sp-${status(last) || "none"}"/></svg>`;
}
function reportHtml(opt = {}) {
  const bm = byMarker(), p = profile(), years = ui.repYears ?? 2;
  const from = years ? addMonths(todayISO(), -12 * years) : "0000";
  const name = opt.name ?? (typeof cloud !== "undefined" && cloud.user ? (cloud.user.user_metadata?.full_name || "") : "");
  const age = p.born ? new Date().getFullYear() - p.born : null;
  const latest = m => [...bm[m]].reverse()[0];
  const ids = Object.keys(bm).filter(m => m !== "dbp").sort((x, y) => (GROUP_ORDER[info(x).group] - GROUP_ORDER[info(y).group]) || ((CAT_ORDER[x] ?? 999) - (CAT_ORDER[y] ?? 999)));
  const bad = ids.filter(m => outside(latest(m)));
  const trendIds = [...new Set([...bad, ...KEY_MARKERS.filter(m => bm[m])])].filter(m => m !== "dbp" && bm[m].filter(r => r.date >= from).length >= 1);
  const val = r => `${fmt(r.v)} <small>${esc(r.unit || "")}</small>`;
  const norm = r => esc(r.tgt ? `${rangeText(r.min, r.max)} (цель; бланк ${rangeText(r.labMin, r.labMax) || "—"})` : rangeText(r.min, r.max));
  const bpTxt = () => { const ps = typeof bpPairs === "function" ? bpPairs(bm) : []; const x = ps[ps.length - 1]; return x ? `${fmt(x.s.v)}/${fmt(x.d.v)} мм рт. ст. · ${x.c.t} · ${fmtDate(x.date)}` : ""; };
  const evs = eventList().filter(e => !e.end || e.end >= from);
  const q = state.prefs?.questions || "";
  const sec = (t, body) => body ? `<section class="rep-sec"><h4>${t}</h4>${body}</section>` : "";
  return `<article class="rep">
    <header class="rep-head"><div><div class="rep-kicker">Медкарта · сводка для врача</div><h2>${esc(name || "Пациент")}</h2>
      <div class="rep-meta">${[p.sex ? (p.sex === "m" ? "мужчина" : "женщина") : "", age ? `${age} ${plural(age, "год", "года", "лет")}` : "", `сформировано ${fmtDate(todayISO())}`].filter(Boolean).join(" · ")}</div></div>
      ${opt.controls ? `<div class="rep-ctl no-print"><select class="input" data-rep-years>${[[1, "за 1 год"], [2, "за 2 года"], [5, "за 5 лет"], [0, "за всё время"]].map(([v, t]) => `<option value="${v}"${v === years ? " selected" : ""}>${t}</option>`).join("")}</select></div>` : ""}
    </header>
    ${sec("Вне нормы сейчас", bad.length ? `<table class="rep-t"><thead><tr><th>Показатель</th><th>Значение</th><th>Норма</th><th>Дата</th><th>Раньше</th></tr></thead><tbody>${bad.map(m => { const l = bm[m], x = latest(m), pv = l.length > 1 ? l[l.length - 2] : null; return `<tr><td><b>${esc(info(m).ru)}</b>${harmHit(x) ? ` <span class="rep-harm">порог действия</span>` : ""}</td><td class="num ${status(x)}">${val(x)}</td><td class="num">${norm(x)}</td><td class="num">${fmtDate(x.date)}</td><td class="num">${pv ? `${fmt(pv.v)} (${fmtDate(pv.date)})` : "—"}</td></tr>`; }).join("")}</tbody></table>` : `<p>Все последние значения в норме.</p>`)}
    ${sec("Давление", bpTxt() ? `<p>${esc(bpTxt())}</p>` : "")}
    ${sec(`Динамика ключевых показателей${years ? ` за ${years} ${plural(years, "год", "года", "лет")}` : ""}`, trendIds.length ? `<table class="rep-t"><thead><tr><th>Показатель</th><th>Значения по датам</th><th>Тренд</th></tr></thead><tbody>${trendIds.map(m => { const l = bm[m].filter(r => r.date >= from).slice(-5); return `<tr><td>${esc(info(m).ru)} <small>${esc(l[l.length - 1].unit || "")}</small></td><td class="num">${l.map(r => `<span class="rep-v ${status(r) || ""}">${fmt(r.v)}</span> <small>${fmtDate(r.date).slice(3)}</small>`).join(" → ")}</td><td>${spark(l)}</td></tr>`; }).join("")}</tbody></table>` : "")}
    ${sec("Обследования", (() => { const l = studyList().filter(s => (s.date || "") >= from); return l.length ? `<table class="rep-t"><thead><tr><th>Дата</th><th>Обследование</th><th>Итог и заключение</th></tr></thead><tbody>${l.map(s => `<tr><td class="num">${fmtDate(s.date)}</td><td><b>${esc(studyTitle(s))}</b>${s.clinic ? `<br><small>${esc(s.clinic)}</small>` : ""}</td><td>${s.status ? `<b class="${s.status === "ok" ? "" : "high"}">${esc(STATUS_NAME[s.status])}</b>. ` : ""}${esc(s.conclusion || "")}${s.recs ? `<br><small>Рекомендации: ${esc(s.recs)}</small>` : ""}</td></tr>`).join("")}</tbody></table>` : ""; })())}
    ${sec("Лечение и события", evs.length ? `<ul class="rep-ev">${evs.map(e => `<li><b>${esc(e.title)}</b> · ${esc(EVENT_KIND[e.kind] || "")} · ${fmtDate(e.start)}${e.end ? "–" + fmtDate(e.end) : " → сейчас"}${e.note ? ` · ${esc(e.note)}` : ""}</li>`).join("")}</ul>` : "")}
    ${opt.controls ? `<section class="rep-sec no-print"><h4>Вопросы к врачу</h4><textarea class="input rep-q" data-rep-q rows="4" placeholder="Что хочешь спросить на приёме — сохранится и попадёт в печать">${esc(q)}</textarea></section>` : ""}
    ${q ? `<section class="rep-sec ${opt.controls ? "print-only" : ""}"><h4>Вопросы к врачу</h4><p class="rep-qtext">${esc(q)}</p></section>` : ""}
    ${sec("Все последние результаты", `<table class="rep-t rep-all"><thead><tr><th>Показатель</th><th>Значение</th><th>Норма</th><th>Дата</th></tr></thead><tbody>${ids.map(m => { const x = latest(m); return `<tr><td>${esc(info(m).ru)}${x.calc ? " <small>расчёт</small>" : ""}</td><td class="num ${status(x) || ""}">${val(x)}</td><td class="num">${norm(x)}</td><td class="num">${fmtDate(x.date)}</td></tr>`; }).join("")}</tbody></table>`)}
    <footer class="rep-foot">Данные внесены пациентом вручную с бланков лабораторий. Нормы — с бланков или целевые значения из клинических рекомендаций (указаны). Не является медицинским заключением.</footer>
  </article>`;
}
function openReport() {
  const canShare = typeof cloud !== "undefined" && cloud.user;
  openX(`<div class="dlg-head no-print"><h3>Сводка для врача</h3><button type="button" class="icon-btn" data-xclose aria-label="Закрыть">×</button></div>
    <div class="rep-actions no-print">
      <button type="button" class="btn primary" data-print>Печать или PDF</button>
      ${canShare ? `<button type="button" class="btn" data-share-new>Ссылка для врача</button>` : `<span class="muted">Ссылка для врача доступна после входа через Google</span>`}
    </div>
    <div id="shareBox" class="no-print"></div>
    ${reportHtml({ controls: true })}`, "rep-dlg");
  if (canShare) renderShares();
}
function printReport(html) {
  const root = $("#printRoot"); root.innerHTML = html;
  document.documentElement.classList.add("printing");
  const done = () => { document.documentElement.classList.remove("printing"); root.innerHTML = ""; removeEventListener("afterprint", done); };
  addEventListener("afterprint", done);
  setTimeout(() => window.print(), 50);
}

/* ============ share links (read-only, expiring) ============ */
function randomToken() { const b = new Uint8Array(18); crypto.getRandomValues(b); return btoa(String.fromCharCode(...b)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); }
const shareUrl = t => `${location.origin}${location.pathname}?share=${t}`;
async function renderShares(fresh) {
  const box = $("#shareBox"); if (!box) return;
  const { data, error } = await cloud.client.from("shares").select("token, created_at, expires_at").gt("expires_at", new Date().toISOString()).order("created_at", { ascending: false });
  if (error) { box.innerHTML = `<p class="muted">Ссылки пока недоступны: ${esc(error.message)}</p>`; return; }
  box.innerHTML = (data || []).length ? `<div class="share-list">${data.map(s => `<div class="share-row${s.token === fresh ? " fresh" : ""}">
      <input class="input" readonly value="${esc(shareUrl(s.token))}" data-share-url>
      <button type="button" class="btn sm" data-share-copy="${esc(s.token)}">Копировать</button>
      <span class="muted">до ${fmtDate(s.expires_at.slice(0, 10))}</span>
      <button type="button" class="btn sm ghost danger" data-share-del="${esc(s.token)}">Отозвать</button></div>`).join("")}</div>` : "";
}
async function createShare(days) {
  const token = randomToken(), expires = new Date(Date.now() + days * 864e5).toISOString();
  const studies = Object.fromEntries(Object.entries(state.studies || {}).map(([id, s]) => [id, { ...s, files: [] }]));
  const data = { v: 1, name: cloud.user.user_metadata?.full_name || "", results: state.results, markers: state.markers, events: state.events || {}, studies,
    prefs: { profile: profile(), targets: state.prefs?.targets || {}, research: state.prefs?.research, questions: state.prefs?.questions || "" } };
  const { error } = await cloud.client.from("shares").insert({ token, data, expires_at: expires });
  if (error) { toast("Не получилось создать ссылку: " + error.message); return; }
  try { await navigator.clipboard.writeText(shareUrl(token)); toast("Ссылка скопирована — отправь её врачу"); } catch (e) { toast("Ссылка создана"); }
  renderShares(token);
}
// someone opened ?share=…: show the report read-only, nothing is saved
async function shareBoot(token) {
  ui.readonly = true;
  document.body.classList.add("share-view");
  const page = $(".page");
  page.innerHTML = `<div class="share-top"><span class="brand"><span class="logo" aria-hidden="true"></span>Медкарта</span><span class="muted">Загружаю…</span></div>`;
  try {
    const client = window.supabase.createClient(window.MEDCARD_CLOUD.url, window.MEDCARD_CLOUD.key);
    const { data, error } = await client.rpc("get_share", { t: token });
    if (error || !data) throw error || new Error("gone");
    const d = data.data;
    state.results = d.results || {}; state.markers = d.markers || {}; state.events = d.events || {}; state.prefs = d.prefs || {}; state.studies = d.studies || {};
    page.innerHTML = `<div class="share-top no-print"><span class="brand"><span class="logo" aria-hidden="true"></span>Медкарта</span>
        <span class="muted">Только просмотр · ссылка действует до ${fmtDate(String(data.expires_at).slice(0, 10))}</span>
        <button type="button" class="btn primary" data-print>Печать или PDF</button></div>
      ${reportHtml({ name: d.name })}`;
    page.addEventListener("click", e => { if (e.target.closest("[data-print]")) printReport(reportHtml({ name: d.name })); });
  } catch (e) {
    page.innerHTML = `<div class="share-top"><span class="brand"><span class="logo" aria-hidden="true"></span>Медкарта</span></div><div class="empty">Ссылка недействительна или срок её действия истёк. Попроси прислать новую.</div>`;
  }
}

/* ============ profile ============ */
function openProfile() {
  const p = profile(), research = state.prefs?.research !== false;
  openX(`<div class="dlg-head"><h3>Профиль</h3><button type="button" class="icon-btn" data-xclose aria-label="Закрыть">×</button></div>
    <p class="x-lead">Нужен для расчёта СКФ и выбора целевых норм, которые зависят от пола.</p>
    <form class="prof" data-prof>
      <div class="fld"><span>Пол</span><div class="tchips">${[["m", "Мужской"], ["f", "Женский"]].map(([v, t]) => `<label class="tchip radio"><input type="radio" name="sex" value="${v}"${p.sex === v ? " checked" : ""}>${t}</label>`).join("")}</div></div>
      <label class="fld"><span>Год рождения</span><input class="input num" name="born" inputmode="numeric" value="${esc(p.born || "")}" placeholder="например 1998" style="max-width:160px"></label>
      <label class="ev-now"><input type="checkbox" name="research"${research ? " checked" : ""}> Использовать целевые нормы из клинических рекомендаций, где они есть</label>
      <div class="dlg-foot"><span style="flex:1"></span><button type="submit" class="btn primary">Сохранить</button></div>
    </form>`);
}

/* ============ what is usually done (evidence-ranked, to discuss with a doctor) ============ */
const LEVELS = { strong: ["Сильные доказательства", 4], moderate: ["Умеренные", 3], weak: ["Слабые", 2], none: ["Не доказано", 0] };
function treatHtml(id, list) {
  const t = (window.TREAT || {})[id === "dbp" ? "sbp" : id];
  const x = [...list].reverse().find(r => !r.calc) || list[list.length - 1];
  const s = status(x), cur = s === "high" ? "hi" : s === "low" ? "lo" : null;
  const warn = `<div class="tr-warn"><b>Это не назначение.</b> Здесь собрано, что обычно делают при таком отклонении и насколько это помогает по исследованиям. Используй как список вопросов к врачу — что подходит именно тебе, решает он с учётом всей картины.</div>`;
  if (!t || (!t.hi && !t.lo)) {
    const hl = (window.HL || {})[id], sits = INFO[id]?.when || [];
    return `<div class="tr">${warn}
      <p class="tr-empty">Для этого показателя подход зависит от причины отклонения, общего списка вариантов нет.</p>
      ${hl ? `<div class="tr-cause">${hl[0] ? `<p><b>Если выше:</b> ${esc(hl[0])}</p>` : ""}${hl[1] ? `<p><b>Если ниже:</b> ${esc(hl[1])}</p>` : ""}</div>` : ""}
      ${sits.length ? `<p class="muted">Посмотри план обследования: ${sits.map(w => `<button type="button" class="sit" data-sit="${esc(w)}">${esc(w)}</button>`).join(" ")}</p>` : ""}
    </div>`;
  }
  const sides = ["hi", "lo"].filter(k => t[k]);
  const side = ui.treatSide?.[id] && t[ui.treatSide[id]] ? ui.treatSide[id] : (cur && t[cur] ? cur : sides[0]);
  const d = t[side];
  const meter = n => `<span class="tr-meter" aria-hidden="true">${[1, 2, 3, 4].map(i => `<i class="${i <= n ? "on" : ""}"></i>`).join("")}</span>`;
  const opts = d.opts.map(([name, lvl, text, src]) => `<div class="tr-opt lv-${lvl}">
      <div class="tr-lv">${meter(LEVELS[lvl]?.[1] ?? 0)}<span>${esc(LEVELS[lvl]?.[0] || lvl)}</span></div>
      <div class="tr-body"><b>${esc(name)}</b><p>${esc(text)}</p>${src ? `<small>${esc(src)}</small>` : ""}</div>
    </div>`).join("");
  return `<div class="tr" data-treat="${esc(id)}">
    ${warn}
    ${sides.length > 1 ? `<div class="seg tr-seg">${sides.map(k => `<button type="button" data-tside="${k}" aria-pressed="${k === side}">${k === "hi" ? "Если выше нормы" : "Если ниже нормы"}${k === cur ? " · твой случай" : ""}</button>`).join("")}</div>`
      : `<div class="tr-side">${side === "hi" ? "Если выше нормы" : "Если ниже нормы"}${side === cur ? " · твой случай" : ""}</div>`}
    ${!cur ? `<p class="tr-note">Сейчас значение в норме — ниже то, что делают при отклонении.</p>` : !t[cur] ? `<p class="tr-note">Твоё значение ${cur === "hi" ? "выше" : "ниже"} нормы, но отклонение в эту сторону обычно клинического значения не имеет и не лечится. Ниже — что делают при отклонении в другую сторону.</p>` : ""}
    ${d.why ? `<div class="tr-block"><h5>Частые причины</h5><p>${esc(d.why)}</p></div>` : ""}
    ${d.first ? `<div class="tr-block"><h5>С чего обычно начинают</h5><p>${esc(d.first)}</p></div>` : ""}
    <div class="tr-block"><h5>Что помогает — от сильного к слабому</h5><div class="tr-opts">${opts}</div></div>
    ${d.ask?.length ? `<div class="tr-block tr-ask"><h5>Что спросить у врача</h5><ul>${d.ask.map(q => `<li>${esc(q)}</li>`).join("")}</ul>
      <div class="tr-actions"><button type="button" class="btn sm" data-ask-add>Добавить в сводку для врача</button><button type="button" class="btn sm ghost" data-ask-copy>Скопировать вопросы</button></div></div>` : ""}
    <p class="tr-legend">Сила доказательств: сильные — крупные рандомизированные исследования и клинические рекомендации; умеренные — эффект есть, но меньше или данных меньше; слабые — небольшой эффект или исследования низкого качества; не доказано — пользы не нашли или не рекомендуют.</p>
  </div>`;
}

/* ============ generic sheet dialog ============ */
function openX(html, cls = "") {
  const d = $("#xDlg");
  d.className = "dialog x-dlg " + cls;
  $("#xBody").innerHTML = html;
  if (!d.open) d.showModal();
}
const closeX = () => { const d = $("#xDlg"); if (d.open) d.close(); };

/* ============ wiring ============ */
function initExtras() {
  const xd = $("#xDlg");
  xd.addEventListener("click", async e => {
    const t = e.target;
    if (t === xd || t.closest("[data-xclose]")) { closeX(); return; }
    const so = t.closest("[data-st-open]"); if (so) { openStudy(so.dataset.stOpen); return; }
    const go = t.closest("[data-goto]");
    if (go && !t.closest("select")) { closeX(); focusRow(go.dataset.goto); return; }
    // events
    if (t.closest("[data-ev-new]")) { ui.confirmEv = null; openEvents(null, true); return; }
    if (t.closest("[data-ev-list]")) { openEvents(); return; }
    const ev = t.closest("[data-ev]"); if (ev) { ui.confirmEv = null; openEvents(ev.dataset.ev); return; }
    const et = t.closest("[data-ev-title]"); if (et) { $(".ev-form [name=title]").value = et.dataset.evTitle; return; }
    const ed = t.closest("[data-ev-del]");
    if (ed) { const id = ed.dataset.evDel; if (ui.confirmEv !== id) { ui.confirmEv = id; ed.textContent = "Точно удалить?"; return; } delete state.events[id]; ui.confirmEv = null; save(); renderAll(); openEvents(); toast("Событие удалено"); return; }
    // compare
    const cf = t.closest("[data-cmp-from]"); if (cf) { const ds = allDates(); openCompare((ds.find(x => x.d < cf.dataset.cmpFrom) || ds[1] || {}).d, cf.dataset.cmpFrom); return; }
    // report
    if (t.closest("[data-print]")) { printReport(reportHtml()); return; }
    if (t.closest("[data-share-new]")) {
      $("#shareBox").innerHTML = `<div class="share-new">Срок действия: ${[[1, "1 день"], [7, "7 дней"], [30, "30 дней"]].map(([d, l]) => `<button type="button" class="tchip" data-share-days="${d}">${l}</button>`).join("")}</div>`;
      return;
    }
    const sd = t.closest("[data-share-days]"); if (sd) { sd.disabled = true; await createShare(+sd.dataset.shareDays); return; }
    const sc = t.closest("[data-share-copy]"); if (sc) { try { await navigator.clipboard.writeText(shareUrl(sc.dataset.shareCopy)); toast("Скопировано"); } catch (err) { sc.previousElementSibling.select(); } return; }
    const sx = t.closest("[data-share-del]"); if (sx) { await cloud.client.from("shares").delete().eq("token", sx.dataset.shareDel); toast("Ссылка отозвана"); renderShares(); return; }
    if (t.matches("[data-share-url]")) t.select();
  });
  xd.addEventListener("change", e => {
    const t = e.target;
    if (t.matches("[data-cmp]")) { ui.cmp[t.dataset.cmp] = t.value; renderCompare(); }
    else if (t.matches("[data-cmp-all]")) { ui.cmpAll = t.checked; renderCompare(); }
    else if (t.matches("[data-cmp-exact]")) { ui.cmpExact = t.checked; renderCompare(); }
    else if (t.matches("[data-rep-years]")) { ui.repYears = +t.value; openReport(); }
    else if (t.name === "ongoing") { const end = $(".ev-form [name=end]"); if (t.checked) end.value = ""; }
    else if (t.name === "end" && t.value) { const on = $(".ev-form [name=ongoing]"); if (on) on.checked = false; }
  });
  xd.addEventListener("input", e => { if (e.target.matches("[data-rep-q]")) { clearTimeout(ui.qTimer); ui.qTimer = setTimeout(() => setPref(["questions"], e.target.value || undefined), 500); } });
  xd.addEventListener("submit", e => {
    e.preventDefault();
    const f = e.target, fd = new FormData(f);
    if (f.matches("[data-ev-form]")) {
      const id = f.dataset.evForm || newId("e");
      const ongoing = fd.get("ongoing") === "on";
      const ev = { title: String(fd.get("title")).trim(), kind: fd.get("kind") || "other", start: fd.get("start"), end: ongoing ? null : (fd.get("end") || null), note: String(fd.get("note") || "").trim() };
      if (!ev.title || !ev.start) return;
      if (ev.end && ev.end < ev.start) { toast("Конец раньше начала"); return; }
      state.events ||= {}; state.events[id] = ev; save(); renderAll(); openEvents(); toast("Событие сохранено");
    } else if (f.matches("[data-prof]")) {
      const born = parseInt(fd.get("born"), 10);
      setPref(["profile"], { sex: fd.get("sex") || undefined, born: born > 1900 && born <= new Date().getFullYear() ? born : undefined });
      setPref(["research"], fd.get("research") === "on" ? undefined : false);
      closeX(); renderAll(); toast("Профиль сохранён");
    }
  });

  // settings strip inside an opened marker
  const list = $("#list");
  list.addEventListener("click", e => {
    const t = e.target, box = t.closest(".dset"); if (!box) return;
    const id = box.dataset.mid;
    const tg = t.closest("[data-tgt]");
    if (tg) {
      const k = tg.dataset.tgt;
      if (k === "lab") setPref(["targets", id], { mode: "lab" });
      else if (k === "custom") { ui.tgtEdit = ui.tgtEdit === id ? null : id; renderList(); return; }
      else setPref(["targets", id], { mode: "preset", i: +k.slice(1) });
      ui.tgtEdit = null; renderAll(); return;
    }
    if (t.closest("[data-tsave]")) {
      const min = parseNum($("[data-tmin]", box).value), max = parseNum($("[data-tmax]", box).value);
      if (min == null && max == null) { setPref(["targets", id], undefined); } else setPref(["targets", id], { mode: "custom", min, max });
      ui.tgtEdit = null; renderAll(); return;
    }
    if (t.closest("[data-ev-new]")) { ui.confirmEv = null; openEvents(null, true); return; }
    const ev = t.closest("[data-ev]"); if (ev) { openEvents(ev.dataset.ev); return; }
    const so = t.closest("[data-st-open]"); if (so) { openStudy(so.dataset.stOpen); return; }
  });
  list.addEventListener("click", async e => {
    const tr = e.target.closest("[data-treat]"); if (!tr) return;
    const id = tr.dataset.treat, side = e.target.closest("[data-tside]");
    if (side) { ui.treatSide = { ...ui.treatSide, [id]: side.dataset.tside }; renderList(); return; }
    const qs = [...tr.querySelectorAll(".tr-ask li")].map(li => li.textContent);
    if (e.target.closest("[data-ask-copy]")) { try { await navigator.clipboard.writeText(qs.join("\n")); toast("Вопросы скопированы"); } catch (err) { toast("Не получилось скопировать"); } return; }
    if (e.target.closest("[data-ask-add]")) {
      const head = `${info(id).ru}:`, cur = state.prefs?.questions || "";
      if (cur.includes(head)) { toast("Эти вопросы уже в сводке"); return; }
      setPref(["questions"], (cur ? cur.trimEnd() + "\n\n" : "") + head + "\n" + qs.map(q => "— " + q).join("\n"));
      toast("Добавлено в «Вопросы к врачу» в сводке");
    }
  });
  list.addEventListener("change", e => {
    const t = e.target; if (!t.matches("[data-remind]")) return;
    const id = t.closest(".dset").dataset.mid, v = t.value;
    setPref(["remind", id], v === "auto" ? undefined : +v); renderAll();
  });
  list.addEventListener("keydown", e => { if (e.key === "Enter" && e.target.matches("[data-tmin],[data-tmax]")) { e.preventDefault(); $("[data-tsave]", e.target.closest(".dset"))?.click(); } });

  // retest block, overview, history controls, menu
  $("#due").addEventListener("click", e => {
    if (e.target.closest("[data-ics]")) { downloadIcs(); return; }
    if (e.target.closest("[data-due-more]")) { ui.dueOpen = !ui.dueOpen; renderDue(); return; }
    const so = e.target.closest("[data-st-open]"); if (so) { openStudy(so.dataset.stOpen); return; }
    const g = e.target.closest("[data-goto]"); if (g) focusRow(g.dataset.goto);
  });
  $("#overview").addEventListener("click", e => { const d = e.target.closest("[data-digest]"); if (d) openDigest(d.dataset.digest); });
  $("#histCtl").addEventListener("click", e => {
    const h = e.target.closest("[data-h]");
    if (h) { ui.histMode = h.dataset.h; $$("#histCtl [data-h]").forEach(b => b.setAttribute("aria-pressed", b === h)); renderTimeline(); return; }
    if (e.target.closest("[data-cmp-open]")) openCompare();
    if (e.target.closest("[data-ev-new]")) { ui.confirmEv = null; openEvents(null, true); }
  });
  $("#timeline").addEventListener("click", e => {
    const g = e.target.closest("[data-goto]"); if (g) { focusRow(g.dataset.goto); return; }
    const d = e.target.closest("[data-digest]"); if (d) { e.preventDefault(); openDigest(d.dataset.digest); return; }
    const ev = e.target.closest("[data-ev]"); if (ev) { openEvents(ev.dataset.ev); return; }
    const so = e.target.closest("[data-st-open]"); if (so) openStudy(so.dataset.stOpen);
  });
  const menuAct = (sel, fn) => $(sel).addEventListener("click", () => { $("#menu").hidden = true; fn(); });
  menuAct("#reportBtn", openReport);
  menuAct("#eventsBtn", () => openEvents());
  menuAct("#profileBtn", openProfile);
}
