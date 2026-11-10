import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PATS, byId, parseToken, CATS } from '../../www/src/data/patterns.js';
import { PRESETS } from '../../www/src/data/challenges.js';
import { layoutRows } from '../../www/src/ui/pattern/layout.js';

test('токены', () => {
  assert.deepEqual(parseToken('-'), []);
  const [hat, kick] = parseToken('H+K');
  assert.equal(hat.limb, 'H'); assert.equal(kick.limb, 'K');
  const [flam] = parseToken('fR'); assert.equal(flam.mod, 'f');
  assert.equal(parseToken('R~')[0].buzz, true);
  assert.equal(parseToken('r')[0].acc, false);
});
test('все паттерны корректны: уникальные id, известные категории, ноты распознаны', () => {
  assert.equal(new Set(PATS.map((p) => p.id)).size, PATS.length);
  const cats = new Set(CATS.map((c) => c.id));
  for (const p of PATS) {
    assert.ok(cats.has(p.cat), p.name);
    assert.equal(p.parsed.length, p.steps.length);
    p.steps.forEach((tok, i) => { if (tok !== '-') assert.ok(p.parsed[i].length > 0, `${p.name}: «${tok}»`); });
    assert.ok([2, 3, 4].includes(p.div), p.name);
  }
});
test('все готовые челленджи привязаны к существующим паттернам', () => {
  assert.equal(PRESETS.length, 12);
  for (const c of PRESETS) assert.ok(byId[c.pid] && c.to > c.from);
});
test('раскладка встроенных: ряды по perRow, все шаги по порядку', () => {
  for (const p of PATS) {
    const rows = layoutRows(p), flat = rows.flat();
    assert.deepEqual(flat, p.steps.map((_, i) => i), p.name);
    rows.forEach((r) => assert.ok(r.length <= (p.perRow || 4)));
  }
});
test('раскладка импорта: пустые 16-е в долях сжимаются, такт — с новой строки', () => {
  const hit = [{ limb: 'S', v: 1 }];
  // 2 такта по 4 доли, сетка 4; ноты только на долях → в каждой доле минимальная сетка (2 колонки)
  const len = 16, parsed = Array.from({ length: len * 2 }, (_, i) => (i % 4 === 0 ? hit : []));
  const p = { cat: 'imp', div: 4, perRow: 8, parsed, steps: parsed.map(() => 'x'), bars: [{ start: 0, len }, { start: len, len }] };
  const rows = layoutRows(p);
  assert.equal(rows.length, 2);
  assert.deepEqual(rows[0], [0, 2, 4, 6, 8, 10, 12, 14]); // в доле остаются 2 колонки (8-е)
});
