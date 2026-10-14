import { statusText } from "@/lib/labels";
import { STRINGS, type Lang } from "@/lib/strings";

const COLOR: Record<string, string> = {
  CONFIRMED: "bg-red-700 text-white ring-2 ring-red-900",
  CLEARED: "bg-emerald-700 text-white",
  HIGH: "bg-red-600 text-white",
  REVIEW: "bg-amber-400 text-zinc-900",
  LOW: "bg-emerald-600 text-white",
};

/**
 * 지표만 보여 준다: 상태 문구(강한 신호/신호 감지/신호 미약) + 점수 + (있으면) 신호 개수.
 * label 은 기계 라벨(HIGH/REVIEW/LOW) 또는 사람 판단이 반영된 상태(CONFIRMED/CLEARED).
 * muted 는 사람이 "해당 없음" 으로 닫은 경우처럼 점수를 더 이상 전면에 내세우면 안 될 때 쓴다.
 */
export function ScoreBadge({ score, label, size = "md", muted = false, signals, lang = "ko" }: { score: number; label: string; size?: "md" | "lg"; muted?: boolean; signals?: number; lang?: Lang }) {
  const s3 = STRINGS[lang].status3;
  const text = label in s3 && label !== "signals" ? s3[label as "HIGH" | "REVIEW" | "LOW" | "UNKNOWN"] : statusText(label);   // 사람 판단 상태(관리자 화면)는 기존 문구
  const color = muted ? "bg-zinc-200 text-zinc-500" : (COLOR[label] ?? "bg-zinc-300 text-zinc-800");
  const cls = size === "lg" ? "px-4 py-2 text-lg" : "px-2 py-0.5 text-xs";
  return (
    <span className={`inline-flex items-center gap-2 rounded-full font-semibold ${color} ${cls}`}>
      {text} <span className="opacity-80 font-mono">{score}</span>
      {typeof signals === "number" && <span className="opacity-80 text-[0.8em] font-normal">{s3.signals(signals)}</span>}
    </span>
  );
}
