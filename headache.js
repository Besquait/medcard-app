// Headache diary, like a migraine calendar: an episode with its start and end (dates and times, it can run past
// midnight, or "still hurts"), strength 1–10 with check-ins over time, how the day went and the mood,
// where it hurts (tapped on a head drawing, front and back), what kind, what came with it, pills with time and
// effect, possible triggers. Episodes live in the log of the headache complaint (field hx), so the complaint card,
// the diary and the links see them. The symptoms page gets a "Голова" tab: the month, where it hurts most, what helps.
// Loaded before app.js: definitions only; initHeadache() wires the UI.
"use strict";

const HX_ZONES = {
  whole: "Вся голова", crown: "Макушка", forehead: "Лоб", templeR: "Правый висок", templeL: "Левый висок", eyeR: "За правым глазом", eyeL: "За левым глазом",
  sinus: "Переносица, пазухи", jawR: "Правая челюсть", jawL: "Левая челюсть", occTop: "Верх затылка", occiput: "Затылок",
  earL: "За левым ухом", earR: "За правым ухом", neck: "Шея",
};
const HX_KIND = [["press", "Давит, сжимает"], ["pulse", "Пульсирует"], ["stab", "Колет, стреляет"], ["ache", "Ноет"], ["heavy", "Тяжесть"]];
const HX_WITH = [["nausea", "Тошнота"], ["light", "Свет раздражает"], ["sound", "Звук раздражает"], ["aura", "Мушки, аура"], ["dizzy", "Головокружение"], ["neck", "Шея, плечи"], ["nose", "Заложен нос"]];
const HX_TRIG = [["sleep", "Недосып"], ["water", "Мало воды"], ["meal", "Пропустил еду"], ["stress", "Стресс"], ["screen", "Экран"], ["coffee", "Кофе или без кофе"], ["alc", "Алкоголь"], ["jaw", "Сжимал челюсть"], ["weather", "Погода"]];
const HX_EFF = [["no", "Не помогло", "g3"], ["part", "Частично", "g2"], ["yes", "Помогло", "g0"]];
const HX_PILLS = ["Ибупрофен", "Парацетамол", "Цитрамон", "Нимесил", "Пенталгин", "Спазмалгон", "Суматриптан", "Аспирин"];

// the headache complaint: the main one about the head, else any; created on first use
function hxSym() {
  const l = syList().filter(s => /голов\S* бол|мигрен/i.test(s.name));
  return l.find(s => s.main) || l[0] || null;
}
function hxSymId() {
  const s = hxSym(); if (s) return s.id;
  const id = newId("sy"); state.symptoms[id] = { name: "Головная боль", zone: "head", pattern: "recur", main: true, log: [], tried: [], trig: [], start: todayISO() };
  return id;
}
const hxEps = () => { const s = hxSym(); return s ? (s.log || []).map((e, i) => ({ ...e, i })).filter(e => e.hx).sort((a, b) => (b.d + (b.hx.start || "")).localeCompare(a.d + (a.hx.start || ""))) : []; };
const hxSev = v => v >= 7 ? 3 : v >= 4 ? 2 : 1;
const HX_IMP = [["ok", "Всё мог делать", "g0"], ["hard", "Делал с трудом", "g2"], ["bed", "Пришлось лечь, ничего не мог", "g3"]];
const HX_AGO = [[0, "Только что"], [30, "30 мин назад"], [60, "1 ч назад"], [120, "2 ч назад"], [180, "3 ч назад"]];
const hx2 = n => String(n).padStart(2, "0");
const hxAt = (d, t) => new Date(`${d}T${t || "00:00"}:00`).getTime();
// [date, "HH:MM"] of a moment
const hxIso = ms => { const n = new Date(ms); return [`${n.getFullYear()}-${hx2(n.getMonth() + 1)}-${hx2(n.getDate())}`, `${hx2(n.getHours())}:${hx2(n.getMinutes())}`]; };
// the end date: stored, else the next day when the end time is before the start (old records), else the start day
const hxEndD = (x, d) => x.endD || (x.end && x.start && x.end < x.start ? addDaysISO(d, 1) : d);
const hxLen = m => m < 60 ? `${m} мин` : clHours(m);
// minutes from the start to the end, or to now while it still hurts
function hxDur(e) {
  const x = e.hx; if (!x.start || !e.d) return null;
  const a = hxAt(e.d, x.start), b = x.end ? hxAt(hxEndD(x, e.d), x.end) : Date.now();
  return isFinite(a) && isFinite(b) ? Math.max(0, Math.round((b - a) / 6e4)) : null;
}
// the end set before the start
const hxBad = x => !!(x.end && x.start && x.d && hxAt(hxEndD(x, x.d), x.end) < hxAt(x.d, x.start));
// the headline strength: the worst check-in, else the one strength
const hxTop = x => x.pts?.length ? Math.max(...x.pts.map(p => p.v)) : x.vas || 0;
const hxDay = d => { const t = todayISO(); if (d === t) return "сегодня"; if (d === addDaysISO(t, -1)) return "вчера"; const [y, m, dd] = d.split("-").map(Number); return `${dd} ${MONTHS[m - 1]}${y !== +t.slice(0, 4) ? ` ${y}` : ""}`; };
// "вчера, 22:00 → сегодня, 08:30", one day as "20 октября, 09:00–11:30"
function hxRange(d, x) {
  const s = `${hxDay(d)}, ${x.start || "?"}`;
  if (!x.end) return dyCap(`${s} · ещё болит`);
  const ed = hxEndD(x, d);
  return dyCap(ed === d ? `${s}–${x.end}` : `${s} → ${hxDay(ed)}, ${x.end}`);
}
// the days an episode covers, for the month
function hxSpan(e) {
  const t = todayISO(), last = e.hx.end ? hxEndD(e.hx, e.d) : e.d >= addDaysISO(t, -2) ? t : e.d, out = [];
  for (let d = e.d; d <= last && out.length < 14; d = addDaysISO(d, 1)) out.push(d);
  return out;
}
const hxOpen = () => hxEps().find(e => !e.hx.end && e.d >= addDaysISO(todayISO(), -2));

