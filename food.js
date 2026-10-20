// Food: a diary like Cronometer, made quick. One search line understands "гречка 200", "яйцо 2" or "2 банана";
// frequent foods and saved sets are one tap; meals go by the time of day. A day shows calories, protein, fat,
// carbs, fibre and water against goals, and what in the food tends to bother the stomach. Those marks (fatty,
// sour, coffee, a big meal, the last meal before bed) tick the day's factors in the calendar by themselves,
// so the links and checks learn from what was really eaten. Entries live in the day record (synced with it),
// own products and sets in prefs. Packaged products can be looked up in Open Food Facts.
// Loaded before app.js: definitions only; initFood() wires the UI.
"use strict";

const FD_MEALS = [["b", "Завтрак"], ["l", "Обед"], ["d", "Ужин"], ["s", "Перекус"]];
const FD_MEAL_T = { b: "08:00", l: "13:00", d: "19:00", s: "16:00" };
const FD_TAG = { fat: "жирное", acid: "кислое", spicy: "острое", coffee: "кофеин", choc: "шоколад", mint: "мята", fizzy: "газ", alc: "алкоголь" };
// one meal this big presses on the stomach: "Много поел"
const FD_BIG = 900;
const FD_GOAL = { k: 2000, p: 90, f: 70, c: 250, fib: 30, w: 1500, kg: 70 };
const FD_ICON = {
  food: clSvg('<path d="M7 3v8M5 3v5a2 2 0 0 0 4 0V3M7 11v10M17 21V3c-2 1.5-3 4-3 7v3h3"/>'),
  b: CL_ICON.morning, l: CL_ICON.day, d: CL_ICON.evening, s: clSvg('<path d="M12 7c-3-3-8-1-8 4s4 9 8 9 8-4 8-9-5-7-8-4z"/><path d="M12 7c0-2 1-3.5 3-4"/>'),
};

const fdNorm = t => String(t || "").toLowerCase().replace(/ё/g, "е");
const fdK = v => Math.round(v || 0);
const fdSel = () => ui.fdDay && ui.fdDay <= todayISO() ? ui.fdDay : todayISO();
const fdNowMeal = () => { const h = new Date().getHours(); return h < 11 ? "b" : h < 16 ? "l" : h < 21 ? "d" : "s"; };
const fdMealCur = () => ui.fdMeal || fdNowMeal();
const fdLiquid = e => /стакан|чашк|банк|бокал|рюмк|бутыл/.test(e.pl || "");
const fdUnit = e => fdLiquid(e) ? "мл" : "г";
const fdAmt = e => `${Math.round(e.g)} ${fdUnit(e)}`;
const fdStep = e => e.pg && e.pg <= 80 ? e.pg : 10;
const fdTags = tags => (tags || "").split(" ").filter(t => FD_TAG[t]).map(t => `<i class="fd-tag t-${t}">${FD_TAG[t]}</i>`).join("");
// [kcal, protein, fat, carbs, fibre, water ml]
function fdSum(list) {
  const s = [0, 0, 0, 0, 0, 0];
  for (const e of list || []) { const q = e.g / 100; e.per.forEach((v, i) => { s[i] += v * q; }); if ((e.tags || "").includes("water")) s[5] += e.g; }
  return s;
}
const fdGoal = () => ({ ...FD_GOAL, ...(state.prefs?.foodGoal || {}) });

