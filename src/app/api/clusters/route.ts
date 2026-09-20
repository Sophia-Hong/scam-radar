import { desc } from "drizzle-orm";
import { db, hasDb, schema } from "@/db";
import { json } from "@/lib/auth";

export const runtime = "nodejs";

/** GET /api/clusters — 캠페인(유사 문구 묶음) 목록 */
export async function GET() {
  if (!hasDb) return json({ error: "database not configured" }, 503);
  const rows = await db().select().from(schema.clusters).orderBy(desc(schema.clusters.size), desc(schema.clusters.lastSeen)).limit(100);
  return json(rows);
}
