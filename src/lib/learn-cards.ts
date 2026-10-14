import type { Lang } from "./strings";

/**
 * "이렇게 속여요" 정보 카드 8장 — 문구는 theo-workspace reports/scam-radar/2026-10-14-info-cards-draft.md v3 그대로(율 대조 O, 테오 1791955209).
 * 사례가 "(비움)"인 카드는 사례 줄 없음. 위조 신분증 카드는 이미지 없이 글만(율: 위조 이미지 생성·게시 금지).
 * 출처 링크: "관계부처 합동" 보도자료는 정부 원본 링크를 확인하기 전까지 링크 없이 제목·날짜만(지금 링크는 은행·연구원 사본).
 * 게시 전 소현 게이트 — 출고 후보와 별개 커밋.
 */
export interface Source { org: string; title: string; date: string; url?: string }
export interface LearnCard { title: string; looks: string; example?: string[]; source?: Source; todo: string }

const MOIS_2022: Source = { org: "관계부처 합동", title: "추석 명절, 택배와 금융거래 사칭 문자사기 주의!", date: "2022-08-31" };
const MOIS_2024: Source = { org: "관계부처 합동", title: "추석 명절 사이버사기 주의 보도자료", date: "2024-09-08" };
const USPIS: Source = { org: "U.S. Postal Inspection Service", title: "Smishing: Package Tracking Text Scams", date: "2024-08-29", url: "https://www.uspis.gov/news/scam-article/smishing-package-tracking-text-scams" };
const FTC: Source = { org: "U.S. Federal Trade Commission", title: "That job offer text is probably a scam", date: "2026-04-30", url: "https://consumer.ftc.gov/consumer-alerts/2026/04/job-offer-text-probably-scam" };

export const LEARN_CARDS: Record<Lang, LearnCard[]> = {
  ko: [
    { title: "수익 인증 그래프·계좌 캡처",
      looks: "\"이 방에서 하루 만에 수백만 원 벌었어요\" 같은 그래프나 계좌 화면을 보여줘요. 다른 사람들이 \"저도 벌었어요\" 하며 같이 올려요.",
      todo: "이런 사진과 영상은 AI로 쉽게 만들 수 있어요. 수익 인증만 보고 돈을 보내지 마세요." },
    { title: "위조 신분증·사원증·명함",
      looks: "\"저 ○○증권 직원이에요\" 하며 사원증·명함·신분증 사진을 보내 믿게 해요.",
      todo: "신분증·사원증 사진도 쉽게 만들 수 있어요. 그 회사 대표 번호로 직접 전화해서 그런 직원이 있는지 물어보세요." },
    { title: "가족 사칭 (\"엄마 폰 고장났어\")",
      looks: "아들·딸이라며 폰이 고장 나 새 번호로 연락한다고 해요. 곧 돈, 상품권, 신분증 사진을 달라고 해요.",
      example: ["엄마, 딸인데, 핸드폰 액정이 깨져서 대리점에서 임시 폰 받았어. 전화통화 안되니까 카톡 친구 추가해줘"], source: MOIS_2022,
      todo: "원래 번호로 전화해서 진짜 가족인지 먼저 확인하세요. 신분증 사진은 절대 보내지 마세요." },
    { title: "택배 사칭 문자",
      looks: "주소가 틀려서 배송이 안 된다며 링크를 누르라고 해요.",
      example: ["고객님 택배 배송주소 불일치로 물품이 취소 되었습니다.배송주소 확인 <링크>"], source: MOIS_2024,
      todo: "문자 속 링크는 누르지 마세요. 택배회사 앱이나 대표 번호로 직접 확인하세요." },
    { title: "기관 사칭 (경찰·국세청·법원·과태료)",
      looks: "경찰서·국세청·법원이라며 신고가 접수됐다, 벌금이 있다고 겁을 줘요. 링크나 전화번호를 줘요.",
      example: ["[경찰청교통민원]교통법규위반 사실확인통지서(통지): <링크>"], source: MOIS_2022,
      todo: "문자 속 링크로 내지 말고, 그 기관 대표 번호나 공식 앱에서 직접 확인하세요. 이상하면 112에 물어보세요." },
    { title: "주식 리딩방·VIP방",
      looks: "공짜로 급등 종목을 알려준다며 채팅방이나 단체방으로 오라고 해요. 나중에 가짜 거래 앱에 돈을 넣게 해요.",
      example: ["이번 쑤익율 28% 종목 무료수령!! <링크>", "억을 모으는 방법 300만▶1984만 소요기간 단 3일 <링크> 상담"], source: MOIS_2024,
      todo: "정식 증권회사도 '원금 보장'·'수익 보장'을 약속하는 건 원칙적으로 법으로 막혀 있어요. 금융감독원 1332에 그 회사가 등록됐는지 물어보세요." },
    { title: "부업·리뷰 알바",
      looks: "하루 30분이면 큰돈을 번다며 리뷰나 '좋아요' 일을 줘요. 처음엔 조금 주다가 돈을 넣으라고 해요.",
      example: ["추석 돈 나갈 일 많으시죠? 하루 30분이면 충분합니다. <링크>"], source: MOIS_2024,
      todo: "일을 하려고 내 돈을 먼저 넣어야 한다면 사기일 때가 대부분이에요." },
    { title: "대출 수수료 선납",
      looks: "싼 이자로 바꿔준다며 지금 대출을 먼저 갚거나 수수료를 내라고 해요.",
      todo: "대출을 도와준다며 수수료를 받는 건 법으로 금지예요(대부업법 §11조의2). 원래 은행에 직접 전화하세요." },
  ],
  en: [
    { title: "Profit screenshots", looks: "They show graphs or bank screens of huge profits, and others say \"I made money too.\"",
      todo: "These pictures can easily be made with AI. Don't send money because of them." },
    { title: "Fake ID or staff cards", looks: "They send a photo of an ID or company badge to seem real.",
      todo: "Call the company's main number to check." },
    { title: "\"Hi Mum, new number\"", looks: "Someone says they're your child with a broken phone, then asks for money, gift cards or an ID photo.",
      todo: "Call their old number first." },
    { title: "Delivery texts", looks: "A text says your package can't be delivered and asks you to tap a link.",
      todo: "USPS tracking texts you asked for will not contain a link (US Postal Inspection Service). Don't tap the link. Check in the carrier's own app.", source: USPIS },
    { title: "Government or bank impersonation", looks: "Fines, cases, suspended accounts, with a link.",
      todo: "Don't pay through the link. Check with the agency's own number or official app." },
    { title: "Stock tip rooms", looks: "Free tips, then a private chat and a fake trading app.",
      todo: "\"Guaranteed returns\" is a red flag." },
    { title: "Task jobs", looks: "Easy online \"tasks\" for big pay, then you are asked to deposit money.",
      todo: "\"Never pay to get paid or get a job.\" (US FTC, 2026-04-30)", source: FTC },
    { title: "Loan fees up front", looks: "A cheaper loan if you pay a fee first.",
      todo: "Call your own bank directly." },
  ],
};