/* ---------- search ---------- */
function fdCatalog() {
  const my = (state.prefs?.myFoods || []).map(f => ({ src: "my:" + f.id, n: f.n, per: f.per, pg: f.pg || 100, pl: f.pl || "порция", tags: f.tags || "", nut: f.nut, my: true, s: fdNorm(f.n) }));
  return [...my, ...FD_DB.map(r => ({ src: r[0], n: r[1], per: [r[3], r[4], r[5], r[6], r[7]], pg: r[8], pl: r[9], tags: r[10], s: fdNorm(`${r[1]} ${r[2]}`) }))];
}
// "гречка 200", "кофе 300 мл", "яйцо 2", "2 банана"
function fdParse(q) {
  let t = fdNorm(q).trim(), amt = null, unit = "";
  let m = t.match(/^(.*?\D)\s*(\d+(?:[.,]\d+)?)\s*(г|гр|грамм\S*|мл|шт\S*|порц\S*)?\.?$/);
  if (m && m[1].trim()) { t = m[1].trim(); amt = parseFloat(m[2].replace(",", ".")); unit = m[3] || ""; }
  else if ((m = t.match(/^(\d+(?:[.,]\d+)?)\s*(г|гр|мл|шт\S*)?\s+(.+)$/))) { amt = parseFloat(m[1].replace(",", ".")); unit = m[2] || ""; t = m[3].trim(); }
  return { t, amt, unit };
}
// grams for a typed amount: grams and ml as they are, small bare numbers are pieces or portions
function fdGrams(f, amt, unit) {
  if (amt == null) return f.pg;
  if (/^(г|гр|грамм|мл)/.test(unit)) return amt;
  if (/^(шт|порц)/.test(unit) || amt <= 12) return Math.round(amt * f.pg);
  return amt;
}
// how often each food was eaten in the last month, with its latest entry
function fdFreq(days = 30) {
  const out = {}, today = todayISO();
  for (let i = 0; i < days; i++) for (const e of state.days?.[addDaysISO(today, -i)]?.food || []) (out[e.n] ||= { n: 0, e }).n++;
  return out;
}
function fdSearch(q) {
  const { t, amt, unit } = fdParse(q); if (!t) return [];
  const words = t.split(/\s+/).filter(Boolean), freq = fdFreq();
  // Russian endings vary ("котлеты", "банана"): a long word also matches by its stem
  const stem = w => w.length > 4 ? w.slice(0, Math.max(4, w.length - 2)) : w;
  const hits = fdCatalog().filter(f => words.every(w => f.s.includes(w) || f.s.includes(stem(w))));
  const starts = f => f.s.startsWith(words[0]) ? 0 : 1;
  hits.sort((a, b) => (freq[b.n]?.n || 0) - (freq[a.n]?.n || 0) || starts(a) - starts(b) || (b.my ? 1 : 0) - (a.my ? 1 : 0) || a.n.length - b.n.length);
  return hits.slice(0, 8).map(f => ({ f, g: fdGrams(f, amt, unit) }));
}
function fdHitsHtml(hits) {
  return hits.map((h, i) => `<button type="button" class="fd-hit${i === (ui.fdIdx || 0) ? " on" : ""}" data-fd-hit="${i}">
      <span class="fd-hn"><b>${esc(h.f.n)}</b>${fdTags(h.f.tags)}</span>
      <span class="fd-hv">${Math.round(h.g)} ${fdUnit(h.f)} · <b>${fdK(h.f.per[0] * h.g / 100)}</b> ккал</span></button>`).join("");
}
function fdShowRes(inp) {
  const box = inp.parentElement.querySelector(".fd-res"), q = inp.value.trim();
  ui.fdIdx = 0;
  if (!q) { box.hidden = true; box.innerHTML = ""; ui.fdHits = []; return; }
  ui.fdHits = fdSearch(q);
  box.innerHTML = `${ui.fdHits.length ? fdHitsHtml(ui.fdHits) : `<p class="fd-none">В моей базе такого нет.</p>`}
    <div class="fd-rfoot">${navigator.onLine !== false ? `<button type="button" class="cl-link" data-fd-net>Найти «${esc(fdParse(q).t)}» в базе магазинных продуктов</button>` : ""}<button type="button" class="cl-link" data-fd-own>+ Свой продукт</button></div>`;
  box.hidden = false;
}
// packaged products: Open Food Facts, values per 100 g; an added one is kept as one's own product
async function fdNet(inp) {
  const box = inp.parentElement.querySelector(".fd-res"), { t, amt, unit } = fdParse(inp.value);
  const foot = $(".fd-rfoot", box); if (foot) foot.innerHTML = `<span class="cl-muted">Ищу в базе…</span>`;
  try {
    const url = `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(t)}&search_simple=1&action=process&json=1&page_size=15&fields=code,product_name,product_name_ru,product_name_uk,brands,nutriments,serving_quantity`;
    const j = await (await fetch(url)).json();
    const list = (j.products || []).map(p => {
      const n = p.nutriments || {}, k = n["energy-kcal_100g"] ?? (n.energy_100g ? n.energy_100g / 4.184 : null);
      const name = (p.product_name_ru || p.product_name_uk || p.product_name || "").trim();
      if (!name || k == null) return null;
      const fat = +n.fat_100g || 0, nut = {};
      for (const [k, key, mul] of [["saturated-fat", "sat", 1], ["trans-fat", "trans", 1], ["sugars", "sugar", 1], ["cholesterol", "chol", 1e3], ["sodium", "na", 1e3], ["calcium", "ca", 1e3], ["iron", "fe", 1e3], ["magnesium", "mg", 1e3], ["potassium", "k", 1e3], ["zinc", "zn", 1e3], ["phosphorus", "p", 1e3], ["vitamin-c", "vC", 1e3], ["vitamin-d", "vD", 1e6], ["vitamin-a", "vA", 1e6], ["vitamin-b12", "b12", 1e6], ["vitamin-b6", "b6", 1e3], ["vitamin-b1", "b1", 1e3], ["vitamin-b2", "b2", 1e3], ["vitamin-e", "vE", 1e3], ["folates", "b9", 1e6], ["caffeine", "caff", 1e3], ["alcohol", "alc", 0.789]]) {
        const v = n[`${k}_100g`]; if (v !== undefined && v !== "" && !isNaN(+v)) nut[key] = Math.round(+v * mul * 1000) / 1000;
      }
      return { src: "off:" + p.code, n: `${name}${p.brands ? ` (${p.brands.split(",")[0].trim()})` : ""}`, per: [+k || 0, +n.proteins_100g || 0, fat, +n.carbohydrates_100g || 0, +n.fiber_100g || 0].map(v => Math.round(v * 10) / 10), pg: +p.serving_quantity || 100, pl: "порция", tags: fat >= 15 ? "fat" : "", off: true, nut };
    }).filter(Boolean).slice(0, 8);
    ui.fdHits = list.map(f => ({ f, g: fdGrams(f, amt, unit) })); ui.fdIdx = 0;
    box.innerHTML = `${list.length ? fdHitsHtml(ui.fdHits) : `<p class="fd-none">В базе магазинных продуктов тоже не нашлось.</p>`}<div class="fd-rfoot"><button type="button" class="cl-link" data-fd-own>+ Свой продукт</button></div>`;
  } catch (e) {
    if (foot) foot.innerHTML = `<span class="cl-muted">Не получилось связаться с базой.</span><button type="button" class="cl-link" data-fd-own>+ Свой продукт</button>`;
  }
}

