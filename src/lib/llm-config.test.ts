import { describe, expect, it } from "vitest";
import { MODEL_NAME, REVIEW_CHECK_LABEL, REVIEW_CHECKS } from "./llm";

// AI 재검토 = Claude Sonnet 5.5(Gateway), 체크리스트 id 만 — 자유 문장 공개 없음 (소현 1791949427, 테오 1791949447)
describe("AI 재검토 설정", () => {
  it("기본 모델 = anthropic/claude-sonnet-5.5 (env 없을 때)", () => {
    if (!process.env.AI_REVIEW_MODEL) expect(MODEL_NAME).toBe("anthropic/claude-sonnet-5.5");
  });
  it("체크리스트 8개, 이름이 모두 있음", () => {
    expect(REVIEW_CHECKS).toEqual(["giver", "money_promise", "guarantee", "move_chat", "secrecy_urgency", "impersonation", "withdrawal_fee", "quote_warning"]);
    for (const c of REVIEW_CHECKS) expect(REVIEW_CHECK_LABEL[c]).toBeTruthy();
  });
});
