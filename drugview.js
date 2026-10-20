// Drugs tab: the reference (drugs.js) with the person's own edits on top. Every line of a drug card can be
// tapped and changed, removed, or added to; own drugs can be created. Edits live in state.drugs by drug id
// (kind "drug" in the cloud), so the built-in text stays intact and "Вернуть как было" restores it.
// Loaded before app.js: definitions only; initDrugs() wires the UI.
"use strict";

const DR_LISTS = [["how", "Как принимать"], ["best", "Как лучше"], ["contra", "Нельзя, если"], ["side", "Побочные"], ["mix", "С чем осторожно"], ["evidence", "Что показывают исследования"], ["src", "Источники"]];
const DR_TABS = [["how", "Как принимать", ["mine", "how", "best"]], ["care", "Осторожно", ["contra", "side", "mix"]], ["ev", "Исследования", ["evidence", "src"]]];

// built-in text with own edits on top; own drugs have no built-in part
function drugInfo(id) {
  const base = DRUG[id] || {}, own = state.drugs?.[id];
  if (!base.id && !own) return null;
  const src = (base.src || []).map(([t, u]) => `${t} — ${u}`);
  return { id, group: "", what: "", ...Object.fromEntries(DR_LISTS.map(([k]) => [k, []])), ...base, src, ...(own || {}), own: !!own, custom: !base.id };
}
// a scheme drug name → a drug: own drugs by name first, then the reference
function drugMatch(name) {
  const n = norm(name || ""); if (!n) return null;
  const own = Object.entries(state.drugs || {}).find(([, d]) => d.custom && d.name && (n.includes(norm(d.name)) || norm(d.name).includes(n)));
  if (own) return own[0];
  return drugFor(name)?.id || null;
}
function drugEdit(id) { state.drugs ||= {}; if (!state.drugs[id]) { const d = drugInfo(id); state.drugs[id] = JSON.parse(JSON.stringify({ name: d.name, group: d.group, what: d.what, ...Object.fromEntries(DR_LISTS.map(([k]) => [k, d[k]])) })); } return state.drugs[id]; }

/* ---------- page ---------- */
function renderDrugs() {
  const box = $("#drugsView"); if (!box || box.hidden) return;
  const mine = new Map();
  for (const p of tpList()) for (const d of p.drugs || []) {
    const id = drugMatch(d.name), key = id || "n:" + norm(d.name);
    if (!mine.has(key)) mine.set(key, { id, name: id ? drugInfo(id).name : d.name, plans: [] });
    if (!mine.get(key).plans.includes(p.title)) mine.get(key).plans.push(p.title);
  }
  const custom = Object.keys(state.drugs || {}).filter(id => state.drugs[id].custom && !mine.has(id));
  const others = [...Object.keys(DRUG), ...custom].filter(id => !mine.has(id));
  const row = (id, name, sub) => `<button type="button" class="tp-drow" data-dr="${id ? esc(id) : ""}" data-q="${esc(norm(name + " " + (id ? drugInfo(id).group : "")))}"${id ? "" : ` data-dr-new="${esc(name)}"`}>
      <span><b>${esc(name)}</b><small>${esc(sub)}</small></span><svg class="chev" width="18" height="18" viewBox="0 0 20 20" aria-hidden="true"><path d="M7 4l6 6-6 6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg></button>`;
  morph(box, `<div class="st-head"><div><h2>Препараты</h2></div>
      ${ui.readonly ? "" : `<button type="button" class="btn primary" data-dr-add>Свой препарат</button>`}</div>
    <input class="input tp-dq" data-dr-q placeholder="Найти препарат" autocomplete="off" aria-label="Найти препарат">
    ${mine.size ? `<h3 class="st-year">Мои · ${mine.size}</h3><div class="card st-list tp-dlist">${[...mine.values()].map(m => row(m.id, m.name, [m.id ? drugInfo(m.id).group : "нет в справочнике — нажми, чтобы создать", "в схеме: " + m.plans.join(", ")].filter(Boolean).join(" · "))).join("")}</div>` : ""}
    ${others.length ? `<h3 class="st-year">Справочник · ${others.length}</h3><div class="card st-list tp-dlist">${others.map(id => row(id, drugInfo(id).name, drugInfo(id).group)).join("")}</div>` : ""}
    <p class="muted tp-dnone" hidden>Ничего не нашлось</p>
    <p class="muted tp-dnote">Дозу и курс решает врач.</p>`);
}

