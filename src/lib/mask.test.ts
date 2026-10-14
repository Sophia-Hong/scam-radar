import { describe, expect, it } from "vitest";
import { contactPairs, maskContact, maskDeep, maskText } from "./mask";

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
