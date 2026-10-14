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
    return m[2] && m[2].length > 1 ? `${m[1]}/${maskId(m[2].slice(1))}` : m[1];
  }
  return maskId(v.replace(/^@/, ""));
}

function maskId(s: string): string {
  if (s.length <= 4) return `${s.slice(0, 1)}***`;
  return `${s.slice(0, 2)}***${s.slice(-2)}`;
}

/** 문자열 안의 원값들을 가린 값으로 바꾼다(대소문자 무시). 긴 값부터 — 짧은 값이 긴 값의 일부를 먼저 바꾸지 않게 */
export function maskText(text: string, pairs: [string, string][]): string {
  let out = text;
  for (const [raw, masked] of [...pairs].sort((a, b) => b[0].length - a[0].length)) {
    if (!raw || raw.length < 3) continue;
    out = out.replace(new RegExp(raw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi"), masked);
  }
  return out;
}

/** 객체 안의 모든 문자열에 maskText 를 적용한 복사본 */
export function maskDeep<T>(value: T, pairs: [string, string][], skipKeys: string[] = []): T {
  if (typeof value === "string") return maskText(value, pairs) as T;
  if (Array.isArray(value)) return value.map((x) => maskDeep(x, pairs, skipKeys)) as T;
  if (value && typeof value === "object" && !(value instanceof Date)) {
    return Object.fromEntries(Object.entries(value).map(([k, x]) => [k, skipKeys.includes(k) ? x : maskDeep(x, pairs, skipKeys)])) as T;
  }
  return value;
}

/** 연락처 목록 → 가림 짝. 전화번호는 숫자만·하이픈 형태도 함께 */
export function contactPairs(contacts: { type: string; value: string }[]): [string, string][] {
  const pairs: [string, string][] = [];
  for (const c of contacts) {
    const masked = maskContact(c.type, c.value);
    pairs.push([c.value, masked]);
    if (c.type === "phone") {
      const d = c.value.replace(/\D/g, "");
      pairs.push([d, masked]);
      if (d.length === 11) pairs.push([`${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}`, masked]);
    }
  }
  return pairs;
}
