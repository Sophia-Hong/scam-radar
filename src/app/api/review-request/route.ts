import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db, hasDb, schema } from "@/db";
import { checkAdmin, json } from "@/lib/auth";
import { clientIp, ensureTables, normalizeKeys, reporterId, reporterSecret, requestReview } from "@/lib/community";

export const runtime = "nodejs";

const Body = z.object({
  keys: z.array(z.string().max(220)).max(10).default([]),
  contact: z.string().trim().min(3).max(200),
  message: z.string().trim().min(1).max(2000),
});

/**
 * POST /api/review-request — "잘못 표시됐다면 검토 요청" (율 #compliance 1791943087 조건 4).
 * 열려 있는 동안 해당 키의 이용자 신고 집계·위험 배너를 숨기고, 7일 안에 contact 로 답한다. 처리 기록은 행에 남긴다.
 */
export async function POST(req: Request) {
  if (!hasDb) return json({ error: "database not configured" }, 503);
  const p = Body.safeParse(await req.json().catch(() => null));
  if (!p.success) return json({ error: "invalid body" }, 400);
  const reporter = reporterId(clientIp(req), reporterSecret());
  if (!reporter) return json({ error: "not configured" }, 503);
  try {
    const r = await requestReview(normalizeKeys(p.data.keys, 10), p.data.contact, p.data.message, reporter);
    if (!r.ok) return json({ error: "too many requests", retryAfterSec: 3600 }, 429);
    return json(r);
  } catch {
    return json({ error: "unavailable" }, 503);
  }
}

/** GET /api/review-request — 관리자만: 열린 요청 목록 */
export async function GET(req: Request) {
  if (!checkAdmin(req)) return json({ error: "unauthorized" }, 401);
  if (!hasDb) return json({ error: "database not configured" }, 503);
  await ensureTables();
  const t = schema.reviewRequests;
  const rows = await db().select().from(t).where(eq(t.status, "open")).orderBy(desc(t.createdAt)).limit(200);
  return json({ open: rows.map(({ reporter: _r, ...x }) => x) });
}
