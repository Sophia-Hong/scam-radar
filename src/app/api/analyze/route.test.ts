import { describe, expect, it } from "vitest";
import { POST } from "./route";
import { reviewApplied } from "@/lib/llm";
import { scoreText } from "@/engine";
import { aiStatusOf } from "@/components/LiveAnalyzer";

const call = async (body: unknown) => (await POST(new Request("http://x/api/analyze", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }))).json();
const IMPERSONATION = "대신증권 재직 중입니다. 사원증 첨부합니다. 종목 정보 드릴게요";

describe("공개 /api/analyze (카이 1fe5e41, 테오 1791954097)", () => {
  it("요청자가 넣은 이미지 검토 신뢰도는 무시 — '보조 모델 검토' 근거·가점 없음", async () => {
    expect(JSON.stringify(scoreText(IMPERSONATION, { syntheticEvidenceConfidence: 0.99 }).reasons)).toMatch(/보조 모델 검토/);   // 엔진은 값을 주면 근거를 만든다 → 막는 곳은 공개 입력
    const plain = await call({ text: IMPERSONATION });
    const forged = await call({ text: IMPERSONATION, account: { syntheticEvidenceConfidence: 0.99 } });
    expect(JSON.stringify(forged)).not.toMatch(/보조 모델 검토|synthetic-image/);
    expect(forged.score).toBe(plain.score);
    expect(forged.label).toBe(plain.label);
  });
  it("키 없음 환경에서 재검 대상이면 ai = unavailable (applied 아님)", async () => {
    const text = "급등주 정보 드려요 텔레그램 문의 주세요";
    expect(scoreText(text).needsLlmReview).toBe(true);
    const r = await call({ text });
    expect(r.ai).toBe("unavailable");
    expect(aiStatusOf(r)).toBe("error");
    expect(aiStatusOf({ ai: "applied" })).toBe("applied");
    expect(aiStatusOf({})).toBe("error");
  });
  it("실제 모델 판정만 applied", () => {
    for (const model of ["template", "fallback", "quota-rule", "anthropic/claude-sonnet-5.5|discarded"]) expect(reviewApplied({ model })).toBe(false);
    expect(reviewApplied(null)).toBe(false);
    expect(reviewApplied({ model: "anthropic/claude-sonnet-5.5" })).toBe(true);
  });
});
