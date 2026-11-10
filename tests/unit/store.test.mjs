import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStore } from '../../www/src/core/store.js';

const fakeStorage = (init) => { const m = new Map(init ? [['k', init]] : []); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v), m }; };
const at = (h, m) => new Date(2026, 10, 9, h, m);

test('пустое хранилище: значения по умолчанию', () => {
  const s = createStore(fakeStorage(), 'k');
  assert.equal(s.d.settings.click, true);
  assert.deepEqual(s.d.plan, []);
  assert.equal(s.d.settings.auto.max, 200);
});

test('битые данные не ломают запуск', () => {
  assert.doesNotThrow(() => createStore(fakeStorage('{oops'), 'k'));
});

test('старые настройки дополняются новыми полями', () => {
  const s = createStore(fakeStorage(JSON.stringify({ settings: { click: false, auto: { on: true } } })), 'k');
  assert.equal(s.d.settings.click, false);
  assert.equal(s.d.settings.auto.on, true);
  assert.equal(s.d.settings.auto.step, 5);
  assert.equal(s.d.settings.sound, true);
});

test('сессия короче 10 с запоминает только темп', () => {
  const s = createStore(fakeStorage(), 'k');
  assert.equal(s.recordSession('a', 9, 90, 95, at(10, 0)), false);
  assert.equal(s.d.lastBpm.a, 90);
  assert.equal(s.d.best.a, undefined);
});

test('сессия записывается: день, рекорд, история', () => {
  const st = fakeStorage(), s = createStore(st, 'k');
  s.recordSession('a', 60, 100, 110, at(10, 5));
  s.recordSession('a', 30, 90, 95, at(18, 30));
  assert.equal(s.secOnDay('2026-11-09'), 90);
  assert.equal(s.d.best.a, 110);
  assert.equal(s.d.days['2026-11-09'].sessions[1].t, '18:30');
  assert.equal(s.d.last.a, '2026-11-09');
  assert.ok(st.m.get('k').includes('"best"'), 'данные сохранены в storage');
});

test('история ограничена 40 записями', () => {
  const s = createStore(fakeStorage(), 'k');
  for (let i = 0; i < 45; i++) s.recordSession('a', 20, 80, 80 + i, at(9, 0));
  assert.equal(s.d.hist.a.length, 40);
});

test('план: переключение, удаление партии чистит план', () => {
  const s = createStore(fakeStorage(), 'k');
  assert.equal(s.togglePlan('x'), true);
  assert.equal(s.togglePlan('x'), false);
  s.addPart({ id: 'imp:1' }); s.setPlan(['imp:1', 'y']); s.removePart('imp:1');
  assert.deepEqual(s.d.plan, ['y']); assert.deepEqual(s.d.parts, []);
});

test('челлендж: рекорд темпа не уменьшается', () => {
  const s = createStore(fakeStorage(), 'k');
  s.markChallenge('c', 120, at(9, 0)); s.markChallenge('c', 100, at(9, 0));
  assert.equal(s.d.challenges.c.best, 120);
});

test('экспорт → импорт восстанавливает данные, мусор отклоняется', () => {
  const a = createStore(fakeStorage(), 'k'); a.recordSession('a', 60, 100, 100, at(9, 0));
  const b = createStore(fakeStorage(), 'k'); b.importJSON(a.exportJSON());
  assert.equal(b.d.best.a, 100);
  assert.throws(() => b.importJSON('42 '.trim() === '42' ? 'null' : ''));
});
