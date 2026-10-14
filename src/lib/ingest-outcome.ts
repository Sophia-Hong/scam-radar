/**
 * 수집 응답 → 받아들임/거부 나누기 (카이 a40a047, 테오 1791950534).
 * /api/ingest 는 항목별 결과에 status: "accepted" | "rejected" 를 담는다. 수집기(collector/push.ts)는 거부가 하나라도 있으면
 * 그 항목만 collector/rejected/<batch>.jsonl 에 남기고, 원본 배치를 done/ 으로 옮기지 않고, 0 이 아닌 종료 코드로 끝낸다.
 */
export type IngestItemResult = { status?: "accepted" | "rejected"; error?: unknown; duplicate?: boolean; accountId?: string; score?: number; label?: string; accountLabel?: string };

/** 성공은 *명시적* status "accepted" 이고 오류가 없을 때뿐 — {} 나 모르는 status 는 거부로(카이 2257ada) */
export function isRejected(r: IngestItemResult): boolean {
  return r.status !== "accepted" || r.error !== undefined;
}

export function partition<T>(items: T[], results: IngestItemResult[]): { accepted: T[]; rejected: { item: T; error: unknown }[] } {
  const accepted: T[] = [];
  const rejected: { item: T; error: unknown }[] = [];
  items.forEach((item, i) => {
    const r = results[i];
    if (!r) rejected.push({ item, error: "no result for item" });          // 응답이 모자라면 거부로 — 조용히 done 으로 가지 않게
    else if (isRejected(r)) rejected.push({ item, error: r.error ?? "rejected" });
    else accepted.push(item);
  });
  return { accepted, rejected };
}
