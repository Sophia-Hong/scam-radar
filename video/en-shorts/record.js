// stage.html 을 30fps 로 한 장씩 → frames-<ar>-<lang>/%05d.png + timing-<lang>.json(키·전환 소리 시각). node record.js v|h en|ko
const path = require("path"), fs = require("fs");
const { chromium } = require("/opt/homebrew/lib/node_modules/playwright");
(async () => {
  const ar = process.argv[2] || "v", lang = process.argv[3] === "ko" ? "ko" : "en", FPS = 30;
  const [W, H] = ar === "v" ? [1080, 1920] : [1920, 1080];
  const out = path.join(__dirname, `frames-${ar}-${lang}`); fs.rmSync(out, { recursive: true, force: true }); fs.mkdirSync(out, { recursive: true });
  const b = await chromium.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" });
  const pg = await b.newPage({ viewport: { width: W, height: H } });
  await pg.goto("file://" + path.join(__dirname, "stage.html") + "?ar=" + ar + "&lang=" + lang);
  await pg.evaluate(() => document.fonts.ready);
  const timing = await pg.evaluate(() => ({ T: window.T, KEYS: window.KEYS, POPS: window.POPS }));
  fs.writeFileSync(path.join(__dirname, `timing-${lang}.json`), JSON.stringify(timing));
  const n = Math.round(timing.T * FPS);
  for (let i = 0; i < n; i++) {
    await pg.evaluate((t) => window.render(t), i / FPS);
    if (i % 30 === 0) await pg.waitForTimeout(30);      // 이미지 디코드 여유
    await pg.screenshot({ path: path.join(out, String(i).padStart(5, "0") + ".png") });
  }
  if (ar === "h") { await pg.evaluate(() => window.render(4.0)); await pg.screenshot({ path: path.join(__dirname, `poster-h-${lang}.png`) }); }
  await b.close(); console.log(ar, lang, n, "frames");
})();
