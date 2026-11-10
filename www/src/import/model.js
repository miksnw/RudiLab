/**
 * Общая модель импорта.
 *
 * Источник (source), который возвращают парсеры файлов:
 *   { name, bpm, tracks: [{ name, isDrum, barCount }], bars(trackIndex, from?, count?) }
 * bars() отдаёт такты: { num, den, len, events: [{ tick, limb, open, v }] }
 *   len и tick — в тиках, TPQ тиков на четверть; v — громкость 0.3 (призрачная) .. 1 (акцент).
 *
 * Инструменты: H хет, S малый, K бочка, T1 T2 T3 томы, C крэш, RD райд.
 */
export const TPQ = 960;

/** Номер барабана General MIDI -> наш инструмент (или null, если не поддерживается). */
export function gmToLimb(note) {
  switch (note) {
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

export const VELOCITY = { ghost: 0.3, normal: 0.65, accent: 1 };

/** Событие или null, если нота не ударная/не поддержана. */
export function makeEvent(tick, midiNote, volume, extra = {}) {
  const info = gmToLimb(midiNote);
  return info ? { tick, limb: info.limb, open: !!info.open, v: volume, ...extra } : null;
}
