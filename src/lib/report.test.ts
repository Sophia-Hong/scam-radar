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

describe("publicView 연락처·다른 계정 (율 1791947465)", () => {
  const r = {
    status: "HIGH", effectiveStatus: "HIGH", humanReview: null, reportId: "SR-x",
    account: { platform: "threads", handle: "sample_me", url: "https://www.threads.net/@sample_me", bio: "문의 t.me/vip_stock_room77", externalUrl: "https://t.me/vip_stock_room77" },
    rationale: [{ code: "shared-contact", label: "다른 계정 1개와 동일 연락처 사용", points: 8, evidence: "telegram:vip_stock_room77 → threads:sample_finance_talk", what: "w", why: "y", example: "e", benign: "b" }],
    contacts: [{ id: "telegram:vip_stock_room77", type: "telegram", typeLabel: "텔레그램", value: "vip_stock_room77", source: "text", strong: true }],
    linkedAccounts: [{ accountId: "threads:sample_finance_talk", handle: "sample_finance_talk", score: 90, label: "HIGH", via: "telegram:vip_stock_room77" }],
    evidence: [{ text: "텔레그램 vip_stock_room77 로 오세요 @sample_finance_talk" }],
    summary: { text: "4) 유도 수단: 텔레그램 vip_stock_room77 / 동일 연락처를 쓰는 다른 계정 1개: threads:sample_finance_talk", generatedBy: "template" },
  } as unknown as InvestigationReport;
  it("연락처 원값·다른 계정 핸들 0, 연결은 수만", () => {
    const s = JSON.stringify(publicView(r, false));
    expect(s).not.toMatch(/vip_stock_room77|sample_finance_talk/);
    expect(s).toContain("vi***77");
    const p = publicView(r, false);
    expect(p.linkedAccounts).toEqual([]);
    expect(p.linkedCount).toBe(1);
    expect(p.account.handle).toBe("sample_me");
  });
});

describe("공개 리포트까지 — 추출되지 않은 괄호·+82 번호도 원번호 0 (카이 c99c371)", () => {
  it("contacts 가 비어 있어도 증거 글·요약·근거에서 덮임", () => {
    const r = {
      status: "HIGH", effectiveStatus: "HIGH", humanReview: null, reportId: "SR-x", linkedAccounts: [],
      account: { platform: "threads", handle: "sample_me", url: "u", bio: "상담 (010)1234-5678", externalUrl: null },
      rationale: [{ code: "pattern:휴대폰 번호", label: "휴대폰 번호", points: 5, evidence: "+82 (10) 1234 5678", what: "w", why: "y", example: "e", benign: "b" }],
      contacts: [],
      evidence: [{ text: "연락 (010) 1234-5678 또는 +82 (10) 1234 5678", parentUrl: null }],
      summary: { text: "유도 수단: (010)1234-5678", generatedBy: "template" },
    } as unknown as InvestigationReport;
    expect(JSON.stringify(publicView(r, false))).not.toMatch(/1234[\s.-]?5678/);
  });
});
