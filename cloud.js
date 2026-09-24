// Cloud mode: Google sign-in through Supabase and two-way sync of `state`.
// app.js keeps working on the in-memory `state`; save() calls cloudSave(), which pushes only what changed.
"use strict";

const cloud = { client: null, user: null, synced: { results: {}, markers: {} }, timer: null, busy: false, again: false };

const RESULT_COLS = ["m", "date", "v", "unit", "min", "max", "lab", "note", "t"];
const toResultRow = (id, r) => ({ id, m: r.m, date: r.date || null, v: r.v ?? null, unit: r.unit || "", min: r.min ?? null, max: r.max ?? null, lab: r.lab || "", note: r.note || "", t: r.t ?? null });
const toMarkerRow = (id, m) => ({ id, ru: m.ru, uk: m.uk || "", en: m.en || "", abbr: m.abbr || "", grp: m.group || "other", unit: m.unit || "" });
const fromResultRow = row => Object.fromEntries(RESULT_COLS.map(k => [k, row[k] ?? (k === "unit" || k === "lab" || k === "note" ? "" : null)]));
const fromMarkerRow = row => ({ ru: row.ru, uk: row.uk, en: row.en, abbr: row.abbr, group: row.grp, unit: row.unit });
const snap = (rowFn, obj) => Object.fromEntries(Object.entries(obj).map(([id, v]) => [id, JSON.stringify(rowFn(id, v))]));

function cloudConfigured() { return !!(window.MEDCARD_CLOUD?.url && window.supabase?.createClient); }

async function cloudPull() {
  const c = cloud.client;
  const [res, mk] = await Promise.all([c.from("results").select("*"), c.from("markers").select("*")]);
  if (res.error) throw res.error;
  if (mk.error) throw mk.error;
  state.results = Object.fromEntries(res.data.map(r => [r.id, fromResultRow(r)]));
  state.markers = Object.fromEntries(mk.data.map(r => [r.id, fromMarkerRow(r)]));
  cloud.synced = { results: snap(toResultRow, state.results), markers: snap(toMarkerRow, state.markers) };
}

// push the difference between `state` and what the server last confirmed
async function cloudPush() {
  if (cloud.busy) { cloud.again = true; return; }
  cloud.busy = true;
  try {
    const c = cloud.client;
    for (const [table, obj, rowFn] of [["markers", state.markers, toMarkerRow], ["results", state.results, toResultRow]]) {
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
    setSyncState("ok");
  } catch (e) {
    console.error("sync failed", e);
    setSyncState("error");
  } finally {
    cloud.busy = false;
    if (cloud.again) { cloud.again = false; cloudPush(); }
  }
}
function cloudSave() { setSyncState("saving"); clearTimeout(cloud.timer); cloud.timer = setTimeout(cloudPush, 400); }

function setSyncState(s) {
  const el = document.getElementById("syncState"); if (!el) return;
  el.dataset.s = s;
  el.textContent = s === "saving" ? "Сохраняю…" : s === "error" ? "Не сохранилось — проверь интернет" : "Сохранено в облаке";
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
  document.getElementById("gate").hidden = true; document.body.classList.remove("gated");
  // show the last copy instantly, then refresh from the server
  try { const j = JSON.parse(localStorage.getItem("medcard.cloud." + cloud.user.id) || "null"); if (j) { state.results = j.results || {}; state.markers = j.markers || {}; } } catch (e) { /* ignore */ }
  renderAll(); renderAccount();
  try { await cloudPull(); renderAll(); renderAccount(); setSyncState("ok"); }
  catch (e) { console.error(e); setSyncState("error"); }
  document.getElementById("acct").addEventListener("click", e => {
    if (e.target.closest("#logoutBtn")) cloud.client.auth.signOut().then(() => location.reload());
    if (e.target.closest("#migrateBtn")) migrateLegacy();
  });
  cloud.client.auth.onAuthStateChange(ev => { if (ev === "SIGNED_OUT") location.reload(); });
}
