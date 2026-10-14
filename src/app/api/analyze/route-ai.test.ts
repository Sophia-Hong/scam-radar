import { describe, expect, it, vi } from "vitest";

// AI 판정을 흉내 내 서버 결합 경로를 끝까지 본다(실제 모델 호출 없음)
const fake = vi.hoisted(() => ({ verdict: { verdict: "scam", confidence: 0.9, checks: ["giver", "move_chat"], model: "anthropic/claude-sonnet-5.5" } as { verdict: string; confidence: number; checks: string[]; model: string } }));
vi.mock("@/lib/llm", async (orig) => ({ ...(await orig<typeof import("@/lib/llm")>()), reviewPost: vi.fn(async () => fake.verdict) }));
import { POST } from "./route";
import { scoreText } from "@/engine";

const call = async (text: string, ip: string) => (await POST(new Request("http://x/api/analyze", { method: "POST", headers: { "content-type": "application/json", "x-real-ip": ip }, body: JSON.stringify({ text }) }))).json();

describe("/api/analyze AI 우선 (소현 O 1791958205)", () => {
  it("규칙 낮음 글도 AI 에 보내고, AI scam → 높음 + applied. 규칙 징후가 없으면 일반 문장", async () => {
    const text = "안녕하세요 오늘 좋은 정보 드릴게요";
    expect(scoreText(text).label).toBe("LOW");
    fake.verdict = { verdict: "scam", confidence: 0.9, checks: ["giver"], model: "anthropic/claude-sonnet-5.5" };
    const r = await call(text, "203.0.113.201");
    expect(r).toMatchObject({ label: "HIGH", ai: "applied", signs: ["fallback"] });
    expect(r.score).toBeGreaterThanOrEqual(70);
  });
  it("규칙 높음 + AI benign → 중간(하한)", async () => {
    const text = "급등주 무료 공개 텔레그램 t.me/vip_room_qq 원금보장 선착순 지금 입장";
    expect(scoreText(text).label).toBe("HIGH");
    fake.verdict = { verdict: "benign", confidence: 0.95, checks: ["quote_warning"], model: "anthropic/claude-sonnet-5.5" };
    expect(await call(text, "203.0.113.202")).toMatchObject({ label: "REVIEW", ai: "applied" });
  });
  it("AI 폐기·상한(quota-rule) → 규칙 단계 + unavailable", async () => {
    const text = "안녕하세요 오늘 좋은 정보 드릴게요";
    for (const model of ["anthropic/claude-sonnet-5.5|discarded", "quota-rule", "fallback"]) {
      fake.verdict = { verdict: "unsure", confidence: 0, checks: [], model };
      expect(await call(text, "203.0.113.203")).toMatchObject({ label: scoreText(text).label, ai: "unavailable" });
    }
  });
});
