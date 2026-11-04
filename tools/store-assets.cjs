// Renders Android launcher PNGs and Play Store graphics with headless Chromium.
// Usage (from repo root):  node tools/store-assets.cjs [gameUrl]
//   gameUrl (optional): a running build, e.g. http://localhost:4173/ (cd web && npm run preview)
//   When given, the feature graphic (which reuses the in-game logo) and phone screenshots are made too.
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const iconSvg = fs.readFileSync(path.join(root, 'store/icon.svg'), 'utf8');
const fsrc = (pkg, file) => 'data:font/woff2;base64,' + fs.readFileSync(path.join(root, `web/node_modules/@fontsource/${pkg}/files/${file}`)).toString('base64');
const res = path.join(root, 'android/app/src/main/res');
const INK = '#1c1442';

async function shot(page, html, w, h, out) {
  await page.setViewportSize({ width: w, height: h });
  await page.setContent(html, { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  await page.screenshot({ path: out, omitBackground: true });
}

const iconHtml = (size, shape) => `<html><body style="margin:0;background:transparent">
<div style="width:${size}px;height:${size}px;overflow:hidden;border-radius:${shape === 'round' ? '50%' : shape === 'square' ? '0' : '18%'}">
${iconSvg.replace('<svg ', `<svg width="${size}" height="${size}" `).replace('viewBox="0 0 108 108"', shape === 'square' ? 'viewBox="0 0 108 108"' : 'viewBox="9 9 90 90"')}
</div></body></html>`;

function bubble(x, y, r, light, base, dark, id) {
  return `<radialGradient id="${id}" cx="${x - r * 0.3}" cy="${y - r * 0.36}" r="${r * 1.25}" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="${light}"/><stop offset=".45" stop-color="${base}"/><stop offset="1" stop-color="${dark}"/></radialGradient>
<circle cx="${x}" cy="${y}" r="${r}" fill="url(#${id})" stroke="${INK}" stroke-width="${r * 0.12}"/>
<ellipse cx="${x - r * 0.34}" cy="${y - r * 0.42}" rx="${r * 0.42}" ry="${r * 0.22}" fill="#fff" fill-opacity=".85" transform="rotate(-32 ${x - r * 0.34} ${y - r * 0.42})"/>`;
}

const PAL = [
  ['#ffc2cb', '#ff3d5e', '#a30d2c'],
  ['#fff6c2', '#ffc928', '#c27100'],
  ['#c4fad6', '#34d36a', '#0b8239'],
  ['#cff8ff', '#1fd0f0', '#047a99'],
  ['#c2d1ff', '#3b66ff', '#162ca3'],
  ['#ebd1ff', '#a755f2', '#5a17a3'],
];

function featureHtml(logo) {
  // A hex cluster of bubbles on the right, like a board being cleared.
  const cluster = [];
  const rows = [[0, 1, 2, 3], [4, 0, 5, 1, 2], [3, 3, 4, 0], [1, 5, 2]];
  rows.forEach((row, ri) => {
    row.forEach((c, ci) => {
      const x = 640 + ci * 64 + (ri % 2 ? 0 : 32) + ri * 6;
      const y = 120 + ri * 56;
      cluster.push(bubble(x, y, 31, ...PAL[c], `c${ri}${ci}`));
    });
  });
  const loose = [
    [600, 420, 26, 2],
    [990, 70, 22, 5],
    [560, 70, 16, 3],
    [1000, 420, 30, 0],
  ].map(([x, y, r, c], i) => bubble(x, y, r, ...PAL[c], `l${i}`));
  return `<html><head><style>
@font-face{font-family:'Lilita One';src:url(${fsrc('lilita-one', 'lilita-one-latin-400-normal.woff2')})}
@font-face{font-family:'Nunito';font-weight:800;src:url(${fsrc('nunito', 'nunito-latin-800-normal.woff2')})}
body{margin:0;width:1024px;height:500px;overflow:hidden;position:relative;background:radial-gradient(circle at 30% 40%,#7ae9ff 0,#22a9ec 45%,#0b4f9c 100%);font-family:'Lilita One'}
.rays{position:absolute;left:300px;top:200px;width:1600px;height:1600px;margin:-800px 0 0 -800px;background:repeating-conic-gradient(rgba(255,255,255,.14) 0 9deg,transparent 9deg 18deg);-webkit-mask:radial-gradient(closest-side,#000 10%,transparent 75%)}
.logo{position:absolute;left:62px;top:40px;width:470px}
.logo svg{width:100%;height:auto;overflow:visible}
.tag{position:absolute;left:62px;width:470px;top:392px;text-align:center;font-size:30px;color:#fff;letter-spacing:.5px;
text-shadow:-3px -3px 0 ${INK},3px -3px 0 ${INK},-3px 3px 0 ${INK},3px 3px 0 ${INK},0 -3.6px 0 ${INK},0 3.6px 0 ${INK},-3.6px 0 0 ${INK},3.6px 0 0 ${INK},0 6px 0 ${INK}}
svg.art{position:absolute;inset:0}
.cloud{position:absolute;bottom:-60px;width:180px;height:120px;border-radius:50%;background:#f4fbff;box-shadow:0 -6px 0 #bfe3fb inset}
</style></head><body>
<div class="rays"></div>
${[-40, 120, 300, 470, 640, 820, 980].map((x, i) => `<div class="cloud" style="left:${x}px;bottom:${-70 + (i % 2) * 14}px"></div>`).join('')}
<svg class="art" viewBox="0 0 1024 500">${cluster.join('')}${loose.join('')}</svg>
<div class="logo">${logo}</div>
<div class="tag">200 levels · Arcade · Wi-Fi battles</div>
</body></html>`;
}

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const dens = { mdpi: 48, hdpi: 72, xhdpi: 96, xxhdpi: 144, xxxhdpi: 192 };
  for (const [d, size] of Object.entries(dens)) {
    await shot(page, iconHtml(size, 'rounded'), size, size, path.join(res, `mipmap-${d}/ic_launcher.png`));
    await shot(page, iconHtml(size, 'round'), size, size, path.join(res, `mipmap-${d}/ic_launcher_round.png`));
  }
  await shot(page, iconHtml(512, 'square'), 512, 512, path.join(root, 'store/play-icon-512.png'));

  const url = process.argv[2];
  if (url) {
    await page.setViewportSize({ width: 400, height: 800 });
    await page.goto(url);
    await page.waitForSelector('.logo svg');
    const logo = await page.$eval('.logo', (el) => el.innerHTML);
    await shot(page, featureHtml(logo), 1024, 500, path.join(root, 'store/feature-graphic-1024x500.png'));
  } else {
    console.log('No game URL: skipped the feature graphic and screenshots.');
  }
  await browser.close();
  if (url) await screenshots(url);
  console.log('done');
})();

