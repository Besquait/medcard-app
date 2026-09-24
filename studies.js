// Studies tab: imaging, functional tests, endoscopy, doctors' conclusions and discharge papers,
// with attached files (Supabase Storage, private per user) and links to lab markers.
// Loaded before app.js: definitions only; initStudies() wires the UI.
"use strict";

// [id, name, short label, colour]
const STUDY_TYPES = [
  ["us", "УЗИ", "УЗИ", "#3E8ED0"],
  ["xray", "Рентген", "РГ", "#7C6FD6"],
  ["ct", "КТ", "КТ", "#D9822B"],
  ["mri", "МРТ", "МРТ", "#C9467A"],
  ["ecg", "ЭКГ", "ЭКГ", "#D64545"],
  ["echo", "ЭхоКГ", "Эхо", "#D64545"],
  ["holter", "Холтер", "ХМ", "#D64545"],
  ["egd", "Гастроскопия", "ФГДС", "#2E9E83"],
  ["colono", "Колоноскопия", "КС", "#2E9E83"],
  ["dxa", "Денситометрия", "DXA", "#7C6FD6"],
  ["fluoro", "Флюорография", "ФЛГ", "#7C6FD6"],
  ["mammo", "Маммография", "ММГ", "#C9467A"],
  ["spiro", "Спирометрия", "ФВД", "#3E8ED0"],
  ["consult", "Заключение врача", "Врач", "#6B7A8F"],
  ["discharge", "Выписка", "Вып", "#6B7A8F"],
  ["other", "Другое", "•••", "#6B7A8F"],
];
const ST = Object.fromEntries(STUDY_TYPES.map(([id, name, short, color]) => [id, { name, short, color }]));
const STUDY_AREAS = {
  us: ["Щитовидная железа", "Брюшная полость", "Печень и желчный пузырь", "Почки и мочевой пузырь", "Малый таз", "Простата", "Сосуды шеи", "Вены ног", "Лимфоузлы", "Молочные железы", "Суставы", "Мошонка"],
  xray: ["Грудная клетка", "Позвоночник", "Суставы", "Пазухи носа", "Зубы"],
  ct: ["Головной мозг", "Грудная клетка", "Брюшная полость", "Позвоночник", "Пазухи носа", "Суставы", "Сердце и сосуды"],
  mri: ["Головной мозг", "Гипофиз", "Позвоночник", "Суставы", "Брюшная полость", "Малый таз", "Сердце"],
  ecg: ["Сердце"], echo: ["Сердце"], holter: ["Сердце"],
  egd: ["Пищевод, желудок, 12-перстная кишка"], colono: ["Толстая кишка"],
  dxa: ["Позвоночник и бедро"], fluoro: ["Грудная клетка"], mammo: ["Молочные железы"], spiro: ["Лёгкие"],
  consult: ["Терапевт", "Эндокринолог", "Гастроэнтеролог", "Кардиолог", "Невролог", "Уролог", "Ревматолог", "Дерматолог", "Гинеколог"],
  discharge: ["Стационар", "Дневной стационар"], other: [],
};
const STUDY_STATUS = [["ok", "Норма"], ["find", "Есть находки"], ["watch", "Наблюдение"]];
const STATUS_NAME = Object.fromEntries(STUDY_STATUS);
// which analyses usually go with a study: matched against "type + area"
const LINK_RULES = [
  [/щитов|эндокрин/i, ["tsh", "ft4", "ft3", "atpo", "attg", "trab", "calcit"]],
  [/печен|желч|брюшн|гастроэнт/i, ["alt", "ast", "ggt", "alp", "tbil", "alb", "plt"]],
  [/поджелуд|брюшн/i, ["lipase", "amy", "glu"]],
  [/почк|мочев|уролог/i, ["crea", "egfr", "u_alb", "u_prot", "ua"]],
  [/простат|мошонк|уролог/i, ["psa", "testo", "lh", "fsh"]],
  [/сердц|кардиол|экг|эхо|холтер/i, ["ldl", "chol", "apob", "lpa", "k", "na", "tsh", "hgb", "sbp"]],
  [/сосуд|вен/i, ["ldl", "chol", "apob", "lpa", "hba1c", "ddimer"]],
  [/гастроскоп|пищевод|желуд|перстн/i, ["hp_ubt", "hp_ag", "hgb", "ferritin", "b12"]],
  [/колоноскоп|толст|кишк/i, ["fcal", "fob", "hgb", "ferritin", "crp"]],
  [/денсит|кост|позвоноч|бедр/i, ["vitd", "ca", "pth", "alp", "p"]],
  [/сустав|ревмат/i, ["crp", "esr", "ua", "rf", "accp"]],
  [/грудн|лёгк|легк|флюор|спиро/i, ["crp", "wbc", "eos"]],
  [/гипофиз/i, ["prl", "tsh", "lh", "fsh", "cort", "igf1", "acth"]],
  [/малый таз|яичн|матк|гинеколог/i, ["fsh", "lh", "e2", "amh", "prl"]],
  [/молочн|маммо/i, ["prl"]],
  [/головн|невролог/i, ["glu", "hba1c", "b12", "hgb", "sbp"]],
  [/лимфоуз/i, ["wbc", "lymph_abs", "crp", "ebv", "cmv"]],
];
const MAX_FILE = 50 * 1024 * 1024;

