import { test } from 'node:test';
import assert from 'node:assert/strict';
import { weekSeconds, streak, dayLevel, monthShape, pickForPlan } from '../../www/src/core/stats.js';
import { dayKey, duration, clock } from '../../www/src/core/time.js';

const now = new Date(2026, 10, 9);
const sec = (map) => (k) => map[k] || 0;

test('серия считается от вчера, если сегодня ещё не играли', () => {
  assert.equal(streak(sec({ '2026-11-08': 60, '2026-11-07': 60 }), now), 2);
  assert.equal(streak(sec({ '2026-11-09': 5, '2026-11-08': 60 }), now), 2);
  assert.equal(streak(sec({}), now), 0);
});
test('неделя включает сегодня и 6 дней назад', () => {
  assert.equal(weekSeconds(sec({ '2026-11-09': 10, '2026-11-03': 20, '2026-11-02': 99 }), now), 30);
});
test('уровни яркости дня', () => {
  assert.deepEqual([0, 1, 299, 300, 900, 1800].map(dayLevel), [0, 1, 1, 2, 3, 4]);
});
test('форма месяца: ноябрь 2026 начинается с воскресенья', () => {
  assert.deepEqual(monthShape(2026, 10), { lead: 6, days: 30 });
});
test('подбор плана: без дублей, не из плана, count штук', () => {
  const pats = Array.from({ length: 30 }, (_, i) => ({ id: 'p' + i }));
  const ids = pickForPlan(pats, ['p0'], {}, 5, () => 0.3);
  assert.equal(ids.length, 5); assert.equal(new Set(ids).size, 5); assert.ok(!ids.includes('p0'));
});
test('форматирование времени', () => {
  assert.equal(dayKey(new Date(2026, 0, 5)), '2026-01-05');
  assert.deepEqual([duration(45), duration(125), duration(3900), clock(125)], ['45 с', '2 мин', '1 ч 05 м', '2:05']);
});
