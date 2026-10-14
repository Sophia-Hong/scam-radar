import { generateText, Output } from "ai";
import { google } from "@ai-sdk/google";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db, hasDb, schema } from "@/db";
import { fnv1a64 } from "@/engine";

/**
 * 비용을 최소화하는 보조 계층이다.
 *  1) REVIEW 밴드 게시물만 텍스트 재검토
 *  2) 기관 사칭 후보이면서 캡처가 있을 때만 이미지 검토
 *  3) HIGH 계정 요약은 내용 해시로 1회만 생성
 * 모델 = AI_REVIEW_MODEL (`제공자/모델`, AI Gateway 경유). 기본 Claude Sonnet 5.5 = Gateway ID anthropic/claude-sonnet-5.5 (소현 1791949427 "ai 판단은 소넷 정도로").
 * 대체 모델 없음(기본) — Claude 가 실패하면 AI 재검 없이 룰 판정만(율 #compliance 1791950335, 테오 1791950346: 국외 이전 받는 곳을 Anthropic 하나로).
 * Gateway 공급자도 Anthropic 으로만 고정(only) — 같은 Claude 모델을 Google Vertex·Amazon Bedrock 으로 보내지 않게. AI_REVIEW_PROVIDERS 로 바꿀 수 있음.
 * 기본 모델이 google/ 이고 GOOGLE_GENERATIVE_AI_API_KEY 가 있을 때만 Google 직접 호출(보유 크레딧).
 */
const PRIMARY_MODEL = process.env.AI_REVIEW_MODEL?.includes("/") ? process.env.AI_REVIEW_MODEL : process.env.AI_REVIEW_MODEL ? `google/${process.env.AI_REVIEW_MODEL}` : "anthropic/claude-sonnet-5.5";
const FALLBACK_MODELS = (process.env.AI_REVIEW_FALLBACK_MODELS ?? "")
  .split(",").map((m) => m.trim()).filter((m) => m && m !== PRIMARY_MODEL);
export const PROVIDERS = (process.env.AI_REVIEW_PROVIDERS ?? PRIMARY_MODEL.split("/")[0]).split(",").map((p) => p.trim()).filter(Boolean);
const useDirectGoogle = PRIMARY_MODEL.startsWith("google/") && !!process.env.GOOGLE_GENERATIVE_AI_API_KEY;
export const MODEL_NAME = useDirectGoogle ? `google-direct/${PRIMARY_MODEL.slice(7)}` : PRIMARY_MODEL;
export const llmEnabled = !!(useDirectGoogle || process.env.AI_GATEWAY_API_KEY || process.env.VERCEL_OIDC_TOKEN || process.env.VERCEL);
const DAILY_LLM_BUDGET = Number(process.env.AI_DAILY_REQUEST_BUDGET ?? 450);

function modelConfig(tags: string[]) {
  if (useDirectGoogle) return { model: google(PRIMARY_MODEL.slice(7)) };
  return {
    model: PRIMARY_MODEL,
    providerOptions: { gateway: { only: PROVIDERS, ...(FALLBACK_MODELS.length ? { models: FALLBACK_MODELS } : {}), tags } },
  };
}

function gatewayCost(metadata: unknown): number | undefined {
  const value = (metadata as { gateway?: { cost?: number | string } } | undefined)?.gateway?.cost;
  const parsed = typeof value === "string" ? Number(value) : value;
  return typeof parsed === "number" && Number.isFinite(parsed) ? parsed : undefined;
}

export class AiBudgetExhausted extends Error {}

/**
 * 하루 AI 호출 상한 — *호출 전에* 원자적 카운터로 1을 예약한다(신고 상한과 같은 community_quota, 버킷 = UTC 날짜).
 * 리뷰·이미지 검토·리포트 요약 *모든* 호출이 같은 카운터를 쓴다. DB 가 없거나 예약 중 오류면 호출하지 않는다(fail-closed, 규칙 판정만).
 * 상한 AI_DAILY_REQUEST_BUDGET(기본 450) × 호출당 약 $0.0035 ≈ 하루 최대 약 $1.6 (테오 1791950431 — 소현에게 말한 상한이 실제로 지켜지게).
 */
export async function reserveAiCall(now = new Date()): Promise<{ release: () => Promise<void> } | null> {
  if (!hasDb || !Number.isFinite(DAILY_LLM_BUDGET) || DAILY_LLM_BUDGET <= 0) return null;
  try {
    const { ensureTables, reserve, release } = await import("./community");
    await ensureTables();
    const bucket = `d:${now.toISOString().slice(0, 10)}`;
    if (!(await reserve("ai-call", bucket, 1, DAILY_LLM_BUDGET))) return null;
    return { release: () => release("ai-call", bucket, 1).catch(() => {}) };
  } catch {
    return null;
  }
}

