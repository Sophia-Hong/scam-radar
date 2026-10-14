import { z } from "zod";
import { hasDb } from "@/db";
import { json } from "@/lib/auth";
import { clientIp, MAX_KEYS_PER_POST, normalizeKeys, register, reporterId, reporterSecret, validSig } from "@/lib/community";

export const runtime = "nodejs";

const Body = z.object({ keys: z.array(z.string().max(220)).max(MAX_KEYS_PER_POST).default([]), sig: z.array(z.number()).optional() });

/** POST /api/community {keys:[…], sig?:[128]} — "피해를 당했어요 · 신고하기". 원문·이름·IP 원값은 받거나 남기지 않는다 */
export async function POST(req: Request) {
  if (!hasDb) return json({ error: "database not configured" }, 503);
  const p = Body.safeParse(await req.json().catch(() => null));
  if (!p.success) return json({ error: "invalid body" }, 400);
  const keys = normalizeKeys(p.data.keys, MAX_KEYS_PER_POST);
  const sig = p.data.sig ? validSig(p.data.sig) : null;
  if (p.data.sig && !sig) return json({ error: "invalid signature" }, 400);
  if (!keys.length && !sig) return json({ error: "nothing to report" }, 400);
  const reporter = reporterId(clientIp(req), reporterSecret());
  if (!reporter) return json({ error: "registry not configured" }, 503);
  try {
    const r = await register(keys, sig, reporter);
    if (!r.ok) return json({ error: "too many reports", retryAfterSec: 3600 }, 429);
    return json(r);
  } catch {
    return json({ error: "registry unavailable" }, 503);
  }
}