// Phone screenshots (1080x1920) of the real game, driven like a player would.
async function screenshots(url) {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 405, height: 720 }, deviceScaleFactor: 2.6667, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  const out = (n) => path.join(root, `store/screenshots/${n}.png`);
  fs.mkdirSync(path.join(root, 'store/screenshots'), { recursive: true });
  await page.goto(url);
  await page.evaluate(() => {
    localStorage.clear();
    localStorage.setItem('bsa.v1.settings', JSON.stringify({ sound: false, music: false, vibration: true, symbols: false, aimGuide: true, name: 'Sam' }));
  });
  await page.reload();
  await page.waitForTimeout(1200);
  await page.screenshot({ path: out('1-menu') });
  // Some progress so the map shows stars and a later world.
  await page.evaluate(() => {
    localStorage.setItem('bsa.v1.progress', JSON.stringify({ unlocked: 75, stars: Object.fromEntries([...Array(74)].map((_, i) => [i + 1, 1 + ((i * 7) % 3)])), best: {} }));
  });
  await page.reload();
  await page.waitForTimeout(900);
  await page.locator('.play-btn').click();
  await page.waitForTimeout(900);
  await page.screenshot({ path: out('2-levels') });
  await page.locator('.node.current').click();
  await page.waitForTimeout(2600);
  await page.mouse.move(200, 560);
  await page.mouse.down();
  await page.mouse.move(120, 380, { steps: 4 });
  await page.waitForTimeout(250);
  await page.screenshot({ path: out('3-gameplay') });
  await page.mouse.up();
  await page.waitForTimeout(500);
  // Arcade
  await page.evaluate(() => window.__bsa.app.goHome());
  await page.waitForTimeout(400);
  await page.locator('.tile').nth(0).click();
  await page.waitForTimeout(2600);
  await page.mouse.move(200, 600);
  await page.mouse.down();
  await page.mouse.move(300, 380, { steps: 4 });
  await page.waitForTimeout(250);
  await page.screenshot({ path: out('4-arcade') });
  await page.mouse.up();
  // Versus vs CPUs
  await page.evaluate(() => window.__bsa.app.goHome());
  await page.waitForTimeout(400);
  await page.locator('.tile').nth(1).click();
  await page.waitForTimeout(500);
  await page.locator('button', { hasText: 'Vs CPU' }).click();
  await page.waitForTimeout(600);
  await page.locator('button', { hasText: /^CPU$/ }).click();
  await page.waitForTimeout(400);
  await page.screenshot({ path: out('5-lobby') });
  await page.locator('button', { hasText: 'Start match' }).click();
  await page.waitForTimeout(9000);
  await page.mouse.move(200, 640);
  await page.mouse.down();
  await page.mouse.move(130, 470, { steps: 4 });
  await page.waitForTimeout(250);
  await page.screenshot({ path: out('6-versus') });
  await browser.close();
}
