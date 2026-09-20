import { statusText } from "@/lib/labels";

const COLOR: Record<string, string> = {
  CONFIRMED: "bg-red-700 text-white ring-2 ring-red-900",
  CLEARED: "bg-emerald-700 text-white",
  HIGH: "bg-red-600 text-white",
  REVIEW: "bg-amber-400 text-zinc-900",
  LOW: "bg-emerald-600 text-white",
};

/**
 * label 은 기계 라벨(HIGH/REVIEW/LOW) 또는 사람 판단이 반영된 상태(CONFIRMED/CLEARED).
 * muted 는 오탐 확정처럼 점수 자체를 더 이상 전면에 내세우면 안 될 때 쓴다.
 */
export function ScoreBadge({ score, label, size = "md", muted = false }: { score: number; label: string; size?: "md" | "lg"; muted?: boolean }) {
  const color = muted ? "bg-zinc-200 text-zinc-500" : (COLOR[label] ?? "bg-zinc-300 text-zinc-800");
  const cls = size === "lg" ? "px-4 py-2 text-lg" : "px-2 py-0.5 text-xs";
  return (
    <span className={`inline-flex items-center gap-2 rounded-full font-semibold ${color} ${cls}`}>
      {statusText(label)} <span className="opacity-80 font-mono">{score}</span>
    </span>
  );
}
