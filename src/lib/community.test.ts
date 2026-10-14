import { describe, expect, it } from "vitest";
import { normalizeKey, normalizeKeys, reporterId } from "./community";
import { communityKeys, keyLabel, oneLineReason, shareUrl } from "./result-view";
import { STRINGS } from "./strings";

describe("신고 장부 키", () => {
  it("허용 타입·형식만, 소문자로", () => {
    expect(normalizeKey("Threads:@Sample_VIP")).toBe("threads:sample_vip");
    expect(normalizeKey("telegram:vip_room77")).toBe("telegram:vip_room77");
    expect(normalizeKey("phone:010-1234-5678")).toBe("phone:010-1234-5678");
    for (const bad of ["", "nope", "email:a@b.c", "threads:한글", "threads:a b", "url:<script>", "phone:abc", 42, null]) expect(normalizeKey(bad), String(bad)).toBeNull();
  });
  it("중복 제거·개수 상한", () => {
    expect(normalizeKeys(["telegram:a", "TELEGRAM:a", "telegram:b", "x"], 5)).toEqual(["telegram:a", "telegram:b"]);
    expect(normalizeKeys(Array.from({ length: 9 }, (_, i) => `telegram:r${i}`), 5)).toHaveLength(5);
  });
  it("신고자 id 는 IP 원값을 담지 않고, 비밀값 없으면 등록 불가", () => {
    const id = reporterId("203.0.113.7", "s3cret")!;
    expect(id).toMatch(/^[0-9a-f]{32}$/);
    expect(id).not.toContain("203");
    expect(reporterId("203.0.113.7", "s3cret")).toBe(id);
    expect(reporterId("203.0.113.8", "s3cret")).not.toBe(id);
    expect(reporterId("203.0.113.7", undefined)).toBeNull();
  });
});

describe("결과 첫 화면", () => {
  const t = STRINGS.en.result;
  it("이유 한 줄 = 켜진 신호군 최대 2개", () => {
    const groups = [{ code: "impersonation", active: true }, { code: "evidence", active: false }, { code: "infrastructure", active: true }, { code: "coordination", active: true }];
    expect(oneLineReason("HIGH", groups, true, t)).toBe(`${t.groups.impersonation} · ${t.groups.infrastructure}`);
    expect(oneLineReason("LOW", [], false, t)).toBe(t.whyNone);
    expect(oneLineReason("REVIEW", [], true, t)).toBe(t.whyFallback);
  });
  it("조회 키 = 계정 + 글 속 연락처, 원문 없음", () => {
    const text = "급등주 무료 공개 텔레그램 t.me/vip_room77 문의 010-1234-5678";
    const keys = communityKeys("Sample_VIP", text);
    expect(keys[0]).toBe("threads:sample_vip");
    expect(keys).toContain("telegram:vip_room77");
    expect(keys.join(" ")).not.toContain("급등주");
    expect(keys.length).toBeLessThanOrEqual(5);
    for (const k of keys) expect(normalizeKey(k), k).toBe(k);   // 화면이 만든 키는 서버 형식 검사를 통과한다
  });
  it("공유 링크 = 조회 키만", () => {
    expect(shareUrl("https://x.test", "Sample_VIP", ["threads:sample_vip", "telegram:a"])).toBe("https://x.test/?a=sample_vip#check");
    const u = new URL(shareUrl("https://x.test", null, ["telegram:a", "phone:010"]));
    expect(u.searchParams.getAll("k")).toEqual(["telegram:a", "phone:010"]);
    expect(shareUrl("https://x.test", null, [])).toBe("https://x.test/#check");
  });
  it("키 라벨", () => {
    expect(keyLabel("threads:sample_vip", STRINGS.ko.community.kind)).toBe("Threads 계정 @sample_vip");
    expect(keyLabel("telegram:vip", STRINGS.en.community.kind)).toBe("Telegram vip");
  });
});
