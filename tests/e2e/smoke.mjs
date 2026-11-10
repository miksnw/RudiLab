// Дымовой e2e: node tests/e2e/smoke.mjs [url]. Нужен Playwright; без url сам поднимает сервер на www/.
import { serve } from './serve.mjs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
// playwright ставится в проект (npm i -D playwright) или глобально
const { chromium } = (() => { try { return require('playwright'); } catch { return require(require('node:child_process').execSync('npm root -g').toString().trim() + '/playwright'); } })();
const local = process.argv[2] ? null : await serve();
const URL = process.argv[2] || local.url;
const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: 390, height: 800 }, deviceScaleFactor: 2 });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
let failed = 0;
const check = (name, ok, extra = '') => { console.log((ok ? 'ok   ' : 'FAIL ') + name + (extra ? ' — ' + extra : '')); if (!ok) failed++; };

await page.goto(URL);
await page.waitForSelector('.item');
check('список практики', (await page.locator('.item').count()) > 10);
for (const tab of ['Сегодня', 'Челленджи', 'Записи', 'Практика']) {
  await page.click(`.nav button:has-text("${tab}")`);
  check('вкладка ' + tab, (await page.locator('.screen').count()) === 1);
}
await page.click('.item:has-text("Single Paradiddle")');
await page.waitForSelector('.grid');
const tile = await page.locator('.tile').first().boundingBox();
check('плитки видны', tile.width > 20 && tile.height > 20, `${tile.width.toFixed(0)}×${tile.height.toFixed(0)}`);
await page.click('.go');
await page.waitForFunction(() => document.querySelector('.step.cur'), null, { timeout: 4000 });
check('подсветка шага', true);
const seen = new Set();
for (let k = 0; k < 40; k++) { seen.add(await page.evaluate(() => [...document.querySelectorAll('.step')].findIndex((s) => s.classList.contains('cur')))); await page.waitForTimeout(40); }
check('подсветка бежит', seen.size > 3, `${seen.size} разных шагов`);
await page.click('.go');
check('стоп', (await page.textContent('.go')).includes('Старт'));
await page.click('.back');

// челлендж
await page.click('.nav button:has-text("Челленджи")');
await page.click('.item:has-text("Single Stroke")');
await page.waitForSelector('.goal');
check('челлендж: цель', (await page.textContent('.dock')).includes('Цель: 140'));
await page.click('.back');

// импорт MIDI
await page.click('.nav button:has-text("Челленджи")');
await page.click('.item:has-text("Партия из файла")');
await page.setInputFiles('input[type=file]', 'tests/fixtures/test-drums.mid');
await page.waitForSelector('.item.sel');
await page.click('.go:has-text("Сделать")');
await page.waitForSelector('.grid');
check('импорт MIDI → плитки', (await page.locator('.tile').count()) > 4);
await page.click('.vbtn:has-text("Ноты")');
check('нотный вид', (await page.locator('svg.staff').count()) === 1);
// импорт .gp
await page.click('.back');
await page.click('.nav button:has-text("Челленджи")');
await page.click('.item:has-text("Партия из файла")');
await page.setInputFiles('input[type=file]', 'tests/fixtures/test-groove.gp');
await page.waitForSelector('.item.sel');
await page.click('.go:has-text("Сделать")');
await page.waitForSelector('.dock'); // вид «Ноты» сохранён с прошлого шага
await page.click('.vbtn:has-text("Плитки")');
check('импорт .gp → плитки', (await page.locator('.tile').count()) > 4);
await browser.close();
check('нет ошибок консоли', errors.length === 0, errors.join(' | '));
if (local) local.server.close();
process.exit(failed ? 1 : 0);
