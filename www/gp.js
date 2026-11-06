/*
 * Мини-импортёр Guitar Pro для барабанных партий.
 * Поддержано: .gp3 .gp4 .gp5 (бинарные), .gp (GP7/8, zip + XML), .gpx (GP6, BCFZ + XML).
 * Формат разобран по открытому описанию и реализации alphaTab (MPL-2.0).
 *
 * GP.parse(ArrayBuffer) -> Promise<{ title, tempo, tracks: [{ name, drums, bars: [{ ts:[n,d], voices:[[beat]] }] }] }>
 *   beat = { ticks, notes: [{ midi, ghost, accent }] }   (ticks: 960 = четверть)
 * GP.toExercise(score, trackIndex, fromBar, toBar) -> упражнение для приложения
 */
(function (root) {
  'use strict';
  const QUARTER = 960;

  /* ---------------- общие утилиты ---------------- */
  const latin1 = (u8) => {
    try { return new TextDecoder('windows-1252').decode(u8); } catch (e) { return String.fromCharCode.apply(null, u8); }
  };

  class Reader {
    constructor(u8) { this.u = u8; this.p = 0; this.dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength); }
    need(n) { if (this.p + n > this.u.length) throw new Error('Файл обрезан или повреждён'); }
    u8() { this.need(1); return this.u[this.p++]; }
    i8() { this.need(1); const v = this.dv.getInt8(this.p); this.p += 1; return v; }
    i16() { this.need(2); const v = this.dv.getInt16(this.p, true); this.p += 2; return v; }
    i32() { this.need(4); const v = this.dv.getInt32(this.p, true); this.p += 4; return v; }
    skip(n) { this.need(n); this.p += n; }
    bytes(n) { this.need(n); const b = this.u.subarray(this.p, this.p + n); this.p += n; return b; }
    // строка фиксированного размера: байт длины + length байт
    strFixed(length) { const l = this.u8(); const b = this.bytes(length); return latin1(b.subarray(0, Math.min(l, length))); }
    strIntByte() { const l = this.i32() - 1; this.u8(); return latin1(this.bytes(Math.max(0, l))); }
    strIntUnused() { this.skip(4); const l = this.u8(); return latin1(this.bytes(l)); }
    strInt() { const l = this.i32(); return latin1(this.bytes(Math.max(0, l))); }
  }

  /* ---------------- длительности ---------------- */
  const VALUE_TICKS = { whole: 3840, half: 1920, quarter: 960, eighth: 480, '16th': 240, '32nd': 120, '64th': 60, '128th': 30 };
  function beatTicks(value, dots, tup) {
    let t = VALUE_TICKS[value] || 960;
    if (dots === 1) t *= 1.5; else if (dots === 2) t *= 1.75;
    if (tup && tup[0] > 0 && tup[1] > 0) t = (t * tup[1]) / tup[0];
    return Math.round(t);
  }

  /* ---------------- GP3 / GP4 / GP5 ---------------- */
  function parseBinary(u8) {
    const r = new Reader(u8);
    const verStr = r.strFixed(30);
    if (!verStr.startsWith('FICHIER GUITAR PRO')) throw new Error('Это не файл Guitar Pro');
    const m = /(\d+)\.(\d+)/.exec(verStr);
    const V = 100 * +m[1] + +m[2];
    const score = { title: '', artist: '', tempo: 120, tracks: [], version: V };

    score.title = r.strIntUnused();
    r.strIntUnused(); // subtitle
    score.artist = r.strIntUnused();
    r.strIntUnused(); // album
    r.strIntUnused(); // words
    if (V >= 500) r.strIntUnused(); // music
    r.strIntUnused(); // copyright
    r.strIntUnused(); // tab
    r.strIntUnused(); // instructions
    const notices = r.i32();
    for (let i = 0; i < notices; i++) r.strIntUnused();
    if (V < 500) r.u8(); // triplet feel
    if (V >= 400) { // lyrics
      r.i32();
      for (let i = 0; i < 5; i++) { r.i32(); r.strInt(); }
    }
    if (V >= 510) r.skip(19);
    if (V >= 500) { // page setup
      r.skip(28); r.i16();
      for (let i = 0; i < 10; i++) r.strIntByte();
      r.strIntByte(); // tempo name
    }
    score.tempo = r.i32();
    if (V >= 510) r.u8();
    r.i32(); // key
    if (V >= 400) r.u8(); // octave
    r.skip(64 * 12); // 4 портов x 16 каналов: int32 + 6 байт + 2
    if (V >= 500) r.skip(19 * 2 + 4); // направления (коды, сегно)
    const barCount = r.i32();
    const trackCount = r.i32();
    if (barCount < 0 || barCount > 5000 || trackCount < 0 || trackCount > 200) throw new Error('Неподдерживаемая версия файла');

    // такты (мастер-дорожка)
    const masters = [];
    let prev = { n: 4, d: 4 };
    for (let i = 0; i < barCount; i++) {
      const flags = r.u8();
      const ts = { n: prev.n, d: prev.d };
      if (flags & 0x01) ts.n = r.u8();
      if (flags & 0x02) ts.d = r.u8();
      if (flags & 0x08) r.u8();
      if ((flags & 0x10) && V < 500) r.u8();
      if (flags & 0x20) { r.strIntByte(); r.skip(4); }
      if (flags & 0x40) { r.i8(); r.u8(); }
      if (V >= 500 && (flags & 0x03)) r.skip(4);
      if (V >= 500) { r.u8(); r.u8(); r.u8(); } // концовки, триольный фил, пустой байт
      masters.push(ts);
      prev = ts;
    }

    // дорожки
    const tracks = [];
    for (let t = 0; t < trackCount; t++) {
      const flags = r.u8();
      const name = r.strFixed(40);
      const strings = r.i32();
      for (let i = 0; i < 7; i++) r.i32();
      r.i32(); r.i32(); r.i32(); r.skip(4); // порт, канал, эффект-канал, лады
      r.i32(); // каподастр
      r.skip(4); // цвет
      if (V >= 500) {
        r.u8(); r.u8(); r.u8(); r.u8(); r.u8(); // флаги нот. стана, банк
        r.i32(); r.i32(); r.i32(); r.skip(10); r.u8(); r.u8();
        r.skip(16); // RSE банк
        if (V >= 510) { r.skip(4); r.strIntByte(); r.strIntByte(); }
      }
      tracks.push({ name: name.trim() || 'Дорожка ' + (t + 1), drums: (flags & 0x01) !== 0, strings, bars: [] });
    }

    // такты по дорожкам
    for (let b = 0; b < barCount; b++) {
      for (let t = 0; t < trackCount; t++) {
        const tr = tracks[t];
        if (V >= 500) r.u8();
        const voices = [];
        const voiceCount = V >= 500 ? 2 : 1;
        for (let v = 0; v < voiceCount; v++) {
          const beatCount = r.i32();
          if (beatCount < 0 || beatCount > 200) throw new Error('Повреждённые данные такта');
          const beats = [];
          for (let k = 0; k < beatCount; k++) beats.push(readBeat(r, V, tr));
          voices.push(beats);
        }
        tr.bars.push({ ts: [masters[b].n, masters[b].d], voices });
      }
    }
    score.tracks = tracks;
    return score;
  }

  const DUR_CODE = { '-2': 'whole', '-1': 'half', 0: 'quarter', 1: 'eighth', 2: '16th', 3: '32nd', 4: '64th' };
  function readBeat(r, V, tr) {
    const flags = r.u8();
    let dots = (flags & 0x01) ? 1 : 0;
    if (flags & 0x40) r.u8();
    const value = DUR_CODE[r.i8()] || 'quarter';
    let tup = null;
    if (flags & 0x20) {
      const n = r.i32();
      if (n === 1) tup = null;
      else if (n === 3) tup = [3, 2];
      else if (n >= 5 && n <= 7) tup = [n, 4];
      else if (n >= 9 && n <= 13) tup = [n, 8];
      else tup = null;
    }
    if (flags & 0x02) readChord(r, V);
    if (flags & 0x04) r.strIntUnused();
    if (flags & 0x08) readBeatEffects(r, V);
    if (flags & 0x10) readMixTable(r, V);
    const stringFlags = r.u8();
    const notes = [];
    for (let i = 6; i >= 0; i--) {
      if ((stringFlags & (1 << i)) && 6 - i < tr.strings) {
        const n = readNote(r, V);
        if (n) notes.push(n);
      }
    }
    if (V >= 500) {
      const f2 = r.i16();
      if (f2 & 0x800) r.u8();
    }
    return { ticks: beatTicks(value, dots, tup), notes };
  }

  function readChord(r, V) {
    if (V >= 500) {
      r.skip(17); r.strFixed(21); r.skip(4); r.i32();
      for (let i = 0; i < 7; i++) r.i32();
      r.u8(); r.skip(5); r.skip(26);
    } else if (r.u8() !== 0) {
      if (V >= 400) {
        r.skip(16); r.strFixed(21); r.skip(4); r.i32();
        for (let i = 0; i < 7; i++) r.i32();
        r.u8(); r.skip(5); r.skip(26);
      } else {
        r.skip(25); r.strFixed(34); r.i32();
        for (let i = 0; i < 6; i++) r.i32();
        r.skip(36);
      }
    } else {
      r.strIntByte();
      const first = r.i32();
      if (first > 0) { const n = V >= 406 ? 7 : 6; for (let i = 0; i < n; i++) r.i32(); }
    }
  }

  function readBeatEffects(r, V) {
    const flags = r.u8();
    let flags2 = 0;
    if (V >= 400) flags2 = r.u8();
    if (flags & 0x20) { r.i8(); if (V < 400) r.skip(4); }
    if (flags2 & 0x04) readBendPoints(r);
    if (flags & 0x40) { r.u8(); r.u8(); }
    if (flags2 & 0x02) r.i8();
  }
  function readBendPoints(r) {
    r.u8(); r.i32();
    const n = r.i32();
    if (n < 0 || n > 400) throw new Error('Повреждённые данные эффекта');
    for (let i = 0; i < n; i++) { r.i32(); r.i32(); r.u8(); }
  }

  function readMixTable(r, V) {
    r.i8();
    if (V >= 500) r.skip(16);
    const vol = r.i8(), bal = r.i8(), cho = r.i8(), rev = r.i8(), pha = r.i8(), tre = r.i8();
    if (V >= 500) r.strIntByte();
    const tempo = r.i32();
    if (vol >= 0) r.u8();
    if (bal >= 0) r.u8();
    if (cho >= 0) r.u8();
    if (rev >= 0) r.u8();
    if (pha >= 0) r.u8();
    if (tre >= 0) r.u8();
    if (tempo >= 0) { r.i8(); if (V >= 510) r.u8(); }
    if (V >= 400) r.u8();
    if (V >= 500) r.i8();
    if (V >= 510) { r.strIntByte(); r.strIntByte(); }
  }

  function readNote(r, V) {
    const flags = r.u8();
    const note = { midi: -1, ghost: (flags & 0x04) !== 0, accent: (flags & 0x42) !== 0, tie: false, dead: false };
    if (flags & 0x20) { const t = r.u8(); if (t === 2) note.tie = true; if (t === 3) note.dead = true; }
    if ((flags & 0x01) && V < 500) { r.u8(); r.u8(); }
    if (flags & 0x10) r.i8();
    const hasFret = (flags & 0x20) !== 0;
    if (hasFret) note.midi = r.i8();
    if (flags & 0x80) { r.i8(); r.i8(); }
    if (V >= 500) {
      if (flags & 0x01) r.skip(8);
      r.u8();
    }
    if (flags & 0x08) readNoteEffects(r, V);
    return hasFret && !note.tie ? note : null;
  }

  function readNoteEffects(r, V) {
    const flags = r.u8();
    let flags2 = 0;
    if (V >= 400) flags2 = r.u8();
    if (flags & 0x01) readBendPoints(r);
    if (flags & 0x10) { // форшлаг
      r.i8(); r.i8(); r.i8(); r.skip(1);
      if (V >= 500) r.u8();
    }
    if (flags2 & 0x04) r.u8();
    if (flags2 & 0x08) r.i8();
    if (flags2 & 0x10) {
      const type = r.u8();
      if (V >= 500) {
        if (type === 2) r.skip(3);
        else if (type === 3) r.u8();
      }
    }
    if (flags2 & 0x20) { r.u8(); r.u8(); }
  }

  /* ---------------- ZIP (GP7/8) ---------------- */
  async function inflateRaw(u8) {
    if (typeof DecompressionStream === 'undefined') throw new Error('Этот браузер не умеет распаковывать GP7-файлы');
    const ds = new DecompressionStream('deflate-raw');
    const out = new Response(new Blob([u8]).stream().pipeThrough(ds));
    return new Uint8Array(await out.arrayBuffer());
  }
  async function unzipFile(u8, wanted) {
    const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
    let e = u8.length - 22;
    while (e >= 0 && dv.getUint32(e, true) !== 0x06054b50) e--;
    if (e < 0) throw new Error('Повреждённый архив GP');
    const count = dv.getUint16(e + 10, true);
    let p = dv.getUint32(e + 16, true);
    for (let i = 0; i < count; i++) {
      if (dv.getUint32(p, true) !== 0x02014b50) break;
      const method = dv.getUint16(p + 10, true);
      const csize = dv.getUint32(p + 20, true);
      const nlen = dv.getUint16(p + 28, true), xlen = dv.getUint16(p + 30, true), clen = dv.getUint16(p + 32, true);
      const lho = dv.getUint32(p + 42, true);
      const name = new TextDecoder().decode(u8.subarray(p + 46, p + 46 + nlen));
      if (name === wanted) {
        const ln = dv.getUint16(lho + 26, true), lx = dv.getUint16(lho + 28, true);
        const start = lho + 30 + ln + lx;
        const raw = u8.subarray(start, start + csize);
        return method === 0 ? raw : inflateRaw(raw);
      }
      p += 46 + nlen + xlen + clen;
    }
    throw new Error('В архиве нет партитуры');
  }

  /* ---------------- GPX (GP6): BCFZ ---------------- */
  function gpxFiles(u8) {
    const hdr = latin1(u8.subarray(0, 4));
    let data;
    if (hdr === 'BCFZ') {
      let pos = 4, cur = 0, bit = 8;
      const readBit = () => {
        if (bit >= 8) { if (pos >= u8.length) throw new RangeError('eof'); cur = u8[pos++]; bit = 0; }
        const v = (cur >> (7 - bit)) & 1; bit++; return v;
      };
      const bits = (n) => { let v = 0; for (let i = n - 1; i >= 0; i--) v |= readBit() << i; return v; };
      const bitsRev = (n) => { let v = 0; for (let i = 0; i < n; i++) v |= readBit() << i; return v; };
      const expected = bits(8) | (bits(8) << 8) | (bits(8) << 16) | (bits(8) << 24);
      if (expected <= 0 || expected > 64 * 1024 * 1024) throw new Error('Повреждённый GPX');
      const out = new Uint8Array(expected + 8);
      let len = 0;
      try {
        while (len < expected) {
          if (readBit() === 1) {
            const w = bits(4), off = bitsRev(w), size = bitsRev(w);
            const src = len - off, take = Math.min(off, size);
            for (let i = 0; i < take; i++) out[len++] = out[src + i];
          } else {
            const size = bitsRev(2);
            for (let i = 0; i < size; i++) out[len++] = bits(8);
          }
        }
      } catch (e) { if (!(e instanceof RangeError)) throw e; }
      data = out.subarray(4, len);
    } else if (hdr === 'BCFS') {
      data = u8.subarray(4);
    } else throw new Error('Неизвестный формат GPX');
    const dv = new DataView(data.buffer, data.byteOffset, data.byteLength);
    const files = {};
    const S = 0x1000;
    let off = S;
    while (off + 3 < data.length) {
      if (dv.getInt32(off, true) === 2) {
        let name = '';
        for (let i = 0; i < 127 && data[off + 4 + i]; i++) name += String.fromCharCode(data[off + 4 + i]);
        const size = dv.getInt32(off + 0x8c, true);
        const chunks = [];
        let total = 0, k = 0;
        for (;;) {
          const po = off + 0x94 + 4 * k++;
          if (po + 4 > data.length) break;
          const sector = dv.getInt32(po, true);
          if (sector === 0) break;
          const so = sector * S;
          if (so >= data.length) break;
          off = Math.max(off, so);
          if (total < size) { chunks.push(data.subarray(so, Math.min(so + S, data.length))); total += S; }
        }
        const buf = new Uint8Array(Math.min(size, chunks.reduce((a, c) => a + c.length, 0)));
        let q = 0;
        for (const c of chunks) { const n = Math.min(c.length, buf.length - q); buf.set(c.subarray(0, n), q); q += n; }
        files[name] = buf;
      }
      off += S;
    }
    return files;
  }

  /* ---------------- GPIF (XML, GP6/7/8) ---------------- */
  // GP6: элемент + вариация -> номер артикуляции (как в alphaTab)
  const GP6_EV = [[35, 35, 35], [38, 91, 37], [99, 100, 99], [56, 100, 56], [102, 103, 102], [43, 43, 43], [45, 45, 45], [47, 47, 47],
    [48, 48, 48], [50, 50, 50], [42, 92, 46], [44, 44, 44], [57, 98, 57], [49, 97, 49], [55, 95, 55], [51, 93, 127], [52, 96, 52]];
  // артикуляции GP7 (идентификаторы) -> MIDI-эквивалент
  const ART_TO_MIDI = { 91: 38, 92: 46, 93: 51, 94: 51, 95: 55, 96: 52, 97: 49, 98: 57, 127: 53 };

  function parseGpif(xml) {
    const doc = new DOMParser().parseFromString(xml, 'application/xml');
    if (doc.querySelector('parsererror')) throw new Error('Не удалось прочитать XML партитуры');
    const gp = doc.documentElement;
    const kid = (n, tag) => { for (const c of n.children) if (c.tagName === tag) return c; return null; };
    const kids = (n, tag) => Array.from(n.children).filter((c) => c.tagName === tag);
    const text = (n, tag) => { const c = n && kid(n, tag); return c ? c.textContent.trim() : ''; };
    const byId = (listTag, itemTag) => {
      const map = {}; const list = kid(gp, listTag);
      if (list) for (const it of kids(list, itemTag)) map[it.getAttribute('id')] = it;
      return map;
    };
    const rhythms = byId('Rhythms', 'Rhythm'), beats = byId('Beats', 'Beat'), voices = byId('Voices', 'Voice');
    const bars = byId('Bars', 'Bar'), notes = byId('Notes', 'Note');
    const score = { title: text(kid(gp, 'Score'), 'Title'), tempo: 120, tracks: [] };

    const tempoAut = kid(gp, 'MasterTrack') && kid(kid(gp, 'MasterTrack'), 'Automations');
    if (tempoAut) for (const a of kids(tempoAut, 'Automation')) if (text(a, 'Type') === 'Tempo') { score.tempo = Math.round(parseFloat(text(a, 'Value'))) || 120; break; }

    const trackNodes = kids(kid(gp, 'Tracks'), 'Track');
    const tracks = trackNodes.map((tn) => {
      const set = kid(tn, 'InstrumentSet');
      const arts = [];
      if (set && text(set, 'Type') === 'drumKit') {
        const els = kid(set, 'Elements');
        if (els) for (const el of kids(els, 'Element')) {
          const al = kid(el, 'Articulations');
          if (al) for (const a of kids(al, 'Articulation')) {
            const input = parseInt(text(a, 'InputMidiNumbers').split(/\s+/)[0], 10);
            const out = parseInt(text(a, 'OutputMidiNumber'), 10);
            arts.push({ id: isNaN(input) ? -1 : input, midi: isNaN(out) ? input : out });
          }
        }
      }
      const staves = kid(tn, 'Staves') ? kids(kid(tn, 'Staves'), 'Staff').length : 1;
      return { name: text(tn, 'Name') || 'Дорожка', drums: arts.length > 0, arts, staves: Math.max(1, staves), bars: [] };
    });

    const masters = kids(kid(gp, 'MasterBars'), 'MasterBar');
    masters.forEach((mb) => {
      const [tn, td] = (text(mb, 'Time') || '4/4').split('/').map(Number);
      const barIds = text(mb, 'Bars').split(/\s+/).filter(Boolean);
      let k = 0;
      for (const tr of tracks) {
        for (let s = 0; s < tr.staves; s++) {
          const id = barIds[k++];
          if (s > 0) continue; // берём первый стан дорожки
          const bar = id !== undefined && id !== '-1' ? bars[id] : null;
          const vs = [];
          if (bar) {
            for (const vid of text(bar, 'Voices').split(/\s+/).filter(Boolean)) {
              if (vid === '-1' || !voices[vid]) continue;
              const bl = [];
              for (const bid of text(voices[vid], 'Beats').split(/\s+/).filter(Boolean)) {
                const bn = beats[bid]; if (!bn) continue;
                const rn = rhythms[kid(bn, 'Rhythm') ? kid(bn, 'Rhythm').getAttribute('ref') : ''];
                let value = 'quarter', dots = 0, tup = null;
                if (rn) {
                  value = text(rn, 'NoteValue').toLowerCase() || 'quarter';
                  const ad = kid(rn, 'AugmentationDot'); if (ad) dots = parseInt(ad.getAttribute('count'), 10) || 0;
                  const pt = kid(rn, 'PrimaryTuplet'); if (pt) tup = [parseInt(pt.getAttribute('num'), 10), parseInt(pt.getAttribute('den'), 10)];
                }
                const ns = [];
                for (const nid of text(bn, 'Notes').split(/\s+/).filter(Boolean)) {
                  const nn = notes[nid]; if (!nn) continue;
                  const tie = kid(nn, 'Tie');
                  if (tie && tie.getAttribute('destination') === 'true') continue;
                  let midi = -1;
                  const ia = text(nn, 'InstrumentArticulation');
                  if (ia !== '') {
                    const idx = parseInt(ia, 10);
                    if (idx < tr.arts.length) midi = tr.arts[idx].midi;
                    else {
                      const hit = tr.arts.find((a) => a.id === idx);
                      midi = hit ? hit.midi : (ART_TO_MIDI[idx] || idx);
                    }
                  } else {
                    let el = -1, va = -1;
                    const props = kid(nn, 'Properties');
                    if (props) for (const p of kids(props, 'Property')) {
                      const nm = p.getAttribute('name');
                      if (nm === 'Element') el = parseInt(text(p, 'Element'), 10);
                      if (nm === 'Variation') va = parseInt(text(p, 'Variation'), 10);
                    }
                    if (el >= 0 && el < GP6_EV.length) { const a = GP6_EV[el][va >= 0 && va < 3 ? va : 0]; midi = ART_TO_MIDI[a] || a; }
                  }
                  if (midi >= 0) ns.push({ midi, ghost: !!kid(nn, 'AntiAccent'), accent: !!kid(nn, 'Accent') });
                }
                bl.push({ ticks: beatTicks(value, dots, tup), notes: ns });
              }
              vs.push(bl);
            }
          }
          tr.bars.push({ ts: [tn || 4, td || 4], voices: vs });
        }
      }
    });
    score.tracks = tracks.map((t) => ({ name: t.name, drums: t.drums, bars: t.bars }));
    return score;
  }

  /* ---------------- общий вход ---------------- */
  async function parse(arrayBuffer) {
    const u8 = new Uint8Array(arrayBuffer);
    if (u8.length < 30) throw new Error('Файл слишком маленький');
    let score;
    if (u8[0] === 0x50 && u8[1] === 0x4b) {
      const xml = new TextDecoder().decode(await unzipFile(u8, 'Content/score.gpif'));
      score = parseGpif(xml);
    } else if (latin1(u8.subarray(0, 4)) === 'BCFZ' || latin1(u8.subarray(0, 4)) === 'BCFS') {
      const f = gpxFiles(u8);
      if (!f['score.gpif']) throw new Error('В GPX нет партитуры');
      score = parseGpif(new TextDecoder().decode(f['score.gpif']));
    } else {
      score = parseBinary(u8);
    }
    // дорожки без барабанных нот не помечаем как барабанные ошибочно: у бинарных drums берём флаг, иначе эвристика по MIDI-каналу не нужна
    score.barCount = score.tracks.length ? score.tracks[0].bars.length : 0;
    if (!score.barCount) throw new Error('В файле нет тактов');
    return score;
  }

  /* ---------------- MIDI -> наши обозначения ----------------
   * H хет закрытый, O хет открытый, P хет ногой, S малый, K бочка,
   * T1 высокий том, T2 средний, T3 напольный, C крэш/сплэш/чайна, R райд
   */
  const MIDI_TOKEN = {
    35: 'K', 36: 'K', 37: 'S', 38: 'S', 39: 'S', 40: 'S',
    41: 'T3', 43: 'T3', 45: 'T2', 47: 'T2', 48: 'T1', 50: 'T1',
    42: 'H', 44: 'P', 46: 'O', 49: 'C', 52: 'C', 55: 'C', 57: 'C', 51: 'R', 53: 'R', 59: 'R',
  };
  const TOKEN_ORDER = ['C', 'R', 'H', 'O', 'T1', 'T2', 'S', 'T3', 'K', 'P'];

  /* ---------------- экспорт упражнения ---------------- */
  function toExercise(score, trackIndex, from, to) {
    const tr = score.tracks[trackIndex];
    if (!tr) throw new Error('Нет такой дорожки');
    from = Math.max(0, from); to = Math.min(tr.bars.length - 1, Math.min(to, from + 3));
    const bars = [];
    let unknown = 0;
    for (let b = from; b <= to; b++) {
      const bar = tr.bars[b];
      const len = Math.round((bar.ts[0] * 4 * QUARTER) / bar.ts[1]);
      const hits = new Map(); // тик -> {tokens:Set, ghost:Set}
      for (const voice of bar.voices) {
        let t = 0;
        for (const beat of voice) {
          if (t >= len) break;
          for (const n of beat.notes) {
            const tok = MIDI_TOKEN[n.midi];
            if (!tok) { unknown++; continue; }
            if (!hits.has(t)) hits.set(t, new Map());
            const m = hits.get(t);
            m.set(tok, m.get(tok) === 'a' ? 'a' : n.ghost ? 'g' : n.accent ? 'a' : '');
          }
          t += beat.ticks;
        }
      }
      bars.push({ len, hits, ts: bar.ts });
    }
    // подбираем самую грубую сетку, в которую попадают все удары
    const cands = [1, 2, 3, 4, 6, 8, 12, 16, 24, 48];
    let div = 48;
    for (const d of cands) {
      const unit = QUARTER / d;
      if (bars.every((bar) => bar.len % unit === 0 && Array.from(bar.hits.keys()).every((t) => t % unit === 0))) { div = d; break; }
    }
    const unit = QUARTER / div;
    const steps = [], barSteps = [], clicks = [];
    for (const bar of bars) {
      const n = Math.max(1, Math.round(bar.len / unit));
      barSteps.push(n);
      for (let i = 0; i < n; i++) {
        const m = bar.hits.get(Math.round(i * unit));
        // ближайший удар для неквантуемых данных (div=48)
        const toks = [];
        if (m) {
          for (const tok of TOKEN_ORDER) if (m.has(tok)) toks.push((m.get(tok) === 'g' ? 'g' : '') + tok);
        }
        steps.push(toks.length ? toks.join('+') : '-');
        clicks.push(i === 0 ? 2 : i % div === 0 ? 1 : 0);
      }
    }
    return {
      steps, div, barSteps, clicks, ts: bars.map((b) => b.ts), tempo: score.tempo || 100,
      unknown, bars: [from + 1, to + 1], trackName: tr.name, title: score.title,
    };
  }

  const GP = { parse, toExercise, MIDI_TOKEN, TOKEN_ORDER };
  root.GP = GP;
  if (typeof module !== 'undefined' && module.exports) module.exports = GP;
})(typeof window !== 'undefined' ? window : globalThis);
