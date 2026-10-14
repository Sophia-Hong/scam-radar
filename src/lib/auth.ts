/** 쓰기 API 보호 — 수집기가 보내는 Bearer 토큰. 조회 API 는 합성 데모 계정만 공개(src/lib/visibility.ts), 실계정은 관리자만 */
export function checkIngestToken(req: Request): boolean {
  const token = process.env.INGEST_TOKEN;
  if (!token) return process.env.NODE_ENV !== "production"; // 로컬 개발은 토큰 없이 허용
  const h = req.headers.get("authorization") ?? "";
  return h === `Bearer ${token}`;
}
/** 관리자 세션 쿠키 이름 */
export const ADMIN_COOKIE = "sr_admin";

/** 요청에서 쿠키 하나를 뽑는다 (next/headers 없이도 되게) */
function cookieOf(req: Request, name: string): string | null {
  const raw = req.headers.get("cookie");
  if (!raw) return null;
  for (const part of raw.split(";")) {
    const i = part.indexOf("=");
    if (i < 0) continue;
    if (part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim());
  }
  return null;
}

/** 관리자 토큰/쿠키 값이 맞는가. 토큰 미설정 + 비프로덕션이면 통과(로컬 개발), 프로덕션에서 비어 있으면 잠긴다 */
export function adminValueOk(value: string | null | undefined): boolean {
  const token = process.env.ADMIN_TOKEN;
  if (!token) return process.env.NODE_ENV !== "production";
  return !!value && value === token;
}

/** 서버 컴포넌트(페이지)용 — 요청 쿠키로 관리자인지 */
export async function isAdminPage(): Promise<boolean> {
  const { cookies } = await import("next/headers");
  const jar = await cookies();
  return adminValueOk(jar.get(ADMIN_COOKIE)?.value);
}

/**
 * 검토(관리자) API 보호 — `Authorization: Bearer $ADMIN_TOKEN` 또는 `sr_admin` 쿠키.
 * checkIngestToken 과 같은 규칙으로, 토큰 미설정 + 비프로덕션이면 통과시킨다.
 */
export function checkAdmin(req: Request): boolean {
  const token = process.env.ADMIN_TOKEN;
  if (!token) return process.env.NODE_ENV !== "production"; // 로컬 개발은 토큰 없이 허용
  const h = req.headers.get("authorization") ?? "";
  if (h === `Bearer ${token}`) return true;
  return adminValueOk(cookieOf(req, ADMIN_COOKIE));
}

export const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json; charset=utf-8" } });
