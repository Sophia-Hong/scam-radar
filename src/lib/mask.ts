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

/** 객체 안의 모든 문자열에 maskText 를 적용한 복사본 */
export function maskDeep<T>(value: T, pairs: MaskPair[], skipKeys: string[] = []): T {
  if (typeof value === "string") return maskText(value, pairs) as T;
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
