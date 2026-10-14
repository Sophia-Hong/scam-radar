"use client";
import { useMemo, useState } from "react";
import { scoreText } from "@/engine";
import { ScoreBadge } from "@/components/ScoreBadge";
import { Reasons } from "@/components/Reasons";
import { PlainSigns } from "@/components/PlainSigns";
import { signIds, signTexts } from "@/lib/result-view";
import { extractEntities } from "@/engine/entities";
import { useLang } from "@/lib/i18n";


/** 서버 비용 0 — 판정 엔진이 브라우저에서 그대로 돈다 */
export default function AnalyzePage() {
  const { lang, t: L } = useLang();
  const t = L.analyze;
  const SAMPLES = t.samples;
  const [text, setText] = useState(SAMPLES[0]);
  const [followers, setFollowers] = useState("");
  const [cluster, setCluster] = useState("");
  const [spread, setSpread] = useState("");
  const r = useMemo(() => scoreText(text, {
    followers: followers ? Number(followers) : undefined,
    clusterSize: cluster ? Number(cluster) : undefined,
    clusterAccounts: spread ? Number(spread) : undefined,
  }), [text, followers, cluster, spread]);

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="space-y-3">
        <h1 className="text-2xl font-bold">{t.title}</h1>
        <p className="text-sm text-zinc-600">{t.lead} {t.notice}</p>
        <p className="text-xs text-zinc-500">{L.hero.scope}</p>
        <textarea value={text} onChange={(e) => setText(e.target.value)} rows={8} className="w-full rounded-lg border border-zinc-300 bg-white p-3 font-mono text-sm outline-none focus:border-zinc-900" />
        <div className="flex gap-2 text-sm">
          <input value={followers} onChange={(e) => setFollowers(e.target.value)} placeholder={t.followers} className="w-40 rounded-md border border-zinc-300 bg-white px-2 py-1" />
          <input value={cluster} onChange={(e) => setCluster(e.target.value)} placeholder={t.cluster} className="w-44 rounded-md border border-zinc-300 bg-white px-2 py-1" />
          <input value={spread} onChange={(e) => setSpread(e.target.value)} placeholder={t.spread} className="w-48 rounded-md border border-zinc-300 bg-white px-2 py-1" />
        </div>
        <div className="flex flex-wrap gap-1">
          {SAMPLES.map((s, i) => <button key={i} onClick={() => setText(s)} className="rounded-full border border-zinc-300 bg-white px-2 py-0.5 text-xs hover:bg-zinc-100">{t.sample(i + 1)}</button>)}
        </div>
      </div>
      <div className="space-y-4">
        <ScoreBadge score={r.score} label={r.label} size="lg" signals={r.reasons.filter((x) => x.points > 0).length} lang={lang} />
        {lang === "ko" ? <Reasons reasons={r.reasons} /> : (
          <PlainSigns signs={signTexts(signIds(r.label, r.reasons, extractEntities(text).map((e) => e.type), text), L.result)} note={L.report.enSignsNote} />
        )}
        <div className="rounded-lg border border-zinc-200 bg-white p-3 text-xs">
          <div className="mb-1 font-semibold text-zinc-700">{t.normalized}</div>
          <div className="font-mono break-all text-zinc-600">{r.normalized.compact}</div>
          <div className="mt-2 flex flex-wrap gap-1">
            {r.normalized.techniques.length ? r.normalized.techniques.map((t) => <span key={t} className="rounded bg-amber-100 px-1.5 text-amber-900">{t}</span>) : <span className="text-zinc-400">{t.noObf}</span>}
            <span className="ml-auto text-zinc-400">{t.ratio(Math.round(r.normalized.obfuscationRatio * 100))}</span>
          </div>
        </div>
        <p className="text-xs text-zinc-500">{t.ai}</p>
      </div>
    </div>
  );
}
