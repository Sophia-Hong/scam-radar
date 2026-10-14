import { createHash, createHmac } from "node:crypto";
import { and, count, eq, inArray, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { bandKeys, estimateJaccard, JACCARD_THRESHOLD, NUM_PERM } from "@/engine/minhash";

/**
 * 이용자 신고 장부 (테오 10-14 ④·③, 율 #compliance 1791943087 조건 1~3. 검토 요청 흐름은 소현 지시로 뺐다).
 * - 키: `threads:핸들` 또는 연락처 엔티티 id(`telegram:vip_room` …). 받은 글은 원문 대신 브라우저가 만든 MinHash 서명만.
 * - 신고자: IP 의 HMAC 앞 32자 + 신고 시각. IP 원값·이름·글은 저장하지 않는다. (조건 3)
 * - 같은 신고자 × 같은 키(또는 같은 서명) = 1건. (조건 2)
 * - 화면에 보이는 수 = 서로 다른 신고자(IP HMAC) 수 = '신고 N건'. 사람 수가 아니다(IP 를 바꾸면 늘고, 공유 IP 면 줄어든다).
 *   서로 다른 연결 MIN_DISTINCT_CONNECTIONS 곳 미만이면 숫자를 보이지 않음. (조건 1)
 * - 스팸: 신고자당 새 등록 시간당 HOURLY_LIMIT, 하루 DAILY_LIMIT. 한 번에 키 MAX_KEYS_PER_POST 개까지.
 */
export const KEY_TYPES = ["threads", "telegram", "kakao_open", "kakao_channel", "phone", "handle", "url", "line", "wechat"] as const;
export const MAX_KEYS_PER_POST = 5;
export const MAX_KEYS_PER_CHECK = 10;
export const HOURLY_LIMIT = 10;
export const DAILY_LIMIT = 30;
/** 서로 다른 연결(IP HMAC) 3곳 미만이면 숫자를 보이지 않음 (율 #compliance 1791944952) */
export const MIN_DISTINCT_CONNECTIONS = 3;

const VALUE_RE: Record<string, RegExp> = {
  threads: /^[a-z0-9._]{1,64}$/,
  phone: /^\+?[0-9-]{6,20}$/,
};
const GENERIC_VALUE_RE = /^[^\s<>"'`]{1,200}$/;

/** 형식이 맞는 키만 소문자로 돌려준다. 아니면 null */
export function normalizeKey(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const s = raw.trim().toLowerCase();
  const i = s.indexOf(":");
  if (i <= 0) return null;
  const type = s.slice(0, i);
  const value = s.slice(i + 1).replace(/^@/, "");
  if (!(KEY_TYPES as readonly string[]).includes(type)) return null;
  if (!(VALUE_RE[type] ?? GENERIC_VALUE_RE).test(value)) return null;
  return `${type}:${value}`;
}

export function normalizeKeys(raw: unknown, max: number): string[] {
  const list = Array.isArray(raw) ? raw : [raw];
  return [...new Set(list.map(normalizeKey).filter((k): k is string => !!k))].slice(0, max);
}

/** MinHash 서명 형식 검사 — 128개의 32비트 부호 없는 정수 */
export function validSig(raw: unknown): number[] | null {
  if (!Array.isArray(raw) || raw.length !== NUM_PERM) return null;
  return raw.every((v) => Number.isInteger(v) && v >= 0 && v <= 0xffffffff) ? (raw as number[]) : null;
}

/** Vercel 이 덮어쓰는 x-real-ip 를 먼저 — 이용자가 보낸 x-forwarded-for 로 신고자를 바꿔 끼우지 못하게 */
export function clientIp(req: Request): string {
  const real = req.headers.get("x-real-ip");
  if (real) return real.trim();
  const fwd = req.headers.get("x-forwarded-for");
  return fwd ? fwd.split(",")[0].trim() : "unknown";
}

/** IP → 신고자 id. 비밀값이 없으면 null(등록을 받지 않는다) */
export function reporterId(ip: string, secret: string | undefined): string | null {
  if (!secret) return null;
  return createHmac("sha256", secret).update(`community:${ip}`).digest("hex").slice(0, 32);
}

/** 전용 비밀값만 — ADMIN_TOKEN 을 대신 쓰면 토큰을 바꿀 때 같은 IP 가 새 신고자가 된다(카이 ④ 검수 2). 없으면 등록을 받지 않는다 */
export function reporterSecret(): string | undefined {
  return process.env.COMMUNITY_SECRET || undefined;
}

/** 화면에 내보낼 수 — MIN_DISPLAY 명 미만은 0(숨김) */
export const shown = (n: number) => (n >= MIN_DISTINCT_CONNECTIONS ? n : 0);

let ensured: Promise<void> | null = null;
/** 표가 없으면 만든다(IF NOT EXISTS) — `drizzle-kit push` 없이도 첫 요청에서 준비된다. 정의는 schema.ts 와 같다 */
export function ensureTables(): Promise<void> {
  ensured ??= (async () => {
    const d = db();
    await d.execute(sql`CREATE TABLE IF NOT EXISTS community_reports (
      key text NOT NULL, reporter text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY (key, reporter))`);
    await d.execute(sql`CREATE INDEX IF NOT EXISTS community_reports_reporter_idx ON community_reports (reporter, created_at)`);
    await d.execute(sql`CREATE TABLE IF NOT EXISTS community_texts (
      id text PRIMARY KEY, reporter text NOT NULL, sig jsonb NOT NULL, bands text[] NOT NULL, created_at timestamptz NOT NULL DEFAULT now())`);
    await d.execute(sql`CREATE INDEX IF NOT EXISTS community_texts_bands_idx ON community_texts USING gin (bands)`);
    await d.execute(sql`CREATE INDEX IF NOT EXISTS community_texts_reporter_idx ON community_texts (reporter, created_at)`);
    await d.execute(sql`CREATE TABLE IF NOT EXISTS community_quota (
      reporter text NOT NULL, bucket text NOT NULL, n integer NOT NULL, PRIMARY KEY (reporter, bucket))`);
  })().catch((e) => { ensured = null; throw e; });
  return ensured;
}

const textArray = (xs: string[]) => sql`ARRAY[${sql.join(xs.map((x) => sql`${x}`), sql`, `)}]::text[]`;

/** 키별 서로 다른 신고자 수(원값) */
export async function rawCounts(keys: string[]): Promise<Record<string, number>> {
  if (!keys.length) return {};
  await ensureTables();
  const t = schema.communityReports;
  const rows = await db().select({ key: t.key, n: count() }).from(t).where(inArray(t.key, keys)).groupBy(t.key);
  return Object.fromEntries(rows.map((r) => [r.key, Number(r.n)]));
}

/** 이 서명과 비슷한(추정 Jaccard ≥ 기준) 신고 글의 서로 다른 신고자 수(원값) */
export async function similarReporters(sig: number[]): Promise<number> {
  await ensureTables();
  const t = schema.communityTexts;
  const rows = await db().select({ reporter: t.reporter, sig: t.sig }).from(t).where(sql`${t.bands} && ${textArray(bandKeys(sig))}`).limit(500);
  return new Set(rows.filter((r) => estimateJaccard(sig, r.sig as number[]) >= JACCARD_THRESHOLD).map((r) => r.reporter)).size;
}

export type CheckResult = { counts: Record<string, number>; similar: number };

/** 화면용 조회 — 숨김 규칙(서로 다른 신고자 3명 미만)을 적용한 값만 돌려준다 */
export async function check(keys: string[], sig: number[] | null): Promise<CheckResult> {
  const [raw, similar] = await Promise.all([rawCounts(keys), sig ? similarReporters(sig) : Promise.resolve(0)]);
  const counts: Record<string, number> = {};
  for (const [k, n] of Object.entries(raw)) if (shown(n)) counts[k] = shown(n);
  return { counts, similar: shown(similar) };
}

/**
 * 신고자 × 구간(시간 `h:YYYY-MM-DDTHH` · 하루 `d:YYYY-MM-DD`, UTC)에 k 건을 원자적으로 더한다. 상한을 넘으면 더하지 않고 false.
 * ON CONFLICT DO UPDATE … WHERE 는 행을 잠그고 최신 값으로 조건을 다시 보므로 동시 요청에서도 상한을 넘지 않는다.
 * (시간 구간은 통과하고 하루 구간에서 막히면 시간 쪽은 이미 더해져 있다 — 보수적인 쪽으로 틀린다)
 */
export async function reserve(reporter: string, bucket: string, k: number, limit: number): Promise<boolean> {
  if (k > limit) return false;
  const res = await db().execute(sql`INSERT INTO community_quota (reporter, bucket, n) VALUES (${reporter}, ${bucket}, ${k})
    ON CONFLICT (reporter, bucket) DO UPDATE SET n = community_quota.n + EXCLUDED.n
    WHERE community_quota.n + EXCLUDED.n <= ${limit} RETURNING n`);
  const rows = (res as unknown as { rows?: unknown[] }).rows ?? (res as unknown as unknown[]);
  return Array.isArray(rows) && rows.length > 0;
}

export type RegisterResult = { ok: true; added: number } | { ok: false; reason: "limited" };

export async function register(keys: string[], sig: number[] | null, reporter: string, now = new Date()): Promise<RegisterResult> {
  await ensureTables();
  const r = schema.communityReports;
  const tx = schema.communityTexts;
  const existing = keys.length ? new Set((await db().select({ key: r.key }).from(r).where(and(eq(r.reporter, reporter), inArray(r.key, keys)))).map((x) => x.key)) : new Set<string>();
  const fresh = keys.filter((k) => !existing.has(k));
  const textId = sig ? createHash("sha256").update(`${reporter}|${bandKeys(sig).join(",")}`).digest("hex").slice(0, 32) : null;
  const textIsNew = textId ? !(await db().select({ id: tx.id }).from(tx).where(eq(tx.id, textId)).limit(1)).length : false;
  const adding = fresh.length + (textIsNew ? 1 : 0);
  if (adding) {
    // 시간·하루 상한을 원자적 카운터로 먼저 잡는다 — 동시 요청이 같은 옛 건수를 보고 함께 넘는 일이 없다(카이 ④ 검수 5)
    if (!(await reserve(reporter, `h:${now.toISOString().slice(0, 13)}`, adding, HOURLY_LIMIT))) return { ok: false, reason: "limited" };
    if (!(await reserve(reporter, `d:${now.toISOString().slice(0, 10)}`, adding, DAILY_LIMIT))) return { ok: false, reason: "limited" };
    if (fresh.length) await db().insert(r).values(fresh.map((key) => ({ key, reporter, createdAt: now }))).onConflictDoNothing();
    if (textIsNew && sig && textId) await db().insert(tx).values({ id: textId, reporter, sig, bands: bandKeys(sig), createdAt: now }).onConflictDoNothing();
  }
  return { ok: true, added: adding };
}
