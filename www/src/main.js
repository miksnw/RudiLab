/** Точка входа: поднимает сохранённые партии, рисует интерфейс, регистрирует service worker. */
import { store } from './core/services.js';
import { PATS, byId, registerPart } from './data/patterns.js';
import { engine } from './audio/engine.js';
import { S, go } from './ui/state.js';
import { render } from './ui/app.js';

store.d.parts.forEach(registerPart);
render();

// для отладки и e2e-тестов
globalThis.__app = { engine, store, S, PATS, byId, go, render };

if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol) && location.hostname !== 'localhost') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
