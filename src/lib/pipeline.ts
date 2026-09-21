import { z } from "zod";
import { and, eq, inArray, sql } from "drizzle-orm";
import { put } from "@vercel/blob";
import { db, schema } from "@/db";
import { normalize, exactKey, minhash, bandKeys, jaccard, scoreText, fnv1a64, JACCARD_THRESHOLD, extractEntities, entityId, entityLabel, STRONG_ENTITY_TYPES, type Label, type Reason, type Entity } from "@/engine";
import { reviewEvidenceImage, reviewPost } from "./llm";
import { accountIdOf } from "./ids";
export { accountIdOf };

export const IngestSchema = z.object({
  platform: z.enum(["threads", "instagram", "x", "youtube", "naver", "other"]).default("threads"),
  postUrl: z.string().url(),
  parentUrl: z.string().url().nullish(),
  kind: z.enum(["post", "comment"]).default("post"),
  text: z.string().min(1).max(10000),
  postedAt: z.string().nullish(),
  capturedAt: z.string().default(() => new Date().toISOString()),
  /** base64 PNG/JPEG (data: 접두어 유무 무관) 또는 이미 업로드된 URL */
  screenshot: z.string().nullish(),
  author: z.object({
    handle: z.string().min(1),
    displayName: z.string().nullish(),
    profileUrl: z.string().url(),
    bio: z.string().nullish(),
    externalUrl: z.string().nullish(),
    followers: z.number().int().nullish(),
    following: z.number().int().nullish(),
    postCount: z.number().int().nullish(),
    createdAt: z.string().nullish(),
    profileCountry: z.string().max(120).nullish(),
    countrySource: z.enum(["threads_about_profile", "manual"]).nullish(),
    profileScreenshot: z.string().nullish(),
  }),
});
export type IngestPayload = z.infer<typeof IngestSchema>;

export interface IngestResult {
  postId: string;
  accountId: string;
  duplicate: boolean;
  score: number;
  label: Label;
  clusterId: string | null;
  accountScore: number;
  accountLabel: Label;
  /** 이 게시물에서 뽑힌 연락처 엔티티 */
  entities: { type: string; value: string; source: string }[];
  /** 같은 연락처를 쓰는 다른 계정 수 */
  sharedContacts: number;
}


