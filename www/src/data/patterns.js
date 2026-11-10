/*
 * Паттерны. Легко редактировать: добавляй свои строки в нужную категорию.
 *
 * Запись шага (токена), шаги разделены пробелом:
 *   R / L   — правая / левая рука (малый барабан)   S — малый (без руки)
 *   K       — бас-бочка     H — хет/райд     X — крэш
 *   Заглавная буква = акцент, строчная (r l) = тихий удар
 *   fR      — флэм (форшлаг от противоположной руки)
 *   dR      — драг (два форшлага перед основным ударом)
 *   R~      — бузз (многократный отскок)
 *   H+K     — удары одновременно
 *   -       — пауза
 * div — сколько шагов в одной доле (4 = 16-е, 3 = триоли, 2 = восьмые).
 */
export const CATS = [
  { id: 'rud', name: 'Рудименты' },
  { id: 'acc', name: 'Акценты 16-х' },
  { id: 'kit', name: 'Установка' },
];

const list = [];
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9а-я]+/gi, '-').replace(/^-|-$/g, '');
const add = (cat, name, steps, o = {}) => {
  const arr = Array.isArray(steps) ? steps : steps.trim().split(/\s+/);
  list.push({
    id: cat + ':' + slug(name),
    cat, name, steps: arr,
    div: o.div || 4,
    bpm: o.bpm || 80,
    note: o.note || '',
  });
};
const pad4 = (a, div = 4) => { a = a.slice(); while (a.length % div) a.push('-'); return a; };

/* ---------- Рулоны (rolls) ---------- */
add('rud', 'Single Stroke Roll', 'R L R L', { bpm: 90, note: 'Одиночные удары, руки строго по очереди.' });
add('rud', 'Single Stroke Four', 'R L R L - - - -', { bpm: 90, note: 'Четыре удара и пауза.' });
add('rud', 'Single Stroke Seven', 'R L R L R L R -', { bpm: 90, note: 'Семь одиночных ударов и пауза.' });
add('rud', 'Multiple Bounce Roll', 'R~ L~ R~ L~', { div: 2, bpm: 70, note: 'Закрытый (бузз) рулон: каждый удар — серия отскоков.' });
add('rud', 'Double Stroke Open Roll', 'R R L L', { bpm: 80, note: 'Двойные удары: RRLL.' });
add('rud', 'Triple Stroke Roll', 'R R R L L L', { div: 3, bpm: 70, note: 'Тройные удары: RRR LLL.' });

// нечётные рулоны: пары + акцентная одиночная нота, зеркально
const oddRoll = (n) => {
  const pairs = (n - 1) / 2;
  const seq = (first) => {
    const s = []; let h = first;
    for (let i = 0; i < pairs; i++) { s.push(h, h); h = h === 'r' ? 'l' : 'r'; }
    s.push(h.toUpperCase());
    return pad4(s);
  };
  return seq('r').concat(seq('l'));
};
[5, 7, 9, 11, 13, 15, 17].forEach((n) => {
  const names = { 5: 'Five', 7: 'Seven', 9: 'Nine', 11: 'Eleven', 13: 'Thirteen', 15: 'Fifteen', 17: 'Seventeen' };
  add('rud', names[n] + ' Stroke Roll', oddRoll(n), { bpm: 70, note: n + ' ударов: пары и акцент на последнем.' });
});
add('rud', 'Six Stroke Roll', 'R l l r r L - - L r r l l R - -', { bpm: 70, note: 'Акцент на первом и последнем ударе.' });
add('rud', 'Ten Stroke Roll', 'r r l l r r l l R L - - l l r r l l r r L R - -', { bpm: 70, note: 'Четыре пары и два акцентных одиночных.' });

/* ---------- Диддлы ---------- */
add('rud', 'Single Paradiddle', 'R l r r L r l l', { bpm: 90, note: 'RLRR LRLL.' });
add('rud', 'Double Paradiddle', 'R l r l r r L r l r l l', { div: 3, bpm: 80, note: 'RLRLRR LRLRLL.' });
add('rud', 'Triple Paradiddle', 'R l r l r l r r L r l r l r l l', { bpm: 80, note: 'RLRLRLRR LRLRLRLL.' });
add('rud', 'Paradiddle-diddle', 'R l r r l l', { div: 3, bpm: 80, note: 'RLRRLL — шесть нот на две доли, триоли.'});

