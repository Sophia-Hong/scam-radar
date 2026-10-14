import { z } from "zod";
import { json } from "@/lib/auth";
import { DAILY_LIMIT_ERROR, reserveCheck } from "@/lib/checklimit";
import { checkWebsite } from "@/lib/website/check";
import { isThreads, parseSite } from "@/lib/website/url";

export const runtime = "nodejs";

const Schema = z.object({ url: z.string().min(1).max(2048) });

/**
 * POST /api/website — 웹사이트 주소 하나가 사기 사이트일 수 있는지(소현 1791985819, 테오 1791985835·1791986262).
 * 같은 IP 하루 20회(다른 서버 검사와 같은 카운터). 주소는 저장하지 않는다. 대상 사이트에는 접속하지 않는다(RDAP 등록 정보·Google 해시 앞자리만).
 */
export async function POST(req: Request) {
  const parsed = Schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return json({ error: "url required" }, 400);
  const site = parseSite(parsed.data.url);
  if (!site || isThreads(site)) return json({ error: "not a website" }, 400);
  if (!(await reserveCheck(req))) return json({ error: DAILY_LIMIT_ERROR }, 429);
  const v = await checkWebsite(site);
  return json(v);
}