const studyList = () => Object.entries(state.studies || {}).map(([id, s]) => ({ id, ...s })).sort((a, b) => (b.date || "").localeCompare(a.date || ""));
const studyTitle = s => [ST[s.type]?.name || "Обследование", s.area].filter(Boolean).join(" · ");
const canFiles = () => typeof cloud !== "undefined" && !!cloud.user;
function suggestLinks(type, area) {
  const text = `${ST[type]?.name || ""} ${area || ""}`, ids = [];
  LINK_RULES.forEach(([re, l]) => { if (re.test(text)) l.forEach(x => CAT[x] && !ids.includes(x) && ids.push(x)); });
  return ids;
}
// markers taken within 60 days of the study
function nearbyTaken(date) {
  if (!date) return [];
  const bm = byMarker();
  return Object.keys(bm).filter(m => m !== "dbp" && bm[m].some(r => !r.calc && r.date && Math.abs(daysBetween(r.date, date)) <= 60));
}
function nearValue(m, date) {
  const l = byMarker()[m]; if (!l) return null;
  let best = null;
  for (const r of l) { if (!r.date || !isNum(r.v)) continue; const d = daysBetween(date, r.date); if (!best || Math.abs(d) < Math.abs(best.d)) best = { r, d }; }
  return best;
}
const studiesFor = m => studyList().filter(s => (s.links || []).includes(m));
const icon = (type, big) => `<span class="st-ic${big ? " big" : ""}" style="--c:${ST[type]?.color || "#6B7A8F"}">${esc(ST[type]?.short || "•")}</span>`;
const kb = n => n > 1048576 ? `${(n / 1048576).toFixed(1)} МБ` : `${Math.max(1, Math.round(n / 1024))} КБ`;
const isImg = f => /^image\/(png|jpe?g|webp|gif|bmp)$/i.test(f.mime || "");