/* ---------- Флэмы ---------- */
add('rud', 'Flam', 'fR fL', { div: 2, bpm: 70, note: 'Форшлаг от другой руки и основной удар.' });
add('rud', 'Flam Accent', 'fR l r fL r l', { div: 3, bpm: 70, note: 'Флэм + два тихих удара, триоли.' });
add('rud', 'Flam Tap', 'fR R fL L', { bpm: 80, note: 'Флэм и тап той же рукой.' });
add('rud', 'Inverted Flam Tap', 'fR l fL r', { bpm: 80, note: 'Флэм и тап противоположной рукой.' });
add('rud', 'Flam Paradiddle', 'fR l r r fL r l l', { bpm: 80, note: 'Парадиддл с флэмом на акценте.' });
add('rud', 'Flam Paradiddle-diddle', 'fR l r r l l fL r l l r r', { div: 3, bpm: 70, note: 'Флэм + парадиддл-диддл.' });
add('rud', 'Pataflafla', 'r l fR fL', { bpm: 70, note: 'Пата-флафла: два тихих, затем два флэма.' });
add('rud', 'Swiss Army Triplet', 'fR r l fL l r', { div: 3, bpm: 70, note: 'Флэм и две ноты, триоли.' });

/* ---------- Драги ---------- */
add('rud', 'Single Drag Tap', 'dR l dL r', { bpm: 70, note: 'Драг, тап другой рукой.' });
add('rud', 'Double Drag Tap', 'dR r dL l', { bpm: 70, note: 'Драг и тап той же рукой.' });
add('rud', 'Ratamacue', 'dR l r L', { bpm: 70, note: 'Драг + три удара, акцент на последнем.' });

/* ---------- Акценты на 16-х ---------- */
const accPattern = (name, accents, note) => {
  const steps = [];
  for (let i = 0; i < 16; i++) {
    const hand = i % 2 === 0 ? 'r' : 'l';
    steps.push(accents.includes(i + 1) ? hand.toUpperCase() : hand);
  }
  add('acc', name, steps, { bpm: 80, note });
};
const every = (pos) => [0, 1, 2, 3].map((b) => pos + b * 4);
accPattern('Акцент на «раз»', every(1), 'Акцент на первую 16-ю каждой доли.');
accPattern('Акцент на «е»', every(2), 'Акцент на вторую 16-ю.');
accPattern('Акцент на «и»', every(3), 'Акцент на третью 16-ю.');
accPattern('Акцент на «а»', every(4), 'Акцент на четвёртую 16-ю.');
accPattern('Акцент «раз» и «и»', every(1).concat(every(3)), 'Акценты на восьмых.');
accPattern('Акцент «е» и «а»', every(2).concat(every(4)), 'Акценты на «е» и «а».');
accPattern('Акцент «раз» и «а»', every(1).concat(every(4)), 'Акцент на первой и последней 16-й.');
accPattern('Группировка 3-3-3-3-2-2', [1, 4, 7, 10, 13, 15], 'Группы по три 16-х, затем две по два.');
accPattern('Группировка 3-3-2-3-3-2', [1, 4, 7, 9, 12, 15], 'Классическая группировка 3-3-2 дважды.');
accPattern('Группировка 5-5-6', [1, 6, 11], 'Пятёрки и шестёрка поверх такта.');

