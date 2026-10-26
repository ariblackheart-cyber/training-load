"use strict";
/* ================= Utilitas ================= */
const $ = id => document.getElementById(id);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const MON3 = ["Jan","Feb","Mar","Apr","Mei","Jun","Jul","Agu","Sep","Okt","Nov","Des"];
const DAYS = ["Minggu","Senin","Selasa","Rabu","Kamis","Jumat","Sabtu"];
const nf1 = v => Number(v).toLocaleString("id-ID", { maximumFractionDigits: 1 });
const dur = s => { s = Math.round(s); const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), d = s % 60; return (h ? h + ":" + String(m).padStart(2, "0") : m) + ":" + String(d).padStart(2, "0"); };
const pace = (s, m) => { if (!m || m < 100) return null; const p = s / (m / 1000); return Math.floor(p / 60) + ":" + String(Math.round(p % 60)).padStart(2, "0"); };
const intOrNull = v => { v = String(v ?? "").trim(); if (!v) return null; const n = parseInt(v, 10); return isNaN(n) ? NaN : n; };
const decOrNull = v => { v = String(v ?? "").trim().replace(",", "."); if (!v) return null; const n = parseFloat(v); return isNaN(n) ? NaN : n; };
const redirectUrl = () => location.origin + location.pathname;
function setMsg(id, text, ok) { const el = $(id); el.textContent = text || ""; el.className = "msg" + (ok ? " ok" : ""); }
function friendlyError(e) {
  const m = (e && (e.message || e.error_description || String(e))) || "";
  if (/Invalid login credentials/i.test(m)) return "Email atau kata sandi salah.";
  if (/Email not confirmed/i.test(m)) return "Email belum dikonfirmasi. Buka email dari Supabase lalu ketuk tautan konfirmasinya.";
  if (/already registered/i.test(m)) return "Email ini sudah terdaftar. Silakan masuk.";
  if (/rate limit|too many/i.test(m)) return "Terlalu banyak percobaan. Tunggu beberapa menit lalu coba lagi.";
  if (/Failed to fetch|NetworkError|network/i.test(m)) return "Tidak tersambung ke internet. Periksa koneksimu.";
  if (/relation .* does not exist|sl_runs|sl_checkins|sl_profile/i.test(m) && /exist|find/i.test(m)) return "Tabel Training Load belum dibuat. Jalankan schema.sql di SQL Editor Supabase.";
  if (/check constraint/i.test(m)) return "Ada angka di luar batas wajar. Periksa lagi isiannya.";
  if (/weak|Password should/i.test(m)) return "Kata sandi terlalu lemah. Pakai minimal 8 karakter dengan angka dan simbol.";
  if (/JWT|session/i.test(m)) return "Sesi berakhir. Silakan masuk lagi.";
  return m || "Terjadi kesalahan. Coba lagi.";
}
function show(screen) { ["loading", "authScreen", "resetScreen", "app"].forEach(id => $(id).hidden = id !== screen); }

/* ================= Supabase ================= */
if (!window.supabase || !window.DOMPETKU_CONFIG) {
  $("loading").querySelector("p").textContent = "Gagal memuat. Periksa koneksi internet lalu muat ulang halaman.";
  throw new Error("supabase-js tidak termuat");
}
const sb = window.supabase.createClient(DOMPETKU_CONFIG.url, DOMPETKU_CONFIG.key, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });

const state = { user: null, profile: { hr_max: 190, hr_rest: null, sex: "L" }, runs: [], checkins: [], shown: 30, ci: { soreness: null, mood: null }, rpe: null, loaded: false };

/* ================= Masuk ================= */
let mode = "login", routing = false, recovering = false;
function setMode(m) {
  mode = m;
  $("tabLogin").setAttribute("aria-selected", m === "login"); $("tabSignup").setAttribute("aria-selected", m === "signup");
  $("pass2Field").hidden = m === "login"; $("forgotBtn").hidden = m !== "login";
  $("authBtn").textContent = m === "login" ? "Masuk" : "Daftar";
  $("password").autocomplete = m === "login" ? "current-password" : "new-password";
  setMsg("authErr", "");
}
$("tabLogin").onclick = () => setMode("login");
$("tabSignup").onclick = () => setMode("signup");
$("authForm").addEventListener("submit", async e => {
  e.preventDefault();
  const email = $("email").value.trim(), pw = $("password").value;
  if (mode === "signup") {
    if (pw.length < 8) return setMsg("authErr", "Kata sandi minimal 8 karakter.");
    if (pw !== $("password2").value) return setMsg("authErr", "Kedua kata sandi tidak sama.");
  }
  $("authBtn").disabled = true; setMsg("authErr", mode === "login" ? "Masuk…" : "Mendaftar…", true);
  try {
    if (mode === "login") { const { error } = await sb.auth.signInWithPassword({ email, password: pw }); if (error) throw error; setMsg("authErr", ""); }
    else {
      const { data, error } = await sb.auth.signUp({ email, password: pw, options: { emailRedirectTo: redirectUrl() } });
      if (error) throw error;
      setMsg("authErr", data.session ? "" : "Pendaftaran berhasil. Cek email " + email + " dan ketuk tautan konfirmasi, lalu masuk di sini.", true);
    }
  } catch (er) { setMsg("authErr", friendlyError(er)); }
  $("authBtn").disabled = false;
});
$("forgotBtn").addEventListener("click", async () => {
  const email = $("email").value.trim();
  if (!email) return setMsg("authErr", "Isi email dulu, lalu ketuk Lupa kata sandi.");
  const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: redirectUrl() });
  setMsg("authErr", error ? friendlyError(error) : "Tautan untuk membuat kata sandi baru sudah dikirim ke " + email + ".", !error);
});
$("resetScreen").addEventListener("submit", async e => {
  e.preventDefault();
  const p = $("newPw").value;
  if (p.length < 8) return setMsg("resetErr", "Kata sandi minimal 8 karakter.");
  if (p !== $("newPw2").value) return setMsg("resetErr", "Kedua kata sandi tidak sama.");
  const { error } = await sb.auth.updateUser({ password: p });
  if (error) return setMsg("resetErr", friendlyError(error));
  recovering = false; history.replaceState(null, "", redirectUrl()); route();
});
$("logoutBtn").addEventListener("click", () => sb.auth.signOut());

