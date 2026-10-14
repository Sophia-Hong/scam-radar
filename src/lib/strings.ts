/**
 * 공개 화면 문구 한영 정본 — 홈(LiveAnalyzer·판독 기준)·nav·footer.
 * - 규칙(조건·임계값·가점)은 어느 언어로도 쓰지 않는다 — 신호의 *종류*만 (소현 10-05, 테오 10-14).
 * - 사람 검토자·"확정 N건" 같은 표현은 쓰지 않는다 (소현 10-14 1791942256).
 * - 단정하지 않는다: "사기입니다" 대신 "~일 수 있어요/주의" — 업무방해·명예훼손 위험 (소현 10-14 1791943017). 법무 문구 검토 = 율(#compliance).
 * - 첫 화면은 누구나(특히 어르신) 쓴다: 큰 입력칸 하나 + 버튼 하나. "소중한 사람에게 보내기"로 링크를 보낸다 (소현 1791943795).
 * - 결과 문구 = 율 최종(#compliance 1791943988, 소현 O). [검토 요청]은 뺐다(소현).
 */
export type Lang = "ko" | "en";
export type Level = "HIGH" | "REVIEW" | "LOW";
export type GroupCode = "normalization" | "impersonation" | "evidence" | "conversion" | "infrastructure" | "coordination" | "identity";

export function langFrom(cookie: string | undefined, acceptLanguage: string | null | undefined): Lang {
  if (cookie === "ko" || cookie === "en") return cookie;
  return /^\s*ko\b/i.test(acceptLanguage ?? "") ? "ko" : "en";
}

