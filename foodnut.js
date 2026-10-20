// Nutrients in depth, like Cronometer: vitamins, minerals, fats by kind, essential amino acids, carbohydrates and
// what to keep low — per day or as a 7-day average, against personal norms (NASEM dietary reference intakes by sex
// and age; amino acids WHO/FAO/UNU 2007 per kg; EPA+DHA by EFSA). Values come from USDA (foods-nut.js) for the
// built-in foods, from the label for shop products, and only the main five for one's own products — when some
// eaten food has no data for a nutrient, the sum is marked as incomplete. A row opens what gave it; low ones get
// stomach-friendly suggestions what to eat to make it up.
// Loaded before app.js: definitions only.
"use strict";

// key: [name, unit, decimals, short note]
const FD_NI = {
  kcal: ["Калории", "ккал", 0], prot: ["Белок", "г", 0], fat: ["Жиры", "г", 0], carb: ["Углеводы", "г", 0], fib: ["Клетчатка", "г", 0],
  sugar: ["Сахара", "г", 0, "все сахара, включая фрукты и молочные"], starch: ["Крахмал", "г", 0], alc: ["Алкоголь", "г", 0], caff: ["Кофеин", "мг", 0],
  sat: ["Насыщенные жиры", "г", 1], mono: ["Мононенасыщенные", "г", 1], poly: ["Полиненасыщенные", "г", 1], trans: ["Трансжиры", "г", 1], chol: ["Холестерин", "мг", 0],
  ala: ["Омега-3 ALA", "г", 2, "растительная: лён, орехи, масла"], o3: ["Омега-3 EPA + DHA", "г", 2, "из рыбы и морепродуктов"], epa: ["EPA", "г", 2], dha: ["DHA", "г", 2],
  la: ["Омега-6 линолевая", "г", 1], aa: ["Арахидоновая", "г", 2],
  vA: ["Витамин A", "мкг", 0], vC: ["Витамин C", "мг", 0], vD: ["Витамин D", "мкг", 1, "из еды мало у всех; главное — солнце и анализ 25(OH)D"], vE: ["Витамин E", "мг", 1], vK: ["Витамин K", "мкг", 0],
  b1: ["B1 тиамин", "мг", 2], b2: ["B2 рибофлавин", "мг", 2], b3: ["B3 ниацин", "мг", 1], b5: ["B5 пантотеновая", "мг", 1], b6: ["B6 пиридоксин", "мг", 2],
  b9: ["B9 фолат", "мкг", 0], b12: ["B12 кобаламин", "мкг", 1], chol_: ["Холин", "мг", 0],
  ca: ["Кальций", "мг", 0], fe: ["Железо", "мг", 1], mg: ["Магний", "мг", 0], p: ["Фосфор", "мг", 0], k: ["Калий", "мг", 0], na: ["Натрий", "мг", 0, "≈ соль × 400"],
  zn: ["Цинк", "мг", 1], cu: ["Медь", "мг", 2], mn: ["Марганец", "мг", 2], se: ["Селен", "мкг", 0],
  his: ["Гистидин", "г", 2], ile: ["Изолейцин", "г", 2], leu: ["Лейцин", "г", 2], lys: ["Лизин", "г", 2], metcys: ["Метионин + цистеин", "г", 2],
  phetyr: ["Фенилаланин + тирозин", "г", 2], thr: ["Треонин", "г", 2], trp: ["Триптофан", "г", 2], val: ["Валин", "г", 2],
  lut: ["Лютеин + зеаксантин", "мкг", 0, "для глаз"], lyc: ["Ликопин", "мкг", 0], bcar: ["Бета-каротин", "мкг", 0],
};
const FD_TABS = [
  ["main", "Главное", ["prot", "fib", "vD", "b12", "b9", "fe", "mg", "k", "ca", "o3", "vC", "zn"]],
  ["vit", "Витамины", ["vA", "vC", "vD", "vE", "vK", "b1", "b2", "b3", "b5", "b6", "b9", "b12", "chol_"]],
  ["min", "Минералы", ["ca", "fe", "mg", "p", "k", "na", "zn", "cu", "mn", "se"]],
  ["fats", "Жиры", ["fat", "sat", "mono", "poly", "trans", "chol", "ala", "o3", "epa", "dha", "la", "aa"]],
  ["prot", "Белок", ["prot", "his", "ile", "leu", "lys", "metcys", "phetyr", "thr", "trp", "val"]],
  ["carb", "Углеводы", ["carb", "fib", "sugar", "starch", "lut", "lyc", "bcar"]],
  ["limit", "Ограничить", ["na", "sat", "trans", "sugar", "caff", "alc"]],
];
// long courses of omeprazole-like drugs lower the uptake of these: worth watching and asking the doctor about
const FD_PPI_WATCH = new Set(["b12", "mg", "ca", "fe"]);
const FD_PPI_RE = /омез|омепраз|эзомепраз|рабепраз|пантопраз|лансопраз|нексиум|париет|нольпаз|паноцид|контролок/i;

