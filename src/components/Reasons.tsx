"use client";

import { explainReason, type Explanation } from "@/engine/explain";
import { useLang } from "@/lib/i18n";

/** 화면에 그리는 근거 한 줄 — 관리자·브라우저 판독은 내부 `code`, 공개 응답은 서버가 붙인 설명(what·why…)과 순번 `id` 만 갖는다 */
export type ShownReason = { code?: string; id?: string; label: string; points: number; evidence?: string | null } & Partial<Explanation>;

/** 처음 몇 개는 펼쳐서, 나머지는 접어서 보여 준다 */
const EXPANDED_BY_DEFAULT = 3;

function Explain({ r }: { r: ShownReason }) {
  const L = useLang().t.reasons;
  const x = r.what ? (r as ShownReason & Explanation) : explainReason(r.code ?? "", r.label, r.evidence ?? undefined);
  return (
    <dl className="mt-2 space-y-2 text-[13px] leading-relaxed text-zinc-700">
      <div><dt className="font-semibold text-zinc-900">{L.what}</dt><dd>{x.what}</dd></div>
      <div><dt className="font-semibold text-zinc-900">{L.why}</dt><dd>{x.why}</dd></div>
      <div><dt className="font-semibold text-zinc-900">{L.example}</dt><dd className="text-zinc-600">{x.example}</dd></div>
      <div><dt className="font-semibold text-zinc-900">{L.benign}</dt><dd className="text-zinc-600">{x.benign}</dd></div>
    </dl>
  );
}

export function Reasons({ reasons }: { reasons: ShownReason[] }) {
  const L = useLang().t.reasons;
  if (!reasons?.length) return <p className="text-sm text-zinc-500">{L.none}</p>;
  const positive = reasons.filter((r) => r.points > 0).length;
  return (
    <div className="space-y-2">
      <p className="text-xs text-zinc-500">{L.head(positive)}</p>
      {L.sourceNote && <p className="text-xs text-zinc-500">{L.sourceNote}</p>}
      <ul className="divide-y divide-zinc-100 rounded-lg border border-zinc-200 bg-white text-sm">
        {reasons.map((r, i) => {
          const head = (
            <div className="flex items-start gap-3">
              {/* 항목별 가점·감점 숫자는 보여 주지 않는다 — 신호의 이름·종류와 총점·신호 개수만 (소현 10-05, 테오). 감점 항목은 "완화"로만 표시 */}
              <span className={`w-10 shrink-0 text-right text-xs ${r.points < 0 ? "text-emerald-700" : "text-red-600"}`} aria-hidden="true">{r.points < 0 ? L.eased : "●"}</span>
              <div className="min-w-0">
                <div className="font-medium">{r.label}</div>
                {r.evidence && <div className="break-words text-xs text-zinc-500">“{r.evidence}”</div>}
              </div>
            </div>
          );
          if (i < EXPANDED_BY_DEFAULT) {
            return (
              <li key={r.id ?? `${r.code}-${i}`} className="px-3 py-3">
                {head}
                <div className="ml-[3.25rem]"><Explain r={r} /></div>
              </li>
            );
          }
          return (
            <li key={r.id ?? `${r.code}-${i}`} className="px-3 py-2">
              <details>
                <summary className="cursor-pointer list-none [&::-webkit-details-marker]:hidden">
                  {head}
                  <span className="ml-[3.25rem] text-xs text-zinc-400">{L.more}</span>
                </summary>
                <div className="ml-[3.25rem]"><Explain r={r} /></div>
              </details>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