const ko = {
  meta: { title: "Scam Radar — 돈 보내기 전에 확인", description: "받은 투자 권유 글·링크·계정을 넣으면 위험 신호가 있는지, 어떤 점이 이상한지, 지금 무엇을 하면 되는지 쉬운 말로 알려 드립니다. 자동 분석은 참고용이며 법적 판단이 아닙니다." },
  layout: { navCheck: "확인하기", navCriteria: "무엇을 보나", navCta: "지금 확인", footer: "자동 분석 결과는 참고용이며 법적 판단이 아닙니다. 특정 계정이나 사람을 사기로 단정하지 않습니다." },
  family: {
    lead: "누구나 이상한 투자 권유를 받을 수 있어요. 소중한 사람에게 이 페이지를 보내 주세요.",
    button: "소중한 사람에게 보내기",
    text: "이상한 투자 권유나 링크 받으면 여기 먼저 넣어 보세요.",
    copied: "링크를 복사했어요. 메신저에 붙여넣어 보내세요.",
    failed: "복사하지 못했어요. 주소창의 링크를 복사해 주세요.",
  },
  hero: {
    title: "돈 보내기 전에, 받은 글을 여기 넣어 보세요",
    placeholder: "의심 가는 글·링크·계정을 붙여 넣으세요\n\n예) 받은 카톡·문자·DM, t.me/… 링크, @계정명",
    aria: "확인할 글, 링크 또는 계정",
    check: "확인하기",
    checking: "확인 중…",
    sample: "예시로 해 보기",
    clear: "지우기",
    demo: "합성 사례 보기",
    scope: "투자 권유 글, 메신저 링크, Threads 계정을 확인할 수 있어요.",
  },
  notice: {
    home: "넣은 글은 저장하지 않습니다. 확인은 이 브라우저 안에서 먼저 이루어지고, 일부 글은 보조 AI가 다시 볼 수 있습니다. 이때 글이 서버를 거쳐 Google Gemini API로 전송될 수 있습니다(무료 티어 입력은 Google의 제품 개선에 사용될 수 있습니다). AI 재검토 결과(판정과 한 줄 근거)는 같은 글의 재요청을 줄이려고 저장될 수 있습니다.",
  },
  status: {
    known: (h: string, posts: number) => `@${h} 계정의 글 ${posts}건을 확인했어요.`,
    report: "자세한 리포트 →",
    noRecord: (h: string) => `@${h} 계정은 아직 확인한 기록이 없어요. 안전하다는 뜻은 아니에요 — 이 계정에서 받은 글을 붙여 넣어 보세요.`,
    open: "계정 열기 ↗",
    demoFail: "합성 데모 계정을 지금 불러오지 못해 예시 글로 대신 보여 드려요.",
  },
  result: {
    level: { HIGH: "위험 신호 높음", REVIEW: "위험 신호 중간", LOW: "위험 신호 낮음" } as Record<Level, string>,
    banner: {
      HIGH: { title: "사기일 수 있어요.", sub: "돈을 보내기 전에 가족이나 은행에 먼저 물어보세요." },
      REVIEW: { title: "조심하세요.", sub: "돈을 보내기 전에 가족이나 은행에 먼저 물어보세요." },
      LOW: { title: "뚜렷한 위험 신호는 못 찾았어요.", sub: "그래도 돈 이야기가 나오면 가족이나 은행에 먼저 물어보세요." },
    } as Record<Level, { title: string; sub: string }>,
    engine: { checking: "AI가 한 번 더 보는 중…", applied: "AI 재검토 반영", error: "AI 재검토 실패 · 규칙 결과", rule: "자동 분석" },
    signsTitle: "이런 점이 이상해요",
    signFallback: ["사기 글에서 자주 보이는 말이 여러 개 있어요.", "돈 이야기가 나오면 한 번 더 확인하세요."] as [string, string],
    signGuarantee: ["‘원금 보장’이라고 써 있어요.", "투자는 돈을 잃을 수 있어요. ‘절대 안 잃는다’는 말은 사기에서 자주 나와요."] as [string, string],
    signs: {
      infrastructure: ["텔레그램 같은 채팅방으로 오라고 해요.", "사기는 이렇게 모르는 방으로 데려가는 일이 많아요."],
      conversion: ["큰 수익이나 공짜 정보를 주겠다며 지금 하라고 해요.", "서두르게 하는 말은 생각할 시간을 빼앗아요."],
      impersonation: ["증권사나 큰 회사 직원이라고 소개해요.", "진짜 직원이 SNS에서 모르는 사람에게 투자 정보를 주는 일은 거의 없어요."],
      evidence: ["사원증이나 월급명세서 같은 ‘증거’를 보여 줘요.", "이런 사진은 쉽게 꾸며 만들 수 있어요."],
      normalization: ["글자를 일부러 이상하게 바꿔 썼어요.", "검사를 피하려고 이렇게 쓰는 일이 많아요."],
      coordination: ["똑같은 글이 여러 계정에 올라와 있어요.", "사기 글은 이렇게 여러 계정에 뿌려지는 일이 많아요."],
      identity: ["글의 자기소개와 계정 정보가 서로 달라요.", "사는 곳이나 하는 일을 꾸며 낸 경우가 있어요."],
    } as Record<GroupCode, [string, string]>,
    // 다른 채팅방 이동 — 텔레그램을 실제로 찾았으면 signs.infrastructure, 아니면 이 문장 (율 #compliance 1791944215)
    signChatRoom: ["모르는 채팅방으로 오라고 해요.", "사기는 이렇게 다른 방으로 데려가서 돈 얘기를 해요."] as [string, string],
    similar: (n: number) => `비슷한 글을 조심하라는 신고 ${n}건`,
    // 모든 결과 화면에 위험도와 상관없이 똑같이 — 계정 이야기가 아니라 일반 안내 (율 1791944215). 출처 표기는 금감원 원문 대조 뒤
    stopTitle: "이런 말을 들으면 멈추세요",
    stop: [
      "‘아무한테도 말하지 마세요’라고 하면 조심하세요. 사기는 가족이 말릴까 봐 비밀로 하라고 해요.",
      "번 돈을 찾으려는데 세금이나 수수료를 먼저 내라고 하면, 돈을 더 보내지 마세요. 사기에서 아주 자주 쓰는 말이에요.",
    ],
    todoTitle: "이렇게 하세요",
    todo: {
      HIGH: [
        "돈을 보내지 마세요. 앱이나 파일도 설치하지 마세요.",
        "보내기 전에 가족에게 이 화면을 먼저 보여 주세요.",
        "이미 보냈다면 바로 은행이나 112에 전화해 지급정지를 요청하세요.",
      ],
      REVIEW: [
        "확인하기 전에는 돈을 보내지 마세요.",
        "가족에게 먼저 보여 주세요.",
        "투자 업체라면 금융감독원 ‘파인’(fine.fss.or.kr)에서 등록된 곳인지 확인하세요.",
      ],
      LOW: [
        "돈 이야기가 나오면 보내기 전에 가족에게 먼저 물어보세요.",
        "투자 권유라면 금융감독원 ‘파인’에서 등록된 곳인지 확인하세요.",
      ],
    } as Record<Level, string[]>,
    reportTo: "상담·신고",
    reportLinks: [
      { name: "금융감독원 1332", url: "tel:1332" },
      { name: "경찰 112", url: "tel:112" },
      { name: "사이버범죄 신고(ECRM)", url: "https://ecrm.police.go.kr/minwon/main" },
    ],
    disclaimer: "이 화면은 컴퓨터가 글을 자동으로 살펴본 결과예요. 이 사람이 사기를 쳤다고 정한 것은 아니에요.",
    details: "자세한 근거 보기",
    detailsNote: "근거 이름과 인용은 엔진이 본 원문 표현입니다.",
    contactLine: "",   // 소현 답 대기: "잘못 표시됐으면: 메일주소" 한 줄 (율 1791943988)
    empty: "위 칸에 받은 글이나 링크를 넣고 ‘확인하기’를 눌러 주세요.",
  },
  community: {
    warn: (n: number, type: string) => `이 ${type === "threads" || type === "handle" ? "계정을" : type === "url" ? "링크를" : "연락처를"} 조심하라는 신고 ${n}건`,
    warnNote: "(저희가 확인한 건 아니에요)",
    button: "피해를 당했어요 · 신고하기",
    title: "주의 대상으로 신고",
    lead: "신고가 여러 명 모이면, 같은 계정·링크·연락처나 비슷한 글을 확인하는 다음 사람에게 ‘조심하라는 신고 N건’으로 보입니다.",
    textOption: "받은 글도 함께 신고 (글은 저장하지 않고, 비슷한 글을 알아보는 서명만 저장)",
    privacy: "넣은 글과 내 정보는 저장하지 않습니다. 한곳에서 여러 번 신고해도 1건으로 세요. 허위 신고는 다른 사람에게 피해를 줄 수 있어요.",
    none: "신고할 계정·링크·연락처나 글이 없어요.",
    submit: "신고하기",
    sending: "신고 중…",
    cancel: "닫기",
    done: "신고했어요. 신고가 여러 명 모이면 다음 사람에게 주의 표시로 보입니다.",
    limited: "잠시 후 다시 시도해 주세요. 신고는 시간당 횟수가 정해져 있어요.",
    failed: "지금은 신고할 수 없어요. 잠시 후 다시 시도해 주세요.",
    textKey: "받은 글(서명만)",
    kind: { threads: "Threads 계정", telegram: "텔레그램", kakao_open: "카카오 오픈채팅", kakao_channel: "카카오톡/채널", phone: "전화번호", handle: "아이디", url: "링크", line: "라인", wechat: "위챗" } as Record<string, string>,
  },
  criteria: {
    kicker: "무엇을 보나",
    title1: "사기 유인 신호",
    title2: " 판독 단계",
    lead: "어떤 종류의 신호를 보는지만 공개합니다. 점수 계산 방식과 기준값은 공개하지 않습니다.",
    badge: "DETERMINISTIC RULE ENGINE · 입력이 같으면 결과도 같음",
    aria: "판독 7단계",
    steps: [
      { label: "NORMALIZE", title: "숨긴 글자 복원", description: "글자를 가리거나 바꿔 쓴 표기를 같은 글자로 되돌려 봅니다.", chips: ["표기 변형 복원"] },
      { label: "IDENTITY", title: "기관·직업 주장", description: "기관이나 직업을 내세우는 이야기가 있는지 봅니다.", chips: ["기관·직업 주장"] },
      { label: "EVIDENCE", title: "증빙 언급 정황", description: "사원증·재직증명·급여명세 같은 증빙을 내세우는 표현이 글에 있는지 봅니다. 증빙의 진위를 판별하지는 않습니다.", chips: ["글 속 증빙 언급", "진위 판별 아님"] },
      { label: "CONVERSION", title: "투자 유인", description: "수익이나 정보를 미끼로 다음 행동을 요구하는 글인지 봅니다.", chips: ["수익 미끼", "행동 유도"] },
      { label: "INFRA", title: "외부 이동 안내", description: "다른 채널로 옮기자는 안내가 있는지, 같은 연락처를 쓰는 계정이 있는지 봅니다.", chips: ["외부 채널 안내", "공유 연락처"] },
      { label: "NETWORK", title: "계정·캠페인 연결", description: "비슷한 글이 여러 계정에서 반복되는지, 이용자들이 신고한 글과 비슷한지 봅니다.", chips: ["반복 게시", "다계정", "이용자 신고"] },
      { label: "CONTEXT", title: "맥락·오탐 방어", description: "피해 후기·경고·뉴스 같은 정상 맥락은 신호로 세지 않으려 합니다.", chips: ["피해·경고 맥락", "정상 활동"] },
    ],
    closing: "보내기 전에, 한 번 확인.",
    closingLink: "다른 글 확인하기 ↑",
  },
};

