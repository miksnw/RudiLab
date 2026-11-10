/**
 * Офлайн-рендер: проигрывает паттерн через те же Scheduler и голоса в OfflineAudioContext.
 * Нужен для замеров и тестов точности (результат не зависит от нагрузки устройства).
 */
import { Scheduler } from './scheduler.js';
import { createVoices } from './voices.js';

/**
 * Возвращает { samples, sampleRate, events } — моно-сигнал и список выданных шагов.
 * clickOnly: только щелчки метронома (для чистого измерения ритма).
 */
export async function renderOffline({ pattern, bpm, cycles = 2, clickOnly = false, sampleRate = 44100, tickSec = 0.04 }) {
  const len = pattern.steps.length;
  const total = (cycles * len * 60) / bpm / pattern.div + 1;
  const ctx = new OfflineAudioContext(1, Math.ceil(total * sampleRate), sampleRate);
  const voices = createVoices(ctx, ctx.destination);
  let clock = 0;
  const sched = new Scheduler({ now: () => clock });
  sched.onCycle = (n) => { if (n >= cycles) sched.loop = false; };
  sched.start({ len, div: pattern.div }, bpm, 0.1);
  const events = [];
  while (!sched.finishing && clock < total) {
    for (const ev of sched.tick()) {
      events.push(ev);
      if (!clickOnly) for (const hit of pattern.parsed[ev.i]) voices.play(hit, ev.t);
      if (ev.i % pattern.div === 0) voices.click(ev.t, ev.i === 0);
    }
    clock += tickSec; // «тикер» без дрожания; дрожание проверяют отдельные тесты планировщика
  }
  const buffer = await ctx.startRendering();
  return { samples: buffer.getChannelData(0), sampleRate, events };
}

/** Моменты начала звуков (сек): первое превышение порога после паузы. */
export function detectOnsets(samples, sampleRate, { threshold = 0.05, minGapSec = 0.02 } = {}) {
  const onsets = [];
  const gap = Math.round(minGapSec * sampleRate);
  let last = -gap;
  for (let i = 0; i < samples.length; i++) {
    if (Math.abs(samples[i]) > threshold && i - last >= gap) { onsets.push(i / sampleRate); last = i; }
    else if (Math.abs(samples[i]) > threshold) last = i;
  }
  return onsets;
}
