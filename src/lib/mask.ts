import { extractEntities } from "@/engine/entities";

/**
 * 공개 화면의 연락처 가림 (율 #compliance 1791947465 조건 2, 테오 1791947472).
 * 전화번호는 앞 3자리·끝 4자리만(010-****-1234), 메신저 아이디·링크 경로는 앞 2자·끝 2자만. 관리자 화면은 가리지 않는다.
 */
export function maskContact(type: string, value: string): string {
  const v = value.trim();
  if (type === "phone") {
    const d = v.replace(/\D/g, "");
    return d.length >= 7 ? `${d.slice(0, 3)}-****-${d.slice(-4)}` : `****${d.slice(-2)}`;
  }
  if (type === "url") {
    const m = v.match(/^(?:https?:\/\/)?([^/]+)(\/.*)?$/i);
    if (!m) return maskId(v);
    // 경로가 있으면 도메인은 두고 경로를 가림(t.me/vi***om), 경로 없는 일반 도메인은 도메인을 가림(sc***yz) — 카이 948d5a7
    return m[2] && m[2].length > 1 ? `${m[1]}/${maskId(m[2].slice(1))}` : maskId(m[1]);
  }
  return maskId(v.replace(/^@/, ""));
}

function maskId(s: string): string {
  if (s.length <= 4) return `${s.slice(0, 1)}***`;
  return `${s.slice(0, 2)}***${s.slice(-2)}`;
}

export type MaskPair = [string | RegExp, string];

