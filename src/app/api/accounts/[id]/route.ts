import { desc, eq, or, ilike } from "drizzle-orm";
import { db, hasDb, schema } from "@/db";
import { checkAdmin, json } from "@/lib/auth";
import { isCurrentSummary } from "@/lib/llm";
import { contactPairs, maskContact, maskDeep } from "@/lib/mask";
import { signIds } from "@/lib/result-view";
import { decodeParam, onlyVisible, publicReasons, redactSharedContact, signalGroupsFromReasons } from "@/lib/visibility";
import { resolveAccountId } from "@/lib/resolve";
import { sharedAccountsOf } from "@/lib/pipeline";
import { effectiveStatus } from "@/lib/labels";

export const runtime = "nodejs";

/** GET /api/accounts/:id — 계정 조회 (핸들·URL·id 모두 허용) */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!hasDb) return json({ error: "database not configured" }, 503);
  const { id } = await ctx.params;
  const r = resolveAccountId(decodeParam(id));
  const admin = checkAdmin(req);
  const d = db();
  const found = await d.select().from(schema.accounts)
    .where(r.id ? or(eq(schema.accounts.id, r.id), ilike(schema.accounts.handle, r.handle)) : ilike(schema.accounts.handle, r.handle))
    .orderBy(desc(schema.accounts.score)).limit(5);
  // 공개 열람자에게는 합성 데모 계정만 — 실계정은 "기록 없음"과 같은 응답(보유 여부도 드러내지 않는다)
  const rows = onlyVisible(found, (a) => a.id, admin);
  if (!rows.length) return json({ found: false, query: r, score: 0, label: "UNKNOWN", effectiveStatus: "UNKNOWN", message: "수집된 기록 없음 — 안전하다는 뜻은 아닙니다" }, 404);
  const acc = rows[0];
  const posts = await d.select({
    id: schema.posts.id, postUrl: schema.posts.postUrl, parentUrl: schema.posts.parentUrl, kind: schema.posts.kind, text: schema.posts.text,
    postedAt: schema.posts.postedAt, capturedAt: schema.posts.capturedAt, screenshotUrl: schema.posts.screenshotUrl,
    score: schema.posts.score, label: schema.posts.label, reasons: schema.posts.reasons, techniques: schema.posts.techniques, clusterId: schema.posts.clusterId,
  }).from(schema.posts).where(eq(schema.posts.accountId, acc.id)).orderBy(desc(schema.posts.score)).limit(20);
  // 연락처 엔티티 + 같은 연락처를 쓰는 다른 계정 (PIP: 가장 정밀도 높은 계정 간 연결 신호)
  const shared = await sharedAccountsOf(acc.id);
  const entities = shared.entities;
  const sharedWith = onlyVisible(shared.sharedWith, (s) => s.accountId, admin);
  // 공개 열람자에게는 근거 문장·요약문에 적힌 실계정 id 도 가린다 (연결 계정이 걸러졌으면 요약문은 비움)
  const trimmed = sharedWith.length !== shared.sharedWith.length;
  const accReasons = redactSharedContact((acc.reasons ?? []) as { code: string; label: string; points: number; evidence?: string | null }[]);
  // 공개: 근거는 방향·설명만(내부 코드 없음), 신호군은 서버에서 계산한 결과만. 요약문은 현재 판만(옛 판은 연락처 강도 구분이 남을 수 있음)
  // 관리자: 원본 근거 + 같은 신호군 계산값(화면 칩이 비지 않게, 카이 05213d0 HOLD 2)
  // 쉬운 말 징후 — 서버가 내부 코드·뽑은 연락처 종류로 문장 id 만 골라 내보낸다(브라우저와 같은 함수)
  const signs = signIds((["HIGH", "REVIEW", "LOW"].includes(acc.label) ? acc.label : "LOW") as "HIGH" | "REVIEW" | "LOW", accReasons, entities.map((e) => e.type));
  const shownAccount = admin ? { ...acc, signalGroups: signalGroupsFromReasons(accReasons), signs } : {
    ...acc,
    signs,
    reasons: publicReasons(accReasons),
    signalGroups: signalGroupsFromReasons(accReasons),
    summary: trimmed || !isCurrentSummary(acc.summaryModel) ? null : acc.summary,
    summaryModel: undefined,
    humanLabel: null, humanNote: null, reviewedAt: null, reviewedBy: null,
  };
  if (!admin) {
    // 공개: 연락처는 가리고, 다른 계정의 이름·핸들·링크는 수만 (율 #compliance 1791947465 조건 1·2)
    const pairs: [string, string][] = [
      ...contactPairs(entities),
      ...shared.sharedWith.flatMap((s) => [[s.accountId, "(다른 계정)"], [`@${s.handle}`, "(다른 계정)"], [s.handle, "(다른 계정)"]] as [string, string][]),
    ];
    return json(maskDeep({
      found: true, account: shownAccount,
      posts: posts.map((p) => ({ ...p, reasons: publicReasons(((p.reasons ?? []) as { code: string; label: string; points: number; evidence?: string | null }[])) })),   // 신호 방향·설명만
      entities: entities.map((e) => ({ type: e.type, value: maskContact(e.type, e.value), source: e.source })),
      sharedWith: [], sharedCount: sharedWith.length,
      humanLabel: null, humanNote: null, reviewedAt: null, reviewedBy: null,
      effectiveStatus: acc.label,
      otherMatches: [],
    }, pairs, ["handle", "profileUrl", "platform", "id", "postUrl", "parentUrl", "screenshotUrl", "profileShotUrl", "type", "source", "signs", "label", "effectiveStatus"]));
  }
  return json({
    found: true, account: shownAccount,
    posts,
    entities, sharedWith,
    // 표시 라벨은 사람 판단이 있으면 그것이 최종 (src/lib/labels.ts 한 곳에서 결정)
    // 공개: 사람 검토 결과·검토자 정보 없음(카이 ④ 검수 3). 관리자만 그대로
    humanLabel: admin ? acc.humanLabel : null,
    humanNote: admin ? acc.humanNote : null,
    reviewedAt: admin ? acc.reviewedAt?.toISOString() ?? null : null,
    reviewedBy: admin ? acc.reviewedBy : null,
    effectiveStatus: admin ? effectiveStatus(acc.label, acc.humanLabel) : acc.label,
    otherMatches: rows.slice(1).map((a) => ({
      id: a.id, platform: a.platform, handle: a.handle, score: a.score, label: a.label,
      effectiveStatus: effectiveStatus(a.label, a.humanLabel),
    })),
  });
}
