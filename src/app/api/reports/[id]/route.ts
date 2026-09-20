import { buildReport } from "@/lib/report";
import { json } from "@/lib/auth";
import { hasDb } from "@/db";

export const runtime = "nodejs";
export const maxDuration = 30;

/** GET /api/reports/:accountId — 조사기관 제출용 리포트 JSON (계정명·일시·내용·증거·계정URL·프로필캡처·판단근거) */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!hasDb) return json({ error: "database not configured" }, 503);
  const { id } = await ctx.params;
  const report = await buildReport(decodeURIComponent(id));
  if (!report) return json({ error: "not found" }, 404);
  return json(report);
}