/* ---------- signed URLs for private files ---------- */
const signed = {};
async function signUrls(paths) {
  const need = paths.filter(p => !signed[p] || signed[p].exp < Date.now() + 60e3);
  if (need.length && canFiles()) {
    const { data } = await cloud.client.storage.from("docs").createSignedUrls(need, 3600);
    (data || []).forEach(x => { if (x.signedUrl) signed[x.path] = { url: x.signedUrl, exp: Date.now() + 3600e3 }; });
  }
  return paths.map(p => signed[p]?.url || null);
}
async function hydrateThumbs(root) {
  const els = $$("[data-thumb]", root); if (!els.length || !canFiles()) return;
  const urls = await signUrls(els.map(e => e.dataset.thumb));
  els.forEach((e, i) => { if (urls[i]) e.style.backgroundImage = `url("${urls[i]}")`; });
}
async function openFile(path, name, mime) {
  const [url] = await signUrls([path]);
  if (!url) { toast("Файл недоступен"); return; }
  if (/^image\//.test(mime || "")) {
    $("#lightbox").innerHTML = `<figure><img src="${esc(url)}" alt="${esc(name)}"><figcaption>${esc(name)} <a href="${esc(url)}" target="_blank" rel="noopener">Открыть оригинал</a></figcaption></figure><button type="button" class="icon-btn lb-x" data-lb-close aria-label="Закрыть">×</button>`;
    $("#lightbox").showModal();
  } else window.open(url, "_blank", "noopener");
}

/* ---------- page ---------- */
function renderStudies() {
  const box = $("#studiesView"); if (!box || box.hidden) return;
  const all = studyList(), q = norm(ui.stQ || ""), f = ui.stType || "";
  const list = all.filter(s => (!f || s.type === f) && (!q || norm([studyTitle(s), s.clinic, s.doctor, s.conclusion, s.recs].join(" ")).includes(q)));
  const types = STUDY_TYPES.filter(([id]) => all.some(s => s.type === id));
  const years = {};
  list.forEach(s => (years[(s.date || "").slice(0, 4) || "Без даты"] ||= []).push(s));
  const count = k => all.filter(s => s.status === k).length;
  box.innerHTML = `
    <div class="st-head">
      <div><h2>Обследования</h2><p class="muted">Снимки, УЗИ, ЭКГ, эндоскопии, заключения врачей — с файлами и связью с анализами</p></div>
      <button type="button" class="btn primary" data-st-new>+ Добавить обследование</button>
    </div>
    ${all.length ? `
    <div class="st-sum">
      <div class="ov"><div class="ov-k">Всего</div><div class="ov-v num">${all.length}</div><div class="ov-s">последнее ${fmtDate(all[0].date)}</div></div>
      <div class="ov"><div class="ov-k">Есть находки</div><div class="ov-v num ${count("find") ? "bad" : ""}">${count("find")}</div><div class="ov-s">по заключениям</div></div>
      <div class="ov"><div class="ov-k">Наблюдение</div><div class="ov-v num">${count("watch")}</div><div class="ov-s">повторить в срок</div></div>
    </div>
    <div class="st-bar">
      <div class="searchbox st-search"><svg class="search-ico" width="16" height="16" viewBox="0 0 20 20" aria-hidden="true"><circle cx="9" cy="9" r="6" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M13.5 13.5L17 17" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>
        <input type="text" data-st-q value="${esc(ui.stQ || "")}" placeholder="Найти в заключениях" autocomplete="off"></div>
      <div class="tchips">${[["", "Все"], ...types.map(([id, n]) => [id, n])].map(([id, n]) => `<button type="button" class="tchip" data-st-type="${id}" aria-pressed="${f === id}">${esc(n)}</button>`).join("")}</div>
    </div>
    ${Object.keys(years).length ? Object.entries(years).map(([y, l]) => `<h3 class="st-year">${esc(y)}</h3><div class="st-grid">${l.map(studyCard).join("")}</div>`).join("") : `<div class="empty">Ничего не нашлось.</div>`}`
    : `<div class="st-empty">
        <p>Добавь первое обследование — выбери тип:</p>
        <div class="st-types">${STUDY_TYPES.map(([id, n]) => `<button type="button" class="st-type" data-st-new="${id}">${icon(id)}<span>${esc(n)}</span></button>`).join("")}</div>
      </div>`}`;
  hydrateThumbs(box);
}
function studyCard(s) {
  const imgs = (s.files || []).filter(isImg), other = (s.files || []).length - imgs.length;
  const links = s.links || [];
  return `<article class="st-card" data-st="${esc(s.id)}" tabindex="0">
    ${icon(s.type)}
    <div class="st-main">
      <div class="st-top"><b>${esc(studyTitle(s))}</b>${s.status ? `<span class="st-badge ${s.status}">${esc(STATUS_NAME[s.status])}</span>` : ""}</div>
      <div class="st-meta num">${fmtDate(s.date)}${s.clinic ? " · " + esc(s.clinic) : ""}${s.doctor ? " · " + esc(s.doctor) : ""}</div>
      ${s.conclusion ? `<p class="st-concl">${esc(s.conclusion)}</p>` : ""}
      <div class="st-foot">
        ${imgs.slice(0, 3).map(f => `<span class="st-thumb" data-thumb="${esc(f.path)}"></span>`).join("")}
        ${other > 0 || imgs.length > 3 ? `<span class="st-files">📎 ${(s.files || []).length}</span>` : ""}
        ${links.length ? `<span class="st-links">${links.slice(0, 4).map(m => { const n = nearValue(m, s.date); return `<span class="st-lk ${n ? status(n.r) || "none" : "none"}">${esc(info(m).abbr || info(m).ru)}</span>`; }).join("")}${links.length > 4 ? `<span class="st-lk none">+${links.length - 4}</span>` : ""}</span>` : ""}
      </div>
    </div>
  </article>`;
}

