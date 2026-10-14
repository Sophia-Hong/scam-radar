import { createHmac } from "crypto";
import { hasDb } from "@/db";
import { clientIp, ensureTables, reporterSecret, reserve } from "./community";
import { memoryLimiter } from "./ratelimit";

/**
 * 같은 IP 의 서버 검사 하루 20회 (소현 #today-hq 1791954589, 테오 1791954606).
 * 세는 곳 = 서버로 가는 검사 — /api/analyze(그 안의 AI 재검 포함)·계정 조회, 곧 붙을 Web Risk 조회. 브라우저 안에서만 도는 [AI 없이 확인]은 서버를 안 써서 제외.
 * 카운터 = community_quota 원자적 증가(신고·AI 상한과 같은 reserve). 키 = IP 의 HMAC(원 IP 는 저장 안 함), 구간 = KST 날짜.
 * DB·비밀값이 없거나 DB 오류면 인스턴스 메모리로라도 센다(완전히 풀리지 않게). 관리자 요청은 세지 않는다.
 */
export const IP_DAILY_CHECKS = 20;
const memory = memoryLimiter(24 * 3600 * 1000, IP_DAILY_CHECKS);

export const kstDay = (now: Date) => new Date(now.getTime() + 9 * 3600 * 1000).toISOString().slice(0, 10);

export function checkerId(ip: string, secret: string): string {
  return createHmac("sha256", secret).update(`checks:${ip}`).digest("hex").slice(0, 32);
}

/** 한 번 쓸 수 있으면 true(그 자리에서 1회 소진), 오늘 다 썼으면 false */
export async function reserveCheck(req: Request, now = new Date()): Promise<boolean> {
  const ip = clientIp(req);
  const secret = reporterSecret();
  if (hasDb && secret) {
    try {
      await ensureTables();
      return await reserve(`checks:${checkerId(ip, secret)}`, `d:${kstDay(now)}`, 1, IP_DAILY_CHECKS);
    } catch { /* 아래 메모리 카운터로 */ }
  }
  return !memory(`${ip}|${kstDay(now)}`);
}

export const DAILY_LIMIT_ERROR = "daily_limit";
