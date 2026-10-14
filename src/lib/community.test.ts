import { describe, expect, it } from "vitest";
import { check, countsVisible, MIN_DISTINCT_CONNECTIONS, normalizeKey, normalizeKeys, reporterId, shown, validSig } from "./community";
import { accountFromInput } from "@/components/LiveAnalyzer";
import { minhash } from "@/engine/minhash";
import { communityKeys, keyLabel, shareUrl, signIds, signTexts, type SignId } from "./result-view";
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
  // 신호 → 문장 매핑 표 (테오·카이 1791947403, 율 1791947465). 문장은 그 글에서 찾은 사실이 있을 때만
  const P = (code: string) => ({ code, points: 5 });
  const CASES: [string, Parameters<typeof signIds>[0], { code?: string; points: number }[], string[], SignId[]][] = [
    ["보장 어휘", "HIGH", [P("term:원금보장")], [], ["guarantee"]],
    ["영어 보장", "HIGH", [P("term:en:profit:guaranteed")], [], ["guarantee"]],
    ["수익 + 서두름", "HIGH", [P("term:급등주"), P("term:선착순")], [], ["conversion"]],
    ["수익 + 행동 유도", "HIGH", [P("term:무료"), P("cta")], [], ["conversion"]],
    ["수익만(서두름·행동 유도 없음)은 문장 없음 → 일반", "REVIEW", [P("term:급등주")], [], ["fallback"]],
    ["텔레그램 링크 + 이동 유도", "HIGH", [P("cta")], ["telegram"], ["telegram"]],
    ["텔레그램 링크만(이동 유도 없음 — 프로필·인용)은 문장 없음", "REVIEW", [], ["telegram"], ["fallback"]],
    ["인용·피해 경고 맥락이면 텔레그램 문장 없음", "REVIEW", [P("cta"), { code: "veto:quote", points: -10 }], ["telegram"], ["fallback"]],
    ["오픈채팅 링크 + 메신저·투자 결합", "HIGH", [P("combo:contact+invest")], ["kakao_open"], ["chatRoom"]],
    ["왓츠앱 + 행동 유도", "HIGH", [P("cta")], ["whatsapp"], ["chatRoom"]],
    ["텔레그램 *단어*만(링크·아이디 없음)은 채팅방 문장 없음", "REVIEW", [P("term:텔레그램")], [], ["fallback"]],
    ["일반 링크·프로필 링크는 문장 없음", "REVIEW", [P("acct:lure-link"), P("pattern:외부 링크")], ["url", "handle"], ["fallback"]],
    ["서로 다른 계정 근사 중복", "HIGH", [P("spread")], [], ["spreadAccounts"]],
    ["연락처 공유만", "HIGH", [P("shared-contact")], [], ["sharedContact"]],
    ["같은 계정 반복", "HIGH", [P("cluster")], [], ["repeatSelf"]],
    ["여러 원글 댓글(spray)은 같은 글 보장 없음 → 일반", "HIGH", [P("spray")], [], ["fallback"]],
    ["영어 증빙", "HIGH", [P("term:en:evidence:doc")], [], ["evidence"]],
    ["사칭 구조", "HIGH", [P("impersonate:institution+credential")], [], ["impersonation"]],
    ["증빙", "HIGH", [P("term:사원증")], [], ["evidence"]],
    ["난독화", "HIGH", [P("obfuscation")], [], ["normalization"]],
    ["신원 불일치", "HIGH", [P("identity:country-mismatch")], [], ["identity"]],
    ["감점 근거는 무시", "REVIEW", [{ code: "term:원금보장", points: -3 }], [], ["fallback"]],
    ["낮음은 찾은 게 있어도 징후 칸 없음", "LOW", [P("term:원금보장"), P("obfuscation")], ["telegram"], []],
    ["낮음 + 아무것도 없음", "LOW", [], [], []],
    ["순서·최대 3", "HIGH", [P("obfuscation"), P("spread"), P("term:원금보장"), P("cta"), P("term:무료")], ["telegram"], ["guarantee", "conversion", "telegram"]],
    ["쇼츠 예시(영어)", "HIGH", [P("term:en:profit:guaranteed"), P("term:en:urgency:spots"), P("term:en:contact:tme"), P("combo:contact+invest")], ["telegram"], ["guarantee", "conversion", "telegram"]],
  ];
  for (const [name, level, reasons, ents, want] of CASES) it(`매핑: ${name}`, () => expect(signIds(level, reasons, ents)).toEqual(want));
  it("문장은 모두 두 줄", () => {
    for (const L of [STRINGS.ko, STRINGS.en]) for (const v of Object.values(L.result.signs)) expect(v).toHaveLength(2);
    expect(signTexts(["guarantee"], t)[0]).toEqual(t.signs.guarantee);
  });
  it("단정·사람 평가 표현 없음 (율 1791943087)", () => {
    for (const L of [STRINGS.ko, STRINGS.en]) {
      const shownText = JSON.stringify([L.result.level, L.result.banner, L.result.signs, L.community.warn(5, "threads"), L.community.warn(5, "url"), L.result.similar(5), L.result.stop, L.result.disclaimer, L.meta.description]);
      expect(shownText).not.toMatch(/사기입니다|사기꾼|사기 계정|is a scam\b|scammer\b|fraudster/i);
    }
    expect(STRINGS.ko.meta.title.replace("Scam Radar", "")).not.toMatch(/사기|scam/i);
    // 신고 수는 사람 수가 아니라 서로 다른 연결(IP 해시) 기준 건수 — "여러 명·N명·people" 표현 금지 (카이 73f1845)
    for (const L of [STRINGS.ko, STRINGS.en]) {
      const c = JSON.stringify([L.community.lead, L.community.done, L.community.privacy, L.community.warn(5, "threads"), L.result.similar(5), L.criteria.steps]);
      expect(c).not.toMatch(/여러 명|\d+명|명이|people report|several people|users? flagged/i);
    }
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
  it("공유 링크 = 확인한 계정만, 연락처 키는 싣지 않음 (카이 948d5a7)", () => {
    expect(shareUrl("https://x.test", "Sample_VIP")).toBe("https://x.test/?a=sample_vip#check");
    expect(shareUrl("https://x.test", null)).toBe("https://x.test/#check");
  });
  it("키 라벨", () => {
    expect(keyLabel("threads:sample_vip", STRINGS.ko.community.kind)).toBe("Threads 계정 @sample_vip");
    expect(keyLabel("telegram:vip_room77", STRINGS.en.community.kind)).toBe("Telegram vi***77");
    expect(keyLabel("phone:01012345678", STRINGS.ko.community.kind)).toBe("전화번호 010-****-5678");
  });
});

