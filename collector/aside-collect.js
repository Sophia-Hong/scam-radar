// Aside REPL 결정적 수집 스크립트 — 한 검색어 × 한 탭.
// 사용: KW/MODE 를 치환해 `aside repl "$(cat collector/aside-collect.js)"` 로 실행 (collector/run-collect.sh 참고).
// 출력: "ITEM {json}" 줄 여러 개 + "DONE <kw> <mode> <n>". 읽기만 한다 — 좋아요·팔로우·댓글·DM 없음.
// 차단 화면(429·잠시 후 다시·로그인 벽·챌린지)을 보면 "BLOCKED <이유>"만 찍고 스크롤 없이 끝낸다 (폴라잇 가드, 2026-10-14).
const KW = "__KW__"; const MODE = "__MODE__";
const p = await openTab("https://www.threads.com/search?q=" + encodeURIComponent(KW) + "&serp_type=" + MODE);
await new Promise((r) => setTimeout(r, 5000));
const blockReason = await p.evaluate(() => {
  const u = location.href; const t = (document.body ? document.body.innerText : "").slice(0, 5000);
  if (/\/(login|accounts\/login|challenge|checkpoint)/i.test(u)) return "redirect:" + u.split("?")[0];
  const m = t.match(/\b429\b|too many requests|rate limit|try again later|please wait a few minutes|something went wrong|we restrict certain activity|confirm (it's|that it's) you|log in to see|잠시 후 다시|요청이 너무 많|일시적으로 제한|로그인하여|로그인해서|본인 확인/i);
  return m ? "text:" + m[0] : "";
});
if (blockReason) { console.log("BLOCKED " + blockReason); await p.close(); }
else {
let last = 0;
for (let i = 0; i < 10; i++) {
  await p.evaluate(() => window.scrollBy(0, 2500));
  await new Promise((r) => setTimeout(r, 1500));
  const n = await p.evaluate(() => document.querySelectorAll('a[href*="/post/"]').length);
  if (n === last && i > 3) break;
  last = n;
}
const items = await p.evaluate(() => {
  const out = []; const seen = new Set();
  document.querySelectorAll('a[href*="/post/"]').forEach((a) => {
    const href = (a.getAttribute("href") || "").split("?")[0].replace(/\/media$/, "");
    const m = href.match(/^\/@([^/]+)\/post\/([^/]+)$/); if (!m) return;
    if (seen.has(href)) return;
    const art = a.closest('div[data-pressable-container="true"]') || a.closest("article"); if (!art) return;
    seen.add(href);
    const time = art.querySelector("time");
    let lines = art.innerText.split("\n");
    if (lines[0] === m[1]) lines.shift();
    while (lines.length && /^(\d+[smhdw]|\d{2}\/\d{2}\/\d{2}|Verified|Sent you a friend request)$/.test(lines[0].trim())) lines.shift();
    const ti = lines.findIndex((l) => /^(Translate|Thread|View activity)$/.test(l.trim()));
    if (ti >= 0) lines = lines.slice(0, ti);
    const text = lines.join("\n").replace(/\n\s*\n\s*(\d+|Like|Reply|Repost|Share)\s*$/, "").trim();
    const links = [...art.querySelectorAll('a[href^="http"]')].map((x) => x.href).filter((h) => !/threads\.(com|net)/.test(h));
    out.push({ postUrl: "https://www.threads.net" + href, handle: m[1], postedAt: time ? time.getAttribute("datetime") : null, text, links });
  });
  return out;
});
for (const it of items) { it.kw = KW; it.mode = MODE; console.log("ITEM " + JSON.stringify(it)); }
console.log("DONE " + KW + " " + MODE + " " + items.length);
await p.close();
}
