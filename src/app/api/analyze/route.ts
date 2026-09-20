import { z } from "zod";
import { scoreText } from "@/engine";
import { json } from "@/lib/auth";

export const runtime = "nodejs"; // 순수 TS 엔진 — DB 없음

const Schema = z.object({
  text: z.string().min(1).max(10000),
  account: z.object({
    followers: z.number().nullish(), following: z.number().nullish(), createdAt: z.string().nullish(),
    bio: z.string().nullish(), externalUrl: z.string().nullish(), clusterSize: z.number().nullish(), clusterAccounts: z.number().nullish(), distinctTargets: z.number().nullish(),
    profileCountry: z.string().nullish(), countrySource: z.string().nullish(), syntheticEvidenceConfidence: z.number().min(0).max(1).nullish(),
  }).optional(),
});

/** POST /api/analyze — 무상태 텍스트 판정 (저장 안 함) */
export async function POST(req: Request) {
  const parsed = Schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return json({ error: parsed.error.flatten() }, 400);
  const r = scoreText(parsed.data.text, parsed.data.account ?? {});
  return json({
    score: r.score, label: r.label, reasons: r.reasons, matched: r.matched, categories: r.categories,
    normalized: { text: r.normalized.text, compact: r.normalized.compact, techniques: r.normalized.techniques, obfuscationRatio: r.normalized.obfuscationRatio },
    needsLlmReview: r.needsLlmReview, signalGroups: r.signalGroups,
  });
}
