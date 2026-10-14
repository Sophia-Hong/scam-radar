import { describe, expect, it } from "vitest";
import { evidenceImagePrompt, reviewPrompt, summaryPrompt } from "./llm";

/**
 * AI 로 넘어가는 *전체 payload* 회귀 시험(카이 1001f5d HOLD) — 봉인 세트로는 가림 효과를 볼 수 없어서, 개인정보를 일부러 넣은 글로
 * 세 빌더(재검·이미지 검토·계정 요약)의 결과 전체에 원값이 하나도 없는지 본다. 캡처 이미지는 가릴 수 없어 그대로 간다(고지에 명시, 율 1791958415).
 */
const RAW = [
  "010-1234-5678", "01012345678", "+82 10 2222 3333", "02-123-4567", "1588-1234",
  "신한 110123456789", "110123456789", "123456-01-234567", "국민 94320201234567", "4321-5678-9012-3456",
  "kim.lee@gmail.com", "info@company.co.kr",
];
const LEAK = [/1234-5678/, /12345678/, /2222 3333/, /123-4567/, /1588-1234/, /110123456789/, /123456-01/, /94320201234567/, /5678-9012/, /kim\.lee@/, /info@company/];
const TEXT = `연락처 ${RAW.join(" / ")} 원금보장 t.me/vip_room`;

describe("AI payload 전체에 전화·계좌·카드·이메일 원값이 없다", () => {
  it("재검 프롬프트(글 + 계정 관측 정보: 소개글·외부 링크)", () => {
    const p = reviewPrompt(TEXT, ["행동 유도"], { bio: `상담 010-9876-5432 / 국민 94320201234567 / vip@naver.com`, externalUrl: "https://t.me/vip_room" } as never);
    for (const re of [...LEAK, /9876-5432/, /vip@naver/]) expect(p).not.toMatch(re);
    expect(p).toContain("t.me/vip_room");   // 링크는 판정 신호라 그대로(고지에 명시)
  });
  it("이미지 검토 글 부분", () => {
    const p = evidenceImagePrompt(TEXT);
    for (const re of LEAK) expect(p).not.toMatch(re);
  });
  it("계정 요약(소개글·글·연락처 목록)", () => {
    const p = summaryPrompt({
      platform: "threads", handle: "sample", profileUrl: "https://www.threads.com/@sample",
      bio: "문의 010-5555-6666 · 하나 12345678901234", externalUrl: "https://t.me/x",
      posts: [{ postUrl: "https://www.threads.com/@sample/post/1", text: TEXT, capturedAt: "2026-10-14", score: 80 }],
      reasons: ["원금보장"], contacts: [{ typeLabel: "전화", value: "01012345678" }, { typeLabel: "이메일", value: "kim.lee@gmail.com" }],
    });
    for (const re of [...LEAK, /5555-6666/, /12345678901234/]) expect(p).not.toMatch(re);
  });
});
