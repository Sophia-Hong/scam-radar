/**
 * 사람의 최종 판단 배너. "최종 판단은 사람이 한다" 는 약속이 화면에서 보이는 자리.
 * 오탐 확정(CLEARED)은 초록, 사기 확정(CONFIRMED)은 붉은 테두리.
 */
export type HumanReview = { label: "SCAM" | "NOT_SCAM"; note: string | null; reviewedAt: string; reviewedBy: string | null } | null;

const fmtDate = (s: string) => s.slice(0, 16).replace("T", " ") + " UTC";

export function HumanVerdict({ review }: { review: HumanReview }) {
  if (!review) return null;
  const cleared = review.label === "NOT_SCAM";
  return (
    <div className={`rounded-lg border p-4 ${cleared ? "border-emerald-300 bg-emerald-50" : "border-red-500 border-2 bg-white"}`}>
      <div className={`flex flex-wrap items-center gap-2 font-semibold ${cleared ? "text-emerald-900" : "text-red-800"}`}>
        {cleared ? "검토 완료 · 오탐으로 확인됨" : "검토 완료 · 사기 계정으로 확인됨"}
        <span className="text-xs font-normal text-zinc-600">
          {fmtDate(review.reviewedAt)} · 검토자 {review.reviewedBy ?? "admin"}
        </span>
      </div>
      <p className={`mt-1 text-sm ${cleared ? "text-emerald-900" : "text-zinc-800"}`}>
        {cleared
          ? "사람이 직접 검토한 결과 리딩방 유인 계정이 아닙니다. 아래 자동 판정 점수는 참고용 기록으로만 남겨 둡니다."
          : "사람이 직접 검토해 리딩방 유인 계정으로 확인했습니다."}
      </p>
      {review.note && <p className="mt-2 whitespace-pre-wrap rounded bg-white/70 p-2 text-sm text-zinc-700">검토 메모: {review.note}</p>}
    </div>
  );
}
