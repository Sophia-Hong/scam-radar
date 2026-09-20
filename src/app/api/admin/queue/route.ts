import { and, desc, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { db, hasDb, schema } from "@/db";
import { checkAdmin, json } from "@/lib/auth";
import { effectiveStatus } from "@/lib/labels";
import { STRONG_ENTITY_TYPES, type Reason } from "@/engine";

export const runtime = "nodejs";

export type QueueStatus = "review" | "high" | "flagged" | "all";
const STATUSES: QueueStatus[] = ["review", "high", "flagged", "all"];

/**
 * GET /api/admin/queue?status=review|high|flagged|all&limit=
 * 사람이 봐야 할 계정 목록. 조회 수는 계정 수와 무관하게 고정(6회).
 */
export async function GET(req: Request) {
  if (!checkAdmin(req)) return json({ error: "unauthorized" }, 401);
  if (!hasDb) return json({ error: "database not configured" }, 503);

  const url = new URL(req.url);
  const sParam = (url.searchParams.get("status") ?? "all").toLowerCase();
  const status: QueueStatus = (STATUSES as string[]).includes(sParam) ? (sParam as QueueStatus) : "all";
  const limit = Math.min(200, Math.max(1, Number(url.searchParams.get("limit") ?? 50) || 50));

  const d = db();

  // 열린 제보가 있는 계정 (flagged 필터와 개수 표시 양쪽에 쓴다)
  const fbRows = await d.select({ accountId: schema.feedback.accountId, c: sql<number>`count(*)` })
    .from(schema.feedback).where(eq(schema.feedback.status, "open")).groupBy(schema.feedback.accountId);
  const openFb = new Map(fbRows.map((r) => [r.accountId, Number(r.c)]));
  const flaggedIds = [...openFb.keys()];

  // 검토 대상: REVIEW 이거나, HIGH 인데 아직 사람이 안 본 것이거나, 열린 제보가 있는 것
  const needsReview = or(
    eq(schema.accounts.label, "REVIEW"),
    and(eq(schema.accounts.label, "HIGH"), isNull(schema.accounts.humanLabel)),
    flaggedIds.length ? inArray(schema.accounts.id, flaggedIds) : sql`false`,
  );
  const where =
    status === "review" ? eq(schema.accounts.label, "REVIEW")
    : status === "high" ? and(eq(schema.accounts.label, "HIGH"), isNull(schema.accounts.humanLabel))
    : status === "flagged" ? (flaggedIds.length ? inArray(schema.accounts.id, flaggedIds) : sql`false`)
    : needsReview;

  const accs = await d.select().from(schema.accounts).where(where)
    .orderBy(desc(schema.accounts.score), desc(schema.accounts.lastSeen)).limit(limit);
  if (!accs.length) return json({ status, count: 0, items: [] });
  const ids = accs.map((a) => a.id);

  // 계정별 상위 게시물 — 한 번에 가져와 JS 에서 3건씩 자른다
  const postRows = await d.select({
    accountId: schema.posts.accountId, id: schema.posts.id, text: schema.posts.text, postUrl: schema.posts.postUrl,
    score: schema.posts.score, label: schema.posts.label, reasons: schema.posts.reasons, humanLabel: schema.posts.humanLabel,
  }).from(schema.posts).where(inArray(schema.posts.accountId, ids)).orderBy(desc(schema.posts.score));
  const topPosts = new Map<string, typeof postRows>();
  for (const p of postRows) {
    const list = topPosts.get(p.accountId) ?? topPosts.set(p.accountId, []).get(p.accountId)!;
    if (list.length < 3) list.push(p);
  }

  // 연락처 수
  const entRows = await d.select({ accountId: schema.postEntities.accountId, c: sql<number>`count(distinct ${schema.postEntities.entityId})` })
    .from(schema.postEntities).where(inArray(schema.postEntities.accountId, ids)).groupBy(schema.postEntities.accountId);
  const entCount = new Map(entRows.map((r) => [r.accountId, Number(r.c)]));

  // 같은 연락처를 쓰는 다른 계정 수 — recomputeSharedContact 과 같은 2단 조회
  const mine = await d.selectDistinct({ accountId: schema.postEntities.accountId, entityId: schema.postEntities.entityId })
    .from(schema.postEntities)
    .innerJoin(schema.entities, eq(schema.entities.id, schema.postEntities.entityId))
    .where(and(inArray(schema.postEntities.accountId, ids), inArray(schema.entities.type, STRONG_ENTITY_TYPES)));
  const entIds = [...new Set(mine.map((m) => m.entityId))];
  const all = entIds.length
    ? await d.selectDistinct({ entityId: schema.postEntities.entityId, accountId: schema.postEntities.accountId })
        .from(schema.postEntities).where(inArray(schema.postEntities.entityId, entIds))
    : [];
  const holders = new Map<string, Set<string>>();
  for (const r of all) (holders.get(r.entityId) ?? holders.set(r.entityId, new Set()).get(r.entityId)!).add(r.accountId);
  const myEnts = new Map<string, string[]>();
  for (const m of mine) (myEnts.get(m.accountId) ?? myEnts.set(m.accountId, []).get(m.accountId)!).push(m.entityId);
  const sharedCount = new Map<string, number>();
  for (const id of ids) {
    const linked = new Set<string>();
    for (const eid of myEnts.get(id) ?? []) for (const a of holders.get(eid) ?? []) if (a !== id) linked.add(a);
    sharedCount.set(id, linked.size);
  }

  const items = accs.map((a) => ({
    accountId: a.id,
    platform: a.platform,
    handle: a.handle,
    displayName: a.displayName,
    profileUrl: a.profileUrl,
    score: a.score,
    label: a.label,
    humanLabel: a.humanLabel,
    humanNote: a.humanNote,
    reviewedAt: a.reviewedAt?.toISOString() ?? null,
    reviewedBy: a.reviewedBy,
    effectiveStatus: effectiveStatus(a.label, a.humanLabel),
    reasons: (a.reasons as Reason[]) ?? [],
    postTotal: a.postTotal,
    firstSeen: a.firstSeen.toISOString(),
    lastSeen: a.lastSeen.toISOString(),
    entityCount: entCount.get(a.id) ?? 0,
    sharedWithCount: sharedCount.get(a.id) ?? 0,
    openFeedback: openFb.get(a.id) ?? 0,
    posts: (topPosts.get(a.id) ?? []).map((p) => ({
      id: p.id, text: p.text, url: p.postUrl, score: p.score, label: p.label,
      humanLabel: p.humanLabel, reasons: (p.reasons as Reason[]) ?? [],
    })),
  }));

  return json({ status, count: items.length, items });
}
