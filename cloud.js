// Cloud mode: Google sign-in through Supabase and two-way sync of `state`.
// app.js keeps working on the in-memory `state`; save() calls cloudSave(), which pushes only what changed.
// Nothing is pushed until the first download from the server has succeeded: a tab that started from its
// local copy and could not reach the server must not overwrite newer data with that copy. Until then edits
// wait in the pending list, and the download is retried.
"use strict";

const cloud = { client: null, user: null, synced: { results: {}, markers: {}, items: {} }, timer: null, busy: false, again: false, ready: false, connecting: false, tries: 0, base: null, bootPending: null };

const RESULT_COLS = ["m", "date", "v", "unit", "min", "max", "lab", "note", "t"];
const toResultRow = (id, r) => ({ id, m: r.m, date: r.date || null, v: r.v ?? null, unit: r.unit || "", min: r.min ?? null, max: r.max ?? null, lab: r.lab || "", note: r.note || "", t: r.t ?? null });
const toMarkerRow = (id, m) => ({ id, ru: m.ru, uk: m.uk || "", en: m.en || "", abbr: m.abbr || "", grp: m.group || "other", unit: m.unit || "" });
const fromResultRow = row => Object.fromEntries(RESULT_COLS.map(k => [k, row[k] ?? (k === "unit" || k === "lab" || k === "note" ? "" : null)]));
const fromMarkerRow = row => ({ ru: row.ru, uk: row.uk, en: row.en, abbr: row.abbr, group: row.grp, unit: row.unit });
// events and preferences live in one generic table: one row per event, one row for prefs
const itemsObj = (st = state) => ({
  ...Object.fromEntries(Object.entries(st.events || {}).map(([id, e]) => [id, { kind: "event", data: e }])),
  ...Object.fromEntries(Object.entries(st.studies || {}).map(([id, s]) => [id, { kind: "study", data: s }])),
  ...Object.fromEntries(Object.entries(st.symptoms || {}).map(([id, s]) => [id, { kind: "symptom", data: s }])),
  ...Object.fromEntries(Object.entries(st.days || {}).map(([d, x]) => [d, { kind: "day", data: x }])),
  prefs: { kind: "prefs", data: st.prefs || {} },
});
const ITEM_KEY = { event: "events", study: "studies", symptom: "symptoms", day: "days" };
const toItemRow = (id, x) => ({ id, kind: x.kind, data: x.data });
const snap = (rowFn, obj) => Object.fromEntries(Object.entries(obj).map(([id, v]) => [id, JSON.stringify(rowFn(id, v))]));

function cloudConfigured() { return !!(window.MEDCARD_CLOUD?.url && window.supabase?.createClient); }

async function cloudPull() {
  const c = cloud.client;
  const [res, mk, it] = await Promise.all([c.from("results").select("*"), c.from("markers").select("*"), c.from("items").select("*")]);
  if (res.error) throw res.error;
  if (mk.error) throw mk.error;
  if (it.error) throw it.error;
  state.results = Object.fromEntries(res.data.map(r => [r.id, fromResultRow(r)]));
  state.markers = Object.fromEntries(mk.data.map(r => [r.id, fromMarkerRow(r)]));
  cloud.itemsOk = true;
  {
    state.events = Object.fromEntries(it.data.filter(r => r.kind === "event").map(r => [r.id, r.data]));
    state.prefs = it.data.find(r => r.id === "prefs")?.data || {};
    state.studies = Object.fromEntries(it.data.filter(r => r.kind === "study").map(r => [r.id, r.data]));
    state.symptoms = Object.fromEntries(it.data.filter(r => r.kind === "symptom").map(r => [r.id, r.data]));
    state.days = Object.fromEntries(it.data.filter(r => r.kind === "day").map(r => [r.id, r.data]));
  }
  cloud.synced = { results: snap(toResultRow, state.results), markers: snap(toMarkerRow, state.markers), items: snap(toItemRow, itemsObj()) };
}

