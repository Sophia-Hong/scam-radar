import { z } from "zod";
import { db, hasDb, schema } from "@/db";
import { json } from "@/lib/auth";
import { fnv1a64 } from "@/engine";

export const runtime = "nodejs";
const Schema = z.object({ accountId: z.string().min(3), isScam: z.boolean(), note: z.string().max(500).optional() });

/**
 * IP 당 분당 10건. 프로세스 메모리라 서버리스 인스턴스마다 따로 세지만,
 * 막으려는 것은 한 사람의 연타지 분산 공격이 아니므로 이 정도면 충분하다.
 */
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 10;
const hits = new Map<string, number[]>();

function clientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return req.headers.get("x-real-ip") ?? "unknown";
}

function rateLimited(ip: string): boolean {
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  if (recent.length >= MAX_PER_WINDOW) { hits.set(ip, recent); return true; }
  recent.push(now);
  hits.set(ip, recent);
  if (hits.size > 5000) for (const [k, v] of hits) if (!v.some((t) => now - t < WINDOW_MS)) hits.delete(k); // 오래된 키 정리
  return false;
}

/** POST /api/feedback — 조회 사이트 이용자의 제보/이의 (사람 검토 루프) */
export async function POST(req: Request) {
  if (!hasDb) return json({ error: "database not configured" }, 503);
  if (rateLimited(clientIp(req))) return json({ error: "too many requests", retryAfterSec: 60 }, 429);
  const p = Schema.safeParse(await req.json().catch(() => null));
  if (!p.success) return json({ error: p.error.flatten() }, 400);
  const id = fnv1a64(p.data.accountId + Date.now() + Math.random());
  await db().insert(schema.feedback).values({ id, ...p.data });
  return json({ ok: true, id });
}
