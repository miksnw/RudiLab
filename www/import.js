/*
 * Импорт барабанных партий из файлов.
 *   .gp  (Guitar Pro 7/8: zip + XML)   — поддержан
 *   .mid / .midi                       — поддержан
 *   .gp3 .gp4 .gp5 .gpx                — пока нет (нужен образец файла для проверки)
 *
 * Результат разбора — "источник": { name, bpm, tracks:[{name,isDrum,barCount}], bars(trackIndex) }
 * bars() возвращает массив тактов: { num, den, len (в тиках, 960 = четверть), events:[{tick, limb, open, v}] }
 * Затем buildPart() квантует выбранные такты в сетку шагов.
 *
 * Инструменты: H хет, S малый, K бочка, T1 T2 T3 томы, C крэш, RD райд (на экране «R»).
 */
(function () {
  const TPQ = 960; // тиков на четверть во внутреннем представлении

  /* ---------- General MIDI → наши инструменты ---------- */
  function gmToLimb(n) {
    switch (n) {
      case 35: case 36: return { limb: 'K' };
      case 37: case 38: case 39: case 40: return { limb: 'S' };
      case 41: case 43: return { limb: 'T3' };
      case 45: case 47: return { limb: 'T2' };
      case 48: case 50: return { limb: 'T1' };
      case 42: case 44: return { limb: 'H' };
      case 46: return { limb: 'H', open: true };
      case 49: case 52: case 55: case 57: return { limb: 'C' };
      case 51: case 53: case 59: return { limb: 'RD' };
      default: return null;
    }
  }

  /* ---------- ZIP (только чтение, deflate-raw через DecompressionStream) ---------- */
  async function unzip(buf, wanted) {
    const dv = new DataView(buf), u8 = new Uint8Array(buf);
    let eocd = -1;
    for (let i = u8.length - 22; i >= Math.max(0, u8.length - 70000); i--) {
      if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
    }
    if (eocd < 0) throw new Error('Не удалось прочитать архив .gp');
    const count = dv.getUint16(eocd + 10, true);
    let p = dv.getUint32(eocd + 16, true);
    const td = new TextDecoder();
    for (let k = 0; k < count; k++) {
      if (dv.getUint32(p, true) !== 0x02014b50) break;
      const method = dv.getUint16(p + 10, true);
      const csize = dv.getUint32(p + 20, true);
      const nlen = dv.getUint16(p + 28, true), elen = dv.getUint16(p + 30, true), clen = dv.getUint16(p + 32, true);
      const off = dv.getUint32(p + 42, true);
      const name = td.decode(u8.subarray(p + 46, p + 46 + nlen));
      p += 46 + nlen + elen + clen;
      if (name !== wanted) continue;
      const lnl = dv.getUint16(off + 26, true), lel = dv.getUint16(off + 28, true);
      const data = u8.subarray(off + 30 + lnl + lel, off + 30 + lnl + lel + csize);
      if (method === 0) return data;
      if (method === 8) {
        if (typeof DecompressionStream === 'undefined') throw new Error('Этот браузер не умеет распаковывать архив');
        const ds = new DecompressionStream('deflate-raw');
        const out = new Response(new Blob([data]).stream().pipeThrough(ds));
        return new Uint8Array(await out.arrayBuffer());
      }
      throw new Error('Неизвестный способ сжатия в архиве');
    }
    throw new Error('В архиве нет ' + wanted);
  }

  /* ---------- Guitar Pro 7/8 (.gp): GPIF XML ---------- */
  const NOTE_LEN = { Long: 16, DoubleWhole: 8, Whole: 4, Half: 2, Quarter: 1, Eighth: 0.5, '16th': 0.25, '32nd': 0.125, '64th': 0.0625, '128th': 0.03125 };

  function parseGpif(xml) {
    const doc = new DOMParser().parseFromString(xml, 'text/xml');
    if (doc.querySelector('parsererror')) throw new Error('Файл повреждён (XML)');
    const txt = (el, sel) => { const e = el.querySelector(sel); return e ? e.textContent.trim() : null; };
    const ids = (s) => (s || '').split(/\s+/).filter(Boolean);
    const index = (sel) => { const m = {}; doc.querySelectorAll(sel).forEach((e) => { m[e.getAttribute('id')] = e; }); return m; };
    const notes = index('GPIF > Notes > Note'), beats = index('GPIF > Beats > Beat'),
      rhythms = index('GPIF > Rhythms > Rhythm'), voices = index('GPIF > Voices > Voice'), bars = index('GPIF > Bars > Bar');
    const trackEls = index('GPIF > Tracks > Track');
    const order = ids(txt(doc, 'GPIF > MasterTrack > Tracks'));
    const masterBars = Array.from(doc.querySelectorAll('GPIF > MasterBars > MasterBar'));
    let bpm = 100;
    const tempoEl = Array.from(doc.querySelectorAll('GPIF > MasterTrack > Automations > Automation')).find((a) => txt(a, 'Type') === 'Tempo');
    if (tempoEl) bpm = Math.round(parseFloat((txt(tempoEl, 'Value') || '100').split(/\s+/)[0])) || 100;

    const tracks = order.map((tid) => {
      const t = trackEls[tid];
      const name = (t && txt(t, 'Name')) || 'Дорожка ' + tid;
      const setType = t ? (txt(t, 'InstrumentSet > Type') || '') : '';
      const instRef = t ? ((t.querySelector('Instrument') || {}).getAttribute ? t.querySelector('Instrument').getAttribute('ref') : '') : '';
      const isDrum = /drum/i.test(setType) || /drum/i.test(instRef || '');
      // артикуляции: elementIndex -> [midi...]
      const arts = [];
      if (t) t.querySelectorAll('InstrumentSet > Elements > Element').forEach((el) => {
        const list = [];
        el.querySelectorAll('Articulations > Articulation').forEach((a) => list.push(parseInt(txt(a, 'OutputMidiNumber'), 10)));
        arts.push(list);
      });
      return { id: tid, name, isDrum, barCount: masterBars.length, arts };
    });

    function noteMidi(note, arts) {
      const prop = (name, child) => {
        const p = Array.from(note.querySelectorAll('Properties > Property')).find((x) => x.getAttribute('name') === name);
        return p ? txt(p, child) : null;
      };
      const el = prop('Element', 'Element'), va = prop('Variation', 'Variation');
      if (el !== null) {
        const list = arts[parseInt(el, 10)] || [];
        const m = list[parseInt(va || '0', 10)];
        if (Number.isFinite(m)) return m;
        if (Number.isFinite(list[0])) return list[0];
      }
      const ia = txt(note, 'InstrumentArticulation');
      if (ia !== null) {
        const flat = arts.flat();
        if (Number.isFinite(flat[parseInt(ia, 10)])) return flat[parseInt(ia, 10)];
      }
      const midi = prop('Midi', 'Number');
      return midi !== null ? parseInt(midi, 10) : null;
    }

    function getBars(ti) {
      const tr = tracks[ti];
      return masterBars.map((mb) => {
        const [num, den] = (txt(mb, 'Time') || '4/4').split('/').map((x) => parseInt(x, 10));
        const len = Math.round(TPQ * 4 * num / den);
        const barId = ids(txt(mb, 'Bars'))[ti];
        const bar = bars[barId];
        const events = [];
        if (bar) {
          for (const vid of ids(txt(bar, 'Voices'))) {
            const voice = voices[vid];
            if (!voice) continue; // -1
            let tick = 0;
            for (const bid of ids(txt(voice, 'Beats'))) {
              const beat = beats[bid];
              if (!beat) continue;
              const rh = rhythms[(beat.querySelector('Rhythm') || { getAttribute: () => null }).getAttribute('ref')];
              let L = rh ? (NOTE_LEN[txt(rh, 'NoteValue')] || 1) : 1;
              if (rh) {
                const dot = rh.querySelector('AugmentationDot');
                if (dot) { const c = parseInt(dot.getAttribute('count') || '1', 10); L = L * (2 - Math.pow(0.5, c)); }
                const tup = rh.querySelector('PrimaryTuplet');
                if (tup) L = L * parseInt(tup.getAttribute('den'), 10) / parseInt(tup.getAttribute('num'), 10);
              }
              for (const nid of ids(txt(beat, 'Notes'))) {
                const note = notes[nid];
                if (!note) continue;
                const m = noteMidi(note, tr.arts);
                const info = m === null ? null : gmToLimb(m);
                if (!info) continue;
                const acc = parseInt(txt(note, 'Accent') || '0', 10);
                const ghost = !!note.querySelector('AntiAccent');
                events.push({ tick: Math.round(tick * TPQ), limb: info.limb, open: !!info.open, v: ghost ? 0.3 : (acc & 12) ? 1 : 0.65 });
              }
              tick += L;
            }
          }
        }
        return { num, den, len, events };
      });
    }
    return { name: txt(doc, 'GPIF > Score > Title') || '', bpm, tracks, bars: getBars };
  }

  /* ---------- MIDI ---------- */
  function parseMidi(buf) {
    const dv = new DataView(buf), u8 = new Uint8Array(buf);
    if (dv.getUint32(0) !== 0x4d546864) throw new Error('Это не MIDI-файл');
    const ntrks = dv.getUint16(10), division = dv.getUint16(12);
    if (division & 0x8000) throw new Error('MIDI с SMPTE-временем не поддерживается');
    const ppq = division;
    let p = 14;
    const tracks = [];
    const sigs = [{ tick: 0, num: 4, den: 4 }];
    let bpm = 0;
    for (let t = 0; t < ntrks && p < u8.length; t++) {
      if (dv.getUint32(p) !== 0x4d54726b) break;
      const len = dv.getUint32(p + 4);
      let q = p + 8; const end = q + len;
      let tick = 0, run = 0, name = '';
      const evs = []; let drumHits = 0;
      const vlq = () => { let v = 0, b; do { b = u8[q++]; v = (v << 7) | (b & 0x7f); } while (b & 0x80); return v; };
      while (q < end) {
        tick += vlq();
        let st = u8[q];
        if (st < 0x80) st = run; else { q++; if (st < 0xf0) run = st; }
        if (st === 0xff) {
          const type = u8[q++], l = vlq();
          if (type === 0x03) name = new TextDecoder().decode(u8.subarray(q, q + l));
          if (type === 0x51 && !bpm) bpm = Math.round(60000000 / ((u8[q] << 16) | (u8[q + 1] << 8) | u8[q + 2]));
          if (type === 0x58) sigs.push({ tick, num: u8[q], den: Math.pow(2, u8[q + 1]) });
          q += l;
        } else if (st === 0xf0 || st === 0xf7) { q += vlq(); }
        else {
          const hi = st & 0xf0, ch = st & 0x0f;
          const n1 = u8[q++]; const n2 = (hi === 0xc0 || hi === 0xd0) ? 0 : u8[q++];
          if (hi === 0x90 && n2 > 0) { evs.push({ tick, note: n1, vel: n2, ch }); if (ch === 9) drumHits++; }
        }
      }
      p = end;
      if (evs.length) tracks.push({ name: name || 'Дорожка ' + (tracks.length + 1), isDrum: drumHits > evs.length / 2, evs });
    }
    // такты: смены размера по тикам
    sigs.sort((a, b) => a.tick - b.tick);
    const dedup = sigs.filter((s, i) => i === 0 || s.tick !== sigs[i - 1].tick);
    if (dedup.length > 1 && dedup[0].tick === 0 && dedup[1].tick === 0) dedup.shift();
    const maxTick = Math.max(0, ...tracks.map((t) => t.evs[t.evs.length - 1].tick));
    const barList = []; // {start, num, den, ticks}
    let tick = 0, si = 0;
    while (tick <= maxTick && barList.length < 3000) {
      while (si + 1 < dedup.length && dedup[si + 1].tick <= tick) si++;
      const s = dedup[si];
      const ticks = Math.round(ppq * 4 * s.num / s.den);
      barList.push({ start: tick, num: s.num, den: s.den, ticks });
      tick += ticks;
    }
    const scale = TPQ / ppq;
    function getBars(ti) {
      const evs = tracks[ti].evs;
      return barList.map((b) => ({
        num: b.num, den: b.den, len: Math.round(b.ticks * scale),
        events: evs.filter((e) => e.tick >= b.start && e.tick < b.start + b.ticks).map((e) => {
          const info = gmToLimb(e.note);
          return info ? { tick: Math.round((e.tick - b.start) * scale), limb: info.limb, open: !!info.open, v: e.vel >= 110 ? 1 : e.vel <= 50 ? 0.3 : 0.65 } : null;
        }).filter(Boolean),
      }));
    }
    return {
      name: '', bpm: bpm || 100,
      tracks: tracks.map((t) => ({ name: t.name, isDrum: t.isDrum, barCount: barList.length })), bars: getBars,
    };
  }

  /* ---------- вход: определить формат ---------- */
  async function open(file) {
    const buf = await file.arrayBuffer();
    const u8 = new Uint8Array(buf);
    const head = String.fromCharCode(...u8.subarray(0, 4));
    const base = file.name.replace(/\.[^.]+$/, '');
    let src;
    if (head === 'MThd') src = parseMidi(buf);
    else if (head.startsWith('PK')) {
      const bytes = await unzip(buf, 'Content/score.gpif');
      src = parseGpif(new TextDecoder().decode(bytes));
    } else if (/FICH|BCF/.test(String.fromCharCode(...u8.subarray(0, 32)).replace(/[^\x20-\x7e]/g, ''))) {
      throw new Error('Форматы .gp3/.gp4/.gp5/.gpx пока не поддерживаются. Сохрани партию как .gp (Guitar Pro 7/8) или экспортируй в MIDI.');
    } else throw new Error('Неизвестный формат файла');
    if (!src.name) src.name = base;
    return src;
  }

  /* ---------- квантование выбранных тактов в сетку шагов ---------- */
  function buildPart(src, trackIdx, fromBar, count) {
    const all = src.bars(trackIdx);
    const sel = all.slice(fromBar, fromBar + Math.min(4, Math.max(1, count)));
    if (!sel.length) throw new Error('В этом диапазоне нет тактов');
    const ticks = sel.flatMap((b) => b.events.map((e) => e.tick));
    let div = 4;
    for (const d of [4, 12, 8, 24]) {
      const st = TPQ / d;
      if (ticks.every((t) => Math.abs(t / st - Math.round(t / st)) < 1e-6)) { div = d; break; }
      div = 24;
    }
    const st = TPQ / div;
    const parsed = [], bars = [];
    for (const b of sel) {
      const n = Math.max(1, Math.round(b.len / st));
      const start = parsed.length;
      const cells = Array.from({ length: n }, () => ({}));
      for (const e of b.events) {
        const i = Math.min(n - 1, Math.round(e.tick / st));
        const c = cells[i];
        if (!c[e.limb] || e.v > c[e.limb].v) c[e.limb] = { limb: e.limb, v: e.v, open: !!e.open, acc: e.v >= 1, mod: '', buzz: false };
      }
      cells.forEach((c) => parsed.push(Object.values(c)));
      bars.push({ start, len: n, num: b.num, den: b.den });
    }
    const hasHits = parsed.some((h) => h.length);
    if (!hasHits) throw new Error('В выбранных тактах нет ударных нот');
    return { div, parsed, bars, bpm: Math.min(240, Math.max(40, Math.round((src.bpm || 100) * 0.7))), fullBpm: src.bpm || 100 };
  }

  window.Importer = { open, buildPart, gmToLimb, parseGpif, parseMidi, unzip };
})();