async function route() {
  if (routing || recovering) return; routing = true;
  try {
    const { data: { session } } = await sb.auth.getSession();
    if (!session) { state.user = null; show("authScreen"); setMode(mode); return; }
    state.user = session.user;
    show("app"); $("whoami").textContent = "Masuk sebagai " + (state.user.email || "");
    await loadAll();
  } catch (er) { show("authScreen"); setMsg("authErr", friendlyError(er)); }
  finally { routing = false; }
}

/* ================= Data ================= */
async function loadAll() {
  const since = Core.dayKey(Date.now() - 400 * Core.DAY);
  const [p, r, c] = await Promise.all([
    sb.from("sl_profile").select("*").maybeSingle(),
    sb.from("sl_runs").select("id,started_at,title,duration_s,distance_m,avg_hr,max_hr,ascent_m,rpe,treadmill,source").order("started_at", { ascending: false }).limit(5000),
    sb.from("sl_checkins").select("day,rhr,rmssd,sdnn,body_battery,sleep_h,soreness,mood,note,source").gte("day", since).order("day")
  ]);
  for (const x of [p, r, c]) if (x.error) throw x.error;
  if (p.data) state.profile = p.data;
  state.runs = r.data; state.checkins = c.data.map(x => ({ ...x, rmssd: x.rmssd != null ? Number(x.rmssd) : null, sdnn: x.sdnn != null ? Number(x.sdnn) : null, sleep_h: x.sleep_h != null ? Number(x.sleep_h) : null }));
  state.loaded = true;
  fillCheckinForm(); fillProfileForm(); renderAll();
}
function params() {
  const recent = state.checkins.filter(c => c.rhr != null && c.day >= Core.dayKey(Date.now() - 30 * Core.DAY)).map(c => c.rhr).sort((a, b) => a - b);
  const auto = recent.length >= 3 ? recent[Math.floor(recent.length / 2)] : null;
  return { hrMax: state.profile.hr_max || 190, hrRest: state.profile.hr_rest || auto || 60, sex: state.profile.sex || "L", autoRest: auto, lthr: state.profile.lthr || null };
}
const today = () => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), d.getDate()); };
const todayCheckin = () => state.checkins.find(c => c.day === Core.dayKey(today()));
let ciDay = null; // tanggal yang sedang diisi di form check-in (kunci yyyy-mm-dd)
const ciKey = () => ciDay || Core.dayKey(today());
const ciCheckin = () => state.checkins.find(c => c.day === ciKey());
const shortDay = k => { const d = Core.fromKey(k); return d.getDate() + " " + MON3[d.getMonth()]; };

/* ================= Tampilan: Hari ini ================= */
function renderAll() { renderReady(); renderLoad(); renderRuns(); renderCiTable(); renderProfileNote(); renderZones(); }

function renderReady() {
  const t = today(), d = new Date();
  $("todayLabel").textContent = DAYS[d.getDay()] + ", " + d.getDate() + " " + MON3[d.getMonth()];
  const load = Core.loadStatus(t, state.runs, params());
  const R = Core.readiness(state.checkins, t, load);
  const card = $("readyCard");
  if (R.score == null) {
    card.className = "ready";
    card.innerHTML = `<span class="label">Kesiapan hari ini</span>
      <h2>${R.parts.length ? "Datanya belum cukup untuk skor" : "Isi check-in pagi dulu"}</h2>
      <p class="muted">${R.parts.length ? "HRV dan detak istirahat butuh beberapa hari data sebagai pembanding. Isi juga tidur, Body Battery, pegal, dan mood supaya skor bisa dihitung." : "Isi detak istirahat, Body Battery, tidur, pegal, dan mood di bawah. Hanya butuh sekitar 30 detik."}</p>
      ${R.parts.length ? factorList(R.parts) : ""}`;
    return;
  }
  const s = R.score, idx = Core.LEVELS.length - 1 - Core.LEVELS.findIndex(x => x.key === R.level);
  const lanes = [...Core.LEVELS].reverse().map((lv, i) => {
    const lo = i === 0 ? 0 : lv.min, hi = i === 4 ? 100 : Core.LEVELS[Core.LEVELS.length - 1 - i - 1].min - 1, on = i === idx;
    const pos = on ? Math.min(100, Math.max(0, (s - lo) / Math.max(1, hi - lo) * 100)) : null;
    return `<div class="lane${on ? " on" : ""}" title="${lo}–${hi}: ${lv.mood}"><span class="em">${lv.emoji}</span><span class="bar">${on ? `<span class="pin" style="left:${pos}%"></span>` : ""}</span><span class="rng">${lo}–${hi}</span></div>`;
  }).join("");
  card.className = "ready " + R.level;
  card.innerHTML = `<span class="label">Kesiapan hari ini</span>
    <svg class="bolt-bg" viewBox="0 0 24 36" aria-hidden="true"><path d="${BOLT}"/></svg>
    <div class="score-row">${boltMeter(s)}
      <div class="score num" aria-label="Skor ${s} dari 100, ${esc(R.advice.mood)}">${s}<small>/100</small></div>
      <div class="verdict"><span class="mood"><span class="emoji" aria-hidden="true">${R.advice.emoji}</span> ${esc(R.advice.mood)}</span><h2>${esc(R.advice.title)}</h2><p>${esc(R.advice.text)}</p></div></div>
    <div class="scale5" aria-hidden="true">${lanes}</div>
    ${factorList(R.parts)}
    ${R.coverage < 50 ? `<p class="coverage">Skor ini hanya dari sebagian data. Lengkapi check-in supaya lebih akurat.</p>` : ""}
    <p class="disclaim">Panduan latihan, bukan saran medis. Kalau sakit, demam, atau nyeri dada, jangan lari.</p>`;
}
const BOLT = "M15 1 3 21h9l-3 14 13-21h-9z";
// petir terisi dari bawah sesuai skor
function boltMeter(score) {
  const y = 36 - 36 * Math.max(0, Math.min(100, score)) / 100;
  return `<svg class="bolt-meter" viewBox="0 0 24 36" aria-hidden="true"><defs><clipPath id="bm"><rect x="0" y="${y}" width="24" height="${36 - y}"/></clipPath></defs>
    <path d="${BOLT}" class="empty"/><path d="${BOLT}" class="full" clip-path="url(#bm)"/><path d="${BOLT}" class="edge"/></svg>`;
}
function factorList(parts) {
  return `<ul class="factors">${parts.map(p => `<li class="${p.tone}"><span class="dot"></span><span><b>${esc(p.name)}</b> · ${esc(p.text)}</span></li>`).join("")}</ul>`;
}

