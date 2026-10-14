import { entityId, extractEntities } from "@/engine/entities";
import type { GroupCode, Level, Strings } from "./strings";

/**
 * 결과 첫 화면의 계산 — 화면 컴포넌트와 시험이 같이 쓴다.
 * 규칙은 여기서 새로 만들지 않는다: 단계(HIGH/REVIEW/LOW)와 신호군(signalGroups)은 엔진이 낸 것을 그대로 옮긴다.
 */

/** 이유 한 줄 — 켜진 신호군 이름을 엔진 순서대로 최대 2개 */
export function oneLineReason(level: Level, groups: { code: string; active: boolean }[], hasPositive: boolean, t: Strings["result"]): string {
  const names = groups.filter((g) => g.active && g.code in t.groups).map((g) => t.groups[g.code as GroupCode]).slice(0, 2);
  if (names.length) return names.join(t.joiner);
  if (level === "LOW" || !hasPositive) return t.whyNone;
  return t.whyFallback;
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