/** 문자열 안의 원값들을 가린 값으로 바꾼다(대소문자 무시). 긴 값부터 — 짧은 값이 긴 값의 일부를 먼저 바꾸지 않게. RegExp 는 그대로(g 필요) */
export function maskText(text: string, pairs: MaskPair[]): string {
  let out = text;
  const len = (p: MaskPair) => (typeof p[0] === "string" ? p[0].length : 1000);
  for (const [raw, masked] of [...pairs].sort((a, b) => len(b) - len(a))) {
    if (typeof raw === "string") {
      if (!raw || raw.length < 3) continue;
      out = out.replace(new RegExp(raw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi"), masked);
    } else out = out.replace(raw, masked);
  }
  return out;
}

/** 전화번호 원문 표기 변형(공백·하이픈·점·괄호, +82 / 0 앞자리)까지 잡는 정규식 */
export function phonePattern(digits: string): RegExp {
  const d = digits.replace(/^82/, "0");
  const body = (d.startsWith("0") ? d.slice(1) : d).split("").join("[\\s.\\-()]*");
  return new RegExp(`\\(?(?:\\+?82[\\s.\\-()]*|0)?${body}`, "g");
}

/**
 * 이중 안전장치(테오 1791950296): 추출에 기대지 않고 공개 출력 직전에 한국 휴대전화·050 번호 꼴을 한 번 더 덮는다.
 * 괄호·공백·점·하이픈·+82·국번 0 생략 표기까지. 01x / 050x 로 시작하는 번호만 — 날짜·금액 같은 숫자는 건드리지 않는다.
 */
const PHONE_ANYWHERE = [
  /(?<![0-9])(?:\+\s*82[\s.\-()]*|\(?\s*0)?\(?1[016789]\)?[\s.\-]*\d{3,4}[\s.\-]*\d{4}(?![0-9])/g,
  /(?<![0-9])\(?050\d\)?[\s.\-]*\d{3,4}[\s.\-]*\d{4}(?![0-9])/g,
];
export function maskPhonesAnywhere(text: string): string {
  let out = text;
  for (const re of PHONE_ANYWHERE) out = out.replace(re, (m) => {
    let d = m.replace(/\D/g, "");
    if (d.startsWith("82")) d = "0" + d.slice(2);
    if (!d.startsWith("0")) d = "0" + d;
    return d.length >= 10 ? `${d.slice(0, 3)}-****-${d.slice(-4)}` : m;
  });
  return out;
}

/** 객체 안의 모든 문자열에 maskText(+ 번호 꼴 덮기)를 적용한 복사본 */
export function maskDeep<T>(value: T, pairs: MaskPair[], skipKeys: string[] = []): T {
  if (typeof value === "string") return maskPhonesAnywhere(maskText(value, pairs)) as T;
  if (Array.isArray(value)) return value.map((x) => maskDeep(x, pairs, skipKeys)) as T;
  if (value && typeof value === "object" && !(value instanceof Date)) {
    return Object.fromEntries(Object.entries(value).map(([k, x]) => [k, skipKeys.includes(k) ? x : maskDeep(x, pairs, skipKeys)])) as T;
  }
  return value;
}

/** 연락처 목록 → 가림 짝. 원값 + 원문 표기 변형(전화: 공백·하이픈·점·괄호·+82, 링크: 프로토콜·www) */
export function contactPairs(contacts: { type: string; value: string }[]): MaskPair[] {
  const pairs: MaskPair[] = [];
  for (const c of contacts) {
    const masked = maskContact(c.type, c.value);
    pairs.push([c.value, masked]);
    if (c.type === "phone") {
      const d = c.value.replace(/\D/g, "");
      if (d.length >= 7) pairs.push([phonePattern(d), masked]);
    }
    if (c.type === "url") pairs.push([new RegExp(`(?:https?:\\/\\/)?(?:www\\.)?${c.value.replace(/^(?:https?:\/\/)?(?:www\.)?/i, "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "gi"), masked]);
  }
  return pairs;
}

/** 이메일 → 첫 글자와 최상위 도메인만(a***@g***.com) — "이메일이 있다"는 꼴은 남긴다 */
export function maskEmail(v: string): string {
  const [local, domain = ""] = v.split("@");
  const tld = domain.includes(".") ? domain.slice(domain.lastIndexOf(".")) : "";
  return `${local.slice(0, 1)}***@${domain.slice(0, 1)}***${tld}`;
}

/**
 * 계좌번호 꼴 — (1) 하이픈 3~4 묶음에 숫자 10~16자리(날짜 2024-09-08 은 8자리라 제외, 가린 전화번호는 * 가 있어 제외)
 * (2) '계좌·은행·입금·account' 바로 뒤의 붙은 숫자 10~16자리. 끝 4자리만 남긴다.
 */
const ACCOUNT_HYPHEN = /(?<![\d-])\d{2,6}-\d{2,6}-\d{2,8}(?:-\d{1,4})?(?![\d-])/g;
const BANKS = "국민|신한|우리|하나|농협|기업|카카오뱅크|카뱅|토스뱅크|토스|케이뱅크|K뱅크|IBK|NH|KB|SC제일|제일|씨티|수협|새마을|신협|우체국|부산|대구|경남|광주|전북|제주|산업|저축";
const ACCOUNT_LABELED = new RegExp(`((?:계좌|은행|입금|예금주|${BANKS}|account|acct|iban)[^\\d\\n]{0,15})(\\d{10,16})(?!\\d)`, "gi");
/** 라벨이 없어도 10~16자리로 붙은 숫자(휴대전화 꼴 제외)는 계좌·카드번호일 수 있어 가린다 — 판정에는 '긴 번호가 있다'만 필요(카이 1001f5d HOLD: "신한 110123456789") */
const LONG_DIGITS = /(?<![\d*])\d{10,16}(?![\d*])/g;
export function maskAccountNumbers(text: string): string {
  return text
    .replace(ACCOUNT_LABELED, (_m, pre: string, d: string) => `${pre}***-****-${d.slice(-4)}`)
    .replace(ACCOUNT_HYPHEN, (m) => {
      const d = m.replace(/\D/g, "");
      if (/^01[016789]\d{7,8}$/.test(d) || /^050\d{8,9}$/.test(d)) return m;   // 휴대전화·050 꼴은 아래 전화 가림이 맡는다(010-****-5678 꼴 유지)
      return d.length >= 10 && d.length <= 16 ? `***-****-${d.slice(-4)}` : m;
    })
    .replace(LONG_DIGITS, (d) => (/^01[016789]\d{7,8}$/.test(d) || /^050\d{8,9}$/.test(d) ? d : `***-****-${d.slice(-4)}`));
}

/**
 * AI 로 보내기 전 가림(율 국내 배포 점검 ⑦, 테오 1791955154 → 1791955875): 글 속 전화번호(휴대·050·일반·대표)·계좌번호·이메일.
 * 판정에 필요한 건 "번호가 있다"는 사실이지 번호 자체가 아니다 — 꼴(010-****-5678, ***-****-1234, a***@g***.com)은 남긴다.
 * 전화는 공개 화면과 같은 규칙(contactPairs + maskPhonesAnywhere). 메신저 아이디·링크는 판정 신호라 그대로.
 */
/**
 * 일반 전화(지역번호 02·031~064, 인터넷전화 070)와 대표번호(15xx·16xx·18xx) — AI 전송용(율 (가)안, 테오 1791956124). 끝 4자리만 남긴다.
 * 숫자나 '숫자 사이의 쉼표·점'(금액 1,500 · 소수 3.14)에 붙은 경우는 건드리지 않는다. 문장 끝 쉼표·마침표는 괜찮다.
 */
const LANDLINE = /(?<!\d)(?<!\d[,.])\(?0(?:2|[3-6][1-5]|70)\)?[\s.\-]*\d{3,4}[\s.\-]*(\d{4})(?!\d)(?![,.]\d)/g;
const REPRESENTATIVE = /(?<!\d)(?<!\d[,.])1[568]\d{2}[\s.\-]?(\d{4})(?!\d)(?![,.]\d)/g;
export function maskLandlines(text: string): string {
  return text.replace(LANDLINE, (_m, last: string) => `0**-****-${last}`).replace(REPRESENTATIVE, (_m, last: string) => `****-${last}`);
}

export function maskForAi(text: string): string {
  const ents = extractEntities(text);
  const pairs: MaskPair[] = [
    ...contactPairs(ents.filter((e) => e.type === "phone")),
    ...ents.filter((e) => e.type === "email").map((e): MaskPair => [e.value, maskEmail(e.value)]),
  ];
  // 순서: 계좌(라벨 붙은 것 먼저, 휴대전화 꼴 제외) → 뽑은 전화·이메일 → 남은 휴대전화 꼴.
  // 계좌를 먼저 덮어야 '계좌 110123456789'가 엔티티 추출에서 전화번호로 잡혀 010-… 꼴로 바뀌지 않는다
  // 마지막에 일반·대표번호 — 휴대전화(01x)·050 은 앞에서 이미 가려져 * 가 섞여 있어 여기 걸리지 않는다
  return maskLandlines(maskPhonesAnywhere(maskText(maskAccountNumbers(text), pairs)));
}