function renderLoad() {
  const p = params(), t = today(), L = Core.loadStatus(t, state.runs, p);
  const pill = L.ratio == null ? "" : `<span class="pill ${L.status}">${esc(L.label)}</span>`;
  $("loadTiles").innerHTML =
    `<div class="tile"><span class="k">7 hari</span><span class="v">${Math.round(L.acute)}</span></div>` +
    `<div class="tile"><span class="k">Rata-rata / minggu</span><span class="v">${Math.round(L.weeklyAvg)}</span></div>` +
    `<div class="tile"><span class="k">Rasio</span><span class="v">${L.ratio == null || L.status === "jeda" || L.status === "awal" ? "–" : L.ratio.toFixed(2).replace(".", ",")}</span></div>`;
  const last = state.runs[0];
  $("loadNote").innerHTML = (pill ? pill + " " : "") + (L.status === "jeda" ? "Kalau kamu memang libur, mulai lagi dengan bertahap. Kalau datanya belum masuk, impor dulu di tab Data." :
    L.status === "kosong" ? "Catat lari atau impor dari Garmin untuk mulai menghitung beban." :
    last ? `Lari terakhir ${relDay(last.started_at)}.` : "");
  // grafik 12 minggu
  const weeks = Core.weeklySeries(L.map, t, 12);
  const W = 360, H = 150, pl = 30, pr = 14, pb = 20, pt = 14, bw = (W - pl - pr) / weeks.length;
  const max = Math.max(50, ...weeks.map(w => w.load));
  const step = [50, 100, 200, 250, 500, 1000].find(x => max / x <= 5) || 2000, top = Math.ceil(max / step) * step;
  const sy = v => pt + (H - pt - pb) * (1 - v / top);
  let svg = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Beban latihan per minggu, 12 minggu terakhir">`;
  for (let v = 0; v <= top; v += step) svg += `<line x1="${pl}" x2="${W - pr}" y1="${sy(v)}" y2="${sy(v)}" stroke="var(--line)" stroke-width="0.6"/><text x="${pl - 4}" y="${sy(v) + 3}" text-anchor="end">${v}</text>`;
  weeks.forEach((w, i) => {
    const x = pl + i * bw + bw * .18, cur = i === weeks.length - 1, bwid = bw * .64;
    if (w.load > 0) svg += `<rect x="${x}" y="${sy(w.load)}" width="${bwid}" height="${Math.max(1, H - pb - sy(w.load))}" rx="2" fill="${cur ? "var(--track)" : "var(--accent)"}" opacity="${cur ? 1 : .7}"><title>Minggu ${w.start.getDate()} ${MON3[w.start.getMonth()]}: ${Math.round(w.load)}</title></rect>`;
    if (w.load > 0) svg += `<text x="${x + bwid / 2}" y="${sy(w.load) - 3}" text-anchor="middle" style="fill:var(--ink)">${Math.round(w.load)}</text>`;
    if (i % 2 === 1 || cur) svg += `<text x="${x + bwid / 2}" y="${H - 6}" text-anchor="middle" style="${cur ? "fill:var(--ink);font-weight:600" : ""}">${w.start.getDate()} ${MON3[w.start.getMonth()]}</text>`;
  });
  $("weekChart").innerHTML = svg + "</svg>";
}
function relDay(iso) {
  const d = new Date(iso), n = Math.round((today() - new Date(d.getFullYear(), d.getMonth(), d.getDate())) / Core.DAY);
  return n === 0 ? "hari ini" : n === 1 ? "kemarin" : n < 30 ? n + " hari lalu" : d.getDate() + " " + MON3[d.getMonth()] + " " + d.getFullYear();
}

