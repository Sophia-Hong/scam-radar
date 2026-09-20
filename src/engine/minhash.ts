/**
 * 근사 중복 클러스터링: 문자 3-gram shingle → MinHash(128 perm) → LSH(16 band × 8 row)
 * 한국어는 교착어라 어절 토큰이 조사 하나에 깨지므로 문자 n-gram 이 필수.
 * 임계값: (1/16)^(1/8) ≈ 0.71 → Jaccard 0.75 근처에서 후보를 잡고, 실제 Jaccard 로 재검증한다.
 * SimHash 를 쓰지 않는 이유: 300자 미만 짧은 문서에서 해밍거리 분포가 무너진다.
 */

export const NUM_PERM = 128;
export const BANDS = 16;
export const ROWS = NUM_PERM / BANDS;
export const JACCARD_THRESHOLD = 0.75;
const SHINGLE = 3;
const MERSENNE = 0xffffffff;

// 결정적 시드로 a,b 계수 생성 (서버·브라우저·수집기 어디서든 동일 서명)
function xorshift(seed: number) {
  let x = seed >>> 0 || 1;
  return () => {
    x ^= x << 13; x >>>= 0;
    x ^= x >>> 17;
    x ^= x << 5; x >>>= 0;
    return x;
  };
}
const rnd = xorshift(0x5ca11ab5);
const A: number[] = [], B: number[] = [];
for (let i = 0; i < NUM_PERM; i++) { A.push((rnd() | 1) >>> 0); B.push(rnd() >>> 0); }

function hash32(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h >>> 0;
}

export function shingles(text: string, k = SHINGLE): Set<string> {
  const chars = Array.from(text.replace(/\s+/g, " "));
  const out = new Set<string>();
  if (chars.length < k) { if (chars.length) out.add(chars.join("")); return out; }
  for (let i = 0; i + k <= chars.length; i++) out.add(chars.slice(i, i + k).join(""));
  return out;
}

export function minhash(text: string): number[] {
  const sig = new Array<number>(NUM_PERM).fill(MERSENNE);
  for (const sh of shingles(text)) {
    const h = hash32(sh);
    for (let i = 0; i < NUM_PERM; i++) {
      // (a*h + b) mod 2^32 — Math.imul 로 32비트 곱셈, 덧셈은 >>>0 으로 랩
      const v = (Math.imul(A[i], h) + B[i]) >>> 0;
      if (v < sig[i]) sig[i] = v;
    }
  }
  return sig;
}

/** LSH 밴드 키 — DB 에 (band_idx, key) 로 저장해 후보 조회 */
export function bandKeys(sig: number[]): string[] {
  const keys: string[] = [];
  for (let b = 0; b < BANDS; b++) {
    let h = 0x811c9dc5;
    for (let r = 0; r < ROWS; r++) {
      const v = sig[b * ROWS + r];
      h ^= v & 0xff; h = Math.imul(h, 0x01000193) >>> 0;
      h ^= (v >>> 8) & 0xff; h = Math.imul(h, 0x01000193) >>> 0;
      h ^= (v >>> 16) & 0xff; h = Math.imul(h, 0x01000193) >>> 0;
      h ^= (v >>> 24) & 0xff; h = Math.imul(h, 0x01000193) >>> 0;
    }
    keys.push(`${b}:${(h >>> 0).toString(36)}`);
  }
  return keys;
}

export function estimateJaccard(a: number[], b: number[]): number {
  let eq = 0;
  for (let i = 0; i < NUM_PERM; i++) if (a[i] === b[i]) eq++;
  return eq / NUM_PERM;
}

export function jaccard(textA: string, textB: string): number {
  const a = shingles(textA), b = shingles(textB);
  if (a.size === 0 && b.size === 0) return 1;
  let inter = 0;
  for (const s of a) if (b.has(s)) inter++;
  return inter / (a.size + b.size - inter);
}

/** 인메모리 LSH 인덱스 — 수집기 배치·테스트·브라우저용. 서버는 DB 테이블로 같은 로직 수행 */
export class LshIndex<T extends { id: string; text: string }> {
  private buckets = new Map<string, T[]>();
  private items = new Map<string, T>();
  add(item: T) {
    this.items.set(item.id, item);
    for (const k of bandKeys(minhash(item.text))) {
      const arr = this.buckets.get(k);
      if (arr) arr.push(item); else this.buckets.set(k, [item]);
    }
  }
  /** 실제 Jaccard ≥ threshold 인 항목만 반환 */
  query(text: string, threshold = JACCARD_THRESHOLD): { item: T; jaccard: number }[] {
    const cand = new Map<string, T>();
    for (const k of bandKeys(minhash(text))) for (const it of this.buckets.get(k) ?? []) cand.set(it.id, it);
    const out: { item: T; jaccard: number }[] = [];
    for (const it of cand.values()) {
      const j = jaccard(text, it.text);
      if (j >= threshold) out.push({ item: it, jaccard: j });
    }
    return out.sort((x, y) => y.jaccard - x.jaccard);
  }
}
