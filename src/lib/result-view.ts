import { entityId, extractEntities } from "@/engine/entities";
import { categoryOf } from "@/engine/explain";
import { normalize } from "@/engine/normalize";
import { receivedActionSignals } from "@/engine/tactics";
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
export type SignId = "guarantee" | "withdrawal" | "secrecy" | "appInstall" | "familyNewNumber" | "deliveryLink" | "loanFee" | "sideJob"
  | "conversion" | "telegram" | "chatRoom" | "impersonation" | "evidence" | "spreadAccounts" | "sharedContact" | "repeatSelf" | "normalization" | "identity" | "fallback";
/** 받은 메시지 수법(엔진 v2 tactic:*)은 돈이 바로 나가는 단계라 앞에 둔다 */
export const SIGN_ORDER: SignId[] = ["guarantee", "withdrawal", "secrecy", "appInstall", "familyNewNumber", "deliveryLink", "loanFee", "sideJob",
  "conversion", "telegram", "chatRoom", "impersonation", "evidence", "spreadAccounts", "sharedContact", "repeatSelf", "normalization", "identity"];

/**
 * 받은 메시지 문장의 *행동 근거* — 엔진 tactic:* 는 수법의 단서일 뿐 문장이 말하는 사실 전부(돈 요구·발신자 주장·누르라는 요구 등)를
 * 입증하지 않는다(카이 60a5fbf HOLD, 테오 1791952640). 문장마다 그 문장이 말하는 행동을 글에서 따로 확인하고, 없으면 그 문장은 내지 않는다.
 * 판정(단계·점수)은 바꾸지 않는다 — 문장 선택만. 부정·면제 절("돈은 필요 없어", "no fee")은 행동 근거에서 뺀다.
 * 글이 없으면(계정 단위 집계 등) 이 문장들은 나가지 않는다(fail closed → 다른 징후나 일반 문장).
 */