/* ----- check-in ----- */
const SORE = ["Tidak", "Sedikit", "Sedang", "Berat", "Nyeri"], MOOD = ["Buruk", "Kurang", "Biasa", "Baik", "Prima"];
function renderScale(id, labels, key) {
  $(id).innerHTML = labels.map((l, i) => `<button type="button" class="chip" data-v="${i + 1}" aria-pressed="${state.ci[key] === i + 1}">${l}</button>`).join("");
}
function fillCheckinForm() {
  const k = ciKey(), isToday = k === Core.dayKey(today());
  $("ciDate").max = Core.dayKey(today()); $("ciDate").value = k; $("ciToday").hidden = isToday;
  const c = ciCheckin() || {};
  $("ciRhr").value = c.rhr ?? ""; $("ciBb").value = c.body_battery ?? ""; $("ciSleep").value = c.sleep_h != null ? String(c.sleep_h).replace(".", ",") : ""; $("ciRmssd").value = c.rmssd != null ? String(c.rmssd).replace(".", ",") : "";
  state.ci = { soreness: c.soreness ?? null, mood: c.mood ?? null };
  renderScale("ciSore", SORE, "soreness"); renderScale("ciMood", MOOD, "mood");
  $("checkinState").textContent = ciCheckin() ? "Sudah diisi, bisa diubah" : (isToday ? "Belum diisi hari ini" : "Belum diisi untuk " + shortDay(k));
}
$("ciDate").addEventListener("change", e => {
  const v = e.target.value, t = Core.dayKey(today());
  ciDay = !v || v >= t ? null : v; setMsg("checkinMsg", ""); fillCheckinForm();
});
$("ciToday").addEventListener("click", () => { ciDay = null; setMsg("checkinMsg", ""); fillCheckinForm(); });
$("ciSore").addEventListener("click", e => { const b = e.target.closest("[data-v]"); if (!b) return; const v = +b.dataset.v; state.ci.soreness = state.ci.soreness === v ? null : v; renderScale("ciSore", SORE, "soreness"); });
$("ciMood").addEventListener("click", e => { const b = e.target.closest("[data-v]"); if (!b) return; const v = +b.dataset.v; state.ci.mood = state.ci.mood === v ? null : v; renderScale("ciMood", MOOD, "mood"); });
$("checkinForm").addEventListener("submit", async e => {
  e.preventDefault();
  const rhr = intOrNull($("ciRhr").value), bb = intOrNull($("ciBb").value), sl = decOrNull($("ciSleep").value), rm = decOrNull($("ciRmssd").value);
  if (Number.isNaN(rhr) || (rhr != null && (rhr < 30 || rhr > 120))) return setMsg("checkinMsg", "Detak istirahat biasanya antara 30 dan 120 bpm.");
  if (Number.isNaN(bb) || (bb != null && (bb < 0 || bb > 100))) return setMsg("checkinMsg", "Body Battery antara 0 dan 100.");
  if (Number.isNaN(sl) || (sl != null && (sl < 0 || sl > 16))) return setMsg("checkinMsg", "Isi lama tidur dalam jam, misalnya 7,5.");
  if (Number.isNaN(rm) || (rm != null && (rm < 1 || rm > 300))) return setMsg("checkinMsg", "RMSSD biasanya antara 10 dan 150 ms.");
  const old = ciCheckin() || {};
  const row = { day: ciKey(), rhr, body_battery: bb, sleep_h: sl, rmssd: rm, sdnn: old.sdnn ?? null, soreness: state.ci.soreness, mood: state.ci.mood, note: old.note ?? null,
    source: old.source && old.source !== "manual" ? "campuran" : "manual", updated_at: new Date().toISOString() };
  if ([rhr, bb, sl, rm, row.soreness, row.mood].every(v => v == null)) return setMsg("checkinMsg", "Isi minimal satu kolom dulu.");
  setMsg("checkinMsg", "Menyimpan…", true);
  const { error } = await sb.from("sl_checkins").upsert(row, { onConflict: "user_id,day" });
  if (error) return setMsg("checkinMsg", friendlyError(error));
  state.checkins = state.checkins.filter(c => c.day !== row.day).concat(row).sort((a, b) => a.day < b.day ? -1 : 1);
  const savedToday = row.day === Core.dayKey(today());
  if (savedToday) setMsg("checkinMsg", "Check-in tersimpan.", true);
  else {
    // isi mundur: lanjut otomatis ke hari berikutnya
    const nx = Core.fromKey(row.day); nx.setDate(nx.getDate() + 1); const nk = Core.dayKey(nx);
    ciDay = nk >= Core.dayKey(today()) ? null : nk;
    setMsg("checkinMsg", `Check-in ${shortDay(row.day)} tersimpan. Lanjut ke ${shortDay(ciKey())}.`, true);
  }
  fillCheckinForm(); renderReady(); renderLoad(); renderCiTable(); renderProfileNote();
  if (savedToday) $("readyCard").scrollIntoView({ behavior: "smooth", block: "start" });
});

