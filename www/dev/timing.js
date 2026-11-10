/**
 * Замер тайминга метронома. Открыть www/dev/timing.html (через npm run serve).
 *  1) Офлайн: рендер через те же Scheduler и голоса, сравнение щелчков с идеальной сеткой.
 *     Показывает ошибку самой логики (должна быть доли миллисекунды). Не зависит от нагрузки.
 *  2) Живой: реальный AudioContext и тикер на устройстве. Меряет дрожание тикера, запас
 *     (насколько заранее шаг отдан в аудио) и опоздание подсветки. «Нагрузка» занимает главный
 *     поток, чтобы убедиться, что звук не плывёт.
 */
import { renderOffline, detectOnsets } from '../src/audio/render.js';
import { engine } from '../src/audio/engine.js';
import { PATS } from '../src/data/patterns.js';

const stats = (xs) => {
  if (!xs.length) return { n: 0, mean: 0, max: 0, min: 0, p95: 0 };
  const s = [...xs].sort((a, b) => a - b);
  return { n: xs.length, mean: xs.reduce((a, b) => a + b, 0) / xs.length, min: s[0], max: s[s.length - 1], p95: s[Math.floor(s.length * 0.95)] };
};
const ms = (v) => (v * 1000).toFixed(2);

/** Ошибка щелчков относительно идеальной сетки: ищем лучшее смещение (общая задержка не считается ошибкой). */
export async function measureOffline({ bpm = 120, div = 4, cycles = 4 } = {}) {
  const pattern = { steps: Array(8).fill('x'), parsed: Array.from({ length: 8 }, () => []), div };
  const { samples, sampleRate, events } = await renderOffline({ pattern, bpm, cycles, clickOnly: true });
  const beatEvents = events.filter((e) => e.i % div === 0);
  const onsets = detectOnsets(samples, sampleRate, { threshold: 0.02, minGapSec: 60 / bpm / 2 });
  const n = Math.min(onsets.length, beatEvents.length);
  const errs = Array.from({ length: n }, (_, k) => onsets[k] - beatEvents[k].t);
  const offset = errs.reduce((a, b) => a + b, 0) / n;       // постоянная задержка огибающей
  const dev = errs.map((e) => Math.abs(e - offset));
  return { bpm, clicks: n, expected: beatEvents.length, ...stats(dev), offset };
}

/** Живой замер на `seconds` секунд. stress: доля занятости главного потока (0..0.9). */
export async function measureLive({ bpm = 120, seconds = 6, stress = 0, pattern = PATS[0] } = {}) {
  const pumps = [], slack = [], late = [], times = [];
  let lastPump = 0;
  const origPump = engine.pump.bind(engine);
  engine.pump = () => { const t = performance.now(); if (lastPump) pumps.push((t - lastPump) / 1000); lastPump = t; origPump(); };
  const stopStress = stress ? burn(stress) : () => {};
  let hooked = false;
  const hook = () => {
    if (hooked || !engine.sched) return; hooked = true;
    const tick = engine.sched.tick.bind(engine.sched);
    engine.sched.tick = () => { const evs = tick(), now = engine.ctx.currentTime; for (const e of evs) { slack.push(e.t - now); times.push(e.t); } return evs; };
  };
  engine.click = true; engine.sound = false;
  engine.start(pattern, bpm, {
    loop: true,
    onStep: () => {
      const target = engine.ctx.currentTime - engine.visual.offset;
      let t = -1; for (let k = times.length - 1; k >= 0; k--) if (times[k] <= target) { t = times[k]; break; }
      if (t >= 0) late.push(target - t);
    },
  });
  hook();
  await new Promise((r) => setTimeout(r, seconds * 1000));
  engine.stop(); engine.pump = origPump; stopStress();
  return { bpm, stress, pump: stats(pumps), slack: stats(slack), late: stats(late), outputLatency: engine.outputLatency,
    underruns: slack.filter((s) => s <= 0).length };
}

function burn(load) {
  let on = true;
  (function loop() { if (!on) return; const end = performance.now() + 100 * load; while (performance.now() < end); setTimeout(loop, 100 * (1 - load)); })();
  return () => { on = false; };
}

/* ---- интерфейс страницы ---- */
const out = document.getElementById('out');
const log = (html) => { out.insertAdjacentHTML('beforeend', html); };
const row = (cells, tag = 'td') => `<tr>${cells.map((c) => `<${tag}>${c}</${tag}>`).join('')}</tr>`;

async function runOffline() {
  log('<h2>Офлайн: ошибка сетки щелчков, мс</h2><table>' + row(['BPM', 'щелчков', 'средняя', 'p95', 'макс'], 'th'));
  const all = [];
  for (const [bpm, div] of [[60, 4], [90, 3], [120, 4], [180, 4], [240, 4]]) {
    const r = await measureOffline({ bpm, div });
    all.push(r);
    log(row([bpm, `${r.clicks}/${r.expected}`, ms(r.mean), ms(r.p95), ms(r.max)]));
  }
  log('</table>');
  return all;
}

async function runLive(stress) {
  log(`<h2>Живой замер${stress ? ` (нагрузка ${stress * 100}% главного потока)` : ''}, мс</h2><table>` + row(['метрика', 'среднее', 'p95', 'макс', 'мин'], 'th'));
  const r = await measureLive({ stress, seconds: 6 });
  for (const [name, s] of [['период тикера (цель 40)', r.pump], ['запас до звука (>0)', r.slack], ['опоздание подсветки', r.late]]) {
    log(row([name, ms(s.mean), ms(s.p95), ms(s.max), ms(s.min)]));
  }
  log(`</table><p>Задержка вывода: ${ms(r.outputLatency)} мс · шагов с нулевым запасом: <b>${r.underruns}</b></p>`);
  return r;
}

export async function runAll() {
  out.innerHTML = '';
  const result = { offline: await runOffline(), live: await runLive(0), liveStress: await runLive(0.6) };
  window.__timingResult = result;
  log('<p>Готово.</p>');
  return result;
}

document.getElementById('run').addEventListener('click', runAll);
if (new URLSearchParams(location.search).has('auto')) runAll();
