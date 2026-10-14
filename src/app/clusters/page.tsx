import { desc, eq, sql } from "drizzle-orm";
import Link from "next/link";
import { db, hasDb, schema } from "@/db";
import { isAdminPage } from "@/lib/auth";
import { SYNTHETIC_ID_SQL } from "@/lib/visibility";

export const dynamic = "force-dynamic";

export default async function ClustersPage() {
  if (!hasDb) return <p className="text-sm text-zinc-600">데이터베이스가 연결되지 않았습니다.</p>;
  const d = db();
  // 공개 열람자에게는 구성원이 전부 합성 계정인 캠페인만
  const admin = await isAdminPage();
  const publicOnly = admin ? undefined : sql`not exists (select 1 from posts p where p.cluster_id = ${schema.clusters.id} and p.account_id !~* ${SYNTHETIC_ID_SQL})`;
  const rows = await d.select().from(schema.clusters).where(publicOnly).orderBy(desc(schema.clusters.size), desc(schema.clusters.lastSeen)).limit(50);
  const members = await Promise.all(rows.map((c) =>
    d.select({ accountId: schema.posts.accountId, score: schema.posts.score, postUrl: schema.posts.postUrl }).from(schema.posts).where(eq(schema.posts.clusterId, c.id)).limit(20)
  ));
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">캠페인 (유사 문구 묶음)</h1>
      <p className="text-sm text-zinc-600">여러 계정에서 거의 같은 문구로 올라온 글을 한 묶음으로 보여 줍니다.</p>
      {rows.length === 0 && <p className="text-sm text-zinc-500">아직 묶인 캠페인이 없습니다.</p>}
      <ul className="space-y-3">
        {rows.map((c, i) => (
          <li key={c.id} id={c.id} className="rounded-lg border border-zinc-200 bg-white p-4 text-sm">
            <div className="flex flex-wrap items-center gap-3">
              <span className="font-mono text-xs text-zinc-500">{c.id}</span>
              <span className="rounded bg-violet-100 px-2 py-0.5 text-violet-800">게시물 {c.size}</span>
              <span className="rounded bg-zinc-100 px-2 py-0.5">계정 {c.accountCount}</span>
              <span className="rounded bg-red-100 px-2 py-0.5 text-red-800">최고점 {c.scoreMax}</span>
              <span className="ml-auto text-xs text-zinc-500">{c.firstSeen.toISOString().slice(0, 10)} ~ {c.lastSeen.toISOString().slice(0, 10)}</span>
            </div>
            <p className="mt-2 whitespace-pre-wrap text-zinc-800">{c.canonicalText}</p>
            <div className="mt-2 flex flex-wrap gap-1 text-xs">
              {[...new Set(members[i].map((m) => m.accountId))].map((a) => <Link key={a} href={`/report/${encodeURIComponent(a)}`} className="rounded border border-zinc-300 px-1.5 py-0.5 hover:bg-zinc-100">{a}</Link>)}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