/* ================= Tampilan: Lari ================= */
function renderRuns() {
  const p = params();
  $("runCount").textContent = state.runs.length ? state.runs.length + " lari" : "";
  if (!state.runs.length) { $("runList").innerHTML = `<p class="muted">Belum ada lari. Catat di atas, unggah file .fit, atau impor CSV Garmin di tab Data.</p>`; $("moreRuns").hidden = true; return; }
  $("runList").innerHTML = state.runs.slice(0, state.shown).map(r => {
    const zn = Core.zoneOf(r.avg_hr, curZones()), d = new Date(r.started_at), t = Core.runLoad(r, p), pc = pace(r.duration_s, r.distance_m), est = Core.estRpe(r, p), gap = r.rpe && est ? r.rpe - est : 0;
    return `<article class="run">
      <div class="r1"><div><div class="title">${esc(r.title || Core.autoTitle(r))}${zn ? `<span class="zbadge z${zn}" title="Zona ${zn} menurut HR rata-rata">Z${zn}</span>` : ""}</div>
        <div class="when">${DAYS[d.getDay()]}, ${d.getDate()} ${MON3[d.getMonth()]} ${d.getFullYear()} · ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}</div></div>
        <div class="trimp">${t ? Math.round(t) : "–"}<small>beban${!r.avg_hr && r.rpe ? " (RPE)" : ""}</small></div></div>
      <div class="stats">${r.distance_m ? `<span><b>${nf1(r.distance_m / 1000)}</b> km</span>` : ""}<span><b>${dur(r.duration_s)}</b></span>${pc ? `<span><b>${pc}</b> /km</span>` : ""}${r.avg_hr ? `<span>HR <b>${r.avg_hr}</b>${r.max_hr ? `/<b>${r.max_hr}</b>` : ""}</span>` : `<span class="muted">tanpa HR</span>`}${r.ascent_m ? `<span>↑<b>${r.ascent_m}</b> m</span>` : ""}</div>
      <div class="r3"><label class="when">RPE <select data-rpe="${esc(r.id)}" aria-label="RPE untuk lari ini"><option value="">${est ? "≈" + est + " (perkiraan)" : "–"}</option>${Array.from({ length: 10 }, (_, i) => `<option value="${i + 1}"${r.rpe === i + 1 ? " selected" : ""}>${i + 1}</option>`).join("")}</select></label>${gap >= 2 ? `<span class="rpe-flag">Terasa lebih berat dari biasanya (HR menunjukkan ≈${est})</span>` : ""}
        <span class="src">${{ csv: "impor CSV", fit: "file FIT", manual: "dicatat" }[r.source] || ""}</span>
        <button class="del" data-del="${esc(r.id)}">Hapus</button></div>
    </article>`;
  }).join("");
  $("moreRuns").hidden = state.runs.length <= state.shown;
}
$("moreRuns").addEventListener("click", () => { state.shown += 30; renderRuns(); });
$("runList").addEventListener("change", async e => {
  const s = e.target.closest("[data-rpe]"); if (!s) return;
  const id = s.dataset.rpe, v = s.value ? +s.value : null, run = state.runs.find(r => r.id === id); if (!run) return;
  const prev = run.rpe; run.rpe = v;
  const { error } = await sb.from("sl_runs").update({ rpe: v }).eq("id", id);
  if (error) { run.rpe = prev; renderRuns(); alertRuns(friendlyError(error)); return; }
  if (!run.avg_hr) renderAll(); else renderRuns();
});
let delArm = null;
$("runList").addEventListener("click", async e => {
  const b = e.target.closest("[data-del]"); if (!b) return;
  if (delArm !== b.dataset.del) { delArm = b.dataset.del; b.textContent = "Ketuk lagi untuk hapus"; b.classList.add("confirm"); setTimeout(() => { if (delArm === b.dataset.del) { delArm = null; b.textContent = "Hapus"; b.classList.remove("confirm"); } }, 4000); return; }
  delArm = null;
  const { error } = await sb.from("sl_runs").delete().eq("id", b.dataset.del);
  if (error) return alertRuns(friendlyError(error));
  state.runs = state.runs.filter(r => r.id !== b.dataset.del); renderAll();
});
function alertRuns(t) { setMsg("fitMsg", t); }

/* ----- catat lari manual ----- */
function initRunForm() {
  const d = new Date(); $("rDate").value = Core.dayKey(d); $("rTime").value = String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0");
  state.rpe = null; renderRpe();
}
function renderRpe() { $("rRpe").innerHTML = Array.from({ length: 10 }, (_, i) => `<button type="button" class="chip" data-v="${i + 1}" aria-pressed="${state.rpe === i + 1}" title="${["Sangat ringan", "", "Ringan", "", "Sedang", "", "Berat", "", "Sangat berat", "Maksimal"][i]}">${i + 1}</button>`).join(""); }
$("rRpe").addEventListener("click", e => { const b = e.target.closest("[data-v]"); if (!b) return; state.rpe = state.rpe === +b.dataset.v ? null : +b.dataset.v; renderRpe(); });
$("runForm").addEventListener("submit", async e => {
  e.preventDefault();
  const [y, m, d] = $("rDate").value.split("-").map(Number), [hh, mm] = ($("rTime").value || "06:00").split(":").map(Number);
  const start = new Date(y, m - 1, d, hh, mm);
  if (start > new Date(Date.now() + 3600e3)) return setMsg("runMsg", "Tanggal lari belum terjadi.");
  const ds = Core.hms($("rDur").value.trim().replace(/\./g, ":"));
  if (!ds || ds < 60) return setMsg("runMsg", "Isi durasi, misalnya 0:45:30 atau 45:30.");
  const km = decOrNull($("rDist").value), hr = intOrNull($("rHr").value), hrm = intOrNull($("rHrMax").value);
  if (Number.isNaN(km) || (km != null && (km <= 0 || km > 300))) return setMsg("runMsg", "Isi jarak dalam km, misalnya 7,5.");
  if (Number.isNaN(hr) || (hr != null && (hr < 60 || hr > 230))) return setMsg("runMsg", "HR rata-rata biasanya antara 90 dan 200.");
  if (Number.isNaN(hrm) || (hrm != null && (hrm < 60 || hrm > 240))) return setMsg("runMsg", "HR maksimal tidak wajar.");
  if (hr == null && state.rpe == null) return setMsg("runMsg", "Isi HR rata-rata atau RPE supaya beban bisa dihitung.");
  const row = { started_at: start.toISOString(), duration_s: Math.round(ds), distance_m: km != null ? Math.round(km * 1000) : null, avg_hr: hr, max_hr: hrm, rpe: state.rpe, source: "manual" };
  setMsg("runMsg", "Menyimpan…", true);
  const { data, error } = await sb.from("sl_runs").upsert(row, { onConflict: "user_id,started_at" }).select().single();
  if (error) return setMsg("runMsg", friendlyError(error));
  state.runs = state.runs.filter(r => r.id !== data.id && r.started_at !== data.started_at).concat(data).sort((a, b) => a.started_at < b.started_at ? 1 : -1);
  setMsg("runMsg", "Lari tersimpan. Beban: " + Math.round(Core.runLoad(data, params())) + (data.avg_hr ? "." : " (diperkirakan dari RPE)."), true);
  ["rDur", "rDist", "rHr", "rHrMax"].forEach(id => $(id).value = ""); initRunForm(); renderAll();
});

