import { z } from "zod";
import { scoreText } from "@/engine";
import { json } from "@/lib/auth";
import { REVIEW_CHECK_LABEL, reviewApplied, reviewPost, reviewPostWithImages, type ImageDerived, type ImageReview } from "@/lib/llm";
import { AI_CONFIDENCE, combineVerdict } from "@/lib/verdict";
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
/** 캡처: 최대 3장, 장당 5MB(디코드 기준). 화면은 올리기 전에 줄여 보낸다(배포 요청 크기 4.5MB 한도). 저장하지 않는다 — DB·로그·캐시 어디에도(율 1791958415) */
export const MAX_IMAGES = 3;
/** 배포 요청 본문 한도(4.5MB) 안 — 캡처 합계(base64 글자 수). 화면이 줄여 보내므로 보통 장당 0.1~0.6MB(카이 01fa686 HOLD 3) */
export const MAX_IMAGES_TOTAL_CHARS = 4_000_000;
const hasCoordination = (reasons: { code: string; points: number }[]) => reasons.some((reason) => /^(cluster|spread|spray|shared-contact)/.test(reason.code) && reason.points > 0);
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const IMAGE = z.string().regex(/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/).refine((d) => Math.floor((d.length - d.indexOf(",") - 1) * 3 / 4) <= MAX_IMAGE_BYTES, "image too large");
const Schema = z.object({
  text: z.string().max(10000).default(""),
  images: z.array(IMAGE).max(MAX_IMAGES).default([]),
}).refine((b) => b.text.trim().length > 0 || b.images.length > 0, "text or images required")
  .refine((b) => b.images.reduce((n, d) => n + d.length, 0) <= MAX_IMAGES_TOTAL_CHARS, "images too large in total");

/** POST /api/analyze — 원문은 저장하지 않고, 붙여넣은 글을 AI(Claude 체크리스트)가 판단한다. 규칙은 근거·징후·대비용(AI 우선, 소현 O 1791958205). */
export async function POST(req: Request) {
  const parsed = Schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return json({ error: parsed.error.flatten() }, 400);
  // 같은 IP 하루 20회 — 넘으면 엔진·AI 재검 없이 바로 끝(화면은 브라우저 규칙 결과를 그대로 두고 안내만)
  const { text, images } = parsed.data;
  if (!(await reserveCheck(req, new Date(), 1 + images.length))) return json({ error: DAILY_LIMIT_ERROR }, 429);   // 캡처는 장당 1을 더 센다
  const r0 = scoreText(text);
  // AI 우선(소현 O 1791958205): 붙여넣은 글은 모두 체크리스트 AI 가 판단한다. 캡처가 있으면 Sonnet 한 번이 글과 캡처를 같이 본다. 같은 글은 캐시, 하루 450회 상한·IP 20회는 그대로
  const labels = r0.reasons.map((reason) => reason.label);
  // 캡처 속 글자 → 개인정보 없는 파생값만(규칙 단계·점수·징후 id·반복 근거). 글자 자체는 llm 안에서 버려지고 캐시에도 파생값만 남는다(카이 01fa686 HOLD 1·2)
  const derive = (imageText: string): ImageDerived => {
    const all = imageText ? `${text}\n${imageText}` : text;
    const rr = imageText ? scoreText(all) : r0;
    return { ruleLabel: rr.label, ruleScore: rr.score, signs: signIds("HIGH", rr.reasons, extractEntities(all).map((e) => e.type), all), coordination: hasCoordination(rr.reasons) };
  };
  const modelReview: ImageReview = images.length ? await reviewPostWithImages(text, images, labels, derive) : await reviewPost(text, labels);
  const applied = reviewApplied(modelReview);
  // 캡처만 올렸는데 AI 가 못 봤으면 판정할 것이 없다 — 단계 없이 "AI 확인 못 함"만
  if (!text.trim() && !applied) return json({ score: null, label: null, reasons: [], signalGroups: [], signs: [], ai: "unavailable" });
  const d = modelReview.derived;
  const rule = d ? { label: d.ruleLabel, score: d.ruleScore } : { label: r0.label, score: r0.score };
  const hasCoordinationEvidence = d ? d.coordination : hasCoordination(r0.reasons);
  const { label, score } = combineVerdict(rule, applied ? modelReview : null, hasCoordinationEvidence);
  // 공개 근거·신호 묶음은 *붙여넣은 글*에서만 — 캡처 속 글자 조각이 응답에 나가지 않게(카이 01fa686 HOLD 2)
  const reasons = [...r0.reasons];
  // 모델의 자유 문장은 공개하지 않는다 — 고른 체크리스트 항목 이름만(테오 1791949447). 근거 줄의 점수는 화면 표시용(단계는 combineVerdict 가 정함)
  const checks = modelReview.checks.map((c) => REVIEW_CHECK_LABEL[c]).join(", ") || undefined;
  if (applied && modelReview.verdict === "scam" && modelReview.confidence >= AI_CONFIDENCE) reasons.unshift({ code: "llm:scam", label: "AI 확인: 유인 수법이 보임", points: Math.max(1, score - rule.score), evidence: checks });
  if (applied && modelReview.verdict === "benign" && modelReview.confidence >= AI_CONFIDENCE && !hasCoordinationEvidence) reasons.unshift({ code: "llm:benign", label: "AI 확인: 정상 맥락으로 보임", points: Math.min(-1, score - rule.score), evidence: checks });

  // 공개 응답 = 화면이 쓰는 것만: 총점·상태·신호(방향만)·신호 묶음. 사전 일치 목록·정규화 내부값·재검토 여부·모델 판정 원문은 내보내지 않는다(규칙 비공개)
  // 쉬운 말 징후는 서버가 내부 코드로 골라 문장 id 만 — 공개 reasons 에서 code 를 빼도 화면이 문장을 고를 수 있게(카이 948d5a7). 캡처가 있으면 캐시된 파생 징후 id
  const signs = label === "LOW" ? [] : d ? d.signs : signIds(label, reasons, extractEntities(text).map((e) => e.type), text);
  // ai = 실제 모델 판정을 받았으면 applied, 키 없음·상한·실패·폐기면 unavailable(화면이 "AI 확인 반영"을 거짓으로 띄우지 않게 — 그땐 규칙 단계 + 율 경고)
  const ai = applied ? "applied" : "unavailable";
  return json({ score, label, reasons: publicReasons(reasons), signalGroups: r0.signalGroups, signs, ai });
}