/* ---------- Установка ---------- */
add('kit', 'RLK (триоли)', 'r l K', { div: 3, bpm: 70, note: 'Правая, левая, бочка — каждая нота триоли.' });
add('kit', 'LRK (триоли)', 'l r K', { div: 3, bpm: 70, note: 'Зеркально: левая, правая, бочка.' });
add('kit', 'RLRK', 'r l r K', { bpm: 80, note: 'Три руки и бочка в 16-х.' });
add('kit', 'LRLK', 'l r l K', { bpm: 80, note: 'То же с левой руки.' });
add('kit', 'RLLK', 'r l l K', { bpm: 80 });
add('kit', 'RRLK', 'r r l K', { bpm: 80 });
add('kit', 'RLKK', 'r l K K', { bpm: 75, note: 'Две бочки подряд.' });
add('kit', 'RKLK', 'r K l K', { bpm: 80, note: 'Руки через бочку.' });
add('kit', 'KRKL', 'K r K l', { bpm: 80 });
add('kit', 'Парадиддл с бочкой', 'R l r K L r l K', { bpm: 80, note: 'Диддл заменён бочкой.' });
add('kit', 'Парадиддл хет/малый', 'H S H H S H S S', { bpm: 80, note: 'Правая на хете, левая на малом.' });
add('kit', 'Флэм + бочка', 'fR K fL K', { bpm: 70 });
add('kit', 'Двойная бочка 16-е', 'K K K K', { bpm: 70, note: 'Бочка двойным ударом (или двумя ногами).' });
add('kit', 'Двойная бочка + рука (триоли)', 'K K r K K l', { div: 3, bpm: 70 });
add('kit', 'Рок-бит 8-е', 'H+K H H+S H H+K H H+S H', { div: 2, bpm: 90, note: 'Хет 8-ми, бочка на 1 и 3, малый на 2 и 4.' });
add('kit', 'Рок-бит 8-е + бочка на «и»', 'H+K H H+S H H+K K H+S H', { div: 2, bpm: 90, note: 'Добавлена бочка на «и» третьей доли.' });
add('kit', 'Рок-бит 16-е на хете', 'H+K H H H H+S H H H H+K H H H H+S H H H', { bpm: 80, note: 'Хет 16-ми.' });
add('kit', 'Крэш + рок-бит', 'X+K H H+S H H+K H H+S H', { div: 2, bpm: 90, note: 'Крэш на «раз», дальше хет.' });
add('kit', 'Диско (бочка на каждую долю)', 'H+K H H+K+S H H+K H H+K+S H', { div: 2, bpm: 110, note: 'Four on the floor.' });

/* ---------- разбор токенов в удары ---------- */

const TOKEN = /^([fd]?)([RLSKHXrlskhx])(~?)$/;

/** 'H+K' -> [{limb:'H',...},{limb:'K',...}]; '-' -> [] */
export function parseToken(token) {
  if (token === '-' || token === '.') return [];
  return token.split('+').map((part) => {
    const m = TOKEN.exec(part);
    if (!m) return null;
    const ch = m[2];
    return { mod: m[1], ch, limb: ch.toUpperCase(), acc: ch === ch.toUpperCase(), buzz: !!m[3] };
  }).filter(Boolean);
}

export const SNARE_LIMBS = 'RLS';

/** Дополняет паттерн разобранными ударами: parsed[i] — список ударов шага i. */
function prepare(p) {
  p.parsed = p.steps.map(parseToken);
  p.hasSoft = p.parsed.some((hits) => hits.some((x) => SNARE_LIMBS.includes(x.limb) && !x.acc));
  return p;
}

/** Все встроенные паттерны. */
export const PATS = list.map(prepare);
/** id -> паттерн (встроенные + импортированные партии). */
export const byId = Object.fromEntries(PATS.map((p) => [p.id, p]));

/** Превращает сохранённую импортированную партию в паттерн и регистрирует её. */
export function registerPart(rec) {
  const p = {
    id: rec.id, cat: 'imp', name: rec.name, note: rec.note || '', div: rec.div, bpm: rec.bpm,
    parsed: rec.parsed, steps: rec.parsed.map((hits) => (hits.length ? 'x' : '-')), bars: rec.bars,
    perRow: rec.div === 4 ? 8 : rec.div, // колонок в строке плиток
    ratio: 1.7,                          // высота колонки / ширина
    hasSoft: false, custom: true,
  };
  byId[p.id] = p;
  return p;
}