// push the difference between `state` and what the server last confirmed
async function cloudPush() {
  if (!cloud.ready) return;
  if (cloud.busy) { cloud.again = true; return; }
  cloud.busy = true;
  try {
    const c = cloud.client;
    for (const [table, obj, rowFn] of pushTables()) {
      const now = snap(rowFn, obj), was = cloud.synced[table];
      const up = Object.keys(now).filter(id => now[id] !== was[id]).map(id => JSON.parse(now[id]));
      const gone = Object.keys(was).filter(id => !(id in now));
      for (let i = 0; i < up.length; i += 500) {
        const { error } = await c.from(table).upsert(up.slice(i, i + 500), { onConflict: "user_id,id" });
        if (error) throw error;
      }
      if (gone.length) {
        const { error } = await c.from(table).delete().in("id", gone);
        if (error) throw error;
      }
      cloud.synced[table] = now;
    }
    keepPending();
    setSyncState("ok");
  } catch (e) {
    console.error("sync failed", e);
    setSyncState("error");
  } finally {
    cloud.busy = false;
    if (cloud.again) { cloud.again = false; cloudPush(); }
  }
}
// Changes this tab made but the server has not confirmed yet (tab closed within the push delay, no network)
// are kept in localStorage and sent on the next start instead of being overwritten by the server copy.
// Only the tab's own edits go there, so another open tab can never bring back a stale version.
const pendingKey = () => "medcard.pending." + cloud.user.id;
const pushTables = () => [["markers", state.markers, toMarkerRow], ["results", state.results, toResultRow], ["items", itemsObj(), toItemRow]];
// before the first download the reference is the local copy the tab started from, plus what was pending then
function keepPending() {
  const ref = cloud.ready ? cloud.synced : cloud.base; if (!ref) return;
  const out = cloud.ready ? {} : JSON.parse(JSON.stringify(cloud.bootPending || {}));
  for (const [table, obj, rowFn] of pushTables()) {
    const now = snap(rowFn, obj), was = ref[table] || {}, ch = out[table] || {};
    for (const id of Object.keys(now)) if (now[id] !== was[id]) ch[id] = now[id];
    for (const id of Object.keys(was)) if (!(id in now)) ch[id] = null;
    if (Object.keys(ch).length) out[table] = ch;
  }
  try { if (Object.keys(out).length) localStorage.setItem(pendingKey(), JSON.stringify(out)); else localStorage.removeItem(pendingKey()); } catch (e) { /* cache only */ }
}
function restorePending(p) {
  let n = 0;
  for (const [table, ch] of Object.entries(p || {})) {
    for (const [id, json] of Object.entries(ch)) {
      const row = json && JSON.parse(json); n++;
      if (table === "results") { if (row) state.results[id] = fromResultRow(row); else delete state.results[id]; }
      else if (table === "markers") { if (row) state.markers[id] = fromMarkerRow(row); else delete state.markers[id]; }
      else if (id === "prefs") { if (row) state.prefs = row.data; }
      else if (row) (state[ITEM_KEY[row.kind]] ||= {})[id] = row.data;
      else Object.values(ITEM_KEY).forEach(k => { if (state[k]) delete state[k][id]; });
    }
  }
  return n;
}

function cloudSave() {
  keepPending();
  if (!cloud.ready) { setSyncState("offline"); return; }
  setSyncState("saving"); clearTimeout(cloud.timer); cloud.timer = setTimeout(cloudPush, 400);
}
// first download; on failure retry with a growing pause (and at once when the network comes back)
async function cloudConnect() {
  if (cloud.ready || cloud.connecting) return;
  cloud.connecting = true;
  try { await cloudPull(); }
  catch (e) {
    console.error("cloud download failed", e); setSyncState("offline");
    cloud.tries++; setTimeout(cloudConnect, Math.min(60000, 2000 * 2 ** Math.min(cloud.tries, 5)));
    return;
  } finally { cloud.connecting = false; }
  cloud.ready = true;
  let pending = null;
  try { pending = JSON.parse(localStorage.getItem(pendingKey()) || "null"); } catch (e) { /* ignore */ }
  const unsent = restorePending(pending), seeded = sySeedMerge();
  if (unsent || seeded) save(); else keepPending();
  renderAll(); renderAccount(); setSyncState("ok");
  if (unsent) toast("Отправлено в облако то, что не успело сохраниться");
}

