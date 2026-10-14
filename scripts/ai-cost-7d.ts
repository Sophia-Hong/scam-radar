/**
 * 최근 7일 AI 호출·비용 집계 — 읽기 전용(SELECT 만). 셈(#hq-finance)이 주 1회 돌린다(테오 1791958516).
 *   POSTGRES_URL 또는 DATABASE_URL 을 환경에서 읽는다. URL 은 출력하지 않는다.
 *   npx tsx scripts/ai-cost-7d.ts
 * 숫자의 뜻:
 *   attempted = 하루 상한 카운터(community_quota 'ai-call')의 합 — 호출을 *시도한* 몫. 실패·timeout 도 1, 캡처는 1 + 장수.
 *   billed rows = llm_cache 에 새로 생긴 행(캐시 미스로 실제 호출이 끝난 것). costUsd = Gateway 가 돌려준 비용.
 *   empty costUsd = 비용 칸이 빈 행의 비율(템플릿·폐기 행 포함). 캐시 적중은 호출이 아니라 세지 않는다.
 */
import { sql } from "drizzle-orm";
import { db, hasDb } from "../src/db";

async function main() {
  if (!hasDb) { console.error("POSTGRES_URL / DATABASE_URL 이 없습니다"); process.exit(2); }
  const d = db();
  const rows = (r: unknown) => ((r as { rows?: unknown[] }).rows ?? (r as unknown[])) as Record<string, unknown>[];
  const since = new Date(Date.now() - 7 * 864e5);
  const days = Array.from({ length: 8 }, (_, i) => `d:${new Date(Date.now() - i * 864e5).toISOString().slice(0, 10)}`);
  const attempted = rows(await d.execute(sql`SELECT bucket, n FROM community_quota WHERE reporter = 'ai-call' AND bucket = ANY(${`{${days.join(",")}}`}::text[]) ORDER BY bucket`));
  const cache = rows(await d.execute(sql`
    SELECT kind,
           count(*)::int AS rows,
           coalesce(sum(nullif(result->>'costUsd', '')::numeric), 0)::float AS cost_usd,
           count(*) FILTER (WHERE result->>'costUsd' IS NULL OR result->>'costUsd' = '')::int AS empty_cost
    FROM llm_cache WHERE created_at >= ${since} GROUP BY kind ORDER BY kind`));
  const total = { rows: 0, cost: 0, empty: 0 };
  for (const r of cache) { total.rows += Number(r.rows); total.cost += Number(r.cost_usd); total.empty += Number(r.empty_cost); }
  console.log(`기간: ${since.toISOString().slice(0, 10)} ~ ${new Date().toISOString().slice(0, 10)} (UTC)`);
  console.log(`호출 시도(하루 상한 카운터): ${attempted.reduce((a, r) => a + Number(r.n), 0)}  [${attempted.map((r) => `${String(r.bucket).slice(2)} ${r.n}`).join(", ") || "기록 없음"}]`);
  for (const r of cache) console.log(`  ${r.kind}: 실제 호출 ${r.rows}건, costUsd 합계 $${Number(r.cost_usd).toFixed(4)}, 빈 costUsd ${r.empty_cost}건`);
  console.log(`실제 호출(캐시 새 행) ${total.rows}건 · costUsd 합계 $${total.cost.toFixed(4)} · 빈 costUsd 비율 ${total.rows ? ((total.empty / total.rows) * 100).toFixed(1) : "0.0"}%`);
}
main().catch((e) => { console.error("집계 실패:", (e as Error).message.replace(/postgres(ql)?:\/\/\S+/g, "<db-url>")); process.exit(1); });
