/** Received-message tactics. Families are internal, independent of public signs.
 * A family contributes once; variants cannot inflate its score. New codes use
 * the existing generic public sentence until editorially approved copy exists.
 */
export type TacticFamily = "secrecy" | "withdrawal" | "install" | "room" | "romance" | "task" | "advance" | "recruiter" | "pressure" | "authority";
export interface TacticHit { family: TacticFamily; label: string; evidence: string; points: number }
const RULES: { family: TacticFamily; label: string; points: number; re: RegExp }[] = [
  { family: "authority", label: "공공기관 담당자라는 주장", points: 18,
    re: /\b(?:i am|i'm|this is|on behalf of|representing)\b[^.!?\n]{0,35}\b(?:police|fbi|irs|tax office|central bank|financial regulator)\b|(?:검찰|경찰|금융감독원|금감원|국세청|한국은행)\s*(?:(?:소속|의)\s*)?(?:수사관|검사|담당자|직원|조사관)|(?:검찰|경찰|금융감독원|금감원|국세청|한국은행)입니다/ },
  { family: "secrecy", label: "주변에 알리지 말라는 요구", points: 24,
    re: /\b(?:don't|do not|never) (?:tell|inform|discuss (?:this )?with) (?:anyone|anybody|your (?:family|bank|friends|spouse))\b|\bkeep (?:this|our (?:investment|arrangement)) (?:a secret|between us)\b|(?:가족|은행|친구|아무)[^.!?\n]{0,24}(?:말하지\s*마|알리지\s*마|비밀)|은행.{0,16}물어보면.{0,40}(?:라고|이라|말씀|말해)/ },
  { family: "withdrawal", label: "출금 전 추가 납부 요구", points: 30,
    re: /\b(?:pay|send|deposit|transfer|prepay)\b[^.!?\n]{0,65}\b(?:tax|fee|deposit|aml)\b[^.!?\n]{0,65}\b(?:withdraw|withdrawal|release|unlock)\b|\b(?:to withdraw|before (?:you can )?withdraw|withdrawal requires|release (?:your )?funds)\b[^.!?\n]{0,65}\b(?:pay|deposit|send|transfer)\b[^.!?\n]{0,35}\b(?:tax|fee|deposit|aml)\b|출금[^.!?\n]{0,55}(?:세금|수수료|보증금|심사비)[^.!?\n]{0,30}(?:먼저|선납|입금|납부|보내)|(?:세금|수수료|보증금|심사비)[^.!?\n]{0,30}(?:먼저|입금|납부)[^.!?\n]{0,30}출금/ },
  { family: "install", label: "거래·원격제어 앱 설치 요구", points: 18,
    re: /\b(?:install|download|sideload)\b[^.!?\n]{0,55}\b(?:apk|anydesk|teamviewer|remote (?:access|control)|our (?:trading )?(?:app|platform)|trading app)\b|(?:apk|원격\s*(?:제어|접속)|애니데스크|팀뷰어|거래\s*앱|전용\s*(?:앱|플랫폼))[^.!?\n]{0,35}(?:설치|다운로드)|(?:설치|다운로드)[^.!?\n]{0,35}(?:apk|거래\s*앱|원격\s*제어)/ },
  { family: "room", label: "투자방 초대와 수익 인증", points: 18,
    re: /\b(?:join|enter)\b[^.!?\n]{0,40}\b(?:vip|trading|signals?) (?:room|group)\b[^.!?\n]{0,70}\b(?:profit|earnings|proof|screenshots?)\b|(?:리딩방|vip\s*(?:방|룸))[^.!?\n]{0,65}수익\s*인증|수익\s*인증[^.!?\n]{0,65}(?:리딩방|vip\s*(?:방|룸))/ },
  { family: "romance", label: "애정 표현과 투자·대납 제안", points: 18,
    re: /\b(?:darling|sweetheart|my love|honey|our future)\b[^.!?\n]{0,100}\b(?:invest|investment|trading|crypto|deposit)\b|\b(?:i'll|i will|let me) (?:cover|pay|contribute) (?:half|50%)\b|(?:자기야|여보|사랑해|우리\s*미래)[^.!?\n]{0,70}(?:투자|입금|거래)|(?:절반|반은|반을)[^.!?\n]{0,15}(?:내가|제가)[^.!?\n]{0,15}(?:낼|내줄|부담)/ },
  { family: "task", label: "간단한 작업으로 수익을 준다는 제안", points: 18,
    re: /\b(?:product (?:reviews?|ratings?)|(?:liking|like|rate|review) (?:videos?|products?)|task (?:completion|orders?)|order completion|complete (?:\w+ ){0,3}(?:tasks?|orders?)|part[- ]time (?:job|work)|work from home|remote (?:job|work))\b|(?:상품|제품).{0,12}(?:리뷰|평점)|좋아요.{0,15}(?:알바|부업|수익)|(?:쇼핑몰|쿠팡|아마존|amazon).{0,20}(?:부업|알바)|(?:재택|부업|알바).{0,20}(?:고수익|하루|수익)|(?:하루|고수익).{0,20}(?:재택|부업|알바)|(?:작업|주문).{0,12}(?:완료|수행).{0,20}(?:수당|수익|커미션)/ },
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

/** A salary or employer name is not evidence of an implausible job offer. */
export function hasEasyMoneyPitch(text: string): boolean {
  return /(?:하루\s*\d+\s*분|고수익|고액\s*수당|경험\s*불필요|보장|확정)|\b(?:no (?:experience|skills?)|easy money|high[- ]paying|guaranteed|risk[- ]free|\d+ minutes? (?:a|per) day)\b/.test(text);
}
