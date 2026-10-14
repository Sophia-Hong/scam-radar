import { buildReport, publicView } from "@/lib/report";
import { checkAdmin, json } from "@/lib/auth";
import { canView, decodeParam } from "@/lib/visibility";
import { hasDb } from "@/db";

export const runtime = "nodejs";
export const maxDuration = 30;

/** GET /api/reports/:accountId — 조사기관 제출용 리포트 JSON (계정명·일시·내용·증거·계정URL·프로필캡처·판단근거) */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!hasDb) return json({ error: "database not configured" }, 503);
  const { id } = await ctx.params;
  const accountId = decodeParam(id);
  const admin = checkAdmin(req);
  // 공개 열람자에게는 합성 데모 계정의 리포트만 — 실계정은 "없음"과 같은 응답 (DB 조회 전에 막는다)
  if (!canView(accountId, admin)) return json({ error: "not found" }, 404);
  const report = await buildReport(accountId, { admin });
  if (!report) return json({ error: "not found" }, 404);
  return json(publicView(report, admin));
}
