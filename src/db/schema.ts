import { pgTable, text, integer, timestamp, jsonb, primaryKey, index, boolean } from "drizzle-orm/pg-core";

/** 계정 — id = `${platform}:${handle소문자}` */
export const accounts = pgTable("accounts", {
  id: text("id").primaryKey(),
  platform: text("platform").notNull(),
  handle: text("handle").notNull(),
  displayName: text("display_name"),
  profileUrl: text("profile_url").notNull(),
  bio: text("bio"),
  externalUrl: text("external_url"),
  followers: integer("followers"),
  following: integer("following"),
  postCount: integer("post_count"),
  accountCreatedAt: timestamp("account_created_at", { withTimezone: true }),
  profileShotUrl: text("profile_shot_url"),
  /** 계정 종합 점수 (게시물 최대점 + 반복·살포 가점) */
  score: integer("score").notNull().default(0),
  label: text("label").notNull().default("LOW"),
  reasons: jsonb("reasons").$type<unknown[]>().notNull().default([]),
  /** LLM 범죄사실요약 (HIGH 일 때만 생성, 캐시) */
  summary: text("summary"),
  summaryModel: text("summary_model"),
  /** 사람의 최종 판단 — "SCAM" | "NOT_SCAM" | null(미검토). 기계 라벨을 덮어쓴다 */
  humanLabel: text("human_label"),
  humanNote: text("human_note"),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  reviewedBy: text("reviewed_by"),
  postTotal: integer("post_total").notNull().default(0),
  distinctTargets: integer("distinct_targets").notNull().default(0),
  firstSeen: timestamp("first_seen", { withTimezone: true }).notNull().defaultNow(),
  lastSeen: timestamp("last_seen", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("accounts_handle_idx").on(t.handle), index("accounts_score_idx").on(t.score)]);

export const posts = pgTable("posts", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull().references(() => accounts.id),
  platform: text("platform").notNull(),
  postUrl: text("post_url").notNull(),
  /** 댓글인 경우 원글 URL */
  parentUrl: text("parent_url"),
  kind: text("kind").notNull().default("post"),
  text: text("text").notNull(),
  normalizedText: text("normalized_text").notNull(),
  exactKey: text("exact_key").notNull(),
  postedAt: timestamp("posted_at", { withTimezone: true }),
  capturedAt: timestamp("captured_at", { withTimezone: true }).notNull(),
  screenshotUrl: text("screenshot_url"),
  score: integer("score").notNull(),
  label: text("label").notNull(),
  reasons: jsonb("reasons").$type<unknown[]>().notNull().default([]),
  techniques: jsonb("techniques").$type<string[]>().notNull().default([]),
  clusterId: text("cluster_id"),
  minhash: jsonb("minhash").$type<number[]>().notNull(),
  llmVerdict: jsonb("llm_verdict").$type<unknown>(),
  /** 게시물 단위 사람 판단 — "SCAM" | "NOT_SCAM" | null */
  humanLabel: text("human_label"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("posts_account_idx").on(t.accountId),
  index("posts_exact_idx").on(t.exactKey),
  index("posts_cluster_idx").on(t.clusterId),
  index("posts_url_idx").on(t.postUrl),
]);

export const clusters = pgTable("clusters", {
  id: text("id").primaryKey(),
  canonicalText: text("canonical_text").notNull(),
  size: integer("size").notNull().default(1),
  accountCount: integer("account_count").notNull().default(1),
  scoreMax: integer("score_max").notNull().default(0),
  firstSeen: timestamp("first_seen", { withTimezone: true }).notNull().defaultNow(),
  lastSeen: timestamp("last_seen", { withTimezone: true }).notNull().defaultNow(),
});

/** LSH 밴드 → 게시물. 후보 조회는 band_key IN (...) 한 방 */
export const lshBands = pgTable("lsh_bands", {
  bandKey: text("band_key").notNull(),
  postId: text("post_id").notNull(),
}, (t) => [primaryKey({ columns: [t.bandKey, t.postId] })]);

/** LLM 결과 캐시 — 같은 내용은 두 번 과금하지 않는다 */
export const llmCache = pgTable("llm_cache", {
  key: text("key").primaryKey(),
  kind: text("kind").notNull(),
  result: jsonb("result").notNull(),
  model: text("model").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Best-effort TTL cache for public investigation sources; absence of this table falls back to memory. */
export const investigateCache = pgTable("investigate_cache", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("investigate_cache_expires_idx").on(t.expiresAt)]);

/** 조회 사이트에서 사용자가 남긴 제보/이의 */
export const feedback = pgTable("feedback", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull(),
  isScam: boolean("is_scam").notNull(),
  note: text("note"),
  /** "open" | "resolved" — 검토 큐가 보는 값 */
  status: text("status").notNull().default("open"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * 연락처 엔티티 — id = `${type}:${value}` (예: `telegram:vip_room`).
 * PIP 논문(arXiv 2404.07797)에서 계정 간 연결의 최고 정밀도 신호가 공유 연락처다.
 */
export const entities = pgTable("entities", {
  id: text("id").primaryKey(),
  type: text("type").notNull(),
  value: text("value").notNull(),
  firstSeen: timestamp("first_seen", { withTimezone: true }).notNull().defaultNow(),
  lastSeen: timestamp("last_seen", { withTimezone: true }).notNull().defaultNow(),
  /** 이 연락처를 쓴 서로 다른 계정 수 */
  accountCount: integer("account_count").notNull().default(0),
  postCount: integer("post_count").notNull().default(0),
}, (t) => [index("entities_type_idx").on(t.type), index("entities_account_count_idx").on(t.accountCount)]);

/** 게시물 ↔ 엔티티. account_id 를 비정규화해 두어 계정 간 링크를 조인 없이 찾는다 */
export const postEntities = pgTable("post_entities", {
  postId: text("post_id").notNull(),
  entityId: text("entity_id").notNull(),
  accountId: text("account_id").notNull(),
  /** "text" | "bio" | "externalUrl" */
  source: text("source").notNull().default("text"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  primaryKey({ columns: [t.postId, t.entityId] }),
  index("post_entities_entity_idx").on(t.entityId),
  index("post_entities_account_idx").on(t.accountId),
]);

/**
 * 이용자 사기 신고 — "사기 당했어요 · 계정 등록" (테오 10-14 ④). 키 = `threads:핸들` 또는 연락처 엔티티 id(`telegram:vip_room`).
 * 신고자는 IP 의 HMAC 한 조각만 남긴다(원문·IP 원값 저장 안 함). 같은 신고자 × 같은 키는 1건(PK).
 * 표시하는 N = 키별 행 수 = 서로 다른 신고자 수.
 */
export const communityReports = pgTable("community_reports", {
  key: text("key").notNull(),
  reporter: text("reporter").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  primaryKey({ columns: [t.key, t.reporter] }),
  index("community_reports_reporter_idx").on(t.reporter, t.createdAt),
]);

/** 이용자가 함께 신고한 받은 글 — 원문 없이 MinHash 서명(브라우저 계산)과 LSH 밴드만. 같은 신고자 × 같은 서명 = 1건(id) */
export const communityTexts = pgTable("community_texts", {
  id: text("id").primaryKey(),
  reporter: text("reporter").notNull(),
  sig: jsonb("sig").notNull(),
  bands: text("bands").array().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("community_texts_reporter_idx").on(t.reporter, t.createdAt)]);

/** 신고 상한 카운터 — 신고자 × 구간(시간·하루)별 건수. 원자적 증가로 동시 등록이 상한을 넘지 못하게 (lib/community.ts reserve) */
export const communityQuota = pgTable("community_quota", {
  reporter: text("reporter").notNull(),
  bucket: text("bucket").notNull(),
  n: integer("n").notNull(),
}, (t) => [primaryKey({ columns: [t.reporter, t.bucket] })]);

export type Account = typeof accounts.$inferSelect;
export type EntityRow = typeof entities.$inferSelect;
export type PostEntityRow = typeof postEntities.$inferSelect;
export type Post = typeof posts.$inferSelect;
export type Cluster = typeof clusters.$inferSelect;
