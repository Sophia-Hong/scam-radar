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
export const KEY_TYPES = ["threads", "telegram", "kakao_open", "kakao_channel", "phone", "handle", "url", "line", "wechat", "whatsapp", "signal"] as const;
export const MAX_KEYS_PER_POST = 5;
export const MAX_KEYS_PER_CHECK = 10;
export const HOURLY_LIMIT = 10;
export const DAILY_LIMIT = 30;
/** 한 키(계정·링크·연락처)에 하루(UTC) 새로 붙을 수 있는 신고 — 여러 연결에서 같은 키를 몰아 올리는 것을 막는다(카이 180b67e 검수, 테오 1791946984) */
export const KEY_DAILY_LIMIT = 20;
/** 짧은 시간에 몰리면 표시 보류 — 최근 BURST_WINDOW_MS 안에 BURST_LIMIT 건 이상 새로 붙은 키는 그 창이 지날 때까지 숫자를 보이지 않음 */
export const BURST_LIMIT = 10;
export const BURST_WINDOW_MS = 6 * 3_600_000;
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

/** 키별 서로 다른 신고자 수(원값) — 최근 BURST_WINDOW 안에 몰린 키는 null(표시 보류) */
export async function rawCounts(keys: string[], now = new Date()): Promise<Record<string, number | null>> {
  if (!keys.length) return {};
  await ensureTables();
  const t = schema.communityReports;
  const since = new Date(now.getTime() - BURST_WINDOW_MS);
  const rows = await db().select({ key: t.key, n: count(), recent: sql<number>`count(*) filter (where ${t.createdAt} > ${since})` })
    .from(t).where(inArray(t.key, keys)).groupBy(t.key);
  return Object.fromEntries(rows.map((r) => [r.key, Number(r.recent) >= BURST_LIMIT ? null : Number(r.n)]));
}

/** 이 서명과 비슷한(추정 Jaccard ≥ 기준) 신고 글의 서로 다른 신고자 수(원값) */
/** 이 서명과 비슷한 신고 글의 서로 다른 신고자 수(원값). 최근 BURST_WINDOW 안에 BURST_LIMIT 건 이상 몰렸으면 null(표시 보류 — 키와 같은 규칙, 카이 912e045) */
export async function similarReporters(sig: number[], now = new Date()): Promise<number | null> {
  await ensureTables();
  const t = schema.communityTexts;
  const rows = await db().select({ reporter: t.reporter, sig: t.sig, createdAt: t.createdAt }).from(t).where(sql`${t.bands} && ${textArray(bandKeys(sig))}`).limit(500);
  const hits = rows.filter((r) => estimateJaccard(sig, r.sig as number[]) >= JACCARD_THRESHOLD);
  const since = now.getTime() - BURST_WINDOW_MS;
  if (hits.filter((r) => new Date(r.createdAt).getTime() > since).length >= BURST_LIMIT) return null;
  return new Set(hits.map((r) => r.reporter)).size;
}

export type CheckResult = { counts: Record<string, number>; similar: number; gated?: boolean };
export type EngineLevel = "HIGH" | "REVIEW" | "LOW";

/**
 * 교차 확인 (테오 1791948637, 율 OK 1791948645): 신고 수는 *서로 다른 연결 3곳 이상 AND 지금 이 글·계정의 엔진 판정이 중간 이상*일 때만 공개.
 * 엔진이 낮음(또는 판정 없음)이면 신고는 쌓이기만 하고 공개 화면엔 안 보인다. 조회마다 그때의 판정으로 계산하므로,
 * 판정이 낮음으로 내려가면 이미 보이던 "신고 N건"도 그 즉시 숨는다. 신고만으로는 무고한 계정에 경고가 뜨지 않게.
 */
export function countsVisible(level: EngineLevel | null | undefined): boolean {
  return level === "HIGH" || level === "REVIEW";
}