/** Gateway 응답의 실제 모델명(대체로 갔다면 그 이름) — 없으면 요청한 이름 */
function servedModel(result: { response?: { modelId?: string } }): string {
  return result.response?.modelId || MODEL_NAME;
}

export async function cached<T>(kind: string, key: string, fn: () => Promise<T>): Promise<T> {
  const k = `${kind}:${fnv1a64(MODEL_NAME)}:${key}`;   // 캐시 키에 모델 — 모델을 바꾸면 옛 판정(예: gemini)이 섞이지 않는다(테오 1791949447)
  if (!hasDb) throw new AiBudgetExhausted("no database — budget cannot be enforced");   // fail-closed
  const hit = await db().select().from(schema.llmCache).where(eq(schema.llmCache.key, k)).limit(1);
  if (hit[0]) return hit[0].result as T;
  const slot = await reserveAiCall();
  if (!slot) throw new AiBudgetExhausted("daily AI call budget reached or unavailable");
  // 예약은 호출을 *시도한 순간* 소진된 것으로 본다 — 실패·timeout 이어도 돌려주지 않는다.
  // 제공자가 이미 처리·과금한 뒤 timeout 이 날 수 있어서, 돌려주면 하루 상한(≈$1.6)이 강제 상한이 아니게 된다(카이 cf53ba8)
  void slot;
  const result = await fn();
  const served = (result as { model?: string })?.model ?? MODEL_NAME;
  await db().insert(schema.llmCache).values({ key: k, kind, result: result as object, model: served }).onConflictDoNothing();
  return result;
}

/**
 * 재검토 체크리스트(소현 1791948138 "사람처럼 판별", 테오 1791949447). 모델은 항목 id 만 고르고 자유 문장은 내지 않는다(공개하지 않음).
 * quote_warning = 인용·경고·연구·피해 후기 글 — 정상 쪽 근거.
 */
export const REVIEW_CHECKS = ["giver", "money_promise", "guarantee", "move_chat", "secrecy_urgency", "impersonation", "withdrawal_fee", "quote_warning"] as const;
export type ReviewCheck = (typeof REVIEW_CHECKS)[number];
export const REVIEW_CHECK_LABEL: Record<ReviewCheck, string> = {
  giver: "정보·수익을 주겠다는 쪽", money_promise: "돈·수익 약속", guarantee: "원금·수익 보장", move_chat: "다른 방으로 유도",
  secrecy_urgency: "비밀·서두름", impersonation: "기관·직원 사칭", withdrawal_fee: "출금 전 수수료", quote_warning: "인용·경고·연구 글",
};

/** 모순 응답: "정상"인데 강한 수법(보장·출금 수수료)을 골랐거나, "유인"인데 수법을 하나도 안 골랐으면(인용·경고만이면) 버린다(테오 1791950431) */
export function reviewConsistent(v: { verdict: string; checks: ReviewCheck[] }): boolean {
  const tactics = v.checks.filter((c) => c !== "quote_warning");
  if (v.verdict === "benign" && v.checks.some((c) => c === "guarantee" || c === "withdrawal_fee")) return false;
  if (v.verdict === "scam" && tactics.length === 0) return false;
  return true;
}

export interface ReviewVerdict {
  verdict: "scam" | "benign" | "unsure";
  confidence: number;
  /** 체크리스트에서 해당한 항목 id (자유 문장 없음) */
  checks: ReviewCheck[];
  model: string;
  costUsd?: number;
}

export interface ReviewContext {
  bio?: string | null;
  followers?: number | null;
  following?: number | null;
  createdAt?: string | null;
  externalUrl?: string | null;
  clusterSize?: number | null;
  clusterAccounts?: number | null;
  distinctTargets?: number | null;
  profileCountry?: string | null;
  countrySource?: string | null;
}

const ReviewSchema = z.object({
  verdict: z.enum(["scam", "benign", "unsure"]),
  confidence: z.number().min(0).max(1),
  checks: z.array(z.enum(REVIEW_CHECKS)).max(8),
});

