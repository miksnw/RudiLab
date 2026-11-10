// Автоматический замер тайминга в headless Chromium: node tests/e2e/timing.mjs
// Пороги — защита от регрессий; на реальном телефоне смотри www/dev/timing.html.
import { createRequire } from 'node:module';
import { serve } from './serve.mjs';
const require = createRequire(import.meta.url);
const { chromium } = (() => { try { return require('playwright'); } catch { return require(require('node:child_process').execSync('npm root -g').toString().trim() + '/playwright'); } })();

const { server, url } = await serve();
const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('ERR', e.message));
await page.goto(url + 'dev/timing.html?auto');
await page.waitForFunction(() => window.__timingResult, null, { timeout: 60000 });
const r = await page.evaluate(() => window.__timingResult);
console.log(await page.innerText('#out'));
await browser.close(); server.close();

let failed = 0;
const check = (name, ok) => { console.log((ok ? 'ok   ' : 'FAIL ') + name); if (!ok) failed++; };
for (const o of r.offline) check(`офлайн ${o.bpm} BPM: макс. ошибка < 0.5 мс и все щелчки найдены`, o.max < 0.0005 && o.clicks === o.expected);
check('живой: запас до звука всегда > 0', r.live.underruns === 0);
check('живой под нагрузкой 60%: запас до звука всегда > 0', r.liveStress.underruns === 0);
check('живой: опоздание подсветки < 50 мс (p95)', r.live.late.p95 < 0.05);
process.exit(failed ? 1 : 0);
