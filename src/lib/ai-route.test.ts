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
  it("직접 호출 모델·캐시 이름·요율은 기본 모델 하나에서 — ANTHROPIC_MODEL 따로 설정은 무시 (카이 8fadbab)", async () => {
    const llm = await load({ ANTHROPIC_API_KEY: "test-key-not-used", ANTHROPIC_MODEL: "claude-haiku-5-5", AI_REVIEW_MODEL: "", VERCEL: "" });
    expect(llm.DIRECT_ANTHROPIC_MODEL).toBe("claude-sonnet-5-5");
    expect((llm.modelConfig([]).model as { modelId?: string }).modelId).toBe("claude-sonnet-5-5");
    const h = await load({ ANTHROPIC_API_KEY: "test-key-not-used", AI_REVIEW_MODEL: "anthropic/claude-haiku-5.5", VERCEL: "" });
    expect(h.DIRECT_ANTHROPIC_MODEL).toBe("claude-haiku-5-5");
    expect(h.MODEL_NAME).toBe("anthropic/claude-haiku-5.5");   // 캐시 키도 같이 바뀐다
    expect((h.modelConfig([]).model as { modelId?: string }).modelId).toBe("claude-haiku-5-5");
    expect(h.usageCost({ inputTokens: 1_000_000, outputTokens: 1_000_000 })).toBeCloseTo(0.6, 6);   // Haiku 요율
    expect(h.usageCost({ inputTokens: 10, outputTokens: 10 }, "claude-unknown-9")).toBeUndefined();   // 표에 없으면 빈칸
  });
  it("직접 호출 비용 = 입력 $2·출력 $10 / 백만 토큰", async () => {
    const llm = await load({});
    expect(llm.usageCost({ inputTokens: 1_000_000, outputTokens: 1_000_000 })).toBe(12);
    expect(llm.usageCost({ inputTokens: 1500, outputTokens: 60 })).toBeCloseTo(0.0036, 6);
    expect(llm.usageCost(undefined)).toBeUndefined();
  });
});

describe("고지 '거쳐 가는 곳'·'보관' = 율 문구(1791966604), 직접·Gateway 둘 다 맞게", () => {
  it("한·영", async () => {
    const { STRINGS } = await import("./strings");
    const ko = Object.fromEntries(STRINGS.ko.notice.details), en = Object.fromEntries(STRINGS.en.notice.details);
    expect(ko["거쳐 가는 곳"]).toBe("Vercel Inc. (미국 회사 · privacy@vercel.com). 저희 서버가 Vercel에서 돌아가서, 글은 Vercel을 거쳐 Anthropic으로 가요. Vercel AI Gateway를 거칠 때도 있어요.");
    expect(ko["보관"]).toMatch(/^저희 서버\(Vercel\)에는 원문이 남지 않아요\(판정 결과와 체크 항목만 저장\)\./);
    expect(ko["보관"]).toMatch(/AI Gateway를 거칠 때도 Vercel은 요청이 끝나면 바로 지우고 프롬프트·출력을 보관하지 않아요 \(Vercel 문서 vercel\.com\/docs\/ai-gateway\/security-and-compliance\/zdr\)\. Google: Google Cloud 데이터 처리 조건에 따라 처리해요 \(cloud\.google\.com\/terms\/data-processing-addendum\)$/);   // 율 1791986407 Google 줄 추가
    expect(en["Passes through"]).toBe("Vercel Inc. (US company · privacy@vercel.com). Our server runs on Vercel, so your text passes through Vercel on its way to Anthropic. Sometimes it also goes through Vercel AI Gateway.");
    expect(en["Retention"]).toMatch(/^Our servers \(on Vercel\) keep no original text/);
    expect(en["Retention"]).toMatch(/When AI Gateway is used, Vercel deletes the data right after the request and does not keep prompts or outputs/);
  });
});
