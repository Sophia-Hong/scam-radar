import { sql } from "drizzle-orm";
import { db, hasDb, schema } from "@/db";
import { json } from "@/lib/auth";

export const runtime = "nodejs";

export async function GET() {
  if (!hasDb) return json({ accounts: 0, high: 0, review: 0, confirmed: 0, cleared: 0, queue: 0, posts: 0, clusters: 0, dbConfigured: false });
  const d = db();
  const [a] = await d.select({
    accounts: sql<number>`count(*)`, high: sql<number>`count(*) filter (where label='HIGH')`, review: sql<number>`count(*) filter (where label='REVIEW')`,
    // 사람 검토 결과
    confirmed: sql<number>`count(*) filter (where human_label='SCAM')`,
    cleared: sql<number>`count(*) filter (where human_label='NOT_SCAM')`,
    // 검토 큐 = REVIEW 이거나, HIGH 인데 아직 사람이 안 본 것 (열린 제보분은 아래에서 더한다)
    queueBase: sql<number>`count(*) filter (where label='REVIEW' or (label='HIGH' and human_label is null))`,
  }).from(schema.accounts);
  const [q] = await d.select({
    extra: sql<number>`count(*)`,
  }).from(sql`(select distinct f.account_id from feedback f join accounts ac on ac.id = f.account_id
      where f.status='open' and not (ac.label='REVIEW' or (ac.label='HIGH' and ac.human_label is null))) x`);
  const [p] = await d.select({ posts: sql<number>`count(*)` }).from(schema.posts);
  const [c] = await d.select({ clusters: sql<number>`count(*)` }).from(schema.clusters);
  return json({
    accounts: +a.accounts, high: +a.high, review: +a.review,
    confirmed: +a.confirmed, cleared: +a.cleared, queue: +a.queueBase + +q.extra,
    posts: +p.posts, clusters: +c.clusters, dbConfigured: true,
  });
}
