/**
 * English lure lexicon — mirrors the Korean signal families in lexicon.ts.
 *
 * Korean terms are matched as substrings of normalize().compact (Korean words survive that well).
 * English words do not: "dm" is inside "admin", "free" inside "freedom". So every English entry
 * carries a word-boundary regex `re`, matched against normalize().text (lowercased, homoglyph-folded,
 * zero-width-stripped, spaces kept). Entries with `on: "compact"` are matched against the
 * separator-stripped form instead, for distinctive platform names that get spaced out or dotted
 * ("W h a t s A p p", "t.e.l.e.g.r.a.m").
 *
 * Labels are user-visible; they name what was seen, never how it is scored.
 * Weights and category points live in score.ts / here as numbers only.
 *
 * Browser-bundled (explain.ts imports TERMS) — no node imports.
 */
import type { Term, Category } from "./lexicon";

const T = (id: string, cat: Category, re: RegExp, label: string, w?: number, extra: Partial<Term> = {}): Term =>
  ({ term: `en:${id}`, cat, re, label, w, lang: "en", ...extra });

export const EN_TERMS: Term[] = [
  // ── lure to contact / off-platform chat ──
  T("contact:whatsapp", "contact", /whatsapp|watsapp|whatsap/, "WhatsApp 유도", 1, { on: "compact" }),
  T("contact:wa-link", "contact", /\bwa\.me\/|chat\.whatsapp\.com|api\.whatsapp\.com/, "WhatsApp 링크"),
  T("contact:tme", "contact", /\bt\.me\/|\btelegram\.me\//, "텔레그램 링크"),
  T("contact:signal", "contact", /\bsignal\.(me|group)\b|\b(on|via|add me on|message me on|text me on) signal\b|\bsignal (app|messenger|username|id)\b/, "Signal 메신저 유도", 0.9),
  T("contact:dm-me", "contact", /\b(dm|pm|inbox|message|msg|text|whatsapp|telegram) (me|us)\b/, "개인 메시지(DM) 유도"),
  T("contact:dm-for", "contact", /\bdm (for|to|now|if|me)\b|\bsend (me|us) an? (dm|pm|message|text)\b|\bslide into (my |our )?dms?\b|\bdrop (me|us) an? (dm|message)\b|\bcheck (your|my) dms?\b/, "개인 메시지(DM) 유도"),
  T("contact:bio", "contact", /\blink in (my |the |our )?bio\b|\b(check|see|visit) (my |the |our )?bio\b|\bbio link\b|\blink (is )?in (my|our) profile\b/, "프로필 링크 유도", 0.8),
  T("contact:join-group", "contact", /\bjoin (my|our|the|this)? ?(private |vip |free |exclusive |premium |trading |investment |crypto |forex |stock |signals? |telegram |whatsapp |discord )*(group|channel|community|chat|room|server)\b/, "그룹·채널 가입 유도", 0.9),
  T("contact:private-room", "contact", /\b(private|exclusive|vip|secret|inner|premium) (telegram |whatsapp |discord )?(group|channel|community|chat|room|circle|club|server)s?\b/, "비공개 그룹·채널", 0.8),
  T("contact:other-messenger", "contact", /\b(wechat|kik|snapchat|discord|viber|skype|line id)\b/, "기타 메신저 유도", 0.6),
  T("contact:reach-out", "contact", /\breach out\b|\bget in touch\b|\bhit me up\b|\bhmu\b/, "개별 연락 유도", 0.6),
  T("contact:call-text", "contact", /\b(call|text|sms|email|e-mail|contact|write to) (us|me) (now|today|at|on|via)\b/, "전화·문자·메일 연락 유도", 0.4),

  // ── investment / "leading" offer ──
  T("invest:tips", "invest", /\b(stock|stocks|crypto|coin|forex|fx|options?|trading|trade|investment|penny stock|day trading) (tips?|picks?|alerts?|calls?|signals?|recommendations?)\b/, "종목·매매 신호 제공", 1.2),
  T("invest:signal-group", "invest", /\b(signal|signals) (group|channel|service|provider)\b|\bvip signals?\b|\b(buy|sell|entry) signals?\b/, "매매 시그널 제공"),
  T("invest:forex", "invest", /\b(forex|fx trading|binary options?|cfds?|futures trading)\b/, "외환·바이너리 옵션", 0.8),
  T("invest:crypto", "invest", /\b(crypto|cryptocurrency|bitcoin|btc|eth|ethereum|usdt|altcoins?|memecoins?|web3|defi|nfts?|blockchain)\b/, "가상자산", 0.4),
  T("invest:mining", "invest", /\b(cloud mining|mining (pool|strategy|contract|plan|rig|platform)|staking|airdrop|presale|pre-sale|ico|token sale|liquidity mining|yield farming)\b/, "채굴·스테이킹·프리세일", 0.7),
  T("invest:system", "invest", /\b(trading|investment|investing|crypto|bitcoin|blockchain|web3|defi|forex|stock|money|profit|wealth) (secret|strategy|system|method|formula|blueprint|bot|robot|algorithm)s?\b|\bsecret (\w+ ){0,2}(strategy|system|method|formula)\b/, "매매기법·시스템 전수", 0.8),
  T("invest:managed", "invest", /\b(account manager|trade for you|trading on your behalf|manage your (account|portfolio|funds|money|investments?)|copy[- ]trad(e|ing)|mirror trading|we trade for)\b/, "계좌 대리 운용 제안", 1.1),
  T("invest:mentor", "invest", /\b(trading|investment|crypto|forex|financial|stock) (mentor|coach|expert|guru|analyst|advisor|adviser|specialist)s?\b|\bmentorship\b/, "투자 전문가 자칭", 0.6),
  T("invest:plan", "invest", /\binvestment (plan|package|opportunit(y|ies)|program|scheme|platform)s?\b/, "투자 상품·플랜 제시"),
  T("invest:recruit", "invest", /\b(accepting|taking|recruiting|looking for|seeking|onboarding) (new |more |serious |a few )?(members|investors|students|partners|people|clients|traders)\b|\bnew members\b|\bmembers? only\b|\bmembership\b/, "회원 모집", 0.9),
  T("invest:pump", "invest", /\b(to the moon|moonshot|next big (coin|token|stock|thing)|(will|about to|set to|going to) (explode|skyrocket|moon|pump)|pump (and|&) dump|hidden gem)\b/, "급등 예고", 0.8),
  T("invest:day-trading", "invest", /\b(penny stocks?|day trading|swing trading|scalping|options trading)\b/, "단타·옵션 매매", 0.6),
  T("invest:side-hustle", "invest", /\b(side hustle|work from home|make money online|extra income|income opportunity)\b/, "부업·재택 수익 위장", 0.7),
  T("invest:generic", "invest", /\b(invest|investing|investment|investments|investor|investors|stocks?|shares|trading|trader|portfolio)\b/, "투자 언급", 0.3),

  // ── guaranteed / unrealistic returns, fake proof of profit ──
  T("profit:guaranteed", "profit", /\bguarantee(d|s|ing)? (returns?|profits?|income|payouts?|gains?|results?|roi|earnings)\b|\b(returns?|profits?|income|roi|payouts?) (are |is )?(100% )?guaranteed\b|\b100% guaranteed\b/, "수익 보장 약속", 1.5),
  T("profit:risk-free", "profit", /\b(risk[- ]free|no risk|zero risk|without (any )?risk|can'?t lose|cannot lose|no loss(es)?|principal (back|protected|guaranteed)|100% safe)\b/, "무위험·원금 보장 주장", 1.4),
  T("profit:double", "profit", /\b(doubl(e|ing)|tripl(e|ing)|multiply|multiplying|10x) your (money|investment|capital|funds|crypto|bitcoin|income)\b/, "원금 몇 배 약속", 1.3),
  T("profit:periodic", "profit", /\b(daily|weekly|monthly) (profits?|returns?|income|roi|payouts?|earnings?|interest)\b/, "정기 수익 제시", 0.8),
  T("profit:earn-amount", "profit", /\b(make|made|making|earn|earned|earning|generate[ds]?|generating|pocket(ed)?|bank(ed)?|profit(ed)?|withdrew|cashed out) (over |up to |at least |an extra |a solid |around )?\$ ?\d/, "수익 금액 제시"),
  T("profit:freedom", "profit", /\b(passive income|financial freedom|quit (my|your) (job|9.?to.?5)|retire early|get rich|millionaires?|six[- ]figures?|7[- ]figures?)\b/, "부·자유 약속", 0.8),
  T("profit:proof", "profit", /\b(proof of (payment|profits?|withdrawals?|payouts?|earnings)|(payment|payout|withdrawal|profit) proofs?|screenshots? of (my |their |our )?(profits?|earnings|withdrawals?|payouts?|account|gains)|results speak|testimonials?|check (my|our) (results|track record)|(i|we)'?ve helped (over )?\d+|helped (over )?\d+ (people|clients|members|students|traders))\b/, "수익 인증·후기 주장"),
  T("profit:high", "profit", /\b(high|huge|massive|insane|crazy|unbelievable|fixed|consistent) (returns?|profits?|roi|gains?|yields?)\b/, "고수익 제시", 0.9),
  T("profit:recover", "profit", /\b(recover|recovery of|get back) (your |all )?(lost |losses|funds|money|crypto)\b/, "손실 복구 유도", 0.8),

  // ── urgency / scarcity ──
  T("urgency:spots", "urgency", /\b(limited|only|last|few) (\d+ )?(spots?|slots?|seats?|places?|positions?|openings?)\b|\bonly \d+ (people|members|spots|slots|seats|persons)\b|\b(next|first) \d+ (people|members|persons|users|subscribers|investors)\b/, "정원 제한(희소성)"),
  T("urgency:act-now", "urgency", /\b(act now|act fast|hurry|don'?t miss( out)?|last chance|now or never|before it'?s too late|limited[- ]time|today only|ends (today|tonight|soon)|offer ends|while (spots|slots|supplies) last|join now|sign up now|register now|apply now)\b/, "시간 압박", 0.8),
  T("urgency:hours", "urgency", /\bwithin (the next )?\d+ (hours?|minutes?|hrs?|mins?)\b|\bnext \d+ (hours?|minutes?)\b/, "시간 제한", 0.7),

  // ── free bait ──
  T("free:offer", "free", /\bfree (stock |crypto |forex |trading |investment )?(tips?|picks?|signals?|alerts?|group|channel|access|trial|training|course|class|webinar|mentorship|coaching|ebook|consultation|membership|guide|lessons?)\b/, "무료 제공 미끼"),
  T("free:word", "free", /\bfree\b|\bno (fees?|charge|cost)\b|\bgiveaway\b/, "무료 미끼", 0.6),

  // ── impersonation: firms / regulators / celebrities (names alone are near-zero) ──
  T("inst:firm", "impersonate", /\b(goldman sachs|goldman|j\.? ?p\.? ?morgan|jpmorgan|morgan stanley|blackrock|fidelity|vanguard|charles schwab|schwab|citadel|robinhood|coinbase|binance|kraken|bank of america|wells fargo|citibank|citi|hsbc|barclays|ubs|deutsche bank|nasdaq|nyse)\b/, "금융사 이름 언급", 0.3, { sub: "institution" }),
  T("inst:regulator", "impersonate", /\b(sec|finra|fca|cftc|irs|federal reserve|the fed|treasury|fbi|ftc)\b/, "규제·공공기관 이름 언급", 0.3, { sub: "institution" }),
  T("inst:celebrity", "impersonate", /\b(elon musk|musk|warren buffett|buffett|cathie wood|bill gates|jeff bezos|mark cuban|dave ramsey|jim cramer|michael saylor|vitalik|tesla|spacex)\b/, "유명인·유명 기업 이름 언급", 0.3, { sub: "institution" }),
  T("cred:employment", "impersonate", /\b(i (work|worked) (at|for)|i'?m an? (senior |certified |licensed |former |retired |professional )?(analyst|broker|trader|advisor|adviser|portfolio manager|fund manager|banker|employee|account manager)|(senior|chief|lead|former|retired|ex-?) ?(analyst|broker|trader|advisor|adviser|banker|portfolio manager|fund manager|executive|employee) (at|of|from|with)|\d+ years? (at|with|in) (wall street|goldman|jp ?morgan|morgan stanley|blackrock|fidelity|citadel|the (bank|firm|fund|industry)))\b/, "재직·경력 주장", 0.9, { sub: "credential" }),
  T("cred:licensed", "impersonate", /\b(certified|licensed|registered|regulated|authori[sz]ed|accredited) (by |with |under )?(the )?(sec|finra|fca|cftc|broker|advisor|adviser|financial|investment|trader|professional)\b|\b(sec|fca|finra)[- ](registered|regulated|licensed|approved)\b|\bfully (licensed|regulated|registered|insured)\b/, "자격·등록 주장", 0.9, { sub: "credential" }),
  T("cred:endorsed", "impersonate", /\b(endorsed|backed|approved|sponsored|recommended) by (elon|musk|warren|buffett|the (government|sec|bank|fed)|celebrities|experts|billionaires?)\b|\bofficial (giveaway|partner|representative|agent)\b|\b(on behalf of|representing) (the )?(sec|bank|government|irs|treasury)\b/, "공식·유명인 보증 주장", 1.0, { sub: "credential" }),
  T("cred:insider", "impersonate", /\binsider (info|information|tips?|knowledge|access|trading)\b|\b(the )?(banks?|wall street|brokers|they|the rich|elites?) (don'?t|do not) want you to know\b/, "내부자·비밀 정보 주장", 0.9, { sub: "credential" }),
  T("evidence:doc", "impersonate", /\b(my|our) (license|licence|certificate|certification|credentials|badge|id card|payslip|pay stub|employment letter)\b/, "자격·소속 증빙 제시", 0.9, { sub: "credential", evidenceDoc: true }),

  // ── link shorteners ──
  T("link:shortener", "link", /\b(tinyurl\.com|goo\.gl|is\.gd|cutt\.ly|rb\.gy|ow\.ly|shorturl\.at|rebrand\.ly|bit\.ly|linktr\.ee)\//, "단축 링크"),
];

/** Regex structure signals. `on: "raw"` means match the lowercased raw text (normalize folds '@'). */
export const EN_PATTERNS: { re: RegExp; cat: Category; label: string; w?: number; on?: "raw" }[] = [
  { re: /\b\d{1,3}(\.\d+)?\s?% (daily|weekly|monthly|per (day|week|month)|a (day|week|month)|every (day|week)|in \d+ (days?|hours?|weeks?))\b/, cat: "profit", label: "기간당 수익률 제시", w: 1.2 },
  { re: /\$\s?\d[\d,]*(\.\d+)?\s?(k|m|million|thousand|grand)?\b/, cat: "profit", label: "금액 제시", w: 0.6 },
  { re: /\b\d{1,4}x\b/, cat: "profit", label: "N배 수익 제시" },
  { re: /(?<![\d+])\+(?!82)\d{1,3}[\s.-]?\(?\d{1,4}\)?([\s.-]?\d{2,4}){2,4}(?!\d)/, cat: "contact", label: "휴대폰 번호" },
  { re: /(?<!\d)\(?[2-9]\d{2}\)?[\s.-]\d{3}[\s.-]\d{4}(?!\d)/, cat: "contact", label: "휴대폰 번호" },
  { re: /[a-z0-9._%+-]+@[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}/, cat: "contact", label: "이메일 주소", w: 0.6, on: "raw" },
];

/** Victim / warning context — the writer is warning about lures, not running one. */
export const EN_COUNTER_TERMS: { term: string; re: RegExp; label: string; w: number; strong?: boolean }[] = [
  { term: "en:scammed", re: /\b(got|was|been|were|get|getting|being) scammed\b/, label: "피해 경험 서술", w: 1.2, strong: true },
  { term: "en:scam-alert", re: /\b(scam|fraud) (alert|warning)s?\b|\bpsa\b/, label: "경고 문구", w: 1.2, strong: true },
  { term: "en:beware", re: /\bbeware\b/, label: "경고 문구", w: 1.2, strong: true },
  { term: "en:dont-fall", re: /\b(don'?t|do not|never) (fall for|trust (anyone|them|these|people)|send (money|crypto|funds) to)\b/, label: "경고 문구", w: 1.2, strong: true },
  { term: "en:is-a-scam", re: /\b(this|it|that|these|they) (is|was|are|were) (a |all )?scams?\b/, label: "사기 단정", w: 1.2, strong: true },
  { term: "en:report-block", re: /\breport (and|&) block\b|\breport (this|these|the|them|it) (account|accounts|profile|scammers?)\b/, label: "신고 권유", w: 1.2, strong: true },
  { term: "en:lost-money", re: /\b(i|we|she|he|they) lost (over |about |nearly |almost )?\$ ?\d/, label: "피해 경험 서술", w: 1.0, strong: true },
  { term: "en:scammers", re: /\bscammers?\b/, label: "사기 지칭", w: 1.0, strong: true },
  { term: "en:scam", re: /\bscams?\b/, label: "사기 언급", w: 0.6 },
  { term: "en:careful", re: /\bbe careful\b|\bstay safe\b|\bwatch out\b/, label: "경고 문구", w: 0.8 },
  { term: "en:warning", re: /\bwarning\b/, label: "경고 문구", w: 0.5 },
];

/** Context caps — legal disclaimers, news, public campaigns. Labels must not mention the cap. */
export const EN_VETO_PATTERNS: { re: RegExp; label: string; cap: number }[] = [
  {
    re: /past performance (is|does) not (indicative|a guarantee|guarantee)|not (a )?guarantee of future|investing involves risk|capital (is )?at risk|you (may|could) lose (some|all|part|money|value)|member (sipc|finra)/,
    label: "투자 위험 고지문 (합법 광고 형식)",
    cap: 45,
  },
  {
    re: /\b(reuters|associated press|\(ap\)|bloomberg news|press release|according to (a |the )?(report|statement|filing)|told reporters|said in a statement)\b/,
    label: "기사·보도자료 인용 (뉴스 공유 가능성)",
    cap: 45,
  },
  {
    re: /\b(ftc\.gov|reportfraud|ic3\.gov|sec\.gov|investor\.gov|actionfraud|consumer alert|investor alert)\b/,
    label: "공공기관 캠페인·신고 창구 안내",
    cap: 39,
  },
  {
    re: /\b(tarot|horoscope|astrology|psychic reading)\b/,
    label: "타로·점술 맥락 (투자 리딩 아님)",
    cap: 39,
  },
];

/** Calls to action — only counted alongside a contact signal (see score.ts). */
export const EN_CTA_PATTERNS: { re: RegExp; label: string; w: number }[] = [
  { re: /\b(join (now|us|today|here|my|our)|sign up|register (now|here|today)|apply (now|here|today)|enroll)\b/, label: "입장 유도", w: 1 },
  { re: /\b(click (here|the link|below|on the link)|tap (here|the link)|follow the link|visit (our|my) (site|website|page))\b/, label: "링크 클릭 유도", w: 0.9 },
  { re: /\b(dm|message|text|contact|call|email|whatsapp) (me|us)\b|\breply (now|to this|with)\b|\bsend (me|us)\b/, label: "회신 요구", w: 0.8 },
  { re: /\bcomment (below|["']?\w+["']? below)\b|\b(like|follow|share) (and|&) (comment|follow|share|dm)\b/, label: "팔로우·좋아요 조건부 제공", w: 1.2 },
  { re: /\b(i'?ll|i will|we will|we'?ll) (send|share|show|teach|give|guide|help)\b|\blearn how\b|\bfind out (how|more)\b/, label: "제공 약속", w: 0.8 },
];

/** Offer phrasing for the impersonation combo (offering, not asking). */
export const EN_OFFER_PATTERN = /\b(i'?ll|i will|we will|we'?ll|let me|i can|we can) (send|share|show|teach|give|guide|help|explain|tell)\b|\bsharing (my|our|the)\b|\b(dm|message|contact) (me|us)\b|\bfor (more )?details\b|\blearn how\b|\b(happy|available) to (help|guide|assist|share)\b/;
