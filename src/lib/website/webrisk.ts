import { createHash } from "crypto";
import { hasDb } from "@/db";
import { kstDay } from "@/lib/checklimit";

/**
 * Google Web Risk — hashes.search(주소 SHA-256의 앞 4바이트만 보낸다, 율 1791986407 "Lookup은 주소를 그대로 보낸다"). 돌아온 전체 해시와 우리 쪽 해시를 비교해 판정.
 * 하루 상한 WEB_RISK_DAILY_LIMIT(기본 3,000) — 콘솔 쿼터가 없어서 이 카운터가 유일한 상한이다(테오 1791986262).
 * *호출 전에* DB 원자 카운터로 예약한다(AI 상한과 같은 community_quota, 버킷 = KST 날짜). DB가 없거나 예약 오류·상한 초과면 호출하지 않는다(fail-closed).
 * 키(WEB_RISK_API_KEY)가 없으면 이 줄은 통째로 빠진다. 같은 앞자리는 Google이 준 만료 시각까지 인스턴스 메모리에 둔다.
 */
export const WEB_RISK_DAILY_LIMIT = Number(process.env.WEB_RISK_DAILY_LIMIT ?? 3000);
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

async function dbReserve(units: number, now: Date): Promise<boolean> {
  const { ensureTables, reserve } = await import("@/lib/community");
  await ensureTables();
  return reserve("webrisk-call", `d:${kstDay(now)}`, units, WEB_RISK_DAILY_LIMIT);
}

export async function webRiskCheck(expressions: string[], opts: { key?: string; now?: Date; reserve?: Reserve; fetcher?: Fetcher; dbAvailable?: boolean } = {}): Promise<WebRiskResult> {
  const key = opts.key ?? process.env.WEB_RISK_API_KEY;
  if (!key) return { status: "skipped", reason: "no-key" };
  const now = opts.now ?? new Date();
  const hashes = expressions.map((e) => sha256(e));
  const prefixes = [...new Set(hashes.map((h) => h.subarray(0, 4).toString("base64")))];
  const missing = prefixes.filter((p) => (cache.get(p)?.until ?? 0) <= now.getTime());
  if (missing.length) {
    if (!opts.reserve && !(opts.dbAvailable ?? hasDb)) return { status: "skipped", reason: "no-db" };
    let ok: boolean;
    try { ok = await (opts.reserve ? opts.reserve(missing.length) : dbReserve(missing.length, now)); } catch { return { status: "skipped", reason: "error" }; }
    if (!ok) return { status: "skipped", reason: "limit" };
    const fetcher: Fetcher = opts.fetcher ?? ((u) => fetch(u, { signal: AbortSignal.timeout(4000) }));
    try {
      for (const p of missing) {
        const qs = new URLSearchParams({ hashPrefix: p, key });
        for (const t of THREAT_TYPES) qs.append("threatTypes", t);
        const res = await fetcher(`https://webrisk.googleapis.com/v1/hashes:search?${qs}`);
        if (!res.ok) return { status: "skipped", reason: "error" };
        const body = (await res.json()) as { threats?: Threat[]; negativeExpireTime?: string };
        const threats = body.threats ?? [];
        const times = [body.negativeExpireTime, ...threats.map((t) => t.expireTime)].map((t) => (t ? Date.parse(t) : NaN)).filter(Number.isFinite);
        cache.set(p, { threats, until: times.length ? Math.min(...times) : now.getTime() + 5 * 60_000 });
        if (cache.size > 5000) for (const [k, v] of cache) if (v.until <= now.getTime()) cache.delete(k);
      }
    } catch { return { status: "skipped", reason: "error" }; }
  }
  const found = new Set<ThreatType>();
  for (const h of hashes) {
    const full = h.toString("base64");
    for (const t of cache.get(h.subarray(0, 4).toString("base64"))?.threats ?? []) {
      if (t.hash === full) for (const tt of t.threatTypes ?? []) if ((THREAT_TYPES as readonly string[]).includes(tt)) found.add(tt as ThreatType);
    }
  }
  return found.size ? { status: "match", threats: [...found] } : { status: "clear" };
}

/** 시험용 — 앞자리 캐시 비우기 */
export function _clearWebRiskCache() { cache.clear(); }