function setSyncState(s) {
  const el = document.getElementById("syncState"); if (!el) return;
  el.dataset.s = s;
  el.textContent = s === "saving" ? "Сохраняю…" : s === "error" ? "Не сохранилось — проверь интернет" : s === "offline" ? "Нет связи с облаком — сохранено в браузере" : "Сохранено в облаке";
  if (s === "error") setTimeout(() => cloudPush(), 5000);
}

// data this browser kept before sign-in (the offline version of the site)
function localLegacy() {
  try { const j = JSON.parse(localStorage.getItem("medcard.v1") || "null"); return j && Object.keys(j.results || {}).length ? j : null; } catch (e) { return null; }
}

function renderAccount() {
  const box = document.getElementById("acct"); if (!box) return;
  const u = cloud.user, legacy = localLegacy();
  const name = u.user_metadata?.full_name || u.email;
  box.innerHTML = `
    <div class="acct-who"><b>${esc(name)}</b><span>${esc(u.email || "")}</span></div>
    <span class="sync" id="syncState" data-s="ok">Сохранено в облаке</span>
    ${legacy && !localStorage.getItem("medcard.migrated") ? `<button id="migrateBtn">Перенести анализы из этого браузера (${Object.keys(legacy.results).length})</button>` : ""}
    <button id="logoutBtn">Выйти</button>`;
}

async function migrateLegacy() {
  const legacy = localLegacy(); if (!legacy) return;
  const have = new Set(Object.values(state.results).map(r => r.m + "|" + r.date + "|" + r.v));
  let n = 0;
  for (const [id, r] of Object.entries(legacy.results)) {
    if (have.has(r.m + "|" + r.date + "|" + r.v)) continue;
    state.results[id in state.results ? newId("r") : id] = r; n++;
  }
  Object.assign(state.markers, legacy.markers || {});
  try { localStorage.setItem("medcard.migrated", "1"); } catch (e) { /* ignore */ }
  save(); renderAll(); renderAccount();
  toast(n ? `Перенесено: ${n} ${plural(n, "замер", "замера", "замеров")}` : "Всё уже было в облаке");
}

function showGate(msg) {
  const g = document.getElementById("gate");
  g.hidden = false; document.body.classList.add("gated");
  document.getElementById("gateMsg").textContent = msg || "";
}

async function signIn() {
  const btn = document.getElementById("googleBtn"); btn.disabled = true;
  const { error } = await cloud.client.auth.signInWithOAuth({ provider: "google", options: { redirectTo: location.origin + location.pathname } });
  if (error) { btn.disabled = false; showGate("Не получилось начать вход: " + error.message); }
}

async function cloudBoot() {
  cloud.client = window.supabase.createClient(window.MEDCARD_CLOUD.url, window.MEDCARD_CLOUD.key);
  document.getElementById("googleBtn").addEventListener("click", signIn);
  const { data: { session } } = await cloud.client.auth.getSession();
  if (!session) { showGate(); return; }
  cloud.user = session.user;
  document.getElementById("localNote")?.remove(); // the browser-only warning is for offline mode
  document.getElementById("gate").hidden = true; document.body.classList.remove("gated");
  // show the last copy instantly, then refresh from the server
  try { cloud.bootPending = JSON.parse(localStorage.getItem(pendingKey()) || "null"); } catch (e) { /* ignore */ }
  try { const j = JSON.parse(localStorage.getItem("medcard.cloud." + cloud.user.id) || "null"); if (j) { state.results = j.results || {}; state.markers = j.markers || {}; state.events = j.events || {}; state.prefs = j.prefs || {}; state.studies = j.studies || {}; state.symptoms = j.symptoms || {}; state.days = j.days || {}; } } catch (e) { /* ignore */ }
  cloud.base = Object.fromEntries(pushTables().map(([table, obj, rowFn]) => [table, snap(rowFn, obj)]));
  renderAll(); renderAccount();
  addEventListener("online", cloudConnect);
  await cloudConnect();
  document.getElementById("acct").addEventListener("click", e => {
    if (e.target.closest("#logoutBtn")) cloud.client.auth.signOut().then(() => location.reload());
    if (e.target.closest("#migrateBtn")) migrateLegacy();
  });
  cloud.client.auth.onAuthStateChange(ev => { if (ev === "SIGNED_OUT") location.reload(); });
}
