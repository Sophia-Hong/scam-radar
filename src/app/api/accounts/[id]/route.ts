import { desc, eq, or, ilike } from "drizzle-orm";
import { db, hasDb, schema } from "@/db";
import { json } from "@/lib/auth";
import { resolveAccountId } from "@/lib/resolve";
import { sharedAccountsOf } from "@/lib/pipeline";
import { effectiveStatus } from "@/lib/labels";

export const runtime = "nodejs";

/** GET /api/accounts/:id — 계정 조회 (핸들·URL·id 모두 허용) */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!hasDb) return json({ error: "database not configured" }, 503);
  const { id } = await ctx.params;
  const r = resolveAccountId(id);
  const d = db();
  const rows = await d.select().from(schema.accounts)
    .where(r.id ? or(eq(schema.accounts.id, r.id), ilike(schema.accounts.handle, r.handle)) : ilike(schema.accounts.handle, r.handle))
    .orderBy(desc(schema.accounts.score)).limit(5);
  if (!rows.length) return json({ found: false, query: r, score: 0, label: "UNKNOWN", effectiveStatus: "UNKNOWN", message: "수집된 기록 없음 — 안전하다는 뜻은 아닙니다" }, 404);
  const acc = rows[0];
  const posts = await d.select({
    id: schema.posts.id, postUrl: schema.posts.postUrl, parentUrl: schema.posts.parentUrl, kind: schema.posts.kind, text: schema.posts.text,
    postedAt: schema.posts.postedAt, capturedAt: schema.posts.capturedAt, screenshotUrl: schema.posts.screenshotUrl,
    score: schema.posts.score, label: schema.posts.label, reasons: schema.posts.reasons, techniques: schema.posts.techniques, clusterId: schema.posts.clusterId,
  }).from(schema.posts).where(eq(schema.posts.accountId, acc.id)).orderBy(desc(schema.posts.score)).limit(20);
  // 연락처 엔티티 + 같은 연락처를 쓰는 다른 계정 (PIP: 가장 정밀도 높은 계정 간 연결 신호)
  const { entities, sharedWith } = await sharedAccountsOf(acc.id);
  return json({
    found: true, account: acc, posts, entities, sharedWith,
    // 표시 라벨은 사람 판단이 있으면 그것이 최종 (src/lib/labels.ts 한 곳에서 결정)
    humanLabel: acc.humanLabel,
    humanNote: acc.humanNote,
    reviewedAt: acc.reviewedAt?.toISOString() ?? null,
    reviewedBy: acc.reviewedBy,
    effectiveStatus: effectiveStatus(acc.label, acc.humanLabel),
    otherMatches: rows.slice(1).map((a) => ({
      id: a.id, platform: a.platform, handle: a.handle, score: a.score, label: a.label,
      effectiveStatus: effectiveStatus(a.label, a.humanLabel),
    })),
  });
}