// the head drawing, front and back, tiled into zones like a map. The front is anatomical: the person faces you,
// so their left is on the right of the picture; the back is seen from behind, their left on the left.
// Zones are shapes clipped by the head outline and painted back to front, so later ones sit on earlier ones and
// together they always tile the head with no gaps. [id, path, where the heat-map count goes]
const HX_HEAD = "M100 14C140 14 166 44 166 92c0 36-6 64-20 84-12 18-28 30-46 30s-34-12-46-30C40 156 34 128 34 92 34 44 60 14 100 14z";
const HX_FRONT = [
  ["jawR", "M-10 0H100V260H-10z", [76, 176]], ["jawL", "M100 0H210V260H100z", [124, 176]],
  ["templeR", "M-10-10H60V150H-10z", [46, 106]], ["templeL", "M210-10H140V150H210z", [154, 106]],
  ["forehead", "M60-10H140V150H60z", [100, 70]],
  ["sinus", "M95 90H105V124H140V150H60V124H95z", [100, 140]],
  ["eyeR", "M60 90H95V124H60z", [78, 111]], ["eyeL", "M105 90H140V124H105z", [122, 111]],
  ["crown", "M-10-10H210V50Q100 26-10 50z", [100, 32]],
];
const HX_BACK = [
  ["earL", "M-10 0H100V260H-10z", [50, 140]], ["earR", "M100 0H210V260H100z", [150, 140]],
  ["occiput", "M68 80H132Q138 150 128 230H72Q62 150 68 80z", [100, 150]],
  ["occTop", "M-10-10H210V92Q100 118-10 92z", [100, 76]],
  ["crown", "M-10-10H210V52Q100 28-10 52z", [100, 32]],
];
function hxHead(sel, heat) {
  const uid = "hxc" + (hxHead.n = (hxHead.n || 0) + 1);
  const all = heat?.whole || 0, cnt = id => (heat?.[id] || 0) + all;
  const max = heat ? Math.max(1, ...[...HX_FRONT, ...HX_BACK, ["neck"]].map(([id]) => cnt(id))) : 1;
  const z = (id, shape, at) => {
    const on = sel?.includes(id), n = cnt(id), h = heat ? n / max : 0;
    return `<g class="hx-z${on ? " on" : ""}${heat && h > .5 ? " hot" : ""}" data-hx-z="${id}"${heat ? ` style="--h:${h.toFixed(2)}"` : ""}><title>${HX_ZONES[id]}${heat ? ` · ${n}` : ""}</title>${shape}${heat && n && at ? `<text x="${at[0]}" y="${at[1] + 5}">${n}</text>` : ""}</g>`;
  };
  const view = (back, list) => {
    const id = uid + (back ? "b" : "f");
    return `<svg viewBox="12 6 176 240" aria-label="${back ? "Голова сзади" : "Голова спереди"}">
      <defs><clipPath id="${id}"><path d="${HX_HEAD}"/></clipPath></defs>
      <path class="hx-ear" d="M36 102c-10-4-16 4-15 16s6 22 17 20zM164 102c10-4 16 4 15 16s-6 22-17 20z"/>
      ${back ? z("neck", '<path d="M72 170v46q0 16-18 26h92q-18-10-18-26v-46z"/>', [100, 228])
             : '<path class="hx-neck" d="M72 170v46q0 16-18 26h92q-18-10-18-26v-46z"/>'}
      <g clip-path="url(#${id})">${list.map(([zid, d, at]) => z(zid, `<path d="${d}"/>`, at)).join("")}</g>
      <path class="hx-rim" d="${HX_HEAD}"/>
      <text class="hx-mark" x="22" y="70">${back ? "Л" : "П"}</text><text class="hx-mark" x="178" y="70">${back ? "П" : "Л"}</text>
    </svg>`;
  };
  const chips = heat ? "" : `<div class="hx-zchips">${["whole", ...(sel || []).filter(k => k !== "whole")].map(k =>
    `<button type="button" class="tchip" data-hx-z="${k}" aria-pressed="${!!sel?.includes(k)}">${HX_ZONES[k]}</button>`).join("")}</div>`;
  return `<div class="hx-heads${heat ? " heat" : ""}${sel?.includes("whole") ? " all" : ""}">
    <figure>${view(false, HX_FRONT)}<figcaption>Спереди</figcaption></figure>
    <figure>${view(true, HX_BACK)}<figcaption>Сзади</figcaption></figure>
    ${chips}${heat && all ? `<p class="hx-allc">Вся голова · ${all}</p>` : ""}
  </div>`;
}

