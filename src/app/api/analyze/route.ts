import { z } from "zod";
import { scoreText } from "@/engine";
import { json } from "@/lib/auth";
import { REVIEW_CHECK_LABEL, reviewApplied, reviewPost } from "@/lib/llm";
import { publicReasons } from "@/lib/visibility";
import { signIds } from "@/lib/result-view";
import { extractEntities } from "@/engine/entities";
import { DAILY_LIMIT_ERROR, reserveCheck } from "@/lib/checklimit";

export const runtime = "nodejs";

const Schema = z.object({
  text: z.string().min(1).max(10000),
  account: z.object({
    followers: z.number().nullish(), following: z.number().nullish(), createdAt: z.string().nullish(),
    bio: z.string().nullish(), externalUrl: z.string().nullish(), clusterSize: z.number().nullish(), clusterAccounts: z.number().nullish(), distinctTargets: z.number().nullish(),
    profileCountry: z.string().nullish(), countrySource: z.string().nullish(),
    // syntheticEvidenceConfidence 는 받지 않는다 — "보조 모델 검토" 근거는 서버가 직접 부른 이미지 검토(pipeline)로만 생긴다(카이 1fe5e41, 테오 1791954097). zod 가 모르는 키는 버린다
  }).optional(),
});

/** POST /api/analyze — 원문은 저장하지 않고, 경계 사례만 Gemini로 재검토한다. */
export async function POST(req: Request) {
  const parsed = Schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return json({ error: parsed.error.flatten() }, 400);
  // 같은 IP 하루 20회 — 넘으면 엔진·AI 재검 없이 바로 끝(화면은 브라우저 규칙 결과를 그대로 두고 안내만)
  if (!(await reserveCheck(req))) return json({ error: DAILY_LIMIT_ERROR }, 429);
  const r = scoreText(parsed.data.text, parsed.data.account ?? {});
  let score = r.score;
  let label = r.label;
  const reasons = [...r.reasons];
  const modelReview = r.needsLlmReview
    ? await reviewPost(parsed.data.text, r.reasons.map((reason) => reason.label), parsed.data.account ?? {})
    : null;
  const hasCoordinationEvidence = r.reasons.some((reason) => /^(cluster|spread|spray|shared-contact)/.test(reason.code) && reason.points > 0);

  if (modelReview?.verdict === "scam" && modelReview.confidence >= 0.6) {
    score = Math.min(100, score + 20);
    // 모델의 자유 문장은 공개하지 않는다 — 고른 체크리스트 항목 이름만(테오 1791949447)
    reasons.unshift({ code: "llm:scam", label: "AI 재검토: 유인 수법이 보임", points: 20, evidence: modelReview.checks.map((c) => REVIEW_CHECK_LABEL[c]).join(", ") || undefined });
  }
  if (modelReview?.verdict === "benign" && modelReview.confidence >= 0.6 && !hasCoordinationEvidence) {
    score = Math.max(0, score - 20);
    reasons.unshift({ code: "llm:benign", label: "AI 재검토: 정상 맥락으로 보임", points: -20, evidence: modelReview.checks.map((c) => REVIEW_CHECK_LABEL[c]).join(", ") || undefined });
  }
  label = score >= 70 ? "HIGH" : score >= 40 ? "REVIEW" : "LOW";

  // 공개 응답 = 화면이 쓰는 것만: 총점·상태·신호(방향만)·신호 묶음. 사전 일치 목록·정규화 내부값·재검토 여부·모델 판정 원문은 내보내지 않는다(규칙 비공개)
  // 쉬운 말 징후는 서버가 내부 코드로 골라 문장 id 만 — 공개 reasons 에서 code 를 빼도 화면이 문장을 고를 수 있게(카이 948d5a7)
  const signs = signIds(label, reasons, extractEntities(parsed.data.text).map((e) => e.type), parsed.data.text);
  // ai = 재검 대상이었을 때만: 실제 모델 판정을 받았으면 applied, 키 없음·상한·실패·폐기면 unavailable(화면이 "AI 재검토 반영"을 거짓으로 띄우지 않게).
  // 재검 대상 여부는 브라우저 엔진도 같은 값을 계산하므로 새로 드러나는 규칙 정보는 없다
  const ai = modelReview ? (reviewApplied(modelReview) ? "applied" : "unavailable") : undefined;
  return json({ score, label, reasons: publicReasons(reasons), signalGroups: r.signalGroups, signs, ai });
}
