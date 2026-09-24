// Shared form controls in the site's own style: a date field with the custom calendar and a dropdown.
// Both keep their value in a hidden input and fire "change" on it, so forms and handlers read them as usual.
"use strict";

const CAL_ICON = `<svg width="18" height="18" viewBox="0 0 20 20" aria-hidden="true"><rect x="3" y="4.5" width="14" height="12.5" rx="2.5" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M3 8.5h14M7 2.5v4M13 2.5v4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>`;
const CHEV = `<svg class="csel-chev" width="14" height="14" viewBox="0 0 20 20" aria-hidden="true"><path d="M5 8l5 5 5-5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
// longDate() comes from app.js

/* ---------- date field ---------- */
// attrs: attributes for the hidden input (name=..., data-...); opt: { future, empty: text when blank, clear }
function dfield(attrs, value, opt = {}) {
  return `<div class="dfield" data-future="${opt.future ? 1 : ""}" data-empty="${esc(opt.empty || "Выбрать дату")}">
    <input type="hidden" ${attrs} value="${esc(value || "")}">
    <button type="button" class="date-pick dsm${value ? "" : " blank"}" data-dopen aria-expanded="false">${CAL_ICON}<span>${esc(value ? longDate(value) : opt.empty || "Выбрать дату")}</span></button>
    ${opt.clear ? `<button type="button" class="dclear" data-dclear aria-label="Очистить дату"${value ? "" : " hidden"}>×</button>` : ""}
    <div class="calpop" hidden></div>
  </div>`;
}
function dSet(f, v) {
  const inp = $("input[type=hidden]", f), btn = $("[data-dopen]", f);
  inp.value = v || "";
  $("span", btn).textContent = v ? longDate(v) : f.dataset.empty;
  btn.classList.toggle("blank", !v);
  const c = $("[data-dclear]", f); if (c) c.hidden = !v;
  inp.dispatchEvent(new Event("change", { bubbles: true }));
}
function dRender(f) {
  const st = f._cal, pop = $(".calpop", f), today = todayISO(), sel = $("input[type=hidden]", f).value;
  const future = !!f.dataset.future, sessions = new Set(dates());
  const [ty, tm] = today.split("-").map(Number);
  let body;
  if (st.view === "months") {
    body = `<div class="cal-head"><button type="button" class="cal-nav" data-dc="py" aria-label="Предыдущий год">‹</button><span class="cal-title">${st.y}</span>
        <button type="button" class="cal-nav" data-dc="ny" aria-label="Следующий год" ${!future && st.y >= ty ? "disabled" : ""}>›</button></div>
      <div class="cal-months">${MONTHS_NOM.map((n, i) => {
        const dis = !future && (st.y > ty || (st.y === ty && i + 1 > tm));
        const has = [...sessions].some(d => d.startsWith(`${st.y}-${String(i + 1).padStart(2, "0")}`));
        return `<button type="button" data-dc-m="${i}" class="${i === st.m ? "on" : ""}" ${dis ? "disabled" : ""}>${n.slice(0, 3)}${has ? "<i></i>" : ""}</button>`;
      }).join("")}</div>`;
  } else {
    const first = new Date(st.y, st.m, 1), shift = (first.getDay() + 6) % 7, days = new Date(st.y, st.m + 1, 0).getDate();
    let cells = "";
    for (let i = 0; i < shift; i++) cells += `<span></span>`;
    for (let d = 1; d <= days; d++) {
      const v = iso(st.y, st.m, d), wd = (shift + d - 1) % 7;
      cells += `<button type="button" data-dc-d="${v}" class="${[v === sel ? "on" : "", v === today ? "today" : "", wd > 4 ? "we" : ""].join(" ")}" ${!future && v > today ? "disabled" : ""}>${d}${sessions.has(v) ? "<i></i>" : ""}</button>`;
    }
    const atNow = !future && (st.y > ty || (st.y === ty && st.m + 1 >= tm));
    body = `<div class="cal-head"><button type="button" class="cal-nav" data-dc="pm" aria-label="Предыдущий месяц">‹</button>
        <button type="button" class="cal-title" data-dc="months">${MONTHS_NOM[st.m]} ${st.y}${CHEV}</button>
        <button type="button" class="cal-nav" data-dc="nm" aria-label="Следующий месяц" ${atNow ? "disabled" : ""}>›</button></div>
      <div class="cal-wd">${["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"].map(w => `<span>${w}</span>`).join("")}</div>
      <div class="cal-days">${cells}</div>`;
  }
  const typed = $(".cal-type", pop)?.value || "";
  pop.innerHTML = `<input class="input cal-type" placeholder="Вписать дату: 06.02.2024" inputmode="numeric" autocomplete="off" value="${esc(typed)}">${body}
    <div class="cal-foot"><button type="button" data-dc-today>Сегодня</button>${sessions.size ? `<span class="cal-legend"><i></i>дни сдачи анализов</span>` : ""}</div>`;
}
function dOpen(f) {
  closePops(f);
  const [y, m] = ($("input[type=hidden]", f).value || todayISO()).split("-").map(Number);
  f._cal = { y, m: m - 1, view: "days" };
  $(".calpop", f).hidden = false; $("[data-dopen]", f).setAttribute("aria-expanded", "true");
  dRender(f);
}
function dClose(f) { $(".calpop", f).hidden = true; $("[data-dopen]", f).setAttribute("aria-expanded", "false"); }

/* ---------- dropdown ---------- */
// options: [[value, label, hint?]]
function csel(attrs, options, value, cls = "") {
  const cur = options.find(o => String(o[0]) === String(value)) || options[0];
  return `<div class="csel ${cls}">
    <input type="hidden" ${attrs} value="${esc(cur ? cur[0] : "")}">
    <button type="button" class="csel-btn" data-csel-open aria-expanded="false"><span>${esc(cur ? cur[1] : "")}</span>${CHEV}</button>
    <div class="csel-pop" hidden>${options.map(([v, l, h]) => `<button type="button" data-csel-v="${esc(v)}" aria-selected="${String(v) === String(cur?.[0])}"><span>${esc(l)}</span>${h ? `<small>${esc(h)}</small>` : ""}</button>`).join("")}</div>
  </div>`;
}
function closePops(except) {
  $$(".dfield").forEach(f => { if (f !== except && !$(".calpop", f).hidden) dClose(f); });
  $$(".csel").forEach(c => { if (c !== except) { $(".csel-pop", c).hidden = true; $("[data-csel-open]", c).setAttribute("aria-expanded", "false"); } });
}

function initUI() {
  document.addEventListener("click", e => {
    const t = e.target;
    const f = t.closest?.(".dfield");
    const c = t.closest?.(".csel");
    if (!f && !c) { closePops(); return; }
    if (c) {
      if (t.closest("[data-csel-open]")) { const pop = $(".csel-pop", c), open = pop.hidden; closePops(c); pop.hidden = !open; t.closest("[data-csel-open]").setAttribute("aria-expanded", open); if (open) $("[aria-selected=true]", pop)?.scrollIntoView({ block: "nearest" }); return; }
      const o = t.closest("[data-csel-v]");
      if (o) {
        const inp = $("input[type=hidden]", c); inp.value = o.dataset.cselV;
        $("[data-csel-open] span", c).textContent = $("span", o).textContent;
        $$("[data-csel-v]", c).forEach(b => b.setAttribute("aria-selected", b === o));
        $(".csel-pop", c).hidden = true; $("[data-csel-open]", c).setAttribute("aria-expanded", "false");
        inp.dispatchEvent(new Event("change", { bubbles: true }));
      }
      return;
    }
    if (t.closest("[data-dopen]")) { $(".calpop", f).hidden ? dOpen(f) : dClose(f); return; }
    if (t.closest("[data-dclear]")) { dSet(f, ""); dClose(f); return; }
    const b = t.closest(".calpop button"); if (!b || b.disabled) return;
    const st = f._cal;
    if (b.dataset.dcD) { dSet(f, b.dataset.dcD); dClose(f); return; }
    if (b.hasAttribute("data-dc-today")) { dSet(f, todayISO()); dClose(f); return; }
    if (b.dataset.dcM) { st.m = +b.dataset.dcM; st.view = "days"; dRender(f); return; }
    const a = b.dataset.dc;
    if (a === "pm") { st.m--; if (st.m < 0) { st.m = 11; st.y--; } }
    if (a === "nm") { st.m++; if (st.m > 11) { st.m = 0; st.y++; } }
    if (a === "py") st.y--;
    if (a === "ny") st.y++;
    if (a === "months") st.view = "months";
    dRender(f);
  });
  document.addEventListener("keydown", e => {
    const f = e.target.closest?.(".dfield"), c = e.target.closest?.(".csel");
    if (e.key === "Escape" && (f || c) && ($(".calpop:not([hidden]), .csel-pop:not([hidden])", f || c))) { e.preventDefault(); e.stopPropagation(); closePops(); return; }
    if (f && e.key === "Enter" && e.target.classList.contains("cal-type")) {
      e.preventDefault();
      const v = parseTyped(e.target.value);
      if (v || (f.dataset.future && /\d/.test(e.target.value))) {
        const m = String(e.target.value).trim().match(/^(\d{1,2})[.\/\-\s](\d{1,2})[.\/\-\s](\d{2}|\d{4})$/);
        const val = v || (m ? iso(m[3].length === 2 ? 2000 + +m[3] : +m[3], +m[2] - 1, +m[1]) : null);
        if (val) { dSet(f, val); dClose(f); return; }
      }
      e.target.classList.add("bad");
    }
  }, true);
  document.addEventListener("input", e => {
    const f = e.target.closest?.(".dfield"); if (!f || !e.target.classList.contains("cal-type")) return;
    e.target.classList.remove("bad");
    const v = parseTyped(e.target.value);
    if (v) { const [y, m] = v.split("-").map(Number); f._cal = { y, m: m - 1, view: "days" }; const txt = e.target.value; dRender(f); const inp = $(".cal-type", f); inp.value = txt; inp.focus(); $(`[data-dc-d="${v}"]`, f)?.classList.add("hint"); }
  });
}