const REVIEW_SYSTEM = [
  "너는 SNS 글·받은 메시지가 투자 사기 유인인지 사람처럼 판별하는 검수자다. 단어가 아니라 수법을 본다.",
  "아래 체크리스트를 글에서 *관측되는 것만* 고른다(추측 금지):",
  "- giver: 글쓴이가 정보·종목·수익을 *주겠다는* 쪽이다(구하는 쪽·묻는 쪽이면 아님)",
  "- money_promise: 돈·수익을 약속한다",
  "- guarantee: 원금·수익을 보장한다고 말한다(인용·경고 속의 문구는 해당 안 함). 이것만으로도 강한 유인이다",
  "- move_chat: 텔레그램·오픈채팅·DM 등 다른 방으로 옮기라고 한다",
  "- secrecy_urgency: 비밀로 하라거나, 서두르게 한다(선착순·마감·지금)",
  "- impersonation: 증권사·기관·회사 직원이나 유명인을 내세운다",
  "- withdrawal_fee: 번 돈을 찾으려면 세금·수수료·보증금을 먼저 내라고 한다",
  "- quote_warning: 유인 문구를 인용해 경고·풍자·연구·뉴스·피해 후기로 쓰는 글이다",
  "판정: 유인 수법이 분명하면 scam, quote_warning 이 분명하거나 수법이 없으면 benign, 애매하면 unsure. 가입일·팔로워 같은 계정 정보가 없으면 추정하지 않는다.",
  "출력은 verdict·confidence·checks 만. 설명 문장은 쓰지 않는다.",
].join("\n");

/** 실제 모델이 쓸 수 있는 판정을 냈나 — 키 없음(template)·실패(fallback)·상한(quota-rule)·모순 응답 폐기(|discarded)는 아님(카이 1fe5e41) */
export function reviewApplied(v: Pick<ReviewVerdict, "model"> | null | undefined): boolean {
  return !!v && !["template", "fallback", "quota-rule"].includes(v.model) && !v.model.endsWith("|discarded");
}

export async function reviewPost(text: string, reasonLabels: string[], context: ReviewContext = {}): Promise<ReviewVerdict> {
  const key = fnv1a64(`review-v3|${text}|${reasonLabels.join("|")}|${JSON.stringify(context)}`);
  if (!llmEnabled) return { verdict: "unsure", confidence: 0, checks: [], model: "template" };
  try {
    return await cached<ReviewVerdict>("review", key, async () => {
      const result = await generateText({
        ...modelConfig(["feature:scam-review", "tier:mvp"]),
        maxOutputTokens: 120,
        output: Output.object({ schema: ReviewSchema }),
        system: REVIEW_SYSTEM,
        prompt: `룰 엔진이 본 것(참고): ${reasonLabels.join(", ") || "없음"}\n계정 관측 정보: ${JSON.stringify(context)}\n\n글:\n\"\"\"\n${text.slice(0, 1800)}\n\"\"\"`,
      });
      const out = result.output;
      const model = servedModel(result);
      // 모순 응답은 버리고 규칙 판정 유지(캐시에는 버렸다는 표시로 남겨 같은 글에 다시 과금하지 않음)
      if (!reviewConsistent(out)) return { verdict: "unsure" as const, confidence: 0, checks: [], model: `${model}|discarded`, costUsd: gatewayCost(result.providerMetadata) };
      return { ...out, model, costUsd: gatewayCost(result.providerMetadata) };
    });
  } catch (e) {
    return { verdict: "unsure", confidence: 0, checks: [], model: e instanceof AiBudgetExhausted ? "quota-rule" : "fallback" };
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
      return { ...result.output, model: servedModel(result), costUsd: gatewayCost(result.providerMetadata) };
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
  contacts?: { typeLabel: string; value: string }[];
  linkedAccounts?: string[];
}

/**
 * 요약문 판(版) — 공개 요약에 연락처 강도 구분("(참고: …)")·내부 규칙 코드가 들어가지 않게 바꾼 판 (카이 05213d0 HOLD 1).
 * accounts.summary_model 끝에 붙여 저장하고, 이 표식이 없는 옛 요약은 다시 만든다(공개에는 내보내지 않는다).
 */
export const SUMMARY_VERSION = "|s2";
export const isCurrentSummary = (model: string | null | undefined) => !!model && model.endsWith(SUMMARY_VERSION);
export const summaryModelLabel = (model: string) => model.replace(SUMMARY_VERSION, "");

export async function summarizeAccount(input: SummaryInput): Promise<{ summary: string; model: string }> {
  const key = fnv1a64(
    SUMMARY_VERSION + input.handle + "|" + input.posts.map((p) => p.postUrl + p.text).join("|") +
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
        // 내부 규칙 코드는 모델에 넘기지 않는다(요약문으로 새어 나가지 않게)
        prompt: JSON.stringify({ ...input, reasonCodes: undefined, posts: input.posts.slice(0, 8).map((p) => ({ ...p, text: p.text.slice(0, 400) })) }, null, 1),
      });
      return { summary: result.text.trim() || templateSummary(input), model: servedModel(result) };
    });
  } catch {
    return { summary: templateSummary(input), model: "fallback-template" };
  }
}

function contactLine(i: SummaryInput): string {
  const parts: string[] = [];
  // 연락처는 종류·값만 — 강도(계정 연결에 쓰는지)는 공개 문장에 적지 않는다 (카이 05213d0 HOLD 1)
  if (i.contacts?.length) parts.push(i.contacts.map((c) => `${c.typeLabel} ${c.value}`).join(", "));
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