/* ---------- the episode window ---------- */
// a big window with everything editable; the draft lives in ui.hx while it is open, closing with changes asks to save
function openHx(i) {
  const s = hxSym(), e = i != null && s ? s.log[i] : null, today = clSel ? clSel() : todayISO();
  if (e) {
    const h = JSON.parse(JSON.stringify(e.hx));
    ui.hx = { ...h, i, d: e.d, start: h.start || "", end: h.end || "", endD: h.end ? hxEndD(h, e.d) : "", vas: h.vas || 5, pts: h.pts || [],
      loc: h.loc || [], kind: h.kind || [], with: h.with || [], trig: h.trig || [], imp: h.imp || "", mood: h.mood || null,
      meds: (h.meds || []).map(m => ({ ...m, n: m.n || "", d: m.d || e.d, t: m.t || "", eff: m.eff || "" })), note: e.note || "" };
  } else ui.hx = { i: null, d: today, start: today === todayISO() ? clHM() : "", end: "", endD: "", vas: 5, pts: [], loc: [], kind: [], with: [], trig: [], imp: "", mood: null, meds: [], note: "" };
  ui.hxOrig = hxSnap(ui.hx); ui.hxWasOpen = !!e && !e.hx.end;
  hxDraw();
}
const hxSnap = x => JSON.stringify({ ...x, ago: null, sago: null });

// the end chooser: quick "how long ago", or an exact date and time
function hxEndPick(x) {
  return `<div class="hx-endp">
    <div class="tchips">${HX_AGO.map(([m, n]) => `<button type="button" class="tchip" data-hx-ago="${m}" aria-pressed="${x.ago === m}">${n}</button>`).join("")}</div>
    <div class="hx-wrow"><input class="input hx-dt" type="date" data-hx-endd value="${esc(x.endD || x.d)}" min="${esc(x.d)}" max="${todayISO()}" aria-label="Дата, когда прошла">
      <input class="input hx-dt" type="time" data-hx-end value="${esc(x.end)}" aria-label="Время, когда прошла"></div>
  </div>`;
}

// strength over the episode: a line through the check-ins, dashed to the end (0) or to now
function hxChart(x) {
  const pts = x.pts.map(p => ({ ...p, at: hxAt(p.d, p.t) })).filter(p => isFinite(p.at)).sort((a, b) => a.at - b.at);
  if (!pts.length) return "";
  const narrow = matchMedia("(max-width: 720px)").matches, W = narrow ? 360 : 640, H = narrow ? 190 : 220, L = 28, R = 20, T = 28, B = 36;
  const last = pts.at(-1), st = x.start && x.d ? hxAt(x.d, x.start) : pts[0].at;
  const en = x.end ? hxAt(hxEndD(x, x.d), x.end) : Math.max(Date.now(), last.at);
  const a = Math.min(isFinite(st) ? st : pts[0].at, pts[0].at);
  let b = Math.max(isFinite(en) ? en : last.at, last.at); if (b - a < 36e5) b = a + 36e5;
  const X = t => (L + (t - a) / (b - a) * (W - L - R)).toFixed(1), Y = v => (T + (10 - v) / 10 * (H - T - B)).toFixed(1);
  const line = pts.map((p, k) => `${k ? "L" : "M"}${X(p.at)} ${Y(p.v)}`).join("");
  const area = `${line}L${X(last.at)} ${Y(0)}L${X(pts[0].at)} ${Y(0)}Z`;
  const tail = x.end ? `M${X(last.at)} ${Y(last.v)}L${X(en)} ${Y(0)}` : `M${X(last.at)} ${Y(last.v)}H${X(b)}`;
  // midnights inside the episode
  const nights = []; const m = new Date(a); m.setHours(24, 0, 0, 0);
  while (m.getTime() < b && nights.length < 10) { const [d] = hxIso(m.getTime()); nights.push([m.getTime(), d]); m.setDate(m.getDate() + 1); }
  // time labels under the dots, the end always shown, crowded ones dropped
  let labs = pts.map(p => [p.at, p.t]); const endLab = [x.end ? en : b, x.end ? x.end : "сейчас"];
  labs = labs.filter(([t]) => Math.abs(+X(t) - +X(endLab[0])) >= 48);
  const shown = []; for (const l of labs) if (!shown.length || +X(l[0]) - +X(shown.at(-1)[0]) >= 48) shown.push(l);
  shown.push(endLab);
  return `<svg class="hx-chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Как менялась сила">
    ${[0, 5, 10].map(v => `<line class="hx-cg" x1="${L}" x2="${W - R}" y1="${Y(v)}" y2="${Y(v)}"/><text class="hx-cy" x="${L - 8}" y="${+Y(v) + 4}">${v}</text>`).join("")}
    ${nights.map(([t, d]) => `<line class="hx-cn" x1="${X(t)}" x2="${X(t)}" y1="${T - 14}" y2="${Y(0)}"/><text class="hx-cnl" x="${+X(t) + 5}" y="${T - 6}">${esc(hxDay(d))}</text>`).join("")}
    <path class="hx-ca" d="${area}"/><path class="hx-ct" d="${tail}"/><path class="hx-cl" d="${line}"/>
    ${x.end ? `<circle class="hx-ce" cx="${X(en)}" cy="${Y(0)}" r="5"><title>Прошла в ${esc(x.end)}</title></circle>` : ""}
    ${pts.map(p => `<g style="--v:${p.v}"><circle class="hx-cd" cx="${X(p.at)}" cy="${Y(p.v)}" r="6.5"><title>${esc(p.t)} · ${p.v}/10</title></circle><text class="hx-cv" x="${X(p.at)}" y="${+Y(p.v) - 12}">${p.v}</text></g>`).join("")}
    ${shown.map(([t, l]) => `<text class="hx-cx" x="${X(t)}" y="${H - 10}">${esc(l)}</text>`).join("")}
  </svg>`;
}

