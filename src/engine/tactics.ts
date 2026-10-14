/** Received-message tactics. Families are internal, independent of public signs.
 * A family contributes once; variants cannot inflate its score. New codes use
 * the existing generic public sentence until editorially approved copy exists.
 */
export type TacticFamily = "secrecy" | "withdrawal" | "install" | "room" | "romance" | "task" | "advance" | "recruiter" | "pressure" | "authority" | "delivery" | "family" | "loan" | "marketplace" | "grant" | "crypto" | "support" | "gift" | "toll";
export interface TacticHit { family: TacticFamily; label: string; evidence: string; points: number }
const RULES: { family: TacticFamily; label: string; points: number; re: RegExp }[] = [
  { family: "loan", label: "대환대출 전 선납·수수료 요구", points: 24,
    re: /(?:저금리|대환\s*대출|기존\s*대출|신용\s*등급)[^.!?\n]{0,55}(?:먼저|선납|상환|수수료|입금|납부)|\b(?:low[- ]interest|refinanc(?:e|ing)|existing loan|credit score)[^.!?\n]{0,55}\b(?:first|prepay|repay|fee|pay|deposit)\b/ },
  { family: "marketplace", label: "중고거래 선입금·가짜 안전결제", points: 24,
    re: /(?:안전\s*결제|중고\s*거래|택배\s*거래)[^.!?\n]{0,55}(?:링크|선입금|먼저\s*입금|결제)|(?:선입금|먼저\s*입금)[^.!?\n]{0,45}(?:중고|택배|안전\s*결제)|\b(?:safe[- ]payment|second[- ]hand|marketplace|shipping deal)[^.!?\n]{0,55}\b(?:link|prepay|deposit|pay first)\b/ },
  { family: "grant", label: "지원금·환급금 기관 사칭", points: 18,
    re: /(?:지원금|환급금|재난지원금)[^.!?\n]{0,55}(?:신청|지급|확인|인증|링크|입금)|\b(?:government (?:grant|benefit)|tax refund|disaster (?:relief|payment))\b[^.!?\n]{0,55}\b(?:claim|verify|link|pay|confirm)\b/ },
  { family: "crypto", label: "가상자산 지갑·복구문구 요구", points: 24,
    re: /(?:에어드랍|지갑\s*(?:연결|복구)|시드\s*(?:문구|구문)|복구\s*문구)[^.!?\n]{0,55}(?:연결|입력|제공|확인|클릭)|\b(?:airdrop|wallet ?connect|seed phrase|recovery phrase)\b[^.!?\n]{0,55}\b(?:connect|enter|provide|verify|claim)\b/ },
  { family: "support", label: "기술지원 사칭 원격접속 요구", points: 24,
    re: /(?:해킹(?:됐|되었)|보안\s*문제|바이러스)[^.!?\n]{0,55}(?:원격|앱|설치|접속)|(?:원격(?:앱|제어|접속))[^.!?\n]{0,55}(?:설치|다운로드)|\b(?:hacked|security (?:alert|issue)|virus)\b[^.!?\n]{0,55}\b(?:remote|install|download|support)\b/ },
  { family: "gift", label: "상품권 코드 결제 요구", points: 24,
    re: /(?:상품권|기프트\s*카드)[^.!?\n]{0,55}(?:코드|번호|결제|구매|보내)|\b(?:gift cards?|voucher)\b[^.!?\n]{0,55}\b(?:code|number|pay|buy|send)\b/ },
  { family: "toll", label: "미납 통행료 납부 요구", points: 18,
    re: /(?:미납\s*(?:통행료|하이패스)|통행료\s*미납)[^.!?\n]{0,55}(?:납부|결제|링크|지금)|\b(?:unpaid toll|toll (?:payment|violation))\b[^.!?\n]{0,55}\b(?:pay|link|now|notice)\b/ },
  { family: "delivery", label: "배송·수령 관련 안내", points: 18,
    re: /\b(?:parcel|package|delivery|redelivery|shipping|track(?:ing)?|customs)\b|(?:택배|배송|운송장|수령|배달|우체국|화물|통관|배송주소|우편번호)/ },
  { family: "family", label: "가족·지인 사칭 가능성", points: 18,
    re: /\b(?:hi|hello)?\s*(?:mum|mom|dad|mother|father|grandma|grandpa|grandmother|grandfather)[,!]?[^.!?\n]{0,80}\b(?:new number|phone (?:is )?(?:broken|damaged)|temporary number)\b|\b(?:grandma|grandpa|grandmother|grandfather)[,!]?[^.!?\n]{0,80}\b(?:gift cards?|codes?|money)\b|(?:엄마|아빠|할머니|할아버지|엄마\s*,|아빠\s*,|딸인데|아들인데)[^.!?\n]{0,80}(?:폰|핸드폰|휴대전화|전화|액정|임시\s*번호|임시폰|고장|깨|상품권|돈)/ },
  { family: "authority", label: "공공기관 담당자라는 주장", points: 18,
    re: /\b(?:i am|i'm|this is|on behalf of|representing)\b[^.!?\n]{0,35}\b(?:police|fbi|irs|tax office|central bank|financial regulator)\b|\b(?:police|prosecutor|court|fss|financial supervisor|tax office|health insurance|government benefit|online banking|traffic fine)\b|(?:검찰|경찰|금융감독원|금감원|국세청|한국은행|법원|건강보험|민원24|경찰청|지방청|교통민원|도로교통)\s*(?:(?:소속|의)\s*)?(?:수사관|검사|담당자|직원|조사관)?|(?:검찰|경찰|금융감독원|금감원|국세청|한국은행)입니다/ },
  { family: "secrecy", label: "주변에 알리지 말라는 요구", points: 24,
    re: /\b(?:don't|do not|never) (?:tell|inform|discuss (?:this )?with) (?:anyone|anybody|your (?:family|bank|friends|spouse))\b|\bkeep (?:this|our (?:investment|arrangement)) (?:a secret|between us)\b|(?:가족|은행|친구|아무)[^.!?\n]{0,24}(?:말하지\s*마|알리지\s*마|비밀)|은행.{0,16}물어보면.{0,40}(?:라고|이라|말씀|말해)/ },
  { family: "withdrawal", label: "출금 전 추가 납부 요구", points: 30,
    re: /\b(?:pay|send|deposit|transfer|prepay)\b[^.!?\n]{0,65}\b(?:tax|fee|deposit|aml)\b[^.!?\n]{0,65}\b(?:withdraw|withdrawal|release|unlock)\b|\b(?:to withdraw|before (?:you can )?withdraw|withdrawal requires|release (?:your )?funds)\b[^.!?\n]{0,65}\b(?:pay|deposit|send|transfer)\b[^.!?\n]{0,35}\b(?:tax|fee|deposit|aml)\b|출금[^.!?\n]{0,55}(?:세금|수수료|보증금|심사비)[^.!?\n]{0,30}(?:먼저|선납|입금|납부|보내)|(?:세금|수수료|보증금|심사비)[^.!?\n]{0,30}(?:먼저|입금|납부)[^.!?\n]{0,30}출금/ },
  { family: "install", label: "거래·원격제어 앱 설치 요구", points: 18,
    re: /\b(?:install|download|sideload)\b[^.!?\n]{0,55}\b(?:apk|anydesk|teamviewer|remote (?:access|control)|our (?:trading )?(?:app|platform)|trading app)\b|(?:apk|원격\s*(?:제어|접속)|애니데스크|팀뷰어|거래\s*앱|전용\s*(?:앱|플랫폼))[^.!?\n]{0,35}(?:설치|다운로드)|(?:설치|다운로드)[^.!?\n]{0,35}(?:apk|거래\s*앱|원격\s*제어)/ },
  { family: "room", label: "투자방 초대와 수익 인증", points: 18,
    re: /\b(?:join|enter)\b[^.!?\n]{0,40}\b(?:vip|trading|signals?) (?:room|group)\b[^.!?\n]{0,70}\b(?:profit|earnings|proof|screenshots?)\b|(?:리딩방|vip\s*(?:방|룸))[^.!?\n]{0,65}수익\s*인증|수익\s*인증[^.!?\n]{0,65}(?:리딩방|vip\s*(?:방|룸))/ },
  { family: "romance", label: "애정 표현과 투자·대납 제안", points: 18,
    re: /\b(?:darling|sweetheart|my love|honey|our future)\b[^.!?\n]{0,100}\b(?:invest|investment|trading|crypto|deposit)\b|\b(?:i'll|i will|let me) (?:cover|pay|contribute) (?:half|50%)\b|(?:자기야|여보|사랑해|우리\s*미래)[^.!?\n]{0,70}(?:투자|입금|거래|코인|가상화폐)|(?:절반|반은|반을)[^.!?\n]{0,15}(?:내가|제가)[^.!?\n]{0,15}(?:낼|내줄|부담)/ },
  { family: "task", label: "간단한 작업으로 수익을 준다는 제안", points: 18,
    re: /\b(?:product (?:reviews?|ratings?)|(?:liking|like|rate|review(?:ing)?) (?:videos?|products?)|task (?:completion|orders?)|order completion|complete (?:\w+ ){0,3}(?:tasks?|orders?)|part[- ]time (?:job|work)|work from home|remote (?:job|work))\b|(?:상품|제품).{0,12}(?:리뷰|평점)|좋아요.{0,15}(?:알바|부업|수익)|(?:쇼핑몰|쿠팡|아마존|amazon).{0,20}(?:부업|알바)|(?:재택|부업|알바).{0,20}(?:고수익|하루|수익)|(?:하루|고수익).{0,20}(?:재택|부업|알바)|(?:작업|주문).{0,12}(?:완료|수행).{0,20}(?:수당|수익|커미션)/ },
  { family: "advance", label: "수당·작업 진행 전 선입금 요구", points: 30,
    re: /\b(?:prepay|pay|deposit|top up|recharge|send)\b[^.!?\n]{0,60}\b(?:unlock (?:\w+ ){0,3}(?:commission|tasks?|orders?)|commission|tasks?)\b|\b(?:unlock|release)\b[^.!?\n]{0,40}\bcommission\b[^.!?\n]{0,40}\b(?:deposit|payment|pay)\b|(?:수당|커미션|작업)[^.!?\n]{0,45}(?:선입금|충전|보증금|먼저\s*입금|선결제)|(?:선입금|충전|선결제)[^.!?\n]{0,40}(?:수당|커미션|작업)/ },
  { family: "recruiter", label: "기업 채용 담당자라는 주장", points: 12,
    re: /\b(?:i'm|i am|this is|from|representing)\b[^.!?\n]{0,45}\b(?:amazon|coupang|shopping platform)\b[^.!?\n]{0,25}\b(?:hr|recruiter|recruitment|hiring)\b|(?:아마존|쿠팡|쇼핑몰).{0,20}(?:인사팀|채용\s*담당|채용팀)/ },
  { family: "pressure", label: "짧은 기한 안에 납부 요구", points: 10,
    re: /\b(?:pay|transfer|deposit|complete)\b[^.!?\n]{0,50}\b(?:today|immediately|within \d+ (?:minutes?|hours?))\b|(?:오늘\s*안|즉시|\d+\s*분\s*안)[^.!?\n]{0,25}(?:입금|송금|납부|완료)/ },
];
export function findTactics(text: string): TacticHit[] {
  return RULES.flatMap(({ re, ...rule }) => {
    const m = text.toLowerCase().match(re);
    return m ? [{ ...rule, evidence: m[0] }] : [];
  });
}

export interface ReceivedActionSignals {
  link: boolean;
  callback: boolean;
  install: boolean;
  money: boolean;
  credential: boolean;
  urgency: boolean;
}

const OFFICIAL_LINK = /(?:^|\.)(?:go\.kr|gov\.kr|gov|cjlogistics\.com|epost\.go\.kr|hanjin\.com|lottegls\.com|ups\.com|usps\.com|usps\.gov|irs\.gov|kbstar\.com|shinhan\.com|wooribank\.com|ibk\.co\.kr|nhbank\.com|kebhana\.com)$/i;
const URL = /(?:https?|hxxps?):\/\/([^\s/\]>*]+)|\b([a-z0-9-]+\.(?:com|co|kr|info|net|at|gd|ly))\b/gi;

/**
 * Received-message actions are deliberately narrower than generic words such
 * as "link" or "call": they need an actual destination, callback number, or
 * request for money, credentials, or an install.  Official courier/government
 * hosts are not treated as suspicious links.
 */
export function receivedActionSignals(text: string): ReceivedActionSignals {
  const lower = text.toLowerCase();
  let link = /<\s*url\s*>|\[\.\]|hxxps?:\/\//i.test(lower);
  for (const match of lower.matchAll(URL)) {
    const host = (match[1] ?? match[2] ?? "").replace(/^www\./, "").replace(/[^a-z0-9.-].*$/, "");
    if (host && !OFFICIAL_LINK.test(host)) link = true;
  }
  const callback = /(?:\b(?:call|phone|reply|text|whatsapp|telegram)\b[^.!?\n]{0,30}(?:\+?\d[\d -]{6,}\d|here|now|yes|interested)|(?:전화|연락|문자|카톡|텔레그램)[^.!?\n]{0,30}(?:\d{2,4}[- ]?\d{3,4}[- ]?\d{4}|추가|주세요|바람|답장)|\b\+?\d{1,3}[ -]?\(?\d{2,4}\)?[ -]?\d{3,4}[ -]?\d{4}\b)/.test(lower);
  const install = /\b(?:install|download|sideload)\b[^.!?\n]{0,50}\b(?:app|apk|software|application|anydesk|teamviewer)\b|(?:앱|apk|어플|원격\s*(?:제어|접속))[^.!?\n]{0,35}(?:설치|다운로드)|(?:설치|다운로드)[^.!?\n]{0,35}(?:앱|apk|어플|원격)/.test(lower);
  const money = /\b(?:pay|payment|transfer|send money|deposit|fee|fine|gift cards?|daily pay)\b|(?:입금|송금|납부|결제|수수료|벌금|상품권|수리비|환급)/.test(lower);
  const credential = /\b(?:verify|confirm|re-?confirm|log ?in|identity|password|access details|otp)\b|(?:인증|본인확인|신분증|카드\s*(?:사진|정보)|비밀번호|로그인)/.test(lower);
  const urgency = /\b(?:now|immediately|urgent|today|shortly|pending|failed|unable|within \d+ (?:minutes?|hours?)|\d+ hours?|expires? in)\b|(?:긴급|즉시|오늘\s*안|보류|취소|지연|불일치|반송|배송\s*중단|\d+\s*(?:시간|분)\s*(?:이내|안)|바로|최대한\s*빨리)/.test(lower);
  return { link, callback, install, money, credential, urgency };
}

/** A salary or employer name is not evidence of an implausible job offer. */
export function hasEasyMoneyPitch(text: string): boolean {
  return /(?:하루\s*\d+\s*분|고수익|고액\s*수당|경험\s*불필요|보장|확정)|\b(?:no (?:experience|skills?)|easy money|high[- ]paying|guaranteed|risk[- ]free|\d+ minutes? (?:a|per) day)\b/.test(text);
}

/**
 * A promise to protect investment principal or guarantee investment profit is
 * independently illegal only when it is part of a solicitation. It is
 * deliberately narrower than the general profit lexicon: ordinary warranties,
 * regulated-product disclosures, and vague "guaranteed results" claims do not
 * match. Call this only after clause-local warning/negation removal.
 */
export const ILLEGAL_GUARANTEE = /원금\s*보장|손실\s*보전|확정\s*수익|\b(?:guaranteed?\s+(?:returns?|profits?|income|roi)|(?:returns?|profits?|income|roi)\s+(?:are |is )?(?:fully |100% )?guaranteed|no[- ]risk\s*,?\s*guaranteed|risk[- ]free\s+(?:returns?|profits?)|principal\s+(?:is\s+)?(?:guaranteed|protected))\b/i;
const LOSS_COMPENSATION = /손실.{0,24}(?:책임지|메꿔|보상|보전)/;
const INVESTMENT_CONTEXT = /(?:투자|매수|매도|종목|주식|코인|수익|거래)/;
const INVESTMENT_SOLICITATION = /(?:투자(?:금|비|액|금액)?|매수|매도|종목|주식|코인|가상자산|수익(?:률)?|roi|returns?|profits?|income|stock(?:s| picks?)?|crypto|coin|trading|investment|leading\s*(?:room|group)|리딩\s*(?:방|룸)|(?:가입|입장|문의|연락|상담|dm|message|contact|텔레그램|카카오(?:톡)?|오픈채팅).{0,30}(?:주세요|하세요|드립|offer|join|message|contact)|(?:드립니다|제공합니다|권유합니다|추천합니다))/i;
const INSTITUTIONAL_DISCLOSURE = /(?:예금자\s*보호|예금보험공사|예금\s*보험|보험\s*약관|fdic|deposit\s+insurance|insured\s+(?:savings|deposit)|insurance\s+policy|(?:bank|은행).{0,50}(?:disclosure|약관|상품\s*설명|설명서)|(?:disclosure|약관|상품\s*설명|설명서).{0,50}(?:bank|은행)|principal[-\s]*protected\s+note)/i;

export function hasIllegalInvestmentGuarantee(text: string): boolean {
  if (INSTITUTIONAL_DISCLOSURE.test(text)) return false;
  return (ILLEGAL_GUARANTEE.test(text) && INVESTMENT_SOLICITATION.test(text)) ||
    (LOSS_COMPENSATION.test(text) && INVESTMENT_CONTEXT.test(text) && INVESTMENT_SOLICITATION.test(text));
}

export function illegalGuaranteeEvidence(text: string): string | undefined {
  return ILLEGAL_GUARANTEE.exec(text)?.[0] ?? (LOSS_COMPENSATION.exec(text)?.[0]);
}
