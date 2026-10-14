// 미리보기: 지정 시각들의 프레임을 찍어 한 장으로. node preview.js v|h t1,t2,...
const path = require("path"), fs = require("fs");
const { chromium } = require("/opt/homebrew/lib/node_modules/playwright");
(async () => {
  const [ar, ts] = [process.argv[2] || "v", (process.argv[3] || "3,9,13,15,19,24,27.5,32,36").split(",").map(Number)];
  const [W, H] = ar === "v" ? [1080, 1920] : [1920, 1080];
  const b = await chromium.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" });
  const pg = await b.newPage({ viewport: { width: W, height: H } });
  await pg.goto("file://" + path.join(__dirname, "stage.html") + "?ar=" + ar + "&lang=" + (process.argv[4] || "en"));
  await pg.evaluate(() => document.fonts.ready);
  fs.mkdirSync(path.join(__dirname, "preview"), { recursive: true });
  for (const t of ts) { await pg.evaluate((t) => window.render(t), t); await pg.waitForTimeout(60); await pg.screenshot({ path: path.join(__dirname, "preview", `${ar}-${process.argv[4] || "en"}-${t}.png`) }); }
  await b.close(); console.log("ok", ts.length);
})();
