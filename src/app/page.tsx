import { Lookup } from "@/components/Lookup";
import { hasDb } from "@/db";

export const dynamic = "force-dynamic";

async function getStats() {
  if (!hasDb) return null;
  try {
    const { db, schema } = await import("@/db");
    const { sql } = await import("drizzle-orm");
    const [a] = await db().select({ accounts: sql<number>`count(*)`, high: sql<number>`count(*) filter (where label='HIGH')`, review: sql<number>`count(*) filter (where label='REVIEW')` }).from(schema.accounts);
    const [p] = await db().select({ posts: sql<number>`count(*)` }).from(schema.posts);
    const [c] = await db().select({ clusters: sql<number>`count(*)` }).from(schema.clusters);
    return { accounts: +a.accounts, high: +a.high, review: +a.review, posts: +p.posts, clusters: +c.clusters };
  } catch { return null; }
}

export default async function Home() {
  const stats = await getStats();
  return (
    <div className="space-y-10">
      <section className="space-y-3">
        <h1 className="text-3xl font-bold tracking-tight">이 계정, 어떤 신호가 있을까요?</h1>
        <p className="text-zinc-600">Threads 핸들이나 프로필·게시물 URL을 입력하면 수집된 게시물에서 어떤 신호가 얼마나 있는지, 왜 그렇게 계산됐는지 보여드립니다. 판단은 보는 분이 합니다.</p>
        <Lookup />
      </section>

      {stats && (
        <section className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          {[
            ["수집 계정", stats.accounts], ["강한 신호", stats.high], ["신호 감지", stats.review], ["수집 게시물", stats.posts], ["캠페인(문구 묶음)", stats.clusters],
          ].map(([k, v]) => (
            <div key={k as string} className="rounded-lg border border-zinc-200 bg-white p-3">
              <div className="text-xs text-zinc-500">{k}</div>
              <div className="text-2xl font-semibold tabular-nums">{v as number}</div>
            </div>
          ))}
        </section>
      )}
      {!hasDb && (
        <p className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          데이터베이스가 연결되지 않았습니다. 계정 조회는 비활성이며 <a className="underline" href="/analyze">텍스트 분석</a>은 사용할 수 있습니다.
        </p>
      )}

      <section className="grid gap-4 sm:grid-cols-3 text-sm">
        <div className="rounded-lg border border-zinc-200 bg-white p-4">
          <h3 className="font-semibold">1. 수집</h3>
          <p className="mt-1 text-zinc-600">AI 브라우저(Aside)가 로그인 세션으로 Threads 를 보고 게시물·댓글·프로필을 캡처합니다. 판정은 화면이 아니라 코드가 합니다.</p>
        </div>
        <div className="rounded-lg border border-zinc-200 bg-white p-4">
          <h3 className="font-semibold">2. 판정</h3>
          <p className="mt-1 text-zinc-600">난독화 복원(초성·혼동문자·제로폭) → 룰 스코어 → 유사문구 클러스터링. 경계 사례만 LLM 이 재판정해 비용을 통제합니다.</p>
        </div>
        <div className="rounded-lg border border-zinc-200 bg-white p-4">
          <h3 className="font-semibold">3. 리포트</h3>
          <p className="mt-1 text-zinc-600">계정명·일시·범죄사실요약·증거 캡처·계정 URL·프로필 캡처·판단 근거를 한 장으로. 신고는 사람이 마지막에 결정합니다.</p>
        </div>
      </section>
    </div>
  );
}
