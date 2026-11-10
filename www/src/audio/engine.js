/**
 * Движок воспроизведения: AudioContext + Scheduler + голоса + тикер + визуальные часы.
 * Единственное место, где живое аудио связано с планировщиком.
 */
import { Scheduler } from './scheduler.js';
import { createVoices } from './voices.js';
import { createTicker } from './ticker.js';
import { VisualClock } from './visual.js';

const TICK_MS = 40;         // период тикера; должен быть заметно меньше LOOKAHEAD_SEC
const START_DELAY_SEC = 0.12;

export class Engine {
  constructor() {
    this.click = true;
    this.sound = true;
    this.visualOffsetSec = 0; // ручная подстройка (настройки)
    this.playing = false;
    this.ctx = null;
    this.sched = null;
    this.visual = null;
    this.ticker = createTicker(() => this.pump(), TICK_MS);
  }

  get bpm() { return this.sched ? this.sched.bpm : 0; }
  setBpm(bpm) { if (this.sched) this.sched.bpm = bpm; }
  setLoop(loop) { if (this.sched) this.sched.loop = loop; }

  /** Задержка вывода звука: подсветка должна совпасть с тем, что слышно. */
  get outputLatency() { return (this.ctx && (this.ctx.outputLatency || this.ctx.baseLatency)) || 0; }

  ensureContext() {
    if (!this.ctx) {
      const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
      this.ctx = new AC();
      const master = this.ctx.createGain();
      master.gain.value = 0.9;
      master.connect(this.ctx.destination);
      this.voices = createVoices(this.ctx, master);
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  /**
   * @param {{ steps: any[], parsed: any[][], div: number }} pattern
   * @param {{ loop?: boolean, onStep?: (i:number)=>void, onCycle?: (n:number)=>void, onDone?: ()=>void }} hooks
   */
  start(pattern, bpm, { loop = true, onStep = () => {}, onCycle = null, onDone = () => {} } = {}) {
    this.ensureContext();
    this.stopInternal();
    this.pattern = pattern;
    const ctx = this.ctx;
    this.sched = new Scheduler({ now: () => ctx.currentTime });
    this.sched.loop = loop;
    this.sched.onCycle = onCycle;
    this.sched.start({ len: pattern.steps.length, div: pattern.div }, bpm, ctx.currentTime + START_DELAY_SEC);
    this.visual = new VisualClock({
      now: () => ctx.currentTime, onStep,
      offset: this.outputLatency + this.visualOffsetSec,
      isFinished: () => this.sched.finishing, onDone,
    });
    this.playing = true;
    this.pump();
    this.ticker.start();
  }

  stop() { this.stopInternal(); }

  stopInternal() {
    this.playing = false;
    this.ticker.stop();
    if (this.visual) this.visual.stop();
  }

  /** Раз в TICK_MS: берём из планировщика шаги окна и ставим звуки на точное время. */
  pump() {
    if (!this.playing) return;
    const { pattern, voices } = this;
    for (const ev of this.sched.tick()) {
      if (this.sound) for (const hit of pattern.parsed[ev.i]) voices.play(hit, ev.t);
      if (this.click && ev.i % pattern.div === 0) voices.click(ev.t, ev.i === 0);
      this.visual.push(ev);
    }
    this.visual.arm(); // проверить «закончили ли» даже если событий нет
  }
}

export const engine = new Engine();