/* ---------- day records ---------- */
// a meal keeps one time; a new one gets "now" if it is the meal of this hour, otherwise its usual time
const fdTimeFor = (d, m) => (state.days?.[d]?.food || []).find(e => e.m === m)?.t || (d === todayISO() && m === fdNowMeal() ? clHM() : FD_MEAL_T[m]);
function fdAdd(d, f, g, m = fdMealCur()) {
  const x = dyDay(d);
  x.food = [...(x.food || []), { id: newId("e"), n: f.n, g: Math.round(g), per: f.per.map(v => Math.round(v * 10) / 10), tags: f.tags || "", pl: f.pl || "", pg: f.pg || 100, m, t: fdTimeFor(d, m), ...(f.src ? { src: f.src } : {}), ...(f.nut ? { nut: f.nut } : {}) }];
  if (f.off && !(state.prefs?.myFoods || []).some(y => y.n === f.n)) {
    state.prefs ||= {}; state.prefs.myFoods = [...(state.prefs.myFoods || []), { id: newId("m"), n: f.n, per: f.per, pg: f.pg, pl: f.pl, tags: f.tags, ...(f.nut ? { nut: f.nut } : {}) }];
  }
  fdSync(d);
}
const fdEntry = (d, id) => (state.days?.[d]?.food || []).find(e => e.id === id);
// the day's factors follow the food: fatty, sour, coffee, flax in the morning, a big meal, the last meal before bed.
// A factor the person ticked or unticked by hand is left alone.
function fdSync(d) {
  const x = dyDay(d), food = x.food || [];
  if (!food.length) delete x.food;
  const ts = food.map(e => e.t).filter(Boolean).sort();
  if (ts.length) { x.meal = ts[ts.length - 1]; x.mealFd = 1; } else if (x.mealFd) { delete x.meal; delete x.mealFd; }
  const has = t => food.some(e => (e.tags || "").split(" ").includes(t));
  const auto = {
    fatty: has("fat"), acid: has("acid") || has("spicy"), coffee: has("coffee"),
    flax: food.some(e => (e.tags || "").includes("flax") && (e.t || "") < "12:00"),
    big: FD_MEALS.some(([k]) => fdSum(food.filter(e => e.m === k))[0] >= FD_BIG),
  };
  const gap = clMealGap(d); if (gap != null) auto.late = gap < 180;
  for (const [k, v] of Object.entries(auto)) {
    if (x.fm?.[k]) continue;
    if (v) { x.f = { ...(x.f || {}), [k]: true }; (x.fa ||= {})[k] = 1; }
    else if (x.fa?.[k]) { x.f = { ...(x.f || {}), [k]: false }; delete x.fa[k]; }
  }
  if (x.fa && !Object.keys(x.fa).length) delete x.fa;
  dyTidy(d); save();
  renderFood(); renderCalendar();
}

