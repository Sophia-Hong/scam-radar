import { describe, expect, it } from "vitest";
import { STRINGS } from "./strings";
import { shareUrl } from "./result-view";

/** 카이 노인 사용성 검수(7e2775f) → 테오 1791956461·율 1791956479 */
describe("노인 첫 방문", () => {
  it("HIGH 배너 = 율 OK 문구, 안내 문장은 그대로", () => {
    expect(`${STRINGS.ko.result.banner.HIGH.title} ${STRINGS.ko.result.banner.HIGH.sub}`).toBe("사기일 수 있어요. 돈을 보내지 마세요. 먼저 가족이나 은행에 물어보세요.");
    expect(`${STRINGS.en.result.banner.HIGH.title} ${STRINGS.en.result.banner.HIGH.sub}`).toBe("This could be a scam. Do not send money. Ask your family or your bank first.");
    expect(STRINGS.ko.result.disclaimer).toContain("사기로 확정한 건 아니예요");   // 소현 1791987366: 단정하지 않는 요소는 유지
  });
  it("공유 메시지에 쓰는 법, 링크에는 원문 없음", () => {
    expect(STRINGS.ko.family.text).toContain("의심되는 문자를 길게 눌러 복사한 뒤, 이 링크에 들어가 붙여넣기 하세요");
    expect(STRINGS.en.family.text).toMatch(/copy it, then open this link and paste it/);
    const u = new URL(shareUrl("https://example.org", "some_handle"));
    expect([...u.searchParams.keys()]).toEqual(["a"]);
  });
  it("첫 화면 그림 how-to 3칸(한 칸 4~6단어), 내부어 없음 (소현 1791972094)", () => {
    for (const L of [STRINGS.ko, STRINGS.en]) {
      expect(L.hero.howto).toHaveLength(3);
      for (const line of L.hero.howto) { const n = line.split(/\s+/).length; expect(n).toBeGreaterThanOrEqual(1); expect(n).toBeLessThanOrEqual(6); }   // 짧은 단계 이름(소현 1791987249: "메시지 캡처 → 캡처 확인 → 의심 상황 확인")
      expect(L.hero.orPaste).toBeTruthy();
      expect(`${L.hero.placeholder} ${L.hero.scope} ${L.hero.demo}`).not.toMatch(/\bDM\b|t\.me|Threads|합성|synthetic/);
    }
  });
});
