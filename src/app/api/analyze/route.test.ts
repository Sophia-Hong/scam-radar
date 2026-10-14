import { describe, expect, it } from "vitest";
import { POST } from "./route";
import { reviewApplied } from "@/lib/llm";
import { scoreText } from "@/engine";
import { aiStatusOf } from "@/components/LiveAnalyzer";
import { IP_DAILY_CHECKS, kstDay } from "@/lib/checklimit";
import { STRINGS } from "@/lib/strings";

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
  it("요청자가 보낸 계정 특징(묶음 크기·여러 계정·대상 수·팔로워 등)은 무시 — 글만으로 판정 (카이 edc45c6)", async () => {
    const text = "종목 정보 드립니다.";
    const forgedAccount = { clusterSize: 12, clusterAccounts: 9, distinctTargets: 30, followers: 3, following: 2000, createdAt: new Date().toISOString(), bio: "VIP 리딩방", externalUrl: "https://t.me/vip", profileCountry: "KH", countrySource: "profile", syntheticEvidenceConfidence: 0.99 };
    expect(scoreText(text, forgedAccount).score).toBeGreaterThan(scoreText(text).score);   // 엔진은 값을 주면 올린다 → 막는 곳은 공개 입력
    const plain = await call({ text });
    const forged = await call({ text, account: forgedAccount });
    expect(forged.score).toBe(plain.score);
    expect(forged.label).toBe(plain.label);
    expect(forged.label).toBe("LOW");
    expect(forged.reasons).toEqual(plain.reasons);
    expect(forged.signalGroups).toEqual(plain.signalGroups);
    expect(JSON.stringify(forged)).not.toMatch(/여러 계정|같은 글|묶음|spread|cluster/);
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

describe("같은 IP 하루 20회 (소현 1791954589, 테오 1791954606)", () => {
  const callAs = (ip: string) => POST(new Request("http://x/api/analyze", { method: "POST", headers: { "content-type": "application/json", "x-real-ip": ip }, body: JSON.stringify({ text: "안녕하세요 반갑습니다" }) }));
  it("20번까지 되고 21번째는 429 daily_limit — 다른 IP 는 따로 센다", async () => {
    for (let i = 0; i < IP_DAILY_CHECKS; i++) expect((await callAs("198.51.100.7")).status).toBe(200);
    const over = await callAs("198.51.100.7");
    expect(over.status).toBe(429);
    expect(await over.json()).toEqual({ error: "daily_limit" });
    expect((await callAs("198.51.100.8")).status).toBe(200);
  });
  it("하루 = KST 날짜", () => {
    expect(kstDay(new Date("2026-10-14T14:59:00Z"))).toBe("2026-10-14");
    expect(kstDay(new Date("2026-10-14T15:00:00Z"))).toBe("2026-10-15");
  });
  it("안내 문구(한·영)", () => {
    expect(STRINGS.ko.result.limited).toBe("오늘 검사 횟수를 다 썼어요. 내일 다시 해 주세요.");
    expect(STRINGS.en.result.limited).toMatch(/today's checks.*tomorrow/);
  });
});