/* ---------- page ---------- */
function fdAddBox(d, compact) {
  const cur = fdMealCur(), sets = state.prefs?.foodSets || [];
  const freq = Object.values(fdFreq()).sort((a, b) => b.n - a.n).slice(0, compact ? 6 : 12);
  return `<div class="fd-add${compact ? " compact" : ""}">
    <div class="seg2 fd-meals" role="group" aria-label="Приём пищи">${FD_MEALS.map(([k, n]) => `<button type="button" data-fd-meal="${k}" aria-pressed="${cur === k}">${n}</button>`).join("")}</div>
    <div class="fd-search"><svg class="fd-sico" width="20" height="20" viewBox="0 0 20 20" aria-hidden="true"><circle cx="9" cy="9" r="6" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M13.5 13.5L17 17" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>
      <input class="input" data-fd-q data-fd-day="${d}" placeholder="Что съел? Например: гречка 200, яйцо 2, кофе" autocomplete="off" enterkeyhint="done" aria-label="Что съел">
      <div class="fd-res" hidden></div></div>
    ${sets.length ? `<div class="fd-quick"><span class="fd-ql">Наборы</span><div class="tchips">${sets.map(s => `<button type="button" class="tchip fd-set" data-fd-set="${esc(s.id)}">${esc(s.name)}<small>${fdK(fdSum(s.items)[0])} ккал</small></button>`).join("")}</div></div>` : ""}
    ${freq.length ? `<div class="fd-quick"><span class="fd-ql">Часто</span><div class="tchips">${freq.map(r => `<button type="button" class="tchip" data-fd-again="${esc(r.e.n)}">${esc(r.e.n)}<small>${fdAmt(r.e)}</small></button>`).join("")}</div></div>` : ""}
  </div>`;
}
function fdItem(e) {
  const open = ui.fdEdit === e.id;
  return `<div class="fd-item${open ? " open" : ""}" data-key="${esc(e.id)}">
    <button type="button" class="fd-irow" data-fd-edit="${esc(e.id)}"><span class="fd-in">${esc(e.n)}${fdTags(e.tags)}</span><span class="fd-ig">${fdAmt(e)}</span><b class="fd-ik">${fdK(e.per[0] * e.g / 100)}</b></button>
    ${open ? `<div class="fd-ied">
      <button type="button" class="icon-btn" data-fd-step="${esc(e.id)}|-1" aria-label="Меньше">−</button>
      <label class="fd-gl"><input class="input" type="number" inputmode="decimal" min="0" data-fd-g="${esc(e.id)}" value="${Math.round(e.g)}"><span>${fdUnit(e)}</span></label>
      <button type="button" class="icon-btn" data-fd-step="${esc(e.id)}|1" aria-label="Больше">+</button>
      <span class="cl-muted cl-small">Б ${fdK(e.per[1] * e.g / 100)} · Ж ${fdK(e.per[2] * e.g / 100)} · У ${fdK(e.per[3] * e.g / 100)}</span>
      <span class="fd-sp"></span>
      <select class="input fd-move" data-fd-move="${esc(e.id)}" aria-label="Приём пищи">${FD_MEALS.map(([k, n]) => `<option value="${k}"${e.m === k ? " selected" : ""}>${n}</option>`).join("")}</select>
      <button type="button" class="btn sm" data-fd-comp="${esc(e.id)}">Состав</button><button type="button" class="btn sm ghost" data-fd-del="${esc(e.id)}">Удалить</button></div>` : ""}
  </div>`;
}
function fdMealCard(k, n, list) {
  const s = fdSum(list);
  return `<section class="card cl-box t-food fd-meal" data-key="meal-${k}">
    <div class="cl-bh"><span class="cl-bi t-food">${FD_ICON[k]}</span><div class="cl-bt"><h4>${n}</h4><small>Б ${fdK(s[1])} · Ж ${fdK(s[2])} · У ${fdK(s[3])}${s[0] >= FD_BIG ? ` · <span class="fd-warn">большая порция</span>` : ""}</small></div>
      <div class="cl-br fd-mr"><b class="cl-big2">${fdK(s[0])}<small> ккал</small></b><input class="input fd-time" type="time" data-fd-mtime="${k}" value="${esc(list[0]?.t || "")}" aria-label="Во сколько"></div></div>
    <div class="fd-items">${list.map(fdItem).join("")}</div>
    <div class="fd-mfoot"><button type="button" class="cl-link" data-fd-addto="${k}">+ Добавить в ${n.toLowerCase()}</button><button type="button" class="cl-link fd-quiet" data-fd-save="${k}">Сохранить как набор</button></div>
  </section>`;
}
function fdRing(v, goal) {
  const C = 188.5, p = Math.min(1, goal ? v / goal : 0);
  return `<span class="cl-ring fd-ring${v > goal * 1.1 ? " over" : ""}"><svg width="72" height="72" viewBox="0 0 72 72" aria-hidden="true"><circle cx="36" cy="36" r="30" class="tr"/><circle cx="36" cy="36" r="30" class="fg" style="stroke-dasharray: ${(C * p).toFixed(1)} ${C}; opacity: ${p ? 1 : 0}"/></svg><b>${Math.round(p * 100)}%</b></span>`;
}
function fdTotals(d) {
  const s = fdSum(state.days?.[d]?.food), g = fdGoal();
  const bar = (name, v, goal, unit, cls) => `<div class="fd-bar ${cls}"><div class="fd-bl"><span>${name}</span><b>${fdK(v)}<small> / ${goal} ${unit}</small></b></div><span class="cl-bar"><i style="width:${Math.min(100, Math.round(v / goal * 100))}%"></i></span></div>`;
  return `<section class="card cl-side-card fd-tot"><h4>За день</h4>
    <div class="fd-kcal">${fdRing(s[0], g.k)}<div><b>${fdK(s[0])}</b><span>из ${g.k} ккал</span></div></div>
    ${bar("Белки", s[1], g.p, "г", "b-p")}${bar("Жиры", s[2], g.f, "г", "b-f")}${bar("Углеводы", s[3], g.c, "г", "b-c")}${bar("Клетчатка", s[4], g.fib, "г", "b-fib")}${bar("Вода", s[5], g.w, "мл", "b-w")}
    <button type="button" class="cl-link" data-fd-goal>Изменить цели</button></section>`;
}
function fdStomach(d) {
  const x = state.days?.[d] || {}, food = x.food || []; if (!food.length) return "";
  const by = {};
  food.forEach(e => (e.tags || "").split(" ").filter(t => FD_TAG[t]).forEach(t => { (by[t] ||= new Set()).add(e.n); }));
  const big = FD_MEALS.map(([k, n]) => [n, fdSum(food.filter(e => e.m === k))[0]]).filter(([, v]) => v >= FD_BIG), gap = clMealGap(d);
  const rows = [
    ...Object.entries(by).map(([t, l]) => `<div class="fd-srow"><i class="fd-tag t-${t}">${FD_TAG[t]}</i><span>${esc([...l].join(", "))}</span></div>`),
    ...big.map(([n, v]) => `<div class="fd-srow"><i class="fd-tag t-big">много</i><span>${n}: ${fdK(v)} ккал за раз</span></div>`),
    x.meal ? `<div class="fd-srow"><i class="fd-tag ${gap != null && gap < 180 ? "t-late" : "t-ok"}">${x.meal}</i><span>последняя еда${gap != null ? ` · за ${clHours(gap)} до сна` : ""}</span></div>` : "",
  ].filter(Boolean);
  return `<section class="card cl-side-card"><h4>Для желудка</h4>
    ${rows.length > 1 || Object.keys(by).length || big.length ? rows.join("") : `<p class="cl-muted">Частых раздражителей нет ✓</p>${rows.join("")}`}
    <p class="cl-small cl-muted">Это само отмечается в «Что было» в календаре — для связей и проверок.</p></section>`;
}
function fdWeek(d) {
  const days = Array.from({ length: 7 }, (_, i) => addDaysISO(d, i - 6)), v = days.map(x => fdSum(state.days?.[x]?.food)[0]), g = fdGoal().k;
  if (v.filter(Boolean).length < 2) return "";
  const max = Math.max(...v, g);
  return `<section class="card cl-side-card"><h4>Неделя</h4>
    <div class="fd-week">${days.map((x, i) => `<button type="button" class="fd-wd${x === d ? " on" : ""}" data-fd-day="${x}" title="${fdK(v[i])} ккал"><span class="fd-wb"><i style="height:${Math.round(v[i] / max * 100)}%"></i><em style="bottom:${Math.round(g / max * 100)}%"></em></span><small>${CL_WD[(new Date(x + "T00:00:00").getDay() + 6) % 7]}</small></button>`).join("")}</div>
    <p class="cl-small cl-muted">В среднем ${fdK(v.filter(Boolean).reduce((a, b) => a + b, 0) / v.filter(Boolean).length)} ккал в записанные дни.</p></section>`;
}
function fdSetsCard() {
  const sets = state.prefs?.foodSets || [];
  return `<section class="card cl-side-card"><h4>Наборы</h4>
    ${sets.length ? sets.map(s => `<div class="fd-setrow"><span><b>${esc(s.name)}</b><small>${esc(s.items.map(e => e.n).join(", "))} · ${fdK(fdSum(s.items)[0])} ккал</small></span><button type="button" class="icon-btn sm" data-fd-setdel="${esc(s.id)}" aria-label="Удалить набор">×</button></div>`).join("")
      : `<p class="cl-muted">Набор — это приём пищи, который часто повторяется: «Мой завтрак», «Перекус на работе». Сохрани любой приём кнопкой «Сохранить как набор» — потом он добавляется одним нажатием.</p>`}
    <button type="button" class="cl-link" data-fd-own>+ Свой продукт</button></section>`;
}
function renderFood() {
  const box = $("#foodView"); if (!box || box.hidden) return;
  const d = fdSel(), today = todayISO(), food = state.days?.[d]?.food || [];
  const date = `${dyCap(DY_WEEKDAY[new Date(d + "T00:00:00").getDay()])}, ${longDate(d).replace(/ \d{4}$/, "")}`;
  morph(box, `<div class="cl-top"><div><p class="cl-date">${esc(date)}</p><h2 class="cl-big">Еда</h2></div>
      <div class="cl-topr"><div class="fd-daynav"><button type="button" class="icon-btn" data-fd-go="-1" aria-label="Предыдущий день">‹</button><b>${esc(clDayName(d))}</b>
        <button type="button" class="icon-btn" data-fd-go="1" aria-label="Следующий день"${d >= today ? " disabled" : ""}>›</button></div></div></div>
    <div class="cl-layout">
      <div class="cl-main">
        <section class="card cl-box t-food fd-addcard">${fdAddBox(d)}</section>
        ${FD_MEALS.map(([k, n]) => { const l = food.filter(e => e.m === k); return l.length ? fdMealCard(k, n, l) : ""; }).join("")}
        ${typeof fdNutCard === "function" ? fdNutCard(d) : ""}
        ${food.length ? "" : `<div class="fd-empty"><b>Пока ничего не записано</b><p>Пиши как говоришь: «гречка 200», «яйцо 2», «кофе». Enter — добавить. Часто съедаемое потом появится кнопками, а повторяющийся завтрак можно сохранить набором.</p></div>`}
      </div>
      <aside class="cl-side">${fdTotals(d)}${typeof fdNutMini === "function" ? fdNutMini(d) : ""}${fdStomach(d)}${fdWeek(d)}${fdSetsCard()}</aside>
    </div>`);
}
// the calendar's food card: what was eaten in one line per meal and the same quick line
function fdDayCard(d) {
  const x = state.days?.[d] || {}, food = x.food || [], s = fdSum(food);
  const lines = FD_MEALS.map(([k, n]) => { const l = food.filter(e => e.m === k); return l.length ? `<div class="fd-line"><b>${n}</b><span>${esc(l.map(e => e.n).join(", "))}</span><em>${fdK(fdSum(l)[0])} ккал</em></div>` : ""; }).join("");
  return `<section class="card cl-box t-food">${clHead("t-food", FD_ICON.food, "Еда", food.length ? `${fdK(s[0])} ккал${x.meal ? ` · последняя в ${x.meal}` : ""}` : "что ел за день", `<button type="button" class="btn sm" data-fd-open="${d}">Дневник еды →</button>`)}
    ${lines ? `<div class="fd-lines">${lines}</div>` : ""}
    ${fdAddBox(d, true)}</section>`;
}

