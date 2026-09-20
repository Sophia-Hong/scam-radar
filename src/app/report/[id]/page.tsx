import { notFound } from "next/navigation";
import { buildReport } from "@/lib/report";
import { hasDb } from "@/db";
import { ScoreBadge } from "@/components/ScoreBadge";
import { Reasons } from "@/components/Reasons";
import { HumanVerdict } from "@/components/HumanVerdict";
import type { Reason } from "@/engine";

export const dynamic = "force-dynamic";

const fmt = (s: string | null) => (s ? s.slice(0, 16).replace("T", " ") + " UTC" : "-");
const SOURCE_LABEL: Record<string, string> = { text: "본문", bio: "프로필 소개", externalUrl: "프로필 링크" };
const sourceLabel = (s: string) => s.split(",").map((x) => SOURCE_LABEL[x] ?? x).join(" · ");

export default async function ReportPage({ params }: { params: Promise<{ id: string }> }) {
  if (!hasDb) return <p className="text-sm text-zinc-600">데이터베이스가 연결되지 않았습니다.</p>;
  const { id } = await params;
  const r = await buildReport(decodeURIComponent(id));
  if (!r) notFound();
  return (
    <article className="mx-auto max-w-3xl space-y-8 rounded-lg border border-zinc-200 bg-white p-8 print:border-0 print:p-0">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-zinc-200 pb-4">
        <div>
          <div className="text-xs text-zinc-500">리딩방 유인 의심 계정 · 조사 참고 리포트</div>
          <h1 className="text-2xl font-bold">{r.reportId}</h1>
          <div className="text-xs text-zinc-500">생성 {fmt(r.generatedAt)}</div>
        </div>
        <div className="flex flex-col items-end gap-2">
          {/* 오탐 확정이면 점수 배지를 흐리게 — 사람의 판단이 기계 점수보다 앞선다 */}
          <ScoreBadge score={r.score} label={r.effectiveStatus} size="lg" muted={r.effectiveStatus === "CLEARED"} />
          <div className="no-print flex gap-2 text-xs">
            <a className="rounded border border-zinc-300 px-2 py-1" href={`/api/reports/${encodeURIComponent(id)}`}>JSON</a>
            <a className="rounded border border-zinc-300 px-2 py-1" href="javascript:window.print()">인쇄/PDF</a>
          </div>
        </div>
      </header>

      {r.effectiveStatus === "CLEARED" && (
        <div className="rounded-lg border-2 border-emerald-500 bg-emerald-50 p-4">
          <div className="text-lg font-bold text-emerald-900">이 리포트는 사람 검토에서 오탐으로 결론 났습니다</div>
          <p className="mt-1 text-sm text-emerald-900">
            아래 자동 분석 내용은 기록 보존용이며, <b>신고 근거로 사용하지 마십시오.</b>
          </p>
        </div>
      )}
      <HumanVerdict review={r.humanReview} />

      <section>
        <h2 className="mb-2 text-lg font-semibold">1. 피신고 계정</h2>
        <dl className="grid grid-cols-[8rem_1fr] gap-y-1 text-sm">
          <dt className="text-zinc-500">플랫폼 / 계정명</dt><dd>{r.account.platform} · <b>@{r.account.handle}</b> {r.account.displayName && `(${r.account.displayName})`}</dd>
          <dt className="text-zinc-500">계정 URL</dt><dd><a className="text-blue-700 underline break-all" href={r.account.url}>{r.account.url}</a></dd>
          <dt className="text-zinc-500">프로필 소개</dt><dd>{r.account.bio ?? "-"}</dd>
          <dt className="text-zinc-500">프로필 외부 링크</dt><dd className="break-all">{r.account.externalUrl ?? "-"}</dd>
          <dt className="text-zinc-500">팔로워 / 팔로잉</dt><dd>{r.account.followers ?? "-"} / {r.account.following ?? "-"}</dd>
          <dt className="text-zinc-500">계정 생성일</dt><dd>{r.account.createdAt?.slice(0, 10) ?? "미확인"}</dd>
        </dl>
        {r.account.profileCapture && (
          <figure className="mt-3"><img src={r.account.profileCapture} alt="프로필 캡처" className="max-h-96 rounded border border-zinc-200" /><figcaption className="text-xs text-zinc-500">프로필 캡처</figcaption></figure>
        )}
      </section>

      <section>
        <h2 className="mb-2 text-lg font-semibold">2. 일시</h2>
        <p className="text-sm">최초 관측 {fmt(r.timeline.firstSeen)} · 최근 관측 {fmt(r.timeline.lastSeen)} · 게시물/댓글 {r.timeline.postCount}건 · 댓글이 달린 서로 다른 원글 {r.timeline.distinctTargets}개</p>
      </section>

      <section>
        <h2 className="mb-2 text-lg font-semibold">3. 내용 (범죄사실 요약 — 요건사실 위주)</h2>
        <pre className="whitespace-pre-wrap rounded bg-zinc-50 p-3 text-sm leading-relaxed">{r.summary.text}</pre>
        <div className="mt-1 text-xs text-zinc-500">작성: {r.summary.generatedBy === "template" ? "템플릿(규칙 기반)" : `LLM ${r.summary.generatedBy} 초안 — 사람 검토 필요`}</div>
      </section>

      <section>
        <h2 className="mb-2 text-lg font-semibold">4. 유도 수단 (연락처·링크)</h2>
        {r.contacts.length === 0 ? (
          <p className="text-sm text-zinc-500">본문·프로필에서 식별된 연락처가 없습니다.</p>
        ) : (
          <ul className="flex flex-wrap gap-2 text-sm">
            {r.contacts.map((c) => (
              <li key={c.id} className={`rounded-md border px-2 py-1 ${c.strong ? "border-red-300 bg-red-50 text-red-900" : "border-zinc-300 bg-zinc-50 text-zinc-700"}`}>
                <span className="text-xs text-zinc-500">{c.typeLabel}</span>{" "}
                <span className="font-mono break-all">{c.value}</span>
                <span className="ml-1 text-xs text-zinc-500">({sourceLabel(c.source)})</span>
              </li>
            ))}
          </ul>
        )}
        <h3 className="mt-4 mb-1 text-sm font-semibold">같은 연락처를 쓰는 다른 계정 ({r.linkedAccounts.length})</h3>
        {r.linkedAccounts.length === 0 ? (
          <p className="text-sm text-zinc-500">현재까지 수집된 범위에서는 없습니다.</p>
        ) : (
          <ul className="space-y-1 text-sm">
            {r.linkedAccounts.map((s) => (
              <li key={s.accountId} className="flex flex-wrap items-center gap-2">
                <a className="text-blue-700 underline" href={`/report/${encodeURIComponent(s.accountId)}`}>@{s.handle}</a>
                <ScoreBadge score={s.score} label={s.label} />
                <span className="font-mono text-xs text-zinc-500">via {s.via}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="mb-2 text-lg font-semibold">5. 증거 (게시물 캡처)</h2>
        <ol className="space-y-3 text-sm">
          {r.evidence.map((e, i) => (
            <li key={e.postUrl} className="rounded border border-zinc-200 p-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold">증거 {i + 1}</span>
                <span className="text-xs text-zinc-500">{e.kind === "comment" ? "댓글" : "게시물"} · 게시 {fmt(e.postedAt)} · 캡처 {fmt(e.capturedAt)}</span>
                <ScoreBadge score={e.score} label={e.score >= 70 ? "HIGH" : e.score >= 40 ? "REVIEW" : "LOW"} />
              </div>
              <a className="block break-all text-blue-700 underline" href={e.postUrl}>{e.postUrl}</a>
              {e.parentUrl && <div className="break-all text-xs text-zinc-500">원글: {e.parentUrl}</div>}
              <p className="mt-2 whitespace-pre-wrap">{e.text}</p>
              {e.techniques.length > 0 && <div className="mt-1 text-xs text-amber-800">난독화: {e.techniques.join(", ")}</div>}
              {e.clusterId && <div className="text-xs text-violet-800">동일 문구 캠페인: {e.clusterId}</div>}
              {e.capture && <img src={e.capture} alt={`증거 ${i + 1} 캡처`} className="mt-2 max-h-[32rem] rounded border border-zinc-200" />}
            </li>
          ))}
        </ol>
      </section>

      <section>
        <h2 className="mb-2 text-lg font-semibold">6. 판단 근거</h2>
        <Reasons reasons={r.rationale as Reason[]} />
      </section>

      <section>
        <h2 className="mb-2 text-lg font-semibold">7. 신고처</h2>
        <ul className="space-y-1 text-sm">
          {r.filing.map((f) => <li key={f.url}><a className="text-blue-700 underline" href={f.url} target="_blank" rel="noreferrer">{f.name}</a> <span className="text-zinc-500">— {f.note}</span></li>)}
        </ul>
      </section>

      <footer className="border-t border-zinc-200 pt-3 text-xs text-zinc-500">{r.disclaimer}</footer>
    </article>
  );
}
