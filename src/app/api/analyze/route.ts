import { z } from "zod";
import { scoreText } from "@/engine";
import { json } from "@/lib/auth";
import { REVIEW_CHECK_LABEL, reviewApplied, reviewPost } from "@/lib/llm";
import { publicReasons } from "@/lib/visibility";
import { signIds } from "@/lib/result-view";
import { extractEntities } from "@/engine/entities";
import { DAILY_LIMIT_ERROR, reserveCheck } from "@/lib/checklimit";

export const runtime = "nodejs";

/**
 * 공개 입력 = 글만. 계정 특징(팔로워·가입일·소개·외부 링크·국가·묶음 크기·여러 계정·대상 수·이미지 검토 신뢰도)은 *서버가 수집·관측한 값*일 때만
 * 근거가 된다(pipeline). 공개 경로에서 요청자가 보낸 값은 검증되지 않은 주장이라 받지 않는다 — "여러 계정이 같은 글" 같은 관측 근거를
 * 꾸며 점수를 올릴 수 있어서(카이 edc45c6: clusterSize 등으로 LOW 18 → HIGH 80). 화면은 원래 글만 보낸다. zod 가 모르는 키(account)는 버린다.
 */
const Schema = z.object({
  text: z.string().min(1).max(10000),
});

/** POST /api/analyze — 원문은 저장하지 않고, 경계 사례만 AI(Claude)로 재검토한다. */
export async function POST(req: Request) {
  const parsed = Schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return json({ error: parsed.error.flatten() }, 400);
  // 같은 IP 하루 20회 — 넘으면 엔진·AI 재검 없이 바로 끝(화면은 브라우저 규칙 결과를 그대로 두고 안내만)
  if (!(await reserveCheck(req))) return json({ error: DAILY_LIMIT_ERROR }, 429);
  const r = scoreText(parsed.data.text);
  let score = r.score;
  let label = r.label;
  const reasons = [...r.reasons];
  const modelReview = r.needsLlmReview
    ? await reviewPost(parsed.data.text, r.reasons.map((reason) => reason.label))
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