// the person: sex, age, weight, calorie goal
function fdCtx() {
  const p = typeof profile === "function" ? profile() : {}, g = fdGoal();
  const y = parseInt(String(p.born || ""), 10), age = y > 1900 ? new Date().getFullYear() - y : 35;
  return { f: p.sex === "f", known: !!p.sex, age, kg: g.kg || 70, kcal: g.k };
}
// target t, upper limit ul, or a limit max for what is better kept low
function fdDRI(key, c) {
  const F = c.f, A = c.age;
  switch (key) {
    case "kcal": return { t: c.kcal };
    case "prot": return { t: fdGoal().p || Math.round(0.8 * c.kg) };
    case "fat": return { t: fdGoal().f };
    case "carb": return { t: fdGoal().c };
    case "fib": return { t: fdGoal().fib || (F ? 25 : 38) };
    case "vA": return { t: F ? 700 : 900, ul: 3000 };
    case "vC": return { t: F ? 75 : 90, ul: 2000 };
    case "vD": return { t: A > 70 ? 20 : 15, ul: 100 };
    case "vE": return { t: 15 };
    case "vK": return { t: F ? 90 : 120 };
    case "b1": return { t: F ? 1.1 : 1.2 };
    case "b2": return { t: F ? 1.1 : 1.3 };
    case "b3": return { t: F ? 14 : 16 };
    case "b5": return { t: 5 };
    case "b6": return { t: A > 50 ? (F ? 1.5 : 1.7) : 1.3, ul: 100 };
    case "b9": return { t: 400 };
    case "b12": return { t: 2.4 };
    case "chol_": return { t: F ? 425 : 550, ul: 3500 };
    case "ca": return { t: (F && A > 50) || A > 70 ? 1200 : 1000, ul: A > 50 ? 2000 : 2500 };
    case "fe": return { t: F && A <= 50 ? 18 : 8, ul: 45 };
    case "mg": return { t: F ? (A > 30 ? 320 : 310) : (A > 30 ? 420 : 400) };
    case "p": return { t: 700, ul: 4000 };
    case "k": return { t: F ? 2600 : 3400 };
    case "zn": return { t: F ? 8 : 11, ul: 40 };
    case "cu": return { t: 0.9, ul: 10 };
    case "mn": return { t: F ? 1.8 : 2.3, ul: 11 };
    case "se": return { t: 55, ul: 400 };
    case "ala": return { t: F ? 1.1 : 1.6 };
    case "o3": return { t: 0.25 };
    case "la": return { t: A > 50 ? (F ? 11 : 14) : (F ? 12 : 17) };
    case "his": return { t: 0.010 * c.kg }; case "ile": return { t: 0.020 * c.kg }; case "leu": return { t: 0.039 * c.kg };
    case "lys": return { t: 0.030 * c.kg }; case "metcys": return { t: 0.015 * c.kg }; case "phetyr": return { t: 0.025 * c.kg };
    case "thr": return { t: 0.015 * c.kg }; case "trp": return { t: 0.004 * c.kg }; case "val": return { t: 0.026 * c.kg };
    case "na": return { max: 2300 };
    case "sat": return { max: c.kcal * 0.1 / 9 };
    case "trans": return { max: c.kcal * 0.01 / 9 };
    case "sugar": return { max: c.kcal * 0.1 / 4 };
    case "caff": return { max: 400 };
    default: return {};
  }
}
const FD_NAME = Object.fromEntries(FD_DB.map(r => [r[1], r[0]]));
// amounts of every nutrient in one entry; null — unknown for this food
function fdNutOf(e) {
  const q = e.g / 100, src = e.src && FD_NUT[e.src] ? e.src : FD_NAME[e.n], base = FD_NUT[src];
  const o = {};
  FD_NK.forEach((k, i) => { const v = base ? base[i] : e.nut?.[k]; o[k] = v == null ? null : v * q; });
  // calories and the main four follow the diary, so the numbers agree everywhere
  ["kcal", "prot", "fat", "carb", "fib"].forEach((k, i) => { o[k] = (e.per[i] || 0) * q; });
  const add = (...ks) => ks.some(k => o[k] != null) ? ks.reduce((s, k) => s + (o[k] || 0), 0) : null;
  o.o3 = add("epa", "dpa", "dha"); o.metcys = add("met", "cys"); o.phetyr = add("phe", "tyr");
  return o;
}
// totals over days (average per recorded day); coverage — the share of calories with known data for each nutrient
function fdNutSum(days) {
  const v = {}, miss = {}, by = {}; let kcal = 0, n = 0;
  for (const d of days) {
    const food = state.days?.[d]?.food || []; if (!food.length) continue; n++;
    for (const e of food) {
      const o = fdNutOf(e); kcal += o.kcal;
      for (const k in FD_NI) {
        if (o[k] == null) { miss[k] = (miss[k] || 0) + o.kcal; continue; }
        v[k] = (v[k] || 0) + o[k];
        (by[k] ||= []).push([e.n, o[k], e]);
      }
    }
  }
  const out = { n, v: {}, cov: {}, by };
  for (const k in FD_NI) { out.v[k] = n ? (v[k] || 0) / n : 0; out.cov[k] = kcal ? 1 - (miss[k] || 0) / kcal : 1; }
  return out;
}
const fdFmt = (v, k) => { const dp = FD_NI[k]?.[2] ?? 0; return (Math.round(v * 10 ** dp) / 10 ** dp).toLocaleString("ru-RU", { maximumFractionDigits: dp }); };
function fdOnPPI() { return tpList().some(p => tpActive(p) && (p.drugs || []).some(g => FD_PPI_RE.test(g.name || ""))); }
// a nutrient row: amount against the norm, a bar coloured by how far it is
function fdNutRow(k, S, c, open) {
  const [name, unit, , note] = FD_NI[k], r = fdDRI(k, c), v = S.v[k], cov = S.cov[k];
  const lim = r.max != null, goal = lim ? r.max : r.t;
  const pct = goal ? Math.round(v / goal * 100) : null;
  const st = lim ? (pct > 100 ? "over" : "ok") : r.ul && v > r.ul ? "over" : pct == null ? "" : pct >= 100 ? "ok" : pct >= 50 ? "mid" : "low";
  const ppi = FD_PPI_WATCH.has(k) && fdOnPPI();
  return `<div class="fd-nwrap${open ? " open" : ""}"><button type="button" class="fd-nrow ${st}" data-fd-nut="${k}" aria-expanded="${open}">
      <span class="fd-nn"${note ? ` title="${esc(note)}"` : ""}>${esc(name)}${ppi ? ` <i class="fd-ppi" title="При долгом приёме омепразола и похожих препаратов это усваивается хуже — стоит следить и спросить врача про анализ">омез</i>` : ""}</span>
      <span class="fd-nv">${cov < 0.9 ? `<em title="Для части съеденного нет данных по этому веществу — реальное число больше">≈</em>` : ""}${fdFmt(v, k)}${goal ? `<small> / ${lim ? "до " : ""}${fdFmt(goal, k)} ${unit}</small>` : ` <small>${unit}</small>`}</span>
      <span class="fd-nb"><i style="width:${Math.min(100, pct || 0)}%"></i></span>
      <b class="fd-np">${pct != null ? pct + "%" : ""}</b></button>
    ${open ? fdNutBy(k, S) : ""}</div>`;
}
// what gave the nutrient, and for a low one what would add it without bothering the stomach
function fdNutBy(k, S) {
  const unit = FD_NI[k][1], list = (S.by[k] || []).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]).slice(0, 6), tot = list.reduce((s, x) => s + x[1], 0) || 1;
  const r = fdDRI(k, fdCtx()), low = r.t && S.v[k] < r.t;
  const idx = FD_NK.indexOf(k), soft = /fat|acid|spicy|coffee|alc|choc|fizzy/;
  const tips = low && idx >= 0 ? FD_DB.filter(x => FD_NUT[x[0]] && FD_NUT[x[0]][idx] && !soft.test(x[10]))
    .map(x => [x, FD_NUT[x[0]][idx] * x[8] / 100]).sort((a, b) => b[1] - a[1]).slice(0, 5) : [];
  return `<div class="fd-nby">
    ${list.length ? `<div class="fd-nbl"><span class="fd-ql">Откуда</span>${list.map(([n, v]) => `<div class="fd-nbi"><span>${esc(n)}</span><b>${fdFmt(v, k)} ${unit}</b><i style="width:${Math.round(v / tot * 100)}%"></i></div>`).join("")}</div>` : ``}
    ${tips.length ? `<div class="fd-nbl"><span class="fd-ql" title="Только то, что обычно не раздражает желудок">Чем добрать</span><div class="tchips">${tips.map(([x, v]) => `<button type="button" class="tchip" data-fd-tip="${esc(x[0])}">${esc(x[1])}<small>${esc(x[9])} · ${fdFmt(v, k)} ${unit}</small></button>`).join("")}</div></div>` : ""}
  </div>`;
}
function fdNutCard(d) {
  const range = ui.fdRange || 1, tab = ui.fdNutTab || "main", c = fdCtx();
  const days = range === 1 ? [d] : Array.from({ length: 7 }, (_, i) => addDaysISO(d, i - 6));
  const S = fdNutSum(days);
  const keys = FD_TABS.find(([t]) => t === tab)[2];
  const low = FD_TABS[0][2].filter(k => { const r = fdDRI(k, c); return r.t && S.v[k] < r.t * 0.5; });
  return `<section class="card cl-box t-food fd-nut" id="fdNut" data-key="nut">
    <div class="cl-bh"><span class="cl-bi t-food" title="Данные USDA FoodData Central, нормы NASEM, ВОЗ и EFSA. Йода в базе нет.">${clSvg('<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>')}</span><div class="cl-bt"><h4>Нутриенты</h4>
      <small>${range === 1 ? "за день" : `среднее за ${S.n} ${plural(S.n, "день", "дня", "дней")}`}${c.known ? "" : " · укажи пол и год рождения в «Данные»"}</small></div>
      <div class="cl-br">${clSeg("data-fd-range", [[1, "День"], [7, "7 дней"]], range, "fd-range")}</div></div>
    <div class="fd-ntabs" role="tablist">${FD_TABS.map(([t, n]) => `<button type="button" role="tab" data-fd-ntab="${t}" aria-selected="${t === tab}">${n}</button>`).join("")}</div>
    <div class="fd-nlist">${keys.map(k => fdNutRow(k, S, c, ui.fdNut === k)).join("")}</div>
  </section>`;
}
// the side summary: how many of the key nutrients are covered, a tap scrolls to the full card
function fdNutMini(d) {
  const S = fdNutSum([d]), c = fdCtx(), keys = FD_TABS[0][2];
  const pct = k => { const r = fdDRI(k, c); return r.t ? Math.round(S.v[k] / r.t * 100) : 0; };
  const ok = keys.filter(k => pct(k) >= 100).length;
  return `<section class="card cl-side-card"><h4>Витамины и минералы</h4>
    <div class="cl-stat"><span>Главных в норме</span><b>${ok} из ${keys.length}</b></div>
    <div class="fd-mini">${keys.map(k => `<span class="fd-mi ${pct(k) >= 100 ? "ok" : pct(k) >= 50 ? "mid" : "low"}" title="${esc(FD_NI[k][0])}: ${pct(k)}%"><i><b style="height:${Math.min(100, pct(k))}%"></b></i><small>${esc(FD_NI[k][0].replace(/^(Витамин |Омега-3 )/, "").split(" ")[0].slice(0, 6))}</small></span>`).join("")}</div>
    <button type="button" class="cl-link" data-fd-nutgo>Все нутриенты →</button></section>`;
}
// the full make-up of one eaten item
function openFoodComp(d, id) {
  const e = fdEntry(d, id); if (!e) return;
  const o = fdNutOf(e), c = fdCtx();
  const row = k => { const r = fdDRI(k, c), goal = r.max ?? r.t; return o[k] == null ? "" : `<div class="cl-stat"><span>${esc(FD_NI[k][0])}</span><b>${fdFmt(o[k], k)} ${FD_NI[k][1]}${goal ? ` <small class="cl-muted">${Math.round(o[k] / goal * 100)}%</small>` : ""}</b></div>`; };
  openX(`<div class="dlg-head"><h3>${esc(e.n)} · ${fdAmt(e)}</h3><button type="button" class="icon-btn" data-xclose aria-label="Закрыть">×</button></div>
    <div class="fd-comp">${FD_TABS.slice(1).map(([, n, ks]) => { const rows = ks.map(row).join(""); return rows ? `<section><h4 class="cl-dh4">${n}</h4>${rows}</section>` : ""; }).join("")}</div>`, "st-dlg tp-dlg cl-dlg fd-dlg");
}
