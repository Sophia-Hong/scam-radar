/**
 * 표시 라벨은 한 곳에서만 정한다.
 * 제품의 약속은 "최종 판단은 사람이 한다" 이므로, 사람이 내린 판단이 있으면 기계 라벨을 덮는다.
 * 계정 API · 조회 화면 · 리포트 · 집계가 모두 이 함수를 쓴다.
 */
export type HumanLabel = "SCAM" | "NOT_SCAM";
export type MachineLabel = "HIGH" | "REVIEW" | "LOW" | "UNKNOWN";
export type EffectiveStatus = "CONFIRMED" | "CLEARED" | MachineLabel;

/** 사람 판단이 있으면 그것이 최종. 없으면 기계 라벨 그대로 */
export function effectiveStatus(machineLabel: string | null | undefined, humanLabel: string | null | undefined): EffectiveStatus {
  if (humanLabel === "SCAM") return "CONFIRMED";
  if (humanLabel === "NOT_SCAM") return "CLEARED";
  return ((machineLabel ?? "UNKNOWN") as EffectiveStatus);
}

export const STATUS_TEXT: Record<string, string> = {
  CONFIRMED: "검토 완료 · 사기 확인",
  CLEARED: "검토 완료 · 오탐",
  HIGH: "사기 가능성 높음",
  REVIEW: "검토 필요",
  LOW: "낮음",
  UNKNOWN: "기록 없음",
};

export const statusText = (s: string) => STATUS_TEXT[s] ?? STATUS_TEXT.UNKNOWN;

/** 사람이 검토를 마친 상태인가 (점수 배지를 흐리게 할지 판단에 쓴다) */
export const isHumanReviewed = (s: string) => s === "CONFIRMED" || s === "CLEARED";
