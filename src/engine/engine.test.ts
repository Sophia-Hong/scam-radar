import { describe, it, expect } from "vitest";
import { normalize, choseongSeq, scoreText, LshIndex, jaccard, minhash, estimateJaccard } from "./index";

describe("normalize", () => {
  it("혼동문자(키릴)와 전각을 라틴으로 폴딩", () => {
    const n = normalize("Ｔеlеgrаm 문의");
    expect(n.compact).toContain("telegram");
    expect(n.techniques).toContain("homoglyph");
  });
  it("구분자 삽입 난독화 제거", () => {
    expect(normalize("텔.레.그.램 @abc").compact).toContain("텔레그램");
    expect(normalize("텔_레_그_램").compact).toBe("텔레그램");
  });
  it("제로폭 문자 제거", () => {
    const n = normalize("텔​레​그램");
    expect(n.compact).toBe("텔레그램");
    expect(n.techniques).toContain("zero-width");
  });
  it("숫자는 라틴 사이에서만 폴딩 (300% 보존)", () => {
    expect(normalize("te1egram 300%").compact).toContain("telegram");
    expect(normalize("300%").compact).toBe("300%");
  });
  it("NFKC 로 호환자모 통합", () => {
    expect(normalize("ㅌㄹㄱㄹ").techniques).toContain("chosung");
    expect(normalize("Ｔｅｌｅ").techniques).toContain("compat-forms");
  });
});

describe("초성", () => {
  it("호환 자모와 음절 초성이 같은 블록으로 통일", () => {
    expect(choseongSeq("ㅌㄹ")).toBe(choseongSeq("텔레"));
    expect(choseongSeq("ㅌㄹㄱㄹ")).toBe(choseongSeq("텔레그램"));
    expect(choseongSeq("텔ㄹㄱㄹ")).toBe(choseongSeq("텔레그램"));
  });
  it("순수 음절 텍스트는 초성 매칭 안 함 (특별 라운지 오탐 방지)", () => {
    const r = scoreText("특별 라운지에서 만나요");
    expect(r.reasons.find((x) => x.label.includes("초성"))).toBeUndefined();
  });
});

describe("scoreText", () => {
  it("전형적 리딩방 유인글은 HIGH", () => {
    const r = scoreText("급등주 종목 무료로 공개합니다 🚀🚀 수익인증 300% 선착순 20명 ㅌㄹㄱㄹ @stock_king77");
    expect(r.label).toBe("HIGH");
    expect(r.score).toBeGreaterThanOrEqual(70);
    expect(r.reasons.some((x) => x.label.includes("초성"))).toBe(true);
  });
  it("일반 주식 잡담은 LOW", () => {
    const r = scoreText("오늘 삼성전자 좀 올랐네요. 다들 어떻게 보세요?");
    expect(r.label).toBe("LOW");
  });
  it("정상 텔레그램 언급만으로는 HIGH 아님", () => {
    const r = scoreText("친구랑 텔레그램으로 얘기했어요");
    expect(r.label).not.toBe("HIGH");
  });
  it("계정 특성이 점수를 올린다", () => {
    const base = scoreText("리딩방 입장 문의 텔레");
    const boosted = scoreText("리딩방 입장 문의 텔레", { clusterSize: 6, distinctTargets: 5, followers: 3 });
    expect(boosted.score).toBeGreaterThan(base.score);
  });
});

describe("minhash / lsh", () => {
  const a = "급등주 종목 무료 공개 수익인증 선착순 텔레그램 @stock_king77 로 오세요";
  const b = "급등주 종목 무료 공개! 수익인증 선착순 텔레그램 @stock_king77 로 오세요~";
  const c = "오늘 점심 뭐 먹지 고민이네요 날씨도 좋고";
  it("변형본은 높은 Jaccard, 무관 텍스트는 낮음", () => {
    expect(jaccard(a, b)).toBeGreaterThan(0.75);
    expect(jaccard(a, c)).toBeLessThan(0.1);
  });
  it("MinHash 추정치가 실제와 근접", () => {
    expect(Math.abs(estimateJaccard(minhash(a), minhash(b)) - jaccard(a, b))).toBeLessThan(0.15);
  });
  it("LSH 인덱스가 근사 중복만 반환", () => {
    const idx = new LshIndex<{ id: string; text: string }>();
    idx.add({ id: "a", text: a }); idx.add({ id: "c", text: c });
    const res = idx.query(b);
    expect(res.map((r) => r.item.id)).toEqual(["a"]);
  });
});

describe("피해자 맥락", () => {
  it("피해 후기는 HIGH 가 아니어야 한다", () => {
    const r = scoreText("리딩방 사기 당한 후기 씁니다. 텔레그램 무료방 들어갔다가 VIP방 유도당해서 300만원 날렸어요. 다들 조심하세요");
    expect(r.label).not.toBe("HIGH");
  });
});

