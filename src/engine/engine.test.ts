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

describe("기관 사칭 (2026-09-20 실데이터 후 재설계)", () => {
  const burner = { followers: 3, following: 900, createdAt: new Date().toISOString() };
  it("기관명 + 재직·증빙 주장 + 제안은 텔레그램 없이도 HIGH", () => {
    const r = scoreText("대신증권 재직중입니다. 사원증 인증 사진 올려요. 요즘 장 흐름이랑 종목 정보 필요하신 분 댓글 남겨주세요, 제가 직접 상담해 드릴게요", burner);
    expect(r.categories.contact).toBe(0);
    expect(r.reasons.some((x) => x.code === "impersonate:institution+credential")).toBe(true);
    expect(r.reasons.some((x) => x.code === "gate:no-contact")).toBe(false);
    expect(r.label).toBe("HIGH");
  });
  it("사칭 구조 + 투자 어휘가 붙으면 추가 결합 가점", () => {
    const r = scoreText("삼성전자 임직원입니다 (급여명세서 첨부). 회사 내부정보로 반도체 관련주 정보 공유해드립니다. 관심있으신 분 디엠");
    expect(r.reasons.some((x) => x.code === "impersonate:institution+credential+invest")).toBe(true);
    expect(r.label).toBe("HIGH");
  });
  it("기관명 단독은 LOW (점수 거의 없음)", () => {
    const r = scoreText("오늘 삼성전자 좀 올랐네요. 키움증권 수수료 이벤트도 하네요");
    expect(r.label).toBe("LOW");
    expect(r.score).toBeLessThan(15);
    expect(r.reasons.some((x) => x.code.startsWith("impersonate:"))).toBe(false);
  });
  it("직원 잡담 (기관명 + 재직, 제안 없음) 은 LOW", () => {
    expect(scoreText("삼성전자 재직 중인데 구내식당 오늘 메뉴 실화냐 ㅋㅋ").label).toBe("LOW");
    expect(scoreText("SK하이닉스 급여명세서 보고 놀람. 성과급 실화냐").label).toBe("LOW");
    expect(scoreText("사원증 잃어버려서 재발급 받으러 갑니다 ㅠ 회사에서 한 소리 들음").label).toBe("LOW");
  });
  it("정보를 구하는 취준 글 (알려주세요) 은 결합되지 않는다", () => {
    const r = scoreText("하나증권 최종 면접 봤습니다. 재직 중인 분 계시면 분위기 좀 알려주세요");
    expect(r.reasons.some((x) => x.code.startsWith("impersonate:"))).toBe(false);
    expect(r.label).toBe("LOW");
  });
  it("퇴직자 서사 + 기관 + 투자정보 제안을 사칭 구조로 결합한다", () => {
    const r = scoreText("삼성전자에서 마지막 월급을 받고 공식 퇴직했습니다. 20년 근무하며 얻은 반도체 종목 정보를 필요한 분께 공유합니다. 디엠 주세요");
    expect(r.reasons.some((x) => x.code === "impersonate:institution+credential")).toBe(true);
    expect(r.matched.some((x) => x.label.includes("퇴직"))).toBe(true);
    expect(r.label).toBe("HIGH");
  });
  it("외국 가입 국가는 한국 기관 사칭 결합이 있을 때만 약한 보조 신호다", () => {
    const benign = scoreText("해외에서 한국 주식 공부 중입니다", { profileCountry: "Singapore", countrySource: "threads_about_profile" });
    expect(benign.reasons.some((x) => x.code === "identity:country-mismatch")).toBe(false);

    const impersonator = scoreText("삼성전자에서 공식 퇴직했습니다. 사원증도 있습니다. 반도체 종목 정보 공유하니 디엠 주세요", {
      profileCountry: "Singapore", countrySource: "threads_about_profile",
    });
    expect(impersonator.reasons.find((x) => x.code === "identity:country-mismatch")?.points).toBe(4);
  });
  it("이미지 보조 신호는 사칭 구조 없이 단독으로 점수를 만들지 않는다", () => {
    expect(scoreText("휴가 사진입니다", { syntheticEvidenceConfidence: 0.95 }).score).toBe(0);
    const r = scoreText("대신증권 재직 중입니다. 사원증 첨부합니다. 종목 정보 드릴게요", { syntheticEvidenceConfidence: 0.9 });
    expect(r.reasons.find((x) => x.code === "evidence:synthetic-image")?.points).toBe(6);
  });
  it("결과에는 7개 신호군의 활성 상태가 포함된다", () => {
    const r = scoreText("삼성전자 퇴직했습니다. 사원증 첨부하고 종목 정보 드립니다. 텔레그램으로 오세요", { profileCountry: "Cambodia" });
    expect(r.signalGroups).toHaveLength(7);
    expect(r.signalGroups.find((x) => x.code === "impersonation")?.active).toBe(true);
    expect(r.signalGroups.find((x) => x.code === "identity")?.active).toBe(true);
  });
});

