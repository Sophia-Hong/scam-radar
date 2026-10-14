import { z } from "zod";
import { hasDb } from "@/db";
import { json } from "@/lib/auth";
import { clientIp, countsFor, MAX_KEYS_PER_GET, MAX_KEYS_PER_POST, normalizeKeys, register, reporterId, reporterSecret } from "@/lib/community";

export const runtime = "nodejs";

/** 조회 연타 방지 — IP 당 분당 60회 (프로세스 메모리. 등록 제한은 DB 로 따로 센다) */
const WINDOW_MS = 60_000;
const MAX_GETS = 60;
const hits = new Map<string, number[]>();
function rateLimited(ip: string): boolean {
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  if (recent.length >= MAX_GETS) { hits.set(ip, recent); return true; }
  recent.push(now);
  hits.set(ip, recent);
  if (hits.size > 5000) for (const [k, v] of hits) if (!v.some((t) => now - t < WINDOW_MS)) hits.delete(k);
  return false;
}

/** GET /api/community?k=threads:foo&k=telegram:bar — 키별 이용자 신고 수. 없는 키는 0(응답에서 생략) */
export async function GET(req: Request) {
  const keys = normalizeKeys(new URL(req.url).searchParams.getAll("k"), MAX_KEYS_PER_GET);
  if (!keys.length || !hasDb) return json({ counts: {} });
  if (rateLimited(clientIp(req))) return json({ error: "too many requests", retryAfterSec: 60 }, 429);
  try {
    return json({ counts: await countsFor(keys) });
  } catch {
    return json({ counts: {} });   // 장부가 아파도 판독 화면은 그대로
  }
}

const Body = z.object({ keys: z.array(z.string().max(220)).min(1).max(MAX_KEYS_PER_POST) });

/** POST /api/community {keys:[…]} — "사기 당했어요" 등록. 원문·이름·IP 원값은 받거나 남기지 않는다 */
export async function POST(req: Request) {
  if (!hasDb) return json({ error: "database not configured" }, 503);
  const p = Body.safeParse(await req.json().catch(() => null));
  if (!p.success) return json({ error: "invalid body" }, 400);
  const keys = normalizeKeys(p.data.keys, MAX_KEYS_PER_POST);
  if (!keys.length) return json({ error: "no valid keys" }, 400);
  const reporter = reporterId(clientIp(req), reporterSecret());
  if (!reporter) return json({ error: "registry not configured" }, 503);
  try {
    const r = await register(keys, reporter);
    if (!r.ok) return json({ error: "too many reports", retryAfterSec: 3600 }, 429);
    return json(r);
  } catch {
    return json({ error: "registry unavailable" }, 503);
  }
}
