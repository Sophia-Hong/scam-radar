import { describe, expect, it } from "vitest";
import { MODEL_NAME, REVIEW_CHECK_LABEL, REVIEW_CHECKS } from "./llm";

// AI 재검토 = Claude Sonnet 5.5(Gateway), 체크리스트 id 만 — 자유 문장 공개 없음 (소현 1791949427, 테오 1791949447)
describe("AI 재검토 설정", () => {
  it("기본 모델 = anthropic/claude-sonnet-5.5 (env 없을 때)", () => {
    if (!process.env.AI_REVIEW_MODEL) expect(MODEL_NAME).toBe("anthropic/claude-sonnet-5.5");
  });
  it("대체 모델 없음 · 공급자 Anthropic 고정 (율 1791950335)", async () => {
    const { PROVIDERS } = await import("./llm");
    if (!process.env.AI_REVIEW_PROVIDERS) expect(PROVIDERS).toEqual(["anthropic"]);
  });
  it("체크리스트 8개, 이름이 모두 있음", () => {
    expect(REVIEW_CHECKS).toEqual(["giver", "money_promise", "guarantee", "move_chat", "secrecy_urgency", "impersonation", "withdrawal_fee", "quote_warning"]);
    for (const c of REVIEW_CHECKS) expect(REVIEW_CHECK_LABEL[c]).toBeTruthy();
  });
});

describe("AI 호출 경계 (카이 71eea9b, 테오 1791950431)", () => {
  it("모순 응답 거르기", async () => {
    const { reviewConsistent } = await import("./llm");
    expect(reviewConsistent({ verdict: "benign", checks: ["guarantee"] })).toBe(false);
    expect(reviewConsistent({ verdict: "benign", checks: ["withdrawal_fee", "quote_warning"] })).toBe(false);
    expect(reviewConsistent({ verdict: "benign", checks: ["quote_warning"] })).toBe(true);
    expect(reviewConsistent({ verdict: "scam", checks: [] })).toBe(false);
    expect(reviewConsistent({ verdict: "scam", checks: ["quote_warning"] })).toBe(false);
    expect(reviewConsistent({ verdict: "scam", checks: ["move_chat", "money_promise"] })).toBe(true);
    expect(reviewConsistent({ verdict: "unsure", checks: [] })).toBe(true);
  });
  it("DB 가 없으면 예약 실패 = 호출 안 함(fail-closed)", async () => {
    const { reserveAiCall } = await import("./llm");
    if (!process.env.DATABASE_URL && !process.env.POSTGRES_URL) expect(await reserveAiCall()).toBeNull();
  });
});