describe("살포 (clusterAccounts) — 서로 다른 계정의 동일 문구", () => {
  const noContact = "급등주 종목추천 무료로 공개합니다 🚀🚀 수익인증 320% 원금보장 확정수익 선착순 20명 마감임박 지금 바로";
  it("계정 3개 이상이 같은 문구를 쓰면 연락채널 없이도 HIGH", () => {
    const solo = scoreText(noContact);
    expect(solo.label).not.toBe("HIGH");
    const spread = scoreText(noContact, { clusterAccounts: 3 });
    expect(spread.reasons.some((x) => x.code === "spread")).toBe(true);
    expect(spread.reasons.some((x) => x.code === "gate:no-contact")).toBe(false);
    expect(spread.label).toBe("HIGH");
  });
  it("계정 2개는 가점만, 게이트는 열리지 않는다", () => {
    const r = scoreText(noContact, { clusterAccounts: 2 });
    expect(r.reasons.find((x) => x.code === "spread")?.points).toBe(15);
    expect(r.label).not.toBe("HIGH");
  });
  it("가점은 2→15, 3→25, 5→32 로 계단식이고 32 에서 멈춘다", () => {
    const pts = (n: number) => scoreText("종목 정보 공유", { clusterAccounts: n }).reasons.find((x) => x.code === "spread")?.points ?? 0;
    expect([pts(1), pts(2), pts(3), pts(4), pts(5), pts(12)]).toEqual([0, 15, 25, 25, 32, 32]);
  });
  it("무해한 문구는 여러 계정이 써도 HIGH 가 아니다", () => {
    const r = scoreText("오늘 점심 뭐 먹지 고민이네요 날씨도 좋고", { clusterAccounts: 8 });
    expect(r.label).not.toBe("HIGH");
  });
  it("같은 계정 반복(clusterSize) 가점 상한은 20", () => {
    const r = scoreText("종목 정보 공유", { clusterSize: 30 });
    expect(r.reasons.find((x) => x.code === "cluster")?.points).toBe(20);
  });
});

describe("explain — 모든 근거 코드에 설명이 붙는다", () => {
  it("term/pattern/combo/impersonate/spread/veto/gate 전부 4개 필드가 비어 있지 않다", async () => {
    const { explainReason, categoryOf } = await import("./explain");
    const samples = [
      scoreText("급등주 종목 무료로 공개합니다 🚀🚀 수익인증 300% 선착순 20명 ㅌㄹㄱㄹ @stock_king77", { clusterAccounts: 4, clusterSize: 5, distinctTargets: 6, followers: 2, following: 800, createdAt: new Date().toISOString() }),
      scoreText("대신증권 재직중입니다. 사원증 인증합니다. 종목 정보 드릴게요. 댓글 남겨주세요"),
      scoreText("리딩방 사기 당한 후기. 텔레그램 무료방 들어갔다가 300만원 날렸어요. 조심하세요"),
      scoreText("[광고] 금융투자업 등록번호 제2019-0000호. 상담은 카카오톡 채널로. 투자원금 손실 가능"),
      scoreText("급등주 종목추천 무료 공개 수익인증 320% 원금보장 확정수익 선착순 마감임박 지금 바로"),
    ];
    const codes = new Set(samples.flatMap((s) => s.reasons.map((r) => r.code)));
    expect(codes.size).toBeGreaterThan(15);
    for (const c of codes) {
      const x = explainReason(c, "라벨", "증거");
      for (const k of ["what", "why", "example", "benign"] as const) expect(x[k].length, `${c}.${k}`).toBeGreaterThan(5);
    }
    expect(categoryOf("term:텔레그램")).toBe("contact");
    expect(categoryOf("term:사원증")).toBe("impersonate");
    expect(categoryOf("spread")).toBe("account");
    expect(categoryOf("veto:quote")).toBe("context");
  });
  it("UI 설명 문구에 판단 어휘(사기 가능성/의심/주의)를 쓰지 않는다 — 수법 설명 문맥 제외", async () => {
    const { STATUS_TEXT } = await import("../lib/labels");
    for (const k of ["HIGH", "REVIEW", "LOW", "UNKNOWN"]) expect(STATUS_TEXT[k]).not.toMatch(/사기|의심|주의|검토 필요/);
  });
});
