import { desc, sql } from "drizzle-orm";
import { db, hasDb, schema } from "@/db";
import { checkAdmin, json } from "@/lib/auth";
import { SYNTHETIC_IDS_SQL } from "@/lib/visibility";

export const runtime = "nodejs";

/** GET /api/clusters — 캠페인(유사 문구 묶음) 목록 */
export async function GET(req: Request) {
  if (!hasDb) return json({ error: "database not configured" }, 503);
  // 공개 열람자에게는 구성원 게시물이 전부 합성 계정인 캠페인만 (실계정이 한 명이라도 섞이면 목록에서 뺀다)
  const publicOnly = checkAdmin(req) ? undefined : sql`not exists (select 1 from posts p where p.cluster_id = ${schema.clusters.id} and p.account_id not in (${SYNTHETIC_IDS_SQL}))`;
  const rows = await db().select().from(schema.clusters).where(publicOnly).orderBy(desc(schema.clusters.size), desc(schema.clusters.lastSeen)).limit(100);
  return json(rows);
}
