// Logika inti Siap Lari: impor, beban latihan (TRIMP), dan skor kesiapan.
// Fungsi murni, tanpa DOM, supaya bisa diuji terpisah.
"use strict";
const Core = (() => {
  const DAY = 864e5;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const pad = n => String(n).padStart(2, "0");
  const dayKey = d => { d = new Date(d); return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); };
  const fromKey = k => { const [y, m, d] = k.split("-").map(Number); return new Date(y, m - 1, d); };
  const toMinute = t => { const d = new Date(t); d.setSeconds(0, 0); return d; };

  /* ---------- TRIMP (Banister) ---------- */
  // TRIMP = menit × HRr × 0,64 × e^(b × HRr); HRr = (HR − istirahat) / (maks − istirahat); b = 1,92 (L) atau 1,67 (P)
  function trimp(durationS, avgHr, p) {
    if (!avgHr || !durationS) return 0;
    const range = p.hrMax - p.hrRest; if (range <= 10) return 0;
    const r = clamp((avgHr - p.hrRest) / range, 0, 1.1);
    const b = p.sex === "P" ? 1.67 : 1.92;
    return durationS / 60 * r * 0.64 * Math.exp(b * r);
  }

  // beban satu lari: dari HR rata-rata; kalau tidak ada HR tapi ada RPE, HR diperkirakan dari RPE (tidak disimpan)
  // Perkiraan RPE (skala 1–10) dari intensitas HR: % cadangan detak jantung (HR rata-rata − istirahat) ÷ (maks − istirahat).
  // Lari di atas 100 menit ditambah 1 karena lelah akumulasi. Hanya perkiraan; RPE yang diisi sendiri selalu diutamakan.
  const RPE_STEPS = [[0.94, 10], [0.89, 9], [0.84, 8], [0.78, 7], [0.72, 6], [0.65, 5], [0.58, 4], [0.50, 3], [0, 2]];
  function estRpe(r, p) {
    if (!r.avg_hr || p.hrMax - p.hrRest <= 10) return null;
    const hrr = (r.avg_hr - p.hrRest) / (p.hrMax - p.hrRest);
    let v = RPE_STEPS.find(([min]) => hrr >= min)[1];
    if (r.duration_s > 6000 && v < 10) v += 1;
    return v;
  }
  function autoTitle(r) {
    const h = new Date(r.started_at).getHours(), part = h < 11 ? "pagi" : h < 15 ? "siang" : h < 18 ? "sore" : "malam";
    const km = r.distance_m ? " " + (Math.round(r.distance_m / 100) / 10).toLocaleString("id-ID") + " km" : "";
    return (r.treadmill ? "Treadmill " : "Lari ") + part + km;
  }
  function runLoad(r, p) {
    if (r.avg_hr) return trimp(r.duration_s, r.avg_hr, p);
    if (r.rpe) return trimp(r.duration_s, Math.round(p.hrRest + (p.hrMax - p.hrRest) * (0.45 + r.rpe * 0.05)), p);
    return 0;
  }

  /* ---------- CSV Garmin Connect ---------- */
  function splitCsvLine(line, sep) {
    const out = []; let cur = "", q = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (q) { if (c === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
      else if (c === '"') q = true; else if (c === sep) { out.push(cur); cur = ""; } else cur += c;
    }
    out.push(cur); return out.map(s => s.trim());
  }
  const hms = s => { if (!s || s === "--") return null; const p = s.split(":").map(x => parseFloat(x.replace(",", "."))); if (p.some(isNaN)) return null; return p.length === 3 ? p[0] * 3600 + p[1] * 60 + p[2] : p.length === 2 ? p[0] * 60 + p[1] : p[0]; };
  function num(s) {
    if (s == null) return null; s = String(s).trim(); if (!s || s === "--") return null;
    // "13,438" (ribuan) atau "10,01" (desimal) atau "1.384"
    if (/^\d{1,3}(,\d{3})+$/.test(s)) s = s.replace(/,/g, "");
    else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, "");
    else s = s.replace(",", ".");
    const v = parseFloat(s); return isNaN(v) ? null : v;
  }
  function parseGarminCsv(text) {
    text = text.replace(/^﻿/, "");
    const lines = text.split(/\r?\n/).filter(l => l.trim());
    if (lines.length < 2) throw new Error("File CSV kosong.");
    const sep = (lines[0].match(/;/g) || []).length > (lines[0].match(/,/g) || []).length ? ";" : ",";
    const head = splitCsvLine(lines[0], sep).map(h => h.toLowerCase());
    const col = (...names) => { for (const n of names) { const i = head.indexOf(n); if (i >= 0) return i; } return -1; };
    const C = {
      type: col("activity type", "jenis aktivitas", "tipe aktivitas"), date: col("date", "tanggal"), title: col("title", "judul"),
      dist: col("distance", "jarak"), time: col("time", "waktu"), moving: col("moving time"), avgHr: col("avg hr", "rata-rata dj", "avg heart rate"),
      maxHr: col("max hr", "dj maks", "max heart rate"), ascent: col("total ascent", "total pendakian")
    };
    if (C.date < 0 || (C.time < 0 && C.moving < 0)) throw new Error("Ini bukan file ekspor aktivitas Garmin Connect (kolom Date/Time tidak ditemukan).");
    const rows = lines.slice(1).map(l => splitCsvLine(l, sep));
    // format tanggal: cek apakah bagian pertama pernah > 12 (dd/mm) atau kedua > 12 (mm/dd)
    let dmy = true;
    const dateParts = rows.map(r => (r[C.date] || "").match(/^(\d{1,4})[\/.-](\d{1,2})[\/.-](\d{1,4})(?:[ T](\d{1,2}):(\d{2}))?/)).filter(Boolean);
    if (dateParts.some(m => +m[2] > 12) && !dateParts.some(m => +m[1] > 12)) dmy = false;
    const runs = [], skipped = [];
    rows.forEach((r, i) => {
      const type = C.type >= 0 ? (r[C.type] || "") : "Running";
      if (!/run|lari/i.test(type)) { skipped.push(type || "?"); return; }
      const m = (r[C.date] || "").match(/^(\d{1,4})[\/.-](\d{1,2})[\/.-](\d{1,4})(?:[ T](\d{1,2}):(\d{2}))?/);
      if (!m) { skipped.push("tanggal?"); return; }
      let y, mo, d;
      if (m[1].length === 4) { y = +m[1]; mo = +m[2]; d = +m[3]; } else if (dmy) { d = +m[1]; mo = +m[2]; y = +m[3]; } else { mo = +m[1]; d = +m[2]; y = +m[3]; }
      if (y < 100) y += 2000;
      const start = new Date(y, mo - 1, d, +(m[4] || 6), +(m[5] || 0));
      const dur = hms(r[C.time]) ?? hms(r[C.moving]);
      if (!dur || dur < 60) { skipped.push("durasi?"); return; }
      const km = num(r[C.dist]);
      runs.push({
        started_at: start.toISOString(), title: (r[C.title] || "").slice(0, 120) || null, duration_s: Math.round(dur),
        distance_m: km != null ? Math.round(km * 1000) : null, avg_hr: num(r[C.avgHr]), max_hr: num(r[C.maxHr]),
        ascent_m: num(r[C.ascent]) != null ? Math.round(num(r[C.ascent])) : null, treadmill: /treadmill|indoor/i.test(type), source: "csv"
      });
    });
    return { runs, skipped };
  }

  /* ---------- FIT ---------- */
  function fitToRun(fit, fileName) {
    const s = fit.session;
    if (!s) throw new Error("File FIT ini tidak berisi ringkasan aktivitas.");
    if (s.sport != null && s.sport !== 1) throw new Error("File FIT ini bukan aktivitas lari.");
    let avgHr = s.avgHr;
    if (!avgHr) { const hr = fit.records.filter(r => r.hr); avgHr = hr.length ? Math.round(hr.reduce((a, r) => a + r.hr, 0) / hr.length) : null; }
    return {
      started_at: toMinute(s.start).toISOString(), title: null, duration_s: Math.round(s.timer || s.elapsed),
      distance_m: s.dist != null ? Math.round(s.dist) : null, avg_hr: avgHr || null, max_hr: s.maxHr || null,
      ascent_m: s.ascent ?? null, treadmill: s.subSport === 1, source: "fit"
    };
  }

  /* ---------- Jurnal HRV (ekspor JSON) ---------- */
  const minutesOf = hhmm => { const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm || ""); return m ? +m[1] * 60 + +m[2] : null; };
  function parseJournal(obj) {
    if (!obj || typeof obj.days !== "object") throw new Error("File JSON ini bukan ekspor jurnal HRV yang dikenali.");
    const out = [];
    for (const [day, v] of Object.entries(obj.days)) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !v) continue;
      const row = { day };
      const readings = Array.isArray(v.readings) ? v.readings : [];
      // HRV pagi: pengukuran paling awal antara 03:00 dan 11:00
      const morning = readings.filter(r => r.type === "hrv" && r.rmssd && (r.period === "Morning" || ((m => m != null && m >= 180 && m <= 660)(minutesOf(r.time)))))
        .sort((a, b) => minutesOf(a.time) - minutesOf(b.time))[0];
      if (morning) { row.rmssd = num(morning.rmssd); row.sdnn = num(morning.sdnn); }
      const rest = readings.find(r => r.type === "restingHr" && r.hr);
      if (rest) row.rhr = Math.round(num(rest.hr));
      const sl = v.sleep || {};
      if (sl.stages && (sl.stages.deep || sl.stages.core || sl.stages.rem)) row.sleep_h = Math.round(((sl.stages.deep || 0) + (sl.stages.core || 0) + (sl.stages.rem || 0)) / 6) / 10;
      else { const b = minutesOf(sl.bed), w = minutesOf(sl.wake); if (b != null && w != null) { let m = w - b; if (m <= 0) m += 1440; if (m >= 120 && m <= 960) row.sleep_h = Math.round(m / 6) / 10; } }
      if (Object.keys(row).length > 1) out.push(row);
    }
    return out.sort((a, b) => a.day < b.day ? -1 : 1);
  }

  /* ---------- Beban latihan ---------- */
  function dailyLoads(runs, p) {
    const m = new Map();
    for (const r of runs) { const k = dayKey(r.started_at); m.set(k, (m.get(k) || 0) + runLoad(r, p)); }
    return m;
  }
  function loadOn(map, endDay, days) { let s = 0; for (let i = 0; i < days; i++) s += map.get(dayKey(new Date(endDay.getFullYear(), endDay.getMonth(), endDay.getDate() - i))) || 0; return s; }
  function loadStatus(today, runs, p) {
    const map = dailyLoads(runs, p);
    const acute = loadOn(map, today, 7), chronic28 = loadOn(map, today, 28), weeklyAvg = chronic28 / 4;
    const firstRun = runs.length ? Math.min(...runs.map(r => +new Date(r.started_at))) : null;
    const historyDays = firstRun ? Math.floor((+today - firstRun) / DAY) + 1 : 0;
    const ratio = weeklyAvg > 0 ? acute / weeklyAvg : null;
    let status = "kosong", label = "Belum ada data lari";
    // ada lari di 8–28 hari lalu? kalau tidak, rasio tidak bermakna (libur panjang atau data belum diimpor)
    const before = loadOn(map, new Date(today.getFullYear(), today.getMonth(), today.getDate() - 7), 21);
    if (ratio != null && historyDays < 21) { status = "awal"; label = "Data masih kurang dari 3 minggu, rasio belum bisa dipercaya"; }
    else if (ratio != null && before === 0) { status = "jeda"; label = "Tidak ada lari di 3 minggu sebelumnya, rasio belum bisa dipakai"; }
    else if (ratio != null) {
      if (ratio < 0.8) { status = "turun"; label = "Beban di bawah biasanya"; }
      else if (ratio <= 1.3) { status = "aman"; label = "Beban seimbang"; }
      else if (ratio <= 1.5) { status = "waspada"; label = "Beban naik, hati-hati"; }
      else { status = "bahaya"; label = "Beban naik terlalu cepat"; }
    }
    return { acute, weeklyAvg, ratio, status, label, historyDays, map };
  }
  function weeklySeries(map, today, weeks) {
    // minggu Senin–Minggu, yang terakhir berisi hari ini
    const dow = (today.getDay() + 6) % 7, mon = new Date(today.getFullYear(), today.getMonth(), today.getDate() - dow);
    const out = [];
    for (let w = weeks - 1; w >= 0; w--) {
      const start = new Date(mon.getFullYear(), mon.getMonth(), mon.getDate() - w * 7);
      let s = 0; for (let i = 0; i < 7; i++) s += map.get(dayKey(new Date(start.getFullYear(), start.getMonth(), start.getDate() + i))) || 0;
      out.push({ start, load: s });
    }
    return out;
  }

  /* ---------- Kesiapan ---------- */
  // lima tingkat per 20 poin
  const LEVELS = [
    { key: "prima", min: 81, emoji: "🤩", mood: "Prima", title: "Siap latihan berat", text: "Tubuh pulih dengan sangat baik. Hari yang tepat untuk interval, tempo, atau long run." },
    { key: "segar", min: 61, emoji: "🙂", mood: "Segar", title: "Boleh latihan sedang", text: "Kondisi baik. Easy run atau latihan sedang aman; latihan keras boleh kalau badan terasa enak." },
    { key: "biasa", min: 41, emoji: "😐", mood: "Biasa", title: "Lari santai saja", text: "Belum prima. Pilih easy run dengan napas masih bisa ngobrol, jangan kejar pace." },
    { key: "lelah", min: 21, emoji: "😴", mood: "Lelah", title: "Ringan atau ganti olahraga", text: "Tubuh masih memulihkan diri. Jalan kaki, recovery run sangat pelan, atau peregangan." },
    { key: "lemas", min: 0, emoji: "😩", mood: "Lemas", title: "Istirahat dulu", text: "Banyak tanda tubuh belum pulih. Istirahat hari ini membuat latihan berikutnya lebih berkualitas." }
  ];
  const mean = a => a.reduce((x, y) => x + y, 0) / a.length;
  const sd = a => { const m = mean(a); return Math.sqrt(a.reduce((x, y) => x + (y - m) ** 2, 0) / Math.max(1, a.length - 1)); };
  const median = a => { const s = [...a].sort((x, y) => x - y), n = s.length; return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2; };
  function baseline(checkins, todayKey, field, minN) {
    const past = checkins.filter(c => c.day < todayKey && c.day >= dayKey(fromKey(todayKey) - 60 * DAY) && c[field] != null).map(c => Number(c[field]));
    return past.length >= minN ? past : null;
  }
  // checkins: semua check-in; today: Date; load: hasil loadStatus
  function readiness(checkins, today, load) {
    const key = dayKey(today), c = checkins.find(x => x.day === key) || {};
    const parts = []; // {name, score, weight, text, tone}
    // HRV (RMSSD) dibanding rata-rata ln(RMSSD) 60 hari
    if (c.rmssd != null) {
      const base = baseline(checkins, key, "rmssd", 5);
      if (base) {
        const lns = base.map(Math.log), m = mean(lns), s = Math.max(sd(lns), 0.05), z = (Math.log(c.rmssd) - m) / s;
        const typical = Math.round(Math.exp(m));
        parts.push({ name: "HRV", weight: 25, score: clamp(75 + z * 20, 5, 100),
          text: `RMSSD ${Number(c.rmssd)} ms, biasanya sekitar ${typical} ms`, tone: z < -1 ? "bad" : z < -0.5 ? "warn" : "good" });
      } else parts.push({ name: "HRV", weight: 0, score: null, text: `RMSSD ${Number(c.rmssd)} ms. Perlu minimal 5 hari data untuk tahu angka normalmu`, tone: "info" });
    }
    // detak jantung istirahat dibanding median 60 hari
    if (c.rhr != null) {
      const base = baseline(checkins, key, "rhr", 4);
      if (base) {
        const med = median(base), diff = c.rhr - med;
        parts.push({ name: "Detak istirahat", weight: 20, score: clamp(100 - Math.max(0, diff) * 9, 5, 100),
          text: diff >= 1 ? `${c.rhr} bpm, naik ${Math.round(diff)} dari biasanya (${Math.round(med)})` : `${c.rhr} bpm, normal (biasanya ${Math.round(med)})`, tone: diff >= 7 ? "bad" : diff >= 4 ? "warn" : "good" });
      } else parts.push({ name: "Detak istirahat", weight: 0, score: null, text: `${c.rhr} bpm. Perlu minimal 4 hari data untuk pembanding`, tone: "info" });
    }
    if (c.sleep_h != null) {
      const h = Number(c.sleep_h), sc = h >= 8 ? 100 : h >= 7 ? 85 + (h - 7) * 15 : h >= 6 ? 65 + (h - 6) * 20 : h >= 5 ? 40 + (h - 5) * 25 : clamp(h * 8, 0, 40);
      parts.push({ name: "Tidur", weight: 15, score: sc, text: `${h.toLocaleString("id-ID")} jam`, tone: h < 6 ? "bad" : h < 7 ? "warn" : "good" });
    }
    if (c.body_battery != null) parts.push({ name: "Body Battery", weight: 15, score: c.body_battery, text: `${c.body_battery} saat bangun`, tone: c.body_battery < 40 ? "bad" : c.body_battery < 65 ? "warn" : "good" });
    if (c.soreness != null) { const sc = [100, 80, 60, 35, 15][c.soreness - 1]; parts.push({ name: "Pegal", weight: 10, score: sc, text: ["Tidak pegal", "Sedikit pegal", "Pegal sedang", "Pegal berat", "Sangat pegal / nyeri"][c.soreness - 1], tone: c.soreness >= 4 ? "bad" : c.soreness === 3 ? "warn" : "good" }); }
    if (c.mood != null) { const sc = [15, 35, 60, 80, 100][c.mood - 1]; parts.push({ name: "Mood & energi", weight: 5, score: sc, text: ["Sangat lelah / buruk", "Kurang", "Biasa", "Baik", "Sangat baik"][c.mood - 1], tone: c.mood <= 2 ? "warn" : "good" }); }
    if (load && load.ratio != null && load.status !== "awal" && load.status !== "jeda") {
      const r = load.ratio, sc = r < 0.8 ? 90 : r <= 1.3 ? 100 : r <= 1.5 ? 65 : 35;
      parts.push({ name: "Beban latihan", weight: 10, score: sc, text: `Rasio ${r.toFixed(2).replace(".", ",")} (${load.label.toLowerCase()})`, tone: r > 1.5 ? "bad" : r > 1.3 ? "warn" : "good" });
    }
    const scored = parts.filter(p => p.weight > 0 && p.score != null);
    const w = scored.reduce((a, p) => a + p.weight, 0);
    if (!w) return { score: null, parts, advice: null, filled: Object.keys(c).length > 2 };
    let score = Math.round(scored.reduce((a, p) => a + p.score * p.weight, 0) / w);
    // satu tanda bahaya cukup untuk membatasi skor
    if (scored.some(p => p.tone === "bad" && p.weight >= 15)) score = Math.min(score, 60);
    const L = LEVELS.find(x => score >= x.min);
    const level = L.key, advice = { title: L.title, text: L.text, emoji: L.emoji, mood: L.mood };
    return { score, level, parts, advice, filled: true, coverage: w };
  }

  return { LEVELS, DAY, dayKey, fromKey, toMinute, trimp, runLoad, estRpe, autoTitle, parseGarminCsv, fitToRun, parseJournal, loadStatus, weeklySeries, readiness, num, hms };
})();
if (typeof module !== "undefined") module.exports = Core;
