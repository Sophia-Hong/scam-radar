import { describe, expect, it } from "vitest";
import { ACCOUNT_KEY_TYPES, check, CONTACT_KEY_TYPES, countsVisible, isAccountKey, KEY_TYPES, MIN_DISTINCT_CONNECTIONS, normalizeKey, normalizeKeys, reporterId, shown, validSig } from "./community";
import { accountFromInput } from "@/components/LiveAnalyzer";
import { minhash } from "@/engine/minhash";
import { scoreText } from "@/engine/score";
import { extractEntities } from "@/engine/entities";
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
  const CASES: [string, Parameters<typeof signIds>[0], { code?: string; points: number }[], string[], SignId[], string?][] = [
    ["보장 어휘", "HIGH", [P("term:원금보장")], [], ["guarantee"]],
    ["영어 보장", "HIGH", [P("term:en:profit:guaranteed")], [], ["guarantee"]],
    ["수익 + 서두름", "HIGH", [P("term:급등주"), P("term:선착순")], [], ["conversion"]],
    ["수익 + 행동 유도", "HIGH", [P("term:무료"), P("cta")], [], ["conversion"]],
    ["수익만(서두름·행동 유도 없음)은 문장 없음 → 일반", "REVIEW", [P("term:급등주")], [], ["fallback"]],
    ["텔레그램 링크 + 이동 유도", "HIGH", [P("cta")], ["telegram"], ["telegram"]],
    ["텔레그램 링크만(이동 유도 없음 — 프로필·인용)은 문장 없음", "REVIEW", [], ["telegram"], ["fallback"]],
    ["인용·피해 경고 맥락이면 텔레그램 문장 없음", "REVIEW", [P("cta"), { code: "veto:quote", points: -10 }], ["telegram"], ["fallback"]],
    ["엔진 v2 인용·부정 범위(veto:scoped-context, 0점)도 인용 맥락", "REVIEW", [P("cta"), { code: "veto:scoped-context", points: 0 }], ["telegram"], ["fallback"]],
    ["받은 메시지 결합(combo:received*)만으로는 이동 유도 아님", "HIGH", [P("combo:received-message")], ["telegram"], ["fallback"]],
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
    // 받은 메시지 수법(엔진 v2 tactic:*, 율 #compliance 1791951936)
    ["비밀 요구", "HIGH", [P("tactic:secrecy")], [], ["secrecy"]],
    ["출금 전 돈 요구", "HIGH", [P("tactic:withdrawal")], [], ["withdrawal"]],
    ["앱 설치 요구", "HIGH", [P("tactic:install")], [], ["appInstall"]],
    // 아래 넷은 tactic 코드만으로는 문장 없음 — 글에서 그 문장의 행동 근거를 따로 확인(카이 60a5fbf HOLD, 테오 1791952640)
    ["가족 사칭 새 번호 + 상품권 요구", "HIGH", [P("tactic:family")], [], ["familyNewNumber"], "엄마 나 폰 고장나서 임시폰이야. 급하게 상품권 사서 핀번호 보내줘"],
    ["가족 새 번호 + 돈은 필요 없다 → 문장 없음", "HIGH", [P("tactic:family")], [], ["fallback"], "엄마 나 폰 액정 깨져서 임시번호로 연락해. 돈은 필요 없고 그냥 이 번호 저장해줘"],
    ["가족 tactic 코드만(글 없음) → 문장 없음", "HIGH", [P("tactic:family")], [], ["fallback"]],
    ["택배 사칭 + 비공식 링크 + 누르라는 요구", "HIGH", [P("tactic:delivery")], ["url"], ["deliveryLink"], "[CJ대한통운] 주소 불일치로 배송 보류. 아래 링크 눌러 주소 수정하세요 https://cj-redeliv.top/x"],
    // 난독화 링크(hxxps·[.])는 엔티티로 안 뽑혀도(ents=[]) 엔진 행동 사실(act.link)로 근거가 된다(카이 1fe5e41). 엔진이 tactic:delivery 를 내는 건 테오 7차
    ["택배 사칭 + 난독화 링크 + 누르라는 요구", "HIGH", [P("tactic:delivery")], [], ["deliveryLink"], "[USPS] Your package is on hold due to an incomplete address. Click the link to update within 12 hours: hxxps://shorturl[.]at/claim"],
    ["일반 배송 지연 + 추적 링크 → 문장 없음", "HIGH", [P("tactic:delivery")], ["url"], ["fallback"], "Your package delivery is delayed. Track: https://bit.ly/abc123"],
    ["기관 사칭 + 전화번호 + 전화하라는 요구", "HIGH", [P("tactic:authority")], ["phone"], ["deliveryLink"], "서울중앙지검 수사관입니다. 사건 확인을 위해 010-1234-5678로 바로 전화 주세요"],
    ["택배 언급만(링크·전화 없음)은 문장 없음", "REVIEW", [P("tactic:delivery")], [], ["fallback"], "택배 배송 안내입니다"],
    ["대출 선수수료", "HIGH", [P("tactic:loan")], [], ["loanFee"], "저금리 대환대출 가능합니다. 기존 대출을 먼저 상환하셔야 승인됩니다"],
    ["대출 단어 + 상환 조언 → 문장 없음", "HIGH", [P("tactic:loan")], [], ["fallback"], "신용등급 관리 팁: 기존 대출은 상환 계획을 세우세요"],
    ["부업 적은 노동 + 큰돈", "HIGH", [P("tactic:task")], [], ["sideJob"], "재택 부업 하루 30분, 상품 리뷰만 쓰면 일당 15만원"],
    ["일반 구인 → 문장 없음", "HIGH", [P("tactic:task")], [], ["fallback"], "Part-time job opening at our store, apply in person"],
    ["받은 메시지 수법이 앞 순서", "HIGH", [P("cta"), P("tactic:secrecy"), P("tactic:withdrawal"), P("term:무료")], ["telegram"], ["withdrawal", "secrecy", "conversion"]],
    // 수익 인증(소현 1791954291, 율 OK 1791954325) — 글에 그 말이 있을 때만, 부정·인용 경고 절 제외, 보장 다음
    ["수익 인증 있음", "HIGH", [P("term:원금보장")], [], ["guarantee", "profitProof"], "원금보장! 매일 수익 인증샷 올려드립니다"],
    ["수익 인증 영어", "REVIEW", [P("cta")], [], ["profitProof"], "Join now, we post daily profit screenshots in our group"],
    ["수익 인증 축약 섞인 영어", "REVIEW", [P("cta")], [], ["profitProof"], "Here's our proof of profit, don't miss it"],
    ["수익 인증 부정 절 → 없음", "HIGH", [P("term:원금보장")], [], ["guarantee"], "원금보장 상품입니다. 수익 인증 같은 건 필요 없어요"],
    ["수익 인증 인용 경고 → 없음", "REVIEW", [P("cta")], [], ["fallback"], "“수익 인증” 보여 주며 입금하라는 건 사기예요"],
    ["수익 인증 경고 절 → 없음", "REVIEW", [P("cta")], [], ["fallback"], "수익 인증샷은 조작일 수 있으니 조심하세요"],
    ["인용·피해 경고 맥락(veto)이면 없음", "REVIEW", [P("cta"), { code: "veto:quote", points: -10 }], [], ["fallback"], "매일 수익 인증 올립니다"],
    ["수익 인증 순서·최대 3", "HIGH", [P("term:원금보장"), P("cta"), P("term:무료")], ["telegram"], ["guarantee", "profitProof", "conversion"], "원금보장 무료 리딩방 수익 인증 매일, 텔레그램 지금 입장"],
    ["순서·최대 3", "HIGH", [P("obfuscation"), P("spread"), P("term:원금보장"), P("cta"), P("term:무료")], ["telegram"], ["guarantee", "conversion", "telegram"]],
    ["쇼츠 예시(영어)", "HIGH", [P("term:en:profit:guaranteed"), P("term:en:urgency:spots"), P("term:en:contact:tme"), P("combo:contact+invest")], ["telegram"], ["guarantee", "conversion", "telegram"]],
  ];
  for (const [name, level, reasons, ents, want, text] of CASES) it(`매핑: ${name}`, () => expect(signIds(level, reasons, ents, text ?? null)).toEqual(want));
  // 글 → 엔진 → 화면 문장 끝까지(코드 주입 없이). 엔진 단계와 무관하게 글에 없는 행동을 말하는 문장은 나오지 않는다(카이 60a5fbf·2e5de5a HOLD)
  const E2E: [string, SignId, boolean][] = [
    ["엄마 나 폰 액정 깨져서 임시번호로 연락해. 돈은 필요 없고 그냥 이 번호 저장해줘", "familyNewNumber", false],
    ["엄마 나 폰 고장나서 새 번호야. 입금은 안 해도 돼, 상품권도 필요 없어", "familyNewNumber", false],
    ["Hi Mum, my phone broke so this is my new number. I don't need any money, just save it.", "familyNewNumber", false],
    ["Hi Mum, new number! I'm not asking for money or gift cards, just saying hi.", "familyNewNumber", false],
    ["엄마 나 폰 고장나서 임시폰이야. 급하게 상품권 50만원어치 사서 핀번호 보내줘", "familyNewNumber", true],
    ["Hi Mum it's me, new number. Can you transfer £850 for a bill today?", "familyNewNumber", true],
    ["고객님의 택배 배송이 지연되고 있습니다. 배송조회: https://bit.ly/abc123", "deliveryLink", false],
    ["Your package delivery is delayed. Track: https://bit.ly/abc123", "deliveryLink", false],
    ["Your parcel is on the way and should arrive tomorrow. Tracking: https://bit.ly/abc123", "deliveryLink", false],
    ["[CJ대한통운] 주소 불일치로 배송 보류. 아래 링크 눌러 주소 수정하세요 https://cj-redeliv.top/x", "deliveryLink", true],
    ["USPS: your package could not be delivered. Click the link to update your address https://usps-redelivery.top/a", "deliveryLink", true],
    ["신용등급 관리 팁: 기존 대출은 상환 계획을 세우세요", "loanFee", false],
    ["저금리 대환대출 가능합니다. 기존 대출을 먼저 상환하셔야 승인됩니다 010-2222-3333", "loanFee", true],
    ["Part-time job opening at our store, apply in person", "sideJob", false],
    ["재택 부업 하루 30분, 상품 리뷰만 쓰면 일당 15만원", "sideJob", true],
  ];
  for (const [text, id, want] of E2E) it(`글→엔진→문장: ${want ? "있음" : "없음"} ${id} — ${text.slice(0, 28)}`, () => {
    const r = scoreText(text);
    const ids = signIds(r.label as "HIGH" | "REVIEW" | "LOW", r.reasons, extractEntities(text).map((e) => e.type), text);
    if (want) { expect(r.label).not.toBe("LOW"); expect(ids).toContain(id); } else expect(ids).not.toContain(id);
  });
  it("글이 없으면(계정 집계) 받은 메시지 행동 문장은 나가지 않는다", () => {
    for (const c of ["tactic:family", "tactic:delivery", "tactic:loan", "tactic:task"]) expect(signIds("HIGH", [P(c)], ["url", "phone"])).toEqual(["fallback"]);
  });
  it("수익 인증 문구 = 소현 원문(1791987441, 테오 1791987454)", () => {
    expect(STRINGS.ko.result.signs.profitProof).toEqual(["번 돈을 보여 준다는 '수익 인증'을 내세워요.", "수익인증사진은 AI로 딸깍, 쉽게 만들 수 있어요. 진정한 수익인증인지 알 수 없으니, 송금 전엔 반드시 다시 확인하세요."]);
    expect(STRINGS.en.result.signs.profitProof).toEqual(["It points to 'proof of profit' screenshots.", "Profit screenshots can be made with AI in one click. You can't tell if they're real, so check again before you send money."]);
    expect(STRINGS.ko.result.aiProofNote).toBe("수익 인증 사진·영상은 AI로 쉽게 만들 수 있어요. 믿기 전에 다시 확인하세요.");
    expect(STRINGS.en.result.aiProofNote).toBe("Profit photos and videos can easily be made with AI. Check again before you believe them.");
  });
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
    for (const t of ACCOUNT_KEY_TYPES) expect(await check([`${t}:real_person`], null, "HIGH"), t).toEqual({ counts: {}, similar: 0, gated: true });
  });
  it("모든 키 종류는 계정 키 또는 연락처 키 중 정확히 하나 (새 종류가 규칙 없이 들어오지 않게)", () => {
    expect([...ACCOUNT_KEY_TYPES, ...CONTACT_KEY_TYPES].sort()).toEqual([...KEY_TYPES].sort());
    expect(ACCOUNT_KEY_TYPES.filter((t) => (CONTACT_KEY_TYPES as readonly string[]).includes(t))).toEqual([]);
    expect(isAccountKey("handle:x")).toBe(true);
    expect(isAccountKey("telegram:x")).toBe(false);
  });
  it("두 조건이 따로 — 연결 수 기준은 그대로", () => {
    expect([2, 3].map(shown)).toEqual([0, 3]);
  });
});

