import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Session } from '../../www/src/ui/session.js';
import { createStore } from '../../www/src/core/store.js';

const storage = () => { const m = new Map(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v) }; };
/** Поддельный движок: тест сам «проигрывает» проходы через cycle(). */
function fakeEngine() {
  const e = { playing: false, bpm: 0, loop: true, started: null,
    start(p, bpm, hooks) { e.playing = true; e.bpm = bpm; e.hooks = hooks; },
    stop() { e.playing = false; }, setBpm(b) { e.bpm = b; }, setLoop(l) { e.loop = l; },
    cycle(n) { e.hooks.onCycle(n); } };
  return e;
}
const pat = { id: 'p', bpm: 80, steps: ['R', 'L'], parsed: [[], []], div: 4 };
const make = (extra = {}) => {
  const store = createStore(storage(), 'k'), engine = fakeEngine(), calls = { bpm: [], complete: 0 };
  let t = 0;
  const s = new Session({ store, engine, pattern: pat, now: () => t, handlers: { bpm: (b) => calls.bpm.push(b), complete: () => calls.complete++ }, ...extra });
  return { s, store, engine, calls, tick: (sec) => { t += sec * 1000; } };
};

test('стартовый темп: рекомендованный, потом последний сыгранный', () => {
  assert.equal(make().s.bpm, 80);
  const { store } = make(); store.d.lastBpm.p = 95;
  assert.equal(new Session({ store, engine: fakeEngine(), pattern: pat }).bpm, 95);
});
test('Auto BPM: прибавка каждые N проходов до максимума, показ отложен до первого шага', () => {
  const { s, store, engine, calls } = make();
  Object.assign(store.d.settings.auto, { on: true, step: 5, every: 2, max: 90 });
  s.begin();
  engine.cycle(1); assert.equal(engine.bpm, 80);
  engine.cycle(2); assert.equal(engine.bpm, 85); assert.deepEqual(calls.bpm, []);
  engine.hooks.onStep(1); assert.deepEqual(calls.bpm, []);
  engine.hooks.onStep(0); assert.deepEqual(calls.bpm, [85]);
  engine.cycle(4); engine.cycle(6); engine.cycle(8); assert.equal(engine.bpm, 90);
});
test('запись сессии при остановке: максимум и время', () => {
  const { s, store, tick } = make();
  s.begin(); s.setBpm(120); tick(30);
  const r = s.end();
  assert.equal(r.saved, true); assert.equal(store.d.best.p, 120);
  assert.equal(s.end(), null, 'повторный end ничего не делает');
});
test('короткая сессия не записывается', () => {
  const { s, store, tick } = make(); s.begin(); tick(3);
  assert.equal(s.end().saved, false); assert.equal(store.d.best.p, undefined);
});
test('челлендж: засчитывается после прохода на целевом темпе и выключает loop', () => {
  const ch = { key: 'ch:x', from: 100, to: 110, step: 5, every: 1 };
  const { s, store, engine, calls } = make({ challenge: ch });
  s.begin();
  engine.cycle(1); engine.cycle(2);          // 105, 110
  assert.equal(engine.bpm, 110); assert.equal(calls.complete, 0);
  engine.cycle(3);                           // проход на 110 сыгран
  assert.equal(calls.complete, 1); assert.equal(engine.loop, false);
  assert.equal(store.d.challenges['ch:x'].done, true);
});
test('темп ограничен 30..260', () => {
  const { s } = make(); s.setBpm(999); assert.equal(s.bpm, 260); s.setBpm(1); assert.equal(s.bpm, 30);
});