/* ---------- one drug ---------- */
// a line of text that turns into an editor on tap; "field|i", "field|new" or "name" / "group" / "what"
const drLine = (key, text, ro) => ro ? esc(text) : `<span class="dr-ed" data-dr-ed="${key}" role="button" tabindex="0">${esc(text)}</span>`;
function drEditor(key, text, multi) {
  return `<form class="dr-form" data-dr-save="${key}">${multi ? `<textarea class="input sy-grow" name="t" rows="2">${esc(text)}</textarea>` : `<input class="input" name="t" value="${esc(text)}" autocomplete="off">`}
    <div class="tp-edb">${/\|\d+$/.test(key) ? `<button type="button" class="btn sm ghost danger" data-dr-del="${key}">Удалить</button>` : ""}<span style="flex:1"></span>
      <button type="button" class="btn sm ghost" data-dr-cancel>Отмена</button><button type="submit" class="btn sm primary">Сохранить</button></div></form>`;
}
const drLink = t => { const m = String(t).match(/^(.*?)\s*[—-]\s*(https?:\/\/\S+)$/) || String(t).match(/^()(https?:\/\/\S+)$/); return m ? `<a href="${esc(m[2])}" target="_blank" rel="noopener">${esc(m[1] || m[2])}</a>` : esc(t); };
function openDrug(id) {
  const d = drugInfo(id); if (!d) return;
  if (ui.drOpen !== id) ui.drEd = null;
  ui.drOpen = id;
  const ro = !!ui.readonly, ed = ui.drEd;
  const tab = DR_TABS.some(([k]) => k === ui.drTab) ? ui.drTab : "how";
  const mine = tpList().flatMap(p => (p.drugs || []).filter(x => drugMatch(x.name) === id).map(x => `${p.title}: ${x.how || "как назначено"}`));
  const list = k => {
    const items = d[k] || [];
    return `<ul>${items.map((t, i) => `<li>${ed === `${k}|${i}` ? drEditor(`${k}|${i}`, t, true) : k === "src" && ro ? drLink(t) : `${drLine(`${k}|${i}`, t, ro)}${k === "src" && /https?:\/\//.test(t) ? ` <a class="dr-go" href="${esc(t.match(/https?:\/\/\S+/)[0])}" target="_blank" rel="noopener" aria-label="Открыть ссылку">↗</a>` : ""}`}</li>`).join("")}</ul>
      ${ro ? "" : ed === `${k}|new` ? drEditor(`${k}|new`, "", true) : `<button type="button" class="dr-add" data-dr-ed="${k}|new">+ строка</button>`}`;
  };
  const sec = k => k === "mine" ? (mine.length ? `<section class="tp-recg tp-mine"><h4>У тебя</h4><ul>${mine.map(t => `<li>${esc(t)}</li>`).join("")}</ul></section>` : "")
    : (d[k]?.length || !ro) ? `<section class="tp-recg"><h4>${DR_LISTS.find(([x]) => x === k)[1]}</h4>${list(k)}</section>` : "";
  const curTab = DR_TABS.find(([k]) => k === tab);
  openX(`<div class="dlg-head"><div><div class="info-group">${ed === "group" ? drEditor("group", d.group) : drLine("group", d.group || (ro ? "" : "группа — нажми, чтобы указать"), ro)}</div>
      <h3>${ed === "name" ? drEditor("name", d.name) : drLine("name", d.name, ro)}</h3></div><button type="button" class="icon-btn" data-xclose aria-label="Закрыть">×</button></div>
    <div class="sy-tabs" role="tablist">${DR_TABS.map(([k, n]) => `<button type="button" role="tab" data-dr-tab="${k}" aria-selected="${tab === k}">${n}</button>`).join("")}</div>
    <div class="tp-body">${tab === "how" ? `<p class="tp-what">${ed === "what" ? drEditor("what", d.what, true) : drLine("what", d.what || (ro ? "" : "Что это и как работает — нажми, чтобы написать"), ro)}</p>` : ""}
      ${curTab[2].map(sec).join("")}</div>
    <div class="dlg-foot"><p class="muted tp-dnote">Дозу и курс решает врач.</p><span style="flex:1"></span>
      ${!ro && d.own ? `<button type="button" class="btn sm ghost${d.custom ? " danger" : ""}" data-dr-reset>${d.custom ? (ui.drConfirm === id ? "Точно удалить?" : "Удалить препарат") : "Вернуть как было"}</button>` : ""}</div>`, "st-dlg tp-dlg dr-dlg");
  const f = $("#xDlg .dr-form [name=t]"); if (f) { syGrowAll(); f.focus(); f.setSelectionRange?.(f.value.length, f.value.length); }
}
function drRedraw() { const x = $("#xDlg"), y = x.scrollTop; save(); renderDrugs(); renderTherapy(); openDrug(ui.drOpen); x.scrollTop = y; }