describe("HARD GATE: 연락채널 없으면 HIGH 불가", () => {
  const lureNoContact = "급등주 종목추천 무료로 공개합니다 🚀🚀 수익인증 320% 원금보장 확정수익 선착순 20명 마감임박 지금 바로";
  it("채널 유도가 없으면 아무리 점수가 높아도 HIGH 가 아니다", () => {
    const r = scoreText(lureNoContact, { followers: 3, following: 900, createdAt: new Date().toISOString() });
    expect(r.categories.contact).toBe(0);
    expect(r.label).not.toBe("HIGH");
    expect(r.score).toBeLessThanOrEqual(69);
    expect(r.reasons.some((x) => x.code === "gate:no-contact")).toBe(true);
  });
  it("같은 글에 채널 유도가 붙으면 HIGH 가 된다", () => {
    const r = scoreText(lureNoContact + " 텔레그램 @syn_room 으로 오세요", { followers: 3, following: 900, createdAt: new Date().toISOString() });
    expect(r.categories.contact).toBeGreaterThan(0);
    expect(r.label).toBe("HIGH");
    expect(r.reasons.some((x) => x.code === "gate:no-contact")).toBe(false);
  });
  it("프로필 외부 링크(t.me)도 연락채널 신호로 친다", () => {
    const r = scoreText("오늘 장도 수고하셨습니다. 내일도 좋은 종목으로 인사드릴게요", {
      bio: "무료 리딩방 운영 | 종목추천 | 입장은 아래 링크",
      externalUrl: "https://t.me/syn_lead_room",
      followers: 14, following: 720, createdAt: new Date().toISOString(),
    });
    expect(r.categories.contact).toBeGreaterThan(0);
    expect(r.reasons.some((x) => x.code === "acct:lure-link")).toBe(true);
  });
});

describe("하드 네거티브", () => {
  it("등록번호를 명시한 합법 투자자문 광고는 HIGH 가 아니다", () => {
    const r = scoreText("[광고] ○○투자자문 — 금융투자업 등록번호 제2019-0000호. 투자자문 상담 문의는 카카오톡 채널로. 투자원금 손실 가능", { followers: 5200 });
    expect(r.label).not.toBe("HIGH");
    expect(r.reasons.some((x) => x.code.startsWith("veto:"))).toBe(true);
  });
  it("기사·보도자료 공유는 HIGH 가 아니다", () => {
    const r = scoreText("오늘자 기사: '텔레그램 리딩방으로 급등주 무료 추천, 수익인증 미끼' — 출처: 금융감독원 보도자료");
    expect(r.label).not.toBe("HIGH");
  });
  it("공공기관 캠페인 문구는 HIGH 가 아니다", () => {
    const r = scoreText("【금융감독원】 '원금보장', '확정수익'을 내세운 텔레그램 리딩방은 불법입니다. 1332 로 문의하세요");
    expect(r.label).not.toBe("HIGH");
  });
  it("유인 문구를 인용한 풍자·해설 글은 HIGH 가 아니다", () => {
    const r = scoreText("ㅋㅋㅋ '오늘도 상한가 적중, 따라만 하면 월 500, 텔레그램 오세요' 이런 문구 하루에 열 번 봄");
    expect(r.label).not.toBe("HIGH");
  });
  it("비투자 오픈채팅 모집(스터디·나눔)은 HIGH 가 아니다", () => {
    const r = scoreText("카톡 오픈채팅으로 중고 책 나눔합니다. 무료고 선착순이에요. 신청은 프로필 링크에서");
    expect(r.label).not.toBe("HIGH");
  });
  it("피해·경고 어휘가 하나만 있어도 자동 HIGH 는 보류된다", () => {
    const r = scoreText("급등주 무료로 준다는 계정 신고했습니다. 프로필 링크 타고 들어가면 텔레그램 리딩방이더라고요");
    expect(r.label).not.toBe("HIGH");
    expect(r.reasons.some((x) => x.code === "veto:victim")).toBe(true);
  });
  it("유인 성격을 부인·해명하는 글은 HIGH 가 아니다", () => {
    const r = scoreText("제 프로필 링크는 블로그입니다. 리딩방 아니에요 ㅋㅋ 오해 마세요");
    expect(r.label).not.toBe("HIGH");
  });
  it("팔로워가 아주 많은 미디어 계정은 자동 HIGH 대상이 아니다", () => {
    const r = scoreText("새 영상 올라갔습니다: 리딩방은 어떻게 돈을 버는가. 텔레그램 무료방 구조를 뜯어봤어요", { followers: 128000, following: 42 });
    expect(r.label).not.toBe("HIGH");
  });
});

describe("JSON 안전성", () => {
  it("근거 스니펫이 서로게이트 쌍을 자르지 않는다", () => {
    const r = scoreText("🚀🚀🚀🚀🚀🚀🚀🚀급등주🚀🚀🚀🚀🚀🚀🚀🚀 텔레그램");
    for (const x of r.reasons) if (x.evidence) expect(() => JSON.parse(JSON.stringify(x.evidence))).not.toThrow(), expect(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(x.evidence)).toBe(false);
  });
});
