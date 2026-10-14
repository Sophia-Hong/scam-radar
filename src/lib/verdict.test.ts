import { describe, expect, it } from "vitest";
import { combineVerdict, type AiVerdict } from "./verdict";
import type { Level } from "./strings";

/** AI 우선 결합 표 9칸 (소현 O 1791958205, 테오 1791958217) */
describe("판정 결합: 규칙 단계 × AI 판정", () => {
  const rule = { HIGH: { label: "HIGH" as Level, score: 82 }, REVIEW: { label: "REVIEW" as Level, score: 55 }, LOW: { label: "LOW" as Level, score: 12 } };
  const ai = { scam: { verdict: "scam", confidence: 0.9 }, benign: { verdict: "benign", confidence: 0.9 }, unsure: { verdict: "unsure", confidence: 0.4 } } as Record<string, AiVerdict>;
  const TABLE: [keyof typeof rule, keyof typeof ai, Level][] = [
    ["HIGH", "scam", "HIGH"], ["HIGH", "benign", "REVIEW"], ["HIGH", "unsure", "HIGH"],
    ["REVIEW", "scam", "HIGH"], ["REVIEW", "benign", "LOW"], ["REVIEW", "unsure", "REVIEW"],
    ["LOW", "scam", "HIGH"], ["LOW", "benign", "LOW"], ["LOW", "unsure", "LOW"],
  ];
  for (const [r, a, want] of TABLE) it(`규칙 ${r} × AI ${a} → ${want}`, () => {
    const out = combineVerdict(rule[r], ai[a], false);
    expect(out.label).toBe(want);
    const band = want === "HIGH" ? [70, 100] : want === "REVIEW" ? [40, 69] : [0, 39];
    expect(out.score).toBeGreaterThanOrEqual(band[0]);
    expect(out.score).toBeLessThanOrEqual(band[1]);
  });
  it("반복 게시·공유 연락처 근거가 있으면 AI benign 이어도 규칙 단계 그대로", () => {
    for (const r of ["HIGH", "REVIEW", "LOW"] as const) expect(combineVerdict(rule[r], ai.benign, true)).toEqual({ ...rule[r], by: "rule" });
    expect(combineVerdict(rule.LOW, ai.scam, true).label).toBe("HIGH");   // 올리는 쪽은 그대로
  });
  it("신뢰도 0.6 미만·AI 없음(상한·장애·폐기)은 규칙 단계", () => {
    expect(combineVerdict(rule.LOW, { verdict: "scam", confidence: 0.59 }, false)).toEqual({ ...rule.LOW, by: "rule" });
    expect(combineVerdict(rule.HIGH, { verdict: "benign", confidence: 0.5 }, false)).toEqual({ ...rule.HIGH, by: "rule" });
    for (const r of ["HIGH", "REVIEW", "LOW"] as const) expect(combineVerdict(rule[r], null, false)).toEqual({ ...rule[r], by: "rule" });
  });
});