export type Strings = typeof ko;

const en: Strings = {
  meta: { title: "Scam Radar — check before you send money", description: "Paste an investment pitch, link or account you received. Scam Radar shows in plain words whether it has warning signs, what looks unusual, and what to do now. Automated analysis for reference only, not a legal judgment." },
  layout: { navCheck: "Check", navCriteria: "What we look at", navCta: "Check now", footer: "Automated analysis for reference only. Not a legal judgment, and it does not say that any account or person is a scammer." },
  family: {
    lead: "Anyone can get a strange investment offer. Send this page to someone you care about.",
    button: "Share with someone you care about",
    text: "Got a strange investment tip or link? Check it here first.",
    copied: "Link copied. Paste it into a chat to send.",
    failed: "Couldn't copy. Please copy the link from the address bar.",
  },
  hero: {
    title: "Before you send money, paste what you received here",
    placeholder: "Paste the suspicious message, link or account\n\ne.g. a chat or text message, a t.me/… link, @username",
    aria: "Message, link or account to check",
    check: "Check",
    checking: "Checking…",
    sample: "Try an example",
    clear: "Clear",
    demo: "See a synthetic example",
    scope: "Works with investment messages, messenger links and Threads accounts.",
  },
  notice: {
    home: "We do not store what you paste. It is checked in your browser first, and some messages may get a second look from an AI assistant; in that case the text is sent through our server to the Google Gemini API (free-tier input may be used by Google to improve its products). That AI result (a verdict and one-line reason) may be cached to avoid repeat requests.",
  },
  status: {
    known: (h: string, posts: number) => `Checked ${posts} posts from @${h}.`,
    report: "Full report →",
    noRecord: (h: string) => `We have no record of @${h} yet. That does not mean it is safe — paste a message you got from this account.`,
    open: "Open account ↗",
    demoFail: "We couldn't load the synthetic demo account, so here is an example message instead.",
  },
  result: {
    level: { HIGH: "Warning signs: high", REVIEW: "Warning signs: medium", LOW: "Warning signs: low" },
    banner: {
      HIGH: { title: "This could be a scam.", sub: "Before you send money, ask your family or your bank first." },
      REVIEW: { title: "Be careful.", sub: "Before you send money, ask your family or your bank first." },
      LOW: { title: "No clear warning signs found.", sub: "If money comes up, still ask your family or your bank first." },
    },
    engine: { checking: "AI taking a second look…", applied: "AI second look applied", error: "AI unavailable · rule result", rule: "Automated check" },
    signsTitle: "What looks wrong",
    signFallback: ["It uses several phrases common in scam messages.", "Double-check before any money is involved."],
    signGuarantee: ["It says “guaranteed.”", "Investing can lose money. Scams often promise you can't lose."],
    signs: {
      infrastructure: ["It asks you to move to a chat app like Telegram.", "Scams often pull you into a private chat."],
      conversion: ["It offers big profits or free tips and tells you to act now.", "Rushing you leaves no time to think."],
      impersonation: ["It says the writer works at a brokerage or big company.", "Real employees rarely give investment tips to strangers online."],
      evidence: ["It shows “proof” like a staff ID or pay slip.", "Pictures like these are easy to fake."],
      normalization: ["Some letters are changed on purpose.", "This is often done to slip past filters."],
      coordination: ["The same text appears on many accounts.", "Scam posts are often spread this way."],
      identity: ["The self-introduction doesn't match the account details.", "Where someone lives or works is sometimes made up."],
    },
    signChatRoom: ["It asks you to join a chat room you don't know.", "Scams often move you to another chat to talk about money."],
    similar: (n: number) => `${n} reports about messages like this`,
    stopTitle: "Stop if you hear this",
    stop: [
      "If they tell you not to tell anyone, be careful. Scams ask you to keep it secret so your family can't stop you.",
      "If you must pay a tax or fee before you can take your money out, don't send more money. Scams use this a lot.",
    ],
    todoTitle: "What to do",
    todo: {
      HIGH: [
        "Do not send money. Do not install any app or file.",
        "Show this screen to a family member before you do anything.",
        "Already paid? Call your bank (or 112 in Korea) now and ask them to stop the transfer.",
      ],
      REVIEW: [
        "Don't send money until you have checked.",
        "Show it to a family member first.",
        "If it's an investment firm, check it is registered (Korea: FSS “FINE”, fine.fss.or.kr).",
      ],
      LOW: [
        "If money comes up, ask a family member before you send anything.",
        "For any investment pitch, check the firm is registered first.",
      ],
    },
    reportTo: "Get help",
    reportLinks: [
      { name: "FSS hotline 1332 (Korea)", url: "tel:1332" },
      { name: "Police 112 (Korea)", url: "tel:112" },
      { name: "Cybercrime report (ECRM)", url: "https://ecrm.police.go.kr/minwon/main" },
    ],
    disclaimer: "A computer checked these posts automatically. This does not mean this person committed fraud.",
    details: "See the detailed signals",
    detailsNote: "Signal names and quotes come from the engine's original-language analysis.",
    contactLine: "",
    empty: "Paste a message or link above and press “Check”.",
  },
  community: {
    warn: (n: number, type: string) => `${n} reports about this ${type === "threads" || type === "handle" ? "account" : type === "url" ? "link" : "contact"}`,
    warnNote: "(we have not checked these reports)",
    button: "I was scammed · report it",
    title: "Report as suspicious",
    lead: "Once several people report it, the next person who checks the same account, link or contact — or a similar message — will see “N reports about this”.",
    textOption: "Also report the message (we keep only a similarity signature, not the text)",
    privacy: "We do not store what you pasted or who you are. Several reports from the same place count as 1. False reports can harm others.",
    none: "There is no account, link, contact or message to report.",
    submit: "Report",
    sending: "Reporting…",
    cancel: "Close",
    done: "Reported. Once several people report it, the next person will see a caution.",
    limited: "Please try again later — reports are limited per hour.",
    failed: "We couldn't send the report right now. Please try again shortly.",
    textKey: "The message (signature only)",
    kind: { threads: "Threads account", telegram: "Telegram", kakao_open: "KakaoTalk open chat", kakao_channel: "KakaoTalk channel", phone: "Phone", handle: "Username", url: "Link", line: "LINE", wechat: "WeChat" },
  },
  criteria: {
    kicker: "What we look at",
    title1: "Scam-lure signals",
    title2: ", step by step",
    lead: "We publish only the kinds of signals we look at. How scores are calculated and the thresholds stay private.",
    badge: "DETERMINISTIC RULE ENGINE · same input, same result",
    aria: "Seven checking steps",
    steps: [
      { label: "NORMALIZE", title: "Restore hidden text", description: "Characters swapped or broken up to dodge filters are turned back into plain text.", chips: ["Disguised spelling"] },
      { label: "IDENTITY", title: "Claimed employer or job", description: "Does the post lean on a company name or a job title?", chips: ["Employer claims"] },
      { label: "EVIDENCE", title: "“Proof” on display", description: "Does the post point to an ID badge, employment certificate or pay slip? We do not judge whether the document is genuine.", chips: ["Proof mentioned", "No forgery verdict"] },
      { label: "CONVERSION", title: "Investment bait", description: "Does it use profit or tips as bait and ask you to take the next step?", chips: ["Profit bait", "Call to act"] },
      { label: "INFRA", title: "Off-platform move", description: "Does it push you to another channel, and do other accounts share the same contact?", chips: ["Outside channel", "Shared contact"] },
      { label: "NETWORK", title: "Accounts and campaigns", description: "Is the same text repeated across many accounts, or similar to messages people have reported?", chips: ["Repeated posts", "Many accounts", "User reports"] },
      { label: "CONTEXT", title: "Context and false alarms", description: "Victim stories, warnings and news are not counted as lures.", chips: ["Victims & warnings", "Normal activity"] },
    ],
    closing: "Before you send, check once.",
    closingLink: "Check another message ↑",
  },
};

export const STRINGS: Record<Lang, Strings> = { ko, en };