/* ----- unggah FIT ----- */
$("fitFile").addEventListener("change", async e => {
  const files = [...e.target.files]; e.target.value = ""; if (!files.length) return;
  setMsg("fitMsg", "Membaca " + files.length + " file…", true);
  const rows = [], bad = [];
  for (const f of files) {
    try { rows.push(Core.fitToRun(FitParse.parse(await f.arrayBuffer()), f.name)); }
    catch (er) { bad.push(f.name + ": " + er.message); }
  }
  if (!rows.length) return setMsg("fitMsg", bad.join(" "));
  const n = await saveRuns(rows, "fitMsg"); if (n == null) return;
  setMsg("fitMsg", `${n} lari dari file FIT tersimpan.` + (bad.length ? " Gagal: " + bad.join("; ") : ""), !bad.length);
});
async function saveRuns(rows, msgId) {
  // satu jam mulai = satu lari; baris dalam satu batch juga tidak boleh dobel
  const uniq = [...new Map(rows.map(r => [r.started_at, r])).values()];
  for (let i = 0; i < uniq.length; i += 300) {
    const { error } = await sb.from("sl_runs").upsert(uniq.slice(i, i + 300), { onConflict: "user_id,started_at" });
    if (error) { setMsg(msgId, friendlyError(error)); return null; }
  }
  const { data, error } = await sb.from("sl_runs").select("id,started_at,title,duration_s,distance_m,avg_hr,max_hr,ascent_m,rpe,treadmill,source").order("started_at", { ascending: false }).limit(5000);
  if (!error) state.runs = data;
  renderAll();
  return uniq.length;
}

/* ================= Tampilan: Data ================= */
$("csvFile").addEventListener("change", async e => {
  const f = e.target.files[0]; e.target.value = ""; if (!f) return;
  try {
    const { runs, skipped } = Core.parseGarminCsv(await f.text());
    if (!runs.length) return setMsg("importMsg", "Tidak ada aktivitas lari di file ini." + (skipped.length ? " Aktivitas lain dilewati: " + [...new Set(skipped)].join(", ") + "." : ""));
    const before = new Set(state.runs.map(r => new Date(r.started_at).getTime()));
    const fresh = runs.filter(r => !before.has(new Date(r.started_at).getTime())).length;
    setMsg("importMsg", "Menyimpan " + runs.length + " lari…", true);
    const n = await saveRuns(runs, "importMsg"); if (n == null) return;
    const first = runs.reduce((a, r) => r.started_at < a ? r.started_at : a, runs[0].started_at), last = runs.reduce((a, r) => r.started_at > a ? r.started_at : a, runs[0].started_at);
    const fd = new Date(first), ld = new Date(last);
    setMsg("importMsg", `${n} lari diimpor (${fresh} baru), ${fd.getDate()} ${MON3[fd.getMonth()]} – ${ld.getDate()} ${MON3[ld.getMonth()]} ${ld.getFullYear()}.` + (skipped.length ? ` ${skipped.length} aktivitas bukan lari dilewati.` : ""), true);
  } catch (er) { setMsg("importMsg", er.message || friendlyError(er)); }
});
$("jsonFile").addEventListener("change", async e => {
  const f = e.target.files[0]; e.target.value = ""; if (!f) return;
  try {
    let obj; try { obj = JSON.parse(await f.text()); } catch (_) { throw new Error("File ini bukan JSON yang valid."); }
    const rows = Core.parseJournal(obj);
    if (!rows.length) return setMsg("importMsg", "Tidak ada HRV pagi, detak istirahat, atau tidur yang bisa diambil dari file ini.");
    // gabungkan dengan check-in yang sudah ada: isian manual (Body Battery, pegal, mood) tidak ditimpa
    const days = rows.map(r => r.day);
    const { data: existing, error: e1 } = await sb.from("sl_checkins").select("day,rhr,rmssd,sdnn,body_battery,sleep_h,soreness,mood,note,source").in("day", days);
    if (e1) throw e1;
    const ex = new Map(existing.map(x => [x.day, x]));
    const merged = rows.map(r => {
      const o = ex.get(r.day) || {};
      const pick = k => r[k] != null ? r[k] : (o[k] ?? null);
      return { day: r.day, rhr: pick("rhr"), rmssd: pick("rmssd"), sdnn: pick("sdnn"), sleep_h: pick("sleep_h"), body_battery: o.body_battery ?? null, soreness: o.soreness ?? null, mood: o.mood ?? null, note: o.note ?? null,
        source: o.source === "manual" || o.source === "campuran" ? "campuran" : "impor", updated_at: new Date().toISOString() };
    });
    setMsg("importMsg", "Menyimpan " + merged.length + " hari…", true);
    for (let i = 0; i < merged.length; i += 300) {
      const { error } = await sb.from("sl_checkins").upsert(merged.slice(i, i + 300), { onConflict: "user_id,day" });
      if (error) throw error;
    }
    await loadAll();
    const cnt = k => rows.filter(r => r[k] != null).length;
    setMsg("importMsg", `${rows.length} hari diimpor: HRV pagi ${cnt("rmssd")} hari, detak istirahat ${cnt("rhr")} hari, tidur ${cnt("sleep_h")} hari.`, true);
  } catch (er) { setMsg("importMsg", er.message && !er.code ? er.message : friendlyError(er)); }
});

