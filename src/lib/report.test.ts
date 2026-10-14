import { describe, expect, it } from "vitest";
import { publicView, type InvestigationReport } from "./report";

// 공개 리포트에는 사람 검토 결과·검토자·연락처 강도·내부 코드가 없다 (소현 10-14, 카이 ④ 검수 3)
describe("publicView", () => {
  const r = {
    status: "HIGH", effectiveStatus: "CONFIRMED",
    humanReview: { label: "SCAM", note: "메모", reviewedAt: "2026-10-01T00:00:00Z", reviewedBy: "admin" },
    rationale: [{ code: "gate:no-contact", label: "x", points: 12, what: "w", why: "y", example: "e", benign: "b" }],
    contacts: [{ id: "telegram:a", type: "telegram", typeLabel: "텔레그램", value: "a", source: "text", strong: true }],
    linkedAccounts: [], summary: { text: "s", generatedBy: "template" },
  } as unknown as InvestigationReport;
  it("공개", () => {
    const p = publicView(r, false);
    expect(p.humanReview).toBeNull();
    expect(p.effectiveStatus).toBe("HIGH");
    expect(JSON.stringify(p)).not.toMatch(/reviewedBy|gate:|"strong"|CONFIRMED/);
    expect(p.rationale[0].points).toBe(1);
  });
  it("관리자는 그대로", () => expect(publicView(r, true)).toBe(r));
});