/* ---------- one study ---------- */
function openStudy(id) {
  const s = state.studies?.[id]; if (!s) return;
  const due = s.repeat ? addMonths(s.date, s.repeat) : null, left = due ? daysBetween(todayISO(), due) : null;
  const files = s.files || [];
  const links = (s.links || []).map(m => {
    const n = nearValue(m, s.date);
    const when = n ? (Math.abs(n.d) < 1 ? "в тот же день" : `за ${spanText(n.d)} ${n.d < 0 ? "до" : "после"}`) : "";
    return `<button type="button" class="st-lrow" data-goto="${esc(m)}">
      <i class="gc-dot ${n ? status(n.r) || "none" : "none"}"></i><span class="st-lname">${esc(info(m).ru)}</span>
      ${n ? `<span class="num"><b class="${status(n.r) || ""}">${fmt(n.r.v)}</b> <small>${esc(n.r.unit || "")}</small></span><span class="muted st-lwhen">${fmtDate(n.r.date)} · ${when}</span>` : `<span class="muted">не сдавал</span><span></span>`}
    </button>`;
  }).join("");
  openX(`<div class="dlg-head"><div class="st-dh">${icon(s.type, true)}<div><div class="info-group">${esc(ST[s.type]?.name || "")}</div><h3>${esc(s.area || ST[s.type]?.name || "Обследование")}</h3>
      <div class="st-meta num">${fmtDate(s.date)}${s.clinic ? " · " + esc(s.clinic) : ""}${s.doctor ? " · " + esc(s.doctor) : ""}</div></div></div>
      <button type="button" class="icon-btn" data-xclose aria-label="Закрыть">×</button></div>
    <div class="st-tags">${s.status ? `<span class="st-badge ${s.status}">${esc(STATUS_NAME[s.status])}</span>` : ""}${due ? `<span class="st-badge ${left < 0 ? "find" : "watch"}">повторить ${left < 0 ? `— просрочено на ${spanText(left)}` : `до ${fmtDate(due)}`}</span>` : ""}</div>
    ${s.conclusion ? `<section class="st-sec"><h4>Заключение</h4><p class="st-text">${esc(s.conclusion)}</p></section>` : ""}
    ${s.recs ? `<section class="st-sec"><h4>Рекомендации</h4><p class="st-text">${esc(s.recs)}</p></section>` : ""}
    ${files.length ? `<section class="st-sec"><h4>Файлы · ${files.length}</h4><div class="st-gallery">${files.map((f, i) => isImg(f)
      ? `<button type="button" class="st-gimg" data-thumb="${esc(f.path)}" data-file="${i}" title="${esc(f.name)}"></button>`
      : `<button type="button" class="st-gfile" data-file="${i}"><span class="st-ext">${esc((f.name.split(".").pop() || "файл").slice(0, 4).toUpperCase())}</span><span class="st-fname">${esc(f.name)}</span><small>${kb(f.size || 0)}</small></button>`).join("")}</div></section>` : ""}
    ${links ? `<section class="st-sec"><h4>Связанные анализы</h4><p class="muted st-hint">Значение, ближайшее по дате к обследованию. Нажми, чтобы открыть анализ.</p><div class="st-lrows">${links}</div></section>` : ""}
    ${s.note ? `<section class="st-sec"><h4>Заметка</h4><p class="st-text">${esc(s.note)}</p></section>` : ""}
    <div class="dlg-foot"><button type="button" class="btn ghost danger" data-st-del="${esc(id)}">${ui.confirmSt === id ? "Точно удалить вместе с файлами?" : "Удалить"}</button><span style="flex:1"></span><button type="button" class="btn primary" data-st-edit="${esc(id)}">Изменить</button></div>`, "st-dlg");
  ui.stOpen = id;
  hydrateThumbs($("#xBody"));
}