function hxDraw() {
  const x = ui.hx, wake = state.days?.[x.d]?.wake, open = !x.end, dur = hxDur({ d: x.d, hx: x }), top = hxTop(x), bad = hxBad(x);
  const chips = (list, key) => `<div class="tchips">${list.map(([k, n]) => `<button type="button" class="tchip" data-hx-tog="${key}|${k}" aria-pressed="${x[key].includes(k)}">${n}</button>`).join("")}</div>`;
  const pills = [...new Set([...HX_PILLS, ...hxEps().flatMap(e => (e.hx.meds || []).map(m => m.n))])].filter(Boolean);
  const sec = (cls, tone, title, body, right = "") => `<section class="card cl-box hx-sec ${cls} ${tone}"><div class="cl-bh"><div class="cl-bt"><h4>${title}</h4></div>${right ? `<div class="hx-br">${right}</div>` : ""}</div>${body}</section>`;
  const vasRow = (attr, val, cls = "") => `<div class="hx-vas ${cls}" role="group">${Array.from({ length: 10 }, (_, k) => k + 1).map(v => `<button type="button" class="v${v}" ${attr}="${v}" aria-pressed="${val === v}">${v}</button>`).join("")}</div>`;
  const durTxt = bad ? "Конец раньше начала" : dur == null ? "" : `${open ? "Длится" : "Длилась"} ${hxLen(dur)}`;
  const today = todayISO();

  const when = sec("hx-s-when", "t-acc", "Когда", `
    <div class="hx-wrow"><span class="hx-wl">Началась</span>
      <input class="input hx-dt" type="date" data-hx-d value="${esc(x.d)}" max="${today}" aria-label="Дата начала">
      <input class="input hx-dt" type="time" data-hx-start value="${esc(x.start)}" aria-label="Время начала"></div>
    <div class="tchips">${HX_AGO.filter(([m]) => m !== 30).map(([m, n]) => `<button type="button" class="tchip" data-hx-sago="${m}" aria-pressed="${x.sago === m}">${n}</button>`).join("")}
      <button type="button" class="tchip" data-hx-woke aria-pressed="${!!wake && x.start === wake}">${wake ? `С утра, ${wake}` : "С утра, как проснулся"}</button></div>
    <div class="hx-wrow"><span class="hx-wl">Закончилась</span>${clSeg("data-hx-still", [[1, "Ещё болит", "g2"], [0, "Прошла", "g0"]], open ? 1 : 0, "hx-still")}</div>
    ${open ? "" : hxEndPick(x)}`,
    durTxt ? `<span class="hx-durp${bad ? " bad" : ""}">${durTxt}</span>` : "");

  const ptsRows = x.pts.map((p, k) => `<div class="hx-pt">
      <input class="input hx-dt" type="date" data-hx-pd="${k}" value="${esc(p.d)}" aria-label="Дата">
      <input class="input hx-dt" type="time" data-hx-pt="${k}" value="${esc(p.t)}" aria-label="Время">
      <span class="hx-sp"></span>
      <button type="button" class="hx-step" data-hx-pv="${k}|-1" aria-label="Слабее">−</button>
      <span class="hx-v" style="--v:${p.v}">${p.v}</span>
      <button type="button" class="hx-step" data-hx-pv="${k}|1" aria-label="Сильнее">+</button>
      <button type="button" class="icon-btn" data-hx-pdel="${k}" aria-label="Убрать отметку">×</button></div>`).join("");
  const strength = sec("hx-s-vas", "t-edge", "Сила", `
    ${x.pts.length ? "" : vasRow("data-hx-vas", x.vas)}
    <div class="hx-sub"><span class="hx-l">Как менялась сила</span>
      ${hxChart(x)}
      ${x.pts.length ? `<div class="hx-pts">${ptsRows}</div>` : ""}
      <div class="hx-now"><span class="hx-nl" title="${open ? "Отметить силу на текущий момент" : "Добавить отметку, время потом можно поправить"}">${open ? "Сейчас" : "Отметка"}</span>${vasRow("data-hx-now", null, "sm")}</div></div>`,
    `<span class="hx-v lg" style="--v:${top}" title="${x.pts.length ? "Самая сильная отметка" : "Сила"}">${top}</span><span class="hx-of">из 10</span>`);

  const meds = sec("hx-s-meds", "t-low", "Таблетки", `
    ${x.meds.length ? `<div class="hx-medl">${x.meds.map((m, k) => `<div class="hx-med">
      <input class="input hx-mn" list="hxPills" data-hx-mn="${k}" value="${esc(m.n)}" placeholder="Название" autocomplete="off">
      <input class="input hx-dt" type="date" data-hx-md="${k}" value="${esc(m.d || x.d)}" aria-label="Дата">
      <input class="input hx-dt" type="time" data-hx-mt="${k}" value="${esc(m.t || "")}" aria-label="Время">
      <button type="button" class="icon-btn" data-hx-mdel="${k}" aria-label="Убрать">×</button>
      ${clSeg(`data-hx-eff="${k}" data-v`, HX_EFF, m.eff || null, "hx-eff")}</div>`).join("")}</div>` : ""}
    <div class="tchips">${pills.slice(0, 8).map(p => `<button type="button" class="tchip" data-hx-padd="${esc(p)}">+ ${esc(p)}</button>`).join("")}<button type="button" class="tchip" data-hx-padd="">+ Другая</button></div>
    <datalist id="hxPills">${pills.map(p => `<option value="${esc(p)}">`).join("")}</datalist>`);

  const note = sec("hx-s-note", "t-mute", "Заметка", `<textarea class="input sy-grow hx-note" data-hx-note rows="3" placeholder="Что ещё было">${esc(x.note)}</textarea>`);
  const where = sec("hx-s-where", "t-high", "Где болит", hxHead(x.loc));
  const kind = sec("hx-s-kind", "t-high", "Какая боль", chips(HX_KIND, "kind"));
  const feel = sec("hx-s-feel", "t-ok", "Как себя чувствовал", `
    <div class="hx-sub"><span class="hx-l">Вместе с этим</span>${chips(HX_WITH, "with")}</div>
    <div class="hx-sub"><span class="hx-l" title="Насколько боль мешала делам">Как прошёл день</span>${clSeg("data-hx-imp", HX_IMP, x.imp || null, "hx-imp")}</div>
    <div class="hx-sub"><span class="hx-l">Настроение</span>${clSeg("data-hx-mood", DY_MOOD.map(([k, n]) => [k, n, "m" + k]), x.mood, "dots hx-mood")}</div>`);
  const trig = sec("hx-s-trig", "t-mute", "Что могло вызвать", chips(HX_TRIG, "trig"));

  openX(`<div class="dlg-head hx-head"><div><h3>Головная боль</h3><small>${esc(hxRange(x.d, x))}</small></div><button type="button" class="icon-btn" data-xclose aria-label="Закрыть">×</button></div>
    <div class="hx-body">
      <div class="hx-col">${when}${strength}${meds}${note}</div>
      <div class="hx-col">${where}${kind}${feel}${trig}</div>
    </div>
    <div class="hx-foot">${x.i != null ? `<button type="button" class="btn ghost danger" data-hx-del>Удалить</button>` : ""}<span class="hx-sp"></span><button type="button" class="btn primary" data-hx-save>Сохранить</button></div>`, "hx-x hx-dlg");
  $$("#xBody .sy-grow").forEach(syGrow);
}

