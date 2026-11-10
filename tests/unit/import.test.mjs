import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildPart, openFile, MAX_BARS } from '../../www/src/import/index.js';
import { chooseDiv } from '../../www/src/import/quantize.js';
import { TPQ } from '../../www/src/import/model.js';

const file = (path) => { const b = readFileSync(new URL('../fixtures/' + path, import.meta.url)); return { name: path, arrayBuffer: async () => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) }; };

test('chooseDiv: 16-е, триоли, мельче', () => {
  assert.equal(chooseDiv([0, TPQ / 4, TPQ / 2]), 4);
  assert.equal(chooseDiv([0, TPQ / 3]), 12);
  assert.equal(chooseDiv([0, TPQ / 8]), 8);
  assert.equal(chooseDiv([0, TPQ / 7]), 24);
});
test('MIDI: ударная дорожка находится, партия строится', async () => {
  const src = await openFile(file('test-drums.mid'));
  assert.ok(src.tracks.some((t) => t.isDrum));
  const part = buildPart(src, src.tracks.findIndex((t) => t.isDrum), 0, 4);
  assert.ok(part.parsed.some((h) => h.length) && part.bars.length >= 1 && part.bars.length <= MAX_BARS);
  assert.ok(part.bpm >= 40 && part.bpm <= 240);
});
// парсер .gp использует DOMParser браузера — в Node проверяется в e2e (tests/e2e/smoke.mjs)
test('GP7/8: партия строится из .gp', { skip: typeof DOMParser === 'undefined' && 'нужен DOMParser' }, async () => {
  const src = await openFile(file('test-groove.gp'));
  const i = src.tracks.findIndex((t) => t.isDrum);
  assert.ok(i >= 0);
  const part = buildPart(src, i, 0, 4);
  assert.ok(part.parsed.flat().length > 0);
});
test('старые форматы GP дают понятную ошибку', async () => {
  await assert.rejects(() => openFile(file('fake.gp5')), /не поддерживаются|Неизвестный/);
});
test('пустой диапазон тактов — ошибка', async () => {
  const src = await openFile(file('test-drums.mid'));
  assert.throws(() => buildPart(src, src.tracks.findIndex((t) => t.isDrum), 999, 1));
});
