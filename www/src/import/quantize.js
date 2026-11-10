/** Выбранные такты -> сетка шагов (чистая логика, без DOM). */
import { TPQ } from './model.js';

export const MAX_BARS = 4;
const DIV_CANDIDATES = [4, 12, 8, 24]; // 16-е, триоли, 32-е, 16-е триоли
const START_BPM_FACTOR = 0.7;          // стартовый темп упражнения от оригинала

/** Минимальная сетка (шагов на долю), на которой лежат все ноты; иначе самая мелкая. */
export function chooseDiv(ticks) {
  for (const div of DIV_CANDIDATES) {
    const step = TPQ / div;
    if (ticks.every((t) => Math.abs(t / step - Math.round(t / step)) < 1e-6)) return div;
  }
  return DIV_CANDIDATES[DIV_CANDIDATES.length - 1];
}

/**
 * @returns {{ div, parsed, bars, bpm, fullBpm }}
 *   parsed[i] — удары шага i; bars — [{ start, len, num, den }] в шагах
 */
export function buildPart(source, trackIndex, fromBar, count) {
  const selected = source.bars(trackIndex, fromBar, Math.min(MAX_BARS, Math.max(1, count)));
  if (!selected.length) throw new Error('В этом диапазоне нет тактов');

  const div = chooseDiv(selected.flatMap((bar) => bar.events.map((e) => e.tick)));
  const step = TPQ / div;
  const parsed = [], bars = [];

  for (const bar of selected) {
    const len = Math.max(1, Math.round(bar.len / step));
    const cells = Array.from({ length: len }, () => ({}));
    for (const e of bar.events) {
      const cell = cells[Math.min(len - 1, Math.round(e.tick / step))];
      if (!cell[e.limb] || e.v > cell[e.limb].v) cell[e.limb] = { limb: e.limb, v: e.v, open: !!e.open, acc: e.v >= 1, mod: '', buzz: false };
    }
    bars.push({ start: parsed.length, len, num: bar.num, den: bar.den });
    for (const cell of cells) parsed.push(Object.values(cell));
  }
  if (!parsed.some((hits) => hits.length)) throw new Error('В выбранных тактах нет ударных нот');

  const fullBpm = source.bpm || 100;
  return { div, parsed, bars, fullBpm, bpm: Math.min(240, Math.max(40, Math.round(fullBpm * START_BPM_FACTOR))) };
}
