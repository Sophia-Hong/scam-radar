import { describe, expect, it, vi } from "vitest";

// AI 판정을 흉내 내 서버 결합 경로를 끝까지 본다(실제 모델 호출 없음)
const fake = vi.hoisted(() => ({ verdict: { verdict: "scam", confidence: 0.9, checks: ["giver", "move_chat"], model: "anthropic/claude-sonnet-5.5" } as { verdict: string; confidence: number; checks: string[]; model: string } }));
const fakeImg = vi.hoisted(() => ({ v: { verdict: "scam", confidence: 0.9, checks: ["guarantee"], model: "anthropic/claude-sonnet-5.5", imageText: "원금보장 확정수익 텔레그램 t.me/vip_room_qq 지금 입장" } as Record<string, unknown> }));
vi.mock("@/lib/llm", async (orig) => ({ ...(await orig<typeof import("@/lib/llm")>()), reviewPost: vi.fn(async () => fake.verdict), reviewPostWithImages: vi.fn(async () => fakeImg.v) }));
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

const PNG = "data:image/png;base64," + "iVBORw0KGgo".padEnd(400, "A");
const post = async (body: unknown, ip: string) => POST(new Request("http://x/api/analyze", { method: "POST", headers: { "content-type": "application/json", "x-real-ip": ip }, body: JSON.stringify(body) }));

describe("캡처 업로드 (테오 1791958372, 율 1791958415)", () => {
  it("캡처만 올려도 AI 가 판단하고, 캡처 속 글자로 징후를 고른다(응답에 글자 원문 없음)", async () => {
    fakeImg.v = { verdict: "scam", confidence: 0.9, checks: ["guarantee"], model: "anthropic/claude-sonnet-5.5", imageText: "원금보장 확정수익 텔레그램 t.me/vip_room_qq 지금 입장" };
    const r = await (await post({ text: "", images: [PNG] }, "203.0.113.210")).json();
    expect(r).toMatchObject({ label: "HIGH", ai: "applied" });
    expect(r.signs).toContain("guarantee");
    expect(r).not.toHaveProperty("imageText");   // 캡처 글자 전문은 응답·저장 어디에도 없다(근거 줄의 짧은 표기는 올린 사람 본인에게만 돌아감)
    expect(JSON.stringify(r)).not.toContain("원금보장 확정수익 텔레그램 t.me/vip_room_qq 지금 입장");
  });
  it("캡처만 + AI 불가 → 단계 없음 + unavailable", async () => {
    fakeImg.v = { verdict: "unsure", confidence: 0, checks: [], model: "quota-rule" };
    expect(await (await post({ images: [PNG] }, "203.0.113.211")).json()).toMatchObject({ label: null, ai: "unavailable" });
  });
  it("4장·사진 아닌 것·5MB 초과·빈 요청은 400", async () => {
    const big = "data:image/jpeg;base64," + "A".repeat(Math.ceil(5 * 1024 * 1024 * 4 / 3) + 8);
    for (const body of [{ images: [PNG, PNG, PNG, PNG] }, { images: ["data:text/html;base64,PGgxPg=="] }, { images: [big] }, { text: "  " }]) expect((await post(body, "203.0.113.212")).status).toBe(400);
  });
  it("IP 하루 20회는 1 + 장수만큼 센다 — 3장짜리 5번(20) 뒤 6번째는 429", async () => {
    fakeImg.v = { verdict: "unsure", confidence: 0, checks: [], model: "quota-rule" };
    for (let i = 0; i < 5; i++) expect((await post({ text: "안녕", images: [PNG, PNG, PNG] }, "203.0.113.213")).status).toBe(200);
    expect((await post({ text: "안녕" }, "203.0.113.213")).status).toBe(429);
  });
});
