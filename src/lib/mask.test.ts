import { describe, expect, it } from "vitest";
import { contactPairs, maskContact, maskDeep, maskPhonesAnywhere, maskText } from "./mask";

describe("연락처 가림", () => {
  it("종류별", () => {
    expect(maskContact("phone", "010-1234-5678")).toBe("010-****-5678");
    expect(maskContact("phone", "+15550100")).toBe("155-****-0100");
    expect(maskContact("telegram", "vip_stock_room77")).toBe("vi***77");
    expect(maskContact("kakao_open", "abc")).toBe("a***");
    expect(maskContact("url", "t.me/vip_room")).toBe("t.me/vi***om");
    expect(maskContact("url", "scamsite.xyz")).toBe("sc***yz");          // 경로 없는 일반 도메인도 가림
  });
  it("문장·객체 안의 원값을 가림(대소문자 무시, 하이픈 전화)", () => {
    const pairs = contactPairs([{ type: "telegram", value: "vip_stock_room77" }, { type: "phone", value: "01012345678" }]);
    expect(maskText("텔레그램 @VIP_stock_room77 / 010-1234-5678", pairs)).toBe("텔레그램 @vi***77 / 010-****-5678");
    const o = maskDeep({ a: ["vip_stock_room77"], handle: "vip_stock_room77" }, pairs, ["handle"]);
    expect(o).toEqual({ a: ["vi***77"], handle: "vip_stock_room77" });
  });
});

describe("원문 표기 변형까지 가림 (카이 948d5a7)", () => {
  it("전화: 공백·점·하이픈·괄호·+82", () => {
    const pairs = contactPairs([{ type: "phone", value: "01012345678" }]);
    for (const raw of ["010 1234 5678", "010.1234.5678", "010-1234-5678", "(010) 1234-5678", "+82 10 1234 5678", "01012345678"]) {
      expect(maskText(`문의 ${raw} 로`, pairs), raw).toBe("문의 010-****-5678 로");
    }
  });
  it("링크: 프로토콜·www 붙은 표기", () => {
    const pairs = contactPairs([{ type: "url", value: "scamsite.xyz" }]);
    expect(maskText("https://www.scamsite.xyz 방문", pairs)).toBe("sc***yz 방문");
  });
});

describe("괄호·+82 번호 — 추출과 무관한 이중 가림 (카이 c99c371, 테오 1791950296)", () => {
  const variants = ["(010)1234-5678", "(010) 1234-5678", "+82 (10) 1234 5678", "+82-10-1234-5678", "010 1234 5678", "10-1234-5678", "(0505) 123 4567"];
  it("추출 규칙이 괄호 표기도 잡음", async () => {
    const { extractEntities } = await import("@/engine/entities");
    for (const v of variants.slice(0, 5)) expect(extractEntities(`문의 ${v}`).some((e) => e.type === "phone" && e.value === "01012345678"), v).toBe(true);
  });
  it("연락처 목록이 비어도(추출 실패) 공개 출력엔 원번호 0", () => {
    for (const v of variants) {
      const out = maskDeep({ text: `문의는 ${v} 로`, nested: [`${v}`] }, []);
      expect(JSON.stringify(out), v).not.toMatch(/1234[\s.-]?5678|123[\s.-]?4567/);
    }
  });
  it("날짜·금액은 그대로", () => {
    expect(maskPhonesAnywhere("2026-10-14 수익 300% 1,000,000원 주문번호 20261014")).toBe("2026-10-14 수익 300% 1,000,000원 주문번호 20261014");
  });
});
