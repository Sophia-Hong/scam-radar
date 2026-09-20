import { CONFUSABLES, DIGIT_LOOKALIKES } from "./confusables";

/**
 * 정규화 파이프라인 (UTS #39 skeleton 순서를 따름):
 *   NFD → 결합기호 제거 → 혼동문자 폴딩 → NFKC → 소문자 → 제로폭/구분자 제거
 * NFKC를 혼동문자 폴딩 *뒤에* 두는 이유: 'ſ'는 confusables에선 f, NFKC에선 s 로 가는 등
 * 두 맵의 의도가 달라 NFKC를 먼저 돌리면 혼동문자 맵이 그 문자를 못 본다.
 */

const ZERO_WIDTH = /[​-‏⁠-⁤﻿­︀-️᠎]/g;
const COMBINING = /\p{M}+/gu;
// 글자 사이에 끼워 넣는 구분자: 텔.레.그.램 / 텔_레_그_램 / 텔·레·그·램 / 텔 레 그 램
const SEPARATORS = /[\s.\-_*·•・‧ㆍ,~/\\|:;'"`^+=<>()\[\]{}!?]+/g;
const LATIN = /[a-z]/;

export interface Normalized {
  /** 원문 */
  raw: string;
  /** 공백 1칸으로 정리된 정규화 텍스트 (shingle·표시용) */
  text: string;
  /** 공백·구분자 전부 제거한 형태 (키워드 매칭용) */
  compact: string;
  /** 정규화 과정에서 바뀐 문자 비율 0~1 — 난독화 강도 지표 */
  obfuscationRatio: number;
  /** 사용된 난독화 기법 */
  techniques: string[];
}

export function normalize(raw: string): Normalized {
  const techniques = new Set<string>();
  let s = raw.normalize("NFD");

  const beforeMarks = s.length;
  s = s.replace(COMBINING, (m) => {
    // 한글 결합 자모는 \p{M} 이 아니므로 안전. 라틴 diacritic만 제거됨
    return "";
  });
  if (s.length !== beforeMarks) techniques.add("diacritics");

  // 혼동문자 폴딩 (문자 단위)
  const chars = Array.from(s);
  let folded = 0;
  for (let i = 0; i < chars.length; i++) {
    const c = chars[i];
    if (DIGIT_LOOKALIKES.has(c)) {
      // 숫자/기호 → 문자 치환은 라틴 문자 사이에 끼어 있을 때만 (te1egram O, 300% X)
      const prev = chars[i - 1]?.toLowerCase() ?? "";
      const next = chars[i + 1]?.toLowerCase() ?? "";
      if (LATIN.test(prev) && LATIN.test(next)) {
        chars[i] = CONFUSABLES[c];
        folded++;
        techniques.add("leet");
      }
      continue;
    }
    const f = CONFUSABLES[c];
    if (f !== undefined && f !== c) {
      chars[i] = f;
      folded++;
      techniques.add("homoglyph");
    }
  }
  s = chars.join("");

  // NFKC: 전각·원문자·수학기호·호환자모 등 통합
  // NFD 상태와 비교하면 한글 재조합 때문에 항상 다르므로 NFC 기준과 비교
  const nfc = s.normalize("NFC");
  s = s.normalize("NFKC");
  if (s !== nfc) techniques.add(/[\u3131-\u318E]/.test(raw) ? "chosung" : "compat-forms");

  s = s.toLowerCase();

  const beforeZw = s.length;
  s = s.replace(ZERO_WIDTH, "");
  if (s.length !== beforeZw) techniques.add("zero-width");

  const text = s.replace(/\s+/g, " ").trim();
  const compact = text.replace(SEPARATORS, "");

  // 구분자 삽입 난독화: 한글/라틴 글자 사이에 구분자가 반복적으로 끼어 있는지
  if (/([가-힣a-z][.\-_*·•・‧ㆍ]){3,}/.test(text)) techniques.add("separator-insert");

  // 변화량: 원문 compact 대비 정규화 compact 의 문자 차이 비율
  const rawCompact = raw.toLowerCase().replace(/\s+/g, "").replace(SEPARATORS, "");
  const changed = folded + Math.abs(rawCompact.length - compact.length);
  const obfuscationRatio = compact.length === 0 ? 0 : Math.min(1, changed / Math.max(compact.length, 1));

  return { raw, text, compact, obfuscationRatio, techniques: [...techniques] };
}

/** 정확 중복 판정용 해시 키 (compact 기준) */
export function exactKey(compact: string): string {
  return fnv1a64(compact);
}

export function fnv1a64(str: string): string {
  let h1 = 0x811c9dc5, h2 = 0x01000193;
  for (let i = 0; i < str.length; i++) {
    const c = str.charCodeAt(i);
    h1 ^= c; h1 = Math.imul(h1, 0x01000193) >>> 0;
    h2 ^= c; h2 = Math.imul(h2, 0x811c9dc5) >>> 0;
  }
  return h1.toString(16).padStart(8, "0") + h2.toString(16).padStart(8, "0");
}
