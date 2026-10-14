import { createHash } from "crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { checkWebsite } from "./check";
import { _clearDomainAgeCache, BOOTSTRAP_URL, domainAgeDays, safeRdapBase } from "./domain-age";
import { canonicalExpression, hashExpressions, isThreads, parseSite } from "./url";
import { _clearWebRiskCache, urlSafePrefix, webRiskCheck } from "./webrisk";
import { STRINGS } from "@/lib/strings";
import { scoreText } from "@/engine";
import { EXAMPLE_SCAM } from "@/components/LiveAnalyzer";

const NOW = new Date("2026-10-14T14:00:00Z");
const b64 = (s: string) => createHash("sha256").update(s).digest().toString("base64");
const prefixOf = (s: string) => createHash("sha256").update(s).digest().subarray(0, 4).toString("base64").replace(/\+/g, "-").replace(/\//g, "_");
const ok = (body: unknown) => Promise.resolve({ ok: true, json: () => Promise.resolve(body) });

beforeEach(() => { _clearWebRiskCache(); _clearDomainAgeCache(); });

describe("parseSite", () => {
  it("reads a bare domain, a full URL and a .co.kr domain", () => {
    expect(parseSite("example.com")?.domain).toBe("example.com");
    expect(parseSite("https://login.shop.example.co.kr/a?b=1#x")).toMatchObject({ host: "login.shop.example.co.kr", domain: "example.co.kr", query: "?b=1" });
    expect(parseSite("https://login.shop.example.co.kr/a#x")?.url).not.toContain("#");
  });
  it("is not a website: text with spaces, no dot, other schemes", () => {
    for (const v of ["돈 보내 주세요 example.com", "localhost", "ftp://example.com", "", "javascript:alert(1)"]) expect(parseSite(v)).toBeNull();
  });
  it("names the address-shape signs", () => {
    expect(parseSite("xn--80ak6aa92e.com")?.signs).toContain("punycode");
    expect(parseSite("http://203.0.113.9/login")?.signs).toContain("ip-host");
    expect(parseSite("bonus-event.xyz")?.signs).toContain("risky-tld");
    expect(parseSite("bit.ly/abc")?.signs).toContain("shortener");
    expect(parseSite("https://bank.com@evil.example/")?.signs).toContain("userinfo");
    expect(parseSite("example.com")?.signs).toEqual([]);
  });
  it("Threads addresses stay with the account lookup", () => {
    expect(isThreads(parseSite("https://www.threads.com/@someone")!)).toBe(true);
  });
});

describe("hashExpressions", () => {
  it("at most 4: host+path, host+/, domain+path, domain+/", () => {
    expect(hashExpressions(parseSite("https://a.b.example.com/s/x.html?q=1")!)).toEqual(["a.b.example.com/s/x.html?q=1", "a.b.example.com/", "example.com/s/x.html?q=1", "example.com/"]);
    expect(hashExpressions(parseSite("example.com")!)).toEqual(["example.com/"]);
  });
  it("Google's test page is one of the expressions", () => {
    expect(hashExpressions(parseSite("https://testsafebrowsing.appspot.com/s/phishing.html")!)).toContain("testsafebrowsing.appspot.com/s/phishing.html");
  });
});

describe("webRiskCheck (hashes.search)", () => {
  const exprs = ["evil.example/login", "evil.example/"];
  it("sends only 4-byte hash prefixes - never the address (Yul 1791986630)", async () => {
    const urls: string[] = [];
    await webRiskCheck(exprs, { key: "k", now: NOW, reserve: async () => true, fetcher: (u) => { urls.push(u); return ok({ negativeExpireTime: "2026-10-14T15:00:00Z" }); } });
    expect(urls).toHaveLength(2);
    for (const u of urls) {
      expect(u).not.toContain("evil");
      const p = new URL(u).searchParams.get("hashPrefix")!;
      expect(p).not.toMatch(/[+/]/);
      expect(Buffer.from(p, "base64url")).toHaveLength(4);
    }
  });
  it("a full-hash match is a match; a prefix-only hit is not", async () => {
    const fetcher = (u: string) => {
      const p = new URL(u).searchParams.get("hashPrefix");
      return ok(p === prefixOf("evil.example/login") ? { threats: [{ threatTypes: ["SOCIAL_ENGINEERING"], hash: b64("evil.example/login"), expireTime: "2026-10-14T15:00:00Z" }] } : {});
    };
    expect(await webRiskCheck(exprs, { key: "k", now: NOW, reserve: async () => true, fetcher })).toEqual({ status: "match", threats: ["SOCIAL_ENGINEERING"] });
    _clearWebRiskCache();
    const otherHash = (u: string) => ok({ threats: [{ threatTypes: ["MALWARE"], hash: b64("something-else/"), expireTime: "2026-10-14T15:00:00Z" }], _u: u });
    expect(await webRiskCheck(exprs, { key: "k", now: NOW, reserve: async () => true, fetcher: otherHash })).toEqual({ status: "clear" });
  });
  it("the daily cap is reserved BEFORE any call; refused = no call at all", async () => {
    let calls = 0; let asked = 0;
    const r = await webRiskCheck(exprs, { key: "k", now: NOW, reserve: async (n) => { asked = n; return false; }, fetcher: () => { calls++; return ok({}); } });
    expect(r).toEqual({ status: "skipped", reason: "limit" });
    expect(asked).toBe(2);
    expect(calls).toBe(0);
  });
  it("no key / no DB / reserve error / Google error = skipped (Web Risk line just drops)", async () => {
    expect(await webRiskCheck(exprs, { key: "", now: NOW })).toEqual({ status: "skipped", reason: "no-key" });
    expect(await webRiskCheck(exprs, { key: "k", now: NOW, dbAvailable: false })).toEqual({ status: "skipped", reason: "no-db" });
    expect(await webRiskCheck(exprs, { key: "k", now: NOW, reserve: async () => { throw new Error("db"); } })).toEqual({ status: "skipped", reason: "error" });
    expect(await webRiskCheck(exprs, { key: "k", now: NOW, reserve: async () => true, fetcher: () => Promise.resolve({ ok: false, json: () => Promise.resolve({}) }) })).toEqual({ status: "skipped", reason: "error" });
  });
  it("a cached prefix costs nothing until Google's expiry", async () => {
    let reserved = 0;
    const deps = { key: "k", reserve: async (n: number) => { reserved += n; return true; }, fetcher: () => ok({ negativeExpireTime: "2026-10-14T15:00:00Z" }) };
    await webRiskCheck(exprs, { ...deps, now: NOW });
    await webRiskCheck(exprs, { ...deps, now: new Date("2026-10-14T14:30:00Z") });
    expect(reserved).toBe(2);
    await webRiskCheck(exprs, { ...deps, now: new Date("2026-10-14T15:01:00Z") });
    expect(reserved).toBe(4);
  });
});

/** IANA 부트스트랩 + 그 끝자리의 등록 기관 RDAP 한 곳 */
const rdap = (date: string, urls: string[] = [], base = "https://rdap.registry.example/v1/") => (u: string) => {
  urls.push(u);
  if (u === BOOTSTRAP_URL) return ok({ services: [[["example", "xyz", "ly"], [base]]] });
  return u.startsWith(base) ? ok({ events: [{ eventAction: "registration", eventDate: date }] }) : Promise.resolve({ ok: false, json: () => Promise.resolve({}) });
};

describe("domainAgeDays (RDAP)", () => {
  it("reads the registration event and sends only the domain", async () => {
    const urls: string[] = [];
    const days = await domainAgeDays("new-site.example", { now: NOW, fetcher: rdap("2026-10-04T00:00:00Z", urls) });
    expect(days).toBe(10);
    expect(urls).toEqual([BOOTSTRAP_URL, "https://rdap.registry.example/v1/domain/new-site.example"]);
  });
  it("unknown is null, never 'old'", async () => {
    expect(await domainAgeDays("x.example", { now: NOW, fetcher: () => Promise.reject(new Error("down")) })).toBeNull();
  });
});

describe("checkWebsite verdict", () => {
  const noRisk = { key: "", now: NOW };
  const age = (date: string) => rdap(date);
  it("Google match = HIGH", async () => {
    const site = parseSite("evil.example")!;
    const v = await checkWebsite(site, { now: NOW, key: "k", reserve: async () => true, ageFetcher: age("2010-01-01T00:00:00Z"),
      riskFetcher: () => ok({ threats: [{ threatTypes: ["MALWARE"], hash: b64("evil.example/"), expireTime: "2026-10-14T15:00:00Z" }] }) });
    expect(v.level).toBe("HIGH");
    expect(v.signs).toContainEqual({ kind: "google", threat: "MALWARE" });
  });
  it("made 10 days ago = REVIEW with an age sign; old and plain = LOW", async () => {
    expect((await checkWebsite(parseSite("fresh.example")!, { ...noRisk, ageFetcher: age("2026-10-04T00:00:00Z") })).level).toBe("REVIEW");
    _clearDomainAgeCache();
    const v = await checkWebsite(parseSite("old.example")!, { ...noRisk, ageFetcher: age("2005-01-01T00:00:00Z") });
    expect(v).toMatchObject({ level: "LOW", signs: [], google: "skipped", googleReason: "no-key" });
  });
  it("a shortened link alone is REVIEW; one weak sign (risky ending) alone is not", async () => {
    expect((await checkWebsite(parseSite("bit.ly/x")!, { ...noRisk, ageFetcher: age("2008-01-01T00:00:00Z") })).level).toBe("REVIEW");
    expect((await checkWebsite(parseSite("plain.xyz")!, { ...noRisk, ageFetcher: age("2008-01-01T00:00:00Z") })).level).toBe("LOW");
  });
});

describe("wording (Yul 1791986341)", () => {
  it("Google lines never state it as certain and never name Safe Browsing", () => {
    for (const lang of ["ko", "en"] as const) {
      const w = STRINGS[lang].website;
      for (const line of Object.values(w.google)) { expect(line).toMatch(/수 있어요|may/); expect(line).not.toMatch(/Safe Browsing|등록됨/); }
      expect(w.advisory).toBe("Advisory provided by Google");
    }
  });
  it("the transfer notice names Google LLC in both languages", () => {
    expect(JSON.stringify(STRINGS.ko.notice.details)).toContain("Google LLC");
    expect(JSON.stringify(STRINGS.en.notice.details)).toContain("Google LLC");
  });
});

describe("result example (Theo 1791986598)", () => {
  it("the made-up example lands on HIGH in both languages and carries no real handle or number", () => {
    for (const lang of ["ko", "en"] as const) {
      expect(scoreText(EXAMPLE_SCAM[lang]).label).toBe("HIGH");
      expect(EXAMPLE_SCAM[lang]).not.toMatch(/@\w|\d{3,}-\d{3,}|010/);
    }
  });
});

describe("Kai db5385f HOLD fixes", () => {
  it("hashPrefix is URL-safe Base64 (bytes fb ff bf ff -> '-_-__w==')", () => {
    expect(urlSafePrefix(Buffer.from([0xfb, 0xff, 0xbf, 0xff]))).toBe("-_-__w==");
  });
  it("a full hash answered in URL-safe Base64 still matches (compared as 32 bytes)", async () => {
    const full = createHash("sha256").update("evil.example/").digest().toString("base64").replace(/\+/g, "-").replace(/\//g, "_");
    const r = await webRiskCheck(["evil.example/"], { key: "k", now: NOW, reserve: async () => true, fetcher: () => ok({ threats: [{ threatTypes: ["SOCIAL_ENGINEERING"], hash: full, expireTime: "2026-10-14T15:00:00Z" }] }) });
    expect(r).toEqual({ status: "match", threats: ["SOCIAL_ENGINEERING"] });
  });
  it("a cached match survives a cap refusal for another prefix", async () => {
    const hit = (u: string) => ok(new URL(u).searchParams.get("hashPrefix") === prefixOf("evil.example/") ? { threats: [{ threatTypes: ["MALWARE"], hash: b64("evil.example/"), expireTime: "2026-10-14T15:00:00Z" }] } : {});
    await webRiskCheck(["evil.example/"], { key: "k", now: NOW, reserve: async () => true, fetcher: hit });
    const r = await webRiskCheck(["evil.example/", "evil.example/new-path"], { key: "k", now: NOW, reserve: async () => false, fetcher: hit });
    expect(r).toEqual({ status: "match", threats: ["MALWARE"] });
  });
  it("RDAP goes only to an https, named server from IANA's list; never redirects; anything else = unknown", async () => {
    expect(safeRdapBase("http://rdap.example/")).toBeNull();
    expect(safeRdapBase("https://10.0.0.1/")).toBeNull();
    expect(safeRdapBase("https://localhost/")).toBeNull();
    expect(safeRdapBase("https://rdap.example:8443/")).toBeNull();
    expect(safeRdapBase("https://rdap.example/v1")).toBe("https://rdap.example/v1/");
    const urls: string[] = [];
    expect(await domainAgeDays("new-site.example", { now: NOW, fetcher: rdap("2026-10-04T00:00:00Z", urls, "http://169.254.169.254/") })).toBeNull();
    expect(urls).toEqual([BOOTSTRAP_URL]);
  });
  it("no Google check + no signs never says Google found nothing", () => {
    for (const lang of ["ko", "en"] as const) {
      expect(STRINGS[lang].website.noneNoGoogle).not.toMatch(/Google 정보|Google data/);
      expect(STRINGS[lang].website.noneNoGoogle).toMatch(/Google/);
    }
  });
});

/** Google Web Risk "URLs and hashing" 문서의 정규화 예시 — 기대값은 문서 원문을 그대로 옮긴 것(우리 함수로 만들지 않음, 카이 db5385f).
 *  문서의 점 없는 호스트 "host"만 "host.example"로 바꿨다(웹사이트 입력은 점 있는 호스트만 받음) — 경로 부분 기대값은 원문 그대로 */
describe("Google canonicalization examples (docs.cloud.google.com/web-risk/docs/urls-hashing)", () => {
  const cases: [string, string][] = [
    ["http://host.example/%25%32%35", "host.example/%25"],
    ["http://host.example/%25%32%35%25%32%35", "host.example/%25%25"],
    ["http://host.example/%2525252525252525", "host.example/%25"],
    ["http://host.example/asdf%25%32%35asd", "host.example/asdf%25asd"],
    ["http://host.example/%%%25%32%35asd%%", "host.example/%25%25%25asd%25%25"],
    ["http://www.google.com/", "www.google.com/"],
    ["http://%31%36%38%2e%31%38%38%2e%39%39%2e%32%36/%2E%73%65%63%75%72%65/%77%77%77%2E%65%62%61%79%2E%63%6F%6D/", "168.188.99.26/.secure/www.ebay.com/"],
    ["http://www.google.com/blah/..", "www.google.com/"],
    ["http://www.GOOgle.com/", "www.google.com/"],
    ["http://www.google.com.../", "www.google.com/"],
    ["http://www.google.com/q?r?", "www.google.com/q?r?"],
    ["http://www.google.com/q?r?s", "www.google.com/q?r?s"],
    ["http://evil.com/foo#bar#baz", "evil.com/foo"],
    ["http://evil.com/foo;", "evil.com/foo;"],
    ["http://notrailingslash.com", "notrailingslash.com/"],
    ["http://www.gotaport.com:1234/", "www.gotaport.com/"],
    ["http://host.com/ab%23cd", "host.com/ab%23cd"],
    ["http://host.com//twoslashes?more//slashes", "host.com/twoslashes?more//slashes"],
  ];
  for (const [input, expected] of cases) it(input, () => expect(canonicalExpression(parseSite(input)!)).toBe(expected));
  it("the hash Google compares is SHA-256 of exactly that expression", () => {
    expect(createHash("sha256").update("testsafebrowsing.appspot.com/s/phishing.html").digest("hex")).toHaveLength(64);
    expect(hashExpressions(parseSite("https://testsafebrowsing.appspot.com/s/phishing.html")!)[0]).toBe("testsafebrowsing.appspot.com/s/phishing.html");
  });
});