/* ---------- form ---------- */
function openStudyForm(id, presetType) {
  const s = id ? state.studies[id] : { type: presetType || "us", date: todayISO(), links: [] };
  ui.stEdit = { id, files: [], links: new Set(s.links || []), removed: [] };
  openX(`<div class="dlg-head"><h3>${id ? "Изменить обследование" : "Новое обследование"}</h3><button type="button" class="icon-btn" data-xclose aria-label="Закрыть">×</button></div>
    <form class="st-form" data-st-form>
      <div class="fld"><span>Тип</span><div class="st-typepick">${STUDY_TYPES.map(([t, n]) => `<label class="st-tp"><input type="radio" name="type" value="${t}"${s.type === t ? " checked" : ""}>${icon(t)}<span>${esc(n)}</span></label>`).join("")}</div></div>
      <label class="fld"><span>Область или специалист</span><input class="input" name="area" value="${esc(s.area || "")}" placeholder="Например: щитовидная железа" autocomplete="off"></label>
      <div class="tchips st-areas" data-areas></div>
      <div class="ev-dates">
        <label class="fld"><span>Дата</span><input class="input num" type="date" name="date" required value="${esc(s.date || todayISO())}"></label>
        <label class="fld st-grow"><span>Клиника</span><input class="input" name="clinic" value="${esc(s.clinic || "")}" autocomplete="off"></label>
        <label class="fld st-grow"><span>Врач</span><input class="input" name="doctor" value="${esc(s.doctor || "")}" autocomplete="off"></label>
      </div>
      <div class="fld"><span>Итог</span><div class="tchips">${STUDY_STATUS.map(([k, n]) => `<label class="tchip radio"><input type="radio" name="status" value="${k}"${s.status === k ? " checked" : ""}>${n}</label>`).join("")}</div></div>
      <label class="fld"><span>Заключение</span><textarea class="input" name="conclusion" rows="4" placeholder="Перепиши или вставь текст заключения">${esc(s.conclusion || "")}</textarea></label>
      <label class="fld"><span>Рекомендации</span><textarea class="input" name="recs" rows="2" placeholder="Что посоветовал врач">${esc(s.recs || "")}</textarea></label>
      <label class="fld"><span>Повторить через</span><select class="input" name="repeat" style="max-width:220px">${[[0, "не нужно"], [3, "3 мес."], [6, "6 мес."], [12, "12 мес."], [24, "24 мес."], [36, "3 года"], [60, "5 лет"]].map(([v, t]) => `<option value="${v}"${(s.repeat || 0) === v ? " selected" : ""}>${t}</option>`).join("")}</select></label>
      <div class="fld"><span>Связанные анализы</span><div class="st-linkbox" data-links></div>
        <div class="st-linkadd"><input class="input" data-link-q placeholder="Добавить анализ: начни вводить название" autocomplete="off"><div class="tchips" data-link-sugg></div></div></div>
      <div class="fld"><span>Файлы</span>
        ${canFiles() ? `<label class="st-drop" data-drop><input type="file" multiple accept="image/*,application/pdf,.pdf,.doc,.docx,.txt" data-files hidden>
          <b>Перетащи файлы или нажми, чтобы выбрать</b><small>Снимки, фото бланка, PDF заключения · до 50 МБ каждый · на телефоне можно сфотографировать</small></label>
          <div class="st-flist" data-flist></div>` : `<p class="muted">Файлы можно прикреплять после входа через Google — они хранятся в защищённом облаке.</p>`}</div>
      <label class="fld"><span>Заметка</span><input class="input" name="note" value="${esc(s.note || "")}" autocomplete="off"></label>
      <div class="dlg-foot"><span style="flex:1"></span><button type="button" class="btn ghost" data-xclose>Отмена</button><button type="submit" class="btn primary" data-st-save>Сохранить</button></div>
    </form>`, "st-dlg");
  refreshStudyForm();
}
function formVals() { const f = $("[data-st-form]"); return f ? Object.fromEntries(new FormData(f)) : {}; }
function refreshStudyForm() {
  const v = formVals(), ed = ui.stEdit;
  $("[data-areas]").innerHTML = (STUDY_AREAS[v.type] || []).map(a => `<button type="button" class="tchip" data-area="${esc(a)}" aria-pressed="${norm(a) === norm(v.area)}">${esc(a)}</button>`).join("");
  const sugg = suggestLinks(v.type, v.area), near = nearbyTaken(v.date).filter(m => !sugg.includes(m));
  const chip = m => { const n = nearValue(m, v.date); return `<button type="button" class="tchip st-lchip" data-link="${esc(m)}" aria-pressed="${ed.links.has(m)}">${esc(info(m).ru)}${n ? ` <small class="${status(n.r) || ""}">${fmt(n.r.v)}</small>` : ""}</button>`; };
  const extra = [...ed.links].filter(m => !sugg.includes(m) && !near.includes(m));
  $("[data-links]").innerHTML = `
    ${sugg.length ? `<div class="st-lgroup"><small>Обычно смотрят вместе с этим обследованием</small><div class="tchips">${sugg.map(chip).join("")}</div></div>` : ""}
    ${near.length ? `<div class="st-lgroup"><small>Сданы в пределах 2 месяцев от даты</small><div class="tchips">${near.slice(0, 16).map(chip).join("")}</div></div>` : ""}
    ${extra.length ? `<div class="st-lgroup"><small>Добавлены вручную</small><div class="tchips">${extra.map(chip).join("")}</div></div>` : ""}
    ${!sugg.length && !near.length && !extra.length ? `<p class="muted">Выбери тип и область — предложу подходящие анализы.</p>` : ""}`;
  renderFileList();
}
function renderFileList() {
  const box = $("[data-flist]"); if (!box) return;
  const ed = ui.stEdit, old = ed.id ? (state.studies[ed.id].files || []).filter(f => !ed.removed.includes(f.path)) : [];
  box.innerHTML = [...old.map(f => `<div class="st-frow"><span class="st-ext">${esc((f.name.split(".").pop() || "").slice(0, 4).toUpperCase())}</span><span class="st-fname">${esc(f.name)}</span><small>${kb(f.size || 0)}</small><button type="button" class="icon-btn sm" data-frm="${esc(f.path)}" aria-label="Убрать файл">×</button></div>`),
    ...ed.files.map((f, i) => `<div class="st-frow new"><span class="st-ext">${esc((f.name.split(".").pop() || "").slice(0, 4).toUpperCase())}</span><span class="st-fname">${esc(f.name)}</span><small>${kb(f.size)} · будет загружен</small><button type="button" class="icon-btn sm" data-fnew="${i}" aria-label="Убрать файл">×</button></div>`)].join("");
}
function addPicked(list) {
  for (const f of list) {
    if (f.size > MAX_FILE) { toast(`«${f.name}» больше 50 МБ — не добавлен`); continue; }
    ui.stEdit.files.push(f);
  }
  renderFileList();
}
async function saveStudy() {
  const v = formVals(), ed = ui.stEdit;
  if (!v.type || !v.date) { toast("Выбери тип и дату"); return; }
  const id = ed.id || newId("st");
  const prev = state.studies[id] || {};
  const study = { type: v.type, area: v.area.trim(), date: v.date, clinic: v.clinic.trim(), doctor: v.doctor.trim(), status: v.status || "",
    conclusion: v.conclusion.trim(), recs: v.recs.trim(), repeat: +v.repeat || 0, note: v.note.trim(), links: [...ed.links],
    files: (prev.files || []).filter(f => !ed.removed.includes(f.path)) };
  const btn = $("[data-st-save]"); if (btn) { btn.disabled = true; btn.textContent = ed.files.length ? "Загружаю файлы…" : "Сохраняю…"; }
  if (canFiles()) {
    if (ed.removed.length) await cloud.client.storage.from("docs").remove(ed.removed);
    for (const f of ed.files) {
      const ext = (f.name.match(/\.[a-z0-9]{1,5}$/i) || [""])[0].toLowerCase();
      const path = `${cloud.user.id}/${id}/${newId("f")}${ext}`;
      const { error } = await cloud.client.storage.from("docs").upload(path, f, { contentType: f.type || "application/octet-stream", upsert: false });
      if (error) { toast(`«${f.name}» не загрузился: ${error.message}`); continue; }
      study.files.push({ path, name: f.name, size: f.size, mime: f.type || "" });
    }
  }
  state.studies ||= {}; state.studies[id] = study;
  save(); renderAll();
  openStudy(id);
  toast("Обследование сохранено");
}
async function deleteStudy(id) {
  const s = state.studies[id]; if (!s) return;
  const paths = (s.files || []).map(f => f.path);
  if (paths.length && canFiles()) await cloud.client.storage.from("docs").remove(paths);
  delete state.studies[id]; save(); renderAll(); closeX(); toast("Обследование удалено");
}

