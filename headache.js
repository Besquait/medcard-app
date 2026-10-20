// Headache diary, like a migraine calendar: an episode with its start (and end, or "still hurts"), strength 1–10,
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
const hxMin = t => { const [h, m] = (t || "0:0").split(":").map(Number); return h * 60 + m; };
// minutes from the start to the end, or to now while it still hurts
function hxDur(e) {
  const x = e.hx; if (!x.start) return null;
  const startAt = new Date(`${e.d}T${x.start}:00`).getTime();
  let endAt;
  if (x.end) { endAt = new Date(`${e.d}T${x.end}:00`).getTime(); if (endAt <= startAt) endAt += 864e5; }
  else endAt = Date.now();
  return Math.max(0, Math.round((endAt - startAt) / 6e4));
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

/* ---------- the episode form ---------- */
// draft lives in ui.hx while the window is open
function openHx(i) {
  const s = hxSym(), e = i != null && s ? s.log[i] : null, today = clSel ? clSel() : todayISO();
  ui.hx = e ? { i, d: e.d, ...JSON.parse(JSON.stringify(e.hx)), note: e.note || "" }
    : { i: null, d: today, start: today === todayISO() ? clHM() : "", end: "", vas: 5, loc: [], kind: [], with: [], meds: [], trig: [], note: "" };
  hxDraw();
}
function hxDraw() {
  const x = ui.hx, wake = state.days?.[x.d]?.wake;
  const chips = (list, key) => `<div class="tchips">${list.map(([k, n]) => `<button type="button" class="tchip" data-hx-tog="${key}|${k}" aria-pressed="${x[key].includes(k)}">${n}</button>`).join("")}</div>`;
  const pills = [...new Set([...HX_PILLS, ...hxEps().flatMap(e => (e.hx.meds || []).map(m => m.n))])];
  openX(`<div class="dlg-head"><h3>Головная боль</h3><button type="button" class="icon-btn" data-xclose aria-label="Закрыть">×</button></div>
    <div class="hx-form">
      <div class="hx-when">
        <label class="hx-f"><span>Началась</span><input class="input" type="time" data-hx-start value="${esc(x.start)}"></label>
        <button type="button" class="tchip" data-hx-woke>${wake ? `с утра, ${wake}` : "с утра, как проснулся"}</button>
        <span class="hx-sp"></span>
        ${clSeg("data-hx-still", [[1, "Ещё болит", "g2"], [0, "Прошла", "g0"]], x.end ? 0 : 1, "hx-still")}
        ${x.end || ui.hxEndOpen ? `<label class="hx-f"><span>в</span><input class="input" type="time" data-hx-end value="${esc(x.end)}"></label>` : ""}
      </div>
      <div class="hx-row"><span class="hx-l">Сила</span><div class="hx-vas" role="group">${Array.from({ length: 10 }, (_, k) => k + 1).map(v => `<button type="button" class="v${v}" data-hx-vas="${v}" aria-pressed="${x.vas === v}">${v}</button>`).join("")}</div></div>
      <div class="hx-grid">
        <div class="hx-where"><span class="hx-l">Где</span>${hxHead(x.loc)}</div>
        <div class="hx-side">
          <div><span class="hx-l">Какая</span>${chips(HX_KIND, "kind")}</div>
          <div><span class="hx-l">Вместе с этим</span>${chips(HX_WITH, "with")}</div>
          <div><span class="hx-l">Что могло вызвать</span>${chips(HX_TRIG, "trig")}</div>
        </div>
      </div>
      <div class="hx-meds"><span class="hx-l">Таблетки</span>
        ${x.meds.map((m, k) => `<div class="hx-med"><input class="input" list="hxPills" data-hx-mn="${k}" value="${esc(m.n)}" placeholder="Название" autocomplete="off">
          <input class="input hx-mt" type="time" data-hx-mt="${k}" value="${esc(m.t || "")}">
          ${clSeg(`data-hx-eff="${k}" data-v`, HX_EFF, m.eff || null, "hx-eff")}
          <button type="button" class="icon-btn sm" data-hx-mdel="${k}" aria-label="Убрать">×</button></div>`).join("")}
        <div class="tchips">${pills.slice(0, 8).map(p => `<button type="button" class="tchip" data-hx-padd="${esc(p)}">+ ${esc(p)}</button>`).join("")}</div>
        <datalist id="hxPills">${pills.map(p => `<option value="${esc(p)}">`).join("")}</datalist></div>
      <textarea class="input sy-grow" data-hx-note rows="1" placeholder="Заметка">${esc(x.note)}</textarea>
      <div class="dlg-foot">${x.i != null ? `<button type="button" class="btn ghost" data-hx-del>Удалить</button>` : ""}<span style="flex:1"></span><button type="button" class="btn primary" data-hx-save>Сохранить</button></div>
    </div>`, "st-dlg tp-dlg cl-dlg hx-dlg");
  $$("#xBody .sy-grow").forEach(syGrow);
}
function hxSave() {
  const x = ui.hx; if (!x) return;
  const id = hxSymId(), s = state.symptoms[id];
  const hx = { start: x.start, end: x.end, vas: x.vas, loc: x.loc, kind: x.kind, with: x.with, meds: x.meds.filter(m => m.n.trim()), trig: x.trig };
  const entry = { d: x.d, sev: hxSev(x.vas), t: Date.now(), hx, ...(x.note.trim() ? { note: x.note.trim() } : {}) };
  s.log = [...(s.log || [])];
  if (x.i != null && s.log[x.i]) s.log[x.i] = { ...s.log[x.i], ...entry }; else s.log.push(entry);
  if (s.pattern === "once" && new Set(s.log.map(l => l.d)).size > 1) s.pattern = "recur";
  // the day's worst strength follows the strongest episode of that day
  const top = Math.max(...s.log.filter(l => l.d === x.d).map(l => l.sev || 1));
  (dyDay(x.d).sy ||= {})[id] = top;
  ui.hx = null; ui.hxEndOpen = false;
  save(); closeX(); renderAll();
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
  // the month: days coloured by the strongest episode
  const ref = ui.hxMonth || today.slice(0, 7), first = ref + "-01", start = clMonday(first);
  const t = new Date(first + "T00:00:00"), next = new Date(t.getFullYear(), t.getMonth() + 1, 1);
  const last = addDaysISO(`${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}-01`, -1);
  const cells = Array.from({ length: Math.ceil((daysBetween(start, last) + 1) / 7) * 7 }, (_, i) => addDaysISO(start, i));
  const byDay = {}; eps.forEach(e => { byDay[e.d] = Math.max(byDay[e.d] || 0, e.hx.vas || 0); });
  const stat = (v, l, cls = "") => `<div class="hx-stat ${cls}"><b>${v}</b><span>${l}</span></div>`;
  return `<div class="hx-page">
    ${open ? hxBanner(open) : ""}
    <div class="hx-top">
      ${stat(days.size, `${plural(days.size, "день", "дня", "дней")} с болью за 30 дней`, days.size >= 15 ? "warn" : "")}
      ${stat(medDays.size, `${plural(medDays.size, "день", "дня", "дней")} с таблетками`, medDays.size >= 10 ? "warn" : "")}
      ${stat(last30.length ? dyNum(avgVas) : "—", "средняя сила из 10")}
      ${stat(durs.length ? clHours(Math.round(durs.reduce((a, b) => a + b, 0) / durs.length / 10) * 10) : "—", "в среднем длится")}
      <button type="button" class="btn primary hx-add" data-hx-new>+ Болит голова</button>
    </div>
    <div class="hx-cols">
      <section class="card cl-box t-edge"><div class="cl-bh"><div class="cl-bt"><h4>${CL_MONTHS[t.getMonth()]} ${t.getFullYear()}</h4></div>
        <div class="cl-br" style="flex-direction:row"><button type="button" class="icon-btn" data-hx-mon="-1" aria-label="Назад">‹</button><button type="button" class="icon-btn" data-hx-mon="1" aria-label="Вперёд">›</button></div></div>
        <div class="hx-cal">${CL_WD.map(w => `<span class="cl-wd">${w}</span>`).join("")}${cells.map(d => { const v = byDay[d]; return `<button type="button" class="hx-day${d.slice(0, 7) !== ref ? " other" : ""}${d === today ? " now" : ""}${v ? " has" : ""}" ${v ? `style="--v:${v}" data-hx-day="${d}"` : "disabled"} title="${fmtDate(d)}${v ? ` · ${v}/10` : ""}"><b>${+d.slice(8)}</b>${v ? `<i>${v}</i>` : ""}</button>`; }).join("")}</div></section>
      <section class="card cl-box t-edge"><div class="cl-bh"><div class="cl-bt"><h4>Где болит чаще</h4></div></div>${eps.length ? hxHead([], heat) : `<p class="cl-muted">Пока нет записей</p>`}</section>
      <section class="card cl-box t-edge"><div class="cl-bh"><div class="cl-bt"><h4>Что помогает</h4></div></div>
        ${Object.keys(pills).length ? Object.entries(pills).sort((a, b) => b[1].n - a[1].n).map(([n, p]) => `<div class="hx-pill"><span>${esc(n)}</span><span class="hx-pbar"><i class="yes" style="flex:${p.yes}"></i><i class="part" style="flex:${p.part}"></i><i class="no" style="flex:${p.no}"></i><i class="unk" style="flex:${p.n - p.yes - p.part - p.no}"></i></span><b>${p.yes}/${p.n}</b></div>`).join("") : `<p class="cl-muted">Пока нет таблеток в записях</p>`}</section>
    </div>
    <section class="card hx-list">${eps.length ? eps.slice(0, 60).map(hxRow).join("") : `<p class="cl-muted" style="padding:20px">Записей пока нет</p>`}</section>
  </div>`;
}
function hxRow(e) {
  const x = e.hx, dur = hxDur(e);
  return `<button type="button" class="hx-ep" data-hx-open="${e.i}">
    <span class="hx-v" style="--v:${x.vas}">${x.vas}</span>
    <span class="hx-epm"><b>${fmtDate(e.d)} · ${x.start || "?"}${x.end ? `–${x.end}` : " · ещё болит"}${dur != null ? ` · ${clHours(dur)}` : ""}</b>
      <small>${esc([(x.loc || []).map(k => HX_ZONES[k]).join(", "), (x.kind || []).map(k => HX_KIND.find(([y]) => y === k)?.[1].toLowerCase()).join(", ")].filter(Boolean).join(" · "))}</small></span>
    <span class="hx-epmeds">${(x.meds || []).map(m => `<i class="e-${m.eff || "unk"}" title="${esc(HX_EFF.find(([k]) => k === m.eff)?.[1] || "эффект не отмечен")}">${esc(m.n)}</i>`).join("")}</span></button>`;
}
// while it still hurts: on the calendar and the head page
function hxBanner(e) {
  const dur = hxDur(e);
  return `<div class="hx-banner"><span class="hx-v" style="--v:${e.hx.vas}">${e.hx.vas}</span><b>Голова болит ${dur != null ? clHours(dur) : ""}</b>
    <span class="hx-sp"></span><button type="button" class="btn sm" data-hx-pill="${e.i}">Принял таблетку</button><button type="button" class="btn sm" data-hx-done="${e.i}">Прошла</button><button type="button" class="btn sm ghost" data-hx-open="${e.i}">Изменить</button></div>`;
}

/* ---------- wiring ---------- */
function initHeadache() {
  document.addEventListener("click", e => {
    const t = e.target;
    if (t.closest("[data-hx-new]")) { openHx(null); return; }
    const op = t.closest("[data-hx-open]"); if (op) { openHx(+op.dataset.hxOpen); return; }
    const dn = t.closest("[data-hx-done]");
    if (dn) { const s = hxSym(), en = s?.log?.[+dn.dataset.hxDone]; if (en?.hx) { en.hx = { ...en.hx, end: clHM() }; save(); renderAll(); toast("Записал, когда прошла"); } return; }
    const pl = t.closest("[data-hx-pill]"); if (pl) { openHx(+pl.dataset.hxPill); ui.hx.meds.push({ n: "", t: clHM(), eff: "" }); hxDraw(); $("[data-hx-mn]:last-of-type", $("#xBody"))?.focus(); return; }
    const dd = t.closest("[data-hx-day]"); if (dd) { const ep = hxEps().find(x => x.d === dd.dataset.hxDay); if (ep) openHx(ep.i); return; }
    const mo = t.closest("[data-hx-mon]");
    if (mo) { const [y, m] = (ui.hxMonth || todayISO().slice(0, 7)).split("-").map(Number), d = new Date(y, m - 1 + +mo.dataset.hxMon, 1); ui.hxMonth = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`; renderSymptoms(); return; }
  });
  const xd = $("#xDlg");
  xd.addEventListener("click", e => {
    if (!xd.classList.contains("hx-dlg") || !ui.hx) return;
    const t = e.target, x = ui.hx;
    const zone = t.closest("[data-hx-z]");
    if (zone) { const k = zone.dataset.hxZ; x.loc = x.loc.includes(k) ? x.loc.filter(y => y !== k) : [...x.loc, k]; hxDraw(); return; }
    const tg = t.closest("[data-hx-tog]"); if (tg) { const [key, k] = tg.dataset.hxTog.split("|"); x[key] = x[key].includes(k) ? x[key].filter(y => y !== k) : [...x[key], k]; hxDraw(); return; }
    const v = t.closest("[data-hx-vas]"); if (v) { x.vas = +v.dataset.hxVas; hxDraw(); return; }
    if (t.closest("[data-hx-woke]")) { x.start = state.days?.[x.d]?.wake || "07:00"; hxDraw(); return; }
    const st = t.closest("[data-hx-still]"); if (st) { if (+st.dataset.hxStill) { x.end = ""; ui.hxEndOpen = false; } else { x.end ||= clHM(); ui.hxEndOpen = true; } hxDraw(); return; }
    const ef = t.closest("[data-hx-eff]"); if (ef) { const m = x.meds[+ef.dataset.hxEff], val = ef.dataset.v; if (m) m.eff = m.eff === val ? "" : val; hxDraw(); return; }
    const pa = t.closest("[data-hx-padd]"); if (pa) { x.meds.push({ n: pa.dataset.hxPadd, t: clHM(), eff: "" }); hxDraw(); return; }
    const md = t.closest("[data-hx-mdel]"); if (md) { x.meds.splice(+md.dataset.hxMdel, 1); hxDraw(); return; }
    if (t.closest("[data-hx-save]")) { hxSave(); return; }
    if (t.closest("[data-hx-del]") && confirm("Удалить эту запись?")) { const s = hxSym(); if (s && x.i != null) { s.log = s.log.filter((_, k) => k !== x.i); ui.hx = null; save(); closeX(); renderAll(); } }
  });
  // typed fields go straight into the draft, without redrawing
  xd.addEventListener("input", e => {
    if (!ui.hx || !xd.classList.contains("hx-dlg")) return;
    const t = e.target, x = ui.hx;
    if (t.matches("[data-hx-start]")) x.start = t.value;
    else if (t.matches("[data-hx-end]")) x.end = t.value;
    else if (t.matches("[data-hx-mn]")) x.meds[+t.dataset.hxMn].n = t.value;
    else if (t.matches("[data-hx-mt]")) x.meds[+t.dataset.hxMt].t = t.value;
    else if (t.matches("[data-hx-note]")) { x.note = t.value; syGrow(t); }
  });
}
