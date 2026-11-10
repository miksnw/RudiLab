/** Стандартный MIDI-файл (SMF): ударные дорожки (канал 10) -> такты. */
import { TPQ, VELOCITY, makeEvent } from './model.js';

const MAX_BARS = 3000;

function velocityLevel(vel) {
  return vel >= 110 ? VELOCITY.accent : vel <= 50 ? VELOCITY.ghost : VELOCITY.normal;
}

export function parseMidi(buffer) {
  const view = new DataView(buffer), bytes = new Uint8Array(buffer);
  if (view.getUint32(0) !== 0x4d546864) throw new Error('Это не MIDI-файл');
  const trackCount = view.getUint16(10), division = view.getUint16(12);
  if (division & 0x8000) throw new Error('MIDI с SMPTE-временем не поддерживается');
  const ppq = division;

  const tracks = [];
  const signatures = [];
  let bpm = 0, pos = 14;
  const decoder = new TextDecoder();

  for (let t = 0; t < trackCount && pos < bytes.length; t++) {
    if (view.getUint32(pos) !== 0x4d54726b) break;
    const end = pos + 8 + view.getUint32(pos + 4);
    let q = pos + 8, tick = 0, running = 0, name = '', drumHits = 0;
    const notes = [];
    const varLen = () => { let v = 0, b; do { b = bytes[q++]; v = (v << 7) | (b & 0x7f); } while (b & 0x80); return v; };

    while (q < end) {
      tick += varLen();
      let status = bytes[q];
      if (status < 0x80) status = running; else { q++; if (status < 0xf0) running = status; }

      if (status === 0xff) { // meta
        const type = bytes[q++], len = varLen();
        if (type === 0x03) name = decoder.decode(bytes.subarray(q, q + len));
        else if (type === 0x51 && !bpm) bpm = Math.round(60000000 / ((bytes[q] << 16) | (bytes[q + 1] << 8) | bytes[q + 2]));
        else if (type === 0x58) signatures.push({ tick, num: bytes[q], den: 2 ** bytes[q + 1] });
        q += len;
      } else if (status === 0xf0 || status === 0xf7) q += varLen(); // sysex
      else {
        const kind = status & 0xf0, channel = status & 0x0f;
        const a = bytes[q++], b = (kind === 0xc0 || kind === 0xd0) ? 0 : bytes[q++];
        if (kind === 0x90 && b > 0) { notes.push({ tick, note: a, vel: b }); if (channel === 9) drumHits++; }
      }
    }
    pos = end;
    if (notes.length) tracks.push({ name: name || `Дорожка ${tracks.length + 1}`, isDrum: drumHits > notes.length / 2, notes });
  }

  // границы тактов с учётом смены размера (если размер не задан в начале — 4/4)
  signatures.sort((x, y) => x.tick - y.tick);
  const sigs = [];
  for (const sig of signatures) {
    if (sigs.length && sigs[sigs.length - 1].tick === sig.tick) sigs[sigs.length - 1] = sig; // последний на тот же тик
    else sigs.push(sig);
  }
  if (!sigs.length || sigs[0].tick > 0) sigs.unshift({ tick: 0, num: 4, den: 4 });
  const lastTick = Math.max(0, ...tracks.map((t) => t.notes[t.notes.length - 1].tick));
  const barList = [];
  for (let tick = 0, s = 0; tick <= lastTick && barList.length < MAX_BARS;) {
    while (s + 1 < sigs.length && sigs[s + 1].tick <= tick) s++;
    const ticks = Math.round((ppq * 4 * sigs[s].num) / sigs[s].den);
    barList.push({ start: tick, num: sigs[s].num, den: sigs[s].den, ticks });
    tick += ticks;
  }

  const scale = TPQ / ppq;
  return {
    name: '',
    bpm: bpm || 100,
    tracks: tracks.map((t) => ({ name: t.name, isDrum: t.isDrum, barCount: barList.length })),
    bars(trackIndex, from = 0, count = Infinity) {
      const { notes } = tracks[trackIndex];
      return barList.slice(from, from + count).map((bar) => ({
        num: bar.num, den: bar.den, len: Math.round(bar.ticks * scale),
        events: notes
          .filter((n) => n.tick >= bar.start && n.tick < bar.start + bar.ticks)
          .map((n) => makeEvent(Math.round((n.tick - bar.start) * scale), n.note, velocityLevel(n.vel)))
          .filter(Boolean),
      }));
    },
  };
}
