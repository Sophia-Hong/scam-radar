import { describe, expect, it } from "vitest";
import { MIN_DISPLAY, normalizeKey, normalizeKeys, reporterId, shown, validSig } from "./community";
import { accountFromInput } from "@/components/LiveAnalyzer";
import { minhash } from "@/engine/minhash";
import { communityKeys, foundTelegram, keyLabel, plainSigns, shareUrl } from "./result-view";
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
  it("쉬운 징후 = 두 줄, 찾은 것만, 최대 3개", () => {
    const groups = [{ code: "impersonation", active: true }, { code: "evidence", active: false }, { code: "infrastructure", active: true }, { code: "coordination", active: true }];
    expect(plainSigns("HIGH", groups, [], true, t)).toEqual([t.signs.impersonation, t.signs.infrastructure, t.signs.coordination]);
    expect(plainSigns("HIGH", groups, [], false, t)[1]).toEqual(t.signChatRoom);          // 텔레그램을 못 찾았으면 "모르는 채팅방"
    expect(plainSigns("HIGH", groups, [{ code: "term:원금보장", points: 3 }], true, t)[0]).toEqual(t.signGuarantee);
    expect(plainSigns("LOW", [], [], false, t)).toEqual([]);
    expect(plainSigns("LOW", groups, [], true, t)).toHaveLength(3);                       // 낮음이어도 찾은 것은 보인다
    expect(plainSigns("REVIEW", [], [], false, t)).toEqual([t.signFallback]);
    for (const s of plainSigns("HIGH", groups, [], true, t)) expect(s).toHaveLength(2);
    expect(foundTelegram(["telegram:vip"], [])).toBe(true);
    expect(foundTelegram([], [{ code: "term:텔레그램", points: 2 }])).toBe(true);
    expect(foundTelegram(["kakao_open:abc"], [{ code: "term:카카오", points: 2 }])).toBe(false);
  });
  it("단정·사람 평가 표현 없음 (율 1791943087)", () => {
    for (const L of [STRINGS.ko, STRINGS.en]) {
      const shownText = JSON.stringify([L.result.level, L.result.banner, L.result.signs, L.result.signGuarantee, L.result.signFallback, L.community.warn(5, "threads"), L.community.warn(5, "url"), L.result.similar(5), L.result.stop, L.result.disclaimer, L.meta.description]);
      expect(shownText).not.toMatch(/사기입니다|사기꾼|사기 계정|is a scam\b|scammer\b|fraudster/i);
    }
    expect(STRINGS.ko.meta.title.replace("Scam Radar", "")).not.toMatch(/사기|scam/i);
    expect(STRINGS.en.meta.title.replace("Scam Radar", "")).not.toMatch(/사기|scam/i);
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

describe("신고 표시 조건", () => {
  it("서로 다른 신고자 3명 미만은 숫자를 내보내지 않음", () => {
    expect(MIN_DISPLAY).toBe(3);
    expect([0, 1, 2, 3, 7].map(shown)).toEqual([0, 0, 0, 3, 7]);
  });
  it("서명 형식 — 브라우저 minhash 그대로만", () => {
    expect(validSig(minhash("텔레그램 무료 리딩방 입장"))).not.toBeNull();
    expect(validSig([1, 2, 3])).toBeNull();
    expect(validSig(new Array(128).fill(-1))).toBeNull();
    expect(validSig(new Array(128).fill(1.5))).toBeNull();
  });
  it("한 칸 입력: @핸들·Threads 주소만 계정, 나머지는 글", () => {
    expect(accountFromInput("@sample_vip")).toBe("sample_vip");
    expect(accountFromInput("https://www.threads.com/@sample_vip")).toBe("sample_vip");
    expect(accountFromInput("sample_vip")).toBeNull();
    expect(accountFromInput("t.me/vip_room")).toBeNull();
    expect(accountFromInput("@a 텔레그램으로 오세요")).toBeNull();
  });
});