/* ---------- wiring ---------- */
function initDrugs() {
  const page = $("#drugsView"), xd = $("#xDlg");
  page.addEventListener("input", e => {
    if (!e.target.matches("[data-dr-q]")) return;
    const q = norm(e.target.value); let n = 0;
    $$(".tp-drow", page).forEach(r => { const on = !q || r.dataset.q.includes(q); r.hidden = !on; n += on; });
    $$(".tp-dlist", page).forEach(l => { const any = $$(".tp-drow", l).some(r => !r.hidden); l.hidden = !any; l.previousElementSibling.hidden = !any; });
    $(".tp-dnone", page).hidden = !!n;
  });
  page.addEventListener("click", e => {
    const t = e.target;
    const nw = t.closest("[data-dr-new]");
    // a scheme drug that is not in the reference: create an own card named after it
    if (nw) { const id = newId("dr"); (state.drugs ||= {})[id] = { custom: true, name: nw.dataset.drNew, group: "", what: "" }; save(); renderDrugs(); ui.drTab = null; ui.drEd = "what"; openDrug(id); return; }
    const r = t.closest("[data-dr]"); if (r && r.dataset.dr) { ui.drTab = null; ui.drEd = null; openDrug(r.dataset.dr); return; }
    if (t.closest("[data-dr-add]")) { const id = newId("dr"); (state.drugs ||= {})[id] = { custom: true, name: "Новый препарат", group: "", what: "" }; save(); renderDrugs(); ui.drTab = null; ui.drEd = "name"; openDrug(id); }
  });
  xd.addEventListener("click", e => {
    if (!xd.classList.contains("dr-dlg")) return;
    const t = e.target, id = ui.drOpen;
    const tb = t.closest("[data-dr-tab]"); if (tb) { ui.drTab = tb.dataset.drTab; ui.drEd = null; openDrug(id); return; }
    const ed = t.closest("[data-dr-ed]"); if (ed && !ui.readonly) { ui.drEd = ed.dataset.drEd; openDrug(id); return; }
    if (t.closest("[data-dr-cancel]")) { ui.drEd = null; openDrug(id); return; }
    const del = t.closest("[data-dr-del]");
    if (del) { const [k, i] = del.dataset.drDel.split("|"), own = drugEdit(id); own[k].splice(+i, 1); ui.drEd = null; drRedraw(); return; }
    if (t.closest("[data-dr-reset]")) {
      const custom = drugInfo(id).custom;
      if (custom && ui.drConfirm !== id) { ui.drConfirm = id; openDrug(id); return; }
      ui.drConfirm = null; delete state.drugs[id]; save(); renderDrugs();
      if (custom) { closeX(); toast("Препарат удалён"); } else { openDrug(id); toast("Вернул текст справочника"); }
    }
  });
  xd.addEventListener("keydown", e => {
    if (!xd.classList.contains("dr-dlg")) return;
    if ((e.key === "Enter" || e.key === " ") && e.target.matches(".dr-ed")) { e.preventDefault(); e.target.click(); }
    // Enter saves a line, Shift+Enter breaks it
    if (e.key === "Enter" && !e.shiftKey && e.target.matches(".dr-form [name=t]")) { e.preventDefault(); e.target.form.requestSubmit(); }
    if (e.key === "Escape" && e.target.matches(".dr-form [name=t]")) { e.preventDefault(); e.stopPropagation(); ui.drEd = null; openDrug(ui.drOpen); }
  });
  xd.addEventListener("input", e => { if (xd.classList.contains("dr-dlg") && e.target.matches(".sy-grow")) syGrow(e.target); });
  xd.addEventListener("submit", e => {
    const f = e.target; if (!f.matches("[data-dr-save]")) return;
    e.preventDefault();
    const key = f.dataset.drSave, text = f.elements.t.value.trim(), own = drugEdit(ui.drOpen);
    if (key.includes("|")) {
      const [k, i] = key.split("|"); own[k] = [...(own[k] || [])];
      if (i === "new") { if (text) own[k].push(text); } else if (text) own[k][+i] = text; else own[k].splice(+i, 1);
    } else if (text || key !== "name") own[key] = text;
    // a new line keeps the editor open for the next one
    ui.drEd = key.endsWith("|new") && text ? key : null;
    drRedraw();
  });
}
