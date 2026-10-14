import { z } from "zod";
import { hasDb } from "@/db";
import { json } from "@/lib/auth";
import { check, clientIp, MAX_KEYS_PER_CHECK, normalizeKeys, validSig } from "@/lib/community";
import { memoryLimiter } from "@/lib/ratelimit";

export const runtime = "nodejs";

const limited = memoryLimiter(60_000, 60);
const Body = z.object({ keys: z.array(z.string().max(220)).max(MAX_KEYS_PER_CHECK).default([]), sig: z.array(z.number()).optional() });
const EMPTY = { counts: {}, similar: 0 };

/**
 * POST /api/community/check {keys, sig?} — 이용자 신고 수·비슷한 신고 글 수(서로 다른 신고자 3명 이상만).
 * 원문은 받지 않는다(서명만). 장부가 아파도 판독 화면은 그대로 — 빈 결과.
 */
export async function POST(req: Request) {
  const p = Body.safeParse(await req.json().catch(() => null));
  if (!p.success) return json({ error: "invalid body" }, 400);
  const keys = normalizeKeys(p.data.keys, MAX_KEYS_PER_CHECK);
  const sig = p.data.sig ? validSig(p.data.sig) : null;
  if ((!keys.length && !sig) || !hasDb) return json(EMPTY);
  if (limited(clientIp(req))) return json({ error: "too many requests", retryAfterSec: 60 }, 429);
  try {
    return json(await check(keys, sig));
  } catch {
    return json(EMPTY);
  }
}