/* ---------- dialogs ---------- */
function openFoodOwn(name = "") {
  const tag = Object.entries(FD_TAG).map(([k, n]) => `<button type="button" class="tchip" data-fdo-tag="${k}" aria-pressed="false">${n}</button>`).join("");
  const num = (n, label, v = "") => `<label class="fd-num"><span>${label}</span><input class="input" type="number" inputmode="decimal" min="0" step="0.1" name="${n}" value="${v}"></label>`;
  openX(`<div class="dlg-head"><h3>Свой продукт</h3><button type="button" class="icon-btn" data-xclose aria-label="Закрыть">×</button></div>
    <form class="fd-form" data-fd-ownf>
      <label class="fd-num wide"><span>Название</span><input class="input" name="n" value="${esc(name)}" placeholder="Например: сырок «Галактика»" required autocomplete="off"></label>
      <p class="cl-muted cl-small">На 100 г — смотри на упаковке. Пустое поле считается нулём.</p>
      <div class="fd-nums">${num("k", "Калории")}${num("p", "Белки, г")}${num("f", "Жиры, г")}${num("c", "Углеводы, г")}${num("fib", "Клетчатка, г")}</div>
      <div class="fd-nums">${num("pg", "Обычная порция, г", 100)}<label class="fd-num"><span>Как называется порция</span><input class="input" name="pl" value="порция" autocomplete="off"></label></div>
      <h4 class="cl-dh4">Может раздражать желудок</h4><div class="tchips">${tag}</div>
      <div class="dlg-foot"><span style="flex:1"></span><button type="submit" class="btn primary">Сохранить и добавить</button></div>
    </form>`, "st-dlg tp-dlg cl-dlg fd-dlg");
}
function openFoodGoal() {
  const g = fdGoal(), num = (n, label) => `<label class="fd-num"><span>${label}</span><input class="input" type="number" inputmode="numeric" min="0" name="${n}" value="${g[n]}"></label>`;
  openX(`<div class="dlg-head"><h3>Цели на день</h3><button type="button" class="icon-btn" data-xclose aria-label="Закрыть">×</button></div>
    <form class="fd-form" data-fd-goalf>
      <p class="cl-muted">Ориентиры для полосок. Точные цифры под тебя лучше обсудить с врачом или диетологом.</p>
      <div class="fd-nums">${num("k", "Калории")}${num("p", "Белки, г")}${num("f", "Жиры, г")}${num("c", "Углеводы, г")}${num("fib", "Клетчатка, г")}${num("w", "Вода, мл")}${num("kg", "Мой вес, кг")}</div>
      <p class="cl-muted cl-small">Вес нужен для норм белка и аминокислот (0,8 г белка на кг — минимум для взрослого).</p>
      <div class="dlg-foot"><span style="flex:1"></span><button type="submit" class="btn primary">Сохранить</button></div>
    </form>`, "st-dlg tp-dlg cl-dlg fd-dlg");
}

