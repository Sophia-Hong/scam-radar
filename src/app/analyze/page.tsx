"use client";
import { useMemo, useState } from "react";
import { scoreText } from "@/engine";
import { ScoreBadge } from "@/components/ScoreBadge";
import { Reasons } from "@/components/Reasons";

const SAMPLES = [
  "급등주 종목 무료로 공개합니다 🚀🚀 수익인증 300% 선착순 20명 ㅌㄹㄱㄹ @stock_king77",
  "요즘 물린 분들 많죠? 복구 도와드려요. 프로필 링크 참고하세요 Ｔеlеgrаm 문의",
  "텔.레.그.램 무료 리딩방 입장 → t.me/vipstock77 원금보장 마감임박",
  "오늘 삼성전자 좀 올랐네요. 다들 어떻게 보세요?",
];

/** 서버 비용 0 — 판정 엔진이 브라우저에서 그대로 돈다 */
export default function AnalyzePage() {
  const [text, setText] = useState(SAMPLES[0]);
  const [followers, setFollowers] = useState("");
  const [cluster, setCluster] = useState("");
  const r = useMemo(() => scoreText(text, {
    followers: followers ? Number(followers) : undefined,
    clusterSize: cluster ? Number(cluster) : undefined,
  }), [text, followers, cluster]);

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="space-y-3">
        <h1 className="text-2xl font-bold">텍스트 분석</h1>
        <p className="text-sm text-zinc-600">게시물·댓글을 붙여 넣으면 즉시 판정합니다. 이 페이지는 브라우저에서만 계산하며 서버로 전송하지 않습니다.</p>
        <textarea value={text} onChange={(e) => setText(e.target.value)} rows={8} className="w-full rounded-lg border border-zinc-300 bg-white p-3 font-mono text-sm outline-none focus:border-zinc-900" />
        <div className="flex gap-2 text-sm">
          <input value={followers} onChange={(e) => setFollowers(e.target.value)} placeholder="팔로워 수(선택)" className="w-40 rounded-md border border-zinc-300 bg-white px-2 py-1" />
          <input value={cluster} onChange={(e) => setCluster(e.target.value)} placeholder="동일 문구 반복 수(선택)" className="w-48 rounded-md border border-zinc-300 bg-white px-2 py-1" />
        </div>
        <div className="flex flex-wrap gap-1">
          {SAMPLES.map((s, i) => <button key={i} onClick={() => setText(s)} className="rounded-full border border-zinc-300 bg-white px-2 py-0.5 text-xs hover:bg-zinc-100">샘플 {i + 1}</button>)}
        </div>
      </div>
      <div className="space-y-4">
        <ScoreBadge score={r.score} label={r.label} size="lg" />
        <Reasons reasons={r.reasons} />
        <div className="rounded-lg border border-zinc-200 bg-white p-3 text-xs">
          <div className="mb-1 font-semibold text-zinc-700">정규화 결과</div>
          <div className="font-mono break-all text-zinc-600">{r.normalized.compact}</div>
          <div className="mt-2 flex flex-wrap gap-1">
            {r.normalized.techniques.length ? r.normalized.techniques.map((t) => <span key={t} className="rounded bg-amber-100 px-1.5 text-amber-900">{t}</span>) : <span className="text-zinc-400">난독화 없음</span>}
            <span className="ml-auto text-zinc-400">변형률 {(r.normalized.obfuscationRatio * 100).toFixed(0)}%</span>
          </div>
        </div>
        {r.needsLlmReview && <p className="text-xs text-zinc-500">경계 구간(40~69) — 서버 수집 파이프라인에서는 이 구간만 LLM 이 한 번 더 봅니다.</p>}
      </div>
    </div>
  );
}
