import { describe, expect, it } from "vitest";
import { normalize } from "./normalize";
import { scoreText } from "./score";
import { activeContext } from "./context";
import { findTactics } from "./tactics";

const has = (text: string, family: string) => findTactics(normalize(text).text).some(t => t.family === family);

describe("isolated-letter normalization", () => {
  it.each([
    ["g u a r a n t e e d profits", "guaranteed profits"],
    ["t.e-l_e·g r a m", "telegram"],
    ["g . u - a _ r · a n t e e d profits", "guaranteed profits"],
    ["ｗ ｈ ａ ｔ ｓ ａ ｐ ｐ", "whatsapp"],
    ["g\u200bu\u200ba\u200br\u200ba\u200bn\u200bt\u200be\u200be\u200bd", "guaranteed"],
    ["텔.레-그_램", "텔.레-그_램"],
    ["I am a trader", "i am a trader"],
    ["stock picks are free", "stock picks are free"],
  ])("normalizes %s", (input, expected) => expect(normalize(input).text).toBe(expected));
  it("preserves word boundaries in ordinary prose", () => {
    expect(scoreText("An admin gets freedom to discuss an investment.").categories.contact).toBe(0);
    expect(normalize("a modern stock picking method").text).toBe("a modern stock picking method");
  });
  it("recovers spaced English guarantees and signals", () => {
    expect(scoreText("Get my s t o c k p i c k s, g u a r a n t e e d profits. Message me on t.e-l_e·g r a m.").label).toBe("HIGH");
  });
});

describe("giver-side conversion", () => {
  it.each([
    "Tap the profile button for trading picks. Guaranteed profits, limited seats.",
    "Stock picks with risk-free returns. Comment READY and I will send the details.",
    "무료 급등주 종목표를 프로필 안내에서 받아가세요. 원금보장 확정수익.",
    "원금보장 종목추천 자료는 댓글 남겨 주시면 공유드려요.",
  ])("recognizes offer: %s", text => expect(scoreText(text).label).toBe("HIGH"));
  it.each([
    "Comment MAP and I will send the walking route.",
    "Please send me your stock list for my university assignment.",
    "댓글 남기시면 빵 레시피 보내드려요.",
    "프로필 버튼에 전시회 입장 안내가 있습니다.",
  ])("keeps ordinary offers below HIGH: %s", text => expect(scoreText(text).label).not.toBe("HIGH"));
});

describe("received-message families", () => {
  it.each([
    ["Please do not tell your bank about our arrangement.", "secrecy"],
    ["가족한테 알리지 마세요. 우리끼리 진행해요.", "secrecy"],
    ["은행에서 물어보면 생활비라고 말해 주세요.", "secrecy"],
    ["Pay the clearance tax to release your withdrawal.", "withdrawal"],
    ["출금 진행을 위해 보증금 먼저 입금하세요.", "withdrawal"],
    ["Download our trading platform to continue.", "install"],
    ["원격 제어 앱을 설치하세요.", "install"],
    ["Join our VIP room and inspect the profit screenshots.", "room"],
    ["리딩방 회원들의 수익 인증을 보세요.", "room"],
    ["Sweetheart, invest in this trading account for our future.", "romance"],
    ["절반은 제가 내줄게요.", "romance"],
    ["Product reviews are your tasks for this part-time job.", "task"],
    ["쿠팡 부업으로 상품 평점을 남기면 됩니다.", "task"],
    ["Recharge your balance to unlock the next order.", "advance"],
    ["작업 진행을 위해 먼저 입금해야 합니다.", "advance"],
    ["This is Amazon recruitment, offering remote work.", "recruiter"],
    ["쿠팡 채용 담당 직원입니다.", "recruiter"],
    ["Transfer the balance within 15 minutes.", "pressure"],
    ["I am representing the tax office. Pay the clearance tax before withdrawal.", "authority"],
    ["국세청 소속 조사관입니다.", "authority"],
    ["오늘 안에 송금하세요.", "pressure"],
  ])("detects family in %s", (text, family) => expect(has(text, family)).toBe(true));

  it.each([
    "Pay the processing fee before withdrawal. Do not tell your family.",
    "출금하려면 보증금 먼저 납부하세요. 가족에게 말하지 마세요.",
    "Complete product reviews for commission. Deposit money to unlock tasks.",
    "상품 리뷰 알바입니다. 수당을 받으려면 선입금이 필요합니다.",
    "I am from Amazon HR. Part-time work, no experience, earn $450 daily. Message me on WhatsApp.",
    "쿠팡 인사팀입니다. 하루 고수익 재택 알바, 카톡으로 문의하세요. 일급 40만원.",
    "Darling, invest in our future. Pay the tax before withdrawal; I will cover half.",
    "출금하려면 수수료 먼저 입금하세요. 전용 거래 앱을 설치하세요.",
  ])("promotes a payment demand plus independent tactic families: %s", text => {
    const result = scoreText(text);
    expect(result.reasons.some(r => r.code === "combo:received")).toBe(true);
    expect(result.label).toBe("HIGH");
    expect(result.reasons.some(r => r.code === "gate:no-contact")).toBe(false);
  });

  it.each([
    "Don't tell your family about the surprise picnic.",
    "Download our platform for the conference.",
    "IT support: install AnyDesk to repair your printer.",
    "Withdrawal fee: $2, deducted automatically from the balance.",
    "Withdrawal fee: $2, deducted automatically. Download our trading app. Contact us on Telegram.",
    "Order completion: pay for your orders before shipping. Contact us on WhatsApp.",
    "쇼핑몰 주문 완료 후 선결제해 주세요. 문의는 카톡으로 가능합니다.",
    "Do not pay the fee before withdrawal or install our trading platform. It's a scam. Telegram support is fake.",
    "I work in Amazon HR and enjoy my part-time job.",
    "I am from Amazon HR. Part-time work, earn $25 per hour. Message me on WhatsApp.",
    "쿠팡 인사팀 채용 담당입니다. 상품 리뷰 알바, 시급 15000원. 카톡으로 문의하세요.",
    "We hire product reviewers for $18 per hour. Apply on our official careers page.",
    "상품 리뷰 알바 후기: 재택으로 일하며 시간당 급여를 받습니다.",
    "쇼핑몰에서 주문 완료 후 상품을 배송합니다.",
    "은행 수수료는 출금액에서 자동 차감됩니다.",
    "수익 인증 이미지를 저장했습니다.",
    "Honey, our retirement investment lost value this quarter.",
    "자기야 우리 투자 현황을 내일 같이 확인하자.",
  ])("does not label a benign message HIGH: %s", text => expect(scoreText(text).label).not.toBe("HIGH"));
  it("cannot inflate a family by repetition", () => {
    expect(findTactics("Do not tell your family. Never tell anyone. Keep this a secret.").filter(t => t.family === "secrecy")).toHaveLength(1);
  });
});