describe("신고 표시 조건", () => {
  it("서로 다른 신고자 3명 미만은 숫자를 내보내지 않음", () => {
    expect(MIN_DISTINCT_CONNECTIONS).toBe(3);
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

describe("교차 확인 — 신고 수 공개 = 연결 3곳 이상 AND 엔진 중간 이상 (테오 1791948637 · 율 1791948645)", () => {
  it("엔진 판정 관문", () => {
    expect(countsVisible("HIGH")).toBe(true);
    expect(countsVisible("REVIEW")).toBe(true);
    expect(countsVisible("LOW")).toBe(false);
    expect(countsVisible(null)).toBe(false);
    expect(countsVisible(undefined)).toBe(false);
  });
  it("낮음·판정 없음이면 DB 를 읽기 전에 숨김(신고가 아무리 많아도) — 판정이 내려가면 다음 조회부터 바로 숨음", async () => {
    for (const level of ["LOW", null] as const) {
      expect(await check(["threads:sample_vipstock77", "telegram:abc"], null, level)).toEqual({ counts: {}, similar: 0, gated: true });
    }
  });
  it("계정 키는 요청의 판정(HIGH)으로 열리지 않음 — 서버 판정이 없으면 DB 전에 숨김 (카이 1791950858)", async () => {
    expect(await check(["threads:real_person"], null, "HIGH")).toEqual({ counts: {}, similar: 0, gated: true });
  });
  it("두 조건이 따로 — 연결 수 기준은 그대로", () => {
    expect([2, 3].map(shown)).toEqual([0, 3]);
  });
});
