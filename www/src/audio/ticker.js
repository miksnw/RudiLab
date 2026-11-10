/**
 * Тикер для планировщика: вызывает fn каждые ms миллисекунд.
 * Работает в Web Worker, поэтому не тормозится загруженным главным потоком и «фоновым»
 * замедлением таймеров. Если Worker недоступен — обычный setInterval.
 */
const WORKER_SRC = 'let t=0;onmessage=e=>{clearInterval(t);if(e.data>0)t=setInterval(()=>postMessage(0),e.data)}';

export function createTicker(fn, ms) {
  try {
    const url = URL.createObjectURL(new Blob([WORKER_SRC], { type: 'text/javascript' }));
    const worker = new Worker(url);
    URL.revokeObjectURL(url);
    worker.onmessage = fn;
    return { kind: 'worker', start: () => worker.postMessage(ms), stop: () => worker.postMessage(0) };
  } catch {
    let id = 0;
    return { kind: 'interval', start: () => { clearInterval(id); id = setInterval(fn, ms); }, stop: () => clearInterval(id) };
  }
}
