/**
 * Визуальные часы: вызывает onStep(i) в момент, когда шаг i реально звучит (с поправкой на
 * задержку вывода звука). Вместо опроса 60 раз в секунду спит до ближайшего события и только
 * потом просит один кадр — на медленных темпах это на порядок меньше пробуждений.
 */
export class VisualClock {
  /**
   * @param {{ now: () => number, onStep: (i:number)=>void, isFinished?: ()=>boolean, onDone?: ()=>void,
   *           offset?: number }} o  offset — секунды: насколько позже звука показывать
   */
  constructor({ now, onStep, isFinished = () => false, onDone = () => {}, offset = 0 }) {
    Object.assign(this, { now, onStep, isFinished, onDone, offset });
    this.queue = [];
    this.timer = 0;
    this.frame = 0;
    this.stopped = false;
  }

  push(event) { this.queue.push(event); this.arm(); }

  arm() {
    if (this.timer || this.frame || this.stopped) return;
    if (!this.queue.length) { this.checkDone(); return; }
    const wait = (this.queue[0].t + this.offset - this.now()) * 1000 - 10; // проснуться ~за кадр
    this.timer = setTimeout(() => {
      this.timer = 0;
      this.frame = requestAnimationFrame(() => { this.frame = 0; this.flush(); });
    }, Math.max(0, wait));
  }

  flush() {
    const limit = this.now() - this.offset;
    let last = -1;
    while (this.queue.length && this.queue[0].t <= limit) last = this.queue.shift().i;
    if (last >= 0) this.onStep(last);
    this.arm();
  }

  checkDone() {
    if (!this.stopped && this.isFinished()) { this.stopped = true; this.onDone(); }
  }

  stop() {
    this.stopped = true;
    clearTimeout(this.timer); cancelAnimationFrame(this.frame);
    this.timer = this.frame = 0; this.queue = [];
  }
}
