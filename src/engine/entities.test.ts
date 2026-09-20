import { describe, it, expect } from "vitest";
import { extractEntities, entityId, isStrongEntity, strongEntities, type Entity } from "./entities";

const vals = (list: Entity[], type?: string) =>
  list.filter((e) => !type || e.type === type).map((e) => e.value);

describe("extractEntities — 텔레그램", () => {
  it("t.me 링크", () => {
    expect(vals(extractEntities("문의는 https://t.me/vip_stock_room77 로"), "telegram")).toContain("vip_stock_room77");
  });
  it("공백으로 쪼갠 링크 t . me / xxx", () => {
    expect(vals(extractEntities("t . me / secret_room"), "telegram")).toContain("secret_room");
  });
  it("혼동문자 Ｔеlеgrаm + 핸들", () => {
    expect(vals(extractEntities("Ｔеlеgrаm @gold_pick"), "telegram")).toContain("gold_pick");
  });
  it("한국어 단서 — 텔레 아이디 : vip_room", () => {
    expect(vals(extractEntities("텔레 아이디 : vip_room 오세요"), "telegram")).toContain("vip_room");
  });
  it("텔레그램 아이디 xxx", () => {
    expect(vals(extractEntities("텔레그램 아이디 leader_kim99"), "telegram")).toContain("leader_kim99");
  });
  it("초성 난독화 ㅌㄹㄱㄹ @핸들", () => {
    expect(vals(extractEntities("ㅌㄹㄱㄹ @vip_stock_room77 참고"), "telegram")).toContain("vip_stock_room77");
  });
  it("후행 한글·구두점은 값에 포함하지 않는다", () => {
    expect(vals(extractEntities("t.me/room_abc으로, 오세요."), "telegram")).toContain("room_abc");
  });
});

describe("extractEntities — 카카오", () => {
  it("오픈채팅 링크는 경로까지 값으로", () => {
    const e = extractEntities("입장 open.kakao.com/o/gAbC1234 선착순");
    expect(vals(e, "kakao_open")).toContain("open.kakao.com/o/gabc1234");
  });
  it("공백 난독화된 오픈채팅 링크", () => {
    expect(vals(extractEntities("open . kakao . com / o / sXyZ9 "), "kakao_open")).toContain("open.kakao.com/o/sxyz9");
  });
  it("카톡 아이디 xxx → kakao_channel", () => {
    expect(vals(extractEntities("카톡 아이디 goldpick77 주세요"), "kakao_channel")).toContain("goldpick77");
  });
  it("카카오채널 xxx", () => {
    expect(vals(extractEntities("카카오채널 stock_master"), "kakao_channel")).toContain("stock_master");
  });
  it("pf.kakao.com 채널 링크", () => {
    expect(vals(extractEntities("https://pf.kakao.com/_xTfxnb"), "kakao_channel")).toContain("pf.kakao.com/_xtfxnb");
  });
});

describe("extractEntities — 전화·라인·위챗·링크", () => {
  it("한국 휴대폰 번호 정규화", () => {
    expect(vals(extractEntities("연락 010-1234-5678"), "phone")).toEqual(["01012345678"]);
    expect(vals(extractEntities("연락 010 1234 5678"), "phone")).toEqual(["01012345678"]);
    expect(vals(extractEntities("연락 +82 10 1234 5678"), "phone")).toEqual(["01012345678"]);
  });
  it("수익률·연도 숫자는 전화번호가 아니다", () => {
    expect(extractEntities("수익률 300% 2026년 1234 5678 9012").filter((e) => e.type === "phone")).toHaveLength(0);
  });
  it("라인·위챗", () => {
    expect(vals(extractEntities("라인 아이디 kr_leader"), "line")).toContain("kr_leader");
    expect(vals(extractEntities("line.me/ti/p/~abc_def"), "line")).toContain("abc_def");
    expect(vals(extractEntities("위챗 wx_master88"), "wechat")).toContain("wx_master88");
  });
  it("링크모음·단축 URL 은 약한 타입", () => {
    const e = extractEntities("프로필 https://linktr.ee/viproom 참고", { externalUrl: "https://bit.ly/3xYz" });
    expect(vals(e, "url")).toEqual(expect.arrayContaining(["linktr.ee/viproom", "bit.ly/3xyz"]));
    expect(e.filter((x) => x.type === "url").every((x) => !isStrongEntity(x.type))).toBe(true);
  });
});

describe("extractEntities — 일반 핸들·중복·출처", () => {
  it("단서 없는 @핸들은 handle (약한 신호)", () => {
    const e = extractEntities("@randomuser_a 님 글 잘 봤어요");
    expect(e).toEqual([{ type: "handle", value: "randomuser_a", raw: "@randomuser_a", source: "text" }]);
  });
  it("강한 타입으로 잡힌 값은 handle 로 중복되지 않는다", () => {
    const e = extractEntities("텔레 @vip_room 문의");
    expect(vals(e, "telegram")).toContain("vip_room");
    expect(vals(e, "handle")).not.toContain("vip_room");
  });
  it("bio·externalUrl 도 훑고 source 를 표시한다", () => {
    const e = extractEntities("종목 무료 공개", { bio: "문의 텔레 @room_bio", externalUrl: "https://t.me/room_ext" });
    expect(e.find((x) => x.value === "room_bio")?.source).toBe("bio");
    expect(e.find((x) => x.value === "room_ext")?.source).toBe("externalUrl");
  });
  it("같은 값은 한 번만 (변형 여러 개에서 걸려도)", () => {
    const e = extractEntities("t.me/dup_room 과 t . me / dup_room", { externalUrl: "https://t.me/dup_room" });
    expect(e.filter((x) => x.type === "telegram" && x.value === "dup_room")).toHaveLength(1);
  });
  it("strongEntities 는 handle/url 을 제외한다", () => {
    const e = extractEntities("t.me/a_room 와 @someone 와 linktr.ee/abc");
    expect(strongEntities(e).map((x) => x.type)).toEqual(["telegram"]);
  });
  it("entityId 는 type:value", () => {
    expect(entityId("telegram", "vip_room")).toBe("telegram:vip_room");
  });
});

describe("extractEntities — 오탐 방지", () => {
  it("빈 입력", () => {
    expect(extractEntities("")).toEqual([]);
  });
  it("평범한 한국어 문장에서 아무것도 뽑지 않는다", () => {
    expect(extractEntities("오늘 코스피가 올랐네요. 다들 성투하세요!")).toEqual([]);
  });
  it("채널 단어만 있고 아이디가 없으면 엔티티가 아니다", () => {
    expect(extractEntities("텔레그램으로 사기당했다는 글을 봤어요")).toEqual([]);
  });
  it("도메인 조각이 핸들로 새지 않는다 (텔레그램 t.me/xxx)", () => {
    const e = extractEntities("텔레그램 t.me/recover_pro_kr 로 오세요");
    expect(vals(e, "telegram")).toEqual(["recover_pro_kr"]);
  });
  it("오픈채팅 링크가 kakao_channel 핸들로 새지 않는다", () => {
    const e = extractEntities("카카오 오픈채팅 open.kakao.com/o/abc123 입장");
    expect(vals(e, "kakao_channel")).toEqual([]);
    expect(vals(e, "kakao_open")).toEqual(["open.kakao.com/o/abc123"]);
  });
});
