"use strict";

/* ============ basics ============ */
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const isNum = x => typeof x === "number" && isFinite(x);
const parseNum = s => {
  if (s == null) return null;
  const t = String(s).replace(",", ".").replace(/[^\d.\-]/g, "");
  if (!t || t === "-" || t === ".") return null;
  const n = parseFloat(t);
  return isFinite(n) ? n : null;
};
const fmt = n => isNum(n) ? n.toLocaleString("ru-RU", { maximumFractionDigits: 3 }) : "—";
const fmtDate = d => d ? d.split("-").reverse().join(".") : "без даты";
const todayISO = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
const monthsAgo = d => { if (!d) return null; const a = new Date(d), b = new Date(); return (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth()); };
const agoText = d => { const m = monthsAgo(d); if (m == null) return ""; if (m < 1) return "в этом месяце"; if (m < 12) return `${m} мес. назад`; const y = Math.floor(m / 12); return `${y} ${plural(y, "год", "года", "лет")} назад`; };
const norm = s => String(s || "").toLowerCase().replace(/ё/g, "е").replace(/[ʼ'’`\s\-–—_.,()/]/g, "");
function plural(n, a, b, c) { n = Math.abs(n) % 100; const n1 = n % 10; if (n > 10 && n < 20) return c; if (n1 > 1 && n1 < 5) return b; if (n1 === 1) return a; return c; }

const GROUP_NAME = Object.fromEntries(GROUPS);
const GROUP_ORDER = Object.fromEntries(GROUPS.map(([g], i) => [g, i]));
const CAT = Object.fromEntries(CATALOG.map(m => [m.id, m]));
const CAT_ORDER = Object.fromEntries(CATALOG.map((m, i) => [m.id, i]));

/* ============ units ============ */
const unitKey = u => String(u || "").toLowerCase().replace(/[\s.]/g, "").replace(/μ/g, "µ");
const UNIT_LOOKUP = {};
for (const [tok, list] of Object.entries(UNIT_TOKENS)) list.forEach(s => { if (!(unitKey(s) in UNIT_LOOKUP)) UNIT_LOOKUP[unitKey(s)] = tok; });
const unitToken = u => UNIT_LOOKUP[unitKey(u)] || null;
// main unit of a marker: explicit conversion table first, then the catalog unit
function mainUnit(mid) {
  const conv = UNIT_CONV[mid], cat = CAT[mid];
  const tok = conv ? conv[0] : (cat ? unitToken(cat.unit) : null);
  const label = cat && unitToken(cat.unit) === tok ? cat.unit : (UNIT_LABEL[tok] || cat?.unit || "");
  return { tok, label, from: conv ? conv[1] : {} };
}
// A stored result converted to the marker's main unit. `o` keeps the numbers as printed on the blank.
function viewBase(id, r) {
  const o = { v: r.v, min: r.min, max: r.max, unit: r.unit || "" };
  const mu = mainUnit(r.m), tok = unitToken(r.unit);
  let f = null;
  if (mu.tok && tok === mu.tok) f = 1;
  else if (mu.tok && tok && mu.from[tok] != null) f = mu.from[tok];
  if (f == null) return { id, ...r, unit: r.unit || "", o, converted: false };
  const k = x => isNum(x) ? +(x * f).toPrecision(f === 1 ? 15 : 4) : x;
  return { id, ...r, v: k(r.v), min: k(r.min), max: k(r.max), unit: mu.label, o, converted: f !== 1 || unitKey(r.unit) !== unitKey(mu.label) };
}
// research targets and custom norms are applied on top of the blank (extras.js)
const view = (id, r) => applyTarget(viewBase(id, r));
const origText = r => `${fmt(r.o.v)} ${r.o.unit}`.trim();
// value that shows the blank's original on hover
const swap = (r, cls = "") => r.converted
  ? `<span class="swap ${cls}"><span class="c">${fmt(r.v)}</span><span class="o">${fmt(r.o.v)}</span></span>`
  : `<span class="${cls}">${fmt(r.v)}</span>`;
const pair = (r, vc, uc) => r.converted
  ? `<span class="swap" title="Наведи — покажу как на бланке"><span class="c"><span class="${vc}">${fmt(r.v)}</span> <span class="${uc}">${esc(r.unit)}</span></span><span class="o"><span class="${vc}">${fmt(r.o.v)}</span> <span class="${uc}">${esc(r.o.unit)}</span></span></span>`
  : `<span class="${vc}">${fmt(r.v)}</span> <span class="${uc}">${esc(r.unit)}</span>`;
const swapUnit = r => r.converted
  ? `<span class="swap"><span class="c">${esc(r.unit)}</span><span class="o">${esc(r.o.unit)}</span></span>`
  : esc(r.unit);

/* ============ norms & status ============ */
function parseRange(s) {
  const t = String(s || "").trim().replace(/,/g, ".");
  let m;
  if (!t) return { min: null, max: null };
  if ((m = t.match(/^(?:<|≤|до)\s*([\d.]+)/i))) return { min: null, max: parseFloat(m[1]) };
  if ((m = t.match(/^(?:>|≥|от|більше|больше)\s*([\d.]+)/i))) return { min: parseFloat(m[1]), max: null };
  if ((m = t.match(/([\d.]+)\s*[-–—]\s*([\d.]+)/))) return { min: parseFloat(m[1]), max: parseFloat(m[2]) };
  return { min: null, max: null };
}
function rangeText(min, max) {
  if (isNum(min) && isNum(max)) return `${fmt(min)}–${fmt(max)}`;
  if (isNum(max)) return `< ${fmt(max)}`;
  if (isNum(min)) return `> ${fmt(min)}`;
  return "";
}
const rangeInput = r => rangeText(r.min, r.max).replace(/\s/g, "").replace(/,/g, ".");
// Units a lab may report this marker in: the main one plus every unit it converts from.
function unitChoices(mid, current) {
  const mu = mainUnit(mid), out = [];
  const add = u => { if (u && !out.some(x => unitKey(x) === unitKey(u))) out.push(u); };
  add(mu.label); Object.keys(mu.from).forEach(t => add(UNIT_LABEL[t])); add(current);
  return out;
}
// factor turning a value in unit `a` into unit `b` for this marker, or null if unknown
function unitFactor(mid, a, b) {
  const mu = mainUnit(mid), f = u => { const t = unitToken(u); return t && t === mu.tok ? 1 : t ? mu.from[t] ?? null : null; };
  if (unitKey(a) === unitKey(b)) return 1;
  const fa = f(a), fb = f(b);
  return fa != null && fb != null ? fa / fb : null;
}
function status(r) {
  const { v, min, max } = r;
  if (!isNum(v)) return null;
  const a = isNum(min), b = isNum(max);
  if (!a && !b) return "none";
  if (b && v > max) return "high";
  if (a && v < min) return "low";
  if (a && b) { const w = max - min; if (v > max - w * .05 || v < min + w * .05) return "edge"; }
  return "ok";
}
const STATUS_TXT = { ok: "в норме", high: "выше нормы", low: "ниже нормы", edge: "у границы", none: "без нормы" };
// How far past the limit, in % of that limit, and how bad that is.
function outside(r) {
  const s = status(r);
  if (s === "high") { const pct = (r.v - r.max) / Math.abs(r.max || 1) * 100; return { dir: "high", pct, diff: r.v - r.max, limit: r.max, lvl: pct < 10 ? "mild" : pct < 50 ? "mod" : "sev" }; }
  if (s === "low") { const pct = (r.min - r.v) / Math.abs(r.min || 1) * 100; return { dir: "low", pct, diff: r.min - r.v, limit: r.min, lvl: pct < 10 ? "mild" : pct < 50 ? "mod" : "sev" }; }
  return null;
}
const pctText = p => p < 1 ? "<1" : String(Math.round(p));
const LVL_TXT = { mild: "немного", mod: "заметно", sev: "сильно" };
function statusBadge(r) {
  const s = status(r), out = outside(r);
  if (!out) return `<span class="badge ${s || "none"}">${STATUS_TXT[s] || ""}</span>`;
  const title = `${LVL_TXT[out.lvl]} ${out.dir === "high" ? "выше верхней" : "ниже нижней"} границы ${fmt(out.limit)}: на ${fmt(+out.diff.toPrecision(3))} ${r.unit || ""} (${pctText(out.pct)}%)`;
  return `<span class="badge ${out.dir} lvl-${out.lvl}" title="${esc(title)}">${out.dir === "high" ? "↑ выше" : "↓ ниже"} на ${pctText(out.pct)}%</span>`;
}
// How old a result is: fresh < 6 months, aging 6–12, old > 12.
function ageClass(d) { const m = monthsAgo(d); return m == null ? "" : m < 6 ? "age-fresh" : m < 12 ? "age-aging" : "age-old"; }
const ageLine = (d, bad) => `<div class="mk-age ${ageClass(d)} ${bad ? "bad" : ""}" title="${ageClass(d) === "age-old" ? (bad ? "Отклонение и больше года без пересдачи — стоит пересдать" : "Больше года назад") : ageClass(d) === "age-aging" ? "Полгода–год назад" : "Свежий анализ"}"><span class="num">${fmtDate(d)}</span> · ${agoText(d)}</div>`;
// how far outside the norm, relative to norm width (0 = inside)
function dev(r) {
  const { v, min, max } = r, a = isNum(min), b = isNum(max);
  if (b && v > max) return (v - max) / (a ? max - min : max || 1);
  if (a && v < min) return (min - v) / (b ? max - min : min || 1);
  return 0;
}
// position inside the norm: 0 = lower limit, 1 = upper limit
function pos(r) {
  const { v, min, max } = r;
  if (!isNum(v) || !isNum(max)) return null;
  const lo = isNum(min) ? min : 0;
  return max === lo ? null : (v - lo) / (max - lo);
}

/* ============ storage ============ */
const KEY = "medcard.v1";
const state = { markers: {}, results: {}, events: {}, prefs: {}, studies: {} };
function load() {
  let raw = null;
  try { raw = localStorage.getItem(KEY); } catch (e) { /* storage blocked */ }
  if (raw) {
    try {
      const j = JSON.parse(raw); state.markers = j.markers || {}; state.results = j.results || {}; state.events = j.events || {}; state.prefs = j.prefs || {}; state.studies = j.studies || {};
      // bring in seed rows added after this browser was first filled (matched by analysis + date)
      if ((j.seedVersion || 1) < (window.SEED_VERSION || 1)) {
        // seed rows (ids starting with "s") are replaced wholesale; rows entered on the site are kept
        for (const id of Object.keys(state.results)) if (id.startsWith("s")) delete state.results[id];
        const have = new Set(Object.values(state.results).map(r => r.m + "|" + r.date));
        (window.SEED_RESULTS || []).forEach(([m, date, v, unit, min, max, lab, note], i) => {
          if (!have.has(m + "|" + date)) state.results[`s${i}`] = { m, date, v, unit, min, max, lab, note, t: i };
        });
        save();
      }
      return;
    } catch (e) { /* broken json: fall through to seed */ }
  }
  state.markers = {};
  state.results = {};
  (window.SEED_RESULTS || []).forEach(([m, date, v, unit, min, max, lab, note], i) => {
    state.results[`s${i}`] = { m, date, v, unit, min, max, lab, note, t: i };
  });
  save();
}
function save() {
  if (typeof ui !== "undefined" && ui.readonly) return true;
  if (typeof cloud !== "undefined" && cloud.user) {
    // signed in: keep a local copy for instant start, push the changes to Supabase
    try { localStorage.setItem("medcard.cloud." + cloud.user.id, JSON.stringify(state)); } catch (e) { /* cache only */ }
    cloudSave();
    return true;
  }
  try { localStorage.setItem(KEY, JSON.stringify({ ...state, seedVersion: window.SEED_VERSION || 1 })); return true; }
  catch (e) { toast("Не удалось сохранить: браузер запретил хранение данных"); return false; }
}
const newId = p => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

/* ============ derived data ============ */
function info(id) {
  const d = state.markers[id] || {}, c = CAT[id] || {};
  return {
    id, ru: d.ru || c.ru || id, uk: d.uk ?? c.uk ?? "", en: d.en ?? c.en ?? "", abbr: d.abbr ?? c.abbr ?? "",
    group: d.group || c.group || "other", unit: d.unit ?? c.unit ?? "", extra: c.extra || "",
  };
}
function searchable(m) { return [m.ru, m.uk, m.en, m.abbr, ...String(m.extra).split(" ")].map(norm).join("|"); }
function matches(m, q) { const n = norm(q); return !n || searchable(m).includes(n); }
function byMarker() {
  const map = {};
  for (const [id, r] of Object.entries(state.results)) { if (r && r.m) (map[r.m] ||= []).push(view(id, r)); }
  addCalculated(map);
  for (const k in map) map[k].sort((a, b) => (a.date || "").localeCompare(b.date || "") || (a.t || 0) - (b.t || 0));
  return map;
}
function trend(list) {
  if (list.length < 2) return null;
  const a = list[list.length - 2], b = list[list.length - 1];
  const d0 = dev(a), d1 = dev(b);
  const kind = d1 < d0 - 1e-9 ? "better" : d1 > d0 + 1e-9 ? "worse" : "same";
  let text;
  if ((a.unit || "") === (b.unit || "")) {
    const dv = b.v - a.v;
    const pct = a.v ? Math.round(dv / Math.abs(a.v) * 100) : null;
    text = `${dv > 0 ? "↑" : dv < 0 ? "↓" : "="} ${dv > 0 ? "+" : ""}${fmt(+dv.toFixed(3))}${pct != null && dv ? ` (${pct > 0 ? "+" : ""}${pct}%)` : ""}`;
  } else {
    const p0 = pos(a), p1 = pos(b);
    text = p0 != null && p1 != null ? `${p1 > p0 ? "↑" : "↓"} ${Math.round(p0 * 100)} → ${Math.round(p1 * 100)}% нормы` : "другие единицы";
  }
  const word = kind === "better" ? "стало лучше" : kind === "worse" ? "стало хуже" : "без изменений относительно нормы";
  return { kind, text, word };
}
const dates = () => [...new Set(Object.values(state.results).map(r => r.date).filter(Boolean))].sort();

/* ============ UI state ============ */
const ui = { q: "", group: "all", filter: "all", open: null, editing: null, confirmDel: null, showAll: false, tab: "hist", sit: "", more: new Set() };
try { ui.showAll = !!localStorage.getItem("medcard.showAll"); } catch (e) { /* ignore */ }

/* ============ overview ============ */
function renderOverview() {
  const bm = byMarker(), ids = Object.keys(bm), ds = dates(), last = ds[ds.length - 1];
  const lastRows = Object.values(state.results).filter(r => r.date === last);
  const labs = [...new Set(lastRows.map(r => r.lab).filter(Boolean))].join(", ");
  let okCount = 0, withNorm = 0, better = 0, worse = 0;
  const attention = [];
  for (const id of ids) {
    const l = bm[id], x = l[l.length - 1], s = status(x);
    if (s && s !== "none") { withNorm++; if (s === "ok" || s === "edge") okCount++; }
    if (s === "high" || s === "low") attention.push({ id, x, s });
    const t = trend(l); if (t?.kind === "better") better++; if (t?.kind === "worse") worse++;
  }
  attention.sort((a, b) => (a.x.date || "").localeCompare(b.x.date || ""));
  const shown = attention.slice(0, 4);
  $("#overview").innerHTML = `
    <div class="ov">
      <div class="ov-k">Последняя сдача</div>
      <div class="ov-v num">${last ? fmtDate(last) : "—"}</div>
      <div class="ov-s">${lastRows.length} ${plural(lastRows.length, "показатель", "показателя", "показателей")}${labs ? " · " + esc(labs) : ""}</div>
    </div>
    <div class="ov">
      <div class="ov-k">В норме сейчас</div>
      <div class="ov-v num">${okCount}<span class="sep"> из ${withNorm}</span></div>
      <div class="ov-s">по последнему значению каждого показателя</div>
    </div>
    <div class="ov">
      <div class="ov-k">С прошлой сдачи</div>
      <div class="ov-v num"><span class="good">↑ ${better}</span> <span class="sep">·</span> <span class="${worse ? "bad" : ""}">↓ ${worse}</span></div>
      <div class="ov-s">стало лучше · стало хуже</div>
      ${last ? `<button type="button" class="ov-link" data-digest="${last}">Что изменилось ${fmtDate(last)} →</button>` : ""}
    </div>
    <div class="ov">
      <div class="ov-k">Требуют внимания</div>
      ${attention.length ? `<div class="attn">${shown.map(a => `
        <button class="attn-item" data-goto="${esc(a.id)}"><span class="attn-name">${esc(info(a.id).ru)} <span class="attn-pct ${a.s} lvl-${outside(a.x).lvl}">${a.s === "high" ? "+" : "−"}${pctText(outside(a.x).pct)}%</span></span><span class="attn-meta ${ageClass(a.x.date)}">${agoText(a.x.date)}</span></button>`).join("")}
        ${attention.length > shown.length ? `<div class="ov-s">и ещё ${attention.length - shown.length}</div>` : ""}</div>`
      : `<div class="ov-v" style="font-size:18px;color:var(--ok)">Всё в норме</div>`}
    </div>`;
}

/* ============ range bar ============ */
function rangeBar(list) {
  const x = list[list.length - 1];
  const a = isNum(x.min), b = isNum(x.max);
  if (!a && !b) return `<div class="range-none">Норма не указана</div>`;
  let lo = a ? x.min : 0, hi = b ? x.max : x.min * 2;
  const span = hi - lo || Math.abs(hi) || 1;
  let dmin = a ? lo - span * .45 : 0, dmax = hi + span * .45;
  const same = list.filter(r => (r.unit || "") === (x.unit || "") && isNum(r.v));
  for (const r of same) { dmin = Math.min(dmin, r.v - span * .08); dmax = Math.max(dmax, r.v + span * .08); }
  if (same.every(r => r.v >= 0) && dmin < 0) dmin = 0;
  const P = v => Math.max(0, Math.min(100, (v - dmin) / (dmax - dmin) * 100));
  const zl = P(lo), zr = b ? P(hi) : 100;
  const s = status(x), col = s === "high" ? "var(--high)" : s === "low" ? "var(--low)" : s === "edge" ? "var(--edge)" : "var(--ok)";
  const ghosts = same.slice(0, -1).slice(-3).map(r => `<span class="range-ghost" style="left:${P(r.v)}%"></span>`).join("");
  return `<div class="range" aria-label="Значение относительно нормы">
    <div class="range-track">
      <span class="range-zone" style="left:${zl}%;right:${100 - zr}%;${!b ? "border-radius:999px 0 0 999px" : ""}${!a ? ";border-radius:0 999px 999px 0" : ""}"></span>
      ${ghosts}
      ${s === "high" && b ? `<span class="range-over high" style="left:${zr}%;width:${Math.max(0, P(x.v) - zr)}%"></span>` : ""}
      ${s === "low" && a ? `<span class="range-over low" style="left:${P(x.v)}%;width:${Math.max(0, zl - P(x.v))}%"></span>` : ""}
      <span class="range-dot" style="left:${P(x.v)}%;background:${col}"></span>
    </div>
    <div class="range-lbl num">${a ? `<span style="left:${zl}%">${fmt(x.min)}</span>` : ""}${b ? `<span style="left:${zr}%">${fmt(x.max)}</span>` : ""}</div>
  </div>`;
}

/* ============ history pills ============ */
function historyPills(list) {
  const prev = list.slice(0, -1);
  const t = trend(list);
  if (!prev.length) return `<div class="hist"><span class="first">Первая сдача</span></div>`;
  const shown = prev.slice(-4), hidden = prev.length - shown.length;
  return `<div class="hist">
    <span class="hist-lbl">Раньше</span>
    ${hidden ? `<span class="pill" data-tip-more="${hidden}">+${hidden}</span>` : ""}
    ${shown.map(r => `<button class="pill ${status(r) || ""} ${r.converted ? "swap" : ""}" data-tip="${esc(r.id)}" aria-label="${esc(fmtDate(r.date) + ": " + origText(r))}">${r.converted ? `<span class="c">${fmt(r.v)}</span><span class="o">${fmt(r.o.v)}</span>` : fmt(r.v)}</button>`).join('<span class="arrow">›</span>')}
    ${t ? `<span class="delta ${t.kind}" title="${esc(t.word)}">${esc(t.text)}</span>` : ""}
  </div>`;
}

/* ============ big chart ============ */
function chart(list) {
  const units = new Set(list.map(r => r.unit || ""));
  const normalized = units.size > 1;
  const pts = list.filter(r => isNum(r.v) && (!normalized || pos(r) != null));
  if (!pts.length) return `<div class="panel-cap">Нет числовых значений</div>`;
  const val = r => normalized ? pos(r) * 100 : r.v;
  const bLo = r => normalized ? 0 : (isNum(r.min) ? r.min : (isNum(r.max) ? 0 : null));
  const bHi = r => normalized ? 100 : (isNum(r.max) ? r.max : null);
  const W = 560, H = 230, L = 46, R = 20, T = 26, B = 34;
  const ys = pts.map(val);
  pts.forEach(r => { if (bLo(r) != null) ys.push(bLo(r)); if (bHi(r) != null) ys.push(bHi(r)); });
  let y0 = Math.min(...ys), y1 = Math.max(...ys);
  if (y0 === y1) { y0 -= 1; y1 += 1; }
  // leave visible room above and below the latest norm so both limits read as lines, not as the chart edge
  const last = pts[pts.length - 1], nHi = bHi(last), nLo = normalized ? 0 : (isNum(last.min) ? last.min : null);
  const nSpan = nHi != null ? nHi - (nLo ?? 0) : (y1 - y0);
  if (nHi != null) y1 = Math.max(y1, nHi + nSpan * .35);
  if (nLo != null) y0 = Math.min(y0, nLo - nSpan * .35);
  // action threshold: stretch the scale to show it when the value is already out of range
  const hm = normalized ? null : harmOf(last), sl = status(last);
  if (hm && isNum(hm.hi) && sl === "high") y1 = Math.max(y1, hm.hi * 1.04);
  if (hm && isNum(hm.lo) && sl === "low") y0 = Math.min(y0, hm.lo * .96);
  const pad = (y1 - y0) * .06; y0 -= pad; y1 += pad;
  if (pts.every(r => val(r) >= 0) && y0 < 0) y0 = 0;
  const ts = pts.map(r => Date.parse(r.date)).filter(isFinite), t0 = Math.min(...ts), t1 = Math.max(...ts);
  const X = (r, i) => { const t = Date.parse(r.date); if (pts.length === 1) return L + (W - L - R) / 2; if (!isFinite(t) || t0 === t1) return L + i * (W - L - R) / (pts.length - 1); return L + (t - t0) / (t1 - t0) * (W - L - R); };
  const Y = v => T + (1 - (v - y0) / (y1 - y0)) * (H - T - B);
  let band = "";
  const wb = pts.filter(r => bHi(r) != null);
  if (wb.length === 1 || (wb.length && pts.length === 1)) {
    const r = wb[0]; band = `<rect x="${L}" y="${Y(bHi(r))}" width="${W - L - R}" height="${Y(bLo(r) ?? y0) - Y(bHi(r))}" rx="6" fill="var(--band)"/>`;
  } else if (wb.length) {
    const xs = wb.map(r => X(r, pts.indexOf(r)));
    const top = [`${L},${Y(bHi(wb[0]))}`, ...wb.map((r, i) => `${xs[i]},${Y(bHi(r))}`), `${W - R},${Y(bHi(wb.at(-1)))}`];
    const bot = [`${W - R},${Y(bLo(wb.at(-1)) ?? y0)}`, ...wb.map((r, i) => `${xs[i]},${Y(bLo(r) ?? y0)}`).reverse(), `${L},${Y(bLo(wb[0]) ?? y0)}`];
    band = `<polygon points="${top.join(" ")} ${bot.join(" ")}" fill="var(--band)"/>`;
  }
  let grid = "";
  const raw = (y1 - y0) / 4, mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = [1, 2, 2.5, 5, 10].map(k => k * mag).find(s => s >= raw) || raw;
  for (let v = Math.ceil(y0 / step) * step; v <= y1 + 1e-9; v += step) {
    const yy = Y(v);
    grid += `<line x1="${L}" x2="${W - R}" y1="${yy}" y2="${yy}" stroke="var(--line)"/><text x="${L - 10}" y="${yy + 4}" text-anchor="end" font-size="11" fill="var(--faint)">${fmt(+v.toFixed(6))}${normalized ? "%" : ""}</text>`;
  }
  // zones outside the norm + labelled limit lines (latest norm)
  let zones = "", limits = "";
  const xL = L, xR = W - R, yTop = T - 6, yBot = H - B;
  const lbl = (y, t, cls) => `<text x="${xR - 6}" y="${y}" text-anchor="end" font-size="11" font-weight="600" fill="var(--${cls})">${t}</text>`;
  const zlbl = (y, t, c) => `<text x="${xL + 10}" y="${y}" font-size="11" fill="var(--${c})" opacity=".9">${t}</text>`;
  if (nHi != null) {
    const yh = Y(nHi);
    zones += `<rect x="${xL}" y="${yTop}" width="${xR - xL}" height="${Math.max(0, yh - yTop)}" fill="var(--high-bg)" opacity=".55"/>`;
    limits += `<line x1="${xL}" x2="${xR}" y1="${yh}" y2="${yh}" stroke="var(--high)" stroke-width="1.5" stroke-dasharray="5 4" opacity=".8"/>`
      + lbl(yh - 6, `верх нормы ${normalized ? "100%" : fmt(nHi)}`, "high")
      + (yh - yTop > 22 ? zlbl(yTop + 16, "выше нормы", "high") : "");
  }
  if (nLo != null && (normalized || isNum(last.min))) {
    const yl = Y(nLo);
    zones += `<rect x="${xL}" y="${yl}" width="${xR - xL}" height="${Math.max(0, yBot - yl)}" fill="var(--low-bg)" opacity=".55"/>`;
    limits += `<line x1="${xL}" x2="${xR}" y1="${yl}" y2="${yl}" stroke="var(--low)" stroke-width="1.5" stroke-dasharray="5 4" opacity=".8"/>`
      + lbl(yl + 15, `низ нормы ${normalized ? "0%" : fmt(nLo)}`, "low")
      + (yBot - yl > 22 ? zlbl(yBot - 8, "ниже нормы", "low") : "");
  }
  if (nHi != null) { const mid = Y(((nLo ?? 0) + nHi) / 2); limits += zlbl(mid + 4, last.tgt ? "цель" : "норма", "ok"); }
  for (const [v, t] of hm ? [[hm.hi, "порог действия"], [hm.lo, "порог действия"]] : []) {
    if (!isNum(v) || v < y0 || v > y1) continue;
    limits += `<g><title>${esc(hm.text)}</title><line x1="${xL}" x2="${xR}" y1="${Y(v)}" y2="${Y(v)}" stroke="var(--high-strong)" stroke-width="2"/><text x="${xL + 10}" y="${Y(v) - 6}" font-size="11" font-weight="700" fill="var(--high-strong)">⚠ ${t} ${fmt(v)}</text></g>`;
  }
  const evBands = pts.length > 1 && t1 > t0 ? chartEvents(t0, t1, t => L + (t - t0) / (t1 - t0) * (W - L - R), T, H - B) : "";
  const line = pts.length > 1 ? `<polyline points="${pts.map((r, i) => `${X(r, i)},${Y(val(r))}`).join(" ")}" fill="none" stroke="var(--ink)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>` : "";
  const dots = pts.map((r, i) => {
    const s = status(r), c = s === "high" ? "var(--high)" : s === "low" ? "var(--low)" : s === "edge" ? "var(--edge)" : s === "ok" ? "var(--ok)" : "var(--muted)";
    const xx = X(r, i), yy = Y(val(r));
    const anchor = pts.length > 1 && i === 0 ? "start" : pts.length > 1 && i === pts.length - 1 ? "end" : "middle";
    const labelDate = pts.length <= 6 || i === 0 || i === pts.length - 1;
    return `<g class="pt" data-tip="${esc(r.id)}" tabindex="0"><circle cx="${xx}" cy="${yy}" r="14" fill="transparent"/><circle cx="${xx}" cy="${yy}" r="6" fill="${c}" stroke="var(--card)" stroke-width="3"/>
      <text x="${xx}" y="${yy - 13}" text-anchor="middle" font-size="12" font-weight="600" fill="var(--ink)">${normalized ? Math.round(val(r)) + "%" : fmt(r.v)}</text>
      ${labelDate ? `<text x="${xx}" y="${H - 10}" text-anchor="${anchor}" font-size="11" fill="var(--muted)">${fmtDate(r.date)}</text>` : ""}</g>`;
  }).join("");
  const cap = normalized
    ? "Лаборатории давали разные единицы, поэтому график в % от нормы: 0% — нижняя граница, 100% — верхняя."
    : `Единицы: ${[...units][0] || "—"}. Пунктир — ${last.tgt ? `цель (${last.tgt})` : "границы нормы с последнего бланка"}. Наведи на точку, чтобы увидеть подробности.`;
  return `<div class="panel-cap">${esc(cap)}</div><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="График значений">${zones}${band}${grid}${evBands}${limits}${line}${dots}</svg>`;
}

/* ============ list ============ */
// Group chips jump to a section of the list; the chip of the section in view is highlighted while scrolling.
function renderGroups() {}
function renderNav() {
  const secs = $$("#list .sec");
  $("#groups").innerHTML = secs.map(el => `<button class="chip" data-sec="${el.id}">${+el.dataset.bad ? `<i class="chip-dot" title="${el.dataset.bad} вне нормы"></i>` : ""}${esc(el.dataset.name)}<span class="cnt">${el.dataset.n}</span></button>`).join("");
  $("#rail").innerHTML = `<div class="rail-cap">Разделы</div><div class="rail-list">${secs.map(el => `<button type="button" class="rail-item" data-sec="${el.id}"><span class="rail-name">${esc(el.dataset.name)}</span>${+el.dataset.bad ? `<span class="rail-bad" title="вне нормы">${el.dataset.bad}</span>` : `<span class="rail-n">${el.dataset.n}</span>`}</button>`).join("")}</div>`;
  spy();
}
function visibleIds() {
  const bm = byMarker();
  return Object.keys(bm).filter(id => {
    const m = info(id);
    if (!matches(m, ui.q)) return false;
    if (ui.sit && !inSit(id, ui.sit)) return false;
    const l = bm[id], s = status(l[l.length - 1]);
    if (ui.filter === "bad" && s !== "high" && s !== "low") return false;
    if (ui.filter === "multi" && l.length < 2) return false;
    return true;
  }).map(id => id === "dbp" && bm.sbp ? "sbp" : id).filter((id, i, a) => a.indexOf(id) === i).sort((a, b) => {
    const A = info(a), B = info(b);
    return (GROUP_ORDER[A.group] - GROUP_ORDER[B.group]) || ((CAT_ORDER[a] ?? 999) - (CAT_ORDER[b] ?? 999)) || A.ru.localeCompare(B.ru, "ru");
  });
}
/* ============ blood pressure: one row for systolic/diastolic ============ */
// ESC/ESH 2023 office categories
function bpClass(s, d) {
  if (s >= 180 || d >= 110) return { k: "high", lvl: "sev", t: "Гипертония 3 степени" };
  if (s >= 160 || d >= 100) return { k: "high", lvl: "sev", t: "Гипертония 2 степени" };
  if (s >= 140 || d >= 90) return { k: "high", lvl: "mod", t: "Гипертония 1 степени" };
  if (s >= 130 || d >= 85) return { k: "edge", lvl: "mild", t: "Высокое нормальное" };
  if (s < 90 || d < 60) return { k: "low", lvl: "mild", t: "Пониженное" };
  if (s >= 120 || d >= 80) return { k: "ok", t: "Нормальное" };
  return { k: "ok", t: "Оптимальное" };
}
function bpPairs(bm) {
  const dia = bm.dbp || [];
  return (bm.sbp || []).map(s => { const d = dia.find(x => x.date === s.date); return d ? { date: s.date, s, d, c: bpClass(s.v, d.v) } : null; }).filter(Boolean);
}
function bpRow(bm) {
  const ps = bpPairs(bm); if (!ps.length) return null;
  const x = ps[ps.length - 1], open = ui.open === "sbp", prev = ps.slice(0, -1).slice(-4);
  const badge = x.c.k === "ok" ? `<span class="badge ok">${x.c.t}</span>` : `<span class="badge ${x.c.k}${x.c.lvl ? " lvl-" + x.c.lvl : ""}">${x.c.t}</span>`;
  const P = v => Math.max(0, Math.min(100, (v - 80) / (190 - 80) * 100));
  return `<div class="mk bp ${open ? "open" : ""}" data-id="sbp" tabindex="0" role="button" aria-expanded="${open}">
      <div><div class="mk-name">Давление</div><div class="mk-alt">верхнее / нижнее · SYS/DIA · Тиск · Blood pressure</div></div>
      <div>
        <div class="mk-val"><span class="v num">${fmt(x.s.v)}<span class="bp-sep">/</span>${fmt(x.d.v)}</span> <span class="u">мм рт. ст.</span></div>
        <div class="mk-meta">${badge}</div>
        ${ageLine(x.date, x.c.k === "high")}
      </div>
      <div class="bp-scale" aria-label="Шкала давления ESC">
        <div class="bp-track"><i class="z1"></i><i class="z2"></i><i class="z3"></i><i class="z4"></i>
          <span class="bp-dot" style="left:${P(x.s.v)}%" title="Верхнее ${fmt(x.s.v)}"></span></div>
        <div class="bp-lbl num"><span style="left:${P(120)}%">120</span><span style="left:${P(130)}%">130</span><span style="left:${P(140)}%">140</span></div>
      </div>
      <div class="hist">${prev.length ? `<span class="hist-lbl">Раньше</span>${prev.map(p => `<span class="pill ${p.c.k}" title="${esc(fmtDate(p.date) + " · " + p.c.t)}">${fmt(p.s.v)}/${fmt(p.d.v)}</span>`).join('<span class="arrow">›</span>')}` : `<span class="first">Первая сдача</span>`}</div>
      <svg class="chev" width="20" height="20" viewBox="0 0 20 20" aria-hidden="true"><path d="M7 4l6 6-6 6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>
    </div>
    ${open ? bpDetail(ps) : ""}`;
}
function bpDetail(ps) {
  const W = 560, H = 220, L = 40, R = 20, T = 20, B = 30;
  const vals = ps.flatMap(p => [p.s.v, p.d.v]), y0 = Math.min(50, ...vals) - 5, y1 = Math.max(150, ...vals) + 5;
  const ts = ps.map(p => Date.parse(p.date)), t0 = Math.min(...ts), t1 = Math.max(...ts);
  const X = (p, i) => ps.length === 1 ? (L + W - R) / 2 : t0 === t1 ? L + i * (W - L - R) / (ps.length - 1) : L + (Date.parse(p.date) - t0) / (t1 - t0) * (W - L - R);
  const Y = v => T + (1 - (v - y0) / (y1 - y0)) * (H - T - B);
  const line = (v, col, t) => `<line x1="${L}" x2="${W - R}" y1="${Y(v)}" y2="${Y(v)}" stroke="var(--${col})" stroke-dasharray="5 4" opacity=".7"/><text x="${W - R - 4}" y="${Y(v) - 5}" text-anchor="end" font-size="11" fill="var(--${col})">${t}</text>`;
  const series = (k, col) => (ps.length > 1 ? `<polyline points="${ps.map((p, i) => `${X(p, i)},${Y(p[k].v)}`).join(" ")}" fill="none" stroke="var(--${col})" stroke-width="2" stroke-linejoin="round"/>` : "")
    + ps.map((p, i) => `<circle cx="${X(p, i)}" cy="${Y(p[k].v)}" r="5.5" fill="var(--${col})" stroke="var(--card)" stroke-width="2.5"/><text x="${X(p, i)}" y="${Y(p[k].v) - 11}" text-anchor="middle" font-size="12" font-weight="600" fill="var(--ink)">${fmt(p[k].v)}</text>`).join("");
  const dates = ps.map((p, i) => `<text x="${X(p, i)}" y="${H - 8}" text-anchor="middle" font-size="11" fill="var(--muted)">${fmtDate(p.date)}</text>`).join("");
  const svg = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="График давления">${line(140, "high", "140 — гипертония")}${line(90, "high", "90")}${line(120, "ok", "120 — оптимальное")}${line(80, "ok", "80")}${series("s", "ink")}${series("d", "muted")}${dates}</svg>`;
  const rows = [...ps].reverse().map(p => `<tr>
      <td class="num">${fmtDate(p.date)}</td><td class="num"><b>${fmt(p.s.v)}/${fmt(p.d.v)}</b></td>
      <td><span class="badge ${p.c.k}">${p.c.t}</span></td>
      <td style="color:var(--muted)">${esc(p.s.note || p.d.note || "")}</td>
      <td class="acts"><button class="btn sm ghost danger" data-bpdel="${esc(p.s.id)}|${esc(p.d.id)}">${ui.confirmDel === p.s.id ? "Точно удалить?" : "Удалить"}</button></td></tr>`).join("");
  return `<div class="detail${ui.animOpen ? " anim" : ""}">
    <div class="panel chart"><div class="panel-cap">Верхнее — тёмная линия, нижнее — серая. Пунктир — границы по ESC/ESH: до 120/80 оптимальное, от 140/90 гипертония.</div>${svg}</div>
    <div class="panel"><div class="tbl-scroll"><table class="mtable"><thead><tr><th>Дата</th><th>Давление</th><th>Категория</th><th>Заметка</th><th></th></tr></thead><tbody>${rows}</tbody></table></div></div>
  </div>`;
}
function renderList() {
  if (typeof renderReset === "function" && $("#resetBtn")) renderReset();
  const bm = byMarker(), ids = visibleIds();
  const total = Object.keys(bm).length, filtered = ui.q || ui.filter !== "all" || ui.sit;
  $("#count").textContent = filtered ? `${ids.length} из ${total}` : String(total);
  const rest = untaken(bm);
  if (!ids.length) {
    const msg = !total ? "Пока нет анализов. Нажми «+ Внести анализы»."
      : rest ? "Среди сданных ничего не нашлось — смотри в справочнике ниже."
      : "Ничего не нашлось. Поиск понимает русский, украинский и английский.";
    $("#list").innerHTML = `<div class="empty">${msg}</div>${rest}`;
    renderNav(); return;
  }
  const byGroup = list => {
    const out = [];
    for (const id of list) { const g = info(id).group; if (!out.length || out[out.length - 1].g !== g) out.push({ g, ids: [] }); out[out.length - 1].ids.push(id); }
    return out;
  };
  // search and filters show every match in full; the default view puts what matters first
  if (ui.q || ui.filter !== "all" || ui.sit) {
    $("#list").innerHTML = byGroup(ids).map(({ g, ids }) => `
      <div class="sec" id="sec-${g}" data-name="${esc(GROUP_NAME[g] || g)}" data-n="${ids.length}" data-bad="${ids.filter(id => outside(bm[id][bm[id].length - 1])).length}">
        <h3 class="group-title">${esc(GROUP_NAME[g] || g)}</h3>
        <div class="card">${ids.map(id => row(id, bm[id])).join("")}</div>
      </div>`).join("") + rest;
    renderNav(); return;
  }
  // inside every group: out-of-range first (worst on top), then the key markers; the rest behind a button
  const latest = id => bm[id][bm[id].length - 1];
  $("#list").innerHTML = byGroup(ids).map(({ g, ids }) => {
    const bad = ids.filter(id => outside(latest(id))).sort((a, b) => outside(latest(b)).pct - outside(latest(a)).pct);
    let top = [...bad, ...ids.filter(id => KEY_MARKERS.includes(id) && !bad.includes(id))];
    if (!top.length) top = ids.filter(id => !MINOR[id]);
    let restIds = ids.filter(id => !top.includes(id));
    if (restIds.length <= 1) { top = [...top, ...restIds]; restIds = []; }
    const main = restIds.filter(id => !MINOR[id]), minor = restIds.filter(id => MINOR[id]);
    const open = ui.more.has(g) || restIds.includes(ui.open);
    const one = id => ui.open === id ? row(id, bm[id]) : miniRow(id, bm[id]);
    return `<div class="sec" id="sec-${g}" data-name="${esc(GROUP_NAME[g] || g)}" data-n="${ids.length}" data-bad="${bad.length}">
      <h3 class="group-title">${esc(GROUP_NAME[g] || g)}${bad.length ? ` <span class="gt-sub bad">${bad.length} вне нормы</span>` : ""}</h3>
      <div class="card">${top.map(id => row(id, bm[id])).join("")}
        ${open ? `<div class="minor${ui.justOpened === g ? " reveal" : ""}">
          ${main.length ? `<div class="minor-cap">Остальное в норме</div>${main.map(one).join("")}` : ""}
          ${minor.length ? `<div class="minor-cap">Маловажные: врачи смотрят на них редко, обычно если основные не в норме</div>${minor.map(one).join("")}` : ""}
        </div>` : ""}
      </div>
      ${restIds.length ? `<button type="button" class="more-btn" data-more="${esc(g)}" aria-expanded="${open}">${open ? "Свернуть" : `Показать всё · ещё ${restIds.length}`}<svg width="16" height="16" viewBox="0 0 20 20" aria-hidden="true"><path d="M5 8l5 5 5-5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></button>` : ""}
    </div>`;
  }).join("") + rest;
  ui.justOpened = null;
  renderNav();
}
// Shown at the top of their group even when in range: the markers a doctor looks at first.
const KEY_MARKERS = ["weight", "sbp", "dbp", "hgb", "wbc", "plt", "rbc", "glu", "hba1c", "alt", "ast", "crea", "ua", "chol", "ldl", "hdl", "tg", "apob", "ferritin", "vitd", "b12", "tsh", "ft4", "atpo", "testo", "prl", "lh", "crp", "hscrp", "fcal"];
// Markers clinicians rarely act on when they are in range (derived, duplicated or superseded
// by a better test; Choosing Wisely, ATA, ESC/EAS 2019, ICSH). Hidden behind a button per group;
// an out-of-range value still goes to the top.
const MINOR = {
  hct: "дублирует гемоглобин", mch: "расчётный индекс из Hb и эритроцитов", mchc: "расчётный индекс из Hb и гематокрита",
  rdw_sd: "дублирует RDW-CV", mpv: "вспомогательный индекс тромбоцитов", pdw: "вспомогательный индекс тромбоцитов", pct: "вспомогательный индекс тромбоцитов",
  eos_abs: "смотрят при аллергии и паразитах", baso_abs: "редко имеет значение", baso: "редко имеет значение", eos: "смотрят при аллергии и паразитах",
  ig: "смотрят при подозрении на инфекцию или болезнь крови", ig_abs: "смотрят при подозрении на инфекцию или болезнь крови",
  esr: "СРБ точнее отражает воспаление", retic: "нужен при анемии",
  dbil: "смотрят, если общий билирубин повышен", ibil: "смотрят, если общий билирубин повышен", tp: "мало говорит сам по себе",
  amy: "для поджелудочной точнее липаза", ldh: "неспецифичен", ck: "нужен при болях в мышцах или статинах",
  homa: "расчётный индекс из глюкозы и инсулина", homocys: "рутинно не рекомендован", cystc: "уточняет СКФ при сомнениях", cpep: "нужен при диабете",
  vldl: "расчётный, в рекомендациях не используется", nlr: "общий маркер воспаления, смотрят вместе с картиной", deritis: "имеет смысл, если ферменты печени повышены", ai: "расчётный, в рекомендациях не используется", apoa1: "не добавляет к ЛПВП",
  fe: "скачет в течение дня, ферритин надёжнее", tibc: "насыщение трансферрина информативнее", transf: "насыщение трансферрина информативнее",
  zn: "нужен при подозрении на дефицит", cu: "нужен при подозрении на дефицит", se: "нужен при подозрении на дефицит",
  vita: "нужен при подозрении на дефицит", vite: "нужен при подозрении на дефицит", b1: "нужен при подозрении на дефицит", b6: "нужен при подозрении на дефицит",
  omega3: "рутинно не рекомендован", cl: "смотрят вместе с другими электролитами", p: "смотрят при болезнях почек и паращитовидных",
  ft3: "для оценки функции хватает ТТГ и Т4", tt4: "свободный Т4 точнее", tt3: "свободный Т3 точнее",
  attg: "нужен в основном после рака щитовидки", thyroglob: "нужен после рака щитовидки", calcit: "нужен при узлах щитовидки",
  e2: "у мужчин нужен при симптомах", dht: "рутинно не нужен", gh: "разовый замер малоинформативен", prog: "у мужчин почти не нужен",
  oh17: "нужен при подозрении на ВДКН", mprl: "нужен, если пролактин повышен", acth: "смотрят, если кортизол вне нормы",
  ige: "общий IgE мало говорит об аллергии", aso: "нужен при подозрении на стрептококк",
  u_sg: "вспомогательный показатель мочи", u_ph: "вспомогательный показатель мочи",
  pti: "устарел, вместо него МНО", pt: "вместо него смотрят МНО", temp: "разовый замер", bmi: "расчётный из веса и роста",
};
function miniRow(id, list) {
  if (id === "sbp" && byMarker().dbp) return row(id, list);
  const m = info(id), x = list[list.length - 1], s = status(x);
  return `<div class="mk mini" data-id="${esc(id)}" tabindex="0" role="button" aria-expanded="false">
      <div><div class="mk-name">${esc(m.ru)}${m.abbr && m.abbr !== m.ru ? ` <span class="mk-abbr">${esc(m.abbr)}</span>` : ""}</div>${MINOR[id] ? `<div class="mk-why">${esc(MINOR[id])}</div>` : ""}</div>
      <div class="mk-val">${pair(x, "v num", "u")}</div>
      <div class="mini-meta"><span class="mini-dot ${s || "none"}" title="${esc(STATUS_TXT[s] || "")}"></span>${ageLine(x.date, false)}</div>
      <svg class="chev" width="18" height="18" viewBox="0 0 20 20" aria-hidden="true"><path d="M7 4l6 6-6 6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>
    </div>`;
}
// Catalog markers never taken: collapsed under the list, opened by a click or by a search that hits them.
function untaken(bm) {
  if (ui.filter !== "all") return "";
  const ids = CATALOG.filter(m => !bm[m.id] && (ui.group === "all" || m.group === ui.group) && matches(info(m.id), ui.q) && (!ui.sit || inSit(m.id, ui.sit))).map(m => m.id);
  if (!ids.length) return "";
  const open = ui.showAll || !!ui.q || !!ui.sit;
  const byGroup = [];
  for (const id of ids) { const g = info(id).group; let b = byGroup.find(x => x.g === g); if (!b) byGroup.push(b = { g, ids: [] }); b.ids.push(id); }
  byGroup.sort((a, b) => GROUP_ORDER[a.g] - GROUP_ORDER[b.g]);
  return `<section class="untaken sec ${open ? "open" : ""}" id="sec-untaken" data-name="Не сдавал" data-n="${ids.length}" data-bad="0">
    <button type="button" class="untaken-toggle" data-untaken aria-expanded="${open}">
      <span class="untaken-title">Ещё не сдавал <span class="cnt num">${ids.length}</span></span>
      <span class="untaken-hint">${ui.q ? "совпадения в справочнике" : open ? "Скрыть" : "Показать справочник анализов"}</span>
      <svg class="chev" width="18" height="18" viewBox="0 0 20 20" aria-hidden="true"><path d="M7 4l6 6-6 6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>
    </button>
    ${open ? `<div class="untaken-body">${byGroup.map(({ g, ids }) => `
      <div class="ut-group">
        <h4>${esc(GROUP_NAME[g] || g)}</h4>
        <div class="ut-grid">${ids.map(id => { const m = info(id); return `
          <button type="button" class="ut" data-info="${esc(id)}" title="Что это за анализ">
            <span class="ut-name">${esc(m.ru)}</span>
            <span class="ut-alt">${esc([m.abbr, m.uk !== m.ru ? m.uk : ""].filter(Boolean).join(" · "))}</span>
            <span class="ut-add" data-add="${esc(id)}" role="button" title="Внести результат">+ Внести</span>
          </button>`; }).join("")}</div>
      </div>`).join("")}</div>` : ""}
  </section>`;
}
function row(id, list) {
  if (id === "sbp") { const b = bpRow(byMarker()); if (b) return b; }
  const m = info(id), x = list[list.length - 1], s = status(x);
  const alt = [m.abbr && m.abbr !== m.ru ? m.abbr : "", m.uk && m.uk !== m.ru ? m.uk : "", m.en].filter(Boolean).join(" · ");
  const open = ui.open === id;
  return `<div class="mk ${open ? "open" : ""}" data-id="${esc(id)}" tabindex="0" role="button" aria-expanded="${open}">
      <div><div class="mk-name">${esc(m.ru)}</div><div class="mk-alt">${esc(alt)}</div></div>
      <div>
        <div class="mk-val">${pair(x, "v num", "u")}</div>
        ${s === "ok" || s === "none" || !s ? (harmHit(x) ? `<div class="mk-meta">${harmBadge(x)}</div>` : "") : `<div class="mk-meta">${statusBadge(x)} ${harmBadge(x)}</div>`}
        ${x.tgt ? `<div class="mk-tgt" title="${esc(`${x.tgt}. Норма бланка: ${rangeText(x.labMin, x.labMax) || "не указана"}`)}">цель из рекомендаций</div>` : ""}${x.calc ? `<div class="mk-tgt">рассчитано</div>` : ""}
        ${ageLine(x.date, !!outside(x))}
      </div>
      ${rangeBar(list)}
      ${historyPills(list)}
      <svg class="chev" width="20" height="20" viewBox="0 0 20 20" aria-hidden="true"><path d="M7 4l6 6-6 6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>
    </div>
    ${open ? detail(id, list) : ""}`;
}
function detail(id, list) {
  const rows = [...list].reverse().map(r => {
    if (ui.editing === r.id) { const raw = state.results[r.id]; r = { ...r, date: raw.date, v: raw.v, unit: raw.unit, min: raw.min, max: raw.max, lab: raw.lab }; } if (ui.editing === r.id) return `<tr data-rid="${esc(r.id)}">
        <td><input class="input num" type="date" id="edDate" value="${esc(r.date || "")}"></td>
        <td><input class="input num" id="edV" value="${esc(r.v ?? "")}" inputmode="decimal" style="width:80px"> <input class="input" id="edUnit" value="${esc(r.unit || "")}" style="width:90px"></td>
        <td><input class="input num" id="edRange" value="${esc(rangeInput(r))}" style="width:100px"></td>
        <td><input class="input" id="edLab" value="${esc(r.lab || "")}" style="width:120px"></td>
        <td class="acts"><button class="btn sm primary" data-act="saveEdit">Сохранить</button> <button class="btn sm ghost" data-act="cancelEdit">Отмена</button></td></tr>`;
    const s = status(r);
    return `<tr data-rid="${esc(r.id)}">
        <td class="num">${fmtDate(r.date)}</td>
        <td class="num">${pair(r, "b", "muted")}</td>
        <td class="num">${esc(r.tgt ? rangeText(r.labMin, r.labMax) : rangeText(r.min, r.max))} ${s && s !== "none" ? `<span class="badge ${s}">${STATUS_TXT[s]}</span>` : ""}</td>
        <td style="color:var(--muted)">${esc(r.lab || "")}${r.note ? `<br>${esc(r.note)}` : ""}</td>
        <td class="acts">${r.calc ? `<span class="muted">расчёт</span>` : `<button class="btn sm ghost" data-act="edit">Изменить</button><button class="btn sm ghost danger" data-act="del">${ui.confirmDel === r.id ? "Точно удалить?" : "Удалить"}</button>`}</td></tr>`;
  }).join("");
  const tabs = `<div class="dtabs" role="tablist">
      <button role="tab" data-tab="hist" aria-selected="${ui.tab === "hist"}">График и история</button>
      <button role="tab" data-tab="about" aria-selected="${ui.tab === "about"}">Об анализе и связи</button>
    </div>`;
  const body = ui.tab === "about" ? `<div class="panel">${about(id)}</div>` : `
    <div class="panel chart">${chart(list)}</div>
    <div class="panel">${markerSettings(id, list)}</div>
    <div class="panel"><div class="tbl-scroll"><table class="mtable"><thead><tr><th>Дата</th><th>Значение</th><th>Норма бланка</th><th>Где</th><th></th></tr></thead><tbody>${rows}</tbody></table></div></div>`;
  return `<div class="detail${ui.animOpen ? " anim" : ""}">${tabs}${body}</div>`;
}

/* ============ timeline ============ */
function renderTimeline() {
  if (ui.histMode === "map") { $("#timeline").innerHTML = Object.keys(state.results).length ? heatmapHtml() : `<div class="empty">Здесь появится карта.</div>`; return; }
  const by = {};
  for (const [id, r] of Object.entries(state.results)) (by[r.date || ""] ||= []).push(view(id, r));
  const ds = Object.keys(by).sort().reverse();
  if (!ds.length) { $("#timeline").innerHTML = `<div class="empty">Здесь появятся твои сдачи.</div>`; return; }
  const evs = [...eventList(), ...studyList().map(s => ({ ...s, start: s.date, study: true }))].sort((a, b) => (b.start || "").localeCompare(a.start || ""));
  const evHtml = e => e.study ? `<button type="button" class="tl-st" data-st-open="${esc(e.id)}">${icon(e.type)}<span><b>${esc(studyTitle(e))}</b>${e.status ? ` · ${esc(STATUS_NAME[e.status])}` : ""}${e.conclusion ? `<small>${esc(e.conclusion.slice(0, 110))}${e.conclusion.length > 110 ? "…" : ""}</small>` : ""}</span><span class="num muted">${fmtDate(e.date)}</span></button>` : `<button type="button" class="tl-ev k-${e.kind}" data-ev="${esc(e.id)}"><i></i><span><b>${esc(e.title)}</b> · ${esc(EVENT_KIND[e.kind] || "")}</span><span class="num muted">${fmtDate(e.start)}${e.end ? " – " + fmtDate(e.end) : " → сейчас"}</span></button>`;
  let ei = 0, html = "";
  for (const d of ds) {
    while (ei < evs.length && evs[ei].start > d) html += evHtml(evs[ei++]);
    const l = by[d].sort((a, b) => (GROUP_ORDER[info(a.m).group] - GROUP_ORDER[info(b.m).group]) || info(a.m).ru.localeCompare(info(b.m).ru, "ru"));
    const bad = l.filter(r => ["high", "low"].includes(status(r))).length;
    const labs = [...new Set(l.map(r => r.lab).filter(Boolean))].join(", ");
    html += `<details class="sess">
      <summary><span class="sess-date num">${fmtDate(d)}</span>
        <span class="sess-meta">${l.length} ${plural(l.length, "показатель", "показателя", "показателей")}${labs ? " · " + esc(labs) : ""}${bad ? ` · <span style="color:var(--high)">${bad} вне нормы</span>` : ""}</span>
        <span class="sess-dots">${l.map(r => `<i class="${status(r) || "none"}"></i>`).join("")}</span></summary>
      <div class="sess-body">${l.map(r => { const s = status(r); return `<div class="sess-row" data-goto="${esc(r.m)}"><span>${esc(info(r.m).ru)}</span><span class="num ${s}">${pair(r, "", "muted")}</span></div>`; }).join("")}
        <button type="button" class="linkbtn" data-digest="${esc(d)}">Что изменилось по сравнению с прошлыми сдачами →</button></div>
    </details>`;
  }
  while (ei < evs.length) html += evHtml(evs[ei++]);
  $("#timeline").innerHTML = html;
}

/* ============ about a marker: what, when, prep, panels ============ */
function memberChip(mid, self, bm) {
  const m = info(mid), l = bm[mid];
  if (!l) return `<button type="button" class="mchip untaken ${self ? "self" : ""}" data-jump="${esc(mid)}" title="Не сдавал — открыть описание"><i></i>${esc(m.ru)}<span class="mv">не сдавал</span></button>`;
  const x = l[l.length - 1], s = status(x), out = outside(x);
  const v = out ? `${out.dir === "high" ? "↑" : "↓"}${pctText(out.pct)}%` : fmt(x.v);
  return `<button type="button" class="mchip st-${s || "none"} ${out ? "lvl-" + out.lvl : ""} ${self ? "self" : ""}" data-jump="${esc(mid)}" title="${esc(`${fmtDate(x.date)}: ${fmt(x.v)} ${x.unit}`)}"><i></i>${esc(m.ru)}<span class="mv num">${esc(v)}</span></button>`;
}
// "If high / if low" cards; the side matching the latest result is highlighted.
// what to enter for a panel: its base and the values the lab calculates
const panelBase = pid => PANELS.find(p => p.id === pid).members.filter(x => x[1] !== "if").map(x => x[0]);
function hlHtml(id) {
  const hl = (window.HL || {})[id];
  if (!hl || (!hl[0] && !hl[1])) return "";
  const l = byMarker()[id], x = l ? l[l.length - 1] : null, s = x ? status(x) : null;
  const card = (cls, title, text, active) => text ? `<div class="hl ${cls} ${active ? "active" : ""}">
      <div class="hl-title">${title}${active ? `<span class="hl-you">твой последний результат</span>` : ""}</div><p>${esc(text)}</p></div>` : "";
  return `<div class="hl-grid">
      ${card("hi", "↑ Если выше нормы", hl[0], s === "high")}
      ${card("lo", "↓ Если ниже нормы", hl[1], s === "low")}
    </div>${hl[2] ? `<p class="hl-note"><b>Важно:</b> ${esc(hl[2])}</p>` : ""}`;
}
// One marker inside a panel: status dot, name and why it is there; the value sits on the right.
function memberRow(mid, text, self, bm) {
  const m = info(mid), l = bm[mid];
  let st = "untaken", val = `<span class="tr-none">не сдавал</span>`;
  if (l) {
    const x = l[l.length - 1], s = status(x), out = outside(x);
    st = s || "none";
    val = out
      ? `<span class="tr-val ${out.dir}">${out.dir === "high" ? "↑" : "↓"} ${pctText(out.pct)}%</span>`
      : `<span class="tr-val">${fmt(x.v)} <small>${esc(x.unit)}</small></span>`;
  }
  return `<button type="button" class="trow st-${st} ${self ? "self" : ""}" data-jump="${esc(mid)}">
    <i class="tr-dot"></i>
    <span class="tr-main"><span class="tr-name">${esc(m.ru)}${self ? `<span class="tr-here">этот анализ</span>` : ""}</span><span class="tr-text">${esc(text)}</span></span>
    ${val}
  </button>`;
}
function about(id) {
  const inf = INFO[id], bm = byMarker(), m = info(id);
  const tierRank = { core: 0, alt: 1, calc: 2, if: 3 };
  const roleIn = p => p.members.find(x => x[0] === id);
  // panels where this marker is part of the base go first; only the first is expanded
  const panels = PANELS.filter(p => roleIn(p)).sort((a, b) => tierRank[roleIn(a)[1]] - tierRank[roleIn(b)[1]]);
  if (!inf && !panels.length) return `<p class="about-lead">Описания для этого показателя пока нет.</p>`;
  const TIER = Object.fromEntries(TIERS.map(([k, label, hint]) => [k, { label, hint }]));
  const panelHtml = panels.map((p, i) => {
    const [, tier, text] = roleIn(p);
    const base = p.members.filter(x => x[1] === "core" || x[1] === "alt");
    const baseTaken = base.filter(x => bm[x[0]]).length;
    const rolePhrase = tier === "if" ? `добавляют по ситуации: ${text}` : tier === "calc" ? `считается сам: ${text}` : tier === "alt" ? `одно из: ${text}` : `основа: ${text}`;
    const tiers = TIERS.map(([k]) => {
      const rows = p.members.filter(x => x[1] === k);
      if (!rows.length) return "";
      return `<div class="tier tier-${k}">
        <div class="tier-h"><b>${esc(TIER[k].label)}</b><span>${esc(TIER[k].hint)}</span></div>
        <ul>${rows.map(([mid, , t]) => `<li>${memberRow(mid, t, mid === id, bm)}</li>`).join("")}</ul>
      </div>`;
    }).join("");
    return `<details class="pcard" ${i === 0 ? "open" : ""}>
      <summary class="pcard-sum">
        <span class="pcard-title"><b>${esc(p.name)}</b><span class="pcard-role tier-${tier}">${esc(m.ru)} здесь — ${esc(rolePhrase)}</span></span>
        <span class="pcard-meta">${base.length ? `основа: ${baseTaken} из ${base.length} сдано` : ""}</span>
        <svg class="chev" width="18" height="18" viewBox="0 0 20 20" aria-hidden="true"><path d="M7 4l6 6-6 6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>
      </summary>
      <div class="pcard-in">
        <div class="pcard-info">
          <div class="pi"><span class="pi-k">Когда сдают этот набор</span><p>${esc(p.problems)}</p></div>
          <div class="pi"><span class="pi-k">Как читать вместе</span><p>${esc(p.logic)}</p></div>
        </div>
        <div class="pcard-body">
          <div class="steps"><span class="pi-k">Порядок</span><ol>${p.steps.map(s => `<li>${esc(s)}</li>`).join("")}</ol></div>
          <div class="tiers">${tiers}</div>
        </div>
        ${baseTaken < base.length ? `<button type="button" class="pcard-add" data-panel="${esc(p.id)}">+ Внести основу набора</button>` : ""}
      </div>
    </details>`;
  }).join("");
  return `<div class="about">
    ${inf ? `<p class="about-lead">${esc(inf.what)}</p>` : ""}
    <div class="about-grid">
      ${inf?.when?.length ? `<div class="about-block"><h5>Когда сдают</h5><div class="sits">${inf.when.map(w => `<button type="button" class="sit" data-sit="${esc(w)}" title="Показать все анализы для этой ситуации">${esc(w)}</button>`).join("")}</div></div>` : ""}
      ${inf?.prep ? `<div class="about-block"><h5>Как подготовиться</h5><p class="prep"><svg width="16" height="16" viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="7.5" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M10 6v4.5l3 2" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg><span>${esc(inf.prep)}</span></p></div>` : ""}
    </div>
    ${hlHtml(id)}
    ${panels.length ? `<h5 class="about-h">С чем сдают вместе <span>· наборы, куда входит ${esc(m.ru)}</span></h5><div class="pcards">${panelHtml}</div>` : ""}
    <p class="about-note">Справка по общим медицинским источникам, не диагноз. Что сдавать и как трактовать именно тебе, решает врач.
      Подробнее: <a href="https://vsearch.nlm.nih.gov/vivisimo/cgi-bin/query-meta?v%3Aproject=medlineplus&query=${encodeURIComponent(m.en + " test")}" target="_blank" rel="noopener">MedlinePlus (NIH)</a> ·
      <a href="https://pubmed.ncbi.nlm.nih.gov/?term=${encodeURIComponent(m.en)}" target="_blank" rel="noopener">исследования в PubMed</a></p>
  </div>`;
}
const infoDlg = $("#infoDlg");
function openInfo(id) {
  const m = info(id), taken = !!byMarker()[id];
  $("#infoBody").innerHTML = `
    <div class="dlg-head">
      <div><div class="info-group">${esc(GROUP_NAME[m.group] || "")}</div><h3>${esc(m.ru)}</h3><div class="mk-alt">${esc([m.abbr, m.uk !== m.ru ? m.uk : "", m.en].filter(Boolean).join(" · "))}</div></div>
      <button type="button" class="icon-btn" data-close aria-label="Закрыть">×</button>
    </div>
    ${about(id)}
    <div class="dlg-foot">${taken ? `<button type="button" class="btn ghost" data-jump="${esc(id)}" data-force-row>Мои результаты</button>` : ""}<button type="button" class="btn primary" data-add="${esc(id)}">+ Внести результат</button></div>`;
  if (!infoDlg.open) infoDlg.showModal();
  $("#infoBody").scrollTop = 0;
}
function focusRow(id) {
  if (ui.view === "studies") setView("labs");
  ui.open = id; ui.group = "all"; ui.filter = "all"; ui.sit = ""; renderSitBtn(); setQuery("");
  $$("#statusSeg button").forEach(x => x.setAttribute("aria-pressed", x.dataset.s === "all"));
  renderSit(); renderGroups(); renderList();
  $(`.mk[data-id="${CSS.escape(id)}"]`)?.scrollIntoView({ behavior: "smooth", block: "start" });
}
function setSit(sit) { ui.sit = sit; renderSitBtn(); renderSit(); renderList(); }
const guideIds = g => new Set(["core", "then", "extra"].flatMap(k => (g?.[k] || []).flatMap(it => it[0])));
const GUIDE_IDS = Object.fromEntries(Object.entries(window.GUIDES || {}).map(([k, g]) => [k, guideIds(g)]));
function inSit(id, sit) { return (INFO[id]?.when || []).includes(sit) || !!GUIDE_IDS[sit]?.has(id); }
// one marker inside a plan: latest value with status, or "не сдавал"
function gchip(id, bm) {
  const m = info(id), l = bm[id];
  if (!l) return `<button type="button" class="gchip none" data-ginfo="${esc(id)}" title="Не сдавал — что это и как внести"><span class="gc-name">${esc(m.ru)}</span><span class="gc-val">не сдавал</span></button>`;
  const x = l[l.length - 1], s = status(x) || "none", old = ageClass(x.date) === "age-old";
  return `<button type="button" class="gchip ${s}" data-ginfo="${esc(id)}" title="${esc(fmtDate(x.date) + " · " + agoText(x.date) + (STATUS_TXT[s] ? " · " + STATUS_TXT[s] : ""))}">
    <i class="gc-dot"></i><span class="gc-name">${esc(m.ru)}</span><span class="gc-val num">${fmt(x.v)} <span>${esc(x.unit || "")}</span></span>${old ? `<span class="gc-old">${esc(agoText(x.date))}</span>` : ""}</button>`;
}
function renderSit() {
  const bar = $("#sitBar");
  if (!ui.sit) { bar.hidden = true; bar.innerHTML = ""; return; }
  const bm = byMarker(), g = GUIDES[ui.sit];
  const panels = PANELS.filter(p => panelIds(p).filter(x => inSit(x, ui.sit)).length >= 2);
  const panelRow = panels.length ? `<div class="sitbar-panels"><span>Внести набором:</span>${panels.map(p => `<button type="button" class="chip" data-panel="${esc(p.id)}" title="${esc(p.why)} — внести весь набор">${esc(p.name)}</button>`).join("")}</div>` : "";
  const head = `<div class="g-head"><div><div class="g-kicker">Что беспокоит</div><div class="g-title">${esc(ui.sit)}</div></div><button type="button" class="icon-btn sm" data-sit-clear aria-label="Сбросить ситуацию">×</button></div>`;
  if (!g) { bar.hidden = false; bar.innerHTML = head + panelRow; return; }
  const coreIds = [...new Set((g.core || []).flatMap(it => it[0]))], done = coreIds.filter(id => bm[id]).length;
  const items = list => list.map(([ids, why]) => `<div class="g-item"><div class="g-why">${esc(why)}</div><div class="g-chips">${ids.map(id => gchip(id, bm)).join("")}</div></div>`).join("");
  const step = (n, key, list, extra = "") => list?.length ? `<section class="g-step ${key}"><div class="g-sh"><span class="g-n">${n}</span>${esc(GUIDE_STEP[key])}${extra}</div>${items(list)}</section>` : "";
  const open = ui.sitExtra;
  bar.hidden = false;
  bar.innerHTML = head + `
    <p class="g-lead">${esc(g.lead)}</p>
    ${coreIds.length ? `<div class="g-prog"><div class="g-bar"><i style="width:${Math.round(done / coreIds.length * 100)}%"></i></div><span>Основное сдано: <b>${done} из ${coreIds.length}</b></span></div>` : ""}
    ${step(1, "core", g.core)}
    ${step(g.core?.length ? 2 : 1, "then", g.then)}
    ${g.extra?.length ? `<section class="g-step extra"><button type="button" class="g-more" data-sit-extra aria-expanded="${!!open}">${esc(GUIDE_STEP.extra)} · ${g.extra.length}<svg width="14" height="14" viewBox="0 0 20 20" aria-hidden="true"><path d="M5 8l5 5 5-5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></button>${open ? items(g.extra) : ""}</section>` : ""}
    ${g.note ? `<div class="g-note">${esc(g.note)}</div>` : ""}
    ${g.flags ? `<div class="g-flags"><b>Сразу к врачу, если:</b> ${esc(g.flags)}</div>` : ""}
    ${panelRow}
    <div class="g-src">План по клиническим рекомендациям — это подсказка для разговора с врачом, а не назначение.</div>`;
}
// Situation picker: a grouped popover instead of a long native select.
const SIT_GROUPS = [
  ["Плановое", ["Чекап раз в год", "Перед операцией", "Контроль лекарств", "Спорт и нагрузки", "Планирование детей"]],
  ["Самочувствие", ["Усталость и слабость", "Стресс и сон", "Тревога и настроение", "Головные боли", "Выпадение волос", "Кожа и акне", "Онемение и нервы", "Либидо и потенция"]],
  ["Органы и системы", ["Сердце и сосуды", "Давление и отёки", "Сахар и диабет", "Лишний вес", "Щитовидка", "Печень", "Почки", "ЖКТ и живот", "Изжога и гастрит"]],
  ["Кровь, иммунитет, опора", ["Анемия", "Кровоточивость и тромбы", "Воспаление и инфекции", "Аллергия", "Суставы", "Кости"]],
];
{ const known = new Set(SIT_GROUPS.flatMap(g => g[1])), lost = SITUATIONS.filter(x => !known.has(x)); if (lost.length) SIT_GROUPS.push(["Другое", lost]); }
const sitBtn = $("#sitBtn"), sitPop = $("#sitPop");
function renderSitBtn() {
  sitBtn.classList.toggle("on", !!ui.sit);
  sitBtn.innerHTML = `<svg width="15" height="15" viewBox="0 0 20 20" aria-hidden="true"><path d="M3 5h14M6 10h8M9 15h2" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg><span>${esc(ui.sit || "Что беспокоит")}</span><svg class="sit-chev" width="14" height="14" viewBox="0 0 20 20" aria-hidden="true"><path d="M5 8l5 5 5-5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  renderReset();
}
function renderSitPop(q = "") {
  const k = q.trim().toLowerCase();
  const groups = SIT_GROUPS.map(([name, list]) => [name, list.filter(x => !k || x.toLowerCase().includes(k))]).filter(g => g[1].length);
  const count = x => CATALOG.filter(m => inSit(m.id, x)).length;
  sitPop.querySelector(".sit-body").innerHTML = groups.length ? groups.map(([name, list]) => `
    <div class="sit-group"><div class="sit-gname">${esc(name)}</div>
      <div class="sit-grid">${list.map(x => `<button type="button" class="sit-opt" data-pick="${esc(x)}" aria-pressed="${ui.sit === x}"><span>${esc(x)}</span><span class="sit-n">${count(x)}</span></button>`).join("")}</div>
    </div>`).join("") : `<div class="sit-empty">Ничего не нашлось</div>`;
}
function openSitPop() {
  sitPop.innerHTML = `<div class="sit-head"><input class="sit-q" type="text" placeholder="Найти ситуацию" autocomplete="off" aria-label="Найти ситуацию">${ui.sit ? `<button type="button" class="sit-reset" data-pick="">Сбросить</button>` : ""}</div><div class="sit-body"></div>`;
  renderSitPop(); sitPop.hidden = false; sitBtn.setAttribute("aria-expanded", "true");
  // open to the side that has room
  sitPop.classList.remove("to-left"); const r = sitPop.getBoundingClientRect(); if (r.right > innerWidth - 12) sitPop.classList.add("to-left");
  $(".sit-q", sitPop).focus({ preventScroll: true });
}
function closeSitPop() { if (sitPop.hidden) return; sitPop.hidden = true; sitBtn.setAttribute("aria-expanded", "false"); }
sitBtn.addEventListener("click", () => sitPop.hidden ? openSitPop() : closeSitPop());
sitPop.addEventListener("input", e => { if (e.target.classList.contains("sit-q")) renderSitPop(e.target.value); });
sitPop.addEventListener("click", e => { const b = e.target.closest("[data-pick]"); if (!b) return; setSit(b.dataset.pick); closeSitPop(); sitBtn.focus(); });
sitPop.addEventListener("keydown", e => {
  if (e.key === "Escape") { closeSitPop(); sitBtn.focus(); }
  if (e.key === "Enter" && e.target.classList.contains("sit-q")) { const first = $(".sit-opt", sitPop); if (first) first.click(); }
});
document.addEventListener("mousedown", e => { if (!e.target.closest?.("#sitPick")) closeSitPop(); });
// one click clears search, status filter and situation
function renderReset() { $("#resetBtn").hidden = !(ui.q || ui.filter !== "all" || ui.sit); }
$("#resetBtn").addEventListener("click", () => {
  ui.filter = "all"; $$("#statusSeg button").forEach(x => x.setAttribute("aria-pressed", x.dataset.s === "all"));
  ui.sit = ""; renderSitBtn(); renderSit(); setQuery("");
});
renderSitBtn();
// clicks that work both in the list and inside the info dialog
document.addEventListener("click", e => {
  const t = e.target;
  if (t.closest("[data-close]")) { infoDlg.close(); return; }
  if (t.closest("[data-sit-clear]")) { setSit(""); return; }
  if (t.closest("[data-sit-extra]")) { ui.sitExtra = !ui.sitExtra; renderSit(); return; }
  const gi = t.closest("[data-ginfo]");
  if (gi) { openInfo(gi.dataset.ginfo); return; }
  const tab = t.closest("[data-tab]");
  if (tab) { ui.tab = tab.dataset.tab; renderList(); return; }
  const sit = t.closest("[data-sit]");
  if (sit) { if (infoDlg.open) infoDlg.close(); setSit(sit.dataset.sit); $(".toolbar").scrollIntoView({ behavior: "smooth", block: "start" }); return; }
  const panel = t.closest("[data-panel]");
  if (panel) { if (infoDlg.open) infoDlg.close(); openEntry(panelBase(panel.dataset.panel)); return; }
  const jump = t.closest("[data-jump]");
  if (jump) {
    const id = jump.dataset.jump;
    if (byMarker()[id] && (jump.hasAttribute("data-force-row") || !infoDlg.open)) { if (infoDlg.open) infoDlg.close(); focusRow(id); }
    else openInfo(id);
    return;
  }
  const addIn = t.closest("#infoDlg [data-add]");
  if (addIn) { infoDlg.close(); openEntry([addIn.dataset.add]); }
});
infoDlg.addEventListener("click", e => { if (e.target === infoDlg) infoDlg.close(); });

function renderAll() { renderOverview(); renderDue(); renderGroups(); renderList(); renderTimeline(); renderStudies(); }

/* ============ tooltip ============ */
const tip = $("#tip");
function showTip(el) {
  let html;
  if (el.dataset.tipMore) html = `Ещё ${el.dataset.tipMore} ранних ${plural(+el.dataset.tipMore, "сдача", "сдачи", "сдач")}. Открой строку, чтобы увидеть всю историю.`;
  else {
    const raw = state.results[el.dataset.tip]; if (!raw) return;
    const r = view(el.dataset.tip, raw), s = status(r);
    html = `<div class="tip-d">${fmtDate(r.date)}${r.lab ? " · " + esc(r.lab) : ""}</div><b class="num">${fmt(r.v)}</b> ${esc(r.unit || "")}
      ${rangeText(r.min, r.max) ? `<div>норма ${esc(rangeText(r.min, r.max))}${s && s !== "none" ? " · " + STATUS_TXT[s] : ""}</div>` : ""}
      ${r.converted ? `<div class="tip-o">На бланке: <b class="num">${esc(origText(r))}</b>${rangeText(r.o.min, r.o.max) ? `, норма ${esc(rangeText(r.o.min, r.o.max))}` : ""}</div>` : ""}${r.note ? `<div class="tip-d">${esc(r.note)}</div>` : ""}`;
  }
  tip.innerHTML = html; tip.hidden = false;
  const b = el.getBoundingClientRect(), t = tip.getBoundingClientRect();
  let x = b.left + b.width / 2 - t.width / 2, y = b.top - t.height - 10;
  if (y < 8) y = b.bottom + 10;
  x = Math.max(8, Math.min(window.innerWidth - t.width - 8, x));
  tip.style.left = x + "px"; tip.style.top = y + "px";
}
const hideTip = () => { tip.hidden = true; };
document.addEventListener("mouseover", e => { const el = e.target.closest("[data-tip],[data-tip-more]"); if (el) showTip(el); });
document.addEventListener("mouseout", e => { if (e.target.closest("[data-tip],[data-tip-more]")) hideTip(); });
document.addEventListener("focusin", e => { const el = e.target.closest("[data-tip],[data-tip-more]"); if (el) showTip(el); else hideTip(); });
window.addEventListener("scroll", hideTip, { passive: true });

/* ============ list events ============ */
const qEl = $("#q"), qClear = $("#qClear");
function setQuery(v) { ui.q = v; qEl.value = v; qClear.hidden = !v; renderList(); }
qEl.addEventListener("input", () => setQuery(qEl.value));
qEl.addEventListener("keydown", e => { if (e.key === "Escape") { setQuery(""); qEl.blur(); } });
qClear.addEventListener("click", () => { setQuery(""); qEl.focus(); });
document.addEventListener("keydown", e => {
  if (e.key === "/" && !e.target.closest("input, textarea, dialog")) { e.preventDefault(); qEl.focus(); }
});
$("#statusSeg").addEventListener("click", e => {
  const b = e.target.closest("button"); if (!b) return;
  ui.filter = b.dataset.s; $$("#statusSeg button").forEach(x => x.setAttribute("aria-pressed", x === b)); renderList();
});
$("#groups").addEventListener("click", e => { const b = e.target.closest(".chip"); if (b) jumpTo(b.dataset.sec); });
$("#rail").addEventListener("click", e => { const b = e.target.closest(".rail-item"); if (b) jumpTo(b.dataset.sec); });
const toolbarEl = $(".toolbar"), groupsEl = $("#groups");
// wide screens: side rail instead of the sticky toolbar
const wideMQ = matchMedia("(min-width: 1180px)");
const navOffset = () => wideMQ.matches ? 24 : null;
function jumpTo(secId) {
  const el = document.getElementById(secId); if (!el) return;
  ui.jumping = secId; markChip(secId);
  // measure the toolbar as it will be once stuck, so the section lands right under it
  let h = navOffset();
  if (h == null) { const was = toolbarEl.classList.contains("stuck"); toolbarEl.classList.add("stuck"); h = toolbarEl.offsetHeight; if (!was) toolbarEl.classList.remove("stuck"); }
  const y = el.getBoundingClientRect().top + scrollY - h - 6;
  scrollTo({ top: y, behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  el.classList.remove("flash"); void el.offsetWidth; el.classList.add("flash");
  clearTimeout(ui.jumpTimer); ui.jumpTimer = setTimeout(() => { ui.jumping = null; spy(); }, 700);
}
function markChip(secId) {
  let cur = null;
  for (const c of $$("#groups .chip, #rail .rail-item")) { const on = c.dataset.sec === secId; c.setAttribute("aria-current", on); if (on && c.classList.contains("chip")) cur = c; }
  if (cur && groupsEl.scrollWidth > groupsEl.clientWidth) groupsEl.scrollTo({ left: cur.offsetLeft - groupsEl.clientWidth / 2 + cur.offsetWidth / 2, behavior: "smooth" });
}
// which section is under the sticky toolbar; also shrink the toolbar once it is stuck
function spy() {
  const edge = wideMQ.matches ? 48 : toolbarEl.getBoundingClientRect().bottom + 12;
  toolbarEl.classList.toggle("stuck", !wideMQ.matches && toolbarEl.getBoundingClientRect().top <= 0 && $("#list").getBoundingClientRect().top < edge);
  if (ui.jumping) return;
  let cur = null;
  const secs = $$("#list .sec");
  for (const el of secs) { if (el.getBoundingClientRect().top <= edge) cur = el.id; else break; }
  const listEnd = $("#list").getBoundingClientRect().bottom;
  if (secs.length && innerHeight + scrollY >= document.documentElement.scrollHeight - 4 && listEnd > edge) cur = secs[secs.length - 1].id;
  markChip(cur || $("#list .sec")?.id);
}
let spyQueued = false;
addEventListener("scroll", () => { if (spyQueued) return; spyQueued = true; requestAnimationFrame(() => { spyQueued = false; spy(); }); }, { passive: true });
// back to top
const topBtn = document.createElement("button");
topBtn.className = "to-top"; topBtn.type = "button"; topBtn.setAttribute("aria-label", "Наверх");
topBtn.innerHTML = `<svg width="18" height="18" viewBox="0 0 20 20" aria-hidden="true"><path d="M5 12l5-5 5 5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
topBtn.addEventListener("click", () => scrollTo({ top: 0, behavior: "smooth" }));
document.body.appendChild(topBtn);
addEventListener("scroll", () => topBtn.classList.toggle("show", scrollY > innerHeight), { passive: true });
$("#overview").addEventListener("click", e => {
  const b = e.target.closest("[data-goto]"); if (!b) return;
  ui.open = b.dataset.goto; ui.group = "all"; ui.q = ""; ui.filter = "all"; $("#q").value = ""; $("#qClear").hidden = true;
  $$("#statusSeg button").forEach(x => x.setAttribute("aria-pressed", x.dataset.s === "all"));
  renderGroups(); renderList();
  $(`.mk[data-id="${CSS.escape(b.dataset.goto)}"]`)?.scrollIntoView({ behavior: "smooth", block: "center" });
});
$("#list").addEventListener("click", e => {
  if (e.target.closest(".pill")) return;
  if (e.target.closest("[data-untaken]")) {
    if (ui.q || ui.sit) return;
    ui.showAll = !ui.showAll;
    try { localStorage.setItem("medcard.showAll", ui.showAll ? "1" : ""); } catch (err) { /* ignore */ }
    renderList(); return;
  }
  if (e.target.closest("[data-tab],[data-sit],[data-jump],[data-panel]")) return;
  const bpd = e.target.closest("[data-bpdel]");
  if (bpd) {
    const [sid, did] = bpd.dataset.bpdel.split("|");
    if (ui.confirmDel !== sid) { ui.confirmDel = sid; renderList(); return; }
    delete state.results[sid]; delete state.results[did]; ui.confirmDel = null; save(); toast("Замер удалён"); renderAll(); return;
  }
  const more = e.target.closest("[data-more]");
  if (more) { const g = more.dataset.more; if (ui.more.has(g)) ui.more.delete(g); else { ui.more.add(g); ui.justOpened = g; } renderList(); return; }
  const add =e.target.closest("[data-add]");
  if (add) { openEntry([add.dataset.add]); return; }
  const inf = e.target.closest("[data-info]");
  if (inf) { openInfo(inf.dataset.info); return; }
  const act = e.target.closest("[data-act]");
  if (act) {
    const rid = act.closest("tr[data-rid]")?.dataset.rid, a = act.dataset.act;
    if (a === "edit") { ui.editing = rid; ui.confirmDel = null; }
    else if (a === "cancelEdit") ui.editing = null;
    else if (a === "del") {
      if (ui.confirmDel !== rid) ui.confirmDel = rid;
      else { delete state.results[rid]; ui.confirmDel = null; save(); toast("Замер удалён"); renderAll(); return; }
    } else if (a === "saveEdit") {
      const v = parseNum($("#edV").value);
      if (v == null) { toast("Введи значение числом"); return; }
      const { min, max } = parseRange($("#edRange").value);
      Object.assign(state.results[rid], { date: $("#edDate").value || state.results[rid].date, v, unit: $("#edUnit").value.trim(), min, max, lab: $("#edLab").value.trim() });
      ui.editing = null; save(); toast("Сохранено"); renderAll(); return;
    }
    renderList(); return;
  }
  if (e.target.closest(".detail")) return;
  const mk = e.target.closest(".mk"); if (!mk) return;
  ui.open = ui.open === mk.dataset.id ? null : mk.dataset.id; ui.editing = null; ui.confirmDel = null; hideTip(); ui.animOpen = true; renderList(); ui.animOpen = false;
});
$("#list").addEventListener("keydown", e => { if ((e.key === "Enter" || e.key === " ") && e.target.classList.contains("mk")) { e.preventDefault(); e.target.click(); } });

/* ============ data menu ============ */
const menu = $("#menu");
$("#menuBtn").addEventListener("click", e => { e.stopPropagation(); menu.hidden = !menu.hidden; $("#menuBtn").setAttribute("aria-expanded", !menu.hidden); });
document.addEventListener("click", e => { if (!menu.hidden && !e.target.closest("#menu")) { menu.hidden = true; $("#menuBtn").setAttribute("aria-expanded", "false"); } });
$("#exportBtn").addEventListener("click", () => {
  const blob = new Blob([JSON.stringify({ app: "medcard", version: 1, exported: new Date().toISOString(), ...state }, null, 2)], { type: "application/json" });
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `medcard-${todayISO()}.json`;
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  menu.hidden = true; toast("Копия сохранена в файл");
});
$("#importInput").addEventListener("change", async e => {
  const f = e.target.files[0]; if (!f) return;
  try {
    const j = JSON.parse(await f.text());
    if (!j || typeof j.results !== "object") throw new Error("bad");
    state.markers = j.markers || {}; state.results = j.results; state.events = j.events || {}; state.prefs = j.prefs || {}; state.studies = j.studies || {}; save(); renderAll();
    toast(`Загружено: ${Object.keys(state.results).length} замеров`);
  } catch (err) { toast("Это не файл Медкарты — ничего не изменено"); }
  e.target.value = ""; menu.hidden = true;
});

/* ============ entry dialog ============ */
// Flow: pick a date (today by default) → type an analysis name → Enter → type the value → Enter → next name.
// Units and norm come from the previous blank of the same analysis and open for editing only on demand.
const dlg = $("#entry");
let rows = [];
let entryLab = "";
const blank = () => ({ mid: null, name: "", v: "", unit: "", range: "", edit: false, last: null });
function options() {
  const used = byMarker();
  const ids = new Set([...Object.keys(state.markers), ...CATALOG.map(m => m.id), ...Object.keys(used)]);
  return [...ids].map(info).sort((a, b) => (used[b.id] ? 1 : 0) - (used[a.id] ? 1 : 0));
}
function lastOf(mid) { const l = byMarker()[mid]; return l ? l[l.length - 1] : null; }
function fill(r, mid) {
  const m = info(mid), last = lastOf(mid);
  r.mid = mid; r.name = m.ru; r.last = last;
  r.unit = last?.o.unit ?? m.unit ?? "";
  r.range = last ? rangeInput(last.o) : "";
  r.edit = !last; // nothing to copy from — show unit and norm fields right away
}
const MONTHS = ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"];
function isoShift(days) { const d = new Date(); d.setDate(d.getDate() - days); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; }
function longDate(iso) { if (!iso) return "Выбери дату"; const [y, m, d] = iso.split("-").map(Number); return `${d} ${MONTHS[m - 1]} ${y}`; }
function renderDate() {
  const v = $("#eDate").value;
  $("#dpText").textContent = longDate(v);
  $$("#dateQuick [data-d]").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.d === "0" ? v === isoShift(0) : v === isoShift(1))));
}
function renderLab() {
  $("#labText").textContent = entryLab || "не указана";
  $("#labText").classList.toggle("muted", !entryLab);
}
function rowCard(r, i) {
  const m = r.mid ? info(r.mid) : null;
  const sub = r.last ? `прошлый раз ${fmt(r.last.o.v)} ${esc(r.last.o.unit)} · ${fmtDate(r.last.date)}` : (m ? "первая сдача" : "новый показатель");
  const meta = r.edit
    ? `<div class="ec-edit">
        <label><span>Единицы</span><input class="input unit" id="unit${i}" value="${esc(r.unit)}" placeholder="мкМЕ/мл"></label>
        <label><span>Норма с бланка</span><input class="input num rng" id="rng${i}" value="${esc(r.range)}" placeholder="0.27-4.2 или <34"></label>
      </div>`
    : `<button type="button" class="ec-meta" data-edit>${r.range ? `норма ${esc(r.range.replace(/-/, "–"))}` : "норма не указана"} · изменить</button>`;
  return `<div class="ecard" data-i="${i}">
    <div class="ec-name"><b>${esc(r.name)}</b><span>${esc(m?.abbr || "")}${m?.abbr ? " · " : ""}${sub}</span></div>
    <div class="ec-val">
      <input class="input num val" id="val${i}" value="${esc(r.v)}" inputmode="decimal" autocomplete="off" placeholder="значение" aria-label="Значение ${esc(r.name)}">
      ${r.mid ? `<select class="ec-unit-sel unit-sel" aria-label="Единицы ${esc(r.name)}" title="В чём измеряла лаборатория">
        ${unitChoices(r.mid, r.unit).map(u => `<option value="${esc(u)}"${unitKey(u) === unitKey(r.unit) ? " selected" : ""}>${esc(u || "без единиц")}</option>`).join("")}
        <option value="__other">другие…</option>
      </select>` : `<span class="ec-unit">${esc(r.unit)}</span>`}
    </div>
    <button type="button" class="ec-x" data-rm aria-label="Убрать ${esc(r.name)}">×</button>
    ${meta}
  </div>`;
}
function renderRows(focusIdx, field = "val") {
  $("#rows").innerHTML = rows.length
    ? rows.map(rowCard).join("")
    : `<div class="ec-empty">Начни печатать название анализа выше — или выбери набор.</div>`;
  updateSave();
  if (focusIdx != null) { const el = $(`#${field}${focusIdx}`); el?.focus(); el?.select?.(); }
}
function updateSave() {
  const n = rows.filter(r => parseNum(r.v) != null).length;
  $("#entrySave").textContent = n ? `Сохранить ${n}` : "Сохранить";
  $("#entrySave").disabled = !n;
}
function renderQuick() {
  const ds = dates();
  $("#quick").innerHTML = `
    <div class="setwrap">
      <button type="button" class="qbtn" id="setBtn" aria-haspopup="true" aria-expanded="false">Набор анализов</button>
      <div class="setpop" id="setPop" hidden>
        <input class="input setq" id="setQ" placeholder="Найти набор…" autocomplete="off">
        <div class="setlist" id="setList"></div>
      </div>
    </div>
    ${ds.length ? `<button type="button" class="qbtn" data-quick="last">Как ${fmtDate(ds[ds.length - 1])}</button>` : ""}`;
  renderSetList("");
  $("#labList").innerHTML = [...new Set(Object.values(state.results).map(r => r.lab).filter(Boolean))].map(l => `<option value="${esc(l)}">`).join("");
}
function renderSetList(q) {
  const list = PANELS.filter(p => !norm(q) || norm(p.name + " " + p.problems).includes(norm(q)));
  $("#setList").innerHTML = list.length
    ? list.map(p => `<button type="button" class="setitem" data-quick="p:${p.id}"><b>${esc(p.name)}</b><span>${panelBase(p.id).length} ${plural(panelBase(p.id).length, "анализ", "анализа", "анализов")} · ${esc(p.problems.split(/[,;]/)[0])}</span></button>`).join("")
    : `<div class="setempty">Ничего не нашлось</div>`;
}
function toggleSet(open) {
  const pop = $("#setPop"); if (!pop) return;
  pop.hidden = !open; $("#setBtn").setAttribute("aria-expanded", open);
  if (open) { $("#setQ").value = ""; renderSetList(""); $("#setQ").focus(); }
}
function addMany(mids) {
  let first = null;
  mids.forEach(mid => { if (!rows.some(r => r.mid === mid)) { const r = blank(); fill(r, mid); rows.push(r); if (first == null) first = rows.length - 1; } });
  renderRows(first ?? rows.findIndex(r => !r.v));
}
function addCustom(name) { const r = blank(); r.name = name; r.edit = true; rows.push(r); renderRows(rows.length - 1); }
function openEntry(mids = []) {
  rows = [];
  $("#eDate").value = todayISO();
  const lastWithLab = Object.values(state.results).filter(r => r.lab).sort((a, b) => (b.date || "").localeCompare(a.date || ""))[0];
  entryLab = lastWithLab?.lab || "";
  $("#labEdit").hidden = true; $("#labShow").hidden = false;
  setMsg(); renderQuick(); renderDate(); renderLab();
  $("#addQ").value = ""; closeAddSugg();
  dlg.showModal();
  if (mids.length) addMany(mids); else { renderRows(); $("#addQ").focus(); }
}
function setMsg(t, err) {
  const el = $("#entryMsg");
  el.hidden = !t; el.textContent = t || ""; el.classList.toggle("err", !!err);
}
$("#addBtn").addEventListener("click", () => openEntry());
$("#entryClose").addEventListener("click", () => dlg.close());
$("#entryCancel").addEventListener("click", () => dlg.close());

// date: our own calendar — big days, months/years view, typed input, marks past sessions
const cal = { y: 0, m: 0, view: "days" };
const MONTHS_NOM = ["Январь", "Февраль", "Март", "Апрель", "Май", "Июнь", "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь"];
const iso = (y, m, d) => `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
function setDate(v) { $("#eDate").value = v; renderDate(); }
function openCal() {
  const [y, m] = ($("#eDate").value || todayISO()).split("-").map(Number);
  cal.y = y; cal.m = m - 1; cal.view = "days";
  $("#calPop").hidden = false; $("#datePick").setAttribute("aria-expanded", "true");
  renderCal(); $("#calType")?.focus();
}
function closeCal() { $("#calPop").hidden = true; $("#datePick").setAttribute("aria-expanded", "false"); }
function renderCal() {
  const today = todayISO(), sel = $("#eDate").value;
  const sessions = new Set(dates());
  const [ty, tm] = today.split("-").map(Number);
  let body;
  if (cal.view === "months") {
    body = `<div class="cal-head">
        <button type="button" class="cal-nav" data-cal="py" aria-label="Предыдущий год">‹</button>
        <span class="cal-title">${cal.y}</span>
        <button type="button" class="cal-nav" data-cal="ny" aria-label="Следующий год" ${cal.y >= ty ? "disabled" : ""}>›</button>
      </div>
      <div class="cal-months">${MONTHS_NOM.map((n, i) => {
        const future = cal.y > ty || (cal.y === ty && i + 1 > tm);
        const has = [...sessions].some(d => d.startsWith(`${cal.y}-${String(i + 1).padStart(2, "0")}`));
        return `<button type="button" data-cal-m="${i}" class="${i === cal.m ? "on" : ""}" ${future ? "disabled" : ""}>${n.slice(0, 3)}${has ? "<i></i>" : ""}</button>`;
      }).join("")}</div>`;
  } else {
    const first = new Date(cal.y, cal.m, 1), shift = (first.getDay() + 6) % 7, days = new Date(cal.y, cal.m + 1, 0).getDate();
    let cells = "";
    for (let i = 0; i < shift; i++) cells += `<span></span>`;
    for (let d = 1; d <= days; d++) {
      const v = iso(cal.y, cal.m, d), wd = (shift + d - 1) % 7;
      const cls = [v === sel ? "on" : "", v === today ? "today" : "", wd > 4 ? "we" : ""].join(" ");
      cells += `<button type="button" data-cal-d="${v}" class="${cls}" ${v > today ? "disabled" : ""} aria-label="${d} ${MONTHS[cal.m]}${sessions.has(v) ? ", была сдача" : ""}">${d}${sessions.has(v) ? "<i></i>" : ""}</button>`;
    }
    const atNow = cal.y > ty || (cal.y === ty && cal.m + 1 >= tm);
    body = `<div class="cal-head">
        <button type="button" class="cal-nav" data-cal="pm" aria-label="Предыдущий месяц">‹</button>
        <button type="button" class="cal-title" data-cal="months">${MONTHS_NOM[cal.m]} ${cal.y}<svg width="14" height="14" viewBox="0 0 20 20" aria-hidden="true"><path d="M5 8l5 5 5-5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></button>
        <button type="button" class="cal-nav" data-cal="nm" aria-label="Следующий месяц" ${atNow ? "disabled" : ""}>›</button>
      </div>
      <div class="cal-wd">${["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"].map(w => `<span>${w}</span>`).join("")}</div>
      <div class="cal-days">${cells}</div>`;
  }
  $("#calPop").innerHTML = `
    <input class="input cal-type" id="calType" placeholder="Вписать дату: 06.02.2024" inputmode="numeric" autocomplete="off">
    ${body}
    ${sessions.size ? `<div class="cal-legend"><i></i>дни прошлых сдач</div>` : ""}`;
}
function parseTyped(t) {
  const m = String(t).trim().match(/^(\d{1,2})[.\/\-\s](\d{1,2})[.\/\-\s](\d{2}|\d{4})$/);
  if (!m) return null;
  let [, d, mo, y] = m.map(Number); if (y < 100) y += 2000;
  const dt = new Date(y, mo - 1, d);
  if (dt.getMonth() !== mo - 1 || dt.getDate() !== d) return null;
  const v = iso(y, mo - 1, d);
  return v > todayISO() ? null : v;
}
$("#datePick").addEventListener("click", e => { e.stopPropagation(); $("#calPop").hidden ? openCal() : closeCal(); });
$("#calPop").addEventListener("click", e => {
  e.stopPropagation();
  const b = e.target.closest("button"); if (!b || b.disabled) return;
  if (b.dataset.calD) { setDate(b.dataset.calD); closeCal(); $("#addQ").focus(); return; }
  if (b.dataset.calM) { cal.m = +b.dataset.calM; cal.view = "days"; renderCal(); return; }
  const a = b.dataset.cal;
  if (a === "pm") { cal.m--; if (cal.m < 0) { cal.m = 11; cal.y--; } }
  if (a === "nm") { cal.m++; if (cal.m > 11) { cal.m = 0; cal.y++; } }
  if (a === "py") cal.y--;
  if (a === "ny") cal.y++;
  if (a === "months") cal.view = "months";
  renderCal();
});
$("#calPop").addEventListener("keydown", e => {
  if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); closeCal(); $("#datePick").focus(); }
  if (e.key === "Enter" && e.target.id === "calType") {
    e.preventDefault();
    const v = parseTyped(e.target.value);
    if (v) { setDate(v); closeCal(); $("#addQ").focus(); } else e.target.classList.add("bad");
  }
});
$("#calPop").addEventListener("input", e => {
  if (e.target.id !== "calType") return;
  e.target.classList.remove("bad");
  const v = parseTyped(e.target.value);
  if (v) { const [y, m] = v.split("-").map(Number); cal.y = y; cal.m = m - 1; cal.view = "days"; const t = e.target.value; renderCal(); const inp = $("#calType"); inp.value = t; inp.focus(); $(`[data-cal-d="${v}"]`)?.classList.add("hint"); }
});
dlg.addEventListener("click", e => { if (!e.target.closest(".date-row")) closeCal(); });
dlg.addEventListener("close", closeCal);
$("#dateQuick").addEventListener("click", e => { const b = e.target.closest("[data-d]"); if (!b) return; $("#eDate").value = isoShift(+b.dataset.d); renderDate(); closeCal(); $("#addQ").focus(); });
// lab: shown as text, becomes an input on click
$("#labShow").addEventListener("click", () => { $("#labShow").hidden = true; $("#labEdit").hidden = false; $("#eLab").value = entryLab; $("#eLab").focus(); $("#eLab").select(); });
function commitLab() { entryLab = $("#eLab").value.trim(); $("#labEdit").hidden = true; $("#labShow").hidden = false; renderLab(); }
$("#eLab").addEventListener("change", commitLab);
$("#eLab").addEventListener("blur", commitLab);
$("#eLab").addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); commitLab(); $("#addQ").focus(); } });

// panels + repeat last
$("#quick").addEventListener("input", e => { if (e.target.id === "setQ") renderSetList(e.target.value); });
$("#quick").addEventListener("keydown", e => {
  if (e.target.id === "setQ" && e.key === "Escape") { e.preventDefault(); e.stopPropagation(); toggleSet(false); $("#setBtn").focus(); }
  if (e.target.id === "setQ" && e.key === "Enter") { e.preventDefault(); $("#setList .setitem")?.click(); }
});
dlg.addEventListener("click", e => { if (!e.target.closest(".setwrap")) toggleSet(false); if (!e.target.closest(".addwrap")) closeAddSugg(); });
$("#quick").addEventListener("click", e => {
  if (e.target.closest("#setBtn")) { toggleSet($("#setPop").hidden); return; }
  const b = e.target.closest("[data-quick]"); if (!b) return;
  toggleSet(false);
  const q = b.dataset.quick;
  if (q === "last") { const d = dates().at(-1); addMany(Object.values(state.results).filter(r => r.date === d).map(r => r.m)); }
  else if (q.startsWith("p:")) addMany(panelBase(q.slice(2)));
});

// the "add an analysis" search
let sug = { items: [], sel: 0, custom: null };
function closeAddSugg() { $("#addSugg").hidden = true; $("#addQ").setAttribute("aria-expanded", "false"); sug = { items: [], sel: 0, custom: null }; }
function openAddSugg() {
  const q = $("#addQ").value;
  if (!norm(q)) { closeAddSugg(); return; }
  const taken = new Set(rows.map(r => r.mid));
  const items = options().filter(m => !taken.has(m.id) && matches(m, q)).slice(0, 7);
  const exact = items.some(m => [m.ru, m.uk, m.en, m.abbr].some(x => norm(x) === norm(q)));
  sug = { items, sel: 0, custom: exact ? null : q.trim() };
  $("#addSugg").innerHTML = items.map((m, k) => {
    const last = lastOf(m.id);
    return `<li role="option" data-k="${k}" aria-selected="${k === 0}"><span class="as-name">${esc(m.ru)}<small>${esc([m.abbr, m.en].filter(Boolean).join(" · "))}</small></span><span class="as-last">${last ? `${fmtDate(last.date)}` : "не сдавал"}</span></li>`;
  }).join("") + (sug.custom ? `<li role="option" data-k="new" aria-selected="${!items.length}"><span class="as-name new">+ Новый показатель «${esc(sug.custom)}»</span></li>` : "");
  $("#addSugg").hidden = false; $("#addQ").setAttribute("aria-expanded", "true");
}
function pickAdd(k) {
  if (k === "new") { if (sug.custom) addCustom(sug.custom); }
  else { const m = sug.items[k]; if (m) addMany([m.id]); }
  $("#addQ").value = ""; closeAddSugg();
}
function moveAdd(d) { const lis = $$("#addSugg li"); if (!lis.length) return; sug.sel = (sug.sel + d + lis.length) % lis.length; lis.forEach((l, k) => l.setAttribute("aria-selected", k === sug.sel)); lis[sug.sel].scrollIntoView({ block: "nearest" }); }
$("#addQ").addEventListener("input", openAddSugg);
$("#addQ").addEventListener("keydown", e => {
  if (e.key === "ArrowDown") { e.preventDefault(); moveAdd(1); }
  else if (e.key === "ArrowUp") { e.preventDefault(); moveAdd(-1); }
  else if (e.key === "Enter") {
    e.preventDefault();
    const li = $$("#addSugg li")[sug.sel];
    if (li) pickAdd(li.dataset.k === "new" ? "new" : +li.dataset.k);
    else if (!$("#addQ").value.trim() && rows.some(r => parseNum(r.v) != null)) $("#entryForm").requestSubmit();
  } else if (e.key === "Escape" && !$("#addSugg").hidden) { e.preventDefault(); closeAddSugg(); }
});
$("#addSugg").addEventListener("mousedown", e => { const li = e.target.closest("li"); if (li) { e.preventDefault(); pickAdd(li.dataset.k === "new" ? "new" : +li.dataset.k); } });

// cards
$("#rows").addEventListener("input", e => {
  const el = e.target, card = el.closest(".ecard"); if (!card) return;
  const r = rows[+card.dataset.i];
  if (el.classList.contains("val")) { r.v = el.value; updateSave(); }
  else if (el.classList.contains("unit")) { r.unit = el.value; const sp = $(".ec-unit", card); if (sp) sp.textContent = el.value; }
  else if (el.classList.contains("unit-sel")) {
    const i = +card.dataset.i;
    if (el.value === "__other") { r.edit = true; renderRows(i, "unit"); return; }
    // the norm prefilled from the last blank follows the new unit
    const k = unitFactor(r.mid, r.unit, el.value), { min, max } = parseRange(r.range);
    if (k != null && k !== 1 && (min != null || max != null)) {
      const c = x => x == null ? null : +(x * k).toPrecision(3);
      r.range = rangeInput({ min: c(min), max: c(max) });
    }
    r.unit = el.value; renderRows(i);
  }
  else if (el.classList.contains("rng")) r.range = el.value;
});
$("#rows").addEventListener("keydown", e => {
  if (e.key !== "Enter") return;
  const card = e.target.closest(".ecard"); if (!card) return;
  e.preventDefault();
  const i = +card.dataset.i;
  const next = rows.findIndex((r, k) => k > i && !r.v);
  if (next >= 0) $(`#val${next}`)?.focus();
  else $("#addQ").focus(); // all filled: go add the next analysis
});
$("#rows").addEventListener("click", e => {
  const card = e.target.closest(".ecard"); if (!card) return;
  const i = +card.dataset.i;
  if (e.target.closest("[data-rm]")) { rows.splice(i, 1); renderRows(); $("#addQ").focus(); return; }
  if (e.target.closest("[data-edit]")) { rows[i].edit = true; renderRows(i, "rng"); }
});
dlg.addEventListener("close", closeAddSugg);

$("#entryForm").addEventListener("submit", e => {
  e.preventDefault();
  const date = $("#eDate").value;
  if (!date) { setMsg("Выбери дату сдачи.", true); return; }
  const filled = rows.filter(r => parseNum(r.v) != null);
  if (!filled.length) { setMsg("Впиши значение хотя бы одного анализа.", true); return; }
  const skipped = rows.length - filled.length;
  for (const r of filled) {
    let mid = r.mid;
    if (!mid) mid = options().find(m => [m.ru, m.uk, m.en, m.abbr].some(x => norm(x) === norm(r.name)))?.id;
    if (!mid) { mid = newId("c"); state.markers[mid] = { ru: r.name.trim(), uk: "", en: "", abbr: "", group: "other", unit: r.unit.trim() }; }
    const { min, max } = parseRange(r.range);
    state.results[newId("r")] = { m: mid, date, v: parseNum(r.v), unit: r.unit.trim(), min, max, lab: entryLab, note: "", t: Date.now() };
  }
  if (!save()) return;
  dlg.close(); renderAll();
  toast(`Сохранено: ${filled.length} ${plural(filled.length, "показатель", "показателя", "показателей")} за ${fmtDate(date)}${skipped ? ` · ${skipped} без значения пропущено` : ""}`);
  if (changesFor(date).some(c => c.prev)) setTimeout(() => openDigest(date), 350);
});

/* ============ toast ============ */
let toastTimer;
function toast(t) { const el = $("#toast"); el.textContent = t; el.hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => el.hidden = true, 3000); }

