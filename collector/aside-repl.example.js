// Aside REPL 결정적 스크립트 예시 — `aside repl "$(cat collector/aside-repl.example.js)"`
// 공식 문서에 공개된 API 는 openTab() 정도라 나머지 메서드명은 Aside 버전에 따라 다를 수 있음.
// 태스크 모드(aside-task.md)가 기본이고, 이 파일은 안정적 반복 수집이 필요해질 때 손보는 용도.
const url = "https://www.threads.net/search?q=" + encodeURIComponent("리딩방") + "&serp_type=recent";
const p = await openTab(url);
await p.waitForTimeout?.(3000);
for (let i = 0; i < 8; i++) { await p.evaluate?.(() => window.scrollBy(0, 1500)); await p.waitForTimeout?.(1200); }
const items = await p.evaluate?.(() => {
  const out = [];
  document.querySelectorAll('a[href*="/post/"]').forEach((a) => {
    const article = a.closest("div[data-pressable-container]") ?? a.closest("article") ?? a.parentElement;
    const text = article?.innerText ?? "";
    const handle = (a.getAttribute("href") ?? "").split("/")[1]?.replace("@", "");
    if (text && handle) out.push({ platform: "threads", postUrl: location.origin + a.getAttribute("href"), text, author: { handle, profileUrl: location.origin + "/@" + handle } });
  });
  return out;
});
console.log(JSON.stringify(items ?? [], null, 1));
