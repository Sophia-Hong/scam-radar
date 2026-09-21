import { generateText, Output } from "ai";
import { google } from "@ai-sdk/google";
import { z } from "zod";
import { eq, gte, sql } from "drizzle-orm";
import { db, hasDb, schema } from "@/db";
import { fnv1a64 } from "@/engine";

/**
 * 비용을 최소화하는 보조 계층이다.
 *  1) REVIEW 밴드 게시물만 텍스트 재검토
 *  2) 기관 사칭 후보이면서 캡처가 있을 때만 이미지 검토
 *  3) HIGH 계정 요약은 내용 해시로 1회만 생성
 * Google API 키가 있으면 보유 크레딧을 쓰는 직접 호출을 우선한다.
 * 키가 없으면 Gateway를 사용하고, 호출 실패 시 룰/템플릿으로 즉시 폴백한다.
 */
const GOOGLE_MODEL = (process.env.AI_REVIEW_MODEL ?? "gemini-3.1-flash-lite").replace(/^google\//, "");
const GATEWAY_MODEL = `google/${GOOGLE_MODEL}`;
const FALLBACK_MODEL = process.env.AI_REVIEW_FALLBACK_MODEL ?? "deepseek/deepseek-v4.1-flash";
const useDirectGoogle = !!process.env.GOOGLE_GENERATIVE_AI_API_KEY;
const MODEL_NAME = useDirectGoogle ? `google-direct/${GOOGLE_MODEL}` : GATEWAY_MODEL;
export const llmEnabled = !!(useDirectGoogle || process.env.AI_GATEWAY_API_KEY || process.env.VERCEL_OIDC_TOKEN || process.env.VERCEL);
const DAILY_LLM_BUDGET = Number(process.env.AI_DAILY_REQUEST_BUDGET ?? 450);

function modelConfig(tags: string[]) {
  if (useDirectGoogle) return { model: google(GOOGLE_MODEL) };
  return {
    model: GATEWAY_MODEL,
    providerOptions: { gateway: { models: [FALLBACK_MODEL], tags } },
  };
}

function gatewayCost(metadata: unknown): number | undefined {
  const value = (metadata as { gateway?: { cost?: number | string } } | undefined)?.gateway?.cost;
  const parsed = typeof value === "string" ? Number(value) : value;
  return typeof parsed === "number" && Number.isFinite(parsed) ? parsed : undefined;
}

async function cached<T>(kind: string, key: string, fn: () => Promise<T>): Promise<T> {
  const k = `${kind}:${key}`;
  if (hasDb) {
    const hit = await db().select().from(schema.llmCache).where(eq(schema.llmCache.key, k)).limit(1);
    if (hit[0]) return hit[0].result as T;
  }
  const result = await fn();
  if (hasDb) {
    await db().insert(schema.llmCache).values({ key: k, kind, result: result as object, model: llmEnabled ? MODEL_NAME : "template" }).onConflictDoNothing();
  }
  return result;
}

/** 무료 티어 500 RPD 중 운영·이미지 검토용 여유 50회를 남긴다. */
async function hasDailyBudget(): Promise<boolean> {
  if (!hasDb || !Number.isFinite(DAILY_LLM_BUDGET) || DAILY_LLM_BUDGET <= 0) return true;
  try {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const rows = await db()
      .select({ count: sql<number>`count(*)` })
      .from(schema.llmCache)
      .where(gte(schema.llmCache.createdAt, since));
    return Number(rows[0]?.count ?? 0) < DAILY_LLM_BUDGET;
  } catch {
    return true;
  }
}

export interface ReviewVerdict {
  verdict: "scam" | "benign" | "unsure";
  confidence: number;
  rationale: string;
  model: string;
  costUsd?: number;
}

const ReviewSchema = z.object({
  verdict: z.enum(["scam", "benign", "unsure"]),
  confidence: z.number().min(0).max(1),
  rationale: z.string().max(300),
});

export async function reviewPost(text: string, reasonLabels: string[]): Promise<ReviewVerdict> {
  const key = fnv1a64(text);
  if (!llmEnabled) return { verdict: "unsure", confidence: 0, rationale: "보조 모델 미설정 — 룰 점수 유지", model: "template" };
  if (!(await hasDailyBudget())) return { verdict: "unsure", confidence: 0, rationale: "무료 AI 일일 한도 보호 — 룰 점수 유지", model: "quota-rule" };
  try {
    return await cached<ReviewVerdict>("review", key, async () => {
      const result = await generateText({
        ...modelConfig(["feature:scam-review", "tier:mvp"]),
        maxOutputTokens: 180,
        output: Output.object({ schema: ReviewSchema }),
        system: "한국 SNS의 주식·코인 리딩방 유인 사기 검수자다. 외부 메신저 이동, 투자 수익 미끼, 한국 기관 재직·퇴직 사칭, 페이크 증빙 제시, 유사 서사의 반복 살포를 함께 본다. 피해 후기·뉴스·경고·정상 직장인 글은 benign으로 구분한다. 관측되지 않은 사실은 추측하지 말고 애매하면 unsure로 답한다.",
        prompt: `룰 엔진 근거: ${reasonLabels.join(", ") || "없음"}\n\n게시물:\n\"\"\"\n${text.slice(0, 1800)}\n\"\"\"`,
      });
      return { ...result.output, model: MODEL_NAME, costUsd: gatewayCost(result.providerMetadata) };
    });
  } catch {
    return { verdict: "unsure", confidence: 0, rationale: "보조 모델 호출 실패 — 룰 점수 유지", model: "fallback" };
  }
}

export interface EvidenceImageVerdict {
  verdict: "suspicious" | "inconclusive" | "not_suspicious";
  confidence: number;
  evidenceType: string;
  rationale: string;
  model: string;
  costUsd?: number;
}

const EvidenceImageSchema = z.object({
  verdict: z.enum(["suspicious", "inconclusive", "not_suspicious"]),
  confidence: z.number().min(0).max(1),
  evidenceType: z.string().max(80),
  rationale: z.string().max(300),
});

/** 기관 사칭 후보의 캡처가 있을 때만 호출하는 선택적 이미지 보조 검토. */
export async function reviewEvidenceImage(text: string, image: string): Promise<EvidenceImageVerdict> {
  if (!llmEnabled) return { verdict: "inconclusive", confidence: 0, evidenceType: "미검토", rationale: "보조 모델 미설정", model: "template" };
  const key = fnv1a64(`${text}|${image}`);
  try {
    return await cached<EvidenceImageVerdict>("evidence-image", key, async () => {
      const result = await generateText({
        ...modelConfig(["feature:evidence-image", "tier:mvp"]),
        maxOutputTokens: 220,
        output: Output.object({ schema: EvidenceImageSchema }),
        system: "한국 기업·금융기관 사칭 게시물의 증빙 이미지를 검토한다. 사원증·급여명세·재직증명처럼 보이는지, 텍스트와 로고·레이아웃·인물 합성에 명백한 시각적 모순이 있는지만 본다. 동일 얼굴이나 동일 사진 재사용을 추정하지 않는다. 캡처 한 장만으로 위조를 확정하지 말고 불분명하면 inconclusive로 답한다.",
        messages: [{
          role: "user",
          content: [
            { type: "text", text: `게시물 문구:\n${text.slice(0, 1200)}\n\n이미지에 관측 가능한 합성·조작 정황만 검토해라.` },
            { type: "file", data: /^https?:\/\//.test(image) ? new URL(image) : image, mediaType: image.match(/^data:(image\/[^;]+)/)?.[1] ?? "image" },
          ],
        }],
      });
      return { ...result.output, model: MODEL_NAME, costUsd: gatewayCost(result.providerMetadata) };
    });
  } catch {
    return { verdict: "inconclusive", confidence: 0, evidenceType: "오류", rationale: "이미지 보조 검토 실패", model: "fallback" };
  }
}

export interface SummaryInput {
  platform: string;
  handle: string;
  profileUrl: string;
  bio?: string | null;
  externalUrl?: string | null;
  posts: { postUrl: string; parentUrl?: string | null; text: string; postedAt?: string | null; capturedAt: string; score: number }[];
  reasons: string[];
  reasonCodes?: string[];
  contacts?: { typeLabel: string; value: string; strong?: boolean }[];
  linkedAccounts?: string[];
}

export async function summarizeAccount(input: SummaryInput): Promise<{ summary: string; model: string }> {
  const key = fnv1a64(
    input.handle + "|" + input.posts.map((p) => p.postUrl + p.text).join("|") +
    "|" + (input.contacts ?? []).map((c) => `${c.typeLabel}:${c.value}`).join(",") +
    "|" + (input.linkedAccounts ?? []).join(",")
  );
  if (!llmEnabled) return { summary: templateSummary(input), model: "template" };
  try {
    return await cached("summary", key, async () => {
      const result = await generateText({
        ...modelConfig(["feature:account-summary", "tier:mvp"]),
        maxOutputTokens: 420,
        system: "관측 사실 기반 내용 요약을 작성한다. 판단이나 추측 없이 확인된 사실만 1) 대상 계정 2) 게시 일시·장소 3) 게시 내용 4) 유도 수단 5) 반복성 순서의 3~5문장 개조식으로 쓴다. '사기'라고 단정하지 말고 '유인 정황'이라고 표현한다.",
        prompt: JSON.stringify({ ...input, posts: input.posts.slice(0, 8).map((p) => ({ ...p, text: p.text.slice(0, 400) })) }, null, 1),
      });
      return { summary: result.text.trim() || templateSummary(input), model: MODEL_NAME };
    });
  } catch {
    return { summary: templateSummary(input), model: "fallback-template" };
  }
}

function contactLine(i: SummaryInput): string {
  const parts: string[] = [];
  const strong = (i.contacts ?? []).filter((c) => c.strong !== false);
  const weak = (i.contacts ?? []).filter((c) => c.strong === false);
  if (strong.length) parts.push(strong.map((c) => `${c.typeLabel} ${c.value}`).join(", "));
  if (weak.length) parts.push(`(참고: ${weak.map((c) => `${c.typeLabel} ${c.value}`).join(", ")})`);
  if (!parts.length) parts.push(i.reasons.filter((r) => /텔레|카카오|오픈채팅|링크|DM|핸들|번호|쪽지|디엠/.test(r)).join(", ") || "메신저·링크 유도 정황");
  if (i.externalUrl) parts.push(`프로필 링크 ${i.externalUrl}`);
  if (i.linkedAccounts?.length) parts.push(`동일 연락처를 쓰는 다른 계정 ${i.linkedAccounts.length}개: ${i.linkedAccounts.join(", ")}`);
  return parts.join(" / ");
}

export function templateSummary(i: SummaryInput): string {
  const first = i.posts[0];
  const times = i.posts.map((p) => p.postedAt ?? p.capturedAt).sort();
  const range = times.length > 1 ? `${times[0].slice(0, 10)} ~ ${times[times.length - 1].slice(0, 10)}` : (times[0] ?? "").slice(0, 10);
  return [
    `1) 대상 계정: ${i.platform} "${i.handle}" (${i.profileUrl})`,
    `2) 게시 일시·장소: ${range}, 게시물 ${i.posts.length}건 (대표: ${first?.postUrl ?? "-"})`,
    `3) 게시 내용: "${(first?.text ?? "").slice(0, 120).replace(/\s+/g, " ")}${(first?.text?.length ?? 0) > 120 ? "…" : ""}"`,
    `4) 유도 수단: ${contactLine(i)}`,
    `5) 반복성: ${i.reasons.filter((_, k) => /^(cluster|spray)$/.test(i.reasonCodes?.[k] ?? "")).join(", ") || (i.posts.length > 1 ? `게시물 ${i.posts.length}건 관측` : "단건")}`,
  ].join("\n");
}
