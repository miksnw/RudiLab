import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Scheduler, LOOKAHEAD_SEC } from '../../www/src/audio/scheduler.js';

/** Гоняет планировщик с «грубым» тикером: период tickMs ± jitterMs. Возвращает все выданные шаги. */
function run({ bpm = 120, div = 4, len = 8, tickMs = 40, jitterMs = 0, seconds = 10, loop = true, onCycle }) {
  let clock = 0, seed = 1;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const s = new Scheduler({ now: () => clock });
  s.loop = loop; s.onCycle = onCycle ? (n) => onCycle(n, s) : null;
  s.start({ len, div }, bpm, 0.1);
  const events = [];
  while (clock < seconds) {
    for (const ev of s.tick()) events.push({ ...ev, issuedAt: clock });
    clock += (tickMs + (rnd() * 2 - 1) * jitterMs) / 1000;
  }
  return { events, s };
}

test('шаги идут строго по сетке темпа', () => {
  const { events } = run({ bpm: 120, div: 4 });
  const step = 60 / 120 / 4;
  events.forEach((e, k) => assert.ok(Math.abs(e.t - (0.1 + k * step)) < 1e-9, `шаг ${k}`));
});

test('индексы циклично пробегают паттерн', () => {
  const { events } = run({ len: 6, seconds: 3 });
  events.forEach((e, k) => assert.equal(e.i, k % 6));
});

test('дрожание тикера меньше lookahead не нарушает ритм', () => {
  const clean = run({ jitterMs: 0 }).events, noisy = run({ jitterMs: 60, tickMs: 60 }).events;
  const n = Math.min(clean.length, noisy.length) - 8;
  for (let k = 0; k < n; k++) assert.ok(Math.abs(clean[k].t - noisy[k].t) < 1e-9);
});

test('каждый шаг выдан заранее (запас до звука > 0)', () => {
  const { events } = run({ jitterMs: 60, tickMs: 60 });
  const worst = Math.min(...events.slice(3).map((e) => e.t - e.issuedAt));
  assert.ok(worst > 0, `запас ${worst.toFixed(3)} с`);
});

test('при тикере медленнее lookahead ритм теряется — тест ловит регресс', () => {
  const { events } = run({ tickMs: LOOKAHEAD_SEC * 1000 * 2, seconds: 5 });
  assert.ok(Math.min(...events.slice(3).map((e) => e.t - e.issuedAt)) < 0);
});

test('смена темпа в onCycle действует со следующего прохода без разрыва', () => {
  const { events } = run({ len: 4, div: 4, bpm: 60, seconds: 6, onCycle: (n, s) => { if (n === 1) s.bpm = 120; } });
  const gaps = events.slice(1).map((e, k) => e.t - events[k].t);
  assert.ok(Math.abs(gaps[0] - 0.25) < 1e-9);       // 60 BPM
  assert.ok(Math.abs(gaps[gaps.length - 1] - 0.125) < 1e-9); // 120 BPM
});

test('loop=false: выдаёт один проход и останавливается', () => {
  const { events, s } = run({ len: 5, loop: false, seconds: 5 });
  assert.equal(events.length, 5);
  assert.equal(s.finishing, true);
});

test('onCycle может выключить loop', () => {
  const { events } = run({ len: 4, seconds: 10, onCycle: (n, s) => { if (n === 3) s.loop = false; } });
  assert.equal(events.length, 12);
});
