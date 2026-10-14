import { describe, expect, it } from "vitest";
import { isCurrentSummary, SUMMARY_VERSION, summaryModelLabel, templateSummary } from "./llm";

// 공개 요약문에 연락처 강도 구분이 남지 않는다 (카이 05213d0 HOLD 1)
describe("요약문", () => {
  const base = { platform: "threads", handle: "sample_x", profileUrl: "https://www.threads.com/@sample_x", posts: [{ postUrl: "u", text: "t", capturedAt: "2026-10-01T00:00:00Z", score: 80 }], reasons: [] };
  it("연락처는 종류·값만, '(참고: …)' 구분 없음", () => {
    const s = templateSummary({ ...base, contacts: [{ typeLabel: "텔레그램", value: "vip" }, { typeLabel: "링크", value: "a.b/c" }] });
    expect(s).toContain("텔레그램 vip, 링크 a.b/c");
    expect(s).not.toContain("참고:");
  });
  it("판 표식 — 옛 요약은 현재 판이 아님", () => {
    expect(isCurrentSummary("template")).toBe(false);
    expect(isCurrentSummary(null)).toBe(false);
    expect(isCurrentSummary("template" + SUMMARY_VERSION)).toBe(true);
    expect(summaryModelLabel("gemini-x" + SUMMARY_VERSION)).toBe("gemini-x");
  });
});
