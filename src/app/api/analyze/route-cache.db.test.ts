import { afterAll, describe, expect, it, vi } from "vitest";
import { sql } from "drizzle-orm";

/**
 * 같은 캡처를 다시 올려도 결과가 같다(카이 01fa686 HOLD 1) — 실제 캐시(로컬 시험 DB)를 거쳐 두 번 부른다. 모델 호출은 가짜(1회만 불려야 함).
 * 캡처 속 글자 조각은 응답·캐시 어디에도 없다(HOLD 2).
 *   TEST_DATABASE_URL=postgres://postgres@127.0.0.1:55432/postgres npx vitest run src/app/api/analyze/route-cache.db.test.ts
 */
const testUrl = process.env.TEST_DATABASE_URL ?? "";
const localTestDb = /^postgres(ql)?:\/\/([^@/]*@)?(localhost|127\.0\.0\.1)(:\d+)?\//.test(testUrl);
const OCR = "신한 110123456789 원금보장 확정수익 텔레그램 t.me/vip_room_qq 지금 입장 010-2468-1357";
const gen = vi.hoisted(() => ({ calls: 0 }));
vi.mock("ai", async (orig) => ({
  ...(await orig<typeof import("ai")>()),
  generateText: vi.fn(async () => { gen.calls++; return { output: { verdict: "unsure", confidence: 0.4, checks: [], image_text: "신한 110123456789 원금보장 확정수익 텔레그램 t.me/vip_room_qq 지금 입장 010-2468-1357" }, response: { modelId: "anthropic/claude-sonnet-5.5" }, providerMetadata: {} }; }),
}));

describe.skipIf(!localTestDb)("캡처 재조회 일관성·누출 (실제 캐시)", () => {
  const tag = `capdb${Date.now()}`;
  afterAll(async () => {
    const { db } = await import("@/db");
    await db().execute(sql`DELETE FROM llm_cache WHERE kind = 'review-img' AND created_at > now() - interval '10 minutes'`);
  });
  it("두 번 올려도 같은 응답, 모델은 1회, 응답·캐시에 캡처 글자 없음", async () => {
    process.env.POSTGRES_URL = testUrl; process.env.DATABASE_URL = testUrl; process.env.AI_GATEWAY_API_KEY = "test-not-used";
    process.env.COMMUNITY_SECRET = process.env.COMMUNITY_SECRET || "dbtest-secret";
    const { POST } = await import("./route");
    const img = "data:image/png;base64," + Buffer.from(tag).toString("base64").padEnd(400, "A");
    const call = async () => (await POST(new Request("http://x/api/analyze", { method: "POST", headers: { "content-type": "application/json", "x-real-ip": `198.18.${Date.now() % 200}.9` }, body: JSON.stringify({ text: "", images: [img] }) }))).json();
    const first = await call();
    const second = await call();
    expect(gen.calls).toBe(1);
    expect(second).toEqual(first);
    expect(first.label).not.toBe("LOW");   // 캡처 속 글자로 만든 규칙 단계가 결합에 쓰였다(AI unsure)
    const leak = /110123456789|0123456789|2468|1357|vip_room_qq|원금보장 확정수익/;
    expect(JSON.stringify(first)).not.toMatch(leak);
    const { db } = await import("@/db");
    const rows = ((await db().execute(sql`SELECT result::text AS r FROM llm_cache WHERE kind = 'review-img' AND created_at > now() - interval '10 minutes'`)) as unknown as { rows: { r: string }[] }).rows;
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) expect(row.r).not.toMatch(leak);
  });
});
