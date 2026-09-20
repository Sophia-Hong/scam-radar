"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ScoreBadge } from "@/components/ScoreBadge";
import { Reasons } from "@/components/Reasons";
import { effectiveStatus } from "@/lib/labels";
import type { Reason } from "@/engine";

type QPost = { id: string; text: string; url: string; score: number; label: string; humanLabel: string | null; reasons: Reason[] };
type Item = {
  accountId: string; platform: string; handle: string; displayName: string | null; profileUrl: string;
  score: number; label: string; humanLabel: "SCAM" | "NOT_SCAM" | null; humanNote: string | null;
  reviewedAt: string | null; reviewedBy: string | null; effectiveStatus: string;
  reasons: Reason[]; postTotal: number; firstSeen: string; lastSeen: string;
  entityCount: number; sharedWithCount: number; openFeedback: number; posts: QPost[];
};

const TABS = [
  { key: "review", label: "REVIEW" },
  { key: "high", label: "HIGH 미검토" },
  { key: "flagged", label: "제보 있음" },
  { key: "all", label: "전체" },
] as const;
type TabKey = (typeof TABS)[number]["key"];

const snippet = (s: string, n = 70) => (s.length > n ? s.slice(0, n) + "…" : s);

export default function ReviewPage() {
  const [tab, setTab] = useState<TabKey>("all");
  const [items, setItems] = useState<Item[]>([]);
  /** 어떤 탭의 결과가 화면에 있는지. 현재 탭과 다르면 아직 불러오는 중 (effect 안에서 동기 setState 를 하지 않으려고) */
  const [loadedTab, setLoadedTab] = useState<TabKey | null>(null);
  const [needToken, setNeedToken] = useState(false);
  const [token, setToken] = useState("");
  const [authErr, setAuthErr] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async (t: TabKey) => {
    try {
      const r = await fetch(`/api/admin/queue?status=${t}&limit=100`);
      if (r.status === 401) { setNeedToken(true); setItems([]); setLoadedTab(t); return; }
      const j = await r.json();
      if (!r.ok) { setErr(j?.error ? String(j.error) : "큐를 불러오지 못했습니다"); setLoadedTab(t); return; }
      setNeedToken(false); setErr(null);
      setItems(j.items ?? []);
    } catch { setErr("네트워크 오류"); }
    finally { setLoadedTab(t); }
  }, []);

  // 큐 로딩은 외부(API) 동기화라 effect 가 맞는 자리다. load 안의 setState 는 전부 await 뒤에 있어
  // 렌더 중 연쇄 갱신을 일으키지 않지만, 규칙이 async 호출 내부까지는 보지 못한다.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load(tab); }, [tab, load]);
  const loading = loadedTab !== tab;

  async function login(e: React.FormEvent) {
    e.preventDefault();
    setAuthErr(null);
    const r = await fetch("/api/admin/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token }) });
    if (!r.ok) { setAuthErr("토큰이 올바르지 않습니다"); return; }
    setToken(""); await load(tab);
  }
  async function logout() {
    await fetch("/api/admin/logout", { method: "POST" });
    setNeedToken(true); setItems([]);
  }

  async function decide(it: Item, decision: "SCAM" | "NOT_SCAM" | "RESET") {
    const note = notes[it.accountId]?.trim() || undefined;
    const prev = items;
    // 낙관적 갱신 — 실패하면 되돌린다
    const humanLabel = decision === "RESET" ? null : decision;
    setItems((xs) => xs.map((x) => x.accountId === it.accountId ? {
      ...x, humanLabel, humanNote: decision === "RESET" ? null : (note ?? null),
      reviewedAt: decision === "RESET" ? null : new Date().toISOString(), reviewedBy: decision === "RESET" ? null : "admin",
      effectiveStatus: effectiveStatus(x.label, humanLabel),
      openFeedback: decision === "RESET" ? x.openFeedback : 0,
    } : x));
    setBusy(it.accountId);
    try {
      const r = await fetch("/api/admin/decision", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ accountId: it.accountId, decision, note }),
      });
      if (r.status === 401) { setNeedToken(true); setItems([]); return; }
      if (!r.ok) { setItems(prev); setErr("판단 저장 실패"); return; }
      setNotes((n) => ({ ...n, [it.accountId]: "" }));
    } catch { setItems(prev); setErr("판단 저장 실패"); }
    finally { setBusy(null); }
  }

  if (needToken) {
    return (
      <div className="mx-auto max-w-md space-y-4">
        <h1 className="text-2xl font-bold">검토자 로그인</h1>
        <p className="text-sm text-zinc-600">이 화면은 사람이 최종 판단을 내리는 곳입니다. 관리자 토큰(<code>ADMIN_TOKEN</code>)을 입력하세요.</p>
        <form onSubmit={login} className="flex gap-2">
          <input type="password" value={token} onChange={(e) => setToken(e.target.value)} placeholder="ADMIN_TOKEN"
            className="flex-1 rounded-lg border border-zinc-300 bg-white px-4 py-3 outline-none focus:border-zinc-900" />
          <button className="rounded-lg bg-zinc-900 px-5 py-3 font-semibold text-white">로그인</button>
        </form>
        {authErr && <p className="text-sm text-red-700">{authErr}</p>}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">사람 검토 큐</h1>
          <p className="text-sm text-zinc-600">자동 판정은 초안입니다. <b>최종 판단은 사람이 합니다.</b></p>
        </div>
        <button onClick={logout} className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm text-zinc-600">로그아웃</button>
      </div>

      <div className="flex flex-wrap gap-2">
        {TABS.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`rounded-full px-3 py-1.5 text-sm font-medium ${tab === t.key ? "bg-zinc-900 text-white" : "border border-zinc-300 bg-white text-zinc-700"}`}>
            {t.label}
          </button>
        ))}
        <span className="self-center text-sm text-zinc-500">{loading ? "불러오는 중…" : `${items.length}건`}</span>
      </div>
      {err && <p className="text-sm text-red-700">{err}</p>}

      {!loading && items.length === 0 && <p className="rounded-lg border border-zinc-200 bg-white p-6 text-sm text-zinc-600">검토할 계정이 없습니다.</p>}

      <div className="overflow-x-auto rounded-lg border border-zinc-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-zinc-50 text-left text-xs text-zinc-500">
            <tr>
              <th className="px-3 py-2">계정</th>
              <th className="px-3 py-2">상태</th>
              <th className="px-3 py-2">대표 게시물</th>
              <th className="px-3 py-2 whitespace-nowrap">연락처/연결</th>
              <th className="px-3 py-2 whitespace-nowrap">제보</th>
              <th className="px-3 py-2">판단</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {items.map((it) => {
              const expanded = open === it.accountId;
              return (
                <tr key={it.accountId} className="align-top">
                  <td className="px-3 py-2">
                    <button onClick={() => setOpen(expanded ? null : it.accountId)} className="text-left font-medium text-blue-700 underline">
                      @{it.handle}
                    </button>
                    <div className="text-xs text-zinc-500">{it.platform} · {it.postTotal}건 · {it.lastSeen.slice(0, 10)}</div>
                    {expanded && (
                      <div className="mt-3 max-w-xl space-y-3">
                        <div className="flex flex-wrap gap-2 text-xs">
                          <Link href={`/report/${encodeURIComponent(it.accountId)}`} className="rounded bg-zinc-900 px-2 py-1 text-white">리포트</Link>
                          <a href={it.profileUrl} target="_blank" rel="noreferrer" className="rounded border border-zinc-300 px-2 py-1">프로필</a>
                        </div>
                        <Reasons reasons={it.reasons} />
                        {it.posts.map((p) => (
                          <div key={p.id} className="rounded border border-zinc-200 p-2">
                            <div className="flex items-center justify-between gap-2">
                              <a href={p.url} target="_blank" rel="noreferrer" className="truncate text-xs text-blue-700 underline">{p.url}</a>
                              <ScoreBadge score={p.score} label={p.label} />
                            </div>
                            <p className="mt-1 whitespace-pre-wrap text-zinc-800">{p.text}</p>
                            <ul className="mt-1 text-xs text-zinc-500">
                              {p.reasons.map((r, i) => <li key={r.code + i}>{r.points > 0 ? "+" : ""}{r.points} {r.label}</li>)}
                            </ul>
                          </div>
                        ))}
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-2"><ScoreBadge score={it.score} label={it.effectiveStatus} muted={it.effectiveStatus === "CLEARED"} /></td>
                  <td className="px-3 py-2 text-zinc-700">{it.posts[0] ? snippet(it.posts[0].text) : "-"}</td>
                  <td className="px-3 py-2 whitespace-nowrap text-zinc-700">{it.entityCount} / {it.sharedWithCount}</td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    {it.openFeedback > 0 ? <span className="rounded bg-amber-100 px-1.5 py-0.5 text-xs font-medium text-amber-900">{it.openFeedback}건</span> : <span className="text-zinc-400">-</span>}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap gap-1">
                      <button disabled={busy === it.accountId} onClick={() => decide(it, "SCAM")}
                        className={`rounded px-2 py-1 text-xs font-medium ${it.humanLabel === "SCAM" ? "bg-red-700 text-white" : "border border-red-300 text-red-700"} disabled:opacity-50`}>사기 확인</button>
                      <button disabled={busy === it.accountId} onClick={() => decide(it, "NOT_SCAM")}
                        className={`rounded px-2 py-1 text-xs font-medium ${it.humanLabel === "NOT_SCAM" ? "bg-emerald-700 text-white" : "border border-emerald-300 text-emerald-700"} disabled:opacity-50`}>오탐</button>
                      <button disabled={busy === it.accountId || !it.humanLabel} onClick={() => decide(it, "RESET")}
                        className="rounded border border-zinc-300 px-2 py-1 text-xs text-zinc-600 disabled:opacity-40">되돌리기</button>
                    </div>
                    <input value={notes[it.accountId] ?? ""} onChange={(e) => setNotes((n) => ({ ...n, [it.accountId]: e.target.value }))}
                      placeholder="검토 메모 (선택)" className="mt-1 w-40 rounded border border-zinc-300 px-2 py-1 text-xs outline-none focus:border-zinc-900" />
                    {it.reviewedAt && <div className="mt-1 text-xs text-zinc-500">{it.reviewedAt.slice(0, 10)} · {it.reviewedBy}</div>}
                    {it.humanNote && <div className="mt-0.5 max-w-40 text-xs text-zinc-500">“{it.humanNote}”</div>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
