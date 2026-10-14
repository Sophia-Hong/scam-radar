/**
 * 프로세스 메모리 연타 방지 — 서버리스 인스턴스마다 따로 세지만, 막으려는 것은 한 사람의 연타지 분산 공격이 아니다.
 * (등록 상한은 DB 로 따로 센다 — lib/community.ts)
 */
export function memoryLimiter(windowMs: number, max: number) {
  const hits = new Map<string, number[]>();
  return (key: string): boolean => {
    const now = Date.now();
    const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
    if (recent.length >= max) { hits.set(key, recent); return true; }
    recent.push(now);
    hits.set(key, recent);
    if (hits.size > 5000) for (const [k, v] of hits) if (!v.some((t) => now - t < windowMs)) hits.delete(k);
    return false;
  };
}
