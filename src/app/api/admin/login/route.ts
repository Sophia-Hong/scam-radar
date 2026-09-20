import { z } from "zod";
import { ADMIN_COOKIE, json } from "@/lib/auth";

export const runtime = "nodejs";
const Schema = z.object({ token: z.string().min(1) });

/** POST /api/admin/login {token} — 맞으면 httpOnly 쿠키를 심는다 */
export async function POST(req: Request) {
  const expected = process.env.ADMIN_TOKEN;
  // 토큰 미설정 + 비프로덕션: 검토 화면이 바로 열리도록 통과시킨다 (checkAdmin 과 같은 규칙)
  if (!expected) {
    if (process.env.NODE_ENV === "production") return json({ error: "ADMIN_TOKEN 이 설정되지 않았습니다" }, 503);
    return json({ ok: true, open: true });
  }
  const p = Schema.safeParse(await req.json().catch(() => null));
  if (!p.success) return json({ error: p.error.flatten() }, 400);
  if (p.data.token !== expected) return json({ error: "토큰이 올바르지 않습니다" }, 401);

  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "set-cookie": `${ADMIN_COOKIE}=${encodeURIComponent(expected)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${60 * 60 * 12}${secure}`,
    },
  });
}
