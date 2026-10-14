import { notFound } from "next/navigation";
import { buildReport, publicView } from "@/lib/report";
import { isAdminPage } from "@/lib/auth";
import { canView, decodeParam, reportApiHref } from "@/lib/visibility";
import { PrintButton } from "@/components/PrintButton";
import { hasDb } from "@/db";
import { ScoreBadge } from "@/components/ScoreBadge";
import { Reasons } from "@/components/Reasons";
import { PlainSigns } from "@/components/PlainSigns";
import { signIds, signTexts } from "@/lib/result-view";
import { HumanVerdict } from "@/components/HumanVerdict";
import { serverLang } from "@/lib/lang-server";
import { STRINGS } from "@/lib/strings";

export const dynamic = "force-dynamic";

const fmt = (s: string | null) => (s ? s.slice(0, 16).replace("T", " ") + " UTC" : "-");

export default async function ReportPage({ params }: { params: Promise<{ id: string }> }) {
  const lang = await serverLang();
  const L = STRINGS[lang];
  const t = L.report;
  const sourceLabel = (s: string) => s.split(",").map((x) => t.source[x] ?? x).join(" · ");
  if (!hasDb) return <p className="text-sm text-zinc-600">{t.noDb}</p>;
  const { id } = await params;
  const accountId = decodeParam(id);
  const admin = await isAdminPage();
  // 공개 열람자에게는 합성 데모 계정의 리포트만 — 실계정은 "없음"과 같은 응답
  if (!canView(accountId, admin)) notFound();
  const built = await buildReport(accountId, { admin });
  if (!built) notFound();
  const r = publicView(built, admin);
  // 영어 화면: 엔진 원문(한국어) 라벨 대신 쉬운 말 징후 — 내부 코드로 서버에서 계산하고 문장만 내보낸다
  const level = (["HIGH", "REVIEW", "LOW"].includes(built.status) ? built.status : "LOW") as "HIGH" | "REVIEW" | "LOW";
  const enSigns = signTexts(signIds(level, built.rationale, built.contacts.filter((c) => c.source.split(",").includes("text")).map((c) => c.type)), L.result);
  return (
    <article className="mx-auto max-w-3xl space-y-8 rounded-lg border border-zinc-200 bg-white p-8 print:border-0 print:p-0">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-zinc-200 pb-4">
        <div>
          <div className="text-xs text-zinc-500">{t.kicker}</div>
          <h1 className="text-2xl font-bold">{r.reportId}</h1>
          <div className="text-xs text-zinc-500">{t.generated} {fmt(r.generatedAt)}</div>
        </div>
        <div className="flex flex-col items-end gap-2">
          {/* 오탐 확정이면 점수 배지를 흐리게 — 사람의 판단이 기계 점수보다 앞선다 */}
          <ScoreBadge score={r.score} label={r.effectiveStatus} size="lg" muted={r.effectiveStatus === "CLEARED"} signals={r.rationale.filter((x) => x.points > 0).length} lang={lang} />
          <div className="no-print flex gap-2 text-xs">
            <a className="rounded border border-zinc-300 px-2 py-1" href={reportApiHref(accountId)}>JSON</a>
            <PrintButton className="rounded border border-zinc-300 px-2 py-1" label={t.print} />
          </div>
        </div>
      </header>

      {r.effectiveStatus === "CLEARED" && (
        <div className="rounded-lg border-2 border-emerald-500 bg-emerald-50 p-4">
          <div className="text-lg font-bold text-emerald-900">이 리포트는 사람 검토에서 해당 없음으로 결론 났습니다</div>
          <p className="mt-1 text-sm text-emerald-900">
            아래 자동 분석 내용은 기록 보존용이며, <b>신고 근거로 사용하지 마십시오.</b>
          </p>
        </div>
      )}
      <HumanVerdict review={r.humanReview} />

      <section>
        <h2 className="mb-2 text-lg font-semibold">{t.s1}</h2>
        <dl className="grid grid-cols-[8rem_1fr] gap-y-1 text-sm">
          <dt className="text-zinc-500">{t.platform}</dt><dd>{r.account.platform} · <b>@{r.account.handle}</b> {r.account.displayName && `(${r.account.displayName})`}</dd>
          <dt className="text-zinc-500">{t.url}</dt><dd><a className="text-blue-700 underline break-all" href={r.account.url}>{r.account.url}</a></dd>
          <dt className="text-zinc-500">{t.bio}</dt><dd>{r.account.bio ?? "-"}</dd>
          <dt className="text-zinc-500">{t.ext}</dt><dd className="break-all">{r.account.externalUrl ?? "-"}</dd>
          <dt className="text-zinc-500">{t.follow}</dt><dd>{r.account.followers ?? "-"} / {r.account.following ?? "-"}</dd>
          <dt className="text-zinc-500">{t.created}</dt><dd>{r.account.createdAt?.slice(0, 10) ?? t.unknown}</dd>
        </dl>
        {r.account.profileCapture && (
          <figure className="mt-3"><img src={r.account.profileCapture} alt={t.capture} className="max-h-96 rounded border border-zinc-200" /><figcaption className="text-xs text-zinc-500">{t.capture}</figcaption></figure>
        )}
      </section>

      <section>
        <h2 className="mb-2 text-lg font-semibold">{t.s2}</h2>
        <p className="text-sm">{t.timeline(fmt(r.timeline.firstSeen), fmt(r.timeline.lastSeen), r.timeline.postCount, r.timeline.distinctTargets)}</p>
      </section>

      <section>
        <h2 className="mb-2 text-lg font-semibold">{t.s3}</h2>
        {t.summaryNote && <p className="mb-1 text-xs text-zinc-500">{t.summaryNote}</p>}
        <pre className="whitespace-pre-wrap rounded bg-zinc-50 p-3 text-sm leading-relaxed">{r.summary.text}</pre>
        <div className="mt-1 text-xs text-zinc-500">{r.summary.generatedBy === "template" ? t.byTemplate : t.byAi(r.summary.generatedBy)}</div>
      </section>

      <section>
        <h2 className="mb-2 text-lg font-semibold">{t.s4}</h2>
        {r.contacts.length === 0 ? (
          <p className="text-sm text-zinc-500">{t.noContacts}</p>
        ) : (
          <ul className="flex flex-wrap gap-2 text-sm">
            {r.contacts.map((c) => (
              <li key={c.id} className="rounded-md border border-zinc-300 bg-zinc-50 px-2 py-1 text-zinc-700">
                <span className="text-xs text-zinc-500">{L.community.kind[c.type] ?? c.typeLabel}</span>{" "}
                <span className="font-mono break-all">{c.value}</span>
                <span className="ml-1 text-xs text-zinc-500">({sourceLabel(c.source)})</span>
              </li>
            ))}
          </ul>
        )}
        {/* 공개: 다른 계정의 이름·핸들·링크는 보이지 않고 수만 (율 1791947465 조건 1). 관리자는 목록 */}
        <h3 className="mt-4 mb-1 text-sm font-semibold">{t.linked(r.linkedCount ?? r.linkedAccounts.length)}</h3>
        {r.linkedAccounts.length === 0 ? (
          (r.linkedCount ?? 0) === 0 && <p className="text-sm text-zinc-500">{t.noLinked}</p>
        ) : (
          <ul className="space-y-1 text-sm">
            {r.linkedAccounts.map((s) => (
              <li key={s.accountId} className="flex flex-wrap items-center gap-2">
                <a className="text-blue-700 underline" href={`/report/${encodeURIComponent(s.accountId)}`}>@{s.handle}</a>
                <ScoreBadge score={s.score} label={s.label} lang={lang} />
                <span className="font-mono text-xs text-zinc-500">via {s.via}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="mb-2 text-lg font-semibold">{t.s5}</h2>
        <ol className="space-y-3 text-sm">
          {r.evidence.map((e, i) => (
            <li key={e.postUrl} className="rounded border border-zinc-200 p-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold">{t.evidence(i + 1)}</span>
                <span className="text-xs text-zinc-500">{e.kind === "comment" ? t.comment : t.post} · {t.posted} {fmt(e.postedAt)} · {t.captured} {fmt(e.capturedAt)}</span>
                <ScoreBadge score={e.score} label={e.score >= 70 ? "HIGH" : e.score >= 40 ? "REVIEW" : "LOW"} lang={lang} />
              </div>
              <a className="block break-all text-blue-700 underline" href={e.postUrl}>{e.postUrl}</a>
              {e.parentUrl && <div className="break-all text-xs text-zinc-500">{t.parent}: {e.parentUrl}</div>}
              <p className="mt-2 whitespace-pre-wrap">{e.text}</p>
              {e.techniques.length > 0 && <div className="mt-1 text-xs text-amber-800">{t.obf}: {e.techniques.join(", ")}</div>}
              {e.clusterId && <div className="text-xs text-violet-800">{t.campaign}: {e.clusterId}</div>}
              {e.capture && <img src={e.capture} alt={`${t.evidence(i + 1)} · ${t.captured}`} className="mt-2 max-h-[32rem] rounded border border-zinc-200" />}
            </li>
          ))}
        </ol>
      </section>

      <section>
        <h2 className="mb-2 text-lg font-semibold">{t.s6}</h2>
        {lang === "ko" ? <Reasons reasons={r.rationale} /> : <PlainSigns signs={enSigns} note={t.enSignsNote} />}
        <p className="mt-2 text-sm font-semibold text-zinc-700">{L.result.aiProofNote}</p>
        <a className="mt-1 inline-block text-sm font-semibold underline print:hidden" href="/learn">{L.result.learnLink}</a>
      </section>

      <section>
        <h2 className="mb-2 text-lg font-semibold">{t.s7}</h2>
        <ul className="space-y-1 text-sm">
          {r.filing.map((f) => { const x = t.filing[f.url] ?? f; return <li key={f.url}><a className="text-blue-700 underline" href={f.url} target="_blank" rel="noreferrer">{x.name}</a> <span className="text-zinc-500">— {x.note}</span></li>; })}
        </ul>
      </section>

      <footer className="border-t border-zinc-200 pt-3 text-xs text-zinc-500">{lang === "ko" ? r.disclaimer : L.result.disclaimer}</footer>
    </article>
  );
}