function renderCiTable() {
  const rows = [...state.checkins].sort((a, b) => a.day < b.day ? 1 : -1).slice(0, 21);
  if (!rows.length) { $("ciTable").innerHTML = `<tbody><tr><td class="muted">Belum ada check-in.</td></tr></tbody>`; return; }
  const v = x => x == null ? "–" : String(x).replace(".", ",");
  $("ciTable").innerHTML = `<thead><tr><th>Tanggal</th><th>Istirahat</th><th>RMSSD</th><th>Tidur</th><th>BB</th><th>Pegal</th><th>Mood</th></tr></thead><tbody>` +
    rows.map(c => { const d = Core.fromKey(c.day); return `<tr><td>${d.getDate()} ${MON3[d.getMonth()]}</td><td>${v(c.rhr)}</td><td>${v(c.rmssd)}</td><td>${v(c.sleep_h)}</td><td>${v(c.body_battery)}</td><td>${v(c.soreness)}</td><td>${v(c.mood)}</td></tr>`; }).join("") + `</tbody>`;
}

/* ----- pengaturan ----- */
function renderSex() { $("pSex").innerHTML = [["L", "Laki-laki"], ["P", "Perempuan"]].map(([v, l]) => `<button type="button" class="chip" data-v="${v}" aria-pressed="${state.profile.sex === v}">${l}</button>`).join(""); }
function fillProfileForm() { $("pMax").value = state.profile.hr_max || 190; $("pRest").value = state.profile.hr_rest ?? ""; renderSex(); renderProfileNote(); }
function renderProfileNote() {
  const p = params();
  $("profileNote").textContent = state.profile.hr_rest ? `Hitungan memakai HR istirahat ${p.hrRest} bpm yang kamu isi.` :
    p.autoRest ? `HR istirahat otomatis: ${p.autoRest} bpm (nilai tengah check-in 30 hari terakhir).` : "Belum ada data detak istirahat, sementara dipakai 60 bpm. Isi check-in pagi supaya otomatis.";
}
$("pSex").addEventListener("click", e => { const b = e.target.closest("[data-v]"); if (!b) return; state.profile.sex = b.dataset.v; renderSex(); });
$("profileForm").addEventListener("submit", async e => {
  e.preventDefault();
  const mx = intOrNull($("pMax").value), rs = intOrNull($("pRest").value);
  if (!mx || Number.isNaN(mx) || mx < 120 || mx > 230) return setMsg("profileMsg", "HR maksimal antara 120 dan 230. Rumus kasar: 220 − umur.");
  if (Number.isNaN(rs) || (rs != null && (rs < 30 || rs > 100))) return setMsg("profileMsg", "HR istirahat antara 30 dan 100, atau kosongkan.");
  if (rs != null && rs >= mx - 30) return setMsg("profileMsg", "HR istirahat terlalu dekat dengan HR maksimal.");
  const row = { hr_max: mx, hr_rest: rs, sex: state.profile.sex || "L", updated_at: new Date().toISOString() };
  const { error } = await sb.from("sl_profile").upsert(row, { onConflict: "user_id" });
  if (error) return setMsg("profileMsg", friendlyError(error));
  state.profile = { ...state.profile, ...row }; setMsg("profileMsg", "Pengaturan tersimpan. Semua beban dihitung ulang.", true); renderAll();
});

