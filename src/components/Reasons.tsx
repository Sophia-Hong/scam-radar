import type { Reason } from "@/engine";
export function Reasons({ reasons }: { reasons: Reason[] }) {
  if (!reasons?.length) return <p className="text-sm text-zinc-500">감지된 신호 없음</p>;
  return (
    <ul className="divide-y divide-zinc-100 rounded-lg border border-zinc-200 bg-white text-sm">
      {reasons.map((r, i) => (
        <li key={r.code + i} className="flex items-start gap-3 px-3 py-2">
          <span className={`w-10 shrink-0 text-right font-mono ${r.points < 0 ? "text-emerald-600" : "text-red-600"}`}>{r.points > 0 ? "+" : ""}{r.points}</span>
          <div className="min-w-0">
            <div className="font-medium">{r.label}</div>
            {r.evidence && <div className="truncate text-xs text-zinc-500">“{r.evidence}”</div>}
          </div>
        </li>
      ))}
    </ul>
  );
}
