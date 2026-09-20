import { normalize } from "./normalize";

/**
 * 연락처 엔티티 추출.
 *
 * PIP 논문(arXiv 2404.07797)에서 가장 정밀도가 높은 신호는 **공유된 연락 수단**이다.
 * 어휘("텔레그램")는 흔하지만, 같은 `t.me/vip_room` 을 쓰는 두 계정은 거의 항상 같은 운영자다.
 * 그래서 여기서는 "메신저를 언급했는가"가 아니라 "어느 방으로 오라고 했는가"를 뽑는다.
 *
 * 난독화 대응: 원문뿐 아니라 normalize() 결과, 그리고 구분자 주변 공백을 지운 변형까지
 * 같은 패턴으로 훑는다. (Ｔеlеgrаm / t . me / xxx / 텔레 아이디 : vip_room)
 */

export type EntityType =
  | "telegram"
  | "kakao_open"
  | "kakao_channel"
  | "phone"
  | "handle"
  | "url"
  | "line"
  | "wechat";

export type EntitySource = "text" | "bio" | "externalUrl";

export interface Entity {
  type: EntityType;
  /** 정규화 값: 소문자, @·프로토콜·후행 구두점 제거 */
  value: string;
  /** 매칭된 원본 조각 (증거용) */
  raw: string;
  source: EntitySource;
}

/** 이 타입들만 "같은 운영자" 근거로 쓴다. handle/url 은 너무 흔해서 약한 신호. */
export const STRONG_ENTITY_TYPES: EntityType[] = ["telegram", "kakao_open", "kakao_channel", "phone", "line", "wechat"];
const STRONG = new Set<EntityType>(STRONG_ENTITY_TYPES);

export function isStrongEntity(type: string): boolean {
  return STRONG.has(type as EntityType);
}

export const ENTITY_TYPE_LABEL: Record<EntityType, string> = {
  telegram: "텔레그램",
  kakao_open: "카카오 오픈채팅",
  kakao_channel: "카카오톡/채널",
  phone: "전화번호",
  handle: "핸들",
  url: "링크",
  line: "라인",
  wechat: "위챗",
};

export function entityId(type: string, value: string): string {
  return `${type}:${value}`;
}