// a new start date moves the whole episode: the end, the check-ins and the pills shift by the same days
function hxMove(x, d) {
  const n = daysBetween(x.d, d); if (!n) return;
  const sh = v => v ? addDaysISO(v, n) : v;
  if (x.end) x.endD = sh(hxEndD(x, x.d));
  x.pts.forEach(p => { p.d = sh(p.d); }); x.meds.forEach(m => { m.d = sh(m.d || x.d); });
  x.d = d;
}
// a check-in at the current moment; the first one also keeps the starting strength as a point at the start
function hxAddPt(x, v) {
  let p;
  if (!x.end) { const [d, t] = hxIso(Date.now()); p = { d, t, v }; }
  else {
    const prev = x.pts.length ? Math.max(...x.pts.map(q => hxAt(q.d, q.t))) : hxAt(x.d, x.start), end = hxAt(hxEndD(x, x.d), x.end);
    const [d, t] = hxIso(isFinite(prev) && isFinite(end) ? (prev + end) / 2 : Date.now()); p = { d, t, v };
  }
  if (!x.pts.length && x.start && x.vas && !(p.d === x.d && p.t === x.start)) x.pts.push({ d: x.d, t: x.start, v: x.vas });
  x.pts.push(p);
  x.pts.sort((a, b) => (a.d + a.t).localeCompare(b.d + b.t));
  x.vas = hxTop(x);
}

// a complaint's mark on a day follows the strongest record left on that day, and goes when none is left
function hxMark(id, d) {
  const s = state.symptoms[id], l = (s.log || []).filter(e => e.d === d);
  if (l.length) (dyDay(d).sy ||= {})[id] = Math.max(...l.map(e => e.sev || 1));
  else if (state.days?.[d]?.sy) { delete state.days[d].sy[id]; dyTidy(d); }
}
const hxEndMsg = (d, x) => { const ed = hxEndD(x, d), dur = hxDur({ d, hx: x }); return `Прошла ${ed !== todayISO() ? hxDay(ed) + " " : ""}в ${x.end}${dur != null ? ` · длилась ${hxLen(dur)}` : ""}`; };

function hxSave() {
  const x = ui.hx; if (!x) return true;
  if (!x.d) { toast("Укажи дату начала"); return false; }
  if (hxBad(x)) { toast("Конец раньше начала, поправь время"); return false; }
  const id = hxSymId(), s = state.symptoms[id];
  const { i, d, note, ago, sago, ...h } = x;
  const pts = h.pts.filter(p => p.d && p.t && p.v).sort((a, b) => (a.d + a.t).localeCompare(b.d + b.t));
  const vas = pts.length ? Math.max(...pts.map(p => p.v)) : h.vas;
  const hx = { ...h, vas, pts, meds: h.meds.filter(m => m.n.trim()).map(m => ({ ...m, n: m.n.trim(), d: m.d || d })) };
  if (hx.end) hx.endD = hxEndD(hx, d); else { hx.end = ""; delete hx.endD; }
  if (!pts.length) delete hx.pts;
  if (!hx.imp) delete hx.imp;
  if (!hx.mood) delete hx.mood;
  const entry = { d, sev: hxSev(vas), t: Date.now(), hx };
  if (note.trim()) entry.note = note.trim();
  s.log = [...(s.log || [])];
  const old = i != null ? s.log[i] : null;
  if (old) { const ne = { ...old, ...entry }; if (!entry.note) delete ne.note; s.log[i] = ne; } else s.log.push(entry);
  if (s.pattern === "once" && new Set(s.log.map(l => l.d)).size > 1) s.pattern = "recur";
  // the day's worst strength follows the strongest episode of that day; a moved episode frees its old day
  hxMark(id, d); if (old && old.d !== d) hxMark(id, old.d);
  ui.hx = null;
  save(); closeX(); renderAll();
  const dur = hxDur({ d, hx });
  toast(hx.end && (ui.hxWasOpen || !old) ? hxEndMsg(d, hx) : hx.end ? `Сохранил · ${hxRange(d, hx)}${dur != null ? `, ${hxLen(dur)}` : ""}` : `Записал · ещё болит${dur ? `, ${hxLen(dur)}` : ""}`);
  return true;
}

