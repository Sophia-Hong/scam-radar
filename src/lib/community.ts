import { createHmac } from "node:crypto";
import { and, count, eq, gt, inArray, sql } from "drizzle-orm";
import { db, schema } from "@/db";

/**
 * 이용자 사기 신고 장부 (테오 10-14 ④ "I was scammed / 사기 계정 등록").
 * - 키: `threads:핸들` 또는 연락처 엔티티 id(`telegram:vip_room`, `phone:01012345678` …). 원문은 받지 않는다.
 * - 신고자: IP 의 HMAC 앞 32자. IP 원값·이름·글은 저장하지 않는다.
 * - N = 키별 서로 다른 신고자 수(같은 신고자 × 같은 키 = 1건).
 * - 스팸: 신고자당 새 등록 시간당 HOURLY_LIMIT, 하루 DAILY_LIMIT. 한 번에 키 MAX_KEYS_PER_POST 개까지.
 */
export const KEY_TYPES = ["threads", "telegram", "kakao_open", "kakao_channel", "phone", "handle", "url", "line", "wechat"] as const;
export const MAX_KEYS_PER_POST = 5;
export const MAX_KEYS_PER_GET = 10;
export const HOURLY_LIMIT = 10;
export const DAILY_LIMIT = 30;

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

export function reporterSecret(): string | undefined {
  return process.env.COMMUNITY_SECRET || process.env.ADMIN_TOKEN || undefined;
}

let ensured: Promise<void> | null = null;
/** 표가 없으면 만든다(IF NOT EXISTS) — `drizzle-kit push` 없이도 첫 요청에서 준비된다 */
export function ensureTable(): Promise<void> {
  ensured ??= (async () => {
    await db().execute(sql`CREATE TABLE IF NOT EXISTS community_reports (
      key text NOT NULL,
      reporter text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (key, reporter)
    )`);
    await db().execute(sql`CREATE INDEX IF NOT EXISTS community_reports_reporter_idx ON community_reports (reporter, created_at)`);
  })().catch((e) => { ensured = null; throw e; });
  return ensured;
}

export async function countsFor(keys: string[]): Promise<Record<string, number>> {
  if (!keys.length) return {};
  await ensureTable();
  const t = schema.communityReports;
  const rows = await db().select({ key: t.key, n: count() }).from(t).where(inArray(t.key, keys)).groupBy(t.key);
  const out: Record<string, number> = {};
  for (const r of rows) out[r.key] = Number(r.n);
  return out;
}

export type RegisterResult = { ok: true; added: number; counts: Record<string, number> } | { ok: false; reason: "limited" };

export async function register(keys: string[], reporter: string, now = new Date()): Promise<RegisterResult> {
  await ensureTable();
  const t = schema.communityReports;
  const since = (ms: number) => new Date(now.getTime() - ms);
  const recent = async (ms: number) => Number((await db().select({ n: count() }).from(t).where(and(eq(t.reporter, reporter), gt(t.createdAt, since(ms)))))[0]?.n ?? 0);
  const existing = new Set((await db().select({ key: t.key }).from(t).where(and(eq(t.reporter, reporter), inArray(t.key, keys)))).map((r) => r.key));
  const fresh = keys.filter((k) => !existing.has(k));
  if (fresh.length) {
    const [hour, day] = [await recent(3_600_000), await recent(86_400_000)];
    if (hour + fresh.length > HOURLY_LIMIT || day + fresh.length > DAILY_LIMIT) return { ok: false, reason: "limited" };
    await db().insert(t).values(fresh.map((key) => ({ key, reporter, createdAt: now }))).onConflictDoNothing();
  }
  return { ok: true, added: fresh.length, counts: await countsFor(keys) };
}
