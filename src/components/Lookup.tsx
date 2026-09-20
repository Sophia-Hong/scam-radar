"use client";
import { useState } from "react";
import Link from "next/link";
import { ScoreBadge } from "./ScoreBadge";
import { Reasons } from "./Reasons";
import { HumanVerdict, type HumanReview } from "./HumanVerdict";
import type { Reason } from "@/engine";

type Post = { id: string; postUrl: string; parentUrl: string | null; kind: string; text: string; postedAt: string | null; capturedAt: string; screenshotUrl: string | null; score: number; label: string; reasons: Reason[]; techniques: string[]; clusterId: string | null };
type EntityRef = { id: string; type: string; value: string; source: string };
type SharedRef = { accountId: string; handle: string; score: number; label: string; via: string };
type Result =
  | { found: false; message: string }
  | { found: true; account: { id: string; platform: string; handle: string; displayName: string | null; profileUrl: string; bio: string | null; externalUrl: string | null; followers: number | null; following: number | null; score: number; label: string; reasons: Reason[]; postTotal: number; distinctTargets: number; profileShotUrl: string | null; firstSeen: string; lastSeen: string }; posts: Post[]; entities: EntityRef[]; sharedWith: SharedRef[]; humanLabel: "SCAM" | "NOT_SCAM" | null; humanNote: string | null; reviewedAt: string | null; reviewedBy: string | null; effectiveStatus: string; otherMatches: { id: string; handle: string; score: number; label: string }[] };

const ENTITY_LABEL: Record<string, string> = {
  telegram: "텔레그램", kakao_open: "카카오 오픈채팅", kakao_channel: "카카오톡/채널",
  phone: "전화번호", handle: "핸들", url: "링크", line: "라인", wechat: "위챗",
};
const STRONG_TYPES = new Set(["telegram", "kakao_open", "kakao_channel", "phone", "line", "wechat"]);
const SOURCE_LABEL: Record<string, string> = { text: "본문", bio: "프로필 소개", externalUrl: "프로필 링크" };
/** source 는 "text,externalUrl" 처럼 합쳐져 올 수 있다 */
const sourceLabel = (s: string) => s.split(",").map((x) => SOURCE_LABEL[x] ?? x).join(" · ");

/** 계정 응답의 사람 판단 필드를 배너가 쓰는 모양으로 */
function humanReviewOf(res: Extract<Result, { found: true }>): HumanReview {
  if (!res.humanLabel || !res.reviewedAt) return null;
  return { label: res.humanLabel, note: res.humanNote, reviewedAt: res.reviewedAt, reviewedBy: res.reviewedBy };
}

