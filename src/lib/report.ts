import { desc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { summarizeAccount } from "./llm";
import { sharedAccountsOf, type SharedAccount } from "./pipeline";
import { ENTITY_TYPE_LABEL, isStrongEntity, explainReasons, type Reason, type EntityType } from "@/engine";
import { effectiveStatus, type EffectiveStatus } from "./labels";

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
  /** 내용 — 범죄사실요약 (요건사실 위주) */
  summary: { text: string; generatedBy: string };
  /** 유도 수단 — 본문·프로필에서 확인된 실제 연락처 */
  contacts: { id: string; type: string; typeLabel: string; value: string; source: string; strong: boolean }[];
  /** 같은 연락처를 쓰는 다른 계정 (동일 운영자·조직 정황) */
  linkedAccounts: SharedAccount[];
  /** 증거 캡쳐 */
  evidence: { postUrl: string; parentUrl: string | null; kind: string; postedAt: string | null; capturedAt: string; capture: string | null; text: string; score: number; techniques: string[]; clusterId: string | null }[];
  /** 근거 — 코드·라벨·점수에 더해 사람이 읽을 설명(무엇이/왜/예시/정상 사용) */
  rationale: { code: string; label: string; points: number; evidence?: string; what: string; why: string; example: string; benign: string }[];
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

export async function buildReport(accountId: string): Promise<InvestigationReport | null> {
  const d = db();
  const [acc] = await d.select().from(schema.accounts).where(eq(schema.accounts.id, accountId)).limit(1);
  if (!acc) return null;
  const rows = await d.select().from(schema.posts).where(eq(schema.posts.accountId, accountId)).orderBy(desc(schema.posts.score), desc(schema.posts.capturedAt)).limit(50);

  const reasons = (acc.reasons as Reason[]) ?? [];
  const { entities, sharedWith } = await sharedAccountsOf(acc.id);
  const contacts = entities.map((e) => ({
    id: e.id, type: e.type, typeLabel: ENTITY_TYPE_LABEL[e.type as EntityType] ?? e.type,
    value: e.value, source: e.source, strong: isStrongEntity(e.type),
  })).sort((a, b) => Number(b.strong) - Number(a.strong) || a.type.localeCompare(b.type));

  let summaryText = acc.summary;
  let by = acc.summaryModel ?? "template";
  if (!summaryText) {
    const s = await summarizeAccount({
      platform: acc.platform, handle: acc.handle, profileUrl: acc.profileUrl, bio: acc.bio, externalUrl: acc.externalUrl,
      posts: rows.map((p) => ({ postUrl: p.postUrl, parentUrl: p.parentUrl, text: p.text, postedAt: p.postedAt?.toISOString() ?? null, capturedAt: p.capturedAt.toISOString(), score: p.score })),
      reasons: reasons.map((r) => r.label),
      reasonCodes: reasons.map((r) => r.code),
      contacts: contacts.map((c) => ({ typeLabel: c.typeLabel, value: c.value, strong: c.strong })),
      linkedAccounts: sharedWith.map((s) => s.accountId),
    });
    summaryText = s.summary; by = s.model;
    await d.update(schema.accounts).set({ summary: summaryText, summaryModel: by }).where(eq(schema.accounts.id, accountId));
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
    summary: { text: summaryText, generatedBy: by },
    contacts,
    linkedAccounts: sharedWith,
    evidence: rows.map((p) => ({
      postUrl: p.postUrl, parentUrl: p.parentUrl, kind: p.kind, postedAt: p.postedAt?.toISOString() ?? null, capturedAt: p.capturedAt.toISOString(),
      capture: p.screenshotUrl, text: p.text, score: p.score, techniques: p.techniques, clusterId: p.clusterId,
    })),
    rationale: explainReasons(reasons),
    filing: FILING_TARGETS,
    disclaimer: "본 리포트는 공개 게시물의 자동 분석 결과이며 법적 판단이 아닙니다. 신고 여부와 최종 판단은 사람이 검토 후 결정합니다.",
  };
}
