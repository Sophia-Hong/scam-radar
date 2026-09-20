import { desc, eq } from "drizzle-orm";
import { db, hasDb, schema } from "@/db";
import { json } from "@/lib/auth";
import { ENTITY_TYPE_LABEL, isStrongEntity, type EntityType } from "@/engine";

export const runtime = "nodejs";

/**
 * GET /api/entities/:id — 연락처 엔티티 1건 + 이 연락처를 쓴 계정들.
 * id 는 `${type}:${value}` (예: `telegram:vip_stock_room77`).
 */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!hasDb) return json({ error: "database not configured" }, 503);
  const { id } = await ctx.params;
  const entityId = decodeURIComponent(id).trim().toLowerCase();
  const d = db();
  const [ent] = await d.select().from(schema.entities).where(eq(schema.entities.id, entityId)).limit(1);
  if (!ent) return json({ found: false, id: entityId, message: "해당 연락처로 수집된 기록 없음" }, 404);

  const rows = await d.selectDistinct({
    accountId: schema.postEntities.accountId, source: schema.postEntities.source,
    handle: schema.accounts.handle, platform: schema.accounts.platform, profileUrl: schema.accounts.profileUrl,
    score: schema.accounts.score, label: schema.accounts.label,
  }).from(schema.postEntities)
    .innerJoin(schema.accounts, eq(schema.accounts.id, schema.postEntities.accountId))
    .where(eq(schema.postEntities.entityId, entityId))
    .orderBy(desc(schema.accounts.score))
    .limit(200);

  const seen = new Set<string>();
  const accounts = rows.filter((r) => !seen.has(r.accountId) && seen.add(r.accountId));

  const posts = await d.select({
    id: schema.posts.id, accountId: schema.posts.accountId, postUrl: schema.posts.postUrl,
    score: schema.posts.score, label: schema.posts.label, postedAt: schema.posts.postedAt,
  }).from(schema.postEntities)
    .innerJoin(schema.posts, eq(schema.posts.id, schema.postEntities.postId))
    .where(eq(schema.postEntities.entityId, entityId))
    .orderBy(desc(schema.posts.score))
    .limit(50);

  return json({
    found: true,
    entity: {
      id: ent.id, type: ent.type, value: ent.value,
      typeLabel: ENTITY_TYPE_LABEL[ent.type as EntityType] ?? ent.type,
      strong: isStrongEntity(ent.type),
      firstSeen: ent.firstSeen, lastSeen: ent.lastSeen,
      accountCount: ent.accountCount, postCount: ent.postCount,
    },
    accounts,
    posts,
  });
}