describe("받은 메시지 징후 문장 (율 1791951936·1791951972)", () => {
  it("4번 문장에는 회사·기관 이름이 없음 · 7번 KR 에 '법으로 금지' 없음 · 일반 안내 마지막 줄은 KR 에만", () => {
    for (const L of [STRINGS.ko, STRINGS.en]) expect(L.result.signs.deliveryLink.join(" ")).not.toMatch(/CJ|한진|롯데|우체국|경찰청|국세청|FedEx|UPS|USPS|IRS/i);
    expect(STRINGS.ko.result.signs.loanFee[1]).toBe("대출을 도와준다며 수수료를 받는 건 법으로 금지예요. 돈을 보내기 전에 원래 은행에 직접 전화하세요.");   // 율 조문 확인 1791952046(대부업법 §11조의2②)
    expect(STRINGS.en.result.signs.loanFee.join(" ")).not.toMatch(/illegal|law/i);
    expect(STRINGS.ko.result.stopFooter).toContain("112");
    expect(STRINGS.en.result.stopFooter).toBe("");
  });
});

describe("AI 없이 확인 — 수동 신고 안내가 실제 전송 항목과 맞음 (카이 e2759fb)", () => {
  it("안내·확인 창에 계정·연락처·링크·서명이 모두 적혀 있음", () => {
    expect(STRINGS.ko.notice.aiOffOn).toMatch(/연락처·링크·계정, 그리고 \(고른 경우\) 글의 유사도 서명/);
    expect(STRINGS.ko.community.aiOffConfirm).toMatch(/연락처·링크·계정, 그리고 \(고른 경우\) 글의 유사도 서명/);
    expect(STRINGS.en.notice.aiOffOn).toMatch(/contacts, links and accounts you selected, and \(if chosen\) a similarity signature/);
    expect(STRINGS.en.community.aiOffConfirm).toMatch(/contacts, links and accounts you selected, and \(if chosen\) a similarity signature/);
  });
});