async function uploadShot(kind: "post" | "profile", id: string, data?: string | null): Promise<string | null> {
  if (!data) return null;
  if (/^https?:\/\//.test(data)) return data;
  if (!process.env.BLOB_READ_WRITE_TOKEN) return null; // Blob 미설정이면 캡처는 수집기 로컬에만 남음
  const m = data.match(/^data:(image\/\w+);base64,([\s\S]*)$/);
  const mime = m?.[1] ?? "image/png";
  const b64 = m?.[2] ?? data;
  const buf = Buffer.from(b64, "base64");
  const ext = mime.split("/")[1] === "jpeg" ? "jpg" : mime.split("/")[1];
  const blob = await put(`shots/${kind}/${id}.${ext}`, buf, { access: "public", contentType: mime, addRandomSuffix: false });
  return blob.url;
}

/** 계정 근거에 붙는 공유 연락처 코드 */
export const SHARED_CONTACT_CODE = "shared-contact";

/** 다른 계정 N개와 연락처를 공유할 때의 가점 (1개만 겹쳐도 8점, 최대 20점) */
export function sharedContactPoints(n: number): number {
  return Math.min(20, 8 + 4 * (n - 1));
}

export interface SharedAccount {
  accountId: string;
  handle: string;
  score: number;
  label: string;
  /** 어떤 엔티티로 연결됐는지 (entity id) */
  via: string;
}

type Dbh = ReturnType<typeof db>;

/** 이 게시물에서 뽑은 엔티티를 entities/post_entities 에 반영하고 집계를 갱신한다 */
async function upsertEntities(d: Dbh, postId: string, accountId: string, ents: Entity[], seenAt: Date) {
  if (!ents.length) return;
  await d.insert(schema.entities).values(ents.map((e) => ({
    id: entityId(e.type, e.value), type: e.type, value: e.value, firstSeen: seenAt, lastSeen: seenAt,
  }))).onConflictDoUpdate({
    target: schema.entities.id,
    set: {
      firstSeen: sql`least(${schema.entities.firstSeen}, excluded.first_seen)`,
      lastSeen: sql`greatest(${schema.entities.lastSeen}, excluded.last_seen)`,
    },
  });
  await d.insert(schema.postEntities).values(ents.map((e) => ({
    postId, entityId: entityId(e.type, e.value), accountId, source: e.source,
  }))).onConflictDoNothing();

  // 집계는 한 문장으로 (엔티티 수만큼 왕복하지 않는다)
  const ids = ents.map((e) => entityId(e.type, e.value));
  await d.update(schema.entities).set({
    postCount: sql`(select count(*) from post_entities pe where pe.entity_id = ${schema.entities.id})`,
    accountCount: sql`(select count(distinct pe.account_id) from post_entities pe where pe.entity_id = ${schema.entities.id})`,
  }).where(inArray(schema.entities.id, ids));
}

/** 계정이 쓴 강한 엔티티를 공유하는 다른 계정들 */
export async function sharedAccountsOf(accountId: string): Promise<{ entities: { id: string; type: string; value: string; source: string }[]; sharedWith: SharedAccount[] }> {
  const d = db();
  const ownRows = await d.selectDistinct({ id: schema.entities.id, type: schema.entities.type, value: schema.entities.value, source: schema.postEntities.source })
    .from(schema.postEntities)
    .innerJoin(schema.entities, eq(schema.entities.id, schema.postEntities.entityId))
    .where(eq(schema.postEntities.accountId, accountId));
  // 같은 엔티티가 본문·프로필 양쪽에서 나오면 행이 둘이 된다 → 엔티티 1건으로 합친다
  const ownMap = new Map<string, { id: string; type: string; value: string; source: string }>();
  for (const r of ownRows) {
    const prev = ownMap.get(r.id);
    if (!prev) ownMap.set(r.id, r);
    else if (!prev.source.split(",").includes(r.source)) prev.source = `${prev.source},${r.source}`;
  }
  const own = [...ownMap.values()];
  const strongIds = own.filter((e) => STRONG_ENTITY_TYPES.includes(e.type as Entity["type"])).map((e) => e.id);
  if (!strongIds.length) return { entities: own, sharedWith: [] };
  const rows = await d.selectDistinct({
    accountId: schema.postEntities.accountId, entityId: schema.postEntities.entityId,
    handle: schema.accounts.handle, score: schema.accounts.score, label: schema.accounts.label,
  }).from(schema.postEntities)
    .innerJoin(schema.accounts, eq(schema.accounts.id, schema.postEntities.accountId))
    .where(and(inArray(schema.postEntities.entityId, strongIds), sql`${schema.postEntities.accountId} <> ${accountId}`));
  const seen = new Set<string>();
  const sharedWith: SharedAccount[] = [];
  for (const r of rows) {
    if (seen.has(r.accountId)) continue;
    seen.add(r.accountId);
    sharedWith.push({ accountId: r.accountId, handle: r.handle, score: r.score, label: r.label, via: r.entityId });
  }
  return { entities: own, sharedWith };
}

/**
 * 주어진 계정들의 `shared-contact` 근거와 종합 점수를 다시 계산한다.
 * 조회는 계정 수와 무관하게 고정 4회, 쓰기는 영향받은 계정당 UPDATE 1회.
 */
export async function recomputeSharedContact(d: Dbh, accountIds: string[]): Promise<Map<string, { score: number; label: Label; sharedCount: number }>> {
  const ids = [...new Set(accountIds.filter(Boolean))];
  const out = new Map<string, { score: number; label: Label; sharedCount: number }>();
  if (!ids.length) return out;

  // 1) 대상 계정들이 쓴 강한 엔티티
  const mine = await d.selectDistinct({ accountId: schema.postEntities.accountId, entityId: schema.postEntities.entityId })
    .from(schema.postEntities)
    .innerJoin(schema.entities, eq(schema.entities.id, schema.postEntities.entityId))
    .where(and(inArray(schema.postEntities.accountId, ids), inArray(schema.entities.type, STRONG_ENTITY_TYPES)));
  const entIds = [...new Set(mine.map((m) => m.entityId))];

  // 2) 그 엔티티를 쓰는 모든 계정
  const all = entIds.length
    ? await d.selectDistinct({ entityId: schema.postEntities.entityId, accountId: schema.postEntities.accountId })
        .from(schema.postEntities).where(inArray(schema.postEntities.entityId, entIds))
    : [];
  const holders = new Map<string, Set<string>>();
  for (const r of all) (holders.get(r.entityId) ?? holders.set(r.entityId, new Set()).get(r.entityId)!).add(r.accountId);

  // 3) 계정별 게시물 최고점 + 기존 근거
  const maxes = await d.select({ accountId: schema.posts.accountId, mx: sql<number>`max(${schema.posts.score})` })
    .from(schema.posts).where(inArray(schema.posts.accountId, ids)).groupBy(schema.posts.accountId);
  const maxOf = new Map(maxes.map((m) => [m.accountId, Number(m.mx ?? 0)]));
  const rows = await d.select({ id: schema.accounts.id, reasons: schema.accounts.reasons })
    .from(schema.accounts).where(inArray(schema.accounts.id, ids));

  const myEnts = new Map<string, string[]>();
  for (const m of mine) (myEnts.get(m.accountId) ?? myEnts.set(m.accountId, []).get(m.accountId)!).push(m.entityId);

  for (const row of rows) {
    const reasons = ((row.reasons as Reason[]) ?? []).filter((r) => r.code !== SHARED_CONTACT_CODE);
    const linked = new Set<string>();
    const viaLabels: string[] = [];
    for (const eid of myEnts.get(row.id) ?? []) {
      const others = [...(holders.get(eid) ?? [])].filter((a) => a !== row.id);
      if (!others.length) continue;
      others.forEach((a) => linked.add(a));
      const [type, ...rest] = eid.split(":");
      viaLabels.push(`${entityLabel(type, rest.join(":"))} → ${others.join(", ")}`);
    }
    const n = linked.size;
    if (n >= 1) {
      reasons.push({
        code: SHARED_CONTACT_CODE,
        label: `다른 계정 ${n}개와 동일 연락처 사용`,
        points: sharedContactPoints(n),
        evidence: viaLabels.join(" / "),
      });
    }
    const score = Math.min(100, (maxOf.get(row.id) ?? 0) + (n >= 1 ? sharedContactPoints(n) : 0));
    const label: Label = score >= 70 ? "HIGH" : score >= 40 ? "REVIEW" : "LOW";
    reasons.sort((a, b) => b.points - a.points);
    await d.update(schema.accounts).set({ score, label, reasons: reasons as unknown[] }).where(eq(schema.accounts.id, row.id));
    out.set(row.id, { score, label, sharedCount: n });
  }
  return out;
}

export async function ingest(payload: IngestPayload): Promise<IngestResult> {
  const d = db();
  const accountId = accountIdOf(payload.platform, payload.author.handle);
  const postId = fnv1a64(`${payload.platform}|${payload.postUrl}`);

  // 0) URL 기준 정확 중복 → 즉시 반환 (재수집 비용 0)
  const existing = await d.select({ id: schema.posts.id, score: schema.posts.score, label: schema.posts.label, clusterId: schema.posts.clusterId })
    .from(schema.posts).where(eq(schema.posts.id, postId)).limit(1);
  if (existing[0]) {
    const acc = await d.select({ score: schema.accounts.score, label: schema.accounts.label }).from(schema.accounts).where(eq(schema.accounts.id, accountId)).limit(1);
    return { postId, accountId, duplicate: true, score: existing[0].score, label: existing[0].label as Label, clusterId: existing[0].clusterId, accountScore: acc[0]?.score ?? 0, accountLabel: (acc[0]?.label ?? "LOW") as Label, entities: [], sharedContacts: 0 };
  }

  // 1) 정규화 · 서명
  const n = normalize(payload.text);
  const ek = exactKey(n.compact);
  const sig = minhash(n.text);
  const keys = bandKeys(sig);

  // 2) LSH 후보 → 실제 Jaccard 재검증 → 클러스터 배정
  const candRows = await d.select({ postId: schema.lshBands.postId }).from(schema.lshBands).where(inArray(schema.lshBands.bandKey, keys));
  const candIds = [...new Set(candRows.map((r) => r.postId))].slice(0, 200);
  let clusterId: string | null = null;
  let near: { id: string; clusterId: string | null; accountId: string }[] = [];
  if (candIds.length) {
    const cands = await d.select({ id: schema.posts.id, normalizedText: schema.posts.normalizedText, clusterId: schema.posts.clusterId, accountId: schema.posts.accountId })
      .from(schema.posts).where(inArray(schema.posts.id, candIds));
    near = cands.filter((c) => jaccard(n.text, c.normalizedText) >= JACCARD_THRESHOLD);
    const votes = new Map<string, number>();
    for (const c of near) if (c.clusterId) votes.set(c.clusterId, (votes.get(c.clusterId) ?? 0) + 1);
    if (votes.size) clusterId = [...votes.entries()].sort((a, b) => b[1] - a[1])[0][0];
    else if (near.length) {
      clusterId = "c_" + fnv1a64(n.compact).slice(0, 12);
      await d.insert(schema.clusters).values({ id: clusterId, canonicalText: n.text.slice(0, 500), size: 0, accountCount: 0 }).onConflictDoNothing();
      await d.update(schema.posts).set({ clusterId }).where(inArray(schema.posts.id, near.map((c) => c.id)));
    }
  }

  // 3) 계정 반복·살포 특성 (이 계정의 기존 게시물 기준)
  const [agg] = await d.select({
    total: sql<number>`count(*)`,
    sameCluster: sql<number>`count(*) filter (where ${schema.posts.clusterId} = ${clusterId ?? ""} or ${schema.posts.exactKey} = ${ek})`,
    targets: sql<number>`count(distinct ${schema.posts.parentUrl})`,
  }).from(schema.posts).where(eq(schema.posts.accountId, accountId));
  const clusterSizeForAccount = Number(agg?.sameCluster ?? 0) + 1;
  const distinctTargets = Number(agg?.targets ?? 0) + (payload.parentUrl ? 1 : 0);

  // 3b) 살포(spread) — 이 글과 근사 중복인 글을 쓴 **서로 다른 계정** 수 (본 계정 포함).
  //     클러스터가 이미 있으면 DB 의 클러스터 구성원으로, 아니면 이번에 찾은 근사 중복 후보로 센다.
  const spreadAccounts = new Set<string>([accountId, ...near.map((c) => c.accountId)]);
  if (clusterId) {
    const memberRows = await d.selectDistinct({ accountId: schema.posts.accountId }).from(schema.posts).where(eq(schema.posts.clusterId, clusterId));
    for (const m of memberRows) spreadAccounts.add(m.accountId);
  }
  const clusterAccounts = spreadAccounts.size;

  // 4) 룰 스코어. 가입 국가는 한국 기관 사칭 결합이 있을 때만 약한 보조 신호로 사용한다.
  const baseFeatures = {
    bio: payload.author.bio, externalUrl: payload.author.externalUrl,
    followers: payload.author.followers, following: payload.author.following,
    createdAt: payload.author.createdAt,
    profileCountry: payload.author.profileCountry, countrySource: payload.author.countrySource,
    clusterSize: clusterSizeForAccount, clusterAccounts, distinctTargets,
  };
  let r = scoreText(payload.text, baseFeatures);

  // 사원증·급여명세 등 증빙을 동반한 기관 사칭 후보만 이미지 보조 검토한다.
  // 이미지가 없거나 Gateway가 비활성화되면 비용 0원이며 룰 결과를 그대로 쓴다.
  const credentialCandidate = r.reasons.some((x) => x.code === "impersonate:institution+credential");
  const visualReview = credentialCandidate && payload.screenshot
    ? await reviewEvidenceImage(payload.text, payload.screenshot)
    : null;
  if (visualReview?.verdict === "suspicious" && visualReview.confidence >= 0.75) {
    r = scoreText(payload.text, { ...baseFeatures, syntheticEvidenceConfidence: visualReview.confidence });
  }
  let score = r.score;
  let label = r.label;
  const reasons: Reason[] = [...r.reasons];
  let llmVerdict: unknown = visualReview ? { visual: visualReview } : null;

  // 5) 경계 사례만 LLM 재판정 (비용 통제)
  if (r.needsLlmReview) {
    const v = await reviewPost(payload.text, r.reasons.map((x) => x.label), baseFeatures);
    llmVerdict = { ...(typeof llmVerdict === "object" && llmVerdict ? llmVerdict : {}), text: v };
    if (v.verdict === "scam" && v.confidence >= 0.6) { score = Math.min(100, score + 20); reasons.unshift({ code: "llm:scam", label: `LLM 재판정: 유인글 (${v.rationale})`, points: 20 }); }
    const hasCoordinationEvidence = r.reasons.some((reason) => /^(cluster|spread|spray|shared-contact)/.test(reason.code) && reason.points > 0);
    if (v.verdict === "benign" && v.confidence >= 0.6 && !hasCoordinationEvidence) { score = Math.max(0, score - 20); reasons.unshift({ code: "llm:benign", label: `LLM 재판정: 정상 (${v.rationale})`, points: -20 }); }
    label = score >= 70 ? "HIGH" : score >= 40 ? "REVIEW" : "LOW";
  }

  // 6) 캡처 업로드 (증거)
  const [shotUrl, profileShotUrl] = await Promise.all([
    uploadShot("post", postId, payload.screenshot),
    uploadShot("profile", accountId.replace(":", "_"), payload.author.profileScreenshot),
  ]);

  // 7) 저장
  const capturedAt = new Date(payload.capturedAt);
  const seenAt = payload.postedAt ? new Date(payload.postedAt) : capturedAt; // 관측 기간은 게시 시각 기준
  await d.insert(schema.accounts).values({
    id: accountId, platform: payload.platform, handle: payload.author.handle.replace(/^@/, ""),
    displayName: payload.author.displayName ?? null, profileUrl: payload.author.profileUrl,
    bio: payload.author.bio ?? null, externalUrl: payload.author.externalUrl ?? null,
    followers: payload.author.followers ?? null, following: payload.author.following ?? null,
    postCount: payload.author.postCount ?? null,
    accountCreatedAt: payload.author.createdAt ? new Date(payload.author.createdAt) : null,
    profileShotUrl, firstSeen: seenAt, lastSeen: seenAt,
  }).onConflictDoUpdate({
    target: schema.accounts.id,
    set: {
      displayName: payload.author.displayName ?? undefined, bio: payload.author.bio ?? undefined,
      externalUrl: payload.author.externalUrl ?? undefined, followers: payload.author.followers ?? undefined,
      following: payload.author.following ?? undefined, postCount: payload.author.postCount ?? undefined,
      profileShotUrl: profileShotUrl ?? undefined, updatedAt: new Date(),
      firstSeen: sql`least(${schema.accounts.firstSeen}, ${seenAt})`,
      lastSeen: sql`greatest(${schema.accounts.lastSeen}, ${seenAt})`,
    },
  });

  await d.insert(schema.posts).values({
    id: postId, accountId, platform: payload.platform, postUrl: payload.postUrl, parentUrl: payload.parentUrl ?? null,
    kind: payload.kind, text: payload.text, normalizedText: n.text, exactKey: ek,
    postedAt: payload.postedAt ? new Date(payload.postedAt) : null, capturedAt,
    screenshotUrl: shotUrl, score, label, reasons, techniques: n.techniques, clusterId, minhash: sig, llmVerdict,
  });
  await d.insert(schema.lshBands).values(keys.map((bandKey) => ({ bandKey, postId }))).onConflictDoNothing();

  // 7b) 연락처 엔티티 — 본문 + 프로필 bio/외부링크
  const ents = extractEntities(payload.text, { bio: payload.author.bio, externalUrl: payload.author.externalUrl });
  await upsertEntities(d, postId, accountId, ents, seenAt);

  if (clusterId) {
    const [cs] = await d.select({ size: sql<number>`count(*)`, accts: sql<number>`count(distinct ${schema.posts.accountId})`, mx: sql<number>`max(${schema.posts.score})` })
      .from(schema.posts).where(eq(schema.posts.clusterId, clusterId));
    await d.update(schema.clusters).set({ size: Number(cs.size), accountCount: Number(cs.accts), scoreMax: Number(cs.mx), lastSeen: capturedAt }).where(eq(schema.clusters.id, clusterId));
  }

  // 8) 계정 종합 점수 = 게시물 최고점 + 반복/살포 가점(이미 게시물 점수에 반영됨) — 최고점 게시물 근거를 계정 근거로
  const [best] = await d.select({ score: schema.posts.score, reasons: schema.posts.reasons, total: sql<number>`count(*) over ()` })
    .from(schema.posts).where(eq(schema.posts.accountId, accountId)).orderBy(sql`${schema.posts.score} desc`).limit(1);
  let accountScore = best?.score ?? score;
  let accountLabel: Label = accountScore >= 70 ? "HIGH" : accountScore >= 40 ? "REVIEW" : "LOW";
  // 계정 근거 = 최고점 게시물 근거 + 계정 단위 반복·살포 근거 (게시물 시점엔 몰랐던 사실을 반영)
  const accountReasons = ((best?.reasons ?? reasons) as Reason[]).filter((x) => x.code !== "cluster" && x.code !== "spray");
  const [rep] = await d.select({ c: sql<number>`count(*)` }).from(schema.posts).where(eq(schema.posts.accountId, accountId))
    .groupBy(sql`coalesce(${schema.posts.clusterId}, ${schema.posts.exactKey})`).orderBy(sql`count(*) desc`).limit(1);
  const maxRepeat = Number(rep?.c ?? 1);
  if (maxRepeat >= 2) accountReasons.push({ code: "cluster", label: "동일·유사 문구 반복 게시", points: Math.min(15, 5 + (maxRepeat - 2) * 3), evidence: `${maxRepeat}건` });
  if (distinctTargets >= 3) accountReasons.push({ code: "spray", label: "무관한 여러 원글에 동일 댓글 살포", points: 10, evidence: `${distinctTargets}개 원글` });
  accountReasons.sort((a, b) => b.points - a.points);
  await d.update(schema.accounts).set({
    score: accountScore, label: accountLabel, reasons: accountReasons as unknown[],
    postTotal: Number(best?.total ?? 1), distinctTargets, summary: null, // 새 증거가 붙으면 요약은 다음 리포트 요청 때 재생성
  }).where(and(eq(schema.accounts.id, accountId)));

  // 9) 계정 간 연결 — 이 계정이 쓴 강한 연락처를 공유하는 다른 계정도 같이 다시 계산한다.
  //    (연결은 양방향이라, 나중에 들어온 계정 때문에 먼저 들어온 계정의 점수도 올라가야 한다)
  let sharedContacts = 0;
  if (ents.length) {
    const strongIds = ents.filter((e) => STRONG_ENTITY_TYPES.includes(e.type)).map((e) => entityId(e.type, e.value));
    const affected = strongIds.length
      ? await d.selectDistinct({ accountId: schema.postEntities.accountId }).from(schema.postEntities).where(inArray(schema.postEntities.entityId, strongIds))
      : [];
    const res = await recomputeSharedContact(d, [accountId, ...affected.map((a) => a.accountId)]);
    const mine = res.get(accountId);
    if (mine) { accountScore = mine.score; accountLabel = mine.label; sharedContacts = mine.sharedCount; }
  }

  return {
    postId, accountId, duplicate: false, score, label, clusterId, accountScore, accountLabel,
    entities: ents.map((e) => ({ type: e.type, value: e.value, source: e.source })),
    sharedContacts,
  };
}