/** 후행 구두점·괄호 제거. 값 안의 `_` `-` `.` 는 유지한다(핸들의 일부). */
function trimValue(s: string): string {
  return s
    .replace(/^[\s@<("'`‘“]+/, "")
    .replace(/[\s.,!?;:)\]}>"'`’”·…。．]+$/, "")
    .toLowerCase();
}

/** 프로토콜·www·후행 슬래시 제거 */
function stripUrl(s: string): string {
  return trimValue(s).replace(/^[a-z]+:\/\//, "").replace(/^www\./, "").replace(/\/+$/, "");
}

/** 한국 휴대·안심번호로 보이는 숫자열만 통과. 국가번호 82 는 0 으로 되돌린다. */
function normalizePhone(s: string): string | null {
  let d = s.replace(/\D/g, "");
  if (d.startsWith("82")) d = "0" + d.slice(2);
  if (/^1[016789]\d{7,8}$/.test(d)) d = "0" + d;
  if (/^0(1[016789]|50\d)\d{7,8}$/.test(d)) return d;
  return null;
}

/** 라틴 핸들에 흔히 붙는 꼬리말을 잘라낸다 (`@vip_room님`, `t.me/room으로`) */
function cutKoreanTail(s: string): string {
  return s.replace(/[가-힣]+$/, "");
}

const HANDLE = "[a-z0-9_][a-z0-9_.+-]{2,31}";
/** "텔레 아이디 :", "카톡 id", "라인 문의" 처럼 사이에 끼는 말 */
const SEP = "(?:\\s*(?:아이디|아디|id|계정|문의|주소|링크|방|채널|톡|:|：|=|>|→|▶|-)\\s*)*\\s*";

interface Rule {
  type: EntityType;
  re: RegExp;
  /** 캡처그룹 → 정규화 값. null 이면 버린다 */
  pick: (m: RegExpMatchArray) => string | null;
}

const RULES: Rule[] = [
  // ── 텔레그램 ──
  { type: "telegram", re: new RegExp(`(?:https?:\\/\\/)?(?:www\\.)?(?:t|telegram|tlgrm)\\s*\\.\\s*(?:me|em|dog)\\s*\\/\\s*(\\+?${HANDLE}|joinchat\\/[a-z0-9_-]+)`, "gi"), pick: (m) => trimValue(cutKoreanTail(m[1])) || null },
  { type: "telegram", re: new RegExp(`(?:텔레그램|텔레그렘|텔레방|텔방|텔레|텔그|telegram|tele|tg)${SEP}@?(${HANDLE})`, "gi"), pick: (m) => pickHandle(m[1]) },

  // ── 카카오 오픈채팅 ──
  { type: "kakao_open", re: /(?:https?:\/\/)?(?:www\.)?open\s*\.\s*kakao\s*\.\s*com\s*\/\s*(o|me)\s*\/\s*([a-z0-9_-]{3,40})/gi, pick: (m) => `open.kakao.com/${m[1].toLowerCase()}/${trimValue(m[2])}` },
  { type: "kakao_open", re: /(?:오픈채팅|오픈카톡|오픈톡|옾챗|옵챗|openchat)(?:방)?(?:\s*(?:아이디|주소|링크|코드|:|：|=)\s*)+([a-z0-9_-]{4,40})/gi, pick: (m) => trimValue(cutKoreanTail(m[1])) || null },

  // ── 카카오톡 ID / 채널 (pf.kakao.com, "카톡 아이디 xxx", "카카오채널 xxx") ──
  { type: "kakao_channel", re: /(?:https?:\/\/)?(?:www\.)?pf\s*\.\s*kakao\s*\.\s*com\s*\/\s*(_?[a-z0-9_-]{3,40})/gi, pick: (m) => `pf.kakao.com/${trimValue(m[1])}` },
  { type: "kakao_channel", re: new RegExp(`(?:카카오채널|카카오톡채널|카톡채널|카카오톡|카카오|카톡|kakao|kakaotalk)${SEP}@?(${HANDLE})`, "gi"), pick: (m) => pickHandle(m[1]) },

  // ── 라인 ──
  { type: "line", re: new RegExp(`(?:https?:\\/\\/)?(?:www\\.)?line\\s*\\.\\s*me\\s*\\/(?:ti\\/p\\/|r\\/ti\\/p\\/)?~?(${HANDLE})`, "gi"), pick: (m) => trimValue(cutKoreanTail(m[1])) || null },
  { type: "line", re: new RegExp(`(?:라인친추|라인아이디|라인|line)${SEP}@?(${HANDLE})`, "gi"), pick: (m) => pickHandle(m[1]) },

  // ── 위챗 ──
  { type: "wechat", re: new RegExp(`(?:위챗|웨이신|wechat|weixin)${SEP}@?(${HANDLE})`, "gi"), pick: (m) => pickHandle(m[1]) },

  // ── 전화번호 ──
  { type: "phone", re: /(?<![0-9])(?:\+?82[\s.\-)]*)?0?1[016789][\s.\-]?\d{3,4}[\s.\-]?\d{4}(?![0-9])/g, pick: (m) => normalizePhone(m[0]) },
  { type: "phone", re: /(?<![0-9])050\d[\s.\-]?\d{3,4}[\s.\-]?\d{4}(?![0-9])/g, pick: (m) => normalizePhone(m[0]) },

  // ── 링크모음·단축 URL (약한 신호) ──
  { type: "url", re: /(?:https?:\/\/)?(?:www\.)?(linktr\.ee|litt\.ly|lit\.link|bit\.ly|han\.gl|vo\.la|url\.kr|buly\.kr|me2\.kr|tinyurl\.com)\s*\/\s*([a-z0-9_.-]{2,60})/gi, pick: (m) => stripUrl(`${m[1]}/${cutKoreanTail(m[2])}`) || null },
];

/** 약한 신호: 앞에 채널 단서가 없는 일반 @핸들 */
const GENERIC_HANDLE = new RegExp(`@(${HANDLE})`, "g");

/** 채널 단서 뒤에 붙었지만 실제로는 한국어 꼬리말만 남은 경우를 거른다 */
const STOP_HANDLES = new Set([
  "com", "net", "org", "www", "http", "https", "kakao", "kakaotalk", "telegram", "tele", "line", "wechat",
  "아이디", "id", "link", "open", "openchat", "chat", "channel", "me", "official",
]);

/** "t.me", "open.kakao.com" 처럼 도메인 조각이 핸들로 새는 것을 막는다 (URL 규칙이 따로 잡는다) */
const DOMAINISH = /\.(me|com|net|org|kr|jp|io|ly|ee|la|gl|dog|link|kakao|info|biz|cc|xyz)$/;

function pickHandle(s: string): string | null {
  const v = trimValue(cutKoreanTail(s));
  if (v.length < 3 || STOP_HANDLES.has(v)) return null;
  if (!/[a-z]/.test(v)) return null; // 숫자만 있는 조각은 핸들이 아니다
  if (DOMAINISH.test(v)) return null;
  return v;
}

/** normalize() 가 남기는 구분자 주변 공백을 지운 변형: "t . me / xxx" → "t.me/xxx" */
function despace(s: string): string {
  return s.replace(/\s*([.\-_/:@+])\s*/g, "$1");
}

/**
 * 초성 난독화된 채널 단서만 되돌린다. 점수 엔진의 초성 매칭과 달리 여기서는
 * "단서 바로 뒤에 붙은 아이디"를 잡는 게 목적이라 단서 토큰만 치환하면 충분하다.
 */
/** 호환 자모(사용자 입력)와 결합 자모(NFKC 결과) 둘 다 매칭되는 문자 클래스 */
const J: Record<string, string> = {
  ㄱ: "[ㄱᄀ]", ㄹ: "[ㄹᄅ]", ㅇ: "[ㅇᄋ]", ㅋ: "[ㅋᄏ]",
  ㅌ: "[ㅌᄐ]", ㅍ: "[ㅍᄑ]", ㅊ: "[ㅊᄎ]",
};
const j = (s: string) => s.replace(/[ㄱ-ㅎ]/g, (c) => J[c] ?? c);
const CHOSUNG_HINTS: [RegExp, string][] = [
  [new RegExp(`${j("ㅌㄹㄱㄹ")}|${j("ㅌㄹ")}(?=\\s*[@a-z])|${j("ㅌㄱ")}(?=\\s*[@a-z])`, "g"), "텔레그램"],
  [new RegExp(j("ㅇㅍㅊㅌ|ㅇㅍㅋㅌ"), "g"), "오픈채팅"],
  [new RegExp(`${j("ㅋㅋㅇㅌ")}|${j("ㅋㅌ")}(?=\\s*[@a-z])`, "g"), "카톡"],
  [new RegExp(`${j("ㄹㅇ")}(?=\\s*[@a-z])`, "g"), "라인"],
];
function deobfuscateChosung(s: string): string {
  let out = s;
  for (const [re, word] of CHOSUNG_HINTS) out = out.replace(re, word);
  return out;
}

function scan(input: string, source: EntitySource, out: Map<string, Entity>) {
  if (!input) return;
  const n = normalize(input);
  const cs = deobfuscateChosung(n.text);
  const csRaw = deobfuscateChosung(input.toLowerCase());
  const variants = [input, n.text, despace(input), despace(n.text), cs, despace(cs), csRaw, despace(csRaw)];
  const seenVariant = new Set<string>();

  for (const v of variants) {
    if (!v || seenVariant.has(v)) continue;
    seenVariant.add(v);
    for (const rule of RULES) {
      rule.re.lastIndex = 0;
      for (const m of v.matchAll(rule.re)) {
        const value = rule.pick(m);
        if (!value) continue;
        add(out, { type: rule.type, value, raw: m[0].trim(), source });
      }
    }
    // 일반 @핸들 — 위에서 강한 타입으로 이미 잡힌 값은 넣지 않는다
    GENERIC_HANDLE.lastIndex = 0;
    for (const m of v.matchAll(GENERIC_HANDLE)) {
      const value = pickHandle(m[1]);
      if (!value) continue;
      add(out, { type: "handle", value, raw: m[0].trim(), source });
    }
  }
}

function add(out: Map<string, Entity>, e: Entity) {
  const k = entityId(e.type, e.value);
  if (!out.has(k)) out.set(k, e);
}

export interface EntityAuthor {
  bio?: string | null;
  externalUrl?: string | null;
}

/**
 * 본문 + (있으면) 프로필 bio·외부링크에서 연락처 엔티티를 뽑는다.
 * 같은 type+value 는 한 번만 반환하며, 강한 타입으로 잡힌 값은 generic handle 로 중복되지 않는다.
 */
export function extractEntities(rawText: string, author?: EntityAuthor | null): Entity[] {
  const out = new Map<string, Entity>();
  scan(rawText ?? "", "text", out);
  if (author?.bio) scan(author.bio, "bio", out);
  if (author?.externalUrl) scan(author.externalUrl, "externalUrl", out);

  const strongValues = new Set<string>();
  for (const e of out.values()) if (STRONG.has(e.type)) strongValues.add(e.value);

  return [...out.values()]
    .filter((e) => !(e.type === "handle" && strongValues.has(e.value)))
    .sort((a, b) => Number(STRONG.has(b.type)) - Number(STRONG.has(a.type)) || a.type.localeCompare(b.type) || a.value.localeCompare(b.value));
}

/** 계정 간 연결에 쓰는 엔티티만 */
export function strongEntities(list: Entity[]): Entity[] {
  return list.filter((e) => STRONG.has(e.type));
}

/** "텔레그램 vip_room" 처럼 사람이 읽는 한 줄 */
export function entityLabel(type: string, value: string): string {
  return `${ENTITY_TYPE_LABEL[type as EntityType] ?? type} ${value}`;
}