// «Прошла» on the banner: asks when
function hxEndAsk(i) {
  const s = hxSym(), e = s?.log?.[i]; if (!e?.hx) return;
  const [d, t] = hxIso(Date.now());
  ui.hxEnd = { i, d: e.d, start: e.hx.start || "", endD: d, end: t, ago: 0 };
  hxEndDraw();
}
function hxEndDraw() {
  const x = ui.hxEnd, dur = hxDur({ d: x.d, hx: x }), bad = hxBad(x);
  openX(`<div class="dlg-head"><div><h3>Когда прошла?</h3><small class="hx-endst">Началась ${esc(hxDay(x.d))}, ${esc(x.start || "?")}</small></div><button type="button" class="icon-btn" data-xclose aria-label="Закрыть">×</button></div>
    ${hxEndPick(x)}
    <p class="hx-endsum${bad ? " bad" : ""}">${bad ? "Конец раньше начала" : dur != null ? `Длилась ${hxLen(dur)}` : ""}</p>
    <div class="dlg-foot"><button type="button" class="btn ghost" data-xclose>Отмена</button><button type="button" class="btn primary" data-hx-endsave${bad || !x.end ? " disabled" : ""}>Сохранить</button></div>`, "hx-x hx-endd");
}
function hxEndSave() {
  const x = ui.hxEnd, s = hxSym(), en = s?.log?.[x?.i]; if (!en?.hx || !x.end) return;
  if (hxBad(x)) { toast("Конец раньше начала, поправь время"); return; }
  en.hx = { ...en.hx, end: x.end, endD: x.endD || hxEndD(x, x.d) };
  ui.hxEnd = null;
  save(); closeX(); renderAll(); toast(hxEndMsg(en.d, en.hx));
}

/* ---------- the page: Symptoms → Голова ---------- */
function hxPage() {
  const eps = hxEps(), today = todayISO(), from = addDaysISO(today, -29);
  const last30 = eps.filter(e => e.d >= from), days = new Set(last30.map(e => e.d)), medDays = new Set(last30.filter(e => (e.hx.meds || []).length).map(e => e.d));
  const durs = last30.map(hxDur).filter(v => v != null), avgVas = last30.length ? last30.reduce((a, e) => a + (e.hx.vas || 0), 0) / last30.length : 0;
  const heat = {}; eps.forEach(e => (e.hx.loc || []).forEach(k => { heat[k] = (heat[k] || 0) + 1; }));
  // what helps: per pill, how often it helped
  const pills = {};
  eps.forEach(e => (e.hx.meds || []).forEach(m => { const p = (pills[m.n] ||= { n: 0, yes: 0, part: 0, no: 0 }); p.n++; if (m.eff) p[m.eff]++; }));
  const open = hxOpen();
  // the month: days coloured by the strongest episode, an episode over midnight colours every day it covers
  const ref = ui.hxMonth || today.slice(0, 7), first = ref + "-01", start = clMonday(first);
  const t = new Date(first + "T00:00:00"), next = new Date(t.getFullYear(), t.getMonth() + 1, 1);
  const last = addDaysISO(`${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}-01`, -1);
  const cells = Array.from({ length: Math.ceil((daysBetween(start, last) + 1) / 7) * 7 }, (_, i) => addDaysISO(start, i));
  const byDay = {}, dayEp = {};
  eps.forEach(e => hxSpan(e).forEach(d => { const v = e.hx.vas || 1; if (v > (byDay[d] || 0)) { byDay[d] = v; dayEp[d] = e.i; } }));
  const stat = (v, l, cls = "") => `<div class="hx-stat ${cls}"><b>${v}</b><span>${l}</span></div>`;
  return `<div class="hx-page">
    ${open ? hxBanner(open) : ""}
    <div class="hx-top">
      ${stat(days.size, `${plural(days.size, "день", "дня", "дней")} с болью за 30 дней`, days.size >= 15 ? "warn" : "")}
      ${stat(medDays.size, `${plural(medDays.size, "день", "дня", "дней")} с таблетками`, medDays.size >= 10 ? "warn" : "")}
      ${stat(last30.length ? dyNum(avgVas) : "—", "средняя сила из 10")}
      ${stat(durs.length ? hxLen(Math.round(durs.reduce((a, b) => a + b, 0) / durs.length / 10) * 10) : "—", "в среднем длится")}
      <button type="button" class="btn primary hx-add" data-hx-new>+ Болит голова</button>
    </div>
    <div class="hx-cols">
      <section class="card cl-box t-edge"><div class="cl-bh"><div class="cl-bt"><h4>${CL_MONTHS[t.getMonth()]} ${t.getFullYear()}</h4></div>
        <div class="cl-br" style="flex-direction:row"><button type="button" class="icon-btn" data-hx-mon="-1" aria-label="Назад">‹</button><button type="button" class="icon-btn" data-hx-mon="1" aria-label="Вперёд">›</button></div></div>
        <div class="hx-cal">${CL_WD.map(w => `<span class="cl-wd">${w}</span>`).join("")}${cells.map(d => { const v = byDay[d]; return `<button type="button" class="hx-day${d.slice(0, 7) !== ref ? " other" : ""}${d === today ? " now" : ""}${v ? " has" : ""}" ${v ? `style="--v:${v}" data-hx-open="${dayEp[d]}"` : "disabled"} title="${fmtDate(d)}${v ? ` · ${v}/10` : ""}"><b>${+d.slice(8)}</b>${v ? `<i>${v}</i>` : ""}</button>`; }).join("")}</div></section>
      <section class="card cl-box t-edge"><div class="cl-bh"><div class="cl-bt"><h4>Где болит чаще</h4></div></div>${eps.length ? hxHead([], heat) : `<p class="cl-muted">Пока нет записей</p>`}</section>
      <section class="card cl-box t-edge"><div class="cl-bh"><div class="cl-bt"><h4>Что помогает</h4></div></div>
        ${Object.keys(pills).length ? Object.entries(pills).sort((a, b) => b[1].n - a[1].n).map(([n, p]) => `<div class="hx-pill"><span>${esc(n)}</span><span class="hx-pbar"><i class="yes" style="flex:${p.yes}"></i><i class="part" style="flex:${p.part}"></i><i class="no" style="flex:${p.no}"></i><i class="unk" style="flex:${p.n - p.yes - p.part - p.no}"></i></span><b>${p.yes}/${p.n}</b></div>`).join("") : `<p class="cl-muted">Пока нет таблеток в записях</p>`}</section>
    </div>
    <section class="card hx-list">${eps.length ? eps.slice(0, 60).map(hxRow).join("") : `<p class="cl-muted" style="padding:20px">Записей пока нет</p>`}</section>
  </div>`;
}
function hxRow(e) {
  const x = e.hx, dur = hxDur(e), imp = HX_IMP.find(([k]) => k === x.imp);
  const where = [(x.loc || []).map(k => HX_ZONES[k]).join(", "), (x.kind || []).map(k => HX_KIND.find(([y]) => y === k)?.[1].toLowerCase()).join(", ")].filter(Boolean).join(" · ");
  return `<button type="button" class="hx-ep" data-hx-open="${e.i}">
    <span class="hx-v" style="--v:${x.vas}" title="Самая сильная">${x.vas}</span>
    <span class="hx-epm"><b>${esc(hxRange(e.d, x))}</b>
      <span class="hx-epi">${dur != null ? `<span>${x.end ? hxLen(dur) : `уже ${hxLen(dur)}`}</span>` : ""}${x.pts?.length > 1 ? `<span>${x.pts.map(p => p.v).join(" → ")}</span>` : ""}${imp ? `<em class="${imp[2]}">${imp[1]}</em>` : ""}</span>
      ${where ? `<small>${esc(where)}</small>` : ""}</span>
    <span class="hx-epmeds">${(x.meds || []).map(m => `<i class="e-${m.eff || "unk"}" title="${esc([m.t, HX_EFF.find(([k]) => k === m.eff)?.[1] || "эффект не отмечен"].filter(Boolean).join(" · "))}">${esc(m.n)}</i>`).join("")}</span></button>`;
}
// while it still hurts: on the calendar and the head page
function hxBanner(e) {
  const dur = hxDur(e);
  return `<div class="hx-banner"><span class="hx-v" style="--v:${e.hx.vas}">${e.hx.vas}</span><b>Голова болит${dur ? ` ${hxLen(dur)}` : dur === 0 ? ", только началась" : ""}</b>
    <span class="hx-sp"></span><button type="button" class="btn sm" data-hx-pill="${e.i}">Принял таблетку</button><button type="button" class="btn sm" data-hx-done="${e.i}">Прошла</button><button type="button" class="btn sm ghost" data-hx-open="${e.i}">Открыть</button></div>`;
}

