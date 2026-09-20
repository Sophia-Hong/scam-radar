/**
 * 한글 초성 처리.
 * 핵심: 사용자가 입력하는 'ㅌ'는 U+314C(호환 자모), '텔'을 분해한 초성은 U+1110(결합 자모).
 * 두 블록이 달라 그대로 비교하면 절대 안 맞는다. NFKD 로 호환 자모 → 결합 자모로 통일한다.
 */

const COMPAT_JAMO = /[ㄱ-ㆎ]/; // ㄱ..ㆎ
const SYLLABLE = /[가-힣]/;
const CHOSEONG_START = 0x1100;

/** 문자 하나의 초성(결합 자모 U+1100~)을 반환. 초성이 없는 문자는 null */
export function choseongOf(ch: string): string | null {
  const code = ch.codePointAt(0)!;
  if (code >= 0xac00 && code <= 0xd7a3) {
    const idx = Math.floor((code - 0xac00) / 588);
    return String.fromCodePoint(CHOSEONG_START + idx);
  }
  if (COMPAT_JAMO.test(ch)) {
    const c = ch.normalize("NFKD").codePointAt(0)!;
    // 호환 자음(ㄱ~ㅎ)은 NFKD 시 U+1100~1112 초성으로 감. 모음은 U+1161~ 중성 → 초성 아님
    if (c >= 0x1100 && c <= 0x1112) return String.fromCodePoint(c);
    return null;
  }
  return null;
}

/** 문자열의 초성열. 초성이 없는 문자는 건너뜀 */
export function choseongSeq(s: string): string {
  let out = "";
  for (const ch of s) {
    const c = choseongOf(ch);
    if (c) out += c;
  }
  return out;
}

/** 텍스트에 호환 자모(사용자가 직접 친 초성)가 포함돼 있는지 */
export function hasCompatJamo(s: string): boolean {
  return COMPAT_JAMO.test(s);
}

/**
 * 초성이 섞인 한글 토큰들을 추출.
 * "ㅌㄹㄱㄹ 방 입장" → ["ㅌㄹㄱㄹ"], "텔ㄹㄱㄹ" → ["텔ㄹㄱㄹ"]
 * 초성이 하나도 없는 순수 음절 토큰은 제외 → "특별 라운지" 같은 오탐 방지.
 */
export function jamoMixedTokens(s: string): string[] {
  const tokens: string[] = [];
  let cur = "";
  let hasJamo = false;
  const flush = () => {
    if (cur.length >= 2 && hasJamo) tokens.push(cur);
    cur = ""; hasJamo = false;
  };
  for (const ch of s) {
    if (SYLLABLE.test(ch) || COMPAT_JAMO.test(ch)) {
      cur += ch;
      if (COMPAT_JAMO.test(ch)) hasJamo = true;
    } else flush();
  }
  flush();
  return tokens;
}
