import { z } from "zod";
import { hasDb } from "@/db";
import { json } from "@/lib/auth";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { check, clientIp, MAX_KEYS_PER_CHECK, normalizeKeys, validSig, type EngineLevel } from "@/lib/community";
import { isSyntheticAccountId } from "@/lib/visibility";
import { memoryLimiter } from "@/lib/ratelimit";

export const runtime = "nodejs";

const limited = memoryLimiter(60_000, 60);
const Body = z.object({
  keys: z.array(z.string().max(220)).max(MAX_KEYS_PER_CHECK).default([]),
  sig: z.array(z.number()).optional(),
  /** 지금 화면의 엔진 판정(글 판독은 브라우저가 계산). 없거나 LOW 면 신고 수를 내보내지 않는다 */
  level: z.enum(["HIGH", "REVIEW", "LOW"]).optional(),
});
const EMPTY = { counts: {}, similar: 0 };
/** 장부를 못 읽음 — 화면은 신고 칸을 숨긴다("0건"으로 보이지 않게, 카이 ④ 검수 4) */
const UNAVAILABLE = { counts: {}, similar: 0, unavailable: true };

/**
 * POST /api/community/check {keys, sig?, level?} — 이용자 신고 수·비슷한 신고 글 수.
 * 공개 조건 = 서로 다른 연결 3곳 이상 AND 엔진 판정 중간 이상(lib/community.ts countsVisible). 공개 합성 계정은 DB 의 현재 판정이 우선.
 * 이 API 를 직접 불러 level 을 속여도 보이는 것은 그 요청자 자신의 응답뿐이다 — 다른 사람 화면의 판정은 그 사람의 글로 계산된다.
 * 원문은 받지 않는다(서명만). 장부가 아파도 판독 화면은 그대로 — 빈 결과.
 */
export async function POST(req: Request) {
  const p = Body.safeParse(await req.json().catch(() => null));
  if (!p.success) return json({ error: "invalid body" }, 400);
  const keys = normalizeKeys(p.data.keys, MAX_KEYS_PER_CHECK);
  const sig = p.data.sig ? validSig(p.data.sig) : null;
  if (!keys.length && !sig) return json(EMPTY);
  if (!hasDb) return json(UNAVAILABLE);
  if (limited(clientIp(req))) return json({ error: "too many requests", retryAfterSec: 60 }, 429);
  try {
    // 공개 합성 계정을 조회한 경우는 그 계정의 현재 엔진 판정(DB)을 쓴다. 실계정 판정은 읽지 않는다(보유 여부·판정이 새지 않게)
    // 그 판정은 *그 계정 키에만* 적용한다 — 다른 키(연락처·실계정)는 요청의 판정으로 따로(카이 392ac60)
    const keyLevels: Record<string, EngineLevel> = {};
    for (const acct of keys.filter((k) => k.startsWith("threads:") && isSyntheticAccountId(k))) {
      const [row] = await db().select({ label: schema.accounts.label }).from(schema.accounts).where(eq(schema.accounts.id, acct)).limit(1);
      if (row && ["HIGH", "REVIEW", "LOW"].includes(row.label)) keyLevels[acct] = row.label as EngineLevel;
    }
    return json(await check(keys, sig, p.data.level ?? null, keyLevels));
  } catch {
    return json(UNAVAILABLE);
  }
}