/* ---------- wiring ---------- */
function initFood() {
  const dayOf = el => el?.closest(".fd-add")?.querySelector("[data-fd-q]")?.dataset.fdDay || fdSel();
  const addHit = (inp, i) => {
    const h = ui.fdHits?.[i]; if (!h) return;
    fdAdd(inp.dataset.fdDay, h.f, h.g);
    toast(`Добавлено: ${h.f.n}, ${Math.round(h.g)} ${fdUnit(h.f)}`);
    const again = $(`[data-fd-q][data-fd-day="${inp.dataset.fdDay}"]`, inp.closest(".view, #foodView, #calendarView") || document) || inp;
    again.value = ""; fdShowRes(again); again.focus();
  };
  document.addEventListener("input", e => { if (e.target.matches("[data-fd-q]")) fdShowRes(e.target); });
  document.addEventListener("keydown", e => {
    const inp = e.target; if (!inp.matches?.("[data-fd-q]")) return;
    const box = inp.parentElement.querySelector(".fd-res"), n = ui.fdHits?.length || 0;
    if (e.key === "Enter") { e.preventDefault(); if (n) addHit(inp, ui.fdIdx || 0); else if (inp.value.trim()) fdNet(inp); return; }
    if ((e.key === "ArrowDown" || e.key === "ArrowUp") && n) {
      e.preventDefault(); ui.fdIdx = ((ui.fdIdx || 0) + (e.key === "ArrowDown" ? 1 : -1) + n) % n;
      $$(".fd-hit", box).forEach((b, i) => b.classList.toggle("on", i === ui.fdIdx)); return;
    }
    if (e.key === "Escape") { inp.value = ""; fdShowRes(inp); }
  });
  document.addEventListener("click", e => {
    const t = e.target;
    // a tap outside closes the open list of results
    $$(".fd-res:not([hidden])").forEach(r => { if (!r.parentElement.contains(t)) r.hidden = true; });
    const hit = t.closest("[data-fd-hit]"); if (hit) { addHit(hit.closest(".fd-search").querySelector("[data-fd-q]"), +hit.dataset.fdHit); return; }
    if (t.closest("[data-fd-net]")) { fdNet(t.closest(".fd-search").querySelector("[data-fd-q]")); return; }
    if (t.closest("[data-fd-own]")) { const q = t.closest(".fd-search")?.querySelector("[data-fd-q]"); ui.fdOwnDay = q?.dataset.fdDay || fdSel(); openFoodOwn(q ? fdParse(q.value).t.replace(/^./, c => c.toUpperCase()) : ""); return; }
    const ml = t.closest("[data-fd-meal]"); if (ml) { ui.fdMeal = ml.dataset.fdMeal; renderFood(); renderCalendar(); return; }
    const st = t.closest("[data-fd-set]");
    if (st) {
      const s = (state.prefs?.foodSets || []).find(x => x.id === st.dataset.fdSet); if (!s) return;
      const d = dayOf(st), x = dyDay(d), m = fdMealCur(), tm = fdTimeFor(d, m);
      x.food = [...(x.food || []), ...s.items.map(it => ({ ...it, id: newId("e"), m, t: tm }))];
      fdSync(d); toast(`Добавлен набор «${s.name}»`); return;
    }
    const ag = t.closest("[data-fd-again]");
    if (ag) { const r = fdFreq()[ag.dataset.fdAgain]; if (r) { fdAdd(dayOf(ag), r.e, r.e.g); toast(`Добавлено: ${r.e.n}`); } return; }
    const op = t.closest("[data-fd-open]"); if (op) { ui.fdDay = op.dataset.fdOpen; setView("food"); return; }
    if (!t.closest("#foodView")) return;
    const d = fdSel();
    const go = t.closest("[data-fd-go]"); if (go) { ui.fdDay = [addDaysISO(d, +go.dataset.fdGo), todayISO()].sort()[0]; ui.fdEdit = null; renderFood(); return; }
    const wd = t.closest("[data-fd-day]"); if (wd) { ui.fdDay = wd.dataset.fdDay; renderFood(); return; }
    const ed = t.closest("[data-fd-edit]"); if (ed) { ui.fdEdit = ui.fdEdit === ed.dataset.fdEdit ? null : ed.dataset.fdEdit; renderFood(); return; }
    const sp = t.closest("[data-fd-step]");
    if (sp) { const [id, k] = sp.dataset.fdStep.split("|"), en = fdEntry(d, id); if (en) { en.g = Math.max(fdStep(en), en.g + +k * fdStep(en)); fdSync(d); } return; }
    const dl = t.closest("[data-fd-del]");
    if (dl) { const x = dyDay(d); x.food = (x.food || []).filter(en => en.id !== dl.dataset.fdDel); ui.fdEdit = null; fdSync(d); return; }
    const at = t.closest("[data-fd-addto]"); if (at) { ui.fdMeal = at.dataset.fdAddto; renderFood(); renderCalendar(); const q = $("#foodView [data-fd-q]"); q.scrollIntoView({ behavior: "smooth", block: "center" }); q.focus({ preventScroll: true }); return; }
    const sv = t.closest("[data-fd-save]");
    if (sv) {
      const l = (state.days?.[d]?.food || []).filter(en => en.m === sv.dataset.fdSave); if (!l.length) return;
      const meal = FD_MEALS.find(([k]) => k === sv.dataset.fdSave)[1];
      const name = (prompt("Как назвать набор?", `Мой ${meal.toLowerCase()}`) || "").trim(); if (!name) return;
      state.prefs ||= {};
      state.prefs.foodSets = [...(state.prefs.foodSets || []), { id: newId("s"), name, items: l.map(({ id, m, t, ...it }) => it) }];
      save(); renderFood(); renderCalendar(); toast(`Набор «${name}» сохранён`); return;
    }
    const sd = t.closest("[data-fd-setdel]");
    if (sd && confirm("Удалить этот набор?")) { state.prefs.foodSets = (state.prefs.foodSets || []).filter(s => s.id !== sd.dataset.fdSetdel); save(); renderFood(); renderCalendar(); return; }
    if (t.closest("[data-fd-goal]")) { openFoodGoal(); return; }
    if (t.closest("[data-fd-nutgo]")) { $("#fdNut")?.scrollIntoView({ behavior: "smooth", block: "start" }); return; }
    const rg = t.closest("[data-fd-range]"); if (rg) { ui.fdRange = +rg.dataset.fdRange; renderFood(); return; }
    const nt = t.closest("[data-fd-ntab]"); if (nt) { ui.fdNutTab = nt.dataset.fdNtab; ui.fdNut = null; renderFood(); return; }
    const nu = t.closest("[data-fd-nut]"); if (nu) { ui.fdNut = ui.fdNut === nu.dataset.fdNut ? null : nu.dataset.fdNut; renderFood(); return; }
    const tp = t.closest("[data-fd-tip]");
    if (tp) { const r = FD_BY[tp.dataset.fdTip]; if (r) { const f = fdCatalog().find(x => x.src === r[0]); fdAdd(d, f, f.pg); toast(`Добавлено: ${f.n}`); } return; }
    const cp = t.closest("[data-fd-comp]"); if (cp) { openFoodComp(d, cp.dataset.fdComp); return; }
  });
  document.addEventListener("change", e => {
    const t = e.target; if (!t.closest?.("#foodView")) return;
    const d = fdSel();
    if (t.matches("[data-fd-g]")) { const en = fdEntry(d, t.dataset.fdG), v = parseFloat(String(t.value).replace(",", ".")); if (en && v > 0) { en.g = v; fdSync(d); } return; }
    if (t.matches("[data-fd-move]")) { const en = fdEntry(d, t.dataset.fdMove); if (en) { en.m = t.value; en.t = fdTimeFor(d, t.value); fdSync(d); } return; }
    if (t.matches("[data-fd-mtime]") && t.value) { (state.days?.[d]?.food || []).filter(en => en.m === t.dataset.fdMtime).forEach(en => { en.t = t.value; }); fdSync(d); }
  });
  const xd = $("#xDlg");
  xd.addEventListener("click", e => { const b = e.target.closest("[data-fdo-tag]"); if (b) b.setAttribute("aria-pressed", b.getAttribute("aria-pressed") !== "true"); });
  xd.addEventListener("submit", e => {
    const f = e.target;
    if (f.matches("[data-fd-ownf]")) {
      e.preventDefault();
      const v = k => Math.max(0, parseFloat(String(f.elements[k].value).replace(",", ".")) || 0);
      const it = { id: newId("m"), n: f.elements.n.value.trim(), per: ["k", "p", "f", "c", "fib"].map(v), pg: v("pg") || 100, pl: f.elements.pl.value.trim() || "порция", tags: $$("[data-fdo-tag][aria-pressed=true]", f).map(b => b.dataset.fdoTag).join(" ") };
      if (!it.n) return;
      state.prefs ||= {}; state.prefs.myFoods = [...(state.prefs.myFoods || []), it];
      closeX(); fdAdd(ui.fdOwnDay || fdSel(), it, it.pg); toast(`Сохранено и добавлено: ${it.n}`);
      return;
    }
    if (f.matches("[data-fd-goalf]")) {
      e.preventDefault();
      state.prefs ||= {}; state.prefs.foodGoal = Object.fromEntries(Object.keys(FD_GOAL).map(k => [k, Math.max(1, Math.round(+f.elements[k].value) || FD_GOAL[k])]));
      save(); closeX(); renderFood();
    }
  });
}
