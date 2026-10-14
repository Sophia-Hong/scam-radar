import { and, eq, gt } from "drizzle-orm";
import { db, hasDb, schema } from "@/db";

const MAX_ENTRIES = 300;
const TIMEOUT_MS = 4_000;
const MIN_HOST_INTERVAL_MS = 2_000;
const memory = new Map<string, { value: unknown; expiresAt: number }>();
/** Next permitted start time. Reserving it synchronously also serializes concurrent callers. */
const nextRequestByHost = new Map<string, number>();

function remember(key: string, value: unknown, ttlMs: number) {
  memory.delete(key);
  memory.set(key, { value, expiresAt: Date.now() + ttlMs });
  while (memory.size > MAX_ENTRIES) memory.delete(memory.keys().next().value!);
}

/** Best-effort cache: a missing/unmigrated database never prevents investigation. */
export async function cached<T>(key: string, ttlMs: number, work: () => Promise<T>): Promise<T> {
  const now = Date.now();
  const hit = memory.get(key);
  if (hit && hit.expiresAt > now) return hit.value as T;
  if (hit) memory.delete(key);

  if (hasDb) {
    try {
      const row = await db().select().from(schema.investigateCache)
        .where(and(eq(schema.investigateCache.key, key), gt(schema.investigateCache.expiresAt, new Date(now))))
        .limit(1);
      if (row[0]) {
        const value = (row[0].value as { value: T }).value;
        remember(key, value, Math.max(1, row[0].expiresAt.getTime() - now));
        return value;
      }
    } catch { /* Optional table is not installed yet. */ }
  }

  const value = await work();
  remember(key, value, ttlMs);
  if (hasDb) {
    try {
      await db().insert(schema.investigateCache).values({ key, value: { value }, expiresAt: new Date(Date.now() + ttlMs) })
        .onConflictDoUpdate({ target: schema.investigateCache.key, set: { value: { value }, expiresAt: new Date(Date.now() + ttlMs) } });
    } catch { /* In-memory cache remains sufficient when DB cache is unavailable. */ }
  }
  return value;
}

async function waitForHost(host: string) {
  const now = Date.now();
  const scheduledAt = Math.max(now, nextRequestByHost.get(host) ?? 0);
  nextRequestByHost.set(host, scheduledAt + MIN_HOST_INTERVAL_MS);
  const wait = scheduledAt - now;
  if (wait > 0) await new Promise<void>((resolve) => setTimeout(resolve, wait));
}

/** Only use this for approved public-data endpoints, never for the investigated URL. */
export async function fetchJson(url: string, init: RequestInit = {}): Promise<unknown | null> {
  try {
    const parsed = new URL(url);
    await waitForHost(parsed.host);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const response = await fetch(url, { ...init, signal: controller.signal, headers: { "user-agent": "ScamRadarBot/0.1 (+contact: sophia.hong@legalfriend.ai)", ...init.headers } });
      if (!response.ok) return null;
      return await response.json();
    } finally {
      clearTimeout(timer);
    }
  } catch {
    return null;
  }
}

/** Test-only reset; production callers never need cache control. */
export function resetInvestigationRuntimeForTests() {
  memory.clear();
  nextRequestByHost.clear();
}