/* ============ boot ============ */
// with a Supabase project configured the site asks for Google sign-in; otherwise it works offline
initExtras();
initStudies();
const shareToken = new URLSearchParams(location.search).get("share");
if (shareToken && typeof cloudConfigured === "function" && cloudConfigured()) shareBoot(shareToken);
else if (typeof cloudConfigured === "function" && cloudConfigured()) cloudBoot();
else { load(); renderAll(); }
// entrance animation plays once; later re-renders (opening a row, sync) stay still
setTimeout(() => $("#list").classList.add("settled"), 900);

/* ============ phone: bottom tab bar ============ */
$("#tabbar").addEventListener("click", e => {
  const b = e.target.closest("[data-tb]"); if (!b) return;
  const k = b.dataset.tb;
  if (k === "add") { if (ui.view === "studies") openStudyForm(); else openEntry(); return; }
  if (k === "studies") { setView("studies"); return; }
  if (k === "me") { e.stopPropagation(); $("#menuBtn").click(); return; }
  if (k !== "me" && ui.view === "studies") setView("labs");
  if (k === "sit") { $(".toolbar").scrollIntoView({ behavior: "smooth", block: "start" }); setTimeout(() => sitPop.hidden && openSitPop(), 250); return; }
  if (k === "history") { $("#historyBlock").scrollIntoView({ behavior: "smooth", block: "start" }); return; }
  scrollTo({ top: 0, behavior: "smooth" });
});

/* ============ installable app ============ */
if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost")) {
  addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}));
}
