import { afterEach, describe, expect, it, vi } from "vitest";

/** Anthropic 직접 호출 선택(테오 1791966434) — 실제 호출 0. 모듈은 환경을 읽을 때 정해지므로 환경을 바꾸고 다시 불러온다 */
async function load(env: Record<string, string | undefined>) {
  vi.resetModules();
  for (const [k, v] of Object.entries(env)) vi.stubEnv(k, v as string);
  return import("./llm");
}
afterEach(() => { vi.unstubAllEnvs(); vi.resetModules(); });

describe("AI 공급자 선택", () => {
  it("ANTHROPIC_API_KEY 가 있으면 Anthropic 직접(claude-sonnet-5-5), 캐시 모델 이름은 그대로", async () => {
    const llm = await load({ ANTHROPIC_API_KEY: "test-key-not-used", AI_REVIEW_MODEL: "", VERCEL: "" });
    expect(llm.AI_ROUTE).toBe("anthropic-direct");
    expect(llm.llmEnabled).toBe(true);
    expect(llm.MODEL_NAME).toBe("anthropic/claude-sonnet-5.5");
    const m = llm.modelConfig(["t"]).model as { provider?: string; modelId?: string };
    expect(m.modelId).toBe("claude-sonnet-5-5");
    expect(String(m.provider)).toMatch(/^anthropic/);
    expect(llm.modelConfig(["t"])).not.toHaveProperty("providerOptions");   // Gateway 옵션 없음
  });
  it("키가 없으면 지금 Gateway 경로(Anthropic 고정)", async () => {
    const llm = await load({ ANTHROPIC_API_KEY: "", AI_REVIEW_MODEL: "", VERCEL: "1" });
    expect(llm.AI_ROUTE).toBe("gateway");
    const c = llm.modelConfig(["t"]) as { model: unknown; providerOptions?: { gateway?: { only?: string[] } } };
    expect(c.model).toBe("anthropic/claude-sonnet-5.5");
    expect(c.providerOptions?.gateway?.only).toEqual(["anthropic"]);
  });
  it("직접 호출 비용 = 입력 $2·출력 $10 / 백만 토큰", async () => {
    const llm = await load({});
    expect(llm.usageCost({ inputTokens: 1_000_000, outputTokens: 1_000_000 })).toBe(12);
    expect(llm.usageCost({ inputTokens: 1500, outputTokens: 60 })).toBeCloseTo(0.0036, 6);
    expect(llm.usageCost(undefined)).toBeUndefined();
  });
});
