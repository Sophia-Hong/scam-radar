import { entityId, extractEntities } from "@/engine/entities";
import { categoryOf } from "@/engine/explain";
import { maskContact } from "./mask";
import type { Level, Strings } from "./strings";

/**
 * 결과 첫 화면의 계산 — 화면 컴포넌트와 시험이 같이 쓴다.
 * 규칙은 여기서 새로 만들지 않는다: 단계(HIGH/REVIEW/LOW)와 근거는 엔진이 낸 것을 그대로 옮기고, 문장만 고른다.
 */

const GUARANTEE_CODES = ["guarantee:illegal", "term:원금보장", "term:손실보전", "term:확정수익", "term:확정지급", "term:en:profit:guaranteed"];   // 마지막 = 영어 엔진(theo/en-engine)
const EVIDENCE_CODES = ["term:사원증", "term:급여명세", "term:명세서", "term:재직증명"];
/** 채팅방 문장은 글에서 메신저 링크·아이디를 실제로 뽑았을 때만 — 일반 링크·프로필 링크는 문장 없음 (테오 1791947403) */
const CHAT_ENTITY_TYPES = ["kakao_open", "kakao_channel", "whatsapp", "line", "wechat", "signal"];

/** 화면 문장 id — 규칙 코드가 아니라 문장 목록의 자리. 공개 응답에는 이 id 만 나간다 */
export type SignId = "guarantee" | "conversion" | "telegram" | "chatRoom" | "impersonation" | "evidence" | "spreadAccounts" | "sharedContact" | "repeatSelf" | "normalization" | "identity" | "fallback";
export const SIGN_ORDER: SignId[] = ["guarantee", "conversion", "telegram", "chatRoom", "impersonation", "evidence", "spreadAccounts", "sharedContact", "repeatSelf", "normalization", "identity"];

/** 근거 코드 → 어휘 범주(contact·invest·profit·urgency·link·free·impersonate). 영어 엔진 코드는 `term:en:<범주>:…` */
function catOf(code: string): string {
  const en = code.match(/^term:en:([a-z]+):/);
  return en ? en[1] : categoryOf(code);
}

/**
 * 쉬운 말 징후 — 문장마다 그 문장을 말할 수 있는 *실제 신호*를 묶는다(율: 징후 = 그 글에서 찾은 사실, 카이·테오 1791947403).
 * reasons = 엔진 근거(내부 코드 포함, 서버·브라우저 안에서만), entityTypes = 글에서 뽑은 연락처 종류. 최대 3개.
 * 높음·중간인데 아무 문장도 해당하지 않으면 일반 문장 하나. 낮음은 징후 칸 자체가 없다(빈 목록, 테오 1791948314).
 */
export function signIds(level: Level, reasons: { code?: string; points: number }[], entityTypes: string[]): SignId[] {
  const pos = reasons.filter((r) => r.points > 0 && r.code).map((r) => r.code as string);
  const has = (f: (c: string) => boolean) => pos.some(f);
  // "오라고 해요"는 엔진이 *이동 유도*를 실제로 잡았고(행동 유도·메신저+투자 결합) 인용·피해 경고 맥락이 아닐 때만(카이 948d5a7, 테오 1791949422)
  const quoted = reasons.some((r) => r.code === "veto:quote" || r.code === "veto:victim");
  const movesYou = !quoted && has((c) => c === "cta" || c.startsWith("combo:"));
  const found: Record<SignId, boolean> = {
    guarantee: has((c) => GUARANTEE_CODES.includes(c)),
    conversion: has((c) => ["profit", "free", "invest"].includes(catOf(c)) && c.startsWith("term:")) && has((c) => c === "cta" || (c.startsWith("term:") && catOf(c) === "urgency")),
    telegram: movesYou && entityTypes.includes("telegram"),
    chatRoom: movesYou && !entityTypes.includes("telegram") && entityTypes.some((t) => CHAT_ENTITY_TYPES.includes(t)),
    impersonation: has((c) => c.startsWith("impersonate:")),
    evidence: has((c) => c.startsWith("evidence:") || c.startsWith("term:en:evidence:") || EVIDENCE_CODES.includes(c)),
    spreadAccounts: has((c) => c === "spread"),          // 서로 다른 계정의 근사 중복 묶음(MinHash)
    sharedContact: has((c) => c === "shared-contact"),   // 다른 계정과 연락처만 겹침
    repeatSelf: has((c) => c === "cluster"),   // 같은 계정의 근사 중복 반복. spray(여러 원글에 댓글)는 같은 글이라는 보장이 없어 문장 없음(카이 948d5a7)
    normalization: has((c) => c === "obfuscation"),
    identity: has((c) => c.startsWith("identity:")),
    fallback: false,
  };
  if (level === "LOW") return [];
  const out = SIGN_ORDER.filter((id) => found[id]).slice(0, 3);
  return out.length ? out : ["fallback"];
}

export const signTexts = (ids: SignId[], t: Strings["result"]): [string, string][] => ids.map((id) => t.signs[id]);

const COMMUNITY_TYPES = new Set(["telegram", "kakao_open", "kakao_channel", "phone", "url", "line", "wechat", "whatsapp", "signal", "handle"]);   // email 은 신고 키로 쓰지 않음(개인 주소일 수 있음)
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
  // 확인한 Threads 계정은 그대로, 연락처·링크는 가려서 (율 1791947465 조건 2)
  return `${kinds[type] ?? type} ${type === "threads" ? `@${value}` : maskContact(type, value)}`;
}

/**
 * 소중한 사람에게 보내는 링크 — 확인한 Threads 계정(a=)만. 연락처·링크 키는 싣지 않는다: 원값이 링크·브라우저 기록에 남고(카이 948d5a7),
 * 글 없이 연락처만으로는 엔진 판정이 없어 신고 수도 보이지 않으므로(교차 확인) 실을 이유가 없다. 원문·내 정보 없음.
 */
export function shareUrl(origin: string, handle: string | null): string {
  const u = new URL("/", origin);
  if (handle) u.searchParams.set("a", handle.toLowerCase());
  u.hash = "check";
  return u.toString();
}
