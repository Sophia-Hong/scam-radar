import type { Level } from "./strings";

/**
 * AI 우선 판정 결합 (소현 O #today-hq 1791958205, 테오 1791958217).
 * 붙여넣은 글은 모두 체크리스트 AI 가 판단하고, 규칙은 근거·징후·대비용이다.
 *   AI scam  (신뢰도 0.6↑) → 높음
 *   AI benign(신뢰도 0.6↑) → 낮음. 단 규칙 높음은 최소 중간, 반복 게시·공유 연락처 근거가 있으면 낮추지 않음(규칙 단계 그대로)
 *   unsure·신뢰도 미달·폐기·AI 불가 → 규칙 단계
 * 점수는 단계 구간 안으로만 옮긴다(높음 ≥70, 중간 40–69, 낮음 <40) — 규칙 점수 정보는 구간 안에서 보존.
 */
export const AI_CONFIDENCE = 0.6;
export type AiVerdict = { verdict: "scam" | "benign" | "unsure"; confidence: number } | null;

const clampTo = (level: Level, score: number) =>
  level === "HIGH" ? Math.max(70, Math.min(100, score)) : level === "REVIEW" ? Math.max(40, Math.min(69, score)) : Math.max(0, Math.min(39, score));

export function combineVerdict(rule: { label: Level; score: number }, ai: AiVerdict, coordinationEvidence: boolean): { label: Level; score: number; by: "ai" | "rule" } {
  const sure = ai && ai.confidence >= AI_CONFIDENCE ? ai.verdict : "unsure";
  if (sure === "scam") return { label: "HIGH", score: clampTo("HIGH", rule.score), by: "ai" };
  if (sure === "benign") {
    if (coordinationEvidence) return { ...rule, by: "rule" };
    const label: Level = rule.label === "HIGH" ? "REVIEW" : "LOW";
    return { label, score: clampTo(label, rule.score), by: "ai" };
  }
  return { ...rule, by: "rule" };
}
