// Pembaca file .FIT Garmin (aktivitas) tanpa library luar.
// FitParse.parse(ArrayBuffer) -> { session, records:[{t, hr, dist}], laps }
"use strict";
const FitParse = (() => {
  const FIT_EPOCH = 631065600; // 1989-12-31T00:00:00Z dalam detik Unix
  // ukuran & pembaca per base type
  const BT = {
    0x00: [1, "u8"], 0x01: [1, "s8"], 0x02: [1, "u8"], 0x83: [2, "s16"], 0x84: [2, "u16"], 0x85: [4, "s32"], 0x86: [4, "u32"],
    0x07: [1, "str"], 0x88: [4, "f32"], 0x89: [8, "f64"], 0x0A: [1, "u8"], 0x8B: [2, "u16"], 0x8C: [4, "u32"], 0x0D: [1, "u8"],
    0x8E: [8, "s64"], 0x8F: [8, "u64"], 0x90: [8, "u64"]
  };
  const INVALID = { u8: 0xFF, s8: 0x7F, u16: 0xFFFF, s16: 0x7FFF, u32: 0xFFFFFFFF, s32: 0x7FFFFFFF };

  function readVal(dv, off, type, size, little) {
    const [bsize, kind] = BT[type] || [1, "u8"];
    if (kind === "str") { let s = ""; for (let i = 0; i < size; i++) { const c = dv.getUint8(off + i); if (!c) break; s += String.fromCharCode(c); } return s; }
    if (size !== bsize) return null; // array, tidak dipakai
    let v;
    switch (kind) {
      case "u8": v = dv.getUint8(off); break; case "s8": v = dv.getInt8(off); break;
      case "u16": v = dv.getUint16(off, little); break; case "s16": v = dv.getInt16(off, little); break;
      case "u32": v = dv.getUint32(off, little); break; case "s32": v = dv.getInt32(off, little); break;
      case "f32": return dv.getFloat32(off, little); case "f64": return dv.getFloat64(off, little);
      default: return null;
    }
    // byte 0x00 juga "tidak valid" untuk uint8z/16z/32z; selain itu nilai maksimum = tidak valid
    if ((type === 0x0A || type === 0x8B || type === 0x8C) && v === 0) return null;
    if (v === INVALID[kind]) return null;
    return v;
  }

  function parse(buf) {
    const dv = new DataView(buf);
    if (dv.byteLength < 14) throw new Error("File terlalu kecil");
    const hsize = dv.getUint8(0);
    const dataSize = dv.getUint32(4, true);
    const sig = String.fromCharCode(dv.getUint8(8), dv.getUint8(9), dv.getUint8(10), dv.getUint8(11));
    if (sig !== ".FIT") throw new Error("Bukan file FIT");
    const end = Math.min(hsize + dataSize, dv.byteLength);
    const defs = {};
    let off = hsize, lastTs = 0;
    const out = { session: null, records: [], laps: [], fileType: null, sport: null };

    while (off < end) {
      const h = dv.getUint8(off++);
      if (h & 0x80) { // header timestamp terkompresi (selalu pesan data)
        const local = (h >> 5) & 0x03, offs = h & 0x1F;
        const def = defs[local]; if (!def) throw new Error("Definisi hilang");
        let ts = (lastTs & ~0x1F) + offs; if (offs < (lastTs & 0x1F)) ts += 0x20; lastTs = ts;
        off = readData(dv, off, def, out, ts);
        continue;
      }
      const local = h & 0x0F;
      if (h & 0x40) { // definisi
        const hasDev = !!(h & 0x20);
        off++; // reserved
        const little = dv.getUint8(off++) === 0;
        const gnum = dv.getUint16(off, little); off += 2;
        const n = dv.getUint8(off++);
        const fields = [];
        for (let i = 0; i < n; i++) { fields.push({ num: dv.getUint8(off), size: dv.getUint8(off + 1), type: dv.getUint8(off + 2) }); off += 3; }
        let devSize = 0;
        if (hasDev) { const nd = dv.getUint8(off++); for (let i = 0; i < nd; i++) { devSize += dv.getUint8(off + 1); off += 3; } }
        defs[local] = { gnum, little, fields, devSize };
      } else {
        const def = defs[local]; if (!def) throw new Error("Definisi hilang");
        off = readData(dv, off, def, out, null);
        if (out._ts != null) { lastTs = out._ts; out._ts = null; }
      }
    }
    delete out._ts;
    return out;
  }

  function readData(dv, off, def, out, ts) {
    const v = {};
    for (const f of def.fields) { v[f.num] = readVal(dv, off, f.type, f.size, def.little); off += f.size; }
    off += def.devSize;
    if (v[253] != null) { ts = v[253]; out._ts = ts; }
    const unix = ts != null ? (ts + FIT_EPOCH) * 1000 : null;
    switch (def.gnum) {
      case 0: out.fileType = v[0]; break; // file_id
      case 12: if (out.sport == null) out.sport = v[0]; break; // sport
      case 20: // record
        out.records.push({ t: unix, hr: v[3] ?? null, dist: v[5] != null ? v[5] / 100 : null, alt: v[78] != null ? v[78] / 5 - 500 : (v[2] != null ? v[2] / 5 - 500 : null) });
        break;
      case 19: // lap
        out.laps.push({ start: v[2] != null ? (v[2] + FIT_EPOCH) * 1000 : null, timer: v[8] != null ? v[8] / 1000 : null, dist: v[9] != null ? v[9] / 100 : null, avgHr: v[15] ?? null, maxHr: v[16] ?? null });
        break;
      case 18: // session (ambil yang pertama)
        if (!out.session) out.session = {
          start: v[2] != null ? (v[2] + FIT_EPOCH) * 1000 : null, sport: v[5] ?? null, subSport: v[6] ?? null,
          elapsed: v[7] != null ? v[7] / 1000 : null, timer: v[8] != null ? v[8] / 1000 : null, dist: v[9] != null ? v[9] / 100 : null,
          calories: v[11] ?? null, avgHr: v[16] ?? null, maxHr: v[17] ?? null, ascent: v[22] ?? null, descent: v[23] ?? null,
          avgCadence: v[18] ?? null
        };
        break;
    }
    return off;
  }
  return { parse };
})();
if (typeof module !== "undefined") module.exports = FitParse;
