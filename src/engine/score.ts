import { normalize, type Normalized } from "./normalize";
import { choseongSeq, jamoMixedTokens, hasCompatJamo } from "./hangul";
import { TERMS, PATTERNS, COUNTER_TERMS, VETO_PATTERNS, CTA_PATTERNS, QUOTED_LURE, OFFER_PATTERN, type Category, type Term } from "./lexicon";

export type Label = "HIGH" | "REVIEW" | "LOW";

export interface AccountFeatures {
  followers?: number | null;
  following?: number | null;
  postCount?: number | null;
  /** 계정 생성일 ISO. 없으면 무시 */
  createdAt?: string | null;
  /** 프로필 bio 텍스트 (있으면 본문과 함께 검사) */
  bio?: string | null;
  /** 프로필 외부 링크 */
  externalUrl?: string | null;
  /** 이 계정이 남긴 게시물·댓글 중 유사 클러스터 크기 (같은 계정의 반복) */
  clusterSize?: number | null;
  /** 이 글과 근사 중복인 문구를 쓰는 **서로 다른 계정** 수 (본 계정 포함). 여러 일회용 계정에 같은 글을 살포하는 형 */
  clusterAccounts?: number | null;
  /** 이 계정이 서로 다른 원글 몇 개에 댓글로 같은 내용을 달았는지 */
  distinctTargets?: number | null;
  /** Threads 프로필 정보에 표시된 계정 국가. 단독 판정에는 사용하지 않는다. */
  profileCountry?: string | null;
  /** 국가 정보의 출처(예: threads_about_profile, manual). */
  countrySource?: string | null;
  /** 증빙 이미지에 대해 보조 모델이 합성·조작 정황을 판단한 신뢰도(0~1). */
  syntheticEvidenceConfidence?: number | null;
}

export interface Reason {
  code: string;
  label: string;
  points: number;
  evidence?: string;
}

export interface ScoreResult {
  score: number;
  label: Label;
  reasons: Reason[];
  matched: { term: string; cat: Category; label: string }[];
  categories: Record<Category, number>;
  normalized: Normalized;
  needsLlmReview: boolean;
  signalGroups: SignalGroup[];
}

export interface SignalGroup {
  code: "normalization" | "impersonation" | "evidence" | "conversion" | "infrastructure" | "coordination" | "identity";
  label: string;
  active: boolean;
  evidence: string[];
}

const CAT_WEIGHT: Record<Category, number> = {
  contact: 22,
  invest: 14,
  profit: 12,
  urgency: 6,
  free: 5,
  link: 8,
  impersonate: 10,
};
const CAT_CAP: Record<Category, number> = {
  contact: 32,
  invest: 28,
  profit: 24,
  urgency: 12,
  free: 8,
  link: 10,
  impersonate: 20,
};

/**
 * HARD GATE 상한 — 아래 셋 중 하나도 없으면 HIGH 를 줄 수 없다:
 *   ① 연락채널 유도  ② 기관 사칭 결합(기관명+재직·증빙 주장+제안)  ③ 서로 다른 계정 3개 이상이 같은 문구 살포
 * 이름은 호환을 위해 유지한다.
 */
export const NO_CONTACT_CAP = 69;
/** 같은 문구를 쓰는 서로 다른 계정 수가 이 이상이면 게이트를 연다 */
export const SPREAD_GATE_ACCOUNTS = 3;
/** 사칭 결합 가점 */
export const IMPERSONATE_COMBO_POINTS = 25;
export const IMPERSONATE_INVEST_POINTS = 10;

/** 여러 계정이 같은 문구를 뿌릴 때의 가점 (본 계정 포함 계정 수) */
export function spreadPoints(accounts: number): number {
  if (accounts >= 5) return 32;
  if (accounts >= 3) return 25;
  if (accounts >= 2) return 15;
  return 0;
}
/** 대형 계정은 자동 HIGH 대상에서 제외하고 사람이 본다 */
export const BIG_ACCOUNT_FOLLOWERS = 20000;

export const THRESHOLD_HIGH = 70;
export const THRESHOLD_REVIEW = 40;

const KOREA_COUNTRY = /^(kr|kor|korea|south korea|republic of korea|korea republic of|대한민국|한국)$/i;
function foreignProfileCountry(country?: string | null): boolean {
  const value = country?.toLowerCase().replace(/[^a-z가-힣 ]+/g, " ").replace(/\s+/g, " ").trim();
  return !!value && !KOREA_COUNTRY.test(value);
}

