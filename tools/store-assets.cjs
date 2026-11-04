// Renders Android launcher PNGs and Play Store graphics with headless Chromium.
// Usage (from repo root):  node tools/store-assets.cjs [gameUrl]
//   gameUrl (optional): a running build, e.g. http://localhost:4173/ (cd web && npm run preview)
//   When given, phone screenshots are captured too.
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const iconSvg = fs.readFileSync(path.join(root, 'store/icon.svg'), 'utf8');
const fontDir = path.join(root, 'web/node_modules/@fontsource/fredoka/files');
const font = (w) => 'data:font/woff2;base64,' + fs.readFileSync(path.join(fontDir, `fredoka-latin-${w}-normal.woff2`)).toString('base64');
const res = path.join(root, 'android/app/src/main/res');

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

const featureHtml = `<html><head><style>
@font-face{font-family:F;font-weight:700;src:url(${font(700)})}
@font-face{font-family:F;font-weight:500;src:url(${font(500)})}
body{margin:0;width:1024px;height:500px;overflow:hidden;font-family:F;background:linear-gradient(115deg,#5b3df5,#ff6fb1);position:relative;color:#fff}
.b{position:absolute;border-radius:50%;box-shadow:inset -10px -12px 0 rgba(0,0,0,.18),inset 10px 10px 0 rgba(255,255,255,.35)}
.t{position:absolute;left:70px;top:120px}
.t1{font-size:96px;font-weight:700;line-height:.95;text-shadow:0 7px 0 #7a2fd0,0 14px 24px rgba(40,0,80,.4)}
.t2{display:inline-block;margin-top:18px;padding:6px 26px;border-radius:999px;font-size:38px;font-weight:700;letter-spacing:9px;background:linear-gradient(90deg,#ff5f8f,#ff9a3d);box-shadow:0 6px 0 #b8325b}
.t3{margin-top:26px;font-size:28px;font-weight:500;opacity:.95}
</style></head><body>
${[
  [700, 60, 120, '#ff4757'], [820, 40, 90, '#ffc93c'], [900, 150, 110, '#22d3ee'], [760, 190, 100, '#2ed573'],
  [640, 300, 120, '#a55eea'], [860, 300, 130, '#3d6bff'], [960, 420, 90, '#ff4757'], [600, 140, 70, '#ffc93c'],
].map(([x, y, s, c]) => `<div class="b" style="left:${x - s / 2}px;top:${y - s / 2}px;width:${s}px;height:${s}px;background:radial-gradient(circle at 32% 30%,#fff 0,${c} 45%,${c} 70%,rgba(0,0,0,.25) 100%)"></div>`).join('')}
<div class="t"><div class="t1">Bubble<br>Shooter</div><div class="t2">ARENA</div><div class="t3">60 levels · Arcade · Wi-Fi multiplayer</div></div>
</body></html>`;

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const dens = { mdpi: 48, hdpi: 72, xhdpi: 96, xxhdpi: 144, xxxhdpi: 192 };
  for (const [d, size] of Object.entries(dens)) {
    await shot(page, iconHtml(size, 'rounded'), size, size, path.join(res, `mipmap-${d}/ic_launcher.png`));
    await shot(page, iconHtml(size, 'round'), size, size, path.join(res, `mipmap-${d}/ic_launcher_round.png`));
  }
  await shot(page, iconHtml(512, 'square'), 512, 512, path.join(root, 'store/play-icon-512.png'));
  await shot(page, featureHtml, 1024, 500, path.join(root, 'store/feature-graphic-1024x500.png'));
  await browser.close();

  const url = process.argv[2];
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
  await page.waitForTimeout(900);
  await page.screenshot({ path: out('1-menu') });
  // Level 14 gameplay with the aim guide showing.
  await page.evaluate(() => {
    const { app } = window.__bsa;
    localStorage.setItem('bsa.v1.progress', JSON.stringify({ unlocked: 23, stars: Object.fromEntries([...Array(22)].map((_, i) => [i + 1, 1 + ((i * 7) % 3)])), best: {} }));
  });
  await page.reload();
  await page.waitForTimeout(700);
  await page.getByText('Levels', { exact: true }).click();
  await page.waitForTimeout(500);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: out('2-levels') });
  await page.locator('.lvl.current').click();
  await page.waitForTimeout(2200);
  await page.mouse.move(200, 560);
  await page.mouse.down();
  await page.mouse.move(120, 330, { steps: 4 });
  await page.waitForTimeout(250);
  await page.screenshot({ path: out('3-gameplay') });
  await page.mouse.up();
  await page.waitForTimeout(500);
  // Arcade
  await page.evaluate(() => window.__bsa.app.goHome());
  await page.getByText('Arcade', { exact: true }).click();
  await page.waitForTimeout(2200);
  await page.mouse.move(200, 560);
  await page.mouse.down();
  await page.mouse.move(300, 300, { steps: 4 });
  await page.waitForTimeout(250);
  await page.screenshot({ path: out('4-arcade') });
  await page.mouse.up();
  // Versus vs CPUs
  await page.evaluate(() => window.__bsa.app.goHome());
  await page.getByText('Multiplayer', { exact: true }).click();
  await page.waitForTimeout(400);
  await page.getByText('🤖 Vs CPU').click();
  await page.waitForTimeout(400);
  await page.getByText('+ CPU').click();
  await page.waitForTimeout(300);
  await page.screenshot({ path: out('5-lobby') });
  await page.getByText('▶  Start match').click();
  await page.waitForTimeout(9000);
  await page.mouse.move(200, 600);
  await page.mouse.down();
  await page.mouse.move(130, 420, { steps: 4 });
  await page.waitForTimeout(250);
  await page.screenshot({ path: out('6-versus') });
  await browser.close();
}
