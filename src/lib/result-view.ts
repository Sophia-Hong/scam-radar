import { entityId, extractEntities } from "@/engine/entities";
import type { GroupCode, Level, Strings } from "./strings";

/**
 * 결과 첫 화면의 계산 — 화면 컴포넌트와 시험이 같이 쓴다.
 * 규칙은 여기서 새로 만들지 않는다: 단계(HIGH/REVIEW/LOW)와 신호군(signalGroups)은 엔진이 낸 것을 그대로 옮긴다.
 */

const GUARANTEE_CODES = ["term:원금보장", "term:손실보전", "term:확정수익", "term:확정지급", "term:en:profit:guaranteed"];   // 마지막 = 영어 엔진(theo/en-engine)

/**
 * 쉬운 말 징후 — 하나에 두 줄(사실 + 왜 조심하나), 게시물에 있는 사실로만 (율 #compliance 1791943988·1791944215).
 * 엔진이 실제로 찾은 것만: '원금 보장' 류 문구 → 맨 앞, 그다음 켜진 신호군을 엔진 순서대로. 다른 채팅방 이동은 텔레그램을
 * 실제로 찾았을 때만 텔레그램 문장, 아니면 "모르는 채팅방" 문장. 높음·중간인데 켜진 것이 없으면 일반 문장 하나. 최대 3개.
 */
export function plainSigns(level: Level, groups: { code: string; active: boolean }[], reasons: { code?: string; points: number }[], telegram: boolean, t: Strings["result"]): [string, string][] {
  const out: [string, string][] = [];
  if (reasons.some((r) => r.points > 0 && r.code && GUARANTEE_CODES.includes(r.code))) out.push(t.signGuarantee);
  for (const g of groups) {
    if (!g.active || !(g.code in t.signs)) continue;
    out.push(g.code === "infrastructure" && !telegram ? t.signChatRoom : t.signs[g.code as GroupCode]);
  }
  if (!out.length && level !== "LOW") out.push(t.signFallback);
  return out.slice(0, 3);
}

/** 글에서 텔레그램을 실제로 찾았나 — 연락처 키 또는 엔진 근거 코드 */
export function foundTelegram(keys: string[], reasons: { code?: string; points: number }[]): boolean {
  return keys.some((k) => k.startsWith("telegram:")) || reasons.some((r) => r.points > 0 && !!r.code && /텔레|telegram|tme/i.test(r.code));
}

const COMMUNITY_TYPES = new Set(["telegram", "kakao_open", "kakao_channel", "phone", "url", "line", "wechat", "handle"]);
export const MAX_KEYS = 5;

/** 신고 장부 조회·등록 키 — 확인한 Threads 계정 + 글 속 연락처·링크. 원문은 키에 들어가지 않는다 */
export function communityKeys(handle: string | null, text: string): string[] {
  const keys: string[] = [];
  if (handle) keys.push(`threads:${handle.toLowerCase()}`);
  for (const e of extractEntities(text)) {
    if (!COMMUNITY_TYPES.has(e.type)) continue;
    const k = entityId(e.type, e.value);
    if (!keys.includes(k)) keys.push(k);
  }
  return keys.slice(0, MAX_KEYS);
}

/** 키 → 사람이 읽는 한 줄 */
export function keyLabel(key: string, kinds: Record<string, string>): string {
  const i = key.indexOf(":");
  const type = key.slice(0, i);
  const value = key.slice(i + 1);
  return `${kinds[type] ?? type} ${type === "threads" || type === "handle" ? "@" : ""}${value}`;
}

/** 가족에게 보내는 링크 — 조회 키만(계정이면 a=, 아니면 연락처 k=). 원문·내 정보 없음 */
export function shareUrl(origin: string, handle: string | null, keys: string[]): string {
  const u = new URL("/", origin);
  if (handle) u.searchParams.set("a", handle.toLowerCase());
  else for (const k of keys.filter((k) => !k.startsWith("threads:")).slice(0, 3)) u.searchParams.append("k", k);
  u.hash = "check";
  return u.toString();
}