describe("local quote and negation scope", () => {
  it.each([
    'A research dataset contains "risk-free stock picks, guaranteed profits, message me on Telegram" for analysis.',
    'If someone writes "pay the tax before withdrawal, keep this a secret", do not reply.',
    '연구 자료에 "원금보장 급등주 종목추천 텔레그램 문의"라는 문구가 있습니다.',
    'Our bot tracks stock prices on Telegram. We do not sell buy signals or guarantee profits.',
    '텔레그램 가격 알림 봇입니다. 매수 신호를 판매하지 않습니다.',
  ])("does not score attributed/negated claims: %s", text => expect(scoreText(text).label).not.toBe("HIGH"));
  it("bare quotes remain observable received-message evidence", () => {
    expect(scoreText('"Pay the tax before withdrawal. Do not tell your family. Telegram @support_desk"').label).toBe("HIGH");
  });
  it.each([
    'Research quotes "free stock tips". But join my Telegram group for guaranteed profits and risk-free stock picks.',
    'We do not sell signals, but guaranteed returns on our stock picks. Message me on WhatsApp.',
    '경고 문구는 "원금보장"입니다. 하지만 텔레그램으로 오세요. 급등주 종목추천 확정수익 무료 제공드립니다.',
  ])("preserves independent positive solicitations: %s", text => expect(scoreText(text).label).toBe("HIGH"));
  it("does not erase quoted recruiter text without warning attribution", () => {
    expect(activeContext('Received: "Complete tasks. Prepay to unlock commission."').excluded).toHaveLength(0);
  });
});

describe("illegal investment guarantees", () => {
  it.each([
    "원금 보장으로 투자금을 운용합니다.",
    "손실 보전 약속, 확정 수익을 드립니다.",
    "주식 매수는 제 지시대로 하고 손실 나면 제가 메꿔드립니다.",
    "Guaranteed returns from this investment package.",
    "No risk, guaranteed profit on your capital.",
  ])("is HIGH as a single prohibited promise: %s", text => {
    const result = scoreText(text);
    expect(result.label).toBe("HIGH");
    expect(result.reasons.some(r => r.code === "guarantee:illegal")).toBe(true);
  });

  it.each([
    "원금 보장을 약속하는 투자는 불법이니 피하세요.",
    "We do not guarantee returns; investments can lose value.",
    'News analysis quotes "guaranteed profits" as a warning sign.',
    "Our appliance repair comes with guaranteed results.",
  ])("keeps warning, negation, quotation, and non-investment use below HIGH: %s", text => {
    expect(scoreText(text).label).not.toBe("HIGH");
  });
});
