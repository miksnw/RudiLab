/**
 * Сессия тренировки: темп, Auto BPM, челлендж, запись результата. Без DOM — интерфейс
 * подписывается через handlers: { step(i), bpm(bpm), complete(), end(result) }.
 */
import { clamp } from '../core/time.js';

export const BPM_MIN = 30, BPM_MAX = 260;

export class Session {
  constructor({ store, engine, pattern, challenge = null, handlers = {}, now = () => performance.now() }) {
    this.store = store; this.engine = engine; this.pattern = pattern; this.challenge = challenge;
    this.on = handlers; this.now = now;
    const { settings, lastBpm } = store.d;
    this.settings = settings;
    this.auto = challenge ? { on: true, step: challenge.step, every: challenge.every, max: challenge.to } : settings.auto;
    this.bpm = challenge ? challenge.from : (lastBpm[pattern.id] || pattern.bpm);
    this.maxBpm = this.bpm;
    this.running = false;
    this.startedAt = 0;
    this.pendingBpmShow = false; // новый темп показываем, когда зазвучит первый удар фразы
  }

  get elapsedSec() { return (this.now() - this.startedAt) / 1000; }
  get loop() { return this.challenge ? true : this.settings.loop !== false; }

  setBpm(value) {
    this.bpm = clamp(Math.round(value), BPM_MIN, BPM_MAX);
    if (this.running) { this.engine.setBpm(this.bpm); this.maxBpm = Math.max(this.maxBpm, this.bpm); }
    this.emitBpm();
  }

  emitBpm() { if (this.on.bpm) this.on.bpm(this.bpm); }

  begin() {
    const { engine, settings } = this;
    engine.click = settings.click;
    engine.sound = settings.sound;
    engine.visualOffsetSec = (settings.visualOffsetMs || 0) / 1000;
    this.maxBpm = this.bpm;
    this.pendingBpmShow = false;
    this.running = true;
    this.startedAt = this.now();
    engine.start(this.pattern, this.bpm, {
      loop: this.loop,
      onStep: (i) => {
        if (this.on.step) this.on.step(i);
        if (i === 0 && this.pendingBpmShow) { this.pendingBpmShow = false; this.emitBpm(); }
      },
      onCycle: (n) => this.onCycle(n),
      onDone: () => this.end(),
    });
  }

  /** Конец очередного прохода фразы: челлендж пройден или пора ускориться. */
  onCycle(n) {
    const { challenge, auto, engine } = this;
    if (challenge && this.bpm >= challenge.to) {          // целевой темп сыгран целиком
      if (challenge.key) this.store.markChallenge(challenge.key, this.bpm);
      if (this.on.complete) this.on.complete();
      engine.setLoop(false);
      return;
    }
    if (auto.on && n % Math.max(1, auto.every) === 0 && this.bpm < auto.max) {
      this.bpm = Math.min(auto.max, this.bpm + auto.step);
      engine.setBpm(this.bpm);
      this.maxBpm = Math.max(this.maxBpm, this.bpm);
      this.pendingBpmShow = true;
    }
  }

  /** Остановить и записать. Возвращает { sec, saved, maxBpm } или null, если не играли. */
  end() {
    if (!this.running) return null;
    this.running = false;
    this.engine.stop();
    const sec = this.elapsedSec;
    if (this.pendingBpmShow) { this.pendingBpmShow = false; this.emitBpm(); }
    const saved = this.store.recordSession(this.pattern.id, sec, this.bpm, this.maxBpm);
    const result = { sec, saved, maxBpm: this.maxBpm };
    if (this.on.end) this.on.end(result);
    return result;
  }
}
