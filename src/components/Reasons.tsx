import type { Reason } from "@/engine";
import { explainReason } from "@/engine/explain";

/** 처음 몇 개는 펼쳐서, 나머지는 접어서 보여 준다 */
const EXPANDED_BY_DEFAULT = 3;

function Explain({ code, label, evidence }: { code: string; label: string; evidence?: string }) {
  const x = explainReason(code, label, evidence);
  return (
    <dl className="mt-2 space-y-2 text-[13px] leading-relaxed text-zinc-700">
      <div><dt className="font-semibold text-zinc-900">무엇이 감지됐나</dt><dd>{x.what}</dd></div>
      <div><dt className="font-semibold text-zinc-900">왜 신호가 되나</dt><dd>{x.why}</dd></div>
      <div><dt className="font-semibold text-zinc-900">실제로는 이렇게 쓰인다</dt><dd className="text-zinc-600">{x.example}</dd></div>
      <div><dt className="font-semibold text-zinc-900">신호가 아닐 때</dt><dd className="text-zinc-600">{x.benign}</dd></div>
    </dl>
  );
}

export function Reasons({ reasons }: { reasons: Reason[] }) {
  if (!reasons?.length) return <p className="text-sm text-zinc-500">감지된 신호 없음</p>;
  const positive = reasons.filter((r) => r.points > 0).length;
  return (
    <div className="space-y-2">
      <p className="text-xs text-zinc-500">신호 {positive}개 · 항목별로 무엇이 감지됐고 왜 계산에 들어갔는지 풀어서 적었습니다. 판단은 읽는 분이 합니다.</p>
      <ul className="divide-y divide-zinc-100 rounded-lg border border-zinc-200 bg-white text-sm">
        {reasons.map((r, i) => {
          const head = (
            <div className="flex items-start gap-3">
              <span className={`w-10 shrink-0 text-right font-mono ${r.points < 0 ? "text-emerald-600" : "text-red-600"}`}>{r.points > 0 ? "+" : ""}{r.points}</span>
              <div className="min-w-0">
                <div className="font-medium">{r.label}</div>
                {r.evidence && <div className="break-words text-xs text-zinc-500">“{r.evidence}”</div>}
              </div>
            </div>
          );
          if (i < EXPANDED_BY_DEFAULT) {
            return (
              <li key={r.code + i} className="px-3 py-3">
                {head}
                <div className="ml-[3.25rem]"><Explain code={r.code} label={r.label} evidence={r.evidence} /></div>
              </li>
            );
          }
          return (
            <li key={r.code + i} className="px-3 py-2">
              <details>
                <summary className="cursor-pointer list-none [&::-webkit-details-marker]:hidden">
                  {head}
                  <span className="ml-[3.25rem] text-xs text-zinc-400">자세히 보기</span>
                </summary>
                <div className="ml-[3.25rem]"><Explain code={r.code} label={r.label} evidence={r.evidence} /></div>
              </details>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