export function Lookup() {
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);
  const [res, setRes] = useState<Result | null>(null);
  const [fb, setFb] = useState<string | null>(null);

  async function search(e?: React.FormEvent) {
    e?.preventDefault();
    if (!q.trim()) return;
    setLoading(true); setRes(null); setFb(null);
    try {
      const r = await fetch(`/api/accounts/${encodeURIComponent(q.trim())}`);
      setRes(await r.json());
    } finally { setLoading(false); }
  }
  async function feedback(isScam: boolean) {
    if (!res || !res.found) return;
    const r = await fetch("/api/feedback", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ accountId: res.account.id, isScam }) });
    if (r.status === 429) { setFb("잠시 후 다시 시도해 주세요 (제보는 분당 10건까지)."); return; }
    if (!r.ok) { setFb("제보 저장에 실패했습니다."); return; }
    setFb("제보가 저장됐습니다. 검토자가 확인합니다.");
  }

  return (
    <div className="space-y-6">
      <form onSubmit={search} className="flex gap-2">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="@handle 또는 https://www.threads.net/@handle" className="flex-1 rounded-lg border border-zinc-300 bg-white px-4 py-3 text-base outline-none focus:border-zinc-900" />
        <button disabled={loading} className="rounded-lg bg-zinc-900 px-5 py-3 font-semibold text-white disabled:opacity-50">{loading ? "조회 중…" : "조회"}</button>
      </form>

      {res && !res.found && (
        <div className="rounded-lg border border-zinc-200 bg-white p-5">
          <ScoreBadge score={0} label="UNKNOWN" size="lg" />
          <p className="mt-3 text-sm text-zinc-600">{res.message}. 확인하고 싶은 게시물이 있다면 <Link className="underline" href="/analyze">텍스트 분석</Link>에 붙여 넣어 보세요.</p>
        </div>
      )}

      {res && res.found && (
        <div className="space-y-5">
          <HumanVerdict review={humanReviewOf(res)} />
          <div className="rounded-lg border border-zinc-200 bg-white p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="text-sm text-zinc-500">{res.account.platform}</div>
                <h2 className="text-2xl font-bold">@{res.account.handle} {res.account.displayName && <span className="text-base font-normal text-zinc-500">{res.account.displayName}</span>}</h2>
                <a href={res.account.profileUrl} target="_blank" rel="noreferrer" className="text-sm text-blue-700 underline">{res.account.profileUrl}</a>
              </div>
              <ScoreBadge score={res.account.score} label={res.effectiveStatus} size="lg" muted={res.effectiveStatus === "CLEARED"} signals={res.account.reasons.filter((r) => r.points > 0).length} />
            </div>
            <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-1 text-sm sm:grid-cols-4">
              <dt className="text-zinc-500">수집 게시물</dt><dd className="font-medium">{res.account.postTotal}건</dd>
              <dt className="text-zinc-500">댓글 살포 원글 수</dt><dd className="font-medium">{res.account.distinctTargets}</dd>
              <dt className="text-zinc-500">팔로워 / 팔로잉</dt><dd className="font-medium">{res.account.followers ?? "-"} / {res.account.following ?? "-"}</dd>
              <dt className="text-zinc-500">관찰 기간</dt><dd className="font-medium">{res.account.firstSeen.slice(0, 10)} ~ {res.account.lastSeen.slice(0, 10)}</dd>
            </dl>
            {res.account.bio && <p className="mt-3 rounded bg-zinc-50 p-2 text-sm text-zinc-700">프로필: {res.account.bio} {res.account.externalUrl && <a className="text-blue-700 underline" href={res.account.externalUrl} target="_blank" rel="noreferrer">{res.account.externalUrl}</a>}</p>}
            <div className="mt-4 flex flex-wrap gap-2 text-sm">
              <Link href={`/report/${encodeURIComponent(res.account.id)}`} className="rounded-md bg-zinc-900 px-3 py-1.5 font-medium text-white">신고용 리포트 보기</Link>
              <a href={`/api/reports/${encodeURIComponent(res.account.id)}`} className="rounded-md border border-zinc-300 px-3 py-1.5">리포트 JSON</a>
              <button onClick={() => feedback(true)} className="rounded-md border border-red-300 px-3 py-1.5 text-red-700">관련 경험 제보</button>
              <button onClick={() => feedback(false)} className="rounded-md border border-zinc-300 px-3 py-1.5 text-zinc-700">해당 없는 것 같아요</button>
            </div>
            {fb && <p className="mt-2 text-xs text-emerald-700">{fb}</p>}
          </div>

          <div>
            <h3 className="mb-2 font-semibold">감지된 신호와 설명</h3>
            <Reasons reasons={res.account.reasons} />
          </div>

          {res.entities.length > 0 && (
            <div>
              <h3 className="mb-2 font-semibold">연락처 ({res.entities.length})</h3>
              <ul className="flex flex-wrap gap-2">
                {res.entities.map((e) => (
                  <li key={e.id}>
                    <a href={`/api/entities/${encodeURIComponent(e.id)}`} title={`${sourceLabel(e.source)}에서 확인`}
                      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs ${STRONG_TYPES.has(e.type) ? "border-red-300 bg-red-50 text-red-900" : "border-zinc-300 bg-zinc-50 text-zinc-600"}`}>
                      <span className="text-zinc-500">{ENTITY_LABEL[e.type] ?? e.type}</span>
                      <span className="font-mono break-all">{e.value}</span>
                    </a>
                  </li>
                ))}
              </ul>
              <p className="mt-1 text-xs text-zinc-500">빨간 칩은 계정 연결에 쓰는 강한 신호(메신저·번호)입니다. 회색은 참고용입니다.</p>
            </div>
          )}

          {res.sharedWith.length > 0 && (
            <div>
              <h3 className="mb-2 font-semibold">같은 연락처를 쓰는 계정 ({res.sharedWith.length})</h3>
              <ul className="space-y-2">
                {res.sharedWith.map((s) => (
                  <li key={s.accountId} className="flex flex-wrap items-center gap-2 rounded-lg border border-zinc-200 bg-white p-3 text-sm">
                    <Link href={`/report/${encodeURIComponent(s.accountId)}`} className="font-medium text-blue-700 underline">@{s.handle}</Link>
                    <ScoreBadge score={s.score} label={s.label} />
                    <span className="ml-auto font-mono text-xs text-zinc-500">via {s.via}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-1 text-xs text-zinc-500">같은 연락처를 안내하는 계정들은 같은 운영자·조직에서 관리할 가능성이 있습니다.</p>
            </div>
          )}

          <div>
            <h3 className="mb-2 font-semibold">수집된 게시물 ({res.posts.length})</h3>
            <ul className="space-y-2">
              {res.posts.map((p) => (
                <li key={p.id} className="rounded-lg border border-zinc-200 bg-white p-3 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <a href={p.postUrl} target="_blank" rel="noreferrer" className="truncate text-blue-700 underline">{p.kind === "comment" ? "댓글" : "게시물"} · {p.postUrl}</a>
                    <ScoreBadge score={p.score} label={p.label} />
                  </div>
                  <p className="mt-1 whitespace-pre-wrap text-zinc-800">{p.text}</p>
                  <div className="mt-1 flex flex-wrap gap-2 text-xs text-zinc-500">
                    <span>{(p.postedAt ?? p.capturedAt).slice(0, 16).replace("T", " ")}</span>
                    {p.techniques.map((t) => <span key={t} className="rounded bg-zinc-100 px-1.5">{t}</span>)}
                    {p.clusterId && <Link href={`/clusters#${p.clusterId}`} className="rounded bg-violet-100 px-1.5 text-violet-800">캠페인 {p.clusterId}</Link>}
                    {p.screenshotUrl && <a href={p.screenshotUrl} target="_blank" rel="noreferrer" className="underline">캡처</a>}
                  </div>
                </li>
              ))}
            </ul>
          </div>
          {res.otherMatches.length > 0 && (
            <p className="text-xs text-zinc-500">비슷한 핸들: {res.otherMatches.map((m) => `${m.id} (${m.score})`).join(", ")}</p>
          )}
        </div>
      )}
    </div>
  );
}
