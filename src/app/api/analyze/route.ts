import { z } from "zod";
import { scoreText } from "@/engine";
import { json } from "@/lib/auth";
import { reviewPost } from "@/lib/llm";

export const runtime = "nodejs";

const Schema = z.object({
  text: z.string().min(1).max(10000),
  account: z.object({
    followers: z.number().nullish(), following: z.number().nullish(), createdAt: z.string().nullish(),
    bio: z.string().nullish(), externalUrl: z.string().nullish(), clusterSize: z.number().nullish(), clusterAccounts: z.number().nullish(), distinctTargets: z.number().nullish(),
    profileCountry: z.string().nullish(), countrySource: z.string().nullish(), syntheticEvidenceConfidence: z.number().min(0).max(1).nullish(),
  }).optional(),
});

/** POST /api/analyze — 원문은 저장하지 않고, 경계 사례만 Gemini로 재검토한다. */
export async function POST(req: Request) {
  const parsed = Schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return json({ error: parsed.error.flatten() }, 400);
  const r = scoreText(parsed.data.text, parsed.data.account ?? {});
  let score = r.score;
  let label = r.label;
  const reasons = [...r.reasons];
  const modelReview = r.needsLlmReview
    ? await reviewPost(parsed.data.text, r.reasons.map((reason) => reason.label))
    : null;

  if (modelReview?.verdict === "scam" && modelReview.confidence >= 0.6) {
    score = Math.min(100, score + 20);
    reasons.unshift({ code: "llm:scam", label: `AI 재판정: 유인 정황 (${modelReview.rationale})`, points: 20 });
  }
  if (modelReview?.verdict === "benign" && modelReview.confidence >= 0.6) {
    score = Math.max(0, score - 20);
    reasons.unshift({ code: "llm:benign", label: `AI 재판정: 정상 맥락 (${modelReview.rationale})`, points: -20 });
  }
  label = score >= 70 ? "HIGH" : score >= 40 ? "REVIEW" : "LOW";

  return json({
    score, label, reasons, matched: r.matched, categories: r.categories,
    normalized: { text: r.normalized.text, compact: r.normalized.compact, techniques: r.normalized.techniques, obfuscationRatio: r.normalized.obfuscationRatio },
    needsLlmReview: r.needsLlmReview, signalGroups: r.signalGroups, modelReview,
  });
}