/* ---------- wiring ---------- */
function initHeadache() {
  document.addEventListener("click", e => {
    const t = e.target;
    if (t.closest("#xDlg.hx-x")) return;
    if (t.closest("[data-hx-new]")) { openHx(null); return; }
    const op = t.closest("[data-hx-open]"); if (op) { openHx(+op.dataset.hxOpen); return; }
    const dn = t.closest("[data-hx-done]"); if (dn) { hxEndAsk(+dn.dataset.hxDone); return; }
    const pl = t.closest("[data-hx-pill]");
    if (pl) { openHx(+pl.dataset.hxPill); const [d, tm] = hxIso(Date.now()); ui.hx.meds.push({ n: "", d, t: tm, eff: "" }); hxDraw(); $$("#xBody [data-hx-mn]").at(-1)?.focus(); return; }
    const mo = t.closest("[data-hx-mon]");
    if (mo) { const [y, m] = (ui.hxMonth || todayISO().slice(0, 7)).split("-").map(Number), d = new Date(y, m - 1 + +mo.dataset.hxMon, 1); ui.hxMonth = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`; renderSymptoms(); return; }
  });
  const xd = $("#xDlg");
  const isEnd = () => xd.classList.contains("hx-endd");
  xd.addEventListener("click", e => {
    if (!xd.classList.contains("hx-x")) return;
    const t = e.target, x = isEnd() ? ui.hxEnd : ui.hx, redraw = isEnd() ? hxEndDraw : hxDraw; if (!x) return;
    // the end: quick "ago" chips, shared by the chooser and the window
    const ag = t.closest("[data-hx-ago]"); if (ag) { const m = +ag.dataset.hxAgo; [x.endD, x.end] = hxIso(Date.now() - m * 6e4); x.ago = m; redraw(); return; }
    if (t.closest("[data-hx-endsave]")) { hxEndSave(); return; }
    if (isEnd()) return;
    const sa = t.closest("[data-hx-sago]"); if (sa) { const m = +sa.dataset.hxSago, [d, tm] = hxIso(Date.now() - m * 6e4); hxMove(x, d); x.start = tm; x.sago = m; hxDraw(); return; }
    if (t.closest("[data-hx-woke]")) { x.start = state.days?.[x.d]?.wake || "07:00"; x.sago = null; hxDraw(); return; }
    const st = t.closest("[data-hx-still]");
    if (st) { if (+st.dataset.hxStill) { x.end = ""; x.endD = ""; x.ago = null; } else if (!x.end) { [x.endD, x.end] = hxIso(Date.now()); x.ago = 0; } hxDraw(); return; }
    const zone = t.closest("[data-hx-z]"); if (zone) { const k = zone.dataset.hxZ; x.loc = x.loc.includes(k) ? x.loc.filter(y => y !== k) : [...x.loc, k]; hxDraw(); return; }
    const tg = t.closest("[data-hx-tog]"); if (tg) { const [key, k] = tg.dataset.hxTog.split("|"); x[key] = x[key].includes(k) ? x[key].filter(y => y !== k) : [...x[key], k]; hxDraw(); return; }
    const v = t.closest("[data-hx-vas]"); if (v) { x.vas = +v.dataset.hxVas; hxDraw(); return; }
    const nw = t.closest("[data-hx-now]"); if (nw) { hxAddPt(x, +nw.dataset.hxNow); hxDraw(); return; }
    const pv = t.closest("[data-hx-pv]"); if (pv) { const [k, dv] = pv.dataset.hxPv.split("|").map(Number), p = x.pts[k]; if (p) { p.v = Math.min(10, Math.max(1, p.v + dv)); x.vas = hxTop(x); } hxDraw(); return; }
    const pd = t.closest("[data-hx-pdel]"); if (pd) { x.pts.splice(+pd.dataset.hxPdel, 1); if (x.pts.length) x.vas = hxTop(x); hxDraw(); return; }
    const im = t.closest("[data-hx-imp]"); if (im) { const k = im.dataset.hxImp; x.imp = x.imp === k ? "" : k; hxDraw(); return; }
    const mt = t.closest("[data-hx-mood]"); if (mt) { const k = +mt.dataset.hxMood; x.mood = x.mood === k ? null : k; hxDraw(); return; }
    const ef = t.closest("[data-hx-eff]"); if (ef) { const m = x.meds[+ef.dataset.hxEff], val = ef.dataset.v; if (m) m.eff = m.eff === val ? "" : val; hxDraw(); return; }
    const pa = t.closest("[data-hx-padd]");
    if (pa) { const [d, tm] = !x.end ? hxIso(Date.now()) : [x.d, ""]; x.meds.push({ n: pa.dataset.hxPadd, d, t: tm, eff: "" }); hxDraw(); if (!pa.dataset.hxPadd) $$("#xBody [data-hx-mn]").at(-1)?.focus(); return; }
    const md = t.closest("[data-hx-mdel]"); if (md) { x.meds.splice(+md.dataset.hxMdel, 1); hxDraw(); return; }
    if (t.closest("[data-hx-save]")) { hxSave(); return; }
    if (t.closest("[data-hx-del]") && confirm("Удалить эту запись о головной боли?")) {
      // hxSym() is a copy (syList spreads), the log is changed on the stored complaint
      const id = hxSym()?.id, sy = id && state.symptoms[id]; if (!sy || x.i == null) return;
      const d = sy.log[x.i]?.d; sy.log = sy.log.filter((_, k) => k !== x.i); if (d) hxMark(id, d);
      ui.hx = null; save(); closeX(); renderAll(); toast("Запись удалена");
    }
  });
  // typed fields go into the draft; date and time also refresh the duration
  xd.addEventListener("input", e => {
    if (!xd.classList.contains("hx-x")) return;
    const t = e.target, x = isEnd() ? ui.hxEnd : ui.hx; if (!x) return;
    const k = n => +t.dataset[n];
    if (t.matches("[data-hx-endd]")) { x.endD = t.value; x.ago = null; }
    else if (t.matches("[data-hx-end]")) { x.end = t.value; x.ago = null; }
    else if (isEnd()) return;
    else if (t.matches("[data-hx-d]")) { if (!t.value) return; hxMove(x, t.value); x.sago = null; }
    else if (t.matches("[data-hx-start]")) { x.start = t.value; x.sago = null; }
    else if (t.matches("[data-hx-pd]")) { if (x.pts[k("hxPd")] && t.value) x.pts[k("hxPd")].d = t.value; }
    else if (t.matches("[data-hx-pt]")) { if (x.pts[k("hxPt")] && t.value) x.pts[k("hxPt")].t = t.value; }
    else if (t.matches("[data-hx-mn]")) { x.meds[k("hxMn")].n = t.value; return; }
    else if (t.matches("[data-hx-md]")) { x.meds[k("hxMd")].d = t.value; return; }
    else if (t.matches("[data-hx-mt]")) { x.meds[k("hxMt")].t = t.value; return; }
    else if (t.matches("[data-hx-note]")) { x.note = t.value; syGrow(t); return; }
    else return;
    (isEnd() ? hxEndDraw : hxDraw)();
  });
  // leaving the window with unsaved changes asks first: the × or the backdrop (caught before the shared close), Esc,
  // and the close event as a fallback; a failed save (end before start) keeps the window open
  const hxLeave = () => {
    const x = ui.hx; if (!x || !xd.classList.contains("hx-dlg")) return true;
    if (hxSnap(x) !== ui.hxOrig && confirm("Сохранить изменения в записи о головной боли?")) return hxSave();
    ui.hx = null; return true;
  };
  xd.addEventListener("click", e => {
    if (!ui.hx || !xd.classList.contains("hx-dlg") || !(e.target === xd || e.target.closest("[data-xclose]"))) return;
    if (!hxLeave()) { e.stopImmediatePropagation(); e.preventDefault(); }
  }, true);
  xd.addEventListener("cancel", e => { if (!hxLeave()) e.preventDefault(); });
  // the close event can come late, after the next window has opened: it then has nothing to do
  xd.addEventListener("close", () => { if (xd.open) return; ui.hxEnd = null; if (ui.hx && !hxLeave()) hxDraw(); });
}