/* ---------- views ---------- */
function setView(v) {
  ui.view = v === "studies" ? "studies" : "labs";
  $("#labsView").hidden = ui.view !== "labs";
  $("#studiesView").hidden = ui.view !== "studies";
  $$(".top .tabs [data-view]").forEach(b => b.toggleAttribute("aria-current", b.dataset.view === ui.view));
  $$(".top .tabs [data-view]").forEach(b => { if (b.dataset.view === ui.view) b.setAttribute("aria-current", "page"); else b.removeAttribute("aria-current"); });
  $$("#tabbar [data-tb]").forEach(b => { if (["list", "studies"].includes(b.dataset.tb)) b.setAttribute("aria-current", String((b.dataset.tb === "studies") === (ui.view === "studies"))); });
  if (location.hash !== (ui.view === "studies" ? "#studies" : "") ) history.replaceState(null, "", ui.view === "studies" ? "#studies" : location.pathname + location.search);
  if (ui.view === "studies") renderStudies();
  scrollTo({ top: 0 });
}

/* ---------- wiring ---------- */
function initStudies() {
  $$(".top .tabs [data-view]").forEach(b => b.addEventListener("click", () => setView(b.dataset.view)));
  const page = $("#studiesView");
  page.addEventListener("click", e => {
    const n = e.target.closest("[data-st-new]"); if (n) { openStudyForm(null, n.dataset.stNew || undefined); return; }
    const t = e.target.closest("[data-st-type]"); if (t) { ui.stType = t.dataset.stType; renderStudies(); return; }
    const c = e.target.closest("[data-st]"); if (c) openStudy(c.dataset.st);
  });
  page.addEventListener("keydown", e => { if (e.key === "Enter" && e.target.matches("[data-st]")) openStudy(e.target.dataset.st); });
  page.addEventListener("input", e => {
    if (!e.target.matches("[data-st-q]")) return;
    ui.stQ = e.target.value; const pos = e.target.selectionStart; renderStudies();
    const i = $("[data-st-q]"); i.focus(); i.setSelectionRange(pos, pos);
  });

  const xd = $("#xDlg");
  xd.addEventListener("click", e => {
    const t = e.target;
    const ed = t.closest("[data-st-edit]"); if (ed) { openStudyForm(ed.dataset.stEdit); return; }
    const del = t.closest("[data-st-del]");
    if (del) { const id = del.dataset.stDel; if (ui.confirmSt !== id) { ui.confirmSt = id; del.textContent = "Точно удалить вместе с файлами?"; return; } ui.confirmSt = null; deleteStudy(id); return; }
    const fi = t.closest("[data-file]");
    if (fi && ui.stOpen) { const f = state.studies[ui.stOpen].files[+fi.dataset.file]; openFile(f.path, f.name, f.mime); return; }
    if (!$("[data-st-form]")) return;
    const ar = t.closest("[data-area]"); if (ar) { $("[data-st-form] [name=area]").value = ar.dataset.area; refreshStudyForm(); return; }
    const lk = t.closest("[data-link]");
    if (lk) { const m = lk.dataset.link, s = ui.stEdit.links; s.has(m) ? s.delete(m) : s.add(m); if (t.closest("[data-link-sugg]")) { $("[data-link-q]").value = ""; $("[data-link-sugg]").innerHTML = ""; refreshStudyForm(); } else lk.setAttribute("aria-pressed", s.has(m)); return; }
    const rm = t.closest("[data-frm]"); if (rm) { ui.stEdit.removed.push(rm.dataset.frm); renderFileList(); return; }
    const rn = t.closest("[data-fnew]"); if (rn) { ui.stEdit.files.splice(+rn.dataset.fnew, 1); renderFileList(); return; }
  });
  xd.addEventListener("change", e => {
    const t = e.target; if (!$("[data-st-form]")) return;
    if (t.name === "type" || t.name === "date") refreshStudyForm();
    if (t.matches("[data-files]")) { addPicked(t.files); t.value = ""; }
  });
  xd.addEventListener("input", e => {
    const t = e.target; if (!$("[data-st-form]")) return;
    if (t.name === "area") { clearTimeout(ui.areaT); ui.areaT = setTimeout(refreshStudyForm, 250); }
    if (t.matches("[data-link-q]")) {
      const q = t.value.trim();
      $("[data-link-sugg]").innerHTML = q ? CATALOG.filter(m => matches(info(m.id), q)).slice(0, 8).map(m => `<button type="button" class="tchip" data-link="${esc(m.id)}" aria-pressed="${ui.stEdit.links.has(m.id)}">${esc(m.ru)}</button>`).join("") : "";
    }
  });
  xd.addEventListener("submit", e => { if (e.target.matches("[data-st-form]")) { e.preventDefault(); saveStudy(); } });
  xd.addEventListener("dragover", e => { const d = e.target.closest("[data-drop]"); if (d) { e.preventDefault(); d.classList.add("over"); } });
  xd.addEventListener("dragleave", e => { const d = e.target.closest("[data-drop]"); if (d) d.classList.remove("over"); });
  xd.addEventListener("drop", e => { const d = e.target.closest("[data-drop]"); if (!d) return; e.preventDefault(); d.classList.remove("over"); addPicked(e.dataTransfer.files); });

  const lb = $("#lightbox");
  lb.addEventListener("click", e => { if (e.target === lb || e.target.closest("[data-lb-close]")) lb.close(); });

  setView(location.hash === "#studies" ? "studies" : "labs");
}
