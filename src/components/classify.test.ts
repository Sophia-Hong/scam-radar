import { describe, expect, it } from "vitest";
import { classifyInput } from "./LiveAnalyzer";

describe("계정 입력 분류 — Threads 전용, 다른 주소는 지원 범위 밖", () => {
  it("Threads 핸들과 프로필 주소는 핸들로", () => {
    for (const [input, handle] of [
      ["@sample_vipstock77", "sample_vipstock77"],
      ["sample_vipstock77", "sample_vipstock77"],
      ["john.doe", "john.doe"],                                  // 점이 들어간 핸들은 주소가 아니다
      ["@john.doe", "john.doe"],
      ["https://www.threads.net/@sample_vipstock77", "sample_vipstock77"],
      ["https://www.threads.com/@a.b_c/post/XYZ", "a.b_c"],
      ["threads.com/@demo_lead_a", "demo_lead_a"],
      [" @syn_001 ", "syn_001"],
    ] as const) expect(classifyInput(input), input).toEqual({ kind: "handle", handle });
  });

  it("일반 웹사이트·다른 SNS 주소는 지원 범위 밖", () => {
    for (const input of ["https://example.com/shop", "http://some-shop.kr", "www.naver.com", "naver.com", "shop.example.co.kr", "https://www.instagram.com/someone", "https://x.com/someone", "https://t.me/vip_room", "example.com/path?q=1", "ftp://x.y/z"]) {
      expect(classifyInput(input), input).toEqual({ kind: "unsupported" });
    }
  });

  it("읽을 수 없는 입력", () => {
    for (const input of ["", "   ", "한글 계정", "a b", "@@@", "!!!"]) expect(classifyInput(input), input).toEqual({ kind: "invalid" });
  });
});
