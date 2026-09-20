import { IngestSchema, ingest } from "@/lib/pipeline";
import { checkIngestToken, json } from "@/lib/auth";
import { hasDb } from "@/db";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * POST /api/ingest — 수집기가 게시물 1건 또는 배열을 보냄
 * Authorization: Bearer <INGEST_TOKEN>
 */
export async function POST(req: Request) {
  if (!checkIngestToken(req)) return json({ error: "unauthorized" }, 401);
  if (!hasDb) return json({ error: "database not configured" }, 503);
  const body = await req.json().catch(() => null);
  const items = Array.isArray(body) ? body : [body];
  if (items.length > 50) return json({ error: "max 50 items per request" }, 413);
  const results = [];
  for (const it of items) {
    const parsed = IngestSchema.safeParse(it);
    if (!parsed.success) { results.push({ error: parsed.error.flatten() }); continue; }
    try { results.push(await ingest(parsed.data)); }
    catch (e) { results.push({ error: (e as Error).message }); }
  }
  return json(Array.isArray(body) ? results : results[0]);
}
