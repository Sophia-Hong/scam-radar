import { createHash } from "crypto";
import { hasDb } from "@/db";
import { kstDay } from "@/lib/checklimit";

/**
 * Google Web Risk — hashes.search(주소 SHA-256의 앞 4바이트만 보낸다, 율 1791986407 "Lookup은 주소를 그대로 보낸다"). 돌아온 전체 해시와 우리 쪽 해시를 비교해 판정.
 * 하루 상한 WEB_RISK_DAILY_LIMIT(기본 3,000) — 콘솔 쿼터가 없어서 이 카운터가 유일한 상한이다(테오 1791986262).
 * *호출 전에* DB 원자 카운터로 예약한다(AI 상한과 같은 community_quota, 버킷 = KST 날짜). DB가 없거나 예약 오류·상한 초과면 호출하지 않는다(fail-closed).
 * 키(WEB_RISK_API_KEY)가 없으면 이 줄은 통째로 빠진다. 같은 앞자리는 Google이 준 만료 시각까지 인스턴스 메모리에 둔다.
 */
/** 절대 상한 3,000 — 환경값은 *낮추기만* 할 수 있다(카이 b15cee4 HOLD: 4000을 넣어도 3,001번째 호출은 없다). 숫자가 아니거나 0 이하면 0 = 호출 안 함(fail-closed) */
export const WEB_RISK_HARD_CAP = 3000;
export function effectiveDailyLimit(raw: string | undefined): number {
  if (raw === undefined || raw === "") return WEB_RISK_HARD_CAP;
  const n = Math.floor(Number(raw));
  return Number.isFinite(n) && n > 0 ? Math.min(n, WEB_RISK_HARD_CAP) : 0;
}
export const WEB_RISK_DAILY_LIMIT = effectiveDailyLimit(process.env.WEB_RISK_DAILY_LIMIT);
export const THREAT_TYPES = ["SOCIAL_ENGINEERING", "MALWARE", "UNWANTED_SOFTWARE"] as const;
export type ThreatType = (typeof THREAT_TYPES)[number];

export type WebRiskResult =
  | { status: "match"; threats: ThreatType[] }
  | { status: "clear" }
  | { status: "skipped"; reason: "no-key" | "limit" | "no-db" | "error" };

type Threat = { threatTypes?: string[]; hash?: string; expireTime?: string };
type Answer = { threats: Threat[]; until: number };
const cache = new Map<string, Answer>();

export type Reserve = (units: number) => Promise<boolean>;
export type Fetcher = (url: string) => Promise<{ ok: boolean; json: () => Promise<unknown> }>;

const sha256 = (s: string) => createHash("sha256").update(s).digest();
/** hashPrefix 쿼리 값 = URL용 Base64(+/ 대신 -_, 끝 = 채움 유지) — Google REST 명세(카이 db5385f HOLD 1) */
export const urlSafePrefix = (prefix: Buffer) => prefix.toString("base64").replace(/\+/g, "-").replace(/\//g, "_");
/** 응답의 전체 해시는 문자열이 아니라 32바이트로 비교한다(일반·URL용 Base64 둘 다 받아들임) */
const decodeHash = (h: string | undefined) => (h ? Buffer.from(h.replace(/-/g, "+").replace(/_/g, "/"), "base64") : Buffer.alloc(0));

async function dbReserve(units: number, now: Date): Promise<boolean> {
  if (WEB_RISK_DAILY_LIMIT <= 0 || units > WEB_RISK_DAILY_LIMIT) return false;
  const { ensureTables, reserve } = await import("@/lib/community");
  await ensureTables();
  return reserve("webrisk-call", `d:${kstDay(now)}`, units, WEB_RISK_DAILY_LIMIT);
}

export async function webRiskCheck(expressions: string[], opts: { key?: string; now?: Date; reserve?: Reserve; fetcher?: Fetcher; dbAvailable?: boolean } = {}): Promise<WebRiskResult> {
  const key = opts.key ?? process.env.WEB_RISK_API_KEY;
  if (!key) return { status: "skipped", reason: "no-key" };
  const now = opts.now ?? new Date();
  const hashes = expressions.map((e) => sha256(e));
  const keyOf = (h: Buffer) => h.subarray(0, 4).toString("hex");
  const prefixes = [...new Map(hashes.map((h) => [keyOf(h), h.subarray(0, 4)])).entries()];
  const live = (k: string) => (cache.get(k)?.until ?? 0) > now.getTime();
  const missing = prefixes.filter(([k]) => !live(k));
  // 캐시에 이미 있는 위험 일치는 다른 앞자리의 상한·오류와 상관없이 먼저 지킨다(카이 db5385f HOLD 2)
  const matched = () => {
    const found = new Set<ThreatType>();
    for (const h of hashes) {
      const k = keyOf(h);
      if (!live(k)) continue;
      for (const t of cache.get(k)?.threats ?? []) if (decodeHash(t.hash).equals(h)) for (const tt of t.threatTypes ?? []) if ((THREAT_TYPES as readonly string[]).includes(tt)) found.add(tt as ThreatType);
    }
    return found;
  };
  const skip = (reason: "limit" | "no-db" | "error"): WebRiskResult => { const f = matched(); return f.size ? { status: "match", threats: [...f] } : { status: "skipped", reason }; };
  if (missing.length) {
    if (!opts.reserve && !(opts.dbAvailable ?? hasDb)) return skip("no-db");
    let ok: boolean;
    try { ok = await (opts.reserve ? opts.reserve(missing.length) : dbReserve(missing.length, now)); } catch { return skip("error"); }
    if (!ok) return skip("limit");
    const fetcher: Fetcher = opts.fetcher ?? ((u) => fetch(u, { signal: AbortSignal.timeout(4000), redirect: "error" }));
    try {
      for (const [p, raw] of missing) {
        const qs = new URLSearchParams({ hashPrefix: urlSafePrefix(raw), key });
        for (const t of THREAT_TYPES) qs.append("threatTypes", t);
        const res = await fetcher(`https://webrisk.googleapis.com/v1/hashes:search?${qs}`);
        if (!res.ok) return skip("error");
        const body = (await res.json()) as { threats?: Threat[]; negativeExpireTime?: string };
        const threats = body.threats ?? [];
        const times = [body.negativeExpireTime, ...threats.map((t) => t.expireTime)].map((t) => (t ? Date.parse(t) : NaN)).filter(Number.isFinite);
        cache.set(p, { threats, until: times.length ? Math.min(...times) : now.getTime() + 5 * 60_000 });
        if (cache.size > 5000) for (const [k, v] of cache) if (v.until <= now.getTime()) cache.delete(k);
      }
    } catch { return skip("error"); }
  }
  const found = matched();
  return found.size ? { status: "match", threats: [...found] } : { status: "clear" };
}

/** 시험용 — 앞자리 캐시 비우기 */
export function _clearWebRiskCache() { cache.clear(); }
