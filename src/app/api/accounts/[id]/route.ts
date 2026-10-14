import { desc, eq, or, ilike } from "drizzle-orm";
import { db, hasDb, schema } from "@/db";
import { checkAdmin, json } from "@/lib/auth";
import { decodeParam, onlyVisible, publicReasons, redactSharedContact } from "@/lib/visibility";
import { resolveAccountId } from "@/lib/resolve";
import { sharedAccountsOf } from "@/lib/pipeline";
import { effectiveStatus } from "@/lib/labels";

export const runtime = "nodejs";

/** GET /api/accounts/:id — 계정 조회 (핸들·URL·id 모두 허용) */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!hasDb) return json({ error: "database not configured" }, 503);
  const { id } = await ctx.params;
  const r = resolveAccountId(decodeParam(id));
  const admin = checkAdmin(req);
  const d = db();
  const found = await d.select().from(schema.accounts)
    .where(r.id ? or(eq(schema.accounts.id, r.id), ilike(schema.accounts.handle, r.handle)) : ilike(schema.accounts.handle, r.handle))
    .orderBy(desc(schema.accounts.score)).limit(5);
  // 공개 열람자에게는 합성 데모 계정만 — 실계정은 "기록 없음"과 같은 응답(보유 여부도 드러내지 않는다)
  const rows = onlyVisible(found, (a) => a.id, admin);
  if (!rows.length) return json({ found: false, query: r, score: 0, label: "UNKNOWN", effectiveStatus: "UNKNOWN", message: "수집된 기록 없음 — 안전하다는 뜻은 아닙니다" }, 404);
  const acc = rows[0];
  const posts = await d.select({
    id: schema.posts.id, postUrl: schema.posts.postUrl, parentUrl: schema.posts.parentUrl, kind: schema.posts.kind, text: schema.posts.text,
    postedAt: schema.posts.postedAt, capturedAt: schema.posts.capturedAt, screenshotUrl: schema.posts.screenshotUrl,
    score: schema.posts.score, label: schema.posts.label, reasons: schema.posts.reasons, techniques: schema.posts.techniques, clusterId: schema.posts.clusterId,
  }).from(schema.posts).where(eq(schema.posts.accountId, acc.id)).orderBy(desc(schema.posts.score)).limit(20);
  // 연락처 엔티티 + 같은 연락처를 쓰는 다른 계정 (PIP: 가장 정밀도 높은 계정 간 연결 신호)
  const shared = await sharedAccountsOf(acc.id);
  const entities = shared.entities;
  const sharedWith = onlyVisible(shared.sharedWith, (s) => s.accountId, admin);
  // 공개 열람자에게는 근거 문장·요약문에 적힌 실계정 id 도 가린다 (연결 계정이 걸러졌으면 요약문은 비움)
  const trimmed = sharedWith.length !== shared.sharedWith.length;
  const shownAccount = admin ? acc : {
    ...acc,
    reasons: publicReasons(redactSharedContact((acc.reasons ?? []) as { code: string; label: string; points: number; evidence?: string | null }[])),
    summary: trimmed ? null : acc.summary,
  };
  return json({
    found: true, account: shownAccount,
    posts: admin ? posts : posts.map((p) => ({ ...p, reasons: publicReasons(((p.reasons ?? []) as { points: number }[])) })),   // 공개: 신호 방향만
    entities, sharedWith,
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