/* ================= Zona ================= */
const METHODS = [["hrr", "HRR (Karvonen)"], ["max", "% HR maks"], ["lthr", "LTHR"]];
const zoneMethod = () => { const m = state.profile.zone_method || localPref("zoneMethod") || "hrr"; return m === "lthr" && !params().lthr ? "hrr" : m; };
function localPref(k, v) { try { if (v === undefined) return localStorage.getItem("tl-" + k); localStorage.setItem("tl-" + k, v); } catch (_) { return null; } }
const curZones = () => Core.zones(zoneMethod(), params());
function renderZones() {
  const p = params(), m = zoneMethod(), zs = Core.zones(m, p);
  $("zoneMethod").innerHTML = METHODS.map(([v, l]) => `<button type="button" class="chip" data-v="${v}" aria-pressed="${m === v}"${v === "lthr" && !p.lthr ? ' title="Isi LTHR dulu di bawah"' : ""}>${l}</button>`).join("");
  $("zoneMethodNote").textContent = {
    hrr: `Persentase dari cadangan detak jantung (${p.hrMax} − ${p.hrRest} = ${p.hrMax - p.hrRest} bpm), ditambah HR istirahat. Paling cocok kalau HR istirahat diketahui.`,
    max: `Persentase langsung dari HR maksimal ${p.hrMax}. Sama dengan pengaturan bawaan jam Garmin.`,
    lthr: `Persentase dari LTHR ${p.lthr} bpm (metode Joe Friel). Paling personal untuk latihan tempo dan threshold.`
  }[m];
  $("zoneBasis").textContent = m === "lthr" ? "LTHR " + p.lthr : m === "hrr" ? `maks ${p.hrMax} · istirahat ${p.hrRest}` : "maks " + p.hrMax;
  $("zoneList").innerHTML = zs.slice().reverse().map(z => `<div class="zone z${z.n}"><span class="zn">Z${z.n}</span><span class="zt">${esc(z.name)}</span><span class="zr">${z.n === 1 ? "≤ " + z.hi : z.n === 5 ? "≥ " + z.lo : z.lo + "–" + z.hi}<small>bpm</small></span><span class="zd">${esc(z.desc)}</span></div>`).join("");
  // isian & petunjuk
  if (document.activeElement !== $("zMax")) $("zMax").value = state.profile.hr_max || 190;
  if (document.activeElement !== $("zLthr")) $("zLthr").value = state.profile.lthr ?? "";
  const est = Core.estLthr(state.runs, p, today());
  const maxSeen = state.runs.reduce((a, r) => Math.max(a, r.max_hr || 0), 0);
  const hints = [];
  if (maxSeen) hints.push(`HR tertinggi yang pernah tercatat: <b>${maxSeen}</b> bpm.`);
  if (est) { const d = new Date(est.run.started_at); hints.push(`Perkiraan LTHR: <b>${est.lthr}</b> bpm, dari lari terberatmu 20–70 menit (${d.getDate()} ${MON3[d.getMonth()]}, ${Math.round(est.run.duration_s / 60)} menit). <button type="button" class="link" id="useLthr">Pakai angka ini</button>`); }
  hints.push(`Rumus umur: 220 − umur, atau Tanaka 208 − 0,7 × umur.`);
  $("zoneHints").innerHTML = hints.join(" ");
  const ub = $("useLthr"); if (ub) ub.onclick = () => { $("zLthr").value = est.lthr; };
  // sebaran 4 minggu
  const since = +today() - 28 * Core.DAY, recent = state.runs.filter(r => +new Date(r.started_at) >= since && r.avg_hr);
  if (!recent.length) { $("zoneDist").innerHTML = `<p class="muted small-t">Belum ada lari dengan data HR dalam 4 minggu terakhir.</p>`; return; }
  const cnt = [0, 0, 0, 0, 0], mins = [0, 0, 0, 0, 0];
  recent.forEach(r => { const z = Core.zoneOf(r.avg_hr, zs); cnt[z - 1]++; mins[z - 1] += r.duration_s / 60; });
  const tot = mins.reduce((a, b) => a + b, 0);
  $("zoneDist").innerHTML = `<div class="dist">` + [5, 4, 3, 2, 1].map(n => `<div class="dr z${n}"><span class="dl">Z${n}</span><span class="db"><i style="width:${tot ? mins[n - 1] / tot * 100 : 0}%"></i></span><span class="dv">${cnt[n - 1]} lari</span></div>`).join("") + `</div>`;
}
$("zoneMethod").addEventListener("click", async e => {
  const b = e.target.closest("[data-v]"); if (!b) return;
  if (b.dataset.v === "lthr" && !params().lthr) { setMsg("zoneMsg", "Isi LTHR dulu di bawah, lalu Simpan."); $("zLthr").focus(); return; }
  state.profile.zone_method = b.dataset.v; localPref("zoneMethod", b.dataset.v); renderZones(); renderRuns();
  const { error } = await sb.from("sl_profile").upsert({ hr_max: state.profile.hr_max || 190, hr_rest: state.profile.hr_rest ?? null, sex: state.profile.sex || "L", zone_method: b.dataset.v }, { onConflict: "user_id" });
  if (error && /zone_method|column/i.test(error.message || "")) setMsg("zoneMsg", "Pilihan metode tersimpan di HP ini saja. Jalankan SQL pembaruan supaya ikut tersimpan di akun.");
});
$("zoneForm").addEventListener("submit", async e => {
  e.preventDefault();
  const mx = intOrNull($("zMax").value), lt = intOrNull($("zLthr").value);
  if (!mx || Number.isNaN(mx) || mx < 120 || mx > 230) return setMsg("zoneMsg", "HR maksimal antara 120 dan 230.");
  if (Number.isNaN(lt) || (lt != null && (lt < 100 || lt >= mx))) return setMsg("zoneMsg", "LTHR harus di bawah HR maksimal, biasanya 85–92% dari HR maksimal.");
  const row = { hr_max: mx, hr_rest: state.profile.hr_rest ?? null, sex: state.profile.sex || "L", lthr: lt, updated_at: new Date().toISOString() };
  setMsg("zoneMsg", "Menyimpan…", true);
  let { error } = await sb.from("sl_profile").upsert(row, { onConflict: "user_id" });
  if (error && /lthr|column/i.test(error.message || "")) {
    // kolom lthr belum ada: simpan HR maks saja
    delete row.lthr; ({ error } = await sb.from("sl_profile").upsert(row, { onConflict: "user_id" }));
    if (!error) { state.profile = { ...state.profile, ...row }; renderAll(); return setMsg("zoneMsg", "HR maksimal tersimpan. LTHR belum bisa disimpan: jalankan SQL pembaruan di Supabase dulu."); }
  }
  if (error) return setMsg("zoneMsg", friendlyError(error));
  state.profile = { ...state.profile, ...row }; setMsg("zoneMsg", "Tersimpan. Zona dan beban dihitung ulang.", true); fillProfileForm(); renderAll();
});

/* ================= Tab ================= */
document.querySelectorAll("[data-tab]").forEach(b => b.addEventListener("click", () => {
  document.querySelectorAll("[data-tab]").forEach(x => x.setAttribute("aria-selected", x === b));
  document.querySelectorAll("[data-page]").forEach(p => p.hidden = p.dataset.page !== b.dataset.tab);
  window.scrollTo({ top: 0 });
}));
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible" && state.loaded) { fillCheckinForm(); renderAll(); } });

/* ================= Mulai ================= */
initRunForm();
sb.auth.onAuthStateChange(event => {
  if (event === "PASSWORD_RECOVERY") { recovering = true; show("resetScreen"); return; }
  if (event === "SIGNED_OUT") { state.user = null; state.runs = []; state.checkins = []; state.loaded = false; $("password").value = ""; show("authScreen"); setMode("login"); return; }
  if (event === "INITIAL_SESSION") setTimeout(route, 0);
  if (event === "SIGNED_IN" && !state.loaded) setTimeout(route, 0);
});
