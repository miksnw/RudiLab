/**
 * Раскладка паттерна по рядам плиток. Чистая функция (без DOM) — покрыта тестами.
 * Возвращает массив рядов; ряд — массив индексов шагов, которые показываем плитками.
 */
const GRID_CANDIDATES = [2, 4, 3, 8, 6, 12, 24]; // какие сетки в доле пробуем, от самой редкой

export function layoutRows(p) {
  const perRow = p.perRow || 4;
  const rows = [];
  if (p.cat !== 'imp') {
    for (let start = 0; start < p.steps.length; start += perRow) {
      const len = Math.min(perRow, p.steps.length - start);
      rows.push(Array.from({ length: len }, (_, k) => start + k));
    }
    return rows;
  }
  // Импорт: в каждой доле оставляем только нужную сетку (8-е, триоли, 16-е...), новый такт — новая строка.
  const barStarts = new Set(p.bars.map((b) => b.start));
  let row = [];
  for (let beat = 0; beat < p.steps.length; beat += p.div) {
    const end = Math.min(p.steps.length, beat + p.div);
    const cols = beatColumns(p, beat, end);
    const stride = p.div / cols, idxs = [];
    for (let i = beat; i < end; i += stride) idxs.push(i);
    if (row.length && (row.length + idxs.length > perRow || barStarts.has(beat))) { rows.push(row); row = []; }
    row.push(...idxs);
  }
  if (row.length) rows.push(row);
  return rows;
}

/** Минимальная сетка доли, на которую ложатся все удары. */
function beatColumns(p, from, to) {
  for (const cols of GRID_CANDIDATES) {
    if (p.div % cols) continue;
    const stride = p.div / cols;
    let fits = true;
    for (let i = from; i < to && fits; i++) if (p.parsed[i].length && (i - from) % stride) fits = false;
    if (fits) return cols;
  }
  return p.div;
}

/** Порядок плиток в колонке сверху вниз: тарелки, хет, томы, руки, бочка. */
export const LIMB_ORDER = { C: 0, X: 0, RD: 1, H: 2, T1: 3, R: 4, L: 4, S: 4, T2: 5, T3: 6, K: 9 };

/** CSS-классы буквы в плитке. */
export function hitClass(p, x) {
  let mod = '';
  if (x.v !== undefined) mod = x.v >= 1 ? ' acc' : x.v < 0.5 ? ' soft' : '';
  else if (p.hasSoft && 'RLS'.includes(x.limb)) mod = x.acc ? ' acc' : ' soft';
  return 'c-' + x.limb + mod;
}