const NEGATED = /(?:필요\s*(?:없|없어|없습)|안\s*(?:해도|보내도|내도|줘도)|않아도|하지\s*마|보내지\s*마|주지\s*마|내지\s*마|절대\s*(?:안|없)|없습니다|없어요|무료로)|\b(?:no need|don'?t (?:need|send|pay)|do not (?:need|send|pay)|never (?:ask|send|pay)|not (?:need|asking|required)|no (?:fee|money|payment|charge)|free of charge)\b/i;
/** 부정·면제 절을 뺀 본문 — 절 = 문장부호·줄바꿈·쉼표로 나눈 조각 */
function assertedText(text: string): string {
  return normalize(text).text.split(/[.!?\n,;·]+/).filter((c) => !NEGATED.test(c)).join(". ");
}
const PHONE_CHANGE = /새\s*번호|임시\s*(?:번호|폰)|번호\s*(?:바뀌|바꿨|변경)|(?:폰|핸드폰|휴대\s*(?:전화|폰)|액정)[^.!?\n]{0,12}(?:고장|깨|망가|수리|잃어|분실|침수)|\b(?:new (?:phone )?number|temporary (?:phone|number)|(?:phone|screen) (?:is |got |was )?(?:broken|damaged|cracked|lost)|(?:lost|broke|dropped) my phone)\b/i;
const ID_ASK = /신분증|주민등록증|운전\s*면허증|여권\s*사진|\b(?:id card|photo (?:of )?(?:your )?id|picture of (?:your )?id|passport|driver'?s licen[cs]e)\b/i;
/** 택배회사·관공서라는 *발신자 주장* — 배송 단어만으로는 아님 */
const SENDER_CLAIM = /(?:택배|배송|물류|통관|우체국|고객)\s*(?:센터|회사|팀|기사|안내|고객센터|입니다)|(?:cj\s*대한통운|대한통운|한진\s*택배|롯데\s*택배|로젠\s*택배|우체국\s*택배|쿠팡\s*(?:로지스|물류))|(?:(?:\S{0,4}지검|지청)\s*)?(?:수사관|조사관|검사)\s*입니다|(?:검찰|경찰|지검|금융감독원|금감원|국세청|법원|건강보험|도로공사|구청|시청|주민센터)(?:청|서)?\s*(?:입니다|에서|\s*(?:소속\s*)?(?:수사관|검사|담당자|직원|조사관|안내))|\b(?:usps|ups|fedex|dhl|royal mail|post office|postal service|customs office|irs|hmrc|toll (?:authority|service)|e-?zpass)\b|\b(?:this is|from|on behalf of)\b[^.!?\n]{0,25}\b(?:delivery|courier|shipping|post|government|police|tax|toll)\b/i;
const TAP_ASK = /(?:링크|주소|url|사이트)[^.!?\n]{0,25}(?:누르|눌러|클릭|접속|들어가|입력|결제|납부|확인\s*(?:하세요|해\s*주|바랍|요망))|(?:누르|눌러|클릭|접속|터치)\s*(?:하여|해서|해\s*주|하세요|해\s*줘|바랍|요망|하시)|\b(?:click|tap|visit|follow|open)\b[^.!?\n]{0,30}\b(?:link|here|below|url|site|page)\b|\b(?:update|confirm|pay|reschedule|verify)\b[^.!?\n]{0,30}\b(?:here|link|below|via|at)\b/i;
const CALL_ASK = /(?:전화|연락)\s*(?:주세요|하세요|바랍니다|요망|부탁|해\s*주|하시기|주시기)|\b(?:call|phone|contact)\s+(?:us|now|immediately|back|this number|\+?\d)/i;
const LOWER_RATE = /저금리|대환|낮은\s*(?:금리|이자)|싼\s*이자|이자\s*(?:를\s*)?(?:낮춰|줄여)|\b(?:low(?:er)?[- ]interest|lower (?:rate|payments?)|refinanc)/i;
const PAY_FIRST = /선납|수수료|보증금|(?:먼저|우선)[^.!?\n]{0,15}(?:상환|갚|입금|납부|송금|보내)|(?:상환|갚|입금|납부|송금)[^.!?\n]{0,15}(?:먼저|하셔야|해야|주셔야|하시면|해\s*주시)|\b(?:fee|prepay|upfront|pay (?:off|first)|repay (?:first|your)|deposit first)\b/i;
const LITTLE_WORK = /하루\s*\d+\s*(?:분|시간)|(?:간단|쉬운|단순)\s*(?:한\s*)?(?:작업|업무|일|알바|부업)|경험\s*(?:불필요|무관|없어도)|폰\s*하나로|좋아요[^.!?\n]{0,10}(?:누르|만)|\b(?:\d+ (?:minutes?|hours?) (?:a|per) day|simple (?:tasks?|work)|easy (?:tasks?|work)|no (?:experience|skills?)|just (?:like|rate|review)|from your phone)\b/i;
const BIG_MONEY = /고수익|고액|일당\s*[\d,]+|하루\s*[\d,]+\s*(?:만\s*)?원|(?:월|주)\s*[\d,]+\s*만|\d+\s*만\s*원\s*(?:이상|까지|보장)|\b(?:high[- ]paying|easy money|earn (?:up to )?[$£€]?\s?\d|[$£€]\s?\d[\d,]*\s*(?:a|per) (?:day|week|hour)|daily pay)\b/i;

/** 근거 코드 → 어휘 범주(contact·invest·profit·urgency·link·free·impersonate). 영어 엔진 코드는 `term:en:<범주>:…` */
function catOf(code: string): string {
  const en = code.match(/^term:en:([a-z]+):/);
  return en ? en[1] : categoryOf(code);
}

/**
 * 쉬운 말 징후 — 문장마다 그 문장을 말할 수 있는 *실제 신호*를 묶는다(율: 징후 = 그 글에서 찾은 사실, 카이·테오 1791947403).
 * reasons = 엔진 근거(내부 코드 포함, 서버·브라우저 안에서만), entityTypes = 글에서 뽑은 연락처 종류, text = 그 글(받은 메시지 문장의 행동 근거용). 최대 3개.
 * 높음·중간인데 아무 문장도 해당하지 않으면 일반 문장 하나. 낮음은 징후 칸 자체가 없다(빈 목록, 테오 1791948314).
 */
export function signIds(level: Level, reasons: { code?: string; points: number }[], entityTypes: string[], text: string | null = null): SignId[] {
  const said = text ? assertedText(text) : "";
  const act = said ? receivedActionSignals(said) : null;
  const pos = reasons.filter((r) => r.points > 0 && r.code).map((r) => r.code as string);
  const has = (f: (c: string) => boolean) => pos.some(f);
  // "오라고 해요"는 엔진이 *이동 유도*를 실제로 잡았고(행동 유도·메신저+투자 결합) 인용·피해 경고 맥락이 아닐 때만(카이 948d5a7, 테오 1791949422)
  // 엔진 v2: veto:scoped-context(인용·부정 범위) 도 인용 맥락. combo:received*(받은 메시지 금전 요구 결합)는 "다른 방 이동"의 근거가 아니다
  const quoted = reasons.some((r) => r.code === "veto:quote" || r.code === "veto:victim" || r.code === "veto:scoped-context");
  const movesYou = !quoted && has((c) => c === "cta" || c === "combo:triple" || c.startsWith("combo:contact"));
  const found: Record<SignId, boolean> = {
    guarantee: has((c) => GUARANTEE_CODES.includes(c)),
    // 받은 메시지 수법 — 엔진이 그 수법을 실제로 찾았을 때만(율 #compliance 1791951936)
    withdrawal: has((c) => c === "tactic:withdrawal"),
    secrecy: has((c) => c === "tactic:secrecy"),
    appInstall: has((c) => c === "tactic:install"),
    // 가족 문장 = 새 번호·폰 고장 주장 *그리고* 돈·상품권·신분증 요구(부정 절 제외)
    familyNewNumber: has((c) => c === "tactic:family") && PHONE_CHANGE.test(said) && (!!act?.money || ID_ASK.test(said)),
    // 택배·기관이라며 링크·전화 — 사칭 수법 + 발신자 주장 + (비공식 링크와 누르라는 요구 | 전화번호와 전화하라는 요구).
    // 문장에는 회사·기관 이름을 넣지 않는다(그 회사도 피해자)
    deliveryLink: has((c) => ["tactic:delivery", "tactic:authority", "tactic:toll", "tactic:grant"].includes(c)) && SENDER_CLAIM.test(said)
      && ((!!act?.link && entityTypes.includes("url") && TAP_ASK.test(said)) || (entityTypes.includes("phone") && CALL_ASK.test(said))),
    // 대출 문장 = 싼 이자·대환 제안 *그리고* 먼저 갚기·수수료 요구
    loanFee: has((c) => c === "tactic:loan") && LOWER_RATE.test(said) && PAY_FIRST.test(said),
    // 부업 문장 = 적은 노동 *그리고* 큰돈
    sideJob: has((c) => c === "tactic:task") && LITTLE_WORK.test(said) && BIG_MONEY.test(said),
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
