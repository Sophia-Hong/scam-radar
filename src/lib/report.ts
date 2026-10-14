import { desc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { isCurrentSummary, summarizeAccount, SUMMARY_VERSION, summaryModelLabel } from "./llm";
import { sharedAccountsOf, type SharedAccount } from "./pipeline";
import { ENTITY_TYPE_LABEL, isStrongEntity, explainReasons, type Reason, type EntityType } from "@/engine";
import { effectiveStatus, type EffectiveStatus } from "./labels";
import { contactPairs, maskContact, maskDeep } from "./mask";
import { onlyVisible, redactSharedContact } from "./visibility";

/** 조사기관 제출용 리포트 — 필드 순서가 곧 신고서 항목 순서 */
export interface InvestigationReport {
  reportId: string;
  generatedAt: string;
  /** 기계 라벨 */
  status: "HIGH" | "REVIEW" | "LOW";
  /** 표시용 최종 상태 — 사람 판단이 있으면 CONFIRMED/CLEARED (src/lib/labels.ts) */
  effectiveStatus: EffectiveStatus;
  score: number;
  /** 사람의 최종 판단. null 이면 아직 미검토 */
  humanReview: { label: "SCAM" | "NOT_SCAM"; note: string | null; reviewedAt: string; reviewedBy: string | null } | null;
  /** 계정명 */
  account: { platform: string; handle: string; displayName: string | null; url: string; profileCapture: string | null; bio: string | null; externalUrl: string | null; followers: number | null; following: number | null; createdAt: string | null };
  /** 일시 */
  timeline: { firstSeen: string; lastSeen: string; postCount: number; distinctTargets: number };
  /** 내용 — 내용 요약 (관측 사실 위주) */
  summary: { text: string; generatedBy: string };
  /** 유도 수단 — 본문·프로필에서 확인된 실제 연락처 */
  contacts: { id: string; type: string; typeLabel: string; value: string; source: string; strong?: boolean }[];
  /** 같은 연락처를 쓰는 다른 계정 (동일 운영자·조직 정황) */
  linkedAccounts: SharedAccount[];
  /** 공개 화면: 연결 계정 목록 대신 수만 (다른 계정의 이름·핸들·링크를 보이지 않음, 율 1791947465 조건 1) */
  linkedCount?: number;
  /** 증거 캡쳐 */
  evidence: { postUrl: string; parentUrl: string | null; kind: string; postedAt: string | null; capturedAt: string; capture: string | null; text: string; score: number; techniques: string[]; clusterId: string | null }[];
  /** 근거 — 코드·라벨·점수에 더해 사람이 읽을 설명(무엇이/왜/예시/정상 사용) */
  rationale: { code?: string; id?: string; label: string; points: number; evidence?: string; what: string; why: string; example: string; benign: string }[];
  /** 신고처 안내 — 자동 제출이 아니라 사람이 마지막 단계를 수행 */
  filing: { name: string; url: string; note: string }[];
  disclaimer: string;
}

export const FILING_TARGETS = [
  { name: "경찰청 사이버범죄 신고시스템 (ECRM)", url: "https://ecrm.police.go.kr/minwon/main", note: "사이버사기 → 기타 사이버사기. 본 리포트 JSON/캡처를 첨부" },
  { name: "금융감독원 불법금융신고센터", url: "https://www.fss.or.kr/fss/main/contents.do?menuNo=200168", note: "유사투자자문·미등록 투자자문 신고" },
  { name: "금융감독원 불법사금융 신고 1332", url: "tel:1332", note: "전화 상담·신고" },
  { name: "Meta(Threads) 게시물 신고", url: "https://help.instagram.com/2922067214679225", note: "플랫폼 내 신고. 제3자 신고 API 없음 → 수동" },
];

/**
 * 공개 열람용 리포트 — 공개 범위 밖(실계정) 연결 계정을 걸러낸다. 걸러진 것이 있으면 요약문(연결 계정 id 가 적힐 수 있다)도 가린다.
 * 관리자에게는 그대로.
 */
export function publicView(report: InvestigationReport, admin: boolean): InvestigationReport {
  if (admin) return report;
  const linked = onlyVisible(report.linkedAccounts, (s) => s.accountId, false);
  const trimmed = linked.length !== report.linkedAccounts.length;
  // 공개 화면 연락처 가림·다른 계정 이름 숨김 (율 1791947465 조건 1·2): 연락처 원값 → 가린 값, 연결 계정 id·핸들 → "다른 계정"
  const otherLabel = "(다른 계정)";
  const pairs: [string, string][] = [
    ...contactPairs(report.contacts),
    ...report.linkedAccounts.flatMap((s) => [[s.accountId, otherLabel], [`@${s.handle}`, otherLabel], [s.handle, otherLabel]] as [string, string][]),
  ];
  const view: InvestigationReport = {
    ...report,
    // 공개: 사람 검토 결과·검토자 정보는 싣지 않는다 — 공개 화면에 "사람 검토"·"확정" 표현을 두지 않기로 (소현 10-14, 카이 ④ 검수 3)
    humanReview: null,
    effectiveStatus: report.status,
    // 공개 JSON: 신호 방향만, 크기(가점·감점) 비공개 (소현 10-05). 내부 규칙 코드·연락처 강도 구분도 싣지 않는다 (카이 GASA 검수, 테오 10-14)
    rationale: report.rationale.map(({ code: _code, ...r }, i) => ({ ...r, id: `s${i + 1}`, points: Math.sign(r.points) })),
    contacts: report.contacts.map(({ strong: _strong, ...c }) => ({ ...c, id: `${c.type}:${maskContact(c.type, c.value)}` })).sort((a, b) => a.type.localeCompare(b.type) || a.value.localeCompare(b.value)),
    linkedAccounts: [],
    linkedCount: linked.length,
    summary: trimmed ? { text: "이 계정과 같은 연락처를 쓰는 계정 중 공개 범위 밖의 계정이 있어 요약문을 공개 화면에서 생략했습니다.", generatedBy: "withheld" } : report.summary,
  } as InvestigationReport;
  // 대상 계정 자신(account·reportId)은 가리지 않는다 — 가리는 것은 연락처와 다른 계정
  return maskDeep(view, pairs, ["handle", "url", "platform", "reportId", "generatedAt", "filing", "id", "type", "source"]);
}

/** admin 을 주지 않으면 공개용으로 만든다 — 근거 문장(설명문 포함)에 적힌 공개 범위 밖 계정 id 가 처음부터 들어가지 않게 */
export async function buildReport(accountId: string, opts: { admin?: boolean } = {}): Promise<InvestigationReport | null> {
  const d = db();
  const [acc] = await d.select().from(schema.accounts).where(eq(schema.accounts.id, accountId)).limit(1);
  if (!acc) return null;
  const rows = await d.select().from(schema.posts).where(eq(schema.posts.accountId, accountId)).orderBy(desc(schema.posts.score), desc(schema.posts.capturedAt)).limit(50);

  const storedReasons = (acc.reasons as Reason[]) ?? [];
  const reasons = opts.admin ? storedReasons : redactSharedContact(storedReasons);
  const { entities, sharedWith } = await sharedAccountsOf(acc.id);
  const contacts = entities.map((e) => ({
    id: e.id, type: e.type, typeLabel: ENTITY_TYPE_LABEL[e.type as EntityType] ?? e.type,
    value: e.value, source: e.source, strong: isStrongEntity(e.type),
  })).sort((a, b) => Number(b.strong) - Number(a.strong) || a.type.localeCompare(b.type));

  let summaryText = acc.summary;
  let by = acc.summaryModel ?? "template";
  if (!summaryText || !isCurrentSummary(acc.summaryModel)) {   // 옛 판 요약(연락처 강도 구분 포함 가능)은 다시 만든다
    // 공개 빌드: 요약 입력(모델·템플릿)에 공개 범위 밖 연결 계정 id 를 넣지 않는다 — 화면에서 숨길 것을 모델에 먼저 보내지 않게(카이 5808c65 검수 2).
    // 그렇게 만든 요약은 연결 계정이 빠진 판이므로, 숨긴 연결 계정이 있으면 DB 에 저장하지 않는다(관리자가 열 때 전체로 다시 만든다).
    const linkedForSummary = opts.admin ? sharedWith : onlyVisible(sharedWith, (s) => s.accountId, false);
    const partial = linkedForSummary.length !== sharedWith.length;
    const s = await summarizeAccount({
      platform: acc.platform, handle: acc.handle, profileUrl: acc.profileUrl, bio: acc.bio, externalUrl: acc.externalUrl,
      posts: rows.map((p) => ({ postUrl: p.postUrl, parentUrl: p.parentUrl, text: p.text, postedAt: p.postedAt?.toISOString() ?? null, capturedAt: p.capturedAt.toISOString(), score: p.score })),
      reasons: reasons.map((r) => r.label),
      reasonCodes: reasons.map((r) => r.code),
      contacts: contacts.map((c) => ({ typeLabel: c.typeLabel, value: c.value })),
      linkedAccounts: linkedForSummary.map((s) => s.accountId),
    });
    summaryText = s.summary; by = s.model + SUMMARY_VERSION;
    if (!partial) await d.update(schema.accounts).set({ summary: summaryText, summaryModel: by }).where(eq(schema.accounts.id, accountId));
  }

  return {
    reportId: `SR-${acc.id.replace(":", "-")}-${new Date().toISOString().slice(0, 10)}`,
    generatedAt: new Date().toISOString(),
    status: acc.label as InvestigationReport["status"],
    effectiveStatus: effectiveStatus(acc.label, acc.humanLabel),
    score: acc.score,
    humanReview: acc.humanLabel && acc.reviewedAt
      ? { label: acc.humanLabel as "SCAM" | "NOT_SCAM", note: acc.humanNote, reviewedAt: acc.reviewedAt.toISOString(), reviewedBy: acc.reviewedBy }
      : null,
    account: {
      platform: acc.platform, handle: acc.handle, displayName: acc.displayName, url: acc.profileUrl, profileCapture: acc.profileShotUrl,
      bio: acc.bio, externalUrl: acc.externalUrl, followers: acc.followers, following: acc.following, createdAt: acc.accountCreatedAt?.toISOString() ?? null,
    },
    timeline: { firstSeen: acc.firstSeen.toISOString(), lastSeen: acc.lastSeen.toISOString(), postCount: rows.length, distinctTargets: acc.distinctTargets },
    summary: { text: summaryText, generatedBy: summaryModelLabel(by) },
    contacts,
    linkedAccounts: sharedWith,
    evidence: rows.map((p) => ({
      postUrl: p.postUrl, parentUrl: p.parentUrl, kind: p.kind, postedAt: p.postedAt?.toISOString() ?? null, capturedAt: p.capturedAt.toISOString(),
      capture: p.screenshotUrl, text: p.text, score: p.score, techniques: p.techniques, clusterId: p.clusterId,
    })),
    rationale: explainReasons(reasons),
    filing: FILING_TARGETS,
    disclaimer: "이 화면은 컴퓨터가 글을 자동으로 살펴본 결과예요. 이 사람이 사기를 쳤다고 정한 것은 아니에요.",   // 율 #compliance 1791943988 (소현 O)
  };
}
