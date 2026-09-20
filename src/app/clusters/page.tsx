import { desc, eq } from "drizzle-orm";
import Link from "next/link";
import { db, hasDb, schema } from "@/db";

export const dynamic = "force-dynamic";

export default async function ClustersPage() {
  if (!hasDb) return <p className="text-sm text-zinc-600">데이터베이스가 연결되지 않았습니다.</p>;
  const d = db();
  const rows = await d.select().from(schema.clusters).orderBy(desc(schema.clusters.size), desc(schema.clusters.lastSeen)).limit(50);
  const members = await Promise.all(rows.map((c) =>
    d.select({ accountId: schema.posts.accountId, score: schema.posts.score, postUrl: schema.posts.postUrl }).from(schema.posts).where(eq(schema.posts.clusterId, c.id)).limit(20)
  ));
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">캠페인 (유사 문구 묶음)</h1>
      <p className="text-sm text-zinc-600">문자 3-gram MinHash/LSH 로 묶은 뒤 실제 Jaccard ≥ 0.75 만 남긴 결과입니다.</p>
      {rows.length === 0 && <p className="text-sm text-zinc-500">아직 클러스터가 없습니다. 게시물이 3건 이상 유사할 때 생성됩니다.</p>}
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