const TERM_CHOSUNG = TERMS.filter((t) => t.chosung).map((t) => ({ t, cs: choseongSeq(t.term) }));

function findTerms(compact: string): { term: Term; via: "exact" }[] {
  const out: { term: Term; via: "exact" }[] = [];
  for (const t of TERMS) {
    if (compact.includes(t.term)) out.push({ term: t, via: "exact" });
  }
  return out;
}

function findChosungTerms(raw: string): { term: Term; token: string }[] {
  if (!hasCompatJamo(raw)) return [];
  const out: { term: Term; token: string }[] = [];
  for (const tok of jamoMixedTokens(raw)) {
    const cs = choseongSeq(tok);
    for (const { t, cs: tcs } of TERM_CHOSUNG) {
      if (cs.includes(tcs)) out.push({ term: t, token: tok });
    }
  }
  return out;
}

export function scoreText(rawText: string, account: AccountFeatures = {}): ScoreResult {
  const bio = account.bio ? `\n${account.bio}` : "";
  const url = account.externalUrl ? `\n${account.externalUrl}` : "";
  const raw = rawText + bio + url;
  const n = normalize(raw);

  const reasons: Reason[] = [];
  const categories: Record<Category, number> = { contact: 0, invest: 0, profit: 0, urgency: 0, free: 0, link: 0, impersonate: 0 };
  let sawInstitution = false;
  let sawCredential = false;
  let sawEvidenceImageClaim = false;
  const institutionHits: string[] = [];
  const credentialHits: string[] = [];
  const matched: ScoreResult["matched"] = [];
  const seenLabel = new Set<string>();

  const add = (t: Term, evidence: string, viaLabel?: string) => {
    const key = t.cat + ":" + t.label;
    if (seenLabel.has(key)) return;
    seenLabel.add(key);
    const pts = CAT_WEIGHT[t.cat] * (t.w ?? 1);
    categories[t.cat] += pts;
    if (t.sub === "institution") { sawInstitution = true; institutionHits.push(t.term); }
    if (t.sub === "credential") { sawCredential = true; credentialHits.push(t.term); }
    if (["사원증", "급여명세", "명세서", "재직증명"].includes(t.term)) sawEvidenceImageClaim = true;
    matched.push({ term: t.term, cat: t.cat, label: t.label });
    reasons.push({ code: `term:${t.term}`, label: viaLabel ? `${t.label} (${viaLabel})` : t.label, points: Math.round(pts), evidence });
  };

  // 1) 정규화 텍스트 어휘 매칭
  const cps = Array.from(n.compact); // 코드포인트 단위 슬라이스 — 이모지 서로게이트 쌍이 잘리면 JSON 이 깨진다
  for (const { term } of findTerms(n.compact)) {
    const idx = Array.from(n.compact.slice(0, n.compact.indexOf(term.term))).length;
    add(term, cps.slice(Math.max(0, idx - 8), idx + Array.from(term.term).length + 8).join(""));
  }
  // 2) 초성 매칭 (원문에 호환 자모가 있을 때만)
  for (const { term, token } of findChosungTerms(raw)) {
    add(term, token, "초성 난독화");
  }
  // 3) 정규식 구조 신호
  for (const p of PATTERNS) {
    const m = n.text.match(p.re);
    if (m) {
      const key = p.cat + ":" + p.label;
      if (seenLabel.has(key)) continue;
      seenLabel.add(key);
      const pts = CAT_WEIGHT[p.cat] * (p.w ?? 1) * 0.8;
      categories[p.cat] += pts;
      reasons.push({ code: `pattern:${p.label}`, label: p.label, points: Math.round(pts), evidence: m[0] });
    }
  }

  // 카테고리 상한 적용
  let score = 0;
  for (const c of Object.keys(categories) as Category[]) {
    categories[c] = Math.min(categories[c], CAT_CAP[c]);
    score += categories[c];
  }

  // 3b) 프로필 외부 링크가 메신저·링크모음 — 본문과 무관하게 계정 자체가 유입 장치다.
  //     연락채널 신호로 친다(결합 규칙·게이트에 그대로 반영).
  const extUrl = (account.externalUrl ?? "").toLowerCase();
  if (/t\.me|telegram\.me|open\.kakao|pf\.kakao|linktr\.ee|litt\.ly|bit\.ly|han\.gl|vo\.la|line\.me|wechat/.test(extUrl)) {
    reasons.push({ code: "acct:lure-link", label: "프로필 외부 링크가 메신저·링크모음", points: 10, evidence: account.externalUrl! });
    categories.contact = Math.min(CAT_CAP.contact, categories.contact + 10);
    score += 10;
  }

  // 4) 결합 규칙: 연락채널 + 투자/수익 조합이 리딩방 유인의 핵심
  if (categories.contact > 0 && (categories.invest > 0 || categories.profit > 0)) {
    reasons.push({ code: "combo:contact+invest", label: "메신저 유도 + 투자·수익 언급 결합", points: 15 });
    score += 15;
  }
  // 4b) 채널 + 종목/기법(투자) + 수익 제시가 모두 모이면 유인 구조가 완성된다
  if (categories.contact > 0 && categories.invest > 0 && categories.profit > 0) {
    reasons.push({ code: "combo:triple", label: "채널 유도 + 투자 + 수익 제시 3요소 결합", points: 6 });
    score += 6;
  }
  // 4c) 기관 사칭 결합 — 기관명 + 재직·증빙 주장 + 무언가를 *제공하겠다는* 말(투자·수익·연락채널 어휘 또는 제안 표현).
  //     "삼성전자 재직 중인데 구내식당 맛없다" 는 기관명+재직이지만 제안이 없어 결합이 안 된다.
  //     "대신증권 재직중입니다, 사원증 인증, 종목 정보 드릴게요" 가 결합이다.
  const offered = categories.invest > 0 || categories.profit > 0 || categories.contact > 0 || OFFER_PATTERN.test(n.text);
  const impersonateCombo = sawInstitution && sawCredential && offered;
  if (impersonateCombo) {
    reasons.push({
      code: "impersonate:institution+credential",
      label: "기관명 + 재직·증빙 주장 + 제안 결합 (사칭 구조)",
      points: IMPERSONATE_COMBO_POINTS,
      evidence: `${institutionHits.join(", ")} / ${credentialHits.join(", ")}`,
    });
    score += IMPERSONATE_COMBO_POINTS;
    if (categories.invest > 0 || categories.profit > 0 || categories.contact > 0) {
      reasons.push({ code: "impersonate:institution+credential+invest", label: "사칭 구조 + 투자·수익·연락 어휘 동반", points: IMPERSONATE_INVEST_POINTS });
      score += IMPERSONATE_INVEST_POINTS;
    }
  }

  // 4d) 한국 기관 재직·퇴직 사칭과 프로필 국가가 불일치하는 경우의 보조 신호.
  //     해외 거주자·출장·VPN 등 정상 사례가 많으므로 단독 가점·게이트로는 절대 사용하지 않는다.
  const countryMismatch = impersonateCombo && foreignProfileCountry(account.profileCountry);
  if (countryMismatch) {
    reasons.push({
      code: "identity:country-mismatch",
      label: "한국 기관 경력 주장과 프로필 국가 불일치 (보조 신호)",
      points: 4,
      evidence: `${account.profileCountry}${account.countrySource ? ` · ${account.countrySource}` : ""}`,
    });
    score += 4;
  }

  // 4e) 이미지 자체는 단정 근거가 아니다. 기관 사칭 결합이 성립하고 별도 이미지 검토가
  //     높은 신뢰도로 합성·조작 정황을 반환했을 때만 제한적으로 보조한다.
  const visualConfidence = Math.max(0, Math.min(1, account.syntheticEvidenceConfidence ?? 0));
  if (impersonateCombo && visualConfidence >= 0.75) {
    reasons.push({
      code: "evidence:synthetic-image",
      label: "증빙 이미지의 합성·조작 정황 (보조 모델 검토)",
      points: 6,
      evidence: `신뢰도 ${Math.round(visualConfidence * 100)}%`,
    });
    score += 6;
  }

  // 5) 난독화 가점 — 정상 사용자는 자기 연락처를 난독화하지 않는다 (PIP 논문: 샘플의 59%)
  if (n.techniques.length > 0 && categories.contact + categories.invest > 0) {
    const pts = Math.min(15, Math.round(8 + n.obfuscationRatio * 30));
    reasons.push({ code: "obfuscation", label: `난독화 사용: ${n.techniques.join(", ")}`, points: pts, evidence: `변형률 ${(n.obfuscationRatio * 100).toFixed(0)}%` });
    score += pts;
  }

  // 5a) 행동 유도(CTA) — 연락채널 신호(또는 사칭 결합)와 붙었을 때만. "방이 있다" 가 아니라 "들어와라" 여야 유인이다.
  if (categories.contact > 0 || impersonateCombo) {
    let cta = 0;
    const ctaLabels: string[] = [];
    for (const c of CTA_PATTERNS) {
      if (c.re.test(n.text)) { cta += 6 * c.w; ctaLabels.push(c.label); }
    }
    if (cta > 0) {
      const pts = Math.min(14, Math.round(cta));
      reasons.push({ code: "cta", label: "행동 유도 문구 (연락채널·사칭 구조 동반)", points: pts, evidence: ctaLabels.join(", ") });
      score += pts;
    }
  }

  // 5b) 피해자·경고 맥락 감점 — "리딩방 사기 당한 후기" 는 유인글이 아니다
  let counter = 0;
  let strongCounters = 0;
  const hitCounters = COUNTER_TERMS.filter((c) => n.compact.includes(c.term));
  for (const c of hitCounters) {
    counter += 12 * c.w;
    if (c.strong) strongCounters++;
  }
  if (counter > 0) {
    const pts = -Math.min(45, Math.round(counter));
    reasons.push({ code: "counter", label: "피해 경험·경고 맥락 (유인글 아닐 가능성)", points: pts, evidence: hitCounters.map((c) => c.term).join(", ") });
    score += pts;
  }

  // 6) 계정 특성
  if (account.createdAt) {
    const days = (Date.now() - Date.parse(account.createdAt)) / 86400000;
    if (days >= 0 && days < 30) { reasons.push({ code: "acct:new", label: "생성 30일 미만 계정", points: 8, evidence: `${Math.floor(days)}일` }); score += 8; }
  }
  if (typeof account.followers === "number" && account.followers < 50 && categories.contact > 0) {
    reasons.push({ code: "acct:lowfollow", label: "팔로워 50 미만", points: 4, evidence: `${account.followers}` }); score += 4;
  }
  if (typeof account.following === "number" && typeof account.followers === "number" && account.followers > 0 && account.following / account.followers > 20) {
    reasons.push({ code: "acct:ratio", label: "팔로잉/팔로워 비율 비정상", points: 4 }); score += 4;
  }
  // 6b) 일회용(버너) 프로필 + 채널 유도 + 투자 언급 — 세 가지가 같이 오면 계정 목적이 유입이다
  const fresh = account.createdAt ? (Date.now() - Date.parse(account.createdAt)) / 86400000 < 60 : false;
  const fewFollowers = typeof account.followers === "number" && account.followers < 200;
  const skewed = typeof account.following === "number" && typeof account.followers === "number" && account.following > account.followers * 3;
  if (fresh && fewFollowers && skewed && categories.contact > 0 && categories.invest + categories.profit > 0) {
    reasons.push({ code: "acct:burner", label: "신규·팔로워 없는 일회용 계정이 투자 채널 유도", points: 7 });
    score += 7;
  }
  if ((account.clusterSize ?? 0) >= 3) {
    const pts = Math.min(20, 5 + (account.clusterSize! - 3) * 3);
    reasons.push({ code: "cluster", label: "동일·유사 문구 반복 게시", points: pts, evidence: `${account.clusterSize}건` }); score += pts;
  }
  // 6c) 살포(spread) — 서로 다른 계정 여러 개가 같은 문구를 쓴다. 한 사람이 일회용 계정을 여러 개 굴리는 형.
  const clusterAccounts = account.clusterAccounts ?? 0;
  if (clusterAccounts >= 2) {
    const pts = spreadPoints(clusterAccounts);
    reasons.push({ code: "spread", label: "서로 다른 계정 여러 개가 같은 문구 게시", points: pts, evidence: `${clusterAccounts}개 계정` }); score += pts;
  }
  if ((account.distinctTargets ?? 0) >= 3) {
    reasons.push({ code: "spray", label: "무관한 여러 원글에 동일 댓글 살포", points: 10, evidence: `${account.distinctTargets}개 원글` }); score += 10;
  }

  score = Math.max(0, Math.min(100, Math.round(score)));

  // 7) 상한(veto) — 여기부터는 "점수를 깎는" 게 아니라 "HIGH 를 포기한다".
  //    HIGH 는 신고서에 실리고 명예훼손 리스크가 있으므로, 합법 광고·기사·캠페인·풍자로
  //    보이는 신호가 하나라도 있으면 자동 판정을 포기하고 사람/LLM 에 넘긴다.
  const capAt = (cap: number, code: string, label: string, evidence?: string) => {
    if (score <= cap) return;
    reasons.push({ code, label: `${label} → ${cap}점으로 상한`, points: cap - score, evidence });
    score = cap;
  };

  for (const v of VETO_PATTERNS) {
    const m = n.text.match(v.re);
    if (m) capAt(v.cap, `veto:${v.label}`, v.label, m[0]);
  }
  // 유인 문구를 따옴표로 *인용* 하는 글 = 풍자·해설·연구. 인용부 밖에 채널 유도가 없으면 유인이 아니다.
  if (QUOTED_LURE.test(n.text) && (strongCounters > 0 || /ㅋㅋ|ㅎㅎ|밈|풍자|분석|문구/.test(n.text))) {
    capAt(59, "veto:quote", "유인 문구 인용(풍자·해설 맥락)", n.text.match(QUOTED_LURE)?.[0]);
  }
  // 경고·피해 어휘. 하나만 있어도 자동 HIGH 는 포기한다 (유인글이 스스로 "신고하세요" 라고 쓰진 않는다).
  if (strongCounters >= 2) capAt(55, "veto:victim", "피해·경고 맥락 다중 신호", `강한 신호 ${strongCounters}개`);
  else if (strongCounters === 1) capAt(NO_CONTACT_CAP, "veto:victim", "피해·경고 맥락 신호");
  // 대형 계정(언론·인플루언서)은 자동 HIGH 대상에서 제외한다
  if ((account.followers ?? 0) >= BIG_ACCOUNT_FOLLOWERS) {
    capAt(NO_CONTACT_CAP, "veto:bigaccount", "대형 계정 — 자동 HIGH 보류", `팔로워 ${account.followers}`);
  }

  // 8) HARD GATE — 다음 셋 중 하나는 있어야 HIGH 가 된다.
  //    ① 연락채널 유도("어디로 오라")  ② 기관 사칭 결합(기관명+재직·증빙+제안)  ③ 서로 다른 계정 3개 이상의 동일 문구 살포
  //    셋 다 없는 글(투자 자랑·시황 과장·수익 인증만 있는 글)을 HIGH 로 올리면 방어할 수 없는 지목이 된다.
  const gateOpen = categories.contact > 0 || impersonateCombo || clusterAccounts >= SPREAD_GATE_ACCOUNTS;
  if (!gateOpen && score > NO_CONTACT_CAP) {
    reasons.push({
      code: "gate:no-contact",
      label: `연락채널 유도·기관 사칭 결합·다계정 살포 중 어느 것도 없음 — ${NO_CONTACT_CAP}점으로 상한`,
      points: NO_CONTACT_CAP - score,
    });
    score = NO_CONTACT_CAP;
  }

  const label: Label = score >= THRESHOLD_HIGH ? "HIGH" : score >= THRESHOLD_REVIEW ? "REVIEW" : "LOW";
  reasons.sort((a, b) => b.points - a.points);

  const reasonEvidence = (prefixes: string[]) => reasons
    .filter((r) => prefixes.some((prefix) => r.code.startsWith(prefix)) && r.points > 0)
    .slice(0, 4)
    .map((r) => r.evidence || r.label);
  const signalGroups: SignalGroup[] = [
    { code: "normalization", label: "숨긴 글자 복원", active: n.techniques.length > 0, evidence: n.techniques },
    { code: "impersonation", label: "재직·퇴직 사칭 서사", active: impersonateCombo, evidence: reasonEvidence(["impersonate:"]) },
    { code: "evidence", label: "페이크 증빙 이미지 정황", active: sawEvidenceImageClaim || visualConfidence >= 0.75, evidence: reasonEvidence(["term:사원증", "term:급여명세", "term:명세서", "term:재직증명", "evidence:"]) },
    { code: "conversion", label: "투자 유인 전환 구조", active: reasons.some((r) => r.code.startsWith("combo:") || r.code === "cta"), evidence: reasonEvidence(["combo:", "cta"]) },
    { code: "infrastructure", label: "외부 이동 인프라", active: categories.contact > 0, evidence: reasonEvidence(["term:텔레", "term:카카오", "term:오픈", "acct:lure-link", "pattern:"]) },
    { code: "coordination", label: "계정·캠페인 연결", active: clusterAccounts >= 2 || (account.clusterSize ?? 0) >= 3 || (account.distinctTargets ?? 0) >= 3, evidence: reasonEvidence(["spread", "cluster", "spray", "shared-contact"]) },
    { code: "identity", label: "신원·활동 맥락 불일치", active: countryMismatch, evidence: reasonEvidence(["identity:"]) },
  ];

  return { score, label, reasons, matched, categories, normalized: n, needsLlmReview: label === "REVIEW", signalGroups };
}
