import { z } from "zod";
import { and, desc, eq, ilike, or } from "drizzle-orm";
import { db, hasDb, schema } from "@/db";
import { checkAdmin, json } from "@/lib/auth";
import { effectiveStatus } from "@/lib/labels";
import { resolveAccountId } from "@/lib/resolve";

export const runtime = "nodejs";

const Schema = z.object({
  accountId: z.string().min(3),
  decision: z.enum(["SCAM", "NOT_SCAM", "RESET"]),
  note: z.string().max(1000).optional(),
});

/**
 * POST /api/admin/decision — 사람의 최종 판단.
 * 기계 점수·라벨은 그대로 두고 humanLabel 로 덮는다 (판정 이력이 남아야 오탐 보정에 쓸 수 있다).
 */
export async function POST(req: Request) {
  if (!checkAdmin(req)) return json({ error: "unauthorized" }, 401);
  if (!hasDb) return json({ error: "database not configured" }, 503);
  const p = Schema.safeParse(await req.json().catch(() => null));
  if (!p.success) return json({ error: p.error.flatten() }, 400);

  const d = db();
  // 계정 조회와 같은 규칙으로 id · @handle · URL 을 모두 받는다
  const r = resolveAccountId(p.data.accountId);
  const [acc] = await d.select().from(schema.accounts)
    .where(r.id ? or(eq(schema.accounts.id, r.id), ilike(schema.accounts.handle, r.handle)) : ilike(schema.accounts.handle, r.handle))
    .orderBy(desc(schema.accounts.score)).limit(1);
  if (!acc) return json({ error: "account not found", query: p.data.accountId }, 404);
  const accountId = acc.id;

  const reset = p.data.decision === "RESET";
  const humanLabel = reset ? null : p.data.decision;
  const now = new Date();
  await d.update(schema.accounts).set({
    humanLabel,
    humanNote: reset ? null : (p.data.note ?? null),
    reviewedAt: reset ? null : now,
    reviewedBy: reset ? null : "admin",
    updatedAt: now,
  }).where(eq(schema.accounts.id, accountId));

  // 판단을 내렸으면 이 계정에 대한 열린 제보는 처리된 것으로 본다
  let resolvedFeedback = 0;
  if (!reset) {
    const rows = await d.update(schema.feedback).set({ status: "resolved" })
      .where(and(eq(schema.feedback.accountId, accountId), eq(schema.feedback.status, "open")))
      .returning({ id: schema.feedback.id });
    resolvedFeedback = rows.length;
  }

  return json({
    ok: true, accountId, humanLabel,
    humanNote: reset ? null : (p.data.note ?? null),
    reviewedAt: reset ? null : now.toISOString(),
    reviewedBy: reset ? null : "admin",
    effectiveStatus: effectiveStatus(acc.label, humanLabel),
    score: acc.score, label: acc.label,
    resolvedFeedback,
  });
}
