/**
 * 웹사이트 주소 확인 — 주소 모양만 보는 규칙(서버·브라우저 어디서나, 네트워크 없음). 소현 #today-hq 1791985819 "웹사이트 스캠인지 여부도 한번에", 테오 1791985835.
 * 이 규칙에서 나온 징후에는 Google 출처 표시를 붙이지 않는다(율 1791986341, Web Risk user-warnings 원문).
 */

const KOREAN_SECOND_LEVEL = new Set(["co.kr", "or.kr", "ne.kr", "re.kr", "go.kr", "ac.kr", "pe.kr", "mil.kr", "co.jp", "co.uk", "com.au", "com.cn", "com.hk", "com.sg", "com.tw"]);
/** 사기 안내 자료에 자주 나오는 저가·신생 끝자리 — 혼자서는 단계를 올리지 않는 약한 징후 */
export const RISKY_TLDS = new Set(["top", "xyz", "vip", "shop", "click", "cfd", "sbs", "icu", "cyou", "buzz", "lol", "monster", "rest", "bond", "online", "site", "live", "work", "fun"]);
export const SHORTENERS = new Set(["bit.ly", "tinyurl.com", "han.gl", "me2.kr", "t.ly", "cutt.ly", "is.gd", "vo.la", "url.kr", "t.co", "goo.su", "shorturl.at", "rb.gy", "buly.kr"]);

export type UrlSign = "punycode" | "ip-host" | "risky-tld" | "shortener" | "userinfo";

export interface ParsedSite {
  /** 사용자가 넣은 그대로를 고친 주소(https 붙임·조각(#) 제거) */
  url: string;
  host: string;
  /** 등록 가능한 도메인(예: example.co.kr) — IP 주소면 null */
  domain: string | null;
  path: string;
  query: string;
  signs: UrlSign[];
}

const IPV4 = /^\d{1,3}(?:\.\d{1,3}){3}$/;

/** 한 칸 입력이 웹사이트 주소 하나인가 — 공백 없음, 점 있는 호스트. 아니면 null */
export function parseSite(input: string): ParsedSite | null {
  const raw = input.trim();
  if (!raw || /\s/.test(raw) || raw.length > 2048) return null;
  let u: URL;
  try {
    u = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`);
  } catch { return null; }
  if (u.protocol !== "http:" && u.protocol !== "https:") return null;
  const host = u.hostname.toLowerCase().replace(/\.+$/, "").replace(/^\.+/, "").replace(/\.{2,}/g, ".");
  if (!host || !host.includes(".") || host.includes(":")) return null;
  const labels = host.split(".");
  const isIp = IPV4.test(host);
  const tail2 = labels.slice(-2).join(".");
  const domain = isIp ? null : KOREAN_SECOND_LEVEL.has(tail2) && labels.length >= 3 ? labels.slice(-3).join(".") : tail2;
  const signs: UrlSign[] = [];
  if (labels.some((l) => l.startsWith("xn--"))) signs.push("punycode");
  if (isIp) signs.push("ip-host");
  if (!isIp && RISKY_TLDS.has(labels[labels.length - 1])) signs.push("risky-tld");
  if (domain && (SHORTENERS.has(domain) || SHORTENERS.has(host))) signs.push("shortener");
  if (u.username || u.password) signs.push("userinfo");
  u.hash = "";
  return { url: u.toString(), host, domain, path: u.pathname || "/", query: u.search, signs };
}

/** Threads 계정 주소는 웹사이트 확인이 아니라 계정 조회로 간다 */
export function isThreads(site: ParsedSite): boolean {
  return site.domain === "threads.com" || site.domain === "threads.net";
}

/**
 * Web Risk 해시 조회에 쓸 주소 표현 — Google 규칙(호스트 접미사 × 경로 접두사, 최대 30개) 중 *최대 4개*만:
 * [호스트+전체 경로(+쿼리), 호스트+"/", 도메인+전체 경로, 도메인+"/"]. 조회 1건 = API 1회라 하루 3천 상한을 지키려고 줄였다.
 * 그래서 중간 경로·중간 하위 도메인에만 올라간 항목은 놓칠 수 있다(문서의 한계).
 */
/** Google 정규화 규칙(urls-hashing)대로 만든 "호스트+경로+쿼리" — 해시 표현의 첫 번째 */
export function canonicalExpression(site: ParsedSite): string {
  return site.host + canonicalPath(site.path) + (site.query && site.query !== "?" ? site.query : "");
}

export function hashExpressions(site: ParsedSite): string[] {
  const path = canonicalPath(site.path);
  const full = path + (site.query && site.query !== "?" ? site.query : "");
  const hosts = [site.host, ...(site.domain && site.domain !== site.host ? [site.domain] : [])];
  const out: string[] = [];
  for (const h of hosts) for (const p of [full, "/"]) {
    const e = `${h}${p}`;
    if (!out.includes(e)) out.push(e);
  }
  return out.slice(0, 4);
}

function canonicalPath(path: string): string {
  let p = path || "/";
  // 더 풀 것이 없을 때까지 %XX를 풀되, 잘못된 %는 그대로 둔다(Google 예: "/%%%25%32%35asd%%" → "/%25%25%25asd%25%25")
  for (let i = 0; i < 32; i++) { const d = p.replace(/%([0-9a-fA-F]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16))); if (d === p) break; p = d; }
  const parts: string[] = [];
  for (const seg of p.split("/")) {
    if (seg === "" || seg === ".") continue;
    if (seg === "..") { parts.pop(); continue; }
    parts.push(seg);
  }
  const joined = "/" + parts.join("/") + (p.endsWith("/") && parts.length ? "/" : "");
  return joined.replace(/[\x00-\x20\x7f-\xff#%]/g, (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase().padStart(2, "0"));
}