/** 화면용 조회 — 숨김 규칙(서로 다른 신고자 3명 미만)을 적용한 값만 돌려준다 */
export async function check(keys: string[], sig: number[] | null, level: EngineLevel | null = null, keyLevels: Record<string, EngineLevel> = {}): Promise<CheckResult> {
  // 키마다 판정 자격: 서버가 아는 판정(keyLevels — 공개 합성 계정의 DB 판정)이 있으면 그 키에만, 없으면 요청의 판정. 한 키의 판정이 다른 키에 번지지 않는다(카이 392ac60)
  // 계정을 가리키는 키(threads:*, 글 속 @아이디 handle:*)는 요청의 판정으로 열 수 없다 — 서버가 아는 판정(공개 합성 계정)만.
  // 실계정 키는 공개 조회에서 숫자를 내지 않는다(카이 1791950858 · dbdc4f3)
  const isAccountKey = (k: string) => k.startsWith("threads:") || k.startsWith("handle:");
  const levelOf = (k: string) => keyLevels[k] ?? (isAccountKey(k) ? null : level);
  keys = keys.filter((k) => countsVisible(levelOf(k)));
  if (!countsVisible(level)) sig = null;
  if (!keys.length && !sig) return { counts: {}, similar: 0, gated: true };   // DB 를 읽기 전에 — 낮음이면 숫자 자체를 만들지 않는다
  const [raw, similar] = await Promise.all([rawCounts(keys), sig ? similarReporters(sig) : Promise.resolve(0)]);
  const counts: Record<string, number> = {};
  for (const [k, n] of Object.entries(raw)) if (n !== null && shown(n)) counts[k] = shown(n);   // null = 몰림 보류
  return { counts, similar: similar === null ? 0 : shown(similar) };
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

/** 예약했지만 실제로 쓰지 않은 만큼 되돌린다(0 아래로는 안 감) — 동시 중복 요청이 할당량을 실제 등록보다 더 쓰지 않게 */
export async function release(reporter: string, bucket: string, k: number): Promise<void> {
  if (k <= 0) return;
  await db().execute(sql`UPDATE community_quota SET n = GREATEST(n - ${k}, 0) WHERE reporter = ${reporter} AND bucket = ${bucket}`);
}

/**
 * 글 서명 등록 = 밴드 16개 하루 할당 + 서명 행 삽입을 *SQL 한 문장*으로(테오 1791950099 · 카이 392ac60).
 * 밴드는 모두 +1(행 잠금) → 하나라도 상한을 넘거나 서명 행이 이미 있으면(중복) 문장 끝의 검사가 오류를 내서 문장 전체가 되돌아간다
 * — 실패한 밴드의 할당량이 남거나 잘못 빠지는 일이 없다. 반환: "ok" | "limited" | "duplicate".
 */
export async function insertTextAtomically(reporter: string, textId: string, sig: number[], day: string, now: Date): Promise<"ok" | "limited" | "duplicate"> {
  const bands = bandKeys(sig);
  const bandReporters = bands.map((b) => `band:${b}`);
  try {
    await db().execute(sql`
      WITH up AS (
        INSERT INTO community_quota (reporter, bucket, n)
        SELECT r, ${`d:${day}`}, 1 FROM unnest(${textArray(bandReporters)}) AS r
        ON CONFLICT (reporter, bucket) DO UPDATE SET n = community_quota.n + 1
        RETURNING n),
      ins AS (
        INSERT INTO community_texts (id, reporter, sig, bands, created_at)
        VALUES (${textId}, ${reporter}, ${JSON.stringify(sig)}::jsonb, ${textArray(bands)}, ${now})
        ON CONFLICT (id) DO NOTHING
        RETURNING id)
      -- 오류는 *실행 시점 값*으로만 나게 한다(상수 캐스트·1/0 은 계획 단계에서 미리 계산돼 늘 실패한다)
      SELECT (1 / CASE WHEN (SELECT max(n) FROM up) > ${KEY_DAILY_LIMIT} THEN 0 ELSE 1 END)
           + (CASE WHEN (SELECT count(*) FROM ins) = 0 THEN 'duplicate' ELSE '0' END)::int AS result`);
    return "ok";
  } catch (e) {
    const msg = String((e as { message?: string })?.message ?? e) + String((e as { cause?: { message?: string } })?.cause?.message ?? "");
    if (/division by zero/i.test(msg)) return "limited";
    if (/invalid input syntax for type integer/i.test(msg)) return "duplicate";
    throw e;
  }
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
    const hour = now.toISOString().slice(0, 13);
    const day = now.toISOString().slice(0, 10);
    if (!(await reserve(reporter, `h:${hour}`, adding, HOURLY_LIMIT))) return { ok: false, reason: "limited" };
    if (!(await reserve(reporter, `d:${day}`, adding, DAILY_LIMIT))) { await release(reporter, `h:${hour}`, adding); return { ok: false, reason: "limited" }; }
    // 키별 하루 상한 — 넘은 키는 이번 등록에서 뺀다(예약에 성공한 키만 allowed)
    const allowed: string[] = [];
    for (const key of fresh) if (await reserve(`key:${key}`, `d:${day}`, 1, KEY_DAILY_LIMIT)) allowed.push(key);
    // 글 서명: 밴드 할당·삽입을 한 문장으로(원자적). 상한·중복이면 아무것도 남기지 않는다
    const textResult = textIsNew && sig && textId ? await insertTextAtomically(reporter, textId, sig, day, now) : null;
    // 실제로 들어간 행만 센다 — 동시 중복 요청에서 added 가 부풀지 않게, 할당량도 실제 등록 수만큼만 남긴다(카이 912e045, 테오 1791948618)
    const insKeys = allowed.length ? await db().insert(r).values(allowed.map((key) => ({ key, reporter, createdAt: now }))).onConflictDoNothing().returning({ key: r.key }) : [];
    const added = insKeys.length + (textResult === "ok" ? 1 : 0);
    await release(reporter, `h:${hour}`, adding - added);
    await release(reporter, `d:${day}`, adding - added);
    const inserted = new Set(insKeys.map((x) => x.key));
    for (const key of allowed) if (!inserted.has(key)) await release(`key:${key}`, `d:${day}`, 1);   // 예약했지만 중복이던 키만(예약 실패한 키는 더한 적 없음)
    if (!added && (textResult === "limited" || allowed.length < fresh.length)) return { ok: false, reason: "limited" };
    return { ok: true, added };
  }
  return { ok: true, added: 0 };
}
