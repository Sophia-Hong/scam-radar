import { describe, expect, it } from "vitest";
import { contactPairs, maskContact, maskDeep, maskText } from "./mask";

describe("연락처 가림", () => {
  it("종류별", () => {
    expect(maskContact("phone", "010-1234-5678")).toBe("010-****-5678");
    expect(maskContact("phone", "+15550100")).toBe("155-****-0100");
    expect(maskContact("telegram", "vip_stock_room77")).toBe("vi***77");
    expect(maskContact("kakao_open", "abc")).toBe("a***");
    expect(maskContact("url", "t.me/vip_room")).toBe("t.me/vi***om");
    expect(maskContact("url", "linktr.ee")).toBe("linktr.ee");
  });
  it("문장·객체 안의 원값을 가림(대소문자 무시, 하이픈 전화)", () => {
    const pairs = contactPairs([{ type: "telegram", value: "vip_stock_room77" }, { type: "phone", value: "01012345678" }]);
    expect(maskText("텔레그램 @VIP_stock_room77 / 010-1234-5678", pairs)).toBe("텔레그램 @vi***77 / 010-****-5678");
    const o = maskDeep({ a: ["vip_stock_room77"], handle: "vip_stock_room77" }, pairs, ["handle"]);
    expect(o).toEqual({ a: ["vi***77"], handle: "vip_stock_room77" });
  });
});
