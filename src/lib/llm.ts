import Anthropic from "@anthropic-ai/sdk";
import { eq } from "drizzle-orm";
import { db, hasDb, schema } from "@/db";
import { fnv1a64 } from "@/engine";

/**
 * LLM 은 두 곳에만 쓴다 (비용 최소화):
 *  1) REVIEW 밴드(40~69점) 게시물의 재판정 — 건당 ~600 토큰
 *  2) HIGH 계정의 '내용 요약' 생성 — 계정당 1회, 내용 해시로 캐시
 * 키가 없으면 템플릿으로 대체되어 파이프라인은 항상 동작한다.
 */
// MVP 기본값: Anthropic의 현행 모델 중 가장 저렴한 실시간 모델.
// 규칙만으로 결론이 나는 요청에는 호출하지 않고 40~69점 경계 사례에만 사용한다.
const MODEL = process.env.ANTHROPIC_MODEL ?? "claude-haiku-4-5-20251001";
export const llmEnabled = !!process.env.ANTHROPIC_API_KEY;

let _client: Anthropic | null = null;
function client() {
  if (!_client) _client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return _client;
}

async function cached<T>(kind: string, key: string, fn: () => Promise<T>): Promise<T> {
  const k = `${kind}:${key}`;
  if (hasDb) {
    const hit = await db().select().from(schema.llmCache).where(eq(schema.llmCache.key, k)).limit(1);
    if (hit[0]) return hit[0].result as T;
  }
  const result = await fn();
  if (hasDb) {
    await db().insert(schema.llmCache).values({ key: k, kind, result: result as object, model: llmEnabled ? MODEL : "template" }).onConflictDoNothing();
  }
  return result;
}

export interface ReviewVerdict {
  verdict: "scam" | "benign" | "unsure";
  confidence: number;
  rationale: string;
  model: string;
}

export async function reviewPost(text: string, reasonLabels: string[]): Promise<ReviewVerdict> {
  const key = fnv1a64(text);
  return cached<ReviewVerdict>("review", key, async () => {
    if (!llmEnabled) return { verdict: "unsure", confidence: 0, rationale: "LLM 미설정 — 룰 점수 유지", model: "template" };
    const msg = await client().messages.create({
      model: MODEL,
      max_tokens: 200,
      system: "너는 한국 SNS의 '주식·코인 리딩방 유인 사기' 탐지 검수자다. 게시물이 (a) 텔레그램·카톡 등 외부 메신저로 유도하면서 (b) 투자 수익을 미끼로 삼는 '유인글'인지 판단한다. (c) 실존 기관명(증권사·대기업) + 재직·사원증·급여명세 주장 + 종목·정보 제공 제안이 함께 있으면 메신저 유도가 없어도 scam. 단순 투자 잡담, 뉴스 공유, 개인 후기는 benign. JSON 만 출력: {\"verdict\":\"scam|benign|unsure\",\"confidence\":0~1,\"rationale\":\"한 문장\"}",
      messages: [{ role: "user", content: `룰 엔진 근거: ${reasonLabels.join(", ") || "없음"}\n\n게시물:\n"""\n${text.slice(0, 1500)}\n"""` }],
    });
    const raw = msg.content[0].type === "text" ? msg.content[0].text : "{}";
    try {
      const j = JSON.parse(raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1));
      return { verdict: j.verdict ?? "unsure", confidence: Number(j.confidence ?? 0), rationale: String(j.rationale ?? ""), model: MODEL };
    } catch {
      return { verdict: "unsure", confidence: 0, rationale: "파싱 실패", model: MODEL };
    }
  });
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
  /** 본문·프로필에서 추출된 실제 연락처 (유도 수단) */
  contacts?: { typeLabel: string; value: string; strong?: boolean }[];
  /** 같은 연락처를 쓰는 다른 계정 id */
  linkedAccounts?: string[];
}

export async function summarizeAccount(input: SummaryInput): Promise<{ summary: string; model: string }> {
  const key = fnv1a64(
    input.handle + "|" + input.posts.map((p) => p.postUrl + p.text).join("|") +
    "|" + (input.contacts ?? []).map((c) => `${c.typeLabel}:${c.value}`).join(",") +
    "|" + (input.linkedAccounts ?? []).join(",")
  );
  return cached("summary", key, async () => {
    if (!llmEnabled) return { summary: templateSummary(input), model: "template" };
    const msg = await client().messages.create({
      model: MODEL,
      max_tokens: 500,
      system: "너는 관측 사실 기반 '내용 요약'을 쓰는 보조자다. 판단이나 추측 없이, 수집된 증거에서 확인되는 요건사실만 육하원칙으로 3~5문장, 존댓말 없이 개조식으로 쓴다. 형식: 1) 대상 계정 2) 게시 일시·장소(URL) 3) 게시 내용(유인 문구 인용) 4) 유도 수단(메신저·링크) 5) 반복성. 법조문 인용 금지, '사기'라는 단정 대신 '유인 정황'으로 표현.",
      messages: [{ role: "user", content: JSON.stringify({ ...input, posts: input.posts.slice(0, 8).map((p) => ({ ...p, text: p.text.slice(0, 400) })) }, null, 1) }],
    });
    const summary = msg.content[0].type === "text" ? msg.content[0].text.trim() : templateSummary(input);
    return { summary, model: MODEL };
  });
}

/**
 * '유도 수단' 한 줄. 어휘 근거("텔레그램 유도")보다 **실제 연락처**가 먼저 온다.
 * 같은 연락처를 쓰는 다른 계정이 있으면 동일 운영자 정황으로 덧붙인다.
 */
function contactLine(i: SummaryInput): string {
  const parts: string[] = [];
  const strong = (i.contacts ?? []).filter((c) => c.strong !== false);
  const weak = (i.contacts ?? []).filter((c) => c.strong === false);
  if (strong.length) parts.push(strong.map((c) => `${c.typeLabel} ${c.value}`).join(", "));
  if (weak.length) parts.push(`(참고: ${weak.map((c) => `${c.typeLabel} ${c.value}`).join(", ")})`);
  if (!parts.length) {
    parts.push(i.reasons.filter((r) => /텔레|카카오|오픈채팅|링크|DM|핸들|번호|쪽지|디엠/.test(r)).join(", ") || "메신저·링크 유도 정황");
  }
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
