import { describe, expect, it } from "vitest";
import { maskForAi } from "./mask";
import { reviewPrompt } from "./llm";
import { scoreText } from "@/engine";
import { DATA_NOTICE } from "./copy";
import { STRINGS } from "./strings";
import { POST } from "@/app/api/analyze/route";

/** 율 국내 배포 점검 ⑥⑦ (테오 1791955875) */
describe("AI 로 보내기 전 가림 ⑦", () => {
  const RAW = "연락 010-1234-5678 / +82 10 2222 3333 / 01099998888, 메일 kim.lee@gmail.com, 국민 123456-01-234567 입금, 계좌 110123456789, 신한 110-123-456789, 2024-09-08 300만원 t.me/vip_room";
  it("전화번호·계좌번호·이메일 원값이 남지 않고, 꼴과 끝자리·메신저 링크·날짜·금액은 남는다", () => {
    const m = maskForAi(RAW);
    for (const raw of ["1234-5678", "1234 5678", "2222 3333", "01099998888", "9998888", "kim.lee", "gmail", "123456-01", "110123456789", "110-123-456789"]) expect(m).not.toContain(raw);
    expect(m).toContain("010-****-5678");
    expect(m).toContain("k***@g***.com");
    expect(m).toContain("***-****-4567");
    expect(m).toContain("계좌 ***-****-6789");
    for (const kept of ["t.me/vip_room", "2024-09-08", "300만원"]) expect(m).toContain(kept);
  });
  it("재검 프롬프트에 원값이 들어가지 않는다", () => {
    const p = reviewPrompt(RAW, ["행동 유도 문구"]);
    expect(p).not.toMatch(/1234-5678|kim\.lee@gmail\.com|110123456789|123456-01-234567/);
    expect(p).toContain("010-****-5678");
  });
  it("가린 뒤에도 앱 판정이 같다 — 가림은 AI 프롬프트에만, 규칙 판정·징후는 원문으로 (번호·계좌·이메일이 든 유인·정상 글)", async () => {
    const CASES = [
      "급등주 무료 공개 텔레그램 t.me/vip_room_qq 원금보장 선착순 010 1234 5678",
      "엄마 나 폰 고장나서 임시폰이야. 급하게 상품권 사서 핀번호 보내줘. 010-9876-5432로 문자해",
      "출금하려면 세금 먼저 입금하셔야 합니다. 국민 123456-01-234567 예금주 홍길동",
      "저금리 대환대출 가능합니다. 기존 대출을 먼저 상환하셔야 승인됩니다 010-2222-3333",
      "[CJ대한통운] 주소 불일치로 배송 보류. 아래 링크 눌러 주소 수정하세요 https://cj-redeliv.top/x 문의 01055556666",
      "Guaranteed returns! Email vip.trader@proton.me or WhatsApp +82 10 4444 5555 now",
      "동창회 회비는 신한 110-123-456789로 보내 주세요. 문의는 총무 010-3333-4444",
      "택배 잘 받았어요. 감사합니다! 제 메일은 hong@naver.com 이에요",
    ];
    for (const t of CASES) {
      const res = await (await POST(new Request("http://x/api/analyze", { method: "POST", headers: { "content-type": "application/json", "x-real-ip": "198.51.100.77" }, body: JSON.stringify({ text: t }) }))).json();
      const raw = scoreText(t);
      expect(res.label, t).toBe(raw.label);   // 키 없는 시험 환경 = AI 재검 없음 → 앱 판정 = 원문 규칙 판정
      expect(res.score, t).toBe(raw.score);
      expect(maskForAi(t), t).not.toBe(t);    // 이 글들은 실제로 가림 대상이 있다
    }
  });
});

describe("옛 AI 고지 문구 ⑥", () => {
  it("Gemini·대체 모델·무료 티어 문구가 없고, 화면 고지(율 최종)와 같은 말", () => {
    for (const v of Object.values(DATA_NOTICE)) expect(v).not.toMatch(/Gemini|대체 모델|무료 티어/);
    expect(DATA_NOTICE.home).toContain(STRINGS.ko.notice.lead);
    expect(DATA_NOTICE.analyze).toBe(STRINGS.ko.analyze.notice);
  });
});
